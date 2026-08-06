"""Local SQLite backup and restore service."""
from __future__ import annotations

import re
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import settings

_BACKUP_NAME_RE = re.compile(r"^king_office_backup_\d{4}-\d{2}-\d{2}_\d{6}\.sqlite3$")
_LOCAL_BACKUP_DIR = Path(__file__).resolve().parents[2] / "backups"


@dataclass
class BackupInfo:
    filename: str
    size_bytes: int
    modified_at: str


def _database_path() -> Path:
    return settings.resolved_database_path()


def _default_backup_dir() -> Path:
    path = Path(settings.BACKUP_DIR).expanduser() if settings.BACKUP_DIR else _LOCAL_BACKUP_DIR
    if not path.is_absolute():
        path = Path(__file__).resolve().parents[2] / path
    path.mkdir(parents=True, exist_ok=True)
    return path.resolve()


def resolve_backup_dir(_db: Session) -> Path:
    return _default_backup_dir()


def new_backup_filename() -> str:
    now = datetime.now(timezone.utc).astimezone()
    return f"king_office_backup_{now.strftime('%Y-%m-%d_%H%M%S')}.sqlite3"


def validate_backup_filename(name: str) -> str:
    base = Path(name).name
    if not _BACKUP_NAME_RE.fullmatch(base):
        raise ValueError("اسم ملف النسخة الاحتياطية غير صالح")
    return base


def list_backups(db: Session) -> list[BackupInfo]:
    items: list[BackupInfo] = []
    for path in resolve_backup_dir(db).glob("king_office_backup_*.sqlite3"):
        if not path.is_file() or not _BACKUP_NAME_RE.fullmatch(path.name):
            continue
        stat = path.stat()
        items.append(
            BackupInfo(
                filename=path.name,
                size_bytes=stat.st_size,
                modified_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            )
        )
    items.sort(key=lambda item: item.modified_at, reverse=True)
    return items


def create_backup_sql(db: Session) -> tuple[Path, BackupInfo]:
    """Keep the legacy function name while producing a SQLite backup file."""
    db.commit()
    source = _database_path()
    if not source.is_file():
        raise FileNotFoundError(f"قاعدة البيانات المحلية غير موجودة: {source}")

    destination = resolve_backup_dir(db) / new_backup_filename()
    shutil.copy2(source, destination)
    stat = destination.stat()
    return destination, BackupInfo(
        filename=destination.name,
        size_bytes=stat.st_size,
        modified_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
    )


def restore_from_sql_file(backup_path: Path) -> None:
    """Keep the legacy function name while restoring a SQLite backup file."""
    if not backup_path.is_file():
        raise FileNotFoundError("ملف النسخة الاحتياطية غير موجود")
    target = _database_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(".restore.tmp")
    shutil.copy2(backup_path, temporary)
    temporary.replace(target)


def delete_backup(filename: str, db: Session) -> None:
    safe_name = validate_backup_filename(filename)
    path = resolve_backup_dir(db) / safe_name
    if not path.is_file():
        raise FileNotFoundError("الملف غير موجود")
    path.unlink()
