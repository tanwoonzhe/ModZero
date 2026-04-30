"""Main HTTP server for the connector — handles incoming proxied requests."""

import logging
from urllib.parse import urlparse

import aiohttp
from aiohttp import web

from auth import verify_access_token, verify_controller_signature
from transport import HTTPReverseProxy, TransportAdapter

logger = logging.getLogger("modzero.connector")

# Hop-by-hop headers MUST NOT be forwarded (RFC 7230 §6.1).
_HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade", "host",
    "content-length",
}

# Controller-hop bookkeeping headers — strip before forwarding upstream.
_CONTROLLER_HOP_HEADERS = {
    "x-modzero-target", "x-modzero-timestamp", "x-modzero-signature",
    "x-modzero-user", "x-modzero-device", "x-modzero-resource",
}


def create_proxy_app(policy_store: dict,
                     transport: TransportAdapter | None = None) -> web.Application:
    """Create an aiohttp Application that acts as a reverse proxy.

    Incoming requests must carry a valid access token:
        Authorization: Bearer <token>

    The proxy looks up the matching resource from the policy store and
    forwards the request via the configured transport adapter.
    """
    if transport is None:
        transport = HTTPReverseProxy()

    app = web.Application()

    async def health_handler(request: web.Request) -> web.Response:
        resources = policy_store.get("resources", [])
        return web.json_response({
            "status": "ok",
            "resources_loaded": len(resources),
        })

    async def proxy_handler(request: web.Request) -> web.StreamResponse:
        # 1. Extract access token
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return web.json_response(
                {"error": "unauthorized", "detail": "Missing or invalid Authorization header"},
                status=401,
            )
        token = auth_header[7:]

        # 2. Verify token
        claims = await verify_access_token(token, policy_store)
        if claims is None:
            return web.json_response(
                {"error": "unauthorized", "detail": "Invalid or expired access token"},
                status=401,
            )

        # 3. Match resource
        resource = _match_resource(request.path, policy_store)
        if resource is None:
            return web.json_response(
                {"error": "not_found", "detail": "No matching resource for this path"},
                status=404,
            )

        # 4. Check if user/device is allowed for this resource (simplified)
        user_id = claims.get("sub", "")
        resource_id = resource.get("resource_id", "")
        logger.info(
            "Access: user=%s resource=%s path=%s — ALLOW",
            user_id, resource_id, request.path,
        )

        # 5. Forward request via transport
        return await transport.handle_request(request, resource)

    # Routes
    app.router.add_route("GET", "/healthz", health_handler)
    # Controller-signed forward hop — registered BEFORE the catch-all so it wins.
    app.router.add_route("*", "/_modzero/forward", _forward_handler)
    app.router.add_route("*", "/_modzero/forward/{tail:.*}", _forward_handler)
    # Catch-all proxy route
    app.router.add_route("*", "/{path_info:.*}", proxy_handler)

    return app


async def _forward_handler(request: web.Request) -> web.StreamResponse:
    """Phase 1 backend->connector hop.

    The controller signs ``ts|METHOD|target_url`` with ``CONNECTOR_HOP_SECRET``.
    The actual upstream URL is carried in ``X-ModZero-Target``. This route is
    the ONLY data-path entry the controller may use; the docker network is
    split so the controller cannot reach private resources directly.
    """
    target = request.headers.get("X-ModZero-Target", "")
    ts = request.headers.get("X-ModZero-Timestamp", "")
    sig = request.headers.get("X-ModZero-Signature", "")

    ok, reason = verify_controller_signature(
        ts_header=ts, sig_header=sig, method=request.method, target_url=target,
    )
    if not ok:
        logger.warning("forward: signature rejected: %s target=%s", reason, target)
        return web.json_response(
            {"error": "forbidden", "detail": f"controller signature rejected: {reason}"},
            status=403,
        )

    parsed = urlparse(target)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return web.json_response(
            {"error": "bad_request", "detail": "invalid X-ModZero-Target"},
            status=400,
        )

    # Strip hop-by-hop + controller-bookkeeping headers before forwarding upstream.
    upstream_headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in _HOP_BY_HOP and k.lower() not in _CONTROLLER_HOP_HEADERS
    }
    # Set Host to upstream authority.
    upstream_headers["Host"] = parsed.netloc

    # Preserve the original query string from the incoming forward call.
    if request.query_string:
        sep = "&" if parsed.query else "?"
        target_url = f"{target}{sep}{request.query_string}"
    else:
        target_url = target

    body = await request.read()

    try:
        async with aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=30),
            auto_decompress=False,
        ) as session:
            async with session.request(
                request.method, target_url,
                headers=upstream_headers, data=body, allow_redirects=False,
            ) as upstream:
                resp_body = await upstream.read()
                resp_headers = {
                    k: v for k, v in upstream.headers.items()
                    if k.lower() not in _HOP_BY_HOP and k.lower() != "content-encoding"
                }
                user = request.headers.get("X-ModZero-User", "")
                rid = request.headers.get("X-ModZero-Resource", "")
                logger.info(
                    "forward: user=%s resource=%s %s %s -> %d",
                    user, rid, request.method, target_url, upstream.status,
                )
                return web.Response(
                    status=upstream.status, headers=resp_headers, body=resp_body,
                )
    except aiohttp.ClientError as exc:
        logger.warning("forward: upstream error %s -> %s", target_url, exc)
        return web.json_response(
            {"error": "bad_gateway", "detail": f"upstream error: {exc}"},
            status=502,
        )


def _match_resource(path: str, policy_store: dict) -> dict | None:
    """Find the resource that matches the incoming request path.

    Matching logic:
      1. If a resource has a path_prefix, check if the request path starts with it.
      2. If no path_prefix resources match, use the first resource (default route).
    """
    resources = policy_store.get("resources", [])
    if not resources:
        return None

    # Try prefix match first
    best_match = None
    best_len = 0
    for r in resources:
        prefix = r.get("path_prefix", "")
        if prefix and path.startswith(prefix) and len(prefix) > best_len:
            best_match = r
            best_len = len(prefix)

    if best_match:
        return best_match

    # Fall back to first resource with no prefix (default catch-all)
    for r in resources:
        if not r.get("path_prefix"):
            return r

    # Last resort: first resource
    return resources[0] if resources else None
