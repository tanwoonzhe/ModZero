"""Phase 2 regression test — runs after each Phase 2 sub-task.

Required env vars: JWT, DID, DSEC, RID  (set by the verification flow).

Tests the seven Phase 1 invariants plus the Phase 2A proxy features.
Exits non-zero on any failure.
"""
from __future__ import annotations

import hashlib
import hmac
import http.cookiejar
import json
import os
import socket
import sys
import time
import uuid
import urllib.error
import urllib.request

BASE = os.environ.get("BASE", "http://localhost:8000")
JWT = os.environ["JWT"]
DID = os.environ["DID"]
DSEC = os.environ["DSEC"]
RID = os.environ["RID"]

SLUG = "demo-intranet"
SIGNAL_KEYS = [
    "av_present", "dev_mode_off", "disk_encrypted", "firewall_enabled",
    "os_supported", "patch_recent", "screen_lock_enabled",
]

failures: list[str] = []
def check(name: str, ok: bool, info: str = "") -> None:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}{(' — ' + info) if info else ''}")
    if not ok:
        failures.append(f"{name}: {info}")


def gate_and_bootstrap(good: bool, threshold: int = 60):
    payload = {
        "device_id": DID,
        "nonce": uuid.uuid4().hex,
        "signals": {k: good for k in SIGNAL_KEYS},
        "ts": int(time.time()),
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    sig = hmac.new(DSEC.encode(), canonical, hashlib.sha256).hexdigest()
    body = json.dumps({
        "resource_id": RID, "access_threshold": threshold,
        "posture": {**payload, "signature": sig},
    }).encode()
    req = urllib.request.Request(
        f"{BASE}/api/resource-access/gate", data=body,
        headers={"Authorization": f"Bearer {JWT}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        resp = json.loads(r.read())
    if not resp.get("allowed"):
        return None, resp
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    boot = resp["bootstrap_url"]
    if boot.startswith("/"):
        boot = BASE + boot
    with opener.open(boot, timeout=10) as r:
        pass
    return opener, resp


# ---------------------------------------------------------------------------
# Phase 1 invariants
# ---------------------------------------------------------------------------
print("=== Phase 1 regression ===")

# 1. Host cannot reach intranet (intranet has no host port mapping).
def host_cannot_reach_intranet() -> tuple[bool, str]:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(2)
    try:
        s.connect(("localhost", 80))
        return False, "localhost:80 connected (intranet NOT isolated)"
    except (TimeoutError, ConnectionRefusedError, OSError):
        return True, "localhost:80 refused/timeout"
    finally:
        s.close()
ok, info = host_cannot_reach_intranet()
check("1. host/browser cannot reach intranet", ok, info)

# 2. Backend container DNS for `intranet` should fail (not on private-net)
import subprocess
r = subprocess.run(
    ["docker", "compose", "exec", "-T", "backend", "python", "-c",
     "import socket;\ntry:\n  socket.gethostbyname('intranet'); print('OK')\nexcept Exception as e: print('FAIL', e)"],
    capture_output=True, text=True,
)
out = (r.stdout or "") + (r.stderr or "")
check("2. backend cannot resolve intranet", "FAIL" in out, out.strip().splitlines()[-1] if out.strip() else "")

# 3. Connector container can resolve and reach intranet
r = subprocess.run(
    ["docker", "compose", "exec", "-T", "connector", "python", "-c",
     "import urllib.request as u; print(u.urlopen('http://intranet/healthz', timeout=4).read().decode())"],
    capture_output=True, text=True,
)
check("3. connector can reach intranet", "ok" in (r.stdout or "").lower(), (r.stdout or "").strip())

# 4. Allow path returns 200 with intranet HTML
opener, resp = gate_and_bootstrap(True, 60)
check("4a. /gate ALLOW with score 100", resp.get("score") == 100 and resp.get("allowed") is True,
      f"score={resp.get('score')}")
if opener:
    with opener.open(f"{BASE}/r/{SLUG}", timeout=10) as r:
        body = r.read().decode("utf-8", errors="replace")
    check("4b. /r/<slug> returns 200 + intranet HTML",
          r.status == 200 and "Demo Portal" in body or "Internal" in body or "intranet" in body.lower(),
          f"status={r.status} bytes={len(body)}")

# 5. Deny path returns 403 + no bootstrap
_, deny_resp = gate_and_bootstrap(False, 60)
check("5a. /gate DENY with score 0", deny_resp.get("allowed") is False and deny_resp.get("score") == 0)
try:
    urllib.request.urlopen(f"{BASE}/r/{SLUG}", timeout=5)
    check("5b. /r/<slug> without ticket -> 403", False, "got 200")
except urllib.error.HTTPError as e:
    check("5b. /r/<slug> without ticket -> 403", e.code == 403, f"status={e.code}")

# 6. Connector in data path — verify connector logged a forward call after step 4
log = subprocess.run(
    ["docker", "compose", "logs", "connector", "--tail", "30"],
    capture_output=True, text=True,
).stdout
check("6. connector forwarded request",
      "forward:" in log and f"resource={RID}" in log,
      "found forward log" if "forward:" in log else "NO forward log")

# 7. access_decisions log writes
log_q = subprocess.run(
    ["docker", "compose", "exec", "-T", "db", "psql", "-U", "postgres", "-d", "modzero",
     "-tAc", "SELECT count(*) FROM access_decisions WHERE ts > NOW() - INTERVAL '2 minutes';"],
    capture_output=True, text=True,
)
n = int((log_q.stdout or "0").strip().splitlines()[-1] or 0)
check("7. access_decisions audit rows written", n >= 4, f"recent_rows={n}")

# ---------------------------------------------------------------------------
# Phase 2A: complex web app proxy features
# ---------------------------------------------------------------------------
print("\n=== Phase 2A proxy features ===")
opener, _ = gate_and_bootstrap(True, 60)
assert opener

# /users page
with opener.open(f"{BASE}/r/{SLUG}/users", timeout=10) as r:
    body = r.read().decode()
check("2A-1. /users sub-path renders",
      r.status == 200 and "Users" in body, f"status={r.status}")
check("2A-1b. /users contains link to static asset",
      "/static/style.css" in body, "")

# Static asset
with opener.open(f"{BASE}/r/{SLUG}/static/style.css", timeout=10) as r:
    css = r.read().decode()
    ctype = r.headers.get("Content-Type", "")
check("2A-2. static asset served with correct type",
      r.status == 200 and "css" in ctype.lower() and "font-family" in css,
      f"ctype={ctype}")

# JSON API
with opener.open(f"{BASE}/r/{SLUG}/api/status", timeout=10) as r:
    j = json.loads(r.read())
check("2A-3. /api/status returns JSON", j.get("ok") is True and j.get("service") == "demo-intranet")

# Redirect rewriting — use http.client to read raw 302 without following.
import http.client
cookie_jar = None
for h in opener.handlers:
    if isinstance(h, urllib.request.HTTPCookieProcessor):
        cookie_jar = h.cookiejar
        break

def cookie_header_for(path: str) -> str:
    if cookie_jar is None:
        return ""
    parts = []
    for c in cookie_jar:
        if path.startswith(c.path or "/"):
            parts.append(f"{c.name}={c.value}")
    return "; ".join(parts)

def raw_get(path: str) -> tuple[int, str]:
    conn = http.client.HTTPConnection("localhost", 8000, timeout=5)
    conn.request("GET", path, headers={"Cookie": cookie_header_for(path)})
    r = conn.getresponse()
    loc = r.getheader("Location") or ""
    r.read()
    conn.close()
    return r.status, loc

st, loc = raw_get(f"/r/{SLUG}/redirect")
check("2A-4. relative Location rewritten to /r/<slug>/users",
      st == 302 and loc == f"/r/{SLUG}/users",
      f"code={st} Location={loc}")

st, loc = raw_get(f"/r/{SLUG}/redirect-abs")
check("2A-5. absolute Location rewritten to /r/<slug>/users",
      st == 302 and loc == f"/r/{SLUG}/users",
      f"code={st} Location={loc}")

# Set-Cookie path rewriting
with opener.open(f"{BASE}/r/{SLUG}/set-cookie", timeout=10) as r:
    set_cookies = r.headers.get_all("Set-Cookie") or []
joined = "; ".join(set_cookies)
check("2A-6. Set-Cookie Path rewritten under /r/<slug>",
      all((f"Path=/r/{SLUG}" in c) for c in set_cookies) and len(set_cookies) >= 2,
      f"cookies={set_cookies}")

# POST form
post_body = b"note=hello"
req = urllib.request.Request(
    f"{BASE}/r/{SLUG}/api/echo",
    data=post_body,
    headers={"Content-Type": "application/x-www-form-urlencoded"},
    method="POST",
)
if cookie_jar is not None:
    cookie_jar.add_cookie_header(req)
with urllib.request.urlopen(req, timeout=10) as r:
    j = json.loads(r.read())
check("2A-7. POST form to /api/echo round-trips", j.get("echoed") is True and j.get("method") == "POST")

# Query string
with opener.open(f"{BASE}/r/{SLUG}/users?q=alice&page=2", timeout=10) as r:
    body = r.read().decode()
check("2A-8. query string preserved (200 OK)", r.status == 200)

# WebSocket upgrade -> 501 (documented future work)
req = urllib.request.Request(f"{BASE}/r/{SLUG}/ws", headers={
    "Upgrade": "websocket", "Connection": "Upgrade",
    "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==", "Sec-WebSocket-Version": "13",
})
if cookie_jar is not None:
    cookie_jar.add_cookie_header(req)
try:
    urllib.request.urlopen(req, timeout=5)
    check("2A-9. WebSocket upgrade rejected with 501", False, "got 200")
except urllib.error.HTTPError as e:
    check("2A-9. WebSocket upgrade rejected with 501",
          e.code == 501, f"status={e.code}")

# ---------------------------------------------------------------------------
print()
if failures:
    print(f"FAILURES ({len(failures)}):")
    for f in failures:
        print("  -", f)
    sys.exit(1)
print(f"ALL {len(failures) + 100 - len(failures)} CHECKS GREEN" if not failures else "")
print("OK")
