# FTTH Sync Quality & Portal UI Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix FTTH sync running in list_only mode, compute remaining_days, eliminate debug noise and warmup overhead, and add a dynamic extra-fields section to the FTTH portal table.

**Architecture:** Six targeted changes across 6 files in the FTTH integration. No schema migrations needed — `raw_payload` already exists in `ftth_customers`. Full mode is enforced in `engine.py` at merge time; an explicit `ftth_sync_force_list_only` parse option allows intentional list-only. Warmup is guarded by a `threading.Event` that resets once per sync run. The portal table keeps all fixed columns and adds an optional sub-row/section for non-null extra fields from `raw_payload`.

**Tech Stack:** Python 3.12 + FastAPI + SQLAlchemy (backend); React + TypeScript + Tailwind (frontend). No new dependencies.

---

## File Map

| File | Change |
|---|---|
| `backend/app/integrations/ftth/engine.py` | Tasks 1 & 2: enforce full mode, compute remaining_days, remove print(), change debug default |
| `backend/app/integrations/ftth/ftth_iq_api.py` | Task 3: warmup flag, endpoint log level |
| `backend/app/schemas/ftth.py` | Task 4: add raw_payload to FtthPortalCustomerRowOut |
| `backend/app/modules/internet/routers/ftth_portal_router.py` | Task 4: pass raw_payload in row helper |
| `src/modules/internet/page/components/types.ts` | Task 5: add raw_payload to FtthPortalCustomerRow |
| `src/modules/internet/page/FTTHPortal.tsx` | Task 5: read raw_payload, render extra-fields sub-row in desktop table and mobile cards |

---

## Task 1: Enforce full mode in engine.py (root cause fix)

**Files:**
- Modify: `backend/app/integrations/ftth/engine.py:819–829` (mode guard block)
- Modify: `backend/app/integrations/ftth/engine.py:1187–1193` (return dict)

### Context

The root cause: `ftth_sync_fast_mode: true` in `cfg.parse_options` passes through `_merge_options()` into `opts`, bypassing the `if not ftth_sync_fast_mode_enabled(opts)` guard, resulting in list_only mode. Fix: unconditionally enforce full mode for `ftth_iq_admin`; provide `ftth_sync_force_list_only` as the explicit override.

- [ ] **Step 1: Read the current mode guard**

Open `backend/app/integrations/ftth/engine.py` and locate lines around 819–829. Current code:
```python
opts = _merge_options(cfg.parse_options if isinstance(cfg.parse_options, dict) else {})
parse_mode = (cfg.parse_mode or "json_generic").lower()
list_url = (cfg.list_url or "").strip()

# بوابة admin.ftth.iq: افتراضياً مزامنة كاملة لكل عميل (تفاصيل + اشتراك).
# المسار الخفيف (list_only): فقط عند ftth_sync_fast_mode — لا يعتمد على sync_mode النصي القديم.
if parse_mode == "ftth_iq_admin" and not ftth_sync_fast_mode_enabled(opts):
    opts["sync_mode"] = "full"
    opts["ftth_sync_profile"] = "full"
    opts["ftth_sync_skip_customer_detail"] = False
```

- [ ] **Step 2: Replace the mode guard with unconditional enforcement**

Replace the block shown above (from `opts = _merge_options` through the end of the `if` block) with:

```python
opts = _merge_options(cfg.parse_options if isinstance(cfg.parse_options, dict) else {})
parse_mode = (cfg.parse_mode or "json_generic").lower()
list_url = (cfg.list_url or "").strip()

# بوابة admin.ftth.iq: وضع الكامل افتراضي دائماً.
# ftth_sync_fast_mode في parse_options لا يُفعّل list_only بعد الآن — استخدم ftth_sync_force_list_only: true للحاجة الصريحة.
_sync_mode_effective = "unknown"
if parse_mode == "ftth_iq_admin":
    _raw_opts = cfg.parse_options if isinstance(cfg.parse_options, dict) else {}
    _user_force_list_only = bool(_raw_opts.get("ftth_sync_force_list_only"))
    if _user_force_list_only:
        _sync_mode_effective = "list_only_forced"
        logger.warning(
            "FTTH SYNC: ftth_sync_force_list_only=True — "
            "running list-only mode (partial data). Full mode is the default."
        )
    else:
        _sync_mode_effective = "full"
        opts["ftth_sync_fast_mode"] = False
        opts["sync_mode"] = "full"
        opts["ftth_sync_profile"] = "full"
        opts["ftth_sync_skip_customer_detail"] = False
        logger.info(
            "FTTH SYNC: full mode enforced (ftth_sync_fast_mode in parse_options is ignored; "
            "use ftth_sync_force_list_only: true for intentional list-only)"
        )
```

- [ ] **Step 3: Add sync_mode_effective to the ftth_iq_admin return dict**

Find the return statement inside the `if parse_mode == "ftth_iq_admin":` block (around line 1187):
```python
        return {
            "new_count": new_count,
            "updated_count": updated_count,
            "pages_fetched": pages_fetched,
            "message": f"تمت المزامنة من FTTH IQ: {new_count} جديد، {updated_count} محدّث",
            **summary_obj,
        }
```

