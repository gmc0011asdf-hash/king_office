# King Office — Skills Index

Skills for Claude Code agents working on this repository.
Each skill is a focused, evidence-based operating procedure grounded in the actual codebase.

## Skills

| File | When to use |
|---|---|
| [ftth-sync-debug.md](ftth-sync-debug.md) | FTTH sync fails, fdt/fat/zone are null after sync, InvalidToken, session poison |
| [schema-migration.md](schema-migration.md) | Adding/altering columns, alembic gap, missing column errors during runtime |
| [ftth-data-flow.md](ftth-data-flow.md) | Tracing how external FTTH data becomes a displayed UI value |
| [backend-diagnosis.md](backend-diagnosis.md) | Any backend 400/500 error; tracing route → service → DB |
| [frontend-module.md](frontend-module.md) | Adding/fixing UI in any module page; RTL, API binding, column display |
| [subscriber-import.md](subscriber-import.md) | FTTH → subscribers import flow, user_code generation, debt, status |
| [permissions-auth.md](permissions-auth.md) | Auth failures, JWT expiry, role/permission checks, SECRET_KEY rotation |
| [db-verification.md](db-verification.md) | Verifying real DB state after any change; row counts, column values, schema |
| [release-safety.md](release-safety.md) | Before any commit/deploy; checklist for this specific project |

## Priority Order

1. Read the relevant skill before proposing anything
2. Apply `.cursor/rules/` constraints
3. Follow the playbooks in `docs/agents/playbooks/`
4. Verify with real evidence before claiming success

## Project Root Guide

See `CLAUDE.md` at repository root for stack, commands, module map, and critical facts.
