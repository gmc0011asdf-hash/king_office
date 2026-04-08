"""
محرك جلب بيانات FTTH عبر httpx: تسجيل دخول، صفحات متعددة، وتحويل إلى صفوف ftth_external_data.

أنماط التحليل:
- json_generic: استجابة JSON + mapping قابل للضبط (parse_options).
- html_table: جدول HTML + فهارس أعمدة (يتطلب beautifulsoup4).
- demo: بيانات وهمية للاختبار دون اتصال حقيقي.
"""
from __future__ import annotations

import json
import logging
import os
import re
import traceback
from datetime import date, datetime, timezone
from typing import Any, Callable
from urllib.parse import parse_qs, urlparse

import httpx
from bs4 import BeautifulSoup
from sqlalchemy import func, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, class_mapper

from app.core.ftth_crypto import decrypt_str, encrypt_str
from app.integrations.ftth.ftth_dates import compute_remaining_days, resolve_ftth_dates
from app.integrations.ftth.ftth_iq_api import (
    ftth_iq_extract_items,
    ftth_iq_fetch_customer_page,
    ftth_iq_get_token,
    ftth_iq_verify_session,
    reset_ftth_raw_debug_counters,
    reset_ftth_warmup_flag,
    disable_ftth_warmup,
)
from app.core.ftth_db_debug import debug_db_row_count
from app.integrations.ftth.ftth_unified_sync import (
    ftth_sync_fast_mode_enabled,
    run_ftth_unified_sync,
    unified_record_to_ftth_norm,
)
from app.integrations.ftth.ftth_app_customer_sync import upsert_ftth_customers_from_external_batch
from app.models import models

logger = logging.getLogger(__name__)

# حجم دفعة upsert لـ ftth_external_data — معاملات أقصر وأقل ضغطاً على الاتصال (قابل للضبط عبر البيئة)
_FTTH_UPSERT_CHUNK_SIZE = max(1, min(500, int(os.environ.get("FTTH_UPSERT_CHUNK_SIZE", "80"))))


def _ftth_row_json_for_log(row: dict[str, Any], max_len: int = 12000) -> str:
    s = json.dumps(row, ensure_ascii=False, default=str)
    if len(s) > max_len:
        return s[:max_len] + "...<truncated>"
    return s


DEFAULT_PARSE_OPTIONS: dict[str, Any] = {
    # تزامن محدود لطلبات التفاصيل/الاشتراك لكل صفحة (وضع ftth_iq_admin)
    "ftth_sync_concurrency": 6,
    # subscriptions: build customer list from /api/subscriptions customer IDs (bypasses broken
    # /customers/summary which returns totalCount=1,951,914 — entire ISP database — instead of
    # the 127 current customers. auto|summary|list still available for non-admin portals.
    "ftth_sync_paging_source": "subscriptions",
    # عند وجود اشتراك في صف القائمة/الملخص: تخطّ GET .../subscriptions
    "ftth_sync_skip_subscription_if_embedded": True,
    # عند true + وجود عنصر addresses الدفعي: يُتخطى GET /customers/{id} (نصف طلبات HTTP لكل عميل تقريباً)
    "ftth_sync_skip_customer_detail": False,
    # full = GET /customers/{id} + اشتراكات — مطلوب لملء الحقول في البوابة؛ minimal للاختبار السريع فقط
    "ftth_sync_profile": "full",
    # عدد صفحات المزامنة بين كل commit (يُستدعى session_commit من المستدعي عند استخدام بوابة FTTH)
    "commit_every_pages": 1,
    # سجلات FTTH_DEBUG (RAW_LIST_ROW، RAW_DETAIL، …) — عطّلها بـ false لتقليل حجم اللوج
    "ftth_sync_debug_payloads": False,
    # full = لكل عميل تفاصيل + اشتراك؛ list_only = قائمة فقط (خفيف لكن بيانات ناقصة)
    "sync_mode": "full",
    "login_username_field": "username",
    "login_password_field": "password",
    "login_method": "form",
    "login_content_type": "form",
    "login_json_template": None,
    "login_extra_fields": {},
    "rows_path": "",
    "page_param": "page",
    "pagination_start": 1,
    "max_pages": 200,
    "mapping": {},
    "html_table_selector": "table tbody tr",
    "html_columns": {
        "external_id": 0,
        "national_name": 1,
        "phone": 2,
        "start_date": 3,
        "end_date": 4,
        "remaining_days": 5,
        "status": 6,
    },
}

FIELD_FALLBACKS: dict[str, list[str]] = {
    "external_id": ["external_id", "id", "subscriber_id", "sub_id", "uid", "code"],
    "national_name": ["national_name", "name", "full_name", "customer_name", "arabic_name", "display_name"],
    "phone": ["phone", "mobile", "msisdn", "tel", "phone_number"],
    "start_date": ["start_date", "subscription_start", "from_date", "begin_date"],
    "end_date": ["end_date", "subscription_end", "to_date", "expire_date", "expiration"],
    "commitment_days": ["commitment_days", "commitmentDays", "durationDays", "planDurationDays"],
    "commitment_label": ["commitment_label", "commitmentLabel", "durationLabel", "planDuration"],
    "remaining_days": ["remaining_days", "days_left", "days_remaining", "left_days"],
    "status": ["status", "state", "subscription_status"],
}


def _merge_options(raw: dict[str, Any] | None) -> dict[str, Any]:
    base = {**DEFAULT_PARSE_OPTIONS}
    r = raw or {}
    for k, v in r.items():
        if k != "mapping":
            base[k] = v
    user_map = r.get("mapping") or {}
    merged_map: dict[str, list[str]] = {}
    for field, fallbacks in FIELD_FALLBACKS.items():
        if field in user_map and user_map[field]:
            uk = user_map[field]
            keys = [uk] if isinstance(uk, str) else [str(x) for x in uk]
            merged_map[field] = keys + [fb for fb in fallbacks if fb not in keys]
        else:
            merged_map[field] = list(fallbacks)
    base["mapping"] = merged_map
    return base


def _get_by_mapping(row: dict[str, Any], field: str, opts: dict[str, Any]) -> Any:
    keys: list[str] = opts.get("mapping", {}).get(field, [])
    for k in keys:
        if k in row and row[k] is not None and str(row[k]).strip() != "":
            return row[k]
    return None


