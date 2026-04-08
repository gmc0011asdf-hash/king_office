# KING OFFICE BLUEPRINT
## مرجع نظام مكتب الملك — King Office Manager Agent

> هذا الملف هو نقطة الدخول الأولى لأي عملية تطوير أو إصلاح.  
> اقرأه قبل لمس أي كود.

---

## 1. هوية النظام

**الاسم:** Maktab Al-Malik — مكتب الملك  
**النوع:** نظام إدارة ISP عراقي (إنترنت FTTH/Wireless + عمليات مكتبية)  
**البيئة:** FastAPI + PostgreSQL + React 19 + Supabase  
**الإنتاج:** `https://www.kingoffice.store`

---

## 2. هيكل الوثائق

```
KING_OFFICE_BLUEPRINT.md        ← أنت هنا (المرجع الرئيسي)
│
├── docs/agents/
│   ├── AGENT_CORE.md           ← ميثاق الوكيل وهويته
│   ├── SKILLS_MAP.md           ← قاموس المهارات (13 مهارة)
│   ├── TASKS_ROUTINE.md        ← قوالب المهام اليومية
│   ├── DEBUG_PROTOCOL.md       ← بروتوكول التشخيص الذكي
│   ├── agent-index.md          ← فهرس نظام الوكيل
│   ├── playbooks/              ← إجراءات تشغيلية محددة
│   │   ├── database-change-flow.md
│   │   ├── diagnose-error.md
│   │   ├── release-checklist.md
│   │   └── safe-fix-flow.md
│   └── prompts/                ← قوالب برومبت لكل موديول
│
├── docs/architecture/          ← خرائط النظام التقنية
│   ├── system-overview.md
│   ├── backend-map.md
│   ├── frontend-map.md
│   ├── database-map.md
│   └── env-map.md
│
├── docs/modules/               ← وثائق تفصيلية لكل موديول
│   ├── internet.md
│   ├── office.md
│   ├── expenses.md
│   ├── dashboard.md
│   ├── ftth-integration.md
│   ├── notifications.md
│   ├── partners.md
│   ├── reports.md
│   └── settings.md
│
└── CLAUDE.md                   ← قواعد العمل مع Claude Code
```

---

## 3. خريطة المهارات السريعة

| المهارة | الغرض | نقطة الدخول (API) |
|---|---|---|
| **AuthSkill** | تسجيل دخول + صلاحيات | `POST /api/auth/login` |
| **DatabaseSkill** | اتصال DB + schema | `GET /health` |
| **SubscriberManagementSkill** | مشتركو الإنترنت | `GET /api/subscribers` |
| **FTTHSyncSkill** | مزامنة FTTH خارجي | `POST /api/ftth/portal/sync` |
| **OfficeSalesSkill** | مبيعات وفواتير | `GET /api/office/sales` |
| **FinancialSkill** | محفظة ومصروفات | `GET /api/wallet/balance` |
| **CardsSkill** | مخزون الكروت | `GET /api/cards/stock` |
| **SimCardsSkill** | بطاقات SIM | `GET /api/sim-cards` |
| **PartnersSkill** | شركاء وموردون | `GET /api/partners` |
| **ReportsSkill** | تقارير وإحصاء | `GET /api/internet/reports` |
| **NotificationsSkill** | إشعارات Telegram | `POST /api/telegram/link` |
| **SettingsSkill** | إعدادات + backup | `GET /api/settings` |
| **AuditSkill** | سجل المراجعة | `GET /api/audit-logs` |

> التفاصيل الكاملة: [SKILLS_MAP.md](docs/agents/SKILLS_MAP.md)

---

## 4. قواعد العمل الحاكمة

```
1. التشخيص أولاً        — لا إصلاح بدون تحديد المهارة المسؤولة
2. الحد الأدنى الآمن    — لا تلمس ملفات خارج نطاق المهارة
3. عزل الموديولات       — كل مهارة تملك ملفاتها؛ لا تداخل
4. RTL محفوظ            — النصوص العربية لا تتغير
5. PostgreSQL فقط       — لا SQLite في أي بيئة
6. لا نجاح وهمي         — تحقق بدليل قبل الإعلان
7. SECRET_KEY مقدس       — لا يتغير أبداً بعد تخزين بيانات FTTH
```

---

## 5. قرارات تشغيلية سريعة

### عند أي خطأ:
```
خطأ → راجع DEBUG_PROTOCOL.md → حدد المهارة → اقرأ ملفاتها فقط
```

