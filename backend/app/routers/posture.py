"""Device posture report and trust score endpoints.

Routes
------
  POST /api/posture/report           — client submits posture signals
  GET  /api/trust/latest             — latest score for the calling user
  GET  /api/trust/device/{device_id} — latest score for a specific device
"""
from __future__ import annotations

import logging
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from .. import schemas
from ..azure_service import azure_service
from ..deps import get_db, get_current_user
from ..models import Connector, ConnectorOnlineStatusEnum, Device, DeviceTrustScore, PostureReport, RoleEnum, TrustPolicyConfig, User
from ..routers.trust_policy import get_or_create_policy
from ..services.azure_signal_service import AzureSignals, collect_azure_signals
from ..services.context_analysis_service import score_context_default
from ..services.identity_signal_service import signals_from_local_user, get_mock_identity_signals, score_identity_signals
from ..services.posture_scoring import score_posture, weighted_total
from ..services.signal_rules import get_signal_rules
from ..settings import get_settings
from ..sio_server import notify_assessment_update, notify_force_logout

log = logging.getLogger(__name__)
router = APIRouter()


def _maybe_collect_azure(policy: TrustPolicyConfig, user: User, device: Device) -> Optional[AzureSignals]:
    """Resolve Entra signals when the admin has enabled the integration.

    Returns None when Entra is disabled, so callers fall back to local-only
    scoring unchanged. Never raises (collect_azure_signals is best-effort).
    """
    if not getattr(policy, "entra_enabled", False):
        return None
    return collect_azure_signals(user, device, getattr(policy, "valid_role_ids", None))


async def _enforce_hard_fails(
    db: Session, user: User, hard_fails: list[dict]
) -> tuple[bool, Optional[str], bool, Optional[str]]:
    """Apply the consequence of every signal configured with a hard failure_action.

    deny_immediately_client  → pushes a force_logout Socket.IO event so an
                                already-open client app logs out within
                                seconds, and stamps DeviceTrustScore.hard_denied_client
                                so the client app's own post-login device check
                                (see main.ts's modzero:save-and-connect) bounces
                                back to onboarding instead of connecting. This
                                is deliberately NOT the same thing as
                                User.client_access_enabled (the admin's manual,
                                persistent switch) — it's ephemeral, tied to the
                                MOST RECENT check, and clears itself automatically
                                the moment a later check passes. No admin action
                                is needed to "undo" it, and it never touches the
                                Client/Web-Only badge in the Users page. Login
                                itself is never blocked server-side for this
                                reason — see auth.py's login() for why that
                                would deadlock.
    deny_immediately_resources → returned as (True, reason) so the caller can
                                stamp DeviceTrustScore.hard_denied_resources;
                                access.py's resource gate and connectors.py's
                                introspect both refuse every request against
                                this score until the next passing device check.

    Returns (hard_denied_resources, hard_deny_reason, hard_denied_client, hard_deny_client_reason).
    """
    client_fails = [f for f in hard_fails if f["failure_action"] == "deny_immediately_client"]
    resource_fails = [f for f in hard_fails if f["failure_action"] == "deny_immediately_resources"]

    hard_denied_client = False
    hard_deny_client_reason = None
    if client_fails:
        labels = ", ".join(f["signal"] for f in client_fails)
        hard_denied_client = True
        hard_deny_client_reason = f"hard_denied_by_policy: {labels}"
        log.warning(
            "Blocking client-app connect for %s until next passing check — failed hard-gate signal(s): %s",
            user.username, [f["signal"] for f in client_fails],
        )
        try:
            await notify_force_logout(str(user.user_id), hard_deny_client_reason)
        except Exception as exc:  # noqa: BLE001
            log.warning("force_logout notification failed for %s: %s", user.username, exc)

    if not resource_fails:
        return False, None, hard_denied_client, hard_deny_client_reason
    labels = ", ".join(f["signal"] for f in resource_fails)
    return True, f"hard_denied_by_policy: {labels}", hard_denied_client, hard_deny_client_reason


