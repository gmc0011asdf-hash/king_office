# قاموس المهارات — Skills Registry

> كل مهارة تمثل وحدة عمل مستقلة. لكل مهارة: نطاق ملفاتها، منطقها، ونقطة فشلها.

---

## 1. AuthSkill — المصادقة وإدارة المستخدمين

**الوصف:** إدارة دورة حياة المستخدمين، تسجيل الدخول، الصلاحيات، وإعادة تعيين كلمة المرور.

**نطاق الملفات:**
```
Backend:
  backend/app/core/security.py          — توليد JWT والتحقق منه
  backend/app/core/dependencies.py      — حقن get_current_user / require_admin
  backend/app/modules/auth/routers/     — login_router.py, users_router.py
  backend/app/routers/auth.py           — نقاط نهاية API
  backend/app/routers/users.py

Frontend:
  src/modules/auth/api/                 — auth.api.ts, users.api.ts
  src/pages/Login.tsx
  src/pages/ForceChangePassword.tsx
  src/shared/permissions/permissions.ts
  src/shared/utils/authStorage.ts
```

**المنطق:**
```
Input:  email + password
Process: bcrypt.verify → JWT.encode(user_id, role, permissions, exp=8h)
Output: { access_token, token_type }

Input:  Bearer token في كل طلب
Process: JWT.decode → تحقق من انتهاء الصلاحية → تحميل User من DB
Output: models.User أو 401
```

**نقطة الفشل:**
- خطأ 401 مستمر → `security.py`: تحقق من `SECRET_KEY` لم يتغير
- خطأ صلاحية غير متوقع → `permissions.ts`: تحقق من بنية JSON في `users.permissions`
- `duplicate key on users.id` → شغّل `backend/scripts/fix_users_id_sequence.py`

---

## 2. DatabaseSkill — اتصال وترحيل قاعدة البيانات

**الوصف:** إدارة اتصال PostgreSQL، تهيئة المخطط، وترحيل Alembic.

**نطاق الملفات:**
```
Backend:
  backend/app/core/database.py          — engine, SessionLocal, get_db
  backend/app/core/config.py            — قراءة DATABASE_URL من البيئة
  backend/app/core/db_bootstrap.py      — schema_idempotent.sql عبر psycopg2
  backend/app/models/models.py          — جميع ORM models
  backend/alembic/                      — ملفات ترحيل Alembic
  backend/scripts/bootstrap_db.py       — تهيئة أولية
```

**المنطق:**
```
Input:  DATABASE_URL من os.environ أو backend/.env
Process: create_engine → pool_pre_ping=True → SSL إذا كان خارج localhost
Output: engine + SessionLocal جاهزان

Schema Init:
  bootstrap_schema_nonfatal() → psycopg2 يطبق SQL مباشرة (idempotent)
  create_tables_safely()      → SQLAlchemy create_all(checkfirst=True)
```

**نقطة الفشل:**
- `ValueError: النظام يدعم PostgreSQL فقط` → `DATABASE_URL` غير مضبوط أو يبدأ بـ sqlite
- اتصال يتوقف → SSL أو `connect_timeout=10` في `database.py:44`
- `UndefinedColumn` أثناء sync → عمود مفقود في DB؛ طبّق `ALTER TABLE ADD COLUMN IF NOT EXISTS`
- `alembic_version` غائب → طبّق DDL مباشرة بـ psycopg2، لا تستخدم alembic upgrade

---

## 3. SubscriberManagementSkill — إدارة مشتركي الإنترنت

**الوصف:** دورة حياة المشتركين: إضافة، تجديد، تعليق، إدارة الديون، الاستيراد/التصدير.

