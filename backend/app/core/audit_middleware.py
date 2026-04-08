"""تسجيل طلبات POST/PUT/PATCH/DELETE في audit_logs؛ بريد للمدير للمسارات الحساسة فقط."""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Callable

from jose import JWTError, jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings
from app.core.database import SessionLocal
from app.models import models

logger = logging.getLogger(__name__)

MAX_BODY = 6000
_SENSITIVE_KEYS = frozenset(
    {
        "password",
        "current_password",
        "new_password",
        "access_token",
        "refresh_token",
        "secret",
        "token",
    }
)


def _sanitize_json(obj: object) -> object:
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            lk = str(k).lower()
            if lk in _SENSITIVE_KEYS or "password" in lk:
                out[k] = "***"
            else:
                out[k] = _sanitize_json(v)
        return out
    if isinstance(obj, list):
        return [_sanitize_json(x) for x in obj[:50]]
    return obj


def _body_summary(raw: bytes) -> str | None:
    if not raw:
        return None
    try:
        text = raw.decode("utf-8")
        data = json.loads(text)
        data = _sanitize_json(data)
        s = json.dumps(data, ensure_ascii=False)
    except Exception:
        s = raw.decode("utf-8", errors="replace")
    if len(s) > MAX_BODY:
        s = s[: MAX_BODY - 3] + "..."
    return s


def _jwt_sub_email(request: Request) -> str | None:
    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip()
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        sub = payload.get("sub")
        return str(sub) if sub else None
    except JWTError:
        return None


def _client_ip(request: Request) -> str:
    xf = request.headers.get("x-forwarded-for")
    if xf:
        return xf.split(",")[0].strip()[:64]
    if request.client:
        return request.client.host[:64]
    return ""


def _should_skip_audit(path: str) -> bool:
    if path in ("/health", "/docs", "/redoc", "/openapi.json"):
        return True
    if path.startswith("/health"):
        return True
    if path.startswith("/docs") or path.startswith("/redoc"):
        return True
    if path.startswith("/api/auth/login"):
        return True
    return False


def _should_email_notify(method: str, path: str) -> bool:
    if method == "DELETE" and (
        "/api/subscribers/" in path
        or "/api/users/" in path
        or path.startswith("/api/wallet")
    ):
        return True
    if method in ("PUT", "PATCH") and "/api/users/" in path:
        return True
    if method == "POST" and "import" in path and "/api/subscribers" in path:
        return True
    return False


def _persist_audit_row(
    *,
    user_email: str | None,
    method: str,
    path: str,
    payload_summary: str | None,
    ip: str,
    status_code: int,
) -> None:
    db = SessionLocal()
    try:
        uid, uname = None, None
        if user_email:
            u = db.query(models.User).filter(models.User.email == user_email).first()
            if u:
                uid, uname = u.id, u.name
        row = models.AuditLog(
            user_id=uid,
            user_email=user_email,
            user_name=uname,
            http_method=method,
            path=path[:2048],
            payload_summary=payload_summary,
            ip_address=ip or None,
            status_code=status_code,
        )
        db.add(row)
        db.commit()
    except Exception as e:
        db.rollback()
        logger.warning("audit_logs insert failed: %s", e)
    finally:
        db.close()


class AuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        method = request.method.upper()
        path = request.url.path

        if method not in ("POST", "PUT", "PATCH", "DELETE"):
            return await call_next(request)
        if _should_skip_audit(path):
            return await call_next(request)

        body = await request.body()

        async def receive():
            return {"type": "http.request", "body": body, "more_body": False}

        request = Request(request.scope, receive)
        response = await call_next(request)

        if not path.startswith("/api/"):
            return response

        sub_email = _jwt_sub_email(request)
        payload_summary = _body_summary(body) if body else None
        ip = _client_ip(request)
        status_code = response.status_code

        await asyncio.to_thread(
            lambda: _persist_audit_row(
                user_email=sub_email,
                method=method,
                path=path,
                payload_summary=payload_summary,
                ip=ip,
                status_code=status_code,
            )
        )

        if (
            status_code < 400
            and _should_email_notify(method, path)
            and (settings.MAIL_USERNAME and settings.MAIL_PASSWORD)
        ):
            from app.core.mail_service import send_admin_email_async

            subj = f"[King Office] {method} {path[:120]}"
            txt = (
                f"User: {sub_email or '—'}\n"
                f"{method} {path}\nIP: {ip}\nStatus: {status_code}\n\n"
                f"{payload_summary or '—'}"
            )
            try:
                await send_admin_email_async(subj, txt)
            except Exception as e:
                logger.debug("admin notify email: %s", e)

        return response
