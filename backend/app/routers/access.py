"""Resource access decision endpoint, decision logs, and access sessions.

Routes
------
  POST /api/access/request              — evaluate access, log decision, create session on allow
  GET  /api/access/logs                 — list access decision logs
  GET  /api/access/sessions             — list access sessions
  GET  /api/access/sessions/{id}        — get single session
  POST /api/access/sessions/{id}/revoke — revoke an active session (admin)
"""
from __future__ import annotations

import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from .. import schemas
from ..deps import get_db, get_current_user, get_current_admin
from ..models import (
    AccessRequestLog,
    AccessSession,
    Connector,
    ConnectorResource,
    Device,
    DeviceTrustScore,
    PostureReport,
    ProtectedResource,
    RoleEnum,
    TunnelAccessAuditLog,
    TunnelNode,
    TunnelRoute,
    User,
)
from ..settings import Settings, get_settings
from ..sio_server import emit_threadsafe, sio

router = APIRouter(prefix="/access", tags=["access"])

SESSION_TTL_SECONDS = 15 * 60  # 15 minutes


# ── Helpers ───────────────────────────────────────────────────────────────────

def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _entra_hard_gate(db: Session, user: User) -> Optional[str]:
    """Return a deny reason when Entra is enabled and Graph explicitly reports the
    account as invalid (e.g. disabled). None otherwise — including when Entra is
    disabled or Graph is unreachable (never lock everyone out on a transient error).
    """
    from ..routers.trust_policy import get_or_create_policy
    if not getattr(get_or_create_policy(db), "entra_enabled", False):
        return None
    from ..services.azure_signal_service import hard_gate_reason
    return hard_gate_reason(user)


def _connector_by_resource(db: Session, cr: ConnectorResource) -> Optional[Connector]:
    """Return the live Connector for a ConnectorResource, or None if not online."""
    if cr.connector_id:
        c = db.query(Connector).filter(Connector.connector_id == cr.connector_id).first()
    else:
        c = (
            db.query(Connector)
            .filter(Connector.network == cr.network)
            .order_by(Connector.last_heartbeat.desc())
            .first()
        )
    if not c or not c.last_heartbeat:
        return None
    age = (datetime.now(timezone.utc) - c.last_heartbeat).total_seconds()
    return c if age < 30 else None  # only truly ONLINE connectors


def _live_connector_status(db: Session, connector_resource_id: Optional[UUID]) -> Optional[str]:
    """Return live connector status: 'online' | 'degraded' | 'offline' | None (no connector)."""
    if not connector_resource_id:
        return None
    cr = db.query(ConnectorResource).filter(
        ConnectorResource.resource_id == connector_resource_id
    ).first()
    if not cr:
        return "offline"
    cid = cr.connector_id
    if cid is None:
        c = (
            db.query(Connector)
            .filter(Connector.network == cr.network)
            .order_by(Connector.last_heartbeat.desc())
            .first()
        )
    else:
        c = db.query(Connector).filter(Connector.connector_id == cid).first()
    if not c or not c.last_heartbeat:
        return "offline"
    age = (datetime.now(timezone.utc) - c.last_heartbeat).total_seconds()
    if age > 60:
        return "offline"
    if age > 30:
        return "degraded"
    return "online"


def _latest_score_for_user(db: Session, user: User, device_id: Optional[UUID]) -> Optional[DeviceTrustScore]:
    """Return latest DeviceTrustScore for a specific device, else most recent across user's devices."""
    if device_id:
        return (
            db.query(DeviceTrustScore)
            .filter(DeviceTrustScore.device_id == device_id)
            .order_by(DeviceTrustScore.calculated_at.desc())
            .first()
        )
    device_ids = [d.device_id for d in user.devices]
    if not device_ids:
        return None
    return (
        db.query(DeviceTrustScore)
        .filter(DeviceTrustScore.device_id.in_(device_ids))
        .order_by(DeviceTrustScore.calculated_at.desc())
        .first()
    )


