"""
Pydantic schemas for request and response bodies.

Pydantic models define the shape of data exchanged via API endpoints.
They perform validation and documentation for FastAPI.  Separate
schemas are defined for trust evaluation, access logs, and template
operations.
"""

from pydantic import BaseModel, Field
from typing import Optional, Dict


class TrustEvalRequest(BaseModel):
    """Request payload for trust evaluation."""

    user_upn: str
    device_id: Optional[str] = None


class TrustEvalResponse(BaseModel):
    """Response payload for trust evaluation results."""

    allowed: bool
    total_score: float
    posture_score: float
    context_score: float
    breakdown: Dict[str, float] = Field(default_factory=dict)


class AccessLogOut(BaseModel):
    """Serialized representation of an access log entry."""

    id: int
    user_upn: str
    device_id: Optional[str]
    ip: str
    location: Optional[str]
    ts: str
    posture_score: float
    context_score: float
    total_score: float
    allowed: bool
    breakdown: Dict[str, float]


class TemplateIn(BaseModel):
    """Request payload when creating a new template."""

    name: str
    content: str


class TemplateOut(BaseModel):
    """Response payload representing a stored template."""

    id: int
    name: str
    content: str
    created_at: str
