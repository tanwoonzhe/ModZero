"""Audit query endpoints for ModZero zero-trust access decisions.

Read-only. Admin-only. Pagination is ``limit/offset``; results ordered by
most-recent first.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..deps import get_current_admin, get_db
from ..models import (
    AccessDecision,
    Connector,
    RemoteNetwork,
    Resource,
    TrustSnapshot,
    User,
)

router = APIRouter(prefix="/audit", tags=["audit"])


class AccessDecisionOut(BaseModel):
    decision_id: str
    user_id: Optional[str]
    user_name: Optional[str]
    device_id: Optional[str]
    resource_id: Optional[str]
    resource_name: Optional[str]
    resource_slug: Optional[str]
    decision: str
    category: str  # allow | deny | rate_limit | proxy_failure | bootstrap_deny
    reason: Optional[str]
    score: Optional[int]
    threshold: Optional[int]
    path: Optional[str]
    ts: datetime


def _categorize(decision: str, reason: Optional[str]) -> str:
    r = (reason or "").lower()
    if decision == "allow":
        return "allow"
    if "rate limit" in r:
        return "rate_limit"
    if "connector" in r and ("unreachable" in r or "error" in r or "502" in r):
        return "proxy_failure"
    if r.startswith("bootstrap") or "ticket" in r:
        return "bootstrap_deny"
    return "deny"


@router.get("/access-decisions", response_model=list[AccessDecisionOut])
def list_access_decisions(
    resource_id: Optional[str] = Query(default=None),
    user_id: Optional[str] = Query(default=None),
    decision: Optional[str] = Query(default=None, pattern="^(allow|deny)$"),
    category: Optional[str] = Query(
        default=None, pattern="^(allow|deny|rate_limit|proxy_failure|bootstrap_deny)$"
    ),
    q: Optional[str] = Query(default=None, description="Substring match on reason or path"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> list[AccessDecisionOut]:
    qry = db.query(AccessDecision)
    if resource_id:
        qry = qry.filter(AccessDecision.resource_id == resource_id)
    if user_id:
        qry = qry.filter(AccessDecision.user_id == user_id)
    if decision:
        qry = qry.filter(AccessDecision.decision == decision)
    if q:
        like = f"%{q}%"
        qry = qry.filter(or_(AccessDecision.reason.ilike(like), AccessDecision.path.ilike(like)))
    rows = qry.order_by(AccessDecision.ts.desc()).offset(offset).limit(limit).all()

    uids = {r.user_id for r in rows if r.user_id}
    rids = {r.resource_id for r in rows if r.resource_id}
    users: dict = {
        u.user_id: u.username
        for u in db.query(User).filter(User.user_id.in_(uids)).all()
    } if uids else {}
    resources: dict = {
        res.resource_id: (res.name, res.slug)
        for res in db.query(Resource).filter(Resource.resource_id.in_(rids)).all()
    } if rids else {}

    pairs = {(r.user_id, r.resource_id) for r in rows if r.user_id and r.resource_id}
    snaps: dict = {}
    if pairs:
        u_set = {p[0] for p in pairs}
        r_set = {p[1] for p in pairs}
        for s in (
            db.query(TrustSnapshot)
            .filter(TrustSnapshot.user_id.in_(u_set), TrustSnapshot.resource_id.in_(r_set))
            .order_by(TrustSnapshot.computed_at.desc())
            .all()
        ):
            key = (s.user_id, s.resource_id)
            if key not in snaps:
                snaps[key] = (int(s.score), int(s.threshold))

    out: list[AccessDecisionOut] = []
    for r in rows:
        decision_str = getattr(r.decision, "value", str(r.decision))
        rname, rslug = (None, None)
        if r.resource_id and r.resource_id in resources:
            rname, rslug = resources[r.resource_id]
        score = threshold = None
        if r.user_id and r.resource_id:
            snap = snaps.get((r.user_id, r.resource_id))
            if snap:
                score, threshold = snap
        out.append(AccessDecisionOut(
            decision_id=str(r.decision_id),
            user_id=str(r.user_id) if r.user_id else None,
            user_name=users.get(r.user_id) if r.user_id else None,
            device_id=str(r.device_id) if r.device_id else None,
            resource_id=str(r.resource_id) if r.resource_id else None,
            resource_name=rname,
            resource_slug=rslug,
            decision=decision_str,
            category=_categorize(decision_str, r.reason),
            reason=r.reason,
            score=score,
            threshold=threshold,
            path=r.path,
            ts=r.ts,
        ))

    if category:
        out = [o for o in out if o.category == category]
    return out


# ---------------------------------------------------------------------------
# Status overview — one call to populate the dashboard tiles.
# ---------------------------------------------------------------------------


class ResourceStatusOut(BaseModel):
    resource_id: str
    name: str
    slug: Optional[str]
    network_name: Optional[str]
    target: Optional[str]
    last_decision: Optional[str]
    last_decision_at: Optional[datetime]
    last_score: Optional[int]
    last_threshold: Optional[int]


class ConnectorStatusOut(BaseModel):
    connector_id: str
    name: str
    status: str
    last_heartbeat: Optional[datetime]
    online: bool


class StatusOverviewOut(BaseModel):
    generated_at: datetime
    resources: list[ResourceStatusOut]
    connectors: list[ConnectorStatusOut]
    last_allow_at: Optional[datetime]
    last_deny_at: Optional[datetime]
    decisions_last_24h: dict  # {"allow", "deny", "rate_limit", "proxy_failure", "bootstrap_deny"}


@router.get("/status-overview", response_model=StatusOverviewOut)
def status_overview(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> StatusOverviewOut:
    now = datetime.now(timezone.utc)

    res_rows = (
        db.query(Resource, RemoteNetwork)
        .outerjoin(RemoteNetwork, Resource.network_id == RemoteNetwork.network_id)
        .all()
    )
    latest_decision: dict = {}
    for d in (
        db.query(AccessDecision)
        .filter(AccessDecision.resource_id.isnot(None))
        .order_by(AccessDecision.ts.desc())
        .limit(500)
        .all()
    ):
        if d.resource_id not in latest_decision:
            latest_decision[d.resource_id] = d
    latest_snap: dict = {}
    for s in (
        db.query(TrustSnapshot)
        .order_by(TrustSnapshot.computed_at.desc())
        .limit(500)
        .all()
    ):
        if s.resource_id not in latest_snap:
            latest_snap[s.resource_id] = s

    resources_out: list[ResourceStatusOut] = []
    for res, net in res_rows:
        target = None
        if res.target_host:
            target = f"{res.target_scheme or 'http'}://{res.target_host}"
            if res.target_port and int(res.target_port) not in (80, 443):
                target += f":{int(res.target_port)}"
        d = latest_decision.get(res.resource_id)
        s = latest_snap.get(res.resource_id)
        resources_out.append(ResourceStatusOut(
            resource_id=str(res.resource_id),
            name=res.name,
            slug=res.slug,
            network_name=net.name if net else None,
            target=target,
            last_decision=getattr(d.decision, "value", str(d.decision)) if d else None,
            last_decision_at=d.ts if d else None,
            last_score=int(s.score) if s else None,
            last_threshold=int(s.threshold) if s else None,
        ))

    cutoff = now - timedelta(seconds=90)
    connectors_out: list[ConnectorStatusOut] = []
    for c in db.query(Connector).all():
        last_hb = c.last_heartbeat
        if last_hb is not None and last_hb.tzinfo is None:
            last_hb = last_hb.replace(tzinfo=timezone.utc)
        online = bool(last_hb and last_hb >= cutoff)
        connectors_out.append(ConnectorStatusOut(
            connector_id=str(c.connector_id),
            name=c.name,
            status=getattr(c.status, "value", str(c.status)),
            last_heartbeat=c.last_heartbeat,
            online=online,
        ))

    last_allow = (
        db.query(AccessDecision)
        .filter(AccessDecision.decision == "allow")
        .order_by(AccessDecision.ts.desc())
        .first()
    )
    last_deny = (
        db.query(AccessDecision)
        .filter(AccessDecision.decision == "deny")
        .order_by(AccessDecision.ts.desc())
        .first()
    )

    since = now - timedelta(hours=24)
    counts = {"allow": 0, "deny": 0, "rate_limit": 0, "proxy_failure": 0, "bootstrap_deny": 0}
    for d in (
        db.query(AccessDecision)
        .filter(AccessDecision.ts >= since)
        .all()
    ):
        decision_str = getattr(d.decision, "value", str(d.decision))
        cat = _categorize(decision_str, d.reason)
        counts[cat] = counts.get(cat, 0) + 1

    return StatusOverviewOut(
        generated_at=now,
        resources=resources_out,
        connectors=connectors_out,
        last_allow_at=last_allow.ts if last_allow else None,
        last_deny_at=last_deny.ts if last_deny else None,
        decisions_last_24h=counts,
    )
