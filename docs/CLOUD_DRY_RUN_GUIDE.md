# ModZero — Cloud Deployment Dry Run Guide

> **Status:** Not production-ready.  
> This guide walks through a local "production-like" deployment using
> `docker-compose.prod.yml`. It simulates what a real cloud deployment
> would require without actually exposing anything externally.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Docker Desktop / Docker Engine ≥ 24 | With Compose v2 (`docker compose`) |
| Python ≥ 3.11 with `requests` | For smoke tests and verify scripts |
| A domain (or localhost) | For CORS / `PUBLIC_BASE_URL` |
| TLS cert (or self-signed) | For production overlay HTTPS |
| `openssl` or Python `secrets` | To generate strong secrets |

---

## Step 1 — Generate Secrets

Never use placeholder strings in a real deployment.

```bash
# SECRET_KEY (64-char hex)
python -c "import secrets; print(secrets.token_urlsafe(48))"

# POSTGRES_PASSWORD
python -c "import secrets; print(secrets.token_urlsafe(32))"

# CONNECTOR_HOP_SECRET
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

---

## Step 2 — Create .env from Cloud Template

```bash
cd /path/to/ModZero
cp deploy/.env.cloud.example .env
```

Open `.env` and fill in every `REPLACE_WITH_*` value:

```env
# Minimum required values for a working cloud-like deployment:
POSTGRES_PASSWORD=<generated>
DATABASE_URL=postgresql+psycopg2://modzero:<generated>@db:5432/modzero
SECRET_KEY=<generated>
INITIAL_SUPERUSER_PASSWORD=<strong password>
CORS_ORIGINS=https://your-domain.com          # or http://localhost for dry run
PUBLIC_BASE_URL=https://your-domain.com       # or http://localhost
CONNECTOR_HOP_SECRET=<generated>
VITE_API_BASE=https://your-domain.com/api     # or http://localhost:8000/api
```

### For a localhost dry run (no real domain):

```env
CORS_ORIGINS=http://localhost
PUBLIC_BASE_URL=http://localhost
VITE_API_BASE=http://localhost:8000/api
COOKIE_SECURE=false
```

---

## Step 3 — Change the Default Admin Password

Edit `.env`:

```env
INITIAL_SUPERUSER_PASSWORD=MyStr0ngAdminPass!
```

This password is only used on **first startup** to create the admin account.
If the database already exists, this variable has no effect — change the
password through the admin UI instead.

---

## Step 4 — Docker Compose Up

### Local dev (default):

```bash
cd deploy
docker compose up -d --build
```

### Production overlay (enforces prod env, removes dev volume mounts):

```bash
cd deploy
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Check that all services started:

```bash
docker compose ps
# Expected: db (healthy), backend (running), frontend (running), connector (running)
```

---

## Step 5 — Database Migration

```bash
docker compose exec backend alembic upgrade head
```

Expected output (first deploy):
```
Running upgrade  -> 9ef8787d2f8a, ...
Running upgrade ... -> i9j0k1l2m3n4, Add tunnel_access_audit_logs ...
```

On subsequent deploys (already migrated):
```
INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
# No output — already at head
```

Confirm current head:
```bash
docker compose exec backend alembic current
# Expected: i9j0k1l2m3n4 (head)
```

---

## Step 6 — Seed Demo Data

```bash
# Requires backend to be running and migrated
BASE=http://localhost:8000 python tools/seed_demo_data.py
```

This creates:
- Two protected resources (*AlphaTechs Intranet*, *Finance Portal*)
- One connector enroll token
- Demo network and device records

If running against a cloud backend:
```bash
BASE=https://your-domain.com python tools/seed_demo_data.py
```

---

## Step 7 — Test Backend /health

```bash
curl http://localhost:8000/health
# Expected:
# {"status":"ok","app":"ModZero","database":"connected"}
# HTTP 200

# If database is down:
# {"status":"degraded","app":"ModZero","database":"unreachable"}
# HTTP 503
```

The `/health` endpoint returns **503** when the database is unreachable.
Reverse proxies and load balancers should use this to gate traffic.

---

## Step 8 — Test Frontend

Open `http://localhost:5173` (dev) or `http://localhost` (prod overlay) in a browser.

- Login page should appear
- Log in with admin / `<your password>`
- Dashboard should load with real data (not mock)

**If the API URL is wrong** (CORS error in DevTools):
- Check `VITE_API_BASE` was set correctly before the frontend image was built
- Rebuild: `docker compose -f docker-compose.yml -f docker-compose.prod.yml build frontend`

---

## Step 9 — Run Cloud Smoke Test

```bash
python tools/cloud_smoke_test.py \
    --backend-url http://localhost:8000 \
    --frontend-url http://localhost \
    --username admin \
    --password "<your admin password>"
```

Expected output:
```
SUMMARY: 10/12 PASS, 2 SKIP, 0 FAIL
```

Skips are for `--connector-url` (not provided) and CORS (may not be set for localhost).

Against a real cloud deployment:
```bash
python tools/cloud_smoke_test.py \
    --backend-url https://your-domain.com \
    --frontend-url https://your-domain.com \
    --connector-url http://connector-host:18080 \
    --username admin \
    --password "<password>"
```

---

## Step 10 — nginx / Reverse Proxy Notes

For production with a real domain, use nginx to:
1. Terminate HTTPS on port 443
2. Forward `/api/*` to `localhost:8000`
3. Serve the React build from `frontend/dist/` as static files

The `frontend/nginx.prod.conf` in the repo is configured for this. When using
the prod overlay it is bind-mounted into the frontend container:

