# FTTH Sync Quality & Portal UI Fix — Design Spec

**Date:** 2026-04-03  
**Branch:** ftth-portal-ui-integration  
**Scope:** `backend/app/integrations/ftth/` and `src/modules/internet/page/FTTHPortal.tsx`  
**Approach:** B (Targeted Full Fix)

---

## Problem Summary

The FTTH sync was running in `list_only` mode despite being configured for `ftth_iq_admin`. This caused most synced fields (phone, zone, fat, service_username, location, start_date, end_date, status) to be null, and names to appear masked. Additionally, `remaining_days` was hardcoded to `None`, debug logging was excessive, warmup requests repeated per HTTP call, and the portal UI rendered hardcoded columns regardless of what fields were actually populated.

---

## Root Causes

| # | Root Cause | Location |
|---|---|---|
| 1 | `ftth_sync_fast_mode: true` in DB `parse_options` bypasses the full-mode guard | `engine.py:825` |
| 2 | `remaining_days` hardcoded to `None` | `ftth_unified_sync.py:1014` |
| 3 | `print()` on every DB row save | `engine.py:403–467` |
| 4 | `ftth_sync_debug_payloads: True` default logs full JSON per customer | `engine.py:71` |
| 5 | `_ftth_log_endpoint_attempt` at INFO level on every HTTP attempt | `ftth_iq_api.py:92–101` |
| 6 | `_warmup_admin_httpx` called inside every `httpx.Client` context | `ftth_iq_api.py:308–314` |
| 7 | Portal UI columns are hardcoded | `FTTHPortal.tsx:857–868` |
| 8 | Names masked in source (source-side, unresolvable) | admin.ftth.iq API |

---

## Architecture

### Sync Flow (Before vs After)

**Before:**
```
DB parse_options {ftth_sync_fast_mode: true}
  → _merge_options()
  → opts["ftth_sync_fast_mode"] = True
  → guard at engine.py:825 skipped
  → run_ftth_unified_sync → LIST_ONLY
  → build_unified_customer_from_list_row (no GET /customers/{id}, no subscriptions)
  → all detail fields null
```

**After:**
```
DB parse_options (any value)
  → _merge_options()
  → engine.py: opts["ftth_sync_fast_mode"] = False (enforced unconditionally for ftth_iq_admin)
  → run_ftth_unified_sync → FULL
  → fetch_unified_customer_bundle per customer
    → GET /customers/{id} → phone, address, governorate, district, name
    → GET /customers/{id}/subscriptions → zone, fat, fdt, service_username, start_date, end_date, status
  → remaining_days computed from end_date
```

### Warmup (Before vs After)

**Before:** `_warmup_admin_httpx` runs 2 GETs inside every `with httpx.Client()` block — once per detail fetch, once per subscription fetch, once per address batch = O(N) warmup requests.

**After:** Module-level `_ftth_warmup_done` threading flag. `_warmup_admin_httpx` checks and sets it — warmup runs at most once per process lifetime (reset at sync start via `reset_ftth_warmup_flag()`).

### Portal UI (Before vs After)

**Before:** Fixed table with 11 hardcoded columns. Fields populated after full-mode fix (fdt, bundle, ip_address, partner_name, etc.) are invisible.

**After:** Same fixed table (unchanged Arabic RTL), plus a dynamic "extra fields" inline badge strip per row, driven by `raw_payload` fields: shows any non-null field not already covered by a main column. The `FtthPortalCustomerRow` type gains optional `raw_payload?: Record<string, unknown>`. The API endpoint includes `raw_payload` in the row response.

---

## Files to Change

| File | Why |
|---|---|
| `backend/app/integrations/ftth/engine.py` | (1) Enforce `ftth_sync_fast_mode = False` unconditionally for ftth_iq_admin. (2) Compute `remaining_days` after `_parse_date(end_date)` in `_upsert_unified_page`. (3) Remove all `print()` statements. (4) Change `ftth_sync_debug_payloads` default to `False`. |
| `backend/app/integrations/ftth/ftth_iq_api.py` | (5) Change `_ftth_log_endpoint_attempt` URL/status/body lines to DEBUG level. (6) Add `_ftth_warmup_done` threading.Event flag + `reset_ftth_warmup_flag()` + guard in `_warmup_admin_httpx`. |
| `backend/app/schemas/ftth.py` | (7) Add `raw_payload: Optional[dict] = None` to `FtthPortalCustomerRowOut`. |
| `backend/app/modules/internet/routers/ftth_portal_router.py` | (7) Pass `raw_payload=c.raw_payload` in `_ftth_portal_customer_row_out`. |
| `src/modules/internet/page/components/types.ts` | (7) Add `raw_payload?: Record<string, unknown> \| null` to `FtthPortalCustomerRow`. |
| `src/modules/internet/page/FTTHPortal.tsx` | (7) Read `raw_payload` in `normalizeFtthPortalCustomerRow`. Render dynamic extra-fields strip per row below the main columns. |

