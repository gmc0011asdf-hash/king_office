"""
سكربت تنظيف قاعدة البيانات - نظام مكتب الملك
===============================================
يحذف جميع بيانات النظام ويبقيها جاهزة للاستخدام من جديد.
يحافظ على: جدول users فقط (معلومات تسجيل الدخول والمستخدمين).

يعمل مع: PostgreSQL فقط
الاستخدام:
  python scripts/clean_db.py [--yes]
  python scripts/clean_db.py [--yes] --full
    تنظيف كامل: نفس الجداول + حذف جميع المستخدمين (ثم شغّل bootstrap_db لإنشاء المدير من جديد).
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text
from app.core.config import settings
from app.core.database import engine

DELETE_ORDER = [
    "notifications",
    "activity_log",
    "subscriber_history",
    "internet_material_sales",
    "internet_phones",
    "ftth_external_data",
    "ftth_portal_config",
    "internet_fats",
    "subscribers",
    "internet_zones",
    "internet_materials",
    "subscription_categories",
    "wallet_transactions",
    "office_customer_history",
    "office_invoice_items",
    "office_installments",
    "office_payments",
    "office_sales",
    "office_invoices",
    "office_materials",
    "office_customers",
    "partner_transactions",
    "supplier_transactions",
    "partners",
    "suppliers",
    "card_wallet_transactions",
    "card_purchases",
    "card_sales",
    "expenses",
    "cashback_history",
    "sim_sales",
    "sim_inventory_transactions",
    "sim_numbers",
    "sim_packages",
]

DEFAULT_SYSTEM_SETTINGS = {
    "wallet_alert_threshold": 50000,
    "stock_alert_threshold": 5,
    "earthlink_threshold": 50000,
    "swig_threshold": 50000,
    "qi_threshold": 50000,
    "cards_threshold": 5,
    "materials_threshold": 5,
}


def _log(msg: str, level: str = "info") -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    prefix = {"info": "  ", "ok": "  ✓ ", "warn": "  ⚠ ", "err": "  ✗ "}.get(level, "  ")
    print(f"{ts} {prefix}{msg}")


def _get_existing_tables(conn) -> set[str]:
    result = conn.execute(
        text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
    )
    return {row[0] for row in result}


def clean_postgresql(conn) -> tuple[int, int]:
    existing = _get_existing_tables(conn)
    ok, fail = 0, 0
    for table in DELETE_ORDER:
        if table not in existing:
            _log(f"تخطي {table} (غير موجود)", "warn")
            continue
        try:
            conn.execute(text(f'TRUNCATE TABLE "{table}" CASCADE'))
            _log(f"{table}", "ok")
            ok += 1
        except Exception as e:
            _log(f"{table}: {e}", "err")
            fail += 1
    return ok, fail


def delete_all_users(conn) -> bool:
    existing = _get_existing_tables(conn)
    if "users" not in existing:
        _log("users غير موجود - تخطي", "warn")
        return True
    try:
        conn.execute(text('DELETE FROM "users"'))
        _log("users — تم حذف جميع المستخدمين", "ok")
        return True
    except Exception as e:
        _log(f"users: {e}", "err")
        return False


def reset_system_settings(conn) -> bool:
    existing = _get_existing_tables(conn)
    if "system_settings" not in existing:
        _log("system_settings غير موجود - تخطي", "warn")
        return True
    cols = ", ".join(DEFAULT_SYSTEM_SETTINGS.keys())
    vals = ", ".join(str(v) for v in DEFAULT_SYSTEM_SETTINGS.values())
    try:
        conn.execute(text("DELETE FROM system_settings"))
        conn.execute(text(f"INSERT INTO system_settings ({cols}) VALUES ({vals})"))
        _log("system_settings تم إعادة تعيينها", "ok")
        return True
    except Exception as e:
        _log(f"system_settings: {e}", "err")
        return False


def main() -> int:
    parser = argparse.ArgumentParser(
        description="King Office DB cleanup - PostgreSQL only (preserves users)"
    )
    parser.add_argument("-y", "--yes", action="store_true", help="Skip confirmation")
    parser.add_argument(
        "--full",
        action="store_true",
        help="حذف جميع المستخدمين أيضاً (تنظيف كامل — ثم bootstrap_db لإعادة مدير واحد)",
    )
    args = parser.parse_args()

    if not settings.DATABASE_URL.startswith("postgresql"):
        print("  [خطأ] النظام يدعم PostgreSQL فقط. تحقق من DATABASE_URL.")
        return 1

    print()
    print("=" * 60)
    print("  تنظيف قاعدة البيانات - نظام مكتب الملك")
    print("=" * 60)
    print("  قاعدة البيانات: PostgreSQL")
    print(f"  الجداول المراد تنظيفها: {len(DELETE_ORDER)}")
    if args.full:
        print("  الوضع: تنظيف كامل — سيتم حذف users أيضاً")
    else:
        print("  المحفوظ: users")
    print("=" * 60)
    print()

    if not args.yes:
        try:
            confirm = input("  هل أنت متأكد؟ اكتب yes للمتابعة: ").strip().lower()
            if confirm != "yes":
                print("  تم الإلغاء.")
                return 0
        except (EOFError, KeyboardInterrupt):
            print("\n  تم الإلغاء.")
            return 0

    print("  جاري التنظيف...")
    print()

    try:
        with engine.connect() as conn:
            ok, fail = clean_postgresql(conn)
            reset_system_settings(conn)
            if args.full:
                if not delete_all_users(conn):
                    fail += 1
            conn.commit()

        print()
        print("-" * 60)
        print(f"  تم بنجاح: {ok} جدول")
        if fail:
            print(f"  فشل: {fail} جدول")
        print("-" * 60)
        print()
        print("  ✓ اكتمل التنظيف. النظام جاهز للاستخدام من جديد.")
        if args.full:
            print("  → شغّل: python scripts/bootstrap_db.py (و ADMIN_INITIAL_PASSWORD في .env) لإنشاء المدير.")
        print()
        return 0 if fail == 0 else 1

    except Exception as e:
        _log(f"خطأ عام: {e}", "err")
        print()
        return 1


if __name__ == "__main__":
    sys.exit(main())
