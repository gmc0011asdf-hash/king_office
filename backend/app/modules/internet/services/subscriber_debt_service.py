"""منطق ديون المشتركين: تفاصيل السجلات، تسوية الإجمالي، تخصيص التسديد FIFO."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import models

if TYPE_CHECKING:
    pass


def _q2(x: Decimal) -> Decimal:
    return x.quantize(Decimal("0.01"))


def sum_remaining_for_subscriber(db: Session, subscriber_id: int) -> Decimal:
    """مجموع أرصدة السجلات المفتوحة."""
    v = db.query(func.coalesce(func.sum(models.SubscriberDebtEntry.remaining_amount), 0)).filter(
        models.SubscriberDebtEntry.subscriber_id == subscriber_id
    ).scalar()
    return _q2(Decimal(str(v or 0)))


def _log_activity(
    db: Session,
    user: Optional[models.User],
    action: str,
    details: str,
) -> None:
    if user is None:
        return
    row = models.ActivityLog(
        user_id=user.id,
        user_name=user.name,
        section="internet",
        action=action,
        details=details,
    )
    db.add(row)


def add_debt_line(
    db: Session,
    subscriber: models.Subscriber,
    amount: Decimal,
    debt_date: date,
    description: str,
    debt_scope: str,
    entry_source: str,
    user: Optional[models.User],
) -> models.SubscriberDebtEntry:
    """إضافة سجل دين جديد (زيادة دين) وتحديث إجمالي المشترك."""
    amt = _q2(amount)
    if amt <= 0:
        raise ValueError("amount must be positive")
    scope = (debt_scope or "current").strip().lower()
    if scope not in ("current", "previous"):
        raise ValueError("debt_scope must be current or previous")

    entry = models.SubscriberDebtEntry(
        subscriber_id=subscriber.id,
        amount=amt,
        remaining_amount=amt,
        debt_date=debt_date,
        description=description or "",
        debt_scope=scope,
        entry_source=entry_source,
        created_by_user_id=user.id if user else None,
    )
    db.add(entry)
    db.flush()

    total = sum_remaining_for_subscriber(db, int(subscriber.id))
    subscriber.debt = total
    subscriber_name = (subscriber.real_name or subscriber.national_id_name or "").strip() or f"مشترك #{subscriber.id}"
    _log_activity(
        db,
        user,
        "subscriber_debt_add",
        f"إضافة دين للمشترك {subscriber_name} (id={subscriber.id}): {amt} د.ع — {description} — "
        f"التاريخ {debt_date.isoformat()} — النطاق {scope} — سجل دين {entry.id}",
    )
    return entry


def allocate_payment_from_entries(db: Session, subscriber_id: int, pay_amount: Decimal) -> None:
    """تطبيق تسديد على السجلات (FIFO حسب تاريخ الدين ثم المعرف)."""
    pay = _q2(pay_amount)
    if pay <= 0:
        return
    rows = (
        db.query(models.SubscriberDebtEntry)
        .filter(models.SubscriberDebtEntry.subscriber_id == subscriber_id)
        .filter(models.SubscriberDebtEntry.remaining_amount > 0)
        .order_by(models.SubscriberDebtEntry.debt_date.asc(), models.SubscriberDebtEntry.id.asc())
        .all()
    )
    left = pay
    for row in rows:
        if left <= 0:
            break
        rem = _q2(Decimal(str(row.remaining_amount or 0)))
        if rem <= 0:
            continue
        take = min(rem, left)
        row.remaining_amount = _q2(rem - take)
        left = _q2(left - take)
    if left > Decimal("0.01"):
        raise ValueError(
            "مبلغ التسديد أكبر من مجموع الديون المسجّلة في التفاصيل. يراجع المزامنة أو سجل الحركات."
        )
    db.flush()


def sync_debt_entries_for_subscriber(
    db: Session,
    subscriber: models.Subscriber,
    user: Optional[models.User],
) -> dict:
    """
    مزامنة subscriber_debt_entries مع subscribers.debt.
    - إذا كانت الإجماليات متطابقة → لا يوجد إجراء.
    - إذا كان الفرق موجبًا (entries < stored) → نُنشئ سطر legacy_sync بالفرق.
    - إذا كان الفرق سالبًا (entries > stored) → نُحدّث subscribers.debt من الإجماليات (النسخة الأصح).
    يُعيد {"action": "none"|"created_entry"|"fixed_debt", "diff": float}.
    """
    sum_rem = sum_remaining_for_subscriber(db, int(subscriber.id))
    stored = _q2(Decimal(str(subscriber.debt or 0)))
    diff = _q2(stored - sum_rem)

    if abs(diff) <= Decimal("0.01"):
        return {"action": "none", "diff": 0.0}

    if diff > 0:
        # entries sum is less than stored debt → create a legacy entry for the gap
        add_debt_line(
            db,
            subscriber,
            diff,
            subscriber.subscription_date or date.today(),
            "دين مرحّل — تزامن تلقائي مع حقل الدين القديم",
            "previous",
            "legacy_sync",
            user,
        )
        return {"action": "created_entry", "diff": float(diff)}
    else:
        # entries sum exceeds stored debt → trust entries as the source of truth
        subscriber.debt = sum_rem
        return {"action": "fixed_debt", "diff": float(-diff)}


def _ensure_debt_entries_from_legacy_column(
    db: Session,
    subscriber: models.Subscriber,
    user: Optional[models.User],
) -> None:
    """
    إذا كان subscribers.debt > 0 بينما لا توجد سجلات تفاصيل (تركيب قديم أو قبل الترحيل)،
    يُنشأ سجل واحد يطابق الإجمالي كي يمكن تخصيص التسديد بأمان.
    يعالج أيضًا الفجوات الجزئية حيث entries_sum != stored_debt.
    """
    sync_debt_entries_for_subscriber(db, subscriber, user)


def apply_target_total_debt(
    db: Session,
    subscriber: models.Subscriber,
    target_total: Decimal,
    user: Optional[models.User],
    *,
    entry_source: str,
    adjustment_description: Optional[str] = None,
    adjustment_scope: str = "current",
) -> None:
    """
    جعل مجموع remaining_amount يساوي target_total (مطابقاً لـ subscribers.debt بعد التعديل).
    يُستخدم عند PUT للمشترك أو أي مسار يغيّر الإجمالي دون سطر تفصيلي جديد محدد.
    """
    _ensure_debt_entries_from_legacy_column(db, subscriber, user)
    target = _q2(target_total)
    if target < 0:
        raise ValueError("إجمالي الدين لا يمكن أن يكون سالباً")
    sum_rem = sum_remaining_for_subscriber(db, int(subscriber.id))
    diff = _q2(target - sum_rem)
    if diff == 0:
        subscriber.debt = target
        return
    if diff > 0:
        scope = (adjustment_scope or "current").strip().lower()
        if scope not in ("current", "previous"):
            scope = "current"
        desc = adjustment_description or "تسوية دين تلقائية — زيادة"
        add_debt_line(
            db,
            subscriber,
            diff,
            date.today(),
            desc,
            scope,
            entry_source,
            user,
        )
        return
    # diff < 0
    allocate_payment_from_entries(db, int(subscriber.id), -diff)
    subscriber.debt = sum_remaining_for_subscriber(db, int(subscriber.id))
    subscriber_name = (subscriber.real_name or subscriber.national_id_name or "").strip() or f"مشترك #{subscriber.id}"
    _log_activity(
        db,
        user,
        "subscriber_debt_reduce",
        f"تخفيض دين (تسديد/تسوية) للمشترك {subscriber_name} (id={subscriber.id}): {(-diff)} د.ع — "
        f"المصدر {entry_source}",
    )


def add_initial_debt_if_any(
    db: Session,
    subscriber: models.Subscriber,
    user: Optional[models.User],
) -> None:
    """بعد إنشاء مشترك جديد: إذا كان هناك دين أولي، يُسجّل كسطر تفصيلي."""
    amt = _q2(Decimal(str(subscriber.debt or 0)))
    if amt <= 0:
        return
    add_debt_line(
        db,
        subscriber,
        amt,
        subscriber.subscription_date or date.today(),
        "دين أولي — اشتراك جديد",
        "current",
        "subscription_initial",
        user,
    )


def import_initial_debt_if_any(
    db: Session,
    subscriber: models.Subscriber,
    user: Optional[models.User],
) -> None:
    """بعد استيراد مشترك: تسجيل دين الإنترنت إن وُجد."""
    amt = _q2(Decimal(str(subscriber.debt or 0)))
    if amt <= 0:
        return
    add_debt_line(
        db,
        subscriber,
        amt,
        subscriber.subscription_date or date.today(),
        "دين أولي — استيراد من الملف",
        "current",
        "import_initial",
        user,
    )


def build_debt_summary(
    db: Session,
    subscriber: models.Subscriber,
) -> dict[str, Any]:
    """ملخص للواجهة: إجمالي، حالي، سابق، وقائمة السجلات."""
    entries = (
        db.query(models.SubscriberDebtEntry)
        .filter(models.SubscriberDebtEntry.subscriber_id == subscriber.id)
        .order_by(models.SubscriberDebtEntry.debt_date.desc(), models.SubscriberDebtEntry.id.desc())
        .all()
    )
    total_from_entries = Decimal("0")
    current = Decimal("0")
    previous = Decimal("0")
    out_rows: list[dict[str, Any]] = []
    for e in entries:
        rem = _q2(Decimal(str(e.remaining_amount or 0)))
        total_from_entries += rem
        if e.debt_scope == "previous":
            previous += rem
        else:
            current += rem
        out_rows.append(
            {
                "id": int(e.id),
                "subscriberId": int(e.subscriber_id),
                "amount": float(e.amount),
                "remainingAmount": float(rem),
                "debtDate": e.debt_date.isoformat() if e.debt_date else None,
                "description": e.description or "",
                "debtScope": e.debt_scope,
                "entrySource": e.entry_source,
                "createdAt": e.created_at.isoformat() if e.created_at else None,
                "updatedAt": e.updated_at.isoformat() if e.updated_at else None,
                "createdByUserId": e.created_by_user_id,
            }
        )
    total_from_entries = _q2(total_from_entries)
    current = _q2(current)
    previous = _q2(previous)
    stored = _q2(Decimal(str(subscriber.debt or 0)))
    synced = abs(float(total_from_entries) - float(stored)) < 0.02
    return {
        "subscriberId": int(subscriber.id),
        "totalDebt": float(stored),
        "currentDebt": float(current),
        "previousDebt": float(previous),
        "sumFromEntries": float(total_from_entries),
        "entriesSynced": synced,
        "entries": out_rows,
    }


def roll_entry_to_previous(
    db: Session,
    subscriber: models.Subscriber,
    entry_id: int,
    user: Optional[models.User],
) -> models.SubscriberDebtEntry:
    """ترحيل سجل دين من «حالي» إلى «سابق»."""
    row = (
        db.query(models.SubscriberDebtEntry)
        .filter(
            models.SubscriberDebtEntry.id == entry_id,
            models.SubscriberDebtEntry.subscriber_id == subscriber.id,
        )
        .first()
    )
    if not row:
        raise ValueError("سجل الدين غير موجود")
    if row.debt_scope != "current":
        raise ValueError("يمكن ترحيل السجلات الحالية فقط إلى سابقة")
    row.debt_scope = "previous"
    row.updated_at = datetime.utcnow()
    subscriber_name = (subscriber.real_name or subscriber.national_id_name or "").strip() or f"مشترك #{subscriber.id}"
    _log_activity(
        db,
        user,
        "subscriber_debt_roll_previous",
        f"ترحيل دين إلى سابق — المشترك {subscriber_name} (id={subscriber.id}) — سجل {entry_id} — "
        f"متبقي {_q2(Decimal(str(row.remaining_amount or 0)))} د.ع",
    )
    return row


def update_entry_metadata(
    db: Session,
    subscriber: models.Subscriber,
    entry_id: int,
    *,
    debt_date: Optional[date],
    description: Optional[str],
    user: Optional[models.User],
) -> models.SubscriberDebtEntry:
    """تحديث تاريخ أو وصف السجل دون تغيير المبالغ."""
    row = (
        db.query(models.SubscriberDebtEntry)
        .filter(
            models.SubscriberDebtEntry.id == entry_id,
            models.SubscriberDebtEntry.subscriber_id == subscriber.id,
        )
        .first()
    )
    if not row:
        raise ValueError("سجل الدين غير موجود")
    if debt_date is not None:
        row.debt_date = debt_date
    if description is not None:
        row.description = description
    row.updated_at = datetime.utcnow()
    subscriber_name = (subscriber.real_name or subscriber.national_id_name or "").strip() or f"مشترك #{subscriber.id}"
    _log_activity(
        db,
        user,
        "subscriber_debt_edit_meta",
        f"تعديل بيانات سجل دين — المشترك {subscriber_name} (id={subscriber.id}) — سجل {entry_id}",
    )
    return row
