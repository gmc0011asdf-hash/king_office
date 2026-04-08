from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core import database
from app.core.dependencies import get_current_user
from app.models import models
from app.schemas import schemas

router = APIRouter(tags=["Suppliers"])


@router.get("/api/suppliers", response_model=List[schemas.Supplier])
def read_suppliers(_: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    return db.query(models.Supplier).order_by(models.Supplier.id.desc()).all()


@router.post("/api/suppliers", response_model=schemas.Supplier)
def create_supplier(payload: schemas.SupplierCreate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = models.Supplier(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/api/suppliers/{supplier_id}", response_model=schemas.Supplier)
def update_supplier(supplier_id: int, payload: schemas.SupplierUpdate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = db.query(models.Supplier).filter(models.Supplier.id == supplier_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Supplier not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/suppliers/{supplier_id}")
def delete_supplier(supplier_id: int, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = db.query(models.Supplier).filter(models.Supplier.id == supplier_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Supplier not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/api/suppliers/{supplier_id}/transactions", response_model=List[schemas.SupplierTransaction])
def read_supplier_transactions(supplier_id: int, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    return db.query(models.SupplierTransaction).filter(models.SupplierTransaction.supplier_id == supplier_id).order_by(models.SupplierTransaction.id.desc()).all()


@router.post("/api/suppliers/{supplier_id}/transactions", response_model=schemas.SupplierTransaction)
def create_supplier_transaction(supplier_id: int, payload: schemas.SupplierTransactionCreate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    data = payload.model_dump(exclude_none=True)
    data["supplier_id"] = supplier_id
    row = models.SupplierTransaction(**data)
    db.add(row)
    db.commit()
    db.refresh(row)

    supplier = db.query(models.Supplier).filter(models.Supplier.id == supplier_id).first()
    if supplier:
        if row.type == "purchase":
            supplier.outstanding_debt = float(supplier.outstanding_debt or 0) + float(row.amount)
        elif row.type == "payment":
            supplier.outstanding_debt = max(0, float(supplier.outstanding_debt or 0) - float(row.amount))
        db.commit()

    return row
