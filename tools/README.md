# ModZero Tools

Demo scripts for testing and verifying the ModZero self-hosted ZTNA stack.

---

## Requirements

- Python 3.8+
- `requests` library

```bash
pip install requests
```

---

## Quick Start

### 1. Seed demo data

Run once after a fresh database to create demo resources, connector resources, and the demo network:

```bash
python tools/seed_demo_data.py
```

Creates:
- **AlphaTechs Intranet** — web resource requiring active connector (min trust 60)
- **Finance Portal** — web resource with min trust 101 (always denied for test purposes)
- **Disabled HR Archive** — disabled resource (always denied)

---

### 2. Run the connector simulator

Generate an enrollment token from the admin dashboard → **Connectors** → **Deploy Connector**.

```bash
# Enroll and start heartbeating (saves credentials to connector_state.json)
python tools/connector_sim.py --token <YOUR_TOKEN> --network alphatechs-net

# Resume after restart (no new token needed)
python tools/connector_sim.py --resume
```

---

### 3. Run with demo proxy server

The proxy simulator lets the Electron client open a real browser page when access is granted.

#### Step 1 — Set the env var in `.env` (project root)

```env
DEMO_CONNECTOR_PROXY_BASE_URL=http://localhost:18080
```

#### Step 2 — Restart the backend so it picks up the env var

```bash
cd deploy && docker compose restart backend
```

#### Step 3 — Start connector sim with proxy flag

```bash
python tools/connector_sim.py --resume --proxy
```

Output:
```
[HH:MM:SS] OK   Proxy server → http://localhost:18080/access/{session_id}?token={token}
[HH:MM:SS]      Session token appears in URL query string — demo use only.
```

#### Step 4 — Request access from Electron client

- Open the Electron client → **Request Access** on AlphaTechs Intranet
- Response shows: `ALLOW` + expiry badge + **Open Access Session** button
- Click the button → browser opens `http://localhost:18080/access/{session_id}?token=...`
- Proxy calls backend introspect → returns **Access Granted** page showing resource details

#### Step 5 — Check Sessions page

Admin dashboard → **Sessions** → **Last Introspected** column updates after each browser open.

---

## All connector_sim.py options

| Flag | Default | Description |
|------|---------|-------------|
| `--backend` | `http://localhost:8000` | Backend base URL |
| `--token` | *(required first run)* | One-time enrollment token |
| `--name` | `sim-connector` | Connector name hint |
| `--network` | `default` | Network label |
| `--interval` | `10` | Heartbeat interval (seconds) |
| `--resume` | — | Skip enrollment, reuse saved state |
| `--enroll-only` | — | Enroll and print credentials, then exit |
| `--proxy` | — | Run local demo proxy server (port 18080) |
| `--proxy-port` | `18080` | Proxy listen port |

---

## Status thresholds (backend logic)

| Status | Condition |
|--------|-----------|
| **online** | Last heartbeat < 30 s ago |
| **degraded** | Last heartbeat 30–60 s ago |
| **offline** | Last heartbeat > 60 s ago |

---

## Access decision test cases (A–D)

Run `seed_demo_data.py` first to create the required resources.

| # | Condition | Resource | Expected |
|---|-----------|----------|----------|
| A | Score meets minimum, connector **online** | AlphaTechs Intranet (min 60) | `allow` |
| B | Score meets minimum, connector **offline** | AlphaTechs Intranet (min 60) | `deny` — Connector is offline |
| C | Score **below** required minimum | Finance Portal (min 101) | `deny` — Trust score X.X below required 101.0 |
| D | Resource **disabled** | Disabled HR Archive | `deny` — Resource is disabled |

### Test C note

Finance Portal is seeded with `minimum_trust_score = 101` so trust score denial is triggered regardless of device score (max is 100).

---

## Access session tests (A–F)

Covered by `tools/verify_all.py`. Run after bringing connector A online.

| Test | Scenario | Expected |
|------|----------|----------|
| A | Request access (connector online) → ALLOW | `session_id`, `access_token`, `expires_at` present |
| B | Introspect valid session | `active=true`, `resource_name` set |
| C | Revoke → introspect | `active=false`, `reason=session_revoked` |
| D | Disable resource → introspect | `active=false`, `reason=resource_unavailable` |
| E | Wrong token → introspect | `active=false`, `reason=token_mismatch` |
| F | Connector B introspects session bound to A | `active=false`, `reason=connector_mismatch` |

---

## Proxy tests (A–F)

Run when `connector_sim.py --proxy` is running. `verify_all.py` skips these automatically if proxy is not reachable.

