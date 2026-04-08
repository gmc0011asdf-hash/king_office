from datetime import datetime, time
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core import database
from app.core.dependencies import get_current_user
from app.models import models

router = APIRouter(tags=["Internet Reports"])


def _build_datetime_range(start_date: Optional[str], end_date: Optional[str]):
    start_dt = None
    end_dt = None
    if start_date:
        start_dt = datetime.combine(datetime.fromisoformat(start_date).date(), time.min)
    if end_date:
        end_dt = datetime.combine(datetime.fromisoformat(end_date).date(), time.max)
    return start_dt, end_dt


@router.get("/api/internet/reports/summary")
def internet_report_summary(
    _: models.User = Depends(get_current_user),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    db: Session = Depends(database.get_db),
):
    start_dt, end_dt = _build_datetime_range(start_date, end_date)

    # ── النقد المستحصل من اشتراكات المشتركين (حسب الفترة) ──────────────────
    sub_history_q = db.query(models.SubscriberHistory).filter(
        models.SubscriberHistory.type.in_(["اشتراك جديد", "تجديد اشتراك", "تسديد ديون"])
    )
    if start_dt:
        sub_history_q = sub_history_q.filter(models.SubscriberHistory.date >= start_dt)
    if end_dt:
        sub_history_q = sub_history_q.filter(models.SubscriberHistory.date <= end_dt)
    subscription_cash = float(
        sub_history_q.with_entities(func.coalesce(func.sum(models.SubscriberHistory.amount), 0)).scalar() or 0
    )

    # ── مبيعات مواد الإنترنت (حسب الفترة) ──────────────────────────────────
    mat_q = db.query(models.InternetMaterialSale)
    if start_dt:
        mat_q = mat_q.filter(models.InternetMaterialSale.date >= start_dt)
    if end_dt:
        mat_q = mat_q.filter(models.InternetMaterialSale.date <= end_dt)

    material_cash = float(
        mat_q.filter(models.InternetMaterialSale.payment_method == "cash")
        .with_entities(func.coalesce(func.sum(models.InternetMaterialSale.total_amount), 0))
        .scalar()
        or 0
    )
    material_revenue = float(
        mat_q.with_entities(func.coalesce(func.sum(models.InternetMaterialSale.total_amount), 0)).scalar() or 0
    )
    material_profit = float(
        mat_q.with_entities(func.coalesce(func.sum(models.InternetMaterialSale.profit), 0)).scalar() or 0
    )

    # ── الديون المتبقية (remaining_amount) — الرصيد الفعلي غير المُسدَّد ──────
    # نستخدم remaining_amount لأن amount يشمل ما تم تسديده سابقاً
    # بدون فلتر تاريخ هنا: debtsCreated = مجموع الديون المفتوحة الحالية
    debt_entries_q = db.query(models.SubscriberDebtEntry).filter(
        models.SubscriberDebtEntry.remaining_amount > 0
    )
    if start_dt:
        debt_entries_q = debt_entries_q.filter(models.SubscriberDebtEntry.debt_date >= start_dt.date())
    if end_dt:
        debt_entries_q = debt_entries_q.filter(models.SubscriberDebtEntry.debt_date <= end_dt.date())
    debts_created_in_period = float(
        debt_entries_q.with_entities(func.coalesce(func.sum(models.SubscriberDebtEntry.remaining_amount), 0)).scalar() or 0
    )

    # ── الرصيد الحالي للديون (snapshot — مستقل عن الفترة) ──────────────────
    current_debts = float(
        db.query(func.coalesce(func.sum(models.Subscriber.debt), 0)).scalar() or 0
    )

    # ── عدد المشتركين وكاش باك ──────────────────────────────────────────────
    ftth_subscriber_count = int(
        db.query(func.count(models.Subscriber.id))
        .filter(models.Subscriber.subscription_type != "wireless")
        .scalar()
        or 0
    )
    subscriber_count = int(db.query(func.count(models.Subscriber.id)).scalar() or 0)

    latest_cashback = db.query(models.CashbackHistory).order_by(models.CashbackHistory.id.desc()).first()
    cashback_value = float(latest_cashback.amount) if latest_cashback and latest_cashback.amount is not None else 0.0
    cashback_expected = cashback_value * ftth_subscriber_count

    # ── أرباح Wireless (عدد الاشتراكات × هامش الربح للفئة) ────────────────
    # جلب كل سجلات تاريخ الاشتراك لمشتركي Wireless في الفترة
    wireless_history_q = (
        db.query(models.SubscriberHistory)
        .join(models.Subscriber, models.Subscriber.id == models.SubscriberHistory.subscriber_id)
        .filter(
            models.Subscriber.subscription_type == "wireless",
            models.SubscriberHistory.type.in_(["اشتراك جديد", "تجديد اشتراك", "تجديد اشتراك بالآجل"]),
        )
    )
    if start_dt:
        wireless_history_q = wireless_history_q.filter(models.SubscriberHistory.date >= start_dt)
    if end_dt:
        wireless_history_q = wireless_history_q.filter(models.SubscriberHistory.date <= end_dt)

    wireless_rows = (
        wireless_history_q
        .with_entities(models.Subscriber.category)
        .all()
    )

    # بناء lookup لهامش ربح كل فئة Wireless
    categories = db.query(models.SubscriptionCategory).filter(
        models.SubscriptionCategory.subscription_type == "wireless"
    ).all()
    cat_margin: dict[str, float] = {}
    for cat in categories:
        sell = float(cat.price or 0)
        cost = float(cat.cost_price or 0)
        margin = max(0.0, sell - cost)
        cat_margin[cat.name] = margin

    wireless_profits = sum(cat_margin.get(row.category or "", 0.0) for row in wireless_rows)

    total_profits = material_profit + cashback_expected + wireless_profits

    return {
        "startDate": start_date,
        "endDate": end_date,
        "subscriptionCash": subscription_cash,
        "materialCash": material_cash,
        "cashCollected": subscription_cash + material_cash,
        "debtsCreated": debts_created_in_period,
        "materialRevenue": material_revenue,
        "materialProfit": material_profit,
        "cashbackValue": cashback_value,
        "cashbackExpected": cashback_expected,
        "wirelessProfits": wireless_profits,
        "totalProfits": total_profits,
        "currentDebts": current_debts,
        "subscriberCount": subscriber_count,
        "ftthSubscriberCount": ftth_subscriber_count,
        "note": "debtsCreated = remaining_amount من سجلات الديون المفتوحة (غير المُسدَّدة). cashCollected = مجموع المبالغ المستحصلة من subscriber_history.",
    }


