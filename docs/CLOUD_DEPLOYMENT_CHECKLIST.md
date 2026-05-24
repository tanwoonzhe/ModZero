# ModZero — Cloud Deployment Checklist

> This checklist covers deploying ModZero to a cloud server (VPS, EC2, etc.)
> with a real domain and HTTPS.
>
> **Note:** This system is NOT production-ready in its current state.
> Treat this as a guided pre-production deployment checklist. Items marked
> ⚠️ REQUIRED must be resolved before the system handles real users or data.

---

## 0. Prerequisites

- [ ] A Linux server (Ubuntu 22.04+ recommended) with Docker and Docker Compose v2 installed
- [ ] A domain name with DNS A record pointing to the server IP
- [ ] Port 80 and 443 open in firewall / security group
- [ ] Port 8000 NOT publicly exposed (backend proxied through nginx/Caddy)
- [ ] Git access to the ModZero repository

---

## 1. Required Environment Variables

Create a `.env` file at the repo root. **Never commit this file.**

### 1.A — Core Backend

```env
# ⚠️ REQUIRED — change from default
SECRET_KEY=<random 64-char hex string>           # openssl rand -hex 32
ENVIRONMENT=production
DEBUG=false

# ⚠️ REQUIRED — PostgreSQL
POSTGRES_USER=modzero
POSTGRES_PASSWORD=<strong random password>
POSTGRES_DB=modzero
DATABASE_URL=postgresql+psycopg2://modzero:<password>@db:5432/modzero
```

### 1.B — Auth / Session

```env
ACCESS_TOKEN_EXPIRE_MINUTES=480
JWT_ALGORITHM=HS256
COOKIE_SECURE=true           # ⚠️ REQUIRED for HTTPS deployment
COOKIE_SAMESITE=lax
```

### 1.C — URLs and CORS

```env
# ⚠️ REQUIRED — set to your actual domain
PUBLIC_BASE_URL=https://your-domain.com
CORS_ORIGINS=https://your-domain.com        # comma-separated if multiple origins
                                             # DO NOT use * in production
```

### 1.D — Connector

```env
CONNECTOR_BASE_URL=http://connector:8443    # internal docker network name
CONNECTOR_HOP_SECRET=<random secret>        # shared between backend + connector
CONNECTOR_TRANSPORT=direct_http
MODZERO_ENROLL_TOKEN=                       # generated after first login (leave empty)
```

### 1.E — Microsoft Graph / Azure (optional, enables Intune posture)

```env
AZURE_TENANT_ID=<tenant id>
AZURE_CLIENT_ID=<app client id>
AZURE_CLIENT_SECRET=<app client secret>
MS_TENANT_ID=<same as AZURE_TENANT_ID>
MS_CLIENT_ID=<same as AZURE_CLIENT_ID>
MS_CLIENT_SECRET=<same as AZURE_CLIENT_SECRET>
MS_GRAPH_SCOPES=https://graph.microsoft.com/.default
```

If Azure credentials are not provided the backend still runs; Intune-based
posture scoring returns 0 / not-compliant for all devices.

### 1.F — Headscale / WireGuard tunnel (optional)

```env
HEADSCALE_ENABLED=false                     # set true only after Headscale is deployed
HEADSCALE_URL=https://headscale.your-domain.com
HEADSCALE_API_KEY=<headscale api key>       # ⚠️ NEVER returned in any API response
HEADSCALE_USER=modzero
```

### 1.G — Frontend

```env
VITE_API_BASE=https://your-domain.com/api
```

This value must be baked into the frontend build. Rebuild the frontend image
whenever this changes.

---

## 2. Backend URL Configuration

### What serves the backend

The backend FastAPI service binds to `0.0.0.0:8000` inside Docker.
In production it **must not** be exposed directly on port 8000.
Use a reverse proxy (nginx, Caddy, Traefik) to:

