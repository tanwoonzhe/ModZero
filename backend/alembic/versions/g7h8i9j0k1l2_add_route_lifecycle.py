"""Add route lifecycle columns to tunnel_routes and create tunnel_route_action_logs.

Adds route_status, advertise_command, headscale_route_id, last_synced_at,
updated_at to tunnel_routes. Creates the tunnel_route_action_logs audit table.

Revision ID: g7h8i9j0k1l2
Revises: f6g7h8i9j0k1
Create Date: 2026-05-20 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "g7h8i9j0k1l2"
down_revision = "f6g7h8i9j0k1"
branch_labels = None
depends_on = None


def _table_exists(connection, table: str) -> bool:
    result = connection.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
        f"WHERE table_name='{table}')"
    ))
    return result.scalar()


def _column_exists(connection, table: str, column: str) -> bool:
    result = connection.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
        f"WHERE table_name='{table}' AND column_name='{column}')"
    ))
    return result.scalar()


def upgrade() -> None:
    bind = op.get_bind()

    if not _column_exists(bind, "tunnel_routes", "route_status"):
        op.add_column(
            "tunnel_routes",
            sa.Column(
                "route_status",
                sa.String(length=32),
                nullable=False,
                server_default="pending",
            ),
        )

    if not _column_exists(bind, "tunnel_routes", "advertise_command"):
        op.add_column(
            "tunnel_routes",
            sa.Column("advertise_command", sa.Text(), nullable=True),
        )

    if not _column_exists(bind, "tunnel_routes", "headscale_route_id"):
        op.add_column(
            "tunnel_routes",
            sa.Column("headscale_route_id", sa.String(length=128), nullable=True),
        )

    if not _column_exists(bind, "tunnel_routes", "last_synced_at"):
        op.add_column(
            "tunnel_routes",
            sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        )

    if not _column_exists(bind, "tunnel_routes", "updated_at"):
        op.add_column(
            "tunnel_routes",
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )

    if not _table_exists(bind, "tunnel_route_action_logs"):
        op.create_table(
            "tunnel_route_action_logs",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("route_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("action", sa.String(length=32), nullable=False),
            sa.Column("requested_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("result", sa.Text(), nullable=True),
            sa.Column("safe_message", sa.Text(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("now()"),
            ),
            sa.ForeignKeyConstraint(
                ["route_id"], ["tunnel_routes.id"],
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["requested_by_user_id"], ["users.user_id"],
                ondelete="SET NULL",
            ),
        )
        op.create_index(
            "ix_tunnel_route_action_logs_route_id",
            "tunnel_route_action_logs",
            ["route_id"],
        )


def downgrade() -> None:
    bind = op.get_bind()

    if _table_exists(bind, "tunnel_route_action_logs"):
        op.drop_index(
            "ix_tunnel_route_action_logs_route_id",
            table_name="tunnel_route_action_logs",
        )
        op.drop_table("tunnel_route_action_logs")

    for col in ("updated_at", "last_synced_at", "headscale_route_id",
                "advertise_command", "route_status"):
        if _column_exists(bind, "tunnel_routes", col):
            op.drop_column("tunnel_routes", col)
