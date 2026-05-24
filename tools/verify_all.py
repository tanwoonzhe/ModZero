"""
ModZero Verification Suite
===========================
Covers:
  - access_url format check (must be modzero:// or http://localhost:8000/...)
  - Test C: trust score denial (Finance Portal min_trust_score=101)
  - Session Test A: allow + session fields
  - Session Test B: introspect valid session → active=true
  - Session Test C: revoke session → introspect → session_revoked
  - Session Test D: disable resource → introspect → resource_unavailable
  - Session Test E: wrong token → token_mismatch
  - Session Test F: connector B → connector_mismatch
  - Proxy Test A: access_url uses proxy base URL
  - Proxy Test B: GET access_url → Access Granted page
  - Proxy Test C: revoke → access_url → 403 session_revoked
  - Proxy Test D: disable resource → access_url → 403 resource_unavailable
  - Proxy Test E: wrong token → access_url → 403 token_mismatch
  - Proxy Test F: (manual) stop proxy → connection refused
  - Real Proxy Tests A-F: /access/{id}/proxy/{path} forwarding (Real HTTP)
"""

import json
import os
import sys
from urllib.parse import urlparse as _urlparse, parse_qs as _parse_qs, urlencode as _urlencode, urlunparse as _urlunparse

try:
    import requests
except ImportError:
    print("ERROR: 'requests' not installed"); sys.exit(1)

BASE = "http://localhost:8000"
TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
STATE_FILE_A = os.path.join(TOOLS_DIR, "connector_state.json")

RESET = "\033[0m"
GREEN = "\033[32m"
RED   = "\033[31m"
CYAN  = "\033[36m"
BOLD  = "\033[1m"

passed = []
failed = []


def banner(title):
    print(f"\n{BOLD}{'='*60}{RESET}")
    print(f"{BOLD}  {title}{RESET}")
    print(f"{BOLD}{'='*60}{RESET}")


def step(msg):
    print(f"\n  → {msg}")


def ok(label, detail=""):
    tag = f"{GREEN}PASS{RESET}"
    print(f"    [{tag}] {label}" + (f": {detail}" if detail else ""))
    passed.append(label)


def fail(label, detail=""):
    tag = f"{RED}FAIL{RESET}"
    print(f"    [{tag}] {label}" + (f": {detail}" if detail else ""))
    failed.append(label)
    sys.exit(1)


def check(label, cond, detail=""):
    if cond:
        ok(label, detail)
    else:
        fail(label, detail)


# ── Login ─────────────────────────────────────────────────────────────────────

banner("Login")
step("POST /api/auth/login (form-encoded)")
r = requests.post(f"{BASE}/api/auth/login",
                  headers={"Content-Type": "application/x-www-form-urlencoded"},
                  data="username=admin&password=admin123", timeout=10)
check("HTTP 200", r.status_code == 200, str(r.status_code))
TOKEN = r.json()["access_token"]
H = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
print(f"    Token: {TOKEN[:25]}...")


# ── Load connector A ──────────────────────────────────────────────────────────

banner("Setup: Load connector A state")
check("connector_state.json exists", os.path.exists(STATE_FILE_A), STATE_FILE_A)
with open(STATE_FILE_A) as f:
    state_a = json.load(f)
CONN_A_ID     = state_a["connector_id"]
CONN_A_SECRET = state_a["connector_secret"]
HA = {"X-Connector-Id": CONN_A_ID, "X-Connector-Secret": CONN_A_SECRET,
      "Content-Type": "application/json"}
print(f"    Connector A: {CONN_A_ID}")

step("Send heartbeat to bring connector A ONLINE")
r = requests.post(f"{BASE}/api/connectors/{CONN_A_ID}/heartbeat", headers=HA,
                  json={"hostname": "test-host", "ip": "127.0.0.1", "version": "0.1.0-test",
                        "labels": {}, "uptime": 0, "status": "online",
                        "network": "alphatechs-net"},
                  timeout=10)
check("Heartbeat HTTP 200", r.status_code == 200, str(r.status_code))


# ── Fetch resource IDs ────────────────────────────────────────────────────────

banner("Setup: Fetch resource IDs by name")
r = requests.get(f"{BASE}/api/resources", headers=H, timeout=10)
check("GET /api/resources HTTP 200", r.status_code == 200)
resources = r.json()
names = [x["name"] for x in resources]
print(f"    Resources: {names}")

