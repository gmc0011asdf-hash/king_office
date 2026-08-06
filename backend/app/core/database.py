"""Local SQLite database connection for King Office."""
from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import BigInteger, create_engine, event, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.engine.url import make_url
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import declarative_base, sessionmaker

Base = declarative_base()


@compiles(JSONB, "sqlite")
def _compile_jsonb_for_sqlite(_type, _compiler, **_kwargs):
    return "JSON"


@compiles(BigInteger, "sqlite")
def _compile_bigint_for_sqlite(_type, _compiler, **_kwargs):
    # SQLite autoincrement works only with an INTEGER PRIMARY KEY.
    return "INTEGER"


def _resolve_database_url() -> str:
    raw = (os.environ.get("DATABASE_URL") or "").strip()
    if raw:
        return raw
    from .config import settings

    return settings.DATABASE_URL


_url = _resolve_database_url()
if not _url.startswith("sqlite:///"):
    raise ValueError(
        "وضع King Office المحلي يدعم SQLite فقط. "
        "استخدم DATABASE_URL بصيغة sqlite:///path/to/king_office.sqlite3"
    )

_sqlite_path = Path(_url.removeprefix("sqlite:///"))
if not _sqlite_path.is_absolute():
    _sqlite_path = (Path(__file__).resolve().parents[2] / _sqlite_path).resolve()
_sqlite_path.parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    _url,
    connect_args={"check_same_thread": False, "timeout": 30},
    pool_pre_ping=True,
)


@event.listens_for(engine, "connect")
def _enable_sqlite_pragmas(dbapi_connection, _connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()


def prepare_metadata_for_sqlite() -> None:
    """Remove PostgreSQL-only JSONB casts before create_all on SQLite."""
    for table in Base.metadata.tables.values():
        for column in table.columns:
            if isinstance(column.type, JSONB) and column.server_default is not None:
                default_text = str(column.server_default.arg)
                if "::jsonb" in default_text:
                    column.server_default = text("'{}'")


def mask_database_url(url: str | None = None) -> str:
    raw = (url or "").strip() or _resolve_database_url()
    return make_url(raw).render_as_string(hide_password=True)


def ftth_sync_connection_log_info() -> dict[str, str]:
    return {
        "db_name": _sqlite_path.name,
        "masked_connection_url": mask_database_url(),
        "schema_table_target": "ftth_external_data",
    }


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