Replace with:
```python
        return {
            "new_count": new_count,
            "updated_count": updated_count,
            "pages_fetched": pages_fetched,
            "message": f"تمت المزامنة من FTTH IQ: {new_count} جديد، {updated_count} محدّث",
            "sync_mode_effective": _sync_mode_effective,
            **summary_obj,
        }
```

- [ ] **Step 4: Verify the change is correct**

Check that `_sync_mode_effective` is declared before the `if parse_mode == "demo":` block so it's always in scope at the return point. If it's not used in demo or json_generic paths, that's fine — those branches return earlier before reaching the ftth_iq_admin return.

Confirm there are no other references to the old conditional guard pattern in the same function. Run a quick search:
```
grep -n "ftth_sync_fast_mode_enabled" backend/app/integrations/ftth/engine.py
```
Expected: lines 37 (import) and 1080–1082 (existing log statement that now correctly logs False). No other uses.

- [ ] **Step 5: Commit**

```bash
git add backend/app/integrations/ftth/engine.py
git commit -m "fix(ftth): enforce full sync mode for ftth_iq_admin, add sync_mode_effective to result

ftth_sync_fast_mode in parse_options no longer triggers list_only.
Use ftth_sync_force_list_only: true for intentional list-only mode.
Sync result now includes sync_mode_effective field."
```

---

## Task 2: Compute remaining_days, remove print(), disable debug_payloads default

**Files:**
- Modify: `backend/app/integrations/ftth/engine.py:57–95` (DEFAULT_PARSE_OPTIONS)
- Modify: `backend/app/integrations/ftth/engine.py:948–960` (_upsert_unified_page, end_date section)
- Modify: `backend/app/integrations/ftth/engine.py:369–520` (_upsert_ftth_norm_batch_chunk_execute, all print() calls)

### Context

`remaining_days` is hardcoded to `None` in `unified_record_to_ftth_norm`; it must be computed after `_parse_date(end_date)` in the upsert pipeline. `ftth_sync_debug_payloads: True` floods logs with full JSON per customer. Six `print()` calls in `_upsert_ftth_norm_batch_chunk_execute` spam stdout on every save.

- [ ] **Step 1: Change ftth_sync_debug_payloads default from True to False**

In `DEFAULT_PARSE_OPTIONS` (around line 71), find:
```python
    # سجلات FTTH_DEBUG (RAW_LIST_ROW، RAW_DETAIL، …) — عطّلها بـ false لتقليل حجم اللوج
    "ftth_sync_debug_payloads": True,
```
Change to:
```python
    # سجلات FTTH_DEBUG (RAW_LIST_ROW، RAW_DETAIL، …) — false افتراضياً؛ أعّدها true عبر parse_options للتشخيص فقط
    "ftth_sync_debug_payloads": False,
```

- [ ] **Step 2: Add remaining_days computation after end_date parsing**

In `_upsert_unified_page` (inside `sync_ftth_subscribers`), find the lines (around 948–955):
```python
                    row["start_date"] = _parse_date(row.get("start_date"))
                    row["end_date"] = _parse_date(row.get("end_date"))
                    row["active_session_started_at"] = _parse_datetime_tz(row.get("active_session_started_at"))
```

Insert after the `end_date` line:
```python
                    row["start_date"] = _parse_date(row.get("start_date"))
                    row["end_date"] = _parse_date(row.get("end_date"))
                    if row.get("remaining_days") is None and row.get("end_date") is not None:
                        row["remaining_days"] = compute_remaining_days(row["end_date"])
                    row["active_session_started_at"] = _parse_datetime_tz(row.get("active_session_started_at"))
```

`compute_remaining_days` is already imported in engine.py from `ftth_dates`. No import change needed.

- [ ] **Step 3: Remove all print() statements from _upsert_ftth_norm_batch_chunk_execute**

Find `_upsert_ftth_norm_batch_chunk_execute` (around line 369). There are 6 `print()` calls to remove:

**Remove block 1** (around line 403–418) — the entire `print("FTTH DB SAVE START", {...})` block:
```python
        print(
            "FTTH DB SAVE START",
            {
                "external_id": record.get("external_id"),
                "national_name": record.get("national_name"),
                "phone": record.get("phone"),
                "zone": record.get("zone"),
                "fat": record.get("fat"),
                "service_username": record.get("service_username"),
                "location": record.get("location"),
                "start_date": sd.isoformat() if hasattr(sd, "isoformat") else sd,
                "end_date": ed.isoformat() if hasattr(ed, "isoformat") else ed,
                "remaining_days": record.get("remaining_days"),
                "status": record.get("status"),
            },
        )
```
Delete this entire block (the `sd = ...` and `ed = ...` lines just above it too, if they are only used by this print).

**Check if `sd` and `ed` are used elsewhere.** Looking at that function: `sd = record.get("start_date")` and `ed = record.get("end_date")` appear only to feed the print. Delete those two assignment lines as well.

**Remove block 2** (around line 439–446) — the debug data print:
```python
    if _mappings:
        try:
            _dbg = json.dumps(_mappings[0], ensure_ascii=False, default=str)
            if len(_dbg) > 4000:
                _dbg = _dbg[:4000] + "...(truncated)"
        except (TypeError, ValueError):
            _dbg = str(_mappings[0])
        print(f"DEBUG: Data to be saved: {_dbg}", flush=True)
    else:
        print("DEBUG: Data to be saved: Empty", flush=True)
```
Delete the entire `if _mappings: ... else: print(...)` block. The `_dbg` variable and its `try/except` are only used by this print, so delete them too.

