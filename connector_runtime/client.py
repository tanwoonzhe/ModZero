"""Controller client: enroll, heartbeat, introspect.

Wraps the three backend endpoints the demo connector talks to. Never logs
secrets or access tokens.
"""

from typing import Optional

import requests


class ControllerError(Exception):
    """Raised for non-recoverable controller errors during enrollment."""


class ControllerClient:
    def __init__(self, backend_url: str,
                 connector_id: Optional[str] = None,
                 connector_secret: Optional[str] = None,
                 timeout: int = 10):
        self.backend = backend_url.rstrip("/")
        self.connector_id = connector_id
        self.connector_secret = connector_secret
        self.timeout = timeout

    # ── Auth headers ────────────────────────────────────────────────────────
    def _auth_headers(self) -> dict:
        if not (self.connector_id and self.connector_secret):
            raise ControllerError("connector_id/secret not set on client")
        return {
            "X-Connector-Id":     self.connector_id,
            "X-Connector-Secret": self.connector_secret,
            "Content-Type":       "application/json",
        }

    # ── Enroll ──────────────────────────────────────────────────────────────
    def enroll(self, token: str, network: str, hostname: str,
               deployed_by: str = "connector_runtime",
               version: str = "0.1.0") -> dict:
        url = f"{self.backend}/api/connectors/enroll"
        payload = {
            "token":       token,
            "network":     network,
            "hostname":    hostname,
            "deployed_by": deployed_by,
            "version":     version,
        }
        r = requests.post(url, json=payload, timeout=self.timeout)
        if r.status_code == 201:
            data = r.json()
            self.connector_id = data["connector_id"]
            self.connector_secret = data["connector_secret"]
            return data
        if r.status_code == 401:
            raise ControllerError("Enrollment token is invalid, expired, or already used.")
        raise ControllerError(f"Enrollment failed: HTTP {r.status_code}: {r.text[:200]}")

    # ── Heartbeat ───────────────────────────────────────────────────────────
    def heartbeat(self, hostname: str, ip: str, version: str,
                  labels: dict, uptime: int, status: str, network: str,
                  timeout: int = 8) -> bool:
        url = f"{self.backend}/api/connectors/{self.connector_id}/heartbeat"
        payload = {
            "hostname": hostname,
            "ip":       ip,
            "version":  version,
            "labels":   labels,
            "uptime":   uptime,
            "status":   status,
            "network":  network,
        }
        r = requests.post(url, json=payload, headers=self._auth_headers(),
                          timeout=timeout)
        return r.status_code == 200

    # ── Introspect ──────────────────────────────────────────────────────────
    def introspect(self, session_id: str, access_token: str,
                   timeout: int = 8, bootstrap: bool = False) -> Optional[dict]:
        """bootstrap=True marks a token that came from the URL (not our cookie
        store); the backend allows exactly one such use per session, so a
        copied access_url can't be replayed from another browser/machine."""
        url = f"{self.backend}/api/connectors/access/introspect"
        try:
            r = requests.post(
                url,
                headers=self._auth_headers(),
                json={"session_id": session_id, "access_token": access_token,
                      "bootstrap": bootstrap},
                timeout=timeout,
            )
            return r.json()
        except Exception:
            return None

    # ── Launch code exchange (ZTNA gateway) ────────────────────────────────────
    def exchange_launch_code(self, launch_code: str, timeout: int = 8) -> Optional[dict]:
        """Exchange one-time launch code for session credentials. Never logs code or token."""
        url = f"{self.backend}/api/access/launch/exchange"
        try:
            r = requests.post(
                url,
                headers=self._auth_headers(),
                json={"launch_code": launch_code},
                timeout=timeout,
            )
            if r.status_code == 200:
                return r.json()
            try:
                return {"error": True, "detail": r.json().get("detail", "unknown")}
            except Exception:
                return None
        except Exception:
            return None

    # ── Tunnel (WG metadata) ────────────────────────────────────────────────
    def tunnel_register(self, node_name: str,
                        node_key: Optional[str] = None,
                        wireguard_ip: Optional[str] = None,
                        timeout: int = 8) -> dict:
        url = f"{self.backend}/api/connectors/{self.connector_id}/tunnel/register"
        payload = {"node_name": node_name}
        if node_key is not None:
            payload["node_key"] = node_key
        if wireguard_ip is not None:
            payload["wireguard_ip"] = wireguard_ip
        r = requests.post(url, headers=self._auth_headers(), json=payload,
                          timeout=timeout)
        return {"status_code": r.status_code, "body": _safe_json(r)}

    def tunnel_heartbeat(self, node_name: str, status: str = "online",
                         wireguard_ip: Optional[str] = None,
                         timeout: int = 8) -> dict:
        url = f"{self.backend}/api/connectors/{self.connector_id}/tunnel/heartbeat"
        payload = {"node_name": node_name, "status": status}
        if wireguard_ip is not None:
            payload["wireguard_ip"] = wireguard_ip
        r = requests.post(url, headers=self._auth_headers(), json=payload,
                          timeout=timeout)
        return {"status_code": r.status_code, "body": _safe_json(r)}


def _safe_json(r: requests.Response):
    try:
        return r.json()
    except Exception:
        return None
