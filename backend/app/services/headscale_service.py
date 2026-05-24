"""Headscale API adapter — read-only.

Communicates with a self-hosted Headscale control server when
HEADSCALE_ENABLED=true and HEADSCALE_URL + HEADSCALE_API_KEY are set.

This module never modifies system routes, never touches WireGuard userspace,
and never auto-creates ModZero TunnelNode rows. It is a read-only adapter so
that admin code can reconcile Headscale's view of the node fleet into the
existing TunnelNode table.

Logging policy: log the endpoint PATH and the HTTP status only. Never log
the full HEADSCALE_URL, the API key, request bodies, response bodies, or
raw tracebacks.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx

from ..settings import get_settings

logger = logging.getLogger(__name__)

_TIMEOUT = 5.0


# ── Custom exceptions ────────────────────────────────────────────────────────

class HeadscaleError(Exception):
    """Base class for all Headscale adapter errors."""
    status_code: int = 502


class HeadscaleNotConfiguredError(HeadscaleError):
    """HEADSCALE_ENABLED is off, or HEADSCALE_URL / HEADSCALE_API_KEY missing."""
    status_code = 503


class HeadscaleAuthError(HeadscaleError):
    """Headscale rejected the API key (401/403)."""
    status_code = 401


class HeadscaleUnreachableError(HeadscaleError):
    """Connection refused / timed out / DNS failure."""
    status_code = 502


class HeadscaleAPIError(HeadscaleError):
    """Unexpected 5xx or malformed JSON body."""
    status_code = 502


# ── Defensive node parser ────────────────────────────────────────────────────

def _first(d: Dict[str, Any], *keys: str) -> Any:
    for k in keys:
        if k in d and d[k] not in (None, ""):
            return d[k]
    return None


def _first_addr(d: Dict[str, Any], *list_keys: str) -> Optional[str]:
    for k in list_keys:
        v = d.get(k)
        if isinstance(v, list) and v:
            return str(v[0])
    return None


def _normalize_node(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Tolerate Headscale field-name drift across versions.

    Returns a dict with: headscale_node_id, node_name, node_key,
    wireguard_ip, online, last_seen. Any field may be None.
    Never raises.
    """
    if not isinstance(raw, dict):
        return {
            "headscale_node_id": None,
            "node_name": None,
            "node_key": None,
            "wireguard_ip": None,
            "online": None,
            "last_seen": None,
        }

    hs_id = _first(raw, "id", "nodeId", "node_id")
    name = _first(raw, "name", "givenName", "given_name", "hostname")
    node_key = _first(raw, "nodeKey", "node_key", "machineKey", "machine_key")
    wg_ip = (
        _first_addr(raw, "ipAddresses", "ip_addresses")
        or _first(raw, "ipAddress", "ip_address")
    )
    online = _first(raw, "online", "isOnline", "is_online")
    if online is not None:
        online = bool(online)
    last_seen = _first(raw, "lastSeen", "last_seen")

    return {
        "headscale_node_id": str(hs_id) if hs_id is not None else None,
        "node_name": str(name) if name is not None else None,
        "node_key": str(node_key) if node_key is not None else None,
        "wireguard_ip": str(wg_ip) if wg_ip is not None else None,
        "online": online,
        "last_seen": last_seen,
    }


def parse_last_seen(value: Any) -> Optional[datetime]:
    """Best-effort ISO-8601 / RFC3339 parsing. Returns None on failure."""
    if not value or not isinstance(value, str):
        return None
    s = value.strip()
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        return datetime.fromisoformat(s)
    except Exception:
        return None


# ── Fixture short-circuit (tests only) ───────────────────────────────────────

def _fixture_path() -> Optional[str]:
    if os.getenv("MODZERO_ALLOW_HEADSCALE_FIXTURE") != "1":
        return None
    path = os.getenv("HEADSCALE_TEST_FIXTURE")
    if not path or not os.path.isfile(path):
        return None
    return path


