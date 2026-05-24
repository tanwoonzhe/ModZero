"""Manual WireGuard bootstrap endpoint.

Generates a copy-paste `tailscale up` join command for a connector. Never
executes it. Default mode is **manual** (no auth key embedded). When
HEADSCALE_BOOTSTRAP_TRY_API=true and the Headscale preauth-key endpoint is
reachable, returns a one-shot preauth key alongside an `--authkey=` flavored
command; on any failure or unrecognized response shape, falls back to manual
mode safely.

Hard invariants:
- HEADSCALE_ENABLED=false  → 202 {"status":"disabled"}; no DB row written.
- Raw auth key never logged. Stored only as sha256(key) on the audit row.
- HEADSCALE_API_KEY is never echoed in any response or log.
"""

from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from .. import schemas
from ..deps import get_db, get_current_admin
from ..models import Connector, TunnelBootstrapLog, TunnelNode, User
from ..services.headscale_service import (
    HeadscaleError,
    HeadscaleService,
)
from ..settings import get_settings

logger = logging.getLogger(__name__)

router = APIRouter()


_NODE_NAME_RE = re.compile(r"[^a-z0-9-]")


def _sanitize_node_name(raw: str) -> str:
    s = raw.strip().lower().replace("_", "-").replace(" ", "-")
    s = _NODE_NAME_RE.sub("", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:63] or "modzero-connector"


def _suggested_node_name(
    db: Session, connector: Connector, override: Optional[str]
) -> str:
    if override:
        return _sanitize_node_name(override)
    existing = (
        db.query(TunnelNode)
        .filter(TunnelNode.connector_id == connector.connector_id)
        .order_by(TunnelNode.created_at.desc())
        .first()
    )
    if existing and existing.node_name:
        return _sanitize_node_name(existing.node_name)
    base = connector.name or str(connector.connector_id)[:8]
    return _sanitize_node_name(f"connector-{base}")


_BASE_WARNINGS = [
    "Run this command manually on the connector host — ModZero does not execute it.",
    "Current data path remains the HTTP proxy. WireGuard routing is not active yet.",
    "--accept-routes and --accept-dns are disabled by design; routes will be configured in a later milestone.",
]


def _manual_join_command(login_server: str, node_name: str, hs_user: str) -> str:
    return (
        "# Run this on the connector host. ModZero does NOT execute it.\n"
        "sudo tailscale up \\\n"
        f"  --login-server={login_server} \\\n"
        f"  --hostname={node_name} \\\n"
        "  --advertise-tags=tag:modzero-connector \\\n"
        "  --accept-routes=false \\\n"
        "  --accept-dns=false\n"
        "# After tailscale prints a login URL, register the node on the\n"
        "# Headscale server out of band:\n"
        f"#   headscale --user {hs_user} nodes register --key <mkey:...>"
    )


def _api_join_command(
    login_server: str, node_name: str, auth_key: str
) -> str:
    return (
        "# Run this on the connector host. ModZero does NOT execute it.\n"
        "sudo tailscale up \\\n"
        f"  --login-server={login_server} \\\n"
        f"  --hostname={node_name} \\\n"
        f"  --authkey={auth_key} \\\n"
        "  --advertise-tags=tag:modzero-connector \\\n"
        "  --accept-routes=false \\\n"
        "  --accept-dns=false"
    )


def _parse_expiration(value: Optional[str]) -> Optional[datetime]:
    if not value or not isinstance(value, str):
        return None
    s = value.strip()
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        return datetime.fromisoformat(s)
    except Exception:
        return None


