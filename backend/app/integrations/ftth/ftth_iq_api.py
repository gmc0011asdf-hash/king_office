"""
تكامل رسمي مع بوابة admin.ftth.iq عبر API (كما في تطبيق الويب Angular).

- تسجيل الدخول: POST .../auth/Contractor/token
- قائمة العملاء: GET .../customers?...
- العناوين والمنطقة/FAT: GET .../addresses?accountIds=...
- تفاصيل المشترك (كصفحة customer-details/.../details/view): يُجرَّب GET .../customers/{id}
  ومسارات بديلة؛ الرؤوس تستخدم Referer لصفحة التفاصيل.
- الاشتراكات (المصدر الأساسي): GET .../customers/{id}/subscriptions — startedAt، expires، status، zone، deviceDetails، …
- اكتشاف تفاصيل/عنوان: يُجرَّب عدة مسارات مع تسجيل كل محاولة؛ لا يُعتمد على GET .../contacts (404).

يمكن تجاوز العنوان إلى https://api.ftth.iq/api/ عبر parse_options إن لزم.

ملاحظة: WAF قد يعيد 418؛ نُسخّن admin.ftth.iq ثم curl_cffi عند الحاجة.
"""
from __future__ import annotations

import json
import logging
import re
import threading
from dataclasses import dataclass
from datetime import date
from typing import Any
from urllib.parse import urlencode

import httpx

from app.integrations.ftth.ftth_dates import extract_commitment_days_label

logger = logging.getLogger(__name__)

_ftth_raw_dbg_lock = threading.Lock()
_ftth_raw_dbg = {"detail": 0, "sub": 0, "addr": 0}

_ftth_warmup_done = threading.Event()


def reset_ftth_warmup_flag() -> None:
    """يُستدعى في بداية كل مزامنة لإعادة تشغيل warmup مرة واحدة لكل جلسة مزامنة."""
    _ftth_warmup_done.clear()


def disable_ftth_warmup() -> None:
    """Pre-sets warmup flag so httpx browser warm-up page visits are skipped entirely.
    Use when warmup page visits contaminate the portal session scope and cause the
    stale 600-customer browser-session dataset to be returned instead of the current
    127-customer API dataset.
    """
    _ftth_warmup_done.set()


def reset_ftth_raw_debug_counters() -> None:
    """يُستدعى في بداية مزامنة ftth_iq_admin لتسجيل أول 3 عيّنات لكل نوع."""
    with _ftth_raw_dbg_lock:
        _ftth_raw_dbg["detail"] = 0
        _ftth_raw_dbg["sub"] = 0
        _ftth_raw_dbg["addr"] = 0


def _log_ftth_raw_detail_sample(payload: Any) -> None:
    with _ftth_raw_dbg_lock:
        if _ftth_raw_dbg["detail"] >= 3:
            return
        _ftth_raw_dbg["detail"] += 1
        n = _ftth_raw_dbg["detail"]
    logger.info(
        "========== FTTH RAW DETAIL ROW #%s ==========\n%s",
        n,
        json.dumps(payload, ensure_ascii=False, indent=2, default=str),
    )
    logger.info("========== END FTTH RAW DETAIL ROW #%s ==========", n)


def _log_ftth_raw_subscription_sample(payload: Any) -> None:
    with _ftth_raw_dbg_lock:
        if _ftth_raw_dbg["sub"] >= 3:
            return
        _ftth_raw_dbg["sub"] += 1
    logger.info(
        "========== FTTH RAW SUBSCRIPTION ==========\n%s\n========== END FTTH RAW SUBSCRIPTION ==========",
        json.dumps(payload, ensure_ascii=False, indent=2, default=str),
    )


def _log_ftth_raw_address_sample(item: dict[str, Any]) -> None:
    with _ftth_raw_dbg_lock:
        if _ftth_raw_dbg["addr"] >= 3:
            return
        _ftth_raw_dbg["addr"] += 1
        n = _ftth_raw_dbg["addr"]
    logger.info(
        "========== FTTH RAW ADDRESS ROW #%s ==========\n%s",
        n,
        json.dumps(item, ensure_ascii=False, indent=2, default=str),
    )
    logger.info("========== END FTTH RAW ADDRESS ROW #%s ==========", n)


def _ftth_trunc_response_body(text: str | None, max_len: int = 600) -> str:
    t = (text or "").replace("\r", " ").replace("\n", " ")
    if len(t) > max_len:
        return t[:max_len] + "..."
    return t


def _ftth_log_endpoint_attempt(url: str, status: int, text: str) -> None:
    """تسجيل موحّد لكل محاولة HTTP (اكتشاف التفاصيل/العنوان/الاشتراك)."""
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


# المعرّف العام يُرسل كـ x-client-app؛ في جسم النموذج client_id يبقى فارغاً (كما في HAR admin.ftth.iq)
DEFAULT_FTTH_IQ_API_BASE = "https://admin.ftth.iq/api/"
DEFAULT_TOKEN_PATH = "auth/Contractor/token"
DEFAULT_CUSTOMERS_PATH = "customers"
DEFAULT_CUSTOMERS_SUMMARY_PATH = "customers/summary"
DEFAULT_ADDRESSES_PATH = "addresses"
DEFAULT_CLIENT_ID = "53d57a7f-3f89-4e9d-873b-3d071bc6dd9f"


def _is_admin_portal_api_base(api_base: str) -> bool:
    return "admin.ftth.iq" in (api_base or "")


def _base_browser_headers() -> dict[str, str]:
    """رؤوس قريبة من Chrome الحقيقي (HAR)."""
    return {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
    }


