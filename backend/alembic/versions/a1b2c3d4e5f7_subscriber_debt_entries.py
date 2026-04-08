"""subscriber_debt_entries: تفاصيل ديون المشتركين

Revision ID: a1b2c3d4e5f7
Revises: f1c2d3e4b5a6
Create Date: 2026-04-01

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f7"
down_revision: Union[str, None] = "f1c2d3e4b5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    tables = insp.get_table_names()
    if "subscriber_debt_entries" not in tables:
        op.create_table(
            "subscriber_debt_entries",
            sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
            sa.Column("subscriber_id", sa.BigInteger(), nullable=False),
            sa.Column("amount", sa.Numeric(14, 2), nullable=False),
            sa.Column("remaining_amount", sa.Numeric(14, 2), nullable=False),
            sa.Column("debt_date", sa.Date(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("debt_scope", sa.String(length=20), nullable=False, server_default="current"),
            sa.Column("entry_source", sa.String(length=50), nullable=False, server_default="manual"),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
            sa.Column("created_by_user_id", sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["subscriber_id"], ["subscribers.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            op.f("ix_subscriber_debt_entries_id"),
            "subscriber_debt_entries",
            ["id"],
            unique=False,
        )
        op.create_index(
            op.f("ix_subscriber_debt_entries_subscriber_id"),
            "subscriber_debt_entries",
            ["subscriber_id"],
            unique=False,
        )
        op.create_index(
            op.f("ix_subscriber_debt_entries_created_by_user_id"),
            "subscriber_debt_entries",
            ["created_by_user_id"],
            unique=False,
        )

    # ترحيل آمن: سجل واحد «سابق» لكل مشترك لديه دين ولا توجد له تفاصيل بعد
    conn.execute(
        sa.text(
            """
            INSERT INTO subscriber_debt_entries (
              subscriber_id, amount, remaining_amount, debt_date, description,
              debt_scope, entry_source, created_at, updated_at
            )
            SELECT
              s.id,
              COALESCE(s.debt, 0),
              COALESCE(s.debt, 0),
              COALESCE(s.subscription_date, CURRENT_DATE),
              'دين مرحّل من النظام القديم (إجمالي بدون تفاصيل سابقة)',
              'previous',
              'legacy_backfill',
              now(),
              now()
            FROM subscribers s
            WHERE COALESCE(s.debt, 0) > 0
            AND NOT EXISTS (
              SELECT 1 FROM subscriber_debt_entries e WHERE e.subscriber_id = s.id
            )
            """
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "subscriber_debt_entries" in insp.get_table_names():
        op.drop_index(op.f("ix_subscriber_debt_entries_created_by_user_id"), table_name="subscriber_debt_entries")
        op.drop_index(op.f("ix_subscriber_debt_entries_subscriber_id"), table_name="subscriber_debt_entries")
        op.drop_index(op.f("ix_subscriber_debt_entries_id"), table_name="subscriber_debt_entries")
        op.drop_table("subscriber_debt_entries")
