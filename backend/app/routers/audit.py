"""Audit query endpoints for ModZero zero-trust access decisions.

Read-only. Admin-only. Pagination is ``limit/offset``; results ordered by
most-recent first.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..deps import get_current_admin, get_db
from ..models import AccessDecision, User

router = APIRouter(prefix="/audit", tags=["audit"])


class AccessDecisionOut(BaseModel):
    decision_id: str
    user_id: Optional[str]
    device_id: Optional[str]
    resource_id: Optional[str]
    decision: str
    reason: Optional[str]
    path: Optional[str]
    ts: datetime


@router.get("/access-decisions", response_model=list[AccessDecisionOut])
def list_access_decisions(
    resource_id: Optional[str] = Query(default=None),
    user_id: Optional[str] = Query(default=None),
    decision: Optional[str] = Query(default=None, pattern="^(allow|deny)$"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> list[AccessDecisionOut]:
    q = db.query(AccessDecision)
    if resource_id:
        q = q.filter(AccessDecision.resource_id == resource_id)
    if user_id:
        q = q.filter(AccessDecision.user_id == user_id)
    if decision:
        q = q.filter(AccessDecision.decision == decision)
    rows = q.order_by(AccessDecision.ts.desc()).offset(offset).limit(limit).all()
    return [
        AccessDecisionOut(
            decision_id=str(r.decision_id),
            user_id=str(r.user_id) if r.user_id else None,
            device_id=str(r.device_id) if r.device_id else None,
            resource_id=str(r.resource_id) if r.resource_id else None,
            decision=getattr(r.decision, "value", str(r.decision)),
            reason=r.reason,
            path=r.path,
            ts=r.ts,
        )
        for r in rows
    ]
