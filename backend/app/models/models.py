from sqlalchemy import BigInteger, Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, LargeBinary, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    role = Column(String(50), nullable=False, default="user")
    password = Column(String(255), nullable=False)
    recovery_email = Column(String(255), nullable=True)
    last_login = Column(DateTime, nullable=True)
    status = Column(String(50), nullable=False, default="active")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    permissions = Column(Text, nullable=True)
    reset_code = Column(String(128), nullable=True)
    reset_code_expiry = Column(DateTime, nullable=True)
    requires_password_change = Column(Boolean, nullable=False, default=False)


class SystemSettings(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True)
    wallet_alert_threshold = Column(Numeric(14, 2), nullable=False, default=50000)
    stock_alert_threshold = Column(Integer, nullable=False, default=5)
    earthlink_threshold = Column(Numeric(14, 2), nullable=False, default=50000)
    swig_threshold = Column(Numeric(14, 2), nullable=False, default=50000)
    qi_threshold = Column(Numeric(14, 2), nullable=False, default=50000)
    cards_threshold = Column(Integer, nullable=False, default=5)
    materials_threshold = Column(Integer, nullable=False, default=5)
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
    office_name = Column(String(255), nullable=True)
    office_phone = Column(String(20), nullable=True)
    office_address = Column(Text, nullable=True)
    cards_report_name = Column(String(255), nullable=True)
    backup_storage_path = Column(Text, nullable=True)
    backup_schedule = Column(String(20), nullable=False, server_default="none")
    backup_schedule_time = Column(String(8), nullable=False, server_default="02:00")
    backup_schedule_weekday = Column(Integer, nullable=True)
    backup_schedule_month_day = Column(Integer, nullable=True)
    backup_last_scheduled_at = Column(DateTime, nullable=True)


class WalletTransaction(Base):
    __tablename__ = "wallet_transactions"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String(50), nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)
    date = Column(DateTime, nullable=False, server_default=func.now())
    description = Column(Text, nullable=True)
    wallet_type = Column(String(50), nullable=True, default="ftth")


class InternetPhone(Base):
    __tablename__ = "internet_phones"

    id = Column(Integer, primary_key=True, index=True)
    sequence = Column(Integer, nullable=False, default=0)
    name = Column(String(255), nullable=True)
    phone_number = Column(String(100), unique=True, nullable=False, index=True)
    last_promo_msg_date = Column(DateTime, nullable=True)


class Subscriber(Base):
    __tablename__ = "subscribers"

    id = Column(BigInteger, primary_key=True, index=True)
    user_code = Column(String(100), unique=True, nullable=True, index=True)
    real_name = Column(String(255), nullable=True)
    national_id_name = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    zone = Column(String(100), nullable=True)
    fat = Column(String(100), nullable=True)
    zone_id = Column(Integer, ForeignKey("internet_zones.id", ondelete="SET NULL"), nullable=True, index=True)
    fat_id = Column(Integer, ForeignKey("internet_fats.id", ondelete="SET NULL"), nullable=True, index=True)
    category = Column(String(100), nullable=True)
    category_price = Column(Numeric(14, 2), nullable=True)
    subscription_type = Column(String(50), nullable=True, default="ftth")
    debt = Column(Numeric(14, 2), nullable=False, default=0)
    subscription_date = Column(Date, nullable=True)
    expiration_date = Column(Date, nullable=True)
    status = Column(String(50), nullable=True)
    location = Column(String(255), nullable=True)
    telegram_chat_id = Column(BigInteger, nullable=True, index=True)
    last_expiry_reminder_date = Column(DateTime, nullable=True)
    last_debt_reminder_date = Column(DateTime, nullable=True)
    last_debt_alert_sent = Column(DateTime, nullable=True)

    ftth_customer_link = relationship(
        "FtthCustomer",
        back_populates="subscriber",
        uselist=False,
    )

    zone_ref = relationship("InternetZone", foreign_keys=[zone_id])
    fat_ref = relationship("InternetFat", foreign_keys=[fat_id])



class SubscriberHistory(Base):
    __tablename__ = "subscriber_history"

    id = Column(Integer, primary_key=True, index=True)
    subscriber_id = Column(Integer, ForeignKey("subscribers.id", ondelete="CASCADE"), nullable=False)
    date = Column(DateTime, nullable=False, server_default=func.now())
    type = Column(String(100), nullable=True)
    amount = Column(Numeric(14, 2), nullable=False, default=0)
    description = Column(Text, nullable=True)


class SubscriberDebtEntry(Base):
    """تفاصيل ديون المشترك — مجموع remaining_amount يجب أن يطابق subscribers.debt."""

    __tablename__ = "subscriber_debt_entries"

    id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    subscriber_id = Column(BigInteger, ForeignKey("subscribers.id", ondelete="CASCADE"), nullable=False, index=True)
    amount = Column(Numeric(14, 2), nullable=False)
    remaining_amount = Column(Numeric(14, 2), nullable=False)
    debt_date = Column(Date, nullable=False)
    description = Column(Text, nullable=True)
    debt_scope = Column(String(20), nullable=False, default="current")  # current | previous
    entry_source = Column(String(50), nullable=False, default="manual")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)


class InternetZone(Base):
    __tablename__ = "internet_zones"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())


class InternetFat(Base):
    __tablename__ = "internet_fats"

    id = Column(Integer, primary_key=True, index=True)
    zone_id = Column(Integer, ForeignKey("internet_zones.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    coordinates = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())


class SubscriptionCategory(Base):
    __tablename__ = "subscription_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), unique=True, nullable=False)
    price = Column(Numeric(14, 2), nullable=False, default=0)
    subscription_type = Column(String(50), nullable=True, default="ftth")
    cost_price = Column(Numeric(14, 2), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())


class InternetMaterial(Base):
    __tablename__ = "internet_materials"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, nullable=False)
    purchase_price = Column(Numeric(14, 2), nullable=False, default=0)
    selling_price = Column(Numeric(14, 2), nullable=False, default=0)
    quantity = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, server_default=func.now())


class InternetMaterialSale(Base):
    __tablename__ = "internet_material_sales"

    id = Column(Integer, primary_key=True, index=True)
    material_id = Column(Integer, ForeignKey("internet_materials.id", ondelete="SET NULL"), nullable=True)
    date = Column(DateTime, nullable=False, server_default=func.now())
    material_name = Column(String(255), nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    purchase_price = Column(Numeric(14, 2), nullable=False, default=0)
    selling_price = Column(Numeric(14, 2), nullable=False, default=0)
    total_amount = Column(Numeric(14, 2), nullable=False, default=0)
    profit = Column(Numeric(14, 2), nullable=False, default=0)
    payment_method = Column(String(50), nullable=False, default="cash")
    subscriber_name = Column(String(255), nullable=True)


class OfficeMaterial(Base):
    """جدول office_materials — أسماء الأعمدة كما في PostgreSQL (name وليس material_name)."""

    __tablename__ = "office_materials"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    purchase_price = Column(Numeric(14, 2), nullable=False)
    selling_price = Column(Numeric(14, 2), nullable=False)
    quantity = Column(Integer, nullable=False, default=0)


class MessageTemplate(Base):
    __tablename__ = "message_templates"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    body = Column(Text, nullable=False, server_default="")
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class OfficeCustomer(Base):
    __tablename__ = "office_customers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    phone = Column(String(50), nullable=True)
    debt = Column(Numeric(14, 2), nullable=False, default=0)
    last_debt_reminder_date = Column(DateTime, nullable=True)


class OfficeCustomerHistory(Base):
    __tablename__ = "office_customer_history"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("office_customers.id", ondelete="CASCADE"), nullable=False)
    date = Column(DateTime, nullable=False, server_default=func.now())
    type = Column(String(100), nullable=True)
    amount = Column(Numeric(14, 2), nullable=False, default=0)
    description = Column(Text, nullable=True)


class OfficeSale(Base):
    __tablename__ = "office_sales"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(DateTime, nullable=False, server_default=func.now())
    total_amount = Column(Numeric(14, 2), nullable=False, default=0)
    profit = Column(Numeric(14, 2), nullable=False, default=0)
    payment_method = Column(String(50), nullable=True)
    customer_id = Column(Integer, ForeignKey("office_customers.id", ondelete="SET NULL"), nullable=True)
    material_id = Column(Integer, ForeignKey("office_materials.id", ondelete="SET NULL"), nullable=True)
    material_name = Column(String(255), nullable=True)
    quantity = Column(Integer, nullable=False, default=1)
    purchase_price = Column(Numeric(14, 2), nullable=False, default=0)
    selling_price = Column(Numeric(14, 2), nullable=False, default=0)
    customer_name = Column(String(255), nullable=True)
    customer_phone = Column(String(50), nullable=True)
    purchase_date = Column(Date, nullable=True)
    commission_percent = Column(Numeric(6, 2), nullable=True)
    total_with_commission = Column(Numeric(14, 2), nullable=True)
    installments_months = Column(Integer, nullable=True)
    monthly_installment = Column(Numeric(14, 2), nullable=True)


