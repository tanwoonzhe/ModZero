"""Add screen_lock, client_healthy to posture_reports; identity_score to device_trust_scores

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
Create Date: 2026-05-29

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'l1m2n3o4p5q6'
down_revision = 'k1l2m3n4o5p6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new posture factor columns (nullable — existing rows default to NULL = failing)
    with op.batch_alter_table('posture_reports') as batch_op:
        batch_op.add_column(sa.Column('screen_lock_enabled', sa.Boolean(), nullable=True))
        batch_op.add_column(sa.Column('client_healthy', sa.Boolean(), nullable=True))

    # Add identity_score to trust scores (nullable — existing rows treated as 100 = full trust)
    with op.batch_alter_table('device_trust_scores') as batch_op:
        batch_op.add_column(sa.Column('identity_score', sa.Float(), nullable=True, server_default='100.0'))


def downgrade() -> None:
    with op.batch_alter_table('device_trust_scores') as batch_op:
        batch_op.drop_column('identity_score')

    with op.batch_alter_table('posture_reports') as batch_op:
        batch_op.drop_column('client_healthy')
        batch_op.drop_column('screen_lock_enabled')
