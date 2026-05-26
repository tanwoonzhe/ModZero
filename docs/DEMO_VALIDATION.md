# ModZero — Demo Validation Report

**Date:** 2026-05-24  
**Branch:** `refactor/self-hosted-ztna`  
**DB migration head:** `i9j0k1l2m3n4`

---

## 1. System Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│  ModZero ZTNA Platform                                          │
│                                                                 │
│  ┌──────────────┐    REST API     ┌──────────────────────────┐ │
│  │  Admin UI    │◄──────────────►│  FastAPI Backend          │ │
│  │  (React/     │                │  /api/*                   │ │
│  │   Vite)      │                │  PostgreSQL (SQLAlchemy)  │ │
│  └──────────────┘                │  Alembic migrations       │ │
│                                  └──────────┬───────────────┘ │
│  ┌──────────────┐                           │                  │
│  │  Electron    │  IPC + REST   ┌───────────▼───────────────┐ │
│  │  Desktop     │◄─────────────►│  Connector Runtime        │ │
│  │  Client App  │               │  (Python package)         │ │
│  └──────────────┘               │  heartbeat + HTTP proxy   │ │
│                                  └──────────────────────────┘ │
│                                                                 │
│  Tunnel layer (optional, controlled by HEADSCALE_ENABLED):     │
│  ┌─────────────────┐    ┌──────────────────┐                  │
│  │  Headscale      │    │  Tailscale client │                  │
│  │  (self-hosted   │    │  on connector     │                  │
│  │   control plane)│    │  and user device  │                  │
│  └─────────────────┘    └──────────────────┘                  │
└─────────────────────────────────────────────────────────────────┘
```

**Data flow (HTTP proxy path):**
1. Electron client calls `POST /api/access/request` with device + resource.
2. Backend evaluates trust score, device posture, resource policy, and (when enabled) tunnel readiness.
3. On allow: mints `AccessSession` → returns `access_token` + `access_url` pointing at connector proxy.
4. Electron opens `access_url`; connector proxy validates token via `/api/sessions/introspect` and forwards to protected intranet.

**Data flow (WireGuard tunnel path, flag-on + tunnel configured):**
- Same steps 1–2, but `preferred_access_mode="wireguard_tunnel"` skips proxy session creation.
- Response carries `tunnel_target` (the resource subnet/host). Client dials directly through tailnet.

---

## 2. Completed Feature List

### Core Foundation
- User/device registration, JWT authentication, role-based access
- Microsoft Graph API integration (Entra ID users, Intune devices, sign-in logs)
- Device posture scoring (compliance, OS, encryption, risk)
- Trust score computation with per-resource minimum thresholds

### Access Control (Phase 1)
- `POST /api/access/request` — 7-layer safety check, AccessSession minting
- AccessSession TTL, revocation (`POST /api/sessions/{id}/revoke`)
- Per-session token validation + introspect endpoint for connector proxy
- Resource-level enable/disable
- Zero-trust policy engine (custom policies, assessment rules)

### Connector Runtime
- Python `connector_runtime` package: `Config`, `HeartbeatLoop`, `WgLoop`, `ProxyServer`, `ControllerClient`, `storage`, `logging_utils`
- Enrollment, heartbeat, multi-connector support
- HTTP proxy server that validates tokens through backend introspect
- `connector_sim.py` demo tool

### Tunnel Foundation (ZTNA Milestone 2–4)
- `TunnelNode` model (connector tailnet membership + status)
- `TunnelRoute` model (subnet/host routes advertised from connector)
- `TunnelBootstrapLog` model (connector-side onboarding events)
- Route lifecycle columns: `route_status`, `advertise_command`, `headscale_route_id`, `last_synced_at`
- `TunnelRouteActionLog` audit table
- Headscale service integration stub (`headscale_service.py`)
- Admin UI: TunnelsPage (node + route tables, route approval)

### Tunnel Access Integration (Final Milestone)
- `ProtectedResource` policy fields: `preferred_access_mode`, `require_tunnel`, `allow_http_fallback`
- `_evaluate_tunnel_readiness` — read-only tunnel state helper in access decision flow
- `access_mode` resolution: `http_proxy | wireguard_tunnel | both | denied`
- `AccessRequestLog` tunnel columns: `access_mode`, `tunnel_ready`, `tunnel_reason`, `fallback_used`, `require_tunnel_at_decision`
- `AccessDecisionOut` additive tunnel fields (9 new optional fields)
- `TunnelAccessAuditLog` — per-event audit trail (`tunnel_ready_reported`, `tunnel_required_denied`, `http_fallback_used`, `user_enrollment_requested`, `session_revoked_with_tunnel`)
- `TunnelUserEnrollmentLog` — user device enrollment audit (no keys stored)
- `POST /api/tunnels/user-enrollment` — manual-only join package, `{AUTH_KEY}` placeholder, never calls Headscale
- `GET /api/tunnels/audit` — admin-only audit endpoint
- Electron `tunnel-detect.ts` — read-only `tailscale status --json` probe
- Electron IPC: `modzero:tunnel-detect`, `modzero:tunnel-enrollment`
- Connected dashboard: Tunnel Client card with status badge + join instructions modal
- Admin UI: ResourcesPage tunnel policy subsection (3 controls + table badges)
- Admin UI: AccessDecisionsLog Mode/Tunnel/Reason/Fallback columns
- Admin UI: TunnelsPage "Tunnel Audit" tab

---

## 3. Final Test Results

All results recorded on 2026-05-24 with `HEADSCALE_ENABLED=false`.

| Suite | Command | Result |
|---|---|---|
| Full platform | `DEMO_CONNECTOR_PROXY_BASE_URL=http://localhost:18080 python tools/verify_all.py` | **90/90 PASS** |
| Tunnel foundation | `python tools/verify_tunnels.py` | **61/61 PASS** |
| Tunnel access | `python tools/verify_tunnel_access.py` | **8/16 PASS, 8 SKIP, 0 FAIL** |
| Connector runtime smoke | `python connector_runtime/tests/test_smoke.py` | **21/21 PASS** |
| Frontend build | `cd frontend && npm run build` | **clean** (1193 modules) |
| Electron TS compile | `cd client-app && npm run build:main` | **clean** |
| Electron package | `cd client-app && npm run package:win:portable` | `release/ModZero-win32-x64` written |

### verify_tunnel_access.py detail

| Test | Description | Result |
|---|---|---|
| A | Resource policy defaults | PASS |
| B | Reject invalid `preferred_access_mode` | PASS |
| C | Reject incoherent combo (`http_proxy` + `require_tunnel`) | PASS |
| D | Flag-off: `access_mode=http_proxy`, `tunnel_ready=False` | SKIP (flag off) |
| E | Flag-on: `preferred=http_proxy` → session issued | SKIP (no live connector) |
| F | Flag-on: auto + no tunnel route → fallback, no `fallback_used` | SKIP (no live connector) |
| G | Flag-on: `require_tunnel` + no fallback + not ready → deny | SKIP (no live connector) |
| H | Flag-on: `require_tunnel` + fallback allowed → http_proxy + audit row | SKIP (no live connector) |
| I | Flag-off: enrollment returns `status=disabled` | PASS |
| J | Flag-on: enrollment returns `status=manual_required`, no `auth_key` | SKIP (flag off) |
| K | Secret hygiene: no `tskey-`, no `HEADSCALE_API_KEY`, no sentinel | PASS |
| L | `AccessRequestLog` persists tunnel columns after D/H | SKIP (D/H skipped) |
| M | `GET /api/tunnels/audit` shape; `http_fallback_used` row after H | PASS |
| N | Audit endpoint rejects unauthenticated requests | PASS |
| O | Resource PUT round-trips tunnel policy fields | PASS |
| P | Reminder: run `verify_all.py` + `verify_tunnels.py` separately | SKIP (by design) |

---

## 4. Skipped Tests Explained

**Tests D, E, F, G, H, J, L** require either:
- `HEADSCALE_ENABLED=true` in the environment (D and I are flag-off–only; J, E–H, L require flag-on), **and/or**
- An online connector with a registered `TunnelNode` row (`status=online`) **and** at least one `TunnelRoute` row with `enabled=True`.

In local development without a real Headscale instance, there are no tunnel node rows in the database, so the `_evaluate_tunnel_readiness` helper always returns `tunnel_ready=False`. Tests E–H and L therefore cannot exercise their conditional branches and skip gracefully.

To run the full 16/16:
1. Deploy a real [Headscale](https://headscale.net) instance.
2. Set `HEADSCALE_ENABLED=true`, `HEADSCALE_URL=<your-headscale-url>`, `HEADSCALE_API_KEY=<key>` in `.env`.
3. Enroll a connector node via the admin UI so `TunnelNode.status=online`.
4. Create at least one `TunnelRoute` with `enabled=True` linked to the connector.
5. Re-run `python tools/verify_tunnel_access.py`.

**Test P** always skips — it prints a reminder to run the other suites separately rather than invoking them (avoids nested process management).

---

## 5. Demo Flow

Pre-requisites: backend + db containers running, `connector_sim.py --resume --proxy` running on port 18080.

### Step 1 — Login

1. Open `http://localhost:5173` in browser (or launch the Electron app).
2. Log in with `admin` / `admin123`.
3. You land on the Dashboard showing connected devices and trust scores.

### Step 2 — Run Device Check

1. Navigate to **Devices** in the sidebar.
2. Select your test device; click **Run Assessment**.
3. Observe trust score, posture breakdown (compliance, OS, encryption, risk level).
4. Verify the score appears in the trust score panel.

### Step 3 — Request Access (HTTP Proxy)

1. Navigate to **Resources**.
2. Click **Request Access** on *AlphaTechs Intranet* (connector must be online).
3. Decision: `allow`, `access_mode: http_proxy`, `tunnel_ready: false` (no Headscale configured).
4. `access_url` is returned: `http://localhost:18080/access/<session_id>?token=...`.

### Step 4 — Open Connector Proxy Access URL

1. Open the returned `access_url` in a browser.
2. The connector proxy validates the token via `/api/sessions/introspect`.
3. You see the *AlphaTechs Internal Portal* demo page — the protected resource.
4. The session expires after the configured TTL (default: 480 min).

### Step 5 — View Admin Access Logs

1. Navigate to **Access Logs** (admin sidebar).
2. The table now shows 4 extra columns: **Mode** (badge), **Tunnel** (✓/—), **Why** (tooltip for `tunnel_reason`), **Fallback** (↩ icon).
3. The row for the request above shows: Mode = `http_proxy`, Tunnel = —, Reason = "Tunnel disabled".

### Step 6 — View Tunnel Route Lifecycle

1. Navigate to **Tunnels** → **Overview** tab.
2. See the node table (empty without real Headscale) and route table.
3. Route rows show lifecycle state: `pending → approved → active → withdrawn`.
4. Click **Approve** on a pending route (requires a real connector node to be present).

### Step 7 — View Tunnel-Aware Policy Decision

1. Navigate to **Resources** → edit *AlphaTechs Intranet*.
2. Scroll to the **Tunnel Policy** subsection.
3. Change **Preferred access mode** to *WireGuard Tunnel only*, leave **Require tunnel** unchecked.
4. Save. Request access again.
5. With no live tunnel node, the response falls back to HTTP proxy (`fallback_used: true`).
6. Return the resource to **Auto (recommended)** mode after the demo.

### Step 8 — View User-Device Tunnel Enrollment Instructions

**Option A — Electron app:**
1. Launch `release/ModZero-win32-x64/ModZero.exe`.
2. Log in; navigate to the Connected dashboard.
3. The **Tunnel Client** card shows badge: *Not installed* (tailscale not present on this machine).
4. Click **Get Tunnel Join Instructions**.
5. A modal appears with `manual_command` containing the literal `{AUTH_KEY}` placeholder, plus numbered steps.

**Option B — API direct:**
```bash
curl -s -X POST http://localhost:8000/api/tunnels/user-enrollment \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"node_name_hint": "my-laptop"}' | python -m json.tool
```
Response `status: "disabled"` (flag off) or `status: "manual_required"` (flag on). Field `manual_command` always contains `{AUTH_KEY}` — no real key is ever returned.

---

## 6. Known Limitations

| # | Limitation | Impact |
|---|---|---|
| 1 | WireGuard tunnel traffic is not yet replacing HTTP proxy | `access_mode=wireguard_tunnel` is reported in metadata only; actual data still transits the HTTP proxy until a real Headscale deployment + route advertisement is configured |
| 2 | Tunnel revocation is coarse-grained | Revoking a specific user's access to one resource via the tunnel requires either disabling the entire route (affects all users) or expiring the user's tailnet node (revokes all their tunnel access). No per-(user, resource) tunnel revoke primitive exists |
| 3 | Real Headscale route approval depends on Headscale deployment | `POST /api/tunnels/routes/{id}/approve` calls the Headscale API; without a live Headscale instance it returns an error. Route lifecycle UI is functional but approval has no effect without Headscale |
| 4 | User device join is manual-only | The enrollment endpoint returns a `manual_command` with an `{AUTH_KEY}` placeholder. The administrator must create a pre-auth key in Headscale out-of-band and provide it to the user. The server never calls Headscale on the user's behalf |
| 5 | Single-chunk frontend bundle | Vite warns about 1.5 MB JS bundle. Functional for a demo; production deployment should add code-splitting |
| 6 | `HEADSCALE_API_KEY` in `.env` is never audited | The key is read from env at runtime and used only in outbound Headscale API calls; it is never stored in the DB, logged, or returned in any response |

---

## 7. Commands to Reproduce Validation

```bash
# 0. Environment — ensure backend + db are running
cd d:/degree/sem6/code/ModZero/deploy
docker compose up -d

# 1. Apply migrations
docker compose exec -T backend alembic upgrade head
# Expected last line: Running upgrade h8i9j0k1l2m3 -> i9j0k1l2m3n4 ...
# (idempotent if already applied)

# 2. Start connector simulator (separate terminal)
cd d:/degree/sem6/code/ModZero/tools
python connector_sim.py --resume --proxy --backend http://localhost:8000

# 3. Full platform suite
cd d:/degree/sem6/code/ModZero
DEMO_CONNECTOR_PROXY_BASE_URL=http://localhost:18080 python tools/verify_all.py
# Expected: PASSED 90, FAILED 0

# 4. Tunnel foundation suite
python tools/verify_tunnels.py
# Expected: PASSED 61, FAILED 0

# 5. Tunnel access suite (HEADSCALE_ENABLED=false)
python tools/verify_tunnel_access.py
# Expected: 8/16 PASS, 8 SKIP, 0 FAIL

# 6. Connector runtime smoke
python connector_runtime/tests/test_smoke.py
# Expected: All smoke checks passed.

# 7. Frontend build
cd frontend && npm run build
# Expected: ✓ built in ~15s, 0 errors

# 8. Electron TypeScript compile
cd ../client-app && npm run build:main
# Expected: clean exit (no errors)

# 9. Electron portable package
npm run package:win:portable
# Expected: Wrote new app to: release/ModZero-win32-x64

# --- Optional: run tunnel access tests with flag on ---
# Edit .env: HEADSCALE_ENABLED=true, HEADSCALE_URL=http://127.0.0.1:1
# cd deploy && docker compose up -d --force-recreate backend && cd ..
# python tools/verify_tunnel_access.py
# Expected (without live Headscale node): 8/16 PASS, 8 SKIP, 0 FAIL
#   Tests J and K will now PASS (were SKIP with flag off)
#   Tests D and I will now SKIP (flag-off assertions)
#   Tests E–H still SKIP (require live connector tunnel node)
# Restore: HEADSCALE_ENABLED=false, recreate backend
```

---

## 8. Migration Chain

| Revision | Description |
|---|---|
| `9ef8787d2f8a` | Security testing tables |
| `a1b2c3d4e5f6` | User test configuration |
| `b2c3d4e5f6g7` | Custom policies table |
| `c3d4e5f6g7h8` | Location to remote networks |
| `d4e5f6g7h8i9` | Phase 1 access control |
| `e5f6g7h8i9j0` | Tunnel foundation |
| `f6g7h8i9j0k1` | Tunnel bootstrap logs |
| `g7h8i9j0k1l2` | Route lifecycle columns + audit |
| `h8i9j0k1l2m3` | Tunnel access policy cols (ProtectedResource + AccessRequestLog) |
| `i9j0k1l2m3n4` | `tunnel_access_audit_logs` + `tunnel_user_enrollment_logs` tables |

---

## Gateway Mode Validation

Prerequisites:
- `alembic upgrade head` — run in backend container after deployment
- Restart backend: `docker compose up -d --force-recreate backend`
- Restart connector_runtime: `MODZERO_BACKEND_URL=http://43.106.22.101:8000 python -m connector_runtime run --proxy`
- Create a session token (Dashboard → Resources → Request Access)

### Test A — Visit connector gateway root without session

```bash
curl -i http://43.106.22.101:18080/
```

Expected: `HTTP 403`, body contains "Access denied. Please open ModZero Client and request access."

### Test B — request_access returns launch_url

```bash
curl -s -X POST http://43.106.22.101:8000/api/access/request \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"resource_id": "<resource_id>"}' | python3 -m json.tool
```

Expected: JSON includes `launch_url` starting with `http://43.106.22.101:18080/launch/`

### Test C — Open launch_url → connector sets HttpOnly cookie

```bash
curl -i http://43.106.22.101:18080/launch/<code>
```

Expected: `HTTP 302`, `Location: /r/<session_id>/`, `Set-Cookie: mz_session=...; HttpOnly; SameSite=Lax`

### Test D — Redirected final URL has no token

Inspect the `Location` header from Test C — it must be `/r/<session_id>/` with no `?token=`.

### Test E — Final clean URL loads AlphaTechs Internal Portal

```bash
curl -i --cookie "mz_session=<cookie_id>" http://43.106.22.101:18080/r/<session_id>/
```

Expected: `HTTP 200`, HTML content from the internal resource.

### Test F — Reuse launch code → denied

```bash
curl -i http://43.106.22.101:18080/launch/<same_code_again>
```

Expected: `HTTP 403`, reason `launch_code_already_used`

### Test G — Raise minimum_trust_score → refresh denied

1. Note device trust score (e.g. 68)
2. Set resource minimum score above current score (e.g. 90):
   `PUT /api/resources/<id>` with `{"minimum_trust_score": 90}`
3. Refresh the already-open `/r/<session_id>/` page or:

```bash
curl -i --cookie "mz_session=<cookie_id>" http://43.106.22.101:18080/r/<session_id>/
```

Expected: `HTTP 403`, reason `trust_score_below_required`

### Test H — Disable resource → refresh denied

1. `PUT /api/resources/<id>` with `{"enabled": false}`
2. Refresh:

```bash
curl -i --cookie "mz_session=<cookie_id>" http://43.106.22.101:18080/r/<session_id>/
```

Expected: `HTTP 403`, reason `resource_disabled`

### Test I — Expired or revoked session → denied

Revoke the session via `POST /api/access/sessions/<id>/revoke` or wait for expiry.

```bash
curl -i --cookie "mz_session=<cookie_id>" http://43.106.22.101:18080/r/<session_id>/
```

Expected: `HTTP 403`, reason `session_revoked` or `session_expired`

### Test J — Regression: existing test suites pass

```bash
python tools/verify_all.py        # expect 90/90
python tools/verify_tunnels.py    # expect 61/61
python tools/verify_auth.py       # expect all pass
python tools/cloud_smoke_test.py  # expect all pass
python connector_runtime/tests/test_smoke.py  # expect pass
```
