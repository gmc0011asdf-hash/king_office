from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.aliases import AliasChoices

from app.schemas.base import ORMModel


class InternetZoneBase(BaseModel):
    name: str


class InternetZoneCreate(InternetZoneBase):
    pass


class InternetZoneUpdate(BaseModel):
    name: Optional[str] = None


class InternetZone(InternetZoneBase, ORMModel):
    id: int
    created_at: Optional[datetime] = None


class InternetFatBase(BaseModel):
    zone_id: int
    name: str
    coordinates: Optional[str] = None


class InternetFatCreate(InternetFatBase):
    pass


class InternetFatUpdate(BaseModel):
    zone_id: Optional[int] = None
    name: Optional[str] = None
    coordinates: Optional[str] = None


class InternetFat(InternetFatBase, ORMModel):
    id: int
    created_at: Optional[datetime] = None


class SubscriptionCategoryBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    name: str
    price: Decimal = Decimal("0")
    subscription_type: Optional[str] = Field(default="ftth", validation_alias=AliasChoices("subscriptionType", "subscription_type"), serialization_alias="subscriptionType")
    cost_price: Optional[Decimal] = Field(default=None, validation_alias=AliasChoices("costPrice", "cost_price"), serialization_alias="costPrice")


class SubscriptionCategoryCreate(SubscriptionCategoryBase):
    pass


class SubscriptionCategoryUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    name: Optional[str] = None
    price: Optional[Decimal] = None
    subscription_type: Optional[str] = Field(default=None, validation_alias=AliasChoices("subscriptionType", "subscription_type"))
    cost_price: Optional[Decimal] = Field(default=None, validation_alias=AliasChoices("costPrice", "cost_price"))


class SubscriptionCategory(SubscriptionCategoryBase, ORMModel):
    id: int
    created_at: Optional[datetime] = None


class InternetMaterialBase(BaseModel):
    name: str
    purchase_price: Decimal = Decimal("0")
    selling_price: Decimal = Decimal("0")
    quantity: int = 0


class InternetMaterialCreate(InternetMaterialBase):
    pass


class InternetMaterialUpdate(BaseModel):
    name: Optional[str] = None
    purchase_price: Optional[Decimal] = None
    selling_price: Optional[Decimal] = None
    quantity: Optional[int] = None


class InternetMaterial(InternetMaterialBase, ORMModel):
    id: int
    created_at: Optional[datetime] = None


class InternetMaterialSaleBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    material_id: Optional[int] = Field(
        default=None,
        validation_alias=AliasChoices("materialId", "material_id"),
        serialization_alias="materialId",
    )
    material_name: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("materialName", "material_name"),
        serialization_alias="materialName",
    )
    quantity: int = Field(default=1, validation_alias=AliasChoices("quantity",), serialization_alias="quantity")
    purchase_price: Decimal = Field(
        default=Decimal("0"),
        validation_alias=AliasChoices("purchasePrice", "purchase_price"),
        serialization_alias="purchasePrice",
    )
    selling_price: Decimal = Field(
        default=Decimal("0"),
        validation_alias=AliasChoices("sellingPrice", "selling_price"),
        serialization_alias="sellingPrice",
    )
    total_amount: Decimal = Field(
        default=Decimal("0"),
        validation_alias=AliasChoices("totalAmount", "total_amount"),
        serialization_alias="totalAmount",
    )
    profit: Decimal = Field(
        default=Decimal("0"),
        validation_alias=AliasChoices("profit",),
        serialization_alias="profit",
    )
    payment_method: str = Field(
        default="cash",
        validation_alias=AliasChoices("paymentMethod", "payment_method"),
        serialization_alias="paymentMethod",
    )
    subscriber_name: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("subscriberName", "subscriber_name"),
        serialization_alias="subscriberName",
    )


class InternetMaterialSaleCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    material_id: Optional[int] = Field(default=None, validation_alias=AliasChoices("materialId", "material_id"))
    subscriber_id: Optional[int] = Field(default=None, validation_alias=AliasChoices("subscriberId", "subscriber_id"))
    quantity: int = Field(default=1, validation_alias=AliasChoices("quantity",))
    payment_method: str = Field(default="cash", validation_alias=AliasChoices("paymentMethod", "payment_method"))
    subscriber_name: Optional[str] = Field(default=None, validation_alias=AliasChoices("subscriberName", "subscriber_name"))


class InternetMaterialSale(InternetMaterialSaleBase, ORMModel):
    id: int
    date: Optional[datetime] = None


class SubscriberHistoryBase(BaseModel):
    subscriber_id: int
    type: Optional[str] = None
    amount: Decimal = Decimal("0")
    description: Optional[str] = None


class SubscriberHistoryCreate(SubscriberHistoryBase):
    pass


