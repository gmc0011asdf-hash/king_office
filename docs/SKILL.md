---
name: king-office-maintainer
description: قواعد العمل والصيانة والتطوير لمشروع مكتب الملك. يشمل البنية، قاعدة البيانات، أوامر التشغيل، التشخيص، والصلاحيات.
---

# King Office – Skill / قواعد مشروع مكتب الملك

> قواعد العمل والصيانة والتطوير لمشروع مكتب الملك. استخدم هذا الملف كمرجع عند التعديل أو التشخيص.

---

## 1. نظرة عامة

- **الاسم:** نظام مكتب الملك (Maktab Al-Malik)
- **الغرض:** نظام إداري لمكتب خدمة الإنترنت والمكاتب التجارية
- **الواجهة الأمامية:** React 19 + TypeScript + Vite 6 + Tailwind CSS 4
- **الواجهة الخلفية:** Python FastAPI
- **قاعدة البيانات:** PostgreSQL (افتراضي) أو SQLite (اختياري)
- **المصادقة:** JWT
- **ORM:** SQLAlchemy
- **التحقق:** Pydantic
- **الهجرة:** Alembic

---

## 2. البنية المعتمدة

### 2.1 المجلدات الرئيسية

- `src/` — كود الواجهة الأمامية (React)
- `backend/` — كود الخادم الخلفي (FastAPI)
- `backend/app/` — التطبيق الرئيسي
- `backend/app/core/` — الإعدادات، قاعدة البيانات، الأمان
- `backend/app/models/` — نماذج SQLAlchemy
- `backend/app/schemas/` — نماذج Pydantic
- `backend/app/routers/` — مسارات FastAPI
- `backend/app/modules/` — وحدات منظمة (internet، cards، expenses، إلخ)
- `backend/alembic/` — ترحيلات قاعدة البيانات
- `scripts/` — سكربتات التشغيل والصيانة
- `docs/` — التوثيق

### 2.2 الملفات الحرجة

- `src/App.tsx` — المسارات والحماية
- `src/context/AppContext.tsx` — الحالة العالمية
- `src/modules/internet/page/InternetPage.tsx` — صفحة الإنترنت (الأكبر)
- `src/pages/Reports.tsx` — التقارير الشاملة
- `backend/app/main.py` — نقطة دخول API
- `backend/app/core/config.py` — الإعدادات
- `backend/app/core/database.py` — اتصال قاعدة البيانات
- `backend/app/models/models.py` — نماذج الجداول

---

## 3. قاعدة البيانات

### 3.1 نوع القاعدة

- **النظام موحّد:** PostgreSQL فقط
  - `DATABASE_URL` في `config.py`: `postgresql://postgres:postgres@localhost:5432/king_office_new`
  - متغيرات `backend/.env`: `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
  - لا يدعم SQLite

### 3.2 الجداول الرئيسية

- `users` — المستخدمون
- `system_settings` — إعدادات النظام
- `wallet_transactions` — معاملات المحفظة (FTTH، Wireless)
- `subscribers` — المشتركون
- `subscriber_history` — سجل المشتركين
- `internet_zones` — المناطق
- `internet_fats` — نقاط FAT
- `subscription_categories` — فئات الاشتراك
- `internet_materials`, `internet_material_sales`
- `office_materials`, `office_customers`, `office_sales`, `office_invoices`, `office_payments`, `office_installments`
- `partners`, `partner_transactions`
- `suppliers`, `supplier_transactions`
- `card_wallet_transactions`, `card_purchases`, `card_sales`
- `expenses`, `cashback_history`
- `sim_packages`, `sim_numbers`, `sim_sales`, `sim_inventory_transactions`
- `notifications`, `activity_log`

### 3.3 قواعد قاعدة البيانات

- التغييرات تمر عبر Alembic قدر الإمكان
- لا حذف أعمدة أو جداول بدون ترحيل
- `db_bootstrap.py` ينشئ الجداول والمستخدم الافتراضي عند التشغيل الأول

---

## 4. أوامر التشغيل

### 4.1 تشغيل الباك اند

```powershell
cd D:\king_office\backend
.\venv\Scripts\activate
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

أو من الجذر:

```powershell
npm run dev:backend
```

### 4.2 تشغيل الواجهة

```powershell
cd D:\king_office
npm run dev
```

### 4.3 تشغيل الكل معاً

```powershell
npm run start
```

### 4.4 بناء للإنتاج

```powershell
npm run build
npm run preview
```

---

## 5. المنافذ والعناوين

- **الواجهة:** `http://localhost:5173` (أو `http://0.0.0.0:5173`)
- **API:** `http://localhost:8000` (أو `http://127.0.0.1:8000`)
- **PostgreSQL:** `localhost:5432` (افتراضي)
- **CORS:** يدعم `localhost`, `127.0.0.1`, `192.168.x.x`, `10.x.x.x`

---

## 6. متغيرات البيئة

### 6.1 الجذر (`.env`)

- `VITE_API_BASE_URL` — عنوان API (مثل `http://localhost:8000/api`)

### 6.2 الباك اند (`backend/.env`)

- `DATABASE_URL` — رابط قاعدة البيانات
- `SECRET_KEY` — مفتاح JWT
- `ACCESS_TOKEN_EXPIRE_MINUTES` — مدة صلاحية التوكن
- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `FRONTEND_URL` — عنوان الواجهة (لـ CORS أو إعادة التوجيه)
- `SMTP_*` — إعدادات البريد (اختياري)
- `GEMINI_API_KEY` — مفتاح Gemini (اختياري)

