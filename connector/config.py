"""Connector configuration loaded from environment variables and persisted credentials."""

import os
import json
import logging
from pathlib import Path

logger = logging.getLogger("modzero.connector")

VERSION = "0.1.0"

# Directories
CONFIG_DIR = Path(os.getenv("MODZERO_CONFIG_DIR", "/etc/modzero-connector"))
CREDENTIALS_FILE = CONFIG_DIR / "credentials.json"

# Environment variables
CONTROLLER_URL = os.getenv("MODZERO_CONTROLLER_URL", "http://controller:8000").rstrip("/")
ENROLL_TOKEN = os.getenv("MODZERO_ENROLL_TOKEN", "")
NETWORK = os.getenv("MODZERO_NETWORK", "default")
LABEL_HOSTNAME = os.getenv("MODZERO_LABEL_HOSTNAME", os.getenv("HOSTNAME", "unknown"))
LABEL_DEPLOYED_BY = os.getenv("MODZERO_LABEL_DEPLOYED_BY", "docker")
CA_BUNDLE_PATH = os.getenv("MODZERO_CA_BUNDLE_PATH", "")
LISTEN_ADDR = os.getenv("MODZERO_CONNECTOR_LISTEN_ADDR", "0.0.0.0")
LISTEN_PORT = int(os.getenv("MODZERO_CONNECTOR_LISTEN_PORT", "8443"))

# Intervals (seconds)
HEARTBEAT_INTERVAL = int(os.getenv("MODZERO_HEARTBEAT_INTERVAL", "10"))
POLICY_POLL_INTERVAL = int(os.getenv("MODZERO_POLICY_POLL_INTERVAL", "15"))


def api_url(path: str) -> str:
    """Build full API URL for a given path."""
    return f"{CONTROLLER_URL}/api{path}"


def get_ssl_context():
    """Return SSL context or None. Supports custom CA bundle."""
    import ssl
    if CA_BUNDLE_PATH and os.path.isfile(CA_BUNDLE_PATH):
        ctx = ssl.create_default_context(cafile=CA_BUNDLE_PATH)
        return ctx
    # For development: allow insecure if env is set
    if os.getenv("MODZERO_INSECURE_SKIP_VERIFY", "").lower() in ("1", "true", "yes"):
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return ctx
    return None


def save_credentials(connector_id: str, connector_secret: str):
    """Persist connector credentials securely to disk."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    os.chmod(str(CONFIG_DIR), 0o700)
    data = {
        "connector_id": connector_id,
        "connector_secret": connector_secret,
        "controller_url": CONTROLLER_URL,
        "network": NETWORK,
    }
    CREDENTIALS_FILE.write_text(json.dumps(data, indent=2))
    os.chmod(str(CREDENTIALS_FILE), 0o600)
    logger.info("Credentials saved to %s", CREDENTIALS_FILE)


def load_credentials() -> dict | None:
    """Load persisted credentials from disk. Returns None if not found."""
    if not CREDENTIALS_FILE.exists():
        return None
    try:
        data = json.loads(CREDENTIALS_FILE.read_text())
        if data.get("connector_id") and data.get("connector_secret"):
            return data
    except (json.JSONDecodeError, IOError) as exc:
        logger.warning("Failed to read credentials file: %s", exc)
    return None
