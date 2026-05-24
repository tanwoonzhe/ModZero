# Headscale / WireGuard Foundation

This milestone lays the **scaffolding** for a future private-network data path
based on [Headscale](https://github.com/juanfont/headscale) (open-source
Tailscale control server) and WireGuard. It does **not** replace the current
introspect-per-request HTTP proxy — that is still the only active data path.

## What is in place now

- A feature flag `HEADSCALE_ENABLED` (default `false`).
- Two new tables: `tunnel_nodes`, `tunnel_routes` (metadata only).
- Admin endpoints under `/api/tunnels/*` for listing nodes and managing routes.
- Connector endpoints `POST /api/connectors/{id}/tunnel/register` and
  `POST /api/connectors/{id}/tunnel/heartbeat` (metadata only).
- Optional `MODZERO_WG_ENABLED=true` mode in `connector_runtime` that pings the
  two endpoints — no system routes, no real WireGuard handshake.
- A small admin **Tunnels** page in the dashboard.

## What is NOT in place

- No real Headscale API is called.
- No WireGuard traffic flows.
- No DNS routing, no system route injection, no client-side WG config.
- Routes with `enabled=true` are **not** consulted by the access decision or
  the HTTP proxy.

## Default-off behaviour

When `HEADSCALE_ENABLED=false` (the default), the connector tunnel endpoints
return:

```
HTTP 202
{"status": "disabled"}
```

and write nothing to the database. The 90/90 verification suite is unaffected.

## Optional Headscale env vars

| Variable | Default | Purpose |
|---|---|---|
| `HEADSCALE_ENABLED` | `false` | Feature flag |
| `HEADSCALE_URL` | unset | Future use (not called this milestone) |
| `HEADSCALE_API_KEY` | unset | Future use (not called this milestone) |
| `HEADSCALE_USER` | `modzero` | Headscale v0.23+ namespace/user name |
| `HEADSCALE_POLL_INTERVAL` | `30` | Future use |

`GET /api/tunnels/status` returns only booleans for the URL/key fields —
sensitive values are never echoed.

## Running the optional Headscale service

```bash
docker compose -f deploy/docker-compose.yml \
               -f deploy/docker-compose.headscale.example.yml \
               up -d headscale

docker compose -f deploy/docker-compose.yml \
               -f deploy/docker-compose.headscale.example.yml \
               exec headscale headscale users create modzero

docker compose -f deploy/docker-compose.yml \
               -f deploy/docker-compose.headscale.example.yml \
               exec headscale headscale apikeys create
```

Set the resulting key in your `.env` as `HEADSCALE_API_KEY=...` and toggle
`HEADSCALE_ENABLED=true`, then force-recreate the backend container.

## Verifying

```bash
# (Optional) Bring up Headscale alongside the main stack
docker compose -f deploy/docker-compose.yml \
               -f deploy/docker-compose.headscale.example.yml up -d

# Run the new tunnel scaffold tests (requires HEADSCALE_ENABLED=true in .env
# and `docker compose up -d --force-recreate backend`)
python tools/verify_tunnels.py

# Flip HEADSCALE_ENABLED back to false in .env, force-recreate backend,
# then confirm 90/90:
DEMO_CONNECTOR_PROXY_BASE_URL=http://localhost:18080 python tools/verify_all.py
```

The current data path remains the HTTP proxy. Real WireGuard routing is future
work.

## Read-only sync (Headscale API Adapter milestone)

Once `HEADSCALE_ENABLED=true` and `HEADSCALE_URL` + `HEADSCALE_API_KEY` are
set, the backend can talk to Headscale through a strict **read-only** adapter:

- `GET /api/tunnels/headscale/health` — single probe; returns
  `{enabled, configured, reachable, node_count, error}`. Never 5xx's; never
  echoes the URL, API key, or a raw traceback.
- `POST /api/tunnels/headscale/sync` — pull Headscale's node list and merge it
  into existing `TunnelNode` rows. **Never creates orphan rows.** Match
  priority:
  1. `headscale_node_id` (most specific)
  2. `node_name` — only when exactly one existing `TunnelNode` matches
  3. otherwise — count under `skipped`, do **not** insert

  Response shape:
  ```json
  { "status": "ok|disabled|not_configured|unreachable",
    "synced_nodes": 1, "created": 0, "updated": 1,
    "skipped": 0, "errors": 0, "last_sync_at": "..." }
  ```

