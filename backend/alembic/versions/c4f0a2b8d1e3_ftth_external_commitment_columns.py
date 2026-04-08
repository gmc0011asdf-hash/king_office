"""ftth_external_data: commitment_days, commitment_label

Revision ID: c4f0a2b8d1e3
Revises: b2c8e1f4a3b9
Create Date: 2026-03-30

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c4f0a2b8d1e3"
down_revision: Union[str, None] = "b2c8e1f4a3b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c["name"] for c in insp.get_columns("ftth_external_data")}
    if "commitment_days" not in cols:
        op.add_column(
            "ftth_external_data",
            sa.Column("commitment_days", sa.Integer(), nullable=True),
        )
    if "commitment_label" not in cols:
        op.add_column(
            "ftth_external_data",
            sa.Column("commitment_label", sa.String(length=255), nullable=True),
        )


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c["name"] for c in insp.get_columns("ftth_external_data")}
    if "commitment_label" in cols:
        op.drop_column("ftth_external_data", "commitment_label")
    if "commitment_days" in cols:
        op.drop_column("ftth_external_data", "commitment_days")
