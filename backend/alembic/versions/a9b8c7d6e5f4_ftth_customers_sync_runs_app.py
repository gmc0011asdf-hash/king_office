"""ftth_customers + ftth_sync_runs + ftth_sync_run_items (قاعدة التطبيق الرئيسية)

Revision ID: a9b8c7d6e5f4
Revises: f1c2d3e4b5a6
Create Date: 2026-04-01

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a9b8c7d6e5f4"
down_revision: Union[str, None] = "a1b2c3d4e5f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    tables = insp.get_table_names()

    if "ftth_customers" not in tables:
        op.create_table(
            "ftth_customers",
            sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
            sa.Column("external_customer_id", sa.String(length=255), nullable=False),
            sa.Column("subscriber_id", sa.BigInteger(), nullable=True),
            sa.Column("source_system", sa.String(length=64), server_default="ftth_portal", nullable=False),
            sa.Column("raw_payload", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
            sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("import_status", sa.String(length=64), nullable=True),
            sa.Column("sync_error", sa.Text(), nullable=True),
            sa.Column("full_name", sa.Text(), nullable=True),
            sa.Column("created_at_external", sa.DateTime(timezone=True), nullable=True),
            sa.Column("customer_type", sa.String(length=255), nullable=True),
            sa.Column("phone", sa.String(length=100), nullable=True),
            sa.Column("secondary_phone", sa.String(length=100), nullable=True),
            sa.Column("email", sa.String(length=255), nullable=True),
            sa.Column("address", sa.Text(), nullable=True),
            sa.Column("governorate", sa.String(length=255), nullable=True),
            sa.Column("district", sa.String(length=255), nullable=True),
            sa.Column("sub_district", sa.String(length=255), nullable=True),
            sa.Column("gps_latitude", sa.Numeric(12, 8), nullable=True),
            sa.Column("gps_longitude", sa.Numeric(12, 8), nullable=True),
            sa.Column("subscription_status", sa.String(length=255), nullable=True),
            sa.Column("subscription_start_date", sa.DateTime(timezone=True), nullable=True),
            sa.Column("subscription_end_date", sa.DateTime(timezone=True), nullable=True),
            sa.Column("zone", sa.String(length=255), nullable=True),
            sa.Column("bundle", sa.String(length=500), nullable=True),
            sa.Column("commitment_period", sa.Text(), nullable=True),
            sa.Column("onu_username", sa.String(length=255), nullable=True),
            sa.Column("onu_serial", sa.String(length=255), nullable=True),
            sa.Column("fdt", sa.String(length=255), nullable=True),
            sa.Column("fat", sa.String(length=255), nullable=True),
            sa.Column("ip_address", sa.String(length=100), nullable=True),
            sa.Column("mac_address", sa.String(length=100), nullable=True),
            sa.Column("has_active_session", sa.Boolean(), nullable=True),
            sa.Column("active_session_started_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("phone_source", sa.String(length=100), nullable=True),
            sa.Column("address_source", sa.String(length=100), nullable=True),
            sa.Column("subscription_source", sa.String(length=100), nullable=True),
            sa.Column("raw_customer_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("raw_detail_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("raw_subscription_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("sync_status", sa.String(length=32), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.ForeignKeyConstraint(["subscriber_id"], ["subscribers.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_ftth_customers_external_customer_id"), "ftth_customers", ["external_customer_id"], unique=True)
        op.create_index(op.f("ix_ftth_customers_subscriber_id"), "ftth_customers", ["subscriber_id"], unique=False)

    if "ftth_sync_runs" not in tables:
        op.create_table(
            "ftth_sync_runs",
            sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
            sa.Column("portal_config_id", sa.BigInteger(), nullable=True),
            sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="running"),
            sa.Column("total_external_new", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("total_external_updated", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("total_ftth_customers_upserted", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("total_ftth_customers_failed", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(["portal_config_id"], ["ftth_portal_config.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_ftth_sync_runs_portal_config_id"), "ftth_sync_runs", ["portal_config_id"], unique=False)

    if "ftth_sync_run_items" not in tables:
        op.create_table(
            "ftth_sync_run_items",
            sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
            sa.Column("sync_run_id", sa.BigInteger(), nullable=False),
            sa.Column("external_customer_id", sa.String(length=255), nullable=False),
            sa.Column("ftth_external_data_id", sa.BigInteger(), nullable=True),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(["ftth_external_data_id"], ["ftth_external_data.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["sync_run_id"], ["ftth_sync_runs.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_ftth_sync_run_items_sync_run_id"), "ftth_sync_run_items", ["sync_run_id"], unique=False)
        op.create_index(op.f("ix_ftth_sync_run_items_external_customer_id"), "ftth_sync_run_items", ["external_customer_id"], unique=False)
        op.create_index(op.f("ix_ftth_sync_run_items_ftth_external_data_id"), "ftth_sync_run_items", ["ftth_external_data_id"], unique=False)


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    tables = insp.get_table_names()

    if "ftth_sync_run_items" in tables:
        op.drop_table("ftth_sync_run_items")
    if "ftth_sync_runs" in tables:
        op.drop_table("ftth_sync_runs")
    if "ftth_customers" in tables:
        op.drop_table("ftth_customers")