def _log(
    db: Session,
    *,
    user_id: UUID,
    device_id: Optional[UUID],
    resource_id: Optional[UUID],
    decision: str,
    reason: str,
    trust_score: Optional[float],
) -> UUID:
    """Create an AccessRequestLog entry, return its id, and best-effort push
    a live-update event to any dashboard viewing the Access Logs page.
    """
    log = AccessRequestLog(
        user_id=user_id,
        device_id=device_id,
        resource_id=resource_id,
        decision=decision,
        reason=reason,
        trust_score=trust_score,
    )
    db.add(log)
    db.commit()
    # request_access() is a sync `def` (runs in FastAPI's worker threadpool),
    # so this can't just be `await sio.emit(...)` — emit_threadsafe schedules
    # it onto the loop that's actually driving Socket.IO. The payload is
    # intentionally minimal (a full row needs username/resource_name joins);
    # AccessDecisionsLog just refetches its list on receipt.
    try:
        emit_threadsafe(sio.emit("access_attempt", {"decision": decision}, room="dashboard"))
    except Exception:  # noqa: BLE001
        pass
    return log.id


def _expire_stale_sessions(db: Session) -> None:
    """Mark sessions whose expiry has passed as 'expired'."""
    now = datetime.now(timezone.utc)
    db.query(AccessSession).filter(
        AccessSession.status == "active",
        AccessSession.expires_at < now,
    ).update({AccessSession.status: "expired"}, synchronize_session=False)
    db.commit()


# ── Tunnel-aware helpers (Part 1.D / 5.B) ─────────────────────────────────────

def _evaluate_tunnel_readiness(
    db: Session,
    resource: ProtectedResource,
    connector: Optional[Connector],
    s: Settings,
) -> dict:
    """Read-only. Returns the tunnel-state fields for AccessDecisionOut.
    Never raises. Never calls Headscale, tailscale, or any external system."""
    out = {
        "tunnel_available": False,
        "tunnel_ready": False,
        "tunnel_reason": None,
        "tunnel_target": None,
        "connector_tunnel_status": None,
    }
    try:
        if not s.headscale_enabled:
            out["tunnel_reason"] = "Tunnel disabled"
            return out

        routes = (
            db.query(TunnelRoute)
            .filter(TunnelRoute.resource_id == resource.id, TunnelRoute.enabled == True)  # noqa: E712
            .all()
        )
        if not routes:
            out["tunnel_reason"] = "No tunnel route configured for this resource"
            return out

        out["tunnel_available"] = True

        if connector is None:
            out["tunnel_reason"] = "Connector tunnel not online (status: none)"
            return out

        node = (
            db.query(TunnelNode)
            .filter(TunnelNode.connector_id == connector.connector_id)
            .order_by(TunnelNode.last_seen_at.desc().nullslast())
            .first()
        )
        if node is None or (node.status or "").lower() != "online":
            status_label = (node.status if node else None) or "none"
            out["tunnel_reason"] = f"Connector tunnel not online (status: {status_label})"
            out["connector_tunnel_status"] = node.status if node else None
            return out

        # Prefer a route already in the "approved" lifecycle state if present.
        approved = next(
            (r for r in routes if (getattr(r, "route_status", None) or "").lower() == "approved"),
            None,
        )
        chosen = approved or routes[0]

        out["tunnel_ready"] = True
        out["tunnel_target"] = chosen.subnet_or_host
        out["connector_tunnel_status"] = node.status
        return out
    except Exception:
        # Read-only helper must never raise. Fall through to "not ready" with a generic reason.
        return {
            "tunnel_available": False,
            "tunnel_ready": False,
            "tunnel_reason": "Tunnel evaluation unavailable",
            "tunnel_target": None,
            "connector_tunnel_status": None,
        }


def _audit(
    db: Session,
    *,
    action: str,
    user_id: Optional[UUID] = None,
    device_id: Optional[UUID] = None,
    resource_id: Optional[UUID] = None,
    connector_id: Optional[UUID] = None,
    access_log_id: Optional[UUID] = None,
    safe_message: Optional[str] = None,
) -> None:
    """Append a TunnelAccessAuditLog row. Best-effort; never blocks the caller."""
    try:
        db.add(TunnelAccessAuditLog(
            action=action,
            user_id=user_id,
            device_id=device_id,
            resource_id=resource_id,
            connector_id=connector_id,
            access_log_id=access_log_id,
            safe_message=safe_message,
        ))
        db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass


# ── Access request ─────────────────────────────────────────────────────────────

