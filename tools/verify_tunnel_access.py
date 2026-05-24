"""ModZero tunnel-aware access decision verification (Tests A–P).

Covers the milestone described in Part 1–5 of the Tunnel Access Integration plan:
  - Tunnel-aware AccessDecisionOut fields
  - ProtectedResource policy fields (preferred_access_mode, require_tunnel,
    allow_http_fallback) and their validation
  - User device enrollment / join package (POST /api/tunnels/user-enrollment)
  - Tunnel audit log (GET /api/tunnels/audit)

Assumptions
-----------
  1. Backend is running on BACKEND_URL (default http://localhost:8000).
  2. Admin login admin/admin123 works (same as verify_all.py / verify_tunnels.py).
  3. tools/connector_state.json may be present — required only for tests that
     need an online connector + an existing seed resource (D–H, L). Otherwise
     those tests SKIP cleanly.

Env vars consumed
-----------------
  BACKEND_URL              base URL (default: http://localhost:8000)
  HEADSCALE_FLAG_ENABLED   optional override hint; if absent we auto-detect
                           by calling the user-enrollment endpoint.
  HEADSCALE_API_KEY        if set, K asserts this literal never leaks into
                           the enrollment response body.

Usage
-----
  python tools/verify_tunnel_access.py

Exit 0 when no test FAILs; exit 1 otherwise.
"""

from __future__ import annotations

import json
import os
import sys
import uuid
from typing import Any, Dict, List, Optional

try:
    import requests
except ImportError:
    print("ERROR: 'requests' not installed"); sys.exit(1)

BACKEND = os.environ.get("BACKEND_URL", "http://localhost:8000").rstrip("/")
TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(TOOLS_DIR, "connector_state.json")
ENV_FILE = os.path.normpath(os.path.join(TOOLS_DIR, "..", ".env"))

TEST_SENTINEL = "modzero_test_secret_never_leak"

RESET = "\033[0m"
GREEN = "\033[32m"
RED   = "\033[31m"
YELL  = "\033[33m"
BOLD  = "\033[1m"

# Per-test status: letter -> "PASS"|"FAIL"|"SKIP"
results: Dict[str, str] = {}

TEST_ORDER = list("ABCDEFGHIJKLMNOP")


def banner(letter: str, title: str) -> None:
    print(f"\n{BOLD}{'='*60}\n  Test {letter}: {title}\n{'='*60}{RESET}")


def passed(letter: str, detail: str = "") -> None:
    results[letter] = "PASS"
    print(f"  [{GREEN}PASS{RESET}] {letter}" + (f": {detail}" if detail else ""))


def failed(letter: str, detail: str = "") -> None:
    results[letter] = "FAIL"
    print(f"  [{RED}FAIL{RESET}] {letter}" + (f": {detail}" if detail else ""))


def skipped(letter: str, detail: str = "") -> None:
    results[letter] = "SKIP"
    print(f"  [{YELL}SKIP{RESET}] {letter}" + (f": {detail}" if detail else ""))


# ── Bootstrap helpers (mirrors verify_tunnels.py style) ──────────────────────

