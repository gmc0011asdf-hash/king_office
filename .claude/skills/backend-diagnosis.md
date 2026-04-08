# Skill: Backend Diagnosis

## When to use
- Any backend endpoint returns 400, 422, 500, or unexpected JSON
- Endpoint exists in OpenAPI but returns 404
- SQLAlchemy session error (`PendingRollbackError`, `DetachedInstanceError`)
- A DB write silently succeeds but data is not persisted
- Pydantic validation error in request or response
- Startup failure (import error, bootstrap failure)

---

## Files to Inspect First

```
backend/app/main.py                          # router registration, middleware, startup
backend/app/core/config.py                   # settings (DATABASE_URL, SECRET_KEY, ENVIRONMENT)
backend/app/core/database.py                 # engine, get_db dependency
backend/app/core/exception_handlers.py       # error response format
backend/app/routers/<module>.py              # top-level router (thin wrapper, imports module router)
backend/app/modules/<module>/routers/*.py    # actual endpoint logic
backend/app/models/models.py                 # SQLAlchemy models
backend/app/schemas/*.py                     # Pydantic request/response models
backend/logs/king_office.log                 # structured log output
```

---

## Diagnosis Workflow

### Step 1 — Reproduce with exact HTTP call
```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin@maktabalmalik.com&password=admin123" \
  | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -sv -X METHOD http://localhost:8000/api/PATH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{...}' 2>&1
```

### Step 2 — Check OpenAPI for the endpoint
```bash
curl -s http://localhost:8000/openapi.json | python -c "
import sys,json
d=json.load(sys.stdin)
[print(p) for p in d['paths'] if 'KEYWORD' in p]
"
```

### Step 3 — Read the log
```bash
# Last 50 lines
tail -50 backend/logs/king_office.log

# Filter by endpoint
grep "ENDPOINT_PATH\|ERROR\|EXCEPTION\|Traceback" backend/logs/king_office.log | tail -30
```

### Step 4 — Trace the route chain
This project has a layered routing pattern:
```
main.py includes app.routers.X (thin)
  ↓
app/routers/X.py imports from app.modules.X.routers.Y_router
  ↓
app/modules/X/routers/Y_router.py — actual endpoint logic
```

Find the router file, find the endpoint function, trace:
- Request body parsing (Pydantic schema)
- DB session usage (`Depends(get_db)`)
- Any `db.flush()` or `db.commit()` calls
- Any external service calls

### Step 5 — Check SQLAlchemy session state
If `PendingRollbackError` appears:
- A previous `db.flush()` or `db.execute()` failed and was not caught
- The session is now tainted; all subsequent operations on the same session fail
- Fix: ensure the failing operation is caught and the session is rolled back or the root cause (schema gap) is fixed

---

## Common Error Patterns

### UndefinedColumn
```
psycopg2.errors.UndefinedColumn: column "..." does not exist
```
→ Model declares a column not in the DB. Apply `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. See `schema-migration.md`.

### PendingRollbackError
```
sqlalchemy.exc.PendingRollbackError: This Session's transaction has been rolled back
```
→ A prior `flush()` failed. Find the line that called flush/execute before this error. Fix the underlying cause. The session cannot recover without `db.rollback()`.

### Pydantic validation (422)
```json
{"detail": [{"type": "missing", "loc": ["body", "field"]}]}
```
→ Request body doesn't match the Pydantic schema. Check the schema in `backend/app/schemas/`.

### InvalidToken (FTTH)
```
cryptography.fernet.InvalidToken
```
→ `SECRET_KEY` changed. Re-enter FTTH portal credentials. See `ftth-sync-debug.md`.

### Auth 401
```json
{"detail": "Could not validate credentials"}
```
→ JWT expired or invalid. Re-login. Token expiry is `ACCESS_TOKEN_EXPIRE_MINUTES` in `backend/.env`.

---

## API Client Pattern (Frontend)

The frontend uses `fetchApi` and `fetchApiWithTrace` from `src/api/client.ts`.
Errors are formatted via `formatHttpErrorMessage()`.
The `TraceResult` type wraps responses that carry `ok`, `source`, `message`, `trace`.

---

## Log Format

```
YYYY-MM-DD HH:MM:SS | LEVEL | module.path | message
```

Log file: `backend/logs/king_office.log` (rotated, structured via `backend/app/core/logging_config.py`)

---

## Session and Transaction Rules

- `get_db()` provides a single session per request (generator with try/finally rollback)
- Explicit `db.commit()` is called inside endpoints after mutations
- Explicit `db.flush()` is called before needing the generated ID
- If `flush()` raises an exception, the session is poisoned — do not attempt any more DB ops on it

---

## Health Check

```bash
curl http://localhost:8000/health
# Expected: {"status":"ok","database":"connected"}
```

If `database: "disconnected"` → check `DATABASE_URL` in `backend/.env` and PostgreSQL connectivity.
