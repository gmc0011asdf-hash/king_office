from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core import database
from app.core.dependencies import get_current_user
from app.models import models
from app.schemas import schemas

router = APIRouter(tags=["Partners"])


@router.get("/api/partners", response_model=List[schemas.Partner])
def read_partners(_: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    return db.query(models.Partner).order_by(models.Partner.id.desc()).all()


@router.post("/api/partners", response_model=schemas.Partner)
def create_partner(payload: schemas.PartnerCreate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = models.Partner(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/api/partners/{partner_id}", response_model=schemas.Partner)
def update_partner(partner_id: int, payload: schemas.PartnerUpdate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = db.query(models.Partner).filter(models.Partner.id == partner_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Partner not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/partners/{partner_id}")
def delete_partner(partner_id: int, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = db.query(models.Partner).filter(models.Partner.id == partner_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Partner not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/api/partner-transactions", response_model=List[schemas.PartnerTransaction])
def read_partner_transactions(_: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    return db.query(models.PartnerTransaction).order_by(models.PartnerTransaction.id.desc()).all()


@router.post("/api/partner-transactions", response_model=schemas.PartnerTransaction)
def create_partner_transaction(payload: schemas.PartnerTransactionCreate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    data = payload.model_dump(exclude_none=True)
    row = models.PartnerTransaction(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