**Remove block 3** (around line 455) — insert count print:
```python
            print(f"DEBUG: Attempting to insert {len(inserts)} records...", flush=True)
```
Delete this line.

**Remove block 4** (around line 458) — update count print:
```python
            print(f"DEBUG: Attempting to update {len(updates)} records...", flush=True)
```
Delete this line.

**Remove block 5** (around line 467) — flush OK print:
```python
        print("DEBUG: Flush OK (pending commit at caller).", flush=True)
```
Delete this line.

- [ ] **Step 4: Verify the function still makes sense**

After removals, the core logic of `_upsert_ftth_norm_batch_chunk_execute` should read:
```python
def _upsert_ftth_norm_batch_chunk_execute(
    db: Session,
    norms: list[dict[str, Any]],
    now: datetime,
) -> tuple[int, int]:
    new_count = 0
    updated_count = 0
    ids = [n["external_id"] for n in norms if n.get("external_id")]
    if not ids:
        logger.info(
            "FTTH_SYNC_TRACE _upsert_ftth_norm_batch_chunk_execute: skip chunk (no external_id on any of %s norms)",
            len(norms),
        )
        return 0, 0
    existing_map = {
        r.external_id: r
        for r in db.query(models.FtthExternalData)
        .filter(models.FtthExternalData.external_id.in_(ids))
        .all()
    }
    inserts: list[dict[str, Any]] = []
    updates: list[dict[str, Any]] = []
    for norm in norms:
        ext_id = norm.get("external_id")
        if not ext_id:
            continue
        _log_ftth_db_save_start(norm)
        base = _norm_to_ftth_row_dict(norm, now=now)
        existing = existing_map.get(ext_id)
        if existing:
            base["id"] = int(existing.id)
            updates.append(base)
            updated_count += 1
        else:
            inserts.append(base)
            new_count += 1
    if not inserts and not updates:
        logger.info(
            "FTTH_SYNC_TRACE _upsert_ftth_norm_batch_chunk_execute: no insert/update rows after loop "
            "(norms=%s ids=%s)",
            len(norms),
            len(ids),
        )
        return 0, 0
    try:
        logger.info(
            "FTTH_SYNC_TRACE chunk_execute: bulk_insert=%s bulk_update=%s → bulk ops (no commit in chunk)",
            len(inserts),
            len(updates),
        )
        if inserts:
            db.bulk_insert_mappings(models.FtthExternalData, inserts)
        if updates:
            db.bulk_update_mappings(models.FtthExternalData, updates)
        db.flush()
        logger.info(
            "FTTH_SYNC_TRACE chunk_execute: bulk + flush OK (reported new=%s updated=%s; commit deferred to caller)",
            new_count,
            updated_count,
        )
    except Exception as exc:
        db.rollback()
        # ... existing exception handling unchanged ...
```

Confirm no other `print(` calls remain in engine.py with:
```
grep -n "print(" backend/app/integrations/ftth/engine.py
```
Expected: zero results.

- [ ] **Step 5: Commit**

```bash
git add backend/app/integrations/ftth/engine.py
git commit -m "fix(ftth): compute remaining_days, remove print() debug noise, disable debug_payloads default

- remaining_days now computed from end_date via compute_remaining_days after parse
- removed 5 print() calls from _upsert_ftth_norm_batch_chunk_execute
- ftth_sync_debug_payloads default changed from True to False"
```

---

## Task 3: Warmup flag and endpoint logging level in ftth_iq_api.py

**Files:**
- Modify: `backend/app/integrations/ftth/ftth_iq_api.py:33–35` (module-level flags)
- Modify: `backend/app/integrations/ftth/ftth_iq_api.py:308–314` (`_warmup_admin_httpx`)
- Modify: `backend/app/integrations/ftth/ftth_iq_api.py:91–101` (`_ftth_log_endpoint_attempt`)

### Context

`_warmup_admin_httpx` sends 2 GET requests inside every `with httpx.Client()` block. With concurrency=6 and 100 customers/page, this creates ~200 warmup GETs per page. A `threading.Event` flag makes warmup run at most once per sync session.

`_ftth_log_endpoint_attempt` logs URL + status + response body at INFO level for every HTTP attempt, flooding the log with hundreds of lines per sync run. Changing to DEBUG silences it in production while keeping it available for debugging.

- [ ] **Step 1: Add warmup flag at module level**

Find the existing module-level locks/counters near line 33:
```python
_ftth_raw_dbg_lock = threading.Lock()
_ftth_raw_dbg = {"detail": 0, "sub": 0, "addr": 0}
```

Add immediately after:
```python
_ftth_warmup_done = threading.Event()


def reset_ftth_warmup_flag() -> None:
    """يُستدعى في بداية كل مزامنة لإعادة تمكين warmup لجلسة httpx جديدة."""
    _ftth_warmup_done.clear()
```

- [ ] **Step 2: Guard _warmup_admin_httpx with the flag**

