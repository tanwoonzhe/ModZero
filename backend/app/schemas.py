"""Pydantic schemas for API requests and responses.

These models define the shape of data exchanged between the client and server.
Where possible, omit sensitive fields (e.g. password hashes) from responses.
"""

from datetime import datetime
from typing import List, Optional, Dict
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, ConfigDict


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
    user_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


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
    device_id: UUID
    user_id: UUID
    registered_at: datetime

    model_config = ConfigDict(from_attributes=True)


## Posture checkpoint schemas

class PostureCheckpointBase(BaseModel):
    name: str
    description: Optional[str] = None
    weight_default: Optional[float] = None


class PostureCheckpointCreate(PostureCheckpointBase):
    pass


class PostureCheckpointOut(PostureCheckpointBase):
    checkpoint_id: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


## Device posture status schemas

class DevicePostureStatusOut(BaseModel):
    device_id: UUID
    checkpoint_id: UUID
    status: str
    last_checked: datetime

    model_config = ConfigDict(from_attributes=True)


## Access attempt schemas

class AttemptCreate(BaseModel):
    user_id: str
    device_id: Optional[str] = None
    ip_address: Optional[str] = None
    geo_location: Optional[Dict[str, str]] = None


class AttemptOut(BaseModel):
    attempt_id: UUID
    user_id: UUID
    device_id: Optional[UUID]
    ip_address: Optional[str]
    geo_location: Optional[Dict[str, str]]
    timestamp: datetime
    result: str
    reason: Optional[str]
    total_score: Optional[float]
    decision: Optional[str]
    trust_details: Optional[List[Dict[str, float]]]

    model_config = ConfigDict(from_attributes=True)


## Trust factor schemas

class TrustFactorOut(BaseModel):
    factor_id: UUID
    name: str
    description: Optional[str]

    model_config = ConfigDict(from_attributes=True)


## Policy schemas

class PolicyBase(BaseModel):
    policy_name: str
    min_trust_threshold: float
    description: Optional[str] = None
    target_group: Optional[str] = None


class PolicyCreate(PolicyBase):
    factor_weights: Optional[Dict[str, float]] = None  # mapping factor_id to weight


class PolicyOut(PolicyBase):
    policy_id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime
    is_active: bool
    weights: Optional[Dict[str, float]] = None

    model_config = ConfigDict(from_attributes=True)


## Template schemas

class TemplateBase(BaseModel):
    name: str
    subject: str
    body: str
    type: Optional[str] = "email"


class TemplateCreate(TemplateBase):
    pass


class TemplateOut(TemplateBase):
    template_id: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


## Security Test schemas

class SecurityTestDefinitionBase(BaseModel):
    test_id: str
    test_type: str
    title: str
    category: str
    sfi_pillar: Optional[str] = None
    risk: str
    description: str
    user_impact: Optional[str] = None
    implementation_cost: Optional[str] = None
    remediation_guidance: Optional[str] = None
    reference_url: Optional[str] = None


class SecurityTestDefinitionCreate(SecurityTestDefinitionBase):
    pass


class SecurityTestDefinitionOut(SecurityTestDefinitionBase):
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SecurityTestResultBase(BaseModel):
    test_id: str
    status: str
    test_result_detail: Optional[str] = None


class SecurityTestResultCreate(SecurityTestResultBase):
    assessment_run_id: UUID
    raw_data: Optional[Dict] = None


class SecurityTestResultOut(SecurityTestResultBase):
    result_id: UUID
    assessment_run_id: UUID
    evaluated_at: datetime
    raw_data: Optional[Dict] = None

    model_config = ConfigDict(from_attributes=True)


class AssessmentRunBase(BaseModel):
    test_type: str


class AssessmentRunCreate(AssessmentRunBase):
    pass


class AssessmentRunOut(AssessmentRunBase):
    run_id: UUID
    initiated_by: Optional[UUID] = None
    started_at: datetime
    completed_at: Optional[datetime] = None
    status: str
    total_tests: int
    passed_count: int
    failed_count: int
    investigate_count: int
    error_message: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class SecurityTestOverrideBase(BaseModel):
    test_id: str
    override_status: str
    justification: str
    expires_at: Optional[datetime] = None


class SecurityTestOverrideCreate(SecurityTestOverrideBase):
    pass


class SecurityTestOverrideOut(SecurityTestOverrideBase):
    override_id: UUID
    created_by: UUID
    approved_by: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class SecurityTestCommentBase(BaseModel):
    test_id: str
    comment: str


