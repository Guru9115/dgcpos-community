"""Marketplace likes and orders — social commerce

Revision ID: 0008_marketplace_commerce
Revises: 0007_marketplace_posts
Create Date: 2026-07-05

"""
from alembic import op
import sqlalchemy as sa


revision = "0008_marketplace_commerce"
down_revision = "0007_marketplace_posts"
branch_labels = None
depends_on = None


def _has_table(bind, name):
    return name in sa.inspect(bind).get_table_names()


def upgrade():
    bind = op.get_bind()
    if not _has_table(bind, "marketplace_likes"):
        op.create_table(
            "marketplace_likes",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("post_id", sa.Integer(), sa.ForeignKey("marketplace_posts.id"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id"), nullable=True),
            sa.Column("created_at", sa.DateTime()),
        )
        op.create_index("ix_marketplace_likes_post_id", "marketplace_likes", ["post_id"])
        op.create_index("ix_marketplace_likes_user_id", "marketplace_likes", ["user_id"])
        op.create_unique_constraint("uq_marketplace_like_post_user", "marketplace_likes", ["post_id", "user_id"])

    if not _has_table(bind, "marketplace_orders"):
        op.create_table(
            "marketplace_orders",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("order_number", sa.String(32), nullable=False),
            sa.Column("post_id", sa.Integer(), sa.ForeignKey("marketplace_posts.id"), nullable=False),
            sa.Column("buyer_account_id", sa.Integer(), sa.ForeignKey("accounts.id"), nullable=False),
            sa.Column("buyer_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("seller_account_id", sa.Integer(), sa.ForeignKey("accounts.id"), nullable=False),
            sa.Column("quantity", sa.Integer(), server_default="1"),
            sa.Column("unit_price", sa.Numeric(12, 2), server_default="0"),
            sa.Column("total_amount", sa.Numeric(12, 2), server_default="0"),
            sa.Column("message", sa.Text()),
            sa.Column("delivery_address", sa.Text()),
            sa.Column("delivery_phone", sa.String(32)),
            sa.Column("status", sa.String(20), server_default="pending"),
            sa.Column("delivery_order_id", sa.Integer(), sa.ForeignKey("delivery_orders.id"), nullable=True),
            sa.Column("messenger_thread_id", sa.Integer(), sa.ForeignKey("messenger_threads.id"), nullable=True),
            sa.Column("created_at", sa.DateTime()),
            sa.Column("updated_at", sa.DateTime()),
            sa.Column("accepted_at", sa.DateTime()),
            sa.Column("delivered_at", sa.DateTime()),
        )
        op.create_index("ix_marketplace_orders_order_number", "marketplace_orders", ["order_number"], unique=True)
        op.create_index("ix_marketplace_orders_post_id", "marketplace_orders", ["post_id"])
        op.create_index("ix_marketplace_orders_buyer", "marketplace_orders", ["buyer_account_id"])
        op.create_index("ix_marketplace_orders_seller", "marketplace_orders", ["seller_account_id"])


def downgrade():
    bind = op.get_bind()
    if _has_table(bind, "marketplace_orders"):
        op.drop_table("marketplace_orders")
    if _has_table(bind, "marketplace_likes"):
        op.drop_table("marketplace_likes")