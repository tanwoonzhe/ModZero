"""Add launch_code columns to access_sessions for ZTNA gateway mode.

Revision ID: j0k1l2m3n4o5
Revises: i9j0k1l2m3n4
Create Date: 2026-05-26 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "j0k1l2m3n4o5"
down_revision = "i9j0k1l2m3n4"
branch_labels = None
depends_on = None


def _column_exists(connection, table: str, column: str) -> bool:
    result = connection.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
        f"WHERE table_name='{table}' AND column_name='{column}')"
    ))
    return result.scalar()


def upgrade() -> None:
    bind = op.get_bind()

    if not _column_exists(bind, "access_sessions", "launch_code_hash"):
        op.add_column("access_sessions", sa.Column("launch_code_hash", sa.String(64), nullable=True))
    if not _column_exists(bind, "access_sessions", "launch_code_expires_at"):
        op.add_column("access_sessions", sa.Column("launch_code_expires_at", sa.DateTime(timezone=True), nullable=True))
    if not _column_exists(bind, "access_sessions", "launch_code_used"):
        op.add_column("access_sessions", sa.Column("launch_code_used", sa.Boolean(), nullable=True, server_default="false"))


def downgrade() -> None:
    bind = op.get_bind()

    if _column_exists(bind, "access_sessions", "launch_code_used"):
        op.drop_column("access_sessions", "launch_code_used")
    if _column_exists(bind, "access_sessions", "launch_code_expires_at"):
        op.drop_column("access_sessions", "launch_code_expires_at")
    if _column_exists(bind, "access_sessions", "launch_code_hash"):
        op.drop_column("access_sessions", "launch_code_hash")