---

## 7. الصلاحيات والأدوار

- **admin:** صلاحية كاملة
- **user:** صلاحيات حسب `permissions.sections`
- دوال التحقق: `canAccessSection`, `canAction`, `canAccessLines`
- الملف: `src/shared/permissions/permissions.ts`
- الأقسام: `dashboard`, `internet`, `office`, `cards`, `expenses`, `partners`, `reports`, `settings`

---

## 8. الوحدات والأقسام

- **Internet:** مشتركون (FTTH/Wireless)، محفظة، فئات، مناطق، FAT، مواد، تقارير
- **Office:** مواد، مبيعات، عملاء، فواتير
- **Cards:** بطاقات Switch/Qi، مخزون، تقارير
- **Expenses:** مصروفات
- **Partners/Suppliers:** شركاء، موردين
- **Reports:** تقارير شاملة
- **Settings:** مستخدمون، إعدادات، صلاحيات
- **SimCards:** خطوط، باقات، مبيعات

---

## 9. الوضع الليلي والطباعة

- **الوضع الليلي:** `class="dark"` على الجذر
- النوافذ المنبثقة تدعم الوضع الليلي (تعبئة المحفظة، إضافة مشترك، إضافة فئة)
- **الطباعة:** التقارير دائماً بالوضع العادي (فاتح) عبر `@media print` في `index.css`
- `print:hidden` — إخفاء العناصر عند الطباعة

---

## 10. قواعد التشخيص

### 10.1 ERR_CONNECTION_REFUSED

- تأكد أن الباك اند يعمل على `127.0.0.1:8000`
- تشغيل الباك اند من `backend/` وليس من الجذر
- افحص أخطاء startup في نافذة الباك اند

### 10.2 OPTIONS 400 Bad Request

- غالباً مشكلة CORS أو preflight
- راجع `allow_origins` و `allow_origin_regex` في `main.py`

### 10.3 500 بعد تسجيل الدخول

- افحص `Pydantic response model`
- افحص أن الجداول موجودة وقاعدة البيانات متصلة

### 10.4 الواجهة لا تتصل بالـ API

- تأكد من `VITE_API_BASE_URL` في `.env`
- تأكد أن العميل يستخدم العنوان الصحيح (راجع `src/api/client.ts`)

---

## 11. قواعد التعديل والصيانة

- أصلح السبب الجذري قبل أي ترقيع مؤقت
- لا تكرر نفس عميل API في أكثر من مكان
- عند تعديل route أو schema، راجع الواجهة والباك اند معاً
- التغييرات الكبيرة يجب أن تكون قابلة للتراجع
- لا تخزّن `node_modules` أو `venv` أو `__pycache__` في النسخ الاحتياطية
- لا تحذف الملفات المشتبه بها مباشرة؛ انقلها إلى `_cleanup_review/` أولاً
- لا توضع أسرار حقيقية داخل `SKILL.md` أو ملفات التوثيق

---

## 12. قواعد الباك اند

- لا تشغّل الباك اند من الجذر باستخدام `app.main:app` بدون `cd backend`
- البيئة الافتراضية: `backend/venv`
- استخدم `python -m uvicorn app.main:app` من داخل `backend/`

---

## 13. قواعد الواجهة الأمامية

- الصفحات في `src/pages/` — نقاط الدخول
- الوحدات في `src/modules/` — الصفحات المعقدة والـ API
- استدعاءات API في `src/api/` و `src/modules/*/api/`
- الحالة العالمية في `AppContext`
- التوجيه: React Router v7

---

## 14. التبعيات الرئيسية

### 14.1 الواجهة

- React 19, React DOM 19
- Vite 6
- Tailwind CSS 4
- React Router 7
- Lucide React (أيقونات)
- Recharts (رسوم بيانية)
- Leaflet, React-Leaflet (خرائط)
- clsx, tailwind-merge

### 14.2 الباك اند

- FastAPI
- SQLAlchemy
- Pydantic, pydantic-settings
- python-jose, passlib
- uvicorn
- alembic (للترحيل)
- psycopg2 أو asyncpg (PostgreSQL)
- sqlite3 (مدمج، لـ SQLite)

---

## 15. ملفات التوثيق

- `docs/تقرير_نظام_مكتب_الملك.txt` — تقرير مفصل بالعربية
- `SKILL.md` — هذا الملف (قواعد العمل)
- `README.md` — تعليمات عامة
- `NETWORK_SETUP.md` — إعداد الشبكة

---

## 16. سكربتات مساعدة

- `setup_new_machine.bat` — إعداد كامل على الجهاز الجديد (Node, Python, npm, venv, .env, DB)
- `start_system_king_office.bat` — تشغيل النظام (Backend + Frontend + فتح المتصفح)
- `scripts/run_system_fixed.ps1` — تشغيل النظام
- `scripts/clean_db.py` — تنظيف قاعدة البيانات
- `backend/scripts/bootstrap_db.py` — إعداد قاعدة البيانات (PostgreSQL)
- `backend/scripts/init_db.py` — تهيئة قاعدة البيانات (الجدول)
- `backend/run_backend.ps1` — تشغيل الخادم الخلفي

---

*آخر تحديث: 2025*
