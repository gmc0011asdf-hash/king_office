"""ftth_external_data: حقول بوابة FTTH الكاملة (هاتف، عنوان، اشتراك، خامات JSON)

Revision ID: e7a1f9c2d4b8
Revises: c4f0a2b8d1e3
Create Date: 2026-03-30

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e7a1f9c2d4b8"
down_revision: Union[str, None] = "c4f0a2b8d1e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c["name"] for c in insp.get_columns("ftth_external_data")}
    add: list[tuple[str, sa.Column]] = [
        ("secondary_phone", sa.Column("secondary_phone", sa.String(length=100), nullable=True)),
        ("email", sa.Column("email", sa.String(length=255), nullable=True)),
        ("customer_type", sa.Column("customer_type", sa.String(length=255), nullable=True)),
        ("fdt", sa.Column("fdt", sa.String(length=200), nullable=True)),
        ("bundle", sa.Column("bundle", sa.String(length=500), nullable=True)),
        ("address", sa.Column("address", sa.Text(), nullable=True)),
        ("governorate", sa.Column("governorate", sa.String(length=255), nullable=True)),
        ("district", sa.Column("district", sa.String(length=255), nullable=True)),
        ("sub_district", sa.Column("sub_district", sa.String(length=255), nullable=True)),
        ("neighborhood", sa.Column("neighborhood", sa.String(length=255), nullable=True)),
        ("street", sa.Column("street", sa.String(length=500), nullable=True)),
        ("house", sa.Column("house", sa.String(length=255), nullable=True)),
        ("gps_latitude", sa.Column("gps_latitude", sa.Numeric(12, 8), nullable=True)),
        ("gps_longitude", sa.Column("gps_longitude", sa.Numeric(12, 8), nullable=True)),
        ("onu_serial", sa.Column("onu_serial", sa.String(length=255), nullable=True)),
        ("ip_address", sa.Column("ip_address", sa.String(length=100), nullable=True)),
        ("mac_address", sa.Column("mac_address", sa.String(length=100), nullable=True)),
        ("has_active_session", sa.Column("has_active_session", sa.Boolean(), nullable=True)),
        (
            "active_session_started_at",
            sa.Column("active_session_started_at", sa.DateTime(timezone=True), nullable=True),
        ),
        ("usr_referral_code", sa.Column("usr_referral_code", sa.String(length=255), nullable=True)),
        ("partner_name", sa.Column("partner_name", sa.String(length=500), nullable=True)),
        ("is_pending", sa.Column("is_pending", sa.Boolean(), nullable=True)),
        ("is_trial", sa.Column("is_trial", sa.Boolean(), nullable=True)),
        ("raw_customer_json", sa.Column("raw_customer_json", postgresql.JSONB(), nullable=True)),
        ("raw_detail_json", sa.Column("raw_detail_json", postgresql.JSONB(), nullable=True)),
        ("raw_subscription_json", sa.Column("raw_subscription_json", postgresql.JSONB(), nullable=True)),
    ]
    for name, col in add:
        if name not in cols:
            op.add_column("ftth_external_data", col)


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c["name"] for c in insp.get_columns("ftth_external_data")}
    for name in (
        "raw_subscription_json",
        "raw_detail_json",
        "raw_customer_json",
        "is_trial",
        "is_pending",
        "partner_name",
        "usr_referral_code",
        "active_session_started_at",
        "has_active_session",
        "mac_address",
        "ip_address",
        "onu_serial",
        "gps_longitude",
        "gps_latitude",
        "house",
        "street",
        "neighborhood",
        "sub_district",
        "district",
        "governorate",
        "address",
        "bundle",
        "fdt",
        "customer_type",
        "email",
        "secondary_phone",
    ):
        if name in cols:
            op.drop_column("ftth_external_data", name)