@router.post("/request", response_model=schemas.AccessDecisionOut)
def request_access(
    payload: schemas.AccessRequestIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    s: Settings = Depends(get_settings),
) -> Any:
    resource = db.query(ProtectedResource).filter(ProtectedResource.id == payload.resource_id).first()

    if not resource:
        _log(
            db,
            user_id=current_user.user_id,
            device_id=payload.device_id,
            resource_id=None,
            decision="deny",
            reason="resource_not_found",
            trust_score=None,
        )
        raise HTTPException(status_code=404, detail="Resource not found")

    resource_out = schemas.ProtectedResourceOut.model_validate(resource)

    # 0a. Entra identity hard gate: when Entra is enabled and Graph EXPLICITLY
    # reports the account as disabled, deny outright — a high trust score must
    # never compensate for a disabled account. Unknown/error → no gate.
    gate_reason = _entra_hard_gate(db, current_user)
    if gate_reason:
        _log(
            db,
            user_id=current_user.user_id,
            device_id=payload.device_id,
            resource_id=resource.id,
            decision="deny",
            reason=gate_reason,
            trust_score=None,
        )
        return schemas.AccessDecisionOut(
            decision="deny",
            reason="Account is disabled in Entra — access denied",
            required_score=resource.minimum_trust_score,
            resource=resource_out,
        )

    # 0. Hard gate: user must have a valid role.
    # A trust score, no matter how high, cannot substitute for an account with no assigned role.
    # For local auth the role column is non-nullable (always ADMIN or EMPLOYEE), so this guard
    # exists primarily to cover edge cases such as direct DB manipulation or future nullable roles.
    # For Azure-synced accounts where the role could be revoked this acts as an enforced barrier.
    if current_user.role is None:
        _log(
            db,
            user_id=current_user.user_id,
            device_id=payload.device_id,
            resource_id=resource.id,
            decision="deny",
            reason="no_valid_role",
            trust_score=None,
        )
        return schemas.AccessDecisionOut(
            decision="deny",
            reason="Account has no valid role assigned — access denied",
            required_score=resource.minimum_trust_score,
            resource=resource_out,
        )

    # 0b. Defence-in-depth: re-check client_access_enabled (valid JWT may survive a later flag change)
    if not getattr(current_user, "client_access_enabled", True):
        _log(
            db,
            user_id=current_user.user_id,
            device_id=payload.device_id,
            resource_id=resource.id,
            decision="deny",
            reason="client_access_disabled",
            trust_score=None,
        )
        return schemas.AccessDecisionOut(
            decision="deny",
            reason="Client app access is disabled for this account",
            required_score=resource.minimum_trust_score,
            resource=resource_out,
        )

    # 0c. Per-resource Entra link requirement
    if getattr(resource, "require_entra_linked", False) and not getattr(current_user, "linked_entra_upn", None):
        _log(
            db,
            user_id=current_user.user_id,
            device_id=payload.device_id,
            resource_id=resource.id,
            decision="deny",
            reason="entra_user_required",
            trust_score=None,
        )
        return schemas.AccessDecisionOut(
            decision="deny",
            reason="This resource requires an Entra-linked identity",
            required_score=resource.minimum_trust_score,
            resource=resource_out,
        )

    # 1. Resource disabled
    if not resource.enabled:
        _log(
            db,
            user_id=current_user.user_id,
            device_id=payload.device_id,
            resource_id=resource.id,
            decision="deny",
            reason="resource_disabled",
            trust_score=None,
        )
        return schemas.AccessDecisionOut(
            decision="deny",
            reason="Resource is disabled",
            required_score=resource.minimum_trust_score,
            resource=resource_out,
        )

    # Validate explicit device_id belongs to user (admins exempt)
    if payload.device_id:
        device = db.query(Device).filter(Device.device_id == payload.device_id).first()
        if not device:
            _log(
                db,
                user_id=current_user.user_id,
                device_id=payload.device_id,
                resource_id=resource.id,
                decision="deny",
                reason="device_not_found",
                trust_score=None,
            )
            return schemas.AccessDecisionOut(
                decision="deny",
                reason="Device not found",
                required_score=resource.minimum_trust_score,
                resource=resource_out,
            )
        if current_user.role != RoleEnum.ADMIN and device.user_id != current_user.user_id:
            _log(
                db,
                user_id=current_user.user_id,
                device_id=payload.device_id,
                resource_id=resource.id,
                decision="deny",
                reason="device_not_owned",
                trust_score=None,
            )
            return schemas.AccessDecisionOut(
                decision="deny",
                reason="Device does not belong to user",
                required_score=resource.minimum_trust_score,
                resource=resource_out,
            )

    # 2. No latest trust score
    score = _latest_score_for_user(db, current_user, payload.device_id)
    if not score:
        _log(
            db,
            user_id=current_user.user_id,
            device_id=payload.device_id,
            resource_id=resource.id,
            decision="deny",
            reason="no_trust_score",
            trust_score=None,
        )
        return schemas.AccessDecisionOut(
            decision="deny",
            reason="No trust score available for device",
            required_score=resource.minimum_trust_score,
            resource=resource_out,
        )

    # 3. Hard-denied by a deny_immediately_resources signal on the latest check
    if getattr(score, "hard_denied_resources", False):
        _log(
            db,
            user_id=current_user.user_id,
            device_id=score.device_id,
            resource_id=resource.id,
            decision="deny",
            reason=score.hard_deny_reason or "hard_denied_by_policy",
            trust_score=score.total_score,
        )
        return schemas.AccessDecisionOut(
            decision="deny",
            reason=score.hard_deny_reason or "Denied by a signal configured to deny resource access immediately. Run a new device check to clear this.",
            trust_score=score.total_score,
            required_score=resource.minimum_trust_score,
            resource=resource_out,
        )

    # 4. Trust score too low
    if score.total_score < resource.minimum_trust_score:
        _log(
            db,
            user_id=current_user.user_id,
            device_id=score.device_id,
            resource_id=resource.id,
            decision="deny",
            reason=f"trust_score_below_minimum ({score.total_score} < {resource.minimum_trust_score})",
            trust_score=score.total_score,
        )
        return schemas.AccessDecisionOut(
            decision="deny",
            reason=f"Trust score {score.total_score} below required {resource.minimum_trust_score}",
            trust_score=score.total_score,
            required_score=resource.minimum_trust_score,
            resource=resource_out,
        )

    # 5. Intune compliance required
    if resource.require_intune_compliant:
        report = (
            db.query(PostureReport)
            .filter(PostureReport.device_id == score.device_id)
            .order_by(PostureReport.reported_at.desc())
            .first()
        )
        if not report or not report.intune_compliant:
            _log(
                db,
                user_id=current_user.user_id,
                device_id=score.device_id,
                resource_id=resource.id,
                decision="deny",
                reason="intune_not_compliant",
                trust_score=score.total_score,
            )
            return schemas.AccessDecisionOut(
                decision="deny",
                reason="Device is not Intune compliant",
                trust_score=score.total_score,
                required_score=resource.minimum_trust_score,
                resource=resource_out,
            )

    # 6. Connector availability check
    online_connector: Optional[Connector] = None
    if resource.connector_resource_id:
        conn_status = _live_connector_status(db, resource.connector_resource_id)
        if conn_status != "online":
            label = conn_status or "offline"
            _log(
                db,
                user_id=current_user.user_id,
                device_id=score.device_id,
                resource_id=resource.id,
                decision="deny",
                reason=f"connector_{label}",
                trust_score=score.total_score,
            )
            return schemas.AccessDecisionOut(
                decision="deny",
                reason=f"Connector is {label} — access denied",
                trust_score=score.total_score,
                required_score=resource.minimum_trust_score,
                resource=resource_out,
            )
        # Resolve the actual Connector row for session binding
        cr = db.query(ConnectorResource).filter(
            ConnectorResource.resource_id == resource.connector_resource_id
        ).first()
        if cr:
            online_connector = _connector_by_resource(db, cr)

    # 7. Allow — evaluate tunnel readiness, resolve access_mode, mint session as needed.
    tunnel_eval = _evaluate_tunnel_readiness(db, resource, online_connector, s)

    preferred = (resource.preferred_access_mode or "auto").lower()
    require_tunnel = bool(getattr(resource, "require_tunnel", False))
    allow_fallback = bool(getattr(resource, "allow_http_fallback", True))
    tunnel_ready = bool(tunnel_eval["tunnel_ready"])

    # Resolve mode + whether to mint an HTTP session + deny conversion.
    access_mode = "http_proxy"
    fallback_used = False
    convert_to_deny = False
    mint_http_session = True

    if preferred == "http_proxy":
        access_mode = "http_proxy"
        fallback_used = False
        mint_http_session = True
    elif preferred == "wireguard_tunnel":
        if tunnel_ready:
            access_mode = "wireguard_tunnel"
            fallback_used = False
            mint_http_session = False
        elif require_tunnel and not allow_fallback:
            convert_to_deny = True
        else:
            access_mode = "http_proxy"
            fallback_used = True
            mint_http_session = True
    else:  # "auto" (default)
        if tunnel_ready:
            access_mode = "both"
            fallback_used = False
            mint_http_session = True
        elif require_tunnel and not allow_fallback:
            convert_to_deny = True
        else:
            access_mode = "http_proxy"
            fallback_used = True if require_tunnel else False
            mint_http_session = True

    # ── Deny path (tunnel required + not ready + no fallback) ────────────────
    if convert_to_deny:
        deny_reason = (
            f"tunnel_required_not_ready: {tunnel_eval['tunnel_reason']}"
        )
        deny_log = AccessRequestLog(
            user_id=current_user.user_id,
            device_id=score.device_id,
            resource_id=resource.id,
            decision="deny",
            reason=deny_reason,
            trust_score=score.total_score,
            access_mode="denied",
            tunnel_ready=False,
            tunnel_reason=tunnel_eval["tunnel_reason"],
            fallback_used=False,
            require_tunnel_at_decision=require_tunnel,
        )
        db.add(deny_log)
        db.commit()
        db.refresh(deny_log)

        _audit(
            db,
            action="tunnel_required_denied",
            user_id=current_user.user_id,
            device_id=score.device_id,
            resource_id=resource.id,
            connector_id=online_connector.connector_id if online_connector else None,
            access_log_id=deny_log.id,
            safe_message=f"Tunnel required but not ready: {tunnel_eval['tunnel_reason']}",
        )

        return schemas.AccessDecisionOut(
            decision="deny",
            reason=f"Tunnel required but not ready: {tunnel_eval['tunnel_reason']}",
            trust_score=score.total_score,
            required_score=resource.minimum_trust_score,
            resource=resource_out,
            connector_id=online_connector.connector_id if online_connector else None,
            access_mode="denied",
            tunnel_ready=False,
            tunnel_reason=tunnel_eval["tunnel_reason"],
            tunnel_target=tunnel_eval["tunnel_target"],
            connector_tunnel_status=tunnel_eval["connector_tunnel_status"],
            http_proxy_available=False,
            tunnel_available=tunnel_eval["tunnel_available"],
            fallback_used=False,
        )

    # ── Allow path — write rich AccessRequestLog row directly ────────────────
    decision = "allow"
    reason = f"trust_score_meets_minimum ({score.total_score} >= {resource.minimum_trust_score})"
    log = AccessRequestLog(
        user_id=current_user.user_id,
        device_id=score.device_id,
        resource_id=resource.id,
        decision=decision,
        reason=reason,
        trust_score=score.total_score,
        access_mode=access_mode,
        tunnel_ready=tunnel_ready,
        tunnel_reason=tunnel_eval["tunnel_reason"],
        fallback_used=fallback_used,
        require_tunnel_at_decision=require_tunnel,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    log_id = log.id

    session = None
    token_plain: Optional[str] = None
    expires_at: Optional[datetime] = None
    access_url: Optional[str] = None
    launch_url: Optional[str] = None

    if mint_http_session:
        token_plain = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=SESSION_TTL_SECONDS)

        session = AccessSession(
            user_id=current_user.user_id,
            device_id=score.device_id,
            resource_id=resource.id,
            connector_id=online_connector.connector_id if online_connector else None,
            access_log_id=log_id,
            session_token_hash=_sha256(token_plain),
            status="active",
            expires_at=expires_at,
        )
        db.add(session)
        db.commit()
        db.refresh(session)

        _proxy_base = os.getenv("DEMO_CONNECTOR_PROXY_BASE_URL", "").rstrip("/")

        # Generate one-time launch code for ZTNA gateway flow (stored as hash only)
        _launch_code = secrets.token_urlsafe(24)
        session.launch_code_hash = hashlib.sha256(_launch_code.encode()).hexdigest()
        session.launch_code_expires_at = datetime.now(timezone.utc) + timedelta(seconds=300)
        session.launch_code_used = False
        db.commit()

        if _proxy_base:
            # launch_url: one-time code, opens in default browser, sets HttpOnly cookie
            launch_url = f"{_proxy_base}/launch/{_launch_code}"
            # access_url: token-in-URL, works in any browser while session is active
            # The /r/ gateway accepts ?token= as a fallback when no cookie is present.
            access_url = f"{_proxy_base}/r/{session.id}/?token={token_plain}"
        else:
            launch_url = None
            access_url = f"modzero://access/{session.id}"

    # Tunnel-related audit rows (best-effort).
    if fallback_used:
        _audit(
            db,
            action="http_fallback_used",
            user_id=current_user.user_id,
            device_id=score.device_id,
            resource_id=resource.id,
            connector_id=online_connector.connector_id if online_connector else None,
            access_log_id=log_id,
            safe_message=f"HTTP fallback issued: {tunnel_eval['tunnel_reason']}",
        )
    if tunnel_ready and access_mode in ("wireguard_tunnel", "both"):
        _audit(
            db,
            action="tunnel_ready_reported",
            user_id=current_user.user_id,
            device_id=score.device_id,
            resource_id=resource.id,
            connector_id=online_connector.connector_id if online_connector else None,
            access_log_id=log_id,
            safe_message=f"Tunnel ready (mode={access_mode})",
        )

    http_proxy_available = access_mode in ("http_proxy", "both")

    return schemas.AccessDecisionOut(
        decision=decision,
        reason=f"Trust score {score.total_score} meets required {resource.minimum_trust_score}",
        trust_score=score.total_score,
        required_score=resource.minimum_trust_score,
        resource=resource_out,
        session_id=session.id if session else None,
        access_token=token_plain,
        expires_at=expires_at,
        access_url=access_url,
        launch_url=launch_url,
        connector_id=(session.connector_id if session else (online_connector.connector_id if online_connector else None)),
        access_mode=access_mode,
        tunnel_ready=tunnel_ready,
        tunnel_reason=tunnel_eval["tunnel_reason"],
        tunnel_target=tunnel_eval["tunnel_target"],
        connector_tunnel_status=tunnel_eval["connector_tunnel_status"],
        http_proxy_available=http_proxy_available,
        tunnel_available=tunnel_eval["tunnel_available"],
        fallback_used=fallback_used,
        fallback_access_url=access_url if mint_http_session else None,
    )


