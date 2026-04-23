"""Add location column to remote_networks

Revision ID: c3d4e5f6g7h8
Revises: b2c3d4e5f6g7
Create Date: 2026-04-24 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'c3d4e5f6g7h8'
down_revision = 'b2c3d4e5f6g7'
branch_labels = None
depends_on = None


def _column_exists(connection, table: str, column: str) -> bool:
    result = connection.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
        f"WHERE table_name='{table}' AND column_name='{column}')"
    ))
    return result.scalar()


def upgrade() -> None:
    connection = op.get_bind()

    # remote_networks missing columns
    if not _column_exists(connection, 'remote_networks', 'location'):
        op.add_column('remote_networks', sa.Column('location', sa.String(128), nullable=True))
    if not _column_exists(connection, 'remote_networks', 'connector_name'):
        op.add_column('remote_networks', sa.Column('connector_name', sa.String(128), nullable=True))
    if not _column_exists(connection, 'remote_networks', 'connector_count'):
        op.add_column('remote_networks', sa.Column('connector_count', sa.Integer(), nullable=True, server_default='0'))

    # resources missing columns
    if not _column_exists(connection, 'resources', 'resource_type'):
        op.add_column('resources', sa.Column('resource_type', sa.String(64), nullable=True, server_default='server'))
    if not _column_exists(connection, 'resources', 'ip_address'):
        op.add_column('resources', sa.Column('ip_address', sa.String(64), nullable=True))
    if not _column_exists(connection, 'resources', 'port'):
        op.add_column('resources', sa.Column('port', sa.Numeric(), nullable=True))


def downgrade() -> None:
    op.drop_column('remote_networks', 'connector_count')
    op.drop_column('remote_networks', 'connector_name')
    op.drop_column('remote_networks', 'location')
    op.drop_column('resources', 'port')
    op.drop_column('resources', 'ip_address')
    op.drop_column('resources', 'resource_type')
