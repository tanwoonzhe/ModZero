"""add blocked_ips to trust_policy_config

Revision ID: u0v1w2x3y4z5
Revises: t9u0v1w2x3y4
Create Date: 2026-07-03

"""
from alembic import op
import sqlalchemy as sa

revision = 'u0v1w2x3y4z5'
down_revision = 't9u0v1w2x3y4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'trust_policy_config',
        sa.Column('blocked_ips', sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('trust_policy_config', 'blocked_ips')
