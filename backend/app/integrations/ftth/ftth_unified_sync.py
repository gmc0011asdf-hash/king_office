"""
مزامنة FTTH موحّدة: مسار القائمة vs التفاصيل يُحدَّد بـ parse_options.ftth_sync_fast_mode فقط.
- ftth_sync_fast_mode=true: list_only (قائمة + دفعة عناوين؛ بيانات أخف).
- ftth_sync_fast_mode=false أو غير مضبوط: full — لكل عميل fetch_unified_customer_bundle.
(قيمة sync_mode النصية القديمة لا تُستخدم لاختيار المسار — تجنّباً لأخطاء مثل sync_mode: true → list_only.)
"""
from __future__ import annotations

import json
import logging
import random
import re
import threading
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from typing import Any

import httpx

from app.integrations.ftth.ftth_iq_api import (
    _extract_ftth_fat_label,
    _extract_phone_from_sources,
    _ftth_iq_get_curl_fallback,
    _ftth_log_endpoint_attempt,
    _ftth_subscription_candidates,
    _headers_for_customer_detail_page,
    _pick_ci,
    _warmup_admin_httpx,
    ftth_iq_effective_options,
    ftth_iq_extract_items,
    ftth_iq_fetch_addresses_map,
    ftth_iq_fetch_customer_detail,
    ftth_iq_fetch_customer_page,
    ftth_iq_list_item_account_id,
    ftth_iq_subscription_list,
)

logger = logging.getLogger(__name__)


def ftth_sync_fast_mode_enabled(opts: dict[str, Any] | None) -> bool:
    """
    المسار السريع (list_only) يُفعَّل فقط عندما يكون fast mode صراحة true/1/yes.
    القيم النصية "false" أو boolean false لا تُفعّل المسار السريع.
    """
    o = opts or {}
    v = o.get("ftth_sync_fast_mode")
    if v is True:
        return True
    if v is False or v is None:
        return False
    s = str(v).strip().lower()
    return s in ("true", "1", "yes", "on")


def _ftth_debug_json(label: str, cid: str, obj: Any, *, max_len: int = 12000) -> None:
    """سجلات تشخيص: RAW LIST / DETAIL / SUBSCRIPTION / ADDRESS / UNIFIED."""
    try:
        s = json.dumps(obj, ensure_ascii=False, default=str)
    except Exception:
        s = str(obj)
    if len(s) > max_len:
        s = s[:max_len] + "...(truncated)"
    logger.info("FTTH_DEBUG %s cid=%s\n%s", label, cid, s)

FtthIqGetParams = dict[str, str] | list[tuple[str, str]]


def _unwrap_display(v: Any) -> Any:
    if isinstance(v, dict):
        return v.get("displayValue") or v.get("display_value") or v.get("name") or v
    return v


def _unwrap_contact_scalar(v: Any) -> Any:
    """
    حقول primaryContact.mobile وغيرها قد تكون نصاً أو كائناً بـ displayValue (.NET/FTTH IQ).
    يجب فكها قبل الحفظ؛ وإلا str(dict) يفسد القيمة أو يُترك الحقل فارغاً في الواجهة.
    """
    if v is None:
        return None
    cur: Any = v
    for _ in range(8):
        if isinstance(cur, dict):
            nxt = (
                cur.get("displayValue")
                or cur.get("display_value")
                or cur.get("name")
                or cur.get("value")
            )
            if nxt is None:
                return None
            cur = nxt
            continue
        return cur
    return None


def _unwrap_address_field(a0: dict[str, Any], key: str) -> Any:
    """حقل عنوان قد يكون نصاً أو كائناً له displayValue."""
    v = a0.get(key)
    if v is None:
        return None
    if isinstance(v, dict):
        return _unwrap_display(v.get("displayValue")) or _unwrap_display(v.get("name"))
    s = str(v).strip()
    return s or None


