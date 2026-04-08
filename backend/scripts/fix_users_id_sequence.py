"""
مزامنة تسلسل المفتاح الأساسي لجدول users مع أقصى id (إصلاح خطأ duplicate key / unique violation).

يحدث أحياناً بعد استيراد يدوي أو استرجاع نسخة احتياطية عندما يبقى users_id_seq خلف MAX(id).

تشغيل من مجلد backend (مع venv و DATABASE_URL):
  python scripts/fix_users_id_sequence.py

SQL المكافئ:
  SELECT setval(
    pg_get_serial_sequence('users', 'id'),
    COALESCE((SELECT MAX(id) FROM users), 1),
    (SELECT MAX(id) FROM users) IS NOT NULL
  );
"""
from __future__ import annotations

import os
import sys

_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

from sqlalchemy import text  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402


def sync_users_id_sequence(db) -> tuple[int, int | None]:
    max_id = db.execute(text("SELECT COALESCE(MAX(id), 0) FROM users")).scalar()
    new_val = db.execute(
        text(
            "SELECT setval("
            "pg_get_serial_sequence('users', 'id'), "
            "COALESCE((SELECT MAX(id) FROM users), 1), "
            "(SELECT MAX(id) FROM users) IS NOT NULL)"
        )
    ).scalar()
    return int(max_id), int(new_val) if new_val is not None else None


def main() -> None:
    db = SessionLocal()
    try:
        max_id, setval_result = sync_users_id_sequence(db)
        db.commit()
        print(f"OK max(id)={max_id}  setval(users_id_seq)={setval_result}")
        print("  next INSERT will receive id = max(id)+1 when the table has rows.")
    except Exception as e:
        db.rollback()
        print(f"ERROR {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
