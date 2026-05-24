# ModZero — ECS Deployment Runbook

> **Scope:** Step-by-step execution checklist for deploying ModZero to an ECS
> (or any Linux cloud server) instance for the first time.
> Run sections in order. Do not skip ahead.
>
> **Not production-ready notice:** This system is a Final Year Project demo.
> It has not undergone a security audit. Do not use it to protect real
> organisational resources.

---

## Quick Reference

| Item | Value |
|---|---|
| Backend port (internal) | 8000 |
| Frontend port (nginx) | 80 / 443 |
| PostgreSQL port (internal only) | 5432 |
| Connector proxy port (LAN only) | 8443 / 18080 |
| Health endpoint | `GET /health` |
| API root | `GET /api/` |
| Alembic head | `i9j0k1l2m3n4` |
| Cloud smoke test script | `tools/cloud_smoke_test.py` |

---

## Phase 0 — Pre-flight (local machine)

Run these before touching the server.

### 0.1 Confirm local tests still pass

```bash
cd d:/degree/sem6/code/ModZero

# Must all pass before deploying
DEMO_CONNECTOR_PROXY_BASE_URL=http://localhost:18080 python tools/verify_all.py
# Expected: PASSED 90, FAILED 0

python tools/verify_auth.py
# Expected: SUMMARY: 18/18 PASS, 0 SKIP, 0 FAIL
```

### 0.2 Generate secrets (save in a password manager — you need them in Phase 1)

```bash
# Run each once; copy output to notepad
python -c "import secrets; print('SECRET_KEY=' + secrets.token_urlsafe(48))"
python -c "import secrets; print('POSTGRES_PASSWORD=' + secrets.token_urlsafe(32))"
python -c "import secrets; print('CONNECTOR_HOP_SECRET=' + secrets.token_urlsafe(32))"
python -c "import secrets; print('ADMIN_PASSWORD=' + secrets.token_urlsafe(16))"
```

### 0.3 Decide on your domain or IP

```
DOMAIN = your-domain.com          # or the server's public IP for testing
BACKEND_URL = https://DOMAIN      # or http://IP:8000 for IP-only testing
FRONTEND_URL = https://DOMAIN     # or http://IP for IP-only testing
```

---

## Phase 1 — Server Setup (on the cloud server via SSH)

### 1.1 SSH into the server

```bash
# From local machine
ssh ubuntu@<server-ip>
# or
ssh -i ~/.ssh/your-key.pem ec2-user@<server-ip>
```

### 1.2 Install Docker and Docker Compose

```bash
# Ubuntu / Debian
sudo apt update && sudo apt install -y docker.io docker-compose-plugin git curl

# Add your user to docker group (no sudo needed after re-login)
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker --version
# Expected: Docker version 24.x.x or higher
docker compose version
# Expected: Docker Compose version v2.x.x
```

### 1.3 Clone the repository

```bash
cd ~
git clone <your-repo-url> ModZero
cd ModZero
# Expected: Cloning into 'ModZero'... done.
```

### 1.4 Create the .env file from cloud template

```bash
cp deploy/.env.cloud.example .env
nano .env
```

Fill in these values (all others can stay as shown):

```env
# --- REQUIRED ---
POSTGRES_PASSWORD=<generated in 0.2>
DATABASE_URL=postgresql+psycopg2://modzero:<same password>@db:5432/modzero
SECRET_KEY=<generated in 0.2>
INITIAL_SUPERUSER_PASSWORD=<generated in 0.2>
CORS_ORIGINS=https://<DOMAIN>          # use http://<IP> for IP-only
PUBLIC_BASE_URL=https://<DOMAIN>       # use http://<IP> for IP-only
CONNECTOR_HOP_SECRET=<generated in 0.2>
VITE_API_BASE=https://<DOMAIN>/api     # use http://<IP>:8000/api for IP-only
VITE_SOCKET_URL=https://<DOMAIN>       # use http://<IP>:8000 for IP-only

# --- LEAVE FALSE unless you have Headscale running ---
HEADSCALE_ENABLED=false

# --- OPTIONAL (Graph/Intune) ---
MS_TENANT_ID=<your Azure tenant or leave blank>
MS_CLIENT_ID=<leave blank if not using Graph>
MS_CLIENT_SECRET=<leave blank if not using Graph>
```

Save and close (`Ctrl+O`, `Enter`, `Ctrl+X` in nano).

