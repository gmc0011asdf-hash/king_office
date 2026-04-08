"""تحققات إدخال مشتركة (أرقام عراقية، إلخ)."""
import re

# 11 رقماً تبدأ بـ 077 أو 078 (بعد التطبيع)
IQ_MOBILE_PATTERN = re.compile(r"^0(?:77|78)\d{9}$")


def is_valid_iq_mobile(s: str | None) -> bool:
    if not s or not isinstance(s, str):
        return False
    digits = re.sub(r"\D", "", s.strip())
    if len(digits) == 10 and digits.startswith(("77", "78")):
        digits = "0" + digits
    return bool(IQ_MOBILE_PATTERN.match(digits))


def normalize_iq_mobile_digits(s: str) -> str:
    """إرجاع الصيغة 077xxxxxxxx أو رفع ValueError."""
    raw = re.sub(r"\D", "", (s or "").strip())
    if len(raw) == 10 and raw.startswith(("77", "78")):
        raw = "0" + raw
    if not IQ_MOBILE_PATTERN.match(raw):
        raise ValueError("رقم الهاتف يجب أن يكون 11 رقماً ويبدأ بـ 077 أو 078")
    return raw
