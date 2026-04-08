"""إرسال بريد عبر Resend API (بديل Gmail SMTP)."""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"


def _notify_to() -> str | None:
    return (settings.ADMIN_NOTIFY_EMAIL or settings.ADMIN_EMAIL or "").strip() or None


def _render_reset_html(reset_url: str) -> str:
    """يقرأ قالب HTML ويحل المتغير reset_url."""
    tmpl = TEMPLATES_DIR / "reset_password.html"
    html = tmpl.read_text(encoding="utf-8")
    return html.replace("{{ reset_url }}", reset_url)


def _send_via_resend(*, from_addr: str, to: list[str], subject: str,
                     html: str | None = None, text: str | None = None) -> None:
    """إرسال متزامن عبر Resend SDK — يُستدعى من asyncio.to_thread."""
    import resend
    resend.api_key = settings.RESEND_API_KEY
    params: dict = {
        "from": from_addr,
        "to": to,
        "subject": subject,
    }
    if html:
        params["html"] = html
    elif text:
        params["text"] = text
    resend.Emails.send(params)


async def send_admin_email_async(subject: str, body: str) -> None:
    """يرسل بريداً نصياً إلى المدير عبر Resend."""
    to_addr = _notify_to()
    if not to_addr or not settings.RESEND_API_KEY:
        logger.debug("send_admin_email_async skipped: RESEND_API_KEY or notify address not set")
        return
    try:
        await asyncio.to_thread(
            _send_via_resend,
            from_addr=settings.MAIL_FROM or "noreply@kingoffice.store",
            to=[to_addr],
            subject=subject,
            text=body,
        )
    except Exception as e:
        logger.warning("send_admin_email_async failed: %s", type(e).__name__)


async def send_password_reset_email_async(to_email: str, reset_url: str) -> None:
    """إرسال رابط إعادة تعيين كلمة المرور عبر Resend API."""
    if not settings.RESEND_API_KEY:
        logger.error("RESEND_API_KEY is not configured — cannot send password reset email")
        raise RuntimeError("RESEND_API_KEY is not configured")

    try:
        html = _render_reset_html(reset_url)
        await asyncio.to_thread(
            _send_via_resend,
            from_addr=settings.MAIL_FROM or "noreply@kingoffice.store",
            to=[to_email],
            subject="إعادة تعيين كلمة المرور - مكتب الملك",
            html=html,
        )
        logger.info("Password reset email sent to %s via Resend", to_email)
    except RuntimeError:
        raise
    except Exception as e:
        logger.error("Failed to send password reset email via Resend: %s", type(e).__name__)
        raise
