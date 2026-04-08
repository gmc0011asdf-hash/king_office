"""
تطبيع أرقام الهاتف المخزّنة في قاعدة البيانات إلى صيغة 077/078 (11 رقمًا).
تشغيل من مجلد backend مع تفعيل venv:
  python scripts/normalize_iraq_phones_in_db.py

السجلات التي لا يمكن تطبيعها تُطبع في الطرفية ولا تُغيّر.
تعارض المفتاح الفريد (internet_phones) يُبلّغ ويُتخطّى.
"""
from __future__ import annotations

import os
import sys

# noqa: E402 — مسار التطبيق قبل استيراد app
_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

from app.core.database import SessionLocal  # noqa: E402
from app.core.iraq_phone import normalize_iraq_mobile  # noqa: E402
from app.models import models  # noqa: E402
from app.modules.internet.phone_directory_fix import normalize_stored_internet_phones  # noqa: E402


def _try_norm(val: str | None) -> str | None:
    if not val or not str(val).strip():
        return None
    try:
        return normalize_iraq_mobile(str(val), required=True)
    except ValueError:
        return None


def main() -> None:
    db = SessionLocal()
    changed = 0
    skipped: list[str] = []
    try:
        for row in db.query(models.Subscriber).all():
            if not row.phone:
                continue
            newp = _try_norm(row.phone)
            if not newp:
                skipped.append(f"subscribers id={row.id} phone={row.phone!r}")
                continue
            if newp != row.phone:
                row.phone = newp
                changed += 1

        dir_fix = normalize_stored_internet_phones(db)
        changed += int(dir_fix.get("updated") or 0)
        for s in dir_fix.get("skipped") or []:
            skipped.append(f"internet_phones {s}")

        ss = db.query(models.SystemSettings).first()
        if ss and ss.office_phone:
            newp = _try_norm(ss.office_phone)
            if newp and newp != ss.office_phone:
                ss.office_phone = newp
                changed += 1
            elif not newp:
                skipped.append(f"system_settings.office_phone={ss.office_phone!r}")

        for row in db.query(models.OfficeCustomer).all():
            if not row.phone:
                continue
            newp = _try_norm(row.phone)
            if not newp:
                skipped.append(f"office_customers id={row.id} phone={row.phone!r}")
                continue
            if newp != row.phone:
                row.phone = newp
                changed += 1

        for row in db.query(models.OfficeSale).all():
            if not row.customer_phone:
                continue
            newp = _try_norm(row.customer_phone)
            if not newp:
                skipped.append(f"office_sales id={row.id} customer_phone={row.customer_phone!r}")
                continue
            if newp != row.customer_phone:
                row.customer_phone = newp
                changed += 1

        for row in db.query(models.OfficeInvoice).all():
            if not row.customer_phone:
                continue
            newp = _try_norm(row.customer_phone)
            if not newp:
                skipped.append(f"office_invoices id={row.id} customer_phone={row.customer_phone!r}")
                continue
            if newp != row.customer_phone:
                row.customer_phone = newp
                changed += 1

        for row in db.query(models.Supplier).all():
            if not row.phone:
                continue
            newp = _try_norm(row.phone)
            if not newp:
                skipped.append(f"suppliers id={row.id} phone={row.phone!r}")
                continue
            if newp != row.phone:
                row.phone = newp
                changed += 1

        db.commit()
        print(f"OK تم تحديث {changed} حقلًا.")
        if skipped:
            print(f"تخطي / تعذر تطبيع ({len(skipped)}):")
            for s in skipped[:50]:
                print(f"  - {s}")
            if len(skipped) > 50:
                print(f"  ... و {len(skipped) - 50} أخرى")
    except Exception as e:
        db.rollback()
        print(f"ERROR {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
