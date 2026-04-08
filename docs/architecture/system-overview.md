# System Overview

## Layers
- Frontend: React/TypeScript app under `src`
- Backend: FastAPI + SQLAlchemy under `backend/app`
- Data: Postgres/Supabase-backed persistence
- Integrations: isolated external connectors, including FTTH

## Core Principles
- Diagnose first
- Minimal safe fixes
- Strict module isolation
- Preserve Arabic RTL UX exactly
