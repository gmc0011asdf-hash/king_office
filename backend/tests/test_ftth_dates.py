"""اختبارات منطق التواريخ ومدة الالتزام لمسار FTTH."""
from datetime import date, timedelta

from app.integrations.ftth.ftth_dates import (
    DEFAULT_FTTH_COMMITMENT_DAYS,
    compute_remaining_days,
    effective_commitment_days,
    extract_commitment_days_label,
    parse_commitment_text_to_days,
    resolve_ftth_dates,
)


def test_resolve_expiration_and_30_day_month_example():
    # انتهاء 12/04/2026، شهر = 30 يوم → اشتراك 13/03/2026
    exp = date(2026, 4, 12)
    sub, end = resolve_ftth_dates(exp, 30, None)
    assert end == exp
    assert sub == date(2026, 3, 13)


def test_default_commitment_when_missing():
    exp = date(2026, 4, 12)
    sub, end = resolve_ftth_dates(exp, None, None)
    assert end == exp
    assert sub == exp - timedelta(days=DEFAULT_FTTH_COMMITMENT_DAYS)


def test_subscription_plus_commitment_when_no_expiration():
    s = date(2026, 3, 13)
    sub, end = resolve_ftth_dates(None, 30, s)
    assert sub == s
    assert end == date(2026, 4, 12)


def test_effective_commitment_days():
    assert effective_commitment_days(None) == 30
    assert effective_commitment_days(90) == 90


def test_remaining_days_signed():
    t = date(2026, 1, 1)
    assert compute_remaining_days(date(2026, 1, 5), today=t) == 4
    assert compute_remaining_days(date(2025, 12, 31), today=t) == -1


def test_parse_arabic_months():
    assert parse_commitment_text_to_days("شهر واحد") == 30
    assert parse_commitment_text_to_days("شهرين") == 60
    assert parse_commitment_text_to_days("3 أشهر") == 90


def test_extract_commitment_from_dict():
    d, lab = extract_commitment_days_label({"commitmentDays": 60, "planName": "عرض"})
    assert d == 60
    d2, _ = extract_commitment_days_label({"durationMonths": 3})
    assert d2 == 90


