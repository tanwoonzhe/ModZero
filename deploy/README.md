# deploy/

Docker Compose deployment files for ModZero.

## Development

Always run from the **repo root** so Docker Compose finds `.env` automatically
and names the project correctly:

```bash
# From D:\degree\sem6\code\ModZero (repo root)
docker compose -f deploy/docker-compose.yml up -d
```

If you must run from inside `deploy/`, pass the env file explicitly:

```bash
# From inside deploy/
docker compose --env-file ../.env up -d
```

## Production

```bash
# From repo root
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.prod.yml up -d
```

Generate a self-signed TLS cert for demo/FYP use:

```bash
bash legacy/scripts/gen-selfsigned-cert.sh
```

Place the resulting files in `certs/` at the repo root.
