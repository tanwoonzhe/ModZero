"""add av_advanced_protection and client_version to posture_reports

Revision ID: t9u0v1w2x3y4
Revises: s8t9u0v1w2x3
Create Date: 2026-07-03

"""
from alembic import op
import sqlalchemy as sa

revision = 't9u0v1w2x3y4'
down_revision = 's8t9u0v1w2x3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'posture_reports',
        sa.Column('av_advanced_protection', sa.Boolean(), nullable=True),
    )
    op.add_column(
        'posture_reports',
        sa.Column('client_version', sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('posture_reports', 'client_version')
    op.drop_column('posture_reports', 'av_advanced_protection')