Current `_warmup_admin_httpx` (around line 308):
```python
def _warmup_admin_httpx(client: httpx.Client) -> None:
    for u, ref in _admin_warmup_targets():
        h = _warmup_page_headers(ref)
        try:
            client.get(u, headers=h, timeout=45.0)
        except Exception:
            continue
```

Replace with:
```python
def _warmup_admin_httpx(client: httpx.Client) -> None:
    if _ftth_warmup_done.is_set():
        return
    _ftth_warmup_done.set()
    logger.info("FTTH WARMUP: running admin.ftth.iq warmup requests (once per sync session)")
    for u, ref in _admin_warmup_targets():
        h = _warmup_page_headers(ref)
        try:
            client.get(u, headers=h, timeout=45.0)
        except Exception:
            continue
```

- [ ] **Step 3: Change _ftth_log_endpoint_attempt to DEBUG level**

Current function (around line 91):
```python
def _ftth_log_endpoint_attempt(url: str, status: int, text: str) -> None:
    """تسجيل موحّد لكل محاولة HTTP (اكتشاف التفاصيل/العنوان/الاشتراك)."""
    logger.info("TRYING FTTH ENDPOINT: %s", url)
    logger.info("STATUS: %s", status)
    logger.info("RESPONSE TEXT: %s", _ftth_trunc_response_body(text))
    if status != 200:
        logger.warning(
            "FTTH request failed: status=%s url=%s body=%s",
            status,
            url,
            _ftth_trunc_response_body(text, 400),
        )
```

Replace with:
```python
def _ftth_log_endpoint_attempt(url: str, status: int, text: str) -> None:
    """تسجيل موحّد لكل محاولة HTTP — DEBUG للتفاصيل، WARNING عند فشل الطلب."""
    logger.debug("TRYING FTTH ENDPOINT: %s", url)
    logger.debug("STATUS: %s", status)
    logger.debug("RESPONSE TEXT: %s", _ftth_trunc_response_body(text))
    if status != 200:
        logger.warning(
            "FTTH request failed: status=%s url=%s body=%s",
            status,
            url,
            _ftth_trunc_response_body(text, 400),
        )
```

- [ ] **Step 4: Verify reset_ftth_warmup_flag is importable**

Check that `reset_ftth_warmup_flag` is now accessible from `ftth_iq_api.py`. It will be imported in Task 4.

Run a quick syntax check:
```bash
python -c "from app.integrations.ftth.ftth_iq_api import reset_ftth_warmup_flag; print('OK')"
```
(Run from `backend/` directory with the app environment active.)
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/app/integrations/ftth/ftth_iq_api.py
git commit -m "perf(ftth): warmup once per sync session, reduce endpoint logging to DEBUG

- _ftth_warmup_done threading.Event prevents repeated warmup per HTTP call
- reset_ftth_warmup_flag() exported for engine.py to call at sync start
- _ftth_log_endpoint_attempt URL/status/body moved from INFO to DEBUG"
```

---

## Task 4: Wire reset_ftth_warmup_flag into engine.py sync start

**Files:**
- Modify: `backend/app/integrations/ftth/engine.py:28–34` (import block from ftth_iq_api)
- Modify: `backend/app/integrations/ftth/engine.py:864` (sync start, alongside reset_ftth_raw_debug_counters)

### Context

The warmup flag from Task 3 is reset to `clear` state at the start of each sync run, so the first HTTP request in a new sync session triggers warmup once.

- [ ] **Step 1: Add reset_ftth_warmup_flag to the import**

Find the existing import block (around line 28):
```python
from app.integrations.ftth.ftth_iq_api import (
    ftth_iq_extract_items,
    ftth_iq_fetch_customer_page,
    ftth_iq_get_token,
    ftth_iq_verify_session,
    reset_ftth_raw_debug_counters,
)
```

Replace with:
```python
from app.integrations.ftth.ftth_iq_api import (
    ftth_iq_extract_items,
    ftth_iq_fetch_customer_page,
    ftth_iq_get_token,
    ftth_iq_verify_session,
    reset_ftth_raw_debug_counters,
    reset_ftth_warmup_flag,
)
```

- [ ] **Step 2: Call reset_ftth_warmup_flag at sync start**

Find the line (around line 864) where `reset_ftth_raw_debug_counters()` is called:
```python
        reset_ftth_raw_debug_counters()
```

Add the warmup reset immediately after:
```python
        reset_ftth_raw_debug_counters()
        reset_ftth_warmup_flag()
