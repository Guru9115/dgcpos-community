"""Payables table — rent, salary, utilities month-wise

Revision ID: 0006_payables_table
Revises: 0005_dsr_register_tables
Create Date: 2026-07-05

"""
from alembic import op
import sqlalchemy as sa


revision = "0006_payables_table"
down_revision = "0005_dsr_register_tables"
branch_labels = None
depends_on = None


def _has_table(bind, name):
    return name in sa.inspect(bind).get_table_names()


def upgrade():
    bind = op.get_bind()
    if _has_table(bind, "payables"):
        return

    op.create_table(
        "payables",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("payee_name", sa.String(200), nullable=False),
        sa.Column("category", sa.String(64), server_default="other"),
        sa.Column("amount_due", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("amount_paid", sa.Numeric(14, 2), server_default="0"),
        sa.Column("due_date", sa.Date()),
        sa.Column("paid_date", sa.Date()),
        sa.Column("payment_method", sa.String(30), server_default="cash"),
        sa.Column("status", sa.String(20), server_default="pending"),
        sa.Column("notes", sa.Text()),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime()),
        sa.Column("updated_at", sa.DateTime()),
    )
    op.create_index("ix_payables_month_year", "payables", ["month", "year"])
    op.create_index("ix_payables_status", "payables", ["status"])


def downgrade():
    bind = op.get_bind()
    if _has_table(bind, "payables"):
        op.drop_table("payables")