def _navigate_path(obj: Any, path: str) -> Any:
    if not path or not str(path).strip():
        return obj
    cur: Any = obj
    for part in str(path).split("."):
        part = part.strip()
        if part.endswith("[]"):
            key = part[:-2]
            cur = cur.get(key) if isinstance(cur, dict) else None
            return cur
        if isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
    return cur


def _extract_rows_json(data: Any, rows_path: str) -> list[dict[str, Any]]:
    target = _navigate_path(data, rows_path) if rows_path else data
    if target is None:
        for key in ("data", "items", "results", "rows", "subscribers", "records"):
            if isinstance(data, dict) and key in data:
                inner = data[key]
                if isinstance(inner, list):
                    target = inner
                    break
                if isinstance(inner, dict) and "items" in inner and isinstance(inner["items"], list):
                    target = inner["items"]
                    break
        if target is None:
            target = data
    if isinstance(target, list):
        return [x for x in target if isinstance(x, dict)]
    if isinstance(target, dict):
        return [target]
    return []


def _parse_date(val: Any) -> date | None:
    if val is None or val == "":
        return None
    if isinstance(val, date) and not isinstance(val, datetime):
        return val
    if isinstance(val, datetime):
        return val.date()
    s = str(val).strip()
    if not s:
        return None
    # ISO مع Z أو millis أو مسافة بين التاريخ والوقت (شائع في JSON من FTTH)
    try:
        s_iso = s.replace("Z", "+00:00")
        if re.match(r"^\d{4}-\d{2}-\d{2} ", s_iso):
            s_iso = s_iso.replace(" ", "T", 1)
        if re.match(r"^\d{4}-\d{2}-\d{2}", s_iso):
            return datetime.fromisoformat(s_iso).date()
    except (ValueError, TypeError):
        pass
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(s[:19], fmt).date()
        except ValueError:
            continue
    # صيغة واجهة FTTH IQ: 19.04.26 أو 19.04.2026 (أحياناً مع نص عربي بعدها)
    m = re.match(r"^(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b", s)
    if m:
        d_i, mo_i, y_i = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y_i < 100:
            y_i += 2000
        try:
            return date(y_i, mo_i, d_i)
        except ValueError:
            pass
    try:
        return date.fromisoformat(s[:10])
    except ValueError:
        return None


def _parse_datetime_tz(val: Any) -> datetime | None:
    """لـ active_session_started_at وحقول ISO من FTTH."""
    if val is None or val == "":
        return None
    if isinstance(val, datetime):
        return val if val.tzinfo else val.replace(tzinfo=timezone.utc)
    s = str(val).strip()
    if not s:
        return None
    try:
        s2 = s.replace("Z", "+00:00")
        if re.match(r"^\d{4}-\d{2}-\d{2} ", s2):
            s2 = s2.replace(" ", "T", 1)
        dt = datetime.fromisoformat(s2)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


def _parse_int(val: Any) -> int | None:
    if val is None or val == "":
        return None
    if isinstance(val, int):
        return val
    m = re.search(r"-?\d+", str(val))
    return int(m.group(0)) if m else None


def _coerce_norm_date(val: Any) -> date | None:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    return _parse_date(val)


def _apply_ftth_norm_date_fields(norm: dict[str, Any]) -> None:
    """توحيد التواريخ والمتبقي حسب commitment_days وقاعدة FTTH (المرجع: الخادم)."""
    sd = _coerce_norm_date(norm.get("start_date"))
    ed = _coerce_norm_date(norm.get("end_date"))
    cd_raw = norm.get("commitment_days")
    cd: int | None = None
    if cd_raw is not None:
        try:
            cd = int(float(str(cd_raw).strip().split()[0]))
            if cd <= 0:
                cd = None
        except (TypeError, ValueError):
            cd = None
    s2, e2 = resolve_ftth_dates(ed, cd, sd)
    if e2 is not None:
        norm["start_date"] = s2
        norm["end_date"] = e2
    elif s2 is not None:
        norm["start_date"] = s2
        norm["end_date"] = e2
    norm["remaining_days"] = compute_remaining_days(norm.get("end_date"))


def _apply_ftth_iq_subscription_dates_only(norm: dict[str, Any]) -> None:
    """
    مسار FTTH IQ الموحّد: start/end كما من الاشتراك (يوم فقط)،
    وremaining_days = الفرق التقويمي بين end_date واليوم (بدون إعادة حساب المدة).
    """
    sd = _coerce_norm_date(norm.get("start_date"))
    ed = _coerce_norm_date(norm.get("end_date"))
    norm["start_date"] = sd
    norm["end_date"] = ed
    norm["remaining_days"] = compute_remaining_days(ed)


def _ftth_external_staging_column_keys() -> list[str]:
    """أعمدة قابلة للمزامنة من API (باستثناء id و foreign key للمشترك المُرحَّل)."""
    skip = {"id", "imported_subscriber_id"}
    return [c.key for c in class_mapper(models.FtthExternalData).columns if c.key not in skip]


def _log_ftth_db_save_start(norm: dict[str, Any]) -> None:
    """قبل insert/upsert — تتبع مباشر لما يُرسل إلى ftth_external_data."""
    sd = norm.get("start_date")
    ed = norm.get("end_date")
    payload = {
        "external_id": norm.get("external_id"),
        "national_name": norm.get("national_name"),
        "phone": norm.get("phone"),
        "zone": norm.get("zone"),
        "fat": norm.get("fat"),
        "service_username": norm.get("service_username"),
        "location": norm.get("location"),
        "start_date": sd.isoformat() if hasattr(sd, "isoformat") else sd,
        "end_date": ed.isoformat() if hasattr(ed, "isoformat") else ed,
        "remaining_days": norm.get("remaining_days"),
        "status": norm.get("status"),
    }
    logger.info(
        "FTTH DB SAVE START\n%s",
        json.dumps(payload, ensure_ascii=False, indent=2, default=str),
    )


def _log_ftth_sync_db_target(db: Session) -> None:
    """يثبت اسم القاعدة والرابط المموّه والجدول المستهدف؛ يقارن env مع ربط جلسة SQLAlchemy."""
    from sqlalchemy.engine.url import make_url

    from app.core.database import ftth_sync_connection_log_info

    info = ftth_sync_connection_log_info()
    session_db_name = ""
    session_masked = ""
    try:
        b = db.get_bind()
        if b is not None:
            u = make_url(str(b.url))
            session_db_name = u.database or ""
            session_masked = u.render_as_string(hide_password=True)
    except Exception:
        pass
    logger.info(
        "FTTH SYNC DB TARGET CHECK\n"
        "- current database url (masked, from env/config): %s\n"
        "- current database url (masked, from this Session): %s\n"
        "- db_name (env/config): %s\n"
        "- db_name (this Session bind): %s\n"
        "- target table = public.ftth_external_data",
        info.get("masked_connection_url", ""),
        session_masked or "(same as above)",
        info.get("db_name", ""),
        session_db_name or "(unknown)",
    )


