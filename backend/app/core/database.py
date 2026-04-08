"""
اتصال قاعدة البيانات - PostgreSQL فقط.
النظام موحّد: FastAPI + PostgreSQL + React

إن وُجد متغير البيئة DATABASE_URL يُستخدم مباشرة دون تحميل pydantic — مفيد لـ
``alembic upgrade head`` ببيئة Python خفيفة (SQLAlchemy + psycopg2 فقط).
"""
from __future__ import annotations

import os

from sqlalchemy import create_engine
from sqlalchemy.engine.url import make_url
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

Base = declarative_base()


def _resolve_database_url() -> str:
    raw = (os.environ.get("DATABASE_URL") or "").strip()
    if raw:
        return raw
    from .config import settings

    return settings.DATABASE_URL


_url = _resolve_database_url()
if not _url.startswith("postgresql"):
    raise ValueError(
        "النظام يدعم PostgreSQL فقط. "
        "تأكد من ضبط DATABASE_URL في backend/.env أو في البيئة بصيغة: "
        "postgresql://user:pass@host:port/dbname"
    )

# Supabase / اتصال بعيد: pool + TCP keepalive + (SSL عند عدم استخدام localhost)
_url_lower = _url.lower()
try:
    _pg_host = (make_url(_url).host or "").lower()
except Exception:
    _pg_host = ""

_connect_args: dict = {
    "connect_timeout": 10,
    "keepalives": 1,
    "keepalives_idle": 30,
    "keepalives_interval": 10,
    "keepalives_count": 5,
}
if "sslmode" not in _url_lower:
    if _pg_host not in ("localhost", "127.0.0.1", "::1", ""):
        _connect_args["sslmode"] = "require"

engine = create_engine(
    _url,
    connect_args=_connect_args,
    pool_pre_ping=True,
    pool_recycle=300,
)


def mask_database_url(url: str | None = None) -> str:
    """يعرض رابط الاتصال مع إخفاء كلمة المرور (للسجلات فقط)."""
    from sqlalchemy.engine.url import make_url

    raw = (url or "").strip() or _resolve_database_url()
    return make_url(raw).render_as_string(hide_password=True)


def ftth_sync_connection_log_info() -> dict[str, str]:
    """
    معلومات آمنة للسجلات عند مزامنة FTTH: اسم القاعدة، الرابط المموّه، الجدول المستهدف.
    """
    from sqlalchemy.engine.url import make_url

    u = make_url(_resolve_database_url())
    db_name = u.database or ""
    return {
        "db_name": db_name,
        "masked_connection_url": u.render_as_string(hide_password=True),
        "schema_table_target": "public.ftth_external_data",
    }


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
