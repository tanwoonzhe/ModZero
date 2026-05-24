"""Optional WireGuard metadata loop (Phase 3 scaffold).

When MODZERO_WG_ENABLED=true, the connector registers a WG node with the
controller on startup and pings tunnel/heartbeat every interval. This loop
does NOT:
  - touch system routes,
  - require admin privileges,
  - perform a real WireGuard handshake,
  - alter the HTTP proxy in any way.

It is metadata only. When the controller has HEADSCALE_ENABLED=false, every
request is acknowledged with 202 {"status": "disabled"} and we simply log and
keep looping — never crashing.
"""

import threading
import time

from .client import ControllerClient
from .logging_utils import error, info, ok, warn


class WgLoop(threading.Thread):
    def __init__(self, client: ControllerClient, *,
                 node_name: str, interval: int):
        super().__init__(daemon=True, name="modzero-wg")
        self.client = client
        self.node_name = node_name
        self.interval = max(1, int(interval))
        self._stop = threading.Event()
        self._registered = False

    def stop(self) -> None:
        self._stop.set()

    def _try_register(self) -> None:
        try:
            res = self.client.tunnel_register(node_name=self.node_name)
            code = res.get("status_code")
            body = res.get("body") or {}
            if code == 200:
                self._registered = True
                ok(f"Tunnel register ok node_name={self.node_name}")
            elif code == 202 and body.get("status") == "disabled":
                info("Tunnel register: controller has Headscale disabled (metadata loop idle)")
            else:
                warn(f"Tunnel register: HTTP {code}")
        except Exception as exc:
            error(f"Tunnel register failed: {type(exc).__name__}")

    def _try_heartbeat(self) -> None:
        try:
            res = self.client.tunnel_heartbeat(
                node_name=self.node_name, status="online"
            )
            code = res.get("status_code")
            body = res.get("body") or {}
            if code == 200:
                ok(f"Tunnel heartbeat ok node_name={self.node_name}")
            elif code == 202 and body.get("status") == "disabled":
                # Controller has Headscale off — keep looping silently-ish.
                pass
            elif code == 404 and self._registered is False:
                # Node not registered yet (controller has flag on now); retry register.
                self._try_register()
            else:
                warn(f"Tunnel heartbeat: HTTP {code}")
        except Exception as exc:
            error(f"Tunnel heartbeat failed: {type(exc).__name__}")

    def run(self) -> None:
        info(f"WG metadata loop starting (node_name={self.node_name}, "
             f"interval={self.interval}s)")
        self._try_register()
        while not self._stop.is_set():
            if self._stop.wait(self.interval):
                break
            self._try_heartbeat()
        info("WG metadata loop stopped")
