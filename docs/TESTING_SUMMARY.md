# ModZero — Testing Summary

**Verification date:** 2026-05-24  
**Branch:** `refactor/self-hosted-ztna`  
**DB migration head:** `i9j0k1l2m3n4`

---

## Overall Results

| Suite | Script | Pass | Skip | Fail | Total |
|---|---|---|---|---|---|
| Full platform | `tools/verify_all.py` | **90** | 0 | 0 | 90 |
| Tunnel foundation | `tools/verify_tunnels.py` | **61** | 0 | 0 | 61 |
| Tunnel-aware access | `tools/verify_tunnel_access.py` | **8** | 8 | 0 | 16 |
| Connector runtime smoke | `connector_runtime/tests/test_smoke.py` | **21** | 0 | 0 | 21 |
| Frontend build (Vite) | `cd frontend && npm run build` | clean | — | — | — |
| Electron TS compile | `cd client-app && npm run build:main` | clean | — | — | — |
| Electron package | `cd client-app && npm run package:win:portable` | written | — | — | — |

---

## verify_all.py — 90 Checks

Pre-requisite: `connector_sim.py --resume --proxy` running on port 18080.

| Group | Checks | What is verified |
|---|---|---|
| Login | 2 | `POST /api/auth/login` returns JWT, health check passes |
| Setup | 4 | Connector state file loads, heartbeat succeeds, resource IDs resolve |
| Test C — Trust Score Denial | 5 | Finance Portal (min=101) returns `decision=deny`, correct reason, correct score |
| Session Test A — Allow | 8 | AlphaTechs Intranet returns `decision=allow`, all session fields present, access_url safe format |
| Session Test B — Introspect | 4 | Valid session → `active=true`, resource name, expiry present |
| Session Test C — Revoke | 4 | Revoked session → `active=false`, `reason=session_revoked` |
| Session Test D — Disable resource | 7 | Disabled resource → introspect → `resource_unavailable`; re-enable restores allow |
| Session Test E — Wrong token | 5 | Token mismatch → `reason=token_mismatch` |
| Session Test F — Connector mismatch | 8 | Session bound to connector A rejected by connector B → `connector_mismatch` |
| Proxy Tests A–F | 6 | access_url uses proxy base; 403 on revoke/disable/wrong-token via proxy |
| Real Proxy Tests A–F | 37 | HTTP forwarding to intranet; revoke/disable/token/host-injection enforcement |

---

## verify_tunnels.py — 61 Checks

| Group | Checks | What is verified |
|---|---|---|
| Login | 2 | Admin JWT |
| Connector setup | 3 | Connector state loaded, heartbeat confirms online |
| Test D.1 — Tunnel status shape | 4 | `GET /api/tunnels/status` shape; no secrets leaked |
| Test B — Tunnel register | 5 | `POST /connectors/{id}/tunnel/register` → node row created; shape correct |
| Test B' — Path-id mismatch | 2 | Mismatched connector id in path → 403 |
| Test C — Tunnel heartbeat | 6 | `POST /connectors/{id}/tunnel/heartbeat` updates `last_seen_at`, shape correct |
| Test D.2 — Routes CRUD | 8 | Create/read/update/delete tunnel route; idempotent; bad route_type rejected |
| Test E — Route isolation | 3 | Enabled tunnel route has no effect on existing HTTP proxy access decision |
| Test A — Headscale health (flag off) | 3 | `/api/tunnels/headscale/health` returns disabled status; no secrets |
| Test B (sync) — Headscale sync (flag off) | 4 | `/api/tunnels/headscale/sync` returns 503 or disabled shape; no crash |
| Tests C–G — Headscale adapter | 8 | Pre-auth key, node list, route list, route enable — all return safe shapes or 503 |
| Tests H–M — Bootstrap endpoint | 9 | `GET /connectors/{id}/wg/bootstrap` returns script, safe fields, correct connector binding |
| Test N — Sync-routes shape | 3 | POST sync-routes returns expected shape |
| Test O — route_status default | 3 | New route has `route_status=pending` |
| Test P — Advertise-package | 4 | POST routes/{id}/advertise-package returns command package; no secrets |
| Test Q — Approve safety checks | 3 | Approve without real Headscale returns 400 (flag off guard) |

---

## verify_tunnel_access.py — 16 Checks

