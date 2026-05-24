"""
ModZero Connector Simulator
============================
Demo tool: enrolls a connector, sends periodic heartbeats, and optionally runs
a local HTTP proxy that validates access sessions via the backend introspect API.

Usage:
  python connector_sim.py --token <ENROLL_TOKEN> [options]

Options:
  --backend      Backend base URL  (default: http://localhost:8000)
  --token        Enrollment token  (required unless --resume is set)
  --name         Connector name    (default: sim-connector)
  --network      Network label     (default: default)
  --interval     Heartbeat seconds (default: 10)
  --resume       Resume using saved state from connector_state.json
  --enroll-only  Enroll and print credentials, then exit (no heartbeat loop)
  --proxy        Run local HTTP proxy server alongside heartbeat loop
  --proxy-port   Proxy listen port (default: 18080)

The first run saves connector_id + connector_secret to connector_state.json.
--enroll-only saves to connector_state_<name>.json to avoid overwriting existing state.
Subsequent runs can use --resume to skip enrollment.

DEMO ONLY — no WireGuard, Headscale, DNS routing, packet forwarding, or real
reverse proxying. The proxy validates access sessions and returns a status page.
"""

import argparse
import html as html_mod
import json
import os
import platform
import socket
import sys
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, parse_qsl, quote, urlencode, urlparse

try:
    import requests
except ImportError:
    print("[ERROR] 'requests' is not installed. Run: pip install requests")
    sys.exit(1)

STATE_FILE = os.path.join(os.path.dirname(__file__), "connector_state.json")
VERSION = "0.1.0-sim"

# ── Proxy forwarding constants ──────────────────────────────────────────────

HOP_BY_HOP = {
    "connection", "keep-alive", "transfer-encoding", "upgrade",
    "proxy-authenticate", "proxy-authorization", "te", "trailers",
}
SENSITIVE_UPSTREAM_HEADERS = {
    "cookie", "authorization", "proxy-authorization", "x-modzero-access-token",
}
MAX_RESPONSE_BYTES = 2 * 1024 * 1024  # 2MB upstream response cap
MAX_REQUEST_BODY   = 1 * 1024 * 1024  # 1MB request body cap (POST)
UPSTREAM_TIMEOUT   = 8

# ── Terminal colours (no extra deps) ────────────────────────────────────────

RESET  = "\033[0m"
GREEN  = "\033[32m"
YELLOW = "\033[33m"
RED    = "\033[31m"
CYAN   = "\033[36m"
BOLD   = "\033[1m"
DIM    = "\033[2m"

def _ts() -> str:
    return datetime.now().strftime("%H:%M:%S")

def _p(msg: str) -> None:
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode("ascii", "replace").decode("ascii"))

def info(msg: str)    -> None: _p(f"[{_ts()}] {msg}")
def ok(msg: str)      -> None: _p(f"[{_ts()}] {GREEN}OK{RESET}  {msg}")
def warn(msg: str)    -> None: _p(f"[{_ts()}] {YELLOW}WN{RESET}  {msg}")
def error(msg: str)   -> None: _p(f"[{_ts()}] {RED}ERR{RESET} {msg}")
def header(msg: str)  -> None: _p(f"\n{BOLD}=== {msg} ==={RESET}\n")


# ── Helpers ──────────────────────────────────────────────────────────────────

def load_state() -> dict:
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            return json.load(f)
    return {}


def save_state(state: dict) -> None:
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)
    info(f"State saved → {STATE_FILE}")


# ── Enroll ───────────────────────────────────────────────────────────────────