```yaml
# docker-compose.prod.yml (already present)
volumes:
  - ../frontend/nginx.prod.conf:/etc/nginx/conf.d/default.conf:ro
  - ../certs:/etc/nginx/certs:ro
```

Minimum nginx snippet for reference:

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;
    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    location /api/ {
        proxy_pass http://backend:8000/api/;
        proxy_set_header X-Forwarded-Proto https;
    }
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }
}
server {
    listen 80;
    return 301 https://$host$request_uri;
}
```

---

## Step 11 — HTTPS / Domain Notes

For a real domain:

```bash
# Install Certbot
apt install certbot

# Obtain certificate (stop nginx first if using port 80)
certbot certonly --standalone -d your-domain.com

# Place certs where docker-compose.prod.yml expects them:
mkdir -p certs
cp /etc/letsencrypt/live/your-domain.com/fullchain.pem certs/
cp /etc/letsencrypt/live/your-domain.com/privkey.pem certs/
```

For a dry run with a self-signed cert:

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout certs/privkey.pem \
    -out certs/fullchain.pem \
    -subj "/CN=localhost"
```

---

## Step 12 — Electron Backend URL Configuration

The Electron desktop client (`release/ModZero-win32-x64/ModZero.exe`) stores
its backend URL in `%APPDATA%\ModZero\config.json` on Windows.

**First launch:** The app displays an onboarding screen asking for the backend URL.
Enter `https://your-domain.com`.

**Changing it later:** Open the app → Settings (gear icon) → Backend URL field.
Changing the URL clears the stored token and forces re-login.

**No hardcoded domain** — the app accepts any `http://` or `https://` URL.

---

## Step 13 — Connector Runtime from Another Host

To run the connector on a separate machine pointing at a cloud backend:

```bash
pip install -e /path/to/ModZero/connector_runtime
# or copy the package

export MODZERO_BACKEND_URL=https://your-domain.com
export MODZERO_ENROLL_TOKEN=<token from admin UI>
python -m connector_runtime
```

Or with Docker:
```bash
docker run \
    -e MODZERO_BACKEND_URL=https://your-domain.com \
    -e MODZERO_ENROLL_TOKEN=<token> \
    -e CONNECTOR_HOP_SECRET=<same as backend> \
    modzero-connector
```

**Important:** The connector's HTTP proxy (`--proxy`, port 18080) listens on
the local network only. It is intentionally NOT exposed to the public internet.
Users access protected resources through the Electron client's `access_url`,
which routes through the connector proxy — the connector must be
network-adjacent to the protected resource.

---

## Step 14 — Known Localhost vs Cloud Connector Proxy Limitation

| Scenario | Behaviour |
|---|---|
| Connector and protected resource on same LAN | Works as designed |
| Connector on a different subnet from protected resource | Access URL won't reach intranet |
| Connector proxy port exposed on public internet | **Security risk** — must not do this |
| `DEMO_CONNECTOR_PROXY_BASE_URL=http://localhost:18080` in cloud `.env` | Wrong — will produce unusable access URLs pointing at localhost |

For cloud deployment, `DEMO_CONNECTOR_PROXY_BASE_URL` must point to the
connector's reachable address from the user's machine. If users are on the
same LAN as the connector: `http://<connector-lan-ip>:18080`. If not, a VPN
or the WireGuard tunnel (when Headscale is configured) is required.

---

## Step 15 — Verification Scripts Against Cloud Backend

```bash
# Cloud backend, no proxy connector available
BASE=https://your-domain.com python tools/verify_auth.py

# With connector running
DEMO_CONNECTOR_PROXY_BASE_URL=http://<connector-ip>:18080 \
    BASE=https://your-domain.com python tools/verify_all.py
```

---

## Step 16 — Security Checklist Before Any External Exposure

- [ ] `SECRET_KEY` generated with `secrets.token_urlsafe(48)`, not default
- [ ] `INITIAL_SUPERUSER_PASSWORD` changed from `admin123`
- [ ] `POSTGRES_PASSWORD` strong and unique
- [ ] `CONNECTOR_HOP_SECRET` generated randomly, same on backend and connector
- [ ] `CORS_ORIGINS` set to specific domain(s), not `*`
- [ ] `COOKIE_SECURE=true` and `DEBUG=false`
- [ ] `ENVIRONMENT=production`
- [ ] Port 5432 (PostgreSQL) NOT exposed to public internet
- [ ] Port 8000 (backend) NOT exposed directly — behind nginx/Caddy on 443
- [ ] Port 18080 (connector proxy) NOT exposed to public internet
- [ ] TLS certificate valid (not self-signed for production)
- [ ] `HEADSCALE_API_KEY` (if used) not in any log output or API response
- [ ] `.env` in `.gitignore` (already is — confirm before any git push)

---

## What Still Needs Manual Cloud Testing

These steps cannot be automated locally and require a real deployed instance:

| Item | Manual test |
|---|---|
| End-to-end HTTPS traffic | Access the site at `https://your-domain.com` in a browser |
| Let's Encrypt cert renewal | Run `certbot renew --dry-run` |
| Azure Graph integration | Enable `MS_*` vars; check `/api/graph/users` returns real data |
| Intune device compliance | Check trust score reflects real device state |
| PostgreSQL persistence across restart | `docker compose restart` → data survives |
| Connector on separate host | Install connector runtime on a second machine |
| Electron app → cloud backend | Set backend URL to `https://your-domain.com`, verify login |
| ECS / managed container deployment | Replaces `docker compose` with ECS task definitions |