class SecurityTestCommentCreate(SecurityTestCommentBase):
    pass


class SecurityTestCommentOut(SecurityTestCommentBase):
    comment_id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime
    is_deleted: bool

    model_config = ConfigDict(from_attributes=True)


class RemediationTaskBase(BaseModel):
    test_id: str
    title: str
    description: Optional[str] = None
    priority: Optional[str] = "medium"
    due_date: Optional[datetime] = None


class RemediationTaskCreate(RemediationTaskBase):
    assigned_to: Optional[UUID] = None


class RemediationTaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    assigned_to: Optional[UUID] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    due_date: Optional[datetime] = None


class RemediationTaskOut(RemediationTaskBase):
    task_id: UUID
    assigned_to: Optional[UUID] = None
    created_by: UUID
    status: str
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


## Combined Test Result (for frontend display)

class SecurityTestWithResult(BaseModel):
    """Combined view of test definition with latest result"""
    test_id: str
    test_type: str
    title: str
    category: str
    sfi_pillar: Optional[str] = None
    risk: str
    description: str
    user_impact: Optional[str] = None
    implementation_cost: Optional[str] = None
    status: str  # From latest result
    test_result_detail: Optional[str] = None
    has_override: bool = False
    override_status: Optional[str] = None
    comments_count: int = 0
    has_remediation_task: bool = False

    model_config = ConfigDict(from_attributes=True)


## Custom Policy schemas

class CustomPolicyBase(BaseModel):
    title: str
    description: Optional[str] = None
    pillar: str
    category: Optional[str] = None
    module: Optional[str] = None
    scope: Optional[str] = None
    enforcement_mode: str = "informational"  # informational | enforced
    is_enabled: bool = True
    risk: Optional[str] = None
    severity: Optional[str] = None
    # Policies define enforcement rules and thresholds, not detection logic.
    # Detection (Graph API, Checklist, Manual) belongs to Custom Tests.
    threshold_config: Optional[Dict] = None  # e.g., {"metric": "mfa_coverage", "operator": "gte", "value": 95}


class CustomPolicyCreate(CustomPolicyBase):
    pass


class CustomPolicyUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    pillar: Optional[str] = None
    category: Optional[str] = None
    module: Optional[str] = None
    scope: Optional[str] = None
    enforcement_mode: Optional[str] = None
    is_enabled: Optional[bool] = None
    risk: Optional[str] = None
    severity: Optional[str] = None
    threshold_config: Optional[Dict] = None


class CustomPolicyOut(CustomPolicyBase):
    policy_id: UUID
    last_test_result: Optional[str] = None
    last_run_at: Optional[datetime] = None
    last_run_data: Optional[Dict] = None
    created_by: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


## Posture report schemas

class PostureReportIn(BaseModel):
    """Posture report submitted by the client app."""
    # Device identification — provide device_id OR fingerprint/name for auto-register
    device_id: Optional[str] = None
    device_name: Optional[str] = None   # used when auto-registering a new device
    os_version: Optional[str] = None
    fingerprint: Optional[str] = None   # used for device lookup / auto-register

    # The five posture factors
    firewall_enabled: Optional[bool] = None
    antivirus_enabled: Optional[bool] = None
    disk_encryption_enabled: Optional[bool] = None
    os_supported: Optional[bool] = None
    # Pass the value from Graph deviceManagement lookup, or True/False manually
    intune_compliant: Optional[bool] = None


class PostureFactorDetail(BaseModel):
    factor: str
    value: Optional[bool]
    passed: bool
    points: float


class PostureReportOut(BaseModel):
    """Response after submitting a posture report — includes computed trust score."""
    report_id: UUID
    device_id: UUID
    reported_at: datetime
    firewall_enabled: Optional[bool]
    antivirus_enabled: Optional[bool]
    disk_encryption_enabled: Optional[bool]
    os_supported: Optional[bool]
    intune_compliant: Optional[bool]
    posture_score: float
    context_score: float
    total_score: float
    breakdown: List[PostureFactorDetail]
    calculated_at: datetime

    model_config = ConfigDict(from_attributes=True)


## Trust score schemas

class DeviceTrustScoreOut(BaseModel):
    score_id: UUID
    device_id: UUID
    report_id: Optional[UUID]
    posture_score: float
    context_score: float
    total_score: float
    breakdown: Optional[List[PostureFactorDetail]]
    calculated_at: datetime

    model_config = ConfigDict(from_attributes=True)