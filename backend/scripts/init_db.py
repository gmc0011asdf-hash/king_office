import os
import sys
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from urllib.parse import urlparse

# Add the parent directory to sys.path so we can import app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.exc import ProgrammingError  # noqa: F401

from app.core.config import settings
from app.core.database import Base, engine
from app.models import models

def create_database_if_not_exists():
    db_url = settings.DATABASE_URL
    if not db_url.startswith("postgresql"):
        print("النظام يدعم PostgreSQL فقط.")
        sys.exit(1)

    parsed = urlparse(db_url)
    db_name = parsed.path.lstrip('/')
    user = parsed.username
    password = parsed.password
    host = parsed.hostname
    port = parsed.port or 5432

    # Connect to the default 'postgres' database to check/create our db
    try:
        conn = psycopg2.connect(
            dbname='postgres',
            user=user,
            password=password,
            host=host,
            port=port
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()

        cursor.execute(f"SELECT 1 FROM pg_catalog.pg_database WHERE datname = '{db_name}'")
        exists = cursor.fetchone()
        if not exists:
            print(f"Database '{db_name}' does not exist. Creating...")
            cursor.execute(f"CREATE DATABASE {db_name}")
            print(f"Database '{db_name}' created successfully.")
        else:
            print(f"Database '{db_name}' already exists.")

        cursor.close()
        conn.close()
    except Exception as e:
        print(f"Error checking/creating database: {e}")

def init_db():
    print("Initializing database schema...")
    try:
        # يحاول إنشاء الجداول فقط إذا لم تكن موجودة
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        print(f"تنبيه: الجداول موجودة بالفعل أو حدث خطأ بسيط: {e}")
    print("Database schema initialized.")

if __name__ == "__main__":
    create_database_if_not_exists()
    init_db()
