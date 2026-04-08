"""
تفريغ جدول دليل هواتف الإنترنت (internet_phones).
يُستدعى من setup_new_machine.bat على جهاز جديد.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine


def main() -> int:
    if not settings.DATABASE_URL.startswith("postgresql"):
        print("  [خطأ] PostgreSQL فقط.")
        return 1
    try:
        with engine.connect() as conn:
            conn.execute(text('TRUNCATE TABLE internet_phones RESTART IDENTITY CASCADE'))
            conn.commit()
        print("  OK تم تفريغ دليل الهاتف (internet_phones).")
        return 0
    except Exception as e:
        print(f"  WARN تعذر تفريغ دليل الهاتف: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
