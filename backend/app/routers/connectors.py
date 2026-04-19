"""Connector management API endpoints.

Provides:
  - POST /connectors/enroll          — one-time enroll token exchange
  - POST /connectors/{id}/heartbeat  — periodic status update
  - GET  /connectors/{id}/policies   — resource/policy list for a connector
  - GET  /connectors                 — list all connectors (dashboard)
  - POST /admin/connectors/tokens    — create enroll token
  - GET  /admin/connectors/tokens    — list enroll tokens
  - POST /admin/connectors/resources — create a connector resource
  - GET  /admin/connectors/resources — list connector resources
  - POST /auth/introspect            — token introspection for connectors
  - GET  /.well-known/jwks.json      — JWKS endpoint (stub)
"""

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from ..deps import get_db, get_current_admin
from ..models import (
    EnrollToken, EnrollTokenStatusEnum,
    Connector, ConnectorOnlineStatusEnum,
    ConnectorResource, ResourceProtocolEnum,
    PolicyBinding, ConnectorAccessLog,
    User,
)
from ..security import decode_access_token
from ..settings import get_settings

router = APIRouter()

# ─── Pydantic schemas ───────────────────────────────────────────────

class EnrollRequest(BaseModel):
    token: str
    network: str = "default"
    hostname: str = "unknown"
    deployed_by: str = "docker"
    version: str = "0.1.0"


class EnrollResponse(BaseModel):
    connector_id: str
    connector_secret: str
    message: str = "Enrollment successful"


class HeartbeatRequest(BaseModel):
    hostname: str = ""
    ip: str = ""
    version: str = ""
    labels: dict = {}
    uptime: int = 0
    status: str = "online"
    network: str = "default"


class HeartbeatResponse(BaseModel):
    status: str = "ok"
    server_time: str = ""


class ConnectorOut(BaseModel):
    connector_id: uuid.UUID
    name: str
    network: str
    hostname: Optional[str] = None
    ip_address: Optional[str] = None
    version: Optional[str] = None
    status: str
    labels: dict = {}
    uptime: int = 0
    last_heartbeat: Optional[datetime] = None
    deployed_by: str = "docker"
    created_at: datetime
    updated_at: datetime
    resources_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class CreateTokenRequest(BaseModel):
    network: str = "default"
    expires_minutes: int = Field(default=10, ge=1, le=1440)


class CreateTokenResponse(BaseModel):
    token_id: str
    token: str  # plaintext, shown only once
    network: str
    expires_at: datetime
    docker_command: str = ""
    curl_command: str = ""


class TokenOut(BaseModel):
    token_id: uuid.UUID
    network: str
    status: str
    created_at: datetime
    expires_at: datetime
    used_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ResourceCreateRequest(BaseModel):
    name: str
    network: str = "default"
    connector_id: Optional[str] = None
    protocol: str = "http"
    target_host: str
    target_port: int = 80
    path_prefix: str = ""


class ResourceOut(BaseModel):
    resource_id: uuid.UUID
    connector_id: Optional[uuid.UUID] = None
    network: str
    name: str
    protocol: str
    target_host: str
    target_port: int
    path_prefix: str = ""
    is_active: bool = True
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class IntrospectRequest(BaseModel):
    token: str


class IntrospectResponse(BaseModel):
    active: bool
    sub: Optional[str] = None
    exp: Optional[int] = None


class DeployCommandResponse(BaseModel):
    docker_command: str
    curl_command: str


# ─── Helpers ─────────────────────────────────────────────────────────

def _hash_token(token: str) -> str:
    """SHA-256 hash of a token string."""
    return hashlib.sha256(token.encode()).hexdigest()


