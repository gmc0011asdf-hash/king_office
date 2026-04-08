# بروتوكول التشخيص الذكي — Self-Diagnosis Protocol

> عند أي خطأ: اتبع هذا البروتوكول بالترتيب. لا تعدّل كوداً قبل تحديد المهارة المسؤولة.

---

## القاعدة الذهبية

```
خطأ → مهارة → ملف → سطر → إصلاح
```

لا تقرأ كل الكود. حدّد المهارة أولاً، ثم اقرأ ملفاتها فقط.

---

## الخطوة 0: جمع المعلومات

قبل أي شيء، اجمع:

```bash
# 1. سجلات Backend (آخر 50 سطر)
tail -50 backend/logs/app.log

# 2. رسالة الخطأ الكاملة (stack trace)
# من الطرفية أو من /api/... response body

# 3. الطلب الذي سبب الخطأ
# HTTP Method + Path + Body (إن وجد)

# 4. وقت الخطأ (للربط مع audit_logs)
```

---

## خريطة الأخطاء → المهارات

### أخطاء المصادقة (401, 403)

| الخطأ | المهارة | الملف | الإجراء |
|---|---|---|---|
| `401 Not authenticated` | AuthSkill | `security.py` | تحقق من `SECRET_KEY` لم يتغير |
| `403 Forbidden` | AuthSkill | `dependencies.py` | تحقق من `user.permissions` في DB |
| `403 on Telegram endpoint` | NotificationsSkill | `deps.py` | `TELEGRAM_LINK_SECRET` غير متطابق |
| `Token expired` | AuthSkill | `security.py` | JWT exp=8h؛ المستخدم يحتاج إعادة تسجيل |

---

### أخطاء قاعدة البيانات (500, DB errors)

| الخطأ | المهارة | الملف | الإجراء |
|---|---|---|---|
| `UndefinedColumn: column X does not exist` | DatabaseSkill | `models.py` | `ALTER TABLE t ADD COLUMN IF NOT EXISTS x type` |
| `DuplicateTable` عند startup | DatabaseSkill | `database.py` | غير قاتل — `create_all(checkfirst=True)` يتجاوزه |
| `duplicate key value violates unique constraint "users_pkey"` | DatabaseSkill | `scripts/fix_users_id_sequence.py` | شغّل السكربت |
| `SSL connection required` | DatabaseSkill | `database.py:52` | `sslmode=require` لاتصالات non-localhost |
| `connection timeout` | DatabaseSkill | `database.py:48` | تحقق من `DATABASE_URL` وإعدادات شبكة Supabase |
| `could not connect to server` | DatabaseSkill | `config.py` | تحقق من `DATABASE_URL` في `backend/.env` |

---

### أخطاء FTTH (مزامنة)

| الخطأ | المهارة | الملف | الإجراء |
|---|---|---|---|
| `Fernet token invalid` أو `InvalidToken` | FTTHSyncSkill | `ftth_crypto.py` | `SECRET_KEY` تغيّر؛ `POST /api/ftth/portal/setup` |
| `fdt=null, fat=null` بعد sync | FTTHSyncSkill | `ftth_unified_sync.py` | ابحث في `deviceDetails` بـ batch addresses response |
| `UndefinedColumn` يوقف sync كاملاً | FTTHSyncSkill + DatabaseSkill | `ftth_external_data` جدول | `ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS` |
| `Session poisoned` بعد flush | FTTHSyncSkill | `ftth_unified_sync.py` | أصلح المخطط أولاً، أعد تشغيل السيرفر |
| `401 from admin.ftth.iq` | FTTHSyncSkill | `ftth_iq_api.py` | بيانات دخول FTTH منتهية أو خاطئة |
| `sync_runs.status = failed` | FTTHSyncSkill | `ftth_sync_runs` جدول | `SELECT error_message FROM ftth_sync_runs ORDER BY started_at DESC LIMIT 1` |

---

### أخطاء المشتركين

| الخطأ | المهارة | الملف | الإجراء |
|---|---|---|---|
| `debt` لا يتطابق مع السجلات | SubscriberManagementSkill | `subscriber_debt_service.py` | `reconcile()` لإعادة حساب المجموع |
| `expiration_date` خاطئ | SubscriberManagementSkill | `subscriptionDates.ts` + `ftth_dates.py` | راجع منطق الحساب |
| استيراد CSV يفشل | SubscriberManagementSkill | `subscribers_router.py:import_subscribers()` | تحقق من بنية الملف وترميز UTF-8 |
| `user_code` مكرر | SubscriberManagementSkill | `subscribers` جدول | `UNIQUE` على `user_code`؛ غيّر الكود |

---

### أخطاء المكتب والمبيعات

| الخطأ | المهارة | الملف | الإجراء |
|---|---|---|---|
| كمية مخزون سالبة | OfficeSalesSkill | `materials_router.py` | منطق validation مفقود قبل UPDATE |
| قسط لا ينعكس على دين العميل | OfficeSalesSkill | `office router` | تحقق من UPDATE لـ `office_customers.debt` |
| فاتورة لا تُطبع | OfficeSalesSkill | `printUtils.ts` | تحقق من browser print API وتنسيق البيانات |

---

### أخطاء عامة

