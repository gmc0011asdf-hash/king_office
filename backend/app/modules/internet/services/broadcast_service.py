from datetime import datetime, timedelta
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import models
from decimal import Decimal

def queue_message(
    db: Session,
    recipient: str,
    message: str,
    channel: str = "sms",
    payload: dict = None,
    scheduled_at: Optional[datetime] = None
) -> models.BroadcastQueue:
    """إضافة رسالة إلى طابور الإرسال."""
    entry = models.BroadcastQueue(
        recipient=recipient,
        message=message,
        channel=channel,
        payload=payload or {},
        scheduled_at=scheduled_at,
        status="pending"
    )
    db.add(entry)
    db.flush()
    return entry

def get_pending_broadcasts(db: Session, limit: int = 50) -> List[models.BroadcastQueue]:
    """جلب الرسائل التي تنتظر الإرسال."""
    now = datetime.utcnow()
    return (
        db.query(models.BroadcastQueue)
        .filter(models.BroadcastQueue.status == "pending")
        .filter((models.BroadcastQueue.scheduled_at == None) | (models.BroadcastQueue.scheduled_at <= now))
        .order_by(models.BroadcastQueue.created_at.asc())
        .limit(limit)
        .all()
    )

def mark_broadcast_sent(db: Session, broadcast_id: int):
    """تأشير الرسالة كمرسلة."""
    item = db.query(models.BroadcastQueue).filter(models.BroadcastQueue.id == broadcast_id).first()
    if item:
        item.status = "sent"
        item.sent_at = datetime.utcnow()
        db.flush()

def mark_broadcast_failed(db: Session, broadcast_id: int, error: str):
    """تأشير الرسالة كفاشلة."""
    item = db.query(models.BroadcastQueue).filter(models.BroadcastQueue.id == broadcast_id).first()
    if item:
        item.status = "failed"
        item.error_log = error
        db.flush()

def scan_and_queue_debt_alerts(db: Session, threshold: Decimal = Decimal("50000"), days_between: int = 7):
    """البحث عن المشتركين المديونين وإضافتهم للطابور."""
    now = datetime.utcnow()
    recheck_date = now - timedelta(days=days_between)
    
    # جلب المشتركين الذين تجاوزوا الحد ولم يتم تنبيههم مؤخراً
    subscribers = (
        db.query(models.Subscriber)
        .filter(models.Subscriber.debt >= threshold)
        .filter((models.Subscriber.last_debt_alert_sent == None) | (models.Subscriber.last_debt_alert_sent <= recheck_date))
        .filter(models.Subscriber.phone != None)
        .all()
    )
    
    count = 0
    for sub in subscribers:
        message = f"مرحباً {sub.real_name or 'عزيزي المشترك'}، نود تذكيرك بوجود مبالغ مستحقة بذمتكم بقيمة {float(sub.debt):,.0f} د.ع. يرجى مراجعة المكتب للتسديد. شكراً لكم."
        
        queue_message(
            db,
            recipient=sub.phone,
            message=message,
            channel="whatsapp_manual", # نستخدم هذا افتراضياً حالياً للفتح اليدوي أو مع البوت لاحقاً
            payload={"subscriber_id": sub.id, "type": "debt_alert"}
        )
        
        sub.last_debt_alert_sent = now
        count += 1
    
    db.commit()
    return count
