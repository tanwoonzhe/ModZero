"""Phase 2B — connector-side outbound WebSocket tunnel (scaffold).

When ``CONNECTOR_TRANSPORT=wss_tunnel`` is enabled in production, the
connector will dial *out* to the controller and keep a long-lived TLS
WebSocket open. The controller multiplexes signed forward requests over
that socket and the connector streams responses back. See
``backend/app/services/connector_transport.py`` for the full design and
wire format.

This module is a placeholder so the contract is visible in code review.
The current Phase 2 demo continues to use direct HTTP. Implementation
work tracked under Phase 3.
"""
from __future__ import annotations

import logging

logger = logging.getLogger("modzero.wss_tunnel")


async def run_tunnel(controller_wss_url: str, connector_id: str, jwt: str) -> None:
    """Connector entry point — dial controller and serve frames."""
    raise NotImplementedError(
        "wss_tunnel is scaffolded for Phase 3. Until then the connector "
        "should run with CONNECTOR_TRANSPORT unset (direct_http). "
        "See backend/app/services/connector_transport.py for protocol design."
    )
