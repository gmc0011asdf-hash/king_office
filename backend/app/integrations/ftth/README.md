# FTTH Portal integration

## Flow

1. **Setup (admin):** `POST /api/ftth/portal/setup` يتحقق من الاتصال، ينشئ الجداول إن لزم، ويخزّن `login_url` / `list_url` مع اسم المستخدم وكلمة المرور **مشفّرة** (Fernet + مفتاح مشتق من `SECRET_KEY`).
2. **Sync:** `POST /api/ftth/portal/sync` يسجّل الدخول بـ httpx، يجلب كل الصفحات (مع `{page}` أو معامل `page_param`)، ويحدّث `ftth_external_data` بحسب `external_id`.
3. **Import:** `POST /api/ftth/portal/import-to-subscriber` ينشئ أو يحدّث سجلًا في `subscribers` ويربط `imported_subscriber_id`.
4. **ترحيل جماعي:** `POST /api/ftth/portal/import-all-pending` يرحّل السجلات التي `imported_subscriber_id` لها فارغ (حتى `limit`، افتراضي 300).

## `parse_options` (JSON)

- `login_username_field` / `login_password_field` — حقول النموذج أو JSON.
- `login_content_type`: `form` أو `json`.
- `rows_path`: مسار داخل JSON (مثل `data.items`)؛ فارغ = جذر أو اكتشاف تلقائي لـ `data` / `items` / …
- `page_param` + `pagination_start` + `max_pages` — ترقيم الصفحات.
- `mapping`: خريطة الحقول إلى مفاتيح الـ API، مثل `{"external_id":"subscriberId","national_name":"fullName"}`.
- **HTML:** `parse_mode: html_table` + `html_table_selector` + `html_columns` (فهرس العمود لكل حقل).

## Modes

| Mode           | Use case                          |
|----------------|-----------------------------------|
| `ftth_iq_admin`| **admin.ftth.iq** — تسجيل دخول عبر `POST https://admin.ftth.iq/api/auth/Contractor/token` (نفس أصل المتصفح) ثم جلب العملاء من `/api/customers` مع المعاملات نفسها تقريبًا. لا حاجة لـ `list_url`. |
| `json_generic` | REST JSON قابل لضبط الحقول        |
| `html_table`   | صفحة فيها `<table>`               |
| `demo`         | بيانات وهمية بدون موقع حقيقي      |

### خيارات إضافية لـ `ftth_iq_admin` (داخل `parse_options`)

- `ftth_iq_api_base` (افتراضي `https://admin.ftth.iq/api/`؛ يمكن `https://api.ftth.iq/api/` إن اقتضى الأمر)
- `ftth_iq_token_path` (افتراضي `auth/Contractor/token`)
- `ftth_iq_customers_path` (افتراضي `customers`)
- `ftth_iq_client_id` (معرّف العميل العام من واجهة الويب)
- `ftth_iq_client_secret` / `ftth_iq_scope` — للواجهة الافتراضية يُرسل `scope=openid profile` تلقائيًا (مثل المتصفح)؛ `client_id` في الجسم يبقى فارغًا والمعرّف في ترويسة `x-client-app`
- `ftth_iq_page_size` (افتراضي 100)
- `ftth_iq_fetch_addresses` (افتراضي `true`) — بعد كل صفحة عملاء يُستدعى `GET .../addresses?accountIds=...` لدمج **المنطقة، FAT، العنوان، اسم مستخدم الخدمة (PPPoE)** كما في لوحة الإدارة. فشل دفعة عناوين لا يوقف المزامنة بالكامل.
- `ftth_iq_addresses_batch_size` (افتراضي 40) — عدد `accountIds` لكل طلب عناوين
- `ftth_iq_addresses_path` (افتراضي `addresses`)
- `ftth_iq_current_user_path` (افتراضي `current-user`) — بعد التوكن يُستدعى `GET .../current-user` للتحقق من الجلسة (لا يوقف المزامنة عند الفشل).
- `ftth_iq_fetch_customer_details` (افتراضي **`false`**) — لكل مشترك يُستدعى API تفاصيل (مثل `customers/{id}`). **فعّل** يدوياً إن احتجت حقولاً إضافية؛ الافتراضي سريع ويعتمد على قائمة العملاء + العناوين.
- `ftth_iq_fetch_subscriptions` (افتراضي **`false`**) — طلب لمسارات مثل `customers/{id}/subscriptions` لملء **انتهاء الصلاحية** و**مدة الالتزام** عند غيابها في القائمة. **فعّل** عند الحاجة لتواريخ كاملة.
- `ftth_iq_subscriptions_path_templates` — قوالب مسار مخصّصة للاشتراكات (مثل `["customers/{id}/subscriptions"]`).
- `ftth_iq_detail_delay_ms` (افتراضي `0`) — بعد انتهاء **دفعة** طلبات التفاصيل/الاشتراكات المتوازية لصفحة القائمة، يمكن إضافة تأخير بالمللي ثانية (مثلاً `50`) إذا فرض المزوّد حدّ معدّل.
- `ftth_iq_detail_parallel_workers` (افتراضي `8`) — عدد الطلبات المتوازية لكل صفحة قائمة (تفاصيل + اشتراكات لكل `accountId`).
- `ftth_iq_detail_path_templates` — مصفوفة قوالب مسار، مثلاً `["customers/{id}", "customers/{id}/details"]` إن اختلفت واجهة المزوّد.

### الترحيل إلى `subscribers`

في واجهة «ترحيل للنظام» يمكن اختيار أي حقول تُنسَخ من جدول FTTH. **اسم FTTH** يُحفظ في **`national_id_name` (الاسم في الوطني)**؛ **`real_name` (الاسم الحقيقي)** يُترك فارغاً ليُكمل لاحقاً من تعديل المشترك (اختياري). **التواريخ** في الوسيط تُحسب على الخادم من `expiration_date` و`commitment_days` (شهر=30 يوماً تقويمياً افتراضياً). **الحالة** تُشتق من تاريخ الانتهاء (نشط/منتهي) عند تفعيل خيار الحالة. **`user_code`** يُبنى من الاسم الوطني (أو الحقيقي إن وُجد) + المنطقة + FAT + الهاتف.
