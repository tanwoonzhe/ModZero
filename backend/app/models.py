"""SQLAlchemy models for the ModZero backend.

This module defines the database schema for the ModZero zero‑trust platform.  Each
class corresponds to a table in PostgreSQL.  UUIDs are used as primary keys to
avoid sequence guessing.  The relationships follow the improved ERD described
in the design document.  Only a subset of optional tables are included here; new
tables (e.g. device_software) can be added following the same pattern.
"""

from __future__ import annotations

import uuid
from datetime import datetime
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
    connector_status: ConnectorStatusEnum = Column(
        PgEnum(ConnectorStatusEnum), default=ConnectorStatusEnum.UP
    )
    last_checked: datetime = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    network = relationship("RemoteNetwork", back_populates="resources")

    def __repr__(self) -> str:
        return f"<Resource {self.name} status={self.connector_status}>"


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