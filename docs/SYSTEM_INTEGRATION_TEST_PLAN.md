# ModZero — System Integration Test Plan

**Status:** Living document — updated as tests are automated or verified manually.  
**Legend:**
- ✅ Automated — covered by a running verify_*.py script
- 🔧 Automated (partial) — partially covered; gaps noted
- 📋 Manual — must be verified by a human tester
- 🚧 Not yet implemented — planned but not written
- ⏭ Out of scope — requires infrastructure not available in local dev

---

## A. Identity / Auth Tests

| # | Test | Method | Status | Script / Notes |
|---|---|---|---|---|
| A1 | Login with valid admin credentials returns JWT | Automated | ✅ | `verify_all.py` Login section |
| A2 | Login with wrong password returns 400/401 | Automated | ✅ | `tools/verify_auth.py` Test A2 |
| A3 | Login with unknown username returns 400/401 | Automated | ✅ | `tools/verify_auth.py` Test A3 |
| A4 | `GET /api/auth/me` with valid token returns user profile | Automated | ✅ | `tools/verify_auth.py` Test A4 |
| A5 | `GET /api/auth/me` with no token returns 401 | Automated | ✅ | `tools/verify_auth.py` Test A5 |
| A6 | `GET /api/auth/me` with tampered token returns 401 | Automated | ✅ | `tools/verify_auth.py` Test A6 |
| A7 | Admin-only endpoint rejected for non-admin token | Automated | ✅ | `tools/verify_auth.py` Test A7 |
| A8 | `POST /api/auth/register` rejected without admin token | Automated | ✅ | `tools/verify_auth.py` Test A8 |
| A9 | `POST /api/auth/register` succeeds with admin token | Automated | ✅ | `tools/verify_auth.py` Test A9 |
| A10 | Frontend: login with wrong credentials shows error message | Manual | 📋 | Browser test: LoginPage.tsx |
| A11 | Frontend: expired/invalid token in localStorage redirects to login | Manual | 📋 | Browser test: api.ts interceptor at line 27 |
| A12 | Token expiry (ACCESS_TOKEN_EXPIRE_MINUTES) enforced | Manual | 📋 | Requires waiting or changing config |

---

## B. Device Posture Tests

| # | Test | Method | Status | Script / Notes |
|---|---|---|---|---|
| B1 | `POST /api/posture/report` with valid device data returns 200 | Automated | 🚧 | Needs posture test script |
| B2 | `GET /api/trust/latest` returns list for admin | Automated | 🚧 | |
| B3 | `GET /api/trust/device/{id}` returns score for own device (employee) | Automated | 🚧 | |
| B4 | `GET /api/trust/device/{id}` returns 403 for other user's device (employee) | Automated | 🚧 | |
| B5 | Trust score ≥ 80 when device is compliant + encrypted + low risk | Manual | 📋 | Requires Intune-enrolled device |
| B6 | Trust score ≤ 40 when device is non-compliant | Manual | 📋 | Requires Intune-enrolled device |
| B7 | Trust score consistent across repeated `/posture/report` calls for same state | Manual | 📋 | Run assessment twice, compare |
| B8 | Device with no posture report produces trust score = 0 or deny-equivalent | Automated | 🚧 | `tools/verify_auth.py` Test B-deny |
| B9 | Assessment endpoint returns structured breakdown (per-category scores) | Manual | 📋 | `POST /api/assessment/run` → check JSON shape |
| B10 | Intune compliance signal: compliant=true increases score (real Intune) | Manual | ⏭ | Requires real Entra/Intune tenant |
| B11 | Intune compliance signal: mock/offline → score still computed without crash | Automated | 🚧 | Test graceful degradation |

---

## C. Trust Score Tests