def _log_ftth_external_row_count_after_first_save(db: Session, state: dict[str, bool]) -> None:
    """بعد أول دفعة حُفظت بنجاح في هذه المزامنة: COUNT من نفس الاتصال."""
    if state.get("logged"):
        return
    debug_db_row_count(db)
    state["logged"] = True


def _norm_to_ftth_row_dict(norm: dict[str, Any], *, now: datetime) -> dict[str, Any]:
    """يُنشئ قاموس حفظ من normalized row يطابق أعمدة الجدول."""
    row: dict[str, Any] = {}
    for k in _ftth_external_staging_column_keys():
        if k in norm:
            row[k] = norm[k]
    row["synced_at"] = now
    row["updated_at"] = now
    if row.get("raw_payload") is None:
        row["raw_payload"] = {}
    return row


def _upsert_ftth_norm_batch_chunk_execute(
    db: Session,
    norms: list[dict[str, Any]],
    now: datetime,
) -> tuple[int, int]:
    """
    تنفيذ upsert لدفعة واحدة (بدون commit؛ يُفترض commit من المستدعي بعد اكتمال المزامنة أو الصفحة).
    prefetch: استعلام واحد in_(external_id) — لا يوجد query لكل صف في الحلقة.
    """
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
        record = norm
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
    # لا نستدعي commit هنا: يُدار من مستوى أعلى (مزامنة/مسار الاستدعاء) لتقليل overhead ودمج عدة دفعات في ترانزكشن واحدة.
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
        # تثبيت الـ SQL ضمن الترانزكشن الحالية دون commit (مطلوب لربط bulk بالجلسة قبل commit الخارجي)
        db.flush()
        logger.info(
            "FTTH_SYNC_TRACE chunk_execute: bulk + flush OK (reported new=%s updated=%s; commit deferred to caller)",
            new_count,
            updated_count,
        )
    except Exception as exc:
        db.rollback()
        traceback.print_exc()
        for eid in ids:
            logger.exception("FTTH DB SAVE FAILED: %s - %s", eid, exc)
        raise
    # بعد تنفيذ bulk + flush ناجح: إزالة كيانات الـ prefetch من الجلسة (لا تُلفّ في نفس try الـ rollback)
    for _row in list(existing_map.values()):
        try:
            db.expunge(_row)
        except Exception:
            pass
    for eid in ids:
        logger.info("FTTH DB SAVE SUCCESS: %s", eid)
    return new_count, updated_count


def _upsert_ftth_norm_batch_chunk(
    db: Session,
    norms: list[dict[str, Any]],
    now: datetime,
) -> tuple[int, int]:
    """غلاف: إعادة محاولة واحدة عند انقطاع اتصال PostgreSQL أثناء الـ bulk/flush (commit من المستدعي)."""
    for attempt in range(2):
        try:
            return _upsert_ftth_norm_batch_chunk_execute(db, norms, now)
        except OperationalError as exc:
            db.rollback()
            if attempt == 0:
                logger.warning("FTTH upsert chunk: OperationalError, retrying once: %s", exc)
                continue
            raise


def _upsert_ftth_norm_batch(
    db: Session,
    norms: list[dict[str, Any]],
    now: datetime,
) -> tuple[int, int]:
    """تجزئة upsert؛ كل جزء يجلب الصفوف الموجودة بـ external_id.in_(...) مرة واحدة (existing_map) وليس first() لكل صف."""
    if not norms:
        logger.info("FTTH_SYNC_TRACE _upsert_ftth_norm_batch: called with empty norms list (no-op)")
        return 0, 0
    logger.info(
        "FTTH_SYNC_TRACE _upsert_ftth_norm_batch: entered norms=%s chunk_size=%s",
        len(norms),
        _FTTH_UPSERT_CHUNK_SIZE,
    )
    total_new = 0
    total_updated = 0
    for off in range(0, len(norms), _FTTH_UPSERT_CHUNK_SIZE):
        piece = norms[off : off + _FTTH_UPSERT_CHUNK_SIZE]
        n_new, n_up = _upsert_ftth_norm_batch_chunk(db, piece, now)
        total_new += n_new
        total_updated += n_up
    logger.info(
        "FTTH_SYNC_TRACE _upsert_ftth_norm_batch: done total_new=%s total_updated=%s",
        total_new,
        total_updated,
    )
    return total_new, total_updated


def _normalize_row(raw: dict[str, Any], opts: dict[str, Any]) -> dict[str, Any] | None:
    ext = _get_by_mapping(raw, "external_id", opts)
    if ext is None:
        return None
    external_id = str(ext).strip()
    if not external_id:
        return None
    cl_raw = _get_by_mapping(raw, "commitment_label", opts)
    cl_out: str | None = None
    if cl_raw is not None and str(cl_raw).strip():
        cl_out = str(cl_raw).strip()[:255]
    norm: dict[str, Any] = {
        "external_id": external_id[:255],
        "national_name": (str(_get_by_mapping(raw, "national_name", opts) or "").strip() or None)[:500],
        "phone": (str(_get_by_mapping(raw, "phone", opts) or "").strip() or None)[:100],
        "zone": None,
        "fat": None,
        "location": None,
        "service_username": None,
        "start_date": _parse_date(_get_by_mapping(raw, "start_date", opts)),
        "end_date": _parse_date(_get_by_mapping(raw, "end_date", opts)),
        "commitment_days": _parse_int(_get_by_mapping(raw, "commitment_days", opts)),
        "commitment_label": cl_out,
        "remaining_days": _parse_int(_get_by_mapping(raw, "remaining_days", opts)),
        "status": (str(_get_by_mapping(raw, "status", opts) or "").strip() or None)[:255],
        "raw_payload": dict(raw),
    }
    _apply_ftth_norm_date_fields(norm)
    return norm


