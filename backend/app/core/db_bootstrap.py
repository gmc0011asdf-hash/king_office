import logging
import secrets
import sys
from pathlib import Path
from urllib.parse import urlparse

import bcrypt
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

from app.core.config import settings

_logger = logging.getLogger(__name__)


def _read_schema_sql() -> str:
    # backend/app/core/db_bootstrap.py -> backend/db/schema_idempotent.sql
    root = Path(__file__).resolve().parents[2]
    schema_path = root / "db" / "schema_idempotent.sql"
    return schema_path.read_text(encoding="utf-8")


def _split_sql_statements(sql: str) -> list[str]:
    """
    Very small SQL splitter for our schema file:
    - statements are separated by ';'
    - schema file does not use dollar-quoted functions
    """
    out: list[str] = []
    buf: list[str] = []
    for line in sql.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("--"):
            continue
        buf.append(line)
        if stripped.endswith(";"):
            stmt = "\n".join(buf).strip()
            if stmt:
                out.append(stmt)
            buf = []
    tail = "\n".join(buf).strip()
    if tail:
        out.append(tail)
    return out


def ensure_postgres_database_exists(database_url: str) -> None:
    if not database_url.startswith("postgresql"):
        return

    parsed = urlparse(database_url)
    db_name = (parsed.path or "").lstrip("/")
    if not db_name:
        return

    conn = psycopg2.connect(
        dbname="postgres",
        user=parsed.username,
        password=parsed.password,
        host=parsed.hostname,
        port=parsed.port or 5432,
        connect_timeout=10,
    )
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM pg_catalog.pg_database WHERE datname = %s", (db_name,))
    exists = cur.fetchone()
    if not exists:
        cur.execute(f'CREATE DATABASE "{db_name}"')
    cur.close()
    conn.close()


def ensure_schema_and_admin(database_url: str) -> None:
    """
    - Creates DB if missing
    - Applies idempotent schema (create missing tables/columns)
    - Seeds admin user if missing
    """
    if not database_url.startswith("postgresql"):
        return

    ensure_postgres_database_exists(database_url)

    schema_sql = _read_schema_sql()
    statements = _split_sql_statements(schema_sql)

    conn = psycopg2.connect(database_url, connect_timeout=10)
    conn.set_session(autocommit=True)
    cur = conn.cursor()

    for stmt in statements:
        cur.execute(stmt)

    # Optional cleanup: remove all users when BOOTSTRAP_WIPE_USERS=true (fresh deploy only)
    if getattr(settings, "BOOTSTRAP_WIPE_USERS", False):
        cur.execute("DELETE FROM users")

    admin_email = settings.ADMIN_EMAIL
    admin_name = "مدير النظام"
    admin_role = "admin"
    admin_status = "active"

    cur.execute("SELECT id FROM users WHERE email = %s LIMIT 1", (admin_email,))
    row = cur.fetchone()
    if not row:
        admin_password = settings.ADMIN_INITIAL_PASSWORD
        if not admin_password or len(admin_password) < 8:
            admin_password = secrets.token_urlsafe(16)
            creds_dir = settings.resolved_log_dir()
            creds_dir.mkdir(parents=True, exist_ok=True)
            creds_file = creds_dir / "FIRST_LOGIN_ADMIN_PASSWORD.txt"
            creds_file.write_text(
                f"email={admin_email}\n"
                f"password={admin_password}\n\n"
                "Delete this file after you save the password elsewhere.\n",
                encoding="utf-8",
            )
            _logger.warning(
                "First admin created: password auto-generated (not printed). "
                "Read once from %s then delete that file.",
                creds_file,
            )
            print(
                "SECURITY: First admin password written to logs/FIRST_LOGIN_ADMIN_PASSWORD.txt "
                "(open once, then delete the file).",
                file=sys.stderr,
            )
        elif admin_password in ("admin123", "password", "12345678", "admin"):
            _logger.warning(
                "Weak ADMIN_INITIAL_PASSWORD in .env — admin must change password on first login."
            )
            print(
                "SECURITY WARNING: weak ADMIN_INITIAL_PASSWORD — change it after first login.",
                file=sys.stderr,
            )
        pwd_bytes = admin_password.encode("utf-8")[:72]
        hashed = bcrypt.hashpw(pwd_bytes, bcrypt.gensalt()).decode("utf-8")
        # Stable production: always force password change on bootstrap-created admin
        cur.execute(
            """
            INSERT INTO users (name, email, role, password, status, created_at, requires_password_change)
            VALUES (%s, %s, %s, %s, %s, now(), true)
            """,
            (admin_name, admin_email, admin_role, hashed, admin_status),
        )

    cur.close()
    conn.close()


def bootstrap_if_needed(database_url: str) -> None:
    """
    Runs bootstrap only for PostgreSQL. Safe to call repeatedly.
    """
    try:
        ensure_schema_and_admin(database_url)
    except Exception as exc:
        # Fail fast: if DB can't be bootstrapped, API behavior is unpredictable.
        raise RuntimeError(f"Database bootstrap failed: {exc}") from exc

