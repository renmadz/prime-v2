---
inclusion: always
---

# PRIME v2 — Kiro Session Context
> Last updated: 2026-07-01
> Purpose: Preserves full chat session history and decisions so a new Kiro account can resume without losing context.

---

## 1. Project Overview

**Project:** PRIME v2 — Proposal and Research Information Management Engine (version 2)
**Repo path:** `/Users/ahronjanl.rafaelahron.0804icloudcom/projects/prime-v2`
**Stack:** React 18 + Vite + TypeScript (frontend), Fastify + TypeScript (backend), PostgreSQL 16, MinIO, Coolify (deployment)
**Monorepo layout:**
- `apps/frontend/` — React SPA
- `apps/backend/` — Fastify API
- `docs/` — all architecture, agent, and requirements documents
- `docker-compose.yml` — production-style compose (already written)
- `docker-compose.dev.yml` — local dev overrides
- `.env.example` — placeholder env vars (already written, do not overwrite)

---

## 2. SDLC Phases — Status as of Session End

| Phase | Name | Status |
|---|---|---|
| Phase 1 | Project Kickoff | ✅ Done |
| Phase 2 | Requirements | ✅ Done |
| Phase 3 | Roles & Permissions | ✅ Done |
| Phase 4 | Architecture & Data Design | ✅ Done — architecture doc at `docs/architecture/PRIME-v2-Architecture.md` |
| Phase 5 | UX & Prototype | ✅ Done — wireframes + AppShell scaffold planned |
| **Phase 6** | **Foundation Implementation** | **🔄 In Progress — prompts written, not yet executed** |
| Phase 7+ | Feature Implementation | ⏳ Not started |

---

## 3. Key Architecture Decisions (from `docs/architecture/PRIME-v2-Architecture.md`)

- **Right-side navigation only** — no top navbar for authenticated pages. `AppShell` has content left, `RightNav` right.
- **Two auth paths — strictly separate:**
  - Applicants → Google OAuth 2.0 (`/auth/google`)
  - Staff → Email + bcrypt password (`POST /auth/staff/login`)
  - Staff cannot use Google login. Applicants cannot use staff login.
- **PostgreSQL and MinIO are NOT exposed outside the Docker network** — backend only.
- **MinIO presigned URLs** preferred for file downloads (security review pending ADR-002).
- **In-app notifications only for MVP** — SMTP email is OOS-15 (out of scope).
- **ORM not yet decided** — Prisma vs Drizzle. Architect Agent must finalize in Phase 6.
- **PDF generation not yet decided** — Puppeteer vs PDFKit. ADR-002 pending.
- **No supporting library is final** until Architect + Security Agent approve.

---

## 4. Phase 6 — Foundation Implementation

### What was agreed in session
Phase 6 prompt was broken into **5 separate per-agent prompts for Claude Code** (not Kiro spec). The user will paste each into a separate Claude Code session.

### Agent prompts written (ready to paste into Claude Code)

#### 🏗️ Architect Agent — Scaffold Decisions
- Decides: ORM (Prisma or Drizzle), shared types package (yes/no), module boundaries for `apps/backend/src/` and `apps/frontend/src/`, TypeScript strict config, test runner (Vitest).
- Output: decision log in chat only (no files). This is the contract other agents follow.

#### ⚙️ Backend Agent — apps/backend/ scaffold
- Fastify + TypeScript strict, `GET /health` endpoint returning `{ status: "ok", timestamp }`.
- Packages: `fastify`, `@fastify/env`, `@fastify/helmet`, `@fastify/cors`, `zod`, `vitest`, `typescript`, `tsx`.
- **Do NOT install ORM, auth libraries, or bcrypt yet.**
- Env vars validated at startup via `@fastify/env` — app crashes on missing vars (fail-fast).
- CORS restricted to `FRONTEND_URL` only — never `*`.
- Error handler: 500 → `{ error: "Internal Server Error", statusCode: 500 }`, no stack traces in production.
- Tests: `health.test.ts` — TC-BE-01 through TC-BE-06 must pass.

#### 🎨 Frontend Agent — apps/frontend/ scaffold
- Vite + React 18 + TypeScript strict.
- Packages: `react-router-dom`, `@tanstack/react-query`, `vitest`, `@testing-library/react`, `jsdom`.
- **Do NOT install MUI, Chakra, or any UI component library yet.**
- Build `AppShell`, `RightNav`, `RightNavDrawer`, `PageHeader` components.
- Responsive: mobile < 768px (drawer), tablet 768–1023px (icon rail), desktop ≥ 1024px (full sidebar).
- `navConfig.ts` maps roles to nav items (hardcoded, no real auth yet).
- `useAuth.ts` stub returns `{ user: null, role: null, isLoading: false }`.
- Tests: TC-FE-01 through TC-FE-07 must pass.

#### 🛡️ Security Agent — Review + Env Contract
- Run FIRST to define env var security contract.
- Then re-run after Backend and Frontend scaffold to review for: helmet, CORS, env leaks, stack traces in prod, hardcoded secrets.
- Reports PASS/FAIL/WARNING — does not fix issues itself.

