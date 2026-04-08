# ربط Telegram عبر n8n (king_office_new)

## الأمان

- **production:** عيّن `TELEGRAM_LINK_SECRET` في `backend/.env` (إلزامي مع `ENVIRONMENT=production`).
- أرسل في كل طلب: `X-Telegram-Link-Secret: <نفس_القيمة>`.
- **development:** إذا السر فارغ، يُسمح بدون هيدر (للتجربة فقط).

## نقاط النهاية

| الطريقة | المسار | الوصف |
|--------|--------|--------|
| POST | `/api/telegram/link` | ربط `telegram_chat_id` بمشترك |
| POST | `/api/telegram/start` | **نفس** منطق `/link` (مسمى لسير n8n بعد أمر `/start`) |
| POST | `/api/telegram/unlink` | فك الربط بـ `subscriber_id` **أو** `telegram_chat_id` (واحد فقط) |
| GET | `/api/telegram/status/{subscriber_id}` | حالة الربط الحالية |

## منطق البحث (في الـ backend فقط)

1. إن وُجد `user_code` غير فارغ بعد التطبيع: ابحث في `subscribers.user_code`.
2. إن **لم** يُعثر على مشترك **و** وُجد `phone` غير فارغ: ابحث في `subscribers.phone`.
3. إن لم يُرسل `user_code` (أو أصبح `null` بعد التطبيع): ابحث بـ `phone` فقط إن وُجد.
4. يُطبَّق `trim` على `user_code` و `phone`؛ القيم `"null"` / `"none"` كسلسلة تُعامل كـ فارغة.

لا يوجد **overwrite**: إن كان `telegram_chat_id` مربوطاً لمشترك آخر، يُرجع فشلًا واضحًا.

## أمثلة Request (JSON)

**هاتف فقط (`user_code` = null):**

```json
{
  "telegram_chat_id": 5508939156,
  "phone": "07712345678",
  "user_code": null
}
```

**رمز مستخدم فقط:**

```json
{
  "telegram_chat_id": 5508939156,
  "phone": null,
  "user_code": "SUB-1001"
}
```

**الاثنان:** يُبحث بـ `user_code` أولاً، فإن لم يُوجد المشترك يُبحث بـ `phone`.

## أمثلة Response

**نجاح:**

```json
{
  "success": true,
  "message": "Telegram linked successfully",
  "subscriber": {
    "id": 123,
    "real_name": "Ahmed",
    "phone": "07712345678",
    "user_code": "SUB-1001",
    "telegram_chat_id": 5508939156
  }
}
```

**مشترك غير موجود:**

```json
{
  "success": false,
  "message": "Subscriber not found"
}
```

**محادثة مربوطة لمشترك آخر:**

```json
{
  "success": false,
  "message": "This Telegram account is already linked to another subscriber"
}
```

## إلغاء الربط

```json
{ "telegram_chat_id": 5508939156 }
```

أو:

```json
{ "subscriber_id": 123 }
```

**نجاح:**

```json
{
  "success": true,
  "message": "Telegram unlinked"
}
```

## الحالة

`GET /api/telegram/status/123`

```json
{
  "success": true,
  "subscriber_id": 123,
  "linked": true,
  "telegram_chat_id": 5508939156
}
```

## n8n

1. Webhook Telegram → خزّن `{{ $json.message.chat.id }}` كـ `telegram_chat_id`.
2. اطلب من المستخدم الهاتف أو الرمز.
3. **HTTP Request:** `POST` إلى `http://<host>:8000/api/telegram/link`
4. Headers: `Content-Type: application/json`، `X-Telegram-Link-Secret`
5. Body: JSON كما في الأمثلة أعلاه (يمكن تمرير `null` لأحد الحقلين).
6. شرط على `success` في الاستجابة لإرسال رسالة للمستخدم.

## قاعدة البيانات

- تُطبَّق تلقائياً من `backend/db/schema_idempotent.sql` عند تشغيل الـ API.
- ترحيل يدوي: `psql "$DATABASE_URL" -f backend/db/telegram_linking_migration.sql`

التخزين:

- `subscribers.telegram_chat_id` يُحدَّث من الـ backend فقط.
- `telegram_users`: صف واحد لكل `telegram_chat_id` ولكل `subscriber_id` (فهارس UNIQUE + FK `subscriber_id` → `subscribers.id`).

## كيف يُطبَّق المخطط والتحقق

### أ) تلقائياً مع تشغيل الـ API

عند تشغيل التطبيق، `main.py` يستدعي `bootstrap_if_needed(DATABASE_URL)` فيبدأ تنفيذ جمل `schema_idempotent.sql` على PostgreSQL (بما فيها جدول/أعمدة Telegram).  
**التحقق:** إذا ارتفع الخادم بدون خطأ `Database bootstrap failed` فالجمل نُفِّذت (أو كانت مُطبَّقة مسبقاً لأن الملف idempotent).

### ب) بدون تشغيل الخادم — تطبيق المخطط فقط

من مجلد `backend` (مع تفعيل نفس `DATABASE_URL` في `.env`):

```powershell
cd d:\king_office\backend
python -c "from app.core.config import settings; from app.core.db_bootstrap import ensure_schema_and_admin; ensure_schema_and_admin(settings.DATABASE_URL); print('schema applied OK')"
```

### ج) يدوياً بـ psql (نفس محتوى الترحيل المختصر)

```powershell
# استبدل الاتصال بقاعدتك
psql "postgresql://USER:PASS@HOST:5432/king_office_new" -f d:\king_office\backend\db\telegram_linking_migration.sql
```

### د) التحقق من وجود أعمدة/جدول Telegram في PostgreSQL

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'subscribers' AND column_name = 'telegram_chat_id';

SELECT table_name FROM information_schema.tables WHERE table_name = 'telegram_users';
```

### هـ) التحقق من المسارات بعد إعادة التشغيل

```powershell
cd d:\king_office\backend
python -c "from app.main import app; print([r.path for r in app.routes if getattr(r,'path','') and 'telegram' in r.path])"
```

يجب أن تظهر `/api/telegram/link` و`/api/telegram/start` و`/api/telegram/unlink` و`/api/telegram/status/{subscriber_id}`.
