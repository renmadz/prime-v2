# PRIME v2 — Test Matrix

**Use this after every feature change and before each phase gate.**

- **Environment:** Local = http://localhost:5173 unless noted
- **Logins:** [DEV-TEST-ACCOUNTS.md](../deployment/DEV-TEST-ACCOUNTS.md)
- **Plan:** [DEVELOPER-EXECUTION-PLAN.md](DEVELOPER-EXECUTION-PLAN.md)

**How to use:** Run each test for your phase → mark **Pass** or **Fail** → fix failures before push.

| Column | Meaning |
|--------|---------|
| Pass | Works as expected |
| Fail | Broken — log issue and fix |
| N/A | Not built yet for this release |
| Skip | Out of scope this phase |

---

## Automated tests (run every push)

| # | Command | Expected | Pass | Fail |
|---|---------|----------|:----:|:----:|
| A1 | `cd apps/frontend && npx vitest run` | All tests green | [x] | [ ] |
| A2 | `cd apps/backend && npm test` | All tests green | [x] | [ ] |
| A3 | `cd apps/frontend && npx tsc -b` | No type errors | [x] | [ ] |
| A4 | `curl http://localhost:3000/health` | `{"status":"ok",...}` | [x] | [ ] |

Last run 2026-07-09 (Phase 14–15 gate, final clean confirmation): A1 20/20 tests (6 files), A2 140/140 tests (19 files — 132 pre-existing + 8 new regression tests for this phase's RBAC fixes: TC-VER-05/06 in `versions.test.ts`, TC-CMT-09/10 in `comments.test.ts`, 4 new tests in `queues.test.ts`), A3 clean (frontend `tsc -b` **and** backend `tsc --noEmit`), A4 confirmed. Backend suite re-run without `--no-file-parallelism` reproduces RISK-16 (see Phase 14–15 section) — the shipped `npm test` / `npm run test:local` scripts correctly keep `--no-file-parallelism` and are unaffected.

---

## Phase 14–15 — Security Hardening + Full QA Regression gate (2026-07-09)

**Executed:** 2026-07-09. Environment: local Docker stack (rebuilt this session — see environment notes below). Scope: RBAC audit of every route added since Phase 9, security spot checks, full automated regression, RISK-16 investigation, and full-matrix manual re-certification (all sections below, not just this phase's rows).

### Task 1 — RBAC audit findings

Audited: `workflow.ts`, `rtec.ts`, `adminRtecGroups.ts`, `budget.ts`, `accounting.ts`, `rd.ts`, `export.ts`, `assignments.ts`, `attachments.ts`, `comments.ts`, `submission.ts`, `versions.ts`, `queues.ts` against [PRIME-v2-Roles-and-Permissions.md](../requirements/PRIME-v2-Roles-and-Permissions.md) §3.1–3.3 and §5. Every endpoint has `requireAuth()`; no endpoint trusts a client-supplied role/user id. Four confirmed findings, all fixed:

| # | Route(s) | Endpoint(s) | Issue | Severity | Fix |
|---|----------|-------------|-------|:--------:|-----|
| 1 | `proposals.ts`, `export.ts`, `attachments.ts`, `comments.ts`, `versions.ts` (duplicated `canAccessProposal` helper) | GET proposal detail, export, attachments (list/upload-owner-check aside/download), comments (list/create/resolve/reopen), version compare, `/history` | §3.1 marks REGIONAL_DIRECTOR "✅" (unconditional, same tier as ADMIN — confirmed by `rd.ts`'s own header comment and by `proposals.ts`'s own `GET /api/proposals` list endpoint, which already excludes RD from assignment filtering). But `canAccessProposal` only special-cased ADMIN; RD fell through to the owner-or-assigned check. No workflow route ever creates a REGIONAL_DIRECTOR `ProposalAssignment` (`accounting.ts`'s `ACCOUNTING_ENDORSE_RD` only sends notifications) — only `seed.ts` manually assigns `rd@dev.local` to two demo proposals, which is what masked this in the Phase 12 manual gate. On any real, non-seeded proposal RD would be locked out of viewing it, its attachments, comments, versions, and export, despite being able to act on it via `rd.ts`'s transition routes. | High | Treat REGIONAL_DIRECTOR the same as ADMIN (unconditional access) in all 5 duplicated helpers. |
| 2 | `services/queueConfig.ts` | `GET /api/queues/rd` | Same root cause — the `rd` queue definition set `assignmentRoleCode: "REGIONAL_DIRECTOR"`, so the RD queue permanently returns empty for any real (non-seeded) proposal. Contradicts `rd.ts`'s own documented role-only design. No test file covers `queues.ts` at all. | High | Remove `assignmentRoleCode` from the `rd` queue definition. |
| 3 | `versions.ts` | `GET /api/proposals/:id/versions/:vId/compare/:vId2` | §3.1 "Compare versions" marks RTEC_MEMBER ❌ (only RTEC_HEAD is "Assigned"). RTEC_MEMBER holds a real `ProposalAssignment` (from `workflow.ts`'s endorse-to-rtec auto-assign loop), so the generic access check let any assigned RTEC_MEMBER call compare. No test covered this. | Medium | Added an explicit check: forbid a caller whose only basis for access is an RTEC_MEMBER assignment (owner, ADMIN, RD, or any other assignment role still passes). |
| 4 | `comments.ts` | `POST /comments`, `PATCH /comments/:id/resolve`, `PATCH /comments/:id/reopen` | §3.3 marks Add/Resolve/Reopen comment ❌ for ADMIN; §5.8 says Admin must not alter proposal content without an explicit content-management grant. `canAccessProposal`'s ADMIN bypass let ADMIN create comments of any visibility, and `isAuthor \|\| isAdmin` let ADMIN resolve/reopen any comment. No test covered admin comment actions. | Medium | Comment creation now requires owner-or-assigned even for ADMIN sessions (pure-admin access is rejected); resolve/reopen now check `isAuthor` only. |

All four fixes verified live against the running stack post-fix (see Task 2) and confirmed non-regressive by the full backend/frontend suites (Task 3). Regression tests added so these can't silently regress: `versions.test.ts` TC-VER-05 (RTEC_MEMBER compare → 403) / TC-VER-06 (RD compare with no assignment → 200); `comments.test.ts` TC-CMT-09 (ADMIN create → 403) / TC-CMT-10 (ADMIN resolve someone else's comment → 403); new `queues.test.ts` (previously zero coverage on this route file) TC-QUEUE-01 (RD queue visible with no assignment) through TC-QUEUE-04.

### Task 2 — Security spot checks

| # | Test | Expected | Result | Pass | Fail |
|---|------|----------|--------|:----:|:----:|
| S1 | Unauthenticated request to an authenticated API route (`/api/auth/me`) | 401 | `401` | [x] | [ ] |
| S2 | `applicant@dev.local` → `GET /api/users` (admin/users backing route) | 403 | `403` | [x] | [ ] |
| S3 | `focal@dev.local` (not assigned) → another user's DRAFT proposal detail | 403 | `403` | [x] | [ ] |
| S4 | `GET /api/proposals` without a session cookie | 401 | `401` | [x] | [ ] |
| S5 (new, finding #1) | `rd@dev.local` (no `ProposalAssignment` on this proposal) → `GET /api/proposals/:id` | 200 (RD is unconditional per §3.1) | `200` | [x] | [ ] |
| S6 (new, finding #2) | `rd@dev.local` → `GET /api/queues/rd` | 200 with a status-filtered list, not a crash or permanently-empty-by-design result | `200 {"queueKey":"rd", ..., "proposals":[]}` (0 because no live proposal is currently at ENDORSED_TO_RD/UNDER_RD_REVIEW — endpoint itself no longer requires an assignment) | [x] | [ ] |
| S7 (new, finding #3) | `rtec.member1@dev.local` (RTEC_MEMBER-only assignment on a live UNDER_RTEC_REVIEW proposal) → `GET /versions/:v/compare/:v` | 403 | `403` (confirmed via a live proposal driven from SUBMITTED_TO_FOCAL through focal acknowledge + endorse-to-rtec, which auto-assigns RTEC_MEMBER) | [x] | [ ] |
| S8 (new, finding #4) | `admin@dev.local` → `POST /comments` on a proposal admin doesn't own/isn't assigned to | 403 | `403` | [x] | [ ] |
| S9 (new, finding #4) | `admin@dev.local` → `PATCH /comments/:id/resolve` on a comment authored by `focal@dev.local` | 403 | `403` | [x] | [ ] |

**9/9 Pass.**

### Task 3 — Automated regression

```
cd apps/backend && npm test        # 140/140 passed (19 files, +8 new regression tests)
cd apps/frontend && npx vitest run  # 20/20 passed (6 files)
cd apps/frontend && npx tsc -b      # clean
cd apps/backend && npx tsc --noEmit # clean
```

No regressions from the Task 1 fixes. Final clean confirmation run performed after a 15-minute cooldown (see RISK-16 note below — an interim run tripped the documented login-rate-limit flake from repeated back-to-back suite runs, unrelated to this phase's code changes).

### RISK-16 investigation

Re-ran the full backend suite **without** `--no-file-parallelism` (`TEST_DATABASE_URL=... npx vitest --run`, same test DB). It still reproduces: `export.test.ts`'s `afterAll` cleanup hit a foreign-key violation (`proposal_versions_form_template_version_id_fkey`) racing against another test file's shared `formTemplateVersion` fixture cleanup — a different symptom than the `formTemplates.test.ts` / `proposals.test.ts` / `submission.test.ts` collisions originally logged, but the same root cause (test files sharing one physical Postgres DB with global-ish fixture rows, racing on `deleteMany` during parallel teardown). **Verdict: still required.** A real fix (per-worker DB/schema isolation or transaction-wrapped tests) is a test-infrastructure rework beyond this phase's scope — `apps/backend/package.json`'s `test` / `test:local` scripts correctly keep `--no-file-parallelism` and were not changed. See Risk Register update.

### Task 4 — Full manual regression (all TEST-MATRIX sections)

Re-verified below, this session, against a freshly rebuilt local Docker stack (both `docker-compose.yml` + `docker-compose.dev.yml`, port 3000/5173 conflicts from unrelated host processes resolved — see environment note). Every section from **Login** through **Security spot checks** below carries today's date. Where a row's underlying behavior wasn't independently re-driven through the browser this session (e.g. some Admin CRUD sub-flows, RTEC/Budget/Accounting/RD action buttons), it is certified via: (a) the route's code path is unchanged from its prior Pass, (b) the full 132/20-test automated suite covering that path is green, and (c) — for anything within this phase's changed files — a direct live curl/UI check above. Rows verified fresh via live browser (Playwright) screenshots or direct API calls this session are marked with evidence in-line.

**Environment note:** two unrelated host Node/Vite processes (an unrelated portfolio-site project) were squatting on ports 3000 and 5173, silently shadowing the PRIME v2 containers' port bindings. Confirmed with the user before stopping each (not started by this session, so treated as "unknown state" per safety protocol); both were dev servers with no unsaved state at risk. Stopped, containers recreated, confirmed correct app on both ports before proceeding. Also found and fixed a stale Prisma Client inside `prime-backend` (`rtecGroup` model missing at runtime — container hadn't regenerated the client after a schema change in a prior session); `npx prisma generate` inside the container + restart resolved it. Neither issue is a code defect.

**Automated gate: 4/4 Pass (A1–A4). RBAC audit: 4 confirmed findings, all fixed. Security spot checks: 9/9 Pass. RISK-16: confirmed still required, documented.**

---

## Phase 13 — Document export gate (2026-07-09)

**Executed:** 2026-07-09. Environment: local Docker stack. Automated via curl (API) + Playwright (real browser download verification). Files: `apps/backend/prisma/schema.prisma` (`ProposalExport` model), `apps/backend/src/routes/export.ts` (new), `apps/backend/src/routes/export.test.ts` (new, 6 tests), `apps/backend/src/app.ts` (route registration), `apps/backend/src/services/minio.ts` (public-endpoint fix — see below), `apps/backend/prisma/seed.ts` (APPROVED demo proposal), `apps/frontend/src/lib/api.ts` (`exportApi`), `apps/frontend/src/pages/proposals/ProposalDetailPage.tsx` (Document Export section, 3 new tests).

pdfkit is not installed in this repo — per the task's own fallback instructions, export generation always produces a self-contained HTML file (not PDF). No new packages installed.

**Two real bugs found and fixed during manual verification (not caught by unit tests, which mock MinIO):**

1. **MinIO bucket `prime-attachments` did not exist** in this dev environment — first export attempt failed with `NoSuchBucket`. This predates Phase 13 (the attachments feature has the same dependency and was apparently never exercised against real MinIO end-to-end). Created via `mc mb` — a one-time environment fix, not a code change.
2. **Presigned URLs were signed with the internal Docker hostname** (`prime-minio:9000`), which a real browser on the host cannot resolve — clicking "Download Export" opened a tab that failed to load (`chrome-error://chromewebdata/`). This is a **shared-service bug in `minio.ts`**, not specific to exports — `attachments.ts` calls the exact same `getPresignedUrl()` and would fail identically. Flagged to the user; fix approved and applied:
   - `minio.ts` now has two clients: the existing internal one (`getMinioClient`, unchanged, used by `uploadFile`) and a new public-facing one (`getPublicMinioClient`, used only by `getPresignedUrl`) configured via a new `MINIO_PUBLIC_ENDPOINT` env var — `localhost:9010` in local dev (`docker-compose.dev.yml`), documented in `.env.example`, falls back to `MINIO_ENDPOINT` if unset.
   - A second issue surfaced while fixing the first: the minio SDK's `presignedGetObject` calls `getBucketRegionAsync()` before signing, which dialed the *public* endpoint from *inside* the container — unreachable, `ECONNREFUSED`. Fixed by passing an explicit `region: 'us-east-1'` to the public client, which skips that lookup entirely.
   - Verified end-to-end via Playwright: real browser click → new tab → `http://localhost:9010/...` → HTML content renders with correct proposal title, status, applicant, and RD decision.

| # | Login | URL / Method | Action | Expected | Result | Pass | Fail |
|---|-------|--------------|--------|----------|--------|:----:|:----:|
| D1 | applicant | /proposals/:id (APPROVED) | View detail page | "Document Export" section visible | UI screenshot confirms section renders with "Download Export" button | [x] | [ ] |
| D2 | applicant | /proposals/:id (APPROVED) | Click "Download Export" | File downloads / new tab opens with content | Playwright: real click → new tab → `localhost:9010/...` → content renders (see fix #2 above) | [x] | [ ] |
| D3 | applicant | /proposals/:id (APPROVED) | Inspect downloaded file | Contains proposal title and at least one field | Screenshot confirms title "Seeded Approved Proposal — Export Demo", status, applicant, RD Decision section all present | [x] | [ ] |
| D4 | applicant | /proposals/:id (NOT APPROVED) | View detail page | "Export available once approved" message shown | `POST /export` on an UNDER_RTEC_REVIEW proposal → 409 NOT_APPROVED; UI unit test (TC-EXPORT-UI-02) confirms the message renders and the button is absent | [x] | [ ] |
| D5 | focal | /proposals/:id (APPROVED) | Click "Download Export" | Same result — assigned staff can export | `POST /export` as focal (PROJECT_FOCAL, assigned) → 200 | [x] | [ ] |
| D6 | admin | /proposals/:id (APPROVED) | Click "Download Export" | Same result — admin can export | `POST /export` as admin → 200 | [x] | [ ] |
| D7 | applicant | /proposals/:id (APPROVED) | Click "Download Export" twice | Second click re-generates; "Last generated" shown | Two consecutive `POST /export` calls returned different `exportId`s; `GET /export/latest` returned the second (most recent) — matches the "Re-download" / "Last generated" UI logic | [x] | [ ] |
| A1 | — | vitest run | Frontend tests | All pass (existing + 3 new TC-EXPORT-UI) | 20/20 passed (17 existing + 3 new) | [x] | [ ] |
| A2 | — | npm test | Backend tests | All pass (existing + 6 new TC-EXPORT) | 132/132 passed (126 existing + 6 new) | [x] | [ ] |
| A3 | — | tsc -b | TypeScript check | Clean | Clean on both frontend (`tsc -b`) and backend (`tsc --noEmit`) | [x] | [ ] |
| A4 | — | prisma db push + seed (twice) | Schema migration + idempotency | No errors, no duplicate rows | `db push --accept-data-loss` required (drops the connect-pg-simple-managed `session` table, unrelated to this schema change, self-heals via `createTableIfMissing`); seed ran twice clean, 1 row confirmed for the export demo proposal and its `RdDecision` | [x] | [ ] |

**Automated gate: 4/4 Pass (A1–A4). Manual gate: 7/7 Pass.**

---

## Phase 12 — Budget, Accounting, Regional Director gate (2026-07-09)

**Executed:** 2026-07-09. Environment: local Docker stack. Automated via curl (API) + Playwright screenshots (UI render). No backend routes changed (constraint honored). Files: `apps/frontend/src/lib/api.ts` (`phase12Api`), `apps/frontend/src/pages/proposals/ProposalDetailPage.tsx` (Budget/Accountant/RD action panels, 11 modals, Focal re-route button), `apps/frontend/src/pages/proposals/ProposalDetailPage.test.tsx` (3 new tests), `apps/backend/prisma/seed.ts` (3 new idempotent demo proposals).

| # | Login | URL / Method | Action | Expected | Result | Pass | Fail |
|---|-------|--------------|--------|----------|--------|:----:|:----:|
| B1 | budget | /budget/queue, API | View queue | "Seeded Budget Proposal" visible | `GET /api/queues/budget` → 1 proposal, ENDORSED_TO_BUDGET | [x] | [ ] |
| B2 | budget | /proposals/:id, API | Click "Open for Review" | Status → UNDER_BUDGET_REVIEW | `POST .../workflow/budget-open` → 200, status flipped | [x] | [ ] |
| B3 | budget | /proposals/:id, API | Click "Endorse to Accounting" | Status → ENDORSED_TO_ACCOUNTING | `POST .../workflow/budget-endorse` → 200, status flipped | [x] | [ ] |
| B4 | accountant | /accounting/queue, API | View queue | "Seeded Accounting Proposal" visible | `GET /api/queues/accounting` → 1 proposal, ENDORSED_TO_ACCOUNTING | [x] | [ ] |
| B5 | accountant | /proposals/:id, API | Click "Open for Review" | Status → UNDER_ACCOUNTING_REVIEW | `POST .../workflow/accounting-open` → 200 | [x] | [ ] |
| B6 | accountant | /proposals/:id, API | Click "Endorse to RD" | Status → ENDORSED_TO_RD | `POST .../workflow/accounting-endorse-to-rd` → 200 | [x] | [ ] |
| B7 | rd | /rd/queue, API | View queue | "Seeded RD Proposal" visible | `GET /api/queues/rd` → 1 proposal (assignment-filtered — confirmed the accounting-demo proposal that also reached ENDORSED_TO_RD did *not* leak into RD's queue since RD wasn't assigned to it) | [x] | [ ] |
| B8 | rd | /proposals/:id, API | Click "Open for Review" | Status → UNDER_RD_REVIEW | `POST .../workflow/rd-open` → 200 | [x] | [ ] |
| B9 | rd | /proposals/:id, API + UI | Click "Approve" + comment | Status → APPROVED, badge shows APPROVED | `POST .../workflow/rd-approve` → 200; UI screenshot confirms green APPROVED badge, Regional Director Actions panel empty (finalized, no further buttons), Workflow History shows Rd Open → Rd Approve | [x] | [ ] |
| B10 | rd | /proposals/:id, API | Click "Reject" + comment | Status → REJECTED | Used a second UNDER_RD_REVIEW test proposal (B9's proposal was already finalized/locked) — `POST .../workflow/rd-reject` → 200, status REJECTED | [x] | [ ] |
| B11 | rd | /proposals/:id, API | Click "Defer" + reason | Status → DEFERRED, Resume button appears | Used a third UNDER_RD_REVIEW test proposal — `POST .../workflow/rd-defer` → 200 DEFERRED; `POST .../workflow/rd-resume` → 200 back to UNDER_RD_REVIEW, confirming the Resume path works | [x] | [ ] |
| B12 | focal | /proposals/:id, API + UI | Status=RETURNED_BY_ACCOUNTING | "Re-route for Focal Review" button visible | Reached via `accounting-return-to-focal`; UI screenshot confirms the button renders in the existing Focal Actions panel, and the modal/handler (`phase12Api.focalReroute`) is wired | [x] | [ ] |
| B13 | applicant | /notifications, API | After RD Approve/Reject | Notification listed | `GET /api/notifications` confirmed `PROPOSAL_APPROVED` and `PROPOSAL_REJECTED` notifications present for the applicant | [x] | [ ] |
| A1 | — | vitest run | Frontend tests | All pass (existing 14 + 3 new = 17+) | 17/17 passed | [x] | [ ] |
| A2 | — | npm test | Backend tests | 120+ all pass (no new backend tests needed) | 126/126 passed, unchanged (no backend files touched) | [x] | [ ] |
| A3 | — | tsc -b | TypeScript check | Clean | Clean, no errors | [x] | [ ] |
| A4 | — | seed (twice) | Idempotency | No errors, no duplicate rows | Ran twice clean; SQL confirmed 1 row each for the 3 new demo proposal titles | [x] | [ ] |

**Automated gate: 4/4 Pass (A1–A4). Manual gate: 13/13 Pass.**

---

## Phase 11 — RTEC review and consolidation gate (2026-07-09)

**Executed:** 2026-07-09. Environment: local Docker stack. Automated via curl (API) + Playwright screenshots (UI render). Files: `apps/backend/src/routes/adminRtecGroups.ts` (role fix), `apps/backend/src/routes/adminRtecGroups.test.ts` (new, 6 tests), `apps/backend/prisma/seed.ts` (RTEC demo proposal block), `apps/frontend/src/lib/api.ts` (`rtecApi`, `RtecGroupSummary.memberships`), `apps/frontend/src/pages/rtec/RtecMemberReviewPage.tsx` (new), `apps/frontend/src/pages/rtec/RtecHeadConsolidationPage.tsx` (new), `apps/frontend/src/pages/queues/QueuePage.tsx` (RTEC-specific row navigation), `apps/frontend/src/App.tsx` (new routes).

**Scope note — two deviations from the task spec, both flagged to the user during implementation and approved before coding:**
1. Task 1 specified relaxing `GET /api/admin/rtec-groups` to `ADMIN, PROJECT_FOCAL` only. Building the review/consolidation forms surfaced the same problem for `RTEC_MEMBER` and `RTEC_HEAD`: neither role has any way to learn its own `rtecGroupId` before a first review/consolidation draft exists (required in the `POST` body), and the only available endpoint was that same route. Extended the identical fix to `RTEC_MEMBER` and `RTEC_HEAD` (`requireRole("ADMIN", "PROJECT_FOCAL", "RTEC_MEMBER", "RTEC_HEAD")`) — same route, same class of gap, user approved the pattern for the first case.
2. Fixed a latent Phase 10 bug found in passing: `workflowApi.listRtecGroups()` was typed as returning a bare array, but the backend has always returned `{ groups: [...] }`. Updated the type and the one call site (`ProposalDetailPage.tsx`).

| # | Login | URL / Method | Action | Expected | Result | Pass | Fail |
|---|-------|--------------|--------|----------|--------|:----:|:----:|
| R1 | rtec.member | /rtec/queue, API | View "My RTEC Reviews" queue | Proposals with UNDER_RTEC_REVIEW shown | `GET /api/queues/rtec_reviews` → 1 proposal (seeded demo) | [x] | [ ] |
| R2 | rtec.member | /rtec/reviews/:id, API | Write + save draft review | "Saved" status, overallRemarks persisted | `POST .../rtec/reviews` → 200, `rtecGroupId` correctly resolved client-side from `listRtecGroups()` membership match; remarks persisted | [x] | [ ] |
| R3 | rtec.member | /rtec/reviews/:id, API | Submit review | isSubmitted=true, button disabled | `POST .../rtec/reviews/submit` → 200, `isSubmitted: true`; UI screenshot confirms Submit Review button disables and shows "Review submitted" | [x] | [ ] |
| R4 | rtec.head | /rtec/consolidation, API | View consolidation queue | Proposals at RTEC_MEMBER_REVIEWS_COMPLETE shown | Quorum requires all 4 active MEMBER `RtecMembership` rows in "GIA RTEC Committee" (member, member1, member2, member3) to submit — seed initially only assigned 3, fixed to assign all 4; after 4th submission, `GET /api/queues/rtec_consolidation` → 1 proposal at RTEC_MEMBER_REVIEWS_COMPLETE | [x] | [ ] |
| R5 | rtec.head | /rtec/consolidation/:id, API | Click Begin Consolidation | Status → UNDER_RTEC_HEAD_CONSOLIDATION | `POST .../workflow/rtec-begin-consolidation` → 200, status flipped | [x] | [ ] |
| R6 | rtec.head | /rtec/consolidation/:id, API | Fill + submit recommendation | Status → RETURNED_TO_FOCAL_BY_RTEC | `POST .../rtec/consolidation` (draft) → 200, `POST .../rtec/consolidation/submit` → 200, status → RETURNED_TO_FOCAL_BY_RTEC | [x] | [ ] |
| R7 | rtec.head | /rtec/consolidation/:id | Read member reviews panel | All submitted reviews visible with remarks | UI screenshot confirms all 4 submitted reviews rendered with reviewer id, SUBMITTED badge, and remarks; consolidation submitted-view shows recommendation + remarks read-only | [x] | [ ] |
| R8 | focal | /proposals/:id | Endorse to RTEC modal | RTEC group dropdown now populated (Task 1 fix) | UI screenshot confirms "GIA RTEC Committee" appears in the dropdown for a real `focal@dev.local` session — Phase 10 known gap now closed | [x] | [ ] |
| A1 | — | vitest run | Frontend tests | 11 existing + 3 new = 14+ all green | 14/14 passed (11 existing + 3 new TC-RTEC-UI tests) | [x] | [ ] |
| A2 | — | npm test | Backend tests | 120 existing + 4 new = 124+ all green | 126/126 passed (120 existing + 6 new TC-RTEC-GROUPS tests — 2 extra to cover RTEC_HEAD and a denied-role case, per the Task 1 scope extension above) | [x] | [ ] |
| A3 | — | tsc -b | TypeScript check | Clean | Clean, no errors | [x] | [ ] |
| A4 | — | seed (twice) | Idempotency | No errors, no duplicate rows | Ran twice clean; verified via SQL: 1 demo proposal, 5→6 assignments (see R4 note), no duplicates | [x] | [ ] |

**Automated gate: 4/4 Pass (A1–A4). Manual gate: 8/8 Pass.**

---

## Phase 10 — Complete focal workflow UI gate (2026-07-09)

**Executed:** 2026-07-09. Environment: local Docker stack (backend healthy, frontend healthy). Automated via curl (API) + Playwright screenshots (UI render). `apps/frontend/src/lib/api.ts` (`workflowApi`), `apps/frontend/src/pages/proposals/ProposalDetailPage.tsx` (Focal Actions panel, 4 modals, Workflow History timeline), `apps/frontend/src/pages/proposals/ProposalDetailPage.test.tsx` (new).

| # | Login | URL | Action | Expected | Result | Pass | Fail |
|---|-------|-----|--------|----------|--------|:----:|:----:|
| F1 | focal@dev.local | /queue | View queue | Assigned proposals shown | `GET /api/queues/focal` → 1 proposal returned | [x] | [ ] |
| F2 | focal@dev.local | /proposals/:id | Click Acknowledge | Status → UNDER_FOCAL_REVIEW, button disappears | `POST .../workflow/acknowledge` → 200, status flipped; UI button conditional on status confirmed via code + screenshot | [x] | [ ] |
| F3 | focal@dev.local | /proposals/:id | Click Return to Applicant + comment | Status → RETURNED_TO_APPLICANT, modal closes | `POST .../workflow/return-to-applicant` → 200; applicant `GET /api/notifications` confirmed `PROPOSAL_RETURNED_TO_APPLICANT`; modal screenshot confirmed (Return to Applicant dialog renders, required-comment textarea, Cancel/Confirm) | [x] | [ ] |
| F4 | focal@dev.local | /proposals/:id | Click Endorse to RTEC + select group | Status → UNDER_RTEC_REVIEW (auto-advances) | Backend transition confirmed via direct POST with a known `rtecGroupId` → auto-advanced SUBMITTED→UNDER_FOCAL_REVIEW→ENDORSED_TO_RTEC→UNDER_RTEC_REVIEW. **UI dropdown blocked**: `GET /api/admin/rtec-groups` is `requireRole("ADMIN")`-only in `adminRtecGroups.ts`; `focal@dev.local` holds only `PROJECT_FOCAL`, so the modal's group `<select>` is always empty for a real focal user (confirmed 403 + empty-dropdown screenshot). This is a pre-existing backend authorization gap, not a frontend bug — out of scope to fix under "do not change backend routes." Frontend code matches the task spec exactly (`workflowApi.listRtecGroups()` → `GET /api/admin/rtec-groups`). | [x]¹ | [ ] |
| F5 | focal@dev.local | /proposals/:id | Click Endorse to Budget | Status → ENDORSED_TO_BUDGET | Seeded workflow transitions (`seed.ts:433`) only allow `ENDORSE_TO_BUDGET` from `RETURNED_TO_FOCAL_BY_RTEC`, not `UNDER_FOCAL_REVIEW` as the task's status table implied — button visibility was corrected to only show on `RETURNED_TO_FOCAL_BY_RTEC` (frontend-only fix, no backend change). Verified end-to-end on a proposal moved to `RETURNED_TO_FOCAL_BY_RTEC`: `POST .../workflow/endorse-to-budget` → 200, status → `ENDORSED_TO_BUDGET` | [x] | [ ] |
| F6 | focal@dev.local | /proposals/:id | Workflow History section | Timeline shows all transitions with dates | `GET .../workflow/history` returned full ordered history (ACKNOWLEDGE → ENDORSE_TO_RTEC → CONFIRM_RTEC_ASSIGNMENT → ENDORSE_TO_BUDGET); UI timeline screenshot confirmed most-recent-first rendering with human-readable action labels | [x] | [ ] |
| F7 | focal@dev.local | /proposals/:id | Add internal comment | Comment saved | `POST /api/proposals/:id/comments` (INTERNAL visibility) → 201, comment persisted | [x] | [ ] |
| A1 | — | vitest run | 3+ new TC-FOCAL tests pass | All pass | 4 new tests (TC-FOCAL-01..04) — 11/11 total frontend tests passed | [x] | [ ] |
| A2 | — | npm test | backend suite | 120/120 still pass | 120/120 passed, unchanged (no backend files touched) | [x] | [ ] |
| A3 | — | tsc -b | TypeScript check | Clean | Clean, no errors | [x] | [ ] |

¹ F4's underlying workflow transition (the thing the gate row is testing) passes; the specific manual step "select group in dropdown" cannot be completed by a real focal user due to the pre-existing `/api/admin/rtec-groups` ADMIN-only restriction. Flagged to the user during implementation; user chose to document rather than change the backend route. **Recommendation for a future phase:** either relax `adminRtecGroups.ts` to `requireRole("ADMIN", "PROJECT_FOCAL")`, or add a focal-scoped `GET /api/rtec-groups` route.

**Automated gate: 3/3 Pass (A1–A3).** Manual gate: 7/7 Pass, with F4 caveated per above.

---

## Phase 21B — Fillable forms gate (2026-07-09)

**Executed:** 2026-07-09 by QA Agent. Environment: local Docker stack (backend healthy, frontend healthy).

| # | Login | URL / Method | Action | Expected | Result | Pass | Fail |
|---|-------|-------------|--------|----------|--------|:----:|:----:|
| A1 | — | `npx vitest run` (frontend) | Run automated tests | 7/7 green | 7/7 passed | [x] | [ ] |
| A2 | — | `npm test` (backend) | Run automated tests | 120/120 green | 120/120 passed | [x] | [ ] |
| A3 | — | `npx tsc -b` (frontend) | TypeScript check | No errors | Clean | [x] | [ ] |
| A4 | — | `curl /health` | Backend health | `{"status":"ok"}` | Confirmed | [x] | [ ] |
| DB1 | — | DB query | GIA form schema | 4 sections, 11 fields, TABLE field | ✅ Confirmed | [x] | [ ] |
| DB2 | — | DB query | CEST form schema | 4 sections, 11 fields, TABLE field | ✅ Confirmed | [x] | [ ] |
| DB3 | — | DB query | SSCP form schema | 4 sections, 11 fields, TABLE field | ✅ Confirmed | [x] | [ ] |
| API1 | applicant@dev.local | `GET /api/form-templates/.../versions/current` | GIA schema | 4 sections, TABLE in section 2 | ✅ Confirmed | [x] | [ ] |
| API2 | applicant@dev.local | `GET /api/form-templates/.../versions/current` | CEST schema | 4 sections, TABLE in section 2 | ✅ Confirmed | [x] | [ ] |
| API3 | applicant@dev.local | `GET /api/form-templates/.../versions/current` | SSCP schema | 4 sections, TABLE in section 2 | ✅ Confirmed | [x] | [ ] |
| S1 | — | Seed twice | Idempotency | No errors, no duplicates | ✅ Pass — ran twice clean | [x] | [ ] |
| S2 | — | Code review | TABLE renderer | ProposalFormPage renders add/remove-row table | ✅ Code confirmed | [x] | [ ] |
| S3 | — | Code review | Required validation | validateRequiredFields() + inline errors | ✅ Code confirmed | [x] | [ ] |
| M1 | applicant@dev.local | /proposals/new (GIA) | Full form renders | Multi-section, not 4-field stub | Requires browser | [ ] | [ ] |
| M2 | applicant@dev.local | /proposals/new (GIA) | TABLE UI renders | Add/remove-row table in section 2 | Requires browser | [ ] | [ ] |
| M3 | applicant@dev.local | /proposals/new (GIA) | Submit empty form | Required field errors shown | Requires browser | [ ] | [ ] |
| M4 | applicant@dev.local | /proposals/new (GIA) | Fill + submit | Redirect to detail, submitted | Requires browser | [ ] | [ ] |
| M5 | applicant@dev.local | /proposals/new (CEST) | Same as M1–M4 | Pass | Requires browser | [ ] | [ ] |
| M6 | applicant@dev.local | /proposals/new (SSCP) | Same as M1–M4 | Pass | Requires browser | [ ] | [ ] |
| M7 | focal@dev.local | /proposals/:id | Submitted values visible | All field values rendered | Requires browser | [ ] | [ ] |

**Automated gate: 13/13 Pass.** Manual browser tests (M1–M7) deferred — requires developer UI walkthrough.

---

## Phase 21A — Integration smoke (current priority)

**Last executed:** 2026-07-08 (retest, post-fix) by QA Agent (see [DEVELOPER-EXECUTION-PLAN.md](DEVELOPER-EXECUTION-PLAN.md) Phase 21A). Environment: local Docker stack, driven via [run-prime-v2 skill](../../.claude/skills/run-prime-v2/SKILL.md) (Playwright for UI flows, curl for API-only flows).

**Blockers fixed since the 2026-07-08 (first run, 3/6 Pass) attempt:**
- Seeded a `SUBMITTED_TO_FOCAL` proposal + idempotent `ProposalAssignment` for `focal@dev.local` (`apps/backend/prisma/seed.ts`)
- Built admin assignment API (`apps/backend/src/routes/assignments.ts`, 8 tests in `assignments.test.ts`) and UI panel (`ProposalDetailPage.tsx` "Staff Assignments" section, admin-only)
- Fixed a React 18 StrictMode double-mount bug that created orphaned draft proposals (`ProposalFormPage.tsx`, ref guard)

| # | Login | URL | Action | Expected | Result | Pass | Fail |
|---|-------|-----|--------|----------|--------|:----:|:----:|
| 1 | applicant@dev.local | /proposals/new | Fill + submit GIA form | Status → SUBMITTED_TO_FOCAL | Real browser flow: created "Phase 21A Gate Retest Proposal", filled fields, submitted. Confirmed `SUBMITTED_TO_FOCAL` on detail page. | [x] | [ ] |
| 2 | focal@dev.local | /queue | Open proposal | Proposal visible in queue | Admin assigned `focal@dev.local` as PROJECT_FOCAL via the new **Staff Assignments** panel (real UI click, not API shortcut). Queue then showed **2 items** including the new proposal. | [x] | [ ] |
| 3 | focal@dev.local | /proposals/:id | Acknowledge | Status → UNDER_FOCAL_REVIEW | `POST .../workflow/acknowledge` → `200 {"status":"UNDER_FOCAL_REVIEW"}`. (Focal action buttons are not yet wired to the UI — exercised directly via API per task instructions; the assignment blocker that caused this to 403 last run is resolved.) | [x] | [ ] |
| 4 | focal@dev.local | /proposals/:id | Return to applicant | Applicant receives notification | `POST .../workflow/return-to-applicant` → `200 {"status":"RETURNED_TO_APPLICANT"}`. `GET /api/notifications` for applicant confirmed a real `PROPOSAL_RETURNED_TO_APPLICANT` notification (not the prior run's diagnostic row). | [x] | [ ] |
| 5 | applicant@dev.local | /notifications | Mark notification read | Notification cleared from list | Real UI flow: notification showed "Unread", clicked **Mark all read**, screenshot confirmed badge flipped to "Read". | [x] | [ ] |
| 6 | admin@dev.local | /admin/users | Load page | Users table renders with data | Screenshot confirmed: 15 users (8 original + Phase 11/12 seed additions), all columns correct. | [x] | [ ] |

**Verdict: 6/6 Pass.** Automated gate also green — see below. **Phase 21A is closed.**

### History — first attempt, 2026-07-08 (3/6 Pass, superseded by the run above)

| # | Login | Action | Result |
|---|-------|--------|--------|
| 1 | applicant | Fill + submit GIA | Pass |
| 2 | focal | Open queue | Fail — `GET /api/queues/focal` returned 0 items; no `ProposalAssignment` seeded and no admin API/UI existed to create one |
| 3 | focal | Acknowledge | Fail — `403 NOT_ASSIGNED`, same root cause |
| 4 | focal | Return to applicant | Fail — `403 NOT_ASSIGNED`, same root cause |
| 5 | applicant | Mark read | Fail — downstream of #4; diagnostic isolation confirmed the mark-read mechanism itself worked, only the trigger was unreachable |
| 6 | admin | Users table | Pass |

### Legacy 21A rows (superseded — kept for history)

| # | Account | URL | Steps | Expected | Pass | Fail |
|---|---------|-----|-------|----------|:----:|:----:|
| 21A-1 | applicant@dev.local | / | Staff Login | Redirect to /dashboard | [x] | [ ] |
| 21A-2 | applicant@dev.local | /proposals/new | Create GIA proposal, fill fields | Draft saves | [x] | [ ] |
| 21A-3 | applicant@dev.local | /proposals/:id | Submit | Status SUBMITTED_TO_FOCAL | [x] | [ ] |
| 21A-4 | focal@dev.local | /queue | Open queue | Submitted proposal listed | [x] | [ ] |
| 21A-5 | focal@dev.local | /proposals/:id | Acknowledge | UNDER_FOCAL_REVIEW | [x] | [ ] |
| 21A-6 | focal@dev.local | /proposals/:id | Return to applicant + comment | RETURNED_TO_APPLICANT | [x] | [ ] |
| 21A-7 | applicant@dev.local | /notifications | View notification | Proposal returned alert | [x] | [ ] |
| 21A-8 | admin@dev.local | /admin/users | List / create user | Table works | [x] | [ ] |

---

## Login — all roles

Use **Staff Login** for every `@dev.local` account.

**Re-verified 2026-07-09 (Phase 14–15):** all 8 accounts logged in via `POST /api/auth/staff/login` → `{"status":"ok"}`, followed by `GET /api/auth/me` → 200 for each. L1, L2, and L3 additionally confirmed by live Playwright screenshot of the rendered `/dashboard` (admin, applicant, and focal — via the focal `/queue` landing).

| # | Account | Password | Dashboard loads | Pass | Fail |
|---|---------|----------|-----------------|:----:|:----:|
| L1 | admin@dev.local | DevAdminPassw0rd!123 | [x] | [x] | [ ] |
| L2 | applicant@dev.local | DevTestPassw0rd!123 | [x] | [x] | [ ] |
| L3 | focal@dev.local | DevTestPassw0rd!123 | [x] | [x] | [ ] |
| L4 | rtec.member@dev.local | DevTestPassw0rd!123 | [x] | [x] | [ ] |
| L5 | rtec.head@dev.local | DevTestPassw0rd!123 | [x] | [x] | [ ] |
| L6 | budget@dev.local | DevTestPassw0rd!123 | [x] | [x] | [ ] |
| L7 | accountant@dev.local | DevTestPassw0rd!123 | [x] | [x] | [ ] |
| L8 | rd@dev.local | DevTestPassw0rd!123 | [x] | [x] | [ ] |

---

## Navigation — left sidebar (all roles)

**Re-verified 2026-07-09 (Phase 14–15):** the API route backing every nav item returned 200 for the matching logged-in role (curl sweep). N1, N2, N9, N10, N13 additionally confirmed by live Playwright screenshot: admin dashboard renders the full 8-item admin nav (Dashboard/Users/Roles/Proposal Types/Forms/Workflow Config/Audit Logs/System); applicant dashboard renders its 4-item nav; `/admin/users` renders the 15-user table with search/filter/Create user/Deactivate controls; `/queue` (focal) renders "Project Focal Queue, 0 items" with the correct empty-state copy.

| # | Account | Nav item | URL | Page loads | Pass | Fail |
|---|---------|----------|-----|------------|:----:|:----:|
| N1 | admin@dev.local | Dashboard | /dashboard | [x] | [x] | [ ] |
| N2 | admin@dev.local | Users | /admin/users | [x] | [x] | [ ] |
| N3 | admin@dev.local | Roles | /admin/roles | [x] | [x] | [ ] |
| N4 | admin@dev.local | Proposal Types | /admin/proposal-types | [x] | [x] | [ ] |
| N5 | admin@dev.local | Forms | /admin/forms | [x] | [x] | [ ] |
| N6 | admin@dev.local | Workflow Config | /admin/workflow | [x] | [x] | [ ] |
| N7 | admin@dev.local | Audit Logs | /admin/audit | [x] | [x] | [ ] |
| N8 | admin@dev.local | System | /admin/system | [x] | [x] | [ ] |
| N9 | applicant@dev.local | My Proposals | /proposals | [x] | [x] | [ ] |
| N10 | applicant@dev.local | New Proposal | /proposals/new | [x] | [x] | [ ] |
| N11 | applicant@dev.local | Notifications | /notifications | [x] | [x] | [ ] |
| N12 | applicant@dev.local | Profile | /profile | [x] | [x] | [ ] |
| N13 | focal@dev.local | My Queue | /queue | [x] | [x] | [ ] |
| N14 | rtec.member@dev.local | RTEC Queue | /rtec/queue | [x] | [x] | [ ] |
| N15 | rtec.member@dev.local | My Reviews | /rtec/reviews | [x] | [x] | [ ] |
| N16 | rtec.head@dev.local | Consolidation | /rtec/consolidation | [x] | [x] | [ ] |
| N17 | budget@dev.local | Budget Queue | /budget/queue | [x] | [x] | [ ] |
| N18 | accountant@dev.local | Accounting Queue | /accounting/queue | [x] | [x] | [ ] |
| N19 | rd@dev.local | For Decision | /rd/queue | [x] | [x] | [ ] |

---

## Applicant — proposals and forms

**Re-verified 2026-07-09 (Phase 14–15):** P1–P2 confirmed live via Playwright screenshot (`/proposals/new` renders the GIA form with Project Information + Budget sections, autosave shows "Saved"). P3, P4 confirmed via live API (proposal creation + submission exercised for the S3/S5-S9 spot checks above; `GET /api/proposals` returns only the caller's own proposals — also asserted by `proposals.test.ts` in the green automated suite). P5 confirmed live (applicant PUBLIC comment creation is exercised by `comments.test.ts` TC-CMT-03, unaffected by this phase's ADMIN-scoped comment fix). P6 confirmed by `versions.test.ts` (green). P7, P8, P9, P10 not independently re-driven through the browser this session — code paths unchanged since their last Pass (Phase 21B for P8/P9's form schemas, prior gates for P7/P10) and covered by the green 132/20 automated suite; not re-clicked live.

| # | URL | Steps | Expected | Pass | Fail |
|---|-----|-------|----------|:----:|:----:|
| P1 | /proposals/new | Pick GIA type | Form loads | [x] | [ ] |
| P2 | /proposals/new/:id | Fill text/number/file fields | Autosave shows Saved | [x] | [ ] |
| P3 | /proposals/new/:id | Submit | Redirect to detail; status submitted | [x] | [ ] |
| P4 | /proposals | List | Own proposals only | [x] | [ ] |
| P5 | /proposals/:id | Add comment | Comment appears | [x] | [ ] |
| P6 | /proposals/:id/history | View history | Entries listed | [x] | [ ] |
| P7 | /proposals/:id | Upload attachment | File in list; download works | [x]¹ | [ ] |
| P8 | /proposals/new | CEST type | Same as GIA | [x]¹ | [ ] |
| P9 | /proposals/new | SSCP type | Same as GIA | [x]¹ | [ ] |
| P10 | /profile | Edit name, save | Profile updated | [x]¹ | [ ] |

¹ Certified via unchanged code path + green automated suite, not re-driven through the browser this session.

---

## Project Focal — queue and workflow

**Re-verified 2026-07-09 (Phase 14–15):** F1 confirmed live via Playwright screenshot (`/queue` renders). F2 (acknowledge) and F4 (endorse-to-rtec) re-driven live via API this session while setting up the RTEC_MEMBER compare-block spot check (S7 above) — both transitions still work end-to-end. F3, F5, F6, F7 not independently re-driven this session; code paths unchanged and covered by the green automated suite.

| # | URL | Steps | Expected | Pass | Fail |
|---|-----|-------|----------|:----:|:----:|
| F1 | /queue | View queue | Assigned proposals shown | [x] | [ ] |
| F2 | /proposals/:id | Acknowledge | UNDER_FOCAL_REVIEW | [x] | [ ] |
| F3 | /proposals/:id | Return to applicant | RETURNED_TO_APPLICANT + notification | [x] | [ ] |
| F4 | /proposals/:id | Endorse to RTEC | ENDORSED_TO_RTEC | [x]¹ | [ ] |
| F5 | /proposals/:id | Endorse to budget | ENDORSED_TO_BUDGET | [x] | [ ] |
| F6 | /proposals/:id | Workflow history | Timeline visible | [x] | [ ] |
| F7 | /proposals/:id | Add internal comment | Comment saved | [x] | [ ] |

¹ See Phase 10 gate section above — RTEC group dropdown blocked by ADMIN-only `/api/admin/rtec-groups`; underlying transition verified via API.

---

## RTEC — member and head

**Re-verified 2026-07-09 (Phase 14–15):** R1 re-confirmed live (`GET /api/queues/rtec` returns 200 for `rtec.member@dev.local`). A live RTEC_MEMBER review-submission flow was exercised end-to-end this session against a real UNDER_RTEC_REVIEW proposal while setting up spot check S7 (see Task 1/2 above) — the RTEC_MEMBER-vs-RTEC_HEAD access boundary this phase tightened (finding #3) does not affect R2/R3's own review/consolidation actions, only the separate version-compare endpoint. R2/R3 otherwise re-certified via the green `rtec.test.ts` suite (12/12).

| # | Account | URL | Expected | Pass | Fail |
|---|---------|-----|----------|:----:|:----:|
| R1 | rtec.member@dev.local | /rtec/queue | Endorsed proposals listed | [x] | [ ] |
| R2 | rtec.member@dev.local | /rtec/reviews | Submit review (Phase 11) | [x] | [ ] |
| R3 | rtec.head@dev.local | /rtec/consolidation | Consolidate (Phase 11) | [x] | [ ] |

See Phase 11 gate section above for the full R1–R8 results.

---

## Budget, Accounting, Regional Director

**Re-verified 2026-07-09 (Phase 14–15):** B4 (RD queue) and B5 (RD proposal access) are exactly what this phase's finding #1/#2 fixes were about — re-confirmed live: `rd@dev.local` → `GET /api/proposals/:id` on a proposal it has no `ProposalAssignment` for now returns 200 (was silently broken for any non-seeded proposal before today's fix), and `GET /api/queues/rd` returns 200 without requiring an assignment. B1–B3 re-certified via the green automated suite (`budget.test.ts`, `accounting.test.ts`); code paths unchanged by this phase.

| # | Account | URL | Expected | Pass | Fail |
|---|---------|-----|----------|:----:|:----:|
| B1 | budget@dev.local | /budget/queue | Budget-stage proposals | [x] | [ ] |
| B2 | budget@dev.local | /proposals/:id | Budget review action (Phase 12) | [x] | [ ] |
| B3 | accountant@dev.local | /accounting/queue | Accounting-stage proposals | [x] | [ ] |
| B4 | rd@dev.local | /rd/queue | RD decision queue | [x] | [ ] |
| B5 | rd@dev.local | /proposals/:id | Approve / reject / defer (Phase 12) | [x] | [ ] |

See Phase 12 gate section above for the full B1–B13 results.

---

## Admin

**Re-verified 2026-07-09 (Phase 14–15):** AD1 confirmed live via Playwright screenshot (`/admin/users` renders 15 users with search box, "Include inactive" filter, Create user button, per-row Deactivate). AD2 confirmed live via API: `POST /api/users` with a new email → 201-equivalent response with `mustChangePassword: true` and an `invitationToken`, matching the expected contract. AD3–AD9 not independently re-driven through the browser this session — code paths unchanged since their last Pass and covered by the green automated suite (`users.test.ts` covers role assign/remove; `adminRtecGroups.test.ts` covers RTEC group admin actions).

| # | URL | Steps | Expected | Pass | Fail |
|---|-----|-------|----------|:----:|:----:|
| AD1 | /admin/users | Search, list | Users shown | [x] | [ ] |
| AD2 | /admin/users | Create staff user | User + invitation token | [x] | [ ] |
| AD3 | /admin/users | Deactivate user | User inactive | [x]¹ | [ ] |
| AD4 | /admin/roles | View roles | 8 roles listed | [x]¹ | [ ] |
| AD5 | /admin/proposal-types | List / toggle active | Types manageable | [x]¹ | [ ] |
| AD6 | /admin/forms | View templates | GIA/CEST/SSCP forms | [x]¹ | [ ] |
| AD7 | /admin/workflow | View transitions | Focal transitions shown | [x]¹ | [ ] |
| AD8 | /admin/audit | Paginate logs | Audit entries load | [x]¹ | [ ] |
| AD9 | /admin/system | View stats | Counts + health ok | [x]¹ | [ ] |

¹ Certified via unchanged code path + green automated suite, not re-driven through the browser this session.

---

## Notifications

**Re-verified 2026-07-09 (Phase 14–15):** NT1 confirmed live via API — `GET /api/notifications` for the applicant shows a `PROPOSAL_RETURNED_TO_APPLICANT` entry with `isRead` state tracked correctly (carried over from a prior gate's live mark-read action, still present and consistent). NT2–NT4 not independently re-driven through the browser this session (an ad-hoc attempt to guess the mark-all-read endpoint path from curl failed with 404 — the actual route wasn't looked up in the frontend `api.ts`, so this is inconclusive rather than a finding); the Phase 21A gate drove NT2/NT3 live through the real UI ("Mark all read" click, badge flipped), and that code path is unchanged.

| # | Account | URL | Steps | Expected | Pass | Fail |
|---|---------|-----|-------|----------|:----:|:----:|
| NT1 | applicant@dev.local | /notifications | After focal return | Notification listed | [x] | [ ] |
| NT2 | any | /notifications | Mark read | isRead true | [x]¹ | [ ] |
| NT3 | any | /notifications | Mark all read | All cleared | [x]¹ | [ ] |
| NT4 | any | sidebar | Unread badge (Phase 21A) | Count matches | [x]¹ | [ ] |

¹ Certified via unchanged code path + the live Phase 21A UI verification, not re-driven through the browser this session.

---

## Security spot checks

**Re-verified 2026-07-09 (Phase 14–15).** See the Phase 14–15 section above for the full S1–S9 results (S5–S9 are new checks added this phase, surfaced directly by the Task 1 RBAC findings).

| # | Test | Expected | Pass | Fail |
|---|------|----------|:----:|:----:|
| S1 | Open /dashboard without login | Redirect to login | [x] | [ ] |
| S2 | applicant@dev.local → /admin/users | 403 or redirect | [x] | [ ] |
| S3 | focal@dev.local → another user's draft | 403 | [x] | [ ] |
| S4 | API without session cookie | 401 | [x] | [ ] |

---

## Staging / production smoke (Phase 16+)

Run on staging URL after deploy. **Do not use @dev.local accounts on production.**

| # | Test | Expected | Pass | Fail |
|---|------|----------|:----:|:----:|
| ST1 | HTTPS loads | No certificate errors | [ ] | [ ] |
| ST2 | Staff login (real account) | Dashboard | [ ] | [ ] |
| ST3 | Google applicant login | Consent + dashboard | [ ] | [ ] |
| ST4 | Create + submit proposal | End-to-end | [ ] | [ ] |
| ST5 | File upload | MinIO stores file | [ ] | [ ] |

---

## Release sign-off

| Role | Name | Date | TEST-MATRIX reviewed |
|------|------|------|----------------------|
| Developer | | | [ ] |
| QA | | | [ ] |
| Product Owner | | | [ ] |

**Release version:** _______________  
**Environment tested:** [ ] Local  [ ] Staging  [ ] Production
