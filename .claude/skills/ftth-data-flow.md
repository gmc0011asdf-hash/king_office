# Skill: FTTH Data Flow

## When to use
- Tracing how a field value travels from the external portal to the UI
- Debugging why a field is null in the DB but visible on admin.ftth.iq
- Understanding what `fdt`, `fat`, `zone`, `onu_username` map to in the portal API
- Adding a new field from the portal response to the local schema

---

## Complete Data Flow

```
admin.ftth.iq API
  │
  ├─ GET /api/customers?pageNumber=N (list, one page of ~100)
  │    → raw list rows (id, name, status, zone, bundle, expires)
  │    → stored in list_row["_ftth_addr_batch_item"] = None initially
  │
  ├─ GET /api/addresses?accountIds=id1,id2,...  (batch, per page)
  │    → each item: {zone, customer, deviceDetails{username, fdt, fat}, displayValue}
  │    → stored in list_row["_ftth_addr_batch_item"] = address_item
  │
  ├─ GET /api/customers/{id}  (full mode, per customer)
  │    → {model: {primaryContact, addresses, customerType, usrReferralCode}}
  │    → stored as detail_raw
  │
  └─ GET /api/subscriptions OR bulk /api/subscriptions
       → {items: [{username, zone, bundle, expires, deviceDetails?, partner}]}
       → stored as sub_raw

Processing (ftth_unified_sync.py):
  ├─ build_unified_record(list_row, detail_raw, sub_raw)
  │    ├─ _group1_from_customer_detail_model(detail_model)  → phone, address, governorate, district...
  │    ├─ _group2_from_subscription_item_full(sub_item)     → zone, bundle, fdt, fat, onu_username...
  │    └─ _merge_addr_batch_into_unified(unified, list_row) → zone, fdt, fat, onu_username (from deviceDetails)
  │
  └─ unified_record_to_ftth_norm(unified)  → normalized dict for DB insert

Persistence (engine.py):
  ├─ _upsert_ftth_norm_batch()  → INSERT/UPDATE ftth_external_data (upsert on external_id)
  └─ Sync to ftth_customers via FtthCustomer model (projection from ftth_external_data)
```

---

## Field Source Priority

| Field | Primary Source | Fallback |
|---|---|---|
| `zone` | `addresses` response: `item.zone.displayValue` | subscriptions `zone.displayValue` |
| `fat` | `addresses` response: `item.deviceDetails.fat.displayValue` | none (no regex fallback) |
| `fdt` | `addresses` response: `item.deviceDetails.fdt.displayValue` | none |
| `onu_username` | `addresses` response: `item.deviceDetails.username` | subscriptions `username` |
| `onu_serial` | `addresses` response: `item.deviceDetails.serial` | subscriptions `serial` |
| `phone` | customer detail `primaryContact.mobile` | address batch `customer.*` |
| `address` | customer detail `addresses[0].displayValue` | address batch `displayValue` |
| `governorate` | customer detail `addresses[0].governorate.displayValue` | — |
| `full_name` | customer detail `self.displayValue` | list row `displayValue` |
| `subscription_status` | subscriptions `status` | list row `status` |
| `subscription_end_date` | subscriptions `expires` | list row `expires` |

---

## Address Batch Response Structure

**Actual structure** (verified from `backend/logs/king_office.log`):
```json
{
  "zone": {"id": "FAM0193-3", "displayValue": "FAM0193-3"},
  "partner": {"id": "3102422", "displayValue": "..."},
  "customer": {"type": 1, "id": "3093841", "displayValue": "مصطفى دعير..."},
  "deviceDetails": {
    "username": "FAM193FAT2PORT13",
    "serial": "TDTC35958BF8",
    "fdt": {"id": "a6eed299-...", "displayValue": "FAM193-3"},
    "fat": {"id": "b27c51e3-...", "displayValue": "FAT2"}
  },
  "governorate": {"id": "...", "displayValue": "Misan"},
  "district": {"id": "...", "displayValue": "Ali al Gharbi"},
  "neighborhood": "1",
  "nearestPoint": "1/1/1",
  "displayValue": "Misan, Ali al Gharbi, 1/1/1, Nbhd. 1, Str. 1, House 1"
}
```

**Key facts:**
- `deviceDetails` is at **top level** of each item — NOT inside `ftthAddress`
- `fdt` and `fat` are objects with `displayValue` — use `_extract_ftth_fat_label()` or `v.get("displayValue")`
- `ftthAddress` key does not appear in this portal's response

---

## Mapping Code Location

```
ftth_unified_sync.py
  _merge_addr_batch_into_unified()  ← address batch → unified dict (fdt, fat, zone, onu_username)
  _group1_from_customer_detail_model() ← customer detail → phone, address, name
  _group2_from_subscription_item_full() ← subscription → zone, bundle, dates, onu_username
  build_unified_record()            ← orchestrates all three groups
  unified_record_to_ftth_norm()     ← unified dict → DB-ready norm dict

engine.py
  _norm_to_ftth_row_dict()          ← norm → ftth_external_data columns
  _upsert_ftth_norm_batch()         ← upsert to ftth_external_data
```

---

## Adding a New Field

1. Confirm field name in the real API response (check logs or HAR at `docs/samples/admin.ftth.iq.har`)
2. Add column to `ftth_external_data` model in `models.py` (and `FtthCustomer` if needed)
3. Apply `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (see schema-migration.md)
4. Add extraction in the correct function in `ftth_unified_sync.py`
5. Add mapping in `unified_record_to_ftth_norm()` in `ftth_unified_sync.py`
6. Add to `_ftth_external_staging_column_keys()` in `engine.py` if it needs to appear in the staging insert
7. Re-run sync and verify with DB query

---

## Log Verification Points

```bash
# Check address batch items (contains real fdt/fat values)
grep "FTTH RAW ADDRESS ROW" backend/logs/king_office.log | tail -5

# Check unified record built for a specific customer
grep "FTTH first raw record" backend/logs/king_office.log | tail -1 | python -c "import sys; print(sys.stdin.read()[:2000])"

# Check saved record preview
grep "SAVED RECORD PREVIEW" backend/logs/king_office.log | tail -3
```

---

## Forbidden

- Do not infer `fat` from `onu_username` regex (`FAT\d+` pattern) — this is explicitly forbidden
- Do not use `list_url` endpoint as the source for fdt/fat — it only has zone and username
- Do not patch the UI to show derived/inferred values if the pipeline source is wrong
