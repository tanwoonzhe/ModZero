"""Pydantic schemas for API requests and responses.

These models define the shape of data exchanged between the client and server.
Where possible, omit sensitive fields (e.g. password hashes) from responses.
"""

from datetime import datetime
from typing import List, Optional, Dict

from pydantic import BaseModel, EmailStr, Field


## User schemas

class UserBase(BaseModel):
    username: str
    email: EmailStr
    role: str


class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: Optional[str] = Field(default="employee")


class UserOut(UserBase):
    user_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


## Auth schemas

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: str  # subject (user id)
    exp: int  # expiration timestamp


class LoginRequest(BaseModel):
    username: str
    password: str


## Device schemas

class DeviceBase(BaseModel):
    device_name: str
    os_version: Optional[str] = None
    fingerprint: Optional[str] = None


class DeviceCreate(DeviceBase):
    user_id: str


class DeviceOut(DeviceBase):
    device_id: str
    user_id: str
    registered_at: datetime

    class Config:
        orm_mode = True


## Posture checkpoint schemas

class PostureCheckpointBase(BaseModel):
    name: str
    description: Optional[str] = None
    weight_default: Optional[float] = None


class PostureCheckpointCreate(PostureCheckpointBase):
    pass


class PostureCheckpointOut(PostureCheckpointBase):
    checkpoint_id: str
    created_at: datetime

    class Config:
        orm_mode = True


## Device posture status schemas

class DevicePostureStatusOut(BaseModel):
    device_id: str
    checkpoint_id: str
    status: str
    last_checked: datetime

    class Config:
        orm_mode = True


## Access attempt schemas

class AttemptCreate(BaseModel):
    user_id: str
    device_id: Optional[str] = None
    ip_address: Optional[str] = None
    geo_location: Optional[Dict[str, str]] = None


class AttemptOut(BaseModel):
    attempt_id: str
    user_id: str
    device_id: Optional[str]
    ip_address: Optional[str]
    geo_location: Optional[Dict[str, str]]
    timestamp: datetime
    result: str
    reason: Optional[str]
    total_score: Optional[float]
    decision: Optional[str]
    trust_details: Optional[List[Dict[str, float]]]

    class Config:
        orm_mode = True


## Trust factor schemas

class TrustFactorOut(BaseModel):
    factor_id: str
    name: str
    description: Optional[str]

    class Config:
        orm_mode = True


## Policy schemas

class PolicyBase(BaseModel):
    policy_name: str
    min_trust_threshold: float
    description: Optional[str] = None
    target_group: Optional[str] = None


class PolicyCreate(PolicyBase):
    factor_weights: Optional[Dict[str, float]] = None  # mapping factor_id to weight


class PolicyOut(PolicyBase):
    policy_id: str
    user_id: str
    created_at: datetime
    updated_at: datetime
    is_active: bool
    weights: Optional[Dict[str, float]] = None

    class Config:
        orm_mode = True


## Template schemas

class TemplateBase(BaseModel):
    name: str
    subject: str
    body: str
    type: Optional[str] = "email"


class TemplateCreate(TemplateBase):
    pass


class TemplateOut(TemplateBase):
    template_id: str
    created_at: datetime

    class Config:
        orm_mode = True