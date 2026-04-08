"""
إنشاء أو تحديث مستخدم إداري حسب البريد (UPSERT).
التشغيل من مجلد backend:
  python scripts/upsert_admin_user.py --email you@example.com --password 'your-secret'
أو عبر المتغيرات: ADMIN_UPSERT_EMAIL, ADMIN_UPSERT_PASSWORD
"""
from __future__ import annotations

import argparse
import os
import sys

import bcrypt
import psycopg2

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings


def main() -> None:
    parser = argparse.ArgumentParser(description="Upsert admin user (password bcrypt, requires_password_change=false).")
    parser.add_argument("--email", default=os.environ.get("ADMIN_UPSERT_EMAIL", "").strip() or None)
    parser.add_argument("--password", default=os.environ.get("ADMIN_UPSERT_PASSWORD", "").strip() or None)
    parser.add_argument("--name", default="المدير العام")
    parser.add_argument("--role", default="admin")
    args = parser.parse_args()

    if not args.email or not args.password:
        parser.error("أدخل --email و --password أو عيّن ADMIN_UPSERT_EMAIL و ADMIN_UPSERT_PASSWORD")

    db_url = (os.environ.get("DATABASE_URL") or "").strip() or settings.DATABASE_URL
    pwd_bytes = args.password.encode("utf-8")[:72]
    hashed = bcrypt.hashpw(pwd_bytes, bcrypt.gensalt()).decode("utf-8")

    conn = psycopg2.connect(db_url)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO users (name, email, role, password, status, created_at, requires_password_change)
            VALUES (%s, %s, %s, %s, %s, now(), false)
            ON CONFLICT (email) DO UPDATE SET
                password = EXCLUDED.password,
                requires_password_change = false,
                name = EXCLUDED.name,
                role = EXCLUDED.role,
                status = EXCLUDED.status
            """,
            (args.name, args.email, args.role, hashed, "active"),
        )
        conn.commit()
        cur.close()
    finally:
        conn.close()

    print(f"OK: User {args.email!r} upserted (requires_password_change=false).")


if __name__ == "__main__":
    main()