def _build_list_url(list_url_template: str, page: int, page_param: str) -> str:
    if "{page}" in list_url_template:
        return list_url_template.replace("{page}", str(page))
    parsed = urlparse(list_url_template)
    q = parse_qs(parsed.query, keep_blank_values=True)
    q[page_param] = [str(page)]
    from urllib.parse import urlencode

    new_query = urlencode(q, doseq=True)
    return parsed._replace(query=new_query).geturl()


def _login_client(
    client: httpx.Client,
    login_url: str,
    username: str,
    password: str,
    opts: dict[str, Any],
) -> None:
    uf = opts.get("login_username_field") or "username"
    pf = opts.get("login_password_field") or "password"
    method = (opts.get("login_method") or "POST").upper()
    content = opts.get("login_content_type") or "form"
    extras = opts.get("login_extra_fields") or {}

    if content == "json":
        tpl = opts.get("login_json_template")
        if isinstance(tpl, dict):
            payload = json.loads(json.dumps(tpl).replace("{username}", username).replace("{password}", password))
        else:
            payload = {uf: username, pf: password, **extras}
        r = client.request(method, login_url, json=payload)
    else:
        data = {**extras, uf: username, pf: password}
        r = client.request(method, login_url, data=data)
    if r.status_code >= 400:
        raise RuntimeError(f"فشل تسجيل الدخول: HTTP {r.status_code} — {r.text[:200]}")


def verify_ftth_connection(
    login_url: str,
    username: str,
    password: str,
    list_url: str | None,
    parse_mode: str,
    parse_options: dict[str, Any] | None = None,
) -> dict[str, Any]:
    opts = _merge_options(parse_options)
    if parse_mode == "demo":
        return {"ok": True, "message": "وضع تجريبي — لا اتصال خارجي.", "sample_rows": 3}

    if parse_mode == "ftth_iq_admin":
        try:
            td = ftth_iq_get_token(username, password, opts)
            access = td.get("access_token") or td.get("accessToken")
            if not access:
                raise RuntimeError(
                    "استجابة التوكن لا تحتوي access_token — تحقق من اسم المستخدم وكلمة المرور"
                )
        except Exception as e:
            raise RuntimeError(f"خطأ التوكن (FTTH IQ): {e}") from e

        try:
            ftth_iq_verify_session(access, opts)
        except Exception:
            pass

        n_items = 0
        list_err: str | None = None
        try:
            payload = ftth_iq_fetch_customer_page(access, 1, opts)
            items = ftth_iq_extract_items(payload)
            n_items = len(items)
        except Exception as e:
            list_err = str(e)

        if list_err:
            return {
                "ok": True,
                "message": (
                    "تم التحقق من بيانات الدخول (تم الحصول على توكن). "
                    "تعذّر جلب عيّنة من قائمة المشتركين أثناء الإعداد — اضغط «مزامنة الآن» لإعادة المحاولة. "
                    f"سبب العيّنة: {list_err}"
                ),
            }
        return {
            "ok": True,
            "message": (
                "تم ربط حساب FTTH بنجاح. "
                f"عيّنة الصفحة الأولى: {n_items} مشترك. يمكنك المزامنة لجلب القائمة كاملة."
            ),
        }

    with httpx.Client(follow_redirects=True, timeout=90.0) as client:
        try:
            base = f"{urlparse(login_url).scheme}://{urlparse(login_url).netloc}"
            client.get(base, timeout=30.0)
        except Exception:
            pass
        _login_client(client, login_url, username, password, opts)
        if list_url:
            first = _build_list_url(list_url, int(opts["pagination_start"]), opts["page_param"])
            lr = client.get(first, timeout=60.0)
            if lr.status_code >= 400:
                raise RuntimeError(f"تعذر جلب قائمة المشتركين: HTTP {lr.status_code}")
            if parse_mode == "html_table":
                if not lr.text or len(lr.text) < 10:
                    raise RuntimeError("استجابة قائمة فارغة")
            elif parse_mode == "json_generic":
                try:
                    lr.json()
                except Exception as e:
                    raise RuntimeError(f"القائمة ليست JSON صالحاً: {e}") from e
        return {"ok": True, "message": "تم التحقق من الاتصال بنجاح"}


def _sync_demo(db: Session) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    samples: list[dict[str, Any]] = [
        {
            "external_id": "demo-1001",
            "national_name": "مشترك تجريبي أ",
            "phone": "07701111111",
            "zone": "Z-DEMO-1",
            "fat": "FAT-1",
            "location": "بغداد — تجريبي",
            "service_username": "demo_user_1",
            "start_date": date.today(),
            "end_date": None,
            "commitment_days": 30,
            "commitment_label": None,
            "remaining_days": 30,
            "status": "active",
            "raw_payload": {"source": "demo"},
        },
        {
            "external_id": "demo-1002",
            "national_name": "مشترك تجريبي ب",
            "phone": "07802222222",
            "zone": "Z-DEMO-2",
            "fat": "FAT-2",
            "location": None,
            "service_username": None,
            "start_date": None,
            "end_date": date.today(),
            "commitment_days": 30,
            "commitment_label": None,
            "remaining_days": 0,
            "status": "expired",
            "raw_payload": {"source": "demo"},
        },
    ]
    demo_ids = [s["external_id"] for s in samples]
    existing_demo = {
        r.external_id: r
        for r in db.query(models.FtthExternalData)
        .filter(models.FtthExternalData.external_id.in_(demo_ids))
        .all()
    }
    new_c = 0
    upd_c = 0
    for s in samples:
        _apply_ftth_norm_date_fields(s)
        row = existing_demo.get(s["external_id"])
        if row:
            for k, v in s.items():
                setattr(row, k, v)
            row.synced_at = now
            upd_c += 1
        else:
            db.add(
                models.FtthExternalData(
                    external_id=s["external_id"],
                    national_name=s["national_name"],
                    phone=s["phone"],
                    zone=s.get("zone"),
                    fat=s.get("fat"),
                    location=s.get("location"),
                    service_username=s.get("service_username"),
                    start_date=s["start_date"],
                    end_date=s["end_date"],
                    commitment_days=s.get("commitment_days"),
                    commitment_label=s.get("commitment_label"),
                    remaining_days=s["remaining_days"],
                    status=s["status"],
                    raw_payload=s["raw_payload"],
                    synced_at=now,
                )
            )
            new_c += 1
    return {"new_count": new_c, "updated_count": upd_c, "pages_fetched": 1}


