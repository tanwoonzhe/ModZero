"""add signal_rules table and hard-deny fields on device_trust_scores

Revision ID: q6r7s8t9u0v1
Revises: p5q6r7s8t9u0
Create Date: 2026-07-03

"""
import uuid

from alembic import op
import sqlalchemy as sa

from app.services.signal_rule_defaults import DEFAULT_SIGNAL_RULES

revision = 'q6r7s8t9u0v1'
down_revision = 'p5q6r7s8t9u0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'signal_rules',
        sa.Column('id', sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('module', sa.String(16), nullable=False),
        sa.Column('signal_key', sa.String(64), nullable=False),
        sa.Column('source', sa.String(16), nullable=False, server_default='local'),
        sa.Column('label', sa.String(128), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('max_points', sa.Integer(), nullable=False),
        sa.Column('failure_action', sa.String(32), nullable=False, server_default='reduce_score'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint('module', 'signal_key', name='uq_signal_rules_module_key'),
    )

    signal_rules = sa.table(
        'signal_rules',
        sa.column('id', sa.dialects.postgresql.UUID(as_uuid=True)),
        sa.column('module', sa.String),
        sa.column('signal_key', sa.String),
        sa.column('source', sa.String),
        sa.column('label', sa.String),
        sa.column('enabled', sa.Boolean),
        sa.column('max_points', sa.Integer),
        sa.column('failure_action', sa.String),
    )
    op.bulk_insert(signal_rules, [
        {
            "id": uuid.uuid4(), "module": module, "signal_key": key, "source": source,
            "label": label, "enabled": True, "max_points": max_points,
            "failure_action": "reduce_score",
        }
        for module, key, source, label, max_points in DEFAULT_SIGNAL_RULES
    ])

    op.add_column('device_trust_scores', sa.Column('hard_denied_resources', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('device_trust_scores', sa.Column('hard_deny_reason', sa.String(256), nullable=True))


def downgrade() -> None:
    op.drop_column('device_trust_scores', 'hard_deny_reason')
    op.drop_column('device_trust_scores', 'hard_denied_resources')
    op.drop_table('signal_rules')