### 1.5 Confirm .env is not committed

```bash
git status
# .env must NOT appear in git status output (it is in .gitignore)
```

---

## Phase 2 — Build and Start Services (on server)

### 2.1 Build and start (first deploy)

```bash
cd ~/ModZero/deploy

# Production overlay (removes dev volume mounts, sets ENVIRONMENT=production)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

**Expected output (abbreviated):**
```
[+] Building 42.1s (18/18) FINISHED
[+] Running 5/5
 ✔ Network modzero_default     Created
 ✔ Container modzero-db-1      Healthy
 ✔ Container modzero-backend-1 Started
 ✔ Container modzero-frontend-1 Started
 ✔ Container modzero-connector-1 Started
```

Build time: 1–5 minutes depending on server speed.

### 2.2 Wait for DB to be healthy

```bash
docker compose ps
```

Expected:
```
NAME                    STATUS
modzero-db-1            Up (healthy)
modzero-backend-1       Up
modzero-frontend-1      Up
modzero-connector-1     Up
```

If `db` shows `starting` after 30 s, wait another 30 s and re-run.

### 2.3 Check backend logs for startup errors

```bash
docker compose logs backend --tail 30
```

Expected (last few lines):
```
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

If you see `FATAL` or `sqlalchemy.exc.OperationalError`, see **Failure: Database connection error** below.

---

## Phase 3 — Database Migration (on server)

### 3.1 Run Alembic upgrade

```bash
cd ~/ModZero/deploy
docker compose exec backend alembic upgrade head
```

**Expected output (first run):**
```
INFO  [alembic.runtime.migration] Running upgrade  -> 9ef8787d2f8a, ...
INFO  [alembic.runtime.migration] Running upgrade ... -> a1b2c3d4e5f6, ...
...
INFO  [alembic.runtime.migration] Running upgrade h8i9j0k1l2m3 -> i9j0k1l2m3n4, Add tunnel_access_audit_logs
```

**Expected output (already migrated):**
```
INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO  [alembic.runtime.migration] Will assume transactional DDL.
```
(No "Running upgrade" lines — already at head. This is correct.)

### 3.2 Confirm current head

```bash
docker compose exec backend alembic current
```

Expected:
```
i9j0k1l2m3n4 (head)
```

If you see a different revision or an error, do NOT proceed. See failure diagnosis below.

---

## Phase 4 — Seed Demo Data (on server)

### 4.1 Run seed script

```bash
cd ~/ModZero
BASE=http://localhost:8000 python tools/seed_demo_data.py
```

**Expected output:**
```
Logged in as admin
Created resource: AlphaTechs Intranet
Created resource: Finance Portal
...
Done.
```

If the script isn't present or fails with an import error:
```bash
pip install requests
BASE=http://localhost:8000 python tools/seed_demo_data.py
```

---

## Phase 5 — Health Check (from local machine)

Run from your **local machine** (not the server).

### 5.1 Backend /health

```bash
curl -s https://<DOMAIN>/health | python -m json.tool
```

**Expected:**
```json
{
    "status": "ok",
    "app": "ModZero",
    "database": "connected"
}
```

HTTP status must be **200**. If you get 503, the backend is up but DB is unreachable. If connection is refused, backend is not listening.

### 5.2 API root

```bash
curl -s https://<DOMAIN>/api/ | python -m json.tool
```

**Expected:**
```json
{
    "status": "ok",
    "app": "ModZero",
    "docs": "/docs"
}
```

### 5.3 Full cloud smoke test

```bash
cd d:/degree/sem6/code/ModZero

python tools/cloud_smoke_test.py \
    --backend-url https://<DOMAIN> \
    --frontend-url https://<DOMAIN> \
    --username admin \
    --password <INITIAL_SUPERUSER_PASSWORD from .env>
```

**Expected:**
```
SUMMARY: 23/23 PASS, 0 SKIP, 0 FAIL
```

If CORS is not yet configured for the domain, check 10 (CORS) may warn rather than fail.

---

## Phase 6 — Nginx / TLS Setup (on server)

Skip this phase if using IP-only access for testing.

### 6.1 Install Certbot and obtain certificate

```bash
sudo apt install -y certbot

# Stop frontend container to free port 80 temporarily
docker compose stop frontend

sudo certbot certonly --standalone -d <DOMAIN>
# Follow prompts; email address required for renewal notices

# Expected:
# Successfully received certificate.
# Certificate is saved at: /etc/letsencrypt/live/<DOMAIN>/fullchain.pem
```

