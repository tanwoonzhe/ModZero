"""Trust Policy Configuration endpoints.

Routes
------
  GET  /api/trust-policy/active   — return current weights + context rules
  PATCH /api/trust-policy/active  — update weights + context rules (admin only)

The single TrustPolicyConfig row (config_id = 1) is auto-created with
defaults on first request so the backend always has a usable policy.

These weights are read by every scoring endpoint:
  - POST /api/posture/report   (client app device check)
  - POST /api/resource-access  (access gate decision)
  - GET  /api/trust/latest     (dashboard overview)
  - Policy Simulator
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import schemas
from ..deps import get_db, get_current_admin
from ..models import TrustPolicyConfig, User

router = APIRouter()

_DEFAULT_CONFIG_ID = 1


def get_or_create_policy(db: Session) -> TrustPolicyConfig:
    """Return the singleton TrustPolicyConfig, creating it with defaults if absent."""
    cfg = db.query(TrustPolicyConfig).filter(TrustPolicyConfig.config_id == _DEFAULT_CONFIG_ID).first()
    if cfg is None:
        cfg = TrustPolicyConfig(config_id=_DEFAULT_CONFIG_ID)
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


@router.get("/trust-policy/active", response_model=schemas.TrustPolicyConfigOut, tags=["trust-policy"])
def get_active_policy(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> TrustPolicyConfig:
    """Return the active trust policy weights and context rules."""
    return get_or_create_policy(db)


@router.patch("/trust-policy/active", response_model=schemas.TrustPolicyConfigOut, tags=["trust-policy"])
def update_active_policy(
    update: schemas.TrustPolicyConfigUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> TrustPolicyConfig:
    """Update trust policy weights and/or context rules.

    Validation:
    - If any weight is provided, all three must be provided and sum to 1.0
      (±0.01 tolerance).
    - default_threshold must be 0–100.
    - allowed_start_hour and allowed_end_hour must be 0–23.
    """
    cfg = get_or_create_policy(db)

    # Weight validation: if any weight supplied, all must be supplied and sum to 1.0
    weights = {
        "device_weight":   update.device_weight,
        "context_weight":  update.context_weight,
        "identity_weight": update.identity_weight,
    }
    provided_weights = {k: v for k, v in weights.items() if v is not None}
    if provided_weights:
        if len(provided_weights) != 3:
            raise HTTPException(
                status_code=422,
                detail="All three weights (device, context, identity) must be provided together.",
            )
        total = sum(provided_weights.values())
        if abs(total - 1.0) > 0.01:
            raise HTTPException(
                status_code=422,
                detail=f"Weights must sum to 1.0 (got {total:.3f}).",
            )

    if update.default_threshold is not None and not (0 <= update.default_threshold <= 100):
        raise HTTPException(status_code=422, detail="default_threshold must be 0–100.")

    for hour_field in ("allowed_start_hour", "allowed_end_hour"):
        val = getattr(update, hour_field)
        if val is not None and not (0 <= val <= 23):
            raise HTTPException(status_code=422, detail=f"{hour_field} must be 0–23.")

    # Apply updates
    for field, value in update.model_dump(exclude_none=True).items():
        setattr(cfg, field, value)

    db.commit()
    db.refresh(cfg)
    return cfg
