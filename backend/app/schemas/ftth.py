from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal, Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator, model_validator


class FtthPortalSetup(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    login_url: str = Field(
        default="",
        max_length=2048,
        description="رابط تسجيل الدخول؛ يمكن تركه فارغاً في وضع ftth_iq_admin (يُضبط تلقائياً)",
    )
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)
    list_url: Optional[str] = Field(
        default=None,
        description="رابط قائمة المشتركين؛ استخدم {page} لرقم الصفحة أو &page= للترقيم",
    )
    parse_mode: str = Field(
        default="json_generic",
        description="json_generic | html_table | demo | ftth_iq_admin (admin.ftth.iq عبر API)",
    )
    parse_options: Optional[dict[str, Any]] = None

    @model_validator(mode="after")
    def login_url_required_for_non_ftth_modes(self):
        mode = (self.parse_mode or "json_generic").lower()
        lu = (self.login_url or "").strip()
        if mode in ("demo", "ftth_iq_admin"):
            return self
        if len(lu) < 4:
            raise ValueError(
                "رابط تسجيل الدخول (login_url) مطلوب لهذا الوضع (4 أحرف على الأقل)"
            )
        return self


class FtthPortalLogoutBody(BaseModel):
    """تسجيل خروج من البوابة: حذف الاعتمادات المحفوظة؛ اختياري مسح الجدول الوسيط."""

    model_config = ConfigDict(populate_by_name=True)

    clear_staged_data: bool = Field(
        default=True,
        validation_alias=AliasChoices("clear_staged_data", "clearStagedData"),
        description="إذا true يُفرّغ جدول ftth_external_data",
    )


class FtthPortalStatusOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    configured: bool
    login_url: Optional[str] = None
    list_url: Optional[str] = None
    parse_mode: Optional[str] = None
    last_sync_at: Optional[datetime] = None
    last_sync_new: int = 0
    last_sync_updated: int = 0
    last_sync_error: Optional[str] = None
    setup_message: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("setup_message", "setupMessage"),
        description="رسالة آخر تحقق ناجح (تُملأ عند الإعداد أحياناً)",
    )


class FtthExternalRowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    external_id: str
    external_customer_id: Optional[str] = Field(
        default=None,
        description="نفس external_id — يُملأ من الخادم للتوافق مع تسمية المزامنة",
    )
    national_name: Optional[str] = None
    full_name: Optional[str] = Field(
        default=None,
        description="نفس national_name",
    )
    phone: Optional[str] = None
    secondary_phone: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("secondary_phone", "secondaryPhone"),
    )
    email: Optional[str] = None
    customer_type: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("customer_type", "customerType"),
    )
    zone: Optional[str] = None
    fat: Optional[str] = None
    fdt: Optional[str] = None
    bundle: Optional[str] = None
    location: Optional[str] = None
    address: Optional[str] = None
    governorate: Optional[str] = None
    district: Optional[str] = None
    sub_district: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("sub_district", "subDistrict"),
    )
    neighborhood: Optional[str] = None
    street: Optional[str] = None
    house: Optional[str] = None
    gps_latitude: Optional[float] = Field(
        default=None,
        validation_alias=AliasChoices("gps_latitude", "gpsLatitude"),
    )
    gps_longitude: Optional[float] = Field(
        default=None,
        validation_alias=AliasChoices("gps_longitude", "gpsLongitude"),
    )
    service_username: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("service_username", "serviceUsername"),
    )
    onu_serial: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("onu_serial", "onuSerial"),
    )
    ip_address: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("ip_address", "ipAddress"),
    )
    mac_address: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("mac_address", "macAddress"),
    )
    has_active_session: Optional[bool] = Field(
        default=None,
        validation_alias=AliasChoices("has_active_session", "hasActiveSession"),
    )
    active_session_started_at: Optional[datetime] = Field(
        default=None,
        validation_alias=AliasChoices("active_session_started_at", "activeSessionStartedAt"),
    )
    usr_referral_code: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("usr_referral_code", "usrReferralCode"),
    )
    partner_name: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("partner_name", "partnerName"),
    )
    is_pending: Optional[bool] = Field(
        default=None,
        validation_alias=AliasChoices("is_pending", "isPending"),
    )
    is_trial: Optional[bool] = Field(
        default=None,
        validation_alias=AliasChoices("is_trial", "isTrial"),
    )
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    subscription_start_date: Optional[date] = Field(
        default=None,
        validation_alias=AliasChoices("subscription_start_date", "subscriptionStartDate"),
        description="مرادف لـ start_date",
    )
    subscription_end_date: Optional[date] = Field(
        default=None,
        validation_alias=AliasChoices("subscription_end_date", "subscriptionEndDate"),
        description="مرادف لـ end_date",
    )
    remaining_days: Optional[int] = None
    status: Optional[str] = None
    imported_subscriber_id: Optional[int] = None
    synced_at: Optional[datetime] = None

    @field_validator("gps_latitude", "gps_longitude", mode="before")
    @classmethod
    def _coerce_gps_float(cls, v: Any) -> Any:
        if v is None:
            return None
        try:
            return float(v)
        except (TypeError, ValueError):
            return v

    resolved_subscription_date: Optional[date] = Field(
        default=None,
        validation_alias=AliasChoices(
            "resolved_subscription_date",
            "resolvedSubscriptionDate",
        ),
        description="معاينة: تاريخ الاشتراك بعد قاعدة −30/+30 (مرجع الانتهاء من المزامنة)",
    )
    resolved_expiration_date: Optional[date] = Field(
        default=None,
        validation_alias=AliasChoices(
            "resolved_expiration_date",
            "resolvedExpirationDate",
        ),
        description="معاينة: تاريخ الانتهاء المقترَح للترحيل",
    )
    commitment_days: Optional[int] = Field(
        default=None,
        validation_alias=AliasChoices("commitment_days", "commitmentDays"),
        description="مدة الالتزام بالأيام من FTTH (شهر=30، …)",
    )
    commitment_period: Optional[int] = Field(
        default=None,
        validation_alias=AliasChoices("commitment_period", "commitmentPeriod"),
        description="مدة الالتزام من الاشتراك (أيام) كعدد صحيح",
    )
    commitment_label: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("commitment_label", "commitmentLabel"),
        description="نص مدة الالتزام من المصدر إن وُجد",
    )
    calculated_subscription_date: Optional[date] = Field(
        default=None,
        validation_alias=AliasChoices(
            "calculated_subscription_date",
            "calculatedSubscriptionDate",
        ),
        description="تاريخ الاشتراك بعد الحساب من الخادم (مرادف لـ start_date في الوسيط)",
    )
    last_synced_at: Optional[datetime] = Field(
        default=None,
        validation_alias=AliasChoices("last_synced_at", "lastSyncedAt"),
        description="آخر مزامنة للسجل (مرادف لـ synced_at)",
    )
    data_source: Optional[Literal["database", "live"]] = Field(
        default=None,
        validation_alias=AliasChoices("data_source", "dataSource"),
        description="مصدر الصف: قاعدة محلية أو جلب مباشر من بوابة FTTH",
    )