- `GET /api/tunnels/status` now also returns `headscale_reachable` and
  `last_sync_at`. These come from cached state — `/status` does **not** call
  Headscale on every request, so it stays fast even when Headscale is down.
  Refresh reachability by clicking **Check Headscale** or **Sync Nodes** in
  the admin UI.

The admin Tunnels page renders a Headscale status card with Enabled / Configured
/ Reachable / Node count / Last sync, plus the two action buttons. Both buttons
are disabled when `HEADSCALE_ENABLED=false`.

### Enable, run, disable

```bash
# Enable
# In project root .env, set:
#   HEADSCALE_ENABLED=true
#   HEADSCALE_URL=http://your-headscale:8080
#   HEADSCALE_API_KEY=<bearer key from `headscale apikeys create`>
cd deploy && docker compose up -d --force-recreate backend && cd ..

# Probe + sync
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/tunnels/headscale/health
curl -s -X POST -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/tunnels/headscale/sync

# Disable again — restores byte-identical default-off behaviour
# In .env: HEADSCALE_ENABLED=false  (you may leave URL/API_KEY in place)
cd deploy && docker compose up -d --force-recreate backend && cd ..
```

### Fixture-based testing (no real Headscale needed)

To exercise the sync code path without running a Headscale server, the adapter
honours a **double-guarded** fixture override:

| Variable                            | Purpose                                                |
|-------------------------------------|--------------------------------------------------------|
| `MODZERO_ALLOW_HEADSCALE_FIXTURE=1` | Master enable. Required for the fixture to be read.    |
| `HEADSCALE_TEST_FIXTURE=<path>`     | Path **inside the backend container** to a JSON file.  |

The fixture file is a JSON list of raw Headscale node dicts (or
`{"nodes": [...]}`). The repo ships a starter at
`backend/app/_test_fixtures/headscale_nodes.json`, which is bind-mounted to
`/app/app/_test_fixtures/headscale_nodes.json` inside the container.

```bash
# In project root .env:
#   HEADSCALE_ENABLED=true
#   HEADSCALE_URL=http://does-not-need-to-be-real:8080
#   HEADSCALE_API_KEY=ignored-by-fixture-path
#   MODZERO_ALLOW_HEADSCALE_FIXTURE=1
#   HEADSCALE_TEST_FIXTURE=/app/app/_test_fixtures/headscale_nodes.json
#   MODZERO_RUN_FIXTURE_TESTS=1
cd deploy && docker compose up -d --force-recreate backend && cd ..
python tools/verify_tunnels.py
```

`verify_tunnels.py` will write a fresh fixture (with a matching `node_name` for
its registered test node, plus one deliberately-unmatched node) into the same
path on the host before calling `/sync`, then assert:

- `updated=1`, `created=0`, `skipped=1`, `errors=0`
- the matched `TunnelNode` row now carries the synced `headscale_node_id` and
  `wireguard_ip`
- the unmatched Headscale node did **not** add a new row
- `/api/tunnels/status` reports `headscale_reachable=true` and `last_sync_at`
  populated

### Scope reminder

Sync is read-only. It never:

- creates new `TunnelNode` rows from Headscale data (connectors must register
  themselves via `/api/connectors/{id}/tunnel/register` first)
- modifies system routes or WireGuard configuration
- alters the access-decision or HTTP proxy flow
- talks to Headscale outside of `/headscale/health` and `/headscale/sync`

## Manual bootstrap (this milestone)

The bootstrap endpoint is a **document generator**. It does **not** SSH into
the connector, run `tailscale up`, modify routes, install WireGuard, or
contact the connector in any way. It returns a copy-paste join command that
the operator runs by hand on the connector host.

### What the controller does

`POST /api/tunnels/bootstrap/{connector_id}` (admin):