def _generate_deploy_commands(token: str, network: str, controller_url: str) -> dict:
    """Generate docker run and curl|bash deployment commands."""
    rand = secrets.token_hex(4)
    docker_cmd = (
        f'docker run -d \\\n'
        f'  --env MODZERO_CONTROLLER_URL="{controller_url}" \\\n'
        f'  --env MODZERO_ENROLL_TOKEN="{token}" \\\n'
        f'  --env MODZERO_NETWORK="{network}" \\\n'
        f'  --env MODZERO_LABEL_HOSTNAME="$(hostname)" \\\n'
        f'  --env MODZERO_LABEL_DEPLOYED_BY="docker" \\\n'
        f'  --name "modzero-connector-{rand}" \\\n'
        f'  --restart=unless-stopped \\\n'
        f'  --pull=always \\\n'
        f'  modzero/connector:latest'
    )
    curl_cmd = (
        f'curl "{controller_url}/public/connector/setup.sh" | sudo \\\n'
        f'  MODZERO_CONTROLLER_URL="{controller_url}" \\\n'
        f'  MODZERO_ENROLL_TOKEN="{token}" \\\n'
        f'  MODZERO_NETWORK="{network}" \\\n'
        f'  MODZERO_LABEL_DEPLOYED_BY="linux" \\\n'
        f'  bash'
    )
    return {"docker_command": docker_cmd, "curl_command": curl_cmd}


def _verify_connector_auth(request: Request, db: Session) -> Connector:
    """Verify connector authentication via X-Connector-Id and X-Connector-Secret headers."""
    connector_id = request.headers.get("X-Connector-Id", "")
    connector_secret = request.headers.get("X-Connector-Secret", "")

    if not connector_id or not connector_secret:
        raise HTTPException(status_code=401, detail="Missing connector credentials")

    connector = db.query(Connector).filter(
        Connector.connector_id == connector_id
    ).first()
    if not connector:
        raise HTTPException(status_code=401, detail="Unknown connector")

    secret_hash = _hash_token(connector_secret)
    if connector.secret_hash != secret_hash:
        raise HTTPException(status_code=401, detail="Invalid connector secret")

    return connector


# ─── Enrollment ──────────────────────────────────────────────────────

@router.post("/connectors/enroll", status_code=201, response_model=EnrollResponse,
             tags=["connectors"])
def enroll_connector(body: EnrollRequest, db: Session = Depends(get_db)):
    """Exchange a one-time enroll token for permanent connector credentials."""
    token_hash = _hash_token(body.token)

    enroll_token = db.query(EnrollToken).filter(
        EnrollToken.token_hash == token_hash,
        EnrollToken.status == EnrollTokenStatusEnum.ACTIVE,
    ).first()

    if not enroll_token:
        raise HTTPException(status_code=401, detail="Invalid or expired enroll token")

    # Check expiry
    if enroll_token.expires_at < datetime.utcnow():
        enroll_token.status = EnrollTokenStatusEnum.EXPIRED
        db.commit()
        raise HTTPException(status_code=401, detail="Enroll token has expired")

    # Generate connector credentials
    connector_id = uuid.uuid4()
    connector_secret = secrets.token_urlsafe(48)
    secret_hash = _hash_token(connector_secret)

    connector_name = f"{body.hostname}-{body.network}"

    connector = Connector(
        connector_id=connector_id,
        name=connector_name,
        secret_hash=secret_hash,
        network=body.network,
        hostname=body.hostname,
        version=body.version,
        deployed_by=body.deployed_by,
        status=ConnectorOnlineStatusEnum.ONLINE,
        labels={"hostname": body.hostname, "deployed_by": body.deployed_by},
        last_heartbeat=datetime.utcnow(),
    )
    db.add(connector)

    # Mark token as used
    enroll_token.status = EnrollTokenStatusEnum.USED
    enroll_token.used_at = datetime.utcnow()
    enroll_token.used_by_connector_id = connector_id
    db.commit()

    return EnrollResponse(
        connector_id=str(connector_id),
        connector_secret=connector_secret,
    )


# ─── Heartbeat ───────────────────────────────────────────────────────

@router.post("/connectors/{connector_id}/heartbeat",
             response_model=HeartbeatResponse, tags=["connectors"])
