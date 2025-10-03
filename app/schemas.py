from pydantic import BaseModel, Field
from typing import Optional, Dict

class TrustEvalRequest(BaseModel):
    user_upn: str
    device_id: Optional[str] = None

class TrustEvalResponse(BaseModel):
    allowed: bool
    total_score: float
    posture_score: float
    context_score: float
    breakdown: Dict[str, float] = Field(default_factory=dict)

class AccessLogOut(BaseModel):
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
