import os
import sys

# Add the parent directory to sys.path so we can import app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.core.db_bootstrap import bootstrap_if_needed


if __name__ == "__main__":
    bootstrap_if_needed(settings.DATABASE_URL)
    print("Bootstrap complete.")