### 6.2 Copy certs to repo certs/ directory

```bash
cd ~/ModZero
mkdir -p certs
sudo cp /etc/letsencrypt/live/<DOMAIN>/fullchain.pem certs/
sudo cp /etc/letsencrypt/live/<DOMAIN>/privkey.pem certs/
sudo chown $USER:$USER certs/*.pem
```

### 6.3 Restart frontend with TLS

```bash
cd ~/ModZero/deploy
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d frontend
```

**Expected:** Frontend container starts and binds 443.

### 6.4 Verify HTTPS

```bash
curl -s https://<DOMAIN>/health
# Expected: {"status":"ok",...}
```

---

## Phase 7 — Electron App Configuration (local machine)

### 7.1 Launch Electron

```
release/ModZero-win32-x64/ModZero.exe
```

### 7.2 Set backend URL on onboarding screen

- If shown: enter `https://<DOMAIN>` → click **Connect**
- If already logged into old backend: open Settings → Backend URL → change to `https://<DOMAIN>`

### 7.3 Login

- Username: `admin`
- Password: `<INITIAL_SUPERUSER_PASSWORD>`

**Expected:** Dashboard loads. Trust score and device data visible.

---

## Phase 8 — Connector Enrollment (on connector host)

The connector should run on the machine **network-adjacent to the protected resource**, not on the cloud server.

### 8.1 Generate enrollment token

In the admin UI: **Connectors** → **Create Enrollment Token** → copy the token.

Or via API from local machine:
```bash
TOKEN=$(curl -s -X POST https://<DOMAIN>/api/auth/login \
    -d "username=admin&password=<PASSWORD>" \
    -H "Content-Type: application/x-www-form-urlencoded" | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -s -X POST https://<DOMAIN>/api/admin/connectors/tokens \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"cloud-connector","expires_hours":24}' | python -m json.tool
```

Copy the `token` field from the response.

### 8.2 Enroll connector

On the connector host:

```bash
# If running via Python
export MODZERO_BACKEND_URL=https://<DOMAIN>
export MODZERO_ENROLL_TOKEN=<token from 8.1>
python -m connector_runtime

# Or with connector_sim for demo:
cd /path/to/ModZero/tools
python connector_sim.py \
    --backend http://localhost:8000 \   # adjust to cloud backend URL if remote
    --token <enroll-token> \
    --proxy
```

**Expected output:**
```
Enrolled connector: <connector-id>
State saved to connector_state.json
Heartbeat sent (status=200)
Proxy listening on :18080
```

### 8.3 Confirm connector is online

In admin UI: **Connectors** tab. Connector should show **Online** with a recent heartbeat timestamp.

---

## Phase 9 — Run Verify Scripts Against Cloud (local machine)

```bash
cd d:/degree/sem6/code/ModZero

# Auth and posture tests
BASE=https://<DOMAIN> python tools/verify_auth.py
# Expected: SUMMARY: 18/18 PASS, 0 SKIP, 0 FAIL

# Full platform test (requires connector running on port 18080)
DEMO_CONNECTOR_PROXY_BASE_URL=http://localhost:18080 \
BASE=https://<DOMAIN> python tools/verify_all.py
# Expected: PASSED 90, FAILED 0

# Tunnel foundation (no Headscale needed)
BASE=https://<DOMAIN> python tools/verify_tunnels.py
# Expected: PASSED 61, FAILED 0
```

> **Note:** `verify_all.py` and `verify_tunnels.py` default to `BASE=http://localhost:8000`.
> When testing against cloud, pass `BASE=https://<DOMAIN>` as an environment variable.
> Check the script's header — if it doesn't honour `BASE`, update the constant at the top.

---

## Failure Diagnosis

### ❌ Backend /health returns 503

**Symptom:** `curl /health` → HTTP 503, `"database": "unreachable"`

**Causes and fixes:**

1. Database container not yet healthy:
   ```bash
   docker compose ps
   # If db shows "starting": wait 30s, retry
   docker compose logs db --tail 20
   ```

2. Wrong DATABASE_URL in .env:
   ```bash
   docker compose exec backend env | grep DATABASE_URL
   # Compare to POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB in .env
   ```

