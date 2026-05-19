"""End-to-end verification helper: posture HMAC + /gate + /r/<slug>.

Usage (env vars):
    JWT      controller user JWT
    DID      device_id from /api/device-enrollments/enroll
    DSEC     hmac_secret from same response
    RID      resource_id (uuid) of demo-intranet
    GOOD     "1" => all signals true (allow), "0" => all false (deny)
"""
import hashlib
import hmac
import json
import os
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
GOOD = os.environ.get("GOOD", "1") == "1"

SIGNAL_KEYS = [
    "av_present",
    "dev_mode_off",
    "disk_encrypted",
    "firewall_enabled",
    "os_supported",
    "patch_recent",
    "screen_lock_enabled",
]
signals = {k: GOOD for k in SIGNAL_KEYS}

payload = {
    "device_id": DID,
    "nonce": uuid.uuid4().hex,
    "signals": signals,
    "ts": int(time.time()),
}
canonical = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
sig = hmac.new(DSEC.encode(), canonical, hashlib.sha256).hexdigest()

gate_body = json.dumps({
    "resource_id": RID,
    "access_threshold": 60,
    "posture": {**payload, "signature": sig},
}).encode()

req = urllib.request.Request(
    f"{BASE}/api/resource-access/gate",
    data=gate_body,
    headers={"Authorization": f"Bearer {JWT}", "Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=10) as r:
        gate_resp = json.loads(r.read())
except urllib.error.HTTPError as e:
    print("GATE ERROR", e.code, e.read().decode())
    sys.exit(2)

print("GATE_RESPONSE:", json.dumps(gate_resp, indent=2))

if not gate_resp.get("allowed"):
    print("DECISION=DENY (expected for GOOD=0); not following bootstrap_url")
    sys.exit(0)

bootstrap = gate_resp["bootstrap_url"]
print("Following bootstrap:", bootstrap)

cj = []
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor())
import http.cookiejar
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

# bootstrap is absolute (uses public_base_url) or relative
if bootstrap.startswith("/"):
    bootstrap = BASE + bootstrap
# bootstrap returns 302 to resource path; follow manually since response is HTML
with opener.open(bootstrap, timeout=10) as r:
    print("bootstrap status=", r.status)

# Now request the resource
final_url = f"{BASE}/r/demo-intranet"
with opener.open(final_url, timeout=10) as r:
    body = r.read()
    print(f"FINAL status={r.status} bytes={len(body)}")
    print(body[:200].decode(errors="replace"))
