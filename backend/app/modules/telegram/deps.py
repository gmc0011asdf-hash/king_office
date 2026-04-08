from fastapi import Header, HTTPException

from app.core.config import settings


def verify_telegram_link_secret(
    x_telegram_link_secret: str | None = Header(None, alias="X-Telegram-Link-Secret"),
) -> None:
    """
    إن وُضعت TELEGRAM_LINK_SECRET في .env يجب إرسالها مطابقة في الهيدر.
    إن بقيت فارغة (development) يُسمح بالوصول — عيّن سراً قوياً في الإنتاج.
    """
    expected = (settings.TELEGRAM_LINK_SECRET or "").strip()
    if not expected:
        return
    got = (x_telegram_link_secret or "").strip()
    if got != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Telegram-Link-Secret")