**Files NOT changed:**
- `backend/app/integrations/ftth/ftth_unified_sync.py` — `remaining_days` fix is in engine.py after `_parse_date`, avoiding import changes here
- Any non-FTTH module
- Main system routes
- Arabic RTL layout or other UI modules
- DB schema / migrations (no new columns needed — `raw_payload` already exists in `ftth_customers`)


---

## Component Designs

### 1. Enforce full mode (`engine.py`)

In `sync_ftth_subscribers`, after `opts = _merge_options(...)` and `parse_mode = ...`:

```python
# Always enforce full mode for ftth_iq_admin — ignore any parse_options override
if parse_mode == "ftth_iq_admin":
    opts["ftth_sync_fast_mode"] = False
    opts["sync_mode"] = "full"
    opts["ftth_sync_profile"] = "full"
    opts["ftth_sync_skip_customer_detail"] = False
```

This replaces the conditional guard that only ran when fast_mode was already false.

### 2. Remaining days computation (`engine.py` only)

In `_upsert_unified_page`, after:
```python
row["end_date"] = _parse_date(row.get("end_date"))
```
add:
```python
if row.get("remaining_days") is None and row.get("end_date") is not None:
    row["remaining_days"] = compute_remaining_days(row["end_date"])
```

`compute_remaining_days` is already imported in `engine.py` from `ftth_dates`. This avoids any change to `ftth_unified_sync.py`.

### 3. Remove print() / reduce logging (`engine.py`)

Remove all `print(...)` calls inside `_upsert_ftth_norm_batch_chunk_execute`. Change `ftth_sync_debug_payloads` default from `True` to `False`.

### 4. Warmup flag (`ftth_iq_api.py`)

```python
_ftth_warmup_done = threading.Event()

def reset_ftth_warmup_flag() -> None:
    _ftth_warmup_done.clear()

def _warmup_admin_httpx(client: httpx.Client) -> None:
    if _ftth_warmup_done.is_set():
        return
    _ftth_warmup_done.set()
    for u, ref in _admin_warmup_targets():
        ...
```

Call `reset_ftth_warmup_flag()` at the start of each sync run (in `engine.py` alongside `reset_ftth_raw_debug_counters()`).

### 5. Endpoint attempt logging (`ftth_iq_api.py`)

Change `_ftth_log_endpoint_attempt` body from `logger.info(...)` to `logger.debug(...)` for the URL/status/body lines. Keep `logger.warning` for non-200 status.

### 6. Expose raw_payload in schema and router (`ftth.py` + `ftth_portal_router.py`)

In `FtthPortalCustomerRowOut` (schemas/ftth.py), add:
```python
raw_payload: Optional[dict] = None
```

In `_ftth_portal_customer_row_out` (ftth_portal_router.py), add `raw_payload=c.raw_payload` to the constructor call.

### 7. Portal UI dynamic fields (`FTTHPortal.tsx` + `types.ts`)

`FtthPortalCustomerRow` gains:
```typescript
raw_payload?: Record<string, unknown> | null;
```

In `normalizeFtthPortalCustomerRow`:
```typescript
raw_payload: (r.raw_payload ?? null) as Record<string, unknown> | null,
```

**MAIN_COLS** = set of field names already rendered in main columns (phone, zone, fat, onu_username, address, subscription_start_date, subscription_end_date, bundle, subscription_status, full_name, external_customer_id).

In the table row, after the existing `<td>` cells and before the action cell, add:
- If `raw_payload` has keys not in MAIN_COLS with non-null/non-empty values, render a compact inline badge strip showing `label: value`.
- Labels are Arabic-mapped for known field names; unknown fields show the key as-is.
- Only non-null, non-empty string, non-zero values are shown.
- RTL direction preserved (container is `dir="rtl"`).

---

## Error Handling

- If `compute_remaining_days` returns None (no end_date or invalid date), `remaining_days` stays null — safe fallback.
- Warmup flag failure is non-fatal; warmup errors were already `except: continue`.
- Portal extra fields rendering: if `raw_payload` is null or empty, extra strip is simply not rendered.

---

## Testing Checklist

After implementation, verify:

1. Log line `FTTH SYNC MODE EFFECTIVE` shows `full`, NOT `list_only`
2. Log line `FTTH_SYNC_TRACE run_ftth_unified_sync: page=N sync_mode=full`
3. Detail fetch logs appear: `FTTH DETAIL FETCH URL (primary): .../customers/{id}`
4. Subscription fetch logs appear
5. Normalized row sample log shows non-null phone/zone/fat/status/start_date/end_date
6. `remaining_days` is non-null for records with a valid `end_date`
7. No `print(...)` output on stdout during sync
8. Warmup log appears only once per sync run, not N times
9. Portal table renders extra-fields strip for records with additional populated data
10. Arabic RTL layout unchanged
11. Confirm that names remain masked (source-side limitation confirmed)

---

## Source-Side Limitation

Names (`full_name` / `national_name`) will remain masked with stars (`***`) from the admin.ftth.iq API. This is a permission-level restriction on the contractor account — the API masks names regardless of which endpoint is used (`/customers`, `/customers/summary`, `/customers/{id}`). This is **not fixable** in this codebase. The real name must be entered manually via the "ترحيل" import flow.