**نطاق الملفات:**
```
Backend:
  backend/app/routers/subscribers.py         — CRUD الأساسي
  backend/app/routers/internet_meta.py       — المناطق، FAT، الفئات
  backend/app/routers/internet_phones.py     — دليل الهاتف
  backend/app/routers/wallet.py              — محفظة FTTH
  backend/app/modules/internet/services/subscriber_debt_service.py
  backend/app/schemas/internet.py

Frontend:
  src/modules/internet/page/InternetPage.tsx
  src/modules/internet/api/subscribers.api.ts
  src/modules/internet/api/wallet.api.ts
  src/modules/internet/api/meta.api.ts
  src/shared/utils/subscriptionDates.ts
  src/shared/utils/subscriberListMerge.ts
```

**المنطق:**
```
تجديد اشتراك:
  Input:  subscriber_id + months + amount
  Process: حساب expiration_date الجديد → تسجيل في subscriber_history
           → تحديث subscribers.debt إذا وجد → تحديث wallet_transactions
  Output: subscriber محدَّث + history entry

إدارة الديون:
  Input:  subscriber_id + debt_amount + description
  Process: INSERT subscriber_debt_entries → UPDATE subscribers.debt (aggregate)
  Output: debt_entry + رسالة Telegram اختياري
```

**نقطة الفشل:**
- تاريخ انتهاء خاطئ → `subscriptionDates.ts` + `ftth_dates.py`
- دين لا يتطابق مع السجلات → `subscriber_debt_service.py:reconcile()`
- استيراد CSV يفشل → `subscribers_router.py:import_subscribers()`

---

## 4. FTTHSyncSkill — مزامنة بوابة FTTH الخارجية

**الوصف:** جلب بيانات العملاء من admin.ftth.iq وكتابتها في `ftth_external_data` ثم `ftth_customers`.

**نطاق الملفات:**
```
Backend:
  backend/app/integrations/ftth/ftth_iq_api.py       — HTTP client لـ admin.ftth.iq
  backend/app/integrations/ftth/ftth_unified_sync.py  — منسق الدورة الكاملة
  backend/app/integrations/ftth/engine.py             — نقطة الدخول للمزامنة
  backend/app/integrations/ftth/ftth_dates.py         — حسابات التواريخ
  backend/app/core/ftth_crypto.py                     — تشفير/فك تشفير بيانات الدخول
  backend/app/routers/ftth_portal.py                  — POST /api/ftth/portal/sync
  backend/app/models/models.py → FtthPortalConfig, FtthExternalData, FtthCustomer

Frontend:
  src/modules/internet/page/FTTHPortal.tsx
  src/modules/internet/api/ftthPortal.api.ts
  src/modules/internet/page/InternetFtthCustomerPage.tsx
```

**المنطق:**
```
Input:  بيانات دخول Fernet-مشفرة في ftth_portal_config
Process:
  1. ftth_crypto.py يفك التشفير → username/password
  2. ftth_iq_api.py: POST /login → يحصل على session token
  3. GET /api/customers → قائمة كاملة (pagination)
  4. GET /api/addresses?accountIds=... → تفاصيل fdt/fat (batch)
  5. ftth_unified_sync.py: UPSERT في ftth_external_data (external_id UNIQUE)
  6. ftth_app_customer_sync.py: إسقاط على ftth_customers
  7. تسجيل FtthSyncRun + FtthSyncRunItem
Output: { new: N, updated: M, failed: K }
```

**نقطة الفشل:**
- `Fernet token invalid` → `SECRET_KEY` تغيّر؛ أعد إدخال بيانات الدخول عبر `POST /api/ftth/portal/setup`
- `fdt/fat = null` بعد sync → ابحث في `ftth_unified_sync.py`: `deviceDetails` في استجابة addresses
- `UndefinedColumn` يوقف session → عمود مفقود في `ftth_external_data`؛ طبّق ALTER TABLE
- `db.flush()` يفشل → يدمّر SQLAlchemy session كاملاً؛ أصلح المخطط أولاً

---

## 5. OfficeSalesSkill — مبيعات وفواتير المكتب

**الوصف:** إدارة مخزون المكتب، المبيعات، الفواتير، الأقساط، وديون العملاء.

