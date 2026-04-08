"""
تواريخ ومدة الالتزام لمسار FTTH — مصدر واحد للخادم (مزامنة، ترحيل، API).
قاعدة المدة: شهر = 30 يوماً تقويمياً، شهران = 60، 3 أشهر = 90، 6 = 180، سنة = 365.
عند غياب مدة الالتزام: 30 يوماً افتراضياً.
"""
from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Any

DEFAULT_FTTH_COMMITMENT_DAYS = 30

# مدد قياسية بالأيام (تقويمية) — لا تستخدم أشهراً تقويمية متغيرة الطول
COMMITMENT_MONTH_TO_DAYS: dict[int, int] = {
    1: 30,
    2: 60,
    3: 90,
    6: 180,
    12: 365,
}


def effective_commitment_days(commitment_days: int | None) -> int:
    if commitment_days is not None and int(commitment_days) > 0:
        return int(commitment_days)
    return DEFAULT_FTTH_COMMITMENT_DAYS


def resolve_ftth_dates(
    expiration_date: date | None,
    commitment_days: int | None,
    subscription_date: date | None,
) -> tuple[date | None, date | None]:
    """
    - إن وُجد expiration_date: اشتراك = انتهاء − N يوماً (N = commitment أو 30).
    - وإلا إن وُجد subscription_date فقط: انتهاء = اشتراك + N.
    """
    n = effective_commitment_days(commitment_days)
    if expiration_date is not None:
        sub = expiration_date - timedelta(days=n)
        return sub, expiration_date
    if subscription_date is not None:
        exp = subscription_date + timedelta(days=n)
        return subscription_date, exp
    return None, None


def compute_remaining_days(
    expiration_date: date | None,
    today: date | None = None,
) -> int | None:
    """متبقٍ من اليوم إلى تاريخ الانتهاء (سالب بعد الانتهاء، حسب الفرق التقويمي)."""
    if expiration_date is None:
        return None
    t = today if today is not None else date.today()
    return (expiration_date - t).days


def parse_commitment_text_to_days(label: str | None) -> int | None:
    """يستخرج عدد الأيام من نص عربي/إنجليزي (شهر، شهرين، سنة، …)."""
    if not label or not str(label).strip():
        return None
    s = str(label).strip().lower()
    s_ar = str(label).strip()

    # أرقام صريحة: "30 يوم" / "30 days"
    m_days = re.search(r"(\d+)\s*(?:يوم|days?|day)\b", s, re.I)
    if m_days:
        d = int(m_days.group(1))
        return d if d > 0 else None

    # أشهر رقمية: "3 months" / "3 أشهر"
    m_num_months = re.search(r"(\d+)\s*(?:months?|أشهر|شهراً|شهور)", s, re.I)
    if m_num_months:
        mo = int(m_num_months.group(1))
        if mo in COMMITMENT_MONTH_TO_DAYS:
            return COMMITMENT_MONTH_TO_DAYS[mo]
        if mo > 0:
            return mo * 30

    # كلمات شائعة
    if re.search(r"\b1\s*month\b|^1\s*mo\b", s, re.I) or "شهر واحد" in s_ar or s_ar in ("شهر", "1 شهر"):
        return 30
    if "شهرين" in s_ar or re.search(r"\b2\s*months?\b", s, re.I):
        return 60
    if "ثلاث" in s_ar or "3 أشهر" in s_ar or re.search(r"\b3\s*months?\b", s, re.I):
        return 90
    if "ستة" in s_ar or "6 أشهر" in s_ar or re.search(r"\b6\s*months?\b", s, re.I):
        return 180
    if "سنة" in s_ar or re.search(r"\b(?:12\s*months?|1\s*year)\b", s, re.I):
        return 365

    return None


def extract_commitment_days_label(sub: dict[str, Any] | None) -> tuple[int | None, str | None]:
    """
    يقرأ مدة الالتزام من كائن اشتراك FTTH (أيام أو أشهر أو نص).
    يُرجع (أيام، تسمية خام للعرض).
    """
    if not isinstance(sub, dict):
        return None, None

    label_parts: list[str] = []

    for k in (
        "commitmentDuration",
        "commitment_duration",
        "commitmentPeriod",
        "commitment_period",
        "durationDescription",
        "planDurationLabel",
        "packageDuration",
        "billingCycle",
        "billing_cycle",
        "tariffDuration",
    ):
        v = sub.get(k)
        if v is not None and str(v).strip():
            label_parts.append(str(v).strip())
            break

    for k in (
        "commitmentDays",
        "commitment_days",
        "durationDays",
        "duration_in_days",
        "planDurationDays",
        "commitmentDurationDays",
    ):
        v = sub.get(k)
        if v is None:
            continue
        try:
            d = int(float(str(v).strip().split()[0]))
            if d > 0:
                lab = label_parts[0] if label_parts else None
                return d, lab
        except (ValueError, TypeError):
            pass

    for k in (
        "durationMonths",
        "commitmentMonths",
        "months",
        "planDurationMonths",
        "subscriptionMonths",
    ):
        v = sub.get(k)
        if v is None:
            continue
        try:
            mo = int(float(str(v).strip().split()[0]))
            if mo in COMMITMENT_MONTH_TO_DAYS:
                lab = label_parts[0] if label_parts else f"{mo} month(s)"
                return COMMITMENT_MONTH_TO_DAYS[mo], lab
            if mo > 0:
                return mo * 30, label_parts[0] if label_parts else f"{mo} month(s)"
        except (ValueError, TypeError):
            pass

    # من اسم الباقة / الخطة
    for k in ("planName", "tariffName", "packageName", "serviceName", "productName", "offerName"):
        pv = sub.get(k)
        if isinstance(pv, dict):
            pv = pv.get("displayValue") or pv.get("name") or pv.get("label")
        if pv is not None and str(pv).strip():
            label_parts.append(str(pv).strip())
            parsed = parse_commitment_text_to_days(str(pv))
            if parsed:
                return parsed, str(pv).strip()[:200]

    combined = " | ".join(label_parts) if label_parts else None
    if combined:
        parsed = parse_commitment_text_to_days(combined)
        if parsed:
            return parsed, combined[:200]

    return None, (combined[:200] if combined else None)
