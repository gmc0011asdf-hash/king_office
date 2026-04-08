import io
import re
import unicodedata
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import List

import pandas as pd
from fastapi import APIRouter, Body, Depends, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core import database
from app.core.dependencies import get_current_user, require_admin
from app.modules.internet.services.subscriber_debt_service import (
    add_debt_line,
    allocate_payment_from_entries,
    apply_target_total_debt,
    build_debt_summary,
    import_initial_debt_if_any,
    add_initial_debt_if_any,
    roll_entry_to_previous,
    sum_remaining_for_subscriber,
    sync_debt_entries_for_subscriber,
    update_entry_metadata,
)
from app.core.iraq_phone import normalize_iraq_mobile
from app.models import models
from app.schemas import schemas

router = APIRouter(tags=["Internet"])

_ARABIC_TO_LATIN = {
    "ا": "A",
    "أ": "A",
    "إ": "A",
    "آ": "A",
    "ب": "B",
    "ت": "T",
    "ث": "TH",
    "ج": "J",
    "ح": "H",
    "خ": "KH",
    "د": "D",
    "ذ": "DH",
    "ر": "R",
    "ز": "Z",
    "س": "S",
    "ش": "SH",
    "ص": "S",
    "ض": "D",
    "ط": "T",
    "ظ": "Z",
    "ع": "A",
    "غ": "GH",
    "ف": "F",
    "ق": "Q",
    "ك": "K",
    "ل": "L",
    "م": "M",
    "ن": "N",
    "ه": "H",
    "و": "W",
    "ي": "Y",
    "ى": "Y",
    "ء": "A",
    "ؤ": "W",
    "ئ": "Y",
    "ة": "H",
}


def _latin_initial(name: str) -> str:
    raw = (name or "").strip()
    if not raw:
        return "X"
    ch = raw[0]
    if ch in _ARABIC_TO_LATIN:
        return _ARABIC_TO_LATIN[ch]
    # Best-effort latinize
    folded = unicodedata.normalize("NFKD", ch).encode("ascii", "ignore").decode("ascii")
    if folded and folded[0].isalpha():
        return folded[0].upper()
    if ch.isalpha():
        return ch.upper()
    return "X"


def _last_digit(text: str) -> str:
    digits = re.findall(r"\d", text or "")
    return digits[-1] if digits else "0"


def _last_two_digits(text: str) -> str:
    digits = re.findall(r"\d", text or "")
    if len(digits) >= 2:
        return "".join(digits[-2:])
    if len(digits) == 1:
        return "0" + digits[-1]
    return "00"


def _sanitize_fat(fat: str) -> str:
    # Keep FAT readable but safe
    s = (fat or "").strip()
    s = re.sub(r"\s+", "", s)
    s = re.sub(r"[^\w\-]", "", s, flags=re.UNICODE)
    return s or "FAT"

def _sanitize_zone(zone: str) -> str:
    s = (zone or "").strip()
    s = re.sub(r"\s+", "", s)
    s = re.sub(r"[^\w\-]", "", s, flags=re.UNICODE)
    return s or "ZONE"


def subscriber_name_for_user_code(real_name: str | None, national_id_name: str | None) -> str:
    """للرمز user_code: الاسم الحقيقي إن وُجد، وإلا الاسم الوطني (مثل ترحيل FTTH)."""
    r = (real_name or "").strip()
    if r:
        return r
    return (national_id_name or "").strip()


def build_user_code(real_name: str, zone: str, fat: str, phone: str) -> str:
    # Requested format:
    # ENGLISH_INITIAL - ZONE - FAT - LAST_TWO_PHONE_DIGITS
    return f"{_latin_initial(real_name)}-{_sanitize_zone(zone)}-{_sanitize_fat(fat)}-{_last_two_digits(phone)}"


def ensure_unique_user_code(db: Session, base_code: str, exclude_subscriber_id: int | None = None) -> str:
    """
    If base_code already exists, append a numeric suffix: -01, -02, ...
    """
    base_code = (base_code or "").strip()
    if not base_code:
        base_code = "X-ZONE-FAT-00"

    def exists(code: str) -> bool:
        q = db.query(models.Subscriber).filter(models.Subscriber.user_code == code)
        if exclude_subscriber_id is not None:
            q = q.filter(models.Subscriber.id != exclude_subscriber_id)
        return db.query(q.exists()).scalar() is True

    if not exists(base_code):
        return base_code

    for i in range(1, 100):
        candidate = f"{base_code}-{i:02d}"
        if not exists(candidate):
            return candidate

    # Fallback: append subscriber-independent timestamp-ish component
    return f"{base_code}-{datetime.utcnow().strftime('%H%M%S')}"

