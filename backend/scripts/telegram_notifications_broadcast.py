#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
إشعارات تيليجرام للمشتركين المربوطين (telegram_chat_id في subscribers)

يغطي:
  1) اشتراك يقترب من الانتهاء (expiration_date)
  2) ديون الإنترنت (subscribers.debt)
  3) رسالة ترويجية تتضمن أرقاماً من دليل الهاتف (internet_phones)
  4) ديون قسم المكتب (office_customers.debt) عند تطابق الهاتف مع مشترك مربوط
  5) أقساط المكتب (office_sales أقساط) عند تطابق هاتف العميل مع مشترك مربوط

يعتمد على سير عمل مشابه لـ tel-telegram-link-complete.json: المستلمون من لديهم
telegram_chat_id محفوظ بعد الربط.

الاستخدام (من مجلد backend مع تفعيل venv):
  python scripts/telegram_notifications_broadcast.py --mode all
  python scripts/telegram_notifications_broadcast.py --mode expiry --dry-run

متغيرات البيئة (ملف .env بجانب backend أو تصدير يدوي):
  DATABASE_URL=postgresql://...
  TELEGRAM_BOT_TOKEN=123456:ABC...   (توكن بوت Telegram)

اختياري:
  EXPIRY_WARN_DAYS=7                 نطاق التنبيه قبل انتهاء الاشتراك
  TELEGRAM_SEND_DELAY_SEC=0.08     لتخفيف حدود معدل تيليجرام
  DRY_RUN=1                          نفس --dry-run
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from decimal import Decimal
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

# تحميل .env من مجلد backend
_BACKEND_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(_BACKEND_ROOT / ".env")


def _money(v: Any) -> str:
    if v is None:
        return "0"
    try:
        d = Decimal(str(v))
        return f"{d:,.0f}"
    except Exception:
        return str(v)


def send_telegram_message(token: str, chat_id: int, text_msg: str, dry_run: bool) -> bool:
    if dry_run:
        print(f"[DRY-RUN] chat_id={chat_id}\n{text_msg}\n---")
        return True
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    with httpx.Client(timeout=30.0) as client:
        r = client.post(
            url,
            json={
                "chat_id": chat_id,
                "text": text_msg,
                "disable_web_page_preview": True,
            },
        )
    if r.status_code != 200:
        print(f"[خطأ] chat_id={chat_id} HTTP {r.status_code} {r.text[:500]}", file=sys.stderr)
        return False
    data = r.json()
    if not data.get("ok"):
        print(f"[خطأ] chat_id={chat_id} {data}", file=sys.stderr)
        return False
    return True


def fetch_internet_phone_directory(engine: Engine, limit: int = 30) -> str:
    q = text(
        """
        SELECT COALESCE(NULLIF(TRIM(name), ''), '—') AS label, phone_number
        FROM internet_phones
        ORDER BY sequence NULLS LAST, id
        LIMIT :lim
        """
    )
    with engine.connect() as conn:
        rows = conn.execute(q, {"lim": limit}).mappings().all()
    if not rows:
        return "لا توجد أرقام في دليل الهاتف حالياً."
    lines = [f"• {r['label']}: {r['phone_number']}" for r in rows]
    return "\n".join(lines)


def run_expiry_warnings(engine: Engine, token: str, days: int, dry_run: bool, delay: float) -> int:
    q = text(
        """
        SELECT id, real_name, phone, user_code, expiration_date, telegram_chat_id
        FROM subscribers
        WHERE telegram_chat_id IS NOT NULL
          AND expiration_date IS NOT NULL
          AND expiration_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + CAST(:d AS INT) * INTERVAL '1 day')
        ORDER BY expiration_date
        """
    )
    sent = 0
    with engine.connect() as conn:
        rows = conn.execute(q, {"d": days}).mappings().all()
    for r in rows:
        cid = int(r["telegram_chat_id"])
        name = r["real_name"] or "مشتركنا الكريم"
        exp = r["expiration_date"]
        msg = (
            f"مرحباً {name}\n\n"
            f"تنبيه: اشتراكك يقترب من الانتهاء.\n"
            f"تاريخ الانتهاء: {exp}\n"
            f"الرجاء التجديد لتفادي انقطاع الخدمة.\n\n"
            f"رمز المستخدم: {r['user_code'] or '—'}"
        )
        if send_telegram_message(token, cid, msg, dry_run):
            sent += 1
        time.sleep(delay)
    return sent


