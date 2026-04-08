from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core import database
from app.models import models
from app.schemas import schemas
from app.shared.auth_router import oauth2_scheme
from app.core.security import get_current_user_from_token

router = APIRouter(prefix="/api/activity-log", tags=["Activity Log"])


@router.get("")
def get_activity_log(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    user_id: int = Query(None, description="Filter by user ID"),
    section: str = Query(None, description="Filter by section"),
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(database.get_db),
):
    current_user = get_current_user_from_token(token, db)
    if not current_user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Only admin can see all logs; employees see only their own
    q = db.query(models.ActivityLog)
    if current_user.role != "admin":
        q = q.filter(models.ActivityLog.user_id == current_user.id)

    if user_id is not None:
        q = q.filter(models.ActivityLog.user_id == user_id)
    if section:
        q = q.filter(models.ActivityLog.section == section)

    items = q.order_by(models.ActivityLog.created_at.desc()).offset(skip).limit(limit).all()

    return [
        {
            "id": a.id,
            "userId": a.user_id,
            "userName": a.user_name,
            "section": a.section,
            "action": a.action,
            "details": a.details,
            "createdAt": a.created_at.isoformat() if a.created_at else None,
        }
        for a in items
    ]


@router.post("")
def create_activity_log(
    payload: schemas.ActivityLogCreate,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(database.get_db),
):
    """Create activity log entry. Called by frontend after successful actions."""
    current_user = get_current_user_from_token(token, db)
    if not current_user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    section = payload.section
    action = payload.action
    details = payload.details

    log = models.ActivityLog(
        user_id=current_user.id,
        user_name=current_user.name,
        section=section,
        action=action,
        details=details,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return {"id": log.id, "createdAt": log.created_at.isoformat() if log.created_at else None}
