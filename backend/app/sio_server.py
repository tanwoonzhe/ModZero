"""Socket.IO server for real-time communication between controller, dashboard, and connectors."""

import logging
from typing import Dict

import socketio

from .settings import get_settings

logger = logging.getLogger("modzero.socketio")

_settings = get_settings()
_cors = _settings.cors_origins.split(",") if _settings.cors_origins != "*" else "*"

# Create Socket.IO server (async mode for use with FastAPI/uvicorn)
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=_cors,
    logger=False,
    engineio_logger=False,
)

# Track connected connectors: sid -> connector_id
_connector_sessions: Dict[str, str] = {}
# Track connected dashboard sessions
_dashboard_sessions: set = set()


@sio.event
async def connect(sid, environ):
    logger.info("Socket.IO client connected: %s", sid)


@sio.event
async def disconnect(sid):
    logger.info("Socket.IO client disconnected: %s", sid)
    # Clean up connector session
    if sid in _connector_sessions:
        connector_id = _connector_sessions.pop(sid)
        logger.info("Connector %s disconnected", connector_id)
        # Notify dashboards
        await sio.emit("connector_status", {
            "connector_id": connector_id,
            "status": "disconnected",
        }, room="dashboard")
    _dashboard_sessions.discard(sid)


@sio.on("connector_auth")
async def on_connector_auth(sid, data):
    """Handle connector authentication after connection."""
    connector_id = data.get("connector_id", "")
    # In production, verify connector_secret here
    # For now, just register the connector
    if connector_id:
        _connector_sessions[sid] = connector_id
        await sio.enter_room(sid, f"connector:{connector_id}")
        await sio.emit("auth_result", {"status": "ok"}, room=sid)
        logger.info("Connector %s authenticated (sid=%s)", connector_id, sid)
        # Notify dashboards
        await sio.emit("connector_status", {
            "connector_id": connector_id,
            "status": "connected",
        }, room="dashboard")
    else:
        await sio.emit("auth_result", {"status": "error", "detail": "missing connector_id"}, room=sid)


@sio.on("dashboard_join")
async def on_dashboard_join(sid, data):
    """Dashboard client joins the dashboard room for real-time updates."""
    _dashboard_sessions.add(sid)
    await sio.enter_room(sid, "dashboard")
    logger.info("Dashboard client joined (sid=%s)", sid)


async def notify_policy_update(connector_id: str, resources: list):
    """Push policy update to a specific connector."""
    room = f"connector:{connector_id}"
    await sio.emit("policy_update", {"resources": resources}, room=room)
    logger.info("Policy update sent to connector %s (%d resources)", connector_id, len(resources))


async def notify_connector_change():
    """Notify dashboard clients that connector list has changed."""
    await sio.emit("connectors_changed", {}, room="dashboard")


async def notify_access_attempt(attempt_data: dict):
    """Push a new access attempt event to dashboard clients."""
    await sio.emit("access_attempt", attempt_data, room="dashboard")
    logger.info("Access attempt event sent to dashboard")


async def notify_assessment_update():
    """Notify dashboard clients that assessment data has been updated."""
    await sio.emit("assessment_updated", {}, room="dashboard")
    logger.info("Assessment update event sent to dashboard")


def get_sio_app():
    """Return an ASGI app that wraps the Socket.IO server."""
    return socketio.ASGIApp(sio, socketio_path="/socket.io")
