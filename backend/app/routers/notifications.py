from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core import database
from app.models import models
from app.shared.auth_router import oauth2_scheme
from app.core.security import get_current_user_from_token

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


@router.get("")
def get_my_notifications(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(database.get_db),
):
    user = get_current_user_from_token(token, db)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    items = (
        db.query(models.Notification)
        .filter(models.Notification.user_id == user.id)
        .order_by(models.Notification.created_at.desc())
        .limit(100)
        .all()
    )
    return [
        {
            "id": n.id,
            "title": n.title,
            "message": n.message,
            "type": n.type or "info",
            "read": n.read_at is not None,
            "date": n.created_at.isoformat() if n.created_at else None,
        }
        for n in items
    ]


@router.post("/{notification_id}/read")
def mark_as_read(
    notification_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(database.get_db),
):
    user = get_current_user_from_token(token, db)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    n = db.query(models.Notification).filter(
        models.Notification.id == notification_id,
        models.Notification.user_id == user.id,
    ).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")

    n.read_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.post("/read-all")
def mark_all_as_read(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(database.get_db),
):
    user = get_current_user_from_token(token, db)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    db.query(models.Notification).filter(
        models.Notification.user_id == user.id,
        models.Notification.read_at.is_(None),
    ).update({models.Notification.read_at: datetime.utcnow()})
    db.commit()
    return {"ok": True}
