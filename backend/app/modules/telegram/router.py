from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core import database
from app.modules.telegram import service
from app.modules.telegram.deps import verify_telegram_link_secret
from app.modules.telegram.schemas import (
    TelegramLinkBody,
    TelegramLinkFailure,
    TelegramLinkSuccess,
    TelegramStatusOut,
    TelegramUnlinkBody,
    TelegramUnlinkFailure,
    TelegramUnlinkSuccess,
)

router = APIRouter(tags=["Telegram"])


@router.post(
    "/api/telegram/link",
    response_model=TelegramLinkSuccess | TelegramLinkFailure,
)
def telegram_link(
    body: TelegramLinkBody,
    db: Session = Depends(database.get_db),
    _: None = Depends(verify_telegram_link_secret),
):
    return service.link_subscriber(
        db,
        telegram_chat_id=body.telegram_chat_id,
        user_code=body.user_code,
        phone=body.phone,
    )


@router.post(
    "/api/telegram/start",
    response_model=TelegramLinkSuccess | TelegramLinkFailure,
)
def telegram_start(
    body: TelegramLinkBody,
    db: Session = Depends(database.get_db),
    _: None = Depends(verify_telegram_link_secret),
):
    """نفس منطق POST /api/telegram/link — مسمى مناسب لسير عمل n8n بعد /start."""
    return service.link_subscriber(
        db,
        telegram_chat_id=body.telegram_chat_id,
        user_code=body.user_code,
        phone=body.phone,
    )


@router.post(
    "/api/telegram/unlink",
    response_model=TelegramUnlinkSuccess | TelegramUnlinkFailure,
)
def telegram_unlink(
    body: TelegramUnlinkBody,
    db: Session = Depends(database.get_db),
    _: None = Depends(verify_telegram_link_secret),
):
    return service.unlink(
        db,
        subscriber_id=body.subscriber_id,
        telegram_chat_id=body.telegram_chat_id,
    )


@router.get(
    "/api/telegram/status/{subscriber_id}",
    response_model=TelegramStatusOut | TelegramLinkFailure,
)
def telegram_status(
    subscriber_id: int,
    db: Session = Depends(database.get_db),
    _: None = Depends(verify_telegram_link_secret),
):
    return service.status(db, subscriber_id=subscriber_id)
