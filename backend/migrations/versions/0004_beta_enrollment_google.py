"""beta enrollment tokens and google auth

Revision ID: 0004_beta_enrollment_google
Revises: 0003_subscription_onboarding
Create Date: 2026-07-03

"""
from alembic import op
import sqlalchemy as sa


revision = "0004_beta_enrollment_google"
down_revision = "0003_subscription_onboarding"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "users" in inspector.get_table_names():
        user_cols = {c["name"] for c in inspector.get_columns("users")}
        if "google_id" not in user_cols:
            with op.batch_alter_table("users", schema=None) as batch_op:
                batch_op.add_column(sa.Column("google_id", sa.String(128), nullable=True))
            op.create_index("ix_users_google_id", "users", ["google_id"], unique=True)

    if "beta_leads" in inspector.get_table_names():
        lead_cols = {c["name"] for c in inspector.get_columns("beta_leads")}
        with op.batch_alter_table("beta_leads", schema=None) as batch_op:
            if "enrollment_token_hash" not in lead_cols:
                batch_op.add_column(sa.Column("enrollment_token_hash", sa.String(128), nullable=True))
            if "enrollment_expires_at" not in lead_cols:
                batch_op.add_column(sa.Column("enrollment_expires_at", sa.DateTime(), nullable=True))
            if "enrollment_used_at" not in lead_cols:
                batch_op.add_column(sa.Column("enrollment_used_at", sa.DateTime(), nullable=True))


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "beta_leads" in inspector.get_table_names():
        lead_cols = {c["name"] for c in inspector.get_columns("beta_leads")}
        with op.batch_alter_table("beta_leads", schema=None) as batch_op:
            for col in ("enrollment_used_at", "enrollment_expires_at", "enrollment_token_hash"):
                if col in lead_cols:
                    batch_op.drop_column(col)

    if "users" in inspector.get_table_names():
        user_cols = {c["name"] for c in inspector.get_columns("users")}
        if "google_id" in user_cols:
            op.drop_index("ix_users_google_id", table_name="users")
            with op.batch_alter_table("users", schema=None) as batch_op:
                batch_op.drop_column("google_id")