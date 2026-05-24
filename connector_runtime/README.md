# ModZero Connector Runtime

Customer-side ModZero connector. Enrolls with the controller, sends heartbeats,
and (optionally) serves a local HTTP proxy that validates every request via
the controller's `introspect` endpoint before forwarding to a protected resource.

This is the **demo model** (introspect-per-request, `/access/{id}/proxy/{path}`).
It does not include WireGuard, Headscale, DNS routing, or production hardening.

---

## Related components

| Location | Purpose |
|----------|---------|
| `connector_runtime/` (this folder) | New customer-facing runtime (demo model) |
| `tools/connector_sim.py` | Single-file simulator used by the 90/90 verification suite |
| `connector/` | Legacy aiohttp + JWT + path_prefix runtime wired into `deploy/docker-compose.yml` |

The runtime here is independent of the other two. It will not affect the
existing test suite or compose deployment.

---

## Quick start (Python)

Requirements: Python 3.10+, `pip install -r connector_runtime/requirements.txt`.

```bash
# 1. From the admin dashboard, create an enrollment token:
#    Dashboard → Connectors → Deploy Connector

# 2. Enroll (prints connector_id + connector_secret ONCE)
python -m connector_runtime enroll \
    --token <ENROLLMENT_TOKEN> \
    --name alphatechs-connector \
    --network alphatechs-net

# 3. Run heartbeat + proxy on port 18090 (port 18080 is used by connector_sim.py)
MODZERO_PROXY_PORT=18090 python -m connector_runtime run --proxy

# 4. Verify the connector shows "online" in the dashboard.

# 5. Request access from the Electron client. The Access Granted page now
#    contains an "Open proxied resource" button — clicking it forwards the
#    browser through this connector to the protected target.
```

---

## CLI

```
python -m connector_runtime [--config path.json] <command> [options]
```

### `enroll`
One-time enrollment with a token. Saves state. Prints the secret exactly once.

```
python -m connector_runtime enroll --token <T> [--name N] [--network NET] [--force]
```

- `--force`: overwrite an existing state file.
- The connector_secret is shown on stdout **once**. Treat both `connector_id`
  and `connector_secret` as secrets — anyone with the pair can act as this
  connector.

### `run`
Load saved state and start heartbeating. With `--proxy`, also start the proxy.

```
python -m connector_runtime run [--proxy]
```

### `status`
Print the non-sensitive parts of saved state. **Never prints the secret.**

```
python -m connector_runtime status
```

---

## Configuration

Configuration is resolved as:

1. Built-in defaults
2. Optional JSON config file (`--config path.json`)
3. Environment variables (highest precedence)

| Setting | Env var | Default |
|---------|---------|---------|
| `backend_url` | `MODZERO_BACKEND_URL` | `http://localhost:8000` |
| `connector_name` | `MODZERO_CONNECTOR_NAME` | `modzero-connector` |
| `network` | `MODZERO_NETWORK` | `default` |
| `proxy_host` | `MODZERO_PROXY_HOST` | `""` (bind all interfaces) |
| `proxy_port` | `MODZERO_PROXY_PORT` | `18080` |
| `state_file` | `MODZERO_STATE_FILE` | `./connector_state.json` |
| `heartbeat_interval` | `MODZERO_HEARTBEAT_INTERVAL` | `10` |

See `config.example.json` for a JSON template.

---

## Docker (local)

```bash
docker build -t modzero-connector-runtime ./connector_runtime

# 1. Enroll (mount a host directory for state persistence)
docker run --rm -v $(pwd)/state:/var/lib/modzero \
    -e MODZERO_BACKEND_URL=http://host.docker.internal:8000 \
    modzero-connector-runtime \
    enroll --token <TOKEN> --name alphatechs-connector --network alphatechs-net

# 2. Run with proxy
docker run -d --name modzero-connector \
    -v $(pwd)/state:/var/lib/modzero \
    -e MODZERO_BACKEND_URL=http://host.docker.internal:8000 \
    -p 18090:18080 \
    modzero-connector-runtime \
    run --proxy
```

The image is **not** added to `deploy/docker-compose.yml`. It exists for
standalone local testing.

---

## Safety limits (demo proxy)

- Every `/proxy/` request calls `/api/connectors/access/introspect` first
- Upstream URL is built **only** from introspect result (`protocol://target_host:target_port`)
- 8 s upstream timeout
- 2 MB upstream response cap
- 1 MB request body cap (POST)
- Hop-by-hop headers stripped in both directions
- Sensitive client headers stripped upstream:
  - `Cookie`
  - `Authorization`
  - `Proxy-Authorization`
  - `X-ModZero-Access-Token`
- Upstream `Location` headers dropped (no internal-target leakage)
- Token redacted in all logs (`?token=[REDACTED]`)

---

## Smoke test

A minimal, network-free smoke test verifies the package imports and the basic
state-file round trip:

```bash
python connector_runtime/tests/test_smoke.py
```

It does **not** run in `tools/verify_all.py`. The 90/90 verification suite
continues to use `tools/connector_sim.py` exclusively.

---

## Tunnel mode (opt-in, foundation only)

Phase 3 scaffold. When `MODZERO_WG_ENABLED=true`, the runtime starts a second
daemon thread that calls the controller's `tunnel/register` once and pings
`tunnel/heartbeat` every `heartbeat_interval` seconds.

This loop is **metadata only**:

- No system routes are added or modified.
- No admin privileges are required.
- No real WireGuard handshake or DNS routing happens.
- The HTTP proxy is unaffected — the proxy code path is unchanged.

If the controller has `HEADSCALE_ENABLED=false` (the default), every request
is acknowledged with `HTTP 202 {"status": "disabled"}` and the loop logs a
single info line, then keeps polling at the same interval. Failures back off
and never crash the runtime.

| Env var | Default | Purpose |
|---|---|---|
| `MODZERO_WG_ENABLED` | `false` | Start the WG metadata loop |
| `MODZERO_WG_NODE_NAME` | hostname | Logical node name registered with the controller |

Example:

```bash
MODZERO_WG_ENABLED=true MODZERO_PROXY_PORT=18090 \
    python -m connector_runtime run --proxy
```

The connector will heartbeat to `/connectors/{id}/heartbeat` AND `tunnel/heartbeat`
in parallel, while continuing to serve the introspect-per-request proxy.

## Read-only WG helpers

Two diagnostic subcommands are available. Both print text only and refuse to
touch the system — they never run `tailscale`, `wg`, `ip`, `netsh`, or any
other privileged binary, and they never modify networking, files, or env.

```bash
python -m connector_runtime wg status         # prints wg config + saved state
python -m connector_runtime wg instructions   # prints the manual join template
```

`wg status` exits 1 if the enrollment state file is missing (consistent with
the existing `status` subcommand). `wg instructions` always exits 0. The
template includes `{LOGIN_SERVER}` / `{NODE_NAME}` / `{HEADSCALE_USER}` as
literal placeholders — the dashboard Bootstrap action is the source of truth
for concrete values, and no auth key is ever baked into this output.
