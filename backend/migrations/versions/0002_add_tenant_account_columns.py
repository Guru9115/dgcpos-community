"""add tenant account_id columns to core tables

Revision ID: 0002_tenant_account_columns
Revises: 0001_account_lockout
Create Date: 2026-06-28

"""
from alembic import op
import sqlalchemy as sa


revision = "0002_tenant_account_columns"
down_revision = "0001_account_lockout"
branch_labels = None
depends_on = None


def _has_column(bind, table_name, column_name):
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns(table_name)}
    return column_name in columns


def _add_column_if_missing(table_name, column):
    bind = op.get_bind()
    if not _has_column(bind, table_name, column.name):
        with op.batch_alter_table(table_name, schema=None) as batch_op:
            batch_op.add_column(column)


def _drop_column_if_exists(table_name, column_name):
    bind = op.get_bind()
    if _has_column(bind, table_name, column_name):
        with op.batch_alter_table(table_name, schema=None) as batch_op:
            batch_op.drop_column(column_name)


def upgrade():
    _add_column_if_missing("products", sa.Column("account_id", sa.Integer(), nullable=True))
    _add_column_if_missing("customers", sa.Column("account_id", sa.Integer(), nullable=True))
    _add_column_if_missing("sales", sa.Column("account_id", sa.Integer(), nullable=True))
    _add_column_if_missing("purchases", sa.Column("account_id", sa.Integer(), nullable=True))
    _add_column_if_missing("settings", sa.Column("account_id", sa.Integer(), nullable=True))
    _add_column_if_missing("product_variants", sa.Column("account_id", sa.Integer(), nullable=True))


def downgrade():
    _drop_column_if_exists("product_variants", "account_id")
    _drop_column_if_exists("settings", "account_id")
    _drop_column_if_exists("purchases", "account_id")
    _drop_column_if_exists("sales", "account_id")
    _drop_column_if_exists("customers", "account_id")
    _drop_column_if_exists("products", "account_id")
