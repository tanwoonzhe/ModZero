"""
Resource Access — non-invasive, resource-driven protected routes.

Phase 1 architecture:
  * /api/resource-access/gate (PDP): receives a SIGNED posture payload
    from the desktop client, verifies the signature with the device's
    enrolled HMAC secret, COMPUTES the trust score server-side
    (clients can never set the score directly), and persists a
    TrustSnapshot. On allow, mints an HMAC ticket bound to the
    resource. Every call writes an AccessDecision audit row.
  * /r/<slug> (PEP): exchanges ticket for HttpOnly cookie, re-checks
    the latest TrustSnapshot from the DB on every request, and
    forwards the request via the CONNECTOR (not directly). Each
    allow/deny writes an AccessDecision audit row.
  * Backend -> Connector hop: the backend signs the target URL and
    metadata with CONNECTOR_HOP_SECRET (HMAC-SHA256, 60s timestamp
    skew). The connector verifies the signature and forwards to
    the target. The backend cannot reach private resources directly
    (docker network split); the connector is the only data path.
"""
from __future__ import annotations

import base64
import hmac
import hashlib
import json
import logging
import re
import time
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response, RedirectResponse, HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db
from ..models import (
    User, Resource, RemoteNetwork,
    DeviceEnrollment, TrustSnapshot, AccessDecision, AccessDecisionEnum,
)
from ..settings import get_settings
from ..services.trust_scoring import compute_trust_score

logger = logging.getLogger("modzero.resource_access")

router = APIRouter(prefix="/resource-access", tags=["resource-access"])
public_router = APIRouter(tags=["resource-access-public"])

TICKET_TTL_SECONDS = 120
COOKIE_PREFIX = "mz_rt_"

TRUST_SNAPSHOT_TTL_SECONDS = 60
POSTURE_TS_SKEW_SECONDS = 60

# In-memory replay-protection cache for posture nonces. Phase 2 should
# back this with Redis. Restarting the backend clears the cache.
_NONCE_CACHE: dict[str, float] = {}
_NONCE_CACHE_MAX = 4096


# ---------------------------------------------------------------------------
# Ticket helpers (HMAC-signed JSON)
# ---------------------------------------------------------------------------

def _secret() -> bytes:
    return get_settings().secret_key.encode("utf-8")


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


