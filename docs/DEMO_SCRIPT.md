# ModZero — Demo Script

**Audience:** Project supervisor / examiner  
**Duration:** ~15 minutes  
**Environment:** Local dev stack (Docker + connector simulator + Electron app)

---

## Pre-Demo Checklist

Run these before the demo begins. All must succeed silently.

```bash
# Terminal 1 — backend + database
cd d:/degree/sem6/code/ModZero/deploy
docker compose up -d
# wait ~10 s for backend to be healthy

# Terminal 2 — connector simulator (keep running throughout demo)
cd d:/degree/sem6/code/ModZero/tools
python connector_sim.py --resume --proxy --backend http://localhost:8000
# Expected output: "Heartbeat sent" every 10 s, "Proxy listening on :18080"

# Browser / Electron — launch
# Option A: browser → http://localhost:5173
# Option B: Electron → release/ModZero-win32-x64/ModZero.exe
```

Verify:
- [ ] `http://localhost:8000/api/` returns `{"status":"ok","app":"ModZero"}`
- [ ] `http://localhost:18080/` returns HTTP 404 (proxy is up, no root handler)
- [ ] Login page loads in browser or Electron

---

## Scene 1 — Authentication & Dashboard (1 min)

**Narration:** "ModZero is a self-hosted Zero Trust Network Access platform. Users and administrators authenticate through the same interface."

1. Open `http://localhost:5173` (or Electron app).
2. Log in: **admin** / **admin123**.
3. Point to the sidebar: Auth, Devices, Resources, Policies, Access Logs, Tunnels.
4. The Dashboard shows device count, recent access decisions, and trust score distribution.

**Key point:** Every access decision is logged and auditable in real time.

---

## Scene 2 — Device Posture & Trust Score (2 min)

**Narration:** "Before any access is granted, the platform evaluates the requesting device's security posture."

1. Navigate to **Devices**.
2. Click on an enrolled device (e.g. the device linked to the admin account).
3. Show the posture breakdown panel:
   - **Compliance** — Intune managed + compliant flag
   - **OS up-to-date** — OS version check
   - **Disk encryption** — BitLocker/FileVault status
   - **Risk level** — Entra ID risk score
4. The combined **Trust Score** (0–100) is shown at the top.
5. Navigate to **Policies → Zero Trust Policies**.
6. Show the Finance Portal policy: `minimum_trust_score = 101` (deliberately impossible, used to demonstrate denial).

**Key point:** Trust score is computed per-device in real time from multiple posture signals.

---

## Scene 3 — Resource Access Allow (2 min)

**Narration:** "A user requests access to a protected internal resource. The platform evaluates all policy layers before issuing a session."

1. Navigate to **Resources**.
2. Show the resource list: *AlphaTechs Intranet* (enabled), *Finance Portal* (requires trust 101).
3. Click **Request Access** on **AlphaTechs Intranet**.
4. The response panel shows:
   - `decision: allow`
   - `trust_score: 68`
   - `access_mode: http_proxy`
   - `tunnel_ready: false` (no Headscale configured)
   - `session_id`, `access_token`, `expires_at`
   - `access_url: http://localhost:18080/access/<id>?token=...`

**Key point:** Decision, trust score, and session metadata are returned in a single response.

---

## Scene 4 — Connector Proxy Access (2 min)

**Narration:** "The access URL points to the connector's HTTP proxy. The proxy validates the session token against the backend before forwarding to the protected resource."

1. Copy the `access_url` from the previous step (or click the link in the UI).
2. Open it in a browser tab.
3. The **AlphaTechs Internal Portal** demo page loads — the protected intranet.
4. Switch to Terminal 2 and show the connector log line: `Heartbeat sent`.
5. Back in the admin UI, navigate to **Access Logs**.
6. Show the new row: resource, user, decision=allow, trust score, timestamp, Mode=http_proxy.

**Key point:** The connector proxy performs token validation; no direct network path exists between the client and the intranet without a valid session.

---

## Scene 5 — Access Denial (1 min)

**Narration:** "The platform enforces deny decisions identically — no session or token is issued."

1. From **Resources**, click **Request Access** on **Finance Portal** (min trust = 101).
2. The response shows:
   - `decision: deny`
   - `reason: Trust score 68 below required 101`
   - No `access_token`, no `access_url`
3. In **Access Logs**, the new row shows `decision=deny` with the same reason.

**Key point:** Denial is silent from the resource's perspective — the backend never forwards any credential.

---

## Scene 6 — Session Lifecycle (2 min)

