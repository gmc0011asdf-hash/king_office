# Skill: FTTH Sync Debug

## When to use
- `POST /api/ftth/portal/sync` returns 400 `{"detail":""}`
- `fdt`, `fat`, or `zone` are null after a successful sync
- Log shows `InvalidToken` or `InvalidSignature` on `decrypt_str`
- Log shows `PendingRollbackError` blocking data writes
- Log shows `column "portal_config_id" of relation "ftth_sync_runs" does not exist`
- Sync completes but `ftth_external_data` or `ftth_customers` row count is 0

---

## Files to Inspect First

```
backend/app/integrations/ftth/engine.py            # sync orchestration, upsert, sync_runs insert
backend/app/integrations/ftth/ftth_unified_sync.py # data normalization, _merge_addr_batch_into_unified
backend/app/integrations/ftth/ftth_iq_api.py       # HTTP fetches, address batch, token
backend/app/integrations/ftth/ftth_dates.py        # commitment period, date math
backend/app/modules/internet/routers/ftth_portal_router.py  # API endpoint, session_commit
backend/logs/king_office.log                        # real-time evidence
```

---

## Known Root Causes and Fixes

### 1. InvalidToken on decrypt_str (sync returns 400)

**Cause:** `SECRET_KEY` changed after FTTH portal credentials were stored. Stored `username_enc`/`password_enc` in `ftth_portal_config` were encrypted with the old key.

**Fix:** Re-enter portal credentials via setup endpoint:
```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=ADMIN_EMAIL&password=ADMIN_PASSWORD" | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -X POST http://localhost:8000/api/ftth/portal/setup \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"login_url":"https://admin.ftth.iq/auth/login","username":"FTTH_USER","password":"FTTH_PASS","parse_mode":"ftth_iq_admin"}'
```

**Evidence location:** `backend/.env` → `SECRET_KEY`; portal credentials: `docs/samples/admin.ftth.iq.har`

---

### 2. fdt / fat null after sync

**Root cause:** `_merge_addr_batch_into_unified` in `ftth_unified_sync.py` reads:
```python
addr = ab.get("ftthAddress")
if not isinstance(addr, dict):
    return   # ← exits here because "ftthAddress" key does not exist
```
But the actual `GET /api/addresses?accountIds=...` response puts `deviceDetails`, `zone`, and `displayValue` at the **top level** of each item, not inside a `"ftthAddress"` sub-object.

**Verified response structure (from logs):**
```json
{
  "zone": {"id": "FAM0193-3", "displayValue": "FAM0193-3"},
  "customer": {"id": "3093841"},
  "deviceDetails": {
    "username": "FAM193FAT2PORT13",
    "fdt": {"id": "...", "displayValue": "FAM193-3"},
    "fat": {"id": "...", "displayValue": "FAT2"}
  },
  "displayValue": "Misan, Ali al Gharbi, ..."
}
```

**Fix already applied:** `addr_src = addr if isinstance(addr, dict) else ab`

**Verification query after sync:**
```sql
SELECT external_id, zone, fat, fdt FROM ftth_external_data WHERE fdt IS NOT NULL LIMIT 3;
```

---

### 3. PendingRollbackError / session poison from ftth_sync_runs

**Cause:** `db.flush()` on `FtthSyncRun` insert fails because `ftth_sync_runs` table is missing new columns. The flush failure taints the SQLAlchemy session, blocking all subsequent data writes.

**Missing columns in `ftth_sync_runs`:**
- `portal_config_id BIGINT REFERENCES ftth_portal_config(id) ON DELETE SET NULL`
- `total_external_new INTEGER NOT NULL DEFAULT 0`
- `total_external_updated INTEGER NOT NULL DEFAULT 0`
- `total_ftth_customers_upserted INTEGER NOT NULL DEFAULT 0`
- `total_ftth_customers_failed INTEGER NOT NULL DEFAULT 0`
- `error_message TEXT`

**Fix (apply once with psycopg2 or direct SQL):**
```sql
ALTER TABLE ftth_sync_runs ADD COLUMN IF NOT EXISTS portal_config_id BIGINT REFERENCES ftth_portal_config(id) ON DELETE SET NULL;
ALTER TABLE ftth_sync_runs ADD COLUMN IF NOT EXISTS total_external_new INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ftth_sync_runs ADD COLUMN IF NOT EXISTS total_external_updated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ftth_sync_runs ADD COLUMN IF NOT EXISTS total_ftth_customers_upserted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ftth_sync_runs ADD COLUMN IF NOT EXISTS total_ftth_customers_failed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ftth_sync_runs ADD COLUMN IF NOT EXISTS error_message TEXT;
```

---

### 4. ftth_customers API returns 400 (created_at_external missing)

**Cause:** Model `FtthCustomer` in `models.py:584` declares `created_at_external` but DB table lacks this column.

**Fix:**
```sql
ALTER TABLE ftth_customers ADD COLUMN IF NOT EXISTS created_at_external TIMESTAMP WITH TIME ZONE;
```

---

## Diagnosis Checklist

```bash
# 1. Check last sync result
tail -100 backend/logs/king_office.log | grep -E "SYNC SUCCESS|SYNC FAILED|SYNC SUMMARY|InvalidToken|PendingRollback"

# 2. Verify DB has data after sync
python -c "
import psycopg2
conn = psycopg2.connect('DATABASE_URL_HERE')
cur = conn.cursor()
cur.execute('SELECT COUNT(*) FROM ftth_external_data')
print('ftth_external_data rows:', cur.fetchone()[0])
cur.execute(\"SELECT COUNT(*) FROM ftth_external_data WHERE fdt IS NOT NULL AND fdt != ''\")
print('with fdt:', cur.fetchone()[0])
cur.execute(\"SELECT COUNT(*) FROM ftth_external_data WHERE fat IS NOT NULL AND fat != ''\")
print('with fat:', cur.fetchone()[0])
conn.close()
"

# 3. Check sync_runs schema
python -c "
import psycopg2
conn = psycopg2.connect('DATABASE_URL_HERE')
cur = conn.cursor()
cur.execute(\"SELECT column_name FROM information_schema.columns WHERE table_name='ftth_sync_runs' ORDER BY ordinal_position\")
print([r[0] for r in cur.fetchall()])
"

# 4. Find address batch response in logs (contains real fdt/fat values)
grep "ADDRESS RESPONSE TEXT" backend/logs/king_office.log | tail -3
```

---

## Forbidden Actions

- Do not infer `fat` from `onu_username` regex — explicitly forbidden by project owner
- Do not use `list_url` fallback as primary source for fdt/fat — it does not include `deviceDetails`
- Do not patch the UI to show "N/A" for fdt/fat — fix the sync pipeline source
- Do not skip `db.rollback()` after a session-poisoning flush failure

---

## Source of Truth for fdt/fat

`GET https://admin.ftth.iq/api/addresses?accountIds=...`
→ response item top-level `deviceDetails.fdt.displayValue` and `deviceDetails.fat.displayValue`

Mapping code: `backend/app/integrations/ftth/ftth_unified_sync.py` → `_merge_addr_batch_into_unified()`