def _rows_from_html(html: str, opts: dict[str, Any]) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    sel = opts.get("html_table_selector") or "table tbody tr"
    rows_el = soup.select(sel)
    cols = opts.get("html_columns") or DEFAULT_PARSE_OPTIONS["html_columns"]
    out: list[dict[str, Any]] = []
    for tr in rows_el:
        cells = tr.find_all(["td", "th"])
        texts = [c.get_text(strip=True) for c in cells]
        if not texts:
            continue
        raw: dict[str, Any] = {}
        for field, idx in cols.items():
            try:
                idx_i = int(idx)
            except (TypeError, ValueError):
                continue
            if 0 <= idx_i < len(texts):
                raw[field] = texts[idx_i]
        ext = raw.get("external_id")
        if ext is None and texts:
            raw["external_id"] = texts[0]
        out.append(raw)
    return out


def sync_ftth_customers(db: Session, debug_limit: int | None = None) -> dict[str, Any]:
    """
    مزامنة FTTH بالمسار الموحّد (قائمة → تفاصيل → اشتراكات).
    debug_limit: اختياري — يحدّ عدد العملاء المُزامَنين (مفيد للاختبار).
    """
    return sync_ftth_subscribers(db, debug_limit=debug_limit)


def sync_ftth_subscribers(
    db: Session,
    debug_limit: int | None = None,
    *,
    session_commit: Callable[[], None] | None = None,
) -> dict[str, Any]:
    """
    session_commit: عند تمريره (مثلاً من مسار البوابة) يُستدعى بدل db.commit داخل المحرك عند حدود الصفحات
    (مع commit_every_pages في parse_options). عند None يُستخدم commit مدمج في المحرك (توافق خلفي).
    """
    cfg = db.query(models.FtthPortalConfig).order_by(models.FtthPortalConfig.id.asc()).first()
    if not cfg:
        raise RuntimeError("لم يُضبط بوابة FTTH بعد")
    cfg_portal_id = cfg.id

    logger.info(
        "FTTH_SYNC_TRACE sync_ftth_subscribers entered cfg_id=%s parse_mode=%s list_url_set=%s",
        cfg_portal_id,
        (cfg.parse_mode or "").strip(),
        bool((cfg.list_url or "").strip()),
    )

    logger.info("FTTH SYNC STEP 1: validating portal configuration")
    logger.info("FTTH portal configured = True")

    username = decrypt_str(cfg.username_enc)
    password = decrypt_str(cfg.password_enc)
    opts = _merge_options(cfg.parse_options if isinstance(cfg.parse_options, dict) else {})
    parse_mode = (cfg.parse_mode or "json_generic").lower()
    list_url = (cfg.list_url or "").strip()

    # بوابة admin.ftth.iq: وضع كامل افتراضي دائماً بغض النظر عن parse_options.
    # ftth_sync_fast_mode في parse_options لا يُفعّل list_only بعد الآن.
    # استخدم ftth_sync_force_list_only: true في parse_options للتبديل الصريح المقصود فقط.
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

    _sync_summary_none = {
        "fetched_customers_count": None,
        "built_records_count": None,
        "attempted_db_saves_count": None,
        "successful_db_saves_count": None,
        "failed_db_saves_count": None,
    }

    if parse_mode == "demo":
        logger.info("FTTH_SYNC_TRACE branch=parse_mode=demo")
        logger.info("FTTH SYNC STEP 2: authenticating with external portal")
        logger.info("FTTH portal auth success = False (demo mode)")
        logger.info("FTTH SYNC STEP 3: fetching external data")
        logger.info("FTTH external records count = 3 (demo sample)")
        logger.info("FTTH SYNC STEP 4: writing to public.ftth_external_data")
        stats = _sync_demo(db)
        logger.info("FTTH_SYNC_TRACE demo: db.commit() after _sync_demo starting")
        db.commit()
        logger.info("FTTH_SYNC_TRACE demo: db.commit() finished OK")
        db.expunge_all()
        cfg = db.get(models.FtthPortalConfig, cfg_portal_id)
        if not cfg:
            raise RuntimeError("تعذر إعادة تحميل إعدادات بوابة FTTH بعد المزامنة التجريبية")
        cfg.last_sync_at = datetime.now(timezone.utc)
        cfg.last_sync_new = stats["new_count"]
        cfg.last_sync_updated = stats["updated_count"]
        cfg.last_sync_error = None
        return {**stats, "message": "مزامنة تجريبية", **_sync_summary_none}

    if parse_mode == "ftth_iq_admin":
        logger.info("FTTH_SYNC_TRACE branch=parse_mode=ftth_iq_admin")
        _log_ftth_sync_db_target(db)
        now = datetime.now(timezone.utc)
        max_pages = int(opts.get("max_pages") or 200)
        reset_ftth_raw_debug_counters()
        disable_ftth_warmup()
        token_data = ftth_iq_get_token(username, password, opts)
        access = token_data.get("access_token") or token_data.get("accessToken")
        if not access:
            raise RuntimeError("لا يوجد access_token في استجابة التوكن")
        logger.info("FTTH SYNC STEP 2: authenticating with external portal")
        logger.info("FTTH portal auth success = %s", bool(access))
        try:
            ftth_iq_verify_session(access, opts)
        except Exception:
            pass

        commit_every_pages = max(1, int(opts.get("commit_every_pages") or 1))
        logger.info(
            "FTTH_SYNC_TRACE sync_ftth_subscribers: commit_every_pages=%s session_commit=%s",
            commit_every_pages,
            "caller" if session_commit is not None else "builtin",
        )

        def _commit_and_refresh() -> None:
            nonlocal cfg
            if session_commit is not None:
                session_commit()
            else:
                db.commit()
                db.expunge_all()
            _cfg = db.get(models.FtthPortalConfig, cfg_portal_id)
            if _cfg is not None:
                cfg = _cfg

        dl = debug_limit
        if dl is None and isinstance(cfg.parse_options, dict):
            raw_dl = cfg.parse_options.get("debug_limit")
            if raw_dl is not None:
                try:
                    dl = int(raw_dl)
                except (TypeError, ValueError):
                    dl = None

        new_count = 0
        updated_count = 0
        pages_fetched = 0
        _ftth_norm_debug_count = 0
        built_records_count = 0
        attempted_db_saves_count = 0
        successful_db_saves_count = 0
        failed_db_saves_count = 0
        _first_save_count_state: dict[str, bool] = {"logged": False}
        _step4_logged = False

        sync_run_id: int | None = None
        try:
            _sr = models.FtthSyncRun(
                portal_config_id=cfg_portal_id,
                started_at=now,
                status="running",
            )
            db.add(_sr)
            db.flush()
            sync_run_id = int(_sr.id)
        except Exception as exc:
            logger.warning(
                "FTTH: تعذّر إنشاء سجل ftth_sync_runs (هل طُبّقت الهجرة؟): %s",
                exc,
            )

        def _upsert_unified_page(records: list[dict[str, Any]]) -> None:
            nonlocal cfg, new_count, updated_count, pages_fetched, _ftth_norm_debug_count
            nonlocal built_records_count, attempted_db_saves_count, successful_db_saves_count, failed_db_saves_count
            nonlocal _step4_logged
            pages_fetched += 1
            logger.info(
                "FTTH_SYNC_TRACE on_page_complete: page_index=%s raw_records=%s",
                pages_fetched,
                len(records),
            )
            batch_norms: list[dict[str, Any]] = []
            for u in records:
                try:
                    row = unified_record_to_ftth_norm(u)
                    if not row:
                        continue
                    row.pop("calculated_subscription_date", None)
                    row.pop("expiration_date", None)
                    row["start_date"] = _parse_date(row.get("start_date"))
                    row["end_date"] = _parse_date(row.get("end_date"))
                    if row.get("remaining_days") is None and row.get("end_date") is not None:
                        row["remaining_days"] = compute_remaining_days(row["end_date"])
                    row["active_session_started_at"] = _parse_datetime_tz(row.get("active_session_started_at"))
                    if row.get("commitment_days") is not None:
                        row["commitment_days"] = _parse_int(row.get("commitment_days"))
                    if row.get("commitment_period") is not None:
                        row["commitment_period"] = _parse_int(row.get("commitment_period"))
                    _apply_ftth_iq_subscription_dates_only(row)
                    try:
                        row["raw_payload"] = json.loads(json.dumps(row["raw_payload"], default=str))
                    except Exception:
                        row["raw_payload"] = {}
                    if pages_fetched == 1 and _ftth_norm_debug_count < 3:
                        _ftth_norm_debug_count += 1
                        dbg = {
                            "external_id": row.get("external_id"),
                            "phone": row.get("phone"),
                            "expiration_date": row.get("end_date"),
                            "remaining_days": row.get("remaining_days"),
                            "status": row.get("status"),
                            "zone": row.get("zone"),
                            "fat": row.get("fat"),
                        }
                        logger.info(
                            "========== FTTH NORMALIZED ROW #%s ==========",
                            _ftth_norm_debug_count,
                        )
                        logger.info(
                            "FTTH NORMALIZED ROW fields: %s",
                            json.dumps(dbg, ensure_ascii=False, default=str),
                        )
                        logger.info(
                            "========== END FTTH NORMALIZED ROW #%s ==========",
                            _ftth_norm_debug_count,
                        )
                    batch_norms.append(row)
                    built_records_count += 1
                except Exception:
                    logger.exception("unified_record_to_ftth_norm failed")
                    continue
            if batch_norms:
                r0 = batch_norms[0]
                logger.info(
                    "FTTH FINAL NORMALIZED FIELDS SAVED (page %s sample): %s",
                    pages_fetched,
                    json.dumps(
                        {
                            "external_id": r0.get("external_id"),
                            "phone": r0.get("phone"),
                            "zone": r0.get("zone"),
                            "fat": r0.get("fat"),
                            "service_username": r0.get("service_username"),
                            "location": r0.get("location"),
                            "address": r0.get("address"),
                            "start_date": str(r0.get("start_date"))
                            if r0.get("start_date") is not None
                            else None,
                            "end_date": str(r0.get("end_date"))
                            if r0.get("end_date") is not None
                            else None,
                            "remaining_days": r0.get("remaining_days"),
                            "status": r0.get("status"),
                            "bundle": r0.get("bundle"),
                        },
                        ensure_ascii=False,
                        default=str,
                    ),
                )
            if not batch_norms:
                logger.info(
                    "FTTH_SYNC_TRACE on_page_complete: SKIP _upsert_ftth_norm_batch (0 normalized rows from %s raw)",
                    len(records),
                )
                return
            if not _step4_logged:
                logger.info("FTTH SYNC STEP 4: writing to public.ftth_external_data")
                for i, row in enumerate(batch_norms[:3]):
                    logger.info(
                        "FTTH sample row #%s before save = %s",
                        i + 1,
                        _ftth_row_json_for_log(row),
                    )
                _step4_logged = True
            attempted_db_saves_count += len(batch_norms)
            try:
                logger.info(
                    "FTTH_SYNC_TRACE on_page_complete: calling _upsert_ftth_norm_batch batch_norms=%s",
                    len(batch_norms),
                )
                n_new, n_up = _upsert_ftth_norm_batch(db, batch_norms, now)
                logger.info(
                    "FTTH_SYNC_TRACE on_page_complete: _upsert_ftth_norm_batch returned n_new=%s n_up=%s",
                    n_new,
                    n_up,
                )
                new_count += n_new
                updated_count += n_up
                successful_db_saves_count += len(batch_norms)
                ext_ids = [str(n["external_id"]) for n in batch_norms if n.get("external_id")]
                try:
                    upsert_ftth_customers_from_external_batch(
                        db,
                        ext_ids,
                        now,
                        sync_run_id=sync_run_id,
                    )
                except Exception as exc:
                    logger.warning(
                        "FTTH: upsert ftth_customers بعد الصفحة فشل (يُتابع المزامنة): %s",
                        exc,
                    )
                _log_ftth_external_row_count_after_first_save(db, _first_save_count_state)
                if pages_fetched % commit_every_pages == 0:
                    logger.info(
                        "FTTH_SYNC_TRACE on_page_complete: session_commit() boundary "
                        "(page=%s commit_every_pages=%s)",
                        pages_fetched,
                        commit_every_pages,
                    )
                    _commit_and_refresh()
                    logger.info(
                        "FTTH_SYNC_TRACE on_page_complete: session_commit() finished OK "
                        "(reported new=%s updated=%s)",
                        new_count,
                        updated_count,
                    )
            except Exception:
                failed_db_saves_count += len(batch_norms)
                raise

        logger.info("FTTH SYNC STEP 3: fetching external data")
        logger.info(
            "FTTH SYNC MODE EFFECTIVE (engine): %s | ftth_sync_fast_mode=%r | parse_options.sync_mode=%r (ignored for path)",
            "list_only" if ftth_sync_fast_mode_enabled(opts) else "full",
            opts.get("ftth_sync_fast_mode"),
            opts.get("sync_mode"),
        )
        logger.info(
            "FTTH_SYNC_TRACE calling run_ftth_unified_sync max_pages=%s debug_limit=%s",
            max_pages,
            dl,
        )
        try:
            unified_out, _rate_limited = run_ftth_unified_sync(
                access,
                opts,
                max_pages=max_pages,
                debug_limit=dl,
                on_page_complete=_upsert_unified_page,
            )
        except Exception as e:
            logger.exception("FTTH unified sync failed: %s", e)
            raise

        if pages_fetched > 0 and (pages_fetched % commit_every_pages != 0):
            logger.info(
                "FTTH_SYNC_TRACE sync_ftth_subscribers: trailing session_commit for "
                "remaining unsynced pages (pages_fetched=%s commit_every_pages=%s)",
                pages_fetched,
                commit_every_pages,
            )
            _commit_and_refresh()

        fetched_list_rows = len(unified_out)
        logger.info(
            "FTTH_SYNC_TRACE run_ftth_unified_sync returned unified_out=%s rate_limited=%s pages_fetched_counter=%s",
            fetched_list_rows,
            _rate_limited,
            pages_fetched,
        )
        logger.info("FTTH external records count = %s", fetched_list_rows)
        if unified_out:
            logger.info("FTTH first raw record = %s", _ftth_row_json_for_log(unified_out[0]))

        sample = (
            db.query(models.FtthExternalData)
            .order_by(models.FtthExternalData.synced_at.desc(), models.FtthExternalData.id.desc())
            .first()
        )
        if sample:
            logger.info(
                "FTTH SAVED RECORD PREVIEW: %s",
                json.dumps(
                    {
                        "external_customer_id": sample.external_id,
                        "full_name": sample.national_name,
                        "phone": sample.phone,
                        "address": sample.address,
                        "subscription_status": sample.status,
                        "subscription_start_date": sample.start_date.isoformat() if sample.start_date else None,
                        "subscription_end_date": sample.end_date.isoformat() if sample.end_date else None,
                        "zone": sample.zone,
                        "fat": sample.fat,
                        "fdt": sample.fdt,
                    },
                    ensure_ascii=False,
                    default=str,
                ),
            )

        logger.info(
            "FTTH_SYNC_TRACE ftth_iq_admin: assigning cfg sync fields last_sync_at/new/updated "
            "(new=%s updated=%s pages_fetched=%s)",
            new_count,
            updated_count,
            pages_fetched,
        )
        if sync_run_id is not None:
            _sr_final = db.get(models.FtthSyncRun, sync_run_id)
            if _sr_final is not None:
                _sr_final.status = "success"
                _sr_final.finished_at = now
                _sr_final.total_external_new = new_count
                _sr_final.total_external_updated = updated_count
        cfg.last_sync_at = now
        cfg.last_sync_new = new_count
        cfg.last_sync_updated = updated_count
        cfg.last_sync_error = None
        summary_obj = {
            "fetched_customers_count": fetched_list_rows,
            "built_records_count": built_records_count,
            "attempted_db_saves_count": attempted_db_saves_count,
            "successful_db_saves_count": successful_db_saves_count,
            "failed_db_saves_count": failed_db_saves_count,
        }
        logger.info(
            "FTTH SYNC SUMMARY:\n%s",
            json.dumps(
                {
                    "fetched_customers_count": fetched_list_rows,
                    "built_records_count": built_records_count,
                    "attempted_db_saves_count": attempted_db_saves_count,
                    "successful_db_saves_count": successful_db_saves_count,
                    "failed_db_saves_count": failed_db_saves_count,
                },
                ensure_ascii=False,
                indent=2,
            ),
        )
        return {
            "new_count": new_count,
            "updated_count": updated_count,
            "pages_fetched": pages_fetched,
            "message": f"تمت المزامنة من FTTH IQ: {new_count} جديد، {updated_count} محدّث",
            "sync_mode_effective": _sync_mode_effective,
            **summary_obj,
        }

    if not list_url:
        raise RuntimeError("رابط قائمة المشتركين (list_url) غير محدد في الإعدادات")

    logger.info(
        "FTTH_SYNC_TRACE branch=generic parse_mode=%s (httpx list pagination)",
        parse_mode,
    )

    new_count = 0
    updated_count = 0
    pages = 0
    now = datetime.now(timezone.utc)
    max_pages = int(opts.get("max_pages") or 200)
    start_p = int(opts.get("pagination_start") or 1)

    _log_ftth_sync_db_target(db)
    _first_save_count_state_generic: dict[str, bool] = {"logged": False}
    _step4_logged_generic = False

    sync_run_id_generic: int | None = None
    try:
        _srg = models.FtthSyncRun(
            portal_config_id=cfg_portal_id,
            started_at=now,
            status="running",
        )
        db.add(_srg)
        db.flush()
        sync_run_id_generic = int(_srg.id)
    except Exception as exc:
        logger.warning(
            "FTTH generic: تعذّر إنشاء سجل ftth_sync_runs (هل طُبّقت الهجرة؟): %s",
            exc,
        )

    with httpx.Client(follow_redirects=True, timeout=120.0) as client:
        _login_client(client, cfg.login_url, username, password, opts)
        logger.info("FTTH SYNC STEP 2: authenticating with external portal")
        logger.info("FTTH portal auth success = True")
        logger.info("FTTH SYNC STEP 3: fetching external data")
        page = start_p
        while page < start_p + max_pages:
            url = _build_list_url(list_url, page, opts.get("page_param") or "page")
            resp = client.get(url)
            pages += 1
            if resp.status_code >= 400:
                raise RuntimeError(f"صفحة {page}: HTTP {resp.status_code}")

            if parse_mode == "html_table":
                batch = _rows_from_html(resp.text, opts)
            else:
                try:
                    data = resp.json()
                except Exception as e:
                    raise RuntimeError(f"صفحة {page}: JSON غير صالح — {e}") from e
                batch = _extract_rows_json(data, str(opts.get("rows_path") or ""))

            if not batch:
                break

            batch_norms: list[dict[str, Any]] = []
            for raw in batch:
                norm = _normalize_row(raw, opts)
                if norm:
                    batch_norms.append(norm)
            if not batch_norms:
                logger.info(
                    "FTTH_SYNC_TRACE generic page=%s: 0 normalized rows from raw batch=%s (breaking pagination)",
                    page,
                    len(batch),
                )
                break
            if not _step4_logged_generic:
                logger.info("FTTH SYNC STEP 4: writing to public.ftth_external_data")
                for i, row in enumerate(batch_norms[:3]):
                    logger.info(
                        "FTTH sample row #%s before save = %s",
                        i + 1,
                        _ftth_row_json_for_log(row),
                    )
                _step4_logged_generic = True
            logger.info(
                "FTTH_SYNC_TRACE generic page=%s: calling _upsert_ftth_norm_batch batch_norms=%s",
                page,
                len(batch_norms),
            )
            n_new, n_up = _upsert_ftth_norm_batch(db, batch_norms, now)
            logger.info(
                "FTTH_SYNC_TRACE generic page=%s: _upsert_ftth_norm_batch returned n_new=%s n_up=%s",
                page,
                n_new,
                n_up,
            )
            new_count += n_new
            updated_count += n_up
            ext_ids_gen = [str(n["external_id"]) for n in batch_norms if n.get("external_id")]
            try:
                upsert_ftth_customers_from_external_batch(
                    db,
                    ext_ids_gen,
                    now,
                    sync_run_id=sync_run_id_generic,
                )
            except Exception as exc:
                logger.warning(
                    "FTTH generic: upsert ftth_customers بعد الصفحة فشل (يُتابع المزامنة): %s",
                    exc,
                )
            _log_ftth_external_row_count_after_first_save(db, _first_save_count_state_generic)
            logger.info("FTTH_SYNC_TRACE generic page=%s: db.commit() starting", page)
            db.commit()
            logger.info("FTTH_SYNC_TRACE generic page=%s: db.commit() finished OK", page)
            db.expunge_all()
            _cfg = db.get(models.FtthPortalConfig, cfg_portal_id)
            if _cfg is not None:
                cfg = _cfg
            page += 1

    logger.info(
        "FTTH external records count = %s",
        new_count + updated_count,
    )

    logger.info(
        "FTTH_SYNC_TRACE generic: assigning cfg sync fields (new=%s updated=%s pages=%s)",
        new_count,
        updated_count,
        pages,
    )
    if sync_run_id_generic is not None:
        _srg_final = db.get(models.FtthSyncRun, sync_run_id_generic)
        if _srg_final is not None:
            _srg_final.status = "success"
            _srg_final.finished_at = now
            _srg_final.total_external_new = new_count
            _srg_final.total_external_updated = updated_count
    cfg.last_sync_at = now
    cfg.last_sync_new = new_count
    cfg.last_sync_updated = updated_count
    cfg.last_sync_error = None
    return {
        "new_count": new_count,
        "updated_count": updated_count,
        "pages_fetched": pages,
        "message": f"تمت المزامنة: {new_count} جديد، {updated_count} محدّث",
        **_sync_summary_none,
    }