3. DB container crashed:
   ```bash
   docker compose logs db | grep ERROR
   # Common: "FATAL: role does not exist" → POSTGRES_USER mismatch
   # Fix: docker compose down -v  (drops data!) and redeploy with correct vars
   ```

4. Backend can't reach DB (network issue):
   ```bash
   docker compose exec backend python -c \
     "from app.db import SessionLocal; from sqlalchemy import text; s=SessionLocal(); s.execute(text('SELECT 1')); print('OK')"
   ```

---

### ❌ CORS error in browser DevTools

**Symptom:** Browser shows `Access to XMLHttpRequest ... blocked by CORS policy`

**Cause:** `CORS_ORIGINS` in `.env` doesn't match the origin the frontend is served from.

**Fix:**

```bash
# Check what CORS_ORIGINS is set to
docker compose exec backend env | grep CORS_ORIGINS

# Must exactly match the frontend origin including scheme and port
# e.g. https://your-domain.com  NOT  https://your-domain.com/
#      http://1.2.3.4:8000       NOT  http://1.2.3.4

# Edit .env, then:
docker compose up -d --force-recreate backend
```

Also confirm the smoke test CORS check:
```bash
python tools/cloud_smoke_test.py --backend-url https://<DOMAIN> \
    --username admin --password <PASSWORD>
# Check section 10 — must show PASS or SKIP (not "wildcard")
```

---

### ❌ Database connection error on backend startup

**Symptom:** `docker compose logs backend` shows:
```
sqlalchemy.exc.OperationalError: could not connect to server
```

**Causes and fixes:**

1. DB container not yet ready when backend started:
   ```bash
   # Force restart backend after DB is healthy
   docker compose ps  # confirm db is "(healthy)"
   docker compose restart backend
   docker compose logs backend --tail 10
   ```

2. DATABASE_URL host doesn't match service name:
   ```bash
   # In docker-compose.yml the DB service is named "db"
   # DATABASE_URL must contain @db:5432, not @localhost:5432
   grep DATABASE_URL .env
   # Expected: ...@db:5432/modzero
   ```

3. Credentials mismatch between `POSTGRES_*` vars and `DATABASE_URL`:
   ```bash
   grep POSTGRES .env
   grep DATABASE_URL .env
   # Username and password must match exactly
   ```

---

### ❌ Frontend cannot reach backend (blank page / spinner forever)

**Symptom:** Admin UI loads but shows no data; DevTools Network tab shows requests to `localhost:8000` (wrong) or 404/CORS errors.

**Cause:** `VITE_API_BASE` was not set (or set incorrectly) when the frontend image was built.

**Fix:** Rebuild the frontend with the correct API base:

```bash
# Edit .env: VITE_API_BASE=https://<DOMAIN>/api
nano .env

# Rebuild frontend only
cd ~/ModZero/deploy
docker compose -f docker-compose.yml -f docker-compose.prod.yml build frontend
docker compose up -d --force-recreate frontend
```

**Verify:**
```bash
# Check the built JS contains the correct API URL
docker compose exec frontend grep -r "your-domain.com" /usr/share/nginx/html/assets/ | head -3
```

---

### ❌ Electron app cannot login to cloud backend

**Symptom:** Electron shows "Cannot connect" or login fails.

**Step 1 — Confirm backend URL is set correctly:**

In Electron: Settings → Backend URL → should show `https://<DOMAIN>` (not `http://localhost:8000`).

**Step 2 — Test backend from local machine:**

```bash
curl -s https://<DOMAIN>/health
# Expected: {"status":"ok",...} HTTP 200

curl -s -X POST https://<DOMAIN>/api/auth/login \
    -d "username=admin&password=<password>" \
    -H "Content-Type: application/x-www-form-urlencoded"
# Expected: {"access_token":"...","token_type":"bearer"}
```

**Step 3 — Firewall check:**

```bash
# From local machine
curl -v --max-time 5 https://<DOMAIN>/health
# If connection refused: port 443 not open in security group / firewall
# If certificate error: TLS cert not set up (use --insecure for test only)
```

**Step 4 — CORS for Electron:**

Electron makes requests from `app://` or `file://` origin. If the backend
rejects these origins with CORS errors, add `"null"` to CORS_ORIGINS (the
browser sends `Origin: null` for file-scheme):
```env
CORS_ORIGINS=https://your-domain.com,null
```
Then restart backend.

---

### ❌ Connector cannot enroll

**Symptom:** `connector_sim.py` or `connector_runtime` exits with `401` or `403`.

