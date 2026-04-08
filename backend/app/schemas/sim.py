from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel

from app.schemas.base import ORMModel


class SimPackageBase(BaseModel):
    type: str
    name: str
    topup_amount: Decimal = Decimal("0")
    company_commission: Decimal = Decimal("0")
    jb_return: Decimal = Decimal("0")
    cost: Decimal = Decimal("0")
    selling_price: Decimal = Decimal("0")


class SimPackageCreate(SimPackageBase):
    pass


class SimPackageUpdate(BaseModel):
    type: Optional[str] = None
    name: Optional[str] = None
    topup_amount: Optional[Decimal] = None
    company_commission: Optional[Decimal] = None
    jb_return: Optional[Decimal] = None
    cost: Optional[Decimal] = None
    selling_price: Optional[Decimal] = None


class SimPackage(SimPackageBase, ORMModel):
    id: int


class SimInventoryTransactionBase(BaseModel):
    type: str
    quantity: int
    action: str


class SimInventoryTransactionCreate(SimInventoryTransactionBase):
    pass


class SimInventoryTransaction(SimInventoryTransactionBase, ORMModel):
    id: int
    date: Optional[datetime] = None


class SimNumberBase(BaseModel):
    number: str
    type: str
    status: str = "available"
    sold_date: Optional[datetime] = None
    package_id: Optional[int] = None


class SimNumberCreate(SimNumberBase):
    pass


class SimNumberUpdate(BaseModel):
    number: Optional[str] = None
    type: Optional[str] = None
    status: Optional[str] = None
    sold_date: Optional[datetime] = None
    package_id: Optional[int] = None


class SimNumber(SimNumberBase, ORMModel):
    id: int


class SimSaleBase(BaseModel):
    package_id: Optional[int] = None
    type: str
    selling_price: Decimal = Decimal("0")
    cost: Decimal = Decimal("0")
    profit: Decimal = Decimal("0")
    company_commission: Decimal = Decimal("0")
    jb_return: Decimal = Decimal("0")
    sim_number_id: Optional[int] = None


class SimSaleCreate(SimSaleBase):
    pass


class SimSale(SimSaleBase, ORMModel):
    id: int
    date: Optional[datetime] = None
