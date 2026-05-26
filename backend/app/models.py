"""SQLAlchemy models for the ModZero backend.

This module defines the database schema for the ModZero zero‑trust platform.  Each
class corresponds to a table in PostgreSQL.  UUIDs are used as primary keys to
avoid sequence guessing.  The relationships follow the improved ERD described
in the design document.  Only a subset of optional tables are included here; new
tables (e.g. device_software) can be added following the same pattern.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum as PgEnum,
    Float,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    JSON,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from .db import Base


class RoleEnum(str, Enum):
    ADMIN = "admin"
    EMPLOYEE = "employee"


class PostureStatusEnum(str, Enum):
    PASS = "pass"
    FAIL = "fail"
    UNKNOWN = "unknown"


class AttemptResultEnum(str, Enum):
    ALLOW = "allow"
    DENY = "deny"
    REVIEW = "review"


class DecisionEnum(str, Enum):
    ALLOW = "allow"
    DENY = "deny"
    REVIEW = "review"


class SeverityEnum(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ConnectorStatusEnum(str, Enum):
    UP = "up"
    DEGRADED = "degraded"
    DOWN = "down"


class NetworkStatusEnum(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class NetworkHealthEnum(str, Enum):
    GREEN = "green"
    AMBER = "amber"
    RED = "red"


class SessionStatusEnum(str, Enum):
    ACTIVE = "active"
    REVOKED = "revoked"


class User(Base):
    __tablename__ = "users"

    user_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True
    )
    username: str = Column(String(64), unique=True, nullable=False)
    email: str = Column(String(128), unique=True, nullable=False)
    password_hash: str = Column(String(255), nullable=False)
    role: RoleEnum = Column(PgEnum(RoleEnum), nullable=False, default=RoleEnum.EMPLOYEE)
    created_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    devices = relationship("Device", back_populates="owner", cascade="all, delete-orphan")
    attempts = relationship("AccessAttempt", back_populates="user")
    policies = relationship("Policy", back_populates="author")
    sessions = relationship("Session", back_populates="user")
    audit_logs = relationship("AuditLog", back_populates="user")

    def __repr__(self) -> str:
        return f"<User {self.username}>"


class Device(Base):
    __tablename__ = "devices"

    device_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True
    )
    user_id: uuid.UUID = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False)
    device_name: str = Column(String(128), nullable=False)
    os_version: str = Column(String(64), nullable=True)
    fingerprint: str = Column(String(255), nullable=True, unique=True)
    registered_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    owner = relationship("User", back_populates="devices")
    posture_statuses = relationship(
        "DevicePostureStatus",
        back_populates="device",
        cascade="all, delete-orphan",
    )
    attempts = relationship("AccessAttempt", back_populates="device")
    sessions = relationship("Session", back_populates="device")
    posture_reports = relationship(
        "PostureReport",
        back_populates="device",
        cascade="all, delete-orphan",
        order_by="PostureReport.reported_at.desc()",
    )
    device_trust_scores = relationship(
        "DeviceTrustScore",
        back_populates="device",
        cascade="all, delete-orphan",
        order_by="DeviceTrustScore.calculated_at.desc()",
    )

    def __repr__(self) -> str:
        return f"<Device {self.device_name}>"


class PostureCheckpoint(Base):
    __tablename__ = "posture_checkpoints"

    checkpoint_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True
    )
    name: str = Column(String(128), unique=True, nullable=False)
    description: str = Column(Text, nullable=True)
    weight_default: float = Column(Float, nullable=True)
    created_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    statuses = relationship(
        "DevicePostureStatus",
        back_populates="checkpoint",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<PostureCheckpoint {self.name}>"


class DevicePostureStatus(Base):
    __tablename__ = "device_posture_status"
    __table_args__ = (
        UniqueConstraint("device_id", "checkpoint_id", name="uix_device_checkpoint"),
    )

    device_id: uuid.UUID = Column(UUID(as_uuid=True), ForeignKey("devices.device_id"), primary_key=True)
    checkpoint_id: uuid.UUID = Column(UUID(as_uuid=True), ForeignKey("posture_checkpoints.checkpoint_id"), primary_key=True)
    status: PostureStatusEnum = Column(PgEnum(PostureStatusEnum), nullable=False, default=PostureStatusEnum.UNKNOWN)
    last_checked: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    device = relationship("Device", back_populates="posture_statuses")
    checkpoint = relationship("PostureCheckpoint", back_populates="statuses")

    def __repr__(self) -> str:
        return f"<DevicePostureStatus device={self.device_id} checkpoint={self.checkpoint_id} status={self.status}>"


class AccessAttempt(Base):
    __tablename__ = "access_attempts"

    attempt_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True
    )
    user_id: uuid.UUID = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False)
    device_id: uuid.UUID = Column(UUID(as_uuid=True), ForeignKey("devices.device_id"), nullable=True)
    ip_address: str = Column(String(64), nullable=True)
    geo_location: dict | None = Column(JSON, nullable=True)
    timestamp: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)
    result: AttemptResultEnum = Column(PgEnum(AttemptResultEnum), nullable=False, default=AttemptResultEnum.REVIEW)
    reason: str = Column(Text, nullable=True)

    # Relationships
    user = relationship("User", back_populates="attempts")
    device = relationship("Device", back_populates="attempts")
    trust_score = relationship(
        "TrustScore", uselist=False, back_populates="attempt", cascade="all, delete-orphan"
    )
    alerts = relationship(
        "Alert", back_populates="attempt", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<AccessAttempt {self.attempt_id} result={self.result}>"


class TrustFactor(Base):
    __tablename__ = "trust_factors"

    factor_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True
    )
    name: str = Column(String(128), unique=True, nullable=False)
    description: str = Column(Text, nullable=True)

    # Relationships
    score_details = relationship(
        "TrustScoreDetail", back_populates="factor", cascade="all, delete-orphan"
    )
    policy_weights = relationship(
        "PolicyFactorWeight", back_populates="factor", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<TrustFactor {self.name}>"


class TrustScore(Base):
    __tablename__ = "trust_scores"

    attempt_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("access_attempts.attempt_id"), primary_key=True
    )
    policy_id: uuid.UUID = Column(UUID(as_uuid=True), ForeignKey("policies.policy_id"), nullable=True)
    total_score: float = Column(Float, nullable=False)
    decision: DecisionEnum = Column(PgEnum(DecisionEnum), nullable=False)
    calculated_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    attempt = relationship("AccessAttempt", back_populates="trust_score")
    policy = relationship("Policy", back_populates="trust_scores")
    details = relationship(
        "TrustScoreDetail",
        back_populates="trust_score",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<TrustScore attempt={self.attempt_id} score={self.total_score}>"


class TrustScoreDetail(Base):
    __tablename__ = "trust_score_details"
    __table_args__ = (
        UniqueConstraint("attempt_id", "factor_id", name="uix_attempt_factor"),
    )

    id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    attempt_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("trust_scores.attempt_id"), nullable=False
    )
    factor_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("trust_factors.factor_id"), nullable=False
    )
    score_contribution: float = Column(Float, nullable=False)

    # Relationships
    trust_score = relationship("TrustScore", back_populates="details")
    factor = relationship("TrustFactor", back_populates="score_details")

    def __repr__(self) -> str:
        return f"<TrustScoreDetail attempt={self.attempt_id} factor={self.factor_id} contribution={self.score_contribution}>"


class Policy(Base):
    __tablename__ = "policies"

    policy_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True
    )
    user_id: uuid.UUID = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False)
    policy_name: str = Column(String(128), unique=True, nullable=False)
    min_trust_threshold: float = Column(Float, nullable=False)
    description: str = Column(Text, nullable=True)
    target_group: str = Column(String(64), nullable=True)  # can be enum or FK to group table
    created_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active: bool = Column(Boolean, default=True, nullable=False)

    # Relationships
    author = relationship("User", back_populates="policies")
    trust_scores = relationship("TrustScore", back_populates="policy")
    factor_weights = relationship(
        "PolicyFactorWeight",
        back_populates="policy",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Policy {self.policy_name}>"


class PolicyFactorWeight(Base):
    __tablename__ = "policy_factor_weights"
    __table_args__ = (
        UniqueConstraint("policy_id", "factor_id", name="uix_policy_factor"),
    )

    id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    policy_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("policies.policy_id"), nullable=False
    )
    factor_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("trust_factors.factor_id"), nullable=False
    )
    weight: float = Column(Float, nullable=False)

    # Relationships
    policy = relationship("Policy", back_populates="factor_weights")
    factor = relationship("TrustFactor", back_populates="policy_weights")

    def __repr__(self) -> str:
        return f"<PolicyFactorWeight policy={self.policy_id} factor={self.factor_id} weight={self.weight}>"


class Session(Base):
    __tablename__ = "sessions"

    session_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True
    )
    user_id: uuid.UUID = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False)
    device_id: uuid.UUID = Column(UUID(as_uuid=True), ForeignKey("devices.device_id"), nullable=True)
    created_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)
    expires_at: datetime = Column(DateTime(timezone=True), nullable=False)
    trust_score_snapshot: float = Column(Float, nullable=True)
    status: SessionStatusEnum = Column(PgEnum(SessionStatusEnum), nullable=False, default=SessionStatusEnum.ACTIVE)

    # Relationships
    user = relationship("User", back_populates="sessions")
    device = relationship("Device", back_populates="sessions")

    def __repr__(self) -> str:
        return f"<Session {self.session_id} status={self.status}>"


class Alert(Base):
    __tablename__ = "alerts"

    alert_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True
    )
    attempt_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("access_attempts.attempt_id"), nullable=False
    )
    severity: SeverityEnum = Column(PgEnum(SeverityEnum), nullable=False)
    message: str = Column(Text, nullable=False)
    created_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)
    acknowledged_by: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=True
    )
    acknowledged_at: datetime = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    attempt = relationship("AccessAttempt", back_populates="alerts")
    acknowledged_user = relationship("User")

    def __repr__(self) -> str:
        return f"<Alert {self.alert_id} severity={self.severity}>"


class AuditLog(Base):
    __tablename__ = "audit_logs"

    log_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True
    )
    user_id: uuid.UUID = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False)
    entity_type: str = Column(String(64), nullable=False)
    entity_id: str = Column(String(64), nullable=False)
    action: str = Column(String(64), nullable=False)
    before_data: dict | None = Column(JSON, nullable=True)
    after_data: dict | None = Column(JSON, nullable=True)
    timestamp: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="audit_logs")

    def __repr__(self) -> str:
        return f"<AuditLog {self.entity_type} {self.action}>"


class RemoteNetwork(Base):
    __tablename__ = "remote_networks"

    network_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True
    )
    name: str = Column(String(128), unique=True, nullable=False)
    cidr_range: str = Column(String(64), nullable=False)
    location: str = Column(String(128), nullable=True)
    status: NetworkStatusEnum = Column(PgEnum(NetworkStatusEnum), default=NetworkStatusEnum.ACTIVE)
    connector_health: NetworkHealthEnum = Column(
        PgEnum(NetworkHealthEnum), default=NetworkHealthEnum.GREEN
    )
    created_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    resources = relationship(
        "Resource",
        back_populates="network",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<RemoteNetwork {self.name}>"


class Resource(Base):
    __tablename__ = "resources"

    resource_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True
    )
    network_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("remote_networks.network_id"), nullable=False
    )
    name: str = Column(String(128), nullable=False)
    description: str = Column(Text, nullable=True)
    resource_type: str = Column(String(64), nullable=True, default="server")
    ip_address: str = Column(String(64), nullable=True)
    port: int = Column(Numeric, nullable=True)
    # Phase 1: explicit, slug-addressable target. When set these take
    # precedence over (ip_address, port) for the /r/<slug> data path.
    slug: str = Column(String(128), nullable=True, unique=True, index=True)
    target_host: str = Column(String(255), nullable=True)
    target_port: int = Column(Numeric, nullable=True)
    target_scheme: str = Column(String(16), nullable=True, default="http")
    path_prefix: str = Column(String(255), nullable=True)
    connector_status: ConnectorStatusEnum = Column(
        PgEnum(ConnectorStatusEnum), default=ConnectorStatusEnum.UP
    )
    last_checked: datetime = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    network = relationship("RemoteNetwork", back_populates="resources")

    def __repr__(self) -> str:
        return f"<Resource {self.name} status={self.connector_status}>"


class DeviceEnrollment(Base):
    """A ModZero desktop client enrolled to a user.

    Stores a per-device HMAC secret used to sign posture payloads
    submitted by the desktop client to /api/resource-access/gate.
    The plaintext secret is returned exactly once at enrollment time.
    """
    __tablename__ = "device_enrollments"

    device_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True
    )
    user_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False, index=True
    )
    hmac_secret: str = Column(String(128), nullable=False)
    device_name: str = Column(String(128), nullable=True)
    os: str = Column(String(64), nullable=True)
    os_version: str = Column(String(64), nullable=True)
    enrolled_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)
    last_seen_at: datetime = Column(DateTime(timezone=True), nullable=True)
    revoked: bool = Column(Boolean, default=False, nullable=False)

    def __repr__(self) -> str:
        return f"<DeviceEnrollment {self.device_id} user={self.user_id}>"


class TrustSnapshot(Base):
    """Server-computed trust snapshot per (user, device, resource).

    Persisted by /api/resource-access/gate after verifying a signed
    posture payload. /r/<slug> reads the latest row to re-check trust
    on every protected request.
    """
    __tablename__ = "trust_snapshots"

    snapshot_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True
    )
    user_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False, index=True
    )
    device_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("device_enrollments.device_id"), nullable=True, index=True
    )
    resource_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("resources.resource_id"), nullable=False, index=True
    )
    score: int = Column(Numeric, nullable=False)
    threshold: int = Column(Numeric, nullable=False)
    posture_json: dict = Column(JSON, nullable=True)
    computed_at: datetime = Column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True
    )

    def __repr__(self) -> str:
        return f"<TrustSnapshot user={self.user_id} res={self.resource_id} score={self.score}>"


class AccessDecisionEnum(str, Enum):
    ALLOW = "allow"
    DENY = "deny"


class AccessDecision(Base):
    """Append-only audit log of every access decision made by ModZero.

    Written by /api/resource-access/gate (one row per call) and by
    /r/<slug> (one row per protected request).
    """
    __tablename__ = "access_decisions"

    decision_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True
    )
    user_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=True, index=True
    )
    device_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("device_enrollments.device_id"), nullable=True, index=True
    )
    resource_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("resources.resource_id"), nullable=True, index=True
    )
    decision: AccessDecisionEnum = Column(
        PgEnum(AccessDecisionEnum, name="access_decision_enum"),
        nullable=False,
    )
    reason: str = Column(Text, nullable=True)
    path: str = Column(String(512), nullable=True)
    ts: datetime = Column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True
    )

    def __repr__(self) -> str:
        return f"<AccessDecision {self.decision} res={self.resource_id} ts={self.ts}>"


class Template(Base):
    __tablename__ = "templates"

    template_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True
    )
    name: str = Column(String(128), unique=True, nullable=False)
    subject: str = Column(String(255), nullable=False)
    body: str = Column(Text, nullable=False)
    type: str = Column(String(64), default="email")  # could be email, notification
    created_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<Template {self.name}>"


class CachedGraphDataTypeEnum(str, Enum):
    """Types of cached Graph API data."""
    TENANT_INFO = "tenant_info"
    USERS = "users"
    MANAGED_DEVICES = "managed_devices"
    SIGN_IN_LOGS = "sign_in_logs"
    RISKY_USERS = "risky_users"
    CONDITIONAL_ACCESS = "conditional_access"
    AUTH_METHODS = "auth_methods"
    OVERVIEW_STATS = "overview_stats"
    IDENTITY_ASSESSMENT = "identity_assessment"
    DEVICE_ASSESSMENT = "device_assessment"


class SecurityTestTypeEnum(str, Enum):
    """Types of security tests."""
    IDENTITY = "identity"
    DEVICES = "devices"


class TestStatusEnum(str, Enum):
    """Status of security tests."""
    PASSED = "passed"
    FAILED = "failed"
    INVESTIGATE = "investigate"
    SKIPPED = "skipped"
    PLANNED = "planned"


class RiskLevelEnum(str, Enum):
    """Risk level of security tests."""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class CachedGraphData(Base):
    """Cache table for Microsoft Graph API data.
    
    Stores JSON responses from Graph API with expiry tracking.
    Default expiry is 1 hour.
    """
    __tablename__ = "cached_graph_data"

    id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True
    )
    data_type: CachedGraphDataTypeEnum = Column(
        PgEnum(CachedGraphDataTypeEnum), nullable=False, unique=True
    )
    data_json: dict = Column(JSON, nullable=False)
    last_synced: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)
    expires_at: datetime = Column(DateTime(timezone=True), nullable=False)
    sync_status: str = Column(String(32), default="success")  # success, error, pending
    error_message: str = Column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<CachedGraphData {self.data_type} synced={self.last_synced}>"
    
    @property
    def is_expired(self) -> bool:
        """Check if cached data has expired."""
        return datetime.utcnow() > self.expires_at


# ============================================================================
# SECURITY ASSESSMENT MODELS
# ============================================================================

class SecurityTestDefinition(Base):
    """Master definition of security tests from Zero Trust assessment.
    
    This table stores the definitions of all available security tests
    (both identity and devices). These are populated from the official
    Microsoft Zero Trust assessment data.
    
    Note: Regular users can only READ these definitions. Only admins
    can update/modify the test definitions.
    """
    __tablename__ = "security_test_definitions"

    test_id: str = Column(String(32), primary_key=True)  # e.g., "21770", "RMD_001"
    test_type: SecurityTestTypeEnum = Column(
        PgEnum(SecurityTestTypeEnum), nullable=False
    )
    title: str = Column(String(512), nullable=False)
    category: str = Column(String(128), nullable=False)
    sfi_pillar: str = Column(String(256), nullable=True)  # SFI = Secure Future Initiative
    risk: RiskLevelEnum = Column(PgEnum(RiskLevelEnum), nullable=False)
    description: str = Column(Text, nullable=False)
    user_impact: str = Column(String(32), nullable=True)  # High, Medium, Low
    implementation_cost: str = Column(String(32), nullable=True)  # High, Medium, Low
    remediation_guidance: str = Column(Text, nullable=True)
    reference_url: str = Column(String(512), nullable=True)
    is_active: bool = Column(Boolean, default=True, nullable=False)
    created_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    results = relationship(
        "SecurityTestResult",
        back_populates="test_definition",
        cascade="all, delete-orphan"
    )
    overrides = relationship(
        "SecurityTestOverride",
        back_populates="test_definition",
        cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<SecurityTestDefinition {self.test_id} {self.title[:50]}>"


class SecurityTestResult(Base):
    """Results of security tests run against the tenant.
    
    Each time an assessment is run, results are stored here. This allows
    tracking progress over time.
    
    Note: Regular users can only READ these results. Only system processes
    and admins can create/update results.
    """
    __tablename__ = "security_test_results"

    result_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True
    )
    test_id: str = Column(
        String(32), ForeignKey("security_test_definitions.test_id"), nullable=False
    )
    assessment_run_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("assessment_runs.run_id"), nullable=False
    )
    status: TestStatusEnum = Column(PgEnum(TestStatusEnum), nullable=False)
    test_result_detail: str = Column(Text, nullable=True)  # Details about what was found
    raw_data: dict = Column(JSON, nullable=True)  # Raw API response data
    evaluated_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    test_definition = relationship("SecurityTestDefinition", back_populates="results")
    assessment_run = relationship("AssessmentRun", back_populates="results")

    def __repr__(self) -> str:
        return f"<SecurityTestResult {self.test_id} status={self.status}>"


class AssessmentRun(Base):
    """Record of each assessment run.
    
    Tracks when assessments were run and by whom.
    """
    __tablename__ = "assessment_runs"

    run_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True
    )
    test_type: SecurityTestTypeEnum = Column(
        PgEnum(SecurityTestTypeEnum), nullable=False
    )
    initiated_by: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=True
    )
    started_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)
    completed_at: datetime = Column(DateTime(timezone=True), nullable=True)
    status: str = Column(String(32), default="running")  # running, completed, failed
    total_tests: int = Column(Numeric, default=0)
    passed_count: int = Column(Numeric, default=0)
    failed_count: int = Column(Numeric, default=0)
    investigate_count: int = Column(Numeric, default=0)
    error_message: str = Column(Text, nullable=True)

    # Relationships
    initiated_by_user = relationship("User")
    results = relationship(
        "SecurityTestResult",
        back_populates="assessment_run",
        cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<AssessmentRun {self.run_id} type={self.test_type} status={self.status}>"


class SecurityTestOverride(Base):
    """Override status or configuration for specific tests.
    
    Admins can override test results (e.g., mark as accepted risk,
    not applicable, etc.). This provides audit trail of such decisions.
    
    Note: Only admins can create/modify overrides. Regular users are 
    READ-ONLY for this table.
    """
    __tablename__ = "security_test_overrides"

    override_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True
    )
    test_id: str = Column(
        String(32), ForeignKey("security_test_definitions.test_id"), nullable=False
    )
    override_status: str = Column(String(64), nullable=False)  # accepted_risk, not_applicable, in_progress
    justification: str = Column(Text, nullable=False)  # Required explanation
    created_by: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False
    )
    approved_by: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=True
    )
    expires_at: datetime = Column(DateTime(timezone=True), nullable=True)  # Optional expiry for temporary overrides
    created_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active: bool = Column(Boolean, default=True, nullable=False)

    # Relationships
    test_definition = relationship("SecurityTestDefinition", back_populates="overrides")
    created_by_user = relationship("User", foreign_keys=[created_by])
    approved_by_user = relationship("User", foreign_keys=[approved_by])

    def __repr__(self) -> str:
        return f"<SecurityTestOverride {self.test_id} status={self.override_status}>"


class SecurityTestComment(Base):
    """Comments and notes on security tests.
    
    Users can add comments to discuss test results, remediation progress,
    or document decisions.
    
    Note: Regular users can READ all comments but can only CREATE comments
    for viewing. Only admins can DELETE comments.
    """
    __tablename__ = "security_test_comments"

    comment_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True
    )
    test_id: str = Column(
        String(32), ForeignKey("security_test_definitions.test_id"), nullable=False
    )
    user_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False
    )
    comment: str = Column(Text, nullable=False)
    created_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    is_deleted: bool = Column(Boolean, default=False, nullable=False)  # Soft delete

    # Relationships
    user = relationship("User")

    def __repr__(self) -> str:
        return f"<SecurityTestComment {self.test_id} by user={self.user_id}>"


class RemediationTask(Base):
    """Remediation tasks for failed security tests.
    
    When tests fail, admins can create remediation tasks to track
    the work needed to fix the issue.
    
    Note: Only admins can CREATE/UPDATE/DELETE tasks. Regular users
    can only READ tasks assigned to them or in their scope.
    """
    __tablename__ = "remediation_tasks"

    task_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True
    )
    test_id: str = Column(
        String(32), ForeignKey("security_test_definitions.test_id"), nullable=False
    )
    title: str = Column(String(256), nullable=False)
    description: str = Column(Text, nullable=True)
    assigned_to: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=True
    )
    created_by: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False
    )
    priority: str = Column(String(32), default="medium")  # high, medium, low
    status: str = Column(String(32), default="open")  # open, in_progress, completed, cancelled
    due_date: datetime = Column(DateTime(timezone=True), nullable=True)
    completed_at: datetime = Column(DateTime(timezone=True), nullable=True)
    created_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    assigned_to_user = relationship("User", foreign_keys=[assigned_to])
    created_by_user = relationship("User", foreign_keys=[created_by])

    def __repr__(self) -> str:
        return f"<RemediationTask {self.task_id} test={self.test_id} status={self.status}>"

class DetectionModeEnum(str, Enum):
    """Detection modes for custom tests."""
    MANUAL = "manual"
    GRAPH_QUERY = "graph_query"
    CHECKLIST = "checklist"


class EnforcementModeEnum(str, Enum):
    """Enforcement mode for custom policies."""
    INFORMATIONAL = "informational"
    ENFORCED = "enforced"


class PolicyTypeEnum(str, Enum):
    """Type of policy/test."""
    BUILTIN = "builtin"
    CUSTOM = "custom"


class UserTestConfiguration(Base):
    """User-specific test configuration.
    
    Stores user customizations for security tests:
    - Enable/disable status for any test
    - Custom tests created by users
    - Action status (planned, completed, risk_accepted, etc.)
    - Weight overrides
    
    For default tests, test_id references security_test_definitions.
    For custom tests, is_custom=True and all fields are user-defined.
    """
    __tablename__ = "user_test_configurations"
    __table_args__ = (
        UniqueConstraint("user_id", "test_id", name="uix_user_test"),
    )

    config_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True
    )
    user_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False
    )
    test_id: str = Column(String(64), nullable=False)  # Can be default test ID or custom test ID
    
    # Test metadata (for custom tests or overrides)
    is_custom: bool = Column(Boolean, default=False, nullable=False)
    title: str = Column(String(512), nullable=True)  # Required for custom tests
    description: str = Column(Text, nullable=True)
    pillar: str = Column(String(32), nullable=True)  # identity, devices
    category: str = Column(String(128), nullable=True)
    risk: str = Column(String(32), nullable=True)  # high, medium, low
    
    # User-defined status and settings
    is_enabled: bool = Column(Boolean, default=True, nullable=False)
    action_status: str = Column(String(64), default="to_address")  # to_address, planned, completed, etc.
    action_notes: str = Column(Text, nullable=True)
    weight_override: float = Column(Float, nullable=True)  # Custom weight 0-100
    
    # Detection mode configuration (for custom tests)
    detection_mode: DetectionModeEnum = Column(
        PgEnum(DetectionModeEnum), nullable=True
    )
    graph_query_config: dict = Column(JSON, nullable=True)  # For graph_query mode
    checklist_config: dict = Column(JSON, nullable=True)  # For checklist mode
    
    # Test result tracking
    last_test_result: str = Column(String(32), nullable=True)  # passed, failed, investigate, not_run
    last_run_at: datetime = Column(DateTime(timezone=True), nullable=True)
    last_run_data: dict = Column(JSON, nullable=True)  # Raw API response
    
    # Timestamps
    created_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User")

    def __repr__(self) -> str:
        return f"<UserTestConfiguration {self.test_id} user={self.user_id} custom={self.is_custom}>"


class PillarWeightConfiguration(Base):
    """User-specific pillar weight configuration.
    
    Stores the pillar-level weight configuration (should sum to 100).
    """
    __tablename__ = "pillar_weight_configurations"
    __table_args__ = (
        UniqueConstraint("user_id", "pillar", name="uix_user_pillar"),
    )

    config_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True
    )
    user_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False
    )
    pillar: str = Column(String(32), nullable=False)  # identity, devices, data, apps, infrastructure
    weight: float = Column(Float, nullable=False, default=20)
    created_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User")

    def __repr__(self) -> str:
        return f"<PillarWeightConfiguration {self.pillar}={self.weight} user={self.user_id}>"


# ============================================================================
# CUSTOM POLICY MODELS
# ============================================================================

class CustomPolicy(Base):
    """Customer-defined security policies and tests.
    
    Separate from built-in SecurityTestDefinition checks. Custom policies
    represent organization-specific enforced rules or thresholds that
    complement the built-in Microsoft-inspired baseline checks.
    
    Built-in checks = recommended posture/security assessment (read-only)
    Custom policies = customer-specific enforced rules or thresholds (CRUD)
    """
    __tablename__ = "custom_policies"

    policy_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True
    )
    title: str = Column(String(512), nullable=False)
    description: str = Column(Text, nullable=True)
    pillar: str = Column(String(32), nullable=False)  # identity, devices, data, apps, infrastructure
    category: str = Column(String(128), nullable=True)
    module: str = Column(String(128), nullable=True)  # Grouping module (e.g., "MFA", "Conditional Access")
    scope: str = Column(String(256), nullable=True)  # What this policy applies to (e.g., "All Users", "Admins Only")

    # Enforcement
    enforcement_mode: EnforcementModeEnum = Column(
        PgEnum(EnforcementModeEnum, name="enforcementmodeenum"),
        default=EnforcementModeEnum.INFORMATIONAL,
        nullable=False,
    )
    is_enabled: bool = Column(Boolean, default=True, nullable=False)
    risk: str = Column(String(32), nullable=True)  # high, medium, low
    severity: str = Column(String(32), nullable=True)  # critical, high, medium, low

    # Detection configuration
    detection_mode: DetectionModeEnum = Column(
        PgEnum(DetectionModeEnum), nullable=True
    )
    graph_query_config: dict = Column(JSON, nullable=True)
    checklist_config: dict = Column(JSON, nullable=True)
    threshold_config: dict = Column(JSON, nullable=True)  # For threshold-based evaluation
    # Example threshold_config: {"metric": "mfa_coverage", "operator": "gte", "value": 95, "unit": "percent"}

    # Result tracking
    last_test_result: str = Column(String(32), nullable=True)  # passed, failed, investigate, not_run
    last_run_at: datetime = Column(DateTime(timezone=True), nullable=True)
    last_run_data: dict = Column(JSON, nullable=True)

    # Audit
    created_by: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False
    )
    created_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    created_by_user = relationship("User")

    def __repr__(self) -> str:
        return f"<CustomPolicy {self.policy_id} title={self.title[:50]} enforcement={self.enforcement_mode}>"


# ============================================================================
# CONNECTOR MODELS
# ============================================================================

class EnrollTokenStatusEnum(str, Enum):
    ACTIVE = "active"
    USED = "used"
    EXPIRED = "expired"
    REVOKED = "revoked"


class ConnectorOnlineStatusEnum(str, Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    DEGRADED = "degraded"


class ResourceProtocolEnum(str, Enum):
    HTTP = "http"
    HTTPS = "https"
    TCP = "tcp"


class EnrollToken(Base):
    """One-time enrollment tokens for connector registration.

    The token value is stored as a SHA-256 hash — the plaintext is shown
    only once at creation time and never persisted.
    """
    __tablename__ = "enroll_tokens"

    token_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True
    )
    token_hash: str = Column(String(128), nullable=False, unique=True)
    network: str = Column(String(128), nullable=False, default="default")
    status: EnrollTokenStatusEnum = Column(
        PgEnum(EnrollTokenStatusEnum, name="enrolltokenstatusenum"),
        default=EnrollTokenStatusEnum.ACTIVE,
    )
    created_by: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False
    )
    expires_at: datetime = Column(DateTime(timezone=True), nullable=False)
    used_at: datetime = Column(DateTime(timezone=True), nullable=True)
    used_by_connector_id: uuid.UUID = Column(
        UUID(as_uuid=True), nullable=True
    )
    created_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    created_by_user = relationship("User")

    def __repr__(self) -> str:
        return f"<EnrollToken {self.token_id} status={self.status}>"


class Connector(Base):
    """Registered connectors that proxy traffic to internal resources."""
    __tablename__ = "connectors"

    connector_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True
    )
    name: str = Column(String(256), nullable=False)
    secret_hash: str = Column(String(128), nullable=False)
    network: str = Column(String(128), nullable=False, default="default")
    hostname: str = Column(String(256), nullable=True)
    ip_address: str = Column(String(64), nullable=True)
    version: str = Column(String(32), nullable=True)
    status: ConnectorOnlineStatusEnum = Column(
        PgEnum(ConnectorOnlineStatusEnum, name="connectoronlinestatusenum"),
        default=ConnectorOnlineStatusEnum.OFFLINE,
    )
    labels: dict = Column(JSON, default=dict)
    uptime: int = Column(Numeric, default=0)
    last_heartbeat: datetime = Column(DateTime(timezone=True), nullable=True)
    deployed_by: str = Column(String(64), default="docker")
    created_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    assigned_resources = relationship(
        "ConnectorResource",
        back_populates="connector",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Connector {self.name} status={self.status}>"


class ConnectorResource(Base):
    """Resources assigned to a connector for proxying.

    Each resource defines a target host/port that the connector should
    forward traffic to.
    """
    __tablename__ = "connector_resources"

    resource_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True
    )
    connector_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("connectors.connector_id"), nullable=True
    )
    network: str = Column(String(128), nullable=False, default="default")
    name: str = Column(String(256), nullable=False)
    protocol: ResourceProtocolEnum = Column(
        PgEnum(ResourceProtocolEnum, name="resourceprotocolenum"),
        default=ResourceProtocolEnum.HTTP,
    )
    target_host: str = Column(String(256), nullable=False)
    target_port: int = Column(Numeric, nullable=False, default=80)
    path_prefix: str = Column(String(256), nullable=True, default="")
    is_active: bool = Column(Boolean, default=True, nullable=False)
    created_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    connector = relationship("Connector", back_populates="assigned_resources")
    policy_bindings = relationship(
        "PolicyBinding",
        back_populates="resource",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<ConnectorResource {self.name} -> {self.target_host}:{self.target_port}>"


class PolicyBinding(Base):
    """Binds a policy to a connector resource.

    Determines which access policies apply to a particular resource.
    """
    __tablename__ = "policy_bindings"

    binding_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True
    )
    resource_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("connector_resources.resource_id"), nullable=False
    )
    policy_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("policies.policy_id"), nullable=False
    )
    created_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    resource = relationship("ConnectorResource", back_populates="policy_bindings")
    policy = relationship("Policy")

    def __repr__(self) -> str:
        return f"<PolicyBinding resource={self.resource_id} policy={self.policy_id}>"


class ConnectorAccessLog(Base):
    """Audit trail for access attempts through connectors."""
    __tablename__ = "connector_access_logs"

    log_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True
    )
    connector_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("connectors.connector_id"), nullable=False
    )
    resource_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("connector_resources.resource_id"), nullable=True
    )
    user_id: str = Column(String(256), nullable=True)
    device_id: str = Column(String(256), nullable=True)
    decision: DecisionEnum = Column(PgEnum(DecisionEnum), nullable=False)
    trust_score: float = Column(Float, nullable=True)
    source_ip: str = Column(String(64), nullable=True)
    target_host: str = Column(String(256), nullable=True)
    target_port: int = Column(Numeric, nullable=True)
    request_path: str = Column(String(512), nullable=True)
    request_method: str = Column(String(16), nullable=True)
    response_status: int = Column(Numeric, nullable=True)
    reason: str = Column(Text, nullable=True)
    timestamp: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<ConnectorAccessLog {self.log_id} decision={self.decision}>"


# ── Device Posture & Trust Score (foundation) ────────────────────────────────

class PostureReport(Base):
    """Raw posture report submitted by the client app for a device."""
    __tablename__ = "posture_reports"

    report_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    device_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("devices.device_id"), nullable=False
    )
    reported_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)

    # The five posture factors for this phase
    firewall_enabled: bool = Column(Boolean, nullable=True)
    antivirus_enabled: bool = Column(Boolean, nullable=True)
    disk_encryption_enabled: bool = Column(Boolean, nullable=True)
    os_supported: bool = Column(Boolean, nullable=True)
    # Accepted from Graph /deviceManagement lookup or passed as manual placeholder
    intune_compliant: bool = Column(Boolean, nullable=True)

    # Client IP for context scoring later
    ip_address: str = Column(String(64), nullable=True)

    device = relationship("Device", back_populates="posture_reports")
    trust_score = relationship(
        "DeviceTrustScore", uselist=False, back_populates="report"
    )

    def __repr__(self) -> str:
        return f"<PostureReport {self.report_id} device={self.device_id}>"


class DeviceTrustScore(Base):
    """Per-device trust score calculated from a PostureReport.

    Kept separate from the legacy TrustScore (which is tied to AccessAttempt)
    so the posture foundation can evolve independently.

    Formula:  total = posture_score * 0.80 + context_score * 0.20
    """
    __tablename__ = "device_trust_scores"

    score_id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    device_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("devices.device_id"), nullable=False
    )
    report_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("posture_reports.report_id"), nullable=True
    )

    # Component scores (0–100 each)
    posture_score: float = Column(Float, nullable=False)
    context_score: float = Column(Float, nullable=False, default=100.0)

    # Weighted total: posture*0.8 + context*0.2
    total_score: float = Column(Float, nullable=False)

    # Factor-level breakdown stored as JSON for audit / UI display
    breakdown: dict = Column(JSON, nullable=True)

    calculated_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)

    device = relationship("Device", back_populates="device_trust_scores")
    report = relationship("PostureReport", back_populates="trust_score")

    def __repr__(self) -> str:
        return f"<DeviceTrustScore {self.score_id} total={self.total_score}>"


# ── Protected Resource & Access Policy (foundation) ──────────────────────────

class ProtectedResource(Base):
    """A resource exposed via ModZero, addressable by public_name."""
    __tablename__ = "protected_resources"

    id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: str = Column(String(128), nullable=False)
    description: str = Column(Text, nullable=True)
    resource_type: str = Column(String(32), nullable=False, default="web")  # web, ssh, rdp, database, api
    internal_address: str = Column(String(255), nullable=True)
    public_name: str = Column(String(128), nullable=True, unique=True, index=True)
    required_group: str = Column(String(128), nullable=True)
    minimum_trust_score: float = Column(Float, nullable=False, default=0.0)
    require_intune_compliant: bool = Column(Boolean, nullable=False, default=False)
    enabled: bool = Column(Boolean, nullable=False, default=True)
    # Optional link to a ConnectorResource — when set, access requires the connector to be online
    connector_resource_id: uuid.UUID = Column(
        UUID(as_uuid=True),
        ForeignKey("connector_resources.resource_id", ondelete="SET NULL"),
        nullable=True,
    )
    preferred_access_mode: str = Column(String(32), nullable=False, default="auto", server_default="auto")
    require_tunnel: bool = Column(Boolean, nullable=False, default=False)
    allow_http_fallback: bool = Column(Boolean, nullable=False, default=True)
    created_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    policies = relationship(
        "AccessPolicy", back_populates="resource", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<ProtectedResource {self.name} type={self.resource_type}>"


class AccessPolicy(Base):
    """Per-resource access policy. Optional layer on top of resource defaults."""
    __tablename__ = "access_policies"

    id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: str = Column(String(128), nullable=False)
    resource_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("protected_resources.id"), nullable=False
    )
    required_group: str = Column(String(128), nullable=True)
    minimum_trust_score: float = Column(Float, nullable=False, default=0.0)
    require_intune_compliant: bool = Column(Boolean, nullable=False, default=False)
    enabled: bool = Column(Boolean, nullable=False, default=True)
    created_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    resource = relationship("ProtectedResource", back_populates="policies")

    def __repr__(self) -> str:
        return f"<AccessPolicy {self.name} resource={self.resource_id}>"


class AccessRequestLog(Base):
    """Audit log for every access decision made via /api/access/request."""
    __tablename__ = "access_request_logs"

    id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False, index=True
    )
    device_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("devices.device_id"), nullable=True, index=True
    )
    resource_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("protected_resources.id"), nullable=True, index=True
    )
    decision: str = Column(String(16), nullable=False)  # allow | deny
    reason: str = Column(Text, nullable=True)
    trust_score: float = Column(Float, nullable=True)
    timestamp: datetime = Column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True
    )
    access_mode: str = Column(String(32), nullable=True)
    tunnel_ready: bool = Column(Boolean, nullable=True)
    tunnel_reason: str = Column(String(255), nullable=True)
    fallback_used: bool = Column(Boolean, nullable=True)
    require_tunnel_at_decision: bool = Column(Boolean, nullable=True)

    def __repr__(self) -> str:
        return f"<AccessRequestLog {self.id} {self.decision} res={self.resource_id}>"


class AccessSession(Base):
    """Short-lived access grant created when an access request is allowed.

    The raw session token is shown once at creation and stored only as a
    SHA-256 hash.  Connectors call /connectors/access/introspect to validate
    a token before proxying traffic.
    """
    __tablename__ = "access_sessions"

    id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False, index=True
    )
    device_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("devices.device_id"), nullable=True
    )
    resource_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("protected_resources.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # No FK — connector may be deleted independently
    connector_id: uuid.UUID = Column(UUID(as_uuid=True), nullable=True)
    access_log_id: uuid.UUID = Column(
        UUID(as_uuid=True), ForeignKey("access_request_logs.id", ondelete="SET NULL"), nullable=True
    )
    session_token_hash: str = Column(String(128), nullable=False, unique=True)
    # status: active | expired | revoked  (plain string, avoids PgEnum migration)
    status: str = Column(String(16), nullable=False, default="active")
    created_at: datetime = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    expires_at: datetime = Column(DateTime(timezone=True), nullable=False)
    revoked_at: datetime = Column(DateTime(timezone=True), nullable=True)
    last_used_at: datetime = Column(DateTime(timezone=True), nullable=True)
    launch_code_hash: str = Column(String(64), nullable=True)
    launch_code_expires_at: datetime = Column(DateTime(timezone=True), nullable=True)
    launch_code_used: bool = Column(Boolean, default=False, nullable=True)

    def __repr__(self) -> str:
        return f"<AccessSession {self.id} status={self.status}>"


# ─── Phase 3 scaffold: Headscale / WireGuard foundation ──────────────────────
# Metadata-only tables. Populated by the connector's optional WG mode and the
# admin "Tunnels" page; not yet consulted by the access-decision or proxy flow.

class TunnelNode(Base):
    """One row per WireGuard node a connector advertises (metadata only)."""
    __tablename__ = "tunnel_nodes"

    id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    connector_id: uuid.UUID = Column(
        UUID(as_uuid=True),
        ForeignKey("connectors.connector_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    node_name: str = Column(String(256), nullable=False)
    node_key: str = Column(String(512), nullable=True)
    wireguard_ip: str = Column(String(64), nullable=True)
    headscale_node_id: str = Column(String(128), nullable=True)
    # status: pending | online | degraded | offline (validated in router)
    status: str = Column(String(32), nullable=False, default="pending")
    last_seen_at: datetime = Column(DateTime(timezone=True), nullable=True)
    created_at: datetime = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("connector_id", "node_name", name="uq_tunnel_nodes_connector_node"),
    )

    def __repr__(self) -> str:
        return f"<TunnelNode {self.node_name} status={self.status}>"


class TunnelRoute(Base):
    """Optional WireGuard subnet/host route attached to a connector."""
    __tablename__ = "tunnel_routes"

    id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    connector_id: uuid.UUID = Column(
        UUID(as_uuid=True),
        ForeignKey("connectors.connector_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    resource_id: uuid.UUID = Column(
        UUID(as_uuid=True),
        ForeignKey("protected_resources.id", ondelete="SET NULL"),
        nullable=True,
    )
    subnet_or_host: str = Column(String(256), nullable=False)
    # route_type: host | subnet (validated in router)
    route_type: str = Column(String(16), nullable=False, default="host")
    enabled: bool = Column(Boolean, nullable=False, default=False)
    # route lifecycle fields (added by g7h8i9j0k1l2 migration)
    route_status: str = Column(String(32), nullable=False, default="pending")
    advertise_command: str = Column(Text, nullable=True)
    headscale_route_id: str = Column(String(128), nullable=True)
    last_synced_at: datetime = Column(DateTime(timezone=True), nullable=True)
    updated_at: datetime = Column(
        DateTime(timezone=True),
        nullable=True,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    created_at: datetime = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<TunnelRoute {self.subnet_or_host} enabled={self.enabled}>"


class TunnelBootstrapLog(Base):
    """Audit row for an admin-issued bootstrap. Never stores the raw key."""

    __tablename__ = "tunnel_bootstrap_logs"

    id: uuid.UUID = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    connector_id: uuid.UUID = Column(
        UUID(as_uuid=True),
        ForeignKey("connectors.connector_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    requested_by_user_id: uuid.UUID = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    node_name: str = Column(String(256), nullable=False)
    # sha256 hex of the raw preauth key when one is created. Null in manual
    # mode and not_configured mode. The raw key is NEVER stored.
    auth_key_hash: str = Column(String(128), nullable=True)
    # manual | headscale_api | not_configured
    auth_key_mode: str = Column(String(32), nullable=False)
    # ok | not_configured
    status: str = Column(String(32), nullable=False)
    created_at: datetime = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    expires_at: datetime = Column(
        DateTime(timezone=True), nullable=True
    )

    def __repr__(self) -> str:
        return f"<TunnelBootstrapLog connector={self.connector_id} mode={self.auth_key_mode}>"


class TunnelRouteActionLog(Base):
    """Audit log for per-route admin actions (sync, advertise, approve)."""

    __tablename__ = "tunnel_route_action_logs"

    id: uuid.UUID = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    route_id: uuid.UUID = Column(
        UUID(as_uuid=True),
        ForeignKey("tunnel_routes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # action: sync / advertise_package / approve_attempt /
    #         approve_success / approve_failed / manual_required
    action: str = Column(String(32), nullable=False)
    requested_by_user_id: uuid.UUID = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    result: str = Column(Text, nullable=True)
    safe_message: str = Column(Text, nullable=True)
    created_at: datetime = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<TunnelRouteActionLog route={self.route_id} action={self.action}>"


class TunnelUserEnrollmentLog(Base):
    """Audit row for end-user tunnel enrollment requests. Never stores any key."""
    __tablename__ = "tunnel_user_enrollment_logs"

    id: uuid.UUID = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: uuid.UUID = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    device_id: uuid.UUID = Column(
        UUID(as_uuid=True),
        ForeignKey("devices.device_id", ondelete="SET NULL"),
        nullable=True,
    )
    node_name: str = Column(String(255), nullable=True)
    # disabled | not_configured | manual_required
    status: str = Column(String(32), nullable=False)
    created_at: datetime = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<TunnelUserEnrollmentLog user={self.user_id} status={self.status}>"


class TunnelAccessAuditLog(Base):
    """Audit log for tunnel-aware access decisions and related events."""
    __tablename__ = "tunnel_access_audit_logs"

    id: uuid.UUID = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    action: str = Column(String(64), nullable=False, index=True)
    user_id: uuid.UUID = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    device_id: uuid.UUID = Column(
        UUID(as_uuid=True),
        ForeignKey("devices.device_id", ondelete="SET NULL"),
        nullable=True,
    )
    resource_id: uuid.UUID = Column(
        UUID(as_uuid=True),
        ForeignKey("protected_resources.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    connector_id: uuid.UUID = Column(
        UUID(as_uuid=True),
        ForeignKey("connectors.connector_id", ondelete="SET NULL"),
        nullable=True,
    )
    access_log_id: uuid.UUID = Column(
        UUID(as_uuid=True),
        ForeignKey("access_request_logs.id", ondelete="SET NULL"),
        nullable=True,
    )
    safe_message: str = Column(Text, nullable=True)
    created_at: datetime = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    def __repr__(self) -> str:
        return f"<TunnelAccessAuditLog action={self.action} resource={self.resource_id}>"