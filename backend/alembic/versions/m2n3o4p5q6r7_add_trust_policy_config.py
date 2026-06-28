"""Add trust_policy_config table

Revision ID: m2n3o4p5q6r7
Revises: l1m2n3o4p5q6
Create Date: 2026-06-22

"""
from alembic import op
import sqlalchemy as sa

revision = 'm2n3o4p5q6r7'
down_revision = 'l1m2n3o4p5q6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'trust_policy_config',
        sa.Column('config_id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('device_weight', sa.Float(), nullable=False, server_default='0.40'),
        sa.Column('context_weight', sa.Float(), nullable=False, server_default='0.30'),
        sa.Column('identity_weight', sa.Float(), nullable=False, server_default='0.30'),
        sa.Column('default_threshold', sa.Integer(), nullable=False, server_default='60'),
        sa.Column('allowed_start_hour', sa.Integer(), nullable=False, server_default='8'),
        sa.Column('allowed_end_hour', sa.Integer(), nullable=False, server_default='20'),
        sa.Column('max_failed_attempts', sa.Integer(), nullable=False, server_default='5'),
        sa.Column('block_outside_hours', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('require_known_device', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('unknown_device_penalty', sa.Integer(), nullable=False, server_default='20'),
        sa.Column('suspicious_ip_penalty', sa.Integer(), nullable=False, server_default='15'),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )
    # Insert the default singleton row
    op.execute(
        "INSERT INTO trust_policy_config (config_id, device_weight, context_weight, identity_weight, "
        "default_threshold, allowed_start_hour, allowed_end_hour, max_failed_attempts, "
        "block_outside_hours, require_known_device, unknown_device_penalty, suspicious_ip_penalty) "
        "VALUES (1, 0.40, 0.30, 0.30, 60, 8, 20, 5, false, true, 20, 15)"
    )


def downgrade() -> None:
    op.drop_table('trust_policy_config')
