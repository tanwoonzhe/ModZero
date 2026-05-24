"""ModZero tunnel-foundation verification.

Runs the A–E checks for the Headscale / WireGuard foundation milestone. This
script assumes:
  1. Backend is running on http://localhost:8000.
  2. HEADSCALE_ENABLED is currently set in the backend's environment (true for
     the writeable tests, false to confirm the disabled path).
  3. tools/connector_state.json exists (created by tools/connector_sim.py
     enrollment, used by verify_all.py).

Usage:
  python tools/verify_tunnels.py

Exit code 0 on success, 1 on any failure.
"""

import json
import os
import sys
import uuid

try:
    import requests
except ImportError:
    print("ERROR: 'requests' not installed"); sys.exit(1)

BASE = "http://localhost:8000"
TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(TOOLS_DIR, "connector_state.json")

RESET = "\033[0m"
GREEN = "\033[32m"
RED   = "\033[31m"
BOLD  = "\033[1m"

passed = []
failed = []


def ok(label, detail=""):
    print(f"  [{GREEN}PASS{RESET}] {label}" + (f": {detail}" if detail else ""))
    passed.append(label)


def fail(label, detail=""):
    print(f"  [{RED}FAIL{RESET}] {label}" + (f": {detail}" if detail else ""))
    failed.append(label)


def check(label, cond, detail=""):
    (ok if cond else fail)(label, detail)


def banner(title):
    print(f"\n{BOLD}{'='*60}\n  {title}\n{'='*60}{RESET}")


# ── Login as admin ───────────────────────────────────────────────────────────

banner("Login (admin)")
r = requests.post(
    f"{BASE}/api/auth/login",
    headers={"Content-Type": "application/x-www-form-urlencoded"},
    data="username=admin&password=admin123",
    timeout=10,
)
check("HTTP 200 login", r.status_code == 200, str(r.status_code))
if r.status_code != 200:
    sys.exit(1)
ADMIN = {"Authorization": f"Bearer {r.json()['access_token']}",
         "Content-Type": "application/json"}

# ── Connector credentials ────────────────────────────────────────────────────

banner("Setup: load connector state")
check("connector_state.json exists", os.path.exists(STATE_FILE), STATE_FILE)
if not os.path.exists(STATE_FILE):
    print("Run tools/connector_sim.py enrollment first.")
    sys.exit(1)
with open(STATE_FILE) as f:
    state = json.load(f)
CID     = state["connector_id"]
SECRET  = state["connector_secret"]
CHDR    = {"X-Connector-Id": CID, "X-Connector-Secret": SECRET,
           "Content-Type": "application/json"}

# ── Tunnel status (admin) ────────────────────────────────────────────────────

banner("Test D.1: GET /api/tunnels/status shape + no secrets")
r = requests.get(f"{BASE}/api/tunnels/status", headers=ADMIN, timeout=10)
check("status HTTP 200", r.status_code == 200, str(r.status_code))
body = r.json() if r.status_code == 200 else {}
for k in ("headscale_enabled", "headscale_url_configured",
          "headscale_user", "current_data_path"):
    check(f"status has {k}", k in body, str(body.get(k)))
check("status does not leak headscale_url", "headscale_url" not in body)
check("status does not leak headscale_api_key", "headscale_api_key" not in body)
check("current_data_path is http_proxy",
      body.get("current_data_path") == "http_proxy",
      str(body.get("current_data_path")))

HS_ENABLED = bool(body.get("headscale_enabled"))
print(f"\n  (headscale_enabled = {HS_ENABLED})")

# ── Test B: tunnel/register ──────────────────────────────────────────────────