def _warmup_page_headers(referer: str | None) -> dict[str, str]:
    h = {
        **_base_browser_headers(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Dest": "document",
        "Upgrade-Insecure-Requests": "1",
    }
    if referer:
        h["Referer"] = referer
    return h


def _headers_for_token(cfg: dict[str, Any]) -> dict[str, str]:
    admin = _is_admin_portal_api_base(cfg["api_base"])
    h = {
        **_base_browser_headers(),
        "Origin": "https://admin.ftth.iq",
        "Referer": "https://admin.ftth.iq/auth/login",
        "Sec-Fetch-Site": "same-origin" if admin else "cross-site",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Dest": "empty",
    }
    if admin:
        h["x-client-app"] = cfg["client_id"]
        h["x-user-role"] = "0"
    return h


def _headers_for_customers(cfg: dict[str, Any], access_token: str) -> dict[str, str]:
    admin = _is_admin_portal_api_base(cfg["api_base"])
    h = {
        **_base_browser_headers(),
        "Origin": "https://admin.ftth.iq",
        "Referer": (
            "https://admin.ftth.iq/customers/list/all/view/all"
            if admin
            else "https://admin.ftth.iq/auth/login"
        ),
        "Sec-Fetch-Site": "same-origin" if admin else "cross-site",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Dest": "empty",
        "Authorization": f"Bearer {access_token}",
    }
    if admin:
        h["x-client-app"] = cfg["client_id"]
        h["x-user-role"] = "0"
    return h


def _headers_for_customer_detail_page(
    cfg: dict[str, Any], access_token: str, customer_id: str
) -> dict[str, str]:
    """رؤوس كما عند فتح صفحة customer-details/.../details/view في المتصفح."""
    h = _headers_for_customers(cfg, access_token)
    if _is_admin_portal_api_base(cfg["api_base"]):
        cid = str(customer_id).strip()
        h["Referer"] = f"https://admin.ftth.iq/customer-details/{cid}/details/view"
    return h


# للتوافق مع كود قديم يستورد BROWSER_HEADERS
BROWSER_HEADERS = {
    **_base_browser_headers(),
    "Origin": "https://admin.ftth.iq",
    "Referer": "https://admin.ftth.iq/auth/login",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty",
    "x-client-app": DEFAULT_CLIENT_ID,
    "x-user-role": "0",
}


def _username_variants(username: str) -> list[str]:
    """صيغ شائعة لاسم الدخول (رقم عراقي مع/بدون صفر)."""
    u = (username or "").strip()
    if not u:
        return []
    out: list[str] = []
    seen: set[str] = set()

    def add(x: str) -> None:
        if x and x not in seen:
            seen.add(x)
            out.append(x)

    add(u)
    try:
        from app.core.iraq_phone import normalize_iraq_mobile

        n = normalize_iraq_mobile(u, required=True)
        add(n)
    except ValueError:
        pass
    digits = "".join(c for c in u if c.isdigit())
    if len(digits) == 10 and digits.startswith("7"):
        add("0" + digits)
    if len(digits) == 11 and digits.startswith("0"):
        add(digits[1:])
    return out


def _parse_oauth_error_payload(text: str) -> str | None:
    try:
        j = json.loads(text)
    except json.JSONDecodeError:
        return None
    if not isinstance(j, dict):
        return None
    err = j.get("error") or j.get("Error")
    desc = j.get("error_description") or j.get("errorDescription") or j.get("message")
    if err or desc:
        parts = [str(x) for x in (err, desc) if x]
        return " — ".join(parts)
    return None


def _raise_token_failure(status_code: int, text: str) -> None:
    hint = _parse_oauth_error_payload(text) or (text[:600] if text else "")
    extra = ""
    if status_code == 418:
        extra = (
            " — إن استمر 418 بعد تثبيت curl-cffi (pip install curl-cffi) أعد تشغيل الخادم؛ "
            "أو جرّب من شبكة/VPN أخرى إن كان المزوّد يحجب الطلبات الآلية."
        )
    raise RuntimeError(
        (f"فشل التوكن من بوابة FTTH (HTTP {status_code}). {hint}" + extra).strip()
    )


def ftth_iq_effective_options(opts: dict[str, Any] | None) -> dict[str, Any]:
    o = opts or {}
    base = str(o.get("ftth_iq_api_base") or DEFAULT_FTTH_IQ_API_BASE).rstrip("/") + "/"
    if "ftth_iq_scope" in o:
        scope: str | None = o.get("ftth_iq_scope")  # type: ignore[assignment]
        if scope is not None and not isinstance(scope, str):
            scope = str(scope)
    elif _is_admin_portal_api_base(base):
        scope = "openid profile"
    else:
        scope = None
    return {
        "api_base": base,
        "token_path": str(o.get("ftth_iq_token_path") or DEFAULT_TOKEN_PATH).lstrip("/"),
        "customers_path": str(o.get("ftth_iq_customers_path") or DEFAULT_CUSTOMERS_PATH).lstrip("/"),
        "customers_summary_path": str(
            o.get("ftth_iq_customers_summary_path") or DEFAULT_CUSTOMERS_SUMMARY_PATH
        ).lstrip("/"),
        "addresses_path": str(o.get("ftth_iq_addresses_path") or DEFAULT_ADDRESSES_PATH).lstrip("/"),
        "client_id": str(o.get("ftth_iq_client_id") or DEFAULT_CLIENT_ID),
        "client_secret": o.get("ftth_iq_client_secret"),  # اختياري
        "scope": scope,
        "page_size": int(o.get("ftth_iq_page_size") or 100),
    }


@dataclass(frozen=True)
class _HttpResult:
    status_code: int
    text: str


def _admin_warmup_targets() -> list[tuple[str, str | None]]:
    """(url, referer_for_request) — يحاكي زيارة المتصفح قبل استدعاء API."""
    return [
        ("https://admin.ftth.iq/", None),
        ("https://admin.ftth.iq/auth/login", "https://admin.ftth.iq/"),
    ]


def _warmup_admin_httpx(client: httpx.Client) -> None:
    if _ftth_warmup_done.is_set():
        return
    _ftth_warmup_done.set()
    for u, ref in _admin_warmup_targets():
        h = _warmup_page_headers(ref)
        try:
            client.get(u, headers=h, timeout=45.0)
        except Exception:
            continue


def _post_token_httpx(url: str, body: dict[str, str], headers: dict[str, str]) -> _HttpResult:
    data = urlencode(body)
    post_headers = {**headers, "Content-Type": "application/x-www-form-urlencoded"}
    with httpx.Client(follow_redirects=True, timeout=90.0) as client:
        _warmup_admin_httpx(client)
        r = client.post(url, content=data.encode("utf-8"), headers=post_headers)
    return _HttpResult(r.status_code, r.text or "")


def _post_token_curl_cffi(url: str, body: dict[str, str], headers: dict[str, str]) -> _HttpResult:
    try:
        from curl_cffi import requests as curl_requests
    except ImportError as e:
        raise RuntimeError(
            "الخادم يعيد 418 ويتطلب محاكاة متصفح (TLS). ثبّت: pip install curl-cffi ثم أعد تشغيل uvicorn."
        ) from e

    post_headers = {**headers, "Content-Type": "application/x-www-form-urlencoded"}
    # بصمات شائعة؛ نجرّب حتى يختفي 418
    impersonates = (
        "chrome131",
        "chrome124",
        "chrome120",
        "chrome110",
        "edge101",
        "safari17_0",
    )
    last = _HttpResult(0, "")
    for imp in impersonates:
        s = curl_requests.Session()
        try:
            for u, ref in _admin_warmup_targets():
                h = _warmup_page_headers(ref)
                s.get(u, headers=h, impersonate=imp, timeout=60)
            r = s.post(
                url,
                data=body,
                headers=post_headers,
                impersonate=imp,
                timeout=90,
            )
            last = _HttpResult(int(r.status_code), getattr(r, "text", "") or "")
            if last.status_code != 418:
                return last
        except Exception as ex:  # pragma: no cover - شبكة/إصدارات curl
            last = _HttpResult(0, str(ex))
            continue
    return last


def _post_token_once(url: str, body: dict[str, str], headers: dict[str, str]) -> _HttpResult:
    res = _post_token_httpx(url, body, headers)
    if res.status_code != 418:
        return res
    try:
        curl_res = _post_token_curl_cffi(url, body, headers)
    except RuntimeError:
        return res
    if curl_res.status_code and curl_res.status_code > 0:
        return curl_res
    return res


FtthIqGetParams = dict[str, str] | list[tuple[str, str]]


def _ftth_iq_get_curl_fallback(
    url: str,
    params: FtthIqGetParams,
    headers: dict[str, str],
) -> _HttpResult | None:
    try:
        from curl_cffi import requests as curl_requests
    except ImportError:
        return None

    impersonates = ("chrome131", "chrome124", "chrome120", "chrome110", "edge101")
    last = _HttpResult(0, "")
    for imp in impersonates:
        s = curl_requests.Session()
        try:
            for u, ref in _admin_warmup_targets():
                h = _warmup_page_headers(ref)
                s.get(u, headers=h, impersonate=imp, timeout=60)
            r = s.get(
                url,
                params=params,
                headers=headers,
                impersonate=imp,
                timeout=120,
            )
            last = _HttpResult(int(r.status_code), getattr(r, "text", "") or "")
            if last.status_code != 418:
                return last
        except Exception as ex:
            last = _HttpResult(0, str(ex))
            continue
    return last


def _is_invalid_grant(text: str, data: dict[str, Any] | None) -> bool:
    t = (text or "").lower()
    if "invalid_grant" in t:
        return True
    if not data:
        return False
    err = str(data.get("error") or data.get("Error") or "").lower()
    return err == "invalid_grant"


def ftth_iq_get_token(username: str, password: str, opts: dict[str, Any] | None = None) -> dict[str, Any]:
    cfg = ftth_iq_effective_options(opts)
    url = f"{cfg['api_base']}{cfg['token_path']}"
    try_variants = opts.get("ftth_iq_try_username_variants", True) if opts else True
    user_list = _username_variants(username) if try_variants else [(username or "").strip()]
    if not user_list:
        raise RuntimeError("اسم المستخدم فارغ")

    token_headers = _headers_for_token(cfg)
    admin_style = _is_admin_portal_api_base(cfg["api_base"])
    last_err: str | None = None
    for uname in user_list:
        if admin_style:
            body = {
                "grant_type": "password",
                "username": uname,
                "password": password,
                "client_id": "",
            }
            if cfg.get("scope"):
                body["scope"] = str(cfg["scope"])
        else:
            body = {
                "grant_type": "password",
                "username": uname,
                "password": password,
                "client_id": cfg["client_id"],
            }
            if cfg.get("client_secret"):
                body["client_secret"] = str(cfg["client_secret"])
            if cfg.get("scope"):
                body["scope"] = str(cfg["scope"])

        r = _post_token_once(url, body, token_headers)
        text = r.text or ""

        data: dict[str, Any] | None = None
        if text.strip().startswith("{"):
            try:
                parsed = json.loads(text)
                if isinstance(parsed, dict):
                    data = parsed
            except json.JSONDecodeError:
                pass

        if r.status_code >= 400:
            last_err = _parse_oauth_error_payload(text) or text[:500]
            if _is_invalid_grant(text, data):
                continue
            _raise_token_failure(r.status_code, text)

        if not isinstance(data, dict):
            last_err = text[:400] or "استجابة فارغة أو غير JSON"
            continue

        err_raw = data.get("error") or data.get("Error")
        if err_raw:
            desc = str(
                data.get("error_description")
                or data.get("errorDescription")
                or data.get("message")
                or err_raw
            )
            last_err = desc
            if str(err_raw).lower() == "invalid_grant" or _is_invalid_grant(json.dumps(data), data):
                continue
            raise RuntimeError(f"رفض خادم FTTH تسجيل الدخول: {desc}")

        access = data.get("access_token") or data.get("accessToken")
        if access:
            return data

        last_err = f"لا يوجد access_token في الاستجابة: {json.dumps(data, default=str)[:400]}"

    raise RuntimeError(
        "تعذّر تسجيل الدخول عبر API.ftth.iq. صيغ الرقم التي جُرّبت: "
        + "، ".join(user_list)
        + (f". آخر ملاحظة: {last_err}" if last_err else "")
        + " — تحقق من كلمة المرور. إن ظهر طلب scope في رسالة الخطأ أضف في parse_options مثلاً: "
        + '\"ftth_iq_scope\": \"openid profile offline_access\"'
        + " (أو القيمة التي يذكرها الخادم)."
    )


def ftth_iq_verify_session(access_token: str, opts: dict[str, Any] | None = None) -> dict[str, Any] | None:
    """
    GET /api/current-user (أو مسار مضبوط في parse_options) للتحقق من صلاحية التوكن.
    لا يُرفع استثناء — يُرجع None عند الفشل حتى لا توقف المزامنة بالكامل.
    """
    o = opts or {}
    cfg = ftth_iq_effective_options(opts)
    path = str(o.get("ftth_iq_current_user_path") or "current-user").strip().lstrip("/")
    url = f"{cfg['api_base']}{path}"
    headers = _headers_for_customers(cfg, access_token)
    try:
        status, text = _ftth_iq_http_get_json(url, headers, None, 60.0)
    except Exception:
        return None
    if status < 200 or status >= 400:
        return None
    if not text.strip():
        return None
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def ftth_iq_customer_list(access_token: str, page_number: int, opts: dict[str, Any] | None = None) -> dict[str, Any]:
    cfg = ftth_iq_effective_options(opts)
    url = f"{cfg['api_base']}{cfg['customers_path']}"
    if _is_admin_portal_api_base(cfg["api_base"]):
        params = {
            "pageNumber": str(page_number),
            "pageSize": str(cfg["page_size"]),
            "sortCriteria.property": "self.displayValue",
            "sortCriteria.direction": "asc",
            "myCustomers": "true",
        }
    else:
        params = {"pageNumber": str(page_number), "pageSize": str(cfg["page_size"])}
    headers = _headers_for_customers(cfg, access_token)
    with httpx.Client(follow_redirects=True, timeout=120.0) as client:
        _warmup_admin_httpx(client)
        r = client.get(url, params=params, headers=headers)
    status = r.status_code
    text = r.text or ""
    if status == 418:
        curl_res = _ftth_iq_get_curl_fallback(url, params, headers)
        if curl_res and curl_res.status_code > 0:
            status, text = curl_res.status_code, curl_res.text or ""
    if status >= 400:
        raise RuntimeError(
            f"فشل جلب المشتركين (HTTP {status}): {text[:400]}"
        )
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"استجابة المشتركين ليست JSON: {text[:300]}") from e

    # تشخيص مؤقت: أول 3 سجلات خام من أول صفحة فقط (GET .../customers)
    if page_number == 1:
        logger.info("========== FTTH RAW CUSTOMERS (GET /customers) ==========")
        if isinstance(data, dict):
            logger.info("FTTH RAW TOP-LEVEL KEYS: %s", list(data.keys()))
            possible_rows = (
                data.get("items")
                or data.get("data")
                or data.get("rows")
                or data.get("results")
                or data.get("customers")
                or []
            )
            if not isinstance(possible_rows, list):
                possible_rows = []
            for i, row in enumerate(possible_rows[:3], start=1):
                logger.info(
                    "FTTH RAW CUSTOMER ROW #%s\n%s",
                    i,
                    json.dumps(row, ensure_ascii=False, indent=2, default=str),
                )
        elif isinstance(data, list):
            for i, row in enumerate(data[:3], start=1):
                logger.info(
                    "FTTH RAW CUSTOMER ROW #%s\n%s",
                    i,
                    json.dumps(row, ensure_ascii=False, indent=2, default=str),
                )
        logger.info("========== END FTTH RAW CUSTOMERS ==========")

    return data