res_intranet = next((x for x in resources if x["name"] == "AlphaTechs Intranet"), None)
res_finance  = next((x for x in resources if x["name"] == "Finance Portal"), None)
check("AlphaTechs Intranet exists", res_intranet is not None)
check("Finance Portal exists", res_finance is not None)

RESOURCE_INTRANET = res_intranet["id"]
RESOURCE_FINANCE  = res_finance["id"]
MIN_FINANCE = res_finance.get("minimum_trust_score", 0)
print(f"    AlphaTechs Intranet ID  : {RESOURCE_INTRANET}")
print(f"    Finance Portal ID       : {RESOURCE_FINANCE}")
print(f"    Finance Portal min_score: {MIN_FINANCE}")
check("Finance Portal min_trust_score=101", MIN_FINANCE == 101.0,
      f"got {MIN_FINANCE}")


# ── Test C: Trust score denial ────────────────────────────────────────────────

banner("Test C — Trust Score Denial (Finance Portal, min=101)")
step("POST /api/access/request for Finance Portal")
r = requests.post(f"{BASE}/api/access/request", headers=H,
                  json={"resource_id": RESOURCE_FINANCE}, timeout=10)
check("HTTP 200", r.status_code == 200, str(r.status_code))
res = r.json()
print(f"    decision   : {res.get('decision')}")
print(f"    reason     : {res.get('reason')}")
print(f"    trust_score: {res.get('trust_score')}")
check("decision=deny", res.get("decision") == "deny", str(res.get("decision")))
check("reason contains 'Trust score'",
      "Trust score" in (res.get("reason") or ""),
      repr(res.get("reason")))
check("trust_score < 101",
      (res.get("trust_score") or 0) < 101,
      str(res.get("trust_score")))


# ── Session Test A: Allow + session fields ─────────────────────────────────

banner("Session Test A — Allow + session fields (AlphaTechs Intranet)")
step("POST /api/access/request")
r = requests.post(f"{BASE}/api/access/request", headers=H,
                  json={"resource_id": RESOURCE_INTRANET}, timeout=10)
check("HTTP 200", r.status_code == 200, str(r.status_code))
res_a = r.json()
print(f"    decision    : {res_a.get('decision')}")
print(f"    access_url  : {res_a.get('access_url')}")
print(f"    session_id  : {res_a.get('session_id')}")
print(f"    connector_id: {res_a.get('connector_id')}")
print(f"    expires_at  : {res_a.get('expires_at')}")

check("decision=allow", res_a.get("decision") == "allow", str(res_a.get("decision")))
check("session_id present", bool(res_a.get("session_id")))
check("access_token present", bool(res_a.get("access_token")))
check("expires_at present", bool(res_a.get("expires_at")))

# Verify access_url is demo-safe
access_url = res_a.get("access_url", "")
_proxy_base_url = os.getenv("DEMO_CONNECTOR_PROXY_BASE_URL", "")
safe_url = (
    access_url.startswith("modzero://") or
    (access_url.startswith("http://localhost:8000/") and "sessions" in access_url) or
    (_proxy_base_url and access_url.startswith(_proxy_base_url + "/access/"))
)
check("access_url is demo-safe (modzero:// or proxy URL)",
      safe_url, access_url)
check("access_url does NOT contain internal_address",
      "alphatechs.top" not in access_url and "internal" not in access_url.lower(),
      access_url)

SESS_A_ID     = res_a["session_id"]
SESS_A_TOKEN  = res_a["access_token"]
CONN_BOUND_A  = res_a.get("connector_id")
check("session bound to connector A",
      str(CONN_BOUND_A) == str(CONN_A_ID),
      f"bound={CONN_BOUND_A} expected={CONN_A_ID}")


# ── Session Test B: Introspect valid session ───────────────────────────────

banner("Session Test B — Introspect valid session → active=true")
step("POST /api/connectors/access/introspect (connector A)")
r = requests.post(f"{BASE}/api/connectors/access/introspect", headers=HA,
                  json={"session_id": SESS_A_ID, "access_token": SESS_A_TOKEN},
                  timeout=10)
check("HTTP 200", r.status_code == 200, str(r.status_code))
res_b = r.json()
print(f"    active      : {res_b.get('active')}")
print(f"    resource_name: {res_b.get('resource_name')}")
print(f"    target_host : {res_b.get('target_host')}")
print(f"    expires_at  : {res_b.get('expires_at')}")
check("active=true", res_b.get("active") == True, str(res_b.get("active")))
check("resource_name=AlphaTechs Intranet",
      res_b.get("resource_name") == "AlphaTechs Intranet",
      str(res_b.get("resource_name")))