```

- [ ] **Step 3: Verify ordering**

Confirm that `reset_ftth_warmup_flag()` is called before any HTTP activity in the sync run (before `ftth_iq_get_token` or `ftth_iq_fetch_customer_page`). Check the sequence at that location — `reset_ftth_raw_debug_counters()` is called before the token fetch, so this is correct.

- [ ] **Step 4: Commit**

```bash
git add backend/app/integrations/ftth/engine.py
git commit -m "perf(ftth): reset warmup flag at sync start so warmup runs once per session"
```

---

## Task 5: Expose raw_payload through schema and router

**Files:**
- Modify: `backend/app/schemas/ftth.py:393–445` (`FtthPortalCustomerRowOut`)
- Modify: `backend/app/modules/internet/routers/ftth_portal_router.py:518–542` (`_ftth_portal_customer_row_out`)

### Context

`models.FtthCustomer.raw_payload` (JSONB, not null, default `{}`) already exists in the main DB table and is populated by `_apply_ext_to_customer` from `ftth_external_data.raw_payload`. The schema and router helper currently do not expose it. Adding it makes it available to the portal UI for dynamic field rendering.

- [ ] **Step 1: Add raw_payload to FtthPortalCustomerRowOut**

In `backend/app/schemas/ftth.py`, find `FtthPortalCustomerRowOut` (around line 393). It ends with the `staging_row_id` field. After the last existing field, add:

```python
    staging_row_id: Optional[int] = Field(
        default=None,
        description="معرّف صف ftth_external_data المقابل (للترحيل)",
    )
    raw_payload: Optional[dict] = Field(
        default=None,
        description="البيانات الخام الكاملة المزامنة (للعرض الديناميكي في الواجهة)",
    )
```

(The `staging_row_id` field should already be there — add `raw_payload` immediately after it.)

- [ ] **Step 2: Pass raw_payload in _ftth_portal_customer_row_out**

In `backend/app/modules/internet/routers/ftth_portal_router.py`, find `_ftth_portal_customer_row_out` (around line 518). It ends with a `staging_row_id=staging_row_id,` line before the closing paren. Add:

```python
    return FtthPortalCustomerRowOut(
        id=int(c.id),
        external_customer_id=str(c.external_customer_id or "").strip(),
        full_name=c.full_name,
        phone=c.phone,
        address=c.address,
        zone=c.zone,
        fat=c.fat,
        fdt=c.fdt,
        bundle=c.bundle,
        subscription_status=c.subscription_status,
        subscription_start_date=c.subscription_start_date,
        subscription_end_date=c.subscription_end_date,
        onu_username=c.onu_username,
        onu_serial=c.onu_serial,
        import_status=c.import_status,
        last_synced_at=c.last_synced_at,
        subscriber_id=int(c.subscriber_id) if c.subscriber_id is not None else None,
        staging_row_id=staging_row_id,
        raw_payload=c.raw_payload if isinstance(c.raw_payload, dict) else None,
    )
```

(Only the last two lines change — `staging_row_id=staging_row_id,` keeps its position and `raw_payload=...` is added after it.)

- [ ] **Step 3: Verify schema serialisation**

`raw_payload` is `Optional[dict]`. Pydantic v2 serialises `dict` as JSON object. The `model_config = ConfigDict(from_attributes=True)` on the schema will read `c.raw_payload` via attribute access on the SQLAlchemy model, which is correct.

Quick sanity check — confirm `raw_payload` is in `FtthPortalCustomerRowOut.model_fields`:
```bash
python -c "
from app.schemas.ftth import FtthPortalCustomerRowOut
print('raw_payload' in FtthPortalCustomerRowOut.model_fields)
"
```
Expected: `True`

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/ftth.py backend/app/modules/internet/routers/ftth_portal_router.py
git commit -m "feat(ftth): expose raw_payload in FtthPortalCustomerRowOut and portal customers endpoint"
```

---

## Task 6: Portal UI — dynamic extra-fields sub-row and mobile section

**Files:**
- Modify: `src/modules/internet/page/components/types.ts:15–36` (`FtthPortalCustomerRow`)
- Modify: `src/modules/internet/page/FTTHPortal.tsx` (normalizeFtthPortalCustomerRow, desktop table rows.map, mobile cards rows.map)

### Context

The portal fetches from `/api/ftth/portal/customers` which now includes `raw_payload`. The TypeScript type needs to declare it, the normalizer needs to read it, and both the desktop table and mobile card views need to render a compact extra-fields section showing non-null fields not already displayed in main columns. Arabic RTL layout is unchanged; main columns are unchanged.

- [ ] **Step 1: Add raw_payload to FtthPortalCustomerRow type**

In `src/modules/internet/page/components/types.ts`, find `FtthPortalCustomerRow` (line 15). Add `raw_payload` after the `staging_row_id` field:

```typescript
/** صف من جدول ftth_customers (عرض محلي منظّف بعد المزامنة) */
export interface FtthPortalCustomerRow {
  id: number;
  external_customer_id: string;
  full_name: string | null;
  phone: string | null;
  address?: string | null;
  zone: string | null;
  fat: string | null;
  fdt: string | null;
  bundle: string | null;
  subscription_status: string | null;
  /** ISO من الخادم (تاريخ/وقت أو تاريخ) */
  subscription_start_date?: string | null;
  subscription_end_date?: string | null;
  onu_username?: string | null;
  onu_serial?: string | null;
  import_status: string | null;
  last_synced_at?: string | null;
  subscriber_id: number | null;
  /** معرف ftth_external_data للترحيل */
  staging_row_id?: number | null;
  /** بيانات خام مزامنة — للحقول الديناميكية الإضافية */
  raw_payload?: Record<string, unknown> | null;
}
```

- [ ] **Step 2: Add raw_payload to normalizeFtthPortalCustomerRow**

In `FTTHPortal.tsx`, find `normalizeFtthPortalCustomerRow` (around line 84). The function returns an object. Add `raw_payload` to the return:

