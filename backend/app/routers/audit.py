from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core import database
from app.core.dependencies import require_admin
from app.models import models

router = APIRouter(tags=["Admin"])


@router.get("/api/admin/audit-logs")
def list_audit_logs(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_admin),
):
    """قراءة سجل التدقيق (للمدير فقط)."""
    q = db.query(models.AuditLog).order_by(models.AuditLog.created_at.desc())
    rows = q.offset(skip).limit(min(limit, 500)).all()
    return [
        {
            "id": r.id,
            "user_id": r.user_id,
            "user_email": r.user_email,
            "user_name": r.user_name,
            "http_method": r.http_method,
            "path": r.path,
            "payload_summary": r.payload_summary,
            "ip_address": r.ip_address,
            "status_code": r.status_code,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