check("expires_at present", bool(res_b.get("expires_at")))


# ── Session Test C: Revoke → introspect → session_revoked ─────────────────

banner("Session Test C — Revoke session → introspect → session_revoked")
step(f"POST /api/access/sessions/{SESS_A_ID}/revoke")
r = requests.post(f"{BASE}/api/access/sessions/{SESS_A_ID}/revoke", headers=H, timeout=10)
check("Revoke HTTP 200", r.status_code == 200, str(r.status_code))
revoke_res = r.json()
print(f"    status: {revoke_res.get('status')}")
check("status=revoked", revoke_res.get("status") == "revoked")

step("Introspect revoked session")
r = requests.post(f"{BASE}/api/connectors/access/introspect", headers=HA,
                  json={"session_id": SESS_A_ID, "access_token": SESS_A_TOKEN},
                  timeout=10)
res_c = r.json()
print(f"    active: {res_c.get('active')}, reason: {res_c.get('reason')}")
check("active=false", res_c.get("active") == False)
check("reason=session_revoked", res_c.get("reason") == "session_revoked",
      str(res_c.get("reason")))


# ── Session Test D: Disable resource → introspect → resource_unavailable ──

banner("Session Test D — Disable resource → introspect → resource_unavailable")
step("Re-send heartbeat so connector A is still ONLINE")
requests.post(f"{BASE}/api/connectors/{CONN_A_ID}/heartbeat", headers=HA,
              json={"hostname": "test-host", "ip": "127.0.0.1", "version": "0.1.0-test",
                    "labels": {}, "uptime": 0, "status": "online", "network": "alphatechs-net"},
              timeout=10)

step("Create new session for AlphaTechs Intranet")
r = requests.post(f"{BASE}/api/access/request", headers=H,
                  json={"resource_id": RESOURCE_INTRANET}, timeout=10)
check("HTTP 200", r.status_code == 200)
res_d_allow = r.json()
check("decision=allow", res_d_allow.get("decision") == "allow",
      str(res_d_allow.get("decision")))
SESS_D_ID    = res_d_allow["session_id"]
SESS_D_TOKEN = res_d_allow["access_token"]
print(f"    session_id: {SESS_D_ID}")

step("Disable AlphaTechs Intranet resource")
r = requests.put(f"{BASE}/api/resources/{RESOURCE_INTRANET}", headers=H,
                  json={
                      "name": res_intranet["name"],
                      "resource_type": res_intranet.get("resource_type", "web"),
                      "minimum_trust_score": res_intranet.get("minimum_trust_score", 0),
                      "require_intune_compliant": res_intranet.get("require_intune_compliant", False),
                      "enabled": False,
                  }, timeout=10)
check("PUT enabled=false HTTP 200", r.status_code == 200, f"{r.status_code}: {r.text[:100]}")

step("Introspect after resource disabled")
r = requests.post(f"{BASE}/api/connectors/access/introspect", headers=HA,
                  json={"session_id": SESS_D_ID, "access_token": SESS_D_TOKEN},
                  timeout=10)
res_d = r.json()
print(f"    active: {res_d.get('active')}, reason: {res_d.get('reason')}")
check("active=false", res_d.get("active") == False)
check("reason=resource_unavailable", res_d.get("reason") == "resource_unavailable",
      str(res_d.get("reason")))

step("Re-enable AlphaTechs Intranet resource")
r = requests.put(f"{BASE}/api/resources/{RESOURCE_INTRANET}", headers=H,
                  json={
                      "name": res_intranet["name"],
                      "resource_type": res_intranet.get("resource_type", "web"),
                      "minimum_trust_score": res_intranet.get("minimum_trust_score", 0),
                      "require_intune_compliant": res_intranet.get("require_intune_compliant", False),
                      "enabled": True,
                  }, timeout=10)
check("PUT enabled=true HTTP 200", r.status_code == 200, f"{r.status_code}: {r.text[:100]}")


# ── Session Test E: Wrong token → token_mismatch ──────────────────────────

