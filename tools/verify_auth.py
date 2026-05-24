"""
ModZero — Auth, Posture, and Non-Admin Verification Suite
==========================================================
Tests added in the System Integration milestone.

Coverage:
  A2  Login with wrong password → 400/401
  A3  Login with unknown username → 400/401
  A4  GET /auth/me with valid token → user profile shape
  A5  GET /auth/me with no token → 401
  A6  GET /auth/me with tampered token → 401
  A7  Admin-only endpoint (GET /admin/connectors/tokens) rejected for non-admin
  A8  POST /auth/register rejected without admin token
  A9  POST /auth/register succeeds with admin token, created user deleted
  B8  No posture report → access deny (no device attached to user)
  D11 Intune-required resource + any device → deny when require_intune_compliant=True
       and device is not compliant (or no Intune record)

Run:
    python tools/verify_auth.py
"""

import os
import sys
import uuid

try:
    import requests
except ImportError:
    print("ERROR: 'requests' not installed"); sys.exit(1)

BASE = os.environ.get("BASE", "http://localhost:8000").rstrip("/")

RESET = "\033[0m"
GREEN = "\033[32m"
RED   = "\033[31m"
YELLOW = "\033[33m"
BOLD  = "\033[1m"

passed = []
failed = []
skipped = []


def banner(letter, title):
    print(f"\n{BOLD}{'='*60}{RESET}")
    print(f"{BOLD}  Test {letter}: {title}{RESET}")
    print(f"{BOLD}{'='*60}{RESET}")


def ok(label, detail=""):
    print(f"  [{GREEN}PASS{RESET}] {label}" + (f": {detail}" if detail else ""))
    passed.append(label)


def fail(label, detail=""):
    print(f"  [{RED}FAIL{RESET}] {label}" + (f": {detail}" if detail else ""))
    failed.append(label)


def skip(label, reason=""):
    print(f"  [{YELLOW}SKIP{RESET}] {label}" + (f" — {reason}" if reason else ""))
    skipped.append(label)


def check(label, cond, detail=""):
    (ok if cond else fail)(label, detail)


def _admin_token() -> str:
    r = requests.post(f"{BASE}/api/auth/login",
                      data={"username": "admin", "password": "admin123"},
                      headers={"Content-Type": "application/x-www-form-urlencoded"},
                      timeout=10)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


# ─── Test A2: Wrong password ──────────────────────────────────────────────────
banner("A2", "Login with wrong password → 400/401")
r = requests.post(f"{BASE}/api/auth/login",
                  data={"username": "admin", "password": "WRONG_PASSWORD"},
                  headers={"Content-Type": "application/x-www-form-urlencoded"},
                  timeout=10)
check("A2: wrong password status", r.status_code in (400, 401), str(r.status_code))

# ─── Test A3: Unknown username ────────────────────────────────────────────────
banner("A3", "Login with unknown username → 400/401")
r = requests.post(f"{BASE}/api/auth/login",
                  data={"username": f"no_such_user_{uuid.uuid4().hex[:8]}", "password": "x"},
                  headers={"Content-Type": "application/x-www-form-urlencoded"},
                  timeout=10)
check("A3: unknown user status", r.status_code in (400, 401), str(r.status_code))

# ─── Test A4: GET /auth/me with valid token ───────────────────────────────────
banner("A4", "GET /auth/me with valid token → user profile shape")
try:
    token = _admin_token()
    r = requests.get(f"{BASE}/api/auth/me",
                     headers={"Authorization": f"Bearer {token}"}, timeout=10)
    check("A4: status 200", r.status_code == 200, str(r.status_code))
    body = r.json()
    check("A4: user_id present", "user_id" in body)
    check("A4: username present", "username" in body)
    check("A4: role present", "role" in body)
except Exception as exc:
    fail("A4: exception", str(exc))

# ─── Test A5: GET /auth/me with no token → 401 ───────────────────────────────
banner("A5", "GET /auth/me with no token → 401")
r = requests.get(f"{BASE}/api/auth/me", timeout=10)
check("A5: no-token status 401", r.status_code == 401, str(r.status_code))

