"""
تطبيع أرقام الهاتف العراقية للجوال: 11 رقمًا بالضبط، يبدأ بـ 077 أو 078.
- إن بدأ الرقم بـ 77 أو 78 بدون الصفر الأول يُضاف 0 تلقائيًا.
- يدعم أرقامًا تبدأ بـ 964 (مثال بعد إزالة +).
"""
from __future__ import annotations

import re
from typing import Optional

# 077 أو 078 ثم 8 أرقام = 11 خانة
_IRAQ_MOBILE_RE = re.compile(r"^07[78]\d{8}$")


def digits_only(raw: Optional[str]) -> str:
    return re.sub(r"\D", "", str(raw or ""))


def normalize_iraq_mobile(raw: Optional[str], *, required: bool = False) -> Optional[str]:
    """
    يعيد الرقم المطبّع أو None إذا كان فارغًا وغير مطلوب.
    يرفع ValueError برسالة عربية عند عدم الصلاحية أو عند الفراغ مع required=True.
    إن وُجد نص لكن بلا أرقام يُرفض (حتى مع optional).
    """
    s_in = str(raw or "").strip()
    d = digits_only(s_in)
    if not d:
        if required:
            raise ValueError("رقم الهاتف مطلوب")
        if s_in:
            raise ValueError("رقم الهاتف غير صالح")
        return None

    if d.startswith("964"):
        d = d[3:]

    # إزالة أصفار زائدة في البداية ثم إعادة الصفر الواحد للصيغة المحلية
    d = d.lstrip("0")
    if len(d) == 10 and d.startswith(("77", "78")):
        d = "0" + d

    if not _IRAQ_MOBILE_RE.match(d):
        raise ValueError(
            "رقم الهاتف يجب أن يكون 11 رقمًا بالضبط ويبدأ بـ 077 أو 078 (مثال: 07701234567)"
        )
    return d


def normalize_iraq_mobile_loose(raw: Optional[str]) -> Optional[str]:
    """كـ normalize_iraq_mobile لكن لا يرفع خطأ: يعيد None إن تعذر التطبيع."""
    try:
        return normalize_iraq_mobile(raw, required=False)
    except ValueError:
        return None
