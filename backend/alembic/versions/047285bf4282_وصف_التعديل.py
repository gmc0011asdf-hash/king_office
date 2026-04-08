"""وصف التعديل

Revision ID: 047285bf4282
Revises: f1c2d3e4b5a6
Create Date: 2026-03-31 20:02:23.250631

NOTE: This migration was a stale autogenerate artifact generated against an
inconsistent database snapshot. Its original upgrade() would have:
  - attempted to CREATE TABLE audit_logs (already exists from b2c8e1f4a3b9)
  - DROP TABLE automation_telegram_links (live data loss)
  - ALTER COLUMN BIGINT→Integer on 20+ tables (data truncation risk)
It has been neutralised to a no-op. The branch is resolved by merge migration
b0a9f8e7d6c5_merge_heads.py.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '047285bf4282'
down_revision: Union[str, None] = 'f1c2d3e4b5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass  # no-op: original body was a dangerous stale autogenerate (see docstring)


def downgrade() -> None:
    pass  # no-op: original body was a dangerous stale autogenerate (see docstring)
