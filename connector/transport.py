"""Transport adapter abstraction for traffic forwarding.

The default implementation is an HTTP/HTTPS reverse proxy using aiohttp.
The TransportAdapter base class allows future replacements with:
  - WireGuard tunnel
  - QUIC-based tunnel
  - Just-in-time SSH tunnels
"""

import abc
import logging
from aiohttp import web, ClientSession, ClientTimeout, TCPConnector

from config import get_ssl_context

logger = logging.getLogger("modzero.connector")


class TransportAdapter(abc.ABC):
    """Base class for transport adapters.

    Subclass this and implement ``handle_request`` to plug in a different
    transport mechanism (e.g. WireGuard, QUIC, SSH tunnel).
    """

    @abc.abstractmethod
    async def handle_request(self, request: web.Request, resource: dict) -> web.StreamResponse:
        """Forward a single inbound request to the target resource."""
        ...

    async def start(self):
        """Optional startup hook (e.g. establish tunnel)."""
        pass

    async def stop(self):
        """Optional shutdown hook."""
        pass


class HTTPReverseProxy(TransportAdapter):
    """Reverse-proxy transport: forwards HTTP requests to the target host."""

    def __init__(self):
        ssl_ctx = get_ssl_context()
        self._connector = TCPConnector(ssl=ssl_ctx, limit=100)
        self._timeout = ClientTimeout(total=60)

    async def handle_request(self, request: web.Request, resource: dict) -> web.StreamResponse:
        target_host = resource["target_host"]
        target_port = resource["target_port"]
        protocol = resource.get("protocol", "http")
        path_prefix = resource.get("path_prefix", "")

        # Build target URL
        # Strip the resource path prefix from the incoming URL and map to target
        incoming_path = request.path
        if path_prefix and incoming_path.startswith(path_prefix):
            remaining = incoming_path[len(path_prefix):]
        else:
            remaining = incoming_path

        target_url = f"{protocol}://{target_host}:{target_port}{remaining}"
        if request.query_string:
            target_url += f"?{request.query_string}"

        logger.info("Proxying %s %s -> %s", request.method, request.path, target_url)

        # Read body
        body = await request.read()

        # Forward headers (remove hop-by-hop)
        forward_headers = {}
        hop_by_hop = {"host", "connection", "transfer-encoding", "keep-alive",
                      "proxy-authenticate", "proxy-authorization", "te", "trailers",
                      "upgrade"}
        for key, value in request.headers.items():
            if key.lower() not in hop_by_hop:
                forward_headers[key] = value
        forward_headers["Host"] = f"{target_host}:{target_port}"
        forward_headers["X-Forwarded-For"] = request.remote or "unknown"
        forward_headers["X-Forwarded-Proto"] = request.scheme

        try:
            async with ClientSession(connector=self._connector, timeout=self._timeout) as session:
                async with session.request(
                    method=request.method,
                    url=target_url,
                    headers=forward_headers,
                    data=body,
                    allow_redirects=False,
                ) as upstream_resp:
                    # Build response
                    resp_headers = {}
                    for key, value in upstream_resp.headers.items():
                        if key.lower() not in hop_by_hop:
                            resp_headers[key] = value

                    response = web.StreamResponse(
                        status=upstream_resp.status,
                        headers=resp_headers,
                    )
                    await response.prepare(request)

                    async for chunk in upstream_resp.content.iter_any():
                        await response.write(chunk)

                    await response.write_eof()
                    return response

        except Exception as exc:
            logger.error("Proxy error to %s: %s", target_url, exc)
            return web.json_response(
                {"error": "upstream_error", "detail": str(exc)},
                status=502,
            )

    async def stop(self):
        await self._connector.close()