| # | Test | Method | Status | Script / Notes |
|---|---|---|---|---|
| C1 | Resource with `min_trust_score=0` always allows (score ≥ 0) | Automated | ✅ | `verify_all.py` Session Test A |
| C2 | Resource with `min_trust_score=101` always denies (no device can reach 101) | Automated | ✅ | `verify_all.py` Test C |
| C3 | Deny response contains correct `trust_score` and `reason` | Automated | ✅ | `verify_all.py` Test C |
| C4 | No `access_token` / `session_id` present on deny | Automated | ✅ | `verify_all.py` Test C (implicit) |
| C5 | Trust score boundary: score = threshold → allow | Automated | 🚧 | Create resource with `min = 68`, expect allow |
| C6 | Trust score boundary: score = threshold − 1 → deny | Automated | 🚧 | Create resource with `min = 69`, expect deny |
| C7 | Trust score visible in admin Access Logs UI | Manual | 📋 | Browser: AccessDecisionsLog.tsx |

---

## D. Resource Access Decision Tests

| # | Test | Method | Status | Script / Notes |
|---|---|---|---|---|
| D1 | Allow decision returns all required fields | Automated | ✅ | `verify_all.py` Session Test A |
| D2 | access_url uses configured proxy base, not internal address | Automated | ✅ | `verify_all.py` Session Test A |
| D3 | Disabled resource → `decision=deny`, `reason=resource_unavailable` | Automated | ✅ | `verify_all.py` Session Test D |
| D4 | Offline connector → `decision=deny` | Automated | 🚧 | Stop heartbeat; request access; expect deny |
| D5 | Unknown resource_id → 404 | Automated | 🚧 | |
| D6 | Tunnel policy: `preferred=auto`, flag off → `access_mode=http_proxy` | Automated | ✅ | `verify_tunnel_access.py` Test D |
| D7 | Tunnel policy: `preferred=wireguard_tunnel`, not ready, fallback → `fallback_used=true` | Automated | ✅ | `verify_tunnel_access.py` Test H (SKIP in dev) |
| D8 | Tunnel policy: `require_tunnel=true`, no fallback, not ready → `decision=deny` | Automated | ✅ | `verify_tunnel_access.py` Test G (SKIP in dev) |
| D9 | Tunnel policy: invalid `preferred_access_mode` → 422 | Automated | ✅ | `verify_tunnel_access.py` Test B |
| D10 | Tunnel policy: `http_proxy` + `require_tunnel=true` → 422 | Automated | ✅ | `verify_tunnel_access.py` Test C |
| D11 | Intune-required resource + non-compliant device → deny | Automated | 🚧 | `tools/verify_auth.py` Test D-intune |
| D12 | Frontend ResourcesPage: create resource, appears in list | Manual | 📋 | Browser: ResourcesPage.tsx |
| D13 | Frontend ResourcesPage: edit resource, changes persisted | Manual | 📋 | |
| D14 | Frontend ResourcesPage: delete resource, removed from list | Manual | 📋 | |

---

## E. Access Session Tests

| # | Test | Method | Status | Script / Notes |
|---|---|---|---|---|
| E1 | Introspect valid session → `active=true` | Automated | ✅ | `verify_all.py` Session Test B |
| E2 | Revoke session → introspect → `active=false`, `reason=session_revoked` | Automated | ✅ | `verify_all.py` Session Test C |
| E3 | Disabled resource → introspect existing session → `resource_unavailable` | Automated | ✅ | `verify_all.py` Session Test D |
| E4 | Wrong token → `reason=token_mismatch` | Automated | ✅ | `verify_all.py` Session Test E |
| E5 | Wrong connector → `reason=connector_mismatch` | Automated | ✅ | `verify_all.py` Session Test F |
| E6 | Session not found → 404 | Automated | 🚧 | |
| E7 | `GET /api/access/sessions` lists active sessions for admin | Automated | 🚧 | |
| E8 | `GET /api/access/sessions` employee sees only own sessions | Automated | 🚧 | |
| E9 | Session expires after TTL (ACCESS_TOKEN_EXPIRE_MINUTES) | Manual | 📋 | Requires time manipulation or short TTL config |
| E10 | Revoke session → proxy access URL → 403 immediately | Automated | ✅ | `verify_all.py` Proxy Test C |
| E11 | Frontend SessionsPage: active sessions shown with correct fields | Manual | 📋 | Browser: SessionsPage.tsx |
| E12 | Frontend SessionsPage: revoke button calls API and removes row | Manual | 📋 | |
| E13 | Tunnel audit row written when session with `access_mode=both` revoked | Automated | 🚧 | |

