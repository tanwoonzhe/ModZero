"""Add user test configuration tables

Revision ID: a1b2c3d4e5f6
Revises: 9ef8787d2f8a
Create Date: 2026-02-06 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '9ef8787d2f8a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create detection mode enum (check if exists first)
    connection = op.get_bind()
    result = connection.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'detectionmodeenum')"
    ))
    enum_exists = result.scalar()
    
    detection_mode_enum = postgresql.ENUM(
        'manual', 'graph_query', 'checklist',
        name='detectionmodeenum',
        create_type=False  # Don't auto-create when creating table
    )
    
    if not enum_exists:
        detection_mode_enum.create(op.get_bind())
    
    # Create user_test_configurations table
    op.create_table(
        'user_test_configurations',
        sa.Column('config_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('test_id', sa.String(64), nullable=False),
        sa.Column('is_custom', sa.Boolean(), nullable=False, default=False),
        sa.Column('title', sa.String(512), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('pillar', sa.String(32), nullable=True),
        sa.Column('category', sa.String(128), nullable=True),
        sa.Column('risk', sa.String(32), nullable=True),
        sa.Column('is_enabled', sa.Boolean(), nullable=False, default=True),
        sa.Column('action_status', sa.String(64), nullable=True, default='to_address'),
        sa.Column('action_notes', sa.Text(), nullable=True),
        sa.Column('weight_override', sa.Float(), nullable=True),
        sa.Column('detection_mode', detection_mode_enum, nullable=True),
        sa.Column('graph_query_config', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('checklist_config', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('last_test_result', sa.String(32), nullable=True),
        sa.Column('last_run_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_run_data', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.user_id'], ),
        sa.PrimaryKeyConstraint('config_id'),
        sa.UniqueConstraint('config_id'),
        sa.UniqueConstraint('user_id', 'test_id', name='uix_user_test'),
    )
    
    # Create pillar_weight_configurations table
    op.create_table(
        'pillar_weight_configurations',
        sa.Column('config_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('pillar', sa.String(32), nullable=False),
        sa.Column('weight', sa.Float(), nullable=False, default=20),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.user_id'], ),
        sa.PrimaryKeyConstraint('config_id'),
        sa.UniqueConstraint('config_id'),
        sa.UniqueConstraint('user_id', 'pillar', name='uix_user_pillar'),
    )
    
    # Create indexes
    op.create_index('ix_user_test_config_user', 'user_test_configurations', ['user_id'])
    op.create_index('ix_user_test_config_pillar', 'user_test_configurations', ['pillar'])
    op.create_index('ix_pillar_weight_config_user', 'pillar_weight_configurations', ['user_id'])


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_pillar_weight_config_user', table_name='pillar_weight_configurations')
    op.drop_index('ix_user_test_config_pillar', table_name='user_test_configurations')
    op.drop_index('ix_user_test_config_user', table_name='user_test_configurations')
    
    # Drop tables
    op.drop_table('pillar_weight_configurations')
    op.drop_table('user_test_configurations')
    
    # Drop enum
    detection_mode_enum = postgresql.ENUM(
        'manual', 'graph_query', 'checklist',
        name='detectionmodeenum'
    )
    detection_mode_enum.drop(op.get_bind(), checkfirst=True)
