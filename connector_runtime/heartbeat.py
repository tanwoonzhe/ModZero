"""Heartbeat loop thread."""

import platform
import socket
import threading
import time

from .client import ControllerClient
from .logging_utils import error, info, ok, warn


def _local_ip() -> str:
    s = None
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        if s is not None:
            s.close()


def _fmt_uptime(seconds: int) -> str:
    if seconds < 60:   return f"{seconds}s"
    if seconds < 3600: return f"{seconds//60}m {seconds%60}s"
    return f"{seconds//3600}h {(seconds%3600)//60}m"


class HeartbeatLoop(threading.Thread):
    def __init__(self, client: ControllerClient, *,
                 network: str, hostname: str, version: str,
                 interval: int, deployed_by: str = "connector_runtime"):
        super().__init__(daemon=True, name="modzero-heartbeat")
        self.client = client
        self.network = network
        self.hostname = hostname
        self.version = version
        self.interval = interval
        self.deployed_by = deployed_by
        self._stop = threading.Event()

    def stop(self) -> None:
        self._stop.set()

    def run(self) -> None:
        start = time.time()
        beat = 0
        info(f"Heartbeat loop starting (interval={self.interval}s)")
        while not self._stop.is_set():
            beat += 1
            uptime = int(time.time() - start)
            labels = {
                "deployed_by": self.deployed_by,
                "platform":    f"{platform.system()} {platform.release()}",
                "beat":        str(beat),
            }
            try:
                success = self.client.heartbeat(
                    hostname=self.hostname,
                    ip=_local_ip(),
                    version=self.version,
                    labels=labels,
                    uptime=uptime,
                    status="online",
                    network=self.network,
                )
                if success:
                    ok(f"Heartbeat #{beat} uptime={_fmt_uptime(uptime)} status=online")
                else:
                    warn(f"Heartbeat #{beat} returned non-200")
            except Exception as exc:
                error(f"Heartbeat #{beat} failed: {type(exc).__name__}")
            if self._stop.wait(self.interval):
                break
        info("Heartbeat loop stopped")
