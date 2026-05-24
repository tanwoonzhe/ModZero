"""Add tunnel_bootstrap_logs (manual WireGuard join audit trail).

Stores one row per non-disabled bootstrap invocation. The raw preauth key is
NEVER stored — only sha256(key) hex when an `headscale_api` key is created.

Revision ID: f6g7h8i9j0k1
Revises: e5f6g7h8i9j0
Create Date: 2026-05-20 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "f6g7h8i9j0k1"
down_revision = "e5f6g7h8i9j0"
branch_labels = None
depends_on = None


def _table_exists(connection, table: str) -> bool:
    result = connection.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
        f"WHERE table_name='{table}')"
    ))
    return result.scalar()


def upgrade() -> None:
    bind = op.get_bind()

    if not _table_exists(bind, "tunnel_bootstrap_logs"):
        op.create_table(
            "tunnel_bootstrap_logs",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("connector_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("requested_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("node_name", sa.String(length=256), nullable=False),
            sa.Column("auth_key_hash", sa.String(length=128), nullable=True),
            sa.Column("auth_key_mode", sa.String(length=32), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(
                ["connector_id"], ["connectors.connector_id"],
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["requested_by_user_id"], ["users.user_id"],
                ondelete="SET NULL",
            ),
        )
        op.create_index(
            "ix_tunnel_bootstrap_logs_connector_id",
            "tunnel_bootstrap_logs",
            ["connector_id"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    if _table_exists(bind, "tunnel_bootstrap_logs"):
        op.drop_index(
            "ix_tunnel_bootstrap_logs_connector_id",
            table_name="tunnel_bootstrap_logs",
        )
        op.drop_table("tunnel_bootstrap_logs")
