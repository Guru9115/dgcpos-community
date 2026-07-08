"""DSR Register tables — daily sales, purchases, fixed costs

Revision ID: 0005_dsr_register_tables
Revises: 0004_beta_enrollment_google
Create Date: 2026-07-05

"""
from alembic import op
import sqlalchemy as sa


revision = "0005_dsr_register_tables"
down_revision = "0004_beta_enrollment_google"
branch_labels = None
depends_on = None


def _has_table(bind, name):
    return name in sa.inspect(bind).get_table_names()


def upgrade():
    bind = op.get_bind()

    if not _has_table(bind, "dsr_entries"):
        op.create_table(
            "dsr_entries",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("entry_date", sa.Date(), nullable=False),
            sa.Column("cash_sales", sa.Numeric(14, 2), server_default="0"),
            sa.Column("card_sales", sa.Numeric(14, 2), server_default="0"),
            sa.Column("online_sales", sa.Numeric(14, 2), server_default="0"),
            sa.Column("other_sales", sa.Numeric(14, 2), server_default="0"),
            sa.Column("notes", sa.Text()),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id")),
            sa.Column("created_at", sa.DateTime()),
        )
        op.create_index("ix_dsr_entries_entry_date", "dsr_entries", ["entry_date"])

    if not _has_table(bind, "dsr_purchases"):
        op.create_table(
            "dsr_purchases",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("purchase_date", sa.Date(), nullable=False),
            sa.Column("supplier_name", sa.String(200)),
            sa.Column("category", sa.String(100)),
            sa.Column("amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
            sa.Column("payment_method", sa.String(30), server_default="cash"),
            sa.Column("invoice_ref", sa.String(64)),
            sa.Column("notes", sa.Text()),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id")),
            sa.Column("created_at", sa.DateTime()),
        )
        op.create_index("ix_dsr_purchases_purchase_date", "dsr_purchases", ["purchase_date"])

    if not _has_table(bind, "dsr_fixed_costs"):
        op.create_table(
            "dsr_fixed_costs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("month", sa.Integer(), nullable=False),
            sa.Column("year", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("category", sa.String(64), server_default="other"),
            sa.Column("amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
            sa.Column("notes", sa.Text()),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id")),
            sa.Column("created_at", sa.DateTime()),
        )
        op.create_index("ix_dsr_fixed_costs_month_year", "dsr_fixed_costs", ["month", "year"])


def downgrade():
    bind = op.get_bind()
    if _has_table(bind, "dsr_fixed_costs"):
        op.drop_table("dsr_fixed_costs")
    if _has_table(bind, "dsr_purchases"):
        op.drop_table("dsr_purchases")
    if _has_table(bind, "dsr_entries"):
        op.drop_table("dsr_entries")