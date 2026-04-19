"""Enrollment logic: exchange a one-time token for long-lived connector credentials."""

import logging
import aiohttp
from config import (
    ENROLL_TOKEN, NETWORK, LABEL_HOSTNAME, LABEL_DEPLOYED_BY,
    VERSION, api_url, get_ssl_context, save_credentials, load_credentials,
)

logger = logging.getLogger("modzero.connector")


async def enroll_connector() -> dict:
    """Enroll this connector with the controller.

    If credentials already exist on disk, skip enrollment.
    Otherwise, use the one-time enroll token to register.

    Returns:
        dict with connector_id and connector_secret.

    Raises:
        SystemExit if enrollment fails and no credentials exist.
    """
    creds = load_credentials()
    if creds:
        logger.info("Connector already enrolled (id=%s). Skipping enrollment.", creds["connector_id"])
        return creds

    if not ENROLL_TOKEN:
        logger.error("No enroll token provided and no existing credentials found. Cannot start.")
        raise SystemExit(1)

    logger.info("Starting enrollment with controller...")
    ssl_ctx = get_ssl_context()
    connector = aiohttp.TCPConnector(ssl=ssl_ctx)
    timeout = aiohttp.ClientTimeout(total=30)

    payload = {
        "token": ENROLL_TOKEN,
        "network": NETWORK,
        "hostname": LABEL_HOSTNAME,
        "deployed_by": LABEL_DEPLOYED_BY,
        "version": VERSION,
    }

    try:
        async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
            url = api_url("/connectors/enroll")
            logger.info("POST %s", url)
            async with session.post(url, json=payload) as resp:
                if resp.status == 201:
                    data = await resp.json()
                    connector_id = data["connector_id"]
                    connector_secret = data["connector_secret"]
                    logger.info("Enrollment successful. connector_id=%s", connector_id)
                    # Never log the secret
                    save_credentials(connector_id, connector_secret)
                    return {
                        "connector_id": connector_id,
                        "connector_secret": connector_secret,
                        "controller_url": payload.get("controller_url", ""),
                        "network": NETWORK,
                    }
                else:
                    body = await resp.text()
                    logger.error("Enrollment failed: HTTP %d — %s", resp.status, body)
                    raise SystemExit(1)
    except aiohttp.ClientError as exc:
        logger.error("Cannot reach controller at %s: %s", api_url(""), exc)
        raise SystemExit(1)
