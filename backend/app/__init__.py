"""
ModZero backend package.

This package contains the FastAPI application and supporting
modules for the ModZero MVP.  The design follows a modular
architecture with components for device posture evaluation,
context analysis, a trust score engine, and basic CRUD
operations for templates.

The modules in this package should not import from the global
environment; instead, they rely on configuration provided via
environment variables and the `settings` module.
"""

__all__ = [
    "main",
    "db",
    "models",
    "schemas",
    "trust_engine",
    "posture",
    "context_eval",
    "deps",
    "settings",
]