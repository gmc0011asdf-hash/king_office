from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.iraq_phone import normalize_iraq_mobile
from pydantic.aliases import AliasChoices

from app.schemas.base import ORMModel


class OfficeMaterialBase(BaseModel):
    name: str
    purchase_price: Decimal = Decimal("0")
    selling_price: Decimal = Decimal("0")
    quantity: int = 0


class OfficeMaterialCreate(OfficeMaterialBase):
    pass


class OfficeMaterialUpdate(BaseModel):
    name: Optional[str] = None
    purchase_price: Optional[Decimal] = None
    selling_price: Optional[Decimal] = None
    quantity: Optional[int] = None


class OfficeMaterial(OfficeMaterialBase, ORMModel):
    id: int


class OfficeCustomerBase(BaseModel):
    name: str
    phone: Optional[str] = None
    debt: Decimal = Decimal("0")

    @field_validator("phone", mode="before")
    @classmethod
    def _norm_customer_phone(cls, v):
        if v is None:
            return None
        s = str(v).strip()
        if not s:
            return None
        return normalize_iraq_mobile(s, required=False)


class OfficeCustomerCreate(OfficeCustomerBase):
    pass


class OfficeCustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    debt: Optional[Decimal] = None

    @field_validator("phone", mode="before")
    @classmethod
    def _norm_customer_phone_upd(cls, v):
        if v is None:
            return None
        s = str(v).strip()
        if not s:
            return None
        return normalize_iraq_mobile(s, required=False)


class OfficeCustomer(OfficeCustomerBase, ORMModel):
    id: int


class OfficeCustomerHistoryBase(BaseModel):
    customer_id: int
    type: Optional[str] = None
    amount: Decimal = Decimal("0")
    description: Optional[str] = None


class OfficeCustomerHistoryCreate(OfficeCustomerHistoryBase):
    pass


class OfficeCustomerHistory(OfficeCustomerHistoryBase, ORMModel):
    id: int
    date: Optional[datetime] = None


class OfficeSaleBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    material_id: Optional[int] = Field(default=None, validation_alias=AliasChoices("materialId", "material_id"), serialization_alias="materialId")
    material_name: Optional[str] = Field(default=None, validation_alias=AliasChoices("materialName", "material_name"), serialization_alias="materialName")
    quantity: int = Field(default=1, validation_alias=AliasChoices("quantity",), serialization_alias="quantity")
    purchase_price: Decimal = Field(default=Decimal("0"), validation_alias=AliasChoices("purchasePrice", "purchase_price"), serialization_alias="purchasePrice")
    selling_price: Decimal = Field(default=Decimal("0"), validation_alias=AliasChoices("sellingPrice", "selling_price"), serialization_alias="sellingPrice")
    total_amount: Decimal = Field(default=Decimal("0"), validation_alias=AliasChoices("totalAmount", "total_amount"), serialization_alias="totalAmount")
    profit: Decimal = Field(default=Decimal("0"), validation_alias=AliasChoices("profit",), serialization_alias="profit")
    payment_method: Optional[str] = Field(default=None, validation_alias=AliasChoices("paymentMethod", "payment_method"), serialization_alias="paymentMethod")
    customer_id: Optional[int] = Field(default=None, validation_alias=AliasChoices("customerId", "customer_id"), serialization_alias="customerId")
    customer_name: Optional[str] = Field(default=None, validation_alias=AliasChoices("customerName", "customer_name"), serialization_alias="customerName")
    customer_phone: Optional[str] = Field(default=None, validation_alias=AliasChoices("customerPhone", "customer_phone"), serialization_alias="customerPhone")
    purchase_date: Optional[date] = Field(default=None, validation_alias=AliasChoices("purchaseDate", "purchase_date"), serialization_alias="purchaseDate")
    commission_percent: Optional[Decimal] = Field(default=None, validation_alias=AliasChoices("commissionPercent", "commission_percent"), serialization_alias="commissionPercent")
    total_with_commission: Optional[Decimal] = Field(default=None, validation_alias=AliasChoices("totalWithCommission", "total_with_commission"), serialization_alias="totalWithCommission")
    installments_months: Optional[int] = Field(default=None, validation_alias=AliasChoices("installmentsMonths", "installments_months"), serialization_alias="installmentsMonths")
    monthly_installment: Optional[Decimal] = Field(default=None, validation_alias=AliasChoices("monthlyInstallment", "monthly_installment"), serialization_alias="monthlyInstallment")

    @field_validator("customer_phone", mode="before")
    @classmethod
    def _norm_sale_customer_phone(cls, v):
        if v is None:
            return None
        s = str(v).strip()
        if not s:
            return None
        return normalize_iraq_mobile(s, required=False)