class OfficeInvoice(Base):
    __tablename__ = "office_invoices"

    id = Column(Integer, primary_key=True, index=True)
    invoice_no = Column(String(50), unique=True, nullable=True, index=True)
    office_name = Column(String(255), nullable=False, default="مكتب الملك")
    date = Column(DateTime, nullable=False, server_default=func.now())
    customer_id = Column(Integer, ForeignKey("office_customers.id", ondelete="SET NULL"), nullable=True, index=True)
    customer_name = Column(String(255), nullable=True)
    customer_phone = Column(String(50), nullable=True)
    payment_method = Column(String(50), nullable=False, default="cash")
    total_amount = Column(Numeric(14, 2), nullable=False, default=0)
    paid_amount = Column(Numeric(14, 2), nullable=False, default=0)
    is_paid = Column(Boolean, nullable=False, default=False)
    notes = Column(Text, nullable=True)


class OfficeInvoiceItem(Base):
    __tablename__ = "office_invoice_items"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("office_invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    material_id = Column(Integer, ForeignKey("office_materials.id", ondelete="SET NULL"), nullable=True)
    material_name = Column(String(255), nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    selling_price = Column(Numeric(14, 2), nullable=False, default=0)
    total_amount = Column(Numeric(14, 2), nullable=False, default=0)


class OfficePayment(Base):
    __tablename__ = "office_payments"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("office_customers.id", ondelete="SET NULL"), nullable=True, index=True)
    installment_id = Column(Integer, nullable=True)
    date = Column(DateTime, nullable=False, server_default=func.now())
    amount = Column(Numeric(14, 2), nullable=False, default=0)
    description = Column(Text, nullable=True)


class OfficeInstallment(Base):
    __tablename__ = "office_installments"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("office_customers.id", ondelete="CASCADE"), nullable=False, index=True)
    sale_id = Column(Integer, ForeignKey("office_sales.id", ondelete="SET NULL"), nullable=True)
    installment_index = Column(Integer, nullable=False, default=1)
    due_date = Column(Date, nullable=True)
    amount = Column(Numeric(14, 2), nullable=False, default=0)
    paid_amount = Column(Numeric(14, 2), nullable=False, default=0)
    paid_date = Column(DateTime, nullable=True)
    is_paid = Column(Boolean, nullable=False, default=False)


class Partner(Base):
    __tablename__ = "partners"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    join_date = Column(Date, nullable=True)
    percentage = Column(Numeric(6, 2), nullable=False, default=0)
    department = Column(String(100), nullable=True)


class PartnerTransaction(Base):
    __tablename__ = "partner_transactions"

    id = Column(Integer, primary_key=True, index=True)
    partner_id = Column(Integer, ForeignKey("partners.id", ondelete="CASCADE"), nullable=False)
    date = Column(DateTime, nullable=False, server_default=func.now())
    department = Column(String(100), nullable=True)
    revenue = Column(Numeric(14, 2), nullable=False, default=0)
    expenses = Column(Numeric(14, 2), nullable=False, default=0)
    net_profit = Column(Numeric(14, 2), nullable=False, default=0)
    partner_share = Column(Numeric(14, 2), nullable=False, default=0)


class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    specialty = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    outstanding_debt = Column(Numeric(14, 2), nullable=False, default=0)


class SupplierTransaction(Base):
    __tablename__ = "supplier_transactions"

    id = Column(Integer, primary_key=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False)
    date = Column(DateTime, nullable=False, server_default=func.now())
    type = Column(String(50), nullable=True)
    amount = Column(Numeric(14, 2), nullable=False, default=0)
    notes = Column(Text, nullable=True)


