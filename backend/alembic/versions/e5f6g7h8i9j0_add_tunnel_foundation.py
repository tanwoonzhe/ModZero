"""Phase 3 scaffold: tunnel_nodes + tunnel_routes (Headscale / WireGuard foundation).

These tables hold metadata only. They are not consulted by the access decision
or the HTTP proxy this milestone. When HEADSCALE_ENABLED=false (default) they
stay empty.

Revision ID: e5f6g7h8i9j0
Revises: d4e5f6g7h8i9
Create Date: 2026-05-20 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = 'e5f6g7h8i9j0'
down_revision = 'd4e5f6g7h8i9'
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

    if not _table_exists(bind, "tunnel_nodes"):
        op.create_table(
            "tunnel_nodes",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("connector_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("node_name", sa.String(length=256), nullable=False),
            sa.Column("node_key", sa.String(length=512), nullable=True),
            sa.Column("wireguard_ip", sa.String(length=64), nullable=True),
            sa.Column("headscale_node_id", sa.String(length=128), nullable=True),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
            sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.ForeignKeyConstraint(
                ["connector_id"], ["connectors.connector_id"],
                ondelete="CASCADE",
            ),
            sa.UniqueConstraint("connector_id", "node_name", name="uq_tunnel_nodes_connector_node"),
        )
        op.create_index("ix_tunnel_nodes_connector_id", "tunnel_nodes", ["connector_id"])

    if not _table_exists(bind, "tunnel_routes"):
        op.create_table(
            "tunnel_routes",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("connector_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("resource_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("subnet_or_host", sa.String(length=256), nullable=False),
            sa.Column("route_type", sa.String(length=16), nullable=False, server_default="host"),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.ForeignKeyConstraint(
                ["connector_id"], ["connectors.connector_id"],
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["resource_id"], ["protected_resources.id"],
                ondelete="SET NULL",
            ),
        )
        op.create_index("ix_tunnel_routes_connector_id", "tunnel_routes", ["connector_id"])


def downgrade() -> None:
    bind = op.get_bind()
    if _table_exists(bind, "tunnel_routes"):
        op.drop_index("ix_tunnel_routes_connector_id", table_name="tunnel_routes")
        op.drop_table("tunnel_routes")
    if _table_exists(bind, "tunnel_nodes"):
        op.drop_index("ix_tunnel_nodes_connector_id", table_name="tunnel_nodes")
        op.drop_table("tunnel_nodes")
