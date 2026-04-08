from typing import List, Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core import database
from app.core.dependencies import get_current_user
from app.models import models

router = APIRouter(tags=["Cards"])

class CardWalletTransactionPayload(BaseModel):
    walletType: str
    type: str
    amount: float
    commission: float = 0
    total: float = 0
    date: Optional[str] = None
    status: Optional[str] = None
    description: Optional[str] = None
    balanceAfter: float

class CardPurchasePayload(BaseModel):
    quantity: int
    purchasePrice: float
    sellingPrice: float
    totalCost: float
    date: Optional[str] = None

class CardSalePayload(BaseModel):
    quantity: int
    sellingPrice: float
    total: float
    profit: float
    date: Optional[str] = None

@router.get('/api/card-wallet-transactions')
def get_card_wallet_transactions(_: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    rows = db.query(models.CardWalletTransaction).order_by(models.CardWalletTransaction.id.desc()).all()
    data = []
    for row in rows:
        commission = 0
        total = float(row.amount)
        if row.description and 'commission=' in row.description:
            try:
                commission = float(str(row.description).split('commission=')[1].split(';')[0])
            except Exception:
                commission = 0
        if row.description and 'total=' in row.description:
            try:
                total = float(str(row.description).split('total=')[1].split(';')[0])
            except Exception:
                total = float(row.amount)
        data.append({
            'id': row.id,
            'walletType': row.wallet_type,
            'type': row.type,
            'amount': float(row.amount),
            'commission': commission,
            'total': total,
            'date': row.date.isoformat() if row.date else None,
            'status': 'ناجح',
            'description': row.description,
            'balanceAfter': float(row.balance_after),
        })
    return data

@router.post('/api/card-wallet-transactions')
def create_card_wallet_transaction(payload: CardWalletTransactionPayload, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    description = payload.description or ''
    description = f"{description};commission={payload.commission};total={payload.total};status={payload.status or 'ناجح'}"
    row = models.CardWalletTransaction(
        wallet_type=payload.walletType,
        type=payload.type,
        amount=payload.amount,
        description=description,
        balance_after=payload.balanceAfter,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        'id': row.id,
        'walletType': payload.walletType,
        'type': payload.type,
        'amount': payload.amount,
        'commission': payload.commission,
        'total': payload.total,
        'date': row.date.isoformat() if row.date else payload.date,
        'status': payload.status or 'ناجح',
        'description': payload.description or '',
        'balanceAfter': payload.balanceAfter,
    }

@router.get('/api/card-purchases')
def get_card_purchases(_: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    rows = db.query(models.CardPurchase).order_by(models.CardPurchase.id.desc()).all()
    data = []
    for row in rows:
        selling_price = 0
        if hasattr(row, 'selling_price') and row.selling_price is not None:
            selling_price = float(row.selling_price)
        data.append({
            'id': row.id,
            'quantity': row.quantity,
            'purchasePrice': float(row.purchase_price),
            'sellingPrice': selling_price,
            'totalCost': float(row.total_amount),
            'date': row.date.isoformat() if row.date else None,
        })
    return data

@router.post('/api/card-purchases')
def create_card_purchase(payload: CardPurchasePayload, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = models.CardPurchase(
        quantity=payload.quantity,
        purchase_price=payload.purchasePrice,
        total_amount=payload.totalCost,
    )
    if not hasattr(models.CardPurchase, 'selling_price'):
        pass
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        'id': row.id,
        'quantity': payload.quantity,
        'purchasePrice': payload.purchasePrice,
        'sellingPrice': payload.sellingPrice,
        'totalCost': payload.totalCost,
        'date': row.date.isoformat() if row.date else payload.date,
    }

@router.get('/api/card-sales')
def get_card_sales(_: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    rows = db.query(models.CardSale).order_by(models.CardSale.id.desc()).all()
    return [
        {
            'id': row.id,
            'quantity': row.quantity,
            'sellingPrice': float(row.selling_price),
            'total': float(row.total_amount),
            'profit': float(row.profit),
            'date': row.date.isoformat() if row.date else None,
        }
        for row in rows
    ]

@router.post('/api/card-sales')
def create_card_sale(payload: CardSalePayload, _: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    row = models.CardSale(
        quantity=payload.quantity,
        selling_price=payload.sellingPrice,
        total_amount=payload.total,
        profit=payload.profit,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        'id': row.id,
        'quantity': payload.quantity,
        'sellingPrice': payload.sellingPrice,
        'total': payload.total,
        'profit': payload.profit,
        'date': row.date.isoformat() if row.date else payload.date,
    }
