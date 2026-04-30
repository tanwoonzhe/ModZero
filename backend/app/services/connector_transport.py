"""Phase 2B — Connector transport selector & outbound-tunnel scaffold.

This module isolates *how* the controller hands a forward request to the
connector. Today we have one production path:

  * ``direct_http`` — controller HTTP-POSTs the signed forward to the
    connector's listening port. Works inside docker-compose where the
    controller can reach ``http://connector:8443/_modzero/forward``.

For real customer deployments the connector typically lives in a network
segment that disallows inbound traffic. The recommended pattern is:

  ``wss_tunnel`` — at boot the connector dials *out* to the controller
  on TLS (``wss://controller.example.com/api/connectors/tunnel``),
  presents its mTLS-or-bearer credentials, and keeps the socket open.
  The controller multiplexes per-request frames over this socket
  (correlation_id, target_url, headers, streaming body chunks). The
  connector replies with response frames carrying status + streaming
  body chunks. Backpressure is handled by ws send-buffer flow control.

  Wire format (proposed, msgpack-over-binary frames):

      C->S:  HELLO    {connector_id, version, capabilities}
      S->C:  WELCOME  {session_id, jwks_url, policies}
      S->C:  REQ      {cid, method, target_url, headers, ts, sig}
                      (zero or more BODY chunks: {cid, seq, bytes})
                      END     {cid}
      C->S:  RESP_HEAD {cid, status, headers}
                      (zero or more BODY chunks: {cid, seq, bytes})
                      RESP_END {cid, ok|err}

  Idle pings every 20s. Re-dial with exponential backoff on disconnect.

This file ships only the abstract interface and the direct-HTTP
implementation. ``WssTunnelTransport`` is a stub that logs a clear
warning and delegates to direct HTTP so the FYP demo never breaks if a
future operator flips the env flag prematurely. Implementing the WSS
side requires changes on both controller and connector and is tracked
as Phase 3 work.
"""
from __future__ import annotations

import logging
from typing import Any, Optional, Protocol

logger = logging.getLogger("modzero.connector_transport")


class ConnectorTransport(Protocol):
    """All transports must expose the same surface as ``ConnectorClient``."""

    async def forward(self, **kwargs: Any) -> Any: ...
    def open_stream(self, **kwargs: Any) -> Any: ...


def select_transport(name: str, default: ConnectorTransport) -> ConnectorTransport:
    """Resolve a transport by name, falling back to ``default``."""
    n = (name or "direct_http").strip().lower()
    if n == "direct_http":
        return default
    if n == "wss_tunnel":
        logger.warning(
            "CONNECTOR_TRANSPORT=wss_tunnel is scaffolded but not implemented; "
            "falling back to direct_http. See backend/app/services/connector_transport.py "
            "for the planned wire protocol."
        )
        return default
    logger.warning("Unknown CONNECTOR_TRANSPORT=%r; using direct_http", name)
    return default