class SubscriberHistory(SubscriberHistoryBase, ORMModel):
    id: int
    date: Optional[datetime] = None


class CashbackHistoryBase(BaseModel):
    amount: Decimal = Decimal("0")
    description: Optional[str] = None


class CashbackHistoryCreate(CashbackHistoryBase):
    pass


class CashbackHistory(CashbackHistoryBase, ORMModel):
    id: int
    date: Optional[datetime] = None


class SubscriberBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_code: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("userCode", "user_code"),
        serialization_alias="userCode",
    )
    real_name: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("realName", "real_name"),
        serialization_alias="realName",
    )
    national_id_name: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("nationalIdName", "national_id_name"),
        serialization_alias="nationalIdName",
    )
    phone: Optional[str] = Field(default=None, validation_alias=AliasChoices("phone",), serialization_alias="phone")
    zone: Optional[str] = Field(default=None, validation_alias=AliasChoices("zone",), serialization_alias="zone")
    fat: Optional[str] = Field(default=None, validation_alias=AliasChoices("fat",), serialization_alias="fat")
    zone_id: Optional[int] = Field(
        default=None,
        validation_alias=AliasChoices("zoneId", "zone_id"),
        serialization_alias="zoneId",
    )
    fat_id: Optional[int] = Field(
        default=None,
        validation_alias=AliasChoices("fatId", "fat_id"),
        serialization_alias="fatId",
    )
    category: Optional[str] = Field(default=None, validation_alias=AliasChoices("category",), serialization_alias="category")
    # DB column nullable — ORM may yield None; must not fail response validation
    category_price: Optional[Decimal] = Field(
        default=None,
        validation_alias=AliasChoices("categoryPrice", "category_price"),
        serialization_alias="categoryPrice",
    )
    subscription_type: Optional[str] = Field(
        default="ftth",
        validation_alias=AliasChoices("subscriptionType", "subscription_type"),
        serialization_alias="subscriptionType",
    )
    debt: Decimal = Field(default=Decimal("0"), validation_alias=AliasChoices("debt",), serialization_alias="debt")
    subscription_date: Optional[date] = Field(
        default=None,
        validation_alias=AliasChoices("subscriptionDate", "subscription_date"),
        serialization_alias="subscriptionDate",
    )
    expiration_date: Optional[date] = Field(
        default=None,
        validation_alias=AliasChoices("expirationDate", "expiration_date"),
        serialization_alias="expirationDate",
    )
    status: Optional[str] = Field(default=None, validation_alias=AliasChoices("status",), serialization_alias="status")
    location: Optional[str] = Field(default=None, validation_alias=AliasChoices("location",), serialization_alias="location")
    last_renewal_date: Optional[date] = Field(
        default=None,
        validation_alias=AliasChoices("lastRenewalDate", "last_renewal_date"),
        serialization_alias="lastRenewalDate",
    )
    renewal_months: Optional[int] = Field(
        default=None,
        validation_alias=AliasChoices("renewalMonths", "renewal_months"),
        serialization_alias="renewalMonths",
    )

    @field_validator("phone", mode="before")
    @classmethod
    def _normalize_subscriber_phone(cls, v):
        from app.core.iraq_phone import normalize_iraq_mobile

        if v is None:
            return None
        s = str(v).strip()
        if not s:
            return None
        return normalize_iraq_mobile(s, required=False)


class SubscriberCreate(SubscriberBase):
    activation_payment_method: Optional[str] = Field(
        default="cash",
        validation_alias=AliasChoices("activationPaymentMethod", "activation_payment_method"),
        serialization_alias="activationPaymentMethod",
    )
    pass


class SubscriberUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    real_name: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("realName", "real_name"),
        serialization_alias="realName",
    )
    national_id_name: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("nationalIdName", "national_id_name"),
        serialization_alias="nationalIdName",
    )
    phone: Optional[str] = Field(default=None, validation_alias=AliasChoices("phone",), serialization_alias="phone")
    zone: Optional[str] = Field(default=None, validation_alias=AliasChoices("zone",), serialization_alias="zone")
    fat: Optional[str] = Field(default=None, validation_alias=AliasChoices("fat",), serialization_alias="fat")
    zone_id: Optional[int] = Field(
        default=None,
        validation_alias=AliasChoices("zoneId", "zone_id"),
        serialization_alias="zoneId",
    )
    fat_id: Optional[int] = Field(
        default=None,
        validation_alias=AliasChoices("fatId", "fat_id"),
        serialization_alias="fatId",
    )
    category: Optional[str] = Field(default=None, validation_alias=AliasChoices("category",), serialization_alias="category")
    category_price: Optional[Decimal] = Field(
        default=None,
        validation_alias=AliasChoices("categoryPrice", "category_price"),
        serialization_alias="categoryPrice",
    )
    subscription_type: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("subscriptionType", "subscription_type"),
        serialization_alias="subscriptionType",
    )
    debt: Optional[Decimal] = Field(default=None, validation_alias=AliasChoices("debt",), serialization_alias="debt")
    subscription_date: Optional[date] = Field(
        default=None,
        validation_alias=AliasChoices("subscriptionDate", "subscription_date"),
        serialization_alias="subscriptionDate",
    )
    expiration_date: Optional[date] = Field(
        default=None,
        validation_alias=AliasChoices("expirationDate", "expiration_date"),
        serialization_alias="expirationDate",
    )
    status: Optional[str] = Field(default=None, validation_alias=AliasChoices("status",), serialization_alias="status")
    location: Optional[str] = Field(default=None, validation_alias=AliasChoices("location",), serialization_alias="location")
    last_renewal_date: Optional[date] = Field(
        default=None,
        validation_alias=AliasChoices("lastRenewalDate", "last_renewal_date"),
        serialization_alias="lastRenewalDate",
    )
    renewal_months: Optional[int] = Field(
        default=None,
        validation_alias=AliasChoices("renewalMonths", "renewal_months"),
        serialization_alias="renewalMonths",
    )

    @field_validator("phone", mode="before")
    @classmethod
    def _normalize_subscriber_phone_update(cls, v):
        from app.core.iraq_phone import normalize_iraq_mobile

        if v is None:
            return None
        s = str(v).strip()
        if not s:
            return None
        return normalize_iraq_mobile(s, required=False)


class Subscriber(SubscriberBase, ORMModel):
    id: int


class SubscriberRenewalRequest(BaseModel):
    subscriber_id: int
    months: int = 1
    amount_paid: Decimal = Decimal("0")
    payment_method: Optional[str] = "cash"
    notes: Optional[str] = None


class SubscriberDebtPaymentRequest(BaseModel):
    amount: Decimal
    payment_date: Optional[date] = Field(default=None, validation_alias=AliasChoices("paymentDate", "payment_date"))
    description: Optional[str] = None


class SubscriberDebtEntryCreate(BaseModel):
    """إضافة سطر دين تفصيلي جديد."""

    model_config = ConfigDict(populate_by_name=True)

    amount: Decimal = Field(..., validation_alias=AliasChoices("amount",), serialization_alias="amount")
    debt_date: date = Field(..., validation_alias=AliasChoices("debtDate", "debt_date"), serialization_alias="debtDate")
    description: str = Field(default="", validation_alias=AliasChoices("description",), serialization_alias="description")
    debt_scope: str = Field(
        default="current",
        validation_alias=AliasChoices("debtScope", "debt_scope"),
        serialization_alias="debtScope",
    )


class SubscriberDebtEntryMetaPatch(BaseModel):
    """تعديل تاريخ أو وصف سجل دين دون تغيير المبالغ."""

    model_config = ConfigDict(populate_by_name=True)

    debt_date: Optional[date] = Field(
        default=None,
        validation_alias=AliasChoices("debtDate", "debt_date"),
        serialization_alias="debtDate",
    )
    description: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("description",),
        serialization_alias="description",
    )


class DebtEntrySettleRequest(BaseModel):
    """تسديد جزئي أو كلي لسجل دين محدد — يُنشئ سجلاً في تاريخ السداد."""

    model_config = ConfigDict(populate_by_name=True)

    amount: Decimal = Field(..., gt=0, description="المبلغ المسدَّد (يجب أن يكون أكبر من صفر)")
    payment_date: date = Field(
        ...,
        validation_alias=AliasChoices("paymentDate", "payment_date"),
        serialization_alias="paymentDate",
    )
    description: str = Field(
        default="",
        validation_alias=AliasChoices("description",),
        serialization_alias="description",
    )


# ========= Internet Phones (Phone Directory) =========


class InternetPhoneBase(BaseModel):
    sequence: int = 0
    name: Optional[str] = None
    phone_number: str

    @field_validator("phone_number", mode="before")
    @classmethod
    def _normalize_directory_phone(cls, v):
        from app.core.iraq_phone import normalize_iraq_mobile

        return normalize_iraq_mobile(v, required=True)


class InternetPhoneCreate(InternetPhoneBase):
    pass


class InternetPhoneUpdate(BaseModel):
    sequence: Optional[int] = None
    name: Optional[str] = None
    phone_number: Optional[str] = None

    @field_validator("phone_number", mode="before")
    @classmethod
    def _normalize_directory_phone_update(cls, v):
        from app.core.iraq_phone import normalize_iraq_mobile

        if v is None:
            return None
        s = str(v).strip()
        if not s:
            return None
        return normalize_iraq_mobile(s, required=True)


class InternetPhone(InternetPhoneBase, ORMModel):
    id: int