| Test | Description | Result | Condition |
|---|---|---|---|
| A | Resource policy defaults: `auto`, `require_tunnel=false`, `allow_http_fallback=true` | **PASS** | Always |
| B | Reject invalid `preferred_access_mode` value → 422 | **PASS** | Always |
| C | Reject incoherent combo: `http_proxy` + `require_tunnel=true` → 422 | **PASS** | Always |
| D | Flag-off: `access_mode=http_proxy`, `tunnel_ready=false`, `tunnel_reason` starts "Tunnel disabled" | **PASS** (flag off) / SKIP (flag on) | `HEADSCALE_ENABLED=false` |
| E | Flag-on, `preferred=http_proxy`: HTTP proxy session issued regardless of tunnel state | SKIP | Requires live connector tunnel node |
| F | Flag-on, `preferred=auto`, no tunnel route: `tunnel_ready=false`, `fallback_used=false`, session issued | SKIP | Requires live connector tunnel node |
| G | Flag-on, `require_tunnel=true`, `allow_http_fallback=false`, not ready: `decision=deny` | SKIP | Requires live connector tunnel node |
| H | Flag-on, `require_tunnel=true`, `allow_http_fallback=true`, not ready: `access_mode=http_proxy`, `fallback_used=true`, audit row created | SKIP | Requires live connector tunnel node |
| I | Flag-off: enrollment returns HTTP 202, `status=disabled`, `manual_command` present with `{AUTH_KEY}` | **PASS** (flag off) / SKIP (flag on) | `HEADSCALE_ENABLED=false` |
| J | Flag-on: enrollment returns HTTP 200, `status=manual_required`, no `auth_key` field | SKIP (flag off) / **PASS** (flag on) | `HEADSCALE_ENABLED=true` |
| K | Secret hygiene: response body contains no `tskey-`, no `HEADSCALE_API_KEY` literal, no test sentinel | **PASS** | Always |
| L | `AccessRequestLog` rows from D/H persist `access_mode`, `tunnel_ready`, `require_tunnel_at_decision`, `fallback_used` | SKIP | Depends on D/H running |
| M | `GET /api/tunnels/audit` returns list shape; `http_fallback_used` row present if H ran | **PASS** | Always (empty list when H skipped) |
| N | `GET /api/tunnels/audit` rejects unauthenticated request → 401/403 | **PASS** | Always |
| O | Resource PUT round-trips all three tunnel policy fields correctly | **PASS** | Always |
| P | Reminder to run `verify_all.py` + `verify_tunnels.py` separately | SKIP | By design — prints instruction |

**Skip reason for E–H, L:** These tests require a `TunnelNode` row with `status=online` linked to an enrolled connector, which in turn requires a live Headscale control plane. In the local development environment without Headscale, `_evaluate_tunnel_readiness()` always returns `tunnel_ready=false` with no route rows, so the conditional branches under test cannot be exercised. The tests skip gracefully with an explicit message rather than failing.

---

## connector_runtime smoke — 21 Checks

| Group | Checks | What is verified |
|---|---|---|
| Imports | 1 | All modules importable; version string present |
| Config defaults | 3 | `backend_url`, `proxy_port` type, `heartbeat_interval` |
| Env override | 2 | `MODZERO_BACKEND_URL` trailing-slash strip; `MODZERO_PROXY_PORT` int cast |
| State round-trip | 4 | `state_exists`, `save_state`, `load_state` with temp directory |
| ControllerClient | 1 | Constructs without network call |
| ProxyServer | 1 | Constructs without binding |
| WgLoop | 1 | Constructs; `node_name` stored |
| Redaction | 2 | `redact()` returns `[REDACTED]`; `redact_url()` strips token |
| Parser | 3 | `wg status`, `wg instructions`, `wg detect` subcommands parse correctly |
| WG instructions template | 2 | Contains manual-instructions phrase; does not contain `--authkey=` |
| WG detect | 1 | Returns exit 0 when tailscale not installed |

---

## Build Artefacts

| Artefact | Location | Status |
|---|---|---|
| React admin UI | `frontend/dist/` | ✓ 1193 modules, 0 errors |
| Electron compiled JS | `client-app/dist-main/` | ✓ clean TypeScript |
| Electron portable app | `client-app/release/ModZero-win32-x64/` | ✓ packaged with asar |
