"""Add tunnel-aware access policy columns.

Adds preferred_access_mode, require_tunnel, allow_http_fallback to protected_resources.
Adds access_mode, tunnel_ready, tunnel_reason, fallback_used,
require_tunnel_at_decision to access_request_logs.

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
Create Date: 2026-05-20 00:00:01.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "h8i9j0k1l2m3"
down_revision = "g7h8i9j0k1l2"
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

    if not _column_exists(bind, "protected_resources", "preferred_access_mode"):
        op.add_column("protected_resources",
            sa.Column("preferred_access_mode", sa.String(length=32),
                      nullable=False, server_default="auto"))
    if not _column_exists(bind, "protected_resources", "require_tunnel"):
        op.add_column("protected_resources",
            sa.Column("require_tunnel", sa.Boolean(), nullable=False,
                      server_default=sa.text("false")))
    if not _column_exists(bind, "protected_resources", "allow_http_fallback"):
        op.add_column("protected_resources",
            sa.Column("allow_http_fallback", sa.Boolean(), nullable=False,
                      server_default=sa.text("true")))

    for col, type_ in (
        ("access_mode", sa.String(length=32)),
        ("tunnel_ready", sa.Boolean()),
        ("tunnel_reason", sa.String(length=255)),
        ("fallback_used", sa.Boolean()),
        ("require_tunnel_at_decision", sa.Boolean()),
    ):
        if not _column_exists(bind, "access_request_logs", col):
            op.add_column("access_request_logs",
                sa.Column(col, type_, nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    for col in ("require_tunnel_at_decision", "fallback_used", "tunnel_reason",
                "tunnel_ready", "access_mode"):
        if _column_exists(bind, "access_request_logs", col):
            op.drop_column("access_request_logs", col)
    for col in ("allow_http_fallback", "require_tunnel", "preferred_access_mode"):
        if _column_exists(bind, "protected_resources", col):
            op.drop_column("protected_resources", col)
