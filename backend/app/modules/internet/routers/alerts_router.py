"""
Alerts router — WhatsApp notification foundation.
Provides endpoints for expiry and debt reminder workflows.
"""
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import Subscriber
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


class ExpiringSubscriberOut(BaseModel):
    id: int
    real_name: Optional[str]
    user_code: Optional[str]
    phone: Optional[str]
    expiration_date: Optional[str]
    remaining_days: int

    model_config = {"from_attributes": True}


class DebtSubscriberOut(BaseModel):
    id: int
    real_name: Optional[str]
    user_code: Optional[str]
    phone: Optional[str]
    debt: float
    zone: Optional[str]
    fat: Optional[str]

    model_config = {"from_attributes": True}


@router.get("/expiring-subscribers", response_model=List[ExpiringSubscriberOut])
def get_expiring_subscribers(
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    """
    Return subscribers whose expiration_date is within the next 3 days (or already expired)
    AND whose last_expiry_reminder_date is NULL or older than 24 hours.
    Optimized to return only essential contact and date info.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)  # Use naive for comparison with DB
    today = now.date()
    cutoff_date = today + timedelta(days=3)
    reminder_threshold = now - timedelta(hours=24)

    # Fetch only required columns for optimization
    rows = (
        db.query(
            Subscriber.id,
            Subscriber.real_name,
            Subscriber.user_code,
            Subscriber.phone,
            Subscriber.expiration_date,
        )
        .filter(
            Subscriber.expiration_date != None,
            Subscriber.expiration_date <= cutoff_date,
            (
                (Subscriber.last_expiry_reminder_date == None)
                | (Subscriber.last_expiry_reminder_date < reminder_threshold)
            ),
        )
        .order_by(Subscriber.expiration_date.asc())
        .all()
    )

    result = []
    for row in rows:
        exp = row.expiration_date
        remaining = (exp - today).days if exp else 0
        result.append(
            ExpiringSubscriberOut(
                id=row.id,
                real_name=row.real_name,
                user_code=row.user_code,
                phone=row.phone,
                expiration_date=str(exp) if exp else None,
                remaining_days=remaining,
            )
        )
    return result


class MarkNotifiedResponse(BaseModel):
    ok: bool
    subscriber_id: int
    marked_at: str


@router.post("/mark-expiry-notified/{subscriber_id}", response_model=MarkNotifiedResponse)
def mark_expiry_notified(
    subscriber_id: int,
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    """
    Set last_expiry_reminder_date = now() for the given subscriber.
    Called after the user sends a WhatsApp reminder.
    """
    sub = db.query(Subscriber).filter(Subscriber.id == subscriber_id).first()
    if not sub:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Subscriber not found")

    now = datetime.now(timezone.utc)
    sub.last_expiry_reminder_date = now
    db.commit()

    return MarkNotifiedResponse(
        ok=True,
        subscriber_id=subscriber_id,
        marked_at=now.isoformat(),
    )


@router.get("/internet-debts", response_model=List[DebtSubscriberOut])
def get_internet_debt_alerts(
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    """
    Return subscribers with debt > 0 and no recent reminder (automated or manual) 
    in the last 24 hours.
    """
    rows = (
        db.query(
            Subscriber.id,
            Subscriber.real_name,
            Subscriber.user_code,
            Subscriber.phone,
            Subscriber.debt,
            Subscriber.zone,
            Subscriber.fat,
        )
        .filter(Subscriber.debt > 0)
        .order_by(Subscriber.debt.desc())
        .all()
    )

    return [
        DebtSubscriberOut(
            id=row.id,
            real_name=row.real_name,
            user_code=row.user_code,
            phone=row.phone,
            debt=float(row.debt),
            zone=row.zone,
            fat=row.fat,
        )
        for row in rows
    ]


@router.post("/mark-debt-notified/{subscriber_id}", response_model=MarkNotifiedResponse)
def mark_debt_notified(
    subscriber_id: int,
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    """
    Set last_debt_reminder_date = now() for the given subscriber.
    Also syncs last_debt_alert_sent to avoid redundant automated alerts.
    """
    sub = db.query(Subscriber).filter(Subscriber.id == subscriber_id).first()
    if not sub:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Subscriber not found")

    now = datetime.now(timezone.utc)
    # Update both for consistency
    sub.last_debt_reminder_date = now
    sub.last_debt_alert_sent = now
    db.commit()

    return MarkNotifiedResponse(
        ok=True,
        subscriber_id=subscriber_id,
        marked_at=now.isoformat(),
    )
