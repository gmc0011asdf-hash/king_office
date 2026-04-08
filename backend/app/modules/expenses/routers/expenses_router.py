from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core import database
from app.core.dependencies import get_current_user
from app.models import models
from app.schemas import schemas

router = APIRouter(tags=["Expenses"])


@router.get("/api/expenses", response_model=List[schemas.Expense])
def read_expenses(_: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    return db.query(models.Expense).order_by(models.Expense.id.desc()).all()


@router.post("/api/expenses", response_model=schemas.Expense)
def create_expense(payload: schemas.ExpenseCreate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    data = payload.model_dump(exclude_none=True)
    row = models.Expense(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/api/cashback-history", response_model=List[schemas.CashbackHistory])
def read_cashback_history(_: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    return db.query(models.CashbackHistory).order_by(models.CashbackHistory.id.desc()).all()


@router.post("/api/cashback-history", response_model=schemas.CashbackHistory)
def create_cashback_history(payload: schemas.CashbackHistoryCreate, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    data = payload.model_dump(exclude_none=True)
    row = models.CashbackHistory(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
