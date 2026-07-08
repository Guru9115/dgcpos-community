"""User security_epoch for JWT session revocation

Revision ID: 0015_user_security_epoch
Revises: 0014_hospitality_core
"""
from alembic import op
import sqlalchemy as sa

revision = "0015_user_security_epoch"
down_revision = "0013_bazaar_ad_images"
branch_labels = None
depends_on = None


def _has_column(bind, table, column):
    insp = sa.inspect(bind)
    if table not in insp.get_table_names():
        return False
    return column in [c["name"] for c in insp.get_columns(table)]


def upgrade():
    bind = op.get_bind()
    if not _has_column(bind, "users", "security_epoch"):
        op.add_column(
            "users",
            sa.Column("security_epoch", sa.Integer(), nullable=False, server_default="0"),
        )


def downgrade():
    bind = op.get_bind()
    if _has_column(bind, "users", "security_epoch"):
        op.drop_column("users", "security_epoch")