"""
تفريغ بيانات بوابة FTTH المؤقتة (إعدادات الدخول + سجلات المزامنة الخارجية).
يُستدعى من setup_new_machine.bat على جهاز جديد حتى لا تبقى بيانات تجريبية.
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
            for table in ("ftth_external_data", "ftth_portal_config"):
                try:
                    conn.execute(text(f'TRUNCATE TABLE "{table}" RESTART IDENTITY CASCADE'))
                    print(f"  OK تم تفريغ {table}.")
                except Exception as e:
                    print(f"  WARN تخطي {table}: {e}")
            conn.commit()
        return 0
    except Exception as e:
        print(f"  WARN تعذر تنظيف FTTH: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
