"""
نسخ احتياطي واسترجاع PostgreSQL عبر pg_dump / psql.

ملفات .sql ذات البادئة postgresql_king_office_backup_* هي مخرجات pg_dump بتنسيق Plain SQL
(FORMAT p) — أي أنها نسخة PostgreSQL كاملة يمكن استرجاعها بـ psql.

يتطلب تثبيت أدوات عميل PostgreSQL وإضافتها إلى PATH أو ضبط PG_TOOLS_BIN في .env
"""
from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse

from sqlalchemy.orm import Session

from app.core.config import settings

_logger = logging.getLogger(__name__)

# يقبل الأسماء القديمة king_office_backup_* والجديدة postgresql_king_office_backup_*
_BACKUP_NAME_RE = re.compile(
    r"^(postgresql_king_office_backup_|king_office_backup_)\d{4}-\d{2}-\d{2}_\d{6}\.sql$"
)


def _parse_database_url(url: str) -> tuple[str, int, str, str, str]:
    """يُرجع: host, port, user, password, database"""
    normalized = url.replace("postgresql+psycopg2://", "postgresql://").replace(
        "postgres://", "postgresql://"
    )
    u = urlparse(normalized)
    if u.scheme not in ("postgresql", "postgres"):
        raise ValueError("DATABASE_URL يجب أن يكون PostgreSQL")
    host = u.hostname or "localhost"
    port = u.port or 5432
    user = unquote(u.username or "postgres")
    password = unquote(u.password or "")
    path = (u.path or "").lstrip("/")
    database = path.split("?")[0] if path else "postgres"
    if not database:
        raise ValueError("اسم قاعدة البيانات غير موجود في DATABASE_URL")
    return host, port, user, password, database


def _resolve_bin(tool: str) -> str:
    """مسار pg_dump أو psql."""
    bin_dir = (getattr(settings, "PG_TOOLS_BIN", None) or "").strip()
    if bin_dir:
        p = Path(bin_dir) / (tool + (".exe" if os.name == "nt" else ""))
        if p.is_file():
            return str(p)
    found = shutil.which(tool)
    if found:
        return found
    exe = tool + ".exe"
    found = shutil.which(exe)
    if found:
        return found
    raise FileNotFoundError(
        f"لم يُعثر على {tool}. ثبّت PostgreSQL client tools أو أضف مجلد bin إلى PATH "
        "أو عيّن PG_TOOLS_BIN في .env (مثال: C:\\Program Files\\PostgreSQL\\16\\bin)"
    )


def _run_pg_cli(cmd: list[str], env: dict[str, str], *, timeout: int, error_tail: int = 12000) -> None:
    """
    تشغيل pg_dump/psql دون capture_output: تجنّب امتلاء أنابيب stderr/stdout
    (يحدث مع psql عند آلاف سطور NOTICE فيُعلّق العملية ويبدو أن الخادم «لا يرد»).
    """
    fd, log_path = tempfile.mkstemp(prefix="king_pg_cli_", suffix=".log")
    os.close(fd)
    t0 = time.perf_counter()
    try:
        with open(log_path, "wb") as logf:
            r = subprocess.run(
                cmd,
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=logf,
                stderr=subprocess.STDOUT,
                timeout=timeout,
            )
        elapsed = time.perf_counter() - t0
        if r.returncode != 0:
            raw = Path(log_path).read_bytes()
            if len(raw) > error_tail:
                raw = raw[-error_tail:]
            err = raw.decode("utf-8", errors="replace").strip() or f"exit {r.returncode}"
            _logger.error("pg cli failed after %.1fs: %s", elapsed, cmd[0])
            raise RuntimeError(err)
        _logger.info("pg cli OK in %.1fs (%s)", elapsed, os.path.basename(cmd[0] or ""))
    finally:
        try:
            os.unlink(log_path)
        except OSError:
            pass


# backend/backups — relative to this file's grandparent (the backend/ folder)
_LOCAL_BACKUP_DIR = Path(__file__).resolve().parents[2] / "backups"


