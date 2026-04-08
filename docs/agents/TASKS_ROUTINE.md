# قوالب المهام اليومية — Task Templates

> كل مهمة تُعرَّف بـ: الحدث المحفِّز → المهارة المسؤولة → الخطوات → الملفات المعنية → التحقق

---

## التصنيف

| الفئة | التكرار | الأولوية |
|---|---|---|
| مهام المشتركين | يومي | عالية |
| مهام المزامنة | يومي / مجدولة | عالية |
| مهام المبيعات | عند الطلب | متوسطة |
| مهام مالية | يومي / أسبوعي | متوسطة |
| مهام الصيانة | أسبوعي / شهري | منخفضة |

---

## مهام المشتركين

### TK-SUB-01: تجديد اشتراك مشترك

```
الحدث:    انتهى اشتراك مشترك أو دفع قسط تجديد
المهارة:  SubscriberManagementSkill
```

**الخطوات:**
1. `GET /api/subscribers/{id}` — تحقق من الوضع الحالي
2. `PUT /api/subscribers/{id}` — تحديث `expiration_date` + `status`
3. `POST /api/subscribers/{id}/history` — تسجيل عملية التجديد
4. إذا كان هناك دفع: `POST /api/wallet/transactions` — تسجيل في المحفظة
5. إذا كان مرتبطاً بـ Telegram: إرسال إشعار تأكيد

**الملفات:**
- `backend/app/routers/subscribers.py`
- `src/modules/internet/api/subscribers.api.ts`
- `src/shared/utils/subscriptionDates.ts`

**التحقق:** `GET /api/subscribers/{id}` → `expiration_date` تحدّث + `subscriber_history` يحتوي سجلاً جديداً

---

### TK-SUB-02: إضافة مشترك جديد

```
الحدث:    عميل جديد يطلب خدمة إنترنت
المهارة:  SubscriberManagementSkill
```

**الخطوات:**
1. تجهيز البيانات: `user_code`, `real_name`, `phone`, `zone`, `fat`, `category`
2. `POST /api/subscribers` — إنشاء المشترك
3. تحديد `subscription_date` + `expiration_date`
4. إضافة `category_price` من `subscription_categories`
5. ربط بـ Telegram إذا أعطى المشترك chat_id

**الملفات:**
- `backend/app/routers/subscribers.py`
- `backend/app/routers/internet_meta.py` (للمناطق والفئات)

**التحقق:** `GET /api/subscribers?user_code=XX` → يعيد المشترك الجديد

---

### TK-SUB-03: تسجيل دين على مشترك

```
الحدث:    مشترك لم يدفع قسطاً
المهارة:  SubscriberManagementSkill
```

**الخطوات:**
1. `POST /api/subscribers/{id}/debt-entries` — تسجيل دين جديد
2. `backend/app/modules/internet/services/subscriber_debt_service.py` يُحدِّث `subscribers.debt`
3. إرسال تذكير عبر Telegram (اختياري)

**التحقق:** `GET /api/subscribers/{id}` → `debt` زاد بالمبلغ المسجَّل

---

### TK-SUB-04: استيراد مشتركين من CSV/Excel

```
الحدث:    ترحيل بيانات من نظام قديم أو إضافة جماعية
المهارة:  SubscriberManagementSkill
```

**الخطوات:**
1. تجهيز ملف CSV بالأعمدة المطلوبة
2. `POST /api/subscribers/import` — رفع الملف
3. مراجعة تقرير النتائج (نجح / فشل / مكرر)

**الملفات:**
- `src/modules/internet/api/subscribers-import-export.api.ts`
- `backend/app/routers/subscribers.py:import_subscribers()`

**التحقق:** عدد المشتركين قبل وبعد

---

## مهام المزامنة

### TK-FTTH-01: مزامنة يدوية مع بوابة FTTH

```
الحدث:    طلب تحديث فوري لبيانات العملاء من admin.ftth.iq
المهارة:  FTTHSyncSkill
```

**الخطوات:**
1. تأكد من صحة بيانات الدخول: `GET /api/ftth/portal/config`
2. `POST /api/ftth/portal/sync` — تشغيل المزامنة
3. انتظر الاستجابة أو راقب `ftth_sync_runs`

**الملفات:**
- `backend/app/integrations/ftth/engine.py`
- `backend/app/integrations/ftth/ftth_iq_api.py`

**التحقق:**
```sql
SELECT status, total_external_new, total_external_updated, error_message
FROM ftth_sync_runs ORDER BY started_at DESC LIMIT 1;
```

---

### TK-FTTH-02: إعادة إدخال بيانات دخول FTTH

```
الحدث:    تغيّر SECRET_KEY أو بيانات دخول بوابة FTTH
المهارة:  FTTHSyncSkill
```