---

## F. Connector / Runtime Tests

| # | Test | Method | Status | Script / Notes |
|---|---|---|---|---|
| F1 | Connector enroll, heartbeat, proxy flow end-to-end | Automated | ✅ | `verify_all.py` full suite |
| F2 | Proxy forwards request to intranet (real HTTP) | Automated | ✅ | `verify_all.py` Real Proxy Tests A–F |
| F3 | Proxy rejects revoked session with 403 | Automated | ✅ | `verify_all.py` Real Proxy Test C |
| F4 | Proxy rejects wrong token with 403 | Automated | ✅ | `verify_all.py` Real Proxy Test E |
| F5 | Proxy ignores Host injection from attacker | Automated | ✅ | `verify_all.py` Real Proxy Test F |
| F6 | connector_runtime package imports clean | Automated | ✅ | `test_smoke.py` imports check |
| F7 | Config loads defaults; env overrides work | Automated | ✅ | `test_smoke.py` Config checks |
| F8 | State round-trip (save/load) with temp directory | Automated | ✅ | `test_smoke.py` State round-trip |
| F9 | WgLoop + ProxyServer construct without starting | Automated | ✅ | `test_smoke.py` |
| F10 | `wg detect` returns 0 and "status" output when tailscale absent | Automated | ✅ | `test_smoke.py` wg detect |
| F11 | Connector tunnel register + heartbeat endpoint | Automated | ✅ | `verify_tunnels.py` Tests B, C |
| F12 | Connector mismatch on tunnel register (wrong path id) | Automated | ✅ | `verify_tunnels.py` Test B' |
| F13 | Bootstrap endpoint returns safe script without embedded secrets | Automated | ✅ | `verify_tunnels.py` Tests H–M |
| F14 | Frontend ConnectorsPage: enroll token create/delete | Manual | 📋 | Browser: ConnectorsPage.tsx |
| F15 | Electron app: heartbeat visible in connector log | Manual | 📋 | Run Electron + connector_sim |

---

## G. Admin Dashboard UI Tests

| # | Test | Method | Status | Script / Notes |
|---|---|---|---|---|
| G1 | Login page: valid credentials → redirect to dashboard | Manual | 📋 | |
| G2 | Login page: wrong credentials → error message shown (no mock data) | Manual | 📋 | |
| G3 | Dashboard: loads real assessment data from `/api/assessment/overview` | Manual | 📋 | Network tab in DevTools |
| G4 | Dashboard: `last_synced` missing → shows "Unknown" (not crash) | Manual | 📋 | Fixed: DashboardPage.tsx |
| G5 | Access Logs: shows real data from `/api/attempts`, not mock fallback | Manual | 📋 | Fixed: LogsPage.tsx — error banner shown if API fails |
| G6 | Access Logs: API failure → error banner shown, no fake entries | Manual | 📋 | Stop backend; reload page |
| G7 | Resources: loading/error/empty states present | Manual | 📋 | |
| G8 | Resources: tunnel policy controls save and round-trip correctly | Manual | 📋 | |
| G9 | Sessions: revoke button removes row after confirmation | Manual | 📋 | |
| G10 | Connectors: API failure → toast error shown (not silent) | Manual | 📋 | Fixed: ConnectorsPage.tsx |
| G11 | Tunnels: Overview and Audit tabs switch correctly | Manual | 📋 | |
| G12 | Zero Trust Policies: no console.log output in DevTools | Manual | 📋 | Fixed: ZeroTrustPoliciesPage.tsx |
| G13 | All pages: unauthenticated access → redirect to /login | Manual | 📋 | Clear localStorage token |
| G14 | All pages: 401 response from API → redirect to /login | Manual | 📋 | api.ts interceptor |
| G15 | Frontend build: `npm run build` exits clean (no TypeScript errors) | Automated | ✅ | Run as part of CI |

