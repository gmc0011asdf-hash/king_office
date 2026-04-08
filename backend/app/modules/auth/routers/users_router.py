import json
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core import database, security
from app.core.dependencies import require_admin
from app.models import models
from app.schemas import schemas

router = APIRouter(tags=["Users"])


def _serialize_user(user: models.User):
    permissions = None
    if getattr(user, 'permissions', None):
        try:
            permissions = json.loads(user.permissions)
        except Exception:
            permissions = None
    return {
        'id': user.id,
        'name': user.name,
        'email': user.email,
        'role': user.role,
        'password': '',
        'recovery_email': user.recovery_email,
        'last_login': user.last_login,
        'status': user.status,
        'created_at': user.created_at,
        'permissions': permissions,
    }


@router.get("/api/users", response_model=List[schemas.User])
def read_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_admin),
):
    items = db.query(models.User).order_by(models.User.id.asc()).offset(skip).limit(limit).all()
    return [_serialize_user(u) for u in items]


@router.post("/api/users", response_model=schemas.User)
def create_user(
    user: schemas.UserCreate,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_admin),
):
    """إنشاء مستخدم: JWT صالح + دور admin (`require_admin` يعتمد على `get_current_user`)."""
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail='Email already registered')

    payload = user.model_dump(exclude_unset=True, by_alias=False)
    raw_password = payload.pop('password')
    permissions = payload.pop('permissions', None)
    db_user = models.User(**payload)
    db_user.password = security.get_password_hash(raw_password)
    db_user.permissions = json.dumps(permissions, ensure_ascii=False) if permissions else None
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return _serialize_user(db_user)


@router.put("/api/users/{user_id}", response_model=schemas.User)
def update_user(
    user_id: int,
    user: schemas.UserUpdate,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_admin),
):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail='User not found')

    payload = user.model_dump(exclude_unset=True, by_alias=False)
    if 'email' in payload:
        existing = db.query(models.User).filter(models.User.email == payload['email'], models.User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=400, detail='Email already registered')

    if 'permissions' in payload:
        permissions = payload.pop('permissions')
        db_user.permissions = json.dumps(permissions, ensure_ascii=False) if permissions else None

    if 'password' in payload:
        raw_password = payload.pop('password')
        if raw_password:
            db_user.password = security.get_password_hash(raw_password)

    for key, value in payload.items():
        setattr(db_user, key, value)

    db.commit()
    db.refresh(db_user)
    return _serialize_user(db_user)


@router.delete("/api/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_admin),
):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail='User not found')
    db.delete(db_user)
    db.commit()
    return {'ok': True, 'source': 'database', 'message': 'تم حذف المستخدم من قاعدة البيانات'}
@router.post("/api/admin/maintenance/fix-users-id-sequence")
def fix_users_id_sequence(
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_admin),
):
    """
    مزامنة users_id_seq مع MAX(id) — لمرة واحدة عند خطأ duplicate key على id.
    يفضّل تشغيل السكربت: backend/scripts/fix_users_id_sequence.py
    """
    max_id = db.execute(text("SELECT COALESCE(MAX(id), 0) FROM users")).scalar()
    setval_result = db.execute(
        text(
            "SELECT setval("
            "pg_get_serial_sequence('users', 'id'), "
            "COALESCE((SELECT MAX(id) FROM users), 1), "
            "(SELECT MAX(id) FROM users) IS NOT NULL)"
        )
    ).scalar()
    db.commit()
    return {
        "ok": True,
        "max_id": int(max_id),
        "setval_result": int(setval_result) if setval_result is not None else None,
        "message": "users_id_seq synced; next INSERT uses max(id)+1 when rows exist.",
    }