class CardWalletTransaction(Base):
    __tablename__ = "card_wallet_transactions"

    id = Column(Integer, primary_key=True, index=True)
    wallet_type = Column(String(50), nullable=True)
    type = Column(String(50), nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)
    commission = Column(Numeric(14, 2), nullable=False, default=0)
    total = Column(Numeric(14, 2), nullable=False, default=0)
    date = Column(DateTime, nullable=False, server_default=func.now())
    status = Column(String(100), nullable=True)
    description = Column(Text, nullable=True)
    balance_after = Column(Numeric(14, 2), nullable=True)


class CardPurchase(Base):
    __tablename__ = "card_purchases"

    id = Column(Integer, primary_key=True, index=True)
    quantity = Column(Integer, nullable=False)
    purchase_price = Column(Numeric(14, 2), nullable=False)
    selling_price = Column(Numeric(14, 2), nullable=True)
    total_amount = Column(Numeric(14, 2), nullable=False)
    date = Column(DateTime, nullable=False, server_default=func.now())


class CardSale(Base):
    __tablename__ = "card_sales"

    id = Column(Integer, primary_key=True, index=True)
    quantity = Column(Integer, nullable=False)
    selling_price = Column(Numeric(14, 2), nullable=False)
    total_amount = Column(Numeric(14, 2), nullable=False)
    profit = Column(Numeric(14, 2), nullable=False)
    date = Column(DateTime, nullable=False, server_default=func.now())


class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    amount = Column(Numeric(14, 2), nullable=False)
    category = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    date = Column(DateTime, nullable=False, server_default=func.now())


class CashbackHistory(Base):
    __tablename__ = "cashback_history"

    id = Column(Integer, primary_key=True, index=True)
    amount = Column(Numeric(14, 2), nullable=False)
    description = Column(Text, nullable=True)
    date = Column(DateTime, nullable=False, server_default=func.now())


class SimPackage(Base):
    __tablename__ = "sim_packages"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String(50), nullable=False)
    name = Column(String(255), nullable=False)
    topup_amount = Column(Numeric(14, 2), nullable=False, default=0)
    company_commission = Column(Numeric(14, 2), nullable=False, default=0)
    jb_return = Column(Numeric(14, 2), nullable=False, default=0)
    cost = Column(Numeric(14, 2), nullable=False, default=0)
    selling_price = Column(Numeric(14, 2), nullable=False, default=0)


class SimInventoryTransaction(Base):
    __tablename__ = "sim_inventory_transactions"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String(50), nullable=False)
    quantity = Column(Integer, nullable=False)
    action = Column(String(50), nullable=False)
    date = Column(DateTime, nullable=False, server_default=func.now())


class SimSale(Base):
    __tablename__ = "sim_sales"

    id = Column(Integer, primary_key=True, index=True)
    package_id = Column(Integer, ForeignKey("sim_packages.id", ondelete="SET NULL"), nullable=True)
    type = Column(String(50), nullable=False)
    date = Column(DateTime, nullable=False, server_default=func.now())
    selling_price = Column(Numeric(14, 2), nullable=False)
    cost = Column(Numeric(14, 2), nullable=False)
    profit = Column(Numeric(14, 2), nullable=False)
    company_commission = Column(Numeric(14, 2), nullable=False, default=0)
    jb_return = Column(Numeric(14, 2), nullable=False, default=0)
    sim_number_id = Column(Integer, ForeignKey("sim_numbers.id", ondelete="SET NULL"), nullable=True)


class SimNumber(Base):
    __tablename__ = "sim_numbers"

    id = Column(Integer, primary_key=True, index=True)
    number = Column(String(50), unique=True, nullable=False)
    type = Column(String(50), nullable=False)
    status = Column(String(50), nullable=False, default="available")
    sold_date = Column(DateTime, nullable=True)
    package_id = Column(Integer, ForeignKey("sim_packages.id", ondelete="SET NULL"), nullable=True)


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String(50), nullable=False, default="info")
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())


class ActivityLog(Base):
    __tablename__ = "activity_log"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    user_name = Column(String(255), nullable=True)
    section = Column(String(100), nullable=False)
    action = Column(String(100), nullable=False)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())


