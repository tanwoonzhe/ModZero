"""Client-facing API endpoints for the ModZero Desktop Client.

These endpoints serve the Electron client application:
  - GET  /client/me          — current user profile
  - GET  /client/resources   — resources accessible to the user
  - GET  /client/networks    — available networks
  - POST /client/access-link — generate a one-time access URL
  - POST /client/logs/upload — receive client log archives
"""

import os
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..deps import get_db, get_current_user
from ..models import (
    User,
    Connector,
    ConnectorResource,
    ConnectorOnlineStatusEnum,
)

router = APIRouter(prefix="/client")


# ── GET /client/me ──────────────────────────────────────────────────

@router.get("/me")
def get_my_profile(current_user: User = Depends(get_current_user)):
    """Return the authenticated user's profile (no sensitive fields)."""
    return {
        "user_id": str(current_user.user_id),
        "username": current_user.username,
        "email": current_user.email,
        "role": current_user.role.value if current_user.role else "employee",
    }


# ── GET /client/resources ──────────────────────────────────────────

@router.get("/resources")
def list_client_resources(
    network: str | None = Query(None, description="Filter by network name"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List resources available to the client user.

    Optionally filter by network.  Each resource includes its connector URL
    (the address the client should open in the browser) so the Electron app
    can simply ``shell.openExternal(connector_url)``.
    """
    query = db.query(ConnectorResource).filter(ConnectorResource.is_active == True)

    if network:
        query = query.filter(ConnectorResource.network == network)

    resources = query.all()

    result = []
    for r in resources:
        # Determine connector URL from the associated connector
        connector_url = None
        if r.connector_id:
            connector = db.query(Connector).filter(
                Connector.connector_id == r.connector_id
            ).first()
            if connector and connector.ip_address:
                port = 8443  # default connector listen port
                connector_url = f"https://{connector.ip_address}:{port}{r.path_prefix or '/'}"

        # Determine resource online status from connector status
        status_str = "offline"
        if r.connector_id:
            connector = db.query(Connector).filter(
                Connector.connector_id == r.connector_id
            ).first()
            if connector and connector.status == ConnectorOnlineStatusEnum.ONLINE:
                status_str = "online"
            elif connector and connector.status == ConnectorOnlineStatusEnum.DEGRADED:
                status_str = "degraded"

        result.append({
            "resource_id": str(r.resource_id),
            "name": r.name,
            "network": r.network,
            "protocol": r.protocol.value if r.protocol else "http",
            "target_host": r.target_host,
            "target_port": int(r.target_port) if r.target_port else 80,
            "path_prefix": r.path_prefix or "",
            "status": status_str,
            "connector_url": connector_url,
        })

    return result


# ── GET /client/networks ───────────────────────────────────────────

@router.get("/networks")
def list_client_networks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List distinct networks with summary stats."""
    # Get distinct networks from connectors
    connector_nets = (
        db.query(
            Connector.network,
            func.count(Connector.connector_id).label("connector_count"),
        )
        .group_by(Connector.network)
        .all()
    )

    networks = []
    for net_name, conn_count in connector_nets:
        resource_count = (
            db.query(func.count(ConnectorResource.resource_id))
            .filter(ConnectorResource.network == net_name, ConnectorResource.is_active == True)
            .scalar()
        ) or 0

        # Determine aggregate status
        online = (
            db.query(func.count(Connector.connector_id))
            .filter(
                Connector.network == net_name,
                Connector.status == ConnectorOnlineStatusEnum.ONLINE,
            )
            .scalar()
        ) or 0

        status_str = "online" if online > 0 else "offline"

        networks.append({
            "network": net_name,
            "connector_count": conn_count,
            "resource_count": resource_count,
            "status": status_str,
        })

    return networks


# ── POST /client/access-link ──────────────────────────────────────

@router.post("/access-link")
def generate_access_link(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a short-lived access URL for a resource.

    The URL encodes a one-time token that the connector validates before
    proxying the request.  For the MVP this just returns the direct connector
    URL — a production implementation would create a signed JWT link.
    """
    resource_id = body.get("resource_id")
    if not resource_id:
        raise HTTPException(status_code=400, detail="resource_id required")

    resource = (
        db.query(ConnectorResource)
        .filter(ConnectorResource.resource_id == resource_id)
        .first()
    )
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")

    # Build connector URL
    connector_url = None
    if resource.connector_id:
        connector = db.query(Connector).filter(
            Connector.connector_id == resource.connector_id
        ).first()
        if connector and connector.ip_address:
            port = 8443
            connector_url = f"https://{connector.ip_address}:{port}{resource.path_prefix or '/'}"

    if not connector_url:
        connector_url = (
            f"{resource.protocol.value if resource.protocol else 'http'}://"
            f"{resource.target_host}:{int(resource.target_port) if resource.target_port else 80}"
            f"{resource.path_prefix or '/'}"
        )

    return {"url": connector_url}


# ── POST /client/logs/upload ──────────────────────────────────────

LOG_UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploaded_logs")


@router.post("/logs/upload")
async def upload_client_logs(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Receive a zip archive of client logs.

    Logs are stored on the server under ``uploaded_logs/<user_id>/<filename>``.
    """
    if not file.filename or not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files accepted")

    if file.size and file.size > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 50 MB)")

    user_dir = os.path.join(LOG_UPLOAD_DIR, str(current_user.user_id))
    os.makedirs(user_dir, exist_ok=True)

    safe_name = f"{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}.zip"
    dest = os.path.join(user_dir, safe_name)

    contents = await file.read()
    with open(dest, "wb") as f:
        f.write(contents)

    return {"ok": True, "filename": safe_name, "size": len(contents)}
