"""Heartbeat and policy-polling background tasks."""

import asyncio
import logging
import time
import socket
import aiohttp

from config import (
    VERSION, NETWORK, LABEL_HOSTNAME, LABEL_DEPLOYED_BY,
    HEARTBEAT_INTERVAL, POLICY_POLL_INTERVAL,
    api_url, get_ssl_context,
)

logger = logging.getLogger("modzero.connector")

_start_time = time.monotonic()


def _uptime_seconds() -> int:
    return int(time.monotonic() - _start_time)


def _local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "unknown"


async def heartbeat_loop(connector_id: str, connector_secret: str,
                         on_status_change=None):
    """Send periodic heartbeats to the controller."""
    ssl_ctx = get_ssl_context()
    connector = aiohttp.TCPConnector(ssl=ssl_ctx)
    headers = {
        "X-Connector-Id": connector_id,
        "X-Connector-Secret": connector_secret,
    }

    while True:
        payload = {
            "hostname": LABEL_HOSTNAME,
            "ip": _local_ip(),
            "version": VERSION,
            "labels": {
                "hostname": LABEL_HOSTNAME,
                "deployed_by": LABEL_DEPLOYED_BY,
            },
            "uptime": _uptime_seconds(),
            "status": "online",
            "network": NETWORK,
        }
        try:
            async with aiohttp.ClientSession(connector=connector, timeout=aiohttp.ClientTimeout(total=10)) as session:
                url = api_url(f"/connectors/{connector_id}/heartbeat")
                async with session.post(url, json=payload, headers=headers) as resp:
                    if resp.status == 200:
                        logger.debug("Heartbeat OK")
                    else:
                        body = await resp.text()
                        logger.warning("Heartbeat failed: HTTP %d — %s", resp.status, body)
        except Exception as exc:
            logger.warning("Heartbeat error: %s", exc)

        await asyncio.sleep(HEARTBEAT_INTERVAL)


async def policy_poll_loop(connector_id: str, connector_secret: str,
                           policy_store: dict):
    """Poll the controller for resource/policy updates."""
    ssl_ctx = get_ssl_context()
    connector = aiohttp.TCPConnector(ssl=ssl_ctx)
    headers = {
        "X-Connector-Id": connector_id,
        "X-Connector-Secret": connector_secret,
    }

    while True:
        try:
            async with aiohttp.ClientSession(connector=connector, timeout=aiohttp.ClientTimeout(total=10)) as session:
                url = api_url(f"/connectors/{connector_id}/policies")
                async with session.get(url, json=None, headers=headers) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        resources = data.get("resources", [])
                        policy_store["resources"] = resources
                        policy_store["jwks_url"] = data.get("jwks_url", "")
                        logger.debug("Policies refreshed: %d resources", len(resources))
                    else:
                        body = await resp.text()
                        logger.warning("Policy poll failed: HTTP %d — %s", resp.status, body)
        except Exception as exc:
            logger.warning("Policy poll error: %s", exc)

        await asyncio.sleep(POLICY_POLL_INTERVAL)