class AuditLog(Base):
    """سجل تدقيق للطلبات المعدِّلة (POST/PUT/PATCH/DELETE) — منفصل عن activity_log الواجهة."""

    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    user_email = Column(String(255), nullable=True)
    user_name = Column(String(255), nullable=True)
    http_method = Column(String(10), nullable=False)
    path = Column(String(2048), nullable=False)
    payload_summary = Column(Text, nullable=True)
    ip_address = Column(String(64), nullable=True)
    status_code = Column(Integer, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())


class FtthPortalConfig(Base):
    """إعدادات بوابة FTTH الخارجية — بيانات الدخول مشفّرة (Fernet + مفتاح مشتق من SECRET_KEY)."""

    __tablename__ = "ftth_portal_config"

    id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    login_url = Column(Text, nullable=False)
    list_url = Column(Text, nullable=True)
    username_enc = Column(LargeBinary, nullable=False)
    password_enc = Column(LargeBinary, nullable=False)
    parse_mode = Column(String(50), nullable=False, default="json_generic")
    parse_options = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    last_sync_at = Column(DateTime(timezone=True), nullable=True)
    last_sync_new = Column(Integer, nullable=False, default=0)
    last_sync_updated = Column(Integer, nullable=False, default=0)
    last_sync_error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class FtthExternalData(Base):
    """بيانات مشتركين مستوردة من لوحة FTTH الخارجية — منفصلة عن subscribers حتى الترحيل الاختياري."""

    __tablename__ = "ftth_external_data"

    id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    external_id = Column(String(255), unique=True, nullable=False, index=True)
    national_name = Column(String(500), nullable=True)
    phone = Column(String(100), nullable=True)
    secondary_phone = Column(String(100), nullable=True)
    email = Column(String(255), nullable=True)
    customer_type = Column(String(255), nullable=True)
    zone = Column(String(200), nullable=True)
    fat = Column(String(200), nullable=True)
    fdt = Column(String(200), nullable=True)
    bundle = Column(String(500), nullable=True)
    location = Column(Text, nullable=True)
    address = Column(Text, nullable=True)
    governorate = Column(String(200), nullable=True)
    district = Column(String(200), nullable=True)
    sub_district = Column(String(255), nullable=True)
    neighborhood = Column(String(200), nullable=True)
    street = Column(String(100), nullable=True)
    house = Column(String(100), nullable=True)
    gps_latitude = Column(Float, nullable=True)
    gps_longitude = Column(Float, nullable=True)
    service_username = Column(String(200), nullable=True)
    onu_serial = Column(String(200), nullable=True)
    ip_address = Column(String(100), nullable=True)
    mac_address = Column(String(100), nullable=True)
    has_active_session = Column(Boolean, nullable=True)
    active_session_started_at = Column(DateTime(timezone=True), nullable=True)
    usr_referral_code = Column(String(255), nullable=True)
    partner_name = Column(String(255), nullable=True)
    is_pending = Column(Boolean, nullable=True)
    is_trial = Column(Boolean, nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    commitment_days = Column(Integer, nullable=True)
    commitment_period = Column(Integer, nullable=True)
    commitment_label = Column(String(255), nullable=True)
    remaining_days = Column(Integer, nullable=True)
    status = Column(String(255), nullable=True)
    raw_payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    raw_customer_json = Column(JSONB, nullable=True)
    raw_detail_json = Column(JSONB, nullable=True)
    raw_subscription_json = Column(JSONB, nullable=True)
    imported_subscriber_id = Column(BigInteger, ForeignKey("subscribers.id", ondelete="SET NULL"), nullable=True, index=True)
    synced_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class FtthCustomer(Base):
    """عرض محلي منظّف لـ FTTH في قاعدة التطبيق الرئيسية — مرتبط اختياريًا بـ subscribers."""

    __tablename__ = "ftth_customers"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    external_customer_id = Column(String(255), unique=True, nullable=False, index=True)

    subscriber_id = Column(BigInteger, ForeignKey("subscribers.id", ondelete="SET NULL"), nullable=True, index=True)
    source_system = Column(String(64), nullable=False, server_default="ftth_portal")
    raw_payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    import_status = Column(String(64), nullable=True)
    sync_error = Column(Text, nullable=True)

    full_name = Column(Text, nullable=True)
    created_at_external = Column(DateTime(timezone=True), nullable=True)
    customer_type = Column(String(255), nullable=True)

    phone = Column(String(100), nullable=True)
    secondary_phone = Column(String(100), nullable=True)
    email = Column(String(255), nullable=True)

    address = Column(Text, nullable=True)
    governorate = Column(String(255), nullable=True)
    district = Column(String(255), nullable=True)
    sub_district = Column(String(255), nullable=True)
    gps_latitude = Column(Numeric(12, 8), nullable=True)
    gps_longitude = Column(Numeric(12, 8), nullable=True)

    subscription_status = Column(String(255), nullable=True)
    subscription_start_date = Column(DateTime(timezone=True), nullable=True)
    subscription_end_date = Column(DateTime(timezone=True), nullable=True)
    zone = Column(String(255), nullable=True)
    bundle = Column(String(500), nullable=True)
    commitment_period = Column(Text, nullable=True)

    onu_username = Column(String(255), nullable=True)
    onu_serial = Column(String(255), nullable=True)
    fdt = Column(String(255), nullable=True)
    fat = Column(String(255), nullable=True)
    ip_address = Column(String(100), nullable=True)
    mac_address = Column(String(100), nullable=True)
    has_active_session = Column(Boolean, nullable=True)
    active_session_started_at = Column(DateTime(timezone=True), nullable=True)

    phone_source = Column(String(100), nullable=True)
    address_source = Column(String(100), nullable=True)
    subscription_source = Column(String(100), nullable=True)

    raw_customer_json = Column(JSONB, nullable=True)
    raw_detail_json = Column(JSONB, nullable=True)
    raw_subscription_json = Column(JSONB, nullable=True)

    sync_status = Column(String(32), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=text("now()"), nullable=True)

    subscriber = relationship("Subscriber", back_populates="ftth_customer_link")


class FtthSyncRun(Base):
    __tablename__ = "ftth_sync_runs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    portal_config_id = Column(BigInteger, ForeignKey("ftth_portal_config.id", ondelete="SET NULL"), nullable=True, index=True)
    started_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    finished_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(32), nullable=False, default="running")
    total_external_new = Column(Integer, nullable=False, default=0)
    total_external_updated = Column(Integer, nullable=False, default=0)
    total_ftth_customers_upserted = Column(Integer, nullable=False, default=0)
    total_ftth_customers_failed = Column(Integer, nullable=False, default=0)
    error_message = Column(Text, nullable=True)

    items = relationship("FtthSyncRunItem", back_populates="sync_run", cascade="all, delete-orphan")


