from datetime import date
from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core import database
from app.core.dependencies import get_current_user
from app.modules.internet.services.subscriber_debt_service import add_debt_line
from app.models import models
from app.schemas import schemas

router = APIRouter(tags=["Internet Meta"])


@router.get("/api/internet/zones", response_model=List[schemas.InternetZone])
def read_zones(_: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    return db.query(models.InternetZone).order_by(models.InternetZone.id.asc()).all()


@router.post("/api/internet/zones", response_model=schemas.InternetZone)
def create_zone(payload: schemas.InternetZoneCreate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = models.InternetZone(**payload.model_dump(exclude_none=True))
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/api/internet/zones/{zone_id}", response_model=schemas.InternetZone)
def update_zone(zone_id: int, payload: schemas.InternetZoneUpdate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = db.query(models.InternetZone).filter(models.InternetZone.id == zone_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Zone not found")
    for key, value in payload.model_dump(exclude_none=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/internet/zones/{zone_id}")
def delete_zone(zone_id: int, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = db.query(models.InternetZone).filter(models.InternetZone.id == zone_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Zone not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/api/internet/fats", response_model=List[schemas.InternetFat])
def read_fats(_: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    return db.query(models.InternetFat).order_by(models.InternetFat.id.asc()).all()


@router.post("/api/internet/fats", response_model=schemas.InternetFat)
def create_fat(payload: schemas.InternetFatCreate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    zone = db.query(models.InternetZone).filter(models.InternetZone.id == payload.zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    row = models.InternetFat(**payload.model_dump(exclude_none=True))
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/api/internet/fats/{fat_id}", response_model=schemas.InternetFat)
def update_fat(fat_id: int, payload: schemas.InternetFatUpdate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = db.query(models.InternetFat).filter(models.InternetFat.id == fat_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="FAT not found")
    updates = payload.model_dump(exclude_none=True)
    if "zone_id" in updates:
        zone = db.query(models.InternetZone).filter(models.InternetZone.id == updates["zone_id"]).first()
        if not zone:
            raise HTTPException(status_code=404, detail="Zone not found")
    for key, value in updates.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/internet/fats/{fat_id}")
def delete_fat(fat_id: int, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = db.query(models.InternetFat).filter(models.InternetFat.id == fat_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="FAT not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/api/internet/categories", response_model=List[schemas.SubscriptionCategory])
def read_categories(_: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    return db.query(models.SubscriptionCategory).order_by(models.SubscriptionCategory.id.asc()).all()


@router.post("/api/internet/categories", response_model=schemas.SubscriptionCategory)
def create_category(payload: schemas.SubscriptionCategoryCreate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = models.SubscriptionCategory(**payload.model_dump(exclude_none=True))
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/api/internet/categories/{category_id}", response_model=schemas.SubscriptionCategory)
def update_category(category_id: int, payload: schemas.SubscriptionCategoryUpdate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = db.query(models.SubscriptionCategory).filter(models.SubscriptionCategory.id == category_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Category not found")
    for key, value in payload.model_dump(exclude_none=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/internet/categories/{category_id}")
def delete_category(category_id: int, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = db.query(models.SubscriptionCategory).filter(models.SubscriptionCategory.id == category_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/api/internet/materials", response_model=List[schemas.InternetMaterial])
def read_materials(_: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    return db.query(models.InternetMaterial).order_by(models.InternetMaterial.id.asc()).all()


@router.post("/api/internet/materials", response_model=schemas.InternetMaterial)
def create_material(payload: schemas.InternetMaterialCreate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = models.InternetMaterial(**payload.model_dump(exclude_none=True))
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/api/internet/materials/{material_id}", response_model=schemas.InternetMaterial)
def update_material(material_id: int, payload: schemas.InternetMaterialUpdate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = db.query(models.InternetMaterial).filter(models.InternetMaterial.id == material_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Material not found")
    for key, value in payload.model_dump(exclude_none=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/internet/materials/{material_id}")
def delete_material(material_id: int, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = db.query(models.InternetMaterial).filter(models.InternetMaterial.id == material_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Material not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/api/internet/material-sales", response_model=List[schemas.InternetMaterialSale])
def read_material_sales(_: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    return db.query(models.InternetMaterialSale).order_by(models.InternetMaterialSale.id.desc()).all()


@router.post("/api/internet/material-sales", response_model=schemas.InternetMaterialSale)
def create_material_sale(
    payload: schemas.InternetMaterialSaleCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db),
):
    raw = payload.model_dump(exclude_none=True)
    subscriber_id = raw.pop("subscriber_id", None)
    data = dict(raw)
    material_id = data.get("material_id")

    if material_id:
        material = db.query(models.InternetMaterial).filter(models.InternetMaterial.id == material_id).first()
        if not material:
            raise HTTPException(status_code=404, detail="Material not found")
        if material.quantity < data["quantity"]:
            raise HTTPException(status_code=400, detail="Insufficient material quantity")
        material.quantity -= data["quantity"]
        data["material_name"] = material.name
        data["purchase_price"] = float(material.purchase_price)
        data["selling_price"] = float(material.selling_price)
        data["total_amount"] = float(material.selling_price) * data["quantity"]
        data["profit"] = (float(material.selling_price) - float(material.purchase_price)) * data["quantity"]

    subscriber = None
    if subscriber_id:
        subscriber = db.query(models.Subscriber).filter(models.Subscriber.id == subscriber_id).first()
        if not subscriber:
            raise HTTPException(status_code=404, detail="Subscriber not found")
        data["subscriber_name"] = subscriber.real_name

    row = models.InternetMaterialSale(**data)
    db.add(row)
    db.flush()

    if data.get("payment_method") == "debt" and subscriber is not None:
        total_debt_add = Decimal(str(data.get("total_amount") or 0))
        if total_debt_add > 0:
            try:
                add_debt_line(
                    db,
                    subscriber,
                    total_debt_add,
                    date.today(),
                    f"شراء {data.get('quantity', 0)} من {data.get('material_name', '')} بالآجل",
                    "current",
                    "material_sale",
                    current_user,
                )
            except ValueError as e:
                raise HTTPException(status_code=422, detail=str(e))
        history_row = models.SubscriberHistory(
            subscriber_id=subscriber.id,
            type="شراء مواد بالآجل",
            amount=float(data.get("total_amount") or 0),
            description=f"شراء {data.get('quantity', 0)} من {data.get('material_name', '')} بالآجل",
        )
        db.add(history_row)

    db.commit()
    db.refresh(row)
    return row
