# ModZero Phase 1 + Phase 2 Demo Walkthrough

This guide walks the verified zero-trust access flow end-to-end. Run it from a
PowerShell session with the repo as the working directory.

> Phase 3 features (continuous evaluation, automated revocation, advanced
> identity scoring) are intentionally **not** part of this demo.

## 0. One-time prerequisites

```powershell
# Optional — re-baseline DB before a clean demo
docker compose down -v
docker compose up -d --build
```

Wait until `docker compose ps` shows `backend`, `frontend`, `connector`,
`intranet`, and `db` as **healthy**.

## 1. Start the stack

```powershell
docker compose up -d
docker compose ps
```

Open the UI at <http://localhost:5173>. Sign in as the seeded admin
(username `admin` / password `admin123` — see `INITIAL_SUPERUSER_*` in `.env`).

### 1a. (Optional) Run the desktop client

The Electron desktop client lives in `electron-client/`. It mints the signed
device-posture payload `/gate` requires, so use it for any flow that needs an
actual access ticket beyond the regression script.

```powershell
cd electron-client
npm install
npm run build:main

# Terminal A — Vite renderer + tsc watch
npm run dev

# Terminal B — launch the Electron shell
npm run electron
```

To produce an installer (Windows shown):

```powershell
npm run package:win
# The .exe lands in electron-client/release/. Copy it to
# backend/app/static/client/ to expose it via Settings → Desktop Client.
```

The web UI's **Settings → Desktop Client** card auto-detects any installer
dropped into `backend/app/static/client/` (`*.exe`, `*.dmg`, `*.AppImage`, etc.)
and surfaces a per-platform Download button. When no artifact is present the
card shows the run-from-source steps above.

## 2. Verify the protected (private) resource is *not* directly reachable

```powershell
# Expect: connection refused / timeout / NXDOMAIN — the intranet host is on
# the private network and has no route from outside the connector.
try { Invoke-WebRequest http://intranet/ -TimeoutSec 3 } catch { $_.Exception.Message }
```

The dashboard "Access-Control State" tile **Protected resources** should
list `/r/demo-intranet`. The **Connectors** tile shows the live count
(`<online>/<total>`) and the hint surfaces the freshest connector — the
`demo-connector-demo-network` row should be marked `✓`. Stale rows from
previous enrollments are intentionally still listed but counted as offline.

## 3. Verify the connector can reach the intranet

```powershell
docker compose exec connector python -c `
    "import urllib.request; print(urllib.request.urlopen('http://intranet/').read()[:200])"
```

You should see HTML from the private intranet — proving the connector has
network reach that the host does not. (The connector image is minimal and
does not ship `wget` or `curl`; use Python's stdlib.)

## 4. Run the end-to-end regression (canonical demo path)

The web console intentionally **cannot** mint access tickets — `/gate`
requires an HMAC-signed posture payload from an enrolled device. The
regression script simulates an enrolled desktop client end-to-end.

```powershell
python scripts\phase2_regression.py
```

All **100 checks** should report `[PASS]`, ending with `ALL 100 CHECKS GREEN`.
While it runs it:

- Logs in as the seeded admin and obtains a JWT.
- POSTs signed posture to `/api/resource-access/gate` (score 100 → ALLOW).
- Receives an access ticket and pulls `/r/demo-intranet/` (HTTP 200 with
  intranet HTML).
- Exercises Phase 2A paths: `/users`, static asset, `/api/status`,
  relative + absolute redirect rewriting, `Set-Cookie` `Path` rewriting,
  POST round-trip, query-string preservation, WebSocket upgrade rejection.
- Exercises Phase 2C: `/gate` 30/min rate limit returns **429**, replay-nonce
  cache active, recent DENY rows present.

## 5. Confirm the deny path

The regression already triggers DENY (low score, missing ticket, rate-limit).
If you want to reproduce it manually:

```powershell
# No ticket — backend must refuse
curl.exe -i http://localhost:8000/r/demo-intranet/
# Expected: HTTP 403 (proxy refuses without a valid access ticket)
```

A fresh row with `decision=deny` should appear in **Access Logs → Access
Decisions** within ~1 second.

## 6. Confirm the proxy is the only ingress

```powershell
# Direct hit on the resource hostname must still fail from the host
try { Invoke-WebRequest http://intranet/ -TimeoutSec 3 } catch { $_.Exception.Message }
# Expected: NXDOMAIN / connection refused — only /r/<slug> works.
```

## 7. Confirm the audit trail

```powershell
# Grab a JWT for the admin (form-encoded login).
$tok = Invoke-RestMethod -Method POST `
    -Uri http://localhost:8000/api/auth/login `
    -ContentType 'application/x-www-form-urlencoded' `
    -Body "username=admin&password=admin123"
$env:JWT = $tok.access_token

$h = @{ Authorization = "Bearer $env:JWT" }
(Invoke-RestMethod "http://localhost:8000/api/audit/access-decisions?limit=5" -Headers $h) |
    Format-Table ts, decision, category, score, threshold, path -AutoSize
```

Expected: a mix of `allow` and `deny` rows with categories `allow`, `deny`,
`rate_limit`, optionally `proxy_failure`.

## 8. Inspect audit + status in the UI

1. Navigate to **Access Logs** in the sidebar.
2. The **Access Decisions** tab is the default. Confirm rows produced by the
   regression script are visible with the correct **decision**, **category**
   (`allow` / `deny` / `rate_limit` / `proxy_failure` / `bootstrap_deny`),
   **score / threshold**, **path**, and **timestamp**.
3. Click each category tile to filter; pick a value from the resource and
   user dropdowns; type into the search box (it filters on `reason` and
   `path`). Each filter round-trips through `/api/audit/access-decisions`.
4. Switch to the **Login Attempts** tab to confirm the legacy view still
   renders.
5. Return to **Overview** and verify the **Access-Control State** card shows
   the latest trust score, last allow/deny age, connector online count
   (the demo connector should be online; any stale connector rows are
   labelled `✗`), 24h totals, and the per-resource table (`/r/demo-intranet`
   → `http://intranet`).

---

### Where to look in the code

| Concern                       | File                                                      |
| ----------------------------- | --------------------------------------------------------- |
| Access decision API           | `backend/app/routers/audit.py`                            |
| Status overview API           | `backend/app/routers/audit.py`                            |
| Proxy + ticket enforcement    | `backend/app/routers/resources.py`, `app/security_assessment_runner.py` |
| Connector tunnel              | `connector/proxy_server.py`, `connector/sio_client.py`    |
| Access Logs UI                | `frontend/src/components/AccessDecisionsLog.tsx`          |
| Dashboard status tiles        | `frontend/src/components/AccessControlOverviewPanel.tsx`  |
| Regression suite              | `scripts/phase2_regression.py`                            |