class OfficeSaleCreate(OfficeSaleBase):
    pass


class OfficeSale(OfficeSaleBase, ORMModel):
    id: int
    date: Optional[datetime] = None


class OfficeInvoiceItemBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    material_id: Optional[int] = Field(default=None, validation_alias=AliasChoices("materialId", "material_id"), serialization_alias="materialId")
    material_name: str = Field(validation_alias=AliasChoices("materialName", "material_name"), serialization_alias="materialName")
    quantity: int = Field(default=1, validation_alias=AliasChoices("quantity",), serialization_alias="quantity")
    selling_price: Decimal = Field(default=Decimal("0"), validation_alias=AliasChoices("sellingPrice", "selling_price"), serialization_alias="sellingPrice")
    total_amount: Decimal = Field(default=Decimal("0"), validation_alias=AliasChoices("totalAmount", "total_amount"), serialization_alias="totalAmount")


class OfficeInvoiceItemCreate(OfficeInvoiceItemBase):
    pass


class OfficeInvoiceItem(OfficeInvoiceItemBase, ORMModel):
    id: int
    invoice_id: int = Field(validation_alias=AliasChoices("invoiceId", "invoice_id"), serialization_alias="invoiceId")


class OfficeInvoiceBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    invoice_no: Optional[str] = Field(default=None, validation_alias=AliasChoices("invoiceNo", "invoice_no"), serialization_alias="invoiceNo")
    office_name: str = Field(default="مكتب الملك", validation_alias=AliasChoices("officeName", "office_name"), serialization_alias="officeName")
    customer_id: Optional[int] = Field(default=None, validation_alias=AliasChoices("customerId", "customer_id"), serialization_alias="customerId")
    customer_name: Optional[str] = Field(default=None, validation_alias=AliasChoices("customerName", "customer_name"), serialization_alias="customerName")
    customer_phone: Optional[str] = Field(default=None, validation_alias=AliasChoices("customerPhone", "customer_phone"), serialization_alias="customerPhone")
    payment_method: str = Field(default="cash", validation_alias=AliasChoices("paymentMethod", "payment_method"), serialization_alias="paymentMethod")
    total_amount: Decimal = Field(default=Decimal("0"), validation_alias=AliasChoices("totalAmount", "total_amount"), serialization_alias="totalAmount")
    paid_amount: Decimal = Field(default=Decimal("0"), validation_alias=AliasChoices("paidAmount", "paid_amount"), serialization_alias="paidAmount")
    is_paid: bool = Field(default=False, validation_alias=AliasChoices("isPaid", "is_paid"), serialization_alias="isPaid")
    notes: Optional[str] = Field(default=None, validation_alias=AliasChoices("notes",), serialization_alias="notes")

    @field_validator("customer_phone", mode="before")
    @classmethod
    def _norm_invoice_customer_phone(cls, v):
        if v is None:
            return None
        s = str(v).strip()
        if not s:
            return None
        return normalize_iraq_mobile(s, required=False)


class OfficeInvoiceCreate(OfficeInvoiceBase):
    items: List[OfficeInvoiceItemCreate] = Field(default_factory=list, validation_alias=AliasChoices("items",), serialization_alias="items")