| Flag / config                                                 | HTTP | `status`         | Body extras                                       | Audit row |
|---------------------------------------------------------------|------|------------------|---------------------------------------------------|-----------|
| `HEADSCALE_ENABLED=false`                                     | 202  | `disabled`       | warnings only                                     | no        |
| enabled, `HEADSCALE_URL` or `HEADSCALE_API_KEY` missing       | 200  | `not_configured` | warnings only                                     | yes       |
| enabled + configured (default; or `force_manual=true`)        | 200  | `ok`             | `login_server`, manual `join_command` (no key)    | yes       |
| enabled + configured + `HEADSCALE_BOOTSTRAP_TRY_API=true` + Headscale preauth-key API succeeds | 200 | `ok` | `login_server`, `join_command` with `--authkey=`, `auth_key`, `expires_at` (one-shot) | yes (sha256 hash) |
| ditto, but Headscale preauth-key endpoint fails / wrong shape | 200  | `ok`             | manual `join_command` + a fallback warning        | yes       |

Storage invariants:

- The raw preauth key is returned **exactly once** in the response body and is
  never persisted. The audit row stores only `sha256(key)` hex.
- The literal `HEADSCALE_API_KEY` value is never returned in any bootstrap
  response and never logged.
- `GET /api/tunnels/bootstrap/logs?limit=N` (admin, max 50) returns sanitized
  rows. `auth_key_hash` is intentionally omitted from the response shape — it
  stays in the database for forensic use only.

### How an operator uses it

```bash
# 1. Request a bootstrap document from the controller
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' \
  http://localhost:8000/api/tunnels/bootstrap/$CONNECTOR_ID
```

or click **Bootstrap** on the relevant row in the dashboard Tunnels page.

```bash
# 2. SSH to the connector host and paste the join_command from the response
ssh modzero@connector-host
# Review the command before running it. --accept-routes=false and
# --accept-dns=false are intentional this milestone.
sudo tailscale up \
  --login-server=http://your-headscale:8080 \
  --hostname=connector-abc12345 \
  --advertise-tags=tag:modzero-connector \
  --accept-routes=false \
  --accept-dns=false

# 3. Register the node on the Headscale server (out of band)
headscale --user modzero nodes register --key <mkey:...>

# 4. Back in the dashboard, click "Sync Nodes" on the Tunnels page.
#    The matching TunnelNode row will gain headscale_node_id and wireguard_ip.
```

### Manual mode by default

The optional Headscale preauth-key API path is **off** by default. To enable:

```bash
# .env
HEADSCALE_ENABLED=true
HEADSCALE_URL=http://your-headscale:8080
HEADSCALE_API_KEY=<bearer key>
HEADSCALE_BOOTSTRAP_TRY_API=true
```

If the Headscale preauth-key endpoint is unreachable, returns a non-2xx, or
returns an unrecognized JSON shape, the controller falls back to manual mode
and surfaces a warning in the response. Admins can also pass
`{"force_manual": true}` in the request body to bypass the API path on a
per-request basis.

### Local helper (read-only, no shell-outs)

The connector_runtime ships two read-only CLI helpers:

```bash
python -m connector_runtime wg status        # prints local config + state
python -m connector_runtime wg instructions  # prints the manual join template
```

Both print text only. Neither runs `tailscale`, `wg`, `ip`, `netsh`, or any
other privileged binary. `wg instructions` never contains a baked-in
`--authkey=` value — concrete values come from the dashboard Bootstrap action.

### Out of scope (still)

The controller never:

- runs `tailscale up`,
- modifies system routes or WireGuard configuration,
- approves or advertises Headscale routes,
- alters DNS,
- changes the access-decision or HTTP proxy data path.

The HTTP proxy remains the only active data path.


---

## WireGuard Route Lifecycle

This milestone adds **route lifecycle management**: detecting local WireGuard state, generating advertise packages, syncing route status from Headscale, and controlled route approval. The HTTP proxy remains the only active data path throughout.

### `wg detect` — read-only local tailscale detection

```
python -m connector_runtime wg detect
```

**Invariants:**
- Never runs `tailscale up`, `tailscale set`, `ip route`, `netsh`, or `wg set`.
- Always exits 0, even when tailscale is not installed.
- Only issues `tailscale status --json` and `tailscale ip -4` (both read-only queries).

**Example output (tailscale not installed):**
```
ModZero Connector Runtime — WG Detect (read-only)
  status         : not_installed
  tailscale_path : not_found
  node_name      : (none)
  wireguard_ip   : (none)
```

