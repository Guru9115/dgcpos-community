"""Marketplace posts — cross-store product listings

Revision ID: 0007_marketplace_posts
Revises: 0006_payables_table
Create Date: 2026-07-05

"""
from alembic import op
import sqlalchemy as sa


revision = "0007_marketplace_posts"
down_revision = "0006_payables_table"
branch_labels = None
depends_on = None


def _has_table(bind, name):
    return name in sa.inspect(bind).get_table_names()


def upgrade():
    bind = op.get_bind()
    if _has_table(bind, "marketplace_posts"):
        return

    op.create_table(
        "marketplace_posts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("price", sa.Numeric(12, 2), server_default="0"),
        sa.Column("image_url", sa.String(500)),
        sa.Column("visibility", sa.String(20), server_default="public"),
        sa.Column("status", sa.String(20), server_default="active"),
        sa.Column("created_at", sa.DateTime()),
        sa.Column("updated_at", sa.DateTime()),
    )
    op.create_index("ix_marketplace_posts_account_id", "marketplace_posts", ["account_id"])
    op.create_index("ix_marketplace_posts_feed", "marketplace_posts", ["visibility", "status", "created_at"])


def downgrade():
    bind = op.get_bind()
    if _has_table(bind, "marketplace_posts"):
        op.drop_table("marketplace_posts")