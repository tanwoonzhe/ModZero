"""Database utilities.

Creates a SQLAlchemy engine and sessionmaker bound to the configured database URL.
This module also exports the declarative base class for model definitions.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from .settings import get_settings


settings = get_settings()

# Create SQLAlchemy engine.  pool_pre_ping checks connections before using them
# to avoid stale connections.
engine = create_engine(
    str(settings.database_url),
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Base class for SQLAlchemy declarative models."""
    pass


def init_db() -> None:
    """Create all tables in the database.

    Should be called on application startup.  In production you should use
    Alembic migrations instead of `Base.metadata.create_all`, but for the
    purposes of this project this function is sufficient.
    """

    from . import models  # noqa: F401  # ensure models are imported and registered

    Base.metadata.create_all(bind=engine)

    # Idempotent schema migrations for columns added after initial create_all.
    # Each statement uses IF NOT EXISTS / ON CONFLICT DO NOTHING so they are
    # safe to run on every startup.
    _run_migrations()


def _run_migrations() -> None:
    """Apply incremental DDL changes that create_all cannot handle."""
    from sqlalchemy import text

    migrations = [
        # connector_resource_id added to protected_resources
        """
        ALTER TABLE protected_resources
          ADD COLUMN IF NOT EXISTS connector_resource_id uuid
          REFERENCES connector_resources(resource_id) ON DELETE SET NULL
        """,
        # Login security fields backing the "Low Failed Logins" / "Not Locked"
        # identity signals.
        """
        ALTER TABLE users
          ADD COLUMN IF NOT EXISTS failed_login_count integer NOT NULL DEFAULT 0
        """,
        """
        ALTER TABLE users
          ADD COLUMN IF NOT EXISTS locked_until timestamptz
        """,
        """
        ALTER TABLE users
          ADD COLUMN IF NOT EXISTS password_changed_at timestamptz
        """,
        # Best-effort backfill: we don't know the true last-changed date for
        # existing accounts, so assume it was set at account creation.
        """
        UPDATE users SET password_changed_at = created_at WHERE password_changed_at IS NULL
        """,
        # Admin-configured Entra group/directory-role IDs for the Role Valid signal.
        """
        ALTER TABLE trust_policy_config
          ADD COLUMN IF NOT EXISTS valid_role_ids json
        """,
        # Hard-deny flag set on a DeviceTrustScore when a signal configured with
        # failure_action=deny_immediately_resources fails on that check.
        """
        ALTER TABLE device_trust_scores
          ADD COLUMN IF NOT EXISTS hard_denied_resources boolean NOT NULL DEFAULT false
        """,
        """
        ALTER TABLE device_trust_scores
          ADD COLUMN IF NOT EXISTS hard_deny_reason varchar(256)
        """,
        # Client app auto device-check interval (hours). Scheduling config
        # only — never contributes to the trust score. 0 = disabled.
        """
        ALTER TABLE trust_policy_config
          ADD COLUMN IF NOT EXISTS auto_check_interval_hours integer NOT NULL DEFAULT 0
        """,
        # Ephemeral (not persistent) client-login block from a
        # deny_immediately_client signal. Deliberately separate from
        # users.client_access_enabled — see models.py's DeviceTrustScore docstring.
        """
        ALTER TABLE device_trust_scores
          ADD COLUMN IF NOT EXISTS hard_denied_client boolean NOT NULL DEFAULT false
        """,
        """
        ALTER TABLE device_trust_scores
          ADD COLUMN IF NOT EXISTS hard_deny_client_reason varchar(256)
        """,
        # AV Advanced Protection (real-time + cloud-delivered + sample
        # submission + Dev Drive protection all on) and the client app's own
        # reported version, which client_healthy is now scored against
        # instead of the old always-true fingerprint-file check.
        """
        ALTER TABLE posture_reports
          ADD COLUMN IF NOT EXISTS av_advanced_protection boolean
        """,
        """
        ALTER TABLE posture_reports
          ADD COLUMN IF NOT EXISTS client_version varchar(32)
        """,
    ]
    with engine.connect() as conn:
        for stmt in migrations:
            try:
                conn.execute(text(stmt))
            except Exception:
                conn.rollback()
                raise
        conn.commit()

    _seed_signal_rules()
    _cleanup_retired_signal_rules()


def _seed_signal_rules() -> None:
    """Insert default SignalRule rows the first time this deploys.

    signal_rules is a brand-new table so Base.metadata.create_all() already
    creates it — this only needs to populate it, and only for rows that
    don't already exist (admins may have edited/deleted rows since).
    """
    import uuid as _uuid
    from sqlalchemy import text
    from .services.signal_rule_defaults import DEFAULT_SIGNAL_RULES

    with engine.connect() as conn:
        for module, key, source, label, max_points in DEFAULT_SIGNAL_RULES:
            conn.execute(
                text("""
                    INSERT INTO signal_rules
                        (id, module, signal_key, source, label, enabled, max_points, failure_action, created_at, updated_at)
                    VALUES
                        (:id, :module, :key, :source, :label, true, :max_points, 'reduce_score', now(), now())
                    ON CONFLICT (module, signal_key) DO NOTHING
                """),
                {"id": str(_uuid.uuid4()), "module": module, "key": key, "source": source, "label": label, "max_points": max_points},
            )
        conn.commit()


def _cleanup_retired_signal_rules() -> None:
    """Remove the recent_check device signal (deleted from the scoring engine
    — it always reported Pass, see posture_scoring.py's history) and relabel
    the two signals whose meaning changed, but only rows still holding their
    original default label so an admin's own edit is never clobbered."""
    from sqlalchemy import text

    with engine.connect() as conn:
        conn.execute(text(
            "DELETE FROM signal_rules WHERE module = 'device' AND signal_key = 'recent_check'"
        ))
        conn.execute(text(
            "UPDATE signal_rules SET label = 'OS Recently Patched' "
            "WHERE module = 'device' AND signal_key = 'os_supported' AND label = 'OS Version Supported'"
        ))
        conn.execute(text(
            "UPDATE signal_rules SET label = 'Client Version Supported' "
            "WHERE module = 'device' AND signal_key = 'client_healthy' AND label = 'Client App Healthy'"
        ))
        conn.commit()
