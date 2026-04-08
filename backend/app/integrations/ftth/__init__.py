"""تكامل بوابة FTTH الخارجية — جلب وسيط بدون خلط مع جدول المشتركين الأساسي."""

from app.integrations.ftth.engine import sync_ftth_customers, sync_ftth_subscribers, verify_ftth_connection

__all__ = [
    "sync_ftth_customers",
    "sync_ftth_subscribers",
    "verify_ftth_connection",
]
