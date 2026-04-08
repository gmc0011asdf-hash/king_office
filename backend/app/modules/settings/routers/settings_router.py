from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core import database
from app.core.dependencies import get_current_user
from app.models import models
from app.schemas import schemas

router = APIRouter(tags=['Settings'])


def _ensure_settings_row(db: Session):
    row = db.query(models.SystemSettings).order_by(models.SystemSettings.id.asc()).first()
    if not row:
        row = models.SystemSettings()
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.get('/api/settings', response_model=List[schemas.SystemSettings])
def read_settings(_: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = _ensure_settings_row(db)
    return [row]


@router.put('/api/settings/{settings_id}', response_model=schemas.SystemSettings)
def update_settings(settings_id: int, payload: schemas.SystemSettingsCreate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = db.query(models.SystemSettings).filter(models.SystemSettings.id == settings_id).first()
    if not row:
        if settings_id == 1:
            row = _ensure_settings_row(db)
        else:
            raise HTTPException(status_code=404, detail='Settings row not found')
    data = payload.model_dump(by_alias=False)
    for key, value in data.items():
        if hasattr(row, key):
            setattr(row, key, value)
    db.commit()
    db.refresh(row)
    try:
        from app.core.backup_scheduler import sync_backup_schedule

        sync_backup_schedule()
    except Exception:
        pass
    return row

@router.get('/api/settings/templates', response_model=List[schemas.MessageTemplate])
def read_templates(_: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    keys = ['internet_expiry_msg', 'internet_debt_msg', 'office_debt_msg', 'promo_msg']
    templates = db.query(models.MessageTemplate).filter(models.MessageTemplate.key.in_(keys)).all()
    
    # Ensure all keys exist
    existing_keys = {t.key for t in templates}
    missing_keys = [k for k in keys if k not in existing_keys]
    
    if missing_keys:
        for k in missing_keys:
            new_t = models.MessageTemplate(key=k, body="")
            db.add(new_t)
        db.commit()
        templates = db.query(models.MessageTemplate).filter(models.MessageTemplate.key.in_(keys)).all()
        
    return templates


@router.put('/api/settings/templates/{key}', response_model=schemas.MessageTemplate)
def update_template(key: str, payload: schemas.MessageTemplateUpdate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = db.query(models.MessageTemplate).filter(models.MessageTemplate.key == key).first()
    if not row:
        row = models.MessageTemplate(key=key, body=payload.body)
        db.add(row)
    else:
        row.body = payload.body
    
    db.commit()
    db.refresh(row)
    return row