### عند إضافة ميزة جديدة:
```
1. هل تنتمي لمهارة موجودة؟ → أضفها لنطاق تلك المهارة
2. هل هي مستقلة تماماً؟   → أنشئ مهارة جديدة + وثّقها في SKILLS_MAP.md
3. هل تحتاج جدول DB جديد? → schema change → playbooks/database-change-flow.md
4. هل لها API endpoint؟   → سجّل في main.py بعد كل routers الحالية
```

### عند تغيير المخطط:
```
ALTER TABLE ... ADD COLUMN IF NOT EXISTS — دائماً backward compatible
تحقق بعدها: SELECT column_name FROM information_schema.columns WHERE table_name='...'
```

---

## 6. خطة التطوير المستقبلية (Sprint Plan)

### المرحلة 1 — تحسين الأساس (Foundation Hardening)
**الهدف:** تثبيت المهارات الحالية وإصلاح الثغرات المعروفة

| المهمة | المهارة | الأولوية |
|---|---|---|
| إعادة كتابة `telegram/service.py` (محذوف المحتوى) | NotificationsSkill | عالية |
| توحيد `backend/app/routers/` مع `backend/app/modules/*/routers/` | جميع المهارات | متوسطة |
| تنظيف ملفات tmp*.txt في الجذر | - | منخفضة |
| توثيق Alembic migrations المفقودة | DatabaseSkill | متوسطة |

**إضافة مهارة:** لا مهارات جديدة في هذه المرحلة — تثبيت فقط.

---

### المرحلة 2 — الأتمتة الذكية (Smart Automation)
**الهدف:** تفعيل automation_sandbox كمهارة إنتاجية

| المهمة | المهارة الجديدة | الاعتماد على |
|---|---|---|
| نقل automation_sandbox لـ backend | **AutomationSkill** | SubscriberManagementSkill |
| تفعيل إشعارات الديون التلقائية | AutomationSkill + NotificationsSkill | DatabaseSkill |
| تفعيل تقرير المدير اليومي (PDF) | AutomationSkill + ReportsSkill | FinancialSkill |
| تلقي /start من Telegram بصورة آمنة | NotificationsSkill | AuthSkill |

**بنية المهارة الجديدة:**
```
AutomationSkill:
  نطاق: automation_sandbox/ + backend/app/core/backup_scheduler.py
  Input:  trigger (scheduled/manual) + report_type
  Process: sandbox_selectors → exporters → Telegram/Email delivery
  Output: structured JSON + optional PDF
```

---

### المرحلة 3 — التوسع والتكامل (Scale & Integration)
**الهدف:** إضافة مهارات مستقلة جديدة دون تأثير على القديمة

| المهمة | المهارة الجديدة | الاعتماد على |
|---|---|---|
| دعم خدمة Wireless منفصلة عن FTTH | **WirelessSkill** | SubscriberManagementSkill |
| بوابة عميل self-service | **CustomerPortalSkill** | AuthSkill + SubscriberManagementSkill |
| تكامل مع بوابات دفع عراقية | **PaymentGatewaySkill** | FinancialSkill |
| تقارير BI متقدمة | تطوير ReportsSkill | جميع المهارات |

**قاعدة إضافة مهارة جديدة:**
```
كل Skill جديدة يجب أن:
  □ تمتلك نطاق ملفات خاص بها (Backend + Frontend)
  □ تعرّف Input/Process/Output واضحة
  □ لا تقرأ مباشرة من DB جداول مهارة أخرى (تستخدم API بدلاً)
  □ توثَّق في SKILLS_MAP.md قبل كتابة أي كود
  □ تمتلك نقطة فشل محددة
```

---

## 7. هيكل الملفات الكاملة (Tree View)

