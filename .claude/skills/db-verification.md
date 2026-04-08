# Skill: Database Verification

## When to use
- After any schema change, to confirm it was applied
- After a sync or import, to confirm data was persisted
- Before claiming a fix works — real evidence required
- To count rows or spot-check field values after any backend change

---

## Connection

```python
import psycopg2
# DATABASE_URL from backend/.env
conn = psycopg2.connect('postgresql://postgres.PROJECTID:PASSWORD@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require')
cur = conn.cursor()
```

Or use the API endpoints (preferred when backend is running):
```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin@maktabalmalik.com&password=admin123" \
  | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
```

---

## Standard Verification Queries

### Schema check
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'tablename'
ORDER BY ordinal_position;
```

### Row count
```sql
SELECT COUNT(*) FROM tablename;
```

### FTTH data after sync
```sql
-- Count with populated fdt/fat
SELECT COUNT(*) FROM ftth_external_data WHERE fdt IS NOT NULL AND fdt != '';
SELECT COUNT(*) FROM ftth_external_data WHERE fat IS NOT NULL AND fat != '';

-- Sample rows with key fields
SELECT external_id, zone, service_username, fdt, fat, status
FROM ftth_external_data
WHERE fdt IS NOT NULL
LIMIT 5;
```

### ftth_customers after sync
```sql
SELECT external_customer_id, zone, onu_username, fdt, fat, subscription_status
FROM ftth_customers
WHERE fdt IS NOT NULL
LIMIT 5;
```

### Subscribers after import
```sql
SELECT s.id, s.user_code, s.national_id_name, s.zone, s.fat,
       s.expiration_date, s.status,
       fc.external_customer_id
FROM subscribers s
LEFT JOIN ftth_customers fc ON fc.subscriber_id = s.id
ORDER BY s.id DESC
LIMIT 5;
```

### Tables with data (quick scan)
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

### FTTH sync runs
```sql
SELECT id, portal_config_id, status, started_at, finished_at,
       total_external_new, total_external_updated,
       total_ftth_customers_upserted, error_message
FROM ftth_sync_runs
ORDER BY id DESC
LIMIT 5;
```

---

## Via API (when backend is running)

```bash
# FTTH external data via API
curl -s "http://localhost:8000/api/ftth/portal/external-data?page=1&per_page=3" \
  -H "Authorization: Bearer $TOKEN"

# FTTH customers list
curl -s "http://localhost:8000/api/ftth/portal/customers?page=1&per_page=3" \
  -H "Authorization: Bearer $TOKEN"

# Portal config status
curl -s http://localhost:8000/api/ftth/portal/status \
  -H "Authorization: Bearer $TOKEN"

# Subscriber list
curl -s "http://localhost:8000/api/internet/subscribers?page=1&per_page=3" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Tables and Row Expectations

| Table | Expected rows (production) | Notes |
|---|---|---|
| `users` | 1+ | Admin always present |
| `system_settings` | 1 | Singleton |
| `ftth_portal_config` | 0 or 1 | 1 when configured |
| `ftth_external_data` | 100+ after sync | 0 = sync never succeeded or was rolled back |
| `ftth_customers` | 0 (projection populated on demand) | |
| `subscribers` | 100+ | Local subscriber records |
| `internet_zones` | 7 | Fixed zones |
| `internet_fats` | 91 | FAT points per zone |
| `subscription_categories` | 5 | FTTH service tiers |

---

## Evidence Format for Verification Reports

When reporting verification results, always include:

1. **Exact SQL query used**
2. **Exact result** (not "similar to" or "approximately")
3. **Timestamp** (from log line or query)
4. **HTTP status + response** for API calls

Do not say "should be working" — show the actual row or output.

---

## Alembic Version Check

```sql
SELECT version_num FROM alembic_version;
-- If this raises "UndefinedTable", migrations were never tracked.
-- Apply schema changes directly with ALTER TABLE IF NOT EXISTS.
```