**نطاق الملفات:**
```
Backend:
  backend/app/routers/materials.py           — office_materials CRUD
  backend/app/modules/office/routers/materials_router.py
  backend/app/models/models.py → OfficeMaterial, OfficeCustomer, OfficeSale,
                                  OfficeInvoice, OfficeInvoiceItem,
                                  OfficePayment, OfficeInstallment

Frontend:
  src/modules/office/page/OfficePage.tsx
  src/modules/office/page/components/
    ├── CustomersTab.tsx        — إدارة العملاء
    ├── DebtsTab.tsx            — متابعة الديون
    ├── InventoryTab.tsx        — المخزون
    ├── InvoicesTab.tsx         — الفواتير
    ├── QuickSaleTab.tsx        — بيع سريع
    ├── ReportsTab.tsx          — تقارير المكتب
    └── modals/                 — نوافذ الإضافة/التعديل
  src/modules/office/api/office.api.ts
  src/modules/office/api/materials.api.ts
```

**المنطق:**
```
بيع سريع:
  Input:  material_id + quantity + customer_id (اختياري) + payment_method
  Process: SELECT office_materials WHERE id → تحقق الكمية ≥ quantity
           → INSERT office_sales → UPDATE office_materials.quantity -= quantity
           → إذا تقسيط: INSERT office_installments (index 1..N) + UPDATE customer.debt
  Output: sale_id + invoice اختياري

دفع قسط:
  Input:  installment_id + paid_amount
  Process: UPDATE office_installments.paid_amount += paid_amount
           → إذا paid_amount >= amount: is_paid=True, paid_date=now()
           → UPDATE office_customers.debt -= paid_amount
           → INSERT office_payments
  Output: installment محدَّث + customer.debt محدَّث
```

**نقطة الفشل:**
- كمية سالبة في المخزون → `materials_router.py`: تحقق من validation قبل UPDATE
- قسط لا ينعكس على دين العميل → `office_customers.debt` لا يتحدث تلقائياً؛ تحقق من trigger أو منطق router
- فاتورة لا تُطبع → `src/modules/office/page/components/utils/printUtils.ts`

---

## 6. FinancialSkill — المحفظة والمصروفات

**الوصف:** تتبع المحفظة المالية (FTTH / عام)، تسجيل المصروفات، والكاش باك.

**نطاق الملفات:**
```
Backend:
  backend/app/routers/wallet.py              — WalletTransaction CRUD
  backend/app/routers/expenses.py            — Expense CRUD
  backend/app/models/models.py → WalletTransaction, Expense, CashbackHistory

Frontend:
  src/modules/expenses/page/ExpensesPage.tsx
  src/modules/expenses/api/expenses.api.ts
  src/api/wallet.ts
  src/api/expenses.ts
```

**المنطق:**
```
Input:  type (credit/debit) + amount + wallet_type (ftth/general) + description
Process: INSERT wallet_transactions → تحقق من threshold في system_settings
         → إذا balance < wallet_alert_threshold: إشعار تحذير
Output: transaction_id + current_balance
```

**نقطة الفشل:**
- رصيد يظهر خاطئاً → `wallet_router.py`: الرصيد يُحسب بـ SUM(amount) WHERE type='credit' - SUM WHERE type='debit'
- تنبيه عتبة لا يُرسل → `system_settings.wallet_alert_threshold` + منطق الإشعار في `notifications_router.py`

---

## 7. CardsSkill — مخزون الكروت

**الوصف:** إدارة شراء وبيع كروت الإنترنت، محفظة الكروت.

**نطاق الملفات:**
```
Backend:
  backend/app/routers/cards.py
  backend/app/modules/cards/routers/cards_router.py
  backend/app/models/models.py → CardPurchase, CardSale, CardWalletTransaction

Frontend:
  src/modules/cards/page/CardsPage.tsx
  src/modules/cards/api/cards.api.ts
```

**المنطق:**
```
شراء كروت:
  Input:  quantity + purchase_price + selling_price
  Process: INSERT card_purchases → INSERT card_wallet_transactions(type='purchase')
  Output: card_purchase_id + updated stock count

بيع كروت:
  Input:  quantity + selling_price
  Process: تحقق stock ≥ quantity → INSERT card_sales → حساب profit
           → INSERT card_wallet_transactions(type='sale') + balance_after
  Output: card_sale_id + profit
```

