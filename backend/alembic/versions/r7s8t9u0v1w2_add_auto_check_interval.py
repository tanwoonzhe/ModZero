"""add auto_check_interval_hours to trust_policy_config

Revision ID: r7s8t9u0v1w2
Revises: q6r7s8t9u0v1
Create Date: 2026-07-03

"""
from alembic import op
import sqlalchemy as sa

revision = 'r7s8t9u0v1w2'
down_revision = 'q6r7s8t9u0v1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'trust_policy_config',
        sa.Column('auto_check_interval_hours', sa.Integer(), nullable=False, server_default='0'),
    )


def downgrade() -> None:
    op.drop_column('trust_policy_config', 'auto_check_interval_hours')
