"""Connector state file I/O. Stores connector_id + connector_secret."""

import json
import os
from typing import Optional


def load_state(path: str) -> Optional[dict]:
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_state(path: str, state: dict) -> None:
    parent = os.path.dirname(os.path.abspath(path))
    if parent and not os.path.isdir(parent):
        os.makedirs(parent, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)
    if os.name == "posix":
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass


def state_exists(path: str) -> bool:
    return os.path.exists(path)
