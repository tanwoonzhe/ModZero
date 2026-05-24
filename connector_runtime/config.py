"""Connector runtime configuration: env vars + optional JSON file."""

import json
import os
import socket
from dataclasses import dataclass, field
from typing import Optional

DEFAULTS = {
    "backend_url":        "http://localhost:8000",
    "connector_name":     "modzero-connector",
    "network":            "default",
    "proxy_host":         "",
    "proxy_port":         18080,
    "state_file":         os.path.join(os.getcwd(), "connector_state.json"),
    "heartbeat_interval": 10,
    "wg_enabled":         False,
    "wg_node_name":       "",  # resolved to hostname at load time when blank
}

ENV_MAP = {
    "backend_url":        "MODZERO_BACKEND_URL",
    "connector_name":     "MODZERO_CONNECTOR_NAME",
    "network":            "MODZERO_NETWORK",
    "proxy_host":         "MODZERO_PROXY_HOST",
    "proxy_port":         "MODZERO_PROXY_PORT",
    "state_file":         "MODZERO_STATE_FILE",
    "heartbeat_interval": "MODZERO_HEARTBEAT_INTERVAL",
    "wg_enabled":         "MODZERO_WG_ENABLED",
    "wg_node_name":       "MODZERO_WG_NODE_NAME",
}

INT_KEYS = {"proxy_port", "heartbeat_interval"}
BOOL_KEYS = {"wg_enabled"}


def _to_bool(v) -> bool:
    if isinstance(v, bool):
        return v
    return str(v).strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Config:
    backend_url:        str
    connector_name:     str
    network:            str
    proxy_host:         str
    proxy_port:         int
    state_file:         str
    heartbeat_interval: int
    wg_enabled:         bool
    wg_node_name:       str

    @classmethod
    def load(cls, json_path: Optional[str] = None) -> "Config":
        values = dict(DEFAULTS)

        # Layer 1: optional JSON config file
        if json_path and os.path.exists(json_path):
            with open(json_path, "r", encoding="utf-8") as f:
                file_values = json.load(f)
            for k, v in file_values.items():
                if k in values and v is not None:
                    values[k] = v

        # Layer 2: environment variables (highest precedence)
        for key, env_name in ENV_MAP.items():
            env_val = os.environ.get(env_name)
            if env_val is not None and env_val != "":
                values[key] = env_val

        # Coerce ints
        for k in INT_KEYS:
            values[k] = int(values[k])

        # Coerce bools
        for k in BOOL_KEYS:
            values[k] = _to_bool(values[k])

        # Default wg_node_name to hostname when blank
        if not values["wg_node_name"]:
            try:
                values["wg_node_name"] = socket.gethostname() or "modzero-node"
            except Exception:
                values["wg_node_name"] = "modzero-node"

        # Strip trailing slash on backend_url for consistency
        values["backend_url"] = str(values["backend_url"]).rstrip("/")

        return cls(**values)
