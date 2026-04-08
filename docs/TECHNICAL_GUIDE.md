# King Office - Technical Guide

## Architecture

```mermaid
flowchart TB
    subgraph Frontend
        Vite[Vite + React]
        UI[React UI]
    end
    
    subgraph Backend
        FastAPI[FastAPI]
        Auth[/api/auth]
        Users[/api/users]
        Internet[/api/internet/*]
        Office[/api/office/*]
        Cards[/api/cards/*]
        Partners[/api/partners]
        Settings[/api/settings]
    end
    
    subgraph Database
        PG[(PostgreSQL)]
    end
    
    Vite --> UI
    UI -->|REST + JWT| FastAPI
    FastAPI --> Auth
    FastAPI --> Users
    FastAPI --> Internet
    FastAPI --> Office
    FastAPI --> Cards
    FastAPI --> Partners
    FastAPI --> Settings
    Auth --> PG
    Users --> PG
    Internet --> PG
    Office --> PG
    Cards --> PG
    Partners --> PG
    Settings --> PG
```

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite 6, Tailwind CSS |
| Backend | FastAPI, Python 3.9+ |
| Database | PostgreSQL |
| Auth | JWT (python-jose), bcrypt |
| Migrations | Alembic |

## Backend Structure

```
backend/
├── app/
│   ├── main.py           # FastAPI app, CORS, routers
│   ├── core/             # config, database, security, db_bootstrap, exception_handlers
│   ├── models/           # SQLAlchemy models
│   ├── schemas/          # Pydantic schemas
│   ├── routers/          # Re-exports
│   ├── shared/           # auth_router, users_router
│   └── modules/          # internet, office, cards, expenses, partners, settings
├── alembic/              # Migrations
├── scripts/              # init_db, bootstrap_db, clean_db
└── requirements.txt
```

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/login | Login (form: username, password) |
| GET | /api/auth/me | Current user (Bearer token) |
| POST | /api/auth/forgot-password | Request reset code |
| POST | /api/auth/reset-password | Reset with code |

### Core Resources
| Prefix | CRUD | Notes |
|--------|------|-------|
| /api/users | ✓ | Admin only |
| /api/subscribers | ✓ | Internet section |
| /api/subscriber-history | ✓ | |
| /api/internet/zones, fats, categories, materials | ✓ | |
| /api/internet/material-sales | ✓ | |
| /api/internet/reports/summary, details | GET | |
| /api/wallet-transactions | ✓ | |
| /api/expenses, /api/cashback-history | ✓ | |
| /api/card-wallet-transactions, purchases, sales | ✓ | |
| /api/office-materials, customers, sales, invoices | ✓ | |
| /api/partners, /api/partner-transactions | ✓ | |
| /api/suppliers | ✓ | |
| /api/settings | GET, PUT | |
| /api/sim-packages, inventory, sales, numbers | ✓ | |
| /api/notifications | GET, mark read | |
| /api/activity-log | GET | |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | DB connectivity check |
| GET | / | API welcome |

## Database Schema (Main Tables)

| Table | Purpose |
|-------|---------|
| users | Auth, roles, permissions |
| system_settings | Thresholds, office info |
| subscribers | Internet subscribers |
| subscriber_history | Subscription history |
| internet_zones, internet_fats | Network topology |
| subscription_categories | Pricing categories |
| internet_materials, internet_material_sales | Materials |
| wallet_transactions | FTTH/Wireless wallet |
| office_materials, office_customers | Office section |
| office_sales, office_invoices | Sales, invoices |
| partners, partner_transactions | Partners |
| suppliers, supplier_transactions | Suppliers |
| card_wallet_transactions, card_purchases, card_sales | Cards |
| expenses, cashback_history | Expenses |
| sim_packages, sim_numbers, sim_sales | SIM cards |
| notifications, activity_log | System |

## Migrations (Alembic)

```bash
cd backend
# Create migration after model changes
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head

# Fresh install: init + bootstrap, then stamp
alembic stamp head
```

## Config (pydantic-settings)

| Variable | Required | Default |
|----------|----------|---------|
| DATABASE_URL | No | postgresql://postgres:postgres@localhost:5432/king_office_new |
| SECRET_KEY | Yes (prod) | supersecretkey-change-in-production |
| ENVIRONMENT | No | development |
| ACCESS_TOKEN_EXPIRE_MINUTES | No | 10080 |

## Swagger Docs

- **Swagger UI:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc
