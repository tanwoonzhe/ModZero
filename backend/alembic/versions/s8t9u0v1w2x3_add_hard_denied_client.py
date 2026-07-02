"""add hard_denied_client / hard_deny_client_reason to device_trust_scores

Revision ID: s8t9u0v1w2x3
Revises: r7s8t9u0v1w2
Create Date: 2026-07-03

"""
from alembic import op
import sqlalchemy as sa

revision = 's8t9u0v1w2x3'
down_revision = 'r7s8t9u0v1w2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'device_trust_scores',
        sa.Column('hard_denied_client', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        'device_trust_scores',
        sa.Column('hard_deny_client_reason', sa.String(length=256), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('device_trust_scores', 'hard_deny_client_reason')
    op.drop_column('device_trust_scores', 'hard_denied_client')