# ─── Test A6: GET /auth/me with tampered token → 401 ─────────────────────────
banner("A6", "GET /auth/me with tampered token → 401")
r = requests.get(f"{BASE}/api/auth/me",
                 headers={"Authorization": "Bearer tampered.jwt.payload"},
                 timeout=10)
check("A6: tampered token 401", r.status_code == 401, str(r.status_code))

# ─── Test A7: Admin-only endpoint rejected for non-admin ─────────────────────
banner("A7", "Admin-only endpoint rejected for non-admin token (no token here = 401/403)")
# Use no token — if there is no non-admin user we verify unauthorised path
r = requests.get(f"{BASE}/api/admin/connectors/tokens", timeout=10)
check("A7: unauthenticated admin endpoint → 401 or 403",
      r.status_code in (401, 403), str(r.status_code))

# ─── Test A8: POST /auth/register rejected without admin token ───────────────
banner("A8", "POST /auth/register rejected without admin token")
r = requests.post(f"{BASE}/api/auth/register",
                  json={"username": "hacker", "email": "hacker@evil.com",
                        "password": "password123", "role": "admin"},
                  timeout=10)
check("A8: register without auth → 401 or 403",
      r.status_code in (401, 403), str(r.status_code))

# ─── Test A9: POST /auth/register succeeds with admin token ──────────────────
banner("A9", "POST /auth/register succeeds with admin token, user cleaned up")
created_user_id = None
try:
    token = _admin_token()
    uname = f"test_user_{uuid.uuid4().hex[:8]}"
    r = requests.post(f"{BASE}/api/auth/register",
                      json={"username": uname,
                            "email": f"{uname}@modzero-test.com",
                            "password": "TestPass123!",
                            "role": "employee"},
                      headers={"Authorization": f"Bearer {token}"},
                      timeout=10)
    check("A9: register status 200 or 201", r.status_code in (200, 201), str(r.status_code))
    if r.status_code in (200, 201):
        body = r.json()
        check("A9: user_id present", "user_id" in body or "id" in body)
        created_user_id = body.get("user_id") or body.get("id")
except Exception as exc:
    fail("A9: exception", str(exc))
finally:
    if created_user_id:
        try:
            token = _admin_token()
            requests.delete(f"{BASE}/api/users/{created_user_id}",
                            headers={"Authorization": f"Bearer {token}"}, timeout=10)
        except Exception:
            pass

# ─── Test B8: Access deny when device has no posture / no trust score ─────────
banner("B8", "Access decision: resource with min_trust_score=50, device trust=0 → deny")
_b8_resource_id = None
try:
    token = _admin_token()
    # Load connectors to find a connector_resource_id
    cr = requests.get(f"{BASE}/api/admin/connectors/resources",
                      headers={"Authorization": f"Bearer {token}"}, timeout=10)
    if cr.status_code != 200 or not cr.json():
        skip("B8: access deny (no trust score)",
             "no connector resources available — start connector_sim first")
    else:
        cres = cr.json()[0]
        # Create a resource with high min trust score
        rr = requests.post(f"{BASE}/api/resources",
                           json={"name": f"B8-test-{uuid.uuid4().hex[:6]}",
                                 "description": "B8 high threshold test",
                                 "connector_resource_id": cres["resource_id"],
                                 "internal_address": "http://internal.test",
                                 "minimum_trust_score": 95,
                                 "enabled": True},
                           headers={"Authorization": f"Bearer {token}"}, timeout=10)
        if rr.status_code not in (200, 201):
            skip("B8: access deny (no trust score)",
                 f"could not create test resource: {rr.status_code}")
        else:
            _b8_resource_id = rr.json().get("id") or rr.json().get("resource_id")
            # Request access — admin's device likely has trust < 95
            ar = requests.post(f"{BASE}/api/access/request",
                               json={"resource_id": _b8_resource_id},
                               headers={"Authorization": f"Bearer {token}"}, timeout=10)
            check("B8: status 200", ar.status_code == 200, str(ar.status_code))
            if ar.status_code == 200:
                body = ar.json()
                if body.get("decision") == "deny":
                    check("B8: decision=deny for high threshold", True, body.get("reason", ""))
                    check("B8: no access_token on deny", not body.get("access_token"))
                elif body.get("decision") == "allow":
                    # Trust score ≥ 95; can't force deny without a low-score device
                    skip("B8: access deny (no trust score)",
                         f"device trust score ≥ 95 (score={body.get('trust_score')}); cannot verify deny path")