@router.post(
    "/bootstrap/{connector_id}",
    tags=["tunnels"],
)
def bootstrap_connector(
    connector_id: UUID,
    body: Optional[schemas.TunnelBootstrapIn] = None,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Return a copy-paste join command for the operator. Writes an audit row
    on every non-disabled invocation. Never logs or stores the raw preauth key.
    """
    if body is None:
        body = schemas.TunnelBootstrapIn()

    s = get_settings()
    connector = (
        db.query(Connector)
        .filter(Connector.connector_id == connector_id)
        .first()
    )
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    suggested = _suggested_node_name(db, connector, body.node_name)

    # 1) Feature flag off — short-circuit, no log row.
    if not s.headscale_enabled:
        out = schemas.TunnelBootstrapOut(
            status="disabled",
            connector_id=connector.connector_id,
            connector_name=connector.name,
            headscale_enabled=False,
            headscale_configured=False,
            suggested_node_name=suggested,
            login_server=None,
            join_command=None,
            auth_key_mode="disabled",
            auth_key=None,
            expires_at=None,
            warnings=list(_BASE_WARNINGS),
        )
        return JSONResponse(
            status_code=202,
            content=out.model_dump(mode="json"),
        )

    configured = bool(s.headscale_url and s.headscale_api_key)

    # 2) Enabled but missing URL / API key.
    if not configured:
        warnings = list(_BASE_WARNINGS) + [
            "HEADSCALE_URL or HEADSCALE_API_KEY missing in backend env.",
        ]
        log = TunnelBootstrapLog(
            connector_id=connector.connector_id,
            requested_by_user_id=admin.user_id,
            node_name=suggested,
            auth_key_hash=None,
            auth_key_mode="not_configured",
            status="not_configured",
        )
        db.add(log)
        db.commit()
        logger.info(
            "tunnel_bootstrap connector=%s node=%s mode=not_configured",
            connector.connector_id, suggested,
        )
        return schemas.TunnelBootstrapOut(
            status="not_configured",
            connector_id=connector.connector_id,
            connector_name=connector.name,
            headscale_enabled=True,
            headscale_configured=False,
            suggested_node_name=suggested,
            login_server=None,
            join_command=None,
            auth_key_mode="not_configured",
            auth_key=None,
            expires_at=None,
            warnings=warnings,
        )

    # 3) Enabled + configured.
    login_server = (s.headscale_url or "").rstrip("/")
    auth_key_mode = "manual"
    auth_key: Optional[str] = None
    expires_at: Optional[datetime] = None
    warnings = list(_BASE_WARNINGS)

    try_api = s.headscale_bootstrap_try_api and not body.force_manual
    if try_api:
        svc = HeadscaleService()
        try:
            result = svc.create_preauth_key(
                user=s.headscale_user, expiration_seconds=3600
            )
            key_value = result.get("key")
            if isinstance(key_value, str) and key_value:
                auth_key = key_value
                auth_key_mode = "headscale_api"
                expires_at = _parse_expiration(result.get("expiration"))
            else:
                warnings.append(
                    "Headscale preauth key endpoint did not return a usable key; "
                    "fell back to manual mode."
                )
        except HeadscaleError:
            warnings.append(
                "Headscale preauth key endpoint did not return a usable key; "
                "fell back to manual mode."
            )

    if auth_key_mode == "headscale_api" and auth_key:
        join_command = _api_join_command(login_server, suggested, auth_key)
        auth_key_hash = hashlib.sha256(auth_key.encode("utf-8")).hexdigest()
    else:
        join_command = _manual_join_command(
            login_server, suggested, s.headscale_user
        )
        auth_key_hash = None

    log = TunnelBootstrapLog(
        connector_id=connector.connector_id,
        requested_by_user_id=admin.user_id,
        node_name=suggested,
        auth_key_hash=auth_key_hash,
        auth_key_mode=auth_key_mode,
        status="ok",
        expires_at=expires_at,
    )
    db.add(log)
    db.commit()

    # Never log the raw key, the API key, or the full URL.
    logger.info(
        "tunnel_bootstrap connector=%s node=%s mode=%s",
        connector.connector_id, suggested, auth_key_mode,
    )

    return schemas.TunnelBootstrapOut(
        status="ok",
        connector_id=connector.connector_id,
        connector_name=connector.name,
        headscale_enabled=True,
        headscale_configured=True,
        suggested_node_name=suggested,
        login_server=login_server,
        join_command=join_command,
        auth_key_mode=auth_key_mode,
        auth_key=auth_key,
        expires_at=expires_at,
        warnings=warnings,
    )


@router.get(
    "/bootstrap/logs",
    response_model=List[schemas.TunnelBootstrapLogOut],
    tags=["tunnels"],
)
def list_bootstrap_logs(
    limit: int = Query(default=20, ge=1, le=50),
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> List[schemas.TunnelBootstrapLogOut]:
    """Sanitized audit list. `auth_key_hash` is intentionally NOT returned."""
    rows = (
        db.query(TunnelBootstrapLog, Connector.name)
        .join(
            Connector,
            Connector.connector_id == TunnelBootstrapLog.connector_id,
        )
        .order_by(TunnelBootstrapLog.created_at.desc())
        .limit(limit)
        .all()
    )
    out: List[schemas.TunnelBootstrapLogOut] = []
    for log, connector_name in rows:
        out.append(
            schemas.TunnelBootstrapLogOut(
                id=log.id,
                connector_id=log.connector_id,
                connector_name=connector_name,
                requested_by_user_id=log.requested_by_user_id,
                node_name=log.node_name,
                auth_key_mode=log.auth_key_mode,
                status=log.status,
                created_at=log.created_at,
                expires_at=log.expires_at,
            )
        )
    return out
