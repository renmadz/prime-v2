---
name: run-prime-v2
description: Build, start, and drive the PRIME v2 full stack (Docker Compose — React frontend, Fastify backend, PostgreSQL, MinIO). Use when asked to run PRIME v2, start the app, log in as a seeded dev/test account, screenshot a page, smoke-test the API, or run the backend/frontend test suites.
---

All paths below are relative to the repo root (`prime-v2/`), the same directory
this file's `.claude/skills/run-prime-v2/` lives under. Windows host, run
commands from PowerShell or Git Bash — both work; examples below use Bash/POSIX
form since that's what was verified.

## Prerequisites

- Docker Desktop installed and **running** (`docker ps` must succeed — if it
  errors with a pipe/socket error, start Docker Desktop and wait ~30-60s).
- Node 20+ on the host (only needed for running tests or the Playwright driver
  outside Docker — the app itself runs entirely in containers).
- Nothing else already bound to host ports **3000** (backend) or **5173**
  (frontend). Check with (PowerShell): `Get-NetTCPConnection -LocalPort 3000`.

## Build & start (agent path)

```bash
# 1. .env must exist — the app will not start correctly with placeholder
#    values from .env.example if a Postgres volume from a prior run already
#    has a different password baked in. If apps/backend/.env or the root
#    .env is missing, copy it and fill SESSION_SECRET / POSTGRES_PASSWORD /
#    MINIO keys with real values (see Gotchas).
test -f .env || cp .env.example .env

# 2. Build images and start every service in the background.
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build

# 3. Wait ~15-20s for health checks, then confirm both are actually serving.
curl -s http://localhost:3000/health
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173
```

Expected: `{"status":"ok","timestamp":"..."}` and `200`.

**First run only** (fresh Postgres volume — no tables/users yet):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec prime-backend npx prisma db push
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec prime-backend npx prisma db seed
```

`db push` is idempotent — safe to re-run any time the schema looks out of sync
(symptom: seed fails with `P2021 ... table does not exist`).

## Drive it (agent path — this is the harness)

Two layers are drivable. Most PRs touch the backend routes, so start there;
use the Playwright driver when the change is UI-visible.

### A. API — curl (fast, no browser needed)

```bash
# Log in as a seeded dev account, keep the session cookie
curl -s -c /tmp/cookies.txt -X POST http://localhost:3000/api/auth/staff/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@dev.local","password":"DevAdminPassw0rd!123"}'
# → {"status":"ok","mustChangePassword":false}

# Use the cookie against any authenticated route
curl -s -b /tmp/cookies.txt http://localhost:3000/api/auth/me
# → {"id":"...","email":"admin@dev.local","roles":["ADMIN"],...}
```

Route is `/api/auth/staff/login`, **not** `/api/auth/login` (that 404s).

### B. Browser — Playwright driver (`driver.mjs`, this directory)

```bash
cd .claude/skills/run-prime-v2
npm install                      # one-time: installs local playwright devDependency
npx playwright install chromium --with-deps   # one-time: downloads the browser binary
node driver.mjs all              # runs every flow below, writes ./screenshots/*.png
```

Flows (pass one as `argv[2]` instead of `all` to run just that one):

| Flow | What it does |
|---|---|
| `login-admin` | Staff-login as `admin@dev.local`, screenshot `/dashboard` |
| `new-proposal` | Staff-login as `applicant@dev.local`, screenshot `/proposals/new` |
| `focal-queue` | Staff-login as `focal@dev.local`, screenshot `/queue` |
| `submit-gia` | Staff-login as `applicant@dev.local`, fills every visible field on a GIA proposal generically, saves, submits, screenshots the result |
| `admin-users` | Staff-login as `admin@dev.local`, screenshot `/admin/users` |

Each flow uses its own `browser.newContext()` — **do not** reuse one `page`
across accounts (see Gotchas: the login page hard-redirects an authenticated
session straight to `/dashboard`, so `getByRole('button', {name:'Staff Login'})`
never appears and the click times out).

Screenshots land in `.claude/skills/run-prime-v2/screenshots/` (gitignored).
**Always open and look at them** — a 401 in the browser console during
navigation is normal (unauthenticated route probes before login completes)
and not a failure signal by itself; a blank page or the wrong URL is.

## Test suites

Dependencies must be installed **on the host**, not just inside the
containers — `apps/backend/node_modules` and `apps/frontend/node_modules`
don't exist until you run `npm install` locally (see Gotchas: `allow-scripts`).

```bash
# Backend
cd apps/backend
npm install
npm approve-scripts --all        # only needed once — npm 11+ blocks postinstall
                                  # scripts (prisma generate, esbuild) by default
