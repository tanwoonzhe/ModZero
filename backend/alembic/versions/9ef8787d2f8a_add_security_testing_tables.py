"""Add security testing tables

Revision ID: 9ef8787d2f8a
Revises: 
Create Date: 2025-12-30 11:40:29.226247

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '9ef8787d2f8a'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _type_exists(connection, type_name: str) -> bool:
    result = connection.execute(sa.text(
        f"SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = '{type_name}')"
    ))
    return result.scalar()


def _table_exists(connection, table: str) -> bool:
    result = connection.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
        f"WHERE table_name='{table}')"
    ))
    return result.scalar()


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()

    if not _type_exists(bind, "securitytesttypeenum"):
        op.execute("CREATE TYPE securitytesttypeenum AS ENUM ('IDENTITY', 'DEVICES')")
    if not _type_exists(bind, "risklevelenum"):
        op.execute("CREATE TYPE risklevelenum AS ENUM ('HIGH', 'MEDIUM', 'LOW')")
    if not _type_exists(bind, "teststatusenum"):
        op.execute("CREATE TYPE teststatusenum AS ENUM ('PASSED', 'FAILED', 'INVESTIGATE', 'SKIPPED', 'PLANNED')")

    security_test_type = sa.Enum('IDENTITY', 'DEVICES', name='securitytesttypeenum', create_type=False)
    risk_level_type    = sa.Enum('HIGH', 'MEDIUM', 'LOW', name='risklevelenum', create_type=False)
    test_status_type   = sa.Enum('PASSED', 'FAILED', 'INVESTIGATE', 'SKIPPED', 'PLANNED', name='teststatusenum', create_type=False)

    if not _table_exists(bind, 'security_test_definitions'):
        op.create_table('security_test_definitions',
        sa.Column('test_id', sa.String(length=32), nullable=False),
        sa.Column('test_type', security_test_type, nullable=False),
        sa.Column('title', sa.String(length=512), nullable=False),
        sa.Column('category', sa.String(length=128), nullable=False),
        sa.Column('sfi_pillar', sa.String(length=256), nullable=True),
        sa.Column('risk', risk_level_type, nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('user_impact', sa.String(length=32), nullable=True),
        sa.Column('implementation_cost', sa.String(length=32), nullable=True),
        sa.Column('remediation_guidance', sa.Text(), nullable=True),
        sa.Column('reference_url', sa.String(length=512), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('test_id')
        )
    if not _table_exists(bind, 'assessment_runs'):
        op.create_table('assessment_runs',
        sa.Column('run_id', sa.UUID(), nullable=False),
        sa.Column('test_type', security_test_type, nullable=False),
        sa.Column('initiated_by', sa.UUID(), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=True),
        sa.Column('total_tests', sa.Numeric(), nullable=True),
        sa.Column('passed_count', sa.Numeric(), nullable=True),
        sa.Column('failed_count', sa.Numeric(), nullable=True),
        sa.Column('investigate_count', sa.Numeric(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['initiated_by'], ['users.user_id'], ),
        sa.PrimaryKeyConstraint('run_id'),
        sa.UniqueConstraint('run_id')
        )
    if not _table_exists(bind, 'remediation_tasks'):
        op.create_table('remediation_tasks',
        sa.Column('task_id', sa.UUID(), nullable=False),
        sa.Column('test_id', sa.String(length=32), nullable=False),
        sa.Column('title', sa.String(length=256), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('assigned_to', sa.UUID(), nullable=True),
        sa.Column('created_by', sa.UUID(), nullable=False),
        sa.Column('priority', sa.String(length=32), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=True),
        sa.Column('due_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['assigned_to'], ['users.user_id'], ),
        sa.ForeignKeyConstraint(['created_by'], ['users.user_id'], ),
        sa.ForeignKeyConstraint(['test_id'], ['security_test_definitions.test_id'], ),
        sa.PrimaryKeyConstraint('task_id'),
        sa.UniqueConstraint('task_id')
        )
    if not _table_exists(bind, 'security_test_comments'):
        op.create_table('security_test_comments',
        sa.Column('comment_id', sa.UUID(), nullable=False),
        sa.Column('test_id', sa.String(length=32), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('comment', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(['test_id'], ['security_test_definitions.test_id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.user_id'], ),
        sa.PrimaryKeyConstraint('comment_id'),
        sa.UniqueConstraint('comment_id')
        )
    if not _table_exists(bind, 'security_test_overrides'):
        op.create_table('security_test_overrides',
        sa.Column('override_id', sa.UUID(), nullable=False),
        sa.Column('test_id', sa.String(length=32), nullable=False),
        sa.Column('override_status', sa.String(length=64), nullable=False),
        sa.Column('justification', sa.Text(), nullable=False),
        sa.Column('created_by', sa.UUID(), nullable=False),
        sa.Column('approved_by', sa.UUID(), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(['approved_by'], ['users.user_id'], ),
        sa.ForeignKeyConstraint(['created_by'], ['users.user_id'], ),
        sa.ForeignKeyConstraint(['test_id'], ['security_test_definitions.test_id'], ),
        sa.PrimaryKeyConstraint('override_id'),
        sa.UniqueConstraint('override_id')
        )
    if not _table_exists(bind, 'security_test_results'):
        op.create_table('security_test_results',
        sa.Column('result_id', sa.UUID(), nullable=False),
        sa.Column('test_id', sa.String(length=32), nullable=False),
        sa.Column('assessment_run_id', sa.UUID(), nullable=False),
        sa.Column('status', test_status_type, nullable=False),
        sa.Column('test_result_detail', sa.Text(), nullable=True),
        sa.Column('raw_data', sa.JSON(), nullable=True),
        sa.Column('evaluated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['assessment_run_id'], ['assessment_runs.run_id'], ),
        sa.ForeignKeyConstraint(['test_id'], ['security_test_definitions.test_id'], ),
        sa.PrimaryKeyConstraint('result_id'),
        sa.UniqueConstraint('result_id')
        )


def downgrade() -> None:
    """Downgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_table('security_test_results')
    op.drop_table('security_test_overrides')
    op.drop_table('security_test_comments')
    op.drop_table('remediation_tasks')
    op.drop_table('assessment_runs')
    op.drop_table('security_test_definitions')
    # Drop enums
    op.execute("DROP TYPE IF EXISTS teststatusenum")
    op.execute("DROP TYPE IF EXISTS securitytesttypeenum")
    op.execute("DROP TYPE IF EXISTS risklevelenum")
    # ### end Alembic commands ###
