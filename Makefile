# ─────────────────────────────────────────────────────────
# prime-v2 — local development convenience targets
#
# docker-compose.dev.yml is an OVERRIDE file: it only works layered on
# top of docker-compose.yml. Running `-f docker-compose.dev.yml` alone
# fails ("service has neither an image nor a build context"). These
# targets always pass both files in the right order.
# ─────────────────────────────────────────────────────────

DEV_COMPOSE := docker compose -f docker-compose.yml -f docker-compose.dev.yml

.PHONY: dev-up dev-down dev-build dev-logs dev-ps test

## Boot the full dev stack (backend :3000, frontend :5173, postgres :5432,
## test-postgres :5433, minio :9000-9001). Reuses existing containers.
dev-up:
	$(DEV_COMPOSE) up -d

## Rebuild images then boot (use after Dockerfile/dependency changes).
dev-build:
	$(DEV_COMPOSE) up -d --build

## Stop and remove containers. Keeps named volumes (dev DB data survives).
## Never add -v here — that would wipe the dev database.
dev-down:
	$(DEV_COMPOSE) down

dev-logs:
	$(DEV_COMPOSE) logs -f --tail=100

dev-ps:
	$(DEV_COMPOSE) ps

## Backend test suite against the isolated test DB on :5433.
## (Not `npm run test` — that resolves to the wrong database.)
test:
	cd apps/backend && npm run prisma:push:test && npm run test:local
