from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.aliases import AliasChoices

from app.core.iraq_phone import normalize_iraq_mobile

from app.schemas.base import ORMModel


class WalletTransactionBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    type: str
    amount: Decimal = Decimal("0")
    date: Optional[datetime] = None
    description: Optional[str] = None
    wallet_type: Optional[str] = Field(default="ftth", validation_alias=AliasChoices("walletType", "wallet_type"), serialization_alias="walletType")


class WalletTransactionCreate(WalletTransactionBase):
    pass


class WalletTransaction(ORMModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    wallet_type: Optional[str] = Field(default="ftth", validation_alias=AliasChoices("walletType", "wallet_type"), serialization_alias="walletType")
    type: Optional[str] = None
    amount: Decimal = Decimal("0")
    date: Optional[datetime] = None
    description: Optional[str] = None


class ExpenseBase(BaseModel):
    amount: Decimal = Decimal("0")
    category: str
    description: Optional[str] = None


class ExpenseCreate(ExpenseBase):
    pass


class Expense(ExpenseBase, ORMModel):
    id: int
    date: Optional[datetime] = None


class PartnerBase(BaseModel):
    name: str
    join_date: Optional[date] = None
    percentage: Decimal = Decimal("0")
    department: Optional[str] = None


class PartnerCreate(PartnerBase):
    pass


class PartnerUpdate(BaseModel):
    name: Optional[str] = None
    join_date: Optional[date] = None
    percentage: Optional[Decimal] = None
    department: Optional[str] = None


class Partner(PartnerBase, ORMModel):
    id: int


class PartnerTransactionBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    partner_id: int = Field(validation_alias=AliasChoices("partnerId", "partner_id"))
    date: Optional[datetime] = None
    department: Optional[str] = None
    revenue: Decimal = Decimal("0")
    expenses: Decimal = Decimal("0")
    net_profit: Decimal = Field(default=Decimal("0"), validation_alias=AliasChoices("netProfit", "net_profit"))
    partner_share: Decimal = Field(default=Decimal("0"), validation_alias=AliasChoices("partnerShare", "partner_share"))


class PartnerTransactionCreate(PartnerTransactionBase):
    pass


class PartnerTransaction(PartnerTransactionBase, ORMModel):
    id: int
    date: Optional[datetime] = None


class SupplierBase(BaseModel):
    name: str
    specialty: Optional[str] = None
    phone: Optional[str] = None
    outstanding_debt: Decimal = Decimal("0")

    @field_validator("phone", mode="before")
    @classmethod
    def _norm_supplier_phone(cls, v):
        if v is None:
            return None
        s = str(v).strip()
        if not s:
            return None
        return normalize_iraq_mobile(s, required=False)


class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    specialty: Optional[str] = None
    phone: Optional[str] = None
    outstanding_debt: Optional[Decimal] = None

    @field_validator("phone", mode="before")
    @classmethod
    def _norm_supplier_phone_upd(cls, v):
        if v is None:
            return None
        s = str(v).strip()
        if not s:
            return None
        return normalize_iraq_mobile(s, required=False)


class Supplier(SupplierBase, ORMModel):
    id: int


class SupplierTransactionBase(BaseModel):
    supplier_id: int
    type: Optional[str] = None
    amount: Decimal = Decimal("0")
    notes: Optional[str] = None


class SupplierTransactionCreate(SupplierTransactionBase):
    pass


class SupplierTransaction(SupplierTransactionBase, ORMModel):
    id: int
    date: Optional[datetime] = None


class CardWalletTransactionBase(BaseModel):
    wallet_type: Optional[str] = None
    type: Optional[str] = None
    amount: Decimal = Decimal("0")
    commission: Decimal = Decimal("0")
    total: Decimal = Decimal("0")
    status: Optional[str] = None
    description: Optional[str] = None
    balance_after: Optional[Decimal] = None


class CardWalletTransactionCreate(CardWalletTransactionBase):
    pass


class CardWalletTransaction(CardWalletTransactionBase, ORMModel):
    id: int
    date: Optional[datetime] = None


class CardPurchaseBase(BaseModel):
    quantity: int
    purchase_price: Decimal = Decimal("0")
    selling_price: Optional[Decimal] = None
    total_amount: Decimal = Decimal("0")


class CardPurchaseCreate(CardPurchaseBase):
    pass


class CardPurchase(CardPurchaseBase, ORMModel):
    id: int
    date: Optional[datetime] = None


class CardSaleBase(BaseModel):
    quantity: int
    selling_price: Decimal = Decimal("0")
    total_amount: Decimal = Decimal("0")
    profit: Decimal = Decimal("0")


class CardSaleCreate(CardSaleBase):
    pass


class CardSale(CardSaleBase, ORMModel):
    id: int
    date: Optional[datetime] = None