def _ensure_ftth_external_extra_columns(engine) -> None:
    """أعمدة جديدة لجدول ftth_external_data (ترقية دون حذف البيانات)."""
    from sqlalchemy import text

    stmts = [
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS zone VARCHAR(200)",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS fat VARCHAR(200)",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS location TEXT",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS service_username VARCHAR(200)",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS commitment_days INTEGER",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS commitment_label VARCHAR(255)",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS secondary_phone VARCHAR(100)",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS email VARCHAR(255)",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS customer_type VARCHAR(255)",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS fdt VARCHAR(200)",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS bundle VARCHAR(500)",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS address TEXT",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS governorate VARCHAR(255)",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS district VARCHAR(255)",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS sub_district VARCHAR(255)",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(255)",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS street VARCHAR(500)",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS house VARCHAR(255)",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS gps_latitude NUMERIC(12,8)",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS gps_longitude NUMERIC(12,8)",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS onu_serial VARCHAR(255)",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS ip_address VARCHAR(100)",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS mac_address VARCHAR(100)",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS has_active_session BOOLEAN",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS active_session_started_at TIMESTAMPTZ",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS usr_referral_code VARCHAR(255)",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS partner_name VARCHAR(500)",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS is_pending BOOLEAN",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS is_trial BOOLEAN",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS raw_customer_json JSONB",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS raw_detail_json JSONB",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS raw_subscription_json JSONB",
        "ALTER TABLE ftth_external_data ADD COLUMN IF NOT EXISTS commitment_period INTEGER",
    ]
    try:
        with engine.begin() as conn:
            for s in stmts:
                conn.execute(text(s))
    except Exception:
        pass