**الخطوات:**
1. `POST /api/ftth/portal/setup` — body: `{ username, password, login_url }`
2. `POST /api/ftth/portal/sync` — اختبار الاتصال

**تحذير:** إذا تغيّر `SECRET_KEY` بدون إعادة الإدخال، ستفشل جميع عمليات المزامنة بـ `Fernet token invalid`

---

## مهام المبيعات

### TK-OFFICE-01: تسجيل بيع في المكتب

```
الحدث:    عملية بيع نقدية أو آجلة
المهارة:  OfficeSalesSkill
```

**الخطوات:**
1. `GET /api/materials` — تحقق من الكمية المتاحة
2. `POST /api/office/sales` — تسجيل البيع
3. إذا تقسيط: أضف `installments_months` — ينشئ أقساطاً تلقائياً
4. طباعة فاتورة (اختياري): `printUtils.ts`

**التحقق:** `GET /api/materials/{id}` → `quantity` نقص، `GET /api/office/sales` → يحتوي البيع الجديد

---

### TK-OFFICE-02: تحصيل قسط

```
الحدث:    عميل يدفع قسطاً مستحقاً
المهارة:  OfficeSalesSkill
```

**الخطوات:**
1. `GET /api/office/installments?customer_id=X` — استعراض الأقساط المستحقة
2. `PUT /api/office/installments/{id}` — تسجيل الدفع
3. `GET /api/office/customers/{id}` — تحقق من تحديث الدين

**التحقق:** `installments.is_paid=True` + `customers.debt` نقص

---

## مهام مالية

### TK-FIN-01: إضافة مصروف

```
الحدث:    دفع إيجار، فاتورة، أو مصروف تشغيلي
المهارة:  FinancialSkill
```

**الخطوات:**
1. `POST /api/expenses` — body: `{ amount, category, description, date }`

**التحقق:** `GET /api/expenses` → المصروف موجود في القائمة

---

### TK-FIN-02: مراجعة رصيد المحفظة

```
الحدث:    مراجعة يومية أو قبل شراء كروت
المهارة:  FinancialSkill
```

**الخطوات:**
1. `GET /api/wallet/balance` — الرصيد الحالي لكل نوع محفظة
2. مقارنة مع `system_settings.wallet_alert_threshold`

---

### TK-FIN-03: توزيع أرباح على شريك

```
الحدث:    نهاية الشهر أو الفترة المحاسبية
المهارة:  PartnersSkill
```

**الخطوات:**
1. `GET /api/reports/financial?period=...` — الإيرادات والمصروفات
2. حساب: `net_profit = revenue - expenses`
3. `POST /api/partners/{id}/transactions` — `partner_share = net_profit * percentage`

**التحقق:** `GET /api/partners/{id}/transactions` → السجل الجديد موجود

---

## مهام الصيانة

### TK-MAINT-01: نسخ احتياطي يدوي

```
الحدث:    قبل أي تحديث كبير أو أسبوعياً
المهارة:  SettingsSkill
```

**الخطوات:**
1. `POST /api/backup/create` — ينفذ pg_dump
2. تأكد من وجود الملف في `backup_storage_path`

---

### TK-MAINT-02: مراجعة سجل المراجعة

```
الحدث:    شبهة بنشاط غير مصرح به أو مراجعة دورية
المهارة:  AuditSkill
```

**الخطوات:**
1. `GET /api/audit-logs?date_from=...&date_to=...` — فلترة بالفترة
2. مراجعة `http_method` + `path` + `user_email`

---

### TK-MAINT-03: إعادة تهيئة قاعدة البيانات على جهاز جديد

```
الحدث:    ترحيل إلى خادم جديد
المهارة:  DatabaseSkill
```

**الخطوات:**
1. نسخ `backend/.env` مع `DATABASE_URL` الجديد
2. `cd backend && python scripts/bootstrap_db.py`
3. `python -m uvicorn app.main:app` — يطبق schema تلقائياً
4. `POST /api/ftth/portal/setup` — إعادة إدخال بيانات FTTH

**التحقق:** `GET /health` → `{ status: ok, database: connected }`

---

## خريطة المهارات-المهام

```
SubscriberManagementSkill ← TK-SUB-01, TK-SUB-02, TK-SUB-03, TK-SUB-04
FTTHSyncSkill             ← TK-FTTH-01, TK-FTTH-02
OfficeSalesSkill          ← TK-OFFICE-01, TK-OFFICE-02
FinancialSkill            ← TK-FIN-01, TK-FIN-02
PartnersSkill             ← TK-FIN-03
SettingsSkill             ← TK-MAINT-01
AuditSkill                ← TK-MAINT-02
DatabaseSkill             ← TK-MAINT-03
```