**نقطة الفشل:**
- مخزون يصبح سالباً → `cards_router.py`: تحقق من validation
- `cards_threshold` تنبيه لا يعمل → `system_settings.cards_threshold` في Settings

---

## 8. SimCardsSkill — بطاقات SIM

**الوصف:** إدارة مخزون شرائح SIM، باقات التعبئة، والمبيعات.

**نطاق الملفات:**
```
Backend:
  backend/app/routers/sim_cards.py
  backend/app/models/models.py → SimPackage, SimNumber, SimSale, SimInventoryTransaction

Frontend:
  src/modules/sim-cards/page/SimCardsPage.tsx
  src/modules/sim-cards/api/simcards.api.ts
```

**المنطق:**
```
Input:  sim_number + package_id + selling_price
Process: SELECT sim_numbers WHERE status='available'
         → UPDATE sim_numbers.status='sold' + sold_date=now()
         → INSERT sim_sales → INSERT sim_inventory_transactions
Output: sale_id + profit
```

**نقطة الفشل:**
- رقم SIM يُباع مرتين → `sim_numbers.status` لم يتحدث؛ تحقق من transaction isolation
- خطأ foreign key → `package_id` غير موجود في `sim_packages`

---

## 9. PartnersSkill — الشركاء والموردون

**الوصف:** إدارة الشركاء (توزيع الأرباح) والموردين (الديون والمعاملات).

**نطاق الملفات:**
```
Backend:
  backend/app/routers/partners.py
  backend/app/routers/suppliers.py
  backend/app/modules/partners_suppliers/routers/partners_router.py
  backend/app/modules/partners_suppliers/routers/suppliers_router.py
  backend/app/models/models.py → Partner, PartnerTransaction, Supplier, SupplierTransaction

Frontend:
  src/modules/partners_suppliers/page/PartnersSuppliersPage.tsx
  src/modules/partners_suppliers/api/partners.api.ts
  src/modules/partners_suppliers/api/suppliers.api.ts
```

**المنطق:**
```
توزيع أرباح شريك:
  Input:  partner_id + revenue + expenses + period
  Process: net_profit = revenue - expenses
           partner_share = net_profit * (partner.percentage / 100)
           → INSERT partner_transactions
  Output: transaction_id + partner_share

دفع لمورد:
  Input:  supplier_id + amount + type (payment/purchase)
  Process: INSERT supplier_transactions
           → إذا type='payment': UPDATE suppliers.outstanding_debt -= amount
           → إذا type='purchase': UPDATE suppliers.outstanding_debt += amount
  Output: transaction_id + updated debt
```

**نقطة الفشل:**
- نسبة شريك خاطئة → `partners.percentage` في DB؛ تحقق بـ SELECT
- دين مورد لا يتحدث → منطق UPDATE في `suppliers_router.py`

---

## 10. ReportsSkill — التقارير والإحصاءات

**الوصف:** توليد تقارير مالية وتشغيلية عبر استعلامات مجمَّعة.

**نطاق الملفات:**
```
Backend:
  backend/app/routers/internet_reports.py
  backend/app/modules/internet/routers/reports_router.py

Frontend:
  src/modules/reports/page/ReportsPage.tsx
  src/modules/internet/api/reports.api.ts
  src/api/internetReports.ts
```

**المنطق:**
```
Input:  date_range + report_type (financial/subscribers/cards/office)
Process: SQL aggregation queries → JSON response
Output: structured report data للعرض أو التصدير
```

**نقطة الفشل:**
- أرقام خاطئة → SQL query في `reports_router.py`؛ راجع JOIN conditions
- تقرير بطيء → غياب INDEX على date columns؛ أضف EXPLAIN ANALYZE

---

## 11. NotificationsSkill — إشعارات Telegram

**الوصف:** إرسال إشعارات للمشتركين والمدير عبر Telegram bot.

