# PRIME v2 — Local Development Setup

## Prerequisites
- Docker Desktop (or Docker Engine + Compose plugin v2+)
- Node 20+ (for running tests outside Docker)
- Copy .env.example to .env and fill in all values before starting

## Start the full local stack
make dev-up          # boot (reuses built images)
make dev-build       # rebuild images then boot (after Dockerfile/dep changes)
make dev-down        # stop; keeps volumes (dev DB data survives)

Equivalent raw command:
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

⚠ docker-compose.dev.yml is an OVERRIDE file — never pass it with -f on its
own. `docker compose -f docker-compose.dev.yml up` fails with
"service prime-minio has neither an image nor a build context" because the
image/build definitions live in the base docker-compose.yml.

## Verify health
curl http://localhost:3000/health
Expected response: { "status": "ok", "timestamp": "<ISO string>" }

Frontend: http://localhost:5173

## Run tests outside Docker
# One-time schema sync for the test DB (already included in docker-compose.dev.yml):
# The test DB (prime-postgres-test) starts automatically when you run the dev compose stack.
# After first startup, push the schema once:
cd apps/backend && npm run prisma:push:test

# Then run tests on any OS (Mac/Windows/Linux):
cd apps/backend && npm run test:local
cd apps/frontend && npm run test -- --run

## TypeScript check
cd apps/backend && npx tsc --noEmit
cd apps/frontend && npx tsc --noEmit

## Common issues
- PostgreSQL not ready: run docker compose ps — wait for prime-postgres to show healthy
- MinIO not reachable: check MINIO_ACCESS_KEY and MINIO_SECRET_KEY are set in .env
- Port conflict on 3000 or 5173: stop other local servers using those ports
