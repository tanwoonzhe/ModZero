"""
ModZero — Cloud Smoke Test
===========================
A lightweight connectivity test for a deployed ModZero instance.
Suitable for running after `docker compose up` on a cloud server or
as a post-deployment health check in CI.

Does NOT require connector_sim or proxy to be running.
Does NOT modify any data (all requests are read-only after setup teardown).

Usage:
    python tools/cloud_smoke_test.py \\
        --backend-url https://your-domain.com \\
        --username admin \\
        --password YOUR_ADMIN_PASSWORD

    # With optional frontend and connector checks:
    python tools/cloud_smoke_test.py \\
        --backend-url https://your-domain.com \\
        --frontend-url https://your-domain.com \\
        --connector-url http://connector-host:8443 \\
        --username admin \\
        --password YOUR_ADMIN_PASSWORD

Exit codes:
    0 — all checks passed
    1 — one or more checks failed
"""

import argparse
import sys

try:
    import requests
    from requests.exceptions import RequestException
except ImportError:
    print("ERROR: 'requests' not installed  →  pip install requests")
    sys.exit(1)

RESET  = "\033[0m"
GREEN  = "\033[32m"
RED    = "\033[31m"
YELLOW = "\033[33m"
BOLD   = "\033[1m"

passed:  list[str] = []
failed:  list[str] = []
skipped: list[str] = []


def banner(title: str) -> None:
    print(f"\n{BOLD}{'─'*60}{RESET}")
    print(f"{BOLD}  {title}{RESET}")
    print(f"{BOLD}{'─'*60}{RESET}")


def ok(label: str, detail: str = "") -> None:
    print(f"  [{GREEN}PASS{RESET}] {label}" + (f": {detail}" if detail else ""))
    passed.append(label)


def fail(label: str, detail: str = "") -> None:
    print(f"  [{RED}FAIL{RESET}] {label}" + (f": {detail}" if detail else ""))
    failed.append(label)


def skip(label: str, reason: str = "") -> None:
    print(f"  [{YELLOW}SKIP{RESET}] {label}" + (f" — {reason}" if reason else ""))
    skipped.append(label)


def check(label: str, cond: bool, detail: str = "") -> None:
    (ok if cond else fail)(label, detail)


def get(url: str, token: str = "", timeout: int = 10) -> requests.Response:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return requests.get(url, headers=headers, timeout=timeout)


def post(url: str, json: dict | None = None, data: dict | None = None,
         token: str = "", timeout: int = 10) -> requests.Response:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    if data:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
        return requests.post(url, data=data, headers=headers, timeout=timeout)
    return requests.post(url, json=json, headers=headers, timeout=timeout)


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="ModZero cloud smoke test")
    p.add_argument("--backend-url",    required=True,
                   help="Backend base URL, e.g. https://your-domain.com")
    p.add_argument("--frontend-url",   default="",
                   help="Frontend URL (optional, e.g. https://your-domain.com)")
    p.add_argument("--connector-url",  default="",
                   help="Connector proxy URL (optional, e.g. http://host:8443)")
    p.add_argument("--username",       default="admin")
    p.add_argument("--password",       required=True)
    p.add_argument("--timeout",        type=int, default=10,
                   help="HTTP timeout in seconds (default: 10)")
    return p.parse_args()