**Step 1 — Token is expired:**

Enrollment tokens expire (default: 24 hours). Generate a new one in the admin UI or via API.

**Step 2 — Backend URL mismatch:**

```bash
echo $MODZERO_BACKEND_URL
# Must be https://<DOMAIN>, not localhost
```

**Step 3 — CONNECTOR_HOP_SECRET mismatch:**

The connector's `CONNECTOR_HOP_SECRET` must exactly match the backend's:
```bash
docker compose exec backend env | grep CONNECTOR_HOP_SECRET
# Compare to what's in the connector's environment
```

**Step 4 — Heartbeat fails after enroll:**

```bash
# Check connector logs
docker compose logs connector --tail 20
# Look for: "Heartbeat failed: 401" → token stored in connector_state.json is stale
# Fix: delete connector_state.json and re-enroll
```

---

## Rollback Commands

### Rollback to previous migration

```bash
# Check current state first
docker compose exec backend alembic current
docker compose exec backend alembic history --verbose | head -20

# Roll back one step
docker compose exec backend alembic downgrade -1

# Roll back to specific revision
docker compose exec backend alembic downgrade g7h8i9j0k1l2
```

### Rollback to previous image (if you tagged builds)

```bash
# Tag before deploying:
docker tag modzero-backend:latest modzero-backend:pre-deploy-$(date +%Y%m%d)

# Rollback:
docker compose down
docker tag modzero-backend:pre-deploy-<DATE> modzero-backend:latest
docker compose up -d
```

### Full reset (⚠️ DATA LOSS — use only on a test server)

```bash
cd ~/ModZero/deploy
docker compose down -v        # removes all volumes including postgres_data
docker compose up -d --build
docker compose exec backend alembic upgrade head
BASE=http://localhost:8000 python ~/ModZero/tools/seed_demo_data.py
```

### Emergency: restart single service

```bash
docker compose restart backend
docker compose restart db
docker compose restart frontend
docker compose restart connector
```

---

## Final Evidence Checklist (Screenshots for FYP Submission)

Take screenshots of each item below. Suggested filename convention:
`ModZero_<NN>_<name>.png`

| # | What to capture | Where / How |
|---|---|---|
| 01 | `docker compose ps` showing all services healthy | SSH terminal on server |
| 02 | `alembic current` → `i9j0k1l2m3n4 (head)` | SSH terminal |
| 03 | `GET /health` returning `{"status":"ok","database":"connected"}` | `curl` output or browser |
| 04 | Cloud smoke test: `SUMMARY: N/23 PASS` | Local machine terminal |
| 05 | `verify_auth.py` → `SUMMARY: 18/18 PASS` | Local terminal |
| 06 | `verify_all.py` → `PASSED 90, FAILED 0` | Local terminal |
| 07 | `verify_tunnels.py` → `PASSED 61, FAILED 0` | Local terminal |
| 08 | Login page loading at `https://<DOMAIN>` | Browser |
| 09 | Admin dashboard after login (real data, not "Failed to load") | Browser |
| 10 | Resources page showing AlphaTechs Intranet + Finance Portal | Browser |
| 11 | Access decision: allow for AlphaTechs (trust score shown) | Browser |
| 12 | Access decision: deny for Finance Portal (min score 101) | Browser |
| 13 | Access Logs page with Mode / Tunnel / Fallback columns | Browser |
| 14 | Connectors page showing enrolled connector with "Online" status | Browser |
| 15 | Tunnels page showing status (headscale_enabled: false) | Browser |
| 16 | Electron app: backend URL set to cloud domain | Electron Settings screen |
| 17 | Electron app: logged in, dashboard showing trust score | Electron app |
| 18 | Electron app: Tunnel Client card showing "Not installed" badge | Electron app |
| 19 | Electron app: Tunnel Join Instructions modal with `{AUTH_KEY}` placeholder | Electron app |
| 20 | `connector_sim.py` running, showing "Heartbeat sent" | Terminal on connector host |

---

## Post-Deployment Monitoring

```bash
# Watch live logs from all services
docker compose logs -f

# Watch backend only (most useful)
docker compose logs -f backend

# Count access requests in last 100 log lines
docker compose logs backend --tail 100 | grep "POST /api/access/request" | wc -l

# Check disk usage (postgres volume)
docker system df
docker volume inspect deploy_postgres_data | python -m json.tool
```
