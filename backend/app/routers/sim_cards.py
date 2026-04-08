from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from decimal import Decimal

from app.core import database
from app.core.dependencies import get_current_user
from app.models import models
from app.schemas import schemas

router = APIRouter(tags=["SIM Cards"])


@router.get("/api/sim-packages", response_model=List[schemas.SimPackage])
def read_sim_packages(_: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    return db.query(models.SimPackage).order_by(models.SimPackage.id.desc()).all()


@router.post("/api/sim-packages", response_model=schemas.SimPackage)
def create_sim_package(payload: schemas.SimPackageCreate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    data = payload.model_dump(exclude_none=True)
    row = models.SimPackage(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/api/sim-packages/{package_id}", response_model=schemas.SimPackage)
def update_sim_package(package_id: int, payload: schemas.SimPackageUpdate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = db.query(models.SimPackage).filter(models.SimPackage.id == package_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Package not found")
    for key, value in payload.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/sim-packages/{package_id}")
def delete_sim_package(package_id: int, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = db.query(models.SimPackage).filter(models.SimPackage.id == package_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Package not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/api/sim-inventory", response_model=List[schemas.SimInventoryTransaction])
def read_sim_inventory(_: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    return db.query(models.SimInventoryTransaction).order_by(models.SimInventoryTransaction.id.desc()).all()


@router.post("/api/sim-inventory", response_model=schemas.SimInventoryTransaction)
def create_sim_inventory(payload: schemas.SimInventoryTransactionCreate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = models.SimInventoryTransaction(**payload.model_dump(exclude_none=True))
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/api/sim-sales", response_model=List[schemas.SimSale])
def read_sim_sales(_: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    return db.query(models.SimSale).order_by(models.SimSale.id.desc()).all()


@router.post("/api/sim-sales", response_model=schemas.SimSale)
def create_sim_sale(payload: schemas.SimSaleCreate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    data = payload.model_dump(exclude_none=True)

    # Ensure package exists (optional but recommended)
    package_id = data.get("package_id")
    pkg = None
    if package_id:
        pkg = db.query(models.SimPackage).filter(models.SimPackage.id == package_id).first()
        if not pkg:
            raise HTTPException(status_code=404, detail="Package not found")

    # Ensure number exists (optional)
    sim_number_id = data.get("sim_number_id")
    if sim_number_id:
        num = db.query(models.SimNumber).filter(models.SimNumber.id == sim_number_id).first()
        if not num:
            raise HTTPException(status_code=404, detail="SIM number not found")
        num.status = "sold"
        num.sold_date = datetime.utcnow()
        if package_id:
            num.package_id = package_id

    row = models.SimSale(**data)
    db.add(row)

    # Also create inventory transaction for selling
    inv_tx = models.SimInventoryTransaction(type=data.get("type") or (pkg.type if pkg else "asia"), quantity=1, action="sell")
    db.add(inv_tx)

    db.commit()
    db.refresh(row)
    return row


@router.get("/api/sim-numbers", response_model=List[schemas.SimNumber])
def read_sim_numbers(_: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    return db.query(models.SimNumber).order_by(models.SimNumber.id.desc()).all()


@router.post("/api/sim-numbers", response_model=schemas.SimNumber)
def create_sim_number(payload: schemas.SimNumberCreate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = models.SimNumber(**payload.model_dump(exclude_none=True))
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/api/sim-numbers/{number_id}", response_model=schemas.SimNumber)
def update_sim_number(number_id: int, payload: schemas.SimNumberUpdate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = db.query(models.SimNumber).filter(models.SimNumber.id == number_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="SIM number not found")
    for key, value in payload.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/sim-numbers/{number_id}")
def delete_sim_number(number_id: int, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = db.query(models.SimNumber).filter(models.SimNumber.id == number_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="SIM number not found")
    db.delete(row)
    db.commit()
    return {"ok": True}
