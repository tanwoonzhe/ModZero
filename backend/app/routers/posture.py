"""Device posture report and trust score endpoints.

Routes
------
  POST /api/posture/report           — client submits posture signals
  GET  /api/trust/latest             — latest score for the calling user
  GET  /api/trust/device/{device_id} — latest score for a specific device
  GET  /api/devices                  — device list (wired via devices router)
"""
from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from .. import schemas
from ..deps import get_db, get_current_user
from ..models import Device, DeviceTrustScore, PostureReport, RoleEnum, User
from ..services.posture_scoring import score_context, score_posture, weighted_total

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
        "total_score": score.total_score,
        "breakdown": score.breakdown,
        "calculated_at": score.calculated_at,
    }


# ── POST /api/posture/report ──────────────────────────────────────────────────

@router.post("/posture/report", status_code=status.HTTP_201_CREATED)
def submit_posture_report(
    payload: schemas.PostureReportIn,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Submit a posture report from the client app.

    The backend calculates the trust score — the client only supplies raw signals.

    **Posture score (80% of total):**  each of the 5 factors is worth 20 points.
    **Context score (20% of total):** placeholder = 100 until policy layer is added.
    """
    device = _resolve_device(payload, current_user, db)

    report = PostureReport(
        device_id=device.device_id,
        firewall_enabled=payload.firewall_enabled,
        antivirus_enabled=payload.antivirus_enabled,
        disk_encryption_enabled=payload.disk_encryption_enabled,
        os_supported=payload.os_supported,
        intune_compliant=payload.intune_compliant,
        ip_address=(request.client.host if request.client else None),
    )
    db.add(report)
    db.flush()

    posture_score, breakdown = score_posture(report)
    ctx = score_context()
    total = weighted_total(posture_score, ctx)

    trust = DeviceTrustScore(
        device_id=device.device_id,
        report_id=report.report_id,
        posture_score=posture_score,
        context_score=ctx,
        total_score=total,
        breakdown=breakdown,
    )
    db.add(trust)
    db.commit()
    db.refresh(report)
    db.refresh(trust)

    return {
        "report_id": str(report.report_id),
        "device_id": str(device.device_id),
        "reported_at": report.reported_at,
        "firewall_enabled": report.firewall_enabled,
        "antivirus_enabled": report.antivirus_enabled,
        "disk_encryption_enabled": report.disk_encryption_enabled,
        "os_supported": report.os_supported,
        "intune_compliant": report.intune_compliant,
        "posture_score": posture_score,
        "context_score": ctx,
        "total_score": total,
        "breakdown": breakdown,
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