def run_internet_debt(engine: Engine, token: str, dry_run: bool, delay: float) -> int:
    q = text(
        """
        SELECT id, real_name, phone, user_code, debt, telegram_chat_id
        FROM subscribers
        WHERE telegram_chat_id IS NOT NULL
          AND debt IS NOT NULL
          AND debt > 0
        ORDER BY debt DESC
        """
    )
    sent = 0
    with engine.connect() as conn:
        rows = conn.execute(q).mappings().all()
    for r in rows:
        cid = int(r["telegram_chat_id"])
        name = r["real_name"] or "مشتركنا الكريم"
        msg = (
            f"مرحباً {name}\n\n"
            f"تنبيه مالي: يوجد رصيد مستحق على اشتراك الإنترنت.\n"
            f"المبلغ المستحق: {_money(r['debt'])} د.ع\n\n"
            f"للاستفسار يرجى التواصل مع المكتب.\n"
            f"رمز المستخدم: {r['user_code'] or '—'}"
        )
        if send_telegram_message(token, cid, msg, dry_run):
            sent += 1
        time.sleep(delay)
    return sent


def run_promotional_with_directory(engine: Engine, token: str, dry_run: bool, delay: float) -> int:
    phones_block = fetch_internet_phone_directory(engine)
    msg = (
        "📢 عروض وخدمات — أرقام التواصل (دليل الهاتف):\n\n"
        f"{phones_block}\n\n"
        "نشكر ثقتكم بمكتب الملك."
    )
    q = text(
        """
        SELECT DISTINCT telegram_chat_id
        FROM subscribers
        WHERE telegram_chat_id IS NOT NULL
        """
    )
    sent = 0
    with engine.connect() as conn:
        rows = conn.execute(q).mappings().all()
    for r in rows:
        cid = int(r["telegram_chat_id"])
        if send_telegram_message(token, cid, msg, dry_run):
            sent += 1
        time.sleep(delay)
    return sent


def run_office_debt_matched(engine: Engine, token: str, dry_run: bool, delay: float) -> int:
    """ديون office_customers عند تطابق رقم الهاتف (أرقام فقط) مع مشترك مربوط."""
    q = text(
        """
        SELECT s.telegram_chat_id, oc.name AS customer_name, oc.debt, oc.phone AS oc_phone
        FROM office_customers oc
        INNER JOIN subscribers s ON s.telegram_chat_id IS NOT NULL
          AND regexp_replace(COALESCE(s.phone, ''), '[^0-9]', '', 'g') <> ''
          AND regexp_replace(COALESCE(s.phone, ''), '[^0-9]', '', 'g')
              = regexp_replace(COALESCE(oc.phone, ''), '[^0-9]', '', 'g')
        WHERE oc.debt IS NOT NULL AND oc.debt > 0
          AND oc.phone IS NOT NULL AND TRIM(oc.phone) <> ''
        """
    )
    sent = 0
    with engine.connect() as conn:
        rows = conn.execute(q).mappings().all()
    for r in rows:
        cid = int(r["telegram_chat_id"])
        name = r["customer_name"] or "عميلنا الكريم"
        msg = (
            f"مرحباً {name}\n\n"
            f"تنبيه (قسم المكتب): يوجد رصيد مستحق.\n"
            f"المبلغ: {_money(r['debt'])} د.ع\n\n"
            f"للتسديد أو الاستفسار يرجى زيارة المكتب.\n"
            f"هاتف السجل: {r['oc_phone'] or '—'}"
        )
        if send_telegram_message(token, cid, msg, dry_run):
            sent += 1
        time.sleep(delay)
    return sent