| Test | Scenario | Expected |
|------|----------|----------|
| A | Request access → check `access_url` | Starts with `http://localhost:18080/access/` |
| B | GET `access_url` (active session) | HTTP 200, HTML shows "Access Granted" |
| C | Revoke → GET `access_url` | HTTP 403, body contains `session_revoked` |
| D | Disable resource → GET `access_url` | HTTP 403, body contains `resource_unavailable` |
| E | GET with wrong token | HTTP 403, body contains `token_mismatch` |
| F | Stop `connector_sim.py` → open `access_url` | Browser: connection refused (manual test) |

---

## Real HTTP Proxy Demo

Upgrades the status-page proxy into a real HTTP forwarder. After introspect
succeeds, the proxy fetches `{protocol}://{target_host}:{target_port}{path}` and
mirrors the upstream response back to the browser.

### Routes

| Route | Methods | Behavior |
|-------|---------|----------|
| `/access/{session_id}` | GET | Status page (now contains an "Open proxied resource" link) |
| `/access/{session_id}/proxy/` and `/access/{session_id}/proxy/{path...}` | GET, HEAD, POST | Introspect → forward to target |

### Setup

```bash
# 1. project root .env
DEMO_CONNECTOR_PROXY_BASE_URL=http://localhost:18080

# 2. recreate backend (restart does NOT reload env vars)
cd deploy && docker compose up -d --force-recreate backend

# 3. run sim with proxy
python tools/connector_sim.py --resume --proxy
```

From the Electron client: **Request Access → ALLOW → Open Access Session →
"Open proxied resource"** opens the actual `alphatechs.top` page in the same
browser tab (or an upstream error page if the target is unreachable).

### Safety limits

- 8 s upstream timeout
- 2 MB upstream response cap
- 1 MB request body cap (POST)
- Hop-by-hop headers stripped both directions
- Sensitive client headers stripped upstream: `Cookie`, `Authorization`,
  `Proxy-Authorization`, `X-ModZero-Access-Token`
- Upstream `Location` headers are **not** forwarded (prevents leaking internal
  target URLs to the browser)
- Token never logged — query string and headers are redacted
- Upstream URL is built **only** from introspect; user-supplied host/scheme is
  ignored

---

## Real Proxy tests (A–F)

`verify_all.py` runs these only when `connector_sim.py --proxy` is reachable.

| Test | Scenario | Expected |
|------|----------|----------|
| A | Status page advertises proxy link | HTTP 200, body contains "Access Granted" AND "Open proxied resource" |
| B | `/proxy/` executes forward (lenient) | Body does NOT contain "Access Granted"; status is 2xx/3xx OR 502/504 |
| C | Revoke → `/proxy/` | HTTP 403, body contains `session_revoked` |
| D | Wrong token → `/proxy/?token=WRONG` | HTTP 403, body contains `token_mismatch` |
| E | Disable resource → `/proxy/` | HTTP 403, body contains `resource_unavailable`, then re-enable |
| F | `Host: evil.example.com` injection ignored | Status 2xx/3xx or 502/504; response never contains evil host marker |

---

## Running the full verification suite

```bash
# With proxy running (all tests):
DEMO_CONNECTOR_PROXY_BASE_URL=http://localhost:18080 python tools/verify_all.py

# Without proxy (Access Session tests only — Proxy tests skipped):
python tools/verify_all.py
```

Expected output: `PASSED: 46` (without proxy) or `PASSED: 80+` (with proxy + Real HTTP Proxy tests).

---

## Files

| File | Purpose |
|------|---------|
| `connector_sim.py` | Connector simulator with optional proxy server |
| `seed_demo_data.py` | Demo seed / reset script |
| `verify_all.py` | Full verification suite (access sessions + proxy) |
| `test_connector_mismatch.py` | Standalone connector mismatch test |
| `connector_state.json` | Saved connector credentials (auto-created, gitignored) |

---

## .env location note

`DEMO_CONNECTOR_PROXY_BASE_URL` must be set in the **project root `.env`**
(`d:/degree/sem6/code/ModZero/.env`) — same file as `DATABASE_URL`, `SECRET_KEY`, etc.

`deploy/docker-compose.yml` uses `env_file: path: ../.env` which loads the project root `.env`
directly into the backend container. **Do not** put this variable in `deploy/.env` — it will have
no effect on the backend container.

After editing `.env`, recreate the backend container (a plain restart does not reload env vars):
```bash
cd deploy && docker compose up -d --force-recreate backend
```