def main() -> int:
    args = _parse_args()
    B  = args.backend_url.rstrip("/")
    FE = args.frontend_url.rstrip("/") if args.frontend_url else ""
    CN = args.connector_url.rstrip("/") if args.connector_url else ""
    T  = args.timeout
    token = ""

    # ── 1. Backend /health ────────────────────────────────────────────────
    banner("1. Backend /health")
    try:
        r = get(f"{B}/health", timeout=T)
        check("health reachable", r.status_code in (200, 503), str(r.status_code))
        if r.status_code == 200:
            body = r.json()
            check("health status=ok",     body.get("status") == "ok",  body.get("status", ""))
            check("health database=connected", body.get("database") == "connected",
                  body.get("database", ""))
            check("health app present",   bool(body.get("app")),       body.get("app", ""))
        else:
            fail("health 200 (got 503 — database unreachable)", str(r.text[:120]))
    except RequestException as e:
        fail("health reachable", str(e))

    # ── 2. API root ───────────────────────────────────────────────────────
    banner("2. API root /api/")
    try:
        r = get(f"{B}/api/", timeout=T)
        check("api root 200", r.status_code == 200, str(r.status_code))
        check("api root status=ok", r.json().get("status") == "ok", r.text[:60])
    except RequestException as e:
        fail("api root reachable", str(e))

    # ── 3. Auth login ─────────────────────────────────────────────────────
    banner("3. Auth login")
    try:
        r = post(f"{B}/api/auth/login",
                 data={"username": args.username, "password": args.password},
                 timeout=T)
        check("login 200", r.status_code == 200, str(r.status_code))
        if r.status_code == 200:
            token = r.json().get("access_token", "")
            check("login token present", bool(token))
        else:
            fail("login token", f"status={r.status_code}: {r.text[:120]}")
    except RequestException as e:
        fail("login reachable", str(e))

    if not token:
        print(f"\n{RED}Cannot continue without a token — check credentials.{RESET}")
        return 1

    # ── 4. Protected endpoint rejects no token ────────────────────────────
    banner("4. Protected endpoint rejects no token")
    try:
        r = get(f"{B}/api/auth/me", timeout=T)
        check("no-token → 401", r.status_code == 401, str(r.status_code))
    except RequestException as e:
        fail("no-token check", str(e))

    # ── 5. /auth/me returns user profile ─────────────────────────────────
    banner("5. /auth/me with valid token")
    try:
        r = get(f"{B}/api/auth/me", token=token, timeout=T)
        check("/auth/me 200", r.status_code == 200, str(r.status_code))
        if r.status_code == 200:
            body = r.json()
            check("user_id present", "user_id" in body)
            check("username present", "username" in body)
            check("role present",    "role" in body)
    except RequestException as e:
        fail("/auth/me reachable", str(e))

    # ── 6. Resources endpoint ─────────────────────────────────────────────
    banner("6. Resources endpoint")
    try:
        r = get(f"{B}/api/resources", token=token, timeout=T)
        check("resources 200", r.status_code == 200, str(r.status_code))
        if r.status_code == 200:
            check("resources is list", isinstance(r.json(), list),
                  f"got {type(r.json()).__name__}")
    except RequestException as e:
        fail("resources reachable", str(e))

    # ── 7. Access logs endpoint ───────────────────────────────────────────
    banner("7. Access logs endpoint")
    try:
        r = get(f"{B}/api/access/logs", token=token, timeout=T)
        check("access logs 200", r.status_code == 200, str(r.status_code))
        if r.status_code == 200:
            check("access logs is list", isinstance(r.json(), list),
                  f"got {type(r.json()).__name__}")
    except RequestException as e:
        fail("access logs reachable", str(e))

    # ── 8. Connectors endpoint ────────────────────────────────────────────
    banner("8. Connectors endpoint")
    try:
        r = get(f"{B}/api/connectors", token=token, timeout=T)
        check("connectors 200", r.status_code == 200, str(r.status_code))
    except RequestException as e:
        fail("connectors reachable", str(e))

    # ── 9. Tunnel status endpoint ─────────────────────────────────────────
    banner("9. Tunnel status endpoint")
    try:
        r = get(f"{B}/api/tunnels/status", token=token, timeout=T)
        check("tunnel status 200", r.status_code == 200, str(r.status_code))
        if r.status_code == 200:
            body = r.json()
            check("headscale_enabled field present", "headscale_enabled" in body)
    except RequestException as e:
        fail("tunnel status reachable", str(e))

    # ── 10. CORS header check (origin must be explicitly set) ─────────────
    banner("10. CORS headers")
    try:
        r = requests.options(f"{B}/api/auth/login",
                             headers={"Origin": B,
                                      "Access-Control-Request-Method": "POST"},
                             timeout=T)
        acao = r.headers.get("Access-Control-Allow-Origin", "")
        if acao == "*":
            fail("CORS not wildcard",
                 "CORS_ORIGINS=* — restrict to specific domain for production")
        elif acao:
            ok("CORS specific origin", acao)
        else:
            skip("CORS header present", "OPTIONS returned no ACAO header — may be behind proxy")
    except RequestException as e:
        skip("CORS check", str(e))

    # ── 11. Frontend URL reachable ────────────────────────────────────────
    banner("11. Frontend URL")
    if not FE:
        skip("frontend reachable", "--frontend-url not provided")
    else:
        try:
            r = get(FE, timeout=T)
            check("frontend 200", r.status_code == 200, str(r.status_code))
            check("frontend is HTML",
                  "text/html" in r.headers.get("Content-Type", ""),
                  r.headers.get("Content-Type", ""))
        except RequestException as e:
            fail("frontend reachable", str(e))

    # ── 12. Connector URL reachable (optional) ────────────────────────────
    banner("12. Connector proxy URL")
    if not CN:
        skip("connector proxy reachable", "--connector-url not provided")
    else:
        try:
            r = get(CN, timeout=T)
            # Connector proxy returns 404 on root — that still means it's up
            check("connector responds", r.status_code in (200, 404, 401),
                  str(r.status_code))
        except RequestException as e:
            fail("connector proxy reachable", str(e))

    # ── Summary ───────────────────────────────────────────────────────────
    total = len(passed) + len(failed) + len(skipped)
    print(f"\n{BOLD}{'═'*60}{RESET}")
    print(f"{BOLD}  CLOUD SMOKE TEST COMPLETE{RESET}")
    print(f"{BOLD}{'═'*60}{RESET}")
    for lbl in passed:   print(f"  {GREEN}PASS{RESET}  {lbl}")
    for lbl in skipped:  print(f"  {YELLOW}SKIP{RESET}  {lbl}")
    for lbl in failed:   print(f"  {RED}FAIL{RESET}  {lbl}")
    print(f"\nSUMMARY: {len(passed)}/{total} PASS, {len(skipped)} SKIP, {len(failed)} FAIL")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
