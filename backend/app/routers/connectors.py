"""Connector management API endpoints.

Provides:
  - POST /connectors/enroll          ??one-time enroll token exchange
  - POST /connectors/{id}/heartbeat  ??periodic status update
  - GET  /connectors/{id}/policies   ??resource/policy list for a connector
  - GET  /connectors                 ??list all connectors (dashboard)
  - POST /admin/connectors/tokens    ??create enroll token
  - GET  /admin/connectors/tokens    ??list enroll tokens
  - POST /admin/connectors/resources ??create a connector resource
  - GET  /admin/connectors/resources ??list connector resources
  - POST /auth/introspect            ??token introspection for connectors
  - GET  /.well-known/jwks.json      ??JWKS endpoint (stub)
"""

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from ..deps import get_db, get_current_admin
from .. import schemas
from ..models import (
    AccessSession,
    DeviceTrustScore,
    EnrollToken, EnrollTokenStatusEnum,
    Connector, ConnectorOnlineStatusEnum,
    ConnectorResource, ResourceProtocolEnum,
    PolicyBinding, ConnectorAccessLog,
    PostureReport,
    ProtectedResource,
    TunnelNode,
    User,
)
from ..security import decode_access_token
from ..settings import get_settings
from ..sio_server import notify_connector_change, notify_policy_update

router = APIRouter()

# ?�?�?� Pydantic schemas ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

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


class ResourceUpdateRequest(BaseModel):
    """Full-replace update for a connector route — mirrors ResourceCreateRequest
    (the edit form is pre-filled from the existing route, so every field is
    always sent, same as create)."""
    name: str
    network: str = "default"
    connector_id: Optional[str] = None
    protocol: str = "http"
    target_host: str
    target_port: int = 80
    path_prefix: str = ""
    is_active: bool = True


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


# ?�?�?� Helpers ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

def _hash_token(token: str) -> str:
    """SHA-256 hash of a token string."""
    return hashlib.sha256(token.encode()).hexdigest()


def _generate_deploy_commands(token: str, network: str, controller_url: str) -> dict:
    """Generate connector_runtime deployment commands for Docker and Linux."""
    rand = secrets.token_hex(4)
    name = f"modzero-connector-{rand}"

    docker_cmd = (
        f'# ⚠️  Run on the RESOURCE SERVER (e.g. AlphaTechs server).\n'
        f'#    Do NOT run on the ModZero controller server.\n\n'
        f'# 1. Get the ModZero source (skip if already cloned)\n'
        f'git clone https://github.com/<your-org>/ModZero /opt/modzero\n\n'
        f'# 2. Build the connector image\n'
        f'docker build -t modzero-connector-runtime /opt/modzero/connector_runtime\n\n'
        f'# 3. Enroll using the one-time token (saves credentials to a named volume)\n'
        f'docker run --rm \\\n'
        f'  -v modzero-state:/var/lib/modzero \\\n'
        f'  -e MODZERO_BACKEND_URL="{controller_url}" \\\n'
        f'  modzero-connector-runtime \\\n'
        f'  enroll --token "{token}" \\\n'
        f'         --name "$(hostname)" \\\n'
        f'         --network "{network}"\n\n'
        f'# 4. Run the connector with HTTP proxy on port 18080\n'
        f'docker run -d \\\n'
        f'  --name "{name}" \\\n'
        f'  -v modzero-state:/var/lib/modzero \\\n'
        f'  -e MODZERO_BACKEND_URL="{controller_url}" \\\n'
        f'  -e MODZERO_PROXY_HOST="0.0.0.0" \\\n'
        f'  -e MODZERO_PROXY_PORT="18080" \\\n'
        f'  -p 18080:18080 \\\n'
        f'  --restart unless-stopped \\\n'
        f'  modzero-connector-runtime run --proxy'
    )

    linux_cmd = (
        f'# ⚠️  Run on the RESOURCE SERVER (e.g. AlphaTechs server).\n'
        f'#    Do NOT run on the ModZero controller server.\n\n'
        f'# 1. Install prerequisites\n'
        f'sudo apt-get update && sudo apt-get install -y python3 python3-pip git\n\n'
        f'# 2. Clone ModZero and install connector_runtime dependencies\n'
        f'git clone https://github.com/<your-org>/ModZero /opt/modzero\n'
        f'pip3 install -r /opt/modzero/connector_runtime/requirements.txt\n\n'
        f'# 3. Enroll using the one-time token\n'
        f'cd /opt/modzero/connector_runtime\n'
        f'MODZERO_BACKEND_URL="{controller_url}" \\\n'
        f'python3 -m connector_runtime enroll \\\n'
        f'  --token "{token}" \\\n'
        f'  --name "$(hostname)" \\\n'
        f'  --network "{network}"\n\n'
        f'# 4. Run the connector with HTTP proxy on port 18080\n'
        f'MODZERO_BACKEND_URL="{controller_url}" \\\n'
        f'MODZERO_PROXY_HOST="0.0.0.0" \\\n'
        f'MODZERO_PROXY_PORT="18080" \\\n'
        f'python3 -m connector_runtime run --proxy\n\n'
        f'# Optional: run as a systemd daemon\n'
        f'# sudo tee /etc/systemd/system/modzero-connector.service > /dev/null << \'UNIT\'\n'
        f'# [Unit]\n'
        f'# Description=ModZero Connector Runtime\n'
        f'# After=network.target\n'
        f'# [Service]\n'
        f'# Environment=MODZERO_BACKEND_URL={controller_url}\n'
        f'# Environment=MODZERO_PROXY_HOST=0.0.0.0\n'
        f'# Environment=MODZERO_PROXY_PORT=18080\n'
        f'# WorkingDirectory=/opt/modzero/connector_runtime\n'
        f'# ExecStart=python3 -m connector_runtime run --proxy\n'
        f'# Restart=on-failure\n'
        f'# [Install]\n'
        f'# WantedBy=multi-user.target\n'
        f'# UNIT\n'
        f'# sudo systemctl daemon-reload && sudo systemctl enable --now modzero-connector'
    )

    return {"docker_command": docker_cmd, "curl_command": linux_cmd}


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


