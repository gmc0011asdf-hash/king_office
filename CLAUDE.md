# King Office — Claude Code Project Guide

## Project: Maktab Al-Malik (مكتب الملك)

Iraqi ISP management system: Internet subscribers (FTTH/Wireless), Office operations, Cards inventory, Expenses, Partners/Suppliers, Reports, Telegram notifications.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS 4, React Router 7 |
| Backend | Python FastAPI, SQLAlchemy 2, Pydantic v2, Alembic |
| Database | PostgreSQL (Supabase-hosted in production) |
| Auth | JWT (python-jose), bcrypt |
| External | admin.ftth.iq API (FTTH portal sync), Telegram Bot, APScheduler |
| Dev | `npm run start` (concurrently runs frontend + backend with reload) |

---

## Entrypoints

- Frontend: `src/main.tsx` → `src/App.tsx` → `src/modules/*/page/`
- Backend: `backend/app/main.py` — registers all routers from `backend/app/routers/`
- FTTH integration: `backend/app/integrations/ftth/` (engine.py + ftth_unified_sync.py + ftth_iq_api.py)

---

## Run Commands

```bash
# Full stack (from repo root)
npm run start

# Backend only
cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend only
npm run dev

# TypeScript check
npm run lint

# Backend tests (from backend/)
cd backend && python -m pytest tests/ -v

# Automation sandbox tests
cd automation_sandbox && python -m pytest tests/ -v
```

---

## Environment

- Root `.env`: `VITE_API_URL=http://127.0.0.1:8000`
- Backend `backend/.env`: `DATABASE_URL`, `SECRET_KEY`, `ADMIN_EMAIL`, `ADMIN_INITIAL_PASSWORD`, `SMTP_*`
- **SECRET_KEY** must never change after FTTH credentials are stored (they are Fernet-encrypted with a key derived from SECRET_KEY)

---

## Architecture Rules

1. **Diagnose first** — read logs and source before proposing fixes
2. **Minimal safe patches** — do not touch unrelated files
3. **Module isolation** — each module owns its layer; do not cross boundaries without noting it
4. **RTL preservation** — Arabic text labels, RTL direction, and Arabic UI strings must not change
5. **No speculative refactor** — only change what is necessary for the stated task
6. **No fake success** — verify with actual evidence before claiming something works

---

## Database Rules

- PostgreSQL only (no SQLite in production)
- Schema changes must be backward-compatible
- Missing columns: use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- The `alembic_version` table may be absent (schema was bootstrapped without alembic tracking) — apply DDL directly with psycopg2 when migrations are not tracked
- Always verify with `SELECT column_name FROM information_schema.columns WHERE table_name='...'` after schema changes

---

## Module Boundaries

| Module | Frontend | Backend |
|---|---|---|
| Internet/FTTH | `src/modules/internet/` | `backend/app/modules/internet/` + `backend/app/integrations/ftth/` |
| Office | `src/modules/office/` | `backend/app/modules/office/` |
| Cards | `src/modules/cards/` | `backend/app/modules/cards/` |
| Expenses | `src/modules/expenses/` | `backend/app/modules/expenses/` |
| Partners | `src/modules/partners_suppliers/` | `backend/app/modules/partners_suppliers/` |
| Reports | `src/modules/reports/` | `backend/app/modules/internet/routers/reports_router.py` |
| Settings | `src/modules/settings/` | `backend/app/modules/settings/` |
| Auth | `src/modules/auth/` | `backend/app/modules/auth/` |
| Dashboard | `src/modules/dashboard/` | `backend/app/modules/dashboard/` |

---

## FTTH Integration — Critical Facts

- Sync endpoint: `POST /api/ftth/portal/sync`
- Credential storage: Fernet-encrypted in `ftth_portal_config.username_enc / password_enc`
- Credential re-entry: `POST /api/ftth/portal/setup` (required if SECRET_KEY changes)
- Data flow: `admin.ftth.iq API` → `ftth_external_data` → `ftth_customers` (projection)
- `fdt` and `fat` come from `deviceDetails` in the **batch addresses response** (`GET /api/addresses?accountIds=...`), at the **top level of each item** (not inside `ftthAddress`)
- A failed `db.flush()` poisons the SQLAlchemy session; any `UndefinedColumn` error during sync must be fixed at the schema level before the sync can write data
- If `SECRET_KEY` changes, FTTH portal credentials become undecryptable — re-enter via `POST /api/ftth/portal/setup`

---

## Permissions System

- Roles: `admin` (full), `user` (section-based)
- Permission file: `src/shared/permissions/permissions.ts`
- Sections: `dashboard`, `internet`, `office`, `cards`, `expenses`, `partners`, `reports`, `settings`

---

## Skills Index

See `.claude/skills/INDEX.md` for the full skills system.