banner("Session Test E — Wrong token → token_mismatch")
step("Re-send heartbeat so connector A is still ONLINE")
requests.post(f"{BASE}/api/connectors/{CONN_A_ID}/heartbeat", headers=HA,
              json={"hostname": "test-host", "ip": "127.0.0.1", "version": "0.1.0-test",
                    "labels": {}, "uptime": 0, "status": "online", "network": "alphatechs-net"},
              timeout=10)

step("Create new session for AlphaTechs Intranet")
r = requests.post(f"{BASE}/api/access/request", headers=H,
                  json={"resource_id": RESOURCE_INTRANET}, timeout=10)
check("HTTP 200", r.status_code == 200)
res_e_allow = r.json()
check("decision=allow", res_e_allow.get("decision") == "allow")
SESS_E_ID = res_e_allow["session_id"]

step("Introspect with wrong access_token")
r = requests.post(f"{BASE}/api/connectors/access/introspect", headers=HA,
                  json={"session_id": SESS_E_ID, "access_token": "WRONG_TOKEN_abcdef123456"},
                  timeout=10)
res_e = r.json()
print(f"    active: {res_e.get('active')}, reason: {res_e.get('reason')}")
check("active=false", res_e.get("active") == False)
check("reason=token_mismatch", res_e.get("reason") == "token_mismatch",
      str(res_e.get("reason")))


# ── Session Test F: Connector mismatch ────────────────────────────────────

banner("Session Test F — Connector mismatch (connector B vs session bound to A)")

step("Create enrollment token for connector B")
r = requests.post(f"{BASE}/api/admin/connectors/tokens", headers=H,
                  json={"network": "alphatechs-net", "expires_minutes": 10}, timeout=10)
check("Token HTTP 200/201", r.status_code in (200, 201),
      f"{r.status_code}: {r.text[:100]}")
ENROLL_TOKEN = r.json()["token"]

step("Enroll connector B")
r = requests.post(f"{BASE}/api/connectors/enroll",
                  json={"token": ENROLL_TOKEN, "network": "alphatechs-net",
                        "hostname": "connector-b-verify", "deployed_by": "test",
                        "version": "0.1.0-test"},
                  timeout=10)
check("Enroll HTTP 201", r.status_code == 201,
      f"{r.status_code}: {r.text[:100]}")
CONN_B_ID     = r.json()["connector_id"]
CONN_B_SECRET = r.json()["connector_secret"]
HB = {"X-Connector-Id": CONN_B_ID, "X-Connector-Secret": CONN_B_SECRET,
      "Content-Type": "application/json"}
print(f"    Connector B ID: {CONN_B_ID}")

step("Re-send heartbeat so connector A is still ONLINE")
requests.post(f"{BASE}/api/connectors/{CONN_A_ID}/heartbeat", headers=HA,
              json={"hostname": "test-host", "ip": "127.0.0.1", "version": "0.1.0-test",
                    "labels": {}, "uptime": 0, "status": "online", "network": "alphatechs-net"},
              timeout=10)

step("Create session bound to connector A")
r = requests.post(f"{BASE}/api/access/request", headers=H,
                  json={"resource_id": RESOURCE_INTRANET}, timeout=10)
check("HTTP 200", r.status_code == 200)
res_f_allow = r.json()
check("decision=allow", res_f_allow.get("decision") == "allow")
SESS_F_ID    = res_f_allow["session_id"]
SESS_F_TOKEN = res_f_allow["access_token"]
CONN_BOUND_F = res_f_allow.get("connector_id")
check("session bound to connector A",
      str(CONN_BOUND_F) == str(CONN_A_ID),
      f"bound={CONN_BOUND_F}")

step("Introspect with connector B credentials → expect connector_mismatch")
r = requests.post(f"{BASE}/api/connectors/access/introspect", headers=HB,
                  json={"session_id": SESS_F_ID, "access_token": SESS_F_TOKEN},
                  timeout=10)
res_f = r.json()
print(f"    active: {res_f.get('active')}, reason: {res_f.get('reason')}")
check("active=false", res_f.get("active") == False)
check("reason=connector_mismatch", res_f.get("reason") == "connector_mismatch",
      str(res_f.get("reason")))

step("Confirm connector A can still introspect the same session → active=true")
r = requests.post(f"{BASE}/api/connectors/access/introspect", headers=HA,
                  json={"session_id": SESS_F_ID, "access_token": SESS_F_TOKEN},
                  timeout=10)
res_fa = r.json()
print(f"    active: {res_fa.get('active')}, resource: {res_fa.get('resource_name')}")
check("Connector A: active=true", res_fa.get("active") == True)
check("Connector A: resource_name=AlphaTechs Intranet",
      res_fa.get("resource_name") == "AlphaTechs Intranet")