---

## H. Tunnel Policy Tests

| # | Test | Method | Status | Script / Notes |
|---|---|---|---|---|
| H1 | New resource defaults: `preferred=auto`, `require_tunnel=false`, `allow_fallback=true` | Automated | ✅ | `verify_tunnel_access.py` Test A |
| H2 | Invalid `preferred_access_mode` → 422 | Automated | ✅ | `verify_tunnel_access.py` Test B |
| H3 | `http_proxy` + `require_tunnel=true` → 422 | Automated | ✅ | `verify_tunnel_access.py` Test C |
| H4 | Flag off: access always returns `http_proxy`, session issued | Automated | ✅ | `verify_tunnel_access.py` Test D |
| H5 | User enrollment: flag off → `status=disabled`, `{AUTH_KEY}` placeholder present | Automated | ✅ | `verify_tunnel_access.py` Test I |
| H6 | User enrollment: flag on → `status=manual_required`, no `auth_key` field | Automated | ✅ | `verify_tunnel_access.py` Test J |
| H7 | Secret hygiene: no `tskey-`, no API key, no sentinel in enrollment response | Automated | ✅ | `verify_tunnel_access.py` Test K |
| H8 | Audit endpoint shape + admin-only access | Automated | ✅ | `verify_tunnel_access.py` Tests M, N |
| H9 | Resource PUT round-trips tunnel policy fields | Automated | ✅ | `verify_tunnel_access.py` Test O |
| H10 | With live Headscale: `preferred=auto`, tunnel ready → `access_mode=both` | Manual | ⏭ | Requires real Headscale |
| H11 | With live Headscale: `preferred=wireguard_tunnel`, ready → no AccessSession created | Manual | ⏭ | Requires real Headscale |
| H12 | Frontend: tunnel policy controls visible and editable on ResourcesPage | Manual | 📋 | Browser test |
| H13 | Frontend: AccessDecisionsLog shows Mode/Tunnel/Fallback columns | Manual | 📋 | Browser test |
| H14 | Electron: Tunnel Client card shows correct status badge | Manual | 📋 | Run Electron app |
| H15 | Electron: Join Instructions modal contains `{AUTH_KEY}` placeholder | Manual | 📋 | Run Electron app |

---

## I. Cloud Deployment Tests

> All cloud tests require a deployed instance with a real domain, HTTPS, and external PostgreSQL.
> See `docs/CLOUD_DEPLOYMENT_CHECKLIST.md` for environment setup.

| # | Test | Method | Status | Script / Notes |
|---|---|---|---|---|
| I1 | Backend health: `GET https://<domain>/api/` returns `{"status":"ok"}` | Manual | ⏭ | |
| I2 | HTTPS enforced: HTTP redirects to HTTPS (or is blocked) | Manual | ⏭ | |
| I3 | CORS: frontend origin allowed; other origins blocked | Manual | ⏭ | Check `CORS_ORIGINS` env var |
| I4 | Cookie security: `COOKIE_SECURE=true` set for production | Manual | ⏭ | |
| I5 | PostgreSQL persistence: data survives `docker compose restart` | Manual | ⏭ | |
| I6 | Alembic upgrade head runs clean on fresh DB | Manual | ⏭ | |
| I7 | Demo data seed runs without errors | Manual | ⏭ | `python tools/seed_demo_data.py` |
| I8 | Connector runtime connects to cloud backend URL | Manual | ⏭ | Set `MODZERO_BACKEND_URL=https://<domain>` |
| I9 | Electron app: backend URL configurable from Settings | Manual | ⏭ | Electron settings dialog |
| I10 | verify_all.py against cloud backend (with running connector) | Manual | ⏭ | `BASE=https://<domain> python tools/verify_all.py` |
| I11 | Azure Graph integration: real tenant, real device data returned | Manual | ⏭ | Requires live Azure credentials in cloud env |
| I12 | Secret rotation: changing SECRET_KEY invalidates all sessions | Manual | ⏭ | |
| I13 | Connector proxy: local proxy not accessible from public internet | Manual | ⏭ | Expected: connector proxy binds to local network only |