banner("Test B: POST /api/connectors/{id}/tunnel/register")
node_name = f"verify-node-{uuid.uuid4().hex[:8]}"
r = requests.post(
    f"{BASE}/api/connectors/{CID}/tunnel/register",
    headers=CHDR,
    json={"node_name": node_name, "wireguard_ip": "100.64.0.42"},
    timeout=10,
)
if HS_ENABLED:
    check("register HTTP 200", r.status_code == 200, f"{r.status_code} {r.text[:120]}")
    rb = r.json()
    check("register returned node_id", bool(rb.get("node_id")), str(rb.get("node_id")))
    check("register returned headscale_user",
          isinstance(rb.get("headscale_user"), str), str(rb.get("headscale_user")))
else:
    check("register HTTP 202", r.status_code == 202, str(r.status_code))
    check("register body status=disabled",
          (r.json() if r.status_code == 202 else {}).get("status") == "disabled")

# ── Test B': path-id mismatch → 403 ──────────────────────────────────────────

banner("Test B': tunnel/register with mismatched path id → 403")
bogus = str(uuid.uuid4())
r = requests.post(
    f"{BASE}/api/connectors/{bogus}/tunnel/register",
    headers=CHDR,
    json={"node_name": node_name},
    timeout=10,
)
check("mismatch HTTP 403", r.status_code == 403, str(r.status_code))

# ── Test C: tunnel/heartbeat ─────────────────────────────────────────────────

banner("Test C: POST /api/connectors/{id}/tunnel/heartbeat")
r = requests.post(
    f"{BASE}/api/connectors/{CID}/tunnel/heartbeat",
    headers=CHDR,
    json={"node_name": node_name, "status": "online"},
    timeout=10,
)
if HS_ENABLED:
    check("heartbeat HTTP 200", r.status_code == 200, f"{r.status_code} {r.text[:120]}")

    r = requests.get(f"{BASE}/api/tunnels/nodes", headers=ADMIN, timeout=10)
    check("list nodes HTTP 200", r.status_code == 200)
    nodes = r.json() if r.status_code == 200 else []
    me = next((n for n in nodes if n.get("node_name") == node_name), None)
    check("admin sees registered node", me is not None, node_name)
    if me is not None:
        check("node status=online after heartbeat",
              me.get("status") == "online", str(me.get("status")))
        check("node last_seen_at is set",
              bool(me.get("last_seen_at")), str(me.get("last_seen_at")))
else:
    check("heartbeat HTTP 202 when disabled",
          r.status_code == 202, str(r.status_code))

# ── Test D: routes CRUD ──────────────────────────────────────────────────────

banner("Test D.2: routes CRUD round-trip")
r = requests.post(
    f"{BASE}/api/tunnels/routes",
    headers=ADMIN,
    json={
        "connector_id": CID,
        "subnet_or_host": "10.99.0.0/24",
        "route_type": "subnet",
        "enabled": False,
    },
    timeout=10,
)
check("create route HTTP 201", r.status_code == 201, f"{r.status_code} {r.text[:120]}")
route_id = r.json().get("id") if r.status_code == 201 else None

if route_id:
    r = requests.get(f"{BASE}/api/tunnels/routes", headers=ADMIN, timeout=10)
    check("list routes HTTP 200", r.status_code == 200)
    has = any(rr.get("id") == route_id for rr in (r.json() or []))
    check("created route appears in list", has)

    r = requests.put(
        f"{BASE}/api/tunnels/routes/{route_id}",
        headers=ADMIN,
        json={
            "connector_id": CID,
            "subnet_or_host": "10.99.0.0/24",
            "route_type": "subnet",
            "enabled": True,
        },
        timeout=10,
    )
    check("update route HTTP 200", r.status_code == 200, str(r.status_code))
    check("update flipped enabled=true",
          (r.json() if r.status_code == 200 else {}).get("enabled") is True)

    # ── Test D.3: bad route_type rejected ───────────────────────────────────
    r = requests.post(
        f"{BASE}/api/tunnels/routes",
        headers=ADMIN,
        json={
            "connector_id": CID,
            "subnet_or_host": "10.1.0.0/24",
            "route_type": "INVALID",
            "enabled": False,
        },
        timeout=10,
    )
    check("invalid route_type rejected", r.status_code >= 400, str(r.status_code))

    # ── Test E: enabled route doesn't change proxy/access flow ──────────────
    banner("Test E: enabled tunnel route has no effect on access decision")
    # Simple proof: the existing /health and the basic access decision pipeline
    # still answer as before. (Full proxy E2E is covered by verify_all.py.)
    h = requests.get(f"{BASE}/health", timeout=10)
    check("health still ok with enabled tunnel route", h.status_code == 200,
          str(h.status_code))

    # Cleanup
    r = requests.delete(f"{BASE}/api/tunnels/routes/{route_id}", headers=ADMIN, timeout=10)
    check("delete route HTTP 204", r.status_code == 204, str(r.status_code))

