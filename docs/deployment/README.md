# Deployment

Coolify configuration, Docker setup, environment variables, backup/restore, and rollback procedures.

**Target deliverables:** Deployment guide, environment checklist, monitoring plan

**Approval required before:** Staging deployment (Phase 16)

---

## Docker Files (Phase 4 — infrastructure scaffolding)

| File | Purpose |
|---|---|
| `docker-compose.yml` | Production/staging service stack — 4 services |
| `docker-compose.dev.yml` | Local dev overrides — exposes DB and MinIO ports |
| `.env.example` | All required environment variables with placeholder values |
| `apps/frontend/Dockerfile` | Multi-stage build: Vite → nginx |
| `apps/frontend/nginx.conf` | nginx config for SPA serving with security headers |
| `apps/backend/Dockerfile` | Multi-stage build: tsc → Node 20 non-root runner |
| `.dockerignore` | Keeps secrets and docs out of Docker build context |

## Quick Start (local development)

```bash
# 1. Copy environment file and fill in values
cp .env.example .env

# 2. Start all services (standard)
docker compose up

# 3. OR start with dev overrides (exposes DB + MinIO ports locally)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

PostgreSQL will be available at `localhost:5432` (dev only).
MinIO console will be available at `http://localhost:9001` (dev only).
Backend API will be available at `http://localhost:3000`.

## Service Topology

```
Internet
    │  HTTPS (Coolify reverse proxy)
    ├── prime-frontend  :80   (static assets)
    └── prime-backend   :3000 (API /api/*)

Internal Docker network only (not internet-reachable):
    prime-backend ──► prime-postgres :5432
    prime-backend ──► prime-minio    :9000
```

## Notes

- `prime-postgres` and `prime-minio` have no exposed ports in `docker-compose.yml`. They are internal only.
- The `.env` file must never be committed to Git.
- Application source code does not exist yet — Dockerfiles are stubs ready for Phase 6+ implementation.
- A full deployment guide (Coolify setup, domain configuration, SSL, backup schedule) will be written before Phase 16 staging deployment.
