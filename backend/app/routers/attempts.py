"""Access attempt and trust evaluation endpoints."""

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_db, get_current_user

router = APIRouter()


def _get_or_create_default_factors(db: Session) -> dict[str, models.TrustFactor]:
    """Ensure default trust factors exist and return them keyed by name."""
    factors: dict[str, models.TrustFactor] = {}
    for name, desc in [
        ("device_posture", "Evaluates the device's compliance and posture"),
        ("context", "Evaluates the network and temporal context of the request"),
    ]:
        factor = db.query(models.TrustFactor).filter(models.TrustFactor.name == name).first()
        if not factor:
            factor = models.TrustFactor(name=name, description=desc)
            db.add(factor)
            db.commit()
            db.refresh(factor)
        factors[name] = factor
    return factors


def _evaluate_posture(db: Session, device_id: str | None) -> float:
    """Return a posture score between 0 and 100.

    If no device is provided, return 50 (unknown posture).  Otherwise, compute the
    percentage of passed checkpoints.  If no checkpoints exist, default to 50.
    """
    if not device_id:
        return 50.0
    statuses = (
        db.query(models.DevicePostureStatus)
        .filter(models.DevicePostureStatus.device_id == device_id)
        .all()
    )
    if not statuses:
        return 50.0
    total = len(statuses)
    passed = sum(1 for st in statuses if st.status == models.PostureStatusEnum.PASS)
    return (passed / total) * 100


def _evaluate_context(ip: str | None) -> float:
    """Return a context score between 0 and 100.

    The score is a sum of a network score and a time score.  Private IPs
    contribute more points than public IPs.  Working hours (09:00‑18:00) give
    more points than outside hours.  The maximum score is 100.
    """
    # Determine if IP is private (very rough check)
    def is_private(ip_addr: str) -> bool:
        return ip_addr.startswith("10.") or ip_addr.startswith("192.168.") or ip_addr.startswith("172.16.")

    now = datetime.utcnow()
    hour = now.hour
    time_score = 40.0 if 9 <= hour <= 18 else 20.0
    network_score = 60.0 if ip and is_private(ip) else 40.0
    return min(100.0, time_score + network_score)


def _calculate_trust(
    posture_score: float,
    context_score: float,
    weights: dict[str, float] | None = None,
    threshold: float = 70.0,
) -> tuple[float, str]:
    """Combine factor scores using weights and return (total_score, decision)."""
    # Default weights
    w_posture = 0.7
    w_context = 0.3
    if weights:
        w_posture = weights.get("device_posture", w_posture)
        w_context = weights.get("context", w_context)
        total_weight = w_posture + w_context
        if total_weight > 0:
            w_posture /= total_weight
            w_context /= total_weight
    total = round(w_posture * posture_score + w_context * context_score, 2)
    if total >= threshold:
        decision = models.DecisionEnum.ALLOW.value
    elif total >= threshold * 0.8:
        decision = models.DecisionEnum.REVIEW.value
    else:
        decision = models.DecisionEnum.DENY.value
    return total, decision


@router.post("/", response_model=schemas.AttemptOut, status_code=status.HTTP_201_CREATED)
def create_attempt(
    attempt_in: schemas.AttemptCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> Any:
    """Record an access attempt and evaluate trust for it."""
    # Determine user for attempt: employees can only create attempts for themselves.
    if attempt_in.user_id != str(current_user.user_id) and current_user.role != models.RoleEnum.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorised to create attempt for another user")
    # Create AccessAttempt record (result is preliminary).  We'll update result after evaluation.
    attempt = models.AccessAttempt(
        user_id=attempt_in.user_id,
        device_id=attempt_in.device_id,
        ip_address=attempt_in.ip_address,
        geo_location=attempt_in.geo_location,
        timestamp=datetime.utcnow(),
        result=models.AttemptResultEnum.REVIEW,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    # Ensure default factors exist
    factors = _get_or_create_default_factors(db)

    # Evaluate posture and context
    posture_score = _evaluate_posture(db, attempt.device_id)
    context_score = _evaluate_context(attempt.ip_address)

    # Retrieve active policy (simplified: choose the first active policy or default)
    policy = (
        db.query(models.Policy)
        .filter(models.Policy.is_active == True)  # noqa: E712
        .order_by(models.Policy.created_at)
        .first()
    )
    weights = None
    threshold = 70.0
    if policy:
        threshold = policy.min_trust_threshold
        # Collect factor weights from policy
        weights = {pw.factor.name: pw.weight for pw in policy.factor_weights}

    total_score, decision = _calculate_trust(posture_score, context_score, weights, threshold)

    # Create TrustScore and TrustScoreDetails
    trust_score = models.TrustScore(
        attempt_id=attempt.attempt_id,
        policy_id=policy.policy_id if policy else None,
        total_score=total_score,
        decision=models.DecisionEnum(decision),
        calculated_at=datetime.utcnow(),
    )
    db.add(trust_score)
    db.commit()
    db.refresh(trust_score)

    # Score details
    details = []
    for factor_name, score in [("device_posture", posture_score), ("context", context_score)]:
        factor = factors[factor_name]
        detail = models.TrustScoreDetail(
            attempt_id=trust_score.attempt_id,
            factor_id=factor.factor_id,
            score_contribution=score,
        )
        details.append(detail)
    db.add_all(details)
    db.commit()

    # Update attempt result and reason
    attempt.result = models.AttemptResultEnum(decision)
    attempt.reason = f"Total score {total_score}, threshold {threshold}"
    db.commit()

    # Prepare response with details
    resp_details = [
        {"factor": "device_posture", "score": posture_score},
        {"factor": "context", "score": context_score},
    ]
    return schemas.AttemptOut(
        attempt_id=str(attempt.attempt_id),
        user_id=str(attempt.user_id),
        device_id=str(attempt.device_id) if attempt.device_id else None,
        ip_address=attempt.ip_address,
        geo_location=attempt.geo_location,
        timestamp=attempt.timestamp,
        result=attempt.result.value,
        reason=attempt.reason,
        total_score=total_score,
        decision=decision,
        trust_details=resp_details,
    )


@router.get("/", response_model=list[schemas.AttemptOut])
def list_attempts(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> Any:
    """Return a list of recent access attempts.

    Admins see all attempts; employees see their own.
    """
    query = db.query(models.AccessAttempt).order_by(models.AccessAttempt.timestamp.desc())
    if current_user.role != models.RoleEnum.ADMIN:
        query = query.filter(models.AccessAttempt.user_id == current_user.user_id)
    attempts = query.limit(100).all()
    results = []
    for attempt in attempts:
        # Get trust score and decision if exists
        if attempt.trust_score:
            total_score = attempt.trust_score.total_score
            decision = attempt.trust_score.decision.value
        else:
            total_score = None
            decision = None
        results.append(
            schemas.AttemptOut(
                attempt_id=str(attempt.attempt_id),
                user_id=str(attempt.user_id),
                device_id=str(attempt.device_id) if attempt.device_id else None,
                ip_address=attempt.ip_address,
                geo_location=attempt.geo_location,
                timestamp=attempt.timestamp,
                result=attempt.result.value,
                reason=attempt.reason,
                total_score=total_score,
                decision=decision,
                trust_details=None,
            )
        )
    return results