| الخطأ | المهارة | الملف | الإجراء |
|---|---|---|---|
| `CORS error` في browser | - | `main.py:_CORS_*` | أضف origin الجديد للقوائم |
| `Rate limit exceeded` (429) | - | `core/rate_limit.py` | عدد الطلبات تجاوز الحد؛ انتظر أو اضبط الحد |
| `500 Internal Server Error` بلا تفاصيل | - | `core/exception_handlers.py` | راجع سجل `backend/logs/` |
| Sentry error captured | - | `main.py:sentry_sdk` | تحقق من Sentry dashboard إذا `SENTRY_DSN` مضبوط |

---

## بروتوكول التشخيص خطوة بخطوة

```
┌─────────────────────────────────────────────────────┐
│ 1. ما هو رمز HTTP؟                                  │
│    401/403 → AuthSkill                              │
│    500     → اقرأ stack trace                       │
│    422     → Pydantic validation → تحقق من الـ body │
│    404     → تحقق من router registration في main.py │
└─────────────────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────────────────┐
│ 2. ما هو الـ path؟                                  │
│    /api/ftth/*        → FTTHSyncSkill               │
│    /api/subscribers/* → SubscriberManagementSkill   │
│    /api/office/*      → OfficeSalesSkill            │
│    /api/wallet/*      → FinancialSkill              │
│    /api/telegram/*    → NotificationsSkill          │
│    /api/cards/*       → CardsSkill                  │
│    /api/expenses/*    → FinancialSkill              │
│    /api/partners/*    → PartnersSkill               │
│    /api/settings/*    → SettingsSkill               │
│    /api/audit-logs/*  → AuditSkill                  │
│    /health            → DatabaseSkill               │
└─────────────────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────────────────┐
│ 3. اقرأ ملفات المهارة فقط (من SKILLS_MAP.md)       │
│    لا تقرأ ملفات خارج نطاق المهارة                 │
└─────────────────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────────────────┐
│ 4. هل الخطأ في:                                     │
│    DB schema  → ALTER TABLE + إعادة تشغيل           │
│    Logic      → أصلح الدالة المحددة                │
│    Config     → تحقق من .env                        │
│    Data       → استعلام SQL مباشر للتحقق           │
└─────────────────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────────────────┐
│ 5. تحقق بدليل قبل الإعلان عن الحل                  │
│    لا تكتب "يجب أن يعمل الآن" بدون اختبار          │
└─────────────────────────────────────────────────────┘
```

---

## استعلامات التشخيص السريع

```sql
-- آخر sync run وحالته
SELECT id, status, started_at, error_message,
       total_external_new, total_external_updated
FROM ftth_sync_runs ORDER BY started_at DESC LIMIT 5;

-- مشتركون تنتهي اشتراكاتهم خلال 7 أيام
SELECT user_code, real_name, expiration_date, status
FROM subscribers
WHERE expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
ORDER BY expiration_date;

-- أكبر الديون
SELECT user_code, real_name, debt
FROM subscribers WHERE debt > 0 ORDER BY debt DESC LIMIT 10;

-- آخر 20 سجل في audit_logs
SELECT user_email, http_method, path, status_code, created_at
FROM audit_logs ORDER BY created_at DESC LIMIT 20;

-- تحقق من وجود عمود في جدول
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'ftth_external_data'
ORDER BY ordinal_position;

-- رصيد المحفظة
SELECT wallet_type,
       SUM(CASE WHEN type='credit' THEN amount ELSE 0 END) -
       SUM(CASE WHEN type='debit' THEN amount ELSE 0 END) AS balance
FROM wallet_transactions GROUP BY wallet_type;
```

---

## قائمة تحقق ما قبل الإصلاح

```
□ قرأت stack trace كاملاً
□ حددت المهارة المسؤولة
□ قرأت ملفات المهارة فقط (لا غيرها)
□ فهمت السبب الجذري (root cause)
□ الإصلاح لا يمس ملفات خارج نطاق المهارة
□ اختبرت الإصلاح بدليل (طلب API أو استعلام SQL)
□ لم أغير SECRET_KEY
□ لم أحذف جداول من DB مباشرة
```

---

## حالات الطوارئ

### السيرفر لا يبدأ
```bash
# 1. تحقق من DATABASE_URL
python -c "import os; print(os.environ.get('DATABASE_URL', 'NOT SET'))"

# 2. تحقق من schema bootstrap
cd backend && python scripts/bootstrap_db.py

# 3. تحقق من السجلات
tail -100 backend/logs/app.log
```

### بيانات FTTH تبدو قديمة
```bash
# 1. تحقق من آخر sync
SELECT * FROM ftth_sync_runs ORDER BY started_at DESC LIMIT 1;

# 2. أعد تشغيل sync يدوياً
POST /api/ftth/portal/sync

# 3. إذا فشل: تحقق من بيانات الدخول
GET /api/ftth/portal/config
```

### مستخدم لا يستطيع تسجيل الدخول
```bash
# 1. تحقق من وجوده في DB
SELECT id, email, status, role FROM users WHERE email = 'xxx';

# 2. إذا status = 'inactive': فعّله
UPDATE users SET status = 'active' WHERE email = 'xxx';

# 3. إذا requires_password_change = true: سيُعاد توجيهه لصفحة تغيير كلمة المرور
```
