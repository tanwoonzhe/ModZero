"""Per-route action endpoints (advertise-package, approve).

Never echoes HEADSCALE_API_KEY or raw Headscale response bodies.
Mounted under /api/tunnels (same prefix as tunnels.py).
"""

from datetime import datetime, timezone
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import schemas
from ..deps import get_db, get_current_admin
from ..models import Connector, TunnelNode, TunnelRoute, TunnelRouteActionLog, User
from ..services.headscale_service import (
    HeadscaleService,
    HeadscaleError,
)
from ..settings import get_settings


router = APIRouter()


@router.post(
    "/routes/{route_id}/advertise-package",
    response_model=schemas.RouteAdvertiseOut,
    tags=["tunnels"],
)
def route_advertise_package(
    route_id: UUID,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> schemas.RouteAdvertiseOut:
    """Generate a manual tailscale advertise command for a route.

    Always returns HTTP 200. Includes warnings when HEADSCALE_ENABLED=false or
    HEADSCALE_URL is not set. Never embeds HEADSCALE_API_KEY.
    Does NOT change route_status — only sync can do that.
    """
    route = db.query(TunnelRoute).filter(TunnelRoute.id == route_id).first()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")

    connector = db.query(Connector).filter(
        Connector.connector_id == route.connector_id
    ).first()
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    s = get_settings()
    warnings: List[str] = []

    if not s.headscale_enabled:
        warnings.append(
            "HEADSCALE_ENABLED=false — command is for reference only."
        )

    if s.headscale_url:
        login_server = s.headscale_url.rstrip("/")
    else:
        login_server = "{LOGIN_SERVER}"
        warnings.append(
            "HEADSCALE_URL not configured. Replace {LOGIN_SERVER} with your Headscale URL."
        )

    # Compute the advertise value
    if route.route_type == "subnet":
        suggested_advertise_value = route.subnet_or_host
    else:
        # host: ensure /32 suffix
        if "/" in route.subnet_or_host:
            suggested_advertise_value = route.subnet_or_host
        else:
            suggested_advertise_value = f"{route.subnet_or_host}/32"

    manual_command = (
        f"tailscale up \\\n"
        f"  --login-server={login_server} \\\n"
        f"  --advertise-routes={suggested_advertise_value} \\\n"
        f"  --accept-routes=false \\\n"
        f"  --accept-dns=false"
    )

    route.advertise_command = manual_command
    db.add(TunnelRouteActionLog(
        route_id=route.id,
        action="advertise_package",
        requested_by_user_id=admin.user_id,
        result="generated",
        safe_message=f"Advertise command generated for {route.subnet_or_host}",
    ))
    db.commit()

    return schemas.RouteAdvertiseOut(
        route_id=route.id,
        connector_id=route.connector_id,
        connector_name=connector.name,
        route_type=route.route_type,
        subnet_or_host=route.subnet_or_host,
        suggested_advertise_value=suggested_advertise_value,
        manual_command=manual_command,
        warnings=warnings,
    )


@router.post(
    "/routes/{route_id}/approve",
    response_model=schemas.RouteApproveOut,
    tags=["tunnels"],
)
def route_approve(
    route_id: UUID,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> schemas.RouteApproveOut:
    """Attempt to approve a route via Headscale API, or return a manual command.

    Seven ordered safety checks must pass before any action is taken.
    Only marks route_status='approved' on confirmed Headscale API success.
    """
    s = get_settings()
    svc = HeadscaleService()

    # Safety check 1
    if not s.headscale_enabled:
        raise HTTPException(status_code=400, detail="HEADSCALE_ENABLED is false")

    # Safety check 2
    if not svc.is_configured():
        raise HTTPException(
            status_code=400,
            detail="Headscale not configured (missing URL or API key)",
        )

    # Safety check 3
    route = db.query(TunnelRoute).filter(TunnelRoute.id == route_id).first()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")

    # Safety check 4
    if not route.enabled:
        raise HTTPException(
            status_code=400, detail="Route is not enabled in ModZero"
        )

    # Safety check 5
    node_with_hs_id = (
        db.query(TunnelNode)
        .filter(
            TunnelNode.connector_id == route.connector_id,
            TunnelNode.headscale_node_id.isnot(None),
        )
        .first()
    )
    if not node_with_hs_id:
        raise HTTPException(
            status_code=409,
            detail="Connector has no Headscale node registered — run sync first",
        )

    # Safety check 6
    if route.route_status != "advertised":
        raise HTTPException(
            status_code=409,
            detail=f"Route must be 'advertised' state (current: {route.route_status})",
        )

    # Safety check 7
    if not route.headscale_route_id:
        raise HTTPException(
            status_code=409,
            detail="No Headscale route ID — run sync-routes first",
        )

    manual_command = f"headscale routes enable -r {route.headscale_route_id}"

    # Try-API path only when explicitly enabled
    if s.headscale_bootstrap_try_api:
        try:
            svc.approve_route(route.headscale_route_id)
            route.route_status = "approved"
            db.add(TunnelRouteActionLog(
                route_id=route.id,
                action="approve_success",
                requested_by_user_id=admin.user_id,
                result="approved",
                safe_message="Route approved via Headscale API.",
            ))
            db.commit()
            return schemas.RouteApproveOut(
                route_id=route.id,
                status="approved",
                safe_message="Route approved via Headscale API.",
                manual_command=None,
            )
        except HeadscaleError:
            pass  # fall through to manual_required

    # Manual-required (default or API fallback)
    db.add(TunnelRouteActionLog(
        route_id=route.id,
        action="manual_required",
        requested_by_user_id=admin.user_id,
        result="manual_required",
        safe_message="Run the command on the Headscale server.",
    ))
    db.commit()
    return schemas.RouteApproveOut(
        route_id=route.id,
        status="manual_required",
        safe_message="Run the command on the Headscale server.",
        manual_command=manual_command,
    )