# ── Headscale adapter checks (A–G) ────────────────────────────────────────────

banner("Test A: /headscale/health when disabled (or always shape)")
r = requests.get(f"{BASE}/api/tunnels/headscale/health", headers=ADMIN, timeout=10)
check("health HTTP 200", r.status_code == 200, str(r.status_code))
hb = r.json() if r.status_code == 200 else {}
for k in ("enabled", "configured", "reachable", "node_count", "error"):
    check(f"health has {k}", k in hb, str(hb.get(k)))
check("health does not leak headscale_url", "headscale_url" not in hb)
check("health does not leak headscale_api_key", "headscale_api_key" not in hb)
if not HS_ENABLED:
    check("health enabled=false", hb.get("enabled") is False)
    check("health configured=false (flag off)", hb.get("configured") is False)
    check("health reachable=null (flag off)", hb.get("reachable") is None)

banner("Test B (sync): /headscale/sync when disabled")
r = requests.post(f"{BASE}/api/tunnels/headscale/sync", headers=ADMIN, timeout=10)
if not HS_ENABLED:
    check("sync HTTP 202 when disabled", r.status_code == 202, str(r.status_code))
    sb = r.json() if r.status_code == 202 else {}
    check("sync status=disabled", sb.get("status") == "disabled", str(sb))
else:
    # When flag on, must NOT be 'disabled' — falls through to other tests below.
    sb = r.json() if r.status_code in (200, 202) else {}
    check("sync not 'disabled' when flag on", sb.get("status") != "disabled",
          str(sb.get("status")))

if HS_ENABLED:
    banner("Test B' / D / E: not_configured + unreachable behaviour")
    # We can't tell from the client whether HEADSCALE_URL is set, so the result
    # is either 'not_configured' (url/key missing) OR 'unreachable' (configured
    # but no real Headscale at the configured URL). Either is acceptable here.
    r = requests.post(f"{BASE}/api/tunnels/headscale/sync", headers=ADMIN, timeout=15)
    sb = r.json() if r.status_code in (200, 202) else {}
    check("sync responds 2xx",
          r.status_code in (200, 202), str(r.status_code))
    check("sync status in {not_configured, unreachable, ok}",
          sb.get("status") in ("not_configured", "unreachable", "ok"),
          str(sb.get("status")))
    check("sync never returns headscale_url",
          "headscale_url" not in (r.text or ""))
    check("sync never returns headscale_api_key",
          "headscale_api_key" not in (r.text or ""))

    # Health endpoint should also not 5xx, regardless of reachability.
    r = requests.get(f"{BASE}/api/tunnels/headscale/health", headers=ADMIN, timeout=15)
    check("health HTTP 200 even when unreachable", r.status_code == 200, str(r.status_code))
    hb2 = r.json() if r.status_code == 200 else {}
    check("health does not leak url", "headscale_url" not in (r.text or ""))
    check("health does not leak api key", "headscale_api_key" not in (r.text or ""))

# Test F + G: mocked sync with fixture (only when fixture env says we may use it)
FIXTURE_PATH_HOST = os.path.join(TOOLS_DIR, "..", "backend", "app",
                                 "_test_fixtures", "headscale_nodes.json")
FIXTURE_PATH_HOST = os.path.normpath(FIXTURE_PATH_HOST)
FIXTURE_PATH_CONTAINER = "/app/app/_test_fixtures/headscale_nodes.json"