@router.get("/api/subscribers", response_model=List[schemas.Subscriber])
def read_subscribers(
    skip: int = 0,
    limit: int = 1000,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(get_current_user),
):
    return db.query(models.Subscriber).order_by(models.Subscriber.id.desc()).offset(skip).limit(limit).all()


@router.get("/api/subscribers/by-external/{external_customer_id}", response_model=schemas.Subscriber)
def read_subscriber_by_external_customer_id(
    external_customer_id: str,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(get_current_user),
):
    """مشترك محلي مرتبط بمعرّف FTTH الخارجي (جدول ftth_customers في قاعدة التطبيق)."""
    eid = (external_customer_id or "").strip()
    if not eid:
        raise HTTPException(status_code=404, detail="معرف خارجي غير صالح")
    fc = (
        db.query(models.FtthCustomer)
        .filter(models.FtthCustomer.external_customer_id == eid)
        .first()
    )
    if not fc:
        raise HTTPException(status_code=404, detail="لا يوجد سجل FTTH محلي لهذا المعرف")
    if fc.subscriber_id is None:
        raise HTTPException(
            status_code=404,
            detail="سجل FTTH موجود لكن غير مربوط بمشترك محلي بعد",
        )
    sub = db.query(models.Subscriber).filter(models.Subscriber.id == fc.subscriber_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="المشترك المرتبط غير موجود")
    return sub