npx prisma generate
npm run prisma:push:test         # schema → prime-postgres-test (port 5433)
npm run test:local                # 120 tests, ~55s

# Frontend
cd apps/frontend
npm install
npm approve-scripts --all
npx vitest run                    # 7 tests, ~3s
```

All 127 tests (120 backend + 7 frontend) passed in this environment (2026-07-08).

## Stop

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

Add `-v` only if you intentionally want to wipe the Postgres/MinIO volumes
(you'll need to re-run `db push` + `db seed` afterward).

## Gotchas

- **Editing a file on the host does NOT reliably reload `tsx watch` /
  Vite HMR inside the container on this Windows + Docker Desktop setup.**
  This is the single most time-costly gotcha in this repo. Both the backend
  (`tsx watch src/server.ts`) and frontend (Vite dev server) are supposed to
  pick up bind-mounted source changes automatically, but inotify events from
  Windows-host file writes don't always propagate through Docker Desktop's
  file-sharing layer into the Linux container's watcher. Symptoms seen this
  session: (1) added `assignments.ts` + registered it in `app.ts` — the new
  route 404'd until `docker compose restart prime-backend`; (2) edited
  `ProposalFormPage.tsx` to add a `useRef` guard — `curl`'ing the Vite-served
  source (`curl http://localhost:5173/src/pages/.../ProposalFormPage.tsx`)
  still showed the *old* code with zero occurrences of the new ref, even
  though `docker exec ... cat` on the same in-container path showed the
  *correct*, up-to-date content (so the bind mount itself was fine — only
  the dev server's live-reload/watch was stale). **After any backend or
  frontend source edit that must take effect, don't trust hot-reload —
  verify directly** (`curl` the API route, or `curl` the raw Vite module
  source and grep for a distinctive new string) **and if stale, force it:**
  `docker compose -f docker-compose.yml -f docker-compose.dev.yml restart prime-backend`
  (or `prime-frontend`). This is fast (~3-5s) — cheaper than debugging a
  phantom "my fix didn't work" for ten minutes.

- **Docker healthcheck was broken as of the first version of this skill —
  now fixed upstream.** `docker-compose.yml` previously shelled out to
  `curl`, which isn't installed in the `builder` stage the dev override
  uses, so `prime-backend`/`prime-frontend` always showed `unhealthy` even
  when fine. This has since been fixed to use `wget` (busybox-provided,
  always present) against `127.0.0.1` (not `localhost`, which resolves to
  `::1` first and these services only bind IPv4). If you ever see
  `unhealthy` again, the containers were probably started before a compose
  file change — `docker compose up -d` **recreates** (not just restarts)
  containers whose config changed; a plain `restart` does not pick up a
  compose-file healthcheck edit.

- **Stale containers left over from a previous `docker compose up` (no
  `-f docker-compose.dev.yml`) will crash-loop.** Symptom:
  `ERR_MODULE_NOT_FOUND: Cannot find module '/app/src/server.ts'`. Cause:
  the base `docker-compose.yml` alone builds the production target (compiled
  `dist/`, no source bind-mount); the dev override adds
  `command: npx tsx watch src/server.ts` + `volumes: ./apps/backend/src:/app/src`.
  If you inherit containers you didn't start yourself, check
  `docker inspect <name> --format '{{.Config.Cmd}}'` before assuming they're
  healthy — if the command doesn't mention `tsx watch`, `down` and re-`up`
  with **both** compose files.

- **`.env` must match whatever's already baked into an existing Postgres
  volume.** `cp .env.example .env` alone gives you placeholder passwords
  (`replace-with-strong-password`) that won't match a volume seeded by an
  earlier run. If containers already exist, pull the real values first:
  `docker inspect prime-backend --format '{{range .Config.Env}}{{println .}}{{end}}'`
  and copy `POSTGRES_PASSWORD` / `DATABASE_URL` / `SESSION_SECRET` /
  `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` into `.env` before running anything
  that recreates the containers.

- **Containers can vanish across a Docker Desktop restart while volumes
  survive.** `docker ps -a` came back completely empty mid-session here (no
  stopped containers, nothing) after Docker Desktop restarted, while
  `docker volume ls` still showed `prime-v2_prime-postgres-data` and
  `prime-v2_prime-minio-data` intact. Just re-run `up -d` — no need to
  re-seed if the volumes are still there (verify with
  `docker compose exec prime-postgres psql -U primev2_user -d primev2 -c "SELECT count(*) FROM users;"`).

- **Orphaned `prime-postgres-test` container name collision.** If `up`
  fails with `Conflict. The container name "/prime-postgres-test" is
  already in use`, a leftover container from a prior run owns the name:
  `docker rm -f prime-postgres-test` then retry `up -d`.

- **npm 11+ blocks postinstall scripts by default** (`allow-scripts`
  feature). `npm install` on both `apps/backend` and `apps/frontend` prints
  a warning and silently skips `prisma generate` / `esbuild`'s postinstall —
  tests then fail in confusing ways (missing `@prisma/client` runtime, or
  succeed but with a stale client). Run `npm approve-scripts --all` right
  after install, then explicitly `npx prisma generate` in `apps/backend`.

- **Playwright: one browser context per account.** The login page does
  `if (isAuthenticated) return <Navigate to="/dashboard" />`. Reusing one
  `page`/context across `staffLogin()` calls for different accounts means
  the second `page.goto(BASE_URL)` instantly redirects past the login form,
  and `getByRole('button', {name:'Staff Login'})` times out 30s later. Use
  `browser.newContext()` per account (already done in `driver.mjs`).

- **Login route is `/api/auth/staff/login`.** `/api/auth/login` 404s. The
  Google OAuth path (`/api/auth/google`) is the one applicants use in
  production; local dev always uses Staff Login with an `@dev.local` account
  regardless of role, per `docs/deployment/DEV-TEST-ACCOUNTS.md`.

- **An unrelated host process may already hold port 3000.** Hit
  `ports are not available: exposing port TCP 0.0.0.0:3000` once because an
  unrelated Next.js dev server (different project) was still listening.
  Identify it with `Get-NetTCPConnection -LocalPort 3000` →
  `Get-CimInstance Win32_Process -Filter "ProcessId = <pid>"` to see the
  command line before killing anything — don't assume it's safe to kill
  without checking what it is.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `docker ps` → `error during connect ... dockerDesktopLinuxEngine` | Docker Desktop isn't running. Start it, wait ~30-60s, retry. |
| `curl http://localhost:3000/health` → connection refused | Containers not up, or backend crash-looping — check `docker logs prime-backend`. |
| Backend log: `ERR_MODULE_NOT_FOUND ... src/server.ts` | Started with prod compose only; see Gotchas — redo `up -d` with both `-f` files. |
| Seed fails: `P2021 ... table does not exist` | Prisma schema ahead of DB — `docker compose exec prime-backend npx prisma db push`, then re-seed. |
| `prisma:push:test` → `'cross-env' is not recognized'` | `apps/backend` host deps not installed — `npm install` there first. |
| Backend tests fail with Prisma client errors right after `npm install` | Postinstall scripts were skipped — `npm approve-scripts --all` then `npx prisma generate`. |
| `up -d` → `Conflict ... "/prime-postgres-test" is already in use` | `docker rm -f prime-postgres-test`, retry. |
| `up -d` → `ports are not available ... 0.0.0.0:3000` | Something else on the host owns port 3000 — identify and stop it, or remap the port. |
