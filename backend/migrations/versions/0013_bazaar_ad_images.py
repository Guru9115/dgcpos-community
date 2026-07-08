"""Bazaar ad — multiple images per banner

Revision ID: 0013_bazaar_ad_images
Revises: 0012_bazaar_guest_orders
"""
from alembic import op
import sqlalchemy as sa

revision = "0013_bazaar_ad_images"
down_revision = "0012_bazaar_guest_orders"
branch_labels = None
depends_on = None


def _has_column(bind, table, column):
    insp = sa.inspect(bind)
    return column in [c["name"] for c in insp.get_columns(table)]


def upgrade():
    bind = op.get_bind()
    if not _has_column(bind, "bazaar_ads", "extra_images"):
        op.add_column("bazaar_ads", sa.Column("extra_images", sa.Text(), nullable=True))


def downgrade():
    bind = op.get_bind()
    if _has_column(bind, "bazaar_ads", "extra_images"):
        op.drop_column("bazaar_ads", "extra_images")