class FtthSyncResult(BaseModel):
    new_count: int
    updated_count: int
    pages_fetched: int = 0
    message: str
    fetched_customers_count: int | None = None
    built_records_count: int | None = None
    attempted_db_saves_count: int | None = None
    successful_db_saves_count: int | None = None
    failed_db_saves_count: int | None = None


class FtthImportFieldsFromFtth(BaseModel):
    """أي حقول تُملأ من بيانات FTTH المستوردة عند الترحيل."""

    model_config = ConfigDict(populate_by_name=True)

    phone: bool = Field(default=True, validation_alias=AliasChoices("phone", "applyPhone"))
    zone: bool = Field(default=True, validation_alias=AliasChoices("zone", "applyZone"))
    fat: bool = Field(default=True, validation_alias=AliasChoices("fat", "applyFat"))
    location: bool = Field(default=True, validation_alias=AliasChoices("location", "applyLocation"))
    national_id_name: bool = Field(
        default=True,
        validation_alias=AliasChoices("national_id_name", "nationalIdName", "applyNationalIdName"),
    )
    subscription_dates: bool = Field(
        default=True,
        validation_alias=AliasChoices("subscription_dates", "subscriptionDates", "applySubscriptionDates"),
    )
    ftth_date_anchor: Literal["expiration", "start"] = Field(
        default="expiration",
        validation_alias=AliasChoices("ftth_date_anchor", "ftthDateAnchor", "dateAnchor"),
        description=(
            "expiration: أولوية لتاريخ الانتهاء من FTTH ثم اشتراك = انتهاء − 30 يوم. "
            "start: أولوية لتاريخ البداية ثم انتهاء = بداية + 30 يوم."
        ),
    )
    subscriber_status: bool = Field(
        default=True,
        validation_alias=AliasChoices("subscriber_status", "subscriberStatus", "applyStatus"),
        description="عند تفعيل تواريخ الاشتراك تُحسب الحالة من تاريخ الانتهاء (نشط/منتهي)",
    )
    service_username_in_description: bool = Field(
        default=True,
        validation_alias=AliasChoices(
            "service_username_in_description",
            "serviceUsernameInDescription",
            "applyServiceUsernameNote",
        ),
        description="ذكر مستخدم الخدمة في وصف سجل التاريخ",
    )


class FtthImportToSubscriberBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    ftth_row_id: int = Field(..., validation_alias=AliasChoices("ftth_row_id", "ftthRowId"))
    real_name: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("real_name", "realName"),
        description="الاسم الحقيقي (اختياري). اسم FTTH يُرحَّل إلى «الاسم في الوطني»؛ اتركه فارغاً ليُكمل لاحقاً من تعديل المشترك",
    )
    phone: Optional[str] = None
    zone: Optional[str] = None
    fat: Optional[str] = None
    location: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("location", "locationSummary"),
        description="عنوان / موقع المشترك",
    )
    category: Optional[str] = None
    category_price: Optional[Decimal] = Field(
        default=None, validation_alias=AliasChoices("category_price", "categoryPrice")
    )
    subscription_date_override: Optional[date] = Field(
        default=None,
        validation_alias=AliasChoices(
            "subscription_date_override",
            "subscriptionDateOverride",
        ),
        description="تعديل يدوي لتاريخ الاشتراك عند الترحيل (اختياري)",
    )
    expiration_date_override: Optional[date] = Field(
        default=None,
        validation_alias=AliasChoices(
            "expiration_date_override",
            "expirationDateOverride",
        ),
        description="تعديل يدوي لتاريخ الانتهاء عند الترحيل (اختياري)",
    )
    subscription_span_days: Optional[int] = Field(
        default=None,
        ge=1,
        le=3660,
        validation_alias=AliasChoices(
            "subscription_span_days",
            "subscriptionSpanDays",
        ),
        description="عند إدخال تاريخ اشتراك أو انتهاء واحد فقط: الفترة التقويمية بالأيام (افتراضي 30)",
    )
    update_existing: bool = Field(
        default=True, validation_alias=AliasChoices("update_existing", "updateExisting")
    )
    fields_from_ftth: Optional[FtthImportFieldsFromFtth] = Field(
        default=None,
        validation_alias=AliasChoices("fields_from_ftth", "fieldsFromFtth"),
        description="إن وُضعت: تُطبَّق فقط الحقول المحددة من جدول FTTH؛ وإلا يُرحَّل كل ما يتوفر",
    )


class FtthImportAllPendingBody(BaseModel):
    """ترحيل دفعة من السجلات غير المُرحَّلة بعد المزامنة."""

    model_config = ConfigDict(populate_by_name=True)

    limit: int = Field(default=300, ge=1, le=2000, description="أقصى عدد سجلات في هذه الدفعة")
    fields_from_ftth: Optional[FtthImportFieldsFromFtth] = Field(
        default=None,
        validation_alias=AliasChoices("fields_from_ftth", "fieldsFromFtth"),
    )


class FtthImportAllPendingResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    imported: int = 0
    failed: int = 0
    errors: list[dict[str, Any]] = Field(default_factory=list)


class FtthImportedSubscriberLinkOut(BaseModel):
    """حالة ربط المشترك المحلي بسجل FTTH الوسيط ورابط admin.ftth.iq إن وُجد.

    دائماً HTTP 200 عند تسجيل الدخول: غياب الربط يُعبّأ بـ linked=false وليس 404،
    حتى لا يُخلط بين «لا يوجد ربط اختياري» و«خطأ في الطلب».
    """

    model_config = ConfigDict(populate_by_name=True)

    linked: bool = Field(
        ...,
        description="True إذا وُجد صف FtthExternalData يشير إلى هذا المشترك وله external_id",
    )
    external_id: str | None = Field(
        None,
        serialization_alias="externalId",
        description="معرّف FTTH الخارجي عند وجود ربط",
    )
    detail_url: str | None = Field(
        None,
        serialization_alias="detailUrl",
        description="مثال: https://admin.ftth.iq/customer-details/{id}/details/view",
    )


class FtthPortalCustomerRowOut(BaseModel):
    """صف من جدول ftth_customers (عرض محلي منظّف بعد المزامنة)."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int = Field(..., description="معرّف السجل في ftth_customers")
    external_customer_id: str
    full_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = Field(
        default=None,
        description="عنوان/موقع من تفاصيل العميل أو الاشتراك",
    )
    zone: Optional[str] = None
    fat: Optional[str] = None
    fdt: Optional[str] = None
    bundle: Optional[str] = None
    subscription_status: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("subscription_status", "subscriptionStatus"),
    )
    subscription_start_date: Optional[datetime] = Field(
        default=None,
        validation_alias=AliasChoices("subscription_start_date", "subscriptionStartDate"),
    )
    subscription_end_date: Optional[datetime] = Field(
        default=None,
        validation_alias=AliasChoices("subscription_end_date", "subscriptionEndDate"),
    )
    onu_username: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("onu_username", "onuUsername"),
    )
    onu_serial: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("onu_serial", "onuSerial"),
    )
    import_status: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("import_status", "importStatus"),
    )
    last_synced_at: Optional[datetime] = Field(
        default=None,
        validation_alias=AliasChoices("last_synced_at", "lastSyncedAt"),
    )
    subscriber_id: Optional[int] = Field(
        default=None,
        validation_alias=AliasChoices("subscriber_id", "subscriberId"),
    )
    staging_row_id: Optional[int] = Field(
        default=None,
        validation_alias=AliasChoices("staging_row_id", "stagingRowId", "ftth_external_data_id"),
        description="معرف صف ftth_external_data للترحيل (import-to-subscriber)",
    )
    raw_payload: Optional[dict] = None