```typescript
function normalizeFtthPortalCustomerRow(raw: unknown): FtthPortalCustomerRow {
  const r = raw as Record<string, unknown>;
  const any = r as Record<string, any>;
  return {
    id: Number(r.id ?? any.id ?? 0) || 0,
    external_customer_id: String(r.external_customer_id ?? any.externalCustomerId ?? '').trim(),
    full_name: (r.full_name ?? any.fullName ?? null) as string | null,
    phone: (r.phone ?? any.phone ?? null) as string | null,
    address: (r.address ?? any.address ?? null) as string | null,
    zone: (r.zone ?? any.zone ?? null) as string | null,
    fat: (r.fat ?? any.fat ?? null) as string | null,
    fdt: (r.fdt ?? any.fdt ?? null) as string | null,
    bundle: (r.bundle ?? any.bundle ?? null) as string | null,
    subscription_status: (r.subscription_status ?? any.subscriptionStatus ?? null) as string | null,
    subscription_start_date: (r.subscription_start_date ?? any.subscriptionStartDate ?? null) as string | null,
    subscription_end_date: (r.subscription_end_date ?? any.subscriptionEndDate ?? null) as string | null,
    onu_username: (r.onu_username ?? any.onuUsername ?? null) as string | null,
    onu_serial: (r.onu_serial ?? any.onuSerial ?? null) as string | null,
    import_status: (r.import_status ?? any.importStatus ?? null) as string | null,
    last_synced_at: (r.last_synced_at ?? any.lastSyncedAt ?? null) as string | null,
    subscriber_id:
      r.subscriber_id != null
        ? Number(r.subscriber_id)
        : any.subscriberId != null
          ? Number(any.subscriberId)
          : null,
    staging_row_id:
      r.staging_row_id != null
        ? Number(r.staging_row_id)
        : any.stagingRowId != null
          ? Number(any.stagingRowId)
          : null,
    raw_payload: (r.raw_payload ?? null) as Record<string, unknown> | null,
  };
}
```

(Only the last line before the closing `}` is new — add `raw_payload: (r.raw_payload ?? null) as Record<string, unknown> | null,` after `staging_row_id`.)

- [ ] **Step 3: Add the shared extra-fields helper**

Near the top of the component (after `function normalizeFtthPortalCustomerRow`), add a helper that computes displayable extra fields from `raw_payload`:

```typescript
/** مفاتيح الأعمدة الرئيسية المعروضة في الجدول — لا تُعرض مرة ثانية في القسم الإضافي */
const FTTH_MAIN_PAYLOAD_KEYS = new Set([
  'phone', 'zone', 'fat', 'fdt', 'onu_username', 'service_username',
  'address', 'location', 'subscription_start_date', 'start_date',
  'subscription_end_date', 'end_date', 'bundle', 'subscription_status', 'status',
  'full_name', 'national_name', 'external_customer_id', 'external_id', 'id',
  'phone_source', 'address_source', 'subscription_source',
  'raw_payload', 'raw_customer_json', 'raw_detail_json', 'raw_subscription_json',
]);

const FTTH_EXTRA_FIELD_LABELS: Record<string, string> = {
  ip_address: 'IP',
  mac_address: 'MAC',
  has_active_session: 'جلسة نشطة',
  active_session_started_at: 'بدء الجلسة',
  partner_name: 'الشريك',
  governorate: 'المحافظة',
  district: 'القضاء',
  sub_district: 'الناحية',
  gps_latitude: 'خط العرض',
  gps_longitude: 'خط الطول',
  is_pending: 'قيد الانتظار',
  is_trial: 'تجريبي',
  onu_serial: 'ONU Serial',
  customer_type: 'نوع العميل',
  secondary_phone: 'هاتف ثانوي',
  email: 'البريد',
  commitment_days: 'مدة الالتزام (يوم)',
  commitment_period: 'مدة الالتزام',
  commitment_label: 'وصف الالتزام',
  remaining_days: 'أيام متبقية',
  usr_referral_code: 'كود الإحالة',
  email_address: 'البريد',
};

function getFtthExtraFields(
  rawPayload: Record<string, unknown> | null | undefined,
): Array<{ key: string; label: string; value: string }> {
  if (!rawPayload) return [];
  return Object.entries(rawPayload)
    .filter(([k, v]) => {
      if (FTTH_MAIN_PAYLOAD_KEYS.has(k)) return false;
      if (v === null || v === undefined) return false;
      if (v === false) return false;
      if (typeof v === 'string' && !v.trim()) return false;
      if (typeof v === 'object') return false;
      return true;
    })
    .map(([k, v]) => ({
      key: k,
      label: FTTH_EXTRA_FIELD_LABELS[k] ?? k,
      value: String(v),
    }));
}
```

- [ ] **Step 4: Add extra-fields sub-row to the desktop table**

Find the desktop table rows section (around line 890):
```tsx
rows.map((r, idx) => {
  ...
  return (
  <tr
    key={`${r.id}-${r.external_customer_id}`}
    className={...}
  >
    ...tds...
  </tr>
  );
})
```

Change the return to a `React.Fragment` so the extra-fields sub-row can follow the main row. Move the `key` from `<tr>` to the `<React.Fragment>`:

