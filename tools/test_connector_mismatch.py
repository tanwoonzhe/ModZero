"""Test F: Connector mismatch — connector B cannot introspect a session bound to connector A."""
import json
import os
import sys
import time

try:
    import requests
except ImportError:
    print("ERROR: requests not installed"); sys.exit(1)

BASE = "http://localhost:8000"
TOOLS_DIR = os.path.dirname(__file__)
STATE_FILE_A = os.path.join(TOOLS_DIR, "connector_state.json")

PASS = "\033[32mPASS\033[0m"
FAIL = "\033[31mFAIL\033[0m"
INFO = "\033[36mINFO\033[0m"


def step(n, msg):
    print(f"\n[Step {n}] {msg}")


def check(label, cond, detail=""):
    status = PASS if cond else FAIL
    print(f"  [{status}] {label}" + (f": {detail}" if detail else ""))
    if not cond:
        sys.exit(1)


# ── Step 1: Login ────────────────────────────────────────────────────────────
step(1, "Login as admin")
r = requests.post(f"{BASE}/api/auth/login",
                  headers={"Content-Type": "application/x-www-form-urlencoded"},
                  data="username=admin&password=admin123", timeout=10)
check("HTTP 200", r.status_code == 200, str(r.status_code))
TOKEN = r.json()["access_token"]
H = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
print(f"  [{INFO}] Token obtained (first 20 chars): {TOKEN[:20]}...")

# ── Step 2: Fetch AlphaTechs Intranet resource ID by name ───────────────────
step(2, "Fetch AlphaTechs Intranet resource ID")
r = requests.get(f"{BASE}/api/resources", headers=H, timeout=10)
check("HTTP 200", r.status_code == 200, str(r.status_code))
resources = r.json()
resource = next((x for x in resources if x["name"] == "AlphaTechs Intranet"), None)
check("AlphaTechs Intranet found", resource is not None, str([x["name"] for x in resources]))
RESOURCE_ID = resource["id"]
print(f"  [{INFO}] resource_id = {RESOURCE_ID}")

# ── Step 3: Create enrollment token for connector B ──────────────────────────
step(3, "Create enrollment token for connector B")
r = requests.post(f"{BASE}/api/admin/connectors/tokens", headers=H,
                  json={"network": "alphatechs-net", "expires_minutes": 10}, timeout=10)
check("HTTP 200/201", r.status_code in (200, 201), f"HTTP {r.status_code}: {r.text[:200]}")
ENROLL_TOKEN = r.json()["token"]
print(f"  [{INFO}] Enrollment token: {ENROLL_TOKEN[:20]}...")

# ── Step 4: Enroll connector B ───────────────────────────────────────────────
step(4, "Enroll connector B")
r = requests.post(f"{BASE}/api/connectors/enroll",
                  json={"token": ENROLL_TOKEN, "network": "alphatechs-net",
                        "hostname": "connector-b-host", "deployed_by": "test", "version": "0.1.0-test"},
                  timeout=10)
check("HTTP 200/201", r.status_code in (200, 201), f"HTTP {r.status_code}: {r.text[:200]}")
data_b = r.json()
CONN_B_ID = data_b["connector_id"]
CONN_B_SECRET = data_b["connector_secret"]
print(f"  [{INFO}] connector_id_B     = {CONN_B_ID}")
print(f"  [{INFO}] connector_secret_B = {CONN_B_SECRET[:20]}...")

# ── Step 5: Load connector A state ──────────────────────────────────────────
step(5, "Load connector A state from connector_state.json")
check("connector_state.json exists", os.path.exists(STATE_FILE_A), STATE_FILE_A)
with open(STATE_FILE_A) as f:
    state_a = json.load(f)
CONN_A_ID = state_a["connector_id"]
CONN_A_SECRET = state_a["connector_secret"]
print(f"  [{INFO}] connector_id_A     = {CONN_A_ID}")
HA = {"X-Connector-Id": CONN_A_ID, "X-Connector-Secret": CONN_A_SECRET, "Content-Type": "application/json"}

# ── Step 6: Send connector A heartbeat to bring it ONLINE ───────────────────
step(6, "Send connector A heartbeat (bring ONLINE)")
r = requests.post(f"{BASE}/api/connectors/{CONN_A_ID}/heartbeat",
                  headers=HA,
                  json={"hostname": "connector-a-host", "ip": "127.0.0.1",
                        "version": "0.1.0-sim", "labels": {}, "uptime": 100,
                        "status": "online", "network": "alphatechs-net"},
                  timeout=10)
check("HTTP 200", r.status_code == 200, f"HTTP {r.status_code}: {r.text[:200]}")
print(f"  [{INFO}] Connector A is now ONLINE")

# ── Step 7: Request access (session bound to connector A) ───────────────────
step(7, "Request access → session bound to connector A")
r = requests.post(f"{BASE}/api/access/request", headers=H,
                  json={"resource_id": RESOURCE_ID}, timeout=10)
check("HTTP 200", r.status_code == 200, f"HTTP {r.status_code}: {r.text[:200]}")
result = r.json()
check("decision=allow", result.get("decision") == "allow", str(result.get("decision")))
SESS_ID = result["session_id"]
RAW_TOKEN = result["access_token"]
CONN_BOUND = result.get("connector_id")
ACCESS_URL = result.get("access_url", "")
print(f"  [{INFO}] session_id        = {SESS_ID}")
print(f"  [{INFO}] connector_id_bound= {CONN_BOUND}")
print(f"  [{INFO}] access_url        = {ACCESS_URL}")
check("access_url uses modzero:// scheme", ACCESS_URL.startswith("modzero://"), ACCESS_URL)
check("session bound to connector A", str(CONN_BOUND) == str(CONN_A_ID),
      f"bound={CONN_BOUND} expected={CONN_A_ID}")

# ── Step 8: Introspect with connector B → must get connector_mismatch ────────
step(8, "Introspect with connector B credentials → expect connector_mismatch")
HB = {"X-Connector-Id": CONN_B_ID, "X-Connector-Secret": CONN_B_SECRET, "Content-Type": "application/json"}
r = requests.post(f"{BASE}/api/connectors/access/introspect",
                  headers=HB,
                  json={"session_id": SESS_ID, "access_token": RAW_TOKEN},
                  timeout=10)
check("HTTP 200", r.status_code == 200, f"HTTP {r.status_code}: {r.text[:200]}")
result_b = r.json()
print(f"  [{INFO}] Response: {json.dumps(result_b)}")
check("active=false", result_b.get("active") == False, str(result_b.get("active")))
check("reason=connector_mismatch", result_b.get("reason") == "connector_mismatch", str(result_b.get("reason")))

# ── Step 9: Introspect with connector A → must succeed ──────────────────────
step(9, "Introspect with connector A credentials → expect active=true")
r = requests.post(f"{BASE}/api/connectors/access/introspect",
                  headers=HA,
                  json={"session_id": SESS_ID, "access_token": RAW_TOKEN},
                  timeout=10)
check("HTTP 200", r.status_code == 200, f"HTTP {r.status_code}: {r.text[:200]}")
result_a = r.json()
print(f"  [{INFO}] Response: {json.dumps(result_a)}")
check("active=true", result_a.get("active") == True, str(result_a.get("active")))
check("resource_name set", bool(result_a.get("resource_name")), str(result_a.get("resource_name")))
check("expires_at set", bool(result_a.get("expires_at")), str(result_a.get("expires_at")))

print(f"\n\033[32m=== Test F PASSED: connector_mismatch verified with real connector B ===\033[0m\n")
