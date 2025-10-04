"""
Application configuration settings.

This module defines a `Settings` class that loads configuration
values from environment variables.  These values control database
connections, trust score weighting, and optional Microsoft
Graph/Intune integration credentials.  Default values are
provided for local development and testing.
"""

import os
from pydantic import BaseModel


class Settings(BaseModel):
    """Configuration values loaded from environment variables."""

    # Database connection string.  Uses PostgreSQL by default.  When
    # deploying in Docker, this should point at the `db` service
    # (e.g. "postgresql+psycopg2://modzero:modzero@db:5432/modzero").
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg2://modzero:modzero@localhost:5432/modzero",
    )

    # Weight assigned to the device posture component of the trust score.
    weight_posture: float = float(os.getenv("TRUST_WEIGHT_POSTURE", 0.7))

    # Weight assigned to the context component of the trust score.
    weight_context: float = float(os.getenv("TRUST_WEIGHT_CONTEXT", 0.3))

    # Minimum score required to allow access.
    min_threshold: int = int(os.getenv("TRUST_MIN_THRESHOLD", 70))

    # Placeholders for future Microsoft Graph integration.  These values
    # are optional for the MVP and remain unused until integration is
    # implemented.  By defining them here we leave space for later
    # development without breaking environment parsing.
    azure_tenant_id: str | None = os.getenv("AZURE_TENANT_ID")
    azure_client_id: str | None = os.getenv("AZURE_CLIENT_ID")
    azure_client_secret: str | None = os.getenv("AZURE_CLIENT_SECRET")


settings = Settings()