async def _score_and_persist(
    db: Session,
    policy: TrustPolicyConfig,
    current_user: User,
    device: Device,
    device_is_known: bool,
    report: PostureReport,
    source_ip: Optional[str],
    settings,
) -> dict:
    """Run posture + context + identity scoring, enforce hard-fail signals, and
    persist the resulting DeviceTrustScore.

    Shared by submit_posture_report and client_posture_report so both
    endpoints score and enforce identically — a signal-rule change (or a new
    deny_immediately_* action) can't behave differently depending on which
    route the client happened to call.
    """
    azure = _maybe_collect_azure(policy, current_user, device)

    device_rules = get_signal_rules(db, "device")
    context_rules = get_signal_rules(db, "context")
    identity_rules = get_signal_rules(db, "identity")

    posture_score, posture_breakdown, device_hard_fails = score_posture(
        report, azure.device_overrides() if azure else None, rules=device_rules,
    )

    # gateway_online: is at least one connector currently online. Evaluated at
    # device-check time (not tied to a specific resource, unlike access.py's
    # per-resource connector check), so this is a coarse "is the backend
    # reachable at all" system-health signal, not per-resource routing.
    gateway_online = db.query(Connector).filter(
        Connector.status == ConnectorOnlineStatusEnum.ONLINE
    ).first() is not None

    ctx_score, ctx_breakdown, context_hard_fails = score_context_default(
        source_ip=source_ip,
        known_device=device_is_known,
        failed_attempt_count=current_user.failed_login_count or 0,
        allowed_start_hour=policy.allowed_start_hour,
        allowed_end_hour=policy.allowed_end_hour,
        max_failed_attempts=policy.max_failed_attempts,
        require_known_device=policy.require_known_device,
        unknown_device_penalty=policy.unknown_device_penalty,
        suspicious_ip_penalty=policy.suspicious_ip_penalty,
        blocked_ips=policy.blocked_ips or [],
        gateway_online=gateway_online,
        include_azure=bool(azure),
        na_reasons=azure.na_reasons if azure else None,
        rules=context_rules,
        **(azure.context_kwargs() if azure else {}),
    )
    ctx_source = "backend_realtime"

    if settings.graph_mode == "real":
        id_signals = signals_from_local_user(current_user)
    else:
        id_signals = get_mock_identity_signals(current_user)
    if azure:
        for k, v in azure.identity_kwargs().items():
            setattr(id_signals, k, v)
    identity_score, id_breakdown, identity_hard_fails = score_identity_signals(
        id_signals, include_azure=bool(azure),
        na_reasons=azure.na_reasons if azure else None,
        rules=identity_rules,
    )
    identity_source = "entra" if azure else f"local_{settings.graph_mode}"

    total = weighted_total(
        posture_score, ctx_score, identity_score,
        device_weight=policy.device_weight,
        context_weight=policy.context_weight,
        identity_weight=policy.identity_weight,
    )

    threshold = policy.default_threshold
    decision = "ALLOW" if total >= threshold else "DENY"
    reason = "score_meets_policy" if decision == "ALLOW" else "trust_score_below_threshold"

    full_breakdown = posture_breakdown + ctx_breakdown + id_breakdown
    all_hard_fails = device_hard_fails + context_hard_fails + identity_hard_fails
    hard_denied_resources, hard_deny_reason, hard_denied_client, hard_deny_client_reason = (
        await _enforce_hard_fails(db, current_user, all_hard_fails)
    )
    # block_outside_hours (Trust Policies → Context Rules): unlike
    # normal_access_time's own signal_rules failure_action, this is a
    # separate, policy-level "deny regardless of trust score" toggle — so it
    # hard-denies resource access rather than just costing normal_access_time's
    # points, mirroring exactly what its own UI copy promises.
    if policy.block_outside_hours and not hard_denied_resources:
        outside_hours = any(
            item.get("signal") == "normal_access_time" and item.get("passed") is False
            for item in ctx_breakdown
        )
        if outside_hours:
            hard_denied_resources = True
            hard_deny_reason = "outside_allowed_hours (policy: block_outside_hours)"

    if hard_denied_resources:
        decision = "DENY"
        reason = hard_deny_reason
    elif hard_denied_client:
        decision = "DENY"
        reason = hard_deny_client_reason

    trust = DeviceTrustScore(
        device_id=device.device_id,
        report_id=report.report_id,
        posture_score=posture_score,
        context_score=ctx_score,
        identity_score=identity_score,
        total_score=total,
        breakdown=full_breakdown,
        hard_denied_resources=hard_denied_resources,
        hard_deny_reason=hard_deny_reason,
        hard_denied_client=hard_denied_client,
        hard_deny_client_reason=hard_deny_client_reason,
    )
    db.add(trust)
    db.commit()
    db.refresh(report)
    db.refresh(trust)

    # Best-effort push so the Dashboard Overview's trust score / assessment
    # views refresh live instead of waiting on their own polling.
    try:
        await notify_assessment_update()
    except Exception:  # noqa: BLE001
        pass

    return {
        "azure": azure,
        "posture_score": posture_score, "posture_breakdown": posture_breakdown,
        "ctx_score": ctx_score, "ctx_breakdown": ctx_breakdown, "ctx_source": ctx_source,
        "identity_score": identity_score, "id_breakdown": id_breakdown, "identity_source": identity_source,
        "total": total, "threshold": threshold, "decision": decision, "reason": reason,
        "full_breakdown": full_breakdown, "trust": trust,
        "hard_denied_resources": hard_denied_resources, "hard_deny_reason": hard_deny_reason,
        "hard_denied_client": hard_denied_client, "hard_deny_client_reason": hard_deny_client_reason,
    }