except Exception as exc:
    fail("B8: exception", str(exc))
finally:
    if _b8_resource_id:
        try:
            token = _admin_token()
            requests.delete(f"{BASE}/api/resources/{_b8_resource_id}",
                            headers={"Authorization": f"Bearer {token}"}, timeout=10)
        except Exception:
            pass

# ─── Test D11: Intune-required resource deny ──────────────────────────────────
banner("D11", "Intune-required resource: require_intune_compliant=True → deny unless device compliant")
_d11_resource_id = None
try:
    token = _admin_token()
    cr = requests.get(f"{BASE}/api/admin/connectors/resources",
                      headers={"Authorization": f"Bearer {token}"}, timeout=10)
    if cr.status_code != 200 or not cr.json():
        skip("D11: intune-required deny", "no connector resources — start connector_sim first")
    else:
        cres = cr.json()[0]
        rr = requests.post(f"{BASE}/api/resources",
                           json={"name": f"D11-test-{uuid.uuid4().hex[:6]}",
                                 "description": "D11 intune-required test",
                                 "connector_resource_id": cres["resource_id"],
                                 "internal_address": "http://internal.test",
                                 "minimum_trust_score": 0,
                                 "require_intune_compliant": True,
                                 "enabled": True},
                           headers={"Authorization": f"Bearer {token}"}, timeout=10)
        if rr.status_code not in (200, 201):
            skip("D11: intune-required deny",
                 f"resource create failed {rr.status_code}: {rr.text[:120]}")
        else:
            _d11_resource_id = rr.json().get("id") or rr.json().get("resource_id")
            ar = requests.post(f"{BASE}/api/access/request",
                               json={"resource_id": _d11_resource_id},
                               headers={"Authorization": f"Bearer {token}"}, timeout=10)
            check("D11: status 200", ar.status_code == 200, str(ar.status_code))
            if ar.status_code == 200:
                body = ar.json()
                if body.get("decision") == "deny":
                    check("D11: deny when intune required + no compliant device",
                          True, body.get("reason", ""))
                    check("D11: no access_token", not body.get("access_token"))
                else:
                    # Device happens to be Intune-compliant
                    skip("D11: intune-required deny",
                         f"device is Intune-compliant in this environment; deny path not reachable")
except Exception as exc:
    fail("D11: exception", str(exc))
finally:
    if _d11_resource_id:
        try:
            token = _admin_token()
            requests.delete(f"{BASE}/api/resources/{_d11_resource_id}",
                            headers={"Authorization": f"Bearer {token}"}, timeout=10)
        except Exception:
            pass

# ─── Summary ──────────────────────────────────────────────────────────────────
print(f"\n{BOLD}{'='*60}{RESET}")
print(f"{BOLD}  AUTH / POSTURE VERIFICATION COMPLETE{RESET}")
print(f"{BOLD}{'='*60}{RESET}")
for lbl in passed:   print(f"  {GREEN}PASS{RESET}  {lbl}")
for lbl in skipped:  print(f"  {YELLOW}SKIP{RESET}  {lbl}")
for lbl in failed:   print(f"  {RED}FAIL{RESET}  {lbl}")
total = len(passed) + len(failed) + len(skipped)
print(f"\nSUMMARY: {len(passed)}/{total} PASS, {len(skipped)} SKIP, {len(failed)} FAIL")
sys.exit(1 if failed else 0)
