# PRIME v2 — Developer Execution Plan

**Audience:** All developers (any experience level) after `git pull`.  
**Purpose:** What to build next, where to test, and when a phase is done.

> **Important:** This is a **phased plan**, not a single sprint. Implement **one phase at a time**. Complete that phase's TEST-MATRIX gate before starting the next. Do **not** build production deploy (Phases 16–20) until Phases 21A–15 pass.  
> **AI assistants:** Start with [AI-DEVELOPMENT-PLAN.md](AI-DEVELOPMENT-PLAN.md) for machine-readable phase routing.

Related docs:

- [AI-DEVELOPMENT-PLAN.md](AI-DEVELOPMENT-PLAN.md) — **AI canonical plan** (read first in Cursor)
- [TEST-MATRIX.md](TEST-MATRIX.md) — Pass/Fail checklist for every role and feature
- [DEV-TEST-ACCOUNTS.md](../deployment/DEV-TEST-ACCOUNTS.md) — login credentials
- [PHASES-REFERENCE.md](PHASES-REFERENCE.md) — official phase status
- [PHASE-21-MVP-COMPLETION.md](PHASE-21-MVP-COMPLETION.md) — Phase 21 detail
- [QA-PUSH-GATE.md](QA-PUSH-GATE.md) — pre-push checklist
- [../../DEVELOPERS.md](../../DEVELOPERS.md) — quick start at repo root

---

## Current status (update as you progress)

| Area | Status |
|------|--------|
| Planning (Phases 0–4) | Approved |
| Core stack | Docker + React + Fastify + PostgreSQL + MinIO |
| Auth + 8 dev accounts | Done — see [DEV-TEST-ACCOUNTS.md](../deployment/DEV-TEST-ACCOUNTS.md) |
| UI shell (left nav, all routes) | Done |
| Proposals (create, save, submit, comments, versions) | Done (minimal 3 form templates) |
| Admin / queues / notifications / profile pages | Done (API wired) |
| Focal workflow | Backend done; **UI done** (Phase 10, closed 2026-07-09) |
| Proposal staff assignment | Done — seed + admin API + admin UI (Phase 21A) |
| RTEC workflow | Backend + UI done (Phase 11, closed 2026-07-09) — `RtecMemberReviewPage.tsx`, `RtecHeadConsolidationPage.tsx` |
| Budget / Accounting / RD workflow | Backend + UI done (Phase 12, closed 2026-07-09) — Budget/Accountant/RD action panels on `ProposalDetailPage.tsx` |
| Full fillable forms (21 specs) | Partial (3 short stubs in seed) |
| Document export | Done (Phase 13, closed 2026-07-09) — HTML export (pdfkit not installed), `export.ts` |
| Staging deploy | Pending |

**You are here:** **Phase 14–15** (Security hardening + full QA regression) — **Phase 13 closed 2026-07-09**, automated 4/4 + manual 7/7, see [TEST-MATRIX.md](TEST-MATRIX.md) § Phase 13; **Phase 12 closed 2026-07-09**, automated 4/4 + manual 13/13; **Phase 11 closed 2026-07-09**, automated 4/4 + manual 8/8; **Phase 10 closed 2026-07-09**, automated 3/3 + manual 7/7 (F4 caveated); **Phase 21B closed 2026-07-09**, automated gates 13/13 Pass; **Phase 21A closed 2026-07-08**, all 6 gate tests pass.

---

## Local setup (every developer, once per machine)

```powershell
cd <repo-root>
copy .env.example .env
```

**Important:** In `.env`, set:

```text
DATABASE_URL=postgresql://primev2_user:<password>@prime-postgres:5432/primev2
```