# ── Launch code exchange (ZTNA gateway) ────────────────────────────────────────

@router.post("/launch/exchange", response_model=schemas.AccessLaunchExchangeResponse, tags=["access"])
def exchange_launch_code(
    body: schemas.AccessLaunchExchangeRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    """Connector-facing. Exchanges one-time launch_code for session credentials.
    Requires X-Connector-Id + X-Connector-Secret headers.
    Generates a NEW access_token and replaces session_token_hash — old legacy token becomes invalid."""
    from .connectors import _verify_connector_auth
    _verify_connector_auth(request, db)

    code_hash = hashlib.sha256(body.launch_code.encode()).hexdigest()
    session = db.query(AccessSession).filter(
        AccessSession.launch_code_hash == code_hash
    ).first()
    now = datetime.now(timezone.utc)

    if not session:
        raise HTTPException(status_code=404, detail="launch_code_not_found")
    if session.launch_code_used:
        raise HTTPException(status_code=410, detail="launch_code_already_used")
    if session.launch_code_expires_at and session.launch_code_expires_at < now:
        raise HTTPException(status_code=410, detail="launch_code_expired")
    if session.status != "active":
        raise HTTPException(status_code=403, detail="session_not_active")
    if session.expires_at < now:
        raise HTTPException(status_code=410, detail="session_expired")

    new_token = secrets.token_urlsafe(32)
    session.session_token_hash = hashlib.sha256(new_token.encode()).hexdigest()
    session.launch_code_used = True
    db.commit()

    resource = (
        db.query(ProtectedResource).filter(ProtectedResource.id == session.resource_id).first()
        if session.resource_id else None
    )
    return schemas.AccessLaunchExchangeResponse(
        session_id=session.id,
        access_token=new_token,
        resource_name=resource.name if resource else None,
        expires_at=session.expires_at,
    )


# ── Access logs ────────────────────────────────────────────────────────────────

@router.get("/logs", response_model=List[schemas.AccessLogRichOut])
def list_access_logs(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Admins see all logs; employees see only their own."""
    q = db.query(AccessRequestLog)
    if current_user.role != RoleEnum.ADMIN:
        q = q.filter(AccessRequestLog.user_id == current_user.user_id)
    logs = q.order_by(AccessRequestLog.timestamp.desc()).limit(max(1, min(limit, 500))).all()

    user_ids = {log.user_id for log in logs if log.user_id}
    resource_ids = {log.resource_id for log in logs if log.resource_id}
    user_map = {u.user_id: u.username for u in db.query(User).filter(User.user_id.in_(user_ids)).all()} if user_ids else {}
    resource_map = {r.id: r.name for r in db.query(ProtectedResource).filter(ProtectedResource.id.in_(resource_ids)).all()} if resource_ids else {}

    return [
        schemas.AccessLogRichOut(
            id=log.id,
            user_id=log.user_id,
            username=user_map.get(log.user_id),
            device_id=log.device_id,
            resource_id=log.resource_id,
            resource_name=resource_map.get(log.resource_id) if log.resource_id else None,
            decision=log.decision,
            reason=log.reason,
            trust_score=log.trust_score,
            timestamp=log.timestamp,
            access_mode=log.access_mode,
            tunnel_ready=log.tunnel_ready,
            tunnel_reason=log.tunnel_reason,
            fallback_used=log.fallback_used,
            require_tunnel_at_decision=log.require_tunnel_at_decision,
        )
        for log in logs
    ]


# ── Access sessions ────────────────────────────────────────────────────────────

def _enrich_sessions(db: Session, sessions: list) -> List[schemas.AccessSessionOut]:
    """Batch-enrich sessions with resource names."""
    resource_ids = {s.resource_id for s in sessions if s.resource_id}
    resource_map = (
        {r.id: r.name for r in db.query(ProtectedResource).filter(ProtectedResource.id.in_(resource_ids)).all()}
        if resource_ids else {}
    )
    return [
        schemas.AccessSessionOut(
            id=s.id,
            user_id=s.user_id,
            device_id=s.device_id,
            resource_id=s.resource_id,
            resource_name=resource_map.get(s.resource_id) if s.resource_id else None,
            connector_id=s.connector_id,
            access_log_id=s.access_log_id,
            status=s.status,
            created_at=s.created_at,
            expires_at=s.expires_at,
            revoked_at=s.revoked_at,
            last_used_at=s.last_used_at,
        )
        for s in sessions
    ]


@router.get("/sessions", response_model=List[schemas.AccessSessionOut])
def list_sessions(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Admins see all sessions; employees see only their own. Auto-expires stale sessions."""
    _expire_stale_sessions(db)
    q = db.query(AccessSession)
    if current_user.role != RoleEnum.ADMIN:
        q = q.filter(AccessSession.user_id == current_user.user_id)
    sessions = q.order_by(AccessSession.created_at.desc()).limit(max(1, min(limit, 500))).all()
    return _enrich_sessions(db, sessions)


@router.get("/sessions/{session_id}", response_model=schemas.AccessSessionOut)
def get_session(
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Get a single session. Employees can only access their own sessions."""
    _expire_stale_sessions(db)
    session = db.query(AccessSession).filter(AccessSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if current_user.role != RoleEnum.ADMIN and session.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    resource_name = None
    if session.resource_id:
        r = db.query(ProtectedResource).filter(ProtectedResource.id == session.resource_id).first()
        resource_name = r.name if r else None
    out = schemas.AccessSessionOut.model_validate(session)
    out.resource_name = resource_name
    return out


@router.post("/sessions/{session_id}/revoke", response_model=schemas.AccessSessionOut)
def revoke_session(
    session_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> Any:
    """Revoke an active session (admin only)."""
    session = db.query(AccessSession).filter(AccessSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != "active":
        raise HTTPException(status_code=409, detail=f"Session is already {session.status}")
    session.status = "revoked"
    session.revoked_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(session)
    # Audit-only side-effect (Part 5.C): never affects revoke semantics.
    try:
        if session.access_log_id:
            prior_log = (
                db.query(AccessRequestLog)
                .filter(AccessRequestLog.id == session.access_log_id)
                .first()
            )
            if prior_log and (prior_log.access_mode or "") in ("wireguard_tunnel", "both"):
                _audit(
                    db,
                    action="session_revoked_with_tunnel",
                    user_id=session.user_id,
                    device_id=session.device_id,
                    resource_id=session.resource_id,
                    access_log_id=session.access_log_id,
                    safe_message="HTTP session revoked; tunnel access is coarse-grained and must be revoked separately if required",
                )
    except Exception:
        pass
    resource_name = None
    if session.resource_id:
        r = db.query(ProtectedResource).filter(ProtectedResource.id == session.resource_id).first()
        resource_name = r.name if r else None
    out = schemas.AccessSessionOut.model_validate(session)
    out.resource_name = resource_name
    return out
