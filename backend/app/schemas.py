"""Pydantic schemas for API requests and responses.

These models define the shape of data exchanged between the client and server.
Where possible, omit sensitive fields (e.g. password hashes) from responses.
"""

from datetime import datetime
from typing import List, Optional, Dict
import ipaddress
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator, model_validator


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


## Protected Resource schemas

_ALLOWED_ACCESS_MODES = {"auto", "http_proxy", "wireguard_tunnel"}

class ProtectedResourceBase(BaseModel):
    name: str
    description: Optional[str] = None
    resource_type: str = "web"  # web | ssh | rdp | database | api
    internal_address: Optional[str] = None
    public_name: Optional[str] = None
    required_group: Optional[str] = None
    minimum_trust_score: float = 0.0
    require_intune_compliant: bool = False
    enabled: bool = True
    connector_resource_id: Optional[UUID] = None
    preferred_access_mode: str = "auto"
    require_tunnel: bool = False
    allow_http_fallback: bool = True

    @field_validator("preferred_access_mode")
    @classmethod
    def _check_access_mode(cls, v: str) -> str:
        if v not in _ALLOWED_ACCESS_MODES:
            raise ValueError(
                f"preferred_access_mode must be one of {sorted(_ALLOWED_ACCESS_MODES)}"
            )
        return v

    @model_validator(mode="after")
    def _check_policy_coherence(self):
        if self.preferred_access_mode == "http_proxy" and self.require_tunnel:
            raise ValueError(
                "Incoherent policy: preferred_access_mode='http_proxy' cannot be combined "
                "with require_tunnel=True"
            )
        return self


class ProtectedResourceCreate(ProtectedResourceBase):
    pass


class ProtectedResourceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    resource_type: Optional[str] = None
    internal_address: Optional[str] = None
    public_name: Optional[str] = None
    required_group: Optional[str] = None
    minimum_trust_score: Optional[float] = None
    require_intune_compliant: Optional[bool] = None
    enabled: Optional[bool] = None
    connector_resource_id: Optional[UUID] = None
    preferred_access_mode: Optional[str] = None
    require_tunnel: Optional[bool] = None
    allow_http_fallback: Optional[bool] = None

    @field_validator("preferred_access_mode")
    @classmethod
    def _check_access_mode(cls, v):
        if v is not None and v not in _ALLOWED_ACCESS_MODES:
            raise ValueError(
                f"preferred_access_mode must be one of {sorted(_ALLOWED_ACCESS_MODES)}"
            )
        return v

    @model_validator(mode="after")
    def _check_policy_coherence(self):
        if self.preferred_access_mode == "http_proxy" and self.require_tunnel is True:
            raise ValueError(
                "Incoherent policy: preferred_access_mode='http_proxy' cannot be combined "
                "with require_tunnel=True"
            )
        return self


class ProtectedResourceOut(ProtectedResourceBase):
    id: UUID
    created_at: datetime
    updated_at: datetime
    # Computed from linked connector heartbeat — populated by the router, not from ORM
    connector_status: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


## Access request schemas

class AccessRequestIn(BaseModel):
    resource_id: UUID
    device_id: Optional[UUID] = None


class AccessDecisionOut(BaseModel):
    decision: str  # allow | deny
    reason: str
    trust_score: Optional[float] = None
    required_score: Optional[float] = None
    resource: Optional[ProtectedResourceOut] = None
    # Session fields — only populated when decision=allow
    session_id: Optional[UUID] = None
    access_token: Optional[str] = None  # raw token, shown once; stored as hash only
    expires_at: Optional[datetime] = None
    access_url: Optional[str] = None
    launch_url: Optional[str] = None
    connector_id: Optional[UUID] = None
    # Tunnel-aware additive fields (Part 1.C)
    access_mode: Optional[str] = None  # "http_proxy" | "wireguard_tunnel" | "both" | "denied"
    tunnel_ready: bool = False
    tunnel_reason: Optional[str] = None
    tunnel_target: Optional[str] = None
    connector_tunnel_status: Optional[str] = None
    http_proxy_available: bool = True
    tunnel_available: bool = False
    fallback_used: bool = False
    fallback_access_url: Optional[str] = None


class AccessLaunchExchangeRequest(BaseModel):
    launch_code: str


class AccessLaunchExchangeResponse(BaseModel):
    session_id: UUID
    access_token: str
    resource_name: Optional[str] = None
    expires_at: Optional[datetime] = None


class AccessLogOut(BaseModel):
    id: UUID
    user_id: UUID
    device_id: Optional[UUID]
    resource_id: Optional[UUID]
    decision: str
    reason: Optional[str]
    trust_score: Optional[float]
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)