Use host `prime-postgres` (Docker network name), **not** `localhost`, when running seed inside the backend container.

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec prime-backend npx prisma db push
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec prime-backend npx prisma db seed
```

### Where to test

| Layer | Location | Use for |
|-------|----------|---------|
| UI | http://localhost:5173 | Manual role walkthroughs |
| API | http://localhost:3000/health | Backend health |
| MinIO | http://localhost:9011 | File upload verification |
| Frontend tests | `cd apps/frontend && npx vitest run` | Component/unit tests |
| Backend tests | `cd apps/backend && npm test` | API integration tests |
| Staging | Coolify URL (Phase 16+) | Pre-production smoke |

### Test logins

All use **Staff Login** at http://localhost:5173 in local dev.

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@dev.local | DevAdminPassw0rd!123 |
| Applicant | applicant@dev.local | DevTestPassw0rd!123 |
| Project Focal | focal@dev.local | DevTestPassw0rd!123 |
| RTEC Member | rtec.member@dev.local | DevTestPassw0rd!123 |
| RTEC Head | rtec.head@dev.local | DevTestPassw0rd!123 |
| Budget Officer | budget@dev.local | DevTestPassw0rd!123 |
| Accountant | accountant@dev.local | DevTestPassw0rd!123 |
| Regional Director | rd@dev.local | DevTestPassw0rd!123 |

Full guide: [DEV-TEST-ACCOUNTS.md](../deployment/DEV-TEST-ACCOUNTS.md).

---

## Phase roadmap (execute in order)

```text
Phase 21A  Test data + focal demo path     ← START HERE
Phase 21B  Fillable forms (GIA/CEST/SSCP)
Phase 10   Complete focal workflow UI
Phase 11   RTEC review + consolidation
Phase 12   Budget, Accounting, RD
Phase 13   PDF / document export
Phase 14–15 Security + full QA regression
Phase 16–18 Staging, UAT, production readiness
Phase 19–20 Production launch + hypercare
```

---

## Phase 21A — Test data and focal path

**Goal:** Demo Applicant → Focal without manual database edits.  
**Estimate:** 1–2 weeks.  
**Status:** ✅ **Closed 2026-07-08.** All 6 manual gate tests pass; both automated suites green. See [TEST-MATRIX.md](TEST-MATRIX.md) § Phase 21A for full results and evidence.

### Tasks

| # | Task | Files | Status |
|---|------|-------|--------|
| 1 | Seed proposals in multiple statuses (DRAFT, SUBMITTED_TO_FOCAL, ENDORSED_TO_RTEC, …) | `apps/backend/prisma/seed.ts` | ✅ Done — seed guarantees at least one `SUBMITTED_TO_FOCAL` GIA proposal (reuses an existing one idempotently, creates one if none exists) |
| 2 | Seed `ProposalAssignment` for focal, RTEC, budget, RD dev users | `apps/backend/prisma/seed.ts` | ✅ Done for `focal@dev.local` (PROJECT_FOCAL) — idempotent, verified by re-running seed twice with no duplicate rows. RTEC/budget/RD assignment seeding not done (not required by the Phase 21A gate; RTEC uses `RtecMembership`, not `ProposalAssignment`) |
| 3 | Focal workflow buttons on proposal detail (acknowledge, return, endorse) | `apps/frontend/src/pages/proposals/ProposalDetailPage.tsx`, `apps/frontend/src/lib/api.ts` | ⏳ Still not present — tests #3/#4 exercised via API directly per task instructions. Backend routes work correctly; only the UI buttons are missing. Candidate for Phase 10 (already scheduled to "complete focal workflow UI") |
| 4 | Admin UI to assign staff to proposals | New admin page or extend admin module | ✅ Done — `apps/backend/src/routes/assignments.ts` (POST/GET/DELETE, admin-only, 8 tests) + "Staff Assignments" panel on `ProposalDetailPage.tsx` (admin-only: dropdown of all users, role selector, assign/unassign) |
| 5 | Unread notification count on sidebar | `apps/frontend/src/components/shell/SideNav.tsx` | Not built this round (not required by the 6 gate tests) |

Also fixed as part of this closeout: a React 18 StrictMode double-mount bug in `ProposalFormPage.tsx` that created orphaned draft proposals on every page mount (ref guard added — see Gotchas in [run-prime-v2 SKILL.md](../../.claude/skills/run-prime-v2/SKILL.md) if this resurfaces).

### Phase 21A test gate — result 2026-07-08 (retest, post-fix)

Full detail, evidence, and screenshots-backed verification in [TEST-MATRIX.md](TEST-MATRIX.md) § Phase 21A.

| # | Login | URL | Action | Expected | Result |
|---|-------|-----|--------|----------|--------|
| 1 | applicant@dev.local | /proposals/new | Fill + submit GIA | Status SUBMITTED_TO_FOCAL | ✅ Pass |
| 2 | focal@dev.local | /queue | Open proposal | Visible in queue | ✅ Pass — admin assigned focal via the new Staff Assignments panel (real UI), queue showed 2 items |
| 3 | focal@dev.local | /proposals/:id | Acknowledge | UNDER_FOCAL_REVIEW | ✅ Pass |
| 4 | focal@dev.local | /proposals/:id | Return to applicant | Applicant notification | ✅ Pass — real notification generated and confirmed |
| 5 | applicant@dev.local | /notifications | Mark read | Notification cleared | ✅ Pass — real UI flow, not the prior run's diagnostic workaround |
| 6 | admin@dev.local | /admin/users | List users | Table loads | ✅ Pass — 15 users rendered |

**6/6 Pass.** Gate closed.

### Automated gate — result 2026-07-08 (retest)

```powershell
cd apps/frontend && npx vitest run   # 4 files, 7 tests — all passed
cd apps/backend && npm test          # 16 files, 120 tests — all passed (includes 8 new assignments.test.ts cases)
```

127/127 passed.

---

## Phase 21B — Fillable forms MVP

**Goal:** GIA, CEST, SSCP use real multi-section forms (not 4-field stubs).  
**Estimate:** 2–4 weeks.

### Tasks

| # | Task | Files |
|---|------|-------|
| 1 | Expand form templates from `docs/forms/converted-form-specs/` | `apps/backend/prisma/seed.ts` |
| 2 | TABLE field support + required validation before submit | `apps/frontend/src/pages/proposals/ProposalFormPage.tsx` |
| 3 | Update form inventory status | `docs/forms/FORM-INVENTORY.md` |

### Test gate

| Login | URL | Pass when |
|-------|-----|-----------|
| applicant@dev.local | /proposals/new (each type) | Save, upload, submit all work |
| focal@dev.local | /proposals/:id | Submitted field values visible |

---

## Phase 10 — Complete focal workflow UI

**Goal:** Close README §24 Phase 10 gate.

- Wire all 5 focal endpoints in `apps/backend/src/routes/workflow.ts` to UI
- Show workflow history on proposal detail
- E2E: submit → acknowledge → endorse

**Test:** focal@dev.local on `/queue` and `/proposals/:id`

**Status:** ✅ **Closed 2026-07-09.** `workflowApi` added to `apps/frontend/src/lib/api.ts`; Focal Actions panel (status-conditional Acknowledge/Return to Applicant/Endorse to RTEC/Endorse to Budget/Return to RTEC buttons + 4 confirmation modals) and a Workflow History timeline added to `apps/frontend/src/pages/proposals/ProposalDetailPage.tsx`. 4 new Vitest tests (TC-FOCAL-01..04). Full results in [TEST-MATRIX.md](TEST-MATRIX.md) § Phase 10.

Known gap (not fixed, flagged during implementation): `GET /api/admin/rtec-groups` is `ADMIN`-only in the backend, but the Endorse-to-RTEC modal needs it to populate the group dropdown for `PROJECT_FOCAL` users — the dropdown is empty for a real focal user. The underlying `endorse-to-rtec` workflow transition itself works correctly. Fixing this requires a backend route change (e.g. `requireRole("ADMIN", "PROJECT_FOCAL")` or a new focal-scoped endpoint), which was out of scope for this phase per the "do not change backend routes" constraint — candidate for Phase 11 cleanup.

---

## Phase 11 — RTEC

**Goal:** Member reviews + head consolidation (workflow statuses 7–10).

- Backend: RTEC models and routes
- Frontend: `/rtec/queue`, `/rtec/reviews`, `/rtec/consolidation` with real review forms
- Seed assignments + UNDER_RTEC_REVIEW proposals

**Test accounts:** rtec.member@dev.local, rtec.head@dev.local, focal@dev.local

**Status:** ✅ **Closed 2026-07-09.** `rtecApi` added to `apps/frontend/src/lib/api.ts`; `RtecMemberReviewPage.tsx` and `RtecHeadConsolidationPage.tsx` built with autosave, submit, and (for the head) a member-reviews panel with reopen. `GET /api/admin/rtec-groups` opened to `RTEC_MEMBER`/`RTEC_HEAD` in addition to the Phase 10 `PROJECT_FOCAL` fix — all three roles hit the same "no way to learn my own rtecGroupId before a first draft" gap, so the same relaxation was applied to all of them (one route, `apps/backend/src/routes/adminRtecGroups.ts`). Seed extended with an idempotent `UNDER_RTEC_REVIEW` demo proposal with the full committee assigned. Full results in [TEST-MATRIX.md](TEST-MATRIX.md) § Phase 11.

---

## Phase 12 — Budget, Accounting, Regional Director

**Goal:** Financial chain through final decision (statuses 12–22).

- Workflow routes + review UI per role
- Notifications on endorse

**Test:** budget@dev.local, accountant@dev.local, rd@dev.local on their queue URLs

**Status:** ✅ **Closed 2026-07-09.** `phase12Api` added to `apps/frontend/src/lib/api.ts`; Budget Officer, Accountant, and Regional Director action panels (11 modals total) wired into `apps/frontend/src/pages/proposals/ProposalDetailPage.tsx`, following the Phase 10 Focal Actions pattern exactly. A Focal re-route button was added to the existing Focal Actions panel for the `RETURNED_BY_ACCOUNTING` status. 3 demo proposals seeded (one per role, idempotent). No backend routes changed. Full results in [TEST-MATRIX.md](TEST-MATRIX.md) § Phase 12.

---

## Phase 13 — Document generation

**Goal:** Export approved proposals to official PDF/Word.

- Generation service + download on approved proposals
- Store in MinIO

**Status:** ✅ **Closed 2026-07-09.** `pdfkit` is not installed in this repo, so export generates a self-contained HTML file per the task's documented fallback (identical flow otherwise: generate → store in MinIO → presigned download URL). New `ProposalExport` Prisma model, `POST /api/proposals/:id/export` + `GET /api/proposals/:id/export/latest` routes (owner/assigned/admin, APPROVED-only), `exportApi` + a "Document Export" section on `ProposalDetailPage.tsx`.

Two real bugs found and fixed during manual verification (both pre-existing, not introduced by this phase — see [TEST-MATRIX.md](TEST-MATRIX.md) § Phase 13 for full detail): the MinIO bucket didn't exist in this dev environment (created via `mc mb`), and presigned URLs were signed with the internal Docker hostname, unreachable from a real browser — fixed in the shared `services/minio.ts` (affects attachments downloads too) via a new `MINIO_PUBLIC_ENDPOINT` env var plus an explicit signing region.

---

## Phases 14–15 — Security and QA

- RBAC review on all new routes
- Full regression (backend + frontend tests)
- Complete [TEST-MATRIX.md](TEST-MATRIX.md) full pass

---

## Phases 16–18 — Staging, UAT, readiness

| Phase | Work | Test where |
|-------|------|------------|
| 16 | Deploy to Coolify — [deployment/README.md](../deployment/README.md) | Staging HTTPS |
| 17 | Process owner UAT using TEST-MATRIX | Staging |
| 18 | Backups, monitoring, rollback dry-run | Ops checklist |

**Never** run dev seed (`@dev.local` passwords) on staging or production.

---

## Phases 19–20 — Launch and hypercare

- Phase 19: Production deploy + smoke test all critical paths
- Phase 20: 30-day monitoring, P1/P2 fixes, enhancement backlog

---

## Definition of done (MVP finished)

1. [TEST-MATRIX.md](TEST-MATRIX.md) — all applicable rows **Pass** on staging
2. Phase 21 closed — 8 logins, focal E2E, 3 fillable proposal types
3. Phases 10–13 closed per [README.md](../../README.md) §24
4. Phases 16–18 sign-off complete
5. Phase 19 production smoke passed

---

## Before you push

1. Your task matches the active phase above
2. [QA-PUSH-GATE.md](QA-PUSH-GATE.md) checklist complete
3. Relevant [TEST-MATRIX.md](TEST-MATRIX.md) rows updated
4. [PHASES-REFERENCE.md](PHASES-REFERENCE.md) updated if phase status changed