**Optional report-back:** When `MODZERO_WG_ENABLED=true` and a state file exists, the command sends a tunnel heartbeat to the controller with `status=degraded` (mapped from `not_installed`) or the actual `online`/`offline`/`degraded` state. The raw "not_installed" string is never sent to the backend — it is mapped to `degraded`.

### Route metadata lifecycle

| Status | Meaning |
|---|---|
| `pending` | Route created in ModZero but not yet seen by Headscale |
| `advertised` | Headscale sync confirmed the route is advertised but not enabled |
| `approved` | Headscale sync or API confirmed the route is enabled |
| `disabled` | Route administratively disabled in ModZero |
| `unavailable` | Route previously seen but no longer present in Headscale |

The `route_status` field is set **only** by:
1. `POST /api/tunnels/headscale/sync-routes` (sync from Headscale)
2. `POST /api/tunnels/routes/{id}/approve` (on confirmed API success)

The advertise-package action saves `advertise_command` but does **not** change `route_status`.

### Advertise package

```bash
curl -X POST http://localhost:8000/api/tunnels/routes/{route_id}/advertise-package \
  -H "Authorization: Bearer $TOKEN"
```

Returns a `manual_command` to run on the connector host:
```
tailscale up \
  --login-server=<HEADSCALE_URL> \
  --advertise-routes=10.0.0.0/24 \
  --accept-routes=false \
  --accept-dns=false
```

**When `HEADSCALE_ENABLED=false`:** Returns HTTP 200 with a warning that the command is for reference only and a `{LOGIN_SERVER}` placeholder if `HEADSCALE_URL` is not configured. The response never contains `HEADSCALE_API_KEY` or any auth key.

### Route sync (`sync-routes`)

```bash
curl -X POST http://localhost:8000/api/tunnels/headscale/sync-routes \
  -H "Authorization: Bearer $TOKEN"
```

**Behavior matrix:**

| Condition | HTTP | `status` |
|---|---|---|
| `HEADSCALE_ENABLED=false` | 202 | `disabled` |
| URL or API key missing | 202 | `not_configured` |
| Headscale unreachable / auth error | 200 | `unreachable` |
| Success | 200 | `ok` |

**Matching logic:** For each Headscale route, match `subnet_or_host == prefix` AND cross-reference `TunnelNode.headscale_node_id == node_ref`. If `node_ref` is `null` and exactly one candidate exists, use it. If multiple candidates exist and `node_ref` is `null`, skip — ModZero never guesses which connector owns a route.

**Fixture-based testing** (no real Headscale server needed):
```bash
# In .env:
HEADSCALE_ENABLED=true
MODZERO_ALLOW_HEADSCALE_FIXTURE=1
HEADSCALE_ROUTE_TEST_FIXTURE=/app/app/_test_fixtures/headscale_routes.json
```

### Controlled route approval

```bash
curl -X POST http://localhost:8000/api/tunnels/routes/{route_id}/approve \
  -H "Authorization: Bearer $TOKEN"
```

Seven ordered safety checks must pass before any action is taken:

1. `HEADSCALE_ENABLED=true` — else HTTP 400
2. Headscale URL and API key configured — else HTTP 400
3. Route exists — else HTTP 404
4. Route is enabled in ModZero — else HTTP 400
5. Connector has a Headscale node registered (run sync first) — else HTTP 409
6. `route_status == "advertised"` — else HTTP 409
7. `headscale_route_id` is set (run sync-routes first) — else HTTP 409

**Try-API mode** (requires `HEADSCALE_BOOTSTRAP_TRY_API=true` in `.env`): Calls `POST /api/v1/routes/{id}/enable` on Headscale. On success, sets `route_status=approved`. On failure, falls through to manual mode.

**Manual-required mode** (default): Returns the manual command to run on the Headscale server:
```
headscale routes enable -r {headscale_route_id}
```
`route_status` is NOT changed to `approved` in manual mode — only sync or API success can do that.

### Scope reminder

The HTTP proxy remains the only active data path. This milestone adds metadata tracking, tooling, and admin UI for the route lifecycle. No system routes are modified, no WireGuard handshakes are initiated.

### Verify after changes

