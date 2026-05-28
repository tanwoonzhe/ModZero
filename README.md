# ModZero — Self-Hosted ZTNA Platform

A lightweight, self-hosted Zero Trust Network Access platform designed to run on a 2 vCPU / 4 GiB RAM server.

## Repository Structure

```
backend/        FastAPI controller (auth, policy, resource access, connector mgmt)
frontend/       React admin dashboard (Vite + TypeScript + Tailwind)
client-app/     Electron desktop client (Windows)
connector/      Lightweight Python reverse-proxy agent
deploy/         Docker Compose deployment files
docs/           Architecture and usage documentation
legacy/         Preserved prior-iteration code
```

## Quick Start (Development)

```bash
cp .env.example .env
# Edit .env with your secrets

# Always run from the repo root
docker compose -f deploy/docker-compose.yml up -d
```

Dashboard: http://localhost:5173  
API:        http://localhost:8000/docs

## Quick Start (Production)

```bash
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.prod.yml up -d
```

See `docs/DEMO.md` for a full walkthrough.

## Resource Requirements

| Service   | Memory  | Notes                          |
|-----------|---------|--------------------------------|
| backend   | ~150 MB | FastAPI + uvicorn               |
| frontend  | ~20 MB  | Nginx static                    |
| db        | ~100 MB | PostgreSQL 15                   |
| connector | ~50 MB  | Python reverse proxy            |
| **Total** | ~320 MB | Well within 4 GiB               |

## Demo Access Path

The active demo access path is **Connector Gateway (HTTP proxy)**:

```
Electron Client App → Backend policy engine → Connector Gateway → Protected Resource
```

Headscale / WireGuard tunnel code is present in the repository as archived future work.
It is **not part of the active demo scope** and is not enabled in the default deployment.

- `backend/app/routers/tunnels*.py` — Headscale/WireGuard tunnel management endpoints (archived)
- `client-app/src/main/tunnel-detect.ts` — Read-only Tailscale status probe (archived)
- `/tunnels` web route — accessible by direct URL but hidden from the admin sidebar

No tunnel UI is shown in the Electron client Overview tab or the admin dashboard sidebar.

