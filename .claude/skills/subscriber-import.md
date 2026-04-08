# Skill: Subscriber Import (FTTH → Local Subscribers)

## When to use
- Importing FTTH portal customers into the local `subscribers` table
- Debugging why `user_code` is generated incorrectly
- Understanding how `national_id_name` vs `real_name` is populated during import
- Debugging the bulk import (`import-all-pending`) endpoint
- Tracing how `subscriber_id` is linked back to `ftth_customers`

---

## Files to Inspect First

```
backend/app/modules/internet/routers/ftth_portal_router.py   # import endpoints
backend/app/integrations/ftth/ftth_app_customer_sync.py      # sync from ftth_customers to subscribers
backend/app/models/models.py                                  # Subscriber, FtthCustomer models
backend/app/schemas/ftth.py                                   # FtthImportRequest schema
```

---

## Import Flow

### Single import: `POST /api/ftth/portal/import-to-subscriber`
```
Request: FtthImportRequest { external_customer_id, ... }
  ↓
Reads FtthCustomer by external_customer_id
  ↓
Builds Subscriber record:
  - national_id_name = ftth customer full_name (FTTH name → national ID field)
  - real_name = empty (filled manually later from edit subscriber)
  - phone = from ftth_customer.phone
  - zone = from ftth_customer.zone
  - fat = from ftth_customer.fat
  - category = from request or subscription bundle
  - expiration_date = from ftth_customer.subscription_end_date
  - subscription_date = computed from expiration_date + commitment_days
  - user_code = built from name + zone + fat + phone (see below)
  ↓
INSERT/UPDATE subscribers
  ↓
UPDATE ftth_customers SET subscriber_id = new_subscriber.id
```

### Bulk import: `POST /api/ftth/portal/import-all-pending`
Same flow, iterates over `ftth_customers WHERE subscriber_id IS NULL LIMIT {limit}` (default 300).

---

## user_code Generation

`user_code` is built from: `national_id_name + zone + FAT + phone`

Pattern (from FTTH README):
- Derived from the national name (or real_name if present) + zone + FAT + phone
- Normalized for uniqueness
- Stored in `subscribers.user_code` with `UNIQUE` constraint

If `user_code` collision occurs → append sequence suffix.

---

## Key Field Mapping

| subscribers column | Source |
|---|---|
| `national_id_name` | `ftth_customer.full_name` |
| `real_name` | Empty at import time |
| `phone` | `ftth_customer.phone` |
| `zone` | `ftth_customer.zone` |
| `fat` | `ftth_customer.fat` |
| `subscription_date` | Computed: `expiration_date - commitment_days` |
| `expiration_date` | `ftth_customer.subscription_end_date` |
| `status` | Derived: `Active` if `expiration_date >= today`, else `Expired` |
| `debt` | 0 at import (manually updated later) |

---

## Commitment Days / Date Computation

Logic in `backend/app/integrations/ftth/ftth_dates.py`:
- Default: 30 days (1 month)
- `resolve_ftth_dates(expiration_date, commitment_days, subscription_date)` → `(start, end)`
- Month = 30 calendar days (not calendar month)
- Tests: `backend/tests/test_ftth_dates.py`

---

## Verification

After import, verify:
```sql
SELECT s.id, s.user_code, s.national_id_name, s.zone, s.fat,
       s.subscription_date, s.expiration_date, s.status,
       fc.external_customer_id
FROM subscribers s
JOIN ftth_customers fc ON fc.subscriber_id = s.id
ORDER BY s.id DESC
LIMIT 5;
```

---

## Forbidden

- Do not set `real_name` at import time from FTTH data — it is for manually-entered names
- Do not change the `national_id_name` ↔ FTTH name mapping without owner approval
- Do not bulk-update `status` directly — it must be derived from `expiration_date`
- Do not skip the `subscriber_id` linkback in `ftth_customers`
