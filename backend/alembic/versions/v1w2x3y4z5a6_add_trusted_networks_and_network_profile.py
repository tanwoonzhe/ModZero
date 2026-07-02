"""add trusted_networks to trust_policy_config and network_profile to posture_reports

Revision ID: v1w2x3y4z5a6
Revises: u0v1w2x3y4z5
Create Date: 2026-07-03

"""
from alembic import op
import sqlalchemy as sa

revision = 'v1w2x3y4z5a6'
down_revision = 'u0v1w2x3y4z5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'trust_policy_config',
        sa.Column('trusted_networks', sa.JSON(), nullable=True),
    )
    op.add_column(
        'posture_reports',
        sa.Column('network_profile', sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('posture_reports', 'network_profile')
    op.drop_column('trust_policy_config', 'trusted_networks')
