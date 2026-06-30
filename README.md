# ModZero — Self-Hosted Zero Trust Network Access (ZTNA) Platform

ModZero is a lightweight, self-hosted **Zero Trust Network Access** platform. Instead of trusting a device because it sits on the corporate network, ModZero evaluates a live **trust score** for every access request — combining device posture, user identity, and request context — and only grants access to protected internal resources when that score clears the resource's threshold.

It is designed to run comfortably on a small server (2 vCPU / 4 GiB RAM) and integrates optionally with **Microsoft Entra ID (Azure AD)** and **Intune** via Microsoft Graph.

---

## Table of Contents

- [Key Features](#key-features)
- [Architecture](#architecture)
- [How Access Works](#how-access-works)
- [Trust Scoring Model](#trust-scoring-model)
- [Repository Structure](#repository-structure)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quick Start (Docker)](#quick-start-docker)
- [Configuration](#configuration)
- [Running Components Individually](#running-components-individually)
- [Database Migrations](#database-migrations)
- [Microsoft Entra / Graph Integration](#microsoft-entra--graph-integration)
- [Building the Desktop Client](#building-the-desktop-client)
- [Production Deployment](#production-deployment)
- [API Documentation](#api-documentation)
- [Security Notes](#security-notes)
- [Project Scope](#project-scope)

---

## Key Features

- **Continuous trust evaluation** — every protected request is re-checked; a valid session cookie alone is never sufficient.
- **Device posture checks** — firewall, antivirus, disk encryption, screen lock, OS version, and client health, collected by the desktop client.
- **Identity signals** — local account state plus optional Microsoft Entra signals (MFA registration, Identity Protection risk, Conditional Access, group/role membership).
- **Context signals** — sign-in risk and trusted-location checks (when Entra is enabled).
- **Configurable policies** — per-resource trust thresholds, weighted scoring modules, and per-signal failure actions, editable from the admin dashboard.
- **Hard identity gate** — a disabled Entra account is denied outright, regardless of score.
- **Connector-based resource access** — internal resources are never exposed directly; the connector reverse-proxies traffic only for validated sessions.
- **Admin dashboard** — manage users, devices, trust policies, connectors/resources, and review audit/access logs.
- **Desktop client** — a tray application that signs the device-posture payload (which the web console cannot mint) and launches authorized resources.

---

## Architecture

```
                        ┌──────────────────────────┐
                        │   Admin Dashboard (React) │
                        │   users / policies / logs │
                        └────────────┬─────────────┘
                                     │ HTTPS (REST + WebSocket)
                                     ▼
┌──────────────────┐  device   ┌──────────────────────────┐   Microsoft Graph
│  Desktop Client   │ posture  │   Backend Controller      │ ◀───────────────▶  Entra ID / Intune
│  (Electron, tray) │ ───────▶ │   (FastAPI)               │     (optional)
│  posture + access │ ◀─────── │   auth · trust scoring    │
└──────────────────┘ access    │   policy · introspect     │
                     URL/token  └────────────┬─────────────┘
                                             │  signed introspect
                                             ▼
                                ┌──────────────────────────┐
                                │   Connector (reverse      │
                                │   proxy agent)            │
                                └────────────┬─────────────┘
                                             │ forwards only for
                                             ▼ validated sessions
                                ┌──────────────────────────┐
                                │   Protected Internal       │
                                │   Resource (e.g. portal)   │
                                └──────────────────────────┘

   PostgreSQL  ◀── persistence for users, devices, policies, sessions, audit logs
```

- **Backend controller** is the single source of truth for authentication, policy, and trust decisions.
- **Connector** holds no policy logic of its own — it calls the controller's introspect endpoint on every request and proxies upstream only when the controller approves.
- **Desktop client** is required to request access because device posture is signed client-side and cannot be forged from the browser.

---

## How Access Works

1. A user signs in to the **desktop client** with their ModZero credentials.
2. The client collects **device posture** and submits it to the backend (`POST /api/posture/report`). The backend computes and stores a trust score for that device.
3. The user requests access to a protected resource. The backend evaluates the live trust score against the resource's threshold and identity gate.
4. On approval, the backend mints a short-lived **session** and returns a launch/access URL pointing at the connector.
5. The browser opens that URL. The connector calls the backend **introspect** endpoint to validate the session, then reverse-proxies the internal resource.
6. Trust is **re-checked on every request** — if the score goes stale or drops below threshold, access is denied and the session cookie is cleared.

---

## Trust Scoring Model

The final trust score is a weighted blend of three modules (default weights, configurable in **Trust Policies → Trust Score Weights**):

| Module    | Default weight |
|-----------|----------------|
| Device    | 40%            |
| Context   | 30%            |
| Identity  | 30%            |

Access is allowed when the blended score meets the resource's **threshold** (default `60`).

**Device posture factors** (Windows client; `N/A` factors are excluded from the denominator, never counted as failures):

| Factor                    | Max | Source                       |
|---------------------------|-----|------------------------------|
| Firewall enabled          | 15  | Client App (Windows)         |
| Antivirus enabled         | 15  | Client App (Windows)         |
| Disk encryption enabled   | 15  | Client App (Windows)         |
| Screen lock enabled       | 10  | Client App (Windows)         |
| OS version supported      | 10  | Client App                   |
| Client healthy            | 10  | Client App                   |
| Recent posture check      | 10  | Derived (within 7 days)      |
| Intune compliant          | 20  | Microsoft Graph / Intune     |

**Identity signals** — local checks contribute up to 50 points (Recent Login 15, Low Failed Logins 25, Not Locked 10). When **Entra is enabled**, additional Microsoft Graph signals layer on (Account Enabled 30 *(hard gate)*, Role Valid 20, MFA Registered 25, Identity Risk Low 20, Conditional Access OK 15), capped at 100.

> Entra signals are **N/A and never penalize** while the integration is disabled. A signal only becomes a concrete pass/fail when Graph actually returns a usable value; unknown / transient-error results stay N/A so a Graph hiccup can never lock users out.

---

## Repository Structure

```
backend/          FastAPI controller — auth, trust scoring, policy, resource access,
                  connector management, Microsoft Graph/Entra integration, Alembic migrations
frontend/         React admin dashboard (Vite + TypeScript + Tailwind)
client-app/       Electron desktop client (Windows) — device posture + access requests
connector/        Python reverse-proxy connector agent (built by docker-compose)
connector_runtime/ Standalone connector runtime variant (gateway proxy)
deploy/           Docker Compose deployment files and setup scripts
docs/             Architecture, deployment, and demo documentation
tools/            Developer/testing utilities (e.g. connector simulator)
legacy/           Preserved prior-iteration code (not part of the active build)
```

---

## Tech Stack

| Layer         | Technology                                                              |
|---------------|------------------------------------------------------------------------|
| Backend       | Python 3.12, FastAPI, SQLAlchemy 2, Alembic, Pydantic v2, python-socketio |
| Auth          | JWT (python-jose), bcrypt/passlib                                       |
| Database      | PostgreSQL 15                                                           |
| Frontend      | React 18, TypeScript, Vite, Tailwind CSS, Zustand, React Router, Axios, Nivo/Recharts |
| Desktop       | Electron 28, TypeScript                                                 |
| Identity      | Microsoft Graph via MSAL (optional)                                     |
| Deployment    | Docker, Docker Compose, Nginx (reverse proxy / TLS)                     |

---

## Prerequisites

- **Docker** and **Docker Compose v2** (`docker compose`, not `docker-compose`)
- For local component development: **Python 3.12+**, **Node.js 18+**
- (Optional) A **Microsoft Entra** app registration for Graph/Intune signals

---

## Quick Start (Docker)

```bash
# 1. Clone and configure
cp .env.example .env
#    Edit .env — at minimum set SECRET_KEY, POSTGRES_PASSWORD, DATABASE_URL,
#    and the INITIAL_SUPERUSER_* credentials.

# 2. Start the stack (always run from the repo root)
docker compose -f deploy/docker-compose.yml up -d --build

# 3. Check health
curl http://localhost:8000/health
```

| Service        | URL                              |
|----------------|----------------------------------|
| Admin dashboard| http://localhost:5173            |
| Backend API    | http://localhost:8000            |
| API docs       | http://localhost:8000/docs (Basic-auth protected) |

The first startup auto-creates the initial superuser from `INITIAL_SUPERUSER_*` in `.env`.

> ⚠️ Change `INITIAL_SUPERUSER_PASSWORD` and `SECRET_KEY` before any non-local deployment — the defaults are for local development only.

---

## Configuration

All configuration is via environment variables (see [`.env.example`](.env.example) for the full list).

| Variable | Purpose | Example |
|----------|---------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql+psycopg2://postgres:pw@db:5432/modzero` |
| `SECRET_KEY` | JWT signing secret — **must** be a long random string | `openssl rand -hex 32` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Login session lifetime | `480` (8h) |
| `INITIAL_SUPERUSER_USERNAME` / `_EMAIL` / `_PASSWORD` | First admin created on startup | `admin` / … |
| `CORS_ORIGINS` | Comma-separated allowed origins, or `*` | `https://app.example.com` |
| `PUBLIC_BASE_URL` | Public URL behind TLS (used for access bootstrap URLs) | `https://app.example.com` |
| `COOKIE_SECURE` / `COOKIE_SAMESITE` | Cookie hardening (set `true`/`strict` in production) | `true` / `lax` |
| `CONNECTOR_BASE_URL` | Internal URL of the connector | `http://connector:8443` |
| `CONNECTOR_HOP_SECRET` | HMAC secret for backend↔connector hop | long random string |
| `GRAPH_MODE` | `disabled` \| `mock` \| `real` | `real` |
| `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` | Entra/Graph credentials | — |
| `VITE_API_BASE` | Frontend → backend API base (build-time) | `http://localhost:8000/api` |
| `MODZERO_ENROLL_TOKEN` | Connector enrollment token (generated in dashboard) | — |

> **Never commit `.env`** or any captured auth tokens. Real credentials belong only in the deployment environment.

---

## Running Components Individually

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # (Windows: .venv\Scripts\activate)
pip install -r requirements.txt
# Ensure DATABASE_URL points at a running Postgres, then:
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev        # dev server on http://localhost:5173
npm run build      # production build to dist/
npm run test       # unit tests (vitest)  — or: npx vitest run
```

### Desktop Client

```bash
cd client-app
npm install
npm run build:main     # compile the Electron main process
npm run dev            # run the app against a local dev backend
```

---

## Database Migrations

Schema is managed with **Alembic** (migrations in `backend/alembic/versions/`).

```bash
cd backend
alembic upgrade head                          # apply all migrations
alembic revision --autogenerate -m "message"  # create a new migration
alembic downgrade -1                           # roll back the latest
```

In the Docker deployment, migrations run from the backend container (see `backend/setup.sh`).

---

## Microsoft Entra / Graph Integration

Entra/Intune signals are **optional**. With them disabled, ModZero scores using local posture and identity data only.

1. In the Azure portal: **App registrations → New registration**.
2. Grant **Application** (not Delegated) permissions and admin-consent them:
   - `User.Read.All`
   - `Group.Read.All` (or `Directory.Read.All`)
   - `DeviceManagementManagedDevices.Read.All`
   - `IdentityRiskyUser.Read.All` (for Identity Protection risk)
3. Create a client secret and set `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` (and/or the `MS_*` equivalents) in `.env`.
4. In the dashboard: **Settings → Azure AD Integration → Test Connection**, then enable **Entra Identity & Device Signals**.

The enabled signals then contribute to the trust score and appear in the client's Device Check breakdown.

---

## Building the Desktop Client

A packaged Windows client can be published so it appears on the dashboard's **Settings → Desktop Client** download tile:

```bash
cd client-app
npm run package:zip:win    # builds and auto-publishes the .zip into
                           # backend/app/static/client/
```

The backend auto-discovers any artifact dropped into `backend/app/static/client/` and exposes it via `/api/client-app/download`. Build artifacts in that folder are gitignored — they are deployed separately, not committed.

---

## Production Deployment

- Use a reverse proxy (Nginx) to terminate **TLS** in front of the backend, frontend, and connector.
- Set `PUBLIC_BASE_URL` to the public HTTPS URL and `COOKIE_SECURE=true`.
- Restrict `CORS_ORIGINS` to your real dashboard origin (no `*`).
- Set strong, unique values for `SECRET_KEY`, `CONNECTOR_HOP_SECRET`, `POSTGRES_PASSWORD`, and `INITIAL_SUPERUSER_PASSWORD`.

A production compose overlay is provided:

```bash
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.prod.yml up -d --build
```

See [`docs/`](docs/) for cloud-specific runbooks (e.g. ECS deployment, deployment checklists).

### Approximate resource footprint

| Service   | Memory   | Notes               |
|-----------|----------|---------------------|
| backend   | ~150 MB  | FastAPI + uvicorn   |
| frontend  | ~20 MB   | Nginx static        |
| db        | ~100 MB  | PostgreSQL 15       |
| connector | ~50 MB   | Python reverse proxy|
| **Total** | ~320 MB  | within 4 GiB        |

---

## API Documentation

Interactive API docs are served at `/docs` (Swagger UI) and `/redoc`. They are protected by HTTP Basic auth using the `INITIAL_SUPERUSER_*` credentials. The raw schema is at `/openapi.json` (also Basic-auth protected). The health endpoint at `/health` returns `200` when the database is reachable and `503` when degraded.

---

## Security Notes

- **Device posture is signed by the client** — the web console cannot mint posture, preventing browser-side forgery.
- **Trust is continuous** — a valid cookie is re-validated against a fresh trust check on every protected request.
- **Identity hard gate** — only an *explicit* Graph negative (e.g. `accountEnabled == false`) denies access; unknown/transient results never gate, so a Graph outage cannot lock everyone out.
- **Secrets** (`SECRET_KEY`, `CONNECTOR_HOP_SECRET`, Azure credentials) must come from the environment and must never be committed.
- **Change all default credentials** before exposing the platform.

---

## Project Scope

The active access path is the **connector gateway (HTTP reverse proxy)**:

```
Desktop Client → Backend policy engine → Connector → Protected Resource
```

Headscale / WireGuard tunnel code is present in the repository as **archived future work**. It is not enabled in the default deployment and is hidden from the dashboard sidebar (the `/tunnels` route remains reachable by direct URL only):

- `backend/app/routers/tunnels*.py` — Headscale/WireGuard tunnel endpoints (archived)
- `client-app/src/main/tunnel-detect.ts` — read-only Tailscale status probe (archived)

---

## License

MIT (see component manifests).
