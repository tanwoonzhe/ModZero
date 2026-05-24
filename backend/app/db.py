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
    ]
    with engine.connect() as conn:
        for stmt in migrations:
            try:
                conn.execute(text(stmt))
            except Exception:
                conn.rollback()
                raise
        conn.commit()
