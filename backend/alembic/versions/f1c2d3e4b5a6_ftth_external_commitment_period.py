"""ftth_external_data: commitment_period

Revision ID: f1c2d3e4b5a6
Revises: e7a1f9c2d4b8
Create Date: 2026-03-31

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f1c2d3e4b5a6"
down_revision: Union[str, None] = "e7a1f9c2d4b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c["name"] for c in insp.get_columns("ftth_external_data")}
    if "commitment_period" not in cols:
        op.add_column(
            "ftth_external_data",
            sa.Column("commitment_period", sa.Integer(), nullable=True),
        )


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c["name"] for c in insp.get_columns("ftth_external_data")}
    if "commitment_period" in cols:
        op.drop_column("ftth_external_data", "commitment_period")
