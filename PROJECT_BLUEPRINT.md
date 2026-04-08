# PROJECT BLUEPRINT — King Office Manager Agent

## 1. الهيكل العام (Tree View)
```text
king_office/
├── package.json                   ← Frontend deps
├── vite.config.ts                 ← Frontend config
├── d:/king_office/backend/        ← Backend (FastAPI)
│   ├── app/
│   │   ├── main.py                ← Server entry point (CLEAN)
│   │   ├── core/                  ← Security, Database, Config (Clerk removed)
│   │   ├── models/                ← models.py (SQLAlchemy)
│   │   ├── modules/               ← Core Logic per Module
│   │   │   ├── auth/              ← AuthSkill
│   │   │   ├── cards/             ← CardsSkill
│   │   │   ├── internet/          ← SubscriberManagementSkill
│   │   │   └── office/            ← OfficeSalesSkill
│   │   └── routers/               ← API Route Map
│   └── .env                       ← Environment (READY)
├── DEPLOYMENT_RECIPE.md           ← Render Deployment Instructions
└── docs/                          ← System Documentation
```

## 2. مراجعة الملفات الزائدة (Redundant Files)
| الملف | الحالة | الإجراء |
|---|---|---|
| `check_db.py` | فارغ (Security Wipe) | يُحذف قبل الرفع |
| `schema_compare.py` | فارغ (Security Wipe) | يُحذف قبل الرفع |
| `schema.sql` | قديم (Root) | يُحذف (الأصلي الآن في backend/db/) |
| `tmp*.txt` | ملفات Debug مكسورة | تُحذف فوراً |

## 3. منطق العمل (Core Logic)
- **Internet**: إدارة المشتركين ومزامنة بوابة FTTH وتوليد التقارير التقنية.
- **Office**: إدارة المبيعات، المواد، الموردين، والشركاء (Inventory/Sales).
- **Auth**: نظام التحقيق (JWT/OAuth2) وصلاحيات المستخدمين المستندة للأدوار.
- **Cards**: إدارة مخزون كروت الشحن وبطاقات SIM وقسائم الدفع.

## 4. خريطة الطريق (Sprint Plan)
- **Sprint 1: الأساس (Priority: High)**: تثبيت Supabase Connection وتفعيل Auth.
- **Sprint 2: إدارة الإنترنت (Priority: High)**: ربط بوابة FTTH ومزامنة المشتركين.
- **Sprint 3: الأتمتة (Priority: Medium)**: تفعيل إشعارات n8n/Telegram والتقارير المالية.
