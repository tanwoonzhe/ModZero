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
from ..models import Device, DeviceTrustScore, PostureReport, RoleEnum, TrustPolicyConfig, User
from ..routers.trust_policy import get_or_create_policy
from ..services.context_analysis_service import score_context_default
from ..services.identity_signal_service import signals_from_local_user, get_mock_identity_signals, score_identity_signals
from ..services.posture_scoring import score_posture, weighted_total
from ..settings import get_settings

log = logging.getLogger(__name__)
router = APIRouter()


# ── helpers ───────────────────────────────────────────────────────────────────

def _resolve_device(payload: schemas.PostureReportIn, user: User, db: Session) -> Device:
    """Return an existing Device or auto-register a new one."""
    # 1. Explicit device_id
    if payload.device_id:
        device = db.query(Device).filter(Device.device_id == payload.device_id).first()
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")
        if user.role != RoleEnum.ADMIN and device.user_id != user.user_id:
            raise HTTPException(status_code=403, detail="Not your device")
        return device

    # 2. Fingerprint lookup / auto-register
    if payload.fingerprint:
        device = db.query(Device).filter(Device.fingerprint == payload.fingerprint).first()
        if device:
            if user.role != RoleEnum.ADMIN and device.user_id != user.user_id:
                raise HTTPException(status_code=403, detail="Not your device")
            # Update os_version if supplied
            if payload.os_version and device.os_version != payload.os_version:
                device.os_version = payload.os_version
            return device

    # 3. Auto-register new device
    device = Device(
        user_id=user.user_id,
        device_name=payload.device_name or f"{user.username}-device",
        os_version=payload.os_version,
        fingerprint=payload.fingerprint,
    )
    db.add(device)
    db.flush()  # populate device_id without committing yet
    return device


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
def submit_posture_report(
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
    device = _resolve_device(payload, current_user, db)
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
        disk_encryption_enabled=payload.disk_encryption_enabled,
        os_supported=payload.os_supported,
        screen_lock_enabled=payload.screen_lock_enabled,
        client_healthy=payload.client_healthy,
        intune_compliant=intune_val,
        ip_address=source_ip,
    )
    db.add(report)
    db.flush()

    # ── 3. Device Posture Score ────────────────────────────────────────────────
    posture_score, posture_breakdown = score_posture(report)

    # ── 4. Context Score (using DB policy config + request metadata) ───────────
    is_known_device = device.device_id is not None  # device is registered
    ctx_score, ctx_breakdown = score_context_default(
        source_ip=source_ip,
        known_device=is_known_device,
        failed_attempt_count=0,  # posture check is not an access attempt
        allowed_start_hour=policy.allowed_start_hour,
        allowed_end_hour=policy.allowed_end_hour,
        max_failed_attempts=policy.max_failed_attempts,
    )
    ctx_source = "backend_realtime"

    # ── 5. Identity Score (from local user record or Graph mock) ──────────────
    if settings.graph_mode == "real":
        id_signals = signals_from_local_user(current_user)
    else:
        id_signals = get_mock_identity_signals(current_user)
    identity_score, id_breakdown = score_identity_signals(id_signals)
    identity_source = f"local_{settings.graph_mode}"

    # ── 6. Weighted total using DB-stored weights ──────────────────────────────
    total = weighted_total(
        posture_score, ctx_score, identity_score,
        device_weight=policy.device_weight,
        context_weight=policy.context_weight,
        identity_weight=policy.identity_weight,
    )

    # ── 7. Access decision ─────────────────────────────────────────────────────
    threshold = policy.default_threshold
    decision = "ALLOW" if total >= threshold else "DENY"
    reason = "score_meets_policy" if decision == "ALLOW" else "trust_score_below_threshold"

    # ── 8. Combined breakdown (posture + context + identity) ───────────────────
    full_breakdown = posture_breakdown + ctx_breakdown + id_breakdown

    # ── 9. Persist DeviceTrustScore ───────────────────────────────────────────
    trust = DeviceTrustScore(
        device_id=device.device_id,
        report_id=report.report_id,
        posture_score=posture_score,
        context_score=ctx_score,
        identity_score=identity_score,
        total_score=total,
        breakdown=full_breakdown,
    )
    db.add(trust)
    db.commit()
    db.refresh(report)
    db.refresh(trust)

    device_contrib = round(posture_score  * policy.device_weight,   1)
    context_contrib = round(ctx_score     * policy.context_weight,  1)
    identity_contrib = round(identity_score * policy.identity_weight, 1)

    return {
        # ── Scores ──────────────────────────────────────────────────────────
        "device_posture_score": posture_score,
        "posture_score":        posture_score,   # kept for client-app compatibility
        "context_score":        ctx_score,
        "identity_score":       identity_score,
        "total_score":          total,
        "total_trust_score":    total,           # kept for client-app compatibility

        # ── Weights (from DB policy) ────────────────────────────────────────
        "weights": {
            "device":   policy.device_weight,
            "context":  policy.context_weight,
            "identity": policy.identity_weight,
        },

        # ── Decision ────────────────────────────────────────────────────────
        "threshold": threshold,
        "decision":  decision,
        "reason":    reason,

        # ── Contributions ───────────────────────────────────────────────────
        "breakdown_summary": {
            "device_contribution":   device_contrib,
            "context_contribution":  context_contrib,
            "identity_contribution": identity_contrib,
        },

        # ── Per-signal breakdown (for UI cards) ─────────────────────────────
        "breakdown": posture_breakdown,     # device posture factors (for client-app cards)
        "context_breakdown":  ctx_breakdown,
        "identity_breakdown": id_breakdown,

        # ── Source metadata ─────────────────────────────────────────────────
        "intune_source":    intune_source,
        "context_source":   ctx_source,
        "identity_source":  identity_source,
        "graph_mode":       settings.graph_mode,

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
def client_posture_report(
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
    device = _resolve_device(payload, current_user, db)
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
        disk_encryption_enabled=payload.disk_encryption_enabled,
        os_supported=payload.os_supported,
        screen_lock_enabled=payload.screen_lock_enabled,
        client_healthy=payload.client_healthy,
        intune_compliant=intune_val,
        ip_address=source_ip,
    )
    db.add(report)
    db.flush()

    posture_score, posture_breakdown = score_posture(report)

    ctx_score, ctx_breakdown = score_context_default(
        source_ip=source_ip,
        known_device=device.device_id is not None,
        failed_attempt_count=0,
        allowed_start_hour=policy.allowed_start_hour,
        allowed_end_hour=policy.allowed_end_hour,
        max_failed_attempts=policy.max_failed_attempts,
    )

    if settings.graph_mode == "real":
        id_signals = signals_from_local_user(current_user)
    else:
        id_signals = get_mock_identity_signals(current_user)
    identity_score, id_breakdown = score_identity_signals(id_signals)

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
    trust = DeviceTrustScore(
        device_id=device.device_id,
        report_id=report.report_id,
        posture_score=posture_score,
        context_score=ctx_score,
        identity_score=identity_score,
        total_score=total,
        breakdown=full_breakdown,
    )
    db.add(trust)
    db.commit()
    db.refresh(trust)

    if total >= 80:
        ps_status = "healthy"
    elif total >= threshold:
        ps_status = "warning"
    else:
        ps_status = "critical"

    failed = [b["factor"] for b in posture_breakdown
              if not b.get("passed") and b.get("note") != "not configured"]
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
        "intune_source":   intune_source,
        "identity_source": f"local_{settings.graph_mode}",

        # ── Report meta ─────────────────────────────────────────────────────
        "report_id":     str(report.report_id),
        "device_id":     str(device.device_id),
        "reported_at":   report.reported_at,
        "calculated_at": trust.calculated_at,
    }
