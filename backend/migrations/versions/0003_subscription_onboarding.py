"""subscription billing and onboarding tables

Revision ID: 0003_subscription_onboarding
Revises: 0002_tenant_account_columns
Create Date: 2026-07-03

"""
from alembic import op
import sqlalchemy as sa


revision = "0003_subscription_onboarding"
down_revision = "0002_tenant_account_columns"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    account_cols = {c["name"] for c in inspector.get_columns("accounts")} if "accounts" in inspector.get_table_names() else set()
    user_cols = {c["name"] for c in inspector.get_columns("users")} if "users" in inspector.get_table_names() else set()

    def add_account(col):
        if col.name not in account_cols:
            with op.batch_alter_table("accounts", schema=None) as batch_op:
                batch_op.add_column(col)

    def add_user(col):
        if col.name not in user_cols:
            with op.batch_alter_table("users", schema=None) as batch_op:
                batch_op.add_column(col)

    add_account(sa.Column("subscription_plan", sa.String(32), server_default="beta"))
    add_account(sa.Column("subscription_status", sa.String(32), server_default="trialing"))
    add_account(sa.Column("stripe_customer_id", sa.String(128), nullable=True))
    add_account(sa.Column("stripe_subscription_id", sa.String(128), nullable=True))
    add_account(sa.Column("trial_ends_at", sa.DateTime(), nullable=True))
    add_account(sa.Column("beta_enrolled_at", sa.DateTime(), nullable=True))
    add_account(sa.Column("business_type", sa.String(64), nullable=True))
    add_account(sa.Column("business_phone", sa.String(32), nullable=True))
    add_account(sa.Column("business_location", sa.String(128), nullable=True))
    add_account(sa.Column("onboarding_steps", sa.Text(), nullable=True))
    add_account(sa.Column("onboarding_completed", sa.Boolean(), server_default=sa.false()))
    add_user(sa.Column("email_verified", sa.Boolean(), server_default=sa.false()))

    if "auth_tokens" not in inspector.get_table_names():
        op.create_table(
            "auth_tokens",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("token_hash", sa.String(128), nullable=False, unique=True),
            sa.Column("purpose", sa.String(32), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("used_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )

    if "beta_leads" not in inspector.get_table_names():
        op.create_table(
            "beta_leads",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("business_name", sa.String(128), nullable=False),
            sa.Column("contact_name", sa.String(128), nullable=False),
            sa.Column("email", sa.String(120), nullable=False),
            sa.Column("phone", sa.String(32), nullable=True),
            sa.Column("business_type", sa.String(64), nullable=True),
            sa.Column("location", sa.String(128), nullable=True),
            sa.Column("message", sa.Text(), nullable=True),
            sa.Column("status", sa.String(32), server_default="new"),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )

    if "business_feedback" not in inspector.get_table_names():
        op.create_table(
            "business_feedback",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id"), nullable=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("category", sa.String(64), server_default="general"),
            sa.Column("rating", sa.Integer(), nullable=True),
            sa.Column("message", sa.Text(), nullable=False),
            sa.Column("page", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )


def downgrade():
    op.drop_table("business_feedback")
    op.drop_table("beta_leads")
    op.drop_table("auth_tokens")
    for col in [
        "onboarding_completed", "onboarding_steps", "business_location", "business_phone",
        "business_type", "beta_enrolled_at", "trial_ends_at", "stripe_subscription_id",
        "stripe_customer_id", "subscription_status", "subscription_plan",
    ]:
        with op.batch_alter_table("accounts", schema=None) as batch_op:
            batch_op.drop_column(col)
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("email_verified")