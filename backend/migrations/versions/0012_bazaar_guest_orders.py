"""Guest bazaar checkout fields on marketplace orders

Revision ID: 0012_bazaar_guest_orders
Revises: 0011_marketplace_bazaar_category
Create Date: 2026-07-06

"""
from alembic import op
import sqlalchemy as sa


revision = "0012_bazaar_guest_orders"
down_revision = "0011_marketplace_bazaar_category"
branch_labels = None
depends_on = None


def _has_table(bind, name):
    return name in sa.inspect(bind).get_table_names()


def _has_column(bind, table, column):
    if not _has_table(bind, table):
        return False
    return column in {c["name"] for c in sa.inspect(bind).get_columns(table)}


def upgrade():
    bind = op.get_bind()
    if not _has_table(bind, "marketplace_orders"):
        return
    if not _has_column(bind, "marketplace_orders", "guest_name"):
        op.add_column("marketplace_orders", sa.Column("guest_name", sa.String(120), nullable=True))
    if not _has_column(bind, "marketplace_orders", "guest_email"):
        op.add_column("marketplace_orders", sa.Column("guest_email", sa.String(200), nullable=True))
    if not _has_column(bind, "marketplace_orders", "payment_method"):
        op.add_column("marketplace_orders", sa.Column("payment_method", sa.String(20), server_default="cod", nullable=True))
    if not _has_column(bind, "marketplace_orders", "is_guest"):
        op.add_column("marketplace_orders", sa.Column("is_guest", sa.Boolean(), server_default="false", nullable=True))


def downgrade():
    bind = op.get_bind()
    for col in ("is_guest", "payment_method", "guest_email", "guest_name"):
        if _has_column(bind, "marketplace_orders", col):
            op.drop_column("marketplace_orders", col)