class OfficeInvoiceUpdatePayment(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    paid_amount: Decimal = Field(default=Decimal("0"), validation_alias=AliasChoices("paidAmount", "paid_amount"), serialization_alias="paidAmount")


class OfficeInvoice(OfficeInvoiceBase, ORMModel):
    id: int
    date: Optional[datetime] = None
    items: List[OfficeInvoiceItem] = []


class OfficePaymentBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    customer_id: Optional[int] = Field(default=None, validation_alias=AliasChoices("customerId", "customer_id"), serialization_alias="customerId")
    installment_id: Optional[int] = Field(default=None, validation_alias=AliasChoices("installmentId", "installment_id"), serialization_alias="installmentId")
    amount: Decimal = Field(default=Decimal("0"), validation_alias=AliasChoices("amount",), serialization_alias="amount")
    description: Optional[str] = Field(default=None, validation_alias=AliasChoices("description",), serialization_alias="description")


class OfficePaymentCreate(OfficePaymentBase):
    pass


class OfficePayment(OfficePaymentBase, ORMModel):
    id: int
    date: Optional[datetime] = None


class OfficeInstallmentBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    customer_id: int = Field(validation_alias=AliasChoices("customerId", "customer_id"), serialization_alias="customerId")
    sale_id: Optional[int] = Field(default=None, validation_alias=AliasChoices("saleId", "sale_id"), serialization_alias="saleId")
    installment_index: int = Field(default=1, validation_alias=AliasChoices("installmentIndex", "installment_index"), serialization_alias="installmentIndex")
    due_date: Optional[date] = Field(default=None, validation_alias=AliasChoices("dueDate", "due_date"), serialization_alias="dueDate")
    amount: Decimal = Field(default=Decimal("0"), validation_alias=AliasChoices("amount",), serialization_alias="amount")
    paid_amount: Decimal = Field(default=Decimal("0"), validation_alias=AliasChoices("paidAmount", "paid_amount"), serialization_alias="paidAmount")
    paid_date: Optional[datetime] = Field(default=None, validation_alias=AliasChoices("paidDate", "paid_date"), serialization_alias="paidDate")
    is_paid: bool = Field(default=False, validation_alias=AliasChoices("isPaid", "is_paid"), serialization_alias="isPaid")


class OfficeInstallment(OfficeInstallmentBase, ORMModel):
    id: int


class OfficePayDebtRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    amount: Decimal = Field(default=Decimal("0"), validation_alias=AliasChoices("amount",), serialization_alias="amount")
    description: Optional[str] = Field(default=None, validation_alias=AliasChoices("description",), serialization_alias="description")


class OfficePayInstallmentRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    amount: Optional[Decimal] = Field(default=None, validation_alias=AliasChoices("amount",), serialization_alias="amount")
    description: Optional[str] = Field(default=None, validation_alias=AliasChoices("description",), serialization_alias="description")


class OfficeCartItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    material_id: int = Field(validation_alias=AliasChoices("materialId", "material_id"), serialization_alias="materialId")
    quantity: int = Field(default=1, validation_alias=AliasChoices("quantity",), serialization_alias="quantity")


class OfficeCartSaleCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    items: List[OfficeCartItem] = Field(default_factory=list, validation_alias=AliasChoices("items",), serialization_alias="items")
    payment_method: str = Field(default="cash", validation_alias=AliasChoices("paymentMethod", "payment_method"), serialization_alias="paymentMethod")
    customer_id: Optional[int] = Field(default=None, validation_alias=AliasChoices("customerId", "customer_id"), serialization_alias="customerId")
    customer_name: Optional[str] = Field(default=None, validation_alias=AliasChoices("customerName", "customer_name"), serialization_alias="customerName")
    customer_phone: Optional[str] = Field(default=None, validation_alias=AliasChoices("customerPhone", "customer_phone"), serialization_alias="customerPhone")
    purchase_date: Optional[date] = Field(default=None, validation_alias=AliasChoices("purchaseDate", "purchase_date"), serialization_alias="purchaseDate")
    commission_percent: Optional[Decimal] = Field(default=None, validation_alias=AliasChoices("commissionPercent", "commission_percent"), serialization_alias="commissionPercent")
    installments_months: Optional[int] = Field(default=None, validation_alias=AliasChoices("installmentsMonths", "installments_months"), serialization_alias="installmentsMonths")

    @field_validator("customer_phone", mode="before")
    @classmethod
    def _norm_cart_customer_phone(cls, v):
        if v is None:
            return None
        s = str(v).strip()
        if not s:
            return None
        return normalize_iraq_mobile(s, required=False)


# Ensure all forward refs are resolved (Pydantic v2)
OfficeInvoiceItemCreate.model_rebuild()
OfficeInvoiceItem.model_rebuild()
OfficeInvoiceCreate.model_rebuild()
OfficeInvoice.model_rebuild()
OfficeCartItem.model_rebuild()
OfficeCartSaleCreate.model_rebuild()
OfficeInstallment.model_rebuild()