# ── helpers ───────────────────────────────────────────────────────────────────

def _resolve_device(payload: schemas.PostureReportIn, user: User, db: Session) -> tuple[Device, bool]:
    """Return (device, is_known) — an existing Device or a freshly auto-registered one.

    is_known=True only for a device row that already existed before this
    request; a device created right here (first-ever check-in) is not
    "known" yet. Backs the known_device context signal — previously always
    True regardless of whether the device had ever been seen before, since
    every caller (including this function's own auto-register path) has a
    non-null device_id by the time scoring runs.
    """
    # 1. Explicit device_id
    if payload.device_id:
        device = db.query(Device).filter(Device.device_id == payload.device_id).first()
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")
        if user.role != RoleEnum.ADMIN and device.user_id != user.user_id:
            raise HTTPException(status_code=403, detail="Not your device")
        return device, True

    # 2. Fingerprint lookup / auto-register
    if payload.fingerprint:
        device = db.query(Device).filter(Device.fingerprint == payload.fingerprint).first()
        if device:
            if user.role != RoleEnum.ADMIN and device.user_id != user.user_id:
                raise HTTPException(status_code=403, detail="Not your device")
            # Update os_version if supplied
            if payload.os_version and device.os_version != payload.os_version:
                device.os_version = payload.os_version
            return device, True

    # 3. Auto-register new device
    device = Device(
        user_id=user.user_id,
        device_name=payload.device_name or f"{user.username}-device",
        os_version=payload.os_version,
        fingerprint=payload.fingerprint,
    )
    db.add(device)
    db.flush()  # populate device_id without committing yet
    return device, False


def _score_dict(score: DeviceTrustScore) -> dict:
    return {
        "score_id": str(score.score_id),
        "device_id": str(score.device_id),
        "report_id": str(score.report_id) if score.report_id else None,
        "posture_score": score.posture_score,
        "context_score": score.context_score,
        "identity_score": getattr(score, "identity_score", 100.0) or 100.0,
        "total_score": score.total_score,
        "breakdown": score.breakdown,
        "calculated_at": score.calculated_at,
        "hard_denied_resources": bool(getattr(score, "hard_denied_resources", False)),
        "hard_deny_reason": getattr(score, "hard_deny_reason", None),
        "hard_denied_client": bool(getattr(score, "hard_denied_client", False)),
        "hard_deny_client_reason": getattr(score, "hard_deny_client_reason", None),
    }


