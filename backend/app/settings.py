"""Application configuration.

This module defines a Pydantic BaseSettings class that loads configuration from
environment variables.  Values such as database URLs, JWT secrets and other
sensitive data should be set via environment variables in deployment (e.g.
.env file loaded by docker-compose).  Default values are provided for
development convenience only and should be overridden in production.
"""

from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic import AnyUrl, Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Application
    project_name: str = "ModZero"
    environment: str = Field("development", env="ENVIRONMENT")
    debug: bool = Field(False, env="DEBUG")

    # Database
    database_url: AnyUrl = Field(
        "postgresql+psycopg2://modzero:modzero@localhost:5432/modzero",
        env="DATABASE_URL",
    )

    # JWT
    secret_key: str = Field("changeme", env="SECRET_KEY")
    jwt_algorithm: str = Field("HS256", env="JWT_ALGORITHM")
    access_token_expire_minutes: int = Field(60 * 8, env="ACCESS_TOKEN_EXPIRE_MINUTES")

    # Azure (placeholders)
    azure_tenant_id: Optional[str] = Field(None, env="AZURE_TENANT_ID")
    azure_client_id: Optional[str] = Field(None, env="AZURE_CLIENT_ID")
    azure_client_secret: Optional[str] = Field(None, env="AZURE_CLIENT_SECRET")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
