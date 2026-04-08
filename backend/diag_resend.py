"""
اختبار تشخيصي لإرسال البريد عبر Resend API.
الاستخدام:
    cd backend
    python diag_resend.py [email@example.com]

إذا لم يُعطَ بريد، يُرسل إلى ADMIN_EMAIL من الإعدادات.
"""
import sys
from pathlib import Path

# إضافة backend إلى sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    from app.core.config import settings
except Exception as e:
    print(f"ERROR: Failed to load settings: {e}")
    sys.exit(1)

print("--- Resend Configuration Check ---")
key_status = "SET" if settings.RESEND_API_KEY else "NOT SET"
print(f"RESEND_API_KEY : {key_status}")
print(f"MAIL_FROM      : {settings.MAIL_FROM}")
print(f"FRONTEND_URL   : {settings.FRONTEND_URL}")
print(f"ADMIN_EMAIL    : {settings.ADMIN_EMAIL}")
print("----------------------------------")

if not settings.RESEND_API_KEY:
    print("ERROR: RESEND_API_KEY is not set. Add it to backend/.env")
    sys.exit(1)

to_email = sys.argv[1] if len(sys.argv) > 1 else settings.ADMIN_EMAIL
if not to_email:
    print("ERROR: No target email. Pass one as argument: python diag_resend.py you@example.com")
    sys.exit(1)

print(f"\nSending test email to: {to_email}")

try:
    import resend
    resend.api_key = settings.RESEND_API_KEY
    result = resend.Emails.send({
        "from": settings.MAIL_FROM,
        "to": [to_email],
        "subject": "Resend Test — King Office",
        "text": (
            "هذا بريد تشخيصي من King Office للتحقق من إعداد Resend.\n"
            "إذا وصلك هذا البريد فالإعداد يعمل بشكل صحيح."
        ),
    })
    print(f"SUCCESS: Email sent — id={result.get('id', result)}")
except Exception as e:
    print(f"ERROR: {type(e).__name__}: {e}")
    sys.exit(1)
