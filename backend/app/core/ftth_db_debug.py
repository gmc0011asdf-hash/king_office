"""تشخيص اتصال قاعدة البيانات وحفظ FTTH (مسار المزامنة)."""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session


def _mask_db_url(db_url: str) -> str:
    try:
        if "://" not in db_url:
            return db_url
        scheme, rest = db_url.split("://", 1)
        if "@" not in rest:
            return db_url
        creds, hostpart = rest.split("@", 1)
        if ":" in creds:
            user, _ = creds.split(":", 1)
            return f"{scheme}://{user}:*****@{hostpart}"
        return f"{scheme}://*****@{hostpart}"
    except Exception:
        return "***"


def debug_db_target(db_session: Session, database_url: str) -> None:
    row = db_session.execute(
        text("""
        SELECT current_database(), current_user, inet_server_addr(), inet_server_port()
    """)
    ).fetchone()

    print("========== FTTH DB TARGET CHECK ==========")
    print(
        {
            "database_url": _mask_db_url(database_url),
            "current_database": row[0],
            "current_user": row[1],
            "server_addr": str(row[2]),
            "server_port": row[3],
            "table": "public.ftth_external_data",
        }
    )
    print("========== END FTTH DB TARGET CHECK ==========")


def debug_db_row_count(db_session: Session) -> None:
    count = db_session.execute(text("SELECT COUNT(*) FROM public.ftth_external_data")).scalar()
    print(f"FTTH DB ROW COUNT AFTER SAVE: {count}")