def _mint_ticket(user_id: str, score: int, resource_id: str, device_id: Optional[str]) -> str:
    payload = {
        "sub": user_id,
        "score": score,
        "exp": int(time.time()) + TICKET_TTL_SECONDS,
        "aud": "resource-access",
        "rid": resource_id,
        "did": device_id or "",
    }
    body = _b64url(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    sig = _b64url(hmac.new(_secret(), body.encode("ascii"), hashlib.sha256).digest())
    return f"{body}.{sig}"


def _verify_ticket(ticket: str, expected_rid: str) -> dict:
    try:
        body, sig = ticket.split(".", 1)
    except ValueError:
        raise HTTPException(status_code=403, detail="Malformed access ticket")
    expected = _b64url(hmac.new(_secret(), body.encode("ascii"), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(status_code=403, detail="Invalid ticket signature")
    payload = json.loads(_b64url_decode(body))
    if payload.get("aud") != "resource-access":
        raise HTTPException(status_code=403, detail="Ticket audience mismatch")
    if int(payload.get("exp", 0)) < int(time.time()):
        raise HTTPException(status_code=403, detail="Access session expired — re-run the trust check")
    if str(payload.get("rid")) != str(expected_rid):
        raise HTTPException(status_code=403, detail="Ticket is not valid for this resource")
    return payload


# ---------------------------------------------------------------------------
# Resource projection helpers
# ---------------------------------------------------------------------------

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slugify(name: str) -> str:
    s = _SLUG_RE.sub("-", (name or "").lower()).strip("-")
    return s or "resource"


def _resource_slug(res: Resource) -> str:
    return (res.slug or _slugify(res.name)).strip().lower()


def _resource_target(res: Resource) -> tuple[str, str, int, Optional[str]]:
    """Return (scheme, host, port, path_prefix) used by the connector hop."""
    scheme = (res.target_scheme or "http").strip().lower() or "http"
    host = (res.target_host or res.ip_address or "localhost").strip()
    if res.target_port is not None:
        port = int(res.target_port)
    elif res.port is not None:
        port = int(res.port)
    else:
        port = 443 if scheme == "https" else 80
    prefix = res.path_prefix or None
    if prefix:
        prefix = "/" + prefix.strip("/")
    return scheme, host, port, prefix


def _public_resource_url(res: Resource) -> str:
    scheme, host, port, _ = _resource_target(res)
    default = (scheme == "http" and port == 80) or (scheme == "https" and port == 443)
    hostport = host if default else f"{host}:{port}"
    return f"{scheme}://{hostport}/"


def _public_base_url(request: Request) -> str:
    cfg = get_settings().public_base_url
    if cfg:
        return cfg.rstrip("/")
    return str(request.base_url).rstrip("/")


def _resolve_resource(db: Session, key: str) -> tuple[Resource, RemoteNetwork, str]:
    rows = (
        db.query(Resource, RemoteNetwork)
        .join(RemoteNetwork, Resource.network_id == RemoteNetwork.network_id)
        .all()
    )
    for res, net in rows:
        if str(res.resource_id) == key:
            return res, net, _resource_slug(res)
    matches = [(res, net) for res, net in rows if (res.slug or "") == key]
    if len(matches) == 1:
        res, net = matches[0]
        return res, net, _resource_slug(res)
    if len(matches) > 1:
        raise HTTPException(status_code=409, detail=f"Multiple resources share slug '{key}'.")
    matches = [(res, net) for res, net in rows if _slugify(res.name) == key]
    if len(matches) == 1:
        res, net = matches[0]
        return res, net, _resource_slug(res)
    if len(matches) > 1:
        raise HTTPException(status_code=409, detail=f"Multiple resources share slug '{key}'.")
    raise HTTPException(status_code=404, detail=f"Protected resource '{key}' not found")


# ---------------------------------------------------------------------------
# Posture signature verification
# ---------------------------------------------------------------------------

def _canonical_posture_bytes(p: "PosturePayload") -> bytes:
    body = {
        "device_id": str(p.device_id),
        "nonce": p.nonce,
        "ts": int(p.ts),
        "signals": p.signals,
    }
    return json.dumps(body, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _verify_posture_signature(p: "PosturePayload", device_secret: str) -> bool:
    expected = hmac.new(
        device_secret.encode("utf-8"),
        _canonical_posture_bytes(p),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, (p.signature or "").lower())


def _check_nonce_replay(nonce: str) -> bool:
    if not nonce:
        return False
    now = time.time()
    if nonce in _NONCE_CACHE:
        return False
    _NONCE_CACHE[nonce] = now
    if len(_NONCE_CACHE) > _NONCE_CACHE_MAX:
        cutoff = now - POSTURE_TS_SKEW_SECONDS * 4
        for k in list(_NONCE_CACHE.keys()):
            if _NONCE_CACHE[k] < cutoff:
                _NONCE_CACHE.pop(k, None)
    return True


# ---------------------------------------------------------------------------
# Audit log helper
# ---------------------------------------------------------------------------

def _audit(
    db: Session,
    *,
    decision: AccessDecisionEnum,
    user_id: Optional[str],
    device_id: Optional[str],
    resource_id: Optional[str],
    reason: str,
    path: Optional[str] = None,
) -> None:
    try:
        row = AccessDecision(
            user_id=user_id,
            device_id=device_id,
            resource_id=resource_id,
            decision=decision,
            reason=(reason or "")[:1000],
            path=(path or "")[:512] or None,
        )
        db.add(row)
        db.commit()
    except Exception as e:
        logger.exception("audit write failed: %s", e)
        db.rollback()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class PosturePayload(BaseModel):
    """Signed posture payload from the desktop client.

    signature = HMAC_SHA256(
        device_secret,
        canonical_json({device_id, nonce, ts, signals})
    )
    where canonical_json uses sort_keys=True, separators=(',', ':').
    """
    device_id: str
    nonce: str = Field(..., min_length=8, max_length=128)
    ts: int = Field(..., ge=0)
    signals: dict[str, Any]
    signature: str = Field(..., min_length=32, max_length=256)


class GateRequest(BaseModel):
    resource_id: str
    access_threshold: int = Field(..., ge=0, le=100)
    posture: PosturePayload

    # Reject any request that still tries to send a client-supplied
    # final score. The backend computes the score; clients cannot set it.
    model_config = {"extra": "forbid"}


class GateResponse(BaseModel):
    allowed: bool
    reason: str
    access_url: Optional[str] = None
    bootstrap_url: Optional[str] = None
    portal_url: Optional[str] = None
    resource_id: Optional[str] = None
    resource_name: Optional[str] = None
    resource_slug: Optional[str] = None
    ticket_expires_at: Optional[int] = None
    score: int
    threshold: int
    breakdown: Optional[dict] = None


class RegisteredResource(BaseModel):
    resource_id: str
    name: str
    slug: str
    network_name: str
    host: str
    port: int
    url: str
    access_path: str


# ---------------------------------------------------------------------------
# /api/resource-access endpoints
# ---------------------------------------------------------------------------

def _project_resource(res: Resource, network_name: str) -> RegisteredResource:
    scheme, host, port, _ = _resource_target(res)
    return RegisteredResource(
        resource_id=str(res.resource_id),
        name=res.name,
        slug=_resource_slug(res),
        network_name=network_name,
        host=host,
        port=port,
        url=_public_resource_url(res),
        access_path=f"/r/{_resource_slug(res)}",
    )


@router.get("/resources", response_model=list[RegisteredResource])
def list_registered_resources(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[RegisteredResource]:
    rows = (
        db.query(Resource, RemoteNetwork)
        .join(RemoteNetwork, Resource.network_id == RemoteNetwork.network_id)
        .all()
    )
    return [_project_resource(res, net.name) for res, net in rows]


@router.post("/gate", response_model=GateResponse)
def gate(
    req: GateRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> GateResponse:
    """Server-side trust decision for a registered Resource."""
    uid = str(user.user_id)

    row = (
        db.query(Resource, RemoteNetwork)
        .join(RemoteNetwork, Resource.network_id == RemoteNetwork.network_id)
        .filter(Resource.resource_id == req.resource_id)
        .first()
    )
    if not row:
        _audit(db, decision=AccessDecisionEnum.DENY, user_id=uid, device_id=None,
               resource_id=None, reason=f"unknown resource_id={req.resource_id}")
        raise HTTPException(status_code=404, detail="Resource not found")
    res, _net = row
    rid = str(res.resource_id)
    slug = _resource_slug(res)

    now = int(time.time())
    if abs(now - int(req.posture.ts)) > POSTURE_TS_SKEW_SECONDS:
        _audit(db, decision=AccessDecisionEnum.DENY, user_id=uid, device_id=None,
               resource_id=rid, reason="posture timestamp skew exceeded")
        raise HTTPException(status_code=403, detail="Posture timestamp skew exceeded")
    if not _check_nonce_replay(req.posture.nonce):
        _audit(db, decision=AccessDecisionEnum.DENY, user_id=uid, device_id=None,
               resource_id=rid, reason="posture nonce replay")
        raise HTTPException(status_code=403, detail="Posture nonce already used")

    dev = (
        db.query(DeviceEnrollment)
        .filter(DeviceEnrollment.device_id == req.posture.device_id)
        .first()
    )
    if not dev or dev.revoked or str(dev.user_id) != uid:
        _audit(db, decision=AccessDecisionEnum.DENY, user_id=uid, device_id=None,
               resource_id=rid, reason="unknown or revoked device")
        raise HTTPException(status_code=403, detail="Device not enrolled or revoked")
    if not _verify_posture_signature(req.posture, dev.hmac_secret):
        _audit(db, decision=AccessDecisionEnum.DENY, user_id=uid, device_id=str(dev.device_id),
               resource_id=rid, reason="invalid posture signature")
        raise HTTPException(status_code=403, detail="Invalid posture signature")

    score, breakdown = compute_trust_score(req.posture.signals)

    snap = TrustSnapshot(
        user_id=uid,
        device_id=str(dev.device_id),
        resource_id=rid,
        score=score,
        threshold=int(req.access_threshold),
        posture_json={"signals": req.posture.signals, "breakdown": breakdown},
    )
    db.add(snap)
    dev.last_seen_at = datetime.now(timezone.utc)
    db.commit()

    if score < int(req.access_threshold):
        _audit(db, decision=AccessDecisionEnum.DENY, user_id=uid, device_id=str(dev.device_id),
               resource_id=rid,
               reason=f"score {score} < threshold {req.access_threshold}")
        return GateResponse(
            allowed=False,
            reason=(
                f"Trust score {score} is below threshold "
                f"{req.access_threshold} for resource '{res.name}'"
            ),
            resource_id=rid,
            resource_name=res.name,
            resource_slug=slug,
            score=score,
            threshold=int(req.access_threshold),
            breakdown=breakdown,
        )

    ticket = _mint_ticket(uid, score, rid, str(dev.device_id))
    base = _public_base_url(request)
    access_url = f"{base}/r/{quote(slug)}"
    bootstrap_url = f"{access_url}?t={ticket}"
    _audit(db, decision=AccessDecisionEnum.ALLOW, user_id=uid, device_id=str(dev.device_id),
           resource_id=rid, reason=f"score {score} >= threshold {req.access_threshold}")
    return GateResponse(
        allowed=True,
        reason=(
            f"Trust score {score} satisfies threshold {req.access_threshold} "
            f"for resource '{res.name}'"
        ),
        access_url=access_url,
        bootstrap_url=bootstrap_url,
        portal_url=bootstrap_url,
        resource_id=rid,
        resource_name=res.name,
        resource_slug=slug,
        ticket_expires_at=int(time.time()) + TICKET_TTL_SECONDS,
        score=score,
        threshold=int(req.access_threshold),
        breakdown=breakdown,
    )


# ---------------------------------------------------------------------------
# Backend -> Connector hop client
# ---------------------------------------------------------------------------

class ConnectorClient:
    """Sends signed proxy hops to the connector.

    Phase 1: HTTP over the docker network.
    Phase 2: replace the HTTP call with a WSS-tunneled message frame
    without touching call sites — this class is the only abstraction
    that needs to change.
    """

    HOP_PATH = "/_modzero/forward"

    def __init__(self) -> None:
        cfg = get_settings()
        self._base = cfg.connector_base_url.rstrip("/")
        self._secret = cfg.connector_hop_secret.encode("utf-8")

    def _sign(self, ts: str, method: str, target_url: str) -> str:
        msg = f"{ts}|{method.upper()}|{target_url}".encode("utf-8")
        return hmac.new(self._secret, msg, hashlib.sha256).hexdigest()

    async def forward(
        self,
        *,
        method: str,
        target_url: str,
        headers: dict[str, str],
        body: bytes,
        query_string: bytes,
        user_id: str,
        device_id: Optional[str],
        resource_id: str,
    ) -> httpx.Response:
        ts = str(int(time.time()))
        sig = self._sign(ts, method, target_url)
        hop_url = f"{self._base}{self.HOP_PATH}"
        if query_string:
            hop_url = f"{hop_url}?{query_string.decode('latin-1')}"

        drop = {"host", "content-length", "connection", "keep-alive",
                "transfer-encoding", "upgrade", "proxy-authorization",
                "proxy-authenticate", "te", "trailers"}
        fwd_headers = {k: v for k, v in headers.items() if k.lower() not in drop}
        fwd_headers["X-ModZero-Target"] = target_url
        fwd_headers["X-ModZero-Timestamp"] = ts
        fwd_headers["X-ModZero-Signature"] = sig
        fwd_headers["X-ModZero-User"] = user_id
        if device_id:
            fwd_headers["X-ModZero-Device"] = device_id
        fwd_headers["X-ModZero-Resource"] = resource_id

        async with httpx.AsyncClient(timeout=15.0, follow_redirects=False) as client:
            return await client.request(
                method=method,
                url=hop_url,
                headers=fwd_headers,
                content=body,
            )


_connector = ConnectorClient()


# ---------------------------------------------------------------------------
# Public /r/{slug} routes (mounted at app root)
# ---------------------------------------------------------------------------

_DENY_HTML = """<!doctype html>
<html><head><meta charset="utf-8"><title>Access denied</title>
<style>
  body{{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
       background:#111;color:#eee;display:flex;align-items:center;
       justify-content:center;min-height:100vh;margin:0;}}
  .card{{background:#1b1b1b;border:1px solid #333;border-radius:12px;
         padding:32px 40px;max-width:520px;text-align:center;}}
  h1{{margin:0 0 8px;font-size:22px;color:#ff6b6b;}}
  p{{margin:0 0 12px;line-height:1.5;color:#bbb;}}
  code{{background:#2a2a2a;padding:2px 6px;border-radius:4px;color:#fff;}}
</style></head><body>
<div class="card">
  <h1>🛑 Access denied</h1>
  <p>{reason}</p>
  <p>Open the ModZero desktop client and re-run the trust check for
     <code>{slug}</code>.</p>
</div></body></html>"""


def _deny(reason: str, slug: str, status: int = 403) -> HTMLResponse:
    return HTMLResponse(_DENY_HTML.format(reason=reason, slug=slug), status_code=status)


def _latest_snapshot(db: Session, user_id: str, resource_id: str) -> Optional[TrustSnapshot]:
    return (
        db.query(TrustSnapshot)
        .filter(TrustSnapshot.user_id == user_id, TrustSnapshot.resource_id == resource_id)
        .order_by(TrustSnapshot.computed_at.desc())
        .first()
    )


def _fresh_trust_check(db: Session, user_id: str, resource_id: str) -> Optional[str]:
    snap = _latest_snapshot(db, user_id, resource_id)
    if not snap:
        return ("No recent trust evaluation recorded for this resource. "
                "Re-run the trust check in the ModZero desktop client.")
    age = (datetime.now(timezone.utc) - snap.computed_at).total_seconds()
    if age > TRUST_SNAPSHOT_TTL_SECONDS:
        return "Trust evaluation is stale — re-run the trust check in ModZero."
    if int(snap.score) < int(snap.threshold):
        return f"Trust score {int(snap.score)} is below threshold {int(snap.threshold)} — access denied."
    return None


@public_router.api_route(
    "/r/{key}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    include_in_schema=False,
)
@public_router.api_route(
    "/r/{key}/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    include_in_schema=False,
)
async def protected_resource(
    key: str,
    request: Request,
    path: str = "",
    t: Optional[str] = None,
    db: Session = Depends(get_db),
):
    res, _net, slug = _resolve_resource(db, key)
    rid = str(res.resource_id)
    cookie_name = f"{COOKIE_PREFIX}{rid}"
    cfg = get_settings()
    audit_path = f"/r/{slug}" + (f"/{path}" if path else "")

    # 1. Bootstrap: exchange one-shot ticket for HttpOnly cookie.
    if t:
        try:
            payload = _verify_ticket(t, rid)
        except HTTPException as e:
            _audit(db, decision=AccessDecisionEnum.DENY, user_id=None, device_id=None,
                   resource_id=rid, reason=f"bootstrap: {e.detail}", path=audit_path)
            return _deny(e.detail, slug)
        uid = str(payload.get("sub", ""))
        did = str(payload.get("did", "")) or None
        deny_reason = _fresh_trust_check(db, uid, rid)
        if deny_reason:
            _audit(db, decision=AccessDecisionEnum.DENY, user_id=uid, device_id=did,
                   resource_id=rid, reason=f"bootstrap: {deny_reason}", path=audit_path)
            return _deny(deny_reason, slug)
        clean_path = f"/r/{quote(slug)}" + (f"/{path}" if path else "")
        resp = RedirectResponse(url=clean_path, status_code=302)
        resp.set_cookie(
            key=cookie_name,
            value=t,
            max_age=TICKET_TTL_SECONDS,
            path=f"/r/{slug}",
            httponly=True,
            samesite=cfg.cookie_samesite,
            secure=bool(cfg.cookie_secure),
        )
        _audit(db, decision=AccessDecisionEnum.ALLOW, user_id=uid, device_id=did,
               resource_id=rid, reason="bootstrap: cookie planted", path=audit_path)
        return resp

    # 2. Steady state: cookie required.
    cookie_val = request.cookies.get(cookie_name)
    if not cookie_val:
        _audit(db, decision=AccessDecisionEnum.DENY, user_id=None, device_id=None,
               resource_id=rid, reason="no session cookie", path=audit_path)
        return _deny(
            "No active trust session for this resource. "
            "Open the ModZero desktop client to request access first.",
            slug,
        )
    try:
        payload = _verify_ticket(cookie_val, rid)
    except HTTPException as e:
        resp = _deny(e.detail, slug)
        resp.delete_cookie(cookie_name, path=f"/r/{slug}")
        _audit(db, decision=AccessDecisionEnum.DENY, user_id=None, device_id=None,
               resource_id=rid, reason=f"cookie: {e.detail}", path=audit_path)
        return resp

    uid = str(payload.get("sub", ""))
    did = str(payload.get("did", "")) or None

    # 3. Re-check trust on every request — cookie is NOT enough.
    deny_reason = _fresh_trust_check(db, uid, rid)
    if deny_reason:
        resp = _deny(deny_reason, slug)
        resp.delete_cookie(cookie_name, path=f"/r/{slug}")
        _audit(db, decision=AccessDecisionEnum.DENY, user_id=uid, device_id=did,
               resource_id=rid, reason=deny_reason, path=audit_path)
        return resp

    # 4. Build target URL and forward via the connector hop.
    scheme, host, port, prefix = _resource_target(res)
    default_port = (scheme == "http" and port == 80) or (scheme == "https" and port == 443)
    hostport = host if default_port else f"{host}:{port}"
    upstream_path = ((prefix or "") + ("/" + path if path else "/")).replace("//", "/")
    if not upstream_path.startswith("/"):
        upstream_path = "/" + upstream_path
    target_url = f"{scheme}://{hostport}{upstream_path}"

    body = await request.body()
    try:
        upstream = await _connector.forward(
            method=request.method,
            target_url=target_url,
            headers=dict(request.headers),
            body=body,
            query_string=request.url.query.encode("latin-1") if request.url.query else b"",
            user_id=uid,
            device_id=did,
            resource_id=rid,
        )
    except httpx.HTTPError as e:
        _audit(db, decision=AccessDecisionEnum.DENY, user_id=uid, device_id=did,
               resource_id=rid, reason=f"connector unreachable: {e}", path=audit_path)
        raise HTTPException(status_code=502, detail=f"Connector unreachable: {e}") from e

    drop = {"content-encoding", "transfer-encoding", "connection", "content-length"}
    out_headers = {k: v for k, v in upstream.headers.items() if k.lower() not in drop}
    _audit(db, decision=AccessDecisionEnum.ALLOW, user_id=uid, device_id=did,
           resource_id=rid, reason=f"proxied {request.method} -> {upstream.status_code}",
           path=audit_path)
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=out_headers,
        media_type=upstream.headers.get("content-type"),
    )