**نطاق الملفات:**
```
Backend:
  backend/app/routers/notifications.py
  backend/app/modules/telegram/router.py      — link/unlink/status
  backend/app/modules/telegram/service.py     — (مُفرَّغ للأمان)
  backend/app/modules/telegram/repository.py  — DB queries للمشتركين
  backend/app/modules/telegram/schemas.py
  backend/app/modules/telegram/deps.py        — TELEGRAM_LINK_SECRET

Frontend:
  src/modules/settings/api/notifications.api.ts
  src/api/notifications.ts
```

**المنطق:**
```
ربط مشترك بـ Telegram:
  Input:  telegram_chat_id + user_code (أو phone)
  Process: find_subscriber_for_link() → UPDATE subscribers.telegram_chat_id
  Output: TelegramLinkSuccess | TelegramLinkFailure

إرسال إشعار:
  Input:  subscriber_ids[] + message_template + variables
  Process: Telegram Bot API → sendMessage لكل chat_id
  Output: { sent: N, failed: M }
```

**نقطة الفشل:**
- ربط يفشل بـ 403 → `TELEGRAM_LINK_SECRET` غير متطابق بين n8n والسيرفر
- إشعار لا يصل → `subscribers.telegram_chat_id` فارغ؛ تحقق من الربط أولاً
- `service.py` فارغ → المنطق يحتاج إعادة كتابة قبل تشغيل هذه المهارة

---

## 12. SettingsSkill — الإعدادات والنسخ الاحتياطي

**الوصف:** إعدادات النظام، العتبات التحذيرية، والنسخ الاحتياطي المجدول.

**نطاق الملفات:**
```
Backend:
  backend/app/modules/settings/routers/settings_router.py
  backend/app/modules/settings/routers/backup_router.py
  backend/app/routers/settings.py
  backend/app/routers/backup.py
  backend/app/core/backup_scheduler.py
  backend/app/core/backup_service.py
  backend/app/models/models.py → SystemSettings

Frontend:
  src/modules/settings/page/SettingsPage.tsx
  src/modules/settings/api/settings.api.ts
  src/modules/settings/api/backup.api.ts
```

**المنطق:**
```
نسخ احتياطي مجدول:
  Input:  backup_schedule (none/daily/weekly/monthly) + time + path
  Process: APScheduler يضبط job → backup_service.py ينفذ pg_dump
           → يحفظ في backup_storage_path
  Output: ملف .dump + سجل في system_settings.backup_last_scheduled_at
```

**نقطة الفشل:**
- نسخ احتياطي لا يعمل → `backup_scheduler.py` + تحقق APScheduler job مسجّل
- `pg_dump` يفشل → `DATABASE_URL` في بيئة السيرفر، أو صلاحيات المستخدم

---

## 13. AuditSkill — سجل المراجعة والنشاط

**الوصف:** تسجيل جميع طلبات POST/PUT/PATCH/DELETE تلقائياً، وسجل نشاط الواجهة.

**نطاق الملفات:**
```
Backend:
  backend/app/core/audit_middleware.py       — middleware يلتقط كل طلب معدِّل
  backend/app/routers/audit.py               — GET /api/audit-logs
  backend/app/routers/activity_log.py        — GET/POST /api/activity-log
  backend/app/models/models.py → AuditLog, ActivityLog

Frontend:
  src/modules/settings/api/activityLog.api.ts
  src/api/activityLog.ts
```

**المنطق:**
```
Input:  أي HTTP request (POST/PUT/PATCH/DELETE)
Process: AuditMiddleware يستقبل الطلب → يستخرج user_id + email + path + payload_summary
         → INSERT audit_logs بعد اكتمال الاستجابة (async)
Output: audit_log entry مع status_code
```

**نقطة الفشل:**
- سجلات مفقودة → `AuditMiddleware` غير مسجَّل في `main.py` (تحقق من ترتيب middleware)
- payload_summary طويل جداً → اقتطاع في `audit_middleware.py`
