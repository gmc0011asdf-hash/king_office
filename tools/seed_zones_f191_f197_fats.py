#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
سكربت لمرة واحدة: إضافة مناطق F191–F197 و FAT (T-1 … T-n) لكل منطقة.
غير مرتبط بتشغيل FastAPI — يمكن حذف هذا الملف بعد التنفيذ.

التشغيل (من مجلد backend مع تفعيل venv):
    python ..\\tools\\seed_zones_f191_f197_fats.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# مسار backend لاستيراد app وقراءة backend/.env عبر الإعدادات
BACKEND_ROOT = Path(__file__).resolve().parent.parent / "backend"
if not BACKEND_ROOT.is_dir():
    print("خطأ: لم يُعثر على مجلد backend بجانب tools/")
    sys.exit(1)

sys.path.insert(0, str(BACKEND_ROOT))
os.chdir(BACKEND_ROOT)

from sqlalchemy.orm import Session  # noqa: E402

from app.core import database  # noqa: E402
from app.models import models  # noqa: E402

# (اسم المنطقة, عدد الـ FAT)
ZONE_SPECS: list[tuple[str, int]] = [
    ("F191", 29),
    ("F192", 38),
    ("F193", 39),
    ("F194", 48),
    ("F195", 22),
    ("F196", 48),
    ("F197", 36),
]


def run(db: Session) -> None:
    for zone_name, count in ZONE_SPECS:
        zone = db.query(models.InternetZone).filter(models.InternetZone.name == zone_name).first()
        if not zone:
            zone = models.InternetZone(name=zone_name)
            db.add(zone)
            db.flush()
            print(f"[+] منطقة جديدة: {zone_name}")
        else:
            print(f"[=] منطقة موجودة: {zone_name}")

        existing_names = {
            f.name
            for f in db.query(models.InternetFat)
            .filter(models.InternetFat.zone_id == zone.id)
            .all()
        }
        added = 0
        for i in range(1, count + 1):
            fname = f"T-{i}"
            if fname in existing_names:
                continue
            db.add(models.InternetFat(zone_id=zone.id, name=fname, coordinates=None))
            existing_names.add(fname)
            added += 1
        if added:
            print(f"    أُضيف {added} FAT (T-1 … T-{count})")
        else:
            print(f"    لا جديد (كل FAT موجودة)")


def main() -> None:
    db = database.SessionLocal()
    try:
        run(db)
        db.commit()
        print("\nتم بنجاح.")
    except Exception as e:
        db.rollback()
        print(f"\nفشل: {e}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