```
king_office/
├── KING_OFFICE_BLUEPRINT.md       ← أنت هنا
├── CLAUDE.md                      ← قواعد Claude Code
├── package.json                   ← Frontend dependencies
├── vite.config.ts
├── tsconfig.json
│
├── src/                           ← Frontend (React)
│   ├── main.tsx → App.tsx
│   ├── modules/
│   │   ├── auth/                  ← AuthSkill (Frontend)
│   │   ├── internet/              ← SubscriberManagementSkill + FTTHSyncSkill
│   │   ├── office/                ← OfficeSalesSkill
│   │   ├── expenses/              ← FinancialSkill
│   │   ├── cards/                 ← CardsSkill
│   │   ├── sim-cards/             ← SimCardsSkill
│   │   ├── partners_suppliers/    ← PartnersSkill
│   │   ├── reports/               ← ReportsSkill
│   │   ├── settings/              ← SettingsSkill + AuditSkill
│   │   └── dashboard/             ← عرض مجمَّع لجميع المهارات
│   └── shared/
│       ├── permissions/           ← AuthSkill (Frontend)
│       └── utils/                 ← أدوات مشتركة
│
├── backend/                       ← Backend (FastAPI)
│   ├── app/
│   │   ├── main.py                ← نقطة دخول السيرفر + تسجيل routers
│   │   ├── core/                  ← DatabaseSkill + AuthSkill (الأساس)
│   │   │   ├── database.py
│   │   │   ├── security.py
│   │   │   ├── config.py
│   │   │   └── audit_middleware.py
│   │   ├── models/models.py       ← جميع ORM models
│   │   ├── routers/               ← API endpoints (نقطة الدخول)
│   │   ├── modules/               ← منطق الأعمال المعزول
│   │   │   ├── auth/
│   │   │   ├── internet/          ← SubscriberManagementSkill
│   │   │   ├── office/            ← OfficeSalesSkill
│   │   │   ├── cards/             ← CardsSkill
│   │   │   ├── expenses/          ← FinancialSkill
│   │   │   ├── partners_suppliers/← PartnersSkill
│   │   │   ├── settings/          ← SettingsSkill
│   │   │   └── telegram/          ← NotificationsSkill
│   │   └── integrations/
│   │       └── ftth/              ← FTTHSyncSkill (معزول تماماً)
│   ├── alembic/                   ← ترحيل قاعدة البيانات
│   └── scripts/                   ← أدوات صيانة وتهيئة
│
├── automation_sandbox/            ← (مرشح لـ AutomationSkill في Sprint 2)
│   ├── sandbox_selectors/
│   ├── exporters/
│   ├── templates/
│   └── repositories/
│
└── docs/                          ← جميع الوثائق
    ├── agents/                    ← وثائق الوكيل (هذا الملف وأخواته)
    ├── architecture/              ← خرائط تقنية
    └── modules/                   ← وثائق الموديولات
```

---

## 8. الملفات التي تحتاج مراجعة

| الملف | الحالة | الإجراء المقترح |
|---|---|---|
| `backend/app/modules/telegram/service.py` | مُفرَّغ ("Wiped for security cleanup") | إعادة كتابة في Sprint 1 |
| `tmp*.txt` (11 ملف في الجذر) | ملفات debug مؤقتة | حذف بعد مراجعة المحتوى |
| `src/utils/` vs `src/shared/utils/` | ازدواجية في الملفات | توحيد في `src/shared/utils/` |
| `src/api/` vs `src/modules/*/api/` | ازدواجية في API clients | توحيد تدريجي في Sprint 1 |
| `backend/app/routers/` vs `backend/app/modules/*/routers/` | ازدواجية في routers | راجع أيهما يُستخدم فعلاً |
| `fdt_output.txt`, `wallet_cleanup_error.txt`, `out_compare.txt` | ملفات debug في الجذر | أرشفة أو حذف |
| `env.txt`, `powershell_env.txt` | بيانات بيئة مكشوفة محتملاً | تحقق وأمّن |

---

## 9. نقاط التكامل الحرجة

```
┌──────────────────────────────────────────────────────────────┐
│                    admin.ftth.iq                             │
│          (بوابة FTTH الخارجية)                              │
└─────────────────────┬────────────────────────────────────────┘
                      │ HTTPS REST API
                      ↓
┌──────────────────────────────────────────────────────────────┐
│  FTTHSyncSkill                                               │
│  ftth_iq_api.py → ftth_unified_sync.py → ftth_customers     │
│  بيانات الدخول: Fernet-encrypted في ftth_portal_config      │
└─────────────────────┬────────────────────────────────────────┘
                      │
                      ↓
┌──────────────────────────────────────────────────────────────┐
│  PostgreSQL (Supabase)                                       │
│  جميع المهارات تقرأ وتكتب هنا                              │
└─────────────────────┬────────────────────────────────────────┘
                      │
                      ↓
┌──────────────────────────────────────────────────────────────┐
│  Telegram Bot + n8n                                          │
│  إشعارات المشتركين والمدير                                  │
│  TELEGRAM_LINK_SECRET يربط n8n بالسيرفر                     │
└──────────────────────────────────────────────────────────────┘
```

---

*آخر تحديث: 2026-04-06*  
*المرجع الأصلي: هذا الملف*