---

## J. Full End-to-End Demo Tests

| # | Test | Flow | Status | Notes |
|---|---|---|---|---|
| J1 | Login → device posture check → access allow → open URL → portal loads | E2E | 📋 | Golden path |
| J2 | Login → request access to Finance Portal → deny (trust score) | E2E | 📋 | Trust score enforcement |
| J3 | Grant access → revoke → access URL returns 403 immediately | E2E | 📋 | Revocation path |
| J4 | Disable resource → existing session introspect → resource_unavailable | E2E | 📋 | Resource lifecycle |
| J5 | Electron: login → tunnel detect → join instructions | E2E | 📋 | Electron client golden path |
| J6 | Admin changes tunnel policy to require_tunnel → user gets deny or fallback | E2E | 📋 | Tunnel policy enforcement |
| J7 | Admin creates enroll token → connector enrolls → heartbeat visible in UI | E2E | 📋 | Connector onboarding |
| J8 | Connector goes offline (stop sim) → new access request → connector_offline deny | E2E | 📋 | Failure injection |

---

## Running the Automated Suites

```bash
# Prerequisite: backend running, connector_sim running on port 18080
cd d:/degree/sem6/code/ModZero/tools
python connector_sim.py --resume --proxy &

# Full platform + auth + posture additions
DEMO_CONNECTOR_PROXY_BASE_URL=http://localhost:18080 python tools/verify_all.py
python tools/verify_auth.py         # new auth/posture/non-admin tests

# Tunnel suites
python tools/verify_tunnels.py
python tools/verify_tunnel_access.py

# Connector runtime smoke
python connector_runtime/tests/test_smoke.py

# Frontend build
cd frontend && npm run build
```

---

## Test Count Summary

| Suite | Automated ✅ | Partial 🔧 | Manual 📋 | Not Yet 🚧 | Out of Scope ⏭ | Total |
|---|---|---|---|---|---|---|
| A. Auth | 9 | 0 | 3 | 0 | 0 | 12 |
| B. Device Posture | 2 | 0 | 4 | 5 | 1 | 12 (est.) |
| C. Trust Score | 4 | 0 | 1 | 2 | 0 | 7 |
| D. Access Decisions | 8 | 0 | 3 | 4 | 0 | 15 (est.) |
| E. Sessions | 6 | 0 | 4 | 4 | 0 | 14 (est.) |
| F. Connector/Runtime | 13 | 0 | 2 | 0 | 0 | 15 |
| G. Admin Dashboard UI | 1 | 0 | 14 | 0 | 0 | 15 |
| H. Tunnel Policy | 9 | 0 | 4 | 0 | 2 | 15 |
| I. Cloud Deployment | 0 | 0 | 0 | 0 | 13 | 13 |
| J. End-to-End Demo | 0 | 0 | 8 | 0 | 0 | 8 |

> **Note:** This system is not production-ready. Cloud/real-Intune/real-Headscale tests are
> marked ⏭ and require infrastructure beyond the local development environment. Local automated
> tests establish a strong baseline; manual and cloud tests complete the picture before any
> real deployment.
