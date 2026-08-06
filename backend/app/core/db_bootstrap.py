"""Create the local SQLite schema and the first administrator account."""
from __future__ import annotations

import logging
import secrets
import sys

import bcrypt
from sqlalchemy import select

from app.core import database
from app.core.config import settings
from app.models import models

_logger = logging.getLogger(__name__)


def _create_admin_if_missing() -> None:
    db = database.SessionLocal()
    try:
        existing = db.execute(
            select(models.User).where(models.User.email == settings.ADMIN_EMAIL).limit(1)
        ).scalar_one_or_none()
        if existing:
            return

        admin_password = settings.ADMIN_INITIAL_PASSWORD
        if not admin_password or len(admin_password) < 8:
            admin_password = secrets.token_urlsafe(16)
            credentials_dir = settings.resolved_log_dir()
            credentials_dir.mkdir(parents=True, exist_ok=True)
            credentials_file = credentials_dir / "FIRST_LOGIN_ADMIN_PASSWORD.txt"
            credentials_file.write_text(
                f"email={settings.ADMIN_EMAIL}\n"
                f"password={admin_password}\n\n"
                "احذف هذا الملف بعد حفظ بيانات الدخول.\n",
                encoding="utf-8",
            )
            _logger.warning("Local administrator credentials written to %s", credentials_file)
            print(
                "تم إنشاء حساب المدير المحلي. بيانات الدخول موجودة في "
                "backend/logs/FIRST_LOGIN_ADMIN_PASSWORD.txt",
                file=sys.stderr,
            )

        password_hash = bcrypt.hashpw(
            admin_password.encode("utf-8")[:72], bcrypt.gensalt()
        ).decode("utf-8")
        db.add(
            models.User(
                name="مدير النظام",
                email=settings.ADMIN_EMAIL,
                role="admin",
                password=password_hash,
                status="active",
                requires_password_change=True,
            )
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def bootstrap_if_needed(database_url: str | None = None) -> None:
    url = (database_url or settings.DATABASE_URL).strip()
    if not url.startswith("sqlite:///"):
        raise RuntimeError("Local bootstrap requires SQLite")

    database.prepare_metadata_for_sqlite()
    database.Base.metadata.create_all(bind=database.engine, checkfirst=True)
    _create_admin_if_missing()
