"""
Dependency utilities and startup functions.

This module provides helper functions such as `init_db` to be called
during application startup.  Additional dependency-related functions
can be added here to keep the main application clean.
"""

from .db import init_db as _init_db


def init_db() -> None:
    """Initialize the database by creating tables if necessary."""

    _init_db()