class AccessLogRichOut(BaseModel):
    id: UUID
    user_id: UUID
    username: Optional[str] = None
    device_id: Optional[UUID]
    resource_id: Optional[UUID]
    resource_name: Optional[str] = None
    decision: str
    reason: Optional[str]
    trust_score: Optional[float]
    timestamp: datetime
    access_mode: Optional[str] = None
    tunnel_ready: Optional[bool] = None
    tunnel_reason: Optional[str] = None
    fallback_used: Optional[bool] = None
    require_tunnel_at_decision: Optional[bool] = None


## Access session schemas

class AccessSessionOut(BaseModel):
    id: UUID
    user_id: UUID
    device_id: Optional[UUID]
    resource_id: Optional[UUID]
    resource_name: Optional[str] = None
    connector_id: Optional[UUID]
    access_log_id: Optional[UUID]
    status: str  # active | expired | revoked
    created_at: datetime
    expires_at: datetime
    revoked_at: Optional[datetime]
    last_used_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)


class AccessIntrospectRequest(BaseModel):
    session_id: UUID
    access_token: str


class AccessIntrospectResponse(BaseModel):
    active: bool
    reason: Optional[str] = None
    # Populated only when active=True
    resource_name: Optional[str] = None
    target_host: Optional[str] = None
    target_port: Optional[int] = None
    protocol: Optional[str] = None
    path_prefix: Optional[str] = None
    expires_at: Optional[datetime] = None
    user_id: Optional[UUID] = None


## Tunnel (Headscale / WireGuard foundation) schemas

_ALLOWED_ROUTE_TYPES = {"host", "subnet"}
_ALLOWED_NODE_STATUSES = {"pending", "online", "degraded", "offline"}
_ALLOWED_ROUTE_STATUSES = {"pending", "advertised", "approved", "disabled", "unavailable"}


class TunnelStatusOut(BaseModel):
    headscale_enabled: bool
    headscale_url_configured: bool
    headscale_user: str
    current_data_path: str  # always "http_proxy" this milestone
    headscale_reachable: Optional[bool] = None
    last_sync_at: Optional[datetime] = None
    last_route_sync_at: Optional[datetime] = None


class HeadscaleHealthOut(BaseModel):
    enabled: bool
    configured: bool
    reachable: Optional[bool] = None
    node_count: Optional[int] = None
    error: Optional[str] = None


class HeadscaleSyncOut(BaseModel):
    status: str  # "ok" | "disabled" | "not_configured" | "unreachable"
    synced_nodes: int = 0
    created: int = 0
    updated: int = 0
    skipped: int = 0
    errors: int = 0
    last_sync_at: Optional[datetime] = None
    detail: Optional[str] = None


class TunnelNodeOut(BaseModel):
    id: UUID
    connector_id: UUID
    connector_name: Optional[str] = None
    node_name: str
    wireguard_ip: Optional[str] = None
    headscale_node_id: Optional[str] = None
    status: str
    last_seen_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TunnelRouteIn(BaseModel):
    connector_id: UUID
    resource_id: Optional[UUID] = None
    subnet_or_host: str = Field(min_length=1, max_length=256)
    route_type: str = Field(default="host")
    enabled: bool = False
    route_status: str = Field(default="pending")

    @classmethod
    def _validate_route_type(cls, v: str) -> str:
        if v not in _ALLOWED_ROUTE_TYPES:
            raise ValueError(f"route_type must be one of {sorted(_ALLOWED_ROUTE_TYPES)}")
        return v

    def model_post_init(self, __context) -> None:
        if self.route_type not in _ALLOWED_ROUTE_TYPES:
            raise ValueError(
                f"route_type must be one of {sorted(_ALLOWED_ROUTE_TYPES)}"
            )
        if self.route_status not in _ALLOWED_ROUTE_STATUSES:
            raise ValueError(
                f"route_status must be one of {sorted(_ALLOWED_ROUTE_STATUSES)}"
            )
        if self.route_type == "subnet":
            try:
                ipaddress.ip_network(self.subnet_or_host, strict=False)
            except ValueError:
                raise ValueError(
                    "subnet_or_host must be a valid CIDR for route_type=subnet"
                )
        elif self.route_type == "host" and "/" not in self.subnet_or_host:
            try:
                ipaddress.ip_address(self.subnet_or_host)
                object.__setattr__(self, "subnet_or_host", f"{self.subnet_or_host}/32")
            except ValueError:
                pass  # hostname — no normalization