class FtthSyncRunItem(Base):
    __tablename__ = "ftth_sync_run_items"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    sync_run_id = Column(BigInteger, ForeignKey("ftth_sync_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    external_customer_id = Column(String(255), nullable=False, index=True)
    ftth_external_data_id = Column(BigInteger, ForeignKey("ftth_external_data.id", ondelete="SET NULL"), nullable=True, index=True)
    status = Column(String(32), nullable=False)
    error_message = Column(Text, nullable=True)

    sync_run = relationship("FtthSyncRun", back_populates="items")


class AutomationTelegramLink(Base):
    __tablename__ = "automation_telegram_links"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    telegram_chat_id = Column(Text, nullable=False, index=True)
    telegram_user_id = Column(BigInteger, nullable=True)
    telegram_username = Column(Text, nullable=True)
    telegram_first_name = Column(Text, nullable=True)
    telegram_last_name = Column(Text, nullable=True)
    phone = Column(Text, nullable=True)
    normalized_phone = Column(Text, nullable=True, index=True)
    source_type = Column(Text, nullable=True)
    source_table = Column(Text, nullable=True)
    source_id = Column(BigInteger, nullable=True)
    full_name = Column(Text, nullable=True)
    status = Column(Text, nullable=False, default="linked")
    active = Column(Boolean, nullable=False, default=True, index=True)
    last_start_at = Column(DateTime, nullable=True)
    last_seen_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class BroadcastQueue(Base):
    __tablename__ = "broadcast_queue"

    id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    recipient = Column(String(255), nullable=False, index=True)
    message = Column(Text, nullable=False)
    channel = Column(String(50), nullable=False, default="sms")  # sms, telegram, whatsapp_manual
    status = Column(String(20), nullable=False, default="pending", index=True)  # pending, sending, sent, failed
    payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    error_log = Column(Text, nullable=True)
    scheduled_at = Column(DateTime, nullable=True, index=True)
    sent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
