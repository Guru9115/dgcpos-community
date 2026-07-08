"""add account lockout fields to users

Revision ID: 0001_account_lockout
Revises:
Create Date: 2026-06-20

"""
from alembic import op
import sqlalchemy as sa

revision = '0001_account_lockout'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "users" not in inspector.get_table_names():
        return

    user_cols = {c["name"] for c in inspector.get_columns("users")}
    with op.batch_alter_table('users', schema=None) as batch_op:
        if "failed_login_count" not in user_cols:
            batch_op.add_column(sa.Column('failed_login_count', sa.Integer(), nullable=True, server_default='0'))
        if "locked_until" not in user_cols:
            batch_op.add_column(sa.Column('locked_until', sa.DateTime(), nullable=True))


def downgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('locked_until')
        batch_op.drop_column('failed_login_count')
