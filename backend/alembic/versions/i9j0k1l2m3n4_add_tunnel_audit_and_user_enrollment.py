"""Add tunnel_access_audit_logs and tunnel_user_enrollment_logs tables.

Revision ID: i9j0k1l2m3n4
Revises: h8i9j0k1l2m3
Create Date: 2026-05-20 00:00:02.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "i9j0k1l2m3n4"
down_revision = "h8i9j0k1l2m3"
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

    if not _table_exists(bind, "tunnel_access_audit_logs"):
        op.create_table(
            "tunnel_access_audit_logs",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("action", sa.String(length=64), nullable=False),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("device_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("resource_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("connector_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("access_log_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("safe_message", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True),
                      nullable=False, server_default=sa.text("now()")),
            sa.ForeignKeyConstraint(["user_id"], ["users.user_id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["device_id"], ["devices.device_id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["resource_id"], ["protected_resources.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["connector_id"], ["connectors.connector_id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["access_log_id"], ["access_request_logs.id"], ondelete="SET NULL"),
        )
        op.create_index("ix_tunnel_access_audit_logs_action", "tunnel_access_audit_logs", ["action"])
        op.create_index("ix_tunnel_access_audit_logs_user_id", "tunnel_access_audit_logs", ["user_id"])
        op.create_index("ix_tunnel_access_audit_logs_resource_id", "tunnel_access_audit_logs", ["resource_id"])
        op.create_index("ix_tunnel_access_audit_logs_created_at", "tunnel_access_audit_logs", ["created_at"])

    if not _table_exists(bind, "tunnel_user_enrollment_logs"):
        op.create_table(
            "tunnel_user_enrollment_logs",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("device_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("node_name", sa.String(length=255), nullable=True),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True),
                      nullable=False, server_default=sa.text("now()")),
            sa.ForeignKeyConstraint(["user_id"], ["users.user_id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["device_id"], ["devices.device_id"], ondelete="SET NULL"),
        )
        op.create_index("ix_tunnel_user_enrollment_logs_user_id", "tunnel_user_enrollment_logs", ["user_id"])


def downgrade() -> None:
    bind = op.get_bind()
    if _table_exists(bind, "tunnel_user_enrollment_logs"):
        op.drop_index("ix_tunnel_user_enrollment_logs_user_id", table_name="tunnel_user_enrollment_logs")
        op.drop_table("tunnel_user_enrollment_logs")
    if _table_exists(bind, "tunnel_access_audit_logs"):
        for idx in ("ix_tunnel_access_audit_logs_created_at",
                    "ix_tunnel_access_audit_logs_resource_id",
                    "ix_tunnel_access_audit_logs_user_id",
                    "ix_tunnel_access_audit_logs_action"):
            op.drop_index(idx, table_name="tunnel_access_audit_logs")
        op.drop_table("tunnel_access_audit_logs")
