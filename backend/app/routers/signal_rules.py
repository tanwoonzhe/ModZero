"""Admin CRUD for per-signal scoring rules (signal_rules table).

This is the real, backend-persisted config the Trust Policies UI edits —
replacing the previous localStorage-only mockups in DeviceRulesTab /
IdentityRulesTab / ContextRulesTab / EntraSignalsCard. Changes here take
effect on the very next device check / access decision.
"""
from __future__ import annotations

from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import models
from ..deps import get_db, get_current_admin, get_current_user

router = APIRouter(prefix="/signal-rules", tags=["signal-rules"])

_VALID_FAILURE_ACTIONS = {"reduce_score", "deny_immediately_client", "deny_immediately_resources"}
_VALID_MODULES = {"device", "identity", "context"}


class SignalRuleOut(BaseModel):
    id: str
    module: str
    signal_key: str
    source: str
    label: str
    enabled: bool
    max_points: int
    failure_action: str

    class Config:
        from_attributes = True


class SignalRuleUpdate(BaseModel):
    enabled: Optional[bool] = None
    max_points: Optional[int] = Field(default=None, ge=0, le=100)
    failure_action: Optional[str] = None


def _serialize(rule: models.SignalRule) -> SignalRuleOut:
    return SignalRuleOut(
        id=str(rule.id), module=rule.module, signal_key=rule.signal_key,
        source=rule.source, label=rule.label, enabled=rule.enabled,
        max_points=rule.max_points, failure_action=rule.failure_action,
    )


@router.get("", response_model=List[SignalRuleOut])
def list_signal_rules(
    module: Optional[str] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
) -> Any:
    """List signal rules, optionally filtered by module (device/identity/context)."""
    q = db.query(models.SignalRule)
    if module:
        if module not in _VALID_MODULES:
            raise HTTPException(status_code=422, detail=f"module must be one of {sorted(_VALID_MODULES)}")
        q = q.filter(models.SignalRule.module == module)
    rules = q.order_by(models.SignalRule.module, models.SignalRule.source, models.SignalRule.signal_key).all()
    return [_serialize(r) for r in rules]


@router.patch("/{rule_id}", response_model=SignalRuleOut)
def update_signal_rule(
    rule_id: str,
    update: SignalRuleUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin),
) -> Any:
    """Update one signal rule (admin only). Takes effect on the next scoring run."""
    rule = db.query(models.SignalRule).filter(models.SignalRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Signal rule not found")

    if update.failure_action is not None and update.failure_action not in _VALID_FAILURE_ACTIONS:
        raise HTTPException(status_code=422, detail=f"failure_action must be one of {sorted(_VALID_FAILURE_ACTIONS)}")

    if update.enabled is not None:
        rule.enabled = update.enabled
    if update.max_points is not None:
        rule.max_points = update.max_points
    if update.failure_action is not None:
        rule.failure_action = update.failure_action

    db.commit()
    db.refresh(rule)
    return _serialize(rule)
