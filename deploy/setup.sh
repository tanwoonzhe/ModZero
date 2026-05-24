#!/usr/bin/env bash
# Run once before `docker compose build` to ensure deploy/.env exists.
# Docker Compose resolves ${VITE_API_BASE} and other build args from a .env
# in the same directory as the compose file (deploy/), NOT from the repo root.
# This script creates a symlink so both resolve to the same file.

set -euo pipefail
cd "$(dirname "$0")"

if [ -L .env ]; then
    echo "deploy/.env symlink already exists — skipping"
elif [ -f .env ]; then
    echo "deploy/.env already exists as a regular file — skipping (not overwriting)"
else
    ln -sf ../.env .env
    echo "Created deploy/.env → ../.env symlink"
fi

echo "Ready. Next steps:"
echo "  1. Edit ../.env (fill in POSTGRES_PASSWORD, SECRET_KEY, VITE_API_BASE, etc.)"
echo "  2. cd deploy && docker compose up -d db backend frontend intranet"
echo "  3. docker compose exec backend alembic upgrade head"
echo "  4. Create a connector enroll token in the admin UI"
echo "  5. Add MODZERO_ENROLL_TOKEN=<token> to ../.env"
echo "  6. docker compose up -d connector"