```bash
# Confirm baseline 90/90 (HEADSCALE_ENABLED=false)
cd deploy && docker compose up -d --force-recreate backend && cd ..
DEMO_CONNECTOR_PROXY_BASE_URL=http://localhost:18080 python tools/verify_all.py
# expect: PASSED 90

# Route lifecycle tests
python tools/verify_tunnels.py
# expect: N (202 disabled) + O (route_status=pending) + P + Q PASS

# Smoke tests
python connector_runtime/tests/test_smoke.py

# Frontend build
cd frontend && npm run build
```

## Tunnel-Aware Access Decisions

The "Tunnel Access Integration & Policy Control" milestone adds tunnel
awareness to the access decision flow without changing the HTTP proxy data
path. The HTTP proxy remains the only active data path; tunnel readiness is
reported alongside the existing HTTP session so admins and end-users can see
whether a WireGuard tunnel is also available.

### Overview

Three additive fields on `ProtectedResource` express per-resource tunnel
intent. They are all optional with safe defaults, so existing resources
continue to behave exactly as before.

- **`preferred_access_mode`** — `"auto" | "http_proxy" | "wireguard_tunnel"`.
  - `auto` (default) lets the server pick: if the tunnel is ready the
    response advertises mode `both` (HTTP session is still minted as today,
    the client may dial the tunnel target instead); otherwise it falls back
    to HTTP proxy.
  - `http_proxy` always issues an HTTP proxy session and never advertises a
    tunnel target, even if the tunnel is ready.
  - `wireguard_tunnel` prefers the tunnel; behaviour when the tunnel is not
    ready depends on `require_tunnel` and `allow_http_fallback`.
- **`require_tunnel`** — when `true`, the resource refuses to accept HTTP
  proxy access unless `allow_http_fallback` is also `true`. Combined with
  `preferred_access_mode="http_proxy"` this is incoherent and rejected with
  HTTP 422 at create/update time.
- **`allow_http_fallback`** — when `true` and the tunnel is unavailable,
  the server still issues an HTTP proxy session and marks the decision
  `fallback_used=True`. When `false` together with `require_tunnel=True`
  and the tunnel is not ready, access is denied.

### Decision matrix

`tunnel_ready` is `true` only when the flag is on, a tunnel route is enabled
for the resource, and the connector's tunnel node is online.

| preferred_access_mode | require_tunnel | allow_http_fallback | tunnel_ready | access_mode      | decision | notes                                                  |
|-----------------------|----------------|---------------------|--------------|------------------|----------|--------------------------------------------------------|
| auto                  | false          | true                | true         | both             | allow    | HTTP session minted; tunnel_target also returned       |
| auto                  | false          | true                | false        | http_proxy       | allow    | tunnel_ready=false, fallback_used=false                |
| auto                  | true           | true                | false        | http_proxy       | allow    | fallback_used=true; audit `http_fallback_used`         |
| auto                  | true           | false               | false        | denied           | deny     | reason contains tunnel_reason                          |
| http_proxy            | false          | true                | true         | http_proxy       | allow    | tunnel ignored by design                               |
| http_proxy            | false          | true                | false        | http_proxy       | allow    | tunnel ignored by design                               |
| http_proxy            | true           | *                   | *            | (create rejected)| —        | 422 at create/update — incoherent combo                |
| wireguard_tunnel      | *              | *                   | true         | wireguard_tunnel | allow    | No AccessSession row; client dials `tunnel_target`     |
| wireguard_tunnel      | true           | false               | false        | denied           | deny     | reason contains tunnel_reason                          |
| wireguard_tunnel      | *              | true                | false        | http_proxy       | allow    | fallback_used=true; audit `http_fallback_used`         |

When `access_mode == "wireguard_tunnel"` the response sets `session_id`,
`access_token`, `access_url`, `fallback_access_url`, and `expires_at` to
`null` — no HTTP session is minted. For every other allow path the HTTP
session fields are populated exactly as today.

### Electron client readiness

The Electron desktop app reports the local tailscale state via the read-only
helper `client-app/src/main/tunnel-detect.ts`. The status is one of:

- **`not_installed`** — the `tailscale` binary cannot be found on PATH or any
  well-known install location.
- **`installed_not_joined`** — the binary is present but `tailscale status
  --json` reports `BackendState != "Running"`.
- **`joined`** — `Self.Online === true` and a tailnet IP is present.
- **`unknown`** — detection produced an error; the UI shows a soft retry.

