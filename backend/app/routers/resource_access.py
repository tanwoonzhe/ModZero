"""
Resource Access — non-invasive, resource-driven protected routes.

Model
=====
ModZero does NOT own the lifecycle of protected services. A target
site (e.g. http://localhost:2026/) is an independent service. When
an admin registers it as a Resource on the Resources page, ModZero:
  - mints a stable product-facing route /r/<slug>
  - evaluates trust before allowing access through that route
  - reverse-proxies to the current Resource row's host:port

Deleting the Resource deletes ONLY the ModZero mapping. /r/<slug>
returns 404, but the underlying target service keeps running and is
still reachable directly — ModZero never owned it.

Flow
====
1. POST /api/resource-access/gate     (PDP — policy decision point):
     - Looks up the Resource by resource_id.
     - Compares trust_score vs access_threshold.
     - On allow: mints an HMAC-signed ticket bound to the resource_id
       and returns access_url (/r/<slug>) and bootstrap_url (?t=...).
     - On deny: allowed=false, no URL.

2. GET /r/{slug_or_id}     (PEP — policy enforcement point, mounted
   at app root, NOT under /api):
     - Resolves the Resource by slug or UUID. 404 otherwise.
     - ?t=<ticket>: verifies, plants an HttpOnly SameSite=Lax cookie
       scoped to /r/<slug>, then 302s to the clean URL.
     - Otherwise reads the cookie, verifies it, and reverse-proxies
       to _internal_target_url(res) computed from the current DB row.

3. The DB row is the source of truth. Changing the target from
   localhost:2026 to localhost:2099 does NOT change /r/<slug>.
"""
from __future__ import annotations

import base64
import hmac
import hashlib
import json
import re
import time
from typing import Optional
from urllib.parse import urlparse, quote

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Cookie
from fastapi.responses import Response, RedirectResponse, HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db
from ..models import User, Resource, RemoteNetwork
from ..settings import get_settings

# Two routers:
#   - api_router: mounted under /api as usual  ->  /api/resource-access/...
#   - public_router: mounted at app root       ->  /r/{slug}
router = APIRouter(prefix="/resource-access", tags=["resource-access"])
public_router = APIRouter(tags=["resource-access-public"])

TICKET_TTL_SECONDS = 120
COOKIE_PREFIX = "mz_rt_"  # mz_rt_<resource_id>

# When the admin registers a Resource whose host is "localhost"/127.0.0.1,
# that host means "the machine running Docker Desktop", not the backend
# container. We rewrite it to `host.docker.internal` so the proxy can
# reach the independently-running target service via the host gateway.
# This works for any locally-running target; ModZero does not need to
# own or co-locate the service.
LOCALHOST_ALIASES = {"localhost", "127.0.0.1"}


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


