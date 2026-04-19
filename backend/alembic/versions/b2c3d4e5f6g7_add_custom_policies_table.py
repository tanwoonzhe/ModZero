"""Add custom_policies table

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-20 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'b2c3d4e5f6g7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enforcement mode enum
    connection = op.get_bind()
    result = connection.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enforcementmodeenum')"
    ))
    enum_exists = result.scalar()

    enforcement_mode_enum = postgresql.ENUM(
        'informational', 'enforced',
        name='enforcementmodeenum',
        create_type=False,
    )

    if not enum_exists:
        enforcement_mode_enum.create(op.get_bind())

    # Ensure detectionmodeenum exists (created in previous migration)
    result2 = connection.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'detectionmodeenum')"
    ))
    detection_exists = result2.scalar()

    detection_mode_enum = postgresql.ENUM(
        'manual', 'graph_query', 'checklist',
        name='detectionmodeenum',
        create_type=False,
    )

    if not detection_exists:
        detection_mode_enum.create(op.get_bind())

    # Create custom_policies table
    op.create_table(
        'custom_policies',
        sa.Column('policy_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('title', sa.String(512), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('pillar', sa.String(32), nullable=False),
        sa.Column('category', sa.String(128), nullable=True),
        sa.Column('module', sa.String(128), nullable=True),
        sa.Column('scope', sa.String(256), nullable=True),
        sa.Column('enforcement_mode', enforcement_mode_enum, nullable=False, server_default='informational'),
        sa.Column('is_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('risk', sa.String(32), nullable=True),
        sa.Column('severity', sa.String(32), nullable=True),
        sa.Column('detection_mode', detection_mode_enum, nullable=True),
        sa.Column('graph_query_config', postgresql.JSON(), nullable=True),
        sa.Column('checklist_config', postgresql.JSON(), nullable=True),
        sa.Column('threshold_config', postgresql.JSON(), nullable=True),
        sa.Column('last_test_result', sa.String(32), nullable=True),
        sa.Column('last_run_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_run_data', postgresql.JSON(), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('policy_id'),
        sa.ForeignKeyConstraint(['created_by'], ['users.user_id']),
    )


def downgrade() -> None:
    op.drop_table('custom_policies')

    # Drop the enforcement mode enum
    connection = op.get_bind()
    result = connection.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enforcementmodeenum')"
    ))
    if result.scalar():
        op.execute("DROP TYPE enforcementmodeenum")
