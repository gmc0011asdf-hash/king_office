# Skill: Schema Migration

## When to use
- Adding a new column to an existing table
- `UndefinedColumn` or `UndefinedTable` error at runtime
- Alembic migration exists but column is missing in real DB
- `alembic_version` table does not exist (schema was bootstrapped without alembic tracking)
- Need to verify DB schema matches SQLAlchemy model

---

## Files to Inspect First

```
backend/app/models/models.py                    # SQLAlchemy model declarations (source of truth for target schema)
backend/alembic/versions/                       # migration history
backend/app/core/db_bootstrap.py               # bootstrap logic (runs on startup)
backend/app/core/database.py                   # engine and session setup
```

---

## This Project's Migration Reality

**The database was bootstrapped without alembic tracking.** `SELECT version_num FROM alembic_version` raises `UndefinedTable`. This means:

- Alembic `upgrade head` will NOT apply correctly without stamping
- Migrations are useful as DDL reference, but must often be applied manually
- `create_all(checkfirst=True)` in `main.py` adds new tables but NOT new columns to existing tables

**Safe approach for adding/fixing columns:**

```python
import psycopg2
conn = psycopg2.connect(DATABASE_URL)
conn.autocommit = True
cur = conn.cursor()
cur.execute("ALTER TABLE tablename ADD COLUMN IF NOT EXISTS col_name COL_TYPE")
```

Or inline SQL:
```sql
ALTER TABLE tablename ADD COLUMN IF NOT EXISTS col_name COL_TYPE DEFAULT value;
```

`IF NOT EXISTS` is safe to run multiple times.

---

## Workflow

### Step 1 — Map the change
Define: source (model field) → target (DB column)
```
models.py: ClassName.field_name = Column(TYPE, nullable=True)
  ↓
DB: ALTER TABLE tablename ADD COLUMN IF NOT EXISTS field_name TYPE
```

### Step 2 — Check current state
```python
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='tablename' ORDER BY ordinal_position")
print([r[0] for r in cur.fetchall()])
```

### Step 3 — Apply change
Use `IF NOT EXISTS` for all `ADD COLUMN` statements.
Use `NOT NULL DEFAULT value` only when you have a sensible default.
Never use `NOT NULL` without a default on a populated table.

### Step 4 — Verify
```python
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='tablename'")
assert 'new_column' in [r[0] for r in cur.fetchall()]
```

### Step 5 — Restart backend
With `--reload`, uvicorn picks up model changes. But the DB schema must match the model before startup completes, or SQLAlchemy mapping will fail.

---

## Verifying Model vs DB Alignment

When a `UndefinedColumn` error occurs, compare the model to the real DB:

```python
# List columns that SQLAlchemy model expects
import inspect
from app.models.models import FtthCustomer
from sqlalchemy import inspect as sa_inspect
mapper = sa_inspect(FtthCustomer)
model_cols = [c.key for c in mapper.columns]
print(model_cols)

# List columns that actually exist in the DB
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='ftth_customers' ORDER BY ordinal_position")
db_cols = [r[0] for r in cur.fetchall()]
print(set(model_cols) - set(db_cols))  # Missing from DB
```

Apply any differences with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

---

## Forbidden Actions

- Do not run `DROP COLUMN` or `DROP TABLE` without explicit instruction
- Do not use `NOT NULL` on new columns without a DEFAULT on populated tables
- Do not run `alembic upgrade head` without first verifying `alembic_version` exists and is stamped
- Do not modify `backend/app/core/db_bootstrap.py` bootstrap SQL to add columns — use explicit ALTER instead

---

## Reference Model Location

`backend/app/models/models.py` — all 40+ SQLAlchemy model classes.
When a `UndefinedColumn` error appears, find the column name in this file to confirm its expected type.
