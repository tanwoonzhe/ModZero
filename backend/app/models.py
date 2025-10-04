"""
SQLAlchemy models for ModZero.

This module defines the database tables used by the ModZero MVP.  The
`AccessLog` model records each trust evaluation attempt and its
associated metadata.  The `Template` model stores named content
templates that administrators can manage via API endpoints.  These
templates could be used for notifications, policies, or other
configurations in future iterations.
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, JSON, Text
from sqlalchemy.sql import func

from .db import Base


class AccessLog(Base):
    """Record of each trust evaluation attempt."""

    __tablename__ = "access_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_upn = Column(String(255), index=True, nullable=False)  # user's email/UPN
    device_id = Column(String(255), index=True, nullable=True)
    ip = Column(String(64), nullable=False)
    location = Column(String(128), nullable=True)  # e.g., country/city
    ts = Column(DateTime(timezone=True), server_default=func.now())
    posture_score = Column(Float, nullable=False)
    context_score = Column(Float, nullable=False)
    total_score = Column(Float, nullable=False)
    allowed = Column(Boolean, nullable=False)
    breakdown = Column(JSON, nullable=True)  # dict of factors


class Template(Base):
    """Reusable content template stored in the database."""

    __tablename__ = "templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())