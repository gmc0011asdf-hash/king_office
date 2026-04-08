"""تطبيع أرقام جدول internet_phones المخزّنة (إضافة 0 عند 77/78 بدون صفر، إلخ)."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.iraq_phone import normalize_iraq_mobile
from app.models import models


def normalize_stored_internet_phones(db: Session) -> dict:
    """
    يحدّث كل الصفوف حيث يمكن تطبيع الرقم (مثلاً 7712345678 → 07712345678).
    لا يستدعي commit — على المستدعي تنفيذ db.commit().
    """
    updated = 0
    skipped: list[str] = []

    for row in db.query(models.InternetPhone).order_by(models.InternetPhone.id).all():
        old = row.phone_number or ""
        try:
            newp = normalize_iraq_mobile(str(old), required=True)
        except ValueError:
            skipped.append(f"id={row.id} phone_number={old!r}")
            continue

        if newp == old:
            continue

        clash = (
            db.query(models.InternetPhone)
            .filter(
                models.InternetPhone.phone_number == newp,
                models.InternetPhone.id != row.id,
            )
            .first()
        )
        if clash:
            skipped.append(
                f"id={row.id} تعارض: {old!r} → {newp!r} (موجود لسجل آخر)"
            )
            continue

        row.phone_number = newp
        updated += 1

    return {
        "updated": updated,
        "skipped_count": len(skipped),
        "skipped": skipped[:50],
        "message": f"تم تحديث {updated} سجلًا في دليل الهواتف"
        + (f"، تخطي {len(skipped)}" if skipped else ""),
    }
