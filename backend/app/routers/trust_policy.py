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

import time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import schemas
from ..deps import get_db, get_current_admin, get_current_user
from ..models import TrustPolicyConfig, User

router = APIRouter()

_DEFAULT_CONFIG_ID = 1

# Short-lived cache for the (relatively expensive) live Graph connection probe so
# repeated GET /trust-policy/active calls don't hammer Microsoft Graph.
_AZURE_PROBE_TTL = 60  # seconds
_azure_probe_cache: dict = {"ts": 0.0, "connected": False}


def _azure_connected(force: bool = False) -> bool:
    """Best-effort live check that a Microsoft Graph connection is usable.

    Cached for `_AZURE_PROBE_TTL` seconds. Never raises — any failure → False.
    """
    now = time.time()
    if not force and (now - _azure_probe_cache["ts"]) < _AZURE_PROBE_TTL:
        return bool(_azure_probe_cache["connected"])
    connected = False
    try:
        from ..azure_service import azure_service
        connected = bool(azure_service.test_connection().get("success"))
    except Exception:
        connected = False
    _azure_probe_cache.update(ts=now, connected=connected)
    return connected


def get_or_create_policy(db: Session) -> TrustPolicyConfig:
    """Return the singleton TrustPolicyConfig, creating it with defaults if absent."""
    cfg = db.query(TrustPolicyConfig).filter(TrustPolicyConfig.config_id == _DEFAULT_CONFIG_ID).first()
    if cfg is None:
        cfg = TrustPolicyConfig(config_id=_DEFAULT_CONFIG_ID)
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


def _policy_out(cfg: TrustPolicyConfig, *, force_probe: bool = False) -> schemas.TrustPolicyConfigOut:
    """Serialize the policy and attach the live azure_connected flag."""
    out = schemas.TrustPolicyConfigOut.model_validate(cfg)
    out.azure_connected = _azure_connected(force=force_probe)
    return out


@router.get("/trust-policy/active", response_model=schemas.TrustPolicyConfigOut, tags=["trust-policy"])
def get_active_policy(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> schemas.TrustPolicyConfigOut:
    """Return the active trust policy weights, context rules, and Entra status."""
    return _policy_out(get_or_create_policy(db))


@router.get("/trust-policy/client-settings", tags=["trust-policy"])
def get_client_settings(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    """Slim, non-admin endpoint exposing only what the client app needs.

    The client app runs as a regular employee, not an admin, so it cannot
    call GET /trust-policy/active (which leaks weights/thresholds/Entra
    group IDs). This just hands back the auto device-check interval.
    """
    cfg = get_or_create_policy(db)
    return {"auto_check_interval_hours": cfg.auto_check_interval_hours}


@router.patch("/trust-policy/active", response_model=schemas.TrustPolicyConfigOut, tags=["trust-policy"])
def update_active_policy(
    update: schemas.TrustPolicyConfigUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> schemas.TrustPolicyConfigOut:
    """Update trust policy weights and/or context rules.

    Validation:
    - If any weight is provided, all three must be provided and sum to 1.0
      (±0.01 tolerance).
    - default_threshold must be 0–100.
    - allowed_start_hour and allowed_end_hour must be 0–23.
    - entra_enabled may only be turned ON when a live Graph connection succeeds.
    """
    cfg = get_or_create_policy(db)

    # Entra toggle: enabling requires a working Microsoft Graph connection.
    if update.entra_enabled is True and not cfg.entra_enabled:
        if not _azure_connected(force=True):
            raise HTTPException(
                status_code=409,
                detail="Cannot enable Entra signals: Microsoft Graph connection failed. "
                       "Configure Azure credentials and pass Test Connection first.",
            )

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

    if update.auto_check_interval_hours is not None and not (0 <= update.auto_check_interval_hours <= 168):
        raise HTTPException(status_code=422, detail="auto_check_interval_hours must be 0–168 (0 = disabled, max 1 week).")

    # Apply updates
    for field, value in update.model_dump(exclude_none=True).items():
        setattr(cfg, field, value)

    db.commit()
    db.refresh(cfg)
    return _policy_out(cfg)