def _default_backup_dir() -> Path:
    """
    يُنشئ مجلد النسخ الاحتياطي تلقائياً إذا لم يكن موجوداً.
    المسار: backend/backups (داخل نطاق المشروع).
    يُرجع خطأً واضحاً عند مشاكل الصلاحيات بدلاً من 500.
    """
    d = _LOCAL_BACKUP_DIR
    try:
        d.mkdir(parents=True, exist_ok=True)
    except PermissionError as e:
        msg = (
            f"لا توجد صلاحية لإنشاء مجلد النسخ الاحتياطي: {d}\n"
            "تحقق من صلاحيات المجلد أو شغّل الخادم بحساب مناسب."
        )
        _logger.error("Backup dir permission denied: %s — %s", d, e)
        raise RuntimeError(msg) from e
    except OSError as e:
        msg = f"تعذر إنشاء مجلد النسخ الاحتياطي ({d}): {e}"
        _logger.exception("Cannot create backup dir %s", d)
        raise RuntimeError(msg) from e
    return d


def resolve_backup_dir(_db: Session) -> Path:
    """النسخ الاحتياطي يُحفظ في backend/backups داخل نطاق المشروع."""
    return _default_backup_dir()


def new_backup_filename() -> str:
    now = datetime.now(timezone.utc).astimezone()
    return f"postgresql_king_office_backup_{now.strftime('%Y-%m-%d_%H%M%S')}.sql"


def validate_backup_filename(name: str) -> str:
    base = Path(name).name
    if not _BACKUP_NAME_RE.match(base):
        raise ValueError("اسم ملف النسخة الاحتياطية غير صالح")
    return base


@dataclass
class BackupInfo:
    filename: str
    size_bytes: int
    modified_at: str  # ISO


def list_backups(db: Session) -> list[BackupInfo]:
    root = resolve_backup_dir(db)
    items: list[BackupInfo] = []
    try:
        entries = list(root.iterdir())
    except OSError as e:
        _logger.error("list_backups: cannot read directory %s: %s", root, e)
        return []
    for p in entries:
        if not p.is_file():
            continue
        if not _BACKUP_NAME_RE.match(p.name):
            continue
        try:
            st = p.stat()
        except OSError:
            continue
        items.append(
            BackupInfo(
                filename=p.name,
                size_bytes=st.st_size,
                modified_at=datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
            )
        )
    items.sort(key=lambda x: x.modified_at, reverse=True)
    return items


def create_backup_sql(db: Session) -> tuple[Path, BackupInfo]:
    host, port, user, password, database = _parse_database_url(settings.DATABASE_URL)
    pg_dump = _resolve_bin("pg_dump")
    root = resolve_backup_dir(db)
    fname = new_backup_filename()
    out_path = root / fname

    env = os.environ.copy()
    if password:
        env["PGPASSWORD"] = password

    cmd = [
        pg_dump,
        "-h",
        host,
        "-p",
        str(port),
        "-U",
        user,
        "-d",
        database,
        "--clean",
        "--if-exists",
        "--no-owner",
        "--no-acl",
        "-F",
        "p",
        "-f",
        str(out_path),
    ]
    try:
        _logger.info("Starting pg_dump -> %s", fname)
        _run_pg_cli(cmd, env, timeout=3600)
    except RuntimeError as e:
        if out_path.exists():
            try:
                out_path.unlink()
            except OSError:
                pass
        raise RuntimeError(str(e)[:4000]) from e

    st = out_path.stat()
    info = BackupInfo(
        filename=fname,
        size_bytes=st.st_size,
        modified_at=datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
    )
    return out_path, info


def restore_from_sql_file(sql_path: Path) -> None:
    host, port, user, password, database = _parse_database_url(settings.DATABASE_URL)
    psql = _resolve_bin("psql")
    env = os.environ.copy()
    if password:
        env["PGPASSWORD"] = password

    try:
        size_mb = sql_path.stat().st_size / (1024 * 1024)
    except OSError:
        size_mb = 0.0
    _logger.info(
        "Starting PostgreSQL restore file=%s size=%.2f MiB db=%s",
        sql_path.name,
        size_mb,
        database,
    )
    t0 = time.perf_counter()
    cmd = [
        psql,
        "-h",
        host,
        "-p",
        str(port),
        "-U",
        user,
        "-d",
        database,
        "-v",
        "ON_ERROR_STOP=1",
        "-q",
        "-f",
        str(sql_path),
    ]
    try:
        _run_pg_cli(cmd, env, timeout=7200, error_tail=16000)
    except RuntimeError as e:
        raise RuntimeError(str(e)[:8000]) from e
    _logger.info("PostgreSQL restore completed in %.1f s", time.perf_counter() - t0)


def delete_backup(filename: str, db: Session) -> None:
    safe = validate_backup_filename(filename)
    p = resolve_backup_dir(db) / safe
    if not p.is_file():
        raise FileNotFoundError("الملف غير موجود")
    p.unlink()
