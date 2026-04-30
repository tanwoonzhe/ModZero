"""Phase 1 access control: resource slug/target columns + device_enrollments,
trust_snapshots, access_decisions.

Revision ID: d4e5f6g7h8i9
Revises: c3d4e5f6g7h8
Create Date: 2026-04-30 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'd4e5f6g7h8i9'
down_revision = 'c3d4e5f6g7h8'
branch_labels = None
depends_on = None


def _column_exists(connection, table: str, column: str) -> bool:
    result = connection.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
        f"WHERE table_name='{table}' AND column_name='{column}')"
    ))
    return result.scalar()


def _table_exists(connection, table: str) -> bool:
    result = connection.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
        f"WHERE table_name='{table}')"
    ))
    return result.scalar()


def upgrade() -> None:
    connection = op.get_bind()

    # ── Resource: add slug + target_* + path_prefix ──────────────
    if not _column_exists(connection, 'resources', 'slug'):
        op.add_column('resources', sa.Column('slug', sa.String(128), nullable=True))
        op.create_index('ix_resources_slug', 'resources', ['slug'], unique=True)
    if not _column_exists(connection, 'resources', 'target_host'):
        op.add_column('resources', sa.Column('target_host', sa.String(255), nullable=True))
    if not _column_exists(connection, 'resources', 'target_port'):
        op.add_column('resources', sa.Column('target_port', sa.Numeric(), nullable=True))
    if not _column_exists(connection, 'resources', 'target_scheme'):
        op.add_column('resources', sa.Column('target_scheme', sa.String(16), nullable=True, server_default='http'))
    if not _column_exists(connection, 'resources', 'path_prefix'):
        op.add_column('resources', sa.Column('path_prefix', sa.String(255), nullable=True))

    # Backfill slug from name for any rows missing it. Lower-case,
    # non-alphanum -> '-', strip leading/trailing '-'. Use a unique
    # per-row suffix from resource_id if collisions occur.
    connection.execute(sa.text("""
        UPDATE resources
        SET slug = COALESCE(slug, NULLIF(trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), ''))
        WHERE slug IS NULL OR slug = ''
    """))
    # Resolve duplicates by appending the first 8 chars of resource_id
    connection.execute(sa.text("""
        UPDATE resources r
        SET slug = r.slug || '-' || substr(r.resource_id::text, 1, 8)
        WHERE r.resource_id IN (
            SELECT resource_id FROM (
                SELECT resource_id, ROW_NUMBER() OVER (PARTITION BY slug ORDER BY name) AS rn
                FROM resources
                WHERE slug IS NOT NULL
            ) t WHERE t.rn > 1
        )
    """))

    # Backfill target_host/target_port from ip_address/port where present
    connection.execute(sa.text("""
        UPDATE resources
        SET target_host = COALESCE(target_host, ip_address),
            target_port = COALESCE(target_port, port),
            target_scheme = COALESCE(target_scheme, 'http')
        WHERE (target_host IS NULL OR target_port IS NULL)
    """))

    # ── device_enrollments ──────────────────────────────────────
    if not _table_exists(connection, 'device_enrollments'):
        op.create_table(
            'device_enrollments',
            sa.Column('device_id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.user_id'), nullable=False),
            sa.Column('hmac_secret', sa.String(128), nullable=False),
            sa.Column('device_name', sa.String(128), nullable=True),
            sa.Column('os', sa.String(64), nullable=True),
            sa.Column('os_version', sa.String(64), nullable=True),
            sa.Column('enrolled_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('revoked', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        )
        op.create_index('ix_device_enrollments_user_id', 'device_enrollments', ['user_id'])

    # ── trust_snapshots ─────────────────────────────────────────
    if not _table_exists(connection, 'trust_snapshots'):
        op.create_table(
            'trust_snapshots',
            sa.Column('snapshot_id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.user_id'), nullable=False),
            sa.Column('device_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('device_enrollments.device_id'), nullable=True),
            sa.Column('resource_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('resources.resource_id'), nullable=False),
            sa.Column('score', sa.Numeric(), nullable=False),
            sa.Column('threshold', sa.Numeric(), nullable=False),
            sa.Column('posture_json', postgresql.JSONB(), nullable=True),
            sa.Column('computed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        )
        op.create_index('ix_trust_snapshots_user_resource_at', 'trust_snapshots',
                        ['user_id', 'resource_id', sa.text('computed_at DESC')])
        op.create_index('ix_trust_snapshots_user_id', 'trust_snapshots', ['user_id'])
        op.create_index('ix_trust_snapshots_resource_id', 'trust_snapshots', ['resource_id'])

    # ── access_decisions ────────────────────────────────────────
    # Use sa.Enum with create_type via DDL guarded
    decision_enum = postgresql.ENUM('allow', 'deny', name='access_decision_enum', create_type=False)
    decision_enum_create = sa.text(
        "DO $$ BEGIN CREATE TYPE access_decision_enum AS ENUM ('allow', 'deny'); "
        "EXCEPTION WHEN duplicate_object THEN null; END $$;"
    )
    connection.execute(decision_enum_create)
    if not _table_exists(connection, 'access_decisions'):
        op.create_table(
            'access_decisions',
            sa.Column('decision_id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.user_id'), nullable=True),
            sa.Column('device_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('device_enrollments.device_id'), nullable=True),
            sa.Column('resource_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('resources.resource_id'), nullable=True),
            sa.Column('decision', decision_enum, nullable=False),
            sa.Column('reason', sa.Text(), nullable=True),
            sa.Column('path', sa.String(512), nullable=True),
            sa.Column('ts', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        )
        op.create_index('ix_access_decisions_resource_ts', 'access_decisions',
                        ['resource_id', sa.text('ts DESC')])
        op.create_index('ix_access_decisions_user_ts', 'access_decisions',
                        ['user_id', sa.text('ts DESC')])


def downgrade() -> None:
    op.drop_index('ix_access_decisions_user_ts', table_name='access_decisions')
    op.drop_index('ix_access_decisions_resource_ts', table_name='access_decisions')
    op.drop_table('access_decisions')
    op.execute('DROP TYPE IF EXISTS access_decision_enum')

    op.drop_index('ix_trust_snapshots_resource_id', table_name='trust_snapshots')
    op.drop_index('ix_trust_snapshots_user_id', table_name='trust_snapshots')
    op.drop_index('ix_trust_snapshots_user_resource_at', table_name='trust_snapshots')
    op.drop_table('trust_snapshots')

    op.drop_index('ix_device_enrollments_user_id', table_name='device_enrollments')
    op.drop_table('device_enrollments')

    op.drop_column('resources', 'path_prefix')
    op.drop_column('resources', 'target_scheme')
    op.drop_column('resources', 'target_port')
    op.drop_column('resources', 'target_host')
    op.drop_index('ix_resources_slug', table_name='resources')
    op.drop_column('resources', 'slug')