def _mint_ticket(user_id: str, score: int, resource_id: str) -> str:
    payload = {
        "sub": user_id,
        "score": score,
        "exp": int(time.time()) + TICKET_TTL_SECONDS,
        "aud": "resource-access",
        "rid": resource_id,
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


def _public_resource_url(res: Resource) -> str:
    host = (res.ip_address or "").strip() or "localhost"
    port = int(res.port) if res.port is not None else 80
    if host.startswith("http://") or host.startswith("https://"):
        return host if host.endswith("/") else host + "/"
    return f"http://{host}:{port}/"


def _internal_target_url(res: Resource) -> str:
    """Where the backend proxy actually connects over the docker network."""
    host = (res.ip_address or "").strip() or "localhost"
    port = int(res.port) if res.port is not None else 80
    scheme = "http"
    if host.startswith("http://") or host.startswith("https://"):
        p = urlparse(host)
        scheme = p.scheme or "http"
        host = (p.hostname or "").strip() or "localhost"
        if p.port:
            port = p.port
    if host.lower() in LOCALHOST_ALIASES:
        # Non-invasive model: the target is an independent service
        # running on the host machine. Route through the host gateway
        # rather than the docker-compose service name, so ModZero's
        # protection does not depend on co-location.
        host = "host.docker.internal"
    return f"{scheme}://{host}:{port}"


def _resolve_resource(db: Session, key: str) -> tuple[Resource, RemoteNetwork, str]:
    """Resolve a /r/{key} path segment to a Resource.

    `key` may be the resource UUID or the slug of the resource name.
    Returns (resource, network, slug).
    Raises 404 if not found, 409 if multiple resources share the slug.
    """
    rows = (
        db.query(Resource, RemoteNetwork)
        .join(RemoteNetwork, Resource.network_id == RemoteNetwork.network_id)
        .all()
    )
    # 1. exact UUID match
    for res, net in rows:
        if str(res.resource_id) == key:
            return res, net, _slugify(res.name)
    # 2. slug match
    matches = [(res, net) for res, net in rows if _slugify(res.name) == key]
    if len(matches) == 1:
        res, net = matches[0]
        return res, net, _slugify(res.name)
    if len(matches) > 1:
        raise HTTPException(
            status_code=409,
            detail=f"Multiple resources share slug '{key}'. Use the resource UUID instead.",
        )
    raise HTTPException(status_code=404, detail=f"Protected resource '{key}' not found")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class GateRequest(BaseModel):
    trust_score: int = Field(..., ge=0, le=100)
    access_threshold: int = Field(..., ge=0, le=100)
    device_posture_score: Optional[int] = Field(None, ge=0, le=100)
    context_analysis_score: Optional[int] = Field(None, ge=0, le=100)
    trust_scoring_engine_score: Optional[int] = Field(None, ge=0, le=100)
    resource_id: Optional[str] = Field(
        None,
        description="UUID of a Resource registered under /resources.",
    )


class GateResponse(BaseModel):
    allowed: bool
    reason: str
    # Stable product-facing URL — does not change if target host/port change.
    access_url: Optional[str] = None
    # One-shot URL used to set the signed session cookie.
    bootstrap_url: Optional[str] = None
    # Backward-compat alias for older clients — equals bootstrap_url.
    portal_url: Optional[str] = None
    resource_id: Optional[str] = None
    resource_name: Optional[str] = None
    resource_slug: Optional[str] = None
    ticket_expires_at: Optional[int] = None
    score: int
    threshold: int


class RegisteredResource(BaseModel):
    resource_id: str
    name: str
    slug: str
    network_name: str
    host: str
    port: int
    url: str          # raw host:port — display only
    access_path: str  # e.g. "/r/demo-intranet" — stable product-facing route


# ---------------------------------------------------------------------------
# /api/resource-access endpoints
# ---------------------------------------------------------------------------

def _project_resource(res: Resource, network_name: str) -> RegisteredResource:
    url = _public_resource_url(res)
    host = (res.ip_address or "localhost").strip()
    for prefix in ("http://", "https://"):
        if host.startswith(prefix):
            host = host[len(prefix):].rstrip("/")
            break
    port = int(res.port) if res.port is not None else 80
    slug = _slugify(res.name)
    return RegisteredResource(
        resource_id=str(res.resource_id),
        name=res.name,
        slug=slug,
        network_name=network_name,
        host=host,
        port=port,
        url=url,
        access_path=f"/r/{slug}",
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
    """Server-side trust decision for a registered Resource.

    On allow, returns a stable /r/<slug> access_url plus a one-shot
    bootstrap_url that plants the signed session cookie.
    """
    if not req.resource_id:
        raise HTTPException(
            status_code=400,
            detail="resource_id is required: select a resource from the Resources page.",
        )

    row = (
        db.query(Resource, RemoteNetwork)
        .join(RemoteNetwork, Resource.network_id == RemoteNetwork.network_id)
        .filter(Resource.resource_id == req.resource_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Resource not found")
    res, _net = row

    resource_name = res.name
    resource_id = str(res.resource_id)
    slug = _slugify(resource_name)
    target_public = _public_resource_url(res)

    if req.trust_score < req.access_threshold:
        return GateResponse(
            allowed=False,
            reason=(
                f"Trust score {req.trust_score} is below threshold "
                f"{req.access_threshold} for resource '{resource_name}'"
            ),
            resource_id=resource_id,
            resource_name=resource_name,
            resource_slug=slug,
            score=req.trust_score,
            threshold=req.access_threshold,
        )

    ticket = _mint_ticket(str(user.user_id), req.trust_score, resource_id)
    base = str(request.base_url).rstrip("/")
    access_url = f"{base}/r/{quote(slug)}"
    bootstrap_url = f"{access_url}?t={ticket}"

    return GateResponse(
        allowed=True,
        reason=(
            f"Trust score satisfies the configured access threshold "
            f"for resource '{resource_name}' (registered at {target_public})"
        ),
        access_url=access_url,
        bootstrap_url=bootstrap_url,
        portal_url=bootstrap_url,  # legacy alias
        resource_id=resource_id,
        resource_name=resource_name,
        resource_slug=slug,
        ticket_expires_at=int(time.time()) + TICKET_TTL_SECONDS,
        score=req.trust_score,
        threshold=req.access_threshold,
    )


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
  <p>Return to ModZero and re-run the trust check for
     <code>{slug}</code>.</p>
</div></body></html>"""


def _deny(reason: str, slug: str, status: int = 403) -> HTMLResponse:
    return HTMLResponse(
        _DENY_HTML.format(reason=reason, slug=slug),
        status_code=status,
    )


async def _proxy(res: Resource, path: str) -> Response:
    target = _internal_target_url(res).rstrip("/")
    upstream_url = f"{target}/{path}" if path else f"{target}/"
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=False) as client:
            upstream = await client.get(upstream_url)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Upstream resource unreachable: {e}") from e
    drop = {"content-encoding", "transfer-encoding", "connection", "content-length"}
    headers = {k: v for k, v in upstream.headers.items() if k.lower() not in drop}
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=headers,
        media_type=upstream.headers.get("content-type"),
    )


@public_router.get("/r/{key}", include_in_schema=False)
@public_router.get("/r/{key}/{path:path}", include_in_schema=False)
async def protected_resource(
    key: str,
    request: Request,
    path: str = "",
    t: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Product-facing protected route for a registered resource.

    - `?t=<ticket>` plants the session cookie, then 302s to the clean URL.
    - Otherwise reads the cookie and reverse-proxies the internal target.
    - Without a valid ticket OR cookie, returns a 403 deny page.

    The internal target host/port is resolved from the current Resource
    row on every call, so re-registering the resource at a different
    target does not change this URL.
    """
    res, _net, slug = _resolve_resource(db, key)
    rid = str(res.resource_id)
    cookie_name = f"{COOKIE_PREFIX}{rid}"

    # 1. Bootstrap: exchange one-shot token in query for an HttpOnly cookie.
    if t:
        try:
            _verify_ticket(t, rid)
        except HTTPException as e:
            return _deny(e.detail, slug)
        clean_path = f"/r/{quote(slug)}" + (f"/{path}" if path else "")
        resp = RedirectResponse(url=clean_path, status_code=302)
        resp.set_cookie(
            key=cookie_name,
            value=t,
            max_age=TICKET_TTL_SECONDS,
            path=f"/r/{slug}",
            httponly=True,
            samesite="lax",
            secure=False,  # dev: http://localhost
        )
        return resp

    # 2. Steady state: cookie required.
    cookie_val = request.cookies.get(cookie_name)
    if not cookie_val:
        return _deny(
            "No active trust session for this resource. "
            "Use ModZero to request access first.",
            slug,
        )
    try:
        _verify_ticket(cookie_val, rid)
    except HTTPException as e:
        resp = _deny(e.detail, slug)
        resp.delete_cookie(cookie_name, path=f"/r/{slug}")
        return resp

    # 3. Proxy the real resource.
    return await _proxy(res, path)