def enroll(backend: str, token: str, name: str, network: str, state_file: str = STATE_FILE) -> dict:
    header("ModZero Connector Simulator — Enrollment")
    url = f"{backend}/api/connectors/enroll"
    hostname = socket.gethostname()
    payload = {
        "token": token,
        "network": network,
        "hostname": hostname,
        "deployed_by": "simulator",
        "version": VERSION,
    }
    info(f"Enrolling at {url}")
    info(f"  hostname  : {hostname}")
    info(f"  network   : {network}")
    info(f"  name hint : {name}")

    try:
        r = requests.post(url, json=payload, timeout=10)
    except requests.exceptions.ConnectionError:
        error(f"Cannot reach backend at {backend}")
        sys.exit(1)

    if r.status_code == 201:
        data = r.json()
        ok(f"Enrolled!  connector_id = {data['connector_id'][:16]}...")
        state = {
            "connector_id":     data["connector_id"],
            "connector_secret": data["connector_secret"],
            "backend":          backend,
            "network":          network,
            "hostname":         hostname,
            "enrolled_at":      datetime.now(timezone.utc).isoformat(),
        }
        with open(state_file, "w") as f:
            json.dump(state, f, indent=2)
        info(f"State saved → {state_file}")
        return state
    elif r.status_code == 401:
        error("Enrollment failed — token is invalid, expired, or already used.")
        sys.exit(1)
    else:
        error(f"Enrollment failed — HTTP {r.status_code}: {r.text[:200]}")
        sys.exit(1)


# ── Proxy server ─────────────────────────────────────────────────────────────

# Shared state for the proxy handler thread (populated in start_proxy_server).
_proxy_state: dict = {}