# ── Intune compliance overlay ─────────────────────────────────────────────────

def _lookup_intune_compliance(device_hostname: Optional[str]) -> Optional[bool]:
    """Try to fetch this device's Intune compliance from Microsoft Graph.

    Only called when GRAPH_MODE=real (i.e., real Azure credentials are configured).
    Returns True (compliant), False (not compliant), or None (not found / error).
    """
    if not device_hostname:
        return None
    try:
        devices = azure_service.get_managed_devices(top=500)
        for d in devices:
            if (d.get("deviceName") or "").lower() == device_hostname.lower():
                compliant = d.get("complianceState") == "compliant"
                log.info("Intune lookup: %s → complianceState=%s, compliant=%s",
                         device_hostname, d.get("complianceState"), compliant)
                return compliant
        log.warning("Intune lookup: device '%s' not found in %d managed devices", device_hostname, len(devices))
    except Exception as exc:
        log.warning("Intune Graph lookup failed for '%s': %s", device_hostname, exc)
    return None


# ── POST /api/posture/report ──────────────────────────────────────────────────

@router.post("/posture/report", status_code=status.HTTP_201_CREATED)
async def submit_posture_report(
    payload: schemas.PostureReportIn,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Submit posture signals from the client app.

    The backend:
      1. Resolves / auto-registers the device.
      2. Overlays Intune compliance from Microsoft Graph (if Graph is configured).
      3. Reads trust policy weights from TrustPolicyConfig (DB).
      4. Computes Device Posture Score, Context Score, Identity Score.
      5. Combines them with configurable weights → Final Trust Score.
      6. Compares against default_threshold → ALLOW / DENY decision.
      7. Persists PostureReport + DeviceTrustScore.
      8. Returns full structured response including weights, contributions,
         decision, and source metadata.
    """
    settings = get_settings()
    policy: TrustPolicyConfig = get_or_create_policy(db)
    device, device_is_known = _resolve_device(payload, current_user, db)
    source_ip: Optional[str] = request.client.host if request.client else None

    # ── 1. Intune compliance overlay from Graph ────────────────────────────────
    intune_val = payload.intune_compliant
    intune_source = "client"
    if intune_val is None and settings.graph_mode == "real":
        hostname = getattr(device, "device_name", None) or payload.device_name
        log.info("Attempting Intune Graph lookup for hostname: %s", hostname)
        intune_val = _lookup_intune_compliance(hostname)
        intune_source = "graph" if intune_val is not None else "graph_not_found"
    elif intune_val is None:
        intune_source = "not_configured"

    # ── 2. Persist posture report ──────────────────────────────────────────────
    report = PostureReport(
        device_id=device.device_id,
        firewall_enabled=payload.firewall_enabled,
        antivirus_enabled=payload.antivirus_enabled,
        av_advanced_protection=payload.av_advanced_protection,
        disk_encryption_enabled=payload.disk_encryption_enabled,
        os_supported=payload.os_supported,
        screen_lock_enabled=payload.screen_lock_enabled,
        client_healthy=payload.client_healthy,
        client_version=payload.client_version,
        intune_compliant=intune_val,
        ip_address=source_ip,
    )
    db.add(report)
    db.flush()

    # ── 3–9. Score all three modules, enforce hard-fail signals, persist ───────
    result = await _score_and_persist(db, policy, current_user, device, device_is_known, report, source_ip, settings)
    trust = result["trust"]

    device_contrib = round(result["posture_score"]  * policy.device_weight,   1)
    context_contrib = round(result["ctx_score"]      * policy.context_weight,  1)
    identity_contrib = round(result["identity_score"] * policy.identity_weight, 1)

    return {
        # ── Scores ──────────────────────────────────────────────────────────
        "device_posture_score": result["posture_score"],
        "posture_score":        result["posture_score"],   # kept for client-app compatibility
        "context_score":        result["ctx_score"],
        "identity_score":       result["identity_score"],
        "total_score":          result["total"],
        "total_trust_score":    result["total"],           # kept for client-app compatibility

        # ── Weights (from DB policy) ────────────────────────────────────────
        "weights": {
            "device":   policy.device_weight,
            "context":  policy.context_weight,
            "identity": policy.identity_weight,
        },

        # ── Decision ────────────────────────────────────────────────────────
        "threshold": result["threshold"],
        "decision":  result["decision"],
        "reason":    result["reason"],
        "hard_denied_resources": result["hard_denied_resources"],
        "hard_denied_client": result["hard_denied_client"],
        "hard_deny_client_reason": result["hard_deny_client_reason"],

        # ── Contributions ───────────────────────────────────────────────────
        "breakdown_summary": {
            "device_contribution":   device_contrib,
            "context_contribution":  context_contrib,
            "identity_contribution": identity_contrib,
        },

        # ── Per-signal breakdown (for UI cards) ─────────────────────────────
        "breakdown": result["posture_breakdown"],     # device posture factors (for client-app cards)
        "context_breakdown":  result["ctx_breakdown"],
        "identity_breakdown": result["id_breakdown"],

        # ── Source metadata ─────────────────────────────────────────────────
        "intune_source":    intune_source,
        "context_source":   result["ctx_source"],
        "identity_source":  result["identity_source"],
        "graph_mode":       settings.graph_mode,
        "entra_enabled":    result["azure"] is not None,

        # ── Report meta ─────────────────────────────────────────────────────
        "report_id":     str(report.report_id),
        "device_id":     str(device.device_id),
        "reported_at":   report.reported_at,
        "calculated_at": trust.calculated_at,
    }


# ── GET /api/trust/latest ─────────────────────────────────────────────────────

@router.get("/trust/latest")
def get_latest_trust_score(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Return the most recent trust score for the calling user (any device)."""
    q = db.query(DeviceTrustScore)

    if current_user.role != RoleEnum.ADMIN:
        device_ids = [d.device_id for d in current_user.devices]
        if not device_ids:
            raise HTTPException(status_code=404, detail="No devices registered for this user")
        q = q.filter(DeviceTrustScore.device_id.in_(device_ids))

    score = q.order_by(DeviceTrustScore.calculated_at.desc()).first()
    if not score:
        raise HTTPException(status_code=404, detail="No trust score found")
    return _score_dict(score)


# ── GET /api/trust/device/{device_id} ────────────────────────────────────────

@router.get("/trust/device/{device_id}")
def get_device_trust_score(
    device_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Return the latest trust score for a specific device."""
    device = db.query(Device).filter(Device.device_id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if current_user.role != RoleEnum.ADMIN and device.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not your device")

    score = (
        db.query(DeviceTrustScore)
        .filter(DeviceTrustScore.device_id == device_id)
        .order_by(DeviceTrustScore.calculated_at.desc())
        .first()
    )
    if not score:
        raise HTTPException(status_code=404, detail="No trust score found for this device")
    return _score_dict(score)


# ── POST /api/client/posture-report  (alias for client app) ──────────────────

@router.post("/client/posture-report", status_code=status.HTTP_201_CREATED)
async def client_posture_report(
    payload: schemas.PostureReportIn,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Client App alias for POST /api/posture/report.

    Uses the same unified scoring engine (TrustPolicyConfig weights, real
    context + identity scoring, Intune Graph overlay). Returns a superset
    of the /posture/report response plus a human-readable status string
    so the client app can display a single-line summary without parsing.
    """
    settings = get_settings()
    policy: TrustPolicyConfig = get_or_create_policy(db)
    device, device_is_known = _resolve_device(payload, current_user, db)
    source_ip: Optional[str] = request.client.host if request.client else None

    # Intune overlay
    intune_val = payload.intune_compliant
    intune_source = "client"
    if intune_val is None and settings.graph_mode == "real":
        hostname = getattr(device, "device_name", None) or payload.device_name
        log.info("Attempting Intune Graph lookup for hostname: %s", hostname)
        intune_val = _lookup_intune_compliance(hostname)
        intune_source = "graph" if intune_val is not None else "graph_not_found"
    elif intune_val is None:
        intune_source = "not_configured"

    report = PostureReport(
        device_id=device.device_id,
        firewall_enabled=payload.firewall_enabled,
        antivirus_enabled=payload.antivirus_enabled,
        av_advanced_protection=payload.av_advanced_protection,
        disk_encryption_enabled=payload.disk_encryption_enabled,
        os_supported=payload.os_supported,
        screen_lock_enabled=payload.screen_lock_enabled,
        client_healthy=payload.client_healthy,
        client_version=payload.client_version,
        intune_compliant=intune_val,
        ip_address=source_ip,
    )
    db.add(report)
    db.flush()

    result = await _score_and_persist(db, policy, current_user, device, device_is_known, report, source_ip, settings)
    trust = result["trust"]
    posture_score, ctx_score, identity_score = result["posture_score"], result["ctx_score"], result["identity_score"]
    total, threshold, decision, reason = result["total"], result["threshold"], result["decision"], result["reason"]
    posture_breakdown, ctx_breakdown, id_breakdown = result["posture_breakdown"], result["ctx_breakdown"], result["id_breakdown"]

    if total >= 80:
        ps_status = "healthy"
    elif total >= threshold:
        ps_status = "warning"
    else:
        ps_status = "critical"

    failed = [b["factor"] for b in posture_breakdown
              if b.get("passed") is False]  # strictly False; None = N/A, not a failure
    message = f"Trust score: {total}. Decision: {decision}."
    if failed:
        message += f" Posture check{'s' if len(failed) > 1 else ''} failed: {', '.join(failed)}."

    return {
        # ── Scores ──────────────────────────────────────────────────────────
        "device_posture_score": posture_score,
        "posture_score":        posture_score,
        "context_score":        ctx_score,
        "identity_score":       identity_score,
        "total_score":          total,
        "total_trust_score":    total,

        # ── Weights ─────────────────────────────────────────────────────────
        "weights": {
            "device":   policy.device_weight,
            "context":  policy.context_weight,
            "identity": policy.identity_weight,
        },

        # ── Decision ────────────────────────────────────────────────────────
        "threshold": threshold,
        "decision":  decision,
        "reason":    reason,
        "hard_denied_resources": result["hard_denied_resources"],
        "hard_denied_client": result["hard_denied_client"],
        "hard_deny_client_reason": result["hard_deny_client_reason"],

        # ── Contributions ───────────────────────────────────────────────────
        "breakdown_summary": {
            "device_contribution":   round(posture_score   * policy.device_weight,   1),
            "context_contribution":  round(ctx_score       * policy.context_weight,  1),
            "identity_contribution": round(identity_score  * policy.identity_weight, 1),
        },

        # ── Per-signal breakdown ─────────────────────────────────────────────
        "breakdown":         posture_breakdown,
        "context_breakdown": ctx_breakdown,
        "identity_breakdown": id_breakdown,

        # ── Client-app convenience fields ───────────────────────────────────
        "status":    ps_status,
        "message":   message,
        "graph_mode": settings.graph_mode,
        "entra_enabled": result["azure"] is not None,
        "intune_source":   intune_source,
        "identity_source": result["identity_source"],

        # ── Report meta ─────────────────────────────────────────────────────
        "report_id":     str(report.report_id),
        "device_id":     str(device.device_id),
        "reported_at":   report.reported_at,
        "calculated_at": trust.calculated_at,
    }