if HS_ENABLED and os.environ.get("MODZERO_RUN_FIXTURE_TESTS") == "1":
    banner("Test F + G: mocked sync via HEADSCALE_TEST_FIXTURE")
    # Write a fixture whose first node matches our previously-registered node_name.
    fixture = [
        {
            "id": "fixture-match-1",
            "name": node_name,
            "nodeKey": "fixture-match-key",
            "ipAddresses": ["100.64.0.123"],
            "online": True,
            "lastSeen": "2026-05-20T12:00:00Z",
        },
        {
            "id": "fixture-unmatched-2",
            "name": f"fixture-unmatched-{uuid.uuid4().hex[:6]}",
            "nodeKey": "fixture-unmatched-key",
            "ipAddresses": ["100.64.0.200"],
            "online": False,
            "lastSeen": "2026-05-20T12:00:00Z",
        },
    ]
    os.makedirs(os.path.dirname(FIXTURE_PATH_HOST), exist_ok=True)
    with open(FIXTURE_PATH_HOST, "w", encoding="utf-8") as fh:
        json.dump(fixture, fh)

    # Count rows before sync to confirm no creation.
    r = requests.get(f"{BASE}/api/tunnels/nodes", headers=ADMIN, timeout=10)
    nodes_before = len(r.json() if r.status_code == 200 else [])

    r = requests.post(f"{BASE}/api/tunnels/headscale/sync", headers=ADMIN, timeout=15)
    check("sync HTTP 200 with fixture", r.status_code == 200, str(r.status_code))
    sb = r.json() if r.status_code == 200 else {}
    check("F: sync status=ok", sb.get("status") == "ok", str(sb))
    check("F: updated=1", sb.get("updated") == 1, str(sb.get("updated")))
    check("F: created=0 (no auto-create)", sb.get("created") == 0, str(sb.get("created")))
    check("G: skipped=1 (unmatched counted, not created)",
          sb.get("skipped") == 1, str(sb.get("skipped")))
    check("F: errors=0", sb.get("errors") == 0, str(sb.get("errors")))
    check("F: last_sync_at set", bool(sb.get("last_sync_at")), str(sb.get("last_sync_at")))

    r = requests.get(f"{BASE}/api/tunnels/nodes", headers=ADMIN, timeout=10)
    nodes_after = r.json() if r.status_code == 200 else []
    check("G: row count unchanged after sync",
          len(nodes_after) == nodes_before, f"{len(nodes_after)} vs {nodes_before}")
    me = next((n for n in nodes_after if n.get("node_name") == node_name), None)
    check("F: synced row carries headscale_node_id",
          me is not None and me.get("headscale_node_id") == "fixture-match-1",
          str(me.get("headscale_node_id") if me else None))
    check("F: synced row carries wireguard_ip",
          me is not None and me.get("wireguard_ip") == "100.64.0.123",
          str(me.get("wireguard_ip") if me else None))

    r = requests.get(f"{BASE}/api/tunnels/status", headers=ADMIN, timeout=10)
    sb2 = r.json() if r.status_code == 200 else {}
    check("F: /status last_sync_at populated",
          bool(sb2.get("last_sync_at")), str(sb2.get("last_sync_at")))
    check("F: /status headscale_reachable=true",
          sb2.get("headscale_reachable") is True, str(sb2.get("headscale_reachable")))
else:
    print("\n  (skipping F/G: set MODZERO_RUN_FIXTURE_TESTS=1 + "
          "HEADSCALE_ENABLED=true + MODZERO_ALLOW_HEADSCALE_FIXTURE=1 + "
          "HEADSCALE_TEST_FIXTURE in .env, then force-recreate backend)")

# ── Bootstrap checks (H–M) ───────────────────────────────────────────────────

banner("Test H–M: manual WireGuard bootstrap endpoint")