def connector_heartbeat(
    connector_id: str,
    body: HeartbeatRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Receive heartbeat from a connector."""
    connector = _verify_connector_auth(request, db)

    if str(connector.connector_id) != connector_id:
        raise HTTPException(status_code=403, detail="Connector ID mismatch")

    connector.hostname = body.hostname or connector.hostname
    connector.ip_address = body.ip or connector.ip_address
    connector.version = body.version or connector.version
    connector.labels = body.labels or connector.labels
    connector.uptime = body.uptime
    connector.status = ConnectorOnlineStatusEnum.ONLINE
    connector.last_heartbeat = datetime.utcnow()
    connector.network = body.network or connector.network
    db.commit()

    return HeartbeatResponse(
        status="ok",
        server_time=datetime.utcnow().isoformat(),
    )


# ─── Policy/resource fetch ──────────────────────────────────────────

@router.get("/connectors/{connector_id}/policies", tags=["connectors"])
def get_connector_policies(
    connector_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Return the resources and policies assigned to this connector."""
    connector = _verify_connector_auth(request, db)

    if str(connector.connector_id) != connector_id:
        raise HTTPException(status_code=403, detail="Connector ID mismatch")

    resources = db.query(ConnectorResource).filter(
        ConnectorResource.is_active == True,
        (ConnectorResource.connector_id == connector.connector_id) |
        (ConnectorResource.network == connector.network),
    ).all()

    settings = get_settings()
    controller_url = str(settings.database_url).split("@")[0]  # placeholder

    resource_list = []
    for r in resources:
        resource_list.append({
            "resource_id": str(r.resource_id),
            "name": r.name,
            "protocol": r.protocol.value if hasattr(r.protocol, 'value') else r.protocol,
            "target_host": r.target_host,
            "target_port": int(r.target_port),
            "path_prefix": r.path_prefix or "",
        })

    return {
        "resources": resource_list,
        "jwks_url": "",  # will be populated when JWKS is configured
    }


# ─── List connectors (dashboard) ────────────────────────────────────

@router.get("/connectors", response_model=List[ConnectorOut], tags=["connectors"])
def list_connectors(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """List all registered connectors (admin only)."""
    connectors = db.query(Connector).order_by(Connector.created_at.desc()).all()

    result = []
    for c in connectors:
        # Check if connector is stale (no heartbeat in 60s → offline)
        if c.last_heartbeat:
            time_since = (datetime.utcnow() - c.last_heartbeat).total_seconds()
            if time_since > 60:
                c.status = ConnectorOnlineStatusEnum.OFFLINE
            elif time_since > 30:
                c.status = ConnectorOnlineStatusEnum.DEGRADED

        resources_count = db.query(ConnectorResource).filter(
            (ConnectorResource.connector_id == c.connector_id) |
            (ConnectorResource.network == c.network)
        ).count()

        out = ConnectorOut(
            connector_id=c.connector_id,
            name=c.name,
            network=c.network,
            hostname=c.hostname,
            ip_address=c.ip_address,
            version=c.version,
            status=c.status.value if hasattr(c.status, 'value') else c.status,
            labels=c.labels or {},
            uptime=int(c.uptime) if c.uptime else 0,
            last_heartbeat=c.last_heartbeat,
            deployed_by=c.deployed_by or "docker",
            created_at=c.created_at,
            updated_at=c.updated_at,
            resources_count=resources_count,
        )
        result.append(out)

    db.commit()  # persist any status changes
    return result


# ─── Admin: enroll tokens ───────────────────────────────────────────

@router.post("/admin/connectors/tokens", response_model=CreateTokenResponse,
             tags=["connectors-admin"])
def create_enroll_token(
    body: CreateTokenRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Create a one-time enrollment token for a new connector."""
    # Generate plaintext token
    plaintext_token = secrets.token_urlsafe(32)
    token_hash = _hash_token(plaintext_token)
    expires_at = datetime.utcnow() + timedelta(minutes=body.expires_minutes)

    enroll = EnrollToken(
        token_hash=token_hash,
        network=body.network,
        status=EnrollTokenStatusEnum.ACTIVE,
        created_by=current_user.user_id,
        expires_at=expires_at,
    )
    db.add(enroll)
    db.commit()
    db.refresh(enroll)

    # Generate deployment commands
    # Determine controller URL from request
    scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host", request.url.netloc)
    controller_url = f"{scheme}://{host}"

    commands = _generate_deploy_commands(plaintext_token, body.network, controller_url)

    return CreateTokenResponse(
        token_id=str(enroll.token_id),
        token=plaintext_token,
        network=body.network,
        expires_at=expires_at,
        docker_command=commands["docker_command"],
        curl_command=commands["curl_command"],
    )


@router.get("/admin/connectors/tokens", response_model=List[TokenOut],
            tags=["connectors-admin"])
def list_enroll_tokens(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """List all enrollment tokens."""
    tokens = db.query(EnrollToken).order_by(EnrollToken.created_at.desc()).all()

    # Auto-expire stale tokens
    for t in tokens:
        if t.status == EnrollTokenStatusEnum.ACTIVE and t.expires_at < datetime.utcnow():
            t.status = EnrollTokenStatusEnum.EXPIRED
    db.commit()

    return [
        TokenOut(
            token_id=t.token_id,
            network=t.network,
            status=t.status.value if hasattr(t.status, 'value') else t.status,
            created_at=t.created_at,
            expires_at=t.expires_at,
            used_at=t.used_at,
        )
        for t in tokens
    ]


# ─── Admin: connector resources ──────────────────────────────────────

@router.post("/admin/connectors/resources", response_model=ResourceOut,
             status_code=201, tags=["connectors-admin"])
def create_connector_resource(
    body: ResourceCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Create a resource that connectors can proxy to."""
    connector_id = None
    if body.connector_id:
        connector = db.query(Connector).filter(
            Connector.connector_id == body.connector_id
        ).first()
        if not connector:
            raise HTTPException(status_code=404, detail="Connector not found")
        connector_id = connector.connector_id

    resource = ConnectorResource(
        connector_id=connector_id,
        network=body.network,
        name=body.name,
        protocol=ResourceProtocolEnum(body.protocol),
        target_host=body.target_host,
        target_port=body.target_port,
        path_prefix=body.path_prefix,
    )
    db.add(resource)
    db.commit()
    db.refresh(resource)

    return ResourceOut(
        resource_id=resource.resource_id,
        connector_id=resource.connector_id,
        network=resource.network,
        name=resource.name,
        protocol=resource.protocol.value if hasattr(resource.protocol, 'value') else resource.protocol,
        target_host=resource.target_host,
        target_port=int(resource.target_port),
        path_prefix=resource.path_prefix or "",
        is_active=resource.is_active,
        created_at=resource.created_at,
    )


@router.get("/admin/connectors/resources", response_model=List[ResourceOut],
            tags=["connectors-admin"])
def list_connector_resources(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """List all connector resources."""
    resources = db.query(ConnectorResource).order_by(
        ConnectorResource.created_at.desc()
    ).all()

    return [
        ResourceOut(
            resource_id=r.resource_id,
            connector_id=r.connector_id,
            network=r.network,
            name=r.name,
            protocol=r.protocol.value if hasattr(r.protocol, 'value') else r.protocol,
            target_host=r.target_host,
            target_port=int(r.target_port),
            path_prefix=r.path_prefix or "",
            is_active=r.is_active,
            created_at=r.created_at,
        )
        for r in resources
    ]


@router.delete("/admin/connectors/{connector_id}", status_code=204,
               tags=["connectors-admin"])
def delete_connector(
    connector_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Delete a connector."""
    connector = db.query(Connector).filter(
        Connector.connector_id == connector_id
    ).first()
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    db.delete(connector)
    db.commit()


# ─── Token introspection ────────────────────────────────────────────

@router.post("/auth/introspect", response_model=IntrospectResponse,
             tags=["connectors"])
def introspect_token(body: IntrospectRequest):
    """Introspect an access token — used by connectors to validate user tokens."""
    payload = decode_access_token(body.token)
    if payload is None:
        return IntrospectResponse(active=False)
    return IntrospectResponse(
        active=True,
        sub=payload.get("sub"),
        exp=payload.get("exp"),
    )
