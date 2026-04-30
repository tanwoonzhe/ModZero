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
(`admin@modzero.local` / `Admin123!` by default).

## 2. Verify the protected (private) resource is *not* directly reachable

```powershell
# Expect: connection refused / timeout / NXDOMAIN — the intranet host is on
# the private network and has no route from outside the connector.
try { Invoke-WebRequest http://intranet/ -TimeoutSec 3 } catch { $_.Exception.Message }
```

The dashboard "Access-Control State" tile **Protected resources** should list
`/r/demo-intranet` and the **Connectors** tile should show `1/1 online`.

## 3. Verify the connector can reach the intranet

```powershell
docker compose exec connector sh -c "wget -qO- http://intranet/ | head -c 200"
```

You should see HTML from the private intranet — proving the connector has
network reach that the host does not.

## 4. Request access via signed posture (Phase 1 trust evaluation)

Use the seeded credentials and let the client submit posture; the backend
issues an access ticket if `score >= threshold`.

```powershell
# Run the bundled regression script — it logs in, posts posture, and exercises
# the full protected-resource flow.
python scripts\phase2_regression.py
```

All 19 checks should report **PASS**. The script prints the access ticket and
the latest `AccessDecision` rows it created.

## 5. Access the protected resource through ModZero

```powershell
# Replace <TOKEN> with the access ticket emitted by step 4 (or copy it from
# the browser DevTools after the UI grants access).
curl.exe -i -H "Authorization: Bearer <TOKEN>" http://localhost:8000/r/demo-intranet/
```

Expected: **HTTP 200** with the intranet HTML and a `X-ModZero-Resource:
demo-intranet` response header.

## 6. Exercise the complex web app paths (Phase 2A)

Each of these should return **200** through the connector tunnel:

```powershell
$headers = @{ Authorization = "Bearer <TOKEN>" }
Invoke-WebRequest http://localhost:8000/r/demo-intranet/users      -Headers $headers
Invoke-WebRequest http://localhost:8000/r/demo-intranet/admin      -Headers $headers
Invoke-WebRequest http://localhost:8000/r/demo-intranet/api/status -Headers $headers
Invoke-WebRequest http://localhost:8000/r/demo-intranet/redirect   -Headers $headers -MaximumRedirection 0
Invoke-WebRequest http://localhost:8000/r/demo-intranet/set-cookie -Headers $headers
```

`/redirect` should return **302** with the `Location` rewritten to stay under
`/r/demo-intranet/...`. `/set-cookie` should rewrite the `Set-Cookie` `Path` to
the resource prefix.

## 7. Exercise the deny path

Drop the user's posture below threshold (or revoke the device) and retry the
same request — the response must be **403** and a `category=deny` row must
appear in the Access Logs page within ~1 second.

```powershell
# Quick way: tamper with the bearer to invalidate the ticket
curl.exe -i -H "Authorization: Bearer not-a-real-token" `
    http://localhost:8000/r/demo-intranet/
```

Expected: **401/403** and a fresh entry in
`http://localhost:5173/logs` (Access Decisions tab).

## 8. Inspect audit logs in the UI

1. Navigate to **Access Logs** in the sidebar.
2. The **Access Decisions** tab is the default. Confirm the rows produced by
   steps 4–7 are visible with the correct **decision**, **category**
   (`allow` / `deny` / `rate_limit` / `proxy_failure` / `bootstrap_deny`),
   **score / threshold**, **path**, and **timestamp**.
3. Use the category tiles, resource dropdown, user dropdown, and search box to
   filter — each filter should round-trip through `/audit/access-decisions`.
4. Switch to the **Login Attempts** tab to confirm the legacy view still
   works.
5. Return to **Overview** and verify the **Access-Control State** card shows
   the latest trust score, last allow/deny timestamps, connector heartbeat,
   and 24h totals — all updating live.

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
