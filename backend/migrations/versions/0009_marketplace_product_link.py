"""Link marketplace posts to POS inventory products

Revision ID: 0009_marketplace_product_link
Revises: 0008_marketplace_commerce
Create Date: 2026-07-05

"""
from alembic import op
import sqlalchemy as sa


revision = "0009_marketplace_product_link"
down_revision = "0008_marketplace_commerce"
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
    if _has_table(bind, "marketplace_posts") and not _has_column(bind, "marketplace_posts", "product_id"):
        op.add_column("marketplace_posts", sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), nullable=True))
        op.create_index("ix_marketplace_posts_product_id", "marketplace_posts", ["product_id"])


def downgrade():
    bind = op.get_bind()
    if _has_column(bind, "marketplace_posts", "product_id"):
        op.drop_index("ix_marketplace_posts_product_id", table_name="marketplace_posts")
        op.drop_column("marketplace_posts", "product_id")