@router.post("/api/subscribers", response_model=schemas.Subscriber)
def create_subscriber(
    subscriber: schemas.SubscriberCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    data = subscriber.model_dump(exclude_none=True)
    data.pop("user_code", None)
    sub_type = (data.get("subscription_type") or "ftth").lower()
    payment_method = data.pop("activation_payment_method", "cash")
    db_subscriber = models.Subscriber(**data)
    # Handle stable ID-based linkage for Zone/FAT
    if db_subscriber.zone_id:
        z = db.query(models.InternetZone).get(db_subscriber.zone_id)
        if z: db_subscriber.zone = z.name
    if db_subscriber.fat_id:
        f = db.query(models.InternetFat).get(db_subscriber.fat_id)
        if f: db_subscriber.fat = f.name

    if sub_type == "wireless":
        db_subscriber.user_code = None
        db_subscriber.national_id_name = db_subscriber.national_id_name or ""
    else:
        base_code = build_user_code(
            real_name=subscriber_name_for_user_code(
                data.get("real_name"),
                data.get("national_id_name"),
            ),
            zone=str(db_subscriber.zone or ""),
            fat=str(db_subscriber.fat or ""),
            phone=str(data.get("phone") or ""),
        )
        db_subscriber.user_code = ensure_unique_user_code(db, base_code)
    db.add(db_subscriber)
    db.flush()

    # Handle Payment Logic
    if payment_method == "wallet":
        # Get package price
        package_price = Decimal("0")
        if db_subscriber.category:
            # We assume category is the name or ID. In current logic it's the ID string from frontend.
            # But in DB it's stored as string name. 
            # Frontend sends category ID. Let's find it.
            cat = db.query(models.InternetCategory).filter(
                (models.InternetCategory.id == int(db_subscriber.category)) if db_subscriber.category.isdigit() else (models.InternetCategory.name == db_subscriber.category)
            ).first()
            if cat:
                package_price = Decimal(str(cat.price))
        
        if package_price > 0:
            wallet_type = "ftth" if sub_type == "ftth" else "wireless"
            wallet = db.query(models.Wallet).filter(models.Wallet.type == wallet_type).first()
            if not wallet or wallet.balance < package_price:
                raise HTTPException(
                    status_code=400, 
                    detail=f"رصيد محفظة {wallet_type.upper()} غير كافٍ لتفعيل المشترك. الرصيد: {wallet.balance if wallet else 0}"
                )
            
            # Deduct from wallet
            wallet.balance -= package_price
            db.add(wallet)
            
            # Record transaction
            txn = models.WalletTransaction(
                wallet_id=wallet.id,
                amount=package_price,
                type="expense",
                description=f"تفعيل مشترك: {db_subscriber.real_name} ({db_subscriber.user_code or 'Wireless'})",
                transaction_date=datetime.now(),
                created_by=current_user.id
            )
            db.add(txn)
            db.flush()

    try:
        add_initial_debt_if_any(db, db_subscriber, current_user)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # amount = category_price (what was billed); debt portion goes to debt entries separately
    subscription_amount = float(data.get("category_price") or 0)
    debt_amount = float(data.get("debt") or 0)
    cash_paid = max(0.0, subscription_amount - debt_amount)
    history_row = models.SubscriberHistory(
        subscriber_id=db_subscriber.id,
        type="اشتراك جديد",
        amount=cash_paid,
        description=f"اشتراك جديد - الفئة: {data.get('category') or ''} - المبلغ: {subscription_amount} - نقداً: {cash_paid}",
    )
    db.add(history_row)
    db.commit()
    db.refresh(db_subscriber)
    return db_subscriber


@router.get("/api/subscribers/{subscriber_id}/debt-summary")
def get_subscriber_debt_summary(
    subscriber_id: int,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(get_current_user),
):
    """إجمالي الدين، الحالي، السابق، وقائمة تفاصيل السجلات."""
    sub = db.query(models.Subscriber).filter(models.Subscriber.id == subscriber_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="المشترك غير موجود")
    return build_debt_summary(db, sub)


@router.post("/api/subscribers/{subscriber_id}/debt-entries")
def post_subscriber_debt_entry(
    subscriber_id: int,
    payload: schemas.SubscriberDebtEntryCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """إضافة دين تفصيلي جديد (مبلغ + تاريخ + تفاصيل + نطاق حالي/سابق)."""
    sub = db.query(models.Subscriber).filter(models.Subscriber.id == subscriber_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="المشترك غير موجود")
    scope = (payload.debt_scope or "current").strip().lower()
    if scope not in ("current", "previous"):
        raise HTTPException(status_code=422, detail="نطاق الدين يجب أن يكون current أو previous")
    try:
        add_debt_line(
            db,
            sub,
            Decimal(str(payload.amount)),
            payload.debt_date,
            payload.description or "",
            scope,
            "manual",
            current_user,
        )
        db.commit()
        db.refresh(sub)
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(e))
    return build_debt_summary(db, sub)


@router.patch("/api/subscribers/{subscriber_id}/debt-entries/{entry_id}")
def patch_subscriber_debt_entry(
    subscriber_id: int,
    entry_id: int,
    body: schemas.SubscriberDebtEntryMetaPatch = Body(default_factory=lambda: schemas.SubscriberDebtEntryMetaPatch()),
    roll_to_previous: bool = Query(False, alias="rollToPrevious"),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """تعديل تاريخ/وصف السجل أو ترحيل دين إلى «سابق»."""
    sub = db.query(models.Subscriber).filter(models.Subscriber.id == subscriber_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="المشترك غير موجود")
    try:
        if roll_to_previous:
            roll_entry_to_previous(db, sub, entry_id, current_user)
        else:
            if body.debt_date is None and body.description is None:
                raise HTTPException(status_code=422, detail="أرسل تاريخاً أو وصفاً للتعديل، أو استخدم rollToPrevious=true")
            update_entry_metadata(
                db,
                sub,
                entry_id,
                debt_date=body.debt_date,
                description=body.description,
                user=current_user,
            )
        db.commit()
        db.refresh(sub)
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(e))
    return build_debt_summary(db, sub)


@router.post("/api/subscribers/{subscriber_id}/debt-entries/{entry_id}/settle")
def settle_subscriber_debt_entry(
    subscriber_id: int,
    entry_id: int,
    payload: schemas.DebtEntrySettleRequest,
    db: Session = Depends(database.get_db),
    _current_user: models.User = Depends(get_current_user),
):
    """تسديد جزئي أو كلي لسجل دين محدد مع تسجيل حركة في تاريخ السداد."""
    sub = db.query(models.Subscriber).filter(models.Subscriber.id == subscriber_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="المشترك غير موجود")

    entry = (
        db.query(models.SubscriberDebtEntry)
        .filter(
            models.SubscriberDebtEntry.id == entry_id,
            models.SubscriberDebtEntry.subscriber_id == subscriber_id,
        )
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="سجل الدين غير موجود")

    remaining = Decimal(str(entry.remaining_amount or 0))
    pay = Decimal(str(payload.amount)).quantize(Decimal("0.01"))
    if pay > remaining:
        raise HTTPException(
            status_code=422,
            detail=f"مبلغ التسديد ({pay}) أكبر من المتبقي في هذا السجل ({remaining})",
        )

    try:
        entry.remaining_amount = (remaining - pay).quantize(Decimal("0.01"))
        db.flush()
        sub.debt = sum_remaining_for_subscriber(db, subscriber_id)

        desc = payload.description.strip() or "تسديد دين"
        history_row = models.SubscriberHistory(
            subscriber_id=subscriber_id,
            date=datetime.combine(payload.payment_date, datetime.min.time()),
            type="تسديد ديون",
            amount=float(pay),
            description=desc,
        )
        db.add(history_row)
        db.commit()
        db.refresh(sub)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(e))

    return build_debt_summary(db, sub)


@router.post("/api/subscribers/{subscriber_id}/pay-debt")
def pay_subscriber_debt(
    subscriber_id: int,
    payload: schemas.SubscriberDebtPaymentRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """تسديد مبلغ من إجمالي الدين (FIFO عبر السجلات المفتوحة) مع تسجيل حركة في التاريخ."""
    sub = db.query(models.Subscriber).filter(models.Subscriber.id == subscriber_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="المشترك غير موجود")

    pay = Decimal(str(payload.amount)).quantize(Decimal("0.01"))
    if pay <= 0:
        raise HTTPException(status_code=422, detail="المبلغ يجب أن يكون أكبر من صفر")

    # مزامنة سجلات التفاصيل مع حقل الدين المخزَّن قبل التحقق والتخصيص؛
    # يعالج الحالة التي يكون فيها subscribers.debt أكبر من مجموع remaining_amount
    # في سجلات التفاصيل (فجوة ناتجة عن بيانات قديمة أو تعديل يدوي).
    try:
        sync_debt_entries_for_subscriber(db, sub, current_user)
    except Exception:
        db.rollback()
        raise

    total_debt = Decimal(str(sub.debt or 0))
    if pay > total_debt:
        raise HTTPException(
            status_code=422,
            detail=f"مبلغ التسديد ({pay}) أكبر من إجمالي دين المشترك ({total_debt})",
        )

    try:
        allocate_payment_from_entries(db, subscriber_id, pay)
        sub.debt = sum_remaining_for_subscriber(db, subscriber_id)

        payment_date = payload.payment_date or date.today()
        desc = (payload.description or "").strip() or "تسديد دين"
        history_row = models.SubscriberHistory(
            subscriber_id=subscriber_id,
            date=datetime.combine(payment_date, datetime.min.time()),
            type="تسديد ديون",
            amount=float(pay),
            description=desc,
        )
        db.add(history_row)
        db.commit()
        db.refresh(sub)
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(e))

    return build_debt_summary(db, sub)


@router.post("/api/subscribers/sync-debt-entries")
def sync_all_debt_entries(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(require_admin),
):
    """
    مزامنة سجلات الديون التفصيلية مع حقل subscribers.debt لجميع المشتركين.
    يعالج: الفجوات الجزئية، الديون القديمة بدون سجلات، وعكس الزيادات.
    """
    subscribers = db.query(models.Subscriber).filter(models.Subscriber.debt > 0).all()
    results = []
    for sub in subscribers:
        result = sync_debt_entries_for_subscriber(db, sub, current_user)
        if result["action"] != "none":
            results.append({"subscriberId": sub.id, "name": sub.real_name or sub.national_id_name, **result})
    db.commit()
    return {"synced": len(results), "details": results}


@router.put("/api/subscribers/{subscriber_id}", response_model=schemas.Subscriber)
def update_subscriber(
    subscriber_id: int,
    subscriber: schemas.SubscriberUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_subscriber = db.query(models.Subscriber).filter(models.Subscriber.id == subscriber_id).first()
    if not db_subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")

    payload = subscriber.model_dump(exclude_unset=True, exclude_none=True)
    # Don't allow direct edits of user_code.
    payload.pop("user_code", None)
    debt_override = payload.pop("debt", None)
    for key, value in payload.items():
        setattr(db_subscriber, key, value)

    # Sync names from IDs if changed
    if "zone_id" in payload:
        z = db.query(models.InternetZone).get(db_subscriber.zone_id)
        if z: db_subscriber.zone = z.name
    if "fat_id" in payload:
        f = db.query(models.InternetFat).get(db_subscriber.fat_id)
        if f: db_subscriber.fat = f.name

    if debt_override is not None:
        try:
            apply_target_total_debt(
                db,
                db_subscriber,
                Decimal(str(debt_override)),
                current_user,
                entry_source="subscriber_update",
                adjustment_description="تسوية دين وفق تعديل بيانات المشترك",
            )
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))

    # If category_price or debt changed, recalculate the initial history cash amount.
    # This corrects FTTH-imported subscribers whose history was written with amount=0
    # because category_price was null at import time and set later.
    if "category_price" in payload or debt_override is not None:
        cat_price = float(db_subscriber.category_price or 0)
        current_debt = float(db_subscriber.debt or 0)
        correct_cash = max(0.0, cat_price - current_debt)
        initial_history = (
            db.query(models.SubscriberHistory)
            .filter(
                models.SubscriberHistory.subscriber_id == db_subscriber.id,
                models.SubscriberHistory.type == "اشتراك جديد",
                models.SubscriberHistory.amount == 0,
            )
            .first()
        )
        if initial_history is not None and correct_cash > 0:
            initial_history.amount = correct_cash

    # Recompute user code if any dependent field changed (only for FTTH).
    sub_type = (getattr(db_subscriber, "subscription_type", None) or "ftth").lower()
    if sub_type != "wireless" and any(
        k in payload for k in ["real_name", "national_id_name", "zone", "fat", "phone"]
    ):
        base_code = build_user_code(
            real_name=subscriber_name_for_user_code(
                db_subscriber.real_name,
                db_subscriber.national_id_name,
            ),
            zone=str(db_subscriber.zone or ""),
            fat=str(db_subscriber.fat or ""),
            phone=str(db_subscriber.phone or ""),
        )
        db_subscriber.user_code = ensure_unique_user_code(db, base_code, exclude_subscriber_id=db_subscriber.id)

    db.commit()
    db.refresh(db_subscriber)
    return db_subscriber

@router.delete("/api/subscribers/{subscriber_id}")
def delete_subscriber(
    subscriber_id: int,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(get_current_user),
):
    db_subscriber = db.query(models.Subscriber).filter(models.Subscriber.id == subscriber_id).first()
    if not db_subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")
    db.delete(db_subscriber)
    db.commit()
    return {"ok": True, "source": "database", "message": "تم حذف المشترك من قاعدة البيانات"}

@router.get("/api/subscriber-history", response_model=List[schemas.SubscriberHistory])
def read_subscriber_history(
    skip: int = 0,
    limit: int = 2000,
    subscriber_id: int | None = Query(default=None),
    db: Session = Depends(database.get_db),
    _: models.User = Depends(get_current_user),
):
    query = db.query(models.SubscriberHistory)
    if subscriber_id is not None:
        query = query.filter(models.SubscriberHistory.subscriber_id == subscriber_id)
    return query.order_by(models.SubscriberHistory.id.desc()).offset(skip).limit(limit).all()

@router.post("/api/subscriber-history", response_model=schemas.SubscriberHistory)
def create_subscriber_history(
    payload: schemas.SubscriberHistoryCreate,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(get_current_user),
):
    subscriber = db.query(models.Subscriber).filter(models.Subscriber.id == payload.subscriber_id).first()
    if not subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")

    row = models.SubscriberHistory(**payload.model_dump(exclude_none=True))
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ========= Subscribers Import/Export (Admin only) =========

_SUBSCRIBER_EXPORT_COLUMNS = [
    "id", "user_code", "real_name", "national_id_name", "phone", "zone", "fat",
    "category", "category_price", "subscription_type", "debt",
    "subscription_date", "expiration_date", "status", "location",
]

_SUBSCRIBER_IMPORT_ALIASES = {
    "name": "real_name",
    "اسم": "real_name",
    "real_name": "real_name",
    "realname": "real_name",
    "phone": "phone",
    "هاتف": "phone",
    "رقم": "phone",
    "zone": "zone",
    "منطقة": "zone",
    "fat": "fat",
    "category": "category",
    "فئة": "category",
    "package": "category",
    "subscription_date": "subscription_date",
    "start_date": "subscription_date",
    "تاريخ البداية": "subscription_date",
    "expiration_date": "expiration_date",
    "end_date": "expiration_date",
    "تاريخ النهاية": "expiration_date",
    "تاريخ_الانتهاء": "expiration_date",
    "status": "status",
    "حالة": "status",
    "location": "location",
    "عنوان": "location",
    "address": "location",
    "user_code": "user_code",
    "national_id_name": "national_id_name",
    "category_price": "category_price",
    "subscription_type": "subscription_type",
    "debt": "debt",
}


