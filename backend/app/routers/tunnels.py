"""Tunnel (Headscale / WireGuard) admin endpoints.

Phase 3 scaffold — metadata only. These endpoints do NOT call a real Headscale
API and do NOT affect the access-decision or HTTP proxy flow. They exist so the
admin UI and a future WireGuard data plane have somewhere to read/write nodes
and routes from.

Mounted under /api/tunnels.
"""

from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from .. import schemas
from ..deps import get_db, get_current_admin
from ..models import Connector, TunnelAccessAuditLog, TunnelNode, TunnelRoute, TunnelRouteActionLog, User
from ..services.headscale_service import (
    HeadscaleService,
    _normalize_node,
    _normalize_route,
    parse_last_seen,
)
from ..settings import get_settings


router = APIRouter()


# Module-level cached state. Updated only by /headscale/health, /headscale/sync,
# and /headscale/sync-routes — never by /status.
_LAST_SYNC_AT: Optional[datetime] = None
_LAST_REACHABLE: Optional[bool] = None
_LAST_ROUTE_SYNC_AT: Optional[datetime] = None


@router.get("/status", response_model=schemas.TunnelStatusOut, tags=["tunnels"])
def tunnels_status(_admin: User = Depends(get_current_admin)) -> schemas.TunnelStatusOut:
    """Return non-sensitive Headscale config + cached liveness state.

    Never echoes HEADSCALE_URL or HEADSCALE_API_KEY values — only booleans.
    Does NOT call Headscale; uses cached _LAST_REACHABLE / _LAST_SYNC_AT.
    """
    s = get_settings()
    reachable = _LAST_REACHABLE if s.headscale_enabled else None
    return schemas.TunnelStatusOut(
        headscale_enabled=bool(s.headscale_enabled),
        headscale_url_configured=bool(s.headscale_url),
        headscale_user=s.headscale_user,
        current_data_path="http_proxy",
        headscale_reachable=reachable,
        last_sync_at=_LAST_SYNC_AT,
        last_route_sync_at=_LAST_ROUTE_SYNC_AT,
    )


