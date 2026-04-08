"""Merge heads: 047285bf4282 (neutralised no-op) + a9b8c7d6e5f4 (ftth sync tables)

Revision ID: b0a9f8e7d6c5
Revises: 047285bf4282, a9b8c7d6e5f4
Create Date: 2026-04-03

Resolves the two-headed branch that resulted from a stale autogenerate migration
(047285bf4282) branching off f1c2d3e4b5a6 alongside the correct chain
a1b2c3d4e5f7 -> a9b8c7d6e5f4.

Both heads are safe to merge here:
  - 047285bf4282 is a no-op (neutralised)
  - a9b8c7d6e5f4 is the correct final migration in the chain
"""
from typing import Sequence, Tuple, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b0a9f8e7d6c5'
down_revision: Union[str, Tuple[str, str], None] = ('047285bf4282', 'a9b8c7d6e5f4')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