def _unwrap_detail_model(detail: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(detail, dict):
        return None
    m = detail.get("model")
    if isinstance(m, dict):
        return m
    inner = detail.get("detail")
    if isinstance(inner, dict):
        m2 = inner.get("model")
        if isinstance(m2, dict):
            return m2
    return detail


def _extract_subscription_items_list(sub_payload: Any) -> list[dict[str, Any]]:
    if sub_payload is None:
        return []
    if isinstance(sub_payload, dict):
        items = sub_payload.get("items")
        if isinstance(items, list):
            return [x for x in items if isinstance(x, dict)]
        return []
    if isinstance(sub_payload, list):
        return [x for x in sub_payload if isinstance(x, dict)]
    return []


def _parse_dt_for_subscription_sort(val: Any) -> datetime | None:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val if val.tzinfo else val.replace(tzinfo=timezone.utc)
    if isinstance(val, date) and not isinstance(val, datetime):
        return datetime(val.year, val.month, val.day, tzinfo=timezone.utc)
    s = str(val).strip()
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _expires_sort_ts(it: dict[str, Any]) -> float:
    dt = _parse_dt_for_subscription_sort(it.get("expires"))
    if dt is None:
        return float("-inf")
    return dt.timestamp()


def pick_best_subscription_item(
    sub_payload: Any,
    customer_id: str | None = None,
) -> dict[str, Any] | None:
    """
    عند تعدد الاشتراكات: Active ثم hasActiveSession ثم أحدث expires، وإلا الأفضل بعد الترتيب.
    """
    items = _extract_subscription_items_list(sub_payload)
    if not items:
        return None
    if len(items) > 1 and customer_id:
        logger.warning("FTTH MULTIPLE SUBSCRIPTIONS DETECTED FOR CUSTOMER %s", customer_id)

    def _active_pri(it: dict[str, Any]) -> int:
        return 1 if str(it.get("status") or "").strip().lower() == "active" else 0

    def _sess_pri(it: dict[str, Any]) -> int:
        return 1 if it.get("hasActiveSession") is True else 0

    return sorted(
        items,
        key=lambda it: (_active_pri(it), _sess_pri(it), _expires_sort_ts(it)),
        reverse=True,
    )[0]


def _parse_commitment_period(val: Any) -> int | None:
    if val is None:
        return None
    if isinstance(val, (int, float)):
        i = int(val)
        return i if i > 0 else None
    s = str(val).strip()
    if not s:
        return None
    m = re.search(r"(\d+)", s)
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            return None
    return None


def _random_delay_ms(opts: dict[str, Any]) -> float:
    lo = max(100, int(opts.get("ftth_iq_delay_ms_min") or 500))
    hi = max(lo, int(opts.get("ftth_iq_delay_ms_max") or 800))
    return random.uniform(lo / 1000.0, hi / 1000.0)


def _sleep_throttle(opts: dict[str, Any]) -> None:
    delay = _random_delay_ms(opts)
    # عند تفعيل التزامن المتوازي (ftth_sync_concurrency > 1) يُخفّض التأخير بين الطلبات تلقائياً
    c = int(opts.get("ftth_sync_concurrency") or 1)
    if c > 1:
        delay *= max(0.12, min(0.55, 0.85 / float(c)))
    time.sleep(delay)


def ftth_iq_http_get_unified(
    url: str,
    headers: dict[str, str],
    params: FtthIqGetParams | None = None,
    timeout: float = 120.0,
) -> tuple[int, str, list[Any], str]:
    """
    GET مع تتبع redirects: يُرجع (status, text, history, final_url).
    """
    history: list[Any] = []
    final_url = url
    with httpx.Client(follow_redirects=True, timeout=timeout) as client:
        _warmup_admin_httpx(client)
        r = client.get(url, params=params if params is not None else {}, headers=headers)
        history = list(r.history)
        status = r.status_code
        text = r.text or ""
        final_url = str(r.url)
    if status == 418:
        curl_res = _ftth_iq_get_curl_fallback(
            url, params if params is not None else {}, headers
        )
        if curl_res and curl_res.status_code > 0:
            status, text = curl_res.status_code, curl_res.text or ""
    return status, text, history, final_url


def _detect_session_or_rate_limit(
    url: str,
    status: int,
    text: str,
    history: list[Any],
    final_url: str | None,
) -> str | None:
    """يُرجع 'session' | 'rate_limit' | None"""
    if history:
        for h in history:
            if h.status_code in (301, 302, 303, 307, 308):
                loc = (h.headers.get("Location") or "") or ""
                if "login" in loc.lower() or "auth" in loc.lower():
                    logger.error(
                        "FTTH SESSION EXPIRED OR REDIRECT DETECTED url=%s location=%s",
                        url,
                        loc[:300],
                    )
                    return "session"
    fu = (final_url or "").lower()
    if "login" in fu or "auth" in fu:
        logger.error("FTTH SESSION EXPIRED OR REDIRECT DETECTED (final url) url=%s", final_url)
        return "session"
    if status == 403:
        tl = (text or "").lower()
        if "rate-limit" in tl or "rate limit" in tl:
            logger.error("FTTH RATE LIMIT DETECTED url=%s", url)
            return "rate_limit"
        logger.error("FTTH RATE LIMIT DETECTED (403) url=%s", url)
        return "rate_limit"
    if status == 302:
        logger.error("FTTH SESSION EXPIRED OR REDIRECT DETECTED status=302 url=%s", url)
        return "session"
    return None


def _get_with_retry(
    url: str,
    headers: dict[str, str],
    params: FtthIqGetParams | None,
    opts: dict[str, Any],
    label: str,
) -> tuple[int, str, str | None]:
    """
    max_retries=2 مع backoff بسيط.
    يُرجع (status, text, error_kind) حيث error_kind في {'session','rate_limit'} أو None.
    """
    max_retries = max(0, min(5, int(opts.get("ftth_iq_max_retries") or 2)))
    last_status = 0
    last_text = ""
    for attempt in range(max_retries + 1):
        status, text, history, final_u = ftth_iq_http_get_unified(url, headers, params)
        last_status, last_text = status, text
        kind = _detect_session_or_rate_limit(url, status, text, history, final_u)
        _ftth_log_endpoint_attempt(url, status, text)
        if kind == "session":
            return status, text, "session"
        if kind == "rate_limit":
            return status, text, "rate_limit"
        if 200 <= status < 300 and (text or "").strip():
            return status, text, None
        if attempt < max_retries:
            backoff = 0.4 * (2**attempt)
            logger.warning(
                "%s retry %s/%s after %.1fs url=%s",
                label,
                attempt + 1,
                max_retries,
                backoff,
                url,
            )
            time.sleep(backoff)
    return last_status, last_text, None


def _merge_addr_batch_into_unified(
    unified: dict[str, Any],
    list_row: dict[str, Any],
    *,
    minimal: bool = False,
) -> None:
    """
    يكمل حقولاً من عنصر GET .../addresses?accountIds=... (يُجلب دفعة واحدة لكل صفحة قائمة).
    minimal=True: يُكمل الهاتف و«address» للقائمة فقط (لا zone/fat/onu/location).
    """
    ab = list_row.get("_ftth_addr_batch_item")
    if not isinstance(ab, dict):
        return
    if not unified.get("phone"):
        cust = ab.get("customer")
        if isinstance(cust, dict):
            ph = _extract_phone_from_sources(cust)
            if ph is not None and str(ph).strip():
                unified["phone"] = str(ph).strip()
    # The addresses API returns deviceDetails/zone at the top level of each item (ab),
    # not nested inside a "ftthAddress" sub-object.  Fall back to ab itself when
    # "ftthAddress" is absent so fdt/fat/zone/onu are always read correctly.
    addr = ab.get("ftthAddress")
    addr_src = addr if isinstance(addr, dict) else ab
    if not unified.get("zone"):
        z = addr_src.get("zone")
        if isinstance(z, dict):
            zv = z.get("displayValue") or z.get("id") or z.get("name")
            if zv is not None and str(zv).strip():
                unified["zone"] = str(zv).strip()[:200]
    dd = addr_src.get("deviceDetails")
    if isinstance(dd, dict):
        if not unified.get("fdt"):
            fdt_o = dd.get("fdt")
            fdt_v = _extract_ftth_fat_label(fdt_o)
            if fdt_v:
                unified["fdt"] = fdt_v[:200]
        if not unified.get("fat"):
            fat_o = dd.get("fat")
            fl = _extract_ftth_fat_label(fat_o)
            if not fl:
                for alt_key in ("fatName", "fat_name", "fatLabel", "oltName", "olt", "fdp"):
                    fl = _extract_ftth_fat_label(dd.get(alt_key))
                    if fl:
                        break
            if fl:
                unified["fat"] = fl
        if not unified.get("onu_username"):
            uv = dd.get("username") or dd.get("userName") or dd.get("pppoeUsername")
            if uv is not None and str(uv).strip():
                unified["onu_username"] = str(uv).strip()[:200]
    if not unified.get("location"):
        lv = addr_src.get("displayValue") or addr_src.get("display_value")
        if lv is not None and str(lv).strip():
            unified["location"] = str(lv).strip()[:2000]
        elif addr_src.get("nearestPoint"):
            unified["location"] = str(addr_src.get("nearestPoint")).strip()[:2000]
    # نفس نص العرض يُستخدم كعنوان في النورم؛ في وضع full كان يُملأ location دون address فيُضيع في DB
    if not unified.get("address"):
        lv2 = addr_src.get("displayValue") or addr_src.get("display_value")
        if lv2 is not None and str(lv2).strip():
            unified["address"] = str(lv2).strip()[:2000]
        elif unified.get("location") and str(unified.get("location")).strip():
            unified["address"] = str(unified.get("location")).strip()[:2000]


def fetch_customer_detail_primary(
    access_token: str,
    customer_id: str,
    opts: dict[str, Any] | None = None,
) -> tuple[dict[str, Any] | None, str | None]:
    """
    GET /api/customers/{id} أولاً؛ عند الفشل يجرّب القوالب المتعددة في ftth_iq_fetch_customer_detail.
    """
    cfg = ftth_iq_effective_options(opts)
    cid = str(customer_id).strip()
    if not cid:
        return None, None
    path = f"customers/{cid}".strip().lstrip("/")
    url = f"{cfg['api_base']}{path}"
    logger.info("FTTH DETAIL FETCH URL (primary): %s", url)
    headers = _headers_for_customer_detail_page(cfg, access_token, cid)
    status, text, err = _get_with_retry(url, headers, None, opts or {}, "detail")
    if err:
        return None, err
    if status != 200 or not (text or "").strip():
        row = None
    else:
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            data = None
        row = data if isinstance(data, dict) else None
        if row is None and isinstance(data, list) and data and isinstance(data[0], dict):
            row = data[0]
    if isinstance(row, dict) and row:
        return (row, None)
    logger.info(
        "FTTH DETAIL FETCH: primary empty or non-200 — trying ftth_iq_fetch_customer_detail fallbacks for cid=%s",
        cid,
    )
    fb = ftth_iq_fetch_customer_detail(access_token, cid, opts)
    if isinstance(fb, dict) and fb:
        return (fb, None)
    return (None, None)


def _embedded_subscription_payload_from_list_row(list_row: dict[str, Any]) -> Any | None:
    """
    إذا ضمّ صف القائمة/الملخص اشتراكاً جاهزاً (مفاتيح ftth_iq_api._ftth_subscription_candidates)،
    نُرجع {items: [...]} لـ pick_best_subscription_item دون GET .../subscriptions.
    """
    cands = _ftth_subscription_candidates(list_row)
    if not cands:
        return None
    return {"items": cands}


def fetch_customer_subscriptions_primary(
    access_token: str,
    customer_id: str,
    opts: dict[str, Any] | None = None,
) -> tuple[Any | None, str | None]:
    cfg = ftth_iq_effective_options(opts)
    o = opts or {}
    raw_tpl = o.get("ftth_iq_subscriptions_path_templates")
    if isinstance(raw_tpl, list) and raw_tpl:
        templates = [str(p).strip() for p in raw_tpl if str(p).strip()]
    else:
        templates = ["customers/{id}/subscriptions", "customers/{id}/subscription"]
    cid = str(customer_id).strip()
    if not cid:
        return None, None
    for tpl in templates:
        path = tpl.replace("{id}", cid).strip().lstrip("/")
        url = f"{cfg['api_base']}{path}"
        headers = _headers_for_customer_detail_page(cfg, access_token, cid)
        status, text, err = _get_with_retry(url, headers, None, o, "subscriptions")
        if err:
            return None, err
        if status != 200 or not (text or "").strip():
            continue
        try:
            return json.loads(text), None
        except json.JSONDecodeError:
            continue
    return None, None


def _normalize_sync_profile(raw: str | None, opts: dict[str, Any]) -> str:
    """full = تفاصيل كاملة + اشتراك من API؛ minimal = مزامنة قائمة سريعة دون GET /customers/{id}."""
    s = (raw or opts.get("ftth_sync_profile") or "full").strip().lower()
    if s in ("full", "complete", "detail"):
        return "full"
    return "minimal"


def _phone_str_unified(v: Any) -> Any:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def _group1_from_customer_detail_model(model: dict[str, Any]) -> dict[str, Any]:
    """مصدر: GET /customers/{id} (نموذج العميل فقط)."""
    if not isinstance(model, dict):
        model = {}
    pc = model.get("primaryContact") or {}
    if not isinstance(pc, dict):
        pc = {}
    phone_val = _unwrap_contact_scalar(pc.get("mobile")) or _unwrap_contact_scalar(pc.get("phone"))
    if phone_val is None and model:
        phone_val = _unwrap_contact_scalar(_extract_phone_from_sources(model))
    secondary_phone = _unwrap_contact_scalar(pc.get("secondaryPhone"))
    email = _unwrap_contact_scalar(pc.get("email"))

    ct_d = model.get("customerType")
    customer_type = _unwrap_display(ct_d.get("displayValue")) if isinstance(ct_d, dict) else None

    usr_referral_code = model.get("usrReferralCode")
    if usr_referral_code is not None and str(usr_referral_code).strip() == "":
        usr_referral_code = None

    ext_id = model.get("id")
    self_blk = model.get("self") if isinstance(model.get("self"), dict) else {}
    full_name = (
        _pick_ci(model, "displayName", "name")
        or (self_blk.get("displayValue") if isinstance(self_blk, dict) else None)
    )

    addrs = model.get("addresses")
    address_display = None
    governorate = None
    district = None
    sub_district = None
    neighborhood = None
    street = None
    house = None
    gps_lat = None
    gps_lon = None
    if isinstance(addrs, list) and addrs and isinstance(addrs[0], dict):
        a0 = addrs[0]
        address_display = a0.get("displayValue")
        g = a0.get("governorate")
        if isinstance(g, dict):
            governorate = _unwrap_display(g.get("displayValue"))
        d = a0.get("district")
        if isinstance(d, dict):
            district = _unwrap_display(d.get("displayValue"))
        sd = a0.get("subDistrict")
        if isinstance(sd, dict):
            sub_district = _unwrap_display(sd.get("displayValue"))
        neighborhood = _unwrap_address_field(a0, "neighborhood")
        street = _unwrap_address_field(a0, "street")
        house = _unwrap_address_field(a0, "house")
        gps = a0.get("gpsCoordinate")
        if isinstance(gps, dict):
            gps_lat = gps.get("latitude")
            gps_lon = gps.get("longitude")

    return {
        "external_customer_id": str(ext_id).strip() if ext_id is not None else None,
        "full_name": full_name,
        "created_at": model.get("createdAt"),
        "customer_type": customer_type,
        "phone": _phone_str_unified(phone_val),
        "secondary_phone": _phone_str_unified(secondary_phone),
        "email": _phone_str_unified(email),
        "address": address_display,
        "governorate": governorate,
        "district": district,
        "sub_district": sub_district,
        "neighborhood": neighborhood,
        "street": street,
        "house": house,
        "gps_latitude": gps_lat,
        "gps_longitude": gps_lon,
        "usr_referral_code": usr_referral_code,
    }


def _bootstrap_ext_name_from_list_row(list_row: dict[str, Any]) -> tuple[Any, Any]:
    self_b = list_row.get("self") if isinstance(list_row.get("self"), dict) else {}
    ext_id = list_row.get("id") or self_b.get("id")
    full_name = self_b.get("displayValue") or list_row.get("displayValue")
    return ext_id, full_name


def _group1_sync_minimal_from_list_row(list_row: dict[str, Any]) -> dict[str, Any]:
    ext_id, full_name = _bootstrap_ext_name_from_list_row(list_row)
    phone_val = _unwrap_contact_scalar(_extract_phone_from_sources(list_row))
    addr_guess = _pick_ci(list_row, "address", "displayAddress", "fullAddress", "locationText")
    if addr_guess is None and isinstance(list_row.get("ftthAddress"), dict):
        fa = list_row["ftthAddress"]
        addr_guess = fa.get("displayValue") or fa.get("display_value")
    return {
        "external_customer_id": str(ext_id).strip() if ext_id is not None else None,
        "full_name": full_name,
        "created_at": None,
        "customer_type": None,
        "phone": _phone_str_unified(phone_val),
        "secondary_phone": None,
        "email": None,
        "address": str(addr_guess).strip()[:2000] if addr_guess is not None and str(addr_guess).strip() else None,
        "governorate": None,
        "district": None,
        "sub_district": None,
        "neighborhood": None,
        "street": None,
        "house": None,
        "gps_latitude": None,
        "gps_longitude": None,
        "usr_referral_code": None,
    }


def _group2_from_subscription_item_full(sub_item: dict[str, Any] | None) -> dict[str, Any]:
    """مصدر: GET .../customers/{id}/subscriptions."""
    if sub_item is None:
        return {
            "subscription_status": None,
            "subscription_start_date": None,
            "subscription_end_date": None,
            "zone": None,
            "bundle": None,
            "commitment_period": None,
            "onu_username": None,
            "onu_serial": None,
            "fdt": None,
            "fat": None,
            "ip_address": None,
            "mac_address": None,
            "has_active_session": None,
            "active_session_started_at": None,
            "partner_name": None,
            "is_pending": None,
            "is_trial": None,
        }
    z = sub_item.get("zone")
    zone = _unwrap_display(z.get("displayValue")) if isinstance(z, dict) else _unwrap_display(z)
    b = sub_item.get("bundle")
    bundle = _unwrap_display(b.get("displayValue")) if isinstance(b, dict) else _unwrap_display(b)
    commitment_period = sub_item.get("commitmentPeriod")
    dd = sub_item.get("deviceDetails")
    if isinstance(dd, dict):
        onu_u = dd.get("username")
        onu_serial = dd.get("serial")
        fdt_o = dd.get("fdt")
        fat_o = dd.get("fat")
        fdt = _unwrap_display(fdt_o.get("displayValue")) if isinstance(fdt_o, dict) else _unwrap_display(fdt_o)
        fat = _unwrap_display(fat_o.get("displayValue")) if isinstance(fat_o, dict) else _unwrap_display(fat_o)
    else:
        onu_u = onu_serial = fdt = fat = None
    
    if not onu_u:
        onu_u = sub_item.get("username")
        
    if not fdt:
        z_o = sub_item.get("zone")
        fdt = _unwrap_display(z_o.get("displayValue")) if isinstance(z_o, dict) else _unwrap_display(z_o)
        
    act = sub_item.get("activeSession")
    active_sess_start = act.get("startedAt") if isinstance(act, dict) else None
    pn = sub_item.get("partner")
    if isinstance(pn, dict):
        partner_name = _unwrap_display(pn.get("displayValue")) or _unwrap_display(pn.get("name"))
    else:
        partner_name = _unwrap_display(pn)
    return {
        "subscription_status": _unwrap_display(sub_item.get("status")),
        "subscription_start_date": sub_item.get("startedAt"),
        "subscription_end_date": sub_item.get("expires"),
        "zone": zone,
        "bundle": bundle,
        "commitment_period": commitment_period,
        "onu_username": onu_u,
        "onu_serial": onu_serial,
        "fdt": fdt,
        "fat": fat,
        "ip_address": sub_item.get("ipAddress"),
        "mac_address": sub_item.get("macAddress"),
        "has_active_session": sub_item.get("hasActiveSession"),
        "active_session_started_at": active_sess_start,
        "partner_name": partner_name,
        "is_pending": sub_item.get("isPending"),
        "is_trial": sub_item.get("isTrial"),
    }


def _group2_sync_minimal_from_subscription(sub_raw: Any, cid: str | None) -> dict[str, Any]:
    sub_item = pick_best_subscription_item(sub_raw, cid)
    if sub_item is None:
        return _group2_from_subscription_item_full(None)
    b = sub_item.get("bundle")
    bundle = _unwrap_display(b.get("displayValue")) if isinstance(b, dict) else _unwrap_display(b)
    out = _group2_from_subscription_item_full(None)
    out["subscription_status"] = _unwrap_display(sub_item.get("status"))
    out["subscription_end_date"] = sub_item.get("expires")
    out["bundle"] = bundle
    return out


def build_unified_record(
    list_row: dict[str, Any],
    detail_raw: dict[str, Any] | None,
    sub_raw: Any | None,
    *,
    mode: str = "full",
    subscription_source: str = "subscriptions",
) -> dict[str, Any]:
    """
    السجل الموحّد للواجهة.
    full: مجموعة (1) من نموذج تفاصيل العميل؛ مجموعة (2) من الاشتراكات.
    sync_minimal: حقول قائمة فقط من صف القائمة + اشتراك مختصر.
    """
    mode_l = (mode or "full").strip().lower()
    self_b = list_row.get("self") if isinstance(list_row.get("self"), dict) else {}
    ext_fallback = list_row.get("id") or self_b.get("id")
    ext_for_log = str(ext_fallback).strip() if ext_fallback is not None else None

    if mode_l == "sync_minimal":
        g1 = _group1_sync_minimal_from_list_row(list_row)
        g2 = _group2_sync_minimal_from_subscription(sub_raw, ext_for_log)
        return {
            **g1,
            **g2,
            "phone_source": "list_sync",
            "address_source": "list_sync",
            "subscription_source": "subscriptions",
        }

    model = _unwrap_detail_model(detail_raw) if detail_raw else None
    if not isinstance(model, dict):
        model = {}

    if detail_raw:
        g1 = _group1_from_customer_detail_model(model)
        # If the detail model doesn't expose an id field (portal-dependent), fall back to
        # the list_row id so external_customer_id is never silently null.
        if g1.get("external_customer_id") is None and isinstance(list_row, dict):
            _fb_id = list_row.get("id") or (list_row.get("self") or {}).get("id")
            if _fb_id is not None:
                g1 = {**g1, "external_customer_id": str(_fb_id).strip()}
    else:
        ext_id, full_name = _bootstrap_ext_name_from_list_row(list_row)
        # Extract what IS available from the summary/list row when detail is absent
        _ct_raw = list_row.get("customerType") if isinstance(list_row, dict) else None
        _customer_type_from_list = _unwrap_display(_ct_raw.get("displayValue") if isinstance(_ct_raw, dict) else _ct_raw)
        _primary_phone = (list_row.get("primaryPhone") or "") if isinstance(list_row, dict) else ""
        _primary_phone = _primary_phone.strip() or None
        _secondary_phone = (list_row.get("secondaryPhone") or "") if isinstance(list_row, dict) else ""
        _secondary_phone = _secondary_phone.strip() or None
        g1 = {
            "external_customer_id": str(ext_id).strip() if ext_id is not None else None,
            "full_name": full_name,
            "created_at": None,
            "customer_type": _customer_type_from_list,
            "phone": _primary_phone,
            "secondary_phone": _secondary_phone,
            "email": None,
            "address": None,
            "governorate": None,
            "district": None,
            "sub_district": None,
            "neighborhood": None,
            "street": None,
            "house": None,
            "gps_latitude": None,
            "gps_longitude": None,
            "usr_referral_code": None,
        }

    sub_item = pick_best_subscription_item(sub_raw, ext_for_log)
    g2 = _group2_from_subscription_item_full(sub_item if isinstance(sub_item, dict) else None)

    return {
        **g1,
        **g2,
        "phone_source": "customer_detail" if detail_raw else "none",
        "address_source": "customer_detail" if detail_raw else "none",
        "subscription_source": subscription_source,
    }


def fetch_unified_customer_bundle(
    access_token: str,
    cid: str,
    list_row: dict[str, Any],
    opts: dict[str, Any],
    *,
    rate_limited_stop_in: bool,
    verbose_logs: bool = True,
    sync_profile: str | None = None,
    subscriptions_map: dict[str, list[dict[str, Any]]] | None = None,
) -> tuple[
    dict[str, Any] | None,
    Any | None,
    dict[str, Any],
    bool,
    bool,
]:
    """
    جلب تفاصيل + اشتراكات وبناء السجل الموحّد لعميل واحد.
    sync_profile=full: GET تفاصيل ثم اشتراك (صفحة العميل بالمعرف الخارجي).
    sync_profile=minimal: بدون GET /customers/{id} (يُضبط عادةً عبر ftth_sync_fast_mode أو parse_options).
    """
    profile = _normalize_sync_profile(sync_profile, opts)
    build_mode = "sync_minimal" if profile == "minimal" else "full"
    dbp = bool(opts.get("ftth_sync_debug_payloads", True))

    rate_limited_stop = rate_limited_stop_in
    detail_raw: dict[str, Any] | None = None
    derr: str | None = None

    if dbp:
        _ftth_debug_json("RAW_LIST_ROW", cid, list_row)

    if profile == "full":
        skip_detail = bool(opts.get("ftth_sync_skip_customer_detail"))
        if skip_detail:
            detail_raw = None
            derr = None
            if dbp:
                _ftth_debug_json(
                    "RAW_DETAIL",
                    cid,
                    {"skipped": True, "reason": "ftth_sync_skip_customer_detail"},
                )
        else:
            _sleep_throttle(opts)
            try:
                detail_raw, derr = fetch_customer_detail_primary(access_token, cid, opts)
                if derr == "rate_limit":
                    rate_limited_stop = True
                    logger.error(
                        "FTTH RATE LIMIT — stopping optional detail/sub fetches for remaining customers"
                    )
                elif derr == "session":
                    logger.error("FTTH SESSION EXPIRED — aborting unified sync")
                    u = build_unified_record(list_row, None, None, mode=build_mode)
                    u["_sync_list_row"] = list_row
                    u["_sync_detail_raw"] = None
                    u["_sync_sub_raw"] = None
                    return None, None, u, rate_limited_stop, True
            except Exception as e:
                logger.warning("FTTH DETAIL FETCH FAILED FOR CUSTOMER ID: %s err=%s", cid, e)
                detail_raw = None

            if not detail_raw and derr is None:
                logger.warning("FTTH DETAIL FETCH FAILED FOR CUSTOMER ID: %s", cid)

            if detail_raw:
                model = _unwrap_detail_model(detail_raw)
                pc = (model or {}).get("primaryContact") if isinstance(model, dict) else {}
                if not isinstance(pc, dict):
                    pc = {}
                ph = _unwrap_contact_scalar(pc.get("mobile")) or pc.get("mobile")
                n_addr = 0
                if isinstance(model, dict) and isinstance(model.get("addresses"), list):
                    n_addr = len(model["addresses"])
                if verbose_logs:
                    logger.info("========== FTTH RAW CUSTOMER DETAIL ==========")
                    logger.info("FTTH DETAIL CUSTOMER ID: %s", cid)
                    logger.info("FTTH DETAIL PHONE: %s", ph)
                    logger.info("FTTH DETAIL ADDRESS COUNT: %s", n_addr)
                    logger.info(
                        "========== END FTTH RAW CUSTOMER DETAIL (summary) ==========",
                    )
                if dbp and detail_raw is not None:
                    _ftth_debug_json("RAW_DETAIL", cid, detail_raw)
    else:
        detail_raw = None

    sub_raw: Any = None
    skip_sub_if_emb = bool(opts.get("ftth_sync_skip_subscription_if_embedded", True))
    if profile == "minimal" and skip_sub_if_emb and isinstance(list_row, dict):
        emb_payload = _embedded_subscription_payload_from_list_row(list_row)
        if emb_payload is not None and _extract_subscription_items_list(emb_payload):
            sub_raw = emb_payload
            list_row["_ftth_used_embedded_subscription"] = True
            if verbose_logs:
                logger.info(
                    "FTTH using embedded subscription from list/summary row for cid=%s",
                    cid,
                )

    # Try to get subscriptions from bulk map first
    if sub_raw is None and subscriptions_map is not None:
        customer_subs = subscriptions_map.get(cid)
        if customer_subs:
            sub_raw = {"items": customer_subs}
            if verbose_logs:
                logger.info(
                    "FTTH using bulk subscriptions from /api/subscriptions for cid=%s",
                    cid,
                )

    if sub_raw is None and not rate_limited_stop:
        _sleep_throttle(opts)
        serr = None
        try:
            sub_raw, serr = fetch_customer_subscriptions_primary(access_token, cid, opts)
            if serr == "rate_limit":
                rate_limited_stop = True
            elif serr == "session":
                logger.error("FTTH SESSION EXPIRED — aborting unified sync")
                u = build_unified_record(list_row, detail_raw, None, mode=build_mode)
                u["_sync_list_row"] = list_row
                u["_sync_detail_raw"] = detail_raw
                u["_sync_sub_raw"] = None
                return detail_raw, None, u, rate_limited_stop, True
        except Exception as e:
            logger.warning("FTTH SUBSCRIPTION FETCH FAILED FOR CUSTOMER ID: %s err=%s", cid, e)
            sub_raw = None
            serr = None
        if sub_raw is None and serr is None and not rate_limited_stop:
            logger.warning("FTTH SUBSCRIPTION FETCH FAILED FOR CUSTOMER ID: %s", cid)

    if dbp and sub_raw is not None:
        _ftth_debug_json("RAW_SUBSCRIPTION", cid, sub_raw)

    if sub_raw is not None:
        si = pick_best_subscription_item(sub_raw, cid)
        if verbose_logs:
            logger.info("========== FTTH RAW SUBSCRIPTION ==========")
            logger.info("FTTH SUBSCRIPTION CUSTOMER ID: %s", cid)
            logger.info("FTTH SUBSCRIPTION STATUS: %s", (si or {}).get("status") if si else None)
            logger.info("FTTH SUBSCRIPTION START: %s", (si or {}).get("startedAt") if si else None)
            logger.info("FTTH SUBSCRIPTION END: %s", (si or {}).get("expires") if si else None)
            logger.info("========== END FTTH RAW SUBSCRIPTION (summary) ==========")

    # Determine subscription source
    sub_source = "subscriptions"
    if isinstance(list_row, dict) and list_row.get("_ftth_used_embedded_subscription"):
        sub_source = "list_summary_embedded"
    elif subscriptions_map is not None and cid in subscriptions_map:
        sub_source = "bulk_subscriptions"
    elif sub_raw is not None:
        sub_source = "per_customer_api"

    unified = build_unified_record(list_row, detail_raw, sub_raw, mode=build_mode, subscription_source=sub_source)
    _merge_addr_batch_into_unified(unified, list_row, minimal=(profile == "minimal"))
    if (
        dbp
        and isinstance(list_row, dict)
        and list_row.get("_ftth_addr_batch_item") is not None
    ):
        ab = list_row.get("_ftth_addr_batch_item")
        _ftth_debug_json("RAW_ADDRESS_BATCH", cid, ab)
        _ftth_debug_json("RAW_ADDRESS", cid, ab)

    if profile == "minimal":
        has_batch = bool(list_row.get("_ftth_addr_batch_item")) if isinstance(list_row, dict) else False
        if has_batch and unified.get("phone"):
            unified["phone_source"] = "batch_addresses"
        elif unified.get("phone"):
            unified["phone_source"] = "list_sync"
        if has_batch and unified.get("address"):
            unified["address_source"] = "batch_addresses"
        elif unified.get("address"):
            unified["address_source"] = "list_sync"

    unified["_sync_list_row"] = list_row
    unified["_sync_detail_raw"] = detail_raw
    unified["_sync_sub_raw"] = sub_raw
    if dbp:
        u_log = {k: v for k, v in unified.items() if not str(k).startswith("_sync_")}
        _ftth_debug_json("FINAL_UNIFIED_CUSTOMER", cid, u_log)
    elif verbose_logs:
        u_log = {k: v for k, v in unified.items() if not str(k).startswith("_sync_")}
        logger.info("========== FTTH UNIFIED RECORD ==========\n%s", json.dumps(u_log, ensure_ascii=False, default=str))
        logger.info("========== END FTTH UNIFIED RECORD ==========")

    return detail_raw, sub_raw, unified, rate_limited_stop, False


def unified_record_to_ftth_norm(u: dict[str, Any]) -> dict[str, Any] | None:
    """
    تحويل سجل build_unified_record إلى قاموس مفاتيحه = أسماء أعمدة FtthExternalData فقط
    (باستثناء id, imported_subscriber_id, synced_at, updated_at التي يضبطها محرك الحفظ).

    مصدر السجل الموحّد → اسم العمود في الموديل:
        external_customer_id → external_id
        full_name → national_name
        subscription_status → status
        subscription_start_date → start_date
        subscription_end_date → end_date
        onu_username → service_username
    """
    ext = u.get("external_customer_id")
    if not ext:
        return None
    list_row = u.get("_sync_list_row")
    detail_raw = u.get("_sync_detail_raw")
    sub_raw = u.get("_sync_sub_raw")
    up = {k: v for k, v in u.items() if not str(k).startswith("_sync_")}
    _raw_key_renames: tuple[tuple[str, str], ...] = (
        ("external_customer_id", "external_id"),
        ("full_name", "national_name"),
        ("subscription_status", "status"),
        ("subscription_start_date", "start_date"),
        ("subscription_end_date", "end_date"),
        ("onu_username", "service_username"),
    )
    for old_k, new_k in _raw_key_renames:
        if old_k in up:
            up[new_k] = up.pop(old_k)

    def _jb(x: Any) -> Any:
        if x is None:
            return None
        try:
            return json.loads(json.dumps(x, default=str))
        except Exception:
            return None

    def _trunc(s: Any, n: int) -> str | None:
        if s is None:
            return None
        t = str(s).strip()
        return t[:n] if t else None

    def _fnum(v: Any) -> float | None:
        if v is None:
            return None
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    cl = u.get("commitment_period")
    clabel = str(cl).strip()[:255] if cl is not None and str(cl).strip() else None
    cp_int = _parse_commitment_period(u.get("commitment_period"))
    addr_line = None
    if u.get("address") is not None and str(u.get("address")).strip():
        addr_line = str(u.get("address")).strip()
    elif u.get("location") is not None and str(u.get("location")).strip():
        addr_line = str(u.get("location")).strip()

    # ترتيب المفاتيح يطابق ترتيب أعمدة FtthExternalData في models.py (بدون id, imported_subscriber_id, synced_at, updated_at)
    return {
        "external_id": str(ext)[:255],
        "national_name": _trunc(u.get("full_name"), 500),
        "phone": _trunc(_unwrap_contact_scalar(u.get("phone")), 100),
        "secondary_phone": _trunc(_unwrap_contact_scalar(u.get("secondary_phone")), 100),
        "email": _trunc(_unwrap_contact_scalar(u.get("email")), 255),
        "customer_type": _trunc(u.get("customer_type"), 255),
        "zone": _trunc(u.get("zone"), 200),
        "fat": _trunc(u.get("fat"), 200),
        "fdt": _trunc(u.get("fdt"), 200),
        "bundle": _trunc(u.get("bundle"), 500),
        "location": addr_line,
        "address": addr_line,
        "governorate": _trunc(u.get("governorate"), 200),
        "district": _trunc(u.get("district"), 200),
        "sub_district": _trunc(u.get("sub_district"), 255),
        "neighborhood": _trunc(u.get("neighborhood"), 200),
        "street": _trunc(u.get("street"), 100),
        "house": _trunc(u.get("house"), 100),
        "gps_latitude": _fnum(u.get("gps_latitude")),
        "gps_longitude": _fnum(u.get("gps_longitude")),
        "service_username": _trunc(u.get("onu_username"), 200),
        "onu_serial": _trunc(u.get("onu_serial"), 200),
        "ip_address": _trunc(u.get("ip_address"), 100),
        "mac_address": _trunc(u.get("mac_address"), 100),
        "has_active_session": u.get("has_active_session"),
        "active_session_started_at": u.get("active_session_started_at"),
        "usr_referral_code": _trunc(u.get("usr_referral_code"), 255),
        "partner_name": _trunc(u.get("partner_name"), 255),
        "is_pending": u.get("is_pending"),
        "is_trial": u.get("is_trial"),
        "start_date": u.get("subscription_start_date"),
        "end_date": u.get("subscription_end_date"),
        "commitment_days": cp_int,
        "commitment_period": cp_int,
        "commitment_label": clabel,
        "remaining_days": None,
        "status": _trunc(u.get("subscription_status"), 255) if u.get("subscription_status") else None,
        "raw_payload": up,
        "raw_customer_json": _jb(list_row),
        "raw_detail_json": _jb(detail_raw),
        "raw_subscription_json": _jb(sub_raw),
    }


def build_unified_customer_from_list_row(
    list_row: dict[str, Any],
    cid: str,
    opts: dict[str, Any],
) -> dict[str, Any]:
    """
    سجل موحّد خفيف من صف القائمة/الملخص وعنصر دفعة العناوين (_ftth_addr_batch_item) فقط.
    لا يستدعي GET /customers/{id} ولا GET .../subscriptions — للمزامنة العامة (list-only).
    opts محجوز للتوافق ولتوسيع السلوك لاحقاً.
    """
    _ = opts
    ext_for_log = str(cid).strip() if cid else None
    g1 = _group1_sync_minimal_from_list_row(list_row)
    emb = _embedded_subscription_payload_from_list_row(list_row)
    has_emb = bool(emb and _extract_subscription_items_list(emb))
    if has_emb:
        g2 = _group2_sync_minimal_from_subscription(emb, ext_for_log)
        sub_source = "list_summary_embedded"
        list_row["_ftth_used_embedded_subscription"] = True
    else:
        g2 = _group2_sync_minimal_from_subscription(None, ext_for_log)
        sub_source = "list_row_only"

    unified: dict[str, Any] = {
        **g1,
        **g2,
        "phone_source": "list_sync",
        "address_source": "list_sync",
        "subscription_source": sub_source,
    }
    _merge_addr_batch_into_unified(unified, list_row, minimal=True)
    if list_row.get("_ftth_addr_batch_item"):
        if unified.get("phone"):
            unified["phone_source"] = "batch_addresses"
        if unified.get("address"):
            unified["address_source"] = "batch_addresses"

    unified["_sync_list_row"] = list_row
    unified["_sync_detail_raw"] = None
    unified["_sync_sub_raw"] = emb if has_emb else None
    return unified


def _normalize_run_sync_mode(opts: dict[str, Any]) -> str:
    """
    list_only فقط عند ftth_sync_fast_mode — لا نستخدم opts['sync_mode'] النصي/المنطقي
    (كان يسبب list_only عند sync_mode: true من JSON كقيمة boolean).
    """
    if ftth_sync_fast_mode_enabled(opts):
        return "list_only"
    return "full"


def _fetch_all_subscriptions(
    access_token: str,
    opts: dict[str, Any],
) -> dict[str, list[dict[str, Any]]]:
    """
    Fetch all subscriptions from /api/subscriptions and group by customer.id.
    Returns: customer_id -> list of subscription items
    """
    logger.info("FTTH_SYNC_TRACE _fetch_all_subscriptions: START fetching bulk subscriptions from /api/subscriptions")
    cfg = ftth_iq_effective_options(opts)
    page_size = cfg["page_size"]
    subscriptions_map: dict[str, list[dict[str, Any]]] = {}
    page = 1
    max_pages = 100  # reasonable limit

    while page <= max_pages:
        try:
            payload = ftth_iq_subscription_list(access_token, page, opts)
        except Exception as e:
            logger.exception("FTTH subscriptions list failed page=%s: %s", page, e)
            break

        items = ftth_iq_extract_items(payload)
        if not items:
            break

        for item in items:
            if not isinstance(item, dict):
                continue
            customer = item.get("customer")
            if not isinstance(customer, dict):
                continue
            customer_id = customer.get("id")
            if not customer_id:
                continue
            cid_str = str(customer_id).strip()
            if cid_str not in subscriptions_map:
                subscriptions_map[cid_str] = []
            subscriptions_map[cid_str].append(item)

        if len(items) < page_size:
            break
        page += 1

    logger.info("FTTH fetched subscriptions for %s customers", len(subscriptions_map))
    return subscriptions_map


def run_ftth_unified_sync(
    access_token: str,
    opts: dict[str, Any],
    *,
    max_pages: int,
    debug_limit: int | None,
    on_page_complete: Callable[[list[dict[str, Any]]], None] | None = None,
) -> tuple[list[dict[str, Any]], bool]:
    """
    sync_mode (opts، افتراضي full):
      - list_only: صفوف قائمة + دفعة عناوين؛ build_unified_customer_from_list_row لكل عميل.
      - full: لكل عميل fetch_unified_customer_bundle (تفاصيل/اشتراك حسب opts).
    on_page_complete: يُستدعى بعد كل صفحة مع سجلات هذه الصفحة فقط.
    يُرجع (السجلات الموحّدة، rate_limited_stop).
    """
    sync_mode = _normalize_run_sync_mode(opts)
    logger.info(
        "FTTH SYNC MODE EFFECTIVE: %s | opts.sync_mode=%r (ignored for path) | ftth_sync_fast_mode=%r",
        sync_mode,
        opts.get("sync_mode"),
        opts.get("ftth_sync_fast_mode"),
    )
    logger.info(
        "FTTH run_ftth_unified_sync START: sync_mode=%s max_pages=%s debug_limit=%s",
        sync_mode,
        max_pages,
        debug_limit,
    )
    if sync_mode == "list_only":
        logger.info(
            "FTTH WHY LIST_ONLY: ftth_sync_fast_mode is enabled — list/summary + batch addresses only "
            "(no per-customer bundle)."
        )
        logger.info(
            "FTTH run_ftth_unified_sync: using LIST_ONLY path — list/summary rows + batch addresses; "
            "no fetch_unified_customer_bundle per customer."
        )
    else:
        logger.info(
            "FTTH run_ftth_unified_sync: using FULL path — fetch_unified_customer_bundle per customer "
            "(parallel when ftth_sync_concurrency > 1)."
        )

    rate_limited_stop = False
    out: list[dict[str, Any]] = []
    page = 1
    total_emitted = 0

    # Fetch all subscriptions upfront for bulk joining
    subscriptions_map = _fetch_all_subscriptions(access_token, opts)

    # paging_source=subscriptions: bypass the broken customer list endpoint
    # (/customers/summary returns totalCount=1,951,914 — the entire ISP database —
    # instead of the 127 current customers owned by this API user).
    # Build one synthetic page from the subscription customer IDs which are proven valid.
    _paging_src = str((opts or {}).get("ftth_sync_paging_source") or "").strip().lower()
    _injected_payload: dict[str, Any] | None = None
    if _paging_src == "subscriptions" and subscriptions_map:
        _sub_items = [{"id": cid} for cid in subscriptions_map.keys()]
        _injected_payload = {"totalCount": len(_sub_items), "items": _sub_items}
        max_pages = 1  # single synthetic page; no real pagination needed
        logger.info(
            "FTTH_SYNC_TRACE run_ftth_unified_sync: paging_source=subscriptions — "
            "injecting %s customer IDs from /api/subscriptions, bypassing /customers/summary",
            len(_sub_items),
        )

    while page <= max_pages:
        try:
            if _injected_payload is not None:
                payload = _injected_payload
                _injected_payload = None
            else:
                payload = ftth_iq_fetch_customer_page(access_token, page, opts)
        except Exception as e:
            logger.exception("FTTH customers list failed page=%s: %s", page, e)
            break

        logger.info("========== FTTH RAW CUSTOMERS ==========")
        logger.info(
            "FTTH CUSTOMERS PAGE=%s ITEMS_KEYS=%s",
            page,
            list(payload.keys()) if isinstance(payload, dict) else type(payload).__name__,
        )
        logger.info("========== END FTTH RAW CUSTOMERS (header) ==========")

        items = ftth_iq_extract_items(payload)
        if not items:
            logger.info(
                "FTTH_SYNC_TRACE run_ftth_unified_sync: page=%s empty items, stopping pagination",
                page,
            )
            break

        logger.info(
            "FTTH_SYNC_TRACE run_ftth_unified_sync: page=%s sync_mode=%s raw_items=%s",
            page,
            sync_mode,
            len(items),
        )

        page_records: list[dict[str, Any]] = []
        prepared: list[tuple[dict[str, Any], str]] = []
        for list_row in items:
            if not isinstance(list_row, dict):
                continue
            cid = None
            sb = list_row.get("self")
            if isinstance(sb, dict) and sb.get("id") is not None:
                cid = str(sb.get("id")).strip()
            if not cid:
                cid = str(list_row.get("id") or "").strip()
            if not cid:
                continue
            prepared.append((list_row, cid))

        addr_map: dict[str, dict[str, Any]] = {}
        try:
            seen_ids: set[str] = set()
            addr_batch_ids: list[str] = []
            for list_row, cid in prepared:
                if not isinstance(list_row, dict):
                    continue
                aid = ftth_iq_list_item_account_id(list_row) or cid
                for x in (cid, aid):
                    xs = str(x).strip() if x is not None else ""
                    if xs and xs not in seen_ids:
                        seen_ids.add(xs)
                        addr_batch_ids.append(xs)
            if addr_batch_ids:
                lr0, cid0 = prepared[0]
                a0 = ftth_iq_list_item_account_id(lr0) if isinstance(lr0, dict) else None
                logger.info(
                    "FTTH ADDRESS IDENTIFIER SOURCE: row0 customer_id=%s account_or_self_id=%s "
                    "batch_unique_ids_count=%s",
                    cid0,
                    a0,
                    len(addr_batch_ids),
                )
                addr_map = ftth_iq_fetch_addresses_map(access_token, addr_batch_ids, opts)
            else:
                addr_map = {}
        except Exception:
            logger.exception("FTTH batch addresses prefetch failed (non-fatal); falling back per customer")

        for list_row, cid in prepared:
            if isinstance(list_row, dict):
                aid = ftth_iq_list_item_account_id(list_row) or cid
                list_row["_ftth_addr_batch_item"] = addr_map.get(cid) or addr_map.get(aid)

        batch_hits = sum(
            1 for lr, _c in prepared if isinstance(lr, dict) and lr.get("_ftth_addr_batch_item")
        )
        logger.info(
            "FTTH run_ftth_unified_sync page=%s sync_mode=%s prepared_rows=%s batch_addr_hits=%s",
            page,
            sync_mode,
            len(prepared),
            batch_hits,
        )

        dbg_page = bool(opts.get("ftth_sync_debug_payloads", True))
        if dbg_page and prepared:
            lr0, cid0 = prepared[0]
            _ftth_debug_json("RAW_LIST_ROW_PAGE_FIRST", cid0, lr0, max_len=8000)

        if sync_mode == "full":
            conc = max(1, min(12, int(opts.get("ftth_sync_concurrency") or 3)))
            use_parallel = debug_limit is None and conc > 1 and len(prepared) > 1

            def _emit_unified_full(unified: dict[str, Any], *, abort_session: bool) -> bool:
                nonlocal total_emitted
                if abort_session:
                    logger.warning(
                        "FTTH_SYNC_TRACE run_ftth_unified_sync FULL: abort_session=True mid-page "
                        "(out_so_far=%s page_records_pending=%s)",
                        len(out),
                        len(page_records),
                    )
                    return True
                out.append(unified)
                page_records.append(unified)
                total_emitted += 1
                return False

            if use_parallel:
                rate_lock = threading.Lock()
                rate_holder = [rate_limited_stop]

                def _worker(pair: tuple[dict[str, Any], str]) -> tuple[dict[str, Any], bool, bool]:
                    list_row, cid = pair
                    with rate_lock:
                        rls = rate_holder[0]
                    bundle = fetch_unified_customer_bundle(
                        access_token,
                        cid,
                        list_row,
                        opts,
                        rate_limited_stop_in=rls,
                        verbose_logs=False,
                        subscriptions_map=subscriptions_map,
                    )
                    _a, _b, unified, rstop, abort = bundle
                    with rate_lock:
                        if rstop:
                            rate_holder[0] = True
                    return unified, rstop, abort

                for i in range(0, len(prepared), conc):
                    batch = prepared[i : i + conc]
                    with ThreadPoolExecutor(max_workers=len(batch)) as ex:
                        batch_results = list(ex.map(_worker, batch))
                    rate_limited_stop = rate_holder[0]
                    for unified, _rstop, abort_session in batch_results:
                        if _emit_unified_full(unified, abort_session=abort_session):
                            return out, True
            else:
                for list_row, cid in prepared:
                    if (
                        debug_limit is not None
                        and debug_limit > 0
                        and total_emitted >= debug_limit
                    ):
                        if on_page_complete and page_records:
                            logger.info(
                                "FTTH_SYNC_TRACE run_ftth_unified_sync FULL: debug_limit early exit (pre-row) "
                                "on_page_complete records=%s",
                                len(page_records),
                            )
                            on_page_complete(page_records)
                        return out, rate_limited_stop

                    _dr, _sr, unified, rate_limited_stop, abort_session = (
                        fetch_unified_customer_bundle(
                            access_token,
                            cid,
                            list_row,
                            opts,
                            rate_limited_stop_in=rate_limited_stop,
                            verbose_logs=True,
                            subscriptions_map=subscriptions_map,
                        )
                    )
                    if _emit_unified_full(unified, abort_session=abort_session):
                        return out, True

                    if (
                        debug_limit is not None
                        and debug_limit > 0
                        and total_emitted >= debug_limit
                    ):
                        if on_page_complete and page_records:
                            logger.info(
                                "FTTH_SYNC_TRACE run_ftth_unified_sync FULL: debug_limit reached "
                                "on_page_complete records=%s",
                                len(page_records),
                            )
                            on_page_complete(page_records)
                        return out, rate_limited_stop
        else:

            def _emit_unified_lo(unified: dict[str, Any]) -> None:
                nonlocal total_emitted
                out.append(unified)
                page_records.append(unified)
                total_emitted += 1

            for list_row, cid in prepared:
                if (
                    debug_limit is not None
                    and debug_limit > 0
                    and total_emitted >= debug_limit
                ):
                    if on_page_complete and page_records:
                        logger.info(
                            "FTTH_SYNC_TRACE run_ftth_unified_sync LIST_ONLY: debug_limit early exit (pre-row) "
                            "on_page_complete records=%s",
                            len(page_records),
                        )
                        on_page_complete(page_records)
                    return out, rate_limited_stop

                unified = build_unified_customer_from_list_row(list_row, cid, opts)
                _emit_unified_lo(unified)

                if (
                    debug_limit is not None
                    and debug_limit > 0
                    and total_emitted >= debug_limit
                ):
                    if on_page_complete and page_records:
                        logger.info(
                            "FTTH_SYNC_TRACE run_ftth_unified_sync LIST_ONLY: debug_limit reached "
                            "on_page_complete records=%s",
                            len(page_records),
                        )
                        on_page_complete(page_records)
                    return out, rate_limited_stop

        if on_page_complete and page_records:
            logger.info(
                "FTTH_SYNC_TRACE run_ftth_unified_sync: invoking on_page_complete page=%s sync_mode=%s records=%s",
                page,
                sync_mode,
                len(page_records),
            )
            on_page_complete(page_records)

        if len(items) < int(ftth_iq_effective_options(opts)["page_size"]):
            break
        page += 1

    return out, rate_limited_stop


def sync_single_ftth_subscriber(
    access_token: str,
    external_id: str,
    opts: dict[str, Any],
) -> dict[str, Any]:
    """
    مزامنة مشترك واحد من FTTH بالمعرّف الخارجي.
    يجلب تفاصيل + اشتراك لهذا العميل فقط ويُرجع السجل الموحّد بصيغة norm.
    لا يكتب في DB — المستدعي (router) هو من يُطبّق upsert ويُلتزم.
    يرفع RuntimeError عند انتهاء الجلسة أو فشل البناء.
    """
    cid = str(external_id).strip()
    if not cid:
        raise ValueError("external_id فارغ أو غير صالح")

    logger.info("FTTH SINGLE SYNC START cid=%s", cid)

    # نمرر list_row بسيطاً يحتوي على id فقط — fetch_unified_customer_bundle يجلب الباقي
    list_row: dict[str, Any] = {"id": cid}
    _, _, unified, _, session_expired = fetch_unified_customer_bundle(
        access_token,
        cid,
        list_row,
        opts,
        rate_limited_stop_in=False,
        verbose_logs=True,
    )
    if session_expired:
        raise RuntimeError("انتهت صلاحية جلسة FTTH — يرجى إعادة تسجيل الدخول من إعدادات البوابة")

    norm = unified_record_to_ftth_norm(unified)
    if norm is None:
        raise RuntimeError(
            f"فشل بناء السجل الموحّد للعميل {cid} — تحقق من صحة المعرّف الخارجي في بوابة FTTH"
        )

    logger.info("FTTH SINGLE SYNC OK cid=%s status=%s", cid, norm.get("status"))
    return norm