def ftth_iq_customer_summary(access_token: str, page_number: int, opts: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    GET /api/customers/summary — صفحة عملاء مُلخّصة (غالباً أغنى من /customers للواجهة الإدارية).
    يُستعمل مع partnersAndLOBAgnostic كما في HAR لـ admin.ftth.iq.
    """
    cfg = ftth_iq_effective_options(opts)
    path = cfg["customers_summary_path"]
    url = f"{cfg['api_base']}{path}"
    if _is_admin_portal_api_base(cfg["api_base"]):
        params = {
            "pageNumber": str(page_number),
            "pageSize": str(cfg["page_size"]),
            "sortCriteria.property": "self.displayValue",
            "sortCriteria.direction": "asc",
            "myCustomers": "true",
            "partnersAndLOBAgnostic": "true",
        }
    else:
        params = {
            "pageNumber": str(page_number),
            "pageSize": str(cfg["page_size"]),
            "partnersAndLOBAgnostic": "true",
        }
    headers = _headers_for_customers(cfg, access_token)
    with httpx.Client(follow_redirects=True, timeout=120.0) as client:
        _warmup_admin_httpx(client)
        r = client.get(url, params=params, headers=headers)
    status = r.status_code
    text = r.text or ""
    if status == 418:
        curl_res = _ftth_iq_get_curl_fallback(url, params, headers)
        if curl_res and curl_res.status_code > 0:
            status, text = curl_res.status_code, curl_res.text or ""
    if status >= 400:
        raise RuntimeError(
            f"فشل جلب ملخص المشتركين (HTTP {status}): {text[:400]}"
        )
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"استجابة ملخص المشتركين ليست JSON: {text[:300]}") from e

    if page_number == 1:
        logger.info("========== FTTH RAW CUSTOMERS SUMMARY (GET /customers/summary) ==========")
        if isinstance(data, dict):
            logger.info("FTTH SUMMARY TOP-LEVEL KEYS: %s", list(data.keys()))
            possible_rows = (
                data.get("items")
                or data.get("data")
                or data.get("rows")
                or data.get("results")
                or data.get("customers")
                or []
            )
            if not isinstance(possible_rows, list):
                possible_rows = []
            if possible_rows:
                sample = possible_rows[0]
                if isinstance(sample, dict):
                    logger.info(
                        "FTTH SUMMARY SAMPLE ROW KEYS (first item): %s",
                        list(sample.keys()),
                    )
        logger.info("========== END FTTH RAW CUSTOMERS SUMMARY ==========")

    return data


def ftth_iq_fetch_customer_page(
    access_token: str,
    page_number: int,
    opts: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    جلب صفحة واحدة من العملاء حسب ftth_sync_paging_source:
    - auto: يجرّب /customers/summary ثم يرجع إلى /customers إن فشل أو كانت النتيجة فارغة
    - summary: /customers/summary فقط
    - list: /customers فقط
    """
    o = opts or {}
    mode = str(o.get("ftth_sync_paging_source") or "list").strip().lower()
    if mode == "list":
        return ftth_iq_customer_list(access_token, page_number, opts)
    if mode == "summary":
        return ftth_iq_customer_summary(access_token, page_number, opts)
    try:
        summary_data = ftth_iq_customer_summary(access_token, page_number, opts)
        summary_items = ftth_iq_extract_items(summary_data)
        if summary_items:
            logger.info(
                "FTTH_SYNC_TRACE ftth_iq_fetch_customer_page: using /customers/summary page=%s rows=%s",
                page_number,
                len(summary_items),
            )
            return summary_data
        logger.warning(
            "FTTH_SYNC_TRACE ftth_iq_fetch_customer_page: summary empty for page=%s, falling back to /customers",
            page_number,
        )
    except Exception as e:
        logger.warning(
            "FTTH_SYNC_TRACE ftth_iq_fetch_customer_page: summary failed page=%s err=%s — falling back to /customers",
            page_number,
            e,
        )
    return ftth_iq_customer_list(access_token, page_number, opts)


def ftth_iq_list_item_account_id(obj: dict[str, Any]) -> str | None:
    """
    معرّف يُستخدم مع /addresses (accountIds أو customerIds حسب الخادم).
    يجرّب account.id / accountId ثم self.id ثم id في الجذر.
    """
    if not isinstance(obj, dict):
        return None
    self_block = obj.get("self") if isinstance(obj.get("self"), dict) else None
    acc_block = obj.get("account") if isinstance(obj.get("account"), dict) else None
    for block in (acc_block, obj, self_block):
        if not isinstance(block, dict):
            continue
        for k in ("accountId", "id", "customerId", "customer_id"):
            v = block.get(k)
            if v is not None and str(v).strip():
                return str(v).strip()
    return None


def ftth_iq_fetch_addresses_map(
    access_token: str,
    account_ids: list[str],
    opts: dict[str, Any] | None = None,
) -> dict[str, dict[str, Any]]:
    """
    جلب بيانات العنوان/المنطقة/FAT/اسم الخدمة كما في واجهة admin (GET .../addresses?accountIds=...).
    يُرجع قاموس: معرّف_العميل -> كائن العنوان.
    """
    o = opts or {}
    ids = [str(x).strip() for x in account_ids if x is not None and str(x).strip()]
    if not ids:
        return {}
    cfg = ftth_iq_effective_options(opts)
    url = f"{cfg['api_base']}{cfg['addresses_path']}"
    headers = _headers_for_customers(cfg, access_token)
    batch_size = max(1, min(50, int(o.get("ftth_iq_addresses_batch_size") or 40)))
    raw_param_list = o.get("ftth_iq_addresses_id_params")
    if isinstance(raw_param_list, list) and raw_param_list:
        param_names = [str(p).strip() for p in raw_param_list if str(p).strip()]
    else:
        param_names = ["accountIds", "customerIds"]
    out: dict[str, dict[str, Any]] = {}
    for i in range(0, len(ids), batch_size):
        chunk = ids[i : i + batch_size]
        for pname in param_names:
            params: list[tuple[str, str]] = [(pname, cid) for cid in chunk]
            try:
                query = urlencode(params, doseq=True)
                full_url = f"{url}?{query}" if query else url
                logger.info("FTTH ADDRESS FETCH URL: %s", full_url)
                logger.info(
                    "FTTH ADDRESS FETCH: param_name=%s chunk_sample=%s chunk_len=%s",
                    pname,
                    chunk[:5],
                    len(chunk),
                )
                with httpx.Client(follow_redirects=True, timeout=120.0) as client:
                    _warmup_admin_httpx(client)
                    r = client.get(url, params=params, headers=headers)
                status, text = r.status_code, r.text or ""
                if status == 418:
                    curl_res = _ftth_iq_get_curl_fallback(url, params, headers)
                    if curl_res and curl_res.status_code > 0:
                        status, text = curl_res.status_code, curl_res.text or ""
                logger.info("FTTH ADDRESS FETCH STATUS: %s", status)
                logger.info("FTTH ADDRESS RESPONSE TEXT: %s", _ftth_trunc_response_body(text))
                if status >= 400:
                    logger.warning(
                        "FTTH addresses batch failed: status=%s url=%s",
                        status,
                        full_url,
                    )
                    continue
                try:
                    data = json.loads(text)
                except json.JSONDecodeError:
                    continue
                items_list = list(ftth_iq_extract_items(data))
                tc = data.get("totalCount") if isinstance(data, dict) else None
                if not items_list and (tc == 0 or tc is None):
                    logger.warning(
                        "FTTH ADDRESS FETCH: empty items for param=%s (totalCount=%s) — trying next param if any",
                        pname,
                        tc,
                    )
                    continue
                for item in items_list:
                    cust = item.get("customer")
                    if not isinstance(cust, dict):
                        continue
                    cid = str(cust.get("id") or "").strip()
                    if cid:
                        out[cid] = item
                        _log_ftth_raw_address_sample(item)
                if items_list:
                    logger.info(
                        "FTTH ADDRESS FETCH: success with param=%s items=%s (map keys so far=%s)",
                        pname,
                        len(items_list),
                        len(out),
                    )
                    break
            except Exception:
                logger.exception("FTTH addresses batch exception param=%s", pname)
                continue
    return out


def ftth_iq_subscription_list(access_token: str, page_number: int, opts: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    GET /api/subscriptions — قائمة الاشتراكات مع customer.id للربط.
    """
    cfg = ftth_iq_effective_options(opts)
    url = f"{cfg['api_base']}subscriptions"
    if _is_admin_portal_api_base(cfg["api_base"]):
        params = {
            "pageNumber": str(page_number),
            "pageSize": str(cfg["page_size"]),
            "myCustomers": "true",
        }
    else:
        params = {"pageNumber": str(page_number), "pageSize": str(cfg["page_size"])}
    headers = _headers_for_customers(cfg, access_token)
    with httpx.Client(follow_redirects=True, timeout=120.0) as client:
        _warmup_admin_httpx(client)
        r = client.get(url, params=params, headers=headers)
    status = r.status_code
    text = r.text or ""
    if status == 418:
        curl_res = _ftth_iq_get_curl_fallback(url, params, headers)
        if curl_res and curl_res.status_code > 0:
            status, text = curl_res.status_code, curl_res.text or ""
    if status >= 400:
        raise RuntimeError(
            f"فشل جلب الاشتراكات (HTTP {status}): {text[:400]}"
        )
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"استجابة الاشتراكات ليست JSON: {text[:300]}") from e

    if page_number == 1:
        logger.info("========== FTTH RAW SUBSCRIPTIONS (GET /subscriptions) ==========")
        if isinstance(data, dict):
            logger.info("FTTH SUBSCRIPTIONS TOP-LEVEL KEYS: %s", list(data.keys()))
            possible_rows = (
                data.get("items")
                or data.get("data")
                or data.get("rows")
                or data.get("results")
                or data.get("subscriptions")
                or []
            )
            if not isinstance(possible_rows, list):
                possible_rows = []
            for i, row in enumerate(possible_rows[:3], start=1):
                logger.info(
                    "FTTH RAW SUBSCRIPTION ROW #%s\n%s",
                    i,
                    json.dumps(row, ensure_ascii=False, indent=2, default=str),
                )
        elif isinstance(data, list):
            for i, row in enumerate(data[:3], start=1):
                logger.info(
                    "FTTH RAW SUBSCRIPTION ROW #%s\n%s",
                    i,
                    json.dumps(row, ensure_ascii=False, indent=2, default=str),
                )
        logger.info("========== END FTTH RAW SUBSCRIPTIONS ==========")

    return data


def _ftth_iq_http_get_json(
    url: str,
    headers: dict[str, str],
    params: FtthIqGetParams | None = None,
    timeout: float = 120.0,
) -> tuple[int, str]:
    with httpx.Client(follow_redirects=True, timeout=timeout) as client:
        _warmup_admin_httpx(client)
        r = client.get(url, params=params if params is not None else {}, headers=headers)
    status = r.status_code
    text = r.text or ""
    if status == 418:
        curl_res = _ftth_iq_get_curl_fallback(
            url, params if params is not None else {}, headers
        )
        if curl_res and curl_res.status_code > 0:
            status, text = curl_res.status_code, curl_res.text or ""
    return status, text


DEFAULT_FTTH_IQ_DETAIL_PATH_TEMPLATES: list[str] = [
    "customers/{id}",
    "customers/{id}/address",
    "customers/{id}/addresses",
    "customers/{id}/details",
    "customers/{id}/contact",
    "customers/{id}/profile",
]


def ftth_iq_fetch_customer_detail(
    access_token: str,
    customer_id: str,
    opts: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """
    اكتشاف تفاصيل/عنوان العميل: يجرّب عدة مسارات ويسجّل كل محاولة.
    لا يُستخدم customers/.../contacts (غالباً 404) — يُجرّب contact (مفرد) ضمن القائمة فقط.
    القوالب: parse_options.ftth_iq_detail_path_templates
    """
    cfg = ftth_iq_effective_options(opts)
    o = opts or {}
    raw_tpl = o.get("ftth_iq_detail_path_templates")
    if isinstance(raw_tpl, list) and raw_tpl:
        templates = [str(p).strip() for p in raw_tpl if str(p).strip()]
    else:
        templates = list(DEFAULT_FTTH_IQ_DETAIL_PATH_TEMPLATES)
    cid = str(customer_id).strip()
    if not cid:
        return None
    for tpl in templates:
        path = tpl.replace("{id}", cid).strip().lstrip("/")
        url = f"{cfg['api_base']}{path}"
        headers = _headers_for_customer_detail_page(cfg, access_token, cid)
        try:
            status, text = _ftth_iq_http_get_json(url, headers, None)
            _ftth_log_endpoint_attempt(url, status, text)
            if status != 200 or not (text or "").strip():
                continue
            data = json.loads(text)
        except (json.JSONDecodeError, OSError, RuntimeError, TypeError) as e:
            logger.warning("FTTH detail parse error for %s: %s", url, e)
            continue
        row: dict[str, Any] | None = None
        if isinstance(data, dict):
            row = data
        elif isinstance(data, list) and data and isinstance(data[0], dict):
            row = data[0]
        if row is not None:
            tpl_l = tpl.lower()
            if "address" in tpl_l:
                logger.info(
                    "========== FTTH RAW ADDRESS ==========\n%s\n========== END FTTH RAW ADDRESS ==========",
                    json.dumps(row, ensure_ascii=False, indent=2, default=str),
                )
                _log_ftth_raw_address_sample(row)
            else:
                logger.info(
                    "========== FTTH RAW DETAIL ==========\n%s\n========== END FTTH RAW DETAIL ==========",
                    json.dumps(row, ensure_ascii=False, indent=2, default=str),
                )
                _log_ftth_raw_detail_sample(row)
            return row
    return None


def ftth_iq_fetch_customer_contacts(
    access_token: str,
    customer_id: str,
    opts: dict[str, Any] | None = None,
) -> dict[str, Any] | list[Any] | None:
    """
    [غير مستخدم افتراضياً] GET .../contacts غالباً يعيد 404 على admin.ftth.iq.
    استخدم التفاصيل أو الحقول داخل subscriptions للهاتف.
    القوالب: parse_options.ftth_iq_contacts_path_templates
    """
    cfg = ftth_iq_effective_options(opts)
    o = opts or {}
    raw_tpl = o.get("ftth_iq_contacts_path_templates")
    if isinstance(raw_tpl, list) and raw_tpl:
        templates = [str(p).strip() for p in raw_tpl if str(p).strip()]
    else:
        templates = [
            "customers/{id}/contact",
        ]
    cid = str(customer_id).strip()
    if not cid:
        return None
    for tpl in templates:
        path = tpl.replace("{id}", cid).strip().lstrip("/")
        url = f"{cfg['api_base']}{path}"
        headers = _headers_for_customer_detail_page(cfg, access_token, cid)
        try:
            status, text = _ftth_iq_http_get_json(url, headers, None)
            if status != 200 or not (text or "").strip():
                continue
            data = json.loads(text)
        except (json.JSONDecodeError, OSError, RuntimeError, TypeError):
            continue
        if isinstance(data, dict):
            return data
        if isinstance(data, list):
            return data
    return None


def _deep_find_scalar_by_key_hints(obj: Any, hints: frozenset[str], depth: int = 0) -> Any:
    """بحث أعمق عن أول قيمة نصية/رقمية تحت مفاتيح تشبه hints (مثل mobile، phone)."""
    if depth > 14 or obj is None:
        return None
    if isinstance(obj, dict):
        for k, v in obj.items():
            ks = str(k).lower()
            for h in hints:
                if h in ks or ks == h:
                    if v is not None and str(v).strip():
                        return v
        for v in obj.values():
            found = _deep_find_scalar_by_key_hints(v, hints, depth + 1)
            if found is not None and str(found).strip():
                return found
    elif isinstance(obj, list):
        for v in obj:
            found = _deep_find_scalar_by_key_hints(v, hints, depth + 1)
            if found is not None and str(found).strip():
                return found
    return None


def _pick_ci(d: dict[str, Any], *keys: str) -> Any:
    """يحاول المفاتيح كما هي ثم مطابقة غير حساسة لحالة الأحرف (JSON من .NET)."""
    lower_map = {str(k).lower(): k for k in d}
    for k in keys:
        if k in d and d[k] is not None and str(d[k]).strip() != "":
            return d[k]
        lk = k.lower()
        if lk in lower_map:
            kk = lower_map[lk]
            v = d.get(kk)
            if v is not None and str(v).strip() != "":
                return v
    return None


def _parse_dd_mm_yy_leading(s: str) -> date | None:
    s = (s or "").strip()
    m = re.match(r"^(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b", s)
    if not m:
        return None
    d_i, mo_i, y_i = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if y_i < 100:
        y_i += 2000
    try:
        return date(y_i, mo_i, d_i)
    except ValueError:
        return None


def _parse_remaining_days_arabic(s: str) -> int | None:
    return parse_remaining_days_text(s)


def parse_remaining_days_text(s: str | None) -> int | None:
    """
    تحويل نصوص القائمة/الواجهة إلى عدد أيام متبقية.
    أمثلة: «خلال 12 يوم»، «منتهي»، «(5 days)»، «12 يوماً».
    """
    if s is None:
        return None
    t = str(s).strip()
    if not t:
        return None
    tl = t.lower()
    if "غير منتهي" in t or "not expired" in tl:
        pass
    elif "منتهي" in t or re.search(r"منته(?!ة)", t):
        return 0
    elif "expired" in tl or "inactive" in tl:
        if "active" not in tl and "نشط" not in t:
            return 0
    m = re.search(r"خلال\s*(\d+)\s*يوم", t)
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            pass
    m1b = re.search(r"(\d+)\s*يوم", t)
    if m1b and ("يوم" in t or "day" in tl):
        try:
            return int(m1b.group(1))
        except ValueError:
            pass
    m2 = re.search(r"\((\d+)\s*days?\)", t, re.I)
    if m2:
        try:
            return int(m2.group(1))
        except ValueError:
            pass
    m3 = re.search(r"(\d+)\s*days?\s*left", tl)
    if m3:
        try:
            return int(m3.group(1))
        except ValueError:
            pass
    return None


def _unwrap_customer_row(obj: dict[str, Any]) -> dict[str, Any]:
    """
    بعض الاستجابات تلف السجل في { customer: { ... } } مع حقول ملخّصة في الخارج.
    """
    if not isinstance(obj, dict):
        return obj
    inner = obj.get("customer")
    if isinstance(inner, dict) and (
        inner.get("id") is not None
        or isinstance(inner.get("self"), dict)
        or inner.get("primaryContact") is not None
    ):
        merged: dict[str, Any] = dict(inner)
        for k, v in obj.items():
            if k == "customer":
                continue
            cur = merged.get(k)
            if cur is None or (isinstance(cur, str) and not str(cur).strip()):
                merged[k] = v
        return merged
    return obj


def _list_core_dict(obj: dict[str, Any]) -> dict[str, Any]:
    """حقول صفحة القائمة فقط (بدون ما يُدمَج لاحقاً من تفاصيل/اشتراكات/عنوان/اتصال)."""
    skip = frozenset({"ftthDetail", "ftthSubscriptions", "ftthAddress"})
    return {k: v for k, v in obj.items() if k not in skip}


def _dict_blocks_for_pick(d: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if isinstance(d.get("self"), dict):
        out.append(d["self"])
    out.append(d)
    if isinstance(d.get("primaryContact"), dict):
        out.append(d["primaryContact"])
    return out


def _extract_phone_from_sources(*sources: dict[str, Any] | None) -> Any:
    """ترتيب المصادر: list ثم details ثم contact (يُمرَّر بالترتيب)."""
    for d in sources:
        if not isinstance(d, dict):
            continue
        for block in _dict_blocks_for_pick(d):
            v = _pick_ci(
                block,
                "phone",
                "phoneNumber",
                "phone_number",
                "mobile",
                "msisdn",
                "contactPhone",
                "contactPhoneNumber",
                "primaryPhone",
                "telephone",
                "gsm",
                "mobileNumber",
                "msisdnNumber",
                "primaryContactNumber",
            )
            if v is not None and str(v).strip():
                return v
            if isinstance(block.get("primaryContact"), dict):
                pc = block["primaryContact"]
                v2 = _pick_ci(pc, "mobile", "phone", "phoneNumber", "secondaryPhone", "msisdn")
                if v2 is not None and str(v2).strip():
                    return v2
        ph = _deep_find_scalar_by_key_hints(
            d,
            frozenset(
                {
                    "mobile",
                    "phone",
                    "phonenumber",
                    "primaryphone",
                    "contactphone",
                    "msisdn",
                    "cell",
                    "tel",
                }
            ),
        )
        if ph is not None and str(ph).strip():
            return ph
    return None


def _extract_expiration_raw_from_sources(*sources: dict[str, Any] | None) -> Any:
    for d in sources:
        if not isinstance(d, dict):
            continue
        for block in _dict_blocks_for_pick(d):
            v = _pick_ci(
                block,
                "subscriptionEndDate",
                "subscription_end_date",
                "expirationDate",
                "expiration_date",
                "endDate",
                "validTo",
                "validUntil",
                "validToDate",
                "subscriptionExpiry",
                "subscriptionValidTo",
                "commitmentEndDate",
                "expiryDate",
                "expireAt",
                "subscriptionEnd",
            )
            if v is not None and str(v).strip():
                return v
        found = _deep_find_expiration_display_string(d)
        if found:
            return found
    return None


def _extract_status_raw_from_sources(*sources: dict[str, Any] | None) -> Any:
    for d in sources:
        if not isinstance(d, dict):
            continue
        for block in _dict_blocks_for_pick(d):
            v = _pick_ci(
                block,
                "status",
                "subscriptionStatus",
                "customerStatus",
                "state",
                "accountStatus",
                "lineStatus",
                "subscriptionState",
                "customerState",
            )
            if v is not None and str(v).strip():
                return v
            # لا نستخدم customerType.displayValue كحالة اشتراك (مثل Residential) — ليست حالة الخط/الاشتراك.
        st = _deep_find_scalar_by_key_hints(
            d,
            frozenset({"status", "state", "subscriptionstatus", "customerstatus"}),
        )
        if st is not None and str(st).strip():
            return st
    return None


def _extract_remaining_raw_from_sources(*sources: dict[str, Any] | None) -> Any:
    for d in sources:
        if not isinstance(d, dict):
            continue
        for block in _dict_blocks_for_pick(d):
            v = _pick_ci(
                block,
                "remainingDays",
                "remaining_days",
                "daysRemaining",
                "daysLeft",
                "remainingTime",
                "durationDaysRemaining",
            )
            if v is not None and str(v).strip():
                return v
    return None


def _unwrap_display_value(o: Any) -> Any:
    if isinstance(o, dict):
        v = _pick_ci(o, "displayValue", "display_value", "value", "raw", "name", "code")
        return v if v is not None else o
    return o


def ftth_iq_fetch_customer_subscriptions(
    access_token: str,
    customer_id: str,
    opts: dict[str, Any] | None = None,
) -> Any | None:
    """
    المصدر الأساسي لبيانات الاشتراك: GET .../customers/{id}/subscriptions
    القوالب: parse_options.ftth_iq_subscriptions_path_templates
    """
    cfg = ftth_iq_effective_options(opts)
    o = opts or {}
    raw_tpl = o.get("ftth_iq_subscriptions_path_templates")
    if isinstance(raw_tpl, list) and raw_tpl:
        templates = [str(p).strip() for p in raw_tpl if str(p).strip()]
    else:
        templates = [
            "customers/{id}/subscriptions",
            "customers/{id}/subscription",
        ]
    cid = str(customer_id).strip()
    if not cid:
        return None
    for tpl in templates:
        path = tpl.replace("{id}", cid).strip().lstrip("/")
        url = f"{cfg['api_base']}{path}"
        headers = _headers_for_customer_detail_page(cfg, access_token, cid)
        try:
            status, text = _ftth_iq_http_get_json(url, headers, None)
            _ftth_log_endpoint_attempt(url, status, text)
            if status != 200 or not (text or "").strip():
                continue
            data = json.loads(text)
            _log_ftth_raw_subscription_sample(data)
            return data
        except (json.JSONDecodeError, OSError, RuntimeError, TypeError) as e:
            logger.warning("FTTH subscriptions parse error for %s: %s", url, e)
            continue
    return None


def _ftth_subscription_candidates(obj: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    subs = obj.get("ftthSubscriptions")
    if isinstance(subs, list):
        out.extend(x for x in subs if isinstance(x, dict))
    elif isinstance(subs, dict):
        inner = ftth_iq_extract_items(subs)
        if inner:
            out.extend(inner)
        else:
            out.append(subs)
    for k in (
        "subscriptions",
        "activeSubscriptions",
        "customerSubscriptions",
        "subscriptionList",
    ):
        v = obj.get(k)
        if isinstance(v, list):
            out.extend(x for x in v if isinstance(x, dict))
    for single_k in ("activeSubscription", "currentSubscription", "subscription"):
        one = obj.get(single_k)
        if isinstance(one, dict):
            out.append(one)
    det = obj.get("ftthDetail")
    if isinstance(det, dict):
        for k in (
            "subscriptions",
            "activeSubscriptions",
            "customerSubscriptions",
            "ftthSubscriptions",
            "subscriptionList",
        ):
            v = det.get(k)
            if isinstance(v, list):
                out.extend(x for x in v if isinstance(x, dict))
        for single_k in ("activeSubscription", "currentSubscription", "subscription"):
            one = det.get(single_k)
            if isinstance(one, dict):
                out.append(one)
    return out


def _pick_preferred_subscription(cands: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not cands:
        return None
    for s in cands:
        if s.get("isActive") is True or s.get("active") is True:
            return s
        st = s.get("subscriptionStatus") or s.get("state") or s.get("status")
        st = _unwrap_display_value(st) if st is not None else None
        if isinstance(st, str) and ("نشط" in st or st.strip().lower() == "active"):
            return s
    return cands[0]


def _subscription_plan_status_line(sub: dict[str, Any]) -> str | None:
    parts: list[str] = []
    plan = _pick_ci(sub, "planName", "tariffName", "packageName", "serviceName", "productName", "offerName")
    if plan is None:
        po = sub.get("plan") or sub.get("tariff") or sub.get("package") or sub.get("product")
        plan = _unwrap_display_value(po)
    if plan is not None and str(plan).strip():
        parts.append(str(plan).strip())
    st = sub.get("subscriptionStatus") or sub.get("customerStatus") or sub.get("state")
    st = _unwrap_display_value(st)
    if st is not None and str(st).strip():
        parts.append(str(st).strip())
    raw_st = _pick_ci(sub, "status", "subscriptionState")
    if raw_st is not None and str(raw_st).strip():
        rs = str(raw_st).strip()
        if rs not in parts:
            parts.append(rs)
    return " — ".join(parts) if parts else None


def _subscription_end_remaining_raw(sub: dict[str, Any]) -> tuple[Any, Any]:
    end = _pick_ci(
        sub,
        "expires",
        "expireAt",
        "expirationDate",
        "expiration_date",
        "validTo",
        "validUntil",
        "validToDate",
        "subscriptionEndDate",
        "subscription_end_date",
        "endDate",
        "commitmentEndDate",
        "commitmentEnd",
        "expirationDisplay",
        "expiryDate",
    )
    end = _unwrap_display_value(end)
    rem = _pick_ci(sub, "remainingDays", "remaining_days", "daysRemaining", "daysLeft")
    if rem is None and end is not None:
        rem = _parse_remaining_days_arabic(str(end))
    return end, rem


def _deep_find_expiration_display_string(obj: Any, depth: int = 0) -> str | None:
    """بحث عن نص يشبه تاريخ انتهاء الاشتراك في واجهة FTTH (19.04.26 (...))."""
    if depth > 14 or obj is None:
        return None
    if isinstance(obj, str):
        s = obj.strip()
        if re.search(r"\d{1,2}\.\d{1,2}\.\d{2,4}", s) and (
            "يوم" in s or "day" in s.lower() or "valid" in s.lower() or "expir" in s.lower()
        ):
            return s
        if _parse_dd_mm_yy_leading(s) and len(s) <= 32:
            return s
    if isinstance(obj, dict):
        for k, v in obj.items():
            ks = str(k).lower()
            if any(
                h in ks
                for h in (
                    "expir",
                    "validto",
                    "validuntil",
                    "enddate",
                    "subscriptionend",
                    "commitment",
                    "remaining",
                )
            ):
                if isinstance(v, str) and re.search(r"\d{1,2}\.\d{1,2}\.\d{2,4}", v):
                    return v.strip()
            found = _deep_find_expiration_display_string(v, depth + 1)
            if found:
                return found
    elif isinstance(obj, list):
        for v in obj:
            found = _deep_find_expiration_display_string(v, depth + 1)
            if found:
                return found
    return None


def _extract_ftth_fat_label(fat_o: Any) -> str | None:
    """يقرأ تسمية FAT من dict أو نص (بعض استجابات admin.ftth.iq ترجع نصاً أو حقول بديلة)."""
    if fat_o is None:
        return None
    if isinstance(fat_o, dict):
        fv = _pick_ci(fat_o, "displayValue", "name", "label", "id", "code", "title", "value")
        if fv is not None and str(fv).strip():
            return str(fv).strip()[:200]
        return None
    s = str(fat_o).strip()
    return s[:200] if s else None


def ftth_iq_row_to_external(obj: dict[str, Any]) -> dict[str, Any] | None:
    """
    يحوّل كائن عميل من API إلى حقول ftth_external_data.

    مصدر GET /customers فقط: external_id، الاسم (full_name)، createdAt.
    لا يُستخدم customerType كحالة اشتراك ولا كهاتف.

    - الهاتف: تفاصيل العميل ثم حقول subscriptions (لا قائمة، لا /contacts).
    - الحالة وتاريخ الانتهاء والالتزام: اشتراكات ثم تفاصيل فقط.
    - المنطقة/FAT/الموقع: أولاً من subscriptions ثم تكميل من batch addresses.
    - المتبقي: يُحسب في المحرك من expiration_date بعد التحليل.
    """
    obj = _unwrap_customer_row(obj)
    self_block = obj.get("self") if isinstance(obj.get("self"), dict) else None
    list_core = _list_core_dict(obj)

    ext = _pick_ci(obj, "id", "customerId", "customer_id")
    if ext is None and self_block is not None:
        ext = _pick_ci(self_block, "id", "customerId", "customer_id")
    if ext is None:
        return None
    external_id = str(ext).strip()
    if not external_id:
        return None

    national = _pick_ci(
        list_core,
        "nationalName",
        "national_name",
        "arabicName",
        "arabic_name",
        "fullName",
        "full_name",
        "customerName",
        "customer_name",
        "name",
    )
    if national is None and self_block is not None:
        national = _pick_ci(self_block, "displayValue", "display_value", "name")

    list_created = _pick_ci(
        list_core,
        "createdAt",
        "created_at",
        "registrationDate",
    )

    # لا نأخذ من القائمة: phone / status / expiration / remaining / customerType
    phone = None
    end = None
    status_val = None
    start = None

    zone_txt: str | None = None
    fat_txt: str | None = None
    loc_txt: str | None = None
    svc_user: str | None = None

    commit_days: int | None = None
    commit_label: str | None = None
    sub_pick = _pick_preferred_subscription(_ftth_subscription_candidates(obj))
    if sub_pick is not None:
        commit_days, commit_label = extract_commitment_days_label(sub_pick)
        s_end, _ = _subscription_end_remaining_raw(sub_pick)
        if s_end is not None and str(s_end).strip():
            end = s_end
        line = _subscription_plan_status_line(sub_pick)
        st_sub = _extract_status_raw_from_sources(sub_pick)
        if line:
            status_val = line
        elif st_sub is not None and str(st_sub).strip():
            status_val = str(st_sub).strip()
        sp_start = _pick_ci(
            sub_pick,
            "startedAt",
            "subscriptionStartDate",
            "subscription_start_date",
            "startDate",
            "activationDate",
            "createdAt",
        )
        if sp_start is not None and str(sp_start).strip():
            start = sp_start
        z_sub = sub_pick.get("zone")
        if isinstance(z_sub, dict):
            zv = _pick_ci(z_sub, "displayValue", "id", "name")
            if zv and not zone_txt:
                zone_txt = str(zv).strip()[:200]
        elif z_sub is not None and str(z_sub).strip() and not zone_txt:
            zone_txt = str(z_sub).strip()[:200]
        dd_sub = sub_pick.get("deviceDetails")
        if isinstance(dd_sub, dict):
            fat_o = dd_sub.get("fat")
            fl = _extract_ftth_fat_label(fat_o)
            if fl and not fat_txt:
                fat_txt = fl
            if not fat_txt:
                for alt_key in ("fatName", "fat_name", "fatLabel", "oltName", "olt", "fdp", "fdt"):
                    fl2 = _extract_ftth_fat_label(dd_sub.get(alt_key))
                    if fl2:
                        fat_txt = fl2
                        break
            uv = _pick_ci(dd_sub, "username", "userName", "pppoeUsername")
            if uv and not svc_user:
                svc_user = str(uv).strip()[:200]

    detail = obj.get("ftthDetail")
    if isinstance(detail, dict):
        dn = _pick_ci(
            detail,
            "nationalName",
            "national_name",
            "arabicName",
            "fullName",
            "customerName",
            "displayName",
            "name",
        )
        if dn is not None and str(dn).strip():
            if national is None or not str(national).strip():
                national = dn
            elif len(str(dn).strip()) > len(str(national).strip()):
                national = dn
        if not phone:
            phone = _extract_phone_from_sources(detail)
        if not status_val or str(status_val).strip() == "":
            st_d = _extract_status_raw_from_sources(detail)
            if st_d is not None and str(st_d).strip():
                status_val = str(st_d).strip()
        if end is None or str(end).strip() == "":
            end = _extract_expiration_raw_from_sources(detail)
        if start is None or str(start).strip() == "":
            start = _pick_ci(
                detail,
                "subscriptionStartDate",
                "subscription_start_date",
                "activationDate",
                "startDate",
                "createdAt",
            )

    if not phone and sub_pick is not None:
        phone = _extract_phone_from_sources(sub_pick)

    addr = obj.get("ftthAddress")
    if isinstance(addr, dict):
        z = addr.get("zone")
        if not zone_txt and isinstance(z, dict):
            zv = _pick_ci(z, "displayValue", "id")
            if zv:
                zone_txt = str(zv).strip()[:200]
        dd = addr.get("deviceDetails")
        if isinstance(dd, dict):
            fat_o = dd.get("fat")
            if not fat_txt:
                fl = _extract_ftth_fat_label(fat_o)
                if fl:
                    fat_txt = fl
            if not fat_txt:
                for alt_key in ("fatName", "fat_name", "fatLabel", "oltName", "olt", "splitter", "fdp", "fdt"):
                    fl2 = _extract_ftth_fat_label(dd.get(alt_key))
                    if fl2:
                        fat_txt = fl2
                        break
            uv = _pick_ci(dd, "username", "userName", "pppoeUsername")
            if uv and not svc_user:
                svc_user = str(uv).strip()[:200]
        lv = _pick_ci(addr, "displayValue", "display_value")
        if lv and not loc_txt:
            loc_txt = str(lv).strip()[:2000]
        elif addr.get("nearestPoint") and not loc_txt:
            loc_txt = str(addr.get("nearestPoint")).strip()[:2000]

    if start is None or str(start).strip() == "":
        start = list_created

    tags = list_core.get("tags")
    if isinstance(tags, list) and tags:
        parts: list[str] = []
        for t in tags:
            if isinstance(t, dict):
                p = _pick_ci(t, "displayValue", "name", "label")
                if p:
                    parts.append(str(p))
            elif t is not None and str(t).strip():
                parts.append(str(t).strip())
        if parts:
            tag_s = ", ".join(parts)
            if national:
                national = f"{national} | {tag_s}"
            else:
                national = tag_s

    if end is None or str(end).strip() == "":
        scan_roots: list[Any] = []
        if isinstance(detail, dict):
            scan_roots.append(detail)
        if sub_pick is not None:
            scan_roots.append(sub_pick)
        for root in scan_roots:
            exp_s = _deep_find_expiration_display_string(root)
            if exp_s:
                pd = _parse_dd_mm_yy_leading(exp_s)
                end = pd.isoformat() if pd else exp_s.split("(", 1)[0].strip()
                break

    def _clip(s: str | None, n: int) -> str | None:
        if s is None:
            return None
        t = str(s).strip()
        return t[:n] if t else None

    if not fat_txt:
        for root_key in ("fat", "fatName", "fat_name", "fdp", "oltName"):
            flr = _extract_ftth_fat_label(obj.get(root_key))
            if flr:
                fat_txt = flr
                break

    return {
        "external_id": external_id[:255],
        "national_name": _clip(str(national).strip() if national is not None else None, 500),
        "phone": _clip(str(phone).strip() if phone is not None else None, 100),
        "zone": zone_txt,
        "fat": fat_txt,
        "location": loc_txt,
        "service_username": svc_user,
        "start_date": start,
        "end_date": end,
        "commitment_days": commit_days,
        "commitment_label": _clip(commit_label, 255),
        "remaining_days": None,
        "status": _clip(str(status_val).strip() if status_val else None, 255),
        "calculated_subscription_date": None,
        "raw_payload": dict(obj),
    }


def ftth_iq_extract_items(payload: dict[str, Any]) -> list[dict[str, Any]]:
    for key in ("items", "data", "results", "customers", "rows", "records"):
        v = payload.get(key)
        if isinstance(v, list):
            return [x for x in v if isinstance(x, dict)]
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    return []