def _remaining_days_inclusive(exp: date, today: date) -> int:
    """أيام متبقية شاملة ليوم انتهاء الاشتراك (0 إذا انتهى)."""
    if exp < today:
        return 0
    return (exp - today).days + 1


def _status_from_expiration(exp: date, today: date) -> str:
    return "نشط" if _remaining_days_inclusive(exp, today) > 0 else "منتهي"


def _parse_excel_date(val) -> datetime | None:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    if isinstance(val, datetime):
        return val
    if isinstance(val, pd.Timestamp):
        return val.to_pydatetime()
    s = str(val).strip()
    if not s:
        return None
    # دعم صيغ: dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%m/%d/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(s[:10], fmt)
        except ValueError:
            continue
    try:
        return pd.to_datetime(s).to_pydatetime()
    except Exception:
        return None


@router.get("/api/subscribers/export")
def export_subscribers_excel(
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_admin),
):
    today = date.today()
    rows = db.query(models.Subscriber).order_by(models.Subscriber.id.desc()).all()
    data = []
    for s in rows:
        exp = s.expiration_date
        remaining = _remaining_days_inclusive(exp, today) if exp else 0
        data.append({
            "id": s.id,
            "user_code": s.user_code or "",
            "real_name": s.real_name or "",
            "national_id_name": s.national_id_name or "",
            "phone": s.phone or "",
            "zone": s.zone or "",
            "fat": s.fat or "",
            "category": s.category or "",
            "category_price": float(s.category_price or 0),
            "subscription_type": s.subscription_type or "ftth",
            "debt": float(s.debt or 0),
            "subscription_date": s.subscription_date.strftime("%Y-%m-%d") if s.subscription_date else "",
            "expiration_date": s.expiration_date.strftime("%Y-%m-%d") if s.expiration_date else "",
            "status": s.status or "",
            "remaining_days": remaining,
            "location": s.location or "",
        })
    df = pd.DataFrame(data)
    output = io.BytesIO()
    df.to_excel(output, index=False, engine="openpyxl")
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=subscribers.xlsx"},
    )


@router.get("/api/subscribers/{subscriber_id}", response_model=schemas.Subscriber)
def read_subscriber(
    subscriber_id: int,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(get_current_user),
):
    """مشترك واحد بالمعرّف المحلي — لتحميل التفاصيل من المصدر دون الاعتماد على قائمة الجلسة فقط.

    يُسجَّل بعد /export و /import حتى لا يُفسَّر «export» كمعرّف.
    """
    sub = db.query(models.Subscriber).filter(models.Subscriber.id == subscriber_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="المشترك غير موجود")
    return sub


