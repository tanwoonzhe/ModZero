from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, JSON
from sqlalchemy.sql import func
from .db import Base

class AccessLog(Base):
    __tablename__ = "access_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_upn = Column(String(255), index=True)          # user's email/UPN
    device_id = Column(String(255), index=True, nullable=True)
    ip = Column(String(64))
    location = Column(String(128), nullable=True)       # e.g., country/city
    ts = Column(DateTime(timezone=True), server_default=func.now())
    posture_score = Column(Float)
    context_score = Column(Float)
    total_score = Column(Float)
    allowed = Column(Boolean)
    breakdown = Column(JSON)                            # dict of factors
