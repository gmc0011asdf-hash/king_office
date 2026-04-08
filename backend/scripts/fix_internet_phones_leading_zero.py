"""
تصحيح أرقام دليل الهواتف فقط (internet_phones): إضافة 0 في البداية عند الحاجة (7712345678 → 07712345678).

تشغيل من مجلد backend مع تفعيل venv:
  python scripts/fix_internet_phones_leading_zero.py
"""
from __future__ import annotations

import os
import sys

_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

from app.core.database import SessionLocal  # noqa: E402
from app.modules.internet.phone_directory_fix import normalize_stored_internet_phones  # noqa: E402


def main() -> None:
    db = SessionLocal()
    try:
        result = normalize_stored_internet_phones(db)
        db.commit()
        print(result.get("message", ""))
        print(f"  updated={result.get('updated', 0)} skipped={result.get('skipped_count', 0)}")
        for line in (result.get("skipped") or [])[:30]:
            print(f"  - {line}")
        if (result.get("skipped_count") or 0) > 30:
            print(f"  ... و {result['skipped_count'] - 30} أخرى")
    except Exception as e:
        db.rollback()
        print(f"ERROR {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