def _admin_token() -> str:
    r = requests.post(
        f"{BACKEND}/api/auth/login",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data="username=admin&password=admin123",
        timeout=10,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def _user_token() -> str:
    """Best-effort non-admin token.

    The current backend exposes no user-creation endpoint, so we return an
    empty string when no non-admin user is available. Callers must treat
    an empty token as "no non-admin token; SKIP". For Test N we additionally
    accept "no Authorization header" as an admin-only enforcement check.
    """
    return ""


def _read_env_value(key: str) -> Optional[str]:
    v = os.environ.get(key)
    if v:
        return v
    if not os.path.exists(ENV_FILE):
        return None
    try:
        with open(ENV_FILE, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if line.startswith(f"{key}="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        return None
    return None


# ── Resource helpers ─────────────────────────────────────────────────────────

CREATED_RESOURCES: List[str] = []


def _make_resource_payload(name_suffix: str, **overrides: Any) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "name": f"verify-tunnel-access-{name_suffix}-{uuid.uuid4().hex[:6]}",
        "resource_type": "web",
        "minimum_trust_score": 0.0,
        "require_intune_compliant": False,
        "enabled": True,
    }
    payload.update(overrides)
    return payload


def _create_resource(headers: Dict[str, str], payload: Dict[str, Any]) -> requests.Response:
    return requests.post(f"{BACKEND}/api/resources", headers=headers, json=payload, timeout=10)


def _delete_resource(headers: Dict[str, str], resource_id: str) -> None:
    try:
        requests.delete(f"{BACKEND}/api/resources/{resource_id}", headers=headers, timeout=10)
    except Exception:
        pass


def _cleanup(headers: Dict[str, str]) -> None:
    for rid in CREATED_RESOURCES:
        _delete_resource(headers, rid)


# ── Connector state for D–H ──────────────────────────────────────────────────

def _load_connector_state() -> Optional[Dict[str, str]]:
    if not os.path.exists(STATE_FILE):
        return None
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except Exception:
        return None


def _heartbeat(state: Dict[str, str]) -> bool:
    try:
        r = requests.post(
            f"{BACKEND}/api/connectors/{state['connector_id']}/heartbeat",
            headers={
                "X-Connector-Id": state["connector_id"],
                "X-Connector-Secret": state["connector_secret"],
                "Content-Type": "application/json",
            },
            json={"hostname": "verify-tunnel-access", "ip": "127.0.0.1",
                  "version": "0.1.0-test", "labels": {}, "uptime": 0,
                  "status": "online", "network": "alphatechs-net"},
            timeout=10,
        )
        return r.status_code == 200
    except Exception:
        return False


def _find_requestable_resource(headers: Dict[str, str]) -> Optional[Dict[str, Any]]:
    r = requests.get(f"{BACKEND}/api/resources", headers=headers, timeout=10)
    if r.status_code != 200:
        return None
    for res in r.json():
        if res.get("enabled") and res.get("connector_resource_id") \
                and (res.get("minimum_trust_score") or 0) <= 50:
            return res
    return None


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> int:
    print(f"{BOLD}Tunnel-aware access decision verification{RESET}")
    print(f"  Backend: {BACKEND}")

    try:
        token = _admin_token()
    except Exception as e:
        print(f"{RED}FATAL: cannot obtain admin token: {e}{RESET}")
        return 1
    H = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Detect flag state via the user-enrollment endpoint.
    hint = os.environ.get("HEADSCALE_FLAG_ENABLED", "").lower()
    flag_on: Optional[bool] = None
    if hint in ("1", "true", "yes", "on"):
        flag_on = True
    elif hint in ("0", "false", "no", "off"):
        flag_on = False
    enroll_probe = None
    try:
        enroll_probe = requests.post(
            f"{BACKEND}/api/tunnels/user-enrollment", headers=H,
            json={}, timeout=10,
        )
        if flag_on is None:
            body = enroll_probe.json() if enroll_probe.content else {}
            st = body.get("status")
            # disabled => flag off; manual_required/not_configured => flag on
            if st == "disabled":
                flag_on = False
            elif st in ("manual_required", "not_configured"):
                flag_on = True
    except Exception as e:
        print(f"  (could not probe /api/tunnels/user-enrollment: {e})")
    if flag_on is None:
        flag_on = False
    print(f"  HEADSCALE_FLAG_ENABLED detected: {flag_on}")

    hs_api_key = _read_env_value("HEADSCALE_API_KEY")

    state = _load_connector_state()
    has_connector = bool(state)
    if has_connector:
        _heartbeat(state)  # warm up
    seed_resource = _find_requestable_resource(H) if has_connector else None

    # ── A: defaults ──────────────────────────────────────────────────────────
    banner("A", "Resource policy defaults (no tunnel fields supplied)")
    payload = _make_resource_payload("defaults")
    r = _create_resource(H, payload)
    if r.status_code != 201:
        failed("A", f"create HTTP {r.status_code}: {r.text[:120]}")
    else:
        body = r.json()
        CREATED_RESOURCES.append(body["id"])
        if (body.get("preferred_access_mode") == "auto"
                and body.get("require_tunnel") is False
                and body.get("allow_http_fallback") is True):
            passed("A", "defaults: auto / require=False / allow_fallback=True")
        else:
            failed("A", f"unexpected defaults: {body}")

    # ── B: reject invalid preferred mode ─────────────────────────────────────
    banner("B", "Reject invalid preferred_access_mode")
    payload = _make_resource_payload("bad-mode", preferred_access_mode="invalid")
    r = _create_resource(H, payload)
    if r.status_code == 422:
        passed("B", "422 on preferred_access_mode='invalid'")
    else:
        # If accidentally created, register for cleanup.
        if r.status_code == 201:
            CREATED_RESOURCES.append(r.json().get("id"))
        failed("B", f"expected 422, got {r.status_code}: {r.text[:120]}")

    # ── C: reject incoherent combo ───────────────────────────────────────────
    banner("C", "Reject incoherent combo (http_proxy + require_tunnel)")
    payload = _make_resource_payload(
        "incoherent",
        preferred_access_mode="http_proxy",
        require_tunnel=True,
        allow_http_fallback=False,
    )
    r = _create_resource(H, payload)
    if r.status_code == 422:
        passed("C", "422 on http_proxy+require_tunnel combo")
    else:
        if r.status_code == 201:
            CREATED_RESOURCES.append(r.json().get("id"))
        failed("C", f"expected 422, got {r.status_code}: {r.text[:120]}")

    # ── D: access decision — flag off ────────────────────────────────────────
    banner("D", "Access decision — flag off → access_mode=http_proxy, tunnel_ready=False")
    if flag_on:
        skipped("D", "flag is ON; this test asserts flag-off behaviour")
    elif not (has_connector and seed_resource):
        skipped("D", "no online connector or requestable seed resource present")
    else:
        _heartbeat(state)
        r = requests.post(
            f"{BACKEND}/api/access/request", headers=H,
            json={"resource_id": seed_resource["id"]}, timeout=10,
        )
        if r.status_code != 200:
            failed("D", f"HTTP {r.status_code}: {r.text[:120]}")
        else:
            body = r.json()
            checks = [
                ("http 200", True),
                ("access_mode=http_proxy", body.get("access_mode") == "http_proxy"),
                ("tunnel_ready=False", body.get("tunnel_ready") is False),
                ("tunnel_reason starts 'Tunnel disabled'",
                 (body.get("tunnel_reason") or "").startswith("Tunnel disabled")),
                ("session_id issued",
                 body.get("decision") != "allow" or bool(body.get("session_id"))),
            ]
            bad = [name for name, ok in checks if not ok]
            if not bad:
                passed("D", f"decision={body.get('decision')}, reason='{body.get('tunnel_reason')}'")
            else:
                failed("D", f"failed sub-checks: {bad} body={body}")

    # ── E: access decision — preferred=http_proxy (flag on) ─────────────────
    banner("E", "Access decision — preferred=http_proxy (flag on)")
    if not flag_on:
        skipped("E", "requires HEADSCALE_FLAG_ENABLED=true")
    elif not (has_connector and seed_resource):
        skipped("E", "no online connector or requestable seed resource")
    else:
        # Create a copy resource with preferred=http_proxy that reuses the
        # seed resource's connector_resource_id.
        payload = _make_resource_payload(
            "preferred-http",
            connector_resource_id=seed_resource["connector_resource_id"],
            preferred_access_mode="http_proxy",
            require_tunnel=False,
            allow_http_fallback=True,
            minimum_trust_score=seed_resource.get("minimum_trust_score", 0.0),
        )
        cr = _create_resource(H, payload)
        if cr.status_code != 201:
            failed("E", f"setup create HTTP {cr.status_code}: {cr.text[:120]}")
        else:
            rid = cr.json()["id"]
            CREATED_RESOURCES.append(rid)
            _heartbeat(state)
            r = requests.post(
                f"{BACKEND}/api/access/request", headers=H,
                json={"resource_id": rid}, timeout=10,
            )
            if r.status_code != 200:
                failed("E", f"HTTP {r.status_code}: {r.text[:120]}")
            else:
                body = r.json()
                if body.get("decision") == "allow" \
                        and body.get("access_mode") == "http_proxy" \
                        and bool(body.get("session_id")):
                    passed("E", "preferred=http_proxy → http_proxy session issued")
                else:
                    failed("E", f"unexpected body: {body}")

    # ── F: auto, no tunnel state ─────────────────────────────────────────────
    banner("F", "Access decision — auto, no tunnel route → tunnel_ready=False, fallback_used=False")
    if not flag_on:
        skipped("F", "requires HEADSCALE_FLAG_ENABLED=true")
    elif not (has_connector and seed_resource):
        skipped("F", "no online connector or requestable seed resource")
    else:
        payload = _make_resource_payload(
            "auto-no-tunnel",
            connector_resource_id=seed_resource["connector_resource_id"],
            preferred_access_mode="auto",
            require_tunnel=False,
            allow_http_fallback=True,
            minimum_trust_score=seed_resource.get("minimum_trust_score", 0.0),
        )
        cr = _create_resource(H, payload)
        if cr.status_code != 201:
            failed("F", f"setup create HTTP {cr.status_code}: {cr.text[:120]}")
        else:
            rid = cr.json()["id"]
            CREATED_RESOURCES.append(rid)
            _heartbeat(state)
            r = requests.post(
                f"{BACKEND}/api/access/request", headers=H,
                json={"resource_id": rid}, timeout=10,
            )
            if r.status_code != 200:
                failed("F", f"HTTP {r.status_code}: {r.text[:120]}")
            else:
                body = r.json()
                if body.get("decision") == "allow" \
                        and body.get("tunnel_ready") is False \
                        and body.get("fallback_used") is False \
                        and bool(body.get("session_id")):
                    passed("F", "auto+no tunnel → http_proxy session, no fallback flag")
                else:
                    failed("F", f"unexpected body: {body}")

    # ── G: require_tunnel + no fallback + not ready → DENY ──────────────────
    banner("G", "Access decision — require_tunnel + no fallback + not ready → deny")
    if not flag_on:
        skipped("G", "requires HEADSCALE_FLAG_ENABLED=true")
    elif not (has_connector and seed_resource):
        skipped("G", "no online connector or requestable seed resource")
    else:
        payload = _make_resource_payload(
            "deny-no-tunnel",
            connector_resource_id=seed_resource["connector_resource_id"],
            preferred_access_mode="wireguard_tunnel",
            require_tunnel=True,
            allow_http_fallback=False,
            minimum_trust_score=seed_resource.get("minimum_trust_score", 0.0),
        )
        cr = _create_resource(H, payload)
        if cr.status_code != 201:
            failed("G", f"setup create HTTP {cr.status_code}: {cr.text[:120]}")
        else:
            rid = cr.json()["id"]
            CREATED_RESOURCES.append(rid)
            _heartbeat(state)
            r = requests.post(
                f"{BACKEND}/api/access/request", headers=H,
                json={"resource_id": rid}, timeout=10,
            )
            if r.status_code != 200:
                failed("G", f"HTTP {r.status_code}: {r.text[:120]}")
            else:
                body = r.json()
                if body.get("decision") == "deny" \
                        and not body.get("access_token") \
                        and not body.get("session_id") \
                        and (body.get("tunnel_reason") or ""):
                    passed("G", f"deny: {body.get('reason')}")
                else:
                    failed("G", f"unexpected body: {body}")

    # ── H: require_tunnel + fallback allowed + not ready → http fallback ────
    banner("H", "Access decision — require_tunnel + fallback allowed → http_proxy w/ fallback_used")
    h_rid: Optional[str] = None
    if not flag_on:
        skipped("H", "requires HEADSCALE_FLAG_ENABLED=true")
    elif not (has_connector and seed_resource):
        skipped("H", "no online connector or requestable seed resource")
    else:
        payload = _make_resource_payload(
            "fallback-allowed",
            connector_resource_id=seed_resource["connector_resource_id"],
            preferred_access_mode="wireguard_tunnel",
            require_tunnel=True,
            allow_http_fallback=True,
            minimum_trust_score=seed_resource.get("minimum_trust_score", 0.0),
        )
        cr = _create_resource(H, payload)
        if cr.status_code != 201:
            failed("H", f"setup create HTTP {cr.status_code}: {cr.text[:120]}")
        else:
            h_rid = cr.json()["id"]
            CREATED_RESOURCES.append(h_rid)
            _heartbeat(state)
            r = requests.post(
                f"{BACKEND}/api/access/request", headers=H,
                json={"resource_id": h_rid}, timeout=10,
            )
            if r.status_code != 200:
                failed("H", f"HTTP {r.status_code}: {r.text[:120]}")
            else:
                body = r.json()
                ok_decision = body.get("decision") == "allow" \
                    and body.get("access_mode") == "http_proxy" \
                    and body.get("fallback_used") is True
                # Check audit row exists
                ar = requests.get(
                    f"{BACKEND}/api/tunnels/audit?action=http_fallback_used&limit=20",
                    headers=H, timeout=10,
                )
                audit_ok = ar.status_code == 200 and any(
                    str(row.get("resource_id")) == str(h_rid)
                    for row in (ar.json() if ar.status_code == 200 else [])
                )
                if ok_decision and audit_ok:
                    passed("H", "http fallback issued + http_fallback_used audit row present")
                else:
                    failed("H", f"decision_ok={ok_decision} audit_ok={audit_ok} body={body}")

    # ── I: user-enrollment — flag off ────────────────────────────────────────
    banner("I", "User-enrollment — flag off → 202 status=disabled")
    if flag_on:
        skipped("I", "flag is ON; this asserts flag-off path")
    else:
        r = requests.post(f"{BACKEND}/api/tunnels/user-enrollment",
                          headers=H, json={}, timeout=10)
        if r.status_code != 202:
            failed("I", f"expected 202, got {r.status_code}: {r.text[:120]}")
        else:
            body = r.json()
            if body.get("status") == "disabled" \
                    and "{AUTH_KEY}" in (body.get("manual_command") or ""):
                passed("I", "status=disabled, manual_command contains {AUTH_KEY}")
            else:
                failed("I", f"unexpected body: {body}")

    # ── J: user-enrollment — flag on ─────────────────────────────────────────
    banner("J", "User-enrollment — flag on → 200 status=manual_required, no auth_key field")
    if not flag_on:
        skipped("J", "requires HEADSCALE_FLAG_ENABLED=true")
    else:
        r = requests.post(f"{BACKEND}/api/tunnels/user-enrollment",
                          headers=H, json={}, timeout=10)
        if r.status_code != 200:
            failed("J", f"expected 200, got {r.status_code}: {r.text[:120]}")
        else:
            body = r.json()
            if body.get("status") == "manual_required" \
                    and "auth_key" not in body \
                    and "{AUTH_KEY}" in (body.get("manual_command") or ""):
                passed("J", "status=manual_required, no auth_key field, placeholder present")
            else:
                failed("J", f"unexpected body keys/values: {body}")

    # ── K: secret hygiene ────────────────────────────────────────────────────
    banner("K", "User-enrollment — no pre-auth key, no HEADSCALE_API_KEY, no sentinel leak")
    # Use whatever the probe returned; if missing, re-issue.
    if enroll_probe is None or enroll_probe.status_code not in (200, 202):
        try:
            enroll_probe = requests.post(
                f"{BACKEND}/api/tunnels/user-enrollment", headers=H,
                json={"node_name_hint": TEST_SENTINEL},
                timeout=10,
            )
        except Exception as e:
            enroll_probe = None
            failed("K", f"could not fetch enrollment body: {e}")
    if enroll_probe is not None and enroll_probe.status_code in (200, 202):
        raw = enroll_probe.text or ""
        leaks: List[str] = []
        if "tskey-" in raw:
            leaks.append("tskey- prefix present (possible pre-auth key)")
        if hs_api_key and hs_api_key in raw:
            leaks.append("HEADSCALE_API_KEY literal present")
        if TEST_SENTINEL in raw:
            leaks.append(f"sentinel '{TEST_SENTINEL}' present")
        if not leaks:
            passed("K", "no tskey- / no HEADSCALE_API_KEY / no sentinel in response body")
        else:
            failed("K", "; ".join(leaks))
    elif results.get("K") != "FAIL":
        failed("K", f"could not obtain enrollment body (status="
                    f"{enroll_probe.status_code if enroll_probe is not None else 'none'})")

    # ── L: AccessRequestLog persists tunnel fields ──────────────────────────
    banner("L", "AccessRequestLog persists access_mode/tunnel_ready/etc")
    if results.get("D") != "PASS" and results.get("H") != "PASS":
        skipped("L", "neither D nor H produced a decision row to inspect")
    else:
        r = requests.get(f"{BACKEND}/api/access/logs?limit=50", headers=H, timeout=10)
        if r.status_code != 200:
            failed("L", f"HTTP {r.status_code}: {r.text[:120]}")
        else:
            rows = r.json() if isinstance(r.json(), list) else []
            # Find at least one row where the new columns are present (not None).
            candidate = next(
                (row for row in rows
                 if row.get("access_mode") is not None
                 and row.get("tunnel_ready") is not None
                 and row.get("require_tunnel_at_decision") is not None),
                None,
            )
            if candidate is not None:
                passed("L", f"row carries access_mode={candidate.get('access_mode')}, "
                            f"tunnel_ready={candidate.get('tunnel_ready')}, "
                            f"fallback_used={candidate.get('fallback_used')}")
            else:
                failed("L", "no recent access log row carries the new tunnel columns")

    # ── M: audit endpoint shape ──────────────────────────────────────────────
    banner("M", "GET /api/tunnels/audit shape + http_fallback_used row when H ran")
    r = requests.get(f"{BACKEND}/api/tunnels/audit?limit=50", headers=H, timeout=10)
    if r.status_code != 200:
        failed("M", f"HTTP {r.status_code}: {r.text[:120]}")
    else:
        rows = r.json() if isinstance(r.json(), list) else None
        if rows is None:
            failed("M", "response is not a list")
        else:
            # If H passed, expect http_fallback_used to be present
            if results.get("H") == "PASS":
                has_h = any(row.get("action") == "http_fallback_used" for row in rows)
                if has_h:
                    passed("M", f"list with {len(rows)} rows; http_fallback_used present")
                else:
                    failed("M", "H passed but no http_fallback_used row found")
            else:
                # Shape-only check
                shape_ok = all(
                    isinstance(row, dict) and "action" in row and "created_at" in row
                    for row in rows
                ) if rows else True
                if shape_ok:
                    passed("M", f"list of {len(rows)} rows; shape ok")
                else:
                    failed("M", f"bad row shape; first={rows[0] if rows else None}")

    # ── N: audit endpoint admin-only ────────────────────────────────────────
    banner("N", "GET /api/tunnels/audit rejects non-admin / missing auth")
    non_admin = _user_token()
    if non_admin:
        bad_headers = {"Authorization": f"Bearer {non_admin}",
                       "Content-Type": "application/json"}
        r = requests.get(f"{BACKEND}/api/tunnels/audit", headers=bad_headers, timeout=10)
        if r.status_code == 403:
            passed("N", "non-admin → 403")
        else:
            failed("N", f"non-admin: expected 403, got {r.status_code}")
    else:
        # Fall back: assert that unauthenticated access is rejected (401/403).
        r = requests.get(f"{BACKEND}/api/tunnels/audit", timeout=10)
        if r.status_code in (401, 403):
            passed("N", f"unauthenticated → {r.status_code} (no non-admin user available)")
        else:
            failed("N", f"unauthenticated: expected 401/403, got {r.status_code}")

    # ── O: resource update round-trip ───────────────────────────────────────
    banner("O", "Resource update preserves tunnel policy fields")
    payload = _make_resource_payload(
        "roundtrip",
        preferred_access_mode="auto",
        require_tunnel=False,
        allow_http_fallback=True,
    )
    cr = _create_resource(H, payload)
    if cr.status_code != 201:
        failed("O", f"create HTTP {cr.status_code}: {cr.text[:120]}")
    else:
        rid = cr.json()["id"]
        CREATED_RESOURCES.append(rid)
        upd = {
            "preferred_access_mode": "wireguard_tunnel",
            "require_tunnel": True,
            "allow_http_fallback": False,
        }
        ur = requests.put(f"{BACKEND}/api/resources/{rid}",
                          headers=H, json=upd, timeout=10)
        if ur.status_code != 200:
            failed("O", f"update HTTP {ur.status_code}: {ur.text[:120]}")
        else:
            gr = requests.get(f"{BACKEND}/api/resources/{rid}",
                              headers=H, timeout=10)
            if gr.status_code != 200:
                failed("O", f"get HTTP {gr.status_code}: {gr.text[:120]}")
            else:
                body = gr.json()
                if all(body.get(k) == v for k, v in upd.items()):
                    passed("O", "round-trip values equal submitted update")
                else:
                    failed("O", f"mismatch: {body}")

    # ── P: regression note (does NOT invoke verify_all / verify_tunnels) ────
    banner("P", "Regression note for verify_all.py + verify_tunnels.py")
    skipped("P", "run `python tools/verify_all.py` and "
                 "`python tools/verify_tunnels.py` separately")

    # ── Cleanup ─────────────────────────────────────────────────────────────
    _cleanup(H)

    # ── Summary ─────────────────────────────────────────────────────────────
    total = len(TEST_ORDER)
    n_pass = sum(1 for t in TEST_ORDER if results.get(t) == "PASS")
    n_skip = sum(1 for t in TEST_ORDER if results.get(t) == "SKIP")
    n_fail = sum(1 for t in TEST_ORDER if results.get(t) == "FAIL")
    print()
    print(f"{BOLD}{'='*60}{RESET}")
    print(f"{BOLD}  TUNNEL-AWARE ACCESS VERIFICATION COMPLETE{RESET}")
    print(f"{BOLD}{'='*60}{RESET}")
    for t in TEST_ORDER:
        status = results.get(t, "MISSING")
        color = (GREEN if status == "PASS"
                 else YELL if status == "SKIP"
                 else RED)
        print(f"  Test {t}: {color}{status}{RESET}")
    print()
    print(f"SUMMARY: {n_pass}/{total} PASS, {n_skip} SKIP, {n_fail} FAIL")
    return 0 if n_fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
