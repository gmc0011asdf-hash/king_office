from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core import database
from app.core.dependencies import get_current_user
from app.models import models
from app.schemas import schemas

router = APIRouter(tags=["Wallet"])


@router.get("/api/wallet-transactions", response_model=List[schemas.WalletTransaction])
def read_wallet_transactions(_: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    return db.query(models.WalletTransaction).order_by(models.WalletTransaction.id.desc()).all()


@router.post("/api/wallet-transactions", response_model=schemas.WalletTransaction)
def create_wallet_transaction(payload: schemas.WalletTransactionCreate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    data = payload.model_dump(exclude_none=True)
    row = models.WalletTransaction(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