**Narration:** "Sessions are revocable in real time. Revocation takes effect immediately on the next proxy check."

1. Request access to **AlphaTechs Intranet** again to get a fresh session.
2. Open the access URL → portal loads.
3. Navigate to **Access Logs** → find the row → click **Revoke Session**.
4. Refresh the portal URL → the connector proxy now returns **403 session_revoked**.
5. Introspect endpoint confirms: `active: false`, `reason: session_revoked`.

**Key point:** Revocation is enforced at the proxy layer without touching the resource itself.

---

## Scene 7 — Tunnel Policy Controls (2 min)

**Narration:** "Each resource has a tunnel policy that controls how the access decision integrates with WireGuard tunnel availability."

1. Navigate to **Resources** → click **Edit** on *AlphaTechs Intranet*.
2. Scroll to the **Tunnel Policy** subsection:
   - **Preferred access mode**: Auto (recommended) / HTTP Proxy only / WireGuard Tunnel only
   - **Require tunnel**: checkbox
   - **Allow HTTP fallback**: checkbox (disabled when mode = HTTP Proxy only)
3. Change mode to **WireGuard Tunnel only**, leave *Require tunnel* unchecked, save.
4. Request access again.
5. Response: `access_mode: http_proxy`, `fallback_used: true`, `tunnel_ready: false` (no Headscale node present, fell back to HTTP proxy).
6. In **Access Logs**, the row now shows Mode badge = `http_proxy` with the ↩ fallback icon.
7. Restore mode to **Auto** and save.

**Key point:** Tunnel policy is per-resource. Fallback behaviour is explicit and audited.

---

## Scene 8 — Tunnel Route Lifecycle (1 min)

**Narration:** "When Headscale is deployed, administrators can manage the lifecycle of tunnel routes — the subnets advertised by each connector into the tailnet."

1. Navigate to **Tunnels → Overview**.
2. Show the **Tunnel Nodes** table (empty in this demo — no live Headscale).
3. Show the **Routes** table — if any routes were created during earlier testing, show their `route_status` column: `pending → approved → active`.
4. Explain: clicking **Approve** calls the Headscale API to enable the route in the tailnet.

**Key point:** Route lifecycle is tracked in the database and audited independently of the access decision layer.

---

## Scene 9 — Tunnel Audit Log (1 min)

**Narration:** "All tunnel-related events are written to a dedicated audit log, separate from the access request log."

1. Navigate to **Tunnels → Tunnel Audit** tab.
2. Show the audit table (filter by action if rows exist).
3. Actions logged: `tunnel_ready_reported`, `tunnel_required_denied`, `http_fallback_used`, `user_enrollment_requested`, `session_revoked_with_tunnel`.
4. (If Scene 7 produced a fallback) filter `action=http_fallback_used` and show the row.

**Key point:** Tunnel events are audited independently of HTTP proxy session events.

---

## Scene 10 — Electron Client: Tunnel Readiness (1 min)

**Narration:** "The Electron desktop client checks whether the user's device has already joined the tailnet."

1. Switch to the Electron app (or open `release/ModZero-win32-x64/ModZero.exe`).
2. Log in, navigate to the Connected dashboard.
3. Show the **Tunnel Client** card:
   - Badge: **Not installed** (Tailscale not present on this machine)
4. Click **Get Tunnel Join Instructions**.
5. A modal appears with:
   - `manual_command`: `tailscale up --login-server=... --authkey={AUTH_KEY} --hostname=...`
   - Numbered instructions for obtaining a pre-auth key from an admin
   - A **Copy** button for the command
6. Note that `{AUTH_KEY}` is a literal placeholder — the server never generates or returns a real key.

**Key point:** User device enrollment is manual-only and read-only from the server's perspective.

---

## Post-Demo Q&A Prompts

| Likely question | Where to point |
|---|---|
| "How is the trust score calculated?" | Devices → posture breakdown; `backend/app/routers/assessment.py` |
| "What stops a user replaying an access token?" | Session Test E in `verify_all.py`; token is hashed in DB |
| "What happens if the connector goes offline?" | Heartbeat TTL; connector becomes `offline`; `resource_unavailable` |
| "How would real WireGuard traffic work?" | `docs/DEMO_VALIDATION.md` Known Limitations #1; Headscale deployment guide in `deploy/HEADSCALE.md` |
| "Why is tunnel revocation coarse-grained?" | `deploy/HEADSCALE.md` §Revocation semantics |
| "How are credentials protected?" | `.env` secrets never reach API responses; audit log stores no keys |