def _ensure_subscriber_real_name_nullable(engine) -> None:
    """يسمح بـ real_name فارغ بعد ترحيل FTTH (ترقية قواعد قديمة)."""
    from sqlalchemy import text

    try:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE subscribers ALTER COLUMN real_name DROP NOT NULL"))
    except Exception:
        pass


def ensure_ftth_tables(engine) -> None:
    """إنشاء جداول FTTH إن وُجدت النماذج ولم تُنشأ بعد (مثلاً بعد التحديث دون إعادة تشغيل كاملة)."""
    models.FtthPortalConfig.__table__.create(bind=engine, checkfirst=True)
    models.FtthExternalData.__table__.create(bind=engine, checkfirst=True)
    _ensure_ftth_external_extra_columns(engine)
    _ensure_subscriber_real_name_nullable(engine)


def save_portal_config(
    db: Session,
    login_url: str,
    username: str,
    password: str,
    list_url: str | None,
    parse_mode: str,
    parse_options: dict[str, Any] | None,
) -> models.FtthPortalConfig:
    cfg = db.query(models.FtthPortalConfig).order_by(models.FtthPortalConfig.id.asc()).first()
    if not cfg:
        cfg = models.FtthPortalConfig(
            login_url=login_url.strip(),
            list_url=(list_url or "").strip() or None,
            username_enc=encrypt_str(username),
            password_enc=encrypt_str(password),
            parse_mode=parse_mode or "json_generic",
            parse_options=parse_options or {},
        )
        db.add(cfg)
    else:
        cfg.login_url = login_url.strip()
        cfg.list_url = (list_url or "").strip() or None
        cfg.username_enc = encrypt_str(username)
        cfg.password_enc = encrypt_str(password)
        cfg.parse_mode = parse_mode or "json_generic"
        cfg.parse_options = parse_options or {}
    db.flush()
    return cfg