# ── Proxy Tests A–F ───────────────────────────────────────────────────────────
# These tests require connector_sim.py --proxy to be running.
# They are skipped cleanly if the proxy is not reachable.

PROXY_BASE = os.getenv("DEMO_CONNECTOR_PROXY_BASE_URL", "http://localhost:18080").rstrip("/")

banner(f"Proxy Tests — {PROXY_BASE}")
step(f"Check if proxy server is reachable at {PROXY_BASE}")
try:
    _pr = requests.get(PROXY_BASE, timeout=2)
    PROXY_RUNNING = True
    print(f"    Proxy reachable (HTTP {_pr.status_code})")
except Exception as _e:
    PROXY_RUNNING = False
    print(f"    [{BOLD}SKIP{RESET}] Proxy not reachable: {_e}")
    print(f"    [{BOLD}SKIP{RESET}] Start 'python tools/connector_sim.py --resume --proxy' to run proxy tests.")

if PROXY_RUNNING:
    # ── Proxy Test A: access_url uses proxy base ──────────────────────────────
    banner("Proxy Test A — access_url uses proxy base URL")

    step("Re-send heartbeat so connector A is ONLINE")
    requests.post(f"{BASE}/api/connectors/{CONN_A_ID}/heartbeat", headers=HA,
                  json={"hostname": "test-host", "ip": "127.0.0.1", "version": "0.1.0-test",
                        "labels": {}, "uptime": 0, "status": "online", "network": "alphatechs-net"},
                  timeout=10)

    step("POST /api/access/request → check access_url format")
    r = requests.post(f"{BASE}/api/access/request", headers=H,
                      json={"resource_id": RESOURCE_INTRANET}, timeout=10)
    check("HTTP 200", r.status_code == 200)
    res_pa = r.json()
    check("decision=allow", res_pa.get("decision") == "allow")
    PROXY_ACCESS_URL = res_pa.get("access_url", "")
    PROXY_SESS_TOKEN = res_pa.get("access_token", "")
    PROXY_SESS_ID    = res_pa.get("session_id", "")
    print(f"    access_url: {PROXY_ACCESS_URL[:60]}...")
    check("access_url starts with proxy base",
          PROXY_ACCESS_URL.startswith(PROXY_BASE),
          PROXY_ACCESS_URL)
    check("access_url contains /access/",
          "/access/" in PROXY_ACCESS_URL)
    check("access_url contains ?token= param",
          "?token=" in PROXY_ACCESS_URL)

    # ── Proxy Test B: GET access_url → Access Granted page ───────────────────
    banner("Proxy Test B — GET access_url → Access Granted page")
    step("GET access_url (active session)")
    r = requests.get(PROXY_ACCESS_URL, timeout=10)
    check("HTTP 200", r.status_code == 200, str(r.status_code))
    check("body contains 'Access Granted'",
          "Access Granted" in r.text, r.text[:100])
    check("body contains resource_name",
          "AlphaTechs Intranet" in r.text)

    # ── Proxy Test C: Revoke → access_url returns 403 session_revoked ────────
    banner("Proxy Test C — Revoke session → access_url returns 403 session_revoked")
    step(f"Revoke session {PROXY_SESS_ID[:8]}...")
    r = requests.post(f"{BASE}/api/access/sessions/{PROXY_SESS_ID}/revoke",
                      headers=H, timeout=10)
    check("Revoke HTTP 200", r.status_code == 200)

    step("GET access_url after revoke")
    r = requests.get(PROXY_ACCESS_URL, timeout=10)
    check("HTTP 403", r.status_code == 403, str(r.status_code))
    check("body contains session_revoked",
          "session_revoked" in r.text, r.text[:100])

    # ── Proxy Test D: Disable resource → access_url returns 403 ──────────────
    banner("Proxy Test D — Disable resource → access_url returns 403 resource_unavailable")

    step("Re-send heartbeat so connector A is ONLINE")
    requests.post(f"{BASE}/api/connectors/{CONN_A_ID}/heartbeat", headers=HA,
                  json={"hostname": "test-host", "ip": "127.0.0.1", "version": "0.1.0-test",
                        "labels": {}, "uptime": 0, "status": "online", "network": "alphatechs-net"},
                  timeout=10)

    step("Create new session")
    r = requests.post(f"{BASE}/api/access/request", headers=H,
                      json={"resource_id": RESOURCE_INTRANET}, timeout=10)
    check("HTTP 200", r.status_code == 200)
    res_pd = r.json()
    check("decision=allow", res_pd.get("decision") == "allow")
    PROXY_URL_D = res_pd.get("access_url", "")

    step("Disable AlphaTechs Intranet")
    r = requests.put(f"{BASE}/api/resources/{RESOURCE_INTRANET}", headers=H,
                     json={"name": res_intranet["name"],
                           "resource_type": res_intranet.get("resource_type", "web"),
                           "minimum_trust_score": res_intranet.get("minimum_trust_score", 0),
                           "require_intune_compliant": res_intranet.get("require_intune_compliant", False),
                           "enabled": False}, timeout=10)
    check("PUT enabled=false HTTP 200", r.status_code == 200)

    step("GET access_url after resource disabled")
    r = requests.get(PROXY_URL_D, timeout=10)
    check("HTTP 403", r.status_code == 403, str(r.status_code))
    check("body contains resource_unavailable",
          "resource_unavailable" in r.text, r.text[:100])

    step("Re-enable AlphaTechs Intranet")
    r = requests.put(f"{BASE}/api/resources/{RESOURCE_INTRANET}", headers=H,
                     json={"name": res_intranet["name"],
                           "resource_type": res_intranet.get("resource_type", "web"),
                           "minimum_trust_score": res_intranet.get("minimum_trust_score", 0),
                           "require_intune_compliant": res_intranet.get("require_intune_compliant", False),
                           "enabled": True}, timeout=10)
    check("PUT enabled=true HTTP 200", r.status_code == 200)

    # ── Proxy Test E: Wrong token → 403 token_mismatch ────────────────────────
    banner("Proxy Test E — Wrong token → 403 token_mismatch")

    step("Re-send heartbeat so connector A is ONLINE")
    requests.post(f"{BASE}/api/connectors/{CONN_A_ID}/heartbeat", headers=HA,
                  json={"hostname": "test-host", "ip": "127.0.0.1", "version": "0.1.0-test",
                        "labels": {}, "uptime": 0, "status": "online", "network": "alphatechs-net"},
                  timeout=10)

    step("Create new session")
    r = requests.post(f"{BASE}/api/access/request", headers=H,
                      json={"resource_id": RESOURCE_INTRANET}, timeout=10)
    check("HTTP 200", r.status_code == 200)
    res_pe = r.json()
    check("decision=allow", res_pe.get("decision") == "allow")
    PROXY_SESS_E_ID = res_pe.get("session_id", "")

    # Build URL by replacing the real token with a wrong value
    _pe_url = res_pe.get("access_url", f"{PROXY_BASE}/access/{PROXY_SESS_E_ID}?token=placeholder")
    _pe_parsed = _urlparse(_pe_url)
    _pe_qs = {k: v[0] for k, v in _parse_qs(_pe_parsed.query).items()}
    _pe_qs["token"] = "WRONG_TOKEN_xyz"
    WRONG_URL = _urlunparse(_pe_parsed._replace(query=_urlencode(_pe_qs)))
    step("GET access_url with wrong token")
    r = requests.get(WRONG_URL, timeout=10)
    check("HTTP 403", r.status_code == 403, str(r.status_code))
    check("body contains token_mismatch",
          "token_mismatch" in r.text, r.text[:100])

    # ── Proxy Test F: note ────────────────────────────────────────────────────
    banner("Proxy Test F — Stop proxy → connection refused (manual)")
    print(f"    [{BOLD}NOTE{RESET}] Test F is manual: stop connector_sim.py (Ctrl+C),")
    print(f"    then open {PROXY_BASE}/access/... in browser → connection refused.")


