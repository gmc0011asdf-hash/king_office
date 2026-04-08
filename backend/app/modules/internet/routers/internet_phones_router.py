"""
Internet Phone Directory - CRUD, Excel Import/Export, Statistics.
Endpoints require admin أو صلاحية «دليل الهواتف» في الإنترنت.

ترتيب المسارات: يجب تسجيل المسارات الحرفية (stats, normalize-stored, import, export)
قبل /{phone_id} وإلا يُفسَّر الاسم كمعرّف (مثل normalize-stored) ويُعاد 405 لطلبات POST.
"""
import io
import re
from typing import List

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core import database
from app.core.dependencies import require_phone_directory_access
from app.core.iraq_phone import normalize_iraq_mobile
from app.models import models
from app.modules.internet.phone_directory_fix import normalize_stored_internet_phones
from app.schemas import schemas

router = APIRouter(tags=["Internet Phones"])


def _to_dict(phone: models.InternetPhone) -> dict:
    return {
        "id": phone.id,
        "sequence": phone.sequence,
        "name": phone.name or "",
        "phone_number": phone.phone_number,
        "last_promo_msg_date": phone.last_promo_msg_date.isoformat() if phone.last_promo_msg_date else None,
    }


@router.get("/api/internet/phones", response_model=List[dict])
def read_phones(
    skip: int = 0,
    limit: int = 500,
    search: str | None = None,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_phone_directory_access),
):
    q = db.query(models.InternetPhone).order_by(models.InternetPhone.sequence, models.InternetPhone.id)
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(
            (models.InternetPhone.name.ilike(term)) | (models.InternetPhone.phone_number.ilike(term))
        )
    return [_to_dict(p) for p in q.offset(skip).limit(limit).all()]


@router.get("/api/internet/phones/stats")
def get_phone_stats(
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_phone_directory_access),
):
    total = db.query(func.count(models.InternetPhone.id)).scalar() or 0
    phones = db.query(models.InternetPhone.phone_number).all()
    unique_prefixes = len(set((p[0] or "")[:4] for p in phones if p[0]))
    return {"total": total, "unique_prefixes": unique_prefixes}


# ——— مسارات ثابتة تحت /phones/ قبل {phone_id} (مهم جداً لتفادي 405) ———


def _normalize_stored_phone_directory_impl(db: Session) -> dict:
    """منطق تصحيح الأرقام (يُستدعى من أكثر من مسار URL)."""
    result = normalize_stored_internet_phones(db)
    db.commit()
    return result


@router.post("/api/internet/phones/normalize-stored")
@router.post("/api/internet/phone-directory/normalize-stored")
def normalize_stored_phone_directory(
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_phone_directory_access),
):
    """
    يحدّث في قاعدة البيانات كل أرقام دليل الهواتف إلى الصيغة 077/078 (11 رقمًا).
    مفيد للسجلات القديمة المخزّنة بدون الصفر الأول (مثل 7712345678).
    """
    return _normalize_stored_phone_directory_impl(db)


@router.post("/api/internet/phones/import")
def import_phones_excel(
    file: UploadFile = ...,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_phone_directory_access),
):
    if not file.filename or not (file.filename.endswith(".xlsx") or file.filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="يرجى رفع ملف Excel (.xlsx أو .xls)")

    try:
        contents = file.file.read()
        df = pd.read_excel(io.BytesIO(contents), engine="openpyxl")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"تعذر قراءة الملف: {str(e)}")

    name_col = None
    phone_col = None
    seq_col = None
    for c in df.columns:
        c_lower = str(c).strip().lower()
        if c_lower in ("name", "اسم", "الاسم"):
            name_col = c
        elif c_lower in ("phone", "phone_number", "رقم", "رقم الهاتف", "هاتف"):
            phone_col = c
        elif c_lower in ("sequence", "ترتيب", "seq"):
            seq_col = c

    if not phone_col:
        for c in df.columns:
            if df[c].dtype in ("object", "string") and df[c].astype(str).str.match(r"[\d\s\-+]+").any():
                phone_col = c
                break
        if not phone_col and len(df.columns) >= 2:
            phone_col = df.columns[1]
        elif not phone_col:
            phone_col = df.columns[0] if len(df.columns) > 0 else None

    if not phone_col:
        raise HTTPException(status_code=400, detail="لم يتم العثور على عمود رقم الهاتف")

    if not name_col and len(df.columns) >= 1 and df.columns[0] != phone_col:
        name_col = df.columns[0]

    inserted = 0
    updated = 0
    skipped = 0
    import_errors: list[str] = []

    for idx, row in df.iterrows():
        try:
            ph_raw = str(row.get(phone_col, "")).strip()
            if not ph_raw or ph_raw == "nan":
                skipped += 1
                continue
            ph_raw = re.sub(r"\s+", "", ph_raw)
            if not ph_raw:
                skipped += 1
                continue
            try:
                ph_val = normalize_iraq_mobile(ph_raw, required=True)
            except ValueError as e:
                import_errors.append(f"صف {int(idx) + 2}: {e}")
                skipped += 1
                continue

            name_val = str(row.get(name_col, "")).strip() if name_col else None
            if name_val == "nan":
                name_val = None
            seq_val = int(row.get(seq_col, idx)) if seq_col else idx

            existing = db.query(models.InternetPhone).filter(
                models.InternetPhone.phone_number == ph_val
            ).first()
            if existing:
                existing.name = name_val or existing.name
                existing.sequence = seq_val
                db.flush()
                updated += 1
            else:
                db.add(models.InternetPhone(sequence=seq_val, name=name_val, phone_number=ph_val))
                db.flush()
                inserted += 1
        except Exception:
            skipped += 1

    db.commit()
    msg = f"تم: {inserted} إضافة، {updated} تحديث، {skipped} تخطي"
    if import_errors:
        msg += f" — ملاحظات: {'؛ '.join(import_errors[:5])}"
    return {
        "ok": True,
        "inserted": inserted,
        "updated": updated,
        "skipped": skipped,
        "errors": import_errors[:20],
        "message": msg,
    }