@router.get("/nodes", response_model=List[schemas.TunnelNodeOut], tags=["tunnels"])
def list_tunnel_nodes(
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> List[schemas.TunnelNodeOut]:
    rows = (
        db.query(TunnelNode, Connector.name)
        .join(Connector, Connector.connector_id == TunnelNode.connector_id)
        .order_by(TunnelNode.created_at.desc())
        .all()
    )
    out: List[schemas.TunnelNodeOut] = []
    for node, connector_name in rows:
        out.append(
            schemas.TunnelNodeOut(
                id=node.id,
                connector_id=node.connector_id,
                connector_name=connector_name,
                node_name=node.node_name,
                wireguard_ip=node.wireguard_ip,
                headscale_node_id=node.headscale_node_id,
                status=node.status,
                last_seen_at=node.last_seen_at,
                created_at=node.created_at,
            )
        )
    return out


@router.get("/routes", response_model=List[schemas.TunnelRouteOut], tags=["tunnels"])
def list_tunnel_routes(
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> List[schemas.TunnelRouteOut]:
    return db.query(TunnelRoute).order_by(TunnelRoute.created_at.desc()).all()


@router.post("/routes", response_model=schemas.TunnelRouteOut, status_code=201, tags=["tunnels"])
def create_tunnel_route(
    body: schemas.TunnelRouteIn,
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> TunnelRoute:
    connector = db.query(Connector).filter(
        Connector.connector_id == body.connector_id
    ).first()
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    route = TunnelRoute(
        connector_id=body.connector_id,
        resource_id=body.resource_id,
        subnet_or_host=body.subnet_or_host,
        route_type=body.route_type,
        enabled=body.enabled,
        route_status=body.route_status,
    )
    db.add(route)
    db.commit()
    db.refresh(route)
    return route


@router.put("/routes/{route_id}", response_model=schemas.TunnelRouteOut, tags=["tunnels"])
def update_tunnel_route(
    route_id: UUID,
    body: schemas.TunnelRouteIn,
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> TunnelRoute:
    route = db.query(TunnelRoute).filter(TunnelRoute.id == route_id).first()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    route.connector_id = body.connector_id
    route.resource_id = body.resource_id
    route.subnet_or_host = body.subnet_or_host
    route.route_type = body.route_type
    route.enabled = body.enabled
    route.route_status = body.route_status
    db.commit()
    db.refresh(route)
    return route


@router.delete("/routes/{route_id}", status_code=204, tags=["tunnels"])
def delete_tunnel_route(
    route_id: UUID,
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> None:
    route = db.query(TunnelRoute).filter(TunnelRoute.id == route_id).first()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    db.delete(route)
    db.commit()
    return None


# ── Headscale adapter endpoints ──────────────────────────────────────────────


@router.get(
    "/headscale/health",
    response_model=schemas.HeadscaleHealthOut,
    tags=["tunnels"],
)
def headscale_health(
    _admin: User = Depends(get_current_admin),
) -> schemas.HeadscaleHealthOut:
    """Probe Headscale once and report reachability. Never 5xx's.

    Never returns the URL, API key, or a raw traceback.
    """
    global _LAST_REACHABLE
    s = get_settings()
    svc = HeadscaleService()
    res = svc.health_check()
    reachable = res.get("reachable")
    if reachable is not None:
        _LAST_REACHABLE = bool(reachable)
    return schemas.HeadscaleHealthOut(
        enabled=bool(s.headscale_enabled),
        configured=svc.is_configured(),
        reachable=reachable,
        node_count=res.get("node_count"),
        error=res.get("error"),
    )


@router.post(
    "/headscale/sync",
    response_model=schemas.HeadscaleSyncOut,
    tags=["tunnels"],
)
def headscale_sync(
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Pull Headscale's node list and reconcile into existing TunnelNode rows.

    Strict read-merge: never creates new TunnelNode rows. Unmatched Headscale
    nodes are counted as skipped. Returns 202 when the feature is off or
    configuration is missing.
    """
    global _LAST_SYNC_AT, _LAST_REACHABLE
    s = get_settings()

    if not s.headscale_enabled:
        return JSONResponse(
            status_code=202,
            content=schemas.HeadscaleSyncOut(status="disabled").model_dump(mode="json"),
        )

    svc = HeadscaleService()
    if not svc.is_configured():
        return JSONResponse(
            status_code=202,
            content=schemas.HeadscaleSyncOut(
                status="not_configured",
                detail="missing url or api_key",
            ).model_dump(mode="json"),
        )

    # Reachable path — call Headscale.
    from ..services.headscale_service import (
        HeadscaleUnreachableError,
        HeadscaleAuthError,
        HeadscaleError,
    )
    try:
        raw_nodes = svc.list_nodes()
    except HeadscaleUnreachableError:
        _LAST_REACHABLE = False
        return schemas.HeadscaleSyncOut(
            status="unreachable", detail="unreachable",
        )
    except HeadscaleAuthError:
        _LAST_REACHABLE = False
        return schemas.HeadscaleSyncOut(
            status="unreachable", detail="unauthorized",
        )
    except HeadscaleError:
        _LAST_REACHABLE = False
        return schemas.HeadscaleSyncOut(
            status="unreachable", detail="api error",
        )

    updated = 0
    skipped = 0
    errors = 0

    for raw in raw_nodes:
        n = _normalize_node(raw if isinstance(raw, dict) else {})
        if not n["headscale_node_id"] and not n["node_name"]:
            errors += 1
            continue

        row = None
        if n["headscale_node_id"]:
            row = (
                db.query(TunnelNode)
                .filter(TunnelNode.headscale_node_id == n["headscale_node_id"])
                .first()
            )
        if row is None and n["node_name"]:
            candidates = (
                db.query(TunnelNode)
                .filter(TunnelNode.node_name == n["node_name"])
                .all()
            )
            if len(candidates) == 1:
                row = candidates[0]

        if row is None:
            skipped += 1
            continue

        if n["headscale_node_id"]:
            row.headscale_node_id = n["headscale_node_id"]
        if n["node_key"]:
            row.node_key = n["node_key"]
        if n["wireguard_ip"]:
            row.wireguard_ip = n["wireguard_ip"]
        if n["online"] is True:
            row.status = "online"
        elif n["online"] is False:
            row.status = "offline"
        row.last_seen_at = (
            parse_last_seen(n["last_seen"]) or datetime.now(timezone.utc)
        )
        updated += 1

    db.commit()
    _LAST_REACHABLE = True
    _LAST_SYNC_AT = datetime.now(timezone.utc)

    return schemas.HeadscaleSyncOut(
        status="ok",
        synced_nodes=updated,
        created=0,
        updated=updated,
        skipped=skipped,
        errors=errors,
        last_sync_at=_LAST_SYNC_AT,
    )


@router.post(
    "/headscale/sync-routes",
    response_model=schemas.SyncRoutesOut,
    tags=["tunnels"],
)
def headscale_sync_routes(
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Reconcile Headscale route status into existing TunnelRoute rows.

    Never creates new rows. Matches by prefix + optional node cross-reference.
    Returns 202 when disabled or not configured.
    """
    global _LAST_ROUTE_SYNC_AT
    s = get_settings()

    if not s.headscale_enabled:
        return JSONResponse(
            status_code=202,
            content=schemas.SyncRoutesOut(status="disabled").model_dump(mode="json"),
        )

    svc = HeadscaleService()
    if not svc.is_configured():
        return JSONResponse(
            status_code=202,
            content=schemas.SyncRoutesOut(
                status="not_configured",
                detail="missing url or api_key",
            ).model_dump(mode="json"),
        )

    from ..services.headscale_service import (
        HeadscaleUnreachableError,
        HeadscaleAuthError,
        HeadscaleError,
    )
    try:
        raw_routes = svc.list_routes()
    except HeadscaleUnreachableError:
        return schemas.SyncRoutesOut(status="unreachable", detail="unreachable")
    except HeadscaleAuthError:
        return schemas.SyncRoutesOut(status="unreachable", detail="unauthorized")
    except HeadscaleError:
        return schemas.SyncRoutesOut(status="unreachable", detail="api error")

    updated = 0
    skipped = 0
    errors = 0
    now = datetime.now(timezone.utc)

    for raw in raw_routes:
        nr = _normalize_route(raw if isinstance(raw, dict) else {})
        if nr["prefix"] is None:
            errors += 1
            continue

        candidates = (
            db.query(TunnelRoute)
            .filter(TunnelRoute.subnet_or_host == nr["prefix"])
            .all()
        )
        if not candidates:
            skipped += 1
            continue

        route = None
        if nr["node_ref"] is not None:
            for c in candidates:
                node = (
                    db.query(TunnelNode)
                    .filter(
                        TunnelNode.connector_id == c.connector_id,
                        TunnelNode.headscale_node_id == nr["node_ref"],
                    )
                    .first()
                )
                if node:
                    route = c
                    break
        else:
            # node_ref missing: only match when exactly one candidate exists
            if len(candidates) == 1:
                route = candidates[0]

        if route is None:
            skipped += 1
            continue

        route.headscale_route_id = nr["headscale_route_id"]
        route.route_status = "approved" if nr["enabled"] else "advertised"
        route.last_synced_at = now

        db.add(TunnelRouteActionLog(
            route_id=route.id,
            action="sync",
            requested_by_user_id=_admin.user_id,
            result="synced",
            safe_message=(
                f"Synced from Headscale: status={route.route_status}"
                f", headscale_route_id={nr['headscale_route_id']}"
            ),
        ))
        updated += 1

    db.commit()
    _LAST_ROUTE_SYNC_AT = now

    return schemas.SyncRoutesOut(
        status="ok",
        synced_routes=updated,
        updated=updated,
        skipped=skipped,
        errors=errors,
        last_sync_at=_LAST_ROUTE_SYNC_AT,
    )


# ── Tunnel audit (Part 5.B) ───────────────────────────────────────────────────


@router.get("/audit", response_model=List[schemas.TunnelAccessAuditLogOut], tags=["tunnels"])
def list_tunnel_audit(
    action: Optional[str] = None,
    user_id: Optional[UUID] = None,
    resource_id: Optional[UUID] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> list:
    q = db.query(TunnelAccessAuditLog)
    if action:
        q = q.filter(TunnelAccessAuditLog.action == action)
    if user_id:
        q = q.filter(TunnelAccessAuditLog.user_id == user_id)
    if resource_id:
        q = q.filter(TunnelAccessAuditLog.resource_id == resource_id)
    rows = q.order_by(TunnelAccessAuditLog.created_at.desc()).limit(max(1, min(limit, 500))).all()
    return [schemas.TunnelAccessAuditLogOut.model_validate(r) for r in rows]