# ── Real HTTP Proxy Tests A–F ─────────────────────────────────────────────────
# These verify the /access/{session_id}/proxy/{path} route added in the
# Real HTTP Connector Proxy Demo milestone. They run only when the proxy
# is reachable (same PROXY_RUNNING gate as the Proxy Tests above).

def _replace_token(url: str, new_token: str) -> str:
    p = _urlparse(url)
    qs = {k: v[0] for k, v in _parse_qs(p.query).items()}
    qs["token"] = new_token
    return _urlunparse(p._replace(query=_urlencode(qs)))


def _proxy_url(access_url: str) -> str:
    """Convert /access/{id}?token=... to /access/{id}/proxy/?token=..."""
    p = _urlparse(access_url)
    new_path = p.path.rstrip("/") + "/proxy/"
    return _urlunparse(p._replace(path=new_path))


if PROXY_RUNNING:
    # ── Real Proxy Test A: status page advertises proxy link ─────────────────
    banner("Real Proxy Test A — status page contains 'Open proxied resource' link")

    step("Re-send heartbeat so connector A is ONLINE")
    requests.post(f"{BASE}/api/connectors/{CONN_A_ID}/heartbeat", headers=HA,
                  json={"hostname": "test-host", "ip": "127.0.0.1", "version": "0.1.0-test",
                        "labels": {}, "uptime": 0, "status": "online", "network": "alphatechs-net"},
                  timeout=10)

    step("Create session for AlphaTechs Intranet")
    r = requests.post(f"{BASE}/api/access/request", headers=H,
                      json={"resource_id": RESOURCE_INTRANET}, timeout=10)
    check("HTTP 200", r.status_code == 200)
    res_ra = r.json()
    RP_URL_A    = res_ra.get("access_url", "")
    RP_SESS_A   = res_ra.get("session_id", "")
    RP_TOKEN_A  = res_ra.get("access_token", "")

    step("GET access_url → page contains proxy link")
    r = requests.get(RP_URL_A, timeout=10)
    check("HTTP 200", r.status_code == 200, str(r.status_code))
    check("body contains 'Access Granted'", "Access Granted" in r.text)
    check("body contains 'Open proxied resource'",
          "Open proxied resource" in r.text, r.text[:200])

    # ── Real Proxy Test B: /proxy/ executes forward ──────────────────────────
    banner("Real Proxy Test B — /proxy/ executes forward (lenient)")
    step("GET /access/{id}/proxy/?token=...")
    RP_FWD_B = _proxy_url(RP_URL_A)
    r = requests.get(RP_FWD_B, timeout=15)
    print(f"    upstream status: {r.status_code}")
    check("proxy executed (not status page)",
          "Access Granted" not in r.text, r.text[:120])
    check("forwarding attempt (2xx/3xx OR 502/504)",
          r.status_code < 400 or r.status_code in (502, 504),
          str(r.status_code))

    # ── Real Proxy Test C: revoked → 403 session_revoked ─────────────────────
    banner("Real Proxy Test C — Revoke session → /proxy/ returns 403 session_revoked")
    step(f"Revoke session {RP_SESS_A[:8]}...")
    r = requests.post(f"{BASE}/api/access/sessions/{RP_SESS_A}/revoke",
                      headers=H, timeout=10)
    check("Revoke HTTP 200", r.status_code == 200)

    step("GET /access/{id}/proxy/ after revoke")
    r = requests.get(_proxy_url(RP_URL_A), timeout=10)
    check("HTTP 403", r.status_code == 403, str(r.status_code))
    check("body contains session_revoked",
          "session_revoked" in r.text, r.text[:120])

    # ── Real Proxy Test D: wrong token → 403 token_mismatch ──────────────────
    banner("Real Proxy Test D — Wrong token → /proxy/ returns 403 token_mismatch")
    step("Re-send heartbeat so connector A is ONLINE")
    requests.post(f"{BASE}/api/connectors/{CONN_A_ID}/heartbeat", headers=HA,
                  json={"hostname": "test-host", "ip": "127.0.0.1", "version": "0.1.0-test",
                        "labels": {}, "uptime": 0, "status": "online", "network": "alphatechs-net"},
                  timeout=10)
    step("Create new session")
    r = requests.post(f"{BASE}/api/access/request", headers=H,
                      json={"resource_id": RESOURCE_INTRANET}, timeout=10)
    check("HTTP 200", r.status_code == 200)
    res_rd = r.json()
    check("decision=allow", res_rd.get("decision") == "allow")
    RP_URL_D = res_rd.get("access_url", "")

    step("GET /access/{id}/proxy/?token=WRONG")
    wrong_fwd = _replace_token(_proxy_url(RP_URL_D), "WRONG_TOKEN_xyz")
    r = requests.get(wrong_fwd, timeout=10)
    check("HTTP 403", r.status_code == 403, str(r.status_code))
    check("body contains token_mismatch",
          "token_mismatch" in r.text, r.text[:120])

    # ── Real Proxy Test E: disabled resource → 403 resource_unavailable ──────
    banner("Real Proxy Test E — Disabled resource → /proxy/ returns 403 resource_unavailable")
    step("Re-send heartbeat so connector A is ONLINE")
    requests.post(f"{BASE}/api/connectors/{CONN_A_ID}/heartbeat", headers=HA,
                  json={"hostname": "test-host", "ip": "127.0.0.1", "version": "0.1.0-test",
                        "labels": {}, "uptime": 0, "status": "online", "network": "alphatechs-net"},
                  timeout=10)
    step("Create new session")
    r = requests.post(f"{BASE}/api/access/request", headers=H,
                      json={"resource_id": RESOURCE_INTRANET}, timeout=10)
    check("HTTP 200", r.status_code == 200)
    res_re = r.json()
    check("decision=allow", res_re.get("decision") == "allow")
    RP_URL_E = res_re.get("access_url", "")

    step("Disable AlphaTechs Intranet")
    r = requests.put(f"{BASE}/api/resources/{RESOURCE_INTRANET}", headers=H,
                     json={"name": res_intranet["name"],
                           "resource_type": res_intranet.get("resource_type", "web"),
                           "minimum_trust_score": res_intranet.get("minimum_trust_score", 0),
                           "require_intune_compliant": res_intranet.get("require_intune_compliant", False),
                           "enabled": False}, timeout=10)
    check("PUT enabled=false HTTP 200", r.status_code == 200)

    step("GET /access/{id}/proxy/ after disable")
    r = requests.get(_proxy_url(RP_URL_E), timeout=10)
    check("HTTP 403", r.status_code == 403, str(r.status_code))
    check("body contains resource_unavailable",
          "resource_unavailable" in r.text, r.text[:120])

    step("Re-enable AlphaTechs Intranet")
    r = requests.put(f"{BASE}/api/resources/{RESOURCE_INTRANET}", headers=H,
                     json={"name": res_intranet["name"],
                           "resource_type": res_intranet.get("resource_type", "web"),
                           "minimum_trust_score": res_intranet.get("minimum_trust_score", 0),
                           "require_intune_compliant": res_intranet.get("require_intune_compliant", False),
                           "enabled": True}, timeout=10)
    check("PUT enabled=true HTTP 200", r.status_code == 200)

    # ── Real Proxy Test F: no host injection ─────────────────────────────────
    banner("Real Proxy Test F — Host injection ignored, upstream from introspect only")
    step("Re-send heartbeat so connector A is ONLINE")
    requests.post(f"{BASE}/api/connectors/{CONN_A_ID}/heartbeat", headers=HA,
                  json={"hostname": "test-host", "ip": "127.0.0.1", "version": "0.1.0-test",
                        "labels": {}, "uptime": 0, "status": "online", "network": "alphatechs-net"},
                  timeout=10)
    step("Create new session")
    r = requests.post(f"{BASE}/api/access/request", headers=H,
                      json={"resource_id": RESOURCE_INTRANET}, timeout=10)
    check("HTTP 200", r.status_code == 200)
    res_rf = r.json()
    check("decision=allow", res_rf.get("decision") == "allow")
    RP_URL_F = res_rf.get("access_url", "")

    step("GET /proxy/ with malicious Host + X-Forwarded-Host headers")
    r = requests.get(
        _proxy_url(RP_URL_F),
        headers={"Host": "evil.example.com",
                 "X-Forwarded-Host": "evil.example.com"},
        timeout=15,
    )
    print(f"    upstream status: {r.status_code}")
    # Either real upstream reply (2xx/3xx) OR our 502/504 — never a successful
    # response served from evil.example.com.
    check("status indicates target was used (2xx/3xx) or our 502/504",
          r.status_code < 400 or r.status_code in (502, 504),
          str(r.status_code))
    check("response does not include evil host marker",
          "evil.example.com" not in r.text.lower(),
          r.text[:120])


# ── Final summary ─────────────────────────────────────────────────────────────

print(f"\n{BOLD}{'='*60}{RESET}")
print(f"{BOLD}  VERIFICATION COMPLETE{RESET}")
print(f"{BOLD}{'='*60}{RESET}")
print(f"\n  {GREEN}PASSED{RESET}: {len(passed)}")
print(f"  {RED}FAILED{RESET}: {len(failed)}")
if failed:
    print(f"\n  Failed checks:")
    for f_ in failed:
        print(f"    - {f_}")
else:
    print(f"\n  {GREEN}All checks passed.{RESET}")
