# Implementation Plan: Phase 9 — Submission, Versioning, Comments (Frontend + QA)

## Overview

Add Phase 9 frontend UI (submission, resubmission, comments, version compare, history) and run the final QA push gate.

## Task Dependency Graph

```
Task 2 (Frontend UI) → Task 3 (QA Gate)
```

## Tasks

- [x] 1. Implement Phase 9 backend routes: submission, comments, versions, and register in app.ts
  - Create `apps/backend/src/routes/submission.ts` with POST /api/proposals/:id/submit and POST /api/proposals/:id/resubmit
  - Create `apps/backend/src/routes/comments.ts` with POST/GET /api/proposals/:id/comments, PATCH resolve, PATCH reopen
  - Create `apps/backend/src/routes/versions.ts` with GET compare and GET history endpoints
  - Create `apps/backend/src/routes/submission.test.ts` with TC-SUB-01 through TC-SUB-05
  - Create `apps/backend/src/routes/comments.test.ts` with TC-CMT-01 through TC-CMT-08
  - Create `apps/backend/src/routes/versions.test.ts` with TC-VER-01 through TC-VER-04 and TC-RESUB-01 through TC-RESUB-04
  - Register submissionRoutes, commentsRoutes, versionsRoutes in `apps/backend/src/app.ts`
  - Run `cd apps/backend && npm run test -- --run` — all new tests must pass (13 pre-existing failures in auth.test.ts/users.test.ts are known stale DB conflicts, ignore them)
  - Run `cd apps/backend && npx tsc --noEmit` — must exit 0

- [x] 2. Add Phase 9 frontend UI: submission, comments, version comparison, and history pages
  - Extend `apps/frontend/src/lib/api.ts`: added ProposalComment, VersionDiff, HistoryEntry, CommentPayload, ProposalVersionSummary, SubmitResponse, ResubmitResponse interfaces and phase9Api object with submitProposal, resubmitProposal, getComments, addComment, resolveComment, reopenComment, compareVersions, getHistory, getVersions methods
  - Extend `apps/frontend/src/pages/proposals/ProposalFormPage.tsx`: added "Submit Proposal" button (visible only when status=DRAFT), confirmation dialog "Once submitted, this version cannot be edited.", 409 error handling showing "This proposal has already been submitted."
  - Extend `apps/frontend/src/pages/proposals/ProposalDetailPage.tsx`: added Comments section (PUBLIC for all; INTERNAL filtered for APPLICANT role), "Add Comment" form (textarea + commentType selector), resolve/reopen per comment (author/ADMIN); added "Resubmit" button (RETURNED_TO_APPLICANT + APPLICANT role), confirmation dialog; added "View Change History" and "Compare Versions" buttons
  - Created `apps/frontend/src/pages/proposals/ProposalHistoryPage.tsx`: timeline of history entries with human-readable action labels
  - Created `apps/frontend/src/pages/proposals/ProposalComparePage.tsx`: two version dropdowns, diff table with changed-row highlighting
  - Updated `apps/frontend/src/App.tsx`: added /proposals/:id/history and /proposals/:id/compare routes
  - `cd apps/frontend && npm run build` (tsc -b + vite build) — exits 0, no TypeScript errors

- [x] 3. QA push gate — verify Phase 9 is ready to push
  - Backend tsc: EXIT 0 — PASS
  - Frontend tsc (via npm run build): EXIT 0 — PASS
  - Backend tests: all test suites skip with "Can't reach database server at localhost:5433" — the test DB is not running in this environment. This is the same infrastructure constraint that affects ALL test suites (not just Phase 9). health.test.ts (6/6) passes (no DB needed). The 6 health tests pass; all DB-dependent tests are skipped/fail with connection error, not code errors.
  - Code review of security gates (static):
    - TC-CMT-02 guard: comments.ts line `if (body.visibility === "INTERNAL" && isApplicantOnly)` → 403 — PASS
    - TC-CMT-06 guard: `isApplicantOnly ? { visibility: { not: "INTERNAL" } } : {}` in GET query — PASS
    - TC-SUB-04 guard: `if (!isApplicant || proposal.applicantUserId !== currentUser.id)` → 403 — PASS
    - TC-SUB-02/03 guards: `proposal.status !== "DRAFT"` → 409, `proposal.currentVersion.isSubmitted` → 409 — PASS
    - audit_logs: INSERT only via auditLog() in all 3 new route files — PASS
    - No INTERNAL comment leak to APPLICANT in frontend: `isApplicant ? comments.filter(c => c.visibility !== "INTERNAL") : comments` — PASS

## QA Push Gate Verdict

| Gate Item | Status | Notes |
|---|---|---|
| Scope — matches approved tasks | ✅ PASS | Phase 9 backend + frontend complete |
| Design — matches architecture | ✅ PASS | Same patterns as Phase 8 routes |
| Security — RBAC enforced | ✅ PASS | INTERNAL filter, owner checks, 403/409 guards all present |
| Tests — new behavior has tests | ✅ PASS | TC-SUB-01–05, TC-CMT-01–08, TC-VER-01–04, TC-RESUB-01–04 written |
| Permissions — unauthorized roles denied | ✅ PASS | Verified in code review |
| Workflow — status transitions valid, audit logged | ✅ PASS | PROPOSAL_SUBMITTED, PROPOSAL_RESUBMITTED, COMMENT_ADDED, COMMENT_RESOLVED all audited |
| Lint / typecheck — no new errors | ✅ PASS | Backend tsc exit 0; frontend tsc -b exit 0 |
| Docs — no behavior change requiring doc update | ✅ PASS | N/A |
| UI — right-side nav, responsive | ✅ PASS | AppShell wrapper used on all new pages; no top nav added |
| Diff review — no unrelated files, no secrets | ✅ PASS | Only Phase 9 files modified |

**⚠ BLOCKER TO RESOLVE BEFORE PUSH:** The PostgreSQL test database at `localhost:5433` is not running in the current environment. All DB-dependent integration tests (including the new Phase 9 tests) are skipped. **Start the test DB (`docker compose up -d` or equivalent) and re-run `npm run test -- --run` to confirm all TC-SUB-*, TC-CMT-*, TC-VER-*, and TC-RESUB-* tests pass before pushing.**

## Notes

- Task 1 is already complete (backend routes created and TypeScript clean).
- Task 2 must NOT rewrite existing pages — only extend them.
- Task 3 is the final gate; only approve push if all checks are green.
- 13 pre-existing failures in auth.test.ts/users.test.ts are known stale DB conflicts and do NOT block the gate.
- `useAuth()` currently returns `role: "APPLICANT"` — used for role-based UI visibility in comments section.
- All imports use `.js` extension (ESM) on the backend. Frontend uses standard TypeScript imports.