def run_office_installments_matched(engine: Engine, token: str, dry_run: bool, delay: float) -> int:
    """مبيعات بالأقساط: تذكير بالقسط الشهري عند تطابق هاتف العميل مع مشترك مربوط."""
    q = text(
        """
        SELECT DISTINCT ON (s.telegram_chat_id)
          s.telegram_chat_id,
          os.customer_name,
          os.customer_phone,
          os.monthly_installment,
          os.installments_months,
          os.total_with_commission,
          os.date AS sale_date
        FROM office_sales os
        INNER JOIN subscribers s ON s.telegram_chat_id IS NOT NULL
          AND os.customer_phone IS NOT NULL AND TRIM(os.customer_phone) <> ''
          AND regexp_replace(COALESCE(s.phone, ''), '[^0-9]', '', 'g') <> ''
          AND regexp_replace(COALESCE(s.phone, ''), '[^0-9]', '', 'g')
              = regexp_replace(COALESCE(os.customer_phone, ''), '[^0-9]', '', 'g')
        WHERE LOWER(TRIM(COALESCE(os.payment_method, ''))) IN ('installments', 'installment', 'أقساط', 'اقساط')
          AND os.monthly_installment IS NOT NULL
          AND os.monthly_installment > 0
          AND os.date >= (CURRENT_DATE - INTERVAL '365 days')
        ORDER BY s.telegram_chat_id, os.date DESC
        """
    )
    sent = 0
    with engine.connect() as conn:
        rows = conn.execute(q).mappings().all()
    for r in rows:
        cid = int(r["telegram_chat_id"])
        name = r["customer_name"] or "عميلنا الكريم"
        months = r["installments_months"] or "—"
        msg = (
            f"مرحباً {name}\n\n"
            f"تذكير (قسم المكتب — أقساط):\n"
            f"القسط الشهري: {_money(r['monthly_installment'])} د.ع\n"
            f"عدد الأشهر (حسب السجل): {months}\n"
            f"إجمالي مع العمولة (إن وُجد): {_money(r['total_with_commission'])}\n\n"
            f"تاريخ أقرب سجل شراء: {r['sale_date']}\n"
            f"للاستفسار يرجى التواصل مع المكتب."
        )
        if send_telegram_message(token, cid, msg, dry_run):
            sent += 1
        time.sleep(delay)
    return sent


def main() -> int:
    parser = argparse.ArgumentParser(description="إشعارات تيليجرام — king_office")
    parser.add_argument(
        "--mode",
        choices=("all", "expiry", "debt_internet", "promo", "office_debt", "office_installments"),
        default="all",
        help="نوع الإرسال",
    )
    parser.add_argument("--dry-run", action="store_true", help="طباعة الرسائل دون إرسال")
    args = parser.parse_args()

    dry_run = args.dry_run or os.environ.get("DRY_RUN", "").strip() in ("1", "true", "yes")
    db_url = os.environ.get("DATABASE_URL", "").strip()
    if not db_url.startswith("postgresql"):
        print("DATABASE_URL غير مضبوط أو ليس PostgreSQL.", file=sys.stderr)
        return 2

    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    if not token and not dry_run:
        print("TELEGRAM_BOT_TOKEN مطلوب للإرسال (أو استخدم --dry-run).", file=sys.stderr)
        return 2

    days = int(os.environ.get("EXPIRY_WARN_DAYS", "7").strip() or "7")
    delay = float(os.environ.get("TELEGRAM_SEND_DELAY_SEC", "0.08").strip() or "0.08")

    engine = create_engine(db_url)

    modes = (
        ["expiry", "debt_internet", "promo", "office_debt", "office_installments"]
        if args.mode == "all"
        else [args.mode]
    )

    total = 0
    for m in modes:
        print(f"=== mode={m} ===", flush=True)
        if m == "expiry":
            n = run_expiry_warnings(engine, token, days, dry_run, delay)
        elif m == "debt_internet":
            n = run_internet_debt(engine, token, dry_run, delay)
        elif m == "promo":
            n = run_promotional_with_directory(engine, token, dry_run, delay)
        elif m == "office_debt":
            n = run_office_debt_matched(engine, token, dry_run, delay)
        elif m == "office_installments":
            n = run_office_installments_matched(engine, token, dry_run, delay)
        else:
            n = 0
        print(f"أُرسل/عُرض: {n}", flush=True)
        total += n

    print(f"الإجمالي: {total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
