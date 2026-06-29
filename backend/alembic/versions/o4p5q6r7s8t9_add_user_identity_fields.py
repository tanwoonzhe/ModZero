"""add user identity fields

Revision ID: o4p5q6r7s8t9
Revises: n3o4p5q6r7s8
Create Date: 2026-06-29

"""
from alembic import op
import sqlalchemy as sa

revision = 'o4p5q6r7s8t9'
down_revision = 'n3o4p5q6r7s8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('auth_provider', sa.String(16), nullable=False, server_default='local'))
    op.add_column('users', sa.Column('client_access_enabled', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('users', sa.Column('linked_entra_user_id', sa.String(128), nullable=True))
    op.add_column('users', sa.Column('linked_entra_upn', sa.String(256), nullable=True))
    op.create_unique_constraint('uq_users_linked_entra_user_id', 'users', ['linked_entra_user_id'])
    op.create_unique_constraint('uq_users_linked_entra_upn', 'users', ['linked_entra_upn'])
    op.add_column('protected_resources', sa.Column('require_entra_linked', sa.Boolean(), nullable=False, server_default='false'))

    op.execute("UPDATE users SET client_access_enabled = false WHERE role = 'ADMIN'")


def downgrade() -> None:
    op.drop_column('protected_resources', 'require_entra_linked')
    op.drop_constraint('uq_users_linked_entra_upn', 'users', type_='unique')
    op.drop_constraint('uq_users_linked_entra_user_id', 'users', type_='unique')
    op.drop_column('users', 'linked_entra_upn')
    op.drop_column('users', 'linked_entra_user_id')
    op.drop_column('users', 'client_access_enabled')
    op.drop_column('users', 'auth_provider')
