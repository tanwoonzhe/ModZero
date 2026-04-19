"""ModZero Connector — main entry point.

Lifecycle:
  1. Enroll with the controller (or load existing credentials)
  2. Start heartbeat background task
  3. Start policy-polling background task
  4. Connect Socket.IO for real-time updates
  5. Start HTTP reverse proxy server
"""

import asyncio
import logging
import sys
import signal

from aiohttp import web

from config import LISTEN_ADDR, LISTEN_PORT, VERSION
from enroll import enroll_connector
from heartbeat import heartbeat_loop, policy_poll_loop
from proxy_server import create_proxy_app
from sio_client import create_sio_client, connect_sio
from transport import HTTPReverseProxy

# ── Logging ──────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("modzero.connector")


async def main():
    logger.info("ModZero Connector v%s starting...", VERSION)

    # 1. Enroll
    creds = await enroll_connector()
    connector_id = creds["connector_id"]
    connector_secret = creds["connector_secret"]

    # 2. Shared policy store (updated by poll + socket events)
    policy_store: dict = {
        "resources": [],
        "jwks_url": "",
    }

    # 3. Transport adapter
    transport = HTTPReverseProxy()

    # 4. Create proxy app
    proxy_app = create_proxy_app(policy_store, transport)

    # 5. Background tasks
    tasks = []

    # Heartbeat
    tasks.append(asyncio.create_task(
        heartbeat_loop(connector_id, connector_secret)
    ))

    # Policy polling
    tasks.append(asyncio.create_task(
        policy_poll_loop(connector_id, connector_secret, policy_store)
    ))

    # Socket.IO
    sio = create_sio_client(connector_id, connector_secret, policy_store)
    tasks.append(asyncio.create_task(connect_sio(sio)))

    # 6. Start proxy server
    runner = web.AppRunner(proxy_app)
    await runner.setup()
    site = web.TCPSite(runner, LISTEN_ADDR, LISTEN_PORT)
    await site.start()
    logger.info("Proxy server listening on %s:%d", LISTEN_ADDR, LISTEN_PORT)

    # Keep running
    stop_event = asyncio.Event()

    def _shutdown(sig, frame):
        logger.info("Received signal %s, shutting down...", sig)
        stop_event.set()

    # Handle signals (Unix)
    try:
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, lambda s=sig: stop_event.set())
    except NotImplementedError:
        # Windows doesn't support add_signal_handler
        signal.signal(signal.SIGINT, _shutdown)
        signal.signal(signal.SIGTERM, _shutdown)

    logger.info("Connector is ready.")
    await stop_event.wait()

    # Cleanup
    logger.info("Shutting down...")
    for t in tasks:
        t.cancel()
    if sio.connected:
        await sio.disconnect()
    await transport.stop()
    await runner.cleanup()
    logger.info("Connector stopped.")


if __name__ == "__main__":
    asyncio.run(main())
