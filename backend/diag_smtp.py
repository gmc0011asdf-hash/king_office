import sys
import os
from pathlib import Path

# Add backend to sys.path
backend_path = Path(__file__).resolve().parent
sys.path.append(str(backend_path))

try:
    from app.core.config import settings
    print("--- Configuration Check ---")
    print(f"SMTP_HOST: {settings.SMTP_HOST}")
    print(f"SMTP_PORT: {settings.SMTP_PORT}")
    print(f"SMTP_USERNAME: {settings.SMTP_USERNAME}")
    # Don't print full password for security, just length/status
    pw_status = "SET" if settings.SMTP_PASSWORD else "NOT SET"
    print(f"SMTP_PASSWORD: {pw_status}")
    print(f"SMTP_TLS: {settings.SMTP_TLS}")
    print(f"MAIL_FROM: {settings.MAIL_FROM}")
    print("---------------------------")
except Exception as e:
    print(f"Error loading settings: {e}")