The client never installs anything, never calls `tailscale up`, `tailscale
set`, `tailscale login`, `tailscale logout`, and never touches routes or DNS.
Detection is strictly read-only and capped at ~10 s.

### User device enrollment / join package

`POST /api/tunnels/user-enrollment` returns the manual instructions an
end-user needs to join the tailnet. It is **manual-only**: the server never
calls Headscale, never issues a pre-auth key, never returns a real key, and
never makes any external HTTP request. The administrator manually creates a
pre-auth key in Headscale out-of-band and gives it to the user; the user
substitutes it for the literal `{AUTH_KEY}` placeholder in the returned
command.

`manual_command` template (always single-line, always uses the placeholder):

```
tailscale up --login-server=<HEADSCALE_URL> --authkey={AUTH_KEY} --hostname=<node> --accept-routes --accept-dns=false
```

Response shape (`UserEnrollmentOut`):

| field                 | type           | meaning                                              |
|-----------------------|----------------|------------------------------------------------------|
| `status`              | string         | `disabled` / `not_configured` / `manual_required`    |
| `login_server`        | string \| null | populated only when configured                       |
| `suggested_node_name` | string \| null | hint sent by client or `user-<8-hex>`                |
| `manual_command`      | string         | always present; contains `{AUTH_KEY}` literal        |
| `instructions`        | string[]       | ordered, plain-language steps for the end-user       |
| `safe_message`        | string         | human summary suitable for display                   |

There is no `auth_key` field on the response. There is no API path that
returns or persists a real key.

Example:

```bash
curl -sS -X POST http://localhost:8000/api/tunnels/user-enrollment \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"node_name_hint": "alice-laptop"}'
# {
#   "status": "manual_required",
#   "login_server": "http://headscale.internal:8080",
#   "suggested_node_name": "alice-laptop",
#   "manual_command": "tailscale up --login-server=http://headscale.internal:8080 --authkey={AUTH_KEY} --hostname=alice-laptop --accept-routes --accept-dns=false",
#   "instructions": ["Install Tailscale on this device...", "..."],
#   "safe_message": "Run the command below..."
# }
```

When `HEADSCALE_ENABLED=false` the call returns HTTP 202 with
`status="disabled"`; when the flag is on but `HEADSCALE_URL` is empty it
returns HTTP 202 with `status="not_configured"`. The `manual_command` is
always populated and always contains the `{AUTH_KEY}` placeholder.

### Audit log actions

`GET /api/tunnels/audit` (admin-only) returns `TunnelAccessAuditLog` rows.
Allowed `action` values:

- **`tunnel_ready_reported`** — tunnel was ready and used (or available
  alongside HTTP when `access_mode="both"`).
- **`tunnel_required_denied`** — `require_tunnel=true` with
  `allow_http_fallback=false` and the tunnel was not ready, so the decision
  became `deny`.
- **`http_fallback_used`** — the preferred tunnel was unavailable and the
  server fell back to issuing an HTTP proxy session.
- **`user_enrollment_requested`** — a user fetched join instructions from
  `POST /api/tunnels/user-enrollment`.
- **`session_revoked_with_tunnel`** — an AccessSession that carried tunnel
  context (`access_mode in {"wireguard_tunnel", "both"}`) was revoked.

### Revocation semantics

> **Revocation semantics**: The HTTP proxy supports per-session, per-resource
> revocation by deleting the AccessSession row. WireGuard tunnel access is
> **coarse-grained**: removing a single user-resource pairing requires either
> disabling the underlying tailnet route (which affects every user sharing
> that route) or expiring the user's tailnet node entirely (which revokes
> ALL of that user's tunnel access). There is no per-(user, resource) tunnel
> revocation primitive. For least-privilege revocation, prefer HTTP proxy
> access.

### Verification

```bash
# Flag off baseline
python tools/verify_all.py            # expect 90/90
python tools/verify_tunnels.py        # expect 61/61 unchanged
python tools/verify_tunnel_access.py  # expect A-D, I, K-P PASS; E-H, J SKIP

# Flag on
docker compose -f deploy/docker-compose.yml exec backend alembic upgrade head
python tools/verify_tunnel_access.py  # expect 16/16 PASS
```
