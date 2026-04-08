"""
وصول قاعدة البيانات لربط Telegram فقط — لا منطق أعمال هنا.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import models


def get_subscriber_by_user_code(db: Session, user_code: str) -> models.Subscriber | None:
    return (
        db.query(models.Subscriber)
        .filter(models.Subscriber.user_code == user_code)
        .first()
    )


def get_subscriber_by_phone(db: Session, phone: str) -> models.Subscriber | None:
    return (
        db.query(models.Subscriber)
        .filter(models.Subscriber.phone == phone)
        .first()
    )


def find_subscriber_for_link(
    db: Session,
    *,
    user_code: str | None,
    phone: str | None,
) -> models.Subscriber | None:
    """
    إن وُجد user_code: ابحث به أولاً؛ إن لم يُعثر ووُجد phone فابحث بالهاتف.
    إن لم يُرسل user_code فابحث بالهاتف فقط إن وُجد.
    """
    if user_code:
        hit = get_subscriber_by_user_code(db, user_code)
        if hit is not None:
            return hit
        if phone:
            return get_subscriber_by_phone(db, phone)
        return None
    if phone:
        return get_subscriber_by_phone(db, phone)
    return None


def get_subscriber_by_telegram_chat_id(db: Session, chat_id: int) -> models.Subscriber | None:
    return (
        db.query(models.Subscriber)
        .filter(models.Subscriber.telegram_chat_id == chat_id)
        .first()
    )


def clear_subscribers_telegram_chat_id(db: Session, chat_id: int) -> None:
    db.query(models.Subscriber).filter(models.Subscriber.telegram_chat_id == chat_id).update(
        {models.Subscriber.telegram_chat_id: None},
        synchronize_session=False,
    )