```tsx
rows.map((r, idx) => {
  const endIso = r.subscription_end_date
    ? String(r.subscription_end_date).slice(0, 10)
    : null;
  const startIso = r.subscription_start_date
    ? String(r.subscription_start_date).slice(0, 10)
    : null;
  const canImport = (r.staging_row_id ?? 0) > 0;
  const actionTitle = [
    r.import_status ? `استيراد: ${r.import_status}` : null,
    r.last_synced_at ? `آخر مزامنة: ${formatDt(r.last_synced_at)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const extraFields = getFtthExtraFields(r.raw_payload);
  return (
    <React.Fragment key={`${r.id}-${r.external_customer_id}`}>
      <tr
        className={
          idx % 2 === 0
            ? 'bg-white dark:bg-slate-800/40 hover:bg-indigo-50/50 dark:hover:bg-slate-700/40'
            : 'bg-slate-50/80 dark:bg-slate-800/80 hover:bg-indigo-50/50 dark:hover:bg-slate-700/40'
        }
      >
        {/* الأعمدة الثابتة — بدون تغيير */}
        <td className="px-2 py-2 font-medium text-slate-800 dark:text-slate-100 align-top break-words">
          <div>{r.full_name || '—'}</div>
          <div className="mt-0.5 flex items-center gap-1 flex-wrap font-mono text-[10px] text-slate-500" dir="ltr">
            <span className="truncate max-w-[9rem]" title={r.external_customer_id}>
              {r.external_customer_id}
            </span>
            <a
              href={`https://admin.ftth.iq/customer-details/${encodeURIComponent(r.external_customer_id)}/details/view`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 p-0.5 rounded"
              title="فتح صفحة التفاصيل في admin.ftth.iq"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={12} />
            </a>
            <Link
              to={`/internet/ftth-customer/${encodeURIComponent(r.external_customer_id)}`}
              className="shrink-0 text-emerald-600 dark:text-emerald-400 hover:underline font-semibold"
              title="صفحة التفاصيل في النظام"
              onClick={(e) => e.stopPropagation()}
            >
              عرض
            </Link>
          </div>
        </td>
        <td className="px-2 py-2 font-mono text-[11px] align-top truncate" dir="ltr" title={r.phone || ''}>{r.phone || '—'}</td>
        <td className="px-2 py-2 font-mono text-[11px] align-top truncate" dir="ltr" title={r.zone || ''}>{r.zone || '—'}</td>
        <td className="px-2 py-2 font-mono text-[11px] align-top truncate" dir="ltr" title={r.fat || ''}>{r.fat || '—'}</td>
        <td className="px-2 py-2 font-mono text-[11px] align-top truncate" dir="ltr" title={r.onu_username || ''}>{r.onu_username || '—'}</td>
        <td className="px-2 py-2 text-[11px] align-top text-slate-600 dark:text-slate-300 break-words max-h-14 overflow-hidden" title={r.address || ''}>{r.address || '—'}</td>
        <td className="px-2 py-2 text-[11px] align-top whitespace-nowrap" title={startIso || ''}>{formatDateDDMMYYYY(startIso) || startIso || '—'}</td>
        <td className="px-2 py-2 text-[11px] align-top whitespace-nowrap" title={endIso || ''}>{formatDateDDMMYYYY(endIso) || endIso || '—'}</td>
        <td className="px-2 py-2 text-[11px] align-top text-slate-600 dark:text-slate-300 break-words max-h-12 overflow-hidden" title={r.bundle || ''}>{r.bundle || '—'}</td>
        <td className="px-2 py-2 text-[11px] align-top text-slate-600 dark:text-slate-300 max-h-10 overflow-hidden" title={r.subscription_status || ''}>{r.subscription_status || '—'}</td>
        <td className="px-2 py-2 text-center align-top" title={actionTitle || undefined}>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {r.subscriber_id != null ? (
              <Link
                to={`/internet?openSubscriber=${r.subscriber_id}`}
                className="inline-flex items-center justify-center rounded-lg border border-emerald-600 dark:border-emerald-500 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 px-1.5 py-0.5 text-[10px] font-semibold"
              >
                #{r.subscriber_id}
              </Link>
            ) : null}
            <button
              type="button"
              disabled={!canImport}
              title={!canImport ? 'لا يوجد سجل وسيط مطابق للترحيل — تحقق من المزامنة' : actionTitle || 'ترحيل للنظام'}
              onClick={() => canImport && openImport(r)}
              className="inline-flex items-center gap-0.5 text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 text-[11px] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <UserPlus size={12} />
              ترحيل
            </button>
          </div>
        </td>
      </tr>
      {extraFields.length > 0 && (
        <tr
          className={
            idx % 2 === 0
              ? 'bg-white dark:bg-slate-800/40'
              : 'bg-slate-50/80 dark:bg-slate-800/80'
          }
        >
          <td colSpan={11} className="px-3 pb-2 pt-0 border-b border-slate-100 dark:border-slate-700/50">
            <div className="flex flex-wrap gap-x-5 gap-y-0.5" dir="rtl">
              {extraFields.map(({ key, label, value }) => (
                <span key={key} className="text-[10px] text-slate-500 dark:text-slate-400">
                  <span className="font-medium text-slate-600 dark:text-slate-300">{label}:</span>{' '}
                  <span className="font-mono" dir="ltr">{value}</span>
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}
    </React.Fragment>
  );
})
```

**Important:** Remove the `key` prop from the `<tr>` (it moves to `<React.Fragment>`). The old `<tr key={...}>` becomes `<tr className={...}>` (key is on the Fragment, not the tr).

- [ ] **Step 5: Add extra fields to the mobile card view**

Find the mobile cards section (around line 1011, inside `<div className="lg:hidden ...">` → `rows.map`). Each card is a `<div>` with a `<dl>` grid at line 1068. After the last `</div>` inside the `<dl>` (after the last `<dt>/<dd>` pair, around line 1140), add extra fields:

```tsx
              {/* حقول إضافية ديناميكية */}
              {(() => {
                const extras = getFtthExtraFields(r.raw_payload);
                if (extras.length === 0) return null;
                return (
                  <div className="col-span-2 pt-1 border-t border-slate-100 dark:border-slate-700/50">
                    <dt className="text-slate-400 mb-0.5">بيانات إضافية</dt>
                    <dd className="flex flex-wrap gap-x-4 gap-y-0.5" dir="rtl">
                      {extras.map(({ key, label, value }) => (
                        <span key={key} className="text-[10px] text-slate-500 dark:text-slate-400">
                          <span className="font-medium text-slate-600 dark:text-slate-300">{label}:</span>{' '}
                          <span className="font-mono" dir="ltr">{value}</span>
                        </span>
                      ))}
                    </dd>
                  </div>
                );
              })()}
```

Insert this block inside the `<dl className="grid grid-cols-2 ...">` before the closing `</dl>` tag.

- [ ] **Step 6: Confirm React import includes Fragment (no-op if already imported)**

At the top of `FTTHPortal.tsx`, confirm `React` is imported (it is, line 1: `import React, ...`). `React.Fragment` is available automatically.

- [ ] **Step 7: Build check**

Run the TypeScript build to verify no type errors:
```bash
npm run build --prefix d:/king_office
```
Expected: no errors in `FTTHPortal.tsx` or `types.ts`. If errors appear in other files, they are pre-existing and unrelated — do not fix them.

- [ ] **Step 8: Commit**

```bash
git add src/modules/internet/page/components/types.ts src/modules/internet/page/FTTHPortal.tsx
git commit -m "feat(ftth-ui): dynamic extra-fields section in portal table and mobile cards

- FtthPortalCustomerRow gains raw_payload field
- getFtthExtraFields helper filters and labels non-null extra fields
- Desktop table: React.Fragment per row, extra-fields sub-row when present
- Mobile cards: extra fields appended to dl grid
- Main columns and Arabic RTL layout unchanged"
```

---

## Post-Implementation Validation Checklist

After all tasks are committed, run a manual sync and verify:

- [ ] **1. Sync mode is full**  
  Log must contain: `FTTH SYNC: full mode enforced`  
  Log must NOT contain: `sync_mode=list_only` (unless `ftth_sync_force_list_only: true` is in parse_options)

- [ ] **2. Detail fetches appear in logs**  
  Log must contain: `FTTH DETAIL FETCH URL (primary): https://admin.ftth.iq/api/customers/{id}`  
  Log must contain: subscription fetch attempts

- [ ] **3. Normalized fields are non-null**  
  Log must show (in `FTTH NORMALIZED ROW` or `FTTH FINAL NORMALIZED FIELDS SAVED`):  
  `phone`, `zone`, `fat`, `service_username`, `start_date`, `end_date`, `status` — at least some non-null

- [ ] **4. remaining_days is computed**  
  Log `FTTH NORMALIZED ROW` must show `remaining_days: <integer>` (positive or negative) for records with a valid `end_date`

- [ ] **5. No print() on stdout**  
  During sync, stdout must not contain `FTTH DB SAVE START` or `DEBUG: Data to be saved`

- [ ] **6. Warmup appears once per sync**  
  Log must contain `FTTH WARMUP: running admin.ftth.iq warmup requests` exactly once per sync run, not hundreds of times

- [ ] **7. Endpoint attempt logs are silent at INFO**  
  Log at INFO level must NOT contain hundreds of `TRYING FTTH ENDPOINT:` lines  
  (They still appear if log level is set to DEBUG)

- [ ] **8. Portal UI renders extra fields**  
  After syncing with full mode, visit the FTTH portal table. Rows with `ip_address`, `mac_address`, `has_active_session`, `partner_name`, `remaining_days`, etc. should show a compact line below the main row

- [ ] **9. Main table columns unchanged**  
  الاسم / الهاتف / المنطقة / FAT / الخدمة / العنوان / البداية / النهاية / الاشتراك / الحالة / الإجراء — all present and styled as before

- [ ] **10. Arabic RTL layout unchanged**  
  No layout shifts; text direction in Arabic cells matches the existing design

- [ ] **11. Names remain masked (source-side confirmation)**  
  If `full_name` values still show `*** ***` patterns after full-mode sync, document this as a confirmed source-side limitation of the contractor account on admin.ftth.iq. No further fix is possible in this codebase.

- [ ] **12. Sync result includes sync_mode_effective**  
  The API response from `POST /api/ftth/portal/sync` should contain `"sync_mode_effective": "full"`
