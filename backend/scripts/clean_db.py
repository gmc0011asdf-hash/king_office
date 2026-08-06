"""Reset King Office local SQLite data."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings


def main() -> int:
    parser = argparse.ArgumentParser(description="Reset the local King Office SQLite database")
    parser.add_argument("-y", "--yes", action="store_true", help="Skip confirmation")
    args = parser.parse_args()

    db_path = settings.resolved_database_path()
    print(f"قاعدة البيانات المحلية: {db_path}")
    print("سيتم حذف جميع البيانات والمستخدمين وإنشاء نظام جديد عند التشغيل التالي.")

    if not args.yes:
        try:
            confirm = input("اكتب yes للمتابعة: ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            return 0
        if confirm != "yes":
            print("تم الإلغاء.")
            return 0

    removed = False
    for path in (db_path, Path(f"{db_path}-wal"), Path(f"{db_path}-shm")):
        if path.exists():
            path.unlink()
            removed = True

    credentials = settings.resolved_log_dir() / "FIRST_LOGIN_ADMIN_PASSWORD.txt"
    credentials.unlink(missing_ok=True)

    print("تم حذف القاعدة المحلية." if removed else "لا توجد قاعدة سابقة؛ النظام جاهز كبداية جديدة.")
    print("شغّل النظام، وسيتم إنشاء قاعدة فارغة وحساب مدير جديد تلقائياً.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
