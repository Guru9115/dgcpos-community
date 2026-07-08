"""Add bazaar_category to marketplace posts

Revision ID: 0011_marketplace_bazaar_category
Revises: 0010_bazaar_ads
Create Date: 2026-07-06

"""
from alembic import op
import sqlalchemy as sa


revision = "0011_marketplace_bazaar_category"
down_revision = "0009_marketplace_product_link"
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
    if _has_table(bind, "marketplace_posts") and not _has_column(bind, "marketplace_posts", "bazaar_category"):
        op.add_column(
            "marketplace_posts",
            sa.Column("bazaar_category", sa.String(32), nullable=True),
        )
        op.create_index("ix_marketplace_posts_bazaar_category", "marketplace_posts", ["bazaar_category"])


def downgrade():
    bind = op.get_bind()
    if _has_column(bind, "marketplace_posts", "bazaar_category"):
        op.drop_index("ix_marketplace_posts_bazaar_category", table_name="marketplace_posts")
        op.drop_column("marketplace_posts", "bazaar_category")