def _load_fixture(path: str) -> List[Dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    if isinstance(data, dict) and "nodes" in data:
        data = data["nodes"]
    return list(data) if isinstance(data, list) else []


# ── Route fixture short-circuit (tests only) ─────────────────────────────────

def _route_fixture_path() -> Optional[str]:
    if os.getenv("MODZERO_ALLOW_HEADSCALE_FIXTURE") != "1":
        return None
    path = os.getenv("HEADSCALE_ROUTE_TEST_FIXTURE")
    if not path or not os.path.isfile(path):
        return None
    return path


def _load_route_fixture(path: str) -> List[Dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    if isinstance(data, dict) and "routes" in data:
        data = data["routes"]
    return list(data) if isinstance(data, list) else []


# ── Defensive route parser ────────────────────────────────────────────────────

def _normalize_route(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Tolerate Headscale route field-name drift across versions.

    Returns {headscale_route_id, prefix, advertised, enabled, node_ref}.
    Any field may be None. Never raises.
    """
    if not isinstance(raw, dict):
        return {
            "headscale_route_id": None,
            "prefix": None,
            "advertised": False,
            "enabled": False,
            "node_ref": None,
        }
    headscale_route_id = _first(raw, "id", "routeId", "route_id")
    prefix = _first(raw, "prefix", "route", "cidr", "subnet")
    advertised = _first(raw, "advertised", "is_advertised")
    enabled = _first(raw, "enabled", "is_enabled")
    machine = raw.get("machine") or raw.get("node") or {}
    if isinstance(machine, dict):
        node_ref = _first(machine, "id", "nodeId", "node_id")
    else:
        node_ref = None
    if node_ref is None:
        node_ref = _first(raw, "machineId", "machine_id", "nodeId", "node_id")
    return {
        "headscale_route_id": str(headscale_route_id) if headscale_route_id is not None else None,
        "prefix": str(prefix).strip() if prefix is not None else None,
        "advertised": bool(advertised) if advertised is not None else False,
        "enabled": bool(enabled) if enabled is not None else False,
        "node_ref": str(node_ref) if node_ref is not None else None,
    }


# ── Service ──────────────────────────────────────────────────────────────────

class HeadscaleService:
    """Thin read-only adapter around the Headscale REST API."""

    def is_configured(self) -> bool:
        s = get_settings()
        return bool(s.headscale_enabled and s.headscale_url and s.headscale_api_key)

    def health_check(self) -> Dict[str, Any]:
        """Never raises. Returns {reachable, node_count, error}.

        - If fixture is active: reachable=True, node_count=len(fixture).
        - If not configured: reachable=None, node_count=None.
        - Otherwise performs a single GET /api/v1/node and reports reachability.
        """
        if not self.is_configured():
            return {"reachable": None, "node_count": None, "error": None}

        fixture = _fixture_path()
        if fixture is not None:
            try:
                nodes = _load_fixture(fixture)
            except Exception:
                return {"reachable": False, "node_count": None,
                        "error": "fixture parse error"}
            return {"reachable": True, "node_count": len(nodes), "error": None}

        try:
            nodes = self.list_nodes()
            return {"reachable": True, "node_count": len(nodes), "error": None}
        except HeadscaleUnreachableError:
            return {"reachable": False, "node_count": None,
                    "error": "unreachable"}
        except HeadscaleAuthError:
            return {"reachable": False, "node_count": None,
                    "error": "unauthorized"}
        except HeadscaleError:
            return {"reachable": False, "node_count": None,
                    "error": "api error"}

    def list_nodes(self) -> List[Dict[str, Any]]:
        """GET /api/v1/node. Raises on failure."""
        fixture = _fixture_path()
        if fixture is not None:
            return _load_fixture(fixture)
        return self._get("/api/v1/node", list_key="nodes")

    def list_routes(self) -> List[Dict[str, Any]]:
        """GET /api/v1/routes. Raises on failure."""
        fixture = _route_fixture_path()
        if fixture is not None:
            return _load_route_fixture(fixture)
        return self._get("/api/v1/routes", list_key="routes")

    def create_preauth_key(
        self, user: str, expiration_seconds: int = 3600
    ) -> Dict[str, Any]:
        """POST /api/v1/preauthkey. Returns {"key": str, "expiration": ISO}.

        Defensive parsing: any non-2xx OR unrecognized response shape raises
        HeadscaleAPIError. The raw response body is NEVER logged. Caller is
        expected to fall back to manual mode on any HeadscaleError subclass.
        """
        if not self.is_configured():
            raise HeadscaleNotConfiguredError(
                "HEADSCALE_URL or HEADSCALE_API_KEY missing"
            )

        s = get_settings()
        base = (s.headscale_url or "").rstrip("/")
        url = f"{base}/api/v1/preauthkey"
        headers = {
            "Authorization": f"Bearer {s.headscale_api_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        # Headscale accepts duration strings like "3600s".
        payload = {
            "user": user,
            "reusable": False,
            "ephemeral": False,
            "expiration": f"{int(expiration_seconds)}s",
        }

        try:
            resp = httpx.post(url, headers=headers, json=payload, timeout=_TIMEOUT)
        except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
            logger.info("headscale /api/v1/preauthkey -> connection refused")
            raise HeadscaleUnreachableError("connection refused") from exc
        except httpx.TimeoutException as exc:
            logger.info("headscale /api/v1/preauthkey -> timeout")
            raise HeadscaleUnreachableError("timeout") from exc
        except httpx.RequestError as exc:
            logger.info("headscale /api/v1/preauthkey -> request error")
            raise HeadscaleUnreachableError("request error") from exc

        # Log status code only — never body, never key.
        logger.info("headscale /api/v1/preauthkey -> %s", resp.status_code)

        if resp.status_code in (401, 403):
            raise HeadscaleAuthError("unauthorized")
        if resp.status_code >= 400:
            raise HeadscaleAPIError("preauthkey http error")

        try:
            body = resp.json()
        except Exception as exc:
            raise HeadscaleAPIError("preauthkey invalid json") from exc

        # Headscale variants: {"preAuthKey": {"key": "...", "expiration": "..."}}
        # OR flat: {"key": "...", "expiration": "..."}.
        if isinstance(body, dict) and isinstance(body.get("preAuthKey"), dict):
            inner = body["preAuthKey"]
        elif isinstance(body, dict):
            inner = body
        else:
            raise HeadscaleAPIError("preauthkey shape unrecognized")

        key_value = _first(inner, "key", "preAuthKey")
        if not isinstance(key_value, str) or not key_value.strip():
            raise HeadscaleAPIError("preauthkey shape unrecognized")

        expiration = _first(inner, "expiration", "expires_at", "expiresAt")
        return {
            "key": key_value,
            "expiration": expiration if isinstance(expiration, str) else None,
        }

    # ── HTTP plumbing ─────────────────────────────────────────────────────

    def approve_route(self, headscale_route_id: str) -> dict:
        """POST /api/v1/routes/{id}/enable (Headscale v0.23+).

        Never logs body. Raises HeadscaleError on any failure.
        """
        path = f"/api/v1/routes/{headscale_route_id}/enable"
        self._post(path)
        return {"status": "ok"}

    def _post(self, path: str) -> Dict[str, Any]:
        """POST to Headscale. Logs path + status code only — never body, never key."""
        if not self.is_configured():
            raise HeadscaleNotConfiguredError("HEADSCALE_URL or HEADSCALE_API_KEY missing")

        s = get_settings()
        base = (s.headscale_url or "").rstrip("/")
        url = f"{base}{path}"
        headers = {
            "Authorization": f"Bearer {s.headscale_api_key}",
            "Accept": "application/json",
        }
        try:
            resp = httpx.post(url, headers=headers, timeout=_TIMEOUT)
        except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
            logger.info("headscale %s -> connection refused", path)
            raise HeadscaleUnreachableError("connection refused") from exc
        except httpx.TimeoutException as exc:
            logger.info("headscale %s -> timeout", path)
            raise HeadscaleUnreachableError("timeout") from exc
        except httpx.RequestError as exc:
            logger.info("headscale %s -> request error", path)
            raise HeadscaleUnreachableError("request error") from exc

        logger.info("headscale %s -> %s", path, resp.status_code)

        if resp.status_code in (401, 403):
            raise HeadscaleAuthError("unauthorized")
        if resp.status_code == 404:
            raise HeadscaleAPIError("not found")
        if resp.status_code >= 400:
            raise HeadscaleAPIError("client error")
        if resp.status_code >= 500:
            raise HeadscaleAPIError("server error")

        try:
            return resp.json() if resp.content else {}
        except Exception:
            return {}

    def _get(self, path: str, list_key: str) -> List[Dict[str, Any]]:
        if not self.is_configured():
            raise HeadscaleNotConfiguredError("HEADSCALE_URL or HEADSCALE_API_KEY missing")

        s = get_settings()
        base = (s.headscale_url or "").rstrip("/")
        url = f"{base}{path}"
        headers = {
            "Authorization": f"Bearer {s.headscale_api_key}",
            "Accept": "application/json",
        }
        try:
            resp = httpx.get(url, headers=headers, timeout=_TIMEOUT)
        except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
            logger.info("headscale %s -> connection refused", path)
            raise HeadscaleUnreachableError("connection refused") from exc
        except httpx.TimeoutException as exc:
            logger.info("headscale %s -> timeout", path)
            raise HeadscaleUnreachableError("timeout") from exc
        except httpx.RequestError as exc:
            logger.info("headscale %s -> request error", path)
            raise HeadscaleUnreachableError("request error") from exc

        logger.info("headscale %s -> %s", path, resp.status_code)

        if resp.status_code in (401, 403):
            raise HeadscaleAuthError("unauthorized")
        if resp.status_code >= 500:
            raise HeadscaleAPIError("server error")
        if resp.status_code >= 400:
            raise HeadscaleAPIError("client error")

        try:
            body = resp.json()
        except Exception as exc:
            raise HeadscaleAPIError("invalid json") from exc

        if isinstance(body, dict) and list_key in body and isinstance(body[list_key], list):
            return body[list_key]
        if isinstance(body, list):
            return body
        return []