- Terminate HTTPS on 443
- Forward `/api/*` and `/docs` to `localhost:8000`
- Serve the built frontend static files or proxy `localhost:5173`

### nginx example snippet

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location /api/ {
        proxy_pass http://localhost:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        root /var/www/modzero/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 3. Frontend URL

- Build the React admin UI with `VITE_API_BASE` pointing to the cloud backend:
  ```bash
  cd frontend
  VITE_API_BASE=https://your-domain.com/api npm run build
  ```
- Deploy `frontend/dist/` as static files behind nginx, or use the Dockerfile
  included in `frontend/` which serves via nginx.

---

## 4. CORS Configuration

| Setting | Local Dev | Production |
|---|---|---|
| `CORS_ORIGINS` | `*` | `https://your-domain.com` |
| `COOKIE_SECURE` | `false` | `true` |
| `COOKIE_SAMESITE` | `lax` | `lax` (or `strict`) |

⚠️ `CORS_ORIGINS=*` must NOT be used in production — it allows any origin to
make authenticated cross-origin requests.

---

## 5. HTTPS / Reverse Proxy

- [ ] TLS certificate obtained (Let's Encrypt via Certbot or Caddy auto-HTTPS)
- [ ] HTTPS enforced; HTTP redirects to HTTPS (nginx: `return 301 https://$host$request_uri`)
- [ ] Backend port 8000 NOT directly reachable from the public internet
- [ ] `PUBLIC_BASE_URL` set to `https://your-domain.com`
- [ ] `COOKIE_SECURE=true`

---

## 6. PostgreSQL Persistence

The `docker-compose.yml` uses a named Docker volume `postgres_data`.
This persists across `docker compose down/up` but **NOT** across `docker
compose down -v` (which removes volumes).

- [ ] Confirm volume exists: `docker volume ls | grep postgres_data`
- [ ] Backup before any schema migration: `pg_dump -U modzero modzero > backup.sql`
- [ ] Run migrations after deploy: `docker compose exec backend alembic upgrade head`
- [ ] Check current head: `docker compose exec backend alembic current` → should show `i9j0k1l2m3n4 (head)`

For managed PostgreSQL (RDS, Cloud SQL, Supabase), replace `DATABASE_URL` with
the external connection string and remove the `db` service from `docker-compose.yml`.

---

## 7. Docker Compose Commands

```bash
# Build and start all services
cd deploy
docker compose -f docker-compose.yml up -d --build

# Apply migrations
docker compose exec backend alembic upgrade head

# Check logs
docker compose logs -f backend
docker compose logs -f connector

# Restart backend only (after env change)
docker compose up -d --force-recreate backend

# Stop all (preserves volumes)
docker compose down

# Stop and remove volumes (DATA LOSS)
docker compose down -v
```

For production, consider `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`
(the prod compose file in `deploy/` adds resource limits and restart policies).

---

## 8. Seed Demo Data

After first deploy on a fresh database:

```bash
# Create initial admin user (done automatically on backend startup via INITIAL_SUPERUSER_* env vars)
# Verify:
curl https://your-domain.com/api/auth/login \
  -d "username=admin&password=admin123" \
  -H "Content-Type: application/x-www-form-urlencoded"

# Seed protected resources and connectors for demo
BASE=https://your-domain.com python tools/seed_demo_data.py
```

⚠️ Change `INITIAL_SUPERUSER_PASSWORD` from `admin123` before seeding production.

---

## 9. Connector Runtime Connection

The `connector_runtime` package running on a connector machine connects to the
backend via `MODZERO_BACKEND_URL`.

```bash
# On the connector machine
export MODZERO_BACKEND_URL=https://your-domain.com
export MODZERO_ENROLL_TOKEN=<token from admin UI>
python -m connector_runtime
```

Or using Docker:
```bash
docker run --env MODZERO_BACKEND_URL=https://your-domain.com \
           --env MODZERO_ENROLL_TOKEN=<token> \
           modzero-connector
```

The connector's built-in HTTP proxy (`--proxy`) listens on the **local**
network and is **not** exposed to the public internet. This is by design.

---

## 10. Electron App Backend URL

The Electron desktop client (`client-app/`) reads the backend URL from a
persisted settings file. Users can change it in the Settings screen.

Default: `http://localhost:8000`  
Production: `https://your-domain.com`

To build the Electron app pointing to a cloud backend:
```bash
cd client-app
# Edit default URL in src/main/main.ts if needed (BACKEND_URL constant)
npm run package:win:portable
```

The `.exe` is portable and can be distributed to users. Backend URL can be
changed at runtime via the Settings screen without rebuilding.

---

## 11. Known Limitations for Cloud Deployment

| # | Limitation | Impact |
|---|---|---|
| 1 | Connector HTTP proxy binds to localhost only | The proxy is not reachable from the cloud server's public IP. Intended behaviour: the connector runs on the same network as the protected resource. Remote users dial the proxy via the Electron client through the access URL, which requires the connector to be network-adjacent to the resource. |
| 2 | WireGuard tunnel not yet replacing HTTP proxy | Even with Headscale deployed, actual data still transits the HTTP proxy. WireGuard is reported as metadata only. |
| 3 | No per-service TLS for inter-container communication | Backend ↔ DB and Backend ↔ Connector use plain HTTP inside the Docker network. Acceptable in a single-host Docker deployment; use a mesh or mutual TLS for multi-host production. |
| 4 | Single-instance only | No horizontal scaling or load balancing implemented. One backend process, one DB, one connector per network. |
| 5 | `SECRET_KEY` rotation invalidates all sessions | Changing `SECRET_KEY` signs out every user immediately. Plan a maintenance window. |
| 6 | `INITIAL_SUPERUSER_PASSWORD=admin123` default | ⚠️ Must be changed before any real-user deployment. Set `INITIAL_SUPERUSER_PASSWORD` in `.env`. |
| 7 | No email/2FA for login | Authentication is username + password only. No MFA, no password reset flow. |
| 8 | Access Log page (`/api/attempts`) may be empty on fresh deploy | The `/attempts` endpoint requires prior access request activity. The page now shows an error banner rather than mock data if the API call fails. |

---

## 12. Quick Verification After Deployment

```bash
# 1. Health check
curl https://your-domain.com/api/
# Expected: {"status":"ok","app":"ModZero","docs":"/docs"}

# 2. Login
curl -s -X POST https://your-domain.com/api/auth/login \
  -d "username=admin&password=<password>" \
  -H "Content-Type: application/x-www-form-urlencoded" | python -m json.tool
# Expected: {"access_token":"...","token_type":"bearer"}

# 3. Migration head
docker compose exec backend alembic current
# Expected: i9j0k1l2m3n4 (head)

# 4. Run verify_all.py against cloud backend (requires connector_sim running)
BASE=https://your-domain.com \
DEMO_CONNECTOR_PROXY_BASE_URL=http://localhost:18080 \
python tools/verify_all.py
```

---

## 13. Security Checklist Before Any Real-User Deployment

- [ ] `SECRET_KEY` is a random 64-char string, not the default
- [ ] `INITIAL_SUPERUSER_PASSWORD` changed from `admin123`
- [ ] `CORS_ORIGINS` set to specific domain(s), not `*`
- [ ] `COOKIE_SECURE=true` and `DEBUG=false`
- [ ] Port 8000 NOT reachable from public internet (behind reverse proxy)
- [ ] `HEADSCALE_API_KEY` not logged anywhere (backend never echoes it)
- [ ] `.env` file not committed to git (confirmed in `.gitignore`)
- [ ] PostgreSQL password is strong and not the default
- [ ] TLS certificate valid and auto-renewing
- [ ] `AZURE_CLIENT_SECRET` / `MS_CLIENT_SECRET` stored securely (not in plaintext logs)