def _granted_page(result: dict, session_id: str, token: str) -> str:
    e = html_mod.escape
    resource   = e(result.get("resource_name") or "—")
    host       = e(result.get("target_host") or "—")
    port       = e(str(result.get("target_port") or "—"))
    protocol   = e(result.get("protocol") or "—")
    expires    = e(str(result.get("expires_at") or "—"))
    user       = e(str(result.get("user_id") or "—"))
    proxy_href = f"/access/{quote(session_id, safe='')}/proxy/?token={quote(token, safe='')}"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ModZero — Access Granted</title>
  <style>
    body{{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;display:flex;
          align-items:center;justify-content:center;min-height:100vh}}
    .card{{background:#1e293b;border:2px solid #22c55e;border-radius:12px;padding:2rem 2.5rem;
           max-width:520px;width:100%}}
    h1{{color:#22c55e;margin-top:0;font-size:1.6rem}}
    table{{width:100%;border-collapse:collapse;margin-top:1rem}}
    td{{padding:.4rem .6rem;font-size:.9rem}}
    td:first-child{{color:#94a3b8;width:40%}}
    td:last-child{{font-weight:600}}
    .note{{margin-top:1.5rem;font-size:.75rem;color:#64748b;text-align:center}}
    .btn{{display:inline-block;margin-top:1.25rem;padding:.6rem 1.2rem;background:#22c55e;
          color:#0f172a;font-weight:600;text-decoration:none;border-radius:6px}}
    .btn:hover{{background:#16a34a;color:#fff}}
    .btn-wrap{{text-align:center}}
  </style>
</head>
<body>
  <div class="card">
    <h1>&#x2713; Access Granted</h1>
    <table>
      <tr><td>Resource</td><td>{resource}</td></tr>
      <tr><td>Target Host</td><td>{host}</td></tr>
      <tr><td>Target Port</td><td>{port}</td></tr>
      <tr><td>Protocol</td><td>{protocol}</td></tr>
      <tr><td>Expires At</td><td>{expires}</td></tr>
      <tr><td>User ID</td><td>{user}</td></tr>
    </table>
    <div class="btn-wrap"><a class="btn" href="{proxy_href}">Open proxied resource</a></div>
    <p class="note">ModZero demo proxy &mdash; session validated via backend introspect</p>
  </div>
</body>
</html>"""


def _denied_page(reason: str) -> str:
    e = html_mod.escape
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ModZero — Access Denied</title>
  <style>
    body{{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;display:flex;
          align-items:center;justify-content:center;min-height:100vh}}
    .card{{background:#1e293b;border:2px solid #ef4444;border-radius:12px;padding:2rem 2.5rem;
           max-width:420px;width:100%;text-align:center}}
    h1{{color:#ef4444;margin-top:0}}
    .reason{{background:#0f172a;border-radius:6px;padding:.6rem 1rem;
             font-family:monospace;font-size:1rem;color:#fca5a5;display:inline-block;margin:.5rem 0}}
  </style>
</head>
<body>
  <div class="card">
    <h1>&#x2717; Access Denied</h1>
    <div class="reason">{e(reason)}</div>
    <p style="color:#94a3b8;font-size:.85rem;margin-top:1rem">
      ModZero demo proxy &mdash; session invalid or expired
    </p>
  </div>
</body>
</html>"""


def _filter_hop_by_hop(headers) -> dict:
    return {k: v for k, v in headers.items() if k.lower() not in HOP_BY_HOP}


def _strip_token_from_qs(qs: str) -> str:
    pairs = parse_qsl(qs, keep_blank_values=True)
    return urlencode([(k, v) for k, v in pairs if k != "token"])


def _introspect(backend: str, connector_id: str, secret: str,
                session_id: str, token: str) -> dict | None:
    """Call backend introspect. Returns parsed JSON, or None on transport error."""
    try:
        r = requests.post(
            f"{backend}/api/connectors/access/introspect",
            headers={
                "X-Connector-Id":     connector_id,
                "X-Connector-Secret": secret,
                "Content-Type":       "application/json",
            },
            json={"session_id": session_id, "access_token": token},
            timeout=8,
        )
        return r.json()
    except Exception:
        return None


class _ProxyHandler(BaseHTTPRequestHandler):
    # ── Method dispatch ─────────────────────────────────────────────────────
    def do_GET(self):  self._dispatch()      # noqa: N802
    def do_HEAD(self): self._dispatch()      # noqa: N802
    def do_POST(self): self._dispatch()      # noqa: N802

    def _dispatch(self):
        parsed = urlparse(self.path)
        parts  = [p for p in parsed.path.strip("/").split("/") if p]

        if len(parts) < 2 or parts[0] != "access":
            self._html(404, _denied_page("route_not_found"))
            return

        session_id = parts[1]

        # Token from ?token=... or X-ModZero-Access-Token header. Never logged.
        qs    = parse_qs(parsed.query)
        token = (qs.get("token") or [None])[0] or self.headers.get("X-ModZero-Access-Token")
        if not token:
            self._html(400, _denied_page("missing_access_token"))
            return

        # /access/{session_id} → status page (GET only)
        if len(parts) == 2:
            if self.command != "GET":
                self._html(405, _denied_page("method_not_allowed"))
                return
            self._handle_status_page(session_id, token)
            return

        # /access/{session_id}/proxy[/path...] → forward
        if parts[2] == "proxy" and self.command in ("GET", "HEAD", "POST"):
            forward_path = "/" + "/".join(parts[3:])
            self._handle_forward(session_id, token, forward_path, parsed.query)
            return

        self._html(404, _denied_page("route_not_found"))

    # ── Status page ─────────────────────────────────────────────────────────
    def _handle_status_page(self, session_id: str, token: str):
        backend      = _proxy_state.get("backend", "http://localhost:8000")
        connector_id = _proxy_state["connector_id"]
        secret       = _proxy_state["connector_secret"]

        result = _introspect(backend, connector_id, secret, session_id, token)
        if result is None:
            self._html(502, _denied_page("backend_unreachable"))
            return
        if not result.get("active"):
            self._html(403, _denied_page(result.get("reason", "unknown")))
            return
        self._html(200, _granted_page(result, session_id, token))

    # ── Forward (real HTTP proxy) ───────────────────────────────────────────
    def _handle_forward(self, session_id: str, token: str,
                        forward_path: str, query_string: str):
        backend      = _proxy_state.get("backend", "http://localhost:8000")
        connector_id = _proxy_state["connector_id"]
        secret       = _proxy_state["connector_secret"]

        # 1. Introspect — never trust local state
        result = _introspect(backend, connector_id, secret, session_id, token)
        if result is None:
            self._html(502, _denied_page("backend_unreachable"))
            return
        if not result.get("active"):
            self._html(403, _denied_page(result.get("reason", "unknown")))
            return

        # 2. Validate target fields from introspect ONLY
        target_host = result.get("target_host")
        target_port = result.get("target_port")
        protocol    = (result.get("protocol") or "http").lower()
        if not target_host or not target_port or protocol not in ("http", "https"):
            self._html(502, _denied_page("invalid_target"))
            return

        # 3. Build upstream URL from introspect (strip token qs)
        upstream_qs = _strip_token_from_qs(query_string)
        target_url  = f"{protocol}://{target_host}:{target_port}{forward_path}"
        if upstream_qs:
            target_url += f"?{upstream_qs}"

        # 4. Filter outgoing headers
        upstream_headers = _filter_hop_by_hop(self.headers)
        upstream_headers.pop("Host", None)
        for h in list(upstream_headers):
            if h.lower() in SENSITIVE_UPSTREAM_HEADERS:
                upstream_headers.pop(h, None)

        # 5. Read request body for POST
        body: bytes | None = None
        if self.command == "POST":
            try:
                clen = int(self.headers.get("Content-Length") or "0")
            except ValueError:
                self._html(400, _denied_page("invalid_content_length"))
                return
            if clen > MAX_REQUEST_BODY:
                self._html(413, _denied_page("request_too_large"))
                return
            body = self.rfile.read(clen) if clen > 0 else b""

        # 6. Forward
        try:
            r = requests.request(
                method=self.command,
                url=target_url,
                headers=upstream_headers,
                data=body,
                timeout=UPSTREAM_TIMEOUT,
                stream=True,
                allow_redirects=False,
            )
        except requests.exceptions.Timeout:
            self._html(504, _denied_page("upstream_timeout"))
            return
        except requests.exceptions.ConnectionError:
            self._html(502, _denied_page("upstream_unreachable"))
            return
        except Exception:
            self._html(502, _denied_page("upstream_error"))
            return

        # 7. Read body up to MAX_RESPONSE_BYTES
        chunks: list[bytes] = []
        total = 0
        try:
            for chunk in r.iter_content(chunk_size=64 * 1024):
                if not chunk:
                    continue
                total += len(chunk)
                if total > MAX_RESPONSE_BYTES:
                    r.close()
                    self._html(502, _denied_page("upstream_too_large"))
                    return
                chunks.append(chunk)
        except Exception:
            self._html(502, _denied_page("upstream_error"))
            return
        body_bytes = b"".join(chunks)

        # 8. Mirror response
        self.send_response(r.status_code)
        for k, v in r.headers.items():
            kl = k.lower()
            if kl in HOP_BY_HOP:                              continue
            if kl in ("content-length", "content-encoding"): continue
            if kl == "location":                              continue
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body_bytes)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body_bytes)

    # ── HTML helper ─────────────────────────────────────────────────────────
    def _html(self, code: int, body: str) -> None:
        content = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Pragma", "no-cache")
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, fmt, *args):  # noqa: N802
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        path_display = parsed.path + ("?token=[REDACTED]" if "token" in qs else "")
        status = args[1] if len(args) > 1 else "?"
        info(f"[proxy] {self.command} {path_display} → {status}")


def start_proxy_server(port: int, state: dict) -> HTTPServer:
    global _proxy_state
    _proxy_state = state
    server = HTTPServer(("", port), _ProxyHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    ok("Proxy server →")
    info(f"   status page : http://localhost:{port}/access/{{session_id}}?token={{token}}")
    info(f"   forwarding  : http://localhost:{port}/access/{{session_id}}/proxy/{{path}}?token={{token}}")
    info("Session token appears in URL query string — demo use only.")
    return server


# ── Heartbeat loop ───────────────────────────────────────────────────────────

def heartbeat_loop(state: dict, interval: int) -> None:
    backend        = state["backend"]
    connector_id   = state["connector_id"]
    connector_secret = state["connector_secret"]
    network        = state["network"]
    hostname       = state.get("hostname", socket.gethostname())

    url     = f"{backend}/api/connectors/{connector_id}/heartbeat"
    headers = {
        "X-Connector-Id":     connector_id,
        "X-Connector-Secret": connector_secret,
        "Content-Type":       "application/json",
    }

    start_time = time.time()

    header("Heartbeat Loop")
    info(f"connector_id : {connector_id[:16]}...")
    info(f"backend      : {backend}")
    info(f"interval     : {interval}s")
    info("Press Ctrl+C to stop.\n")

    beat = 0
    while True:
        beat += 1
        uptime   = int(time.time() - start_time)
        platform_str = f"{platform.system()} {platform.release()}"
        payload  = {
            "hostname": hostname,
            "ip":       _local_ip(),
            "version":  VERSION,
            "labels":   {
                "deployed_by": "simulator",
                "platform":    platform_str,
                "beat":        str(beat),
            },
            "uptime":  uptime,
            "status":  "online",
            "network": network,
        }
        try:
            r = requests.post(url, json=payload, headers=headers, timeout=8)
            if r.status_code == 200:
                ok(f"Heartbeat #{beat}  uptime={_fmt_uptime(uptime)}  status=online")
            else:
                warn(f"Heartbeat #{beat} returned HTTP {r.status_code}: {r.text[:100]}")
        except requests.exceptions.ConnectionError:
            error(f"Heartbeat #{beat} failed — cannot reach backend")
        except requests.exceptions.Timeout:
            warn(f"Heartbeat #{beat} timed out")
        except Exception as exc:
            error(f"Heartbeat #{beat} error: {exc}")

        try:
            time.sleep(interval)
        except KeyboardInterrupt:
            break

    print()
    warn("Simulator stopped. The connector will appear offline after ~60 seconds.")


def _local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


def _fmt_uptime(seconds: int) -> str:
    if seconds < 60:   return f"{seconds}s"
    if seconds < 3600: return f"{seconds//60}m {seconds%60}s"
    return f"{seconds//3600}h {(seconds%3600)//60}m"


# ── Entry point ──────────────────────────────────────────────────────────────

def main() -> None:
    p = argparse.ArgumentParser(
        description="ModZero connector simulator — enroll + heartbeat + optional proxy demo"
    )
    p.add_argument("--backend",    default="http://localhost:8000",
                   help="Backend base URL (default: http://localhost:8000)")
    p.add_argument("--token",      default=None,
                   help="One-time enrollment token (required for first run)")
    p.add_argument("--name",       default="sim-connector",
                   help="Connector name hint (default: sim-connector)")
    p.add_argument("--network",    default="default",
                   help="Network label (default: default)")
    p.add_argument("--interval",   type=int, default=10,
                   help="Heartbeat interval in seconds (default: 10)")
    p.add_argument("--resume",     action="store_true",
                   help="Resume using saved state (skip enrollment)")
    p.add_argument("--enroll-only", action="store_true",
                   help="Enroll and print credentials, then exit without heartbeat loop")
    p.add_argument("--proxy",      action="store_true",
                   help="Run local demo proxy server alongside heartbeat loop")
    p.add_argument("--proxy-port", type=int, default=18080,
                   help="Proxy listen port (default: 18080)")
    args = p.parse_args()

    if args.resume:
        state = load_state()
        if not state:
            error(f"No saved state found at {STATE_FILE}. Run without --resume first.")
            sys.exit(1)
        info(f"Resuming connector {state['connector_id'][:16]}...")
    else:
        if not args.token:
            error("--token is required. Generate one from the admin dashboard → Connectors → Deploy Connector.")
            p.print_help()
            sys.exit(1)
        # Use name-specific state file for --enroll-only to avoid overwriting main state
        enroll_only = args.enroll_only
        safe_name = args.name.replace(" ", "_").replace("/", "_")
        state_file = (
            os.path.join(os.path.dirname(__file__), f"connector_state_{safe_name}.json")
            if enroll_only else STATE_FILE
        )
        state = enroll(args.backend, args.token, args.name, args.network, state_file)
        if enroll_only:
            print()
            print(f"connector_id     = {state['connector_id']}")
            print(f"connector_secret = {state['connector_secret']}")
            print(f"state saved to   = {state_file}")
            print()
            sys.exit(0)

    if args.proxy:
        start_proxy_server(args.proxy_port, state)

    try:
        heartbeat_loop(state, args.interval)
    except KeyboardInterrupt:
        pass
    print("\nDone.")


if __name__ == "__main__":
    main()