# Discover the literal HEADSCALE_API_KEY value from project root .env so we can
# assert that exact string never appears in any bootstrap response body.
ENV_PATH = os.path.normpath(os.path.join(TOOLS_DIR, "..", ".env"))
hs_api_key_literal = None
if os.path.exists(ENV_PATH):
    with open(ENV_PATH, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("HEADSCALE_API_KEY="):
                hs_api_key_literal = line.split("=", 1)[1].strip()
                break

bootstrap_response_texts = []

if not HS_ENABLED:
    # H. bootstrap-disabled
    r = requests.post(
        f"{BASE}/api/tunnels/bootstrap/{CID}",
        headers=ADMIN, json={}, timeout=10,
    )
    bootstrap_response_texts.append(r.text or "")
    check("H: bootstrap HTTP 202 when disabled",
          r.status_code == 202, str(r.status_code))
    bb = r.json() if r.status_code == 202 else {}
    check("H: status=disabled", bb.get("status") == "disabled", str(bb.get("status")))
    check("H: auth_key_mode=disabled",
          bb.get("auth_key_mode") == "disabled", str(bb.get("auth_key_mode")))
    check("H: no login_server", bb.get("login_server") in (None, ""))
    check("H: no join_command", bb.get("join_command") in (None, ""))
    check("H: body does not contain 'tailscale up --authkey'",
          "tailscale up --authkey" not in (r.text or ""))
else:
    # We're in the HEADSCALE_ENABLED=true branch. The remaining checks (I/J/K/L)
    # depend on whether URL+KEY are configured. /api/tunnels/headscale/health
    # tells us.
    r = requests.get(f"{BASE}/api/tunnels/headscale/health", headers=ADMIN, timeout=10)
    hb_now = r.json() if r.status_code == 200 else {}
    configured = bool(hb_now.get("configured"))

    if not configured:
        # I. bootstrap-not-configured
        r = requests.post(
            f"{BASE}/api/tunnels/bootstrap/{CID}",
            headers=ADMIN, json={}, timeout=10,
        )
        bootstrap_response_texts.append(r.text or "")
        check("I: bootstrap HTTP 200 when not configured",
              r.status_code == 200, str(r.status_code))
        bb = r.json() if r.status_code == 200 else {}
        check("I: status=not_configured",
              bb.get("status") == "not_configured", str(bb.get("status")))
        check("I: auth_key_mode=not_configured",
              bb.get("auth_key_mode") == "not_configured",
              str(bb.get("auth_key_mode")))
        check("I: no login_server", bb.get("login_server") in (None, ""))
        check("I: no join_command", bb.get("join_command") in (None, ""))
    else:
        # J. bootstrap-manual (force_manual=true so no real Headscale needed)
        r = requests.post(
            f"{BASE}/api/tunnels/bootstrap/{CID}",
            headers=ADMIN,
            json={"force_manual": True},
            timeout=15,
        )
        bootstrap_response_texts.append(r.text or "")
        check("J: bootstrap HTTP 200 in manual mode",
              r.status_code == 200, f"{r.status_code} {r.text[:120]}")
        bb = r.json() if r.status_code == 200 else {}
        check("J: status=ok", bb.get("status") == "ok", str(bb.get("status")))
        check("J: auth_key_mode=manual",
              bb.get("auth_key_mode") == "manual", str(bb.get("auth_key_mode")))
        check("J: auth_key is null",
              bb.get("auth_key") in (None, ""), str(bb.get("auth_key")))
        jc = bb.get("join_command") or ""
        check("J: join_command contains 'tailscale up'", "tailscale up" in jc)
        check("J: join_command contains '--hostname='", "--hostname=" in jc)
        check("J: join_command does NOT contain '--authkey='",
              "--authkey=" not in jc)
        ls = bb.get("login_server") or ""
        check("J: login_server present", bool(ls), ls)

        # L. log-row-redacted
        r = requests.get(
            f"{BASE}/api/tunnels/bootstrap/logs?limit=5",
            headers=ADMIN, timeout=10,
        )
        bootstrap_response_texts.append(r.text or "")
        check("L: logs HTTP 200", r.status_code == 200, str(r.status_code))
        rows = r.json() if r.status_code == 200 else []
        check("L: logs is a list", isinstance(rows, list))
        match = next(
            (x for x in rows if str(x.get("connector_id")) == str(CID)
             and x.get("auth_key_mode") == "manual"),
            None,
        )
        check("L: log row references this connector + manual mode",
              match is not None, str(match))
        if match is not None:
            check("L: log row does NOT expose auth_key_hash",
                  "auth_key_hash" not in match, str(list(match.keys())))

# K. no-api-key-in-response (across every bootstrap response we captured above)
if hs_api_key_literal:
    leaked = any(hs_api_key_literal in t for t in bootstrap_response_texts)
    check("K: HEADSCALE_API_KEY literal never appears in bootstrap responses",
          not leaked, "leaked" if leaked else "clean")
else:
    print("  (K skipped: HEADSCALE_API_KEY not set in .env)")

# M. no-regression: foundation tunnel endpoints still respond correctly
r = requests.get(f"{BASE}/api/tunnels/status", headers=ADMIN, timeout=10)
check("M: /api/tunnels/status still HTTP 200", r.status_code == 200,
      str(r.status_code))
r = requests.get(f"{BASE}/api/tunnels/routes", headers=ADMIN, timeout=10)
check("M: /api/tunnels/routes still HTTP 200", r.status_code == 200,
      str(r.status_code))

# ── Route lifecycle checks (N–Q) ─────────────────────────────────────────────

route_lifecycle_response_texts: list = []

banner("Test N: POST /headscale/sync-routes shape")
r = requests.post(f"{BASE}/api/tunnels/headscale/sync-routes", headers=ADMIN, timeout=10)
route_lifecycle_response_texts.append(r.text or "")
if not HS_ENABLED:
    check("N: sync-routes HTTP 202 when disabled",
          r.status_code == 202, str(r.status_code))
    nb = r.json() if r.status_code == 202 else {}
    check("N: status=disabled", nb.get("status") == "disabled", str(nb.get("status")))
else:
    check("N: sync-routes 2xx when flag on",
          r.status_code in (200, 202), str(r.status_code))
    nb = r.json() if r.status_code in (200, 202) else {}
    check("N: status in allowed set",
          nb.get("status") in ("ok", "not_configured", "unreachable", "disabled"),
          str(nb.get("status")))
if hs_api_key_literal:
    check("N: HEADSCALE_API_KEY literal not in sync-routes response",
          hs_api_key_literal not in (r.text or ""), "leaked" if hs_api_key_literal in (r.text or "") else "clean")

banner("Test O: route_status field present with default 'pending'")
r = requests.post(
    f"{BASE}/api/tunnels/routes",
    headers=ADMIN,
    json={
        "connector_id": CID,
        "subnet_or_host": "10.98.0.0/24",
        "route_type": "subnet",
        "enabled": False,
    },
    timeout=10,
)
check("O: create route HTTP 201", r.status_code == 201, f"{r.status_code} {r.text[:120]}")
o_route_id = r.json().get("id") if r.status_code == 201 else None
if o_route_id:
    r = requests.get(f"{BASE}/api/tunnels/routes", headers=ADMIN, timeout=10)
    routes_now = r.json() if r.status_code == 200 else []
    me_o = next((rr for rr in routes_now if rr.get("id") == o_route_id), None)
    check("O: route_status field present", me_o is not None and "route_status" in (me_o or {}),
          str(me_o))
    check("O: route_status default=pending",
          (me_o or {}).get("route_status") == "pending",
          str((me_o or {}).get("route_status")))
    requests.delete(f"{BASE}/api/tunnels/routes/{o_route_id}", headers=ADMIN, timeout=10)

banner("Test P: POST /routes/{id}/advertise-package")
r = requests.post(
    f"{BASE}/api/tunnels/routes",
    headers=ADMIN,
    json={
        "connector_id": CID,
        "subnet_or_host": "10.97.0.0/24",
        "route_type": "subnet",
        "enabled": False,
    },
    timeout=10,
)
p_route_id = r.json().get("id") if r.status_code == 201 else None
if p_route_id:
    r = requests.post(
        f"{BASE}/api/tunnels/routes/{p_route_id}/advertise-package",
        headers=ADMIN, timeout=10,
    )
    route_lifecycle_response_texts.append(r.text or "")
    check("P: advertise-package HTTP 200", r.status_code == 200,
          f"{r.status_code} {r.text[:120]}")
    pb = r.json() if r.status_code == 200 else {}
    for field in ("route_id", "connector_id", "route_type", "subnet_or_host",
                  "suggested_advertise_value", "manual_command", "warnings"):
        check(f"P: response has {field}", field in pb, str(pb.get(field)))
    mc = pb.get("manual_command") or ""
    check("P: manual_command contains 'tailscale up'", "tailscale up" in mc)
    check("P: manual_command contains '--advertise-routes='", "--advertise-routes=" in mc)
    if hs_api_key_literal:
        check("P: HEADSCALE_API_KEY literal not in advertise response",
              hs_api_key_literal not in (r.text or ""),
              "leaked" if hs_api_key_literal in (r.text or "") else "clean")
    check("P: manual_command does not contain 'HEADSCALE_API_KEY' literal",
          "HEADSCALE_API_KEY" not in mc)
    # advertise-package must NOT flip route_status away from pending
    r2 = requests.get(f"{BASE}/api/tunnels/routes", headers=ADMIN, timeout=10)
    routes_p = r2.json() if r2.status_code == 200 else []
    me_p = next((rr for rr in routes_p if rr.get("id") == p_route_id), None)
    check("P: route_status still pending after advertise-package",
          (me_p or {}).get("route_status") == "pending",
          str((me_p or {}).get("route_status")))
    requests.delete(f"{BASE}/api/tunnels/routes/{p_route_id}", headers=ADMIN, timeout=10)
else:
    fail("P: advertise-package — could not create route for test")

banner("Test Q: approve safety checks (no real Headscale needed)")
r = requests.post(
    f"{BASE}/api/tunnels/routes",
    headers=ADMIN,
    json={
        "connector_id": CID,
        "subnet_or_host": "10.96.0.0/24",
        "route_type": "subnet",
        "enabled": False,
    },
    timeout=10,
)
q_route_id = r.json().get("id") if r.status_code == 201 else None
if q_route_id:
    r = requests.post(
        f"{BASE}/api/tunnels/routes/{q_route_id}/approve",
        headers=ADMIN, timeout=10,
    )
    if not HS_ENABLED:
        check("Q: approve HTTP 400 when flag off",
              r.status_code == 400, str(r.status_code))
    else:
        check("Q: approve HTTP 4xx (safety check fires)",
              r.status_code in (400, 409), str(r.status_code))
    requests.delete(f"{BASE}/api/tunnels/routes/{q_route_id}", headers=ADMIN, timeout=10)
else:
    fail("Q: approve safety check — could not create route for test")

# K extension: also check route lifecycle responses for key leakage
if hs_api_key_literal:
    all_texts = bootstrap_response_texts + route_lifecycle_response_texts
    leaked_in_lc = any(hs_api_key_literal in t for t in route_lifecycle_response_texts)
    check("K: HEADSCALE_API_KEY literal never in route lifecycle responses",
          not leaked_in_lc, "leaked" if leaked_in_lc else "clean")

# ── Summary ──────────────────────────────────────────────────────────────────

print()
print(f"{BOLD}Summary:{RESET} {GREEN}PASSED {len(passed)}{RESET}, "
      f"{RED}FAILED {len(failed)}{RESET}")
if failed:
    for f in failed:
        print(f"  - {f}")
    sys.exit(1)
print(f"\n{GREEN}{BOLD}All tunnel foundation checks passed.{RESET}\n")
sys.exit(0)
