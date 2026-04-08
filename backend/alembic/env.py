from logging.config import fileConfig
from sqlalchemy import engine_from_config
from sqlalchemy import pool
from alembic import context
import os
import sys

# Add the backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.models import models  # noqa: F401 — ensure models are registered on Base.metadata
from app.core.database import Base

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
target_metadata = Base.metadata


def get_url() -> str:
    """
    Database URL for migrations.

    1) If ``DATABASE_URL`` is set in the environment (CI, Docker, Supabase, etc.),
       it wins — this is what you want for deployment so the migration job does not
       depend on a local ``backend/.env`` file.

    2) Otherwise falls back to ``settings.DATABASE_URL`` (from ``backend/.env`` or
       defaults in ``app.core.config``).

    Supabase: use the connection string from the dashboard (often includes
    ``?sslmode=require``). Prefer the **direct** session pooler / port **5432** for
    DDL migrations if you hit pooler limitations; see Supabase docs.
    """
    url = os.environ.get("DATABASE_URL")
    if url:
        return url.strip()
    from app.core.config import settings

    return settings.DATABASE_URL

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    configuration = config.get_section(config.config_ini_section)
    configuration["sqlalchemy.url"] = get_url()
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
