"""تشفير بيانات اعتماد FTTH المخزّنة في DB (Fernet + مفتاح مشتق من SECRET_KEY)."""
from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet

from app.core.config import settings


def _fernet() -> Fernet:
    digest = hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_str(plain: str) -> bytes:
    return _fernet().encrypt((plain or "").encode("utf-8"))


def decrypt_str(blob: bytes) -> str:
    if not blob:
        return ""
    return _fernet().decrypt(blob).decode("utf-8")
