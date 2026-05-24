"""ModZero Connector Runtime — CLI.

Commands:
  enroll  — one-time enrollment with a token. Saves credentials. Prints secret ONCE.
  run     — load saved credentials, send heartbeats. With --proxy, also serve proxy.
  status  — print non-sensitive info from saved state.
"""

import argparse
import json
import shutil
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone

from . import __version__
from .client import ControllerClient, ControllerError
from .config import Config
from .heartbeat import HeartbeatLoop
from .logging_utils import error, header, info, ok, warn
from .proxy import ProxyServer
from .storage import load_state, save_state, state_exists
from .wg import WgLoop


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="connector_runtime",
                                description="ModZero Connector Runtime")
    p.add_argument("--config", default=None,
                   help="Optional path to JSON config file")
    sub = p.add_subparsers(dest="command", required=True)

    pe = sub.add_parser("enroll", help="One-time enrollment with a token")
    pe.add_argument("--token", required=True, help="One-time enrollment token")
    pe.add_argument("--name", default=None, help="Connector name hint")
    pe.add_argument("--network", default=None, help="Network label")
    pe.add_argument("--force", action="store_true",
                    help="Overwrite existing state file if present")

    pr = sub.add_parser("run", help="Run heartbeat loop (and optional proxy)")
    pr.add_argument("--proxy", action="store_true",
                    help="Also serve the local HTTP proxy")

    sub.add_parser("status", help="Print non-sensitive info from saved state")

    pwg = sub.add_parser(
        "wg",
        help="Read-only WireGuard helpers (status / instructions)",
    )
    pwg_sub = pwg.add_subparsers(dest="wg_command", required=True)
    pwg_sub.add_parser(
        "status",
        help="Print local WG config + state. Exits 1 if no state file.",
    )
    pwg_sub.add_parser(
        "instructions",
        help="Print the manual tailscale-up template. Always exits 0.",
    )
    pwg_sub.add_parser(
        "detect",
        help="Read-only: detect local tailscale state. Never modifies routes. Always exits 0.",
    )

    return p


_WG_INSTRUCTIONS_TEMPLATE = """\
ModZero — Manual WireGuard Join Instructions
============================================

Run this command manually on the connector host. ModZero does NOT execute it.

  sudo tailscale up \\
    --login-server={LOGIN_SERVER} \\
    --hostname={NODE_NAME} \\
    --advertise-tags=tag:modzero-connector \\
    --accept-routes=false \\
    --accept-dns=false

After tailscale prints a login URL, register the node on the Headscale server
out of band:

  headscale --user {HEADSCALE_USER} nodes register --key <mkey:...>

Notes
-----
- Concrete values for {LOGIN_SERVER}, {NODE_NAME}, and {HEADSCALE_USER} come
  from the **Bootstrap** action on the dashboard Tunnels page. This local
  helper only prints the template — it never contacts the controller and
  never embeds an auth key.
- --accept-routes=false and --accept-dns=false are intentional for this
  milestone. The HTTP proxy remains the only data path.
"""


def _cmd_wg_status(args, cfg: Config) -> int:
    header("ModZero Connector Runtime — WG Status (read-only)")
    print(f"  wg_enabled       : {cfg.wg_enabled}")
    print(f"  wg_node_name     : {cfg.wg_node_name}")
    print(f"  state_file       : {cfg.state_file}")
    if not state_exists(cfg.state_file):
        error(f"No state file at {cfg.state_file}. Run 'enroll' first.")
        return 1
    state = load_state(cfg.state_file) or {}
    print(f"  connector_id     : {str(state.get('connector_id', ''))[:16]}...")
    print(f"  backend          : {state.get('backend')}")
    print("  last_heartbeat   : (this command does not call the controller)")
    return 0


def _cmd_wg_instructions(args, cfg: Config) -> int:
    print(_WG_INSTRUCTIONS_TEMPLATE)
    return 0