class TunnelRouteOut(BaseModel):
    id: UUID
    connector_id: UUID
    resource_id: Optional[UUID] = None
    subnet_or_host: str
    route_type: str
    enabled: bool
    route_status: str = "pending"
    last_synced_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    headscale_route_id: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TunnelRegisterIn(BaseModel):
    """Connector → controller: register a WG node.
    Connector identity is NOT taken from the body — it comes from the path id
    plus X-Connector-Id / X-Connector-Secret headers.
    """
    node_name: str = Field(min_length=1, max_length=256)
    node_key: Optional[str] = Field(default=None, max_length=512)
    wireguard_ip: Optional[str] = Field(default=None, max_length=64)


class TunnelHeartbeatIn(BaseModel):
    """Connector → controller: liveness ping for a WG node.
    Connector identity is NOT taken from the body.
    """
    node_name: str = Field(min_length=1, max_length=256)
    status: str = Field(default="online")
    wireguard_ip: Optional[str] = Field(default=None, max_length=64)

    def model_post_init(self, __context) -> None:
        if self.status not in _ALLOWED_NODE_STATUSES:
            raise ValueError(
                f"status must be one of {sorted(_ALLOWED_NODE_STATUSES)}"
            )


# ---------------------------------------------------------------------------
## Tunnel bootstrap (manual WireGuard join) schemas
# ---------------------------------------------------------------------------


class TunnelBootstrapIn(BaseModel):
    """Optional request body for POST /api/tunnels/bootstrap/{connector_id}.

    POST with `{}` for defaults. `force_manual=true` bypasses the optional
    Headscale preauth-key API path even when HEADSCALE_BOOTSTRAP_TRY_API=true.
    """

    node_name: Optional[str] = Field(default=None, max_length=256)
    force_manual: bool = False


class TunnelBootstrapOut(BaseModel):
    """Response from POST /api/tunnels/bootstrap/{connector_id}.

    `auth_key` is only populated on `headscale_api` success and is returned
    exactly once. The controller stores only sha256(auth_key) for audit.
    """

    status: str  # ok | disabled | not_configured
    connector_id: UUID
    connector_name: Optional[str] = None
    headscale_enabled: bool
    headscale_configured: bool
    suggested_node_name: str
    login_server: Optional[str] = None
    join_command: Optional[str] = None
    auth_key_mode: str  # manual | headscale_api | disabled | not_configured
    auth_key: Optional[str] = None
    expires_at: Optional[datetime] = None
    warnings: List[str] = Field(default_factory=list)


class TunnelBootstrapLogOut(BaseModel):
    """Sanitized bootstrap audit row. `auth_key_hash` is deliberately omitted."""

    id: UUID
    connector_id: UUID
    connector_name: Optional[str] = None
    requested_by_user_id: Optional[UUID] = None
    node_name: str
    auth_key_mode: str
    status: str
    created_at: datetime
    expires_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
## Route lifecycle schemas
# ---------------------------------------------------------------------------


class RouteAdvertiseOut(BaseModel):
    route_id: UUID
    connector_id: UUID
    connector_name: Optional[str] = None
    route_type: str
    subnet_or_host: str
    suggested_advertise_value: str
    manual_command: str
    warnings: List[str] = Field(default_factory=list)


class SyncRoutesOut(BaseModel):
    status: str  # ok | disabled | not_configured | unreachable
    synced_routes: int = 0
    updated: int = 0
    skipped: int = 0
    errors: int = 0
    last_sync_at: Optional[datetime] = None
    detail: Optional[str] = None


class RouteApproveOut(BaseModel):
    route_id: UUID
    status: str  # approved | manual_required | error
    safe_message: str
    manual_command: Optional[str] = None


class TunnelRouteActionLogOut(BaseModel):
    id: UUID
    route_id: UUID
    action: str
    requested_by_user_id: Optional[UUID] = None
    result: Optional[str] = None
    safe_message: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


## User Device Tunnel Enrollment schemas (Part 3)

class UserEnrollmentIn(BaseModel):
    device_id: Optional[UUID] = None
    node_name_hint: Optional[str] = None


class UserEnrollmentOut(BaseModel):
    status: str  # disabled | not_configured | manual_required
    login_server: Optional[str] = None
    suggested_node_name: Optional[str] = None
    manual_command: str
    instructions: List[str] = Field(default_factory=list)
    safe_message: str


## Tunnel Access Audit Log schema (Part 5.B)

class TunnelAccessAuditLogOut(BaseModel):
    id: UUID
    action: str
    user_id: Optional[UUID] = None
    device_id: Optional[UUID] = None
    resource_id: Optional[UUID] = None
    connector_id: Optional[UUID] = None
    access_log_id: Optional[UUID] = None
    safe_message: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
