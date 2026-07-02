# Implementation Plan: Phase 10 — Workflow Engine & Focal Queue

## Overview

Implement the workflow engine service, all Project Focal workflow action routes, the proposal workflow history endpoint, the Focal-filtered proposal queue, and the required schema additions. No frontend work this phase.

## Task Dependency Graph

```
Task 1 (Schema + Seed) → Task 2 (Engine Service) → Task 3 (Workflow Routes) → Task 4 (Proposals Filter + History) → Task 5 (Tests + QA Gate)
```

## Tasks

- [x] 1. Extend Prisma schema and seed workflow definitions
  - Add `WorkflowDefinition` model to `apps/backend/prisma/schema.prisma`:
    - Fields: `id` (UUID PK), `code` (String unique), `name` (String), `isActive` (Boolean default true)
    - Relation: `steps WorkflowStep[]`, `transitions WorkflowTransition[]`
    - Map: `@@map("workflow_definitions")`
  - Add `WorkflowStep` model:
    - Fields: `id`, `workflowDefinitionId` (FK), `statusCode`, `actorRole`, `description` (nullable)
    - Map: `@@map("workflow_steps")`
  - Add `WorkflowTransition` model:
    - Fields: `id`, `workflowDefinitionId` (FK), `fromStatus`, `toStatus`, `actionCode`, `actorRole`, `conditions` (nullable String for JSON)
    - Indexes: `@@index([actionCode, actorRole])`, `@@index([fromStatus])`
    - Map: `@@map("workflow_transitions")`
  - Add `ProposalWorkflowHistory` model:
    - Fields: `id`, `proposalId` (FK → proposals), `fromStatus`, `toStatus`, `actorUserId` (FK → users), `actorRole`, `workflowAction`, `proposalVersionNumber` (Int), `comment` (nullable String), `sessionReference` (nullable String), `transitionedAt` (DateTime default now, Timestamptz)
    - Indexes: `@@index([proposalId])`, `@@index([transitionedAt])`
    - Map: `@@map("proposal_workflow_history")`
  - Add `Notification` model:
    - Fields: `id`, `recipientUserId` (FK → users), `proposalId` (nullable FK → proposals), `eventType` (String VarChar 100), `message` (String), `isRead` (Boolean default false), `readAt` (nullable DateTime), `createdAt` (DateTime default now, Timestamptz)
    - Indexes: `@@index([recipientUserId, isRead])`, `@@index([createdAt])`
    - Map: `@@map("notifications")`
  - Add back-relations to `User` model: `workflowHistory ProposalWorkflowHistory[]`, `receivedNotifications Notification[]`
  - Add back-relations to `Proposal` model: `workflowHistory ProposalWorkflowHistory[]`, `notifications Notification[]`
  - Run `cd apps/backend && npx prisma generate` — must succeed
  - Run `cd apps/backend && npx tsc --noEmit` — must exit 0
  - Extend `apps/backend/prisma/seed.ts` with upsert calls (idempotent) for:
    - One `WorkflowDefinition`: `{ code: "PROPOSAL_LIFECYCLE", name: "Proposal Approval Lifecycle" }`
    - Six `WorkflowTransition` rows for all Focal-actor transitions from `docs/workflows/PRIME-v2-Workflow.md §3`:
      - `ACKNOWLEDGE` from `SUBMITTED_TO_FOCAL` → `UNDER_FOCAL_REVIEW`, actorRole `PROJECT_FOCAL`
      - `ACKNOWLEDGE` from `RESUBMITTED_TO_FOCAL` → `UNDER_FOCAL_REVIEW`, actorRole `PROJECT_FOCAL`
      - `RETURN_TO_APPLICANT` from `UNDER_FOCAL_REVIEW` → `RETURNED_TO_APPLICANT`, actorRole `PROJECT_FOCAL`
      - `ENDORSE_TO_RTEC` from `UNDER_FOCAL_REVIEW` → `ENDORSED_TO_RTEC`, actorRole `PROJECT_FOCAL`
      - `RETURN_TO_RTEC` from `RETURNED_TO_FOCAL_BY_RTEC` → `ENDORSED_TO_RTEC`, actorRole `PROJECT_FOCAL`
      - `ENDORSE_TO_BUDGET` from `RETURNED_TO_FOCAL_BY_RTEC` → `ENDORSED_TO_BUDGET`, actorRole `PROJECT_FOCAL`
    - Use `upsert` keyed on `{ actionCode_actorRole_fromStatus }` composite or a stable unique identifier to ensure seed is re-runnable
  - All seed upserts must use `update: {}` (no-op on re-run) and `create: { ... }` with full data

- [x] 2. Implement workflow engine service
  - Create `apps/backend/src/services/workflowEngine.ts`
  - Export `WorkflowError` class:
    ```typescript
    export class WorkflowError extends Error {
      statusCode: 403 | 409 | 422;
      code: string;
      constructor(statusCode: 403 | 409 | 422, code: string, message: string) {
        super(message);
        this.name = "WorkflowError";
        this.statusCode = statusCode;
        this.code = code;
      }
    }
    ```
  - Export `validateTransition(proposalId, action, actorRole, tx)`:
    - `tx.proposal.findUnique({ where: { id: proposalId }, include: { currentVersion: true } })` — throw `WorkflowError(404, ...)` if not found (caller handles 404 separately; but guard here for safety)
    - `tx.workflowTransition.findFirst({ where: { actionCode: action, actorRole, fromStatus: proposal.status } })` — throw `WorkflowError(422, "INVALID_TRANSITION", ...)` if null
    - Compare `proposal.status` === `transition.fromStatus` at read time — if mismatch (can't happen with above findFirst, but re-read to detect concurrent modification):
      - Re-fetch proposal with `select: { status: true }` — if status no longer matches the transition's `fromStatus` → throw `WorkflowError(409, "CONCURRENT_TRANSITION", ...)`
    - Return `{ proposal, transition }`
  - The function must **not** commit — it only reads and validates within the caller's transaction
  - Run `cd apps/backend && npx tsc --noEmit` — must exit 0

- [x] 3. Implement workflow action routes (Project Focal)
  - Create `apps/backend/src/routes/workflow.ts` as a Fastify plugin
  - Import: `requireAuth` from `../middleware/auth.js`, `prisma` from `../db/client.js`, `auditLog` from `../services/auditLog.js`, `validateTransition`, `WorkflowError` from `../services/workflowEngine.js`
  - Implement shared helper `assertFocalAssignment(proposalId, userId, tx)`: queries `proposal_assignments` and throws `WorkflowError(403, "NOT_ASSIGNED", ...)` if no active PROJECT_FOCAL assignment found
  - **Route 1 — POST `/api/proposals/:id/workflow/acknowledge`:**
    - `requireAuth()` preHandler
    - Role check: `currentUser.roles.includes("PROJECT_FOCAL")` → 403 if false
    - No body schema (body ignored)
    - `prisma.$transaction(async (tx) => { assertFocalAssignment(...); validateTransition(id, "ACKNOWLEDGE", "PROJECT_FOCAL", tx); update proposal status; create ProposalWorkflowHistory; create AuditLog; return updated proposal })`
    - Catch `WorkflowError` → reply with `error.statusCode` and `{ error, code, message, statusCode }`
    - Return 200 `{ id, status, transitionedAt }`
  - **Route 2 — POST `/api/proposals/:id/workflow/return-to-applicant`:**
    - Body: `z.object({ comment: z.string().min(1) })` — 422 if fails (Zod parse error → handled before transaction)
    - `prisma.$transaction(...)`:
      - assertFocalAssignment; validateTransition("RETURN_TO_APPLICANT", ...)
      - Update proposal status to `RETURNED_TO_APPLICANT`
      - Create ProposalWorkflowHistory with `comment` field populated
      - Create AuditLog
      - Create Notification for applicant: `{ recipientUserId: proposal.applicantUserId, proposalId, eventType: "PROPOSAL_RETURNED_TO_APPLICANT", message: "Your proposal has been returned with comments." }`
    - Return 200
  - **Route 3 — POST `/api/proposals/:id/workflow/endorse-to-rtec`:**
    - Body: `z.object({ rtecGroupId: z.string().uuid(), comment: z.string().optional() })`
    - `prisma.$transaction(...)`:
      - assertFocalAssignment; validateTransition("ENDORSE_TO_RTEC", ...)
      - Update proposal status to `ENDORSED_TO_RTEC`
      - Create ProposalWorkflowHistory; create AuditLog
      - Query active RTEC memberships: `tx.rtecMembership.findMany({ where: { rtecGroupId: body.rtecGroupId, isActive: true } })`
      - Create one Notification per RTEC member: `eventType: "PROPOSAL_ENDORSED_TO_RTEC"`
    - **Note:** `RtecMembership` model may not yet exist in schema. If `rtec_memberships` is not yet in `schema.prisma`, skip the RTEC notification step and add a TODO comment. Do not fail the route over a missing RTEC model.
    - Return 200
  - **Route 4 — POST `/api/proposals/:id/workflow/return-to-rtec`:**
    - Body: `z.object({ comment: z.string().min(1) })`
    - Same transaction pattern; validateTransition("RETURN_TO_RTEC", ...); toStatus `ENDORSED_TO_RTEC`
    - RTEC notifications same as endorse-to-rtec but requires `rtecGroupId` to be looked up from last active assignment on the proposal (query `proposal_assignments` for most recent RTEC group reference — or skip if RTEC models not yet in schema, with TODO)
    - Return 200
  - **Route 5 — POST `/api/proposals/:id/workflow/endorse-to-budget`:**
    - Body: `z.object({ comment: z.string().optional() })`
    - validateTransition("ENDORSE_TO_BUDGET", ...); toStatus `ENDORSED_TO_BUDGET`
    - Notify all active BUDGET_OFFICER assignments on this proposal
    - Return 200
  - **Route 6 — GET `/api/proposals/:id/workflow/history`:**
    - `requireAuth()` preHandler
    - Access check: owner (applicantUserId) OR active assigned staff OR ADMIN role
    - `prisma.proposalWorkflowHistory.findMany({ where: { proposalId: id }, orderBy: { transitionedAt: "asc" } })`
    - Return 200 `{ history: [...] }`
  - Register `workflowRoutes` in `apps/backend/src/app.ts` (import + `await app.register(workflowRoutes)`)
  - Run `cd apps/backend && npx tsc --noEmit` — must exit 0

- [x] 4. Extend proposals list with PROJECT_FOCAL assignment filter and run existing tests
  - Open `apps/backend/src/routes/proposals.ts` and locate the `GET /api/proposals` handler
  - Find the section that applies `where` clause based on role (currently filtering for APPLICANT)
  - Add a new branch:
    ```typescript
    else if (currentUser.roles.includes("PROJECT_FOCAL") && !currentUser.roles.includes("SYSTEM_ADMIN")) {
      where = {
        ...where,
        assignments: {
          some: { userId: currentUser.id, roleCode: "PROJECT_FOCAL", isActive: true }
        }
      };
    }
    ```
  - SYSTEM_ADMIN/ADMIN roles must not be restricted by the assignment filter — confirm existing logic handles this
  - Run `cd apps/backend && npm run test -- --run` — existing tests must still pass (do not break any previously passing test)
  - Run `cd apps/backend && npx tsc --noEmit` — must exit 0

- [x] 5. Write and run Phase 10 tests, then verify QA gate
  - Create `apps/backend/src/routes/workflow.test.ts` with the following test cases using the same Vitest + Fastify inject pattern as existing test files:
  - **TC-WF-01** — Focal acknowledge: POST `/api/proposals/:id/workflow/acknowledge` with valid Focal session; proposal in `SUBMITTED_TO_FOCAL` → expect 200, status `UNDER_FOCAL_REVIEW`
  - **TC-WF-01b** — Focal acknowledge from resubmitted: proposal in `RESUBMITTED_TO_FOCAL` → expect 200, status `UNDER_FOCAL_REVIEW`
  - **TC-WF-02** — return-to-applicant without comment: POST without body or `{ comment: "" }` → expect 422
  - **TC-WF-02b** — return-to-applicant with comment: proposal in `UNDER_FOCAL_REVIEW`, body `{ comment: "Please revise section 3." }` → expect 200, status `RETURNED_TO_APPLICANT`; applicant notification row created
  - **TC-WF-03** — endorse-to-rtec: proposal in `UNDER_FOCAL_REVIEW`, valid `rtecGroupId` → expect 200, status `ENDORSED_TO_RTEC`; workflow history row written
  - **TC-WF-04** — invalid transition (wrong from_status): proposal in `DRAFT`, attempt `acknowledge` → expect 422 with code `INVALID_TRANSITION`
  - **TC-WF-05** — concurrent transition simulation: use two parallel requests (or mock prisma to return stale status after first read) → second request must receive 409 with code `CONCURRENT_TRANSITION`
  - **TC-WF-06** — GET /api/proposals as PROJECT_FOCAL: only proposals with active PROJECT_FOCAL assignment for this user returned; proposals assigned to other focals not returned
  - **TC-WF-07** — workflow history row written: after any transition, GET `/api/proposals/:id/workflow/history` returns at least one row with correct `fromStatus`, `toStatus`, `workflowAction`
  - **TC-WF-08** — audit log row written: after any transition, query `audit_logs` for this proposal's entityId and confirm one row exists with the matching action code
  - Run `cd apps/backend && npm run test -- --run` — all TC-WF-01 through TC-WF-08 tests must pass; all previously passing tests must still pass
  - Run `cd apps/backend && npx tsc --noEmit` — exit 0

## QA Push Gate

| Gate Item | Requirement |
|---|---|
| Scope | Only Phase 10 files modified: `schema.prisma`, `seed.ts`, `workflowEngine.ts`, `workflow.ts`, `workflow.test.ts`, `proposals.ts` (filter only), `app.ts` (register only) |
| TypeScript | `npx tsc --noEmit` exit 0 in `apps/backend` |
| Tests — new | TC-WF-01 through TC-WF-08 all pass |
| Tests — regression | All previously passing tests still pass |
| RBAC | Every workflow route verified: wrong role returns 403; unassigned Focal returns 403 |
| Atomicity | All three writes per transition in single `prisma.$transaction` |
| Append-only | No UPDATE/DELETE on `proposal_workflow_history` or `audit_logs` |
| Invalid transitions | 422 (not 500) for wrong from_status or unknown action |
| Concurrent conflict | 409 for mid-flight status change |
| No frontend changes | Confirm no files under `apps/frontend/` were modified |
| No secrets | Confirm `.env` not modified; no hardcoded credentials |

## Notes

- The `ACKNOWLEDGE` action maps to two valid `fromStatus` values. The seed inserts two separate `WorkflowTransition` rows. The engine's `validateTransition` uses `findFirst` with the proposal's **current** status as a filter — so it naturally picks the correct row.
- If `RtecMembership` / `rtec_memberships` is not yet in `schema.prisma`, RTEC member notifications in routes 3 and 4 should be skipped with a `// TODO Phase 11: notify RTEC members` comment rather than failing at runtime.
- All imports use `.js` extension (ESM) on the backend — match existing file conventions exactly.
- `auditLog()` helper in `services/auditLog.ts` already accepts a Prisma client argument — pass `tx` (the transaction client) not `prisma` directly, so the audit write is inside the transaction.
- The existing `requireAuth` middleware already enforces `user.isActive = true` via `request.currentUser` — no need to re-check in route handlers.
- Do not implement RTEC, Budget, Accounting, or RD transitions — those are Phase 11+.
