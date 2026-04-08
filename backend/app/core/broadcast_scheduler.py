import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.modules.internet.services import broadcast_service

logger = logging.getLogger(__name__)

# نستخدم نفس الـ scheduler الأساسي إذا كان متاحاً، ولكن هنا ننشئ واحداً منفصلاً لضمان العزل
scheduler = BackgroundScheduler()

def process_broadcast_queue_job():
    """معالجة طابور الإرسال."""
    db: Session = SessionLocal()
    try:
        pending = broadcast_service.get_pending_broadcasts(db)
        if not pending:
            return
            
        logger.info(f"Processing {len(pending)} pending broadcasts...")
        for item in pending:
            # هنا يتم استدعاء مزود الخدمة (مثل Telegram)
            # بما أننا في "Manual Send" أو Telegram حالياً:
            if item.channel == "telegram":
                # Logic for telegram bot send would go here
                pass
            
            # بالنسبة لـ whatsapp_manual يبقى pending حتى يفتحه المستخدم أو نؤشره يدوياً
            # حالياً سنتركه pending ليظهر في الواجهة
            
    except Exception as e:
        logger.error(f"Error in broadcast queue job: {e}")
    finally:
        db.close()

def scan_debt_job():
    """البحث الدوري عن الديون."""
    db: Session = SessionLocal()
    try:
        logger.info("Starting automated debt scan...")
        count = broadcast_service.scan_and_queue_debt_alerts(db)
        logger.info(f"Queued {count} new debt alerts.")
    except Exception as e:
        logger.error(f"Error in debt scan job: {e}")
    finally:
        db.close()

def setup_broadcast_scheduler():
    """إعداد المجدول لمهام البث."""
    if not scheduler.running:
        # فحص الطابور كل دقيقة
        scheduler.add_job(process_broadcast_queue_job, "interval", minutes=1, id="process_queue")
        
        # فحص الديون كل يوم في الساعة 10 صباحاً
        scheduler.add_job(scan_debt_job, CronTrigger(hour=10, minute=0), id="debt_scan")
        
        scheduler.start()
        logger.info("Broadcast scheduler started.")

def shutdown_broadcast_scheduler():
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Broadcast scheduler shutdown.")
