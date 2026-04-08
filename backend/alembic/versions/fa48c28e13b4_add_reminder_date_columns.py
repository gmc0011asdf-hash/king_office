"""add_reminder_date_columns

Revision ID: fa48c28e13b4
Revises: b0a9f8e7d6c5
Create Date: 2026-04-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'fa48c28e13b4'
down_revision: Union[str, None] = 'b0a9f8e7d6c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('subscribers', sa.Column('last_expiry_reminder_date', sa.DateTime(), nullable=True))
    op.add_column('subscribers', sa.Column('last_debt_reminder_date', sa.DateTime(), nullable=True))
    op.add_column('internet_phones', sa.Column('last_promo_msg_date', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('subscribers', 'last_expiry_reminder_date')
    op.drop_column('subscribers', 'last_debt_reminder_date')
    op.drop_column('internet_phones', 'last_promo_msg_date')
