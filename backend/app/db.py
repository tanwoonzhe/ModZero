"""
Database configuration and session management.

This module sets up the SQLAlchemy engine and session factory using
values from the application settings.  It also exposes a `Base`
class for model definitions and a dependency `get_db` that yields
database sessions to FastAPI routes.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from .settings import settings


# SQLAlchemy engine configured using the database URL from settings.
engine = create_engine(settings.database_url, pool_pre_ping=True)


# Session factory bound to our engine.  `autocommit` and `autoflush`
# are disabled to give explicit control over transactions.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Base class for declarative models."""

    pass


def get_db():
    """Yield a database session for FastAPI dependency injection."""

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables in the database."""

    import logging
    from .models import Base  # noqa: F401  ensures models are registered

    try:
        Base.metadata.create_all(bind=engine)
    except Exception as exc:
        logging.exception("Failed to initialize the database: %s", exc)
        raise