# ?�?�?� Enrollment ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

@router.post("/connectors/enroll", status_code=201, response_model=EnrollResponse,
             tags=["connectors"])
async def enroll_connector(body: EnrollRequest, db: Session = Depends(get_db)):
    """Exchange a one-time enroll token for permanent connector credentials."""
    token_hash = _hash_token(body.token)

    enroll_token = db.query(EnrollToken).filter(
        EnrollToken.token_hash == token_hash,
        EnrollToken.status == EnrollTokenStatusEnum.ACTIVE,
    ).first()

    if not enroll_token:
        raise HTTPException(status_code=401, detail="Invalid or expired enroll token")

    # Check expiry
    if enroll_token.expires_at < datetime.now(timezone.utc):
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
        last_heartbeat=datetime.now(timezone.utc),
    )
    db.add(connector)

    # Mark token as used
    enroll_token.status = EnrollTokenStatusEnum.USED
    enroll_token.used_at = datetime.now(timezone.utc)
    enroll_token.used_by_connector_id = connector_id
    db.commit()

    try:
        await notify_connector_change()
    except Exception:  # noqa: BLE001
        pass  # dashboard live-refresh is best-effort; never fail enrollment over it

    return EnrollResponse(
        connector_id=str(connector_id),
        connector_secret=connector_secret,
    )


# ?�?�?� Heartbeat ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

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
    connector.last_heartbeat = datetime.now(timezone.utc)
    connector.network = body.network or connector.network
    db.commit()

    return HeartbeatResponse(
        status="ok",
        server_time=datetime.now(timezone.utc).isoformat(),
    )


# ?�?�?� Policy/resource fetch ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

def _build_resource_list(db: Session, connector: Connector) -> list[dict]:
    """Same resource set a connector would get from GET .../policies — shared
    with the push path (notify_policy_update) so both stay in sync."""
    resources = db.query(ConnectorResource).filter(
        ConnectorResource.is_active == True,
        (ConnectorResource.connector_id == connector.connector_id) |
        (ConnectorResource.network == connector.network),
    ).all()
    return [
        {
            "resource_id": str(r.resource_id),
            "name": r.name,
            "protocol": r.protocol.value if hasattr(r.protocol, 'value') else r.protocol,
            "target_host": r.target_host,
            "target_port": int(r.target_port),
            "path_prefix": r.path_prefix or "",
        }
        for r in resources
    ]


async def _push_policy_update_for_resource(db: Session, resource: ConnectorResource) -> None:
    """Push the refreshed resource list to whichever connector(s) this
    resource is visible to, so they pick it up within seconds instead of
    waiting for their next policy_poll_loop tick (connector/heartbeat.py).

    A resource pinned to one connector_id only affects that connector; a
    network-wide resource (connector_id is None) is visible to every
    connector on that network (see get_connector_policies' query).
    """
    if resource.connector_id:
        connectors = db.query(Connector).filter(
            Connector.connector_id == resource.connector_id
        ).all()
    else:
        connectors = db.query(Connector).filter(
            Connector.network == resource.network
        ).all()

    for connector in connectors:
        try:
            await notify_policy_update(
                str(connector.connector_id),
                _build_resource_list(db, connector),
            )
        except Exception:  # noqa: BLE001
            pass  # best-effort — policy_poll_loop is the fallback


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

    return {
        "resources": _build_resource_list(db, connector),
        "jwks_url": "",  # will be populated when JWKS is configured
    }


# ?�?�?� List connectors (dashboard) ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

@router.get("/connectors", response_model=List[ConnectorOut], tags=["connectors"])
def list_connectors(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """List all registered connectors (admin only)."""
    connectors = db.query(Connector).order_by(Connector.created_at.desc()).all()

    result = []
    for c in connectors:
        # Check if connector is stale (no heartbeat in 60s ??offline)
        if c.last_heartbeat:
            time_since = (datetime.now(timezone.utc) - c.last_heartbeat).total_seconds()
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


# ?�?�?� Admin: enroll tokens ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

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
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=body.expires_minutes)

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
        if t.status == EnrollTokenStatusEnum.ACTIVE and t.expires_at < datetime.now(timezone.utc):
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


@router.post("/admin/connectors/tokens/{token_id}/revoke", status_code=204,
             tags=["connectors-admin"])
def revoke_enroll_token(
    token_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Revoke an active enrollment token before it's used or expires (e.g. it leaked)."""
    token = db.query(EnrollToken).filter(EnrollToken.token_id == token_id).first()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")
    if token.status != EnrollTokenStatusEnum.ACTIVE:
        raise HTTPException(status_code=409, detail=f"Token is already {token.status.value if hasattr(token.status, 'value') else token.status}")
    token.status = EnrollTokenStatusEnum.REVOKED
    db.commit()


# ?�?�?� Admin: connector resources ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

@router.post("/admin/connectors/resources", response_model=ResourceOut,
             status_code=201, tags=["connectors-admin"])
async def create_connector_resource(
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

    await _push_policy_update_for_resource(db, resource)

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


@router.put("/admin/connectors/resources/{resource_id}", response_model=ResourceOut,
            tags=["connectors-admin"])
async def update_connector_resource(
    resource_id: str,
    body: ResourceUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Update a connector route (proxy target)."""
    resource = db.query(ConnectorResource).filter(
        ConnectorResource.resource_id == resource_id
    ).first()
    if not resource:
        raise HTTPException(status_code=404, detail="Route not found")

    connector_id = None
    if body.connector_id:
        connector = db.query(Connector).filter(
            Connector.connector_id == body.connector_id
        ).first()
        if not connector:
            raise HTTPException(status_code=404, detail="Connector not found")
        connector_id = connector.connector_id

    resource.name = body.name
    resource.network = body.network
    resource.connector_id = connector_id
    resource.protocol = ResourceProtocolEnum(body.protocol)
    resource.target_host = body.target_host
    resource.target_port = body.target_port
    resource.path_prefix = body.path_prefix
    resource.is_active = body.is_active
    db.commit()
    db.refresh(resource)

    await _push_policy_update_for_resource(db, resource)
    try:
        await notify_connector_change()
    except Exception:  # noqa: BLE001
        pass

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
    """List all connector resources, deduplicating by (name, network, target_host, target_port).

    When the seed script has been run more than once, identical rows can
    accumulate.  Keep the most-recently-created entry for each unique
    (name, network, target_host, target_port) tuple so the UI never shows
    confusing duplicate rows, while preserving genuinely distinct mappings.
    """
    resources = db.query(ConnectorResource).order_by(
        ConnectorResource.created_at.desc()
    ).all()

    seen: set = set()
    deduped: list = []
    for r in resources:
        key = (r.name, r.network, r.target_host, int(r.target_port))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(r)

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
        for r in deduped
    ]


@router.delete("/admin/connectors/resources/{resource_id}", status_code=204,
               tags=["connectors-admin"])
async def delete_connector_resource(
    resource_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Delete a connector route. Any ProtectedResource pinned to it (via
    connector_resource_id) falls back to network-wide matching automatically —
    the FK is ON DELETE SET NULL, not a blocking constraint."""
    resource = db.query(ConnectorResource).filter(
        ConnectorResource.resource_id == resource_id
    ).first()
    if not resource:
        raise HTTPException(status_code=404, detail="Route not found")
    db.delete(resource)
    db.commit()
    try:
        await notify_connector_change()
    except Exception:  # noqa: BLE001
        pass


@router.delete("/admin/connectors/{connector_id}", status_code=204,
               tags=["connectors-admin"])
async def delete_connector(
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
    try:
        await notify_connector_change()
    except Exception:  # noqa: BLE001
        pass


# ?�?�?� Token introspection ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

@router.post("/auth/introspect", response_model=IntrospectResponse,
             tags=["connectors"])
def introspect_token(body: IntrospectRequest):
    """Introspect an access token ??used by connectors to validate user tokens."""
    payload = decode_access_token(body.token)
    if payload is None:
        return IntrospectResponse(active=False)
    return IntrospectResponse(
        active=True,
        sub=payload.get("sub"),
        exp=payload.get("exp"),
    )


# ── Access session introspect ─────────────────────────────────────────────────

@router.post("/connectors/access/introspect", response_model=schemas.AccessIntrospectResponse,
             tags=["connectors"])
def introspect_access_session(
    body: schemas.AccessIntrospectRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    """Validate an access session token.

    The connector authenticates via X-Connector-Id + X-Connector-Secret headers.
    Returns active=True with resource target info if the session is valid,
    or active=False with a reason code if it is not.
    """
    connector = _verify_connector_auth(request, db)

    token_hash = hashlib.sha256(body.access_token.encode()).hexdigest()
    session = db.query(AccessSession).filter(AccessSession.id == body.session_id).first()

    if not session:
        return schemas.AccessIntrospectResponse(active=False, reason="session_not_found")

    if session.session_token_hash != token_hash:
        return schemas.AccessIntrospectResponse(active=False, reason="token_mismatch")

    if session.status == "revoked":
        return schemas.AccessIntrospectResponse(active=False, reason="session_revoked")

    now = datetime.now(timezone.utc)
    if session.expires_at < now:
        session.status = "expired"
        db.commit()
        return schemas.AccessIntrospectResponse(active=False, reason="session_expired")

    if session.status != "active":
        return schemas.AccessIntrospectResponse(active=False, reason="session_not_active")

    # Connector binding check: if session was bound to a specific connector,
    # only that connector may introspect it.
    if session.connector_id and session.connector_id != connector.connector_id:
        return schemas.AccessIntrospectResponse(active=False, reason="connector_mismatch")

    # Entra identity hard gate (cached): cut a live session if Graph now reports
    # the account as disabled. Only fires when Entra is enabled; unknown/error → no gate.
    from ..routers.trust_policy import get_or_create_policy
    if getattr(get_or_create_policy(db), "entra_enabled", False):
        gate_user = db.query(User).filter(User.user_id == session.user_id).first()
        if gate_user is not None:
            from ..services.azure_signal_service import hard_gate_reason
            gate = hard_gate_reason(gate_user)
            if gate:
                return schemas.AccessIntrospectResponse(active=False, reason=gate)

    # Resource must still be enabled
    resource = (
        db.query(ProtectedResource).filter(ProtectedResource.id == session.resource_id).first()
        if session.resource_id else None
    )
    if not resource:
        return schemas.AccessIntrospectResponse(active=False, reason="resource_unavailable")
    if not resource.enabled:
        return schemas.AccessIntrospectResponse(active=False, reason="resource_disabled")

    # Live trust score revalidation
    if session.device_id and resource.minimum_trust_score is not None and resource.minimum_trust_score > 0:
        latest_score = (
            db.query(DeviceTrustScore)
            .filter(DeviceTrustScore.device_id == session.device_id)
            .order_by(DeviceTrustScore.calculated_at.desc())
            .first()
        )
        if latest_score is None:
            return schemas.AccessIntrospectResponse(active=False, reason="no_trust_score")
        if getattr(latest_score, "hard_denied_resources", False):
            return schemas.AccessIntrospectResponse(active=False, reason="hard_denied_by_policy")
        if latest_score.total_score < resource.minimum_trust_score:
            return schemas.AccessIntrospectResponse(active=False, reason="trust_score_below_required")

    # Live intune compliance revalidation
    if resource.require_intune_compliant and session.device_id:
        latest_report = (
            db.query(PostureReport)
            .filter(PostureReport.device_id == session.device_id)
            .order_by(PostureReport.reported_at.desc())
            .first()
        )
        if not latest_report or not latest_report.intune_compliant:
            return schemas.AccessIntrospectResponse(active=False, reason="intune_required")

    # Update last_used_at
    session.last_used_at = now
    db.commit()

    # Return target info from linked ConnectorResource
    cr = (
        db.query(ConnectorResource).filter(
            ConnectorResource.resource_id == resource.connector_resource_id
        ).first()
        if resource.connector_resource_id else None
    )

    return schemas.AccessIntrospectResponse(
        active=True,
        resource_name=resource.name,
        target_host=cr.target_host if cr else None,
        target_port=int(cr.target_port) if cr else None,
        protocol=cr.protocol.value if cr and hasattr(cr.protocol, "value") else (cr.protocol if cr else None),
        path_prefix=cr.path_prefix if cr else None,
        expires_at=session.expires_at,
        user_id=session.user_id,
    )


# ─── Tunnel (WireGuard) endpoints — Phase 3 scaffold ────────────────────────
# Connector-facing register / heartbeat for metadata only. When
# HEADSCALE_ENABLED=false (default), both return 202 {"status": "disabled"}
# without writing to TunnelNode. They do NOT influence the access decision or
# the HTTP proxy in either flag state.

@router.post("/connectors/{connector_id}/tunnel/register", tags=["connectors"])
def connector_tunnel_register(
    connector_id: str,
    body: schemas.TunnelRegisterIn,
    request: Request,
    db: Session = Depends(get_db),
):
    connector = _verify_connector_auth(request, db)
    if str(connector.connector_id) != connector_id:
        raise HTTPException(status_code=403, detail="Connector ID mismatch")

    settings = get_settings()
    if not settings.headscale_enabled:
        return JSONResponse(
            status_code=202,
            content={"status": "disabled"},
        )

    node = db.query(TunnelNode).filter(
        TunnelNode.connector_id == connector.connector_id,
        TunnelNode.node_name == body.node_name,
    ).first()
    if node is None:
        node = TunnelNode(
            connector_id=connector.connector_id,
            node_name=body.node_name,
            node_key=body.node_key,
            wireguard_ip=body.wireguard_ip,
            status="pending",
        )
        db.add(node)
    else:
        if body.node_key is not None:
            node.node_key = body.node_key
        if body.wireguard_ip is not None:
            node.wireguard_ip = body.wireguard_ip
    db.commit()
    db.refresh(node)

    return {
        "node_id": str(node.id),
        "wireguard_ip": node.wireguard_ip,
        "headscale_user": settings.headscale_user,
        "status": node.status,
    }


@router.post("/connectors/{connector_id}/tunnel/heartbeat", tags=["connectors"])
def connector_tunnel_heartbeat(
    connector_id: str,
    body: schemas.TunnelHeartbeatIn,
    request: Request,
    db: Session = Depends(get_db),
):
    connector = _verify_connector_auth(request, db)
    if str(connector.connector_id) != connector_id:
        raise HTTPException(status_code=403, detail="Connector ID mismatch")

    settings = get_settings()
    if not settings.headscale_enabled:
        return JSONResponse(
            status_code=202,
            content={"status": "disabled"},
        )

    node = db.query(TunnelNode).filter(
        TunnelNode.connector_id == connector.connector_id,
        TunnelNode.node_name == body.node_name,
    ).first()
    if node is None:
        raise HTTPException(status_code=404, detail="Tunnel node not registered")

    node.status = body.status
    node.last_seen_at = datetime.now(timezone.utc)
    if body.wireguard_ip is not None:
        node.wireguard_ip = body.wireguard_ip
    db.commit()

    return {"ok": True, "status": node.status}
