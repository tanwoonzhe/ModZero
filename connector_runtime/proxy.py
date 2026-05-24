"""ModZero connector HTTP proxy: introspect-per-request + forwarding.

Routes:
  GET  /access/{session_id}                       → Access Granted status page
  GET/HEAD/POST /access/{session_id}/proxy/{path} → forward to introspect-derived target

Safety:
  - Every /proxy/ request calls /api/connectors/access/introspect first
  - Upstream URL built ONLY from introspect result
  - Sensitive client headers stripped: Cookie, Authorization, Proxy-Authorization, X-ModZero-Access-Token
  - Hop-by-hop headers stripped both directions
  - Upstream Location header dropped (no internal-target leakage)
  - 8s upstream timeout, 2MB response cap, 1MB request body cap
  - Token never logged
"""

import html as html_mod
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, parse_qsl, quote, urlencode, urlparse

import requests

from .client import ControllerClient
from .logging_utils import info, ok

HOP_BY_HOP = {
    "connection", "keep-alive", "transfer-encoding", "upgrade",
    "proxy-authenticate", "proxy-authorization", "te", "trailers",
}
SENSITIVE_UPSTREAM_HEADERS = {
    "cookie", "authorization", "proxy-authorization", "x-modzero-access-token",
}
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
MAX_REQUEST_BODY   = 1 * 1024 * 1024
UPSTREAM_TIMEOUT   = 8

_handler_state: dict = {}


def _filter_hop_by_hop(headers) -> dict:
    return {k: v for k, v in headers.items() if k.lower() not in HOP_BY_HOP}


def _strip_token_from_qs(qs: str) -> str:
    pairs = parse_qsl(qs, keep_blank_values=True)
    return urlencode([(k, v) for k, v in pairs if k != "token"])


def _granted_page(result: dict, session_id: str, token: str) -> str:
    e = html_mod.escape
    resource = e(result.get("resource_name") or "—")
    host     = e(result.get("target_host") or "—")
    port     = e(str(result.get("target_port") or "—"))
    protocol = e(result.get("protocol") or "—")
    expires  = e(str(result.get("expires_at") or "—"))
    user     = e(str(result.get("user_id") or "—"))
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
    <p class="note">ModZero connector runtime &mdash; session validated via backend introspect</p>
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
      ModZero connector runtime &mdash; session invalid or expired
    </p>
  </div>
</body>
</html>"""


class _ProxyHandler(BaseHTTPRequestHandler):
    def do_GET(self):  self._dispatch()      # noqa: N802
    def do_HEAD(self): self._dispatch()      # noqa: N802
    def do_POST(self): self._dispatch()      # noqa: N802

    # ── Routing ──────────────────────────────────────────────────────────
    def _dispatch(self):
        parsed = urlparse(self.path)
        parts  = [p for p in parsed.path.strip("/").split("/") if p]

        if len(parts) < 2 or parts[0] != "access":
            self._html(404, _denied_page("route_not_found"))
            return

        session_id = parts[1]
        qs = parse_qs(parsed.query)
        token = (qs.get("token") or [None])[0] or self.headers.get("X-ModZero-Access-Token")
        if not token:
            self._html(400, _denied_page("missing_access_token"))
            return

        if len(parts) == 2:
            if self.command != "GET":
                self._html(405, _denied_page("method_not_allowed"))
                return
            self._handle_status_page(session_id, token)
            return

        if parts[2] == "proxy" and self.command in ("GET", "HEAD", "POST"):
            forward_path = "/" + "/".join(parts[3:])
            self._handle_forward(session_id, token, forward_path, parsed.query)
            return

        self._html(404, _denied_page("route_not_found"))

    # ── Status page ──────────────────────────────────────────────────────
    def _handle_status_page(self, session_id: str, token: str):
        client: ControllerClient = _handler_state["client"]
        result = client.introspect(session_id, token)
        if result is None:
            self._html(502, _denied_page("backend_unreachable"))
            return
        if not result.get("active"):
            self._html(403, _denied_page(result.get("reason", "unknown")))
            return
        self._html(200, _granted_page(result, session_id, token))

    # ── Forward ──────────────────────────────────────────────────────────
    def _handle_forward(self, session_id: str, token: str,
                        forward_path: str, query_string: str):
        client: ControllerClient = _handler_state["client"]

        # 1. Introspect
        result = client.introspect(session_id, token)
        if result is None:
            self._html(502, _denied_page("backend_unreachable"))
            return
        if not result.get("active"):
            self._html(403, _denied_page(result.get("reason", "unknown")))
            return

        # 2. Validate target
        target_host = result.get("target_host")
        target_port = result.get("target_port")
        protocol    = (result.get("protocol") or "http").lower()
        if not target_host or not target_port or protocol not in ("http", "https"):
            self._html(502, _denied_page("invalid_target"))
            return

        # 3. Build upstream URL from introspect ONLY (strip our token)
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

        # 5. Request body (POST)
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

        # 8. Mirror response (strip hop-by-hop, Location, content-length/encoding)
        self.send_response(r.status_code)
        for k, v in r.headers.items():
            kl = k.lower()
            if kl in HOP_BY_HOP:                               continue
            if kl in ("content-length", "content-encoding"):   continue
            if kl == "location":                               continue
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body_bytes)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body_bytes)

    # ── HTML helper ──────────────────────────────────────────────────────
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


class ProxyServer:
    """Threaded HTTP proxy. Call start(client) then stop()."""

    def __init__(self, host: str, port: int):
        self.host = host
        self.port = port
        self._httpd: HTTPServer | None = None
        self._thread: threading.Thread | None = None

    def start(self, client: ControllerClient) -> None:
        _handler_state["client"] = client
        self._httpd = HTTPServer((self.host, self.port), _ProxyHandler)
        self._thread = threading.Thread(
            target=self._httpd.serve_forever, daemon=True,
            name="modzero-proxy",
        )
        self._thread.start()
        bind = self.host or "0.0.0.0"
        ok(f"Proxy server →")
        info(f"   status page : http://{bind}:{self.port}/access/{{session_id}}?token={{token}}")
        info(f"   forwarding  : http://{bind}:{self.port}/access/{{session_id}}/proxy/{{path}}?token={{token}}")
        info("Session token appears in URL query string — demo use only.")

    def stop(self) -> None:
        if self._httpd is not None:
            self._httpd.shutdown()
            self._httpd.server_close()