#### 🚢 DevOps Agent — Docker + LOCAL-DEVELOPMENT.md + CI
- Verify `docker compose config` passes after scaffolds built.
- Write/verify `docker-compose.dev.yml` with hot-reload mounts and exposed ports for local inspection.
- Write `docs/deployment/LOCAL-DEVELOPMENT.md`.
- Write `.github/workflows/ci.yml` with backend + frontend test jobs on push/PR.

#### 🧪 QA Agent — Test Cases + Push Gate
- Defines TC-BE-01 to TC-FE-07 BEFORE implementation.
- Runs `tsc --noEmit` + test suites after each agent completes.
- QA Push Gate checklist must be clear before any `git push`.

### Recommended execution order
1. Security Agent (env contract)
2. Architect Agent (scaffold decisions)
3. Backend Agent + Frontend Agent (parallel — independent)
4. Security Agent (review pass)
5. DevOps Agent
6. QA Agent (final gate)

---

## 5. Agent Roster (from `docs/agents/AGENT-ROSTER.md`)

| Agent | Owns |
|---|---|
| Product Manager | Scope, MVP, user stories |
| Architect | System design, modules, ADRs |
| Database | PostgreSQL schema, migrations |
| Frontend | React UI, forms, dashboards |
| Backend | Fastify API, workflow engine |
| Security | Auth, RBAC, threat model |
| QA | Test strategy, regression |
| DevOps | Docker, Coolify, backups |
| Refactor | Code quality, debt |
| Production Readiness | Go-live validation |

**Mandatory pre-implementation consultations (README §32):**
Product Manager → Architect → Security → QA — all four before writing any feature code.

---

## 6. Roles in the System

| Role | Notes |
|---|---|
| APPLICANT | Google OAuth only. First login shows privacy consent (AUTH-11). |
| PROJECT_FOCAL | Staff. Receives submitted proposals, endorses to RTEC. |
| RTEC_MEMBER | Staff. Reviews proposals assigned by RTEC Head. |
| RTEC_HEAD | Staff. Consolidates RTEC results, endorses to Budget. |
| BUDGET_OFFICER | Staff. Reviews budget line items. |
| ACCOUNTANT | Staff. Accounting review step. |
| REGIONAL_DIRECTOR | Staff. Final decision (APPROVED / REJECTED / RETURNED). |
| SYSTEM_ADMIN | Staff. Full system config access. |

---

## 7. Key Documents — File Paths

| Document | Path |
|---|---|
| Architecture | `docs/architecture/PRIME-v2-Architecture.md` |
| ADR-001 Deployment | `docs/architecture/ADR-001-deployment-container-strategy.md` |
| Agent Roster | `docs/agents/AGENT-ROSTER.md` |
| Intern Guide | `docs/agents/INTERN-VIBE-CODING-GUIDE.md` |
| Dev Flow | `docs/agents/DEVELOPMENT-FLOW.md` |
| QA Push Gate | `docs/agents/QA-PUSH-GATE.md` |
| UI Design Standards | `docs/frontend/UI-DESIGN-STANDARDS.md` |
| ERD | `docs/database/PRIME-v2-ERD.md` |
| Data Dictionary | `docs/database/DATA-DICTIONARY.md` |
| API Contract Draft | `docs/api/API-CONTRACT-DRAFT.md` |
| MVP Spec | `docs/requirements/PRIME-v2-MVP.md` |
| Roles & Permissions | `docs/requirements/PRIME-v2-Roles-and-Permissions.md` |
| Workflow & Statuses | `docs/workflows/PRIME-v2-Workflow.md` |
| Local Dev Guide | `docs/deployment/LOCAL-DEVELOPMENT.md` ← to be written in Phase 6 |

---

## 8. Rules That Must Always Be Followed

1. **Right-side nav only** — no horizontal top navbar for authenticated pages.
2. **No code before Architect, Security, and QA sign off** (README §32).
3. **No secrets in Git** — `.env` is gitignored. `.env.example` has placeholders only.
4. **PostgreSQL and MinIO never exposed** outside the Docker internal network.
5. **Auth paths strictly separate** — Google for applicants, email+password for staff, no mixing.
6. **CORS never wildcard** — always scoped to `FRONTEND_URL`.
7. **TypeScript strict mode** in both `apps/frontend` and `apps/backend`.
8. **Tests before push** — QA Push Gate must be clear.
9. **All nav items accessible** — aria-labels, 44px touch targets, focus trapping in drawers.
10. **Email/SMTP notifications are out of scope for MVP** (OOS-15).

---

## 9. What to Do When You Start a New Session

1. Read this file first — it replaces the lost chat history.
2. Read `docs/architecture/PRIME-v2-Architecture.md` for full technical context.
3. The current active work is **Phase 6 — Foundation Implementation**.
4. The per-agent Claude Code prompts are in the chat above (or ask to regenerate them).
5. No Phase 6 code has been written yet — the prompts were written but not executed.
6. Start by running the **Security Agent prompt** first, then Architect, then Backend + Frontend in parallel.