@router.get("/api/internet/phones/export")
def export_phones_excel(
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_phone_directory_access),
):
    rows = db.query(models.InternetPhone).order_by(
        models.InternetPhone.sequence,
        models.InternetPhone.id,
    ).all()
    df = pd.DataFrame([
        {"sequence": p.sequence, "name": p.name or "", "phone_number": p.phone_number}
        for p in rows
    ])
    output = io.BytesIO()
    df.to_excel(output, index=False, engine="openpyxl")
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=internet_phones.xlsx"},
    )


# ——— إنشاء / تعديل / حذف ———


@router.post("/api/internet/phones", response_model=dict)
def create_phone(
    payload: schemas.InternetPhoneCreate,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_phone_directory_access),
):
    existing = db.query(models.InternetPhone).filter(
        models.InternetPhone.phone_number == payload.phone_number.strip()
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="رقم الهاتف موجود مسبقاً")
    phone = models.InternetPhone(
        sequence=payload.sequence,
        name=payload.name or None,
        phone_number=payload.phone_number.strip(),
    )
    db.add(phone)
    db.commit()
    db.refresh(phone)
    return _to_dict(phone)


@router.put("/api/internet/phones/{phone_id}", response_model=dict)
def update_phone(
    phone_id: int,
    payload: schemas.InternetPhoneUpdate,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_phone_directory_access),
):
    phone = db.query(models.InternetPhone).filter(models.InternetPhone.id == phone_id).first()
    if not phone:
        raise HTTPException(status_code=404, detail="السجل غير موجود")
    if payload.sequence is not None:
        phone.sequence = payload.sequence
    if payload.name is not None:
        phone.name = payload.name or None
    if payload.phone_number is not None:
        new_num = payload.phone_number.strip()
        other = db.query(models.InternetPhone).filter(
            models.InternetPhone.phone_number == new_num,
            models.InternetPhone.id != phone_id,
        ).first()
        if other:
            raise HTTPException(status_code=400, detail="رقم الهاتف موجود مسبقاً")
        phone.phone_number = new_num
    db.commit()
    db.refresh(phone)
    return _to_dict(phone)


@router.delete("/api/internet/phones/{phone_id}")
def delete_phone(
    phone_id: int,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_phone_directory_access),
):
    phone = db.query(models.InternetPhone).filter(models.InternetPhone.id == phone_id).first()
    if not phone:
        raise HTTPException(status_code=404, detail="السجل غير موجود")
    db.delete(phone)
    db.commit()
    return {"ok": True}


@router.post("/api/internet/phones/{phone_id}/mark-promo-notified")
def mark_phone_promo_notified(
    phone_id: int,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_phone_directory_access),
):
    """
    Set last_promo_msg_date = now() for the phone entry.
    """
    from datetime import datetime
    phone = db.query(models.InternetPhone).filter(models.InternetPhone.id == phone_id).first()
    if not phone:
        raise HTTPException(status_code=404, detail="السجل غير موجود")
    
    phone.last_promo_msg_date = datetime.now()
    db.commit()
    return {"ok": True, "marked_at": phone.last_promo_msg_date.isoformat()}