@router.get("/api/internet/reports/details")
def internet_report_details(
    _: models.User = Depends(get_current_user),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    db: Session = Depends(database.get_db),
):
    start_dt, end_dt = _build_datetime_range(start_date, end_date)

    material_sales_query = db.query(models.InternetMaterialSale)
    cashback_query = db.query(models.CashbackHistory)
    subscriber_history_query = db.query(models.SubscriberHistory)

    if start_dt:
        material_sales_query = material_sales_query.filter(models.InternetMaterialSale.date >= start_dt)
        cashback_query = cashback_query.filter(models.CashbackHistory.date >= start_dt)
        subscriber_history_query = subscriber_history_query.filter(models.SubscriberHistory.date >= start_dt)
    if end_dt:
        material_sales_query = material_sales_query.filter(models.InternetMaterialSale.date <= end_dt)
        cashback_query = cashback_query.filter(models.CashbackHistory.date <= end_dt)
        subscriber_history_query = subscriber_history_query.filter(models.SubscriberHistory.date <= end_dt)

    material_sales = material_sales_query.order_by(models.InternetMaterialSale.id.desc()).all()
    cashback_rows = cashback_query.order_by(models.CashbackHistory.id.desc()).all()
    subscriber_history = subscriber_history_query.order_by(models.SubscriberHistory.id.desc()).all()

    return {
        "materialSales": [
            {
                "id": row.id,
                "date": row.date.isoformat() if row.date else None,
                "materialName": row.material_name,
                "quantity": row.quantity,
                "purchasePrice": float(row.purchase_price or 0),
                "sellingPrice": float(row.selling_price or 0),
                "totalAmount": float(row.total_amount or 0),
                "profit": float(row.profit or 0),
                "paymentMethod": row.payment_method,
                "subscriberName": row.subscriber_name,
            }
            for row in material_sales
        ],
        "cashbackHistory": [
            {
                "id": row.id,
                "date": row.date.isoformat() if row.date else None,
                "amount": float(row.amount or 0),
                "description": row.description,
            }
            for row in cashback_rows
        ],
        "subscriberHistory": [
            {
                "id": row.id,
                "subscriberId": row.subscriber_id,
                "date": row.date.isoformat() if row.date else None,
                "type": row.type,
                "amount": float(row.amount or 0),
                "description": row.description,
            }
            for row in subscriber_history
        ],
    }