@router.post("/api/subscribers/import")
def import_subscribers_excel(
    file: UploadFile = ...,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(require_admin),
):
    if not file.filename or not (file.filename.endswith(".xlsx") or file.filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="يرجى رفع ملف Excel (.xlsx أو .xls)")

    try:
        contents = file.file.read()
        df = pd.read_excel(io.BytesIO(contents), engine="openpyxl")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"تعذر قراءة الملف: {str(e)}")

    # Map Excel columns to schema fields
    col_map = {}
    for c in df.columns:
        c_clean = str(c).strip().lower().replace(" ", "_").replace("-", "_")
        target = _SUBSCRIBER_IMPORT_ALIASES.get(c_clean)
        if target:
            col_map[c] = target
        elif "name" in c_clean and "national" not in c_clean and "id" not in c_clean:
            col_map[c] = "real_name"
        elif "start" in c_clean or "بداية" in c_clean or "subscription" in c_clean:
            col_map[c] = "subscription_date"
        elif "end" in c_clean or "نهاية" in c_clean or "انتهاء" in c_clean or "expir" in c_clean:
            col_map[c] = "expiration_date"

    inserted = 0
    skipped = 0
    errors = []

    for idx, row in df.iterrows():
        try:
            sub_date = None
            exp_date = None
            for col, target in col_map.items():
                if target == "subscription_date":
                    sub_date = _parse_excel_date(row.get(col))
                elif target == "expiration_date":
                    exp_date = _parse_excel_date(row.get(col))

            # مدة الاشتراك 30 يوماً شاملاً ليوم البداية والنهاية ⇒ فرق التقويم بينهما 29 يوماً
            if exp_date is not None:
                sub_date = exp_date - timedelta(days=29)
            elif sub_date is not None:
                exp_date = sub_date + timedelta(days=29)
            else:
                errors.append(f"صف {idx + 2}: تاريخ البداية أو النهاية مطلوب")
                skipped += 1
                continue

            today = date.today()
            exp_date_only = exp_date.date() if hasattr(exp_date, "date") else exp_date

            real_name = None
            for col, target in col_map.items():
                if target == "real_name":
                    v = row.get(col)
                    if v is not None and str(v).strip() and str(v) != "nan":
                        real_name = str(v).strip()
                        break
            if not real_name:
                real_name = "مشترك"

            sub_date_only = sub_date.date() if hasattr(sub_date, "date") else sub_date
            data = {
                "real_name": real_name,
                "subscription_date": sub_date_only,
                "expiration_date": exp_date_only,
                "user_code": None,
                "national_id_name": None,
                "phone": None,
                "zone": None,
                "fat": None,
                "category": None,
                "category_price": 0,
                "subscription_type": "ftth",
                "debt": 0,
                "status": _status_from_expiration(exp_date_only, today),
                "location": None,
            }

            for col in df.columns:
                target = col_map.get(col)
                if not target:
                    continue
                val = row.get(col)
                if val is None or (isinstance(val, float) and pd.isna(val)):
                    continue
                if target == "subscription_date":
                    # لا نستبدل تاريخ الاشتراك من Excel إذا وُجد تاريخ الانتهاء (الانتهاء - 29 يوم = 30 يوماً خدمة)
                    if exp_date is None:
                        dt = _parse_excel_date(val)
                        if dt:
                            data["subscription_date"] = dt.date()
                elif target == "expiration_date":
                    dt = _parse_excel_date(val)
                    if dt:
                        data["expiration_date"] = dt.date()
                elif target == "category_price":
                    try:
                        data["category_price"] = float(val)
                    except (ValueError, TypeError):
                        pass
                elif target == "debt":
                    try:
                        data["debt"] = float(val)
                    except (ValueError, TypeError):
                        pass
                elif target in ("real_name", "phone", "zone", "fat", "category", "location", "national_id_name", "user_code", "subscription_type"):
                    data[target] = str(val).strip() if val else None

            # الحالة تُحسب من الأيام المتبقية (شامل يوم الانتهاء)
            final_exp = data["expiration_date"]
            data["status"] = _status_from_expiration(final_exp, today)

            ph_raw = data.get("phone")
            if ph_raw:
                try:
                    data["phone"] = normalize_iraq_mobile(str(ph_raw), required=True)
                except ValueError as e:
                    errors.append(f"صف {idx + 2}: {e}")
                    skipped += 1
                    continue

            sub = models.Subscriber(**data)
            sub_type = (data.get("subscription_type") or "ftth").lower()
            if sub_type == "wireless":
                sub.user_code = None
            else:
                base_code = build_user_code(
                    real_name=str(data.get("real_name") or ""),
                    zone=str(data.get("zone") or ""),
                    fat=str(data.get("fat") or ""),
                    phone=str(data.get("phone") or ""),
                )
                sub.user_code = ensure_unique_user_code(db, base_code)
            db.add(sub)
            db.flush()
            try:
                import_initial_debt_if_any(db, sub, current_user)
            except ValueError as e:
                raise HTTPException(status_code=422, detail=str(e))
            hist = models.SubscriberHistory(
                subscriber_id=sub.id,
                type="اشتراك جديد",
                amount=float(data.get("category_price") or 0) - float(data.get("debt") or 0),
                description=f"استيراد - الفئة: {data.get('category') or ''}",
            )
            db.add(hist)
            inserted += 1
        except Exception as ex:
            errors.append(f"صف {idx + 2}: {str(ex)}")
            skipped += 1

    db.commit()
    return {
        "ok": True,
        "inserted": inserted,
        "skipped": skipped,
        "errors": errors[:20],
        "message": f"تم استيراد {inserted} مشترك، تخطي {skipped}",
    }
