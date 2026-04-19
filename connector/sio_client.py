"""Socket.IO client for real-time communication with the controller."""

import logging
import socketio

from config import CONTROLLER_URL, get_ssl_context

logger = logging.getLogger("modzero.connector")


def create_sio_client(connector_id: str, connector_secret: str,
                      policy_store: dict) -> socketio.AsyncClient:
    """Create and configure a Socket.IO client.

    Events:
        - policy_update: triggers immediate policy refresh
        - connector_command: future extensibility (restart, update config, etc.)
    """
    sio = socketio.AsyncClient(
        reconnection=True,
        reconnection_attempts=0,  # unlimited
        reconnection_delay=2,
        reconnection_delay_max=30,
        logger=False,
    )

    @sio.event
    async def connect():
        logger.info("Socket.IO connected to controller")
        # Authenticate after connection
        await sio.emit("connector_auth", {
            "connector_id": connector_id,
            "connector_secret": connector_secret,
        })

    @sio.event
    async def disconnect():
        logger.warning("Socket.IO disconnected from controller")

    @sio.on("policy_update")
    async def on_policy_update(data):
        """Controller pushed a policy update event."""
        logger.info("Received policy_update event — refreshing resources")
        resources = data.get("resources", [])
        if resources:
            policy_store["resources"] = resources
            logger.info("Policy store updated with %d resources", len(resources))

    @sio.on("connector_command")
    async def on_command(data):
        """Handle commands from controller (future use)."""
        cmd = data.get("command", "")
        logger.info("Received connector command: %s", cmd)
        # Future: handle restart, update, diagnostics, etc.

    @sio.on("auth_result")
    async def on_auth_result(data):
        if data.get("status") == "ok":
            logger.info("Socket.IO authentication successful")
        else:
            logger.warning("Socket.IO authentication failed: %s", data.get("detail", "unknown"))

    return sio


async def connect_sio(sio: socketio.AsyncClient):
    """Connect the Socket.IO client to the controller."""
    # Determine ws URL from controller URL
    ws_url = CONTROLLER_URL.replace("https://", "wss://").replace("http://", "ws://")
    # socketio client connects via http(s), not ws directly
    http_url = CONTROLLER_URL

    try:
        ssl_ctx = get_ssl_context()
        # python-socketio uses http for initial handshake
        await sio.connect(
            http_url,
            socketio_path="/socket.io",
            transports=["websocket", "polling"],
        )
    except Exception as exc:
        logger.warning("Socket.IO connection failed: %s. Will retry.", exc)
