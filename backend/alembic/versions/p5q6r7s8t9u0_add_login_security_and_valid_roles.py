"""add login security fields and configurable valid roles

Revision ID: p5q6r7s8t9u0
Revises: o4p5q6r7s8t9
Create Date: 2026-07-02

"""
from alembic import op
import sqlalchemy as sa

revision = 'p5q6r7s8t9u0'
down_revision = 'o4p5q6r7s8t9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('failed_login_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('password_changed_at', sa.DateTime(timezone=True), nullable=True))
    # Best-effort backfill: we don't know the true last-changed date for
    # existing accounts, so assume it was set at account creation.
    op.execute("UPDATE users SET password_changed_at = created_at WHERE password_changed_at IS NULL")

    op.add_column('trust_policy_config', sa.Column('valid_role_ids', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('trust_policy_config', 'valid_role_ids')
    op.drop_column('users', 'password_changed_at')
    op.drop_column('users', 'locked_until')
    op.drop_column('users', 'failed_login_count')
