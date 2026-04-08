from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from decimal import Decimal

from app.core import database
from app.models import models
from app.shared.auth_router import oauth2_scheme
from app.core.security import get_current_user_from_token
from app.modules.internet.services import broadcast_service

router = APIRouter(prefix="/api/broadcast", tags=["Broadcast"])

@router.get("/queue")
def get_broadcast_queue(
    status: Optional[str] = None,
    limit: int = 100,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(database.get_db)
):
    user = get_current_user_from_token(token, db)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    query = db.query(models.BroadcastQueue)
    if status:
        query = query.filter(models.BroadcastQueue.status == status)
    
    items = query.order_by(models.BroadcastQueue.created_at.desc()).limit(limit).all()
    
    return [
        {
            "id": i.id,
            "recipient": i.recipient,
            "message": i.message,
            "channel": i.channel,
            "status": i.status,
            "error_log": i.error_log,
            "scheduled_at": i.scheduled_at.isoformat() if i.scheduled_at else None,
            "sent_at": i.sent_at.isoformat() if i.sent_at else None,
            "created_at": i.created_at.isoformat() if i.created_at else None
        }
        for i in items
    ]

@router.post("/scan-debt")
def trigger_debt_scan(
    threshold: Decimal = Query(Decimal("50000")),
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(database.get_db)
):
    user = get_current_user_from_token(token, db)
    if not user or user.role != "admin":
        raise HTTPException(status_code=401, detail="Unauthorized - Admin only")
    
    count = broadcast_service.scan_and_queue_debt_alerts(db, threshold=threshold)
    return {"ok": True, "queued_count": count}

@router.post("/{broadcast_id}/cancel")
def cancel_broadcast(
    broadcast_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(database.get_db)
):
    user = get_current_user_from_token(token, db)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    item = db.query(models.BroadcastQueue).filter(models.BroadcastQueue.id == broadcast_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    if item.status == "pending":
        item.status = "cancelled"
        db.commit()
    
    return {"ok": True}
