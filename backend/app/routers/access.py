"""Resource access decision endpoint and decision logs.

Routes
------
  POST /api/access/request    — evaluate access and log the decision
  GET  /api/access/logs       — list access decision logs
"""
from __future__ import annotations

from typing import Any, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import schemas
from ..deps import get_db, get_current_user, get_current_admin
from ..models import (
    AccessRequestLog,
    Device,
    DeviceTrustScore,
    PostureReport,
    ProtectedResource,
    RoleEnum,
    User,
)

router = APIRouter(prefix="/access", tags=["access"])


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
) -> None:
    db.add(AccessRequestLog(
        user_id=user_id,
        device_id=device_id,
        resource_id=resource_id,
        decision=decision,
        reason=reason,
        trust_score=trust_score,
    ))
    db.commit()


@router.post("/request", response_model=schemas.AccessDecisionOut)
def request_access(
    payload: schemas.AccessRequestIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    resource = db.query(ProtectedResource).filter(ProtectedResource.id == payload.resource_id).first()

    # Resource missing — log and return deny
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

    # 3. Trust score too low
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

    # 4. Intune compliance required
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

    # 5. Allow
    _log(
        db,
        user_id=current_user.user_id,
        device_id=score.device_id,
        resource_id=resource.id,
        decision="allow",
        reason="all_checks_passed",
        trust_score=score.total_score,
    )
    return schemas.AccessDecisionOut(
        decision="allow",
        reason="All checks passed",
        trust_score=score.total_score,
        required_score=resource.minimum_trust_score,
        resource=resource_out,
    )


@router.get("/logs", response_model=List[schemas.AccessLogOut])
def list_access_logs(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Admins see all logs; employees see only their own."""
    q = db.query(AccessRequestLog)
    if current_user.role != RoleEnum.ADMIN:
        q = q.filter(AccessRequestLog.user_id == current_user.user_id)
    return q.order_by(AccessRequestLog.timestamp.desc()).limit(max(1, min(limit, 500))).all()