def _cmd_wg_detect(args, cfg: Config) -> int:
    """Read-only: detect local tailscale state. Always exits 0."""
    header("ModZero Connector Runtime — WG Detect (read-only)")

    tailscale_path = shutil.which("tailscale")
    if tailscale_path is None:
        print("  status         : not_installed")
        print("  tailscale_path : not_found")
        print("  node_name      : (none)")
        print("  wireguard_ip   : (none)")
        return 0

    print(f"  tailscale_path : {tailscale_path}")

    node_name = None
    wireguard_ip = None
    status = "offline"

    # Step 1: tailscale status --json (read-only query)
    try:
        result = subprocess.run(
            ["tailscale", "status", "--json"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            try:
                data = json.loads(result.stdout)
                self_node = data.get("Self") or {}
                node_name = self_node.get("HostName")
                ips = self_node.get("TailscaleIPs") or []
                if ips:
                    wireguard_ip = str(ips[0])
                online = self_node.get("Online")
                if online is True:
                    status = "online"
                elif online is False:
                    status = "offline"
                else:
                    status = "degraded"
            except (json.JSONDecodeError, AttributeError, TypeError):
                status = "degraded"
        else:
            status = "degraded"
    except subprocess.TimeoutExpired:
        status = "degraded"
    except Exception:
        status = "degraded"

    # Step 2: fallback tailscale ip -4 when status --json gave no IP
    if wireguard_ip is None:
        try:
            ip_result = subprocess.run(
                ["tailscale", "ip", "-4"],
                capture_output=True, text=True, timeout=5,
            )
            if ip_result.returncode == 0:
                ip_str = ip_result.stdout.strip()
                if ip_str:
                    wireguard_ip = ip_str
        except Exception:
            pass

    print(f"  status         : {status}")
    print(f"  node_name      : {node_name or '(none)'}")
    print(f"  wireguard_ip   : {wireguard_ip or '(none)'}")

    # Step 3: optional report-back to controller when wg_enabled
    if cfg.wg_enabled and state_exists(cfg.state_file):
        state = load_state(cfg.state_file) or {}
        if state.get("connector_id") and state.get("connector_secret"):
            try:
                client = ControllerClient(
                    backend_url=state.get("backend", cfg.backend_url),
                    connector_id=state["connector_id"],
                    connector_secret=state["connector_secret"],
                )
                hb_node = node_name or cfg.wg_node_name
                # Map "not_installed" to "degraded" — backend status enum only
                # allows: pending / online / degraded / offline
                hb_status = status if status in {"online", "offline", "degraded"} else "degraded"
                res = client.tunnel_heartbeat(
                    node_name=hb_node,
                    status=hb_status,
                    wireguard_ip=wireguard_ip,
                )
                info(f"Tunnel heartbeat sent: HTTP {res.get('status_code')}")
            except Exception as exc:
                warn(f"Tunnel heartbeat failed: {type(exc).__name__}")

    return 0  # always 0



def _cmd_enroll(args, cfg: Config) -> int:
    header("ModZero Connector Runtime — Enrollment")

    if state_exists(cfg.state_file) and not args.force:
        error(f"State file already exists: {cfg.state_file}")
        error("Use --force to overwrite, or delete it manually.")
        return 1

    network = args.network or cfg.network
    name    = args.name or cfg.connector_name
    hostname = socket.gethostname()

    info(f"Backend  : {cfg.backend_url}")
    info(f"Network  : {network}")
    info(f"Name hint: {name}")
    info(f"Hostname : {hostname}")

    client = ControllerClient(cfg.backend_url)
    try:
        data = client.enroll(
            token=args.token,
            network=network,
            hostname=hostname,
            deployed_by="connector_runtime",
            version=__version__,
        )
    except ControllerError as exc:
        error(str(exc))
        return 1

    state = {
        "connector_id":     data["connector_id"],
        "connector_secret": data["connector_secret"],
        "backend":          cfg.backend_url,
        "network":          network,
        "hostname":         hostname,
        "enrolled_at":      datetime.now(timezone.utc).isoformat(),
    }
    save_state(cfg.state_file, state)
    ok(f"Enrolled. State saved → {cfg.state_file}")

    print()
    print("=" * 60)
    print("  IMPORTANT: The connector_secret is shown ONCE below.")
    print("  It is also saved to the state file. Treat both as secrets.")
    print("=" * 60)
    print(f"  connector_id     = {data['connector_id']}")
    print(f"  connector_secret = {data['connector_secret']}")
    print("=" * 60)
    print()
    return 0


def _cmd_run(args, cfg: Config) -> int:
    state = load_state(cfg.state_file)
    if not state:
        error(f"No state file at {cfg.state_file}. Run 'enroll' first.")
        return 1

    header("ModZero Connector Runtime — Run")
    info(f"connector_id : {state['connector_id'][:16]}...")
    info(f"backend      : {state.get('backend', cfg.backend_url)}")
    info(f"network      : {state.get('network', cfg.network)}")
    info(f"heartbeat    : every {cfg.heartbeat_interval}s")
    if args.proxy:
        bind = cfg.proxy_host or "0.0.0.0"
        info(f"proxy bind   : {bind}:{cfg.proxy_port}")

    client = ControllerClient(
        backend_url=state.get("backend", cfg.backend_url),
        connector_id=state["connector_id"],
        connector_secret=state["connector_secret"],
    )

    hb = HeartbeatLoop(
        client,
        network=state.get("network", cfg.network),
        hostname=state.get("hostname", socket.gethostname()),
        version=__version__,
        interval=cfg.heartbeat_interval,
    )
    hb.start()

    wg: WgLoop | None = None
    if cfg.wg_enabled:
        info(f"WG metadata : enabled (node_name={cfg.wg_node_name})")
        wg = WgLoop(client, node_name=cfg.wg_node_name,
                    interval=cfg.heartbeat_interval)
        wg.start()

    proxy: ProxyServer | None = None
    if args.proxy:
        proxy = ProxyServer(cfg.proxy_host, cfg.proxy_port)
        try:
            proxy.start(client)
        except OSError as exc:
            error(f"Proxy bind failed: {exc}")
            hb.stop()
            if wg is not None:
                wg.stop()
            return 1

    info("Press Ctrl+C to stop.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print()
        warn("Shutting down…")
    finally:
        hb.stop()
        if wg is not None:
            wg.stop()
        if proxy is not None:
            proxy.stop()
        hb.join(timeout=5)
        if wg is not None:
            wg.join(timeout=5)
    return 0


def _cmd_status(args, cfg: Config) -> int:
    state = load_state(cfg.state_file)
    if not state:
        error(f"No state file at {cfg.state_file}.")
        return 1

    header("ModZero Connector Runtime — Status")
    print(f"  state_file       : {cfg.state_file}")
    print(f"  connector_id     : {state['connector_id'][:16]}...")
    print(f"  connector_secret : [REDACTED]")
    print(f"  backend          : {state.get('backend')}")
    print(f"  network          : {state.get('network')}")
    print(f"  hostname         : {state.get('hostname')}")
    print(f"  enrolled_at      : {state.get('enrolled_at')}")
    return 0


def main(argv: list[str] | None = None) -> None:
    parser = _build_parser()
    args = parser.parse_args(argv)
    cfg = Config.load(args.config)

    if args.command == "enroll":
        sys.exit(_cmd_enroll(args, cfg))
    elif args.command == "run":
        sys.exit(_cmd_run(args, cfg))
    elif args.command == "status":
        sys.exit(_cmd_status(args, cfg))
    elif args.command == "wg":
        wg_cmd = getattr(args, "wg_command", None)
        if wg_cmd == "status":
            sys.exit(_cmd_wg_status(args, cfg))
        elif wg_cmd == "instructions":
            sys.exit(_cmd_wg_instructions(args, cfg))
        elif wg_cmd == "detect":
            sys.exit(_cmd_wg_detect(args, cfg))
        else:
            parser.error(f"Unknown wg subcommand: {wg_cmd}")
    else:
        parser.error(f"Unknown command: {args.command}")


if __name__ == "__main__":
    main()
