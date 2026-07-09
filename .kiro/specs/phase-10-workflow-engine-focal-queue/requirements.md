# Requirements Document

## Introduction

Phase 10 introduces the **Workflow Engine and Project Focal Queue** for PRIME v2. This phase delivers the backend state machine that enforces valid proposal status transitions, the Project Focal proposal queue (dashboard), review actions available to the Project Focal role (Return to Applicant, Endorse to RTEC, Return to RTEC, Endorse to Budget), in-app notification events, and a full workflow history / audit log for every action taken.

Every transition is validated against the authoritative transition table in `docs/workflows/PRIME-v2-Workflow.md §3`. Invalid transitions are blocked at the API layer. All writes per transition (status update + workflow history row + audit log row) are atomic. The phase is backend-only; RTEC, Budget, Accounting, and RD transitions are out of scope for this phase.

The frontend Focal Queue dashboard (list view of assigned proposals) is **in scope** for this phase in addition to the backend workflow engine, per the Phase 10 scope statement. Email notifications are **out of scope** (OOS-15 — no SMTP service for MVP). RTEC, Budget, Accounting, and RD workflow transitions are **out of scope** (Phase 11+).

---

## Glossary

- **Workflow_Engine**: The backend service (`workflowEngine.ts`) that validates and enforces proposal status transitions against the approved transition table.
- **Project_Focal**: A staff user assigned the `PROJECT_FOCAL` role who is responsible for reviewing submitted proposals and taking action on them.
- **Proposal**: A research or project proposal submitted by an Applicant and routed through the PRIME v2 approval lifecycle.
- **Transition**: A change in proposal status from one defined state to another, triggered by an authorized actor performing a named workflow action.
- **Workflow_Action**: The named action code that identifies a specific status transition (e.g., `ACKNOWLEDGE`, `RETURN_TO_APPLICANT`, `ENDORSE_TO_RTEC`).
- **Proposal_Assignment**: A record linking a user to a proposal with a specific role code and an active flag, determining which proposals a staff user is authorized to act on.
- **Workflow_History**: The append-only table (`proposal_workflow_history`) that records every status transition including actor, role, timestamp, action, and optional comment.
- **Audit_Log**: The append-only table (`audit_logs`) that records every system action for security and compliance purposes.
- **Notification**: An in-app notification row written to the `notifications` table when a workflow event occurs; delivery/streaming is out of scope for this phase.
- **Transaction**: A single atomic database operation that either commits all writes (status + workflow history + audit log) or rolls all of them back together.
- **Focal_Queue**: The Project Focal's proposal dashboard view — the list of proposals assigned to the current user with role `PROJECT_FOCAL` and `is_active = true`.
- **RTEC_Group**: A named committee group whose members perform technical review of endorsed proposals.
- **Applicant**: A user with the `APPLICANT` role who submitted the proposal.
- **Version_Number**: The integer version number of the current proposal version at the time a transition occurs.
- **Session_Reference**: The session ID or request IP address recorded in the workflow history and audit log for traceability.
- **Concurrent_Edit**: A condition where two actors attempt to transition the same proposal simultaneously, producing a stale-read conflict.
- **RBAC**: Role-Based Access Control — the enforcement of permissions based on the role the user holds and the workflow stage the proposal is in.

---

## Requirements

### Requirement 1: Workflow Transition Validation

**User Story:** As a Project Focal, I want the system to enforce the approved transition rules so that proposals can only move to valid next statuses and invalid transitions are blocked before any data is written.

#### Acceptance Criteria

1. WHEN a workflow action is requested, THE Workflow_Engine SHALL look up the matching transition rule by action code, actor role, and current proposal status before executing any write.
2. IF no matching transition rule exists for the requested action code and actor role combination, THEN THE Workflow_Engine SHALL reject the request with HTTP status 422 and error code `INVALID_TRANSITION`.
3. IF the proposal's current status does not match the expected `from_status` of the matched transition rule at the time of the write (concurrent edit condition), THEN THE Workflow_Engine SHALL reject the request with HTTP status 409 and error code `CONCURRENT_TRANSITION`.
4. WHEN a transition is validated successfully, THE Workflow_Engine SHALL return the proposal record and matched transition rule to the calling route handler for use in the atomic write.
5. THE Workflow_Engine SHALL NOT commit or roll back the database transaction — the calling route handler owns the transaction boundary.
6. WHEN an invalid transition is attempted, THE Workflow_Engine SHALL return HTTP 422 or HTTP 409 and SHALL NOT return HTTP 500.
7. THE Workflow_Engine SHALL enforce that only the six Project_Focal transitions defined in `docs/workflows/PRIME-v2-Workflow.md §3` are valid for the `PROJECT_FOCAL` actor role in this phase:
   - `ACKNOWLEDGE` from `SUBMITTED_TO_FOCAL` → `UNDER_FOCAL_REVIEW`
   - `ACKNOWLEDGE` from `RESUBMITTED_TO_FOCAL` → `UNDER_FOCAL_REVIEW`
   - `RETURN_TO_APPLICANT` from `UNDER_FOCAL_REVIEW` → `RETURNED_TO_APPLICANT`
   - `ENDORSE_TO_RTEC` from `UNDER_FOCAL_REVIEW` → `ENDORSED_TO_RTEC`
   - `RETURN_TO_RTEC` from `RETURNED_TO_FOCAL_BY_RTEC` → `ENDORSED_TO_RTEC`
   - `ENDORSE_TO_BUDGET` from `RETURNED_TO_FOCAL_BY_RTEC` → `ENDORSED_TO_BUDGET`

---

### Requirement 2: Atomic Transition Writes

**User Story:** As a system administrator, I want every proposal status change to be recorded atomically so that the system never enters a state where the status is updated but the history or audit log is missing.

#### Acceptance Criteria

1. WHEN a workflow transition is executed, THE Workflow_Engine SHALL write the proposal status update, the `proposal_workflow_history` row, and the `audit_logs` row inside a single database Transaction that commits all three or rolls all three back.
2. IF any one of the three writes fails, THEN THE Workflow_Engine SHALL roll back all three writes and return an error to the caller — no partial state shall remain in the database.
3. WHEN a Notification row is required for a transition, THE Workflow_Engine SHALL write the Notification inside the same Transaction so that no orphaned notification row is created if the transition fails.
4. THE Workflow_Engine SHALL treat `proposal_workflow_history` as append-only — no route or service may issue an UPDATE or DELETE against this table.
5. THE Workflow_Engine SHALL treat `audit_logs` as append-only — no route or service may issue an UPDATE or DELETE against this table.

---

### Requirement 3: Role-Based Access Control on Workflow Routes

**User Story:** As a security officer, I want every workflow route to enforce role and assignment checks so that only the authorized Project Focal for a specific proposal can perform actions on it.

#### Acceptance Criteria

1. WHEN a workflow action route is called, THE Workflow_Engine SHALL verify that the requesting user holds the `PROJECT_FOCAL` role before executing any other logic — returning HTTP 403 if the role is absent.
2. WHEN the role check passes, THE Workflow_Engine SHALL verify that the requesting user has an active `Proposal_Assignment` row with `role_code = 'PROJECT_FOCAL'` and `is_active = true` for the specific proposal — returning HTTP 403 with code `NOT_ASSIGNED` if no such assignment exists.
3. IF the requesting user's account has `is_active = false`, THEN THE Workflow_Engine SHALL reject the request with HTTP 401 before any role or assignment check.
4. THE Workflow_Engine SHALL perform all role and assignment checks server-side — client-side visibility controls are supplementary only and SHALL NOT substitute for server-side enforcement.
5. WHEN a user holds multiple roles, THE Workflow_Engine SHALL validate the user against the `PROJECT_FOCAL` role specifically for Focal workflow actions — holding another staff role SHALL NOT grant access to Focal-restricted routes.

---

### Requirement 4: Acknowledge Transition (Focal Opens Proposal)

**User Story:** As a Project Focal, I want to acknowledge a submitted proposal so that the system records that I have opened it and the status advances to Under Focal Review.

#### Acceptance Criteria

1. WHEN a Project_Focal sends `POST /api/proposals/:id/workflow/acknowledge` and the proposal status is `SUBMITTED_TO_FOCAL`, THE Workflow_Engine SHALL transition the proposal to `UNDER_FOCAL_REVIEW`.
2. WHEN a Project_Focal sends `POST /api/proposals/:id/workflow/acknowledge` and the proposal status is `RESUBMITTED_TO_FOCAL`, THE Workflow_Engine SHALL transition the proposal to `UNDER_FOCAL_REVIEW`.
3. WHEN the acknowledge transition succeeds, THE Workflow_Engine SHALL return HTTP 200 with `{ id, status, transitionedAt }`.
4. WHEN the acknowledge transition succeeds, THE Workflow_Engine SHALL write one `proposal_workflow_history` row with `workflow_action = 'ACKNOWLEDGE'` and the correct `from_status`, `to_status`, `actor_user_id`, `actor_role`, `proposal_version_number`, and `transitioned_at`.
5. IF the proposal status is neither `SUBMITTED_TO_FOCAL` nor `RESUBMITTED_TO_FOCAL` when acknowledge is requested, THEN THE Workflow_Engine SHALL return HTTP 422 with code `INVALID_TRANSITION`.

---

### Requirement 5: Return to Applicant Transition

**User Story:** As a Project Focal, I want to return a proposal to the Applicant with a mandatory comment so that the Applicant knows exactly what needs to be revised.

#### Acceptance Criteria

1. WHEN a Project_Focal sends `POST /api/proposals/:id/workflow/return-to-applicant` with a non-empty comment body and the proposal status is `UNDER_FOCAL_REVIEW`, THE Workflow_Engine SHALL transition the proposal to `RETURNED_TO_APPLICANT`.
2. IF the request body does not include a `comment` field or the `comment` field is an empty string, THEN THE Workflow_Engine SHALL reject the request with HTTP 422 and code `COMMENT_REQUIRED` before executing the Transaction.
3. WHEN the return-to-applicant transition succeeds, THE Workflow_Engine SHALL write the comment text into the `proposal_workflow_history` row's `comment` field.
4. WHEN the return-to-applicant transition succeeds, THE Workflow_Engine SHALL create one Notification row with `event_type = 'PROPOSAL_RETURNED_TO_APPLICANT'` and `recipient_user_id` equal to the proposal's `applicant_user_id`, inside the same Transaction.
5. WHEN the return-to-applicant transition succeeds, THE Workflow_Engine SHALL return HTTP 200 with `{ id, status, transitionedAt }`.

---

### Requirement 6: Endorse to RTEC Transition

**User Story:** As a Project Focal, I want to endorse a proposal to an RTEC group so that the assigned RTEC members are notified and can begin independent technical review.

#### Acceptance Criteria

1. WHEN a Project_Focal sends `POST /api/proposals/:id/workflow/endorse-to-rtec` with a valid `rtecGroupId` UUID and the proposal status is `UNDER_FOCAL_REVIEW`, THE Workflow_Engine SHALL transition the proposal to `ENDORSED_TO_RTEC`.
2. IF the request body does not include a `rtecGroupId` field or the value is not a valid UUID, THEN THE Workflow_Engine SHALL reject the request with HTTP 422 before executing the Transaction.
3. WHEN the endorse-to-rtec transition succeeds and RTEC membership records exist in the database, THE Workflow_Engine SHALL create one Notification row per active RTEC group member with `event_type = 'PROPOSAL_ENDORSED_TO_RTEC'`, inside the same Transaction.
4. WHEN the endorse-to-rtec transition succeeds, THE Workflow_Engine SHALL return HTTP 200 with `{ id, status, transitionedAt }`.

---

### Requirement 7: Return to RTEC Transition (Post-RTEC)

**User Story:** As a Project Focal, I want to return a proposal to RTEC for re-review after receiving the RTEC recommendation so that unresolved technical issues can be addressed before the proposal advances.

#### Acceptance Criteria

1. WHEN a Project_Focal sends `POST /api/proposals/:id/workflow/return-to-rtec` with a non-empty comment body and the proposal status is `RETURNED_TO_FOCAL_BY_RTEC`, THE Workflow_Engine SHALL transition the proposal to `ENDORSED_TO_RTEC`.
2. IF the request body does not include a `comment` field or the `comment` field is an empty string for the return-to-rtec action, THEN THE Workflow_Engine SHALL reject the request with HTTP 422 and code `COMMENT_REQUIRED`.
3. WHEN the return-to-rtec transition succeeds, THE Workflow_Engine SHALL create Notification rows for active RTEC group members consistent with Requirement 6, inside the same Transaction.
4. WHEN the return-to-rtec transition succeeds, THE Workflow_Engine SHALL return HTTP 200 with `{ id, status, transitionedAt }`.

---

### Requirement 8: Endorse to Budget Transition

**User Story:** As a Project Focal, I want to endorse a proposal to the Budget Officer after receiving the RTEC recommendation so that the financial review stage can begin.

#### Acceptance Criteria

1. WHEN a Project_Focal sends `POST /api/proposals/:id/workflow/endorse-to-budget` and the proposal status is `RETURNED_TO_FOCAL_BY_RTEC`, THE Workflow_Engine SHALL transition the proposal to `ENDORSED_TO_BUDGET`.
2. WHEN the endorse-to-budget transition succeeds and active Budget Officer assignments exist for the proposal, THE Workflow_Engine SHALL create one Notification row per active `BUDGET_OFFICER` assignment with `event_type = 'PROPOSAL_ENDORSED_TO_BUDGET'`, inside the same Transaction.
3. WHEN the endorse-to-budget transition succeeds, THE Workflow_Engine SHALL return HTTP 200 with `{ id, status, transitionedAt }`.

---

### Requirement 9: Workflow History Retrieval

**User Story:** As an authorized staff user, I want to view the complete workflow history of a proposal so that I can see every action taken, by whom, and when.

#### Acceptance Criteria

1. WHEN an authorized user sends `GET /api/proposals/:id/workflow/history`, THE Workflow_Engine SHALL return all `proposal_workflow_history` rows for the specified proposal, ordered by `transitioned_at` ascending.
2. THE Workflow_Engine SHALL grant access to the workflow history for: the proposal's owner (Applicant), any user with an active `Proposal_Assignment` for the proposal, and any user with the `ADMIN` role.
3. IF the requesting user is not the owner, not assigned, and does not hold the `ADMIN` role, THEN THE Workflow_Engine SHALL return HTTP 403.
4. WHEN workflow history is returned, each row SHALL include: `id`, `fromStatus`, `toStatus`, `actorUserId`, `actorRole`, `workflowAction`, `proposalVersionNumber`, `comment` (nullable), and `transitionedAt`.
5. THE Workflow_Engine SHALL return HTTP 200 with `{ history: [...] }` on success.

---

### Requirement 10: Focal Queue — Proposal List Filter

**User Story:** As a Project Focal, I want to see only the proposals assigned to me in my dashboard so that I am not confused by proposals that belong to other focals or programs.

#### Acceptance Criteria

1. WHEN a user with the `PROJECT_FOCAL` role sends `GET /api/proposals`, THE Workflow_Engine SHALL return only proposals where an active `Proposal_Assignment` exists with `user_id` equal to the requesting user's ID, `role_code = 'PROJECT_FOCAL'`, and `is_active = true`.
2. WHEN a user with the `APPLICANT` role sends `GET /api/proposals`, THE Workflow_Engine SHALL return only proposals where `applicant_user_id` equals the requesting user's ID — the Applicant filter behavior is unchanged.
3. WHEN a user with the `ADMIN` role sends `GET /api/proposals`, THE Workflow_Engine SHALL apply no assignment filter and return all proposals.
4. IF a user holds both `PROJECT_FOCAL` and `ADMIN` roles, THEN THE Workflow_Engine SHALL apply the ADMIN (no filter) logic, granting the broader access.

---

### Requirement 11: Workflow Seed Data

**User Story:** As a developer, I want the workflow transition rules to be seeded into the database so that the Workflow_Engine can look up valid transitions without hardcoding them in application code.

#### Acceptance Criteria

1. THE Workflow_Engine SHALL read transition rules from the `workflow_transitions` database table at runtime — transition rules SHALL NOT be hardcoded in application source code.
2. WHEN the seed script is executed, THE Workflow_Engine SHALL upsert exactly one `WorkflowDefinition` row with code `PROPOSAL_LIFECYCLE`.
3. WHEN the seed script is executed, THE Workflow_Engine SHALL upsert six `WorkflowTransition` rows covering all Project_Focal transitions defined in `docs/workflows/PRIME-v2-Workflow.md §3`.
4. THE seed script SHALL be idempotent — running it multiple times SHALL NOT create duplicate rows or return an error.
5. FOR ALL `WorkflowTransition` seed rows, parsing the seed data and re-seeding SHALL produce a database state equivalent to the first run (round-trip property).

---

### Requirement 12: Workflow History Completeness

**User Story:** As a Regional Director, I want to see a complete, unmodified record of every action taken on a proposal so that I can make an informed final decision with full context.

#### Acceptance Criteria

1. WHEN any workflow transition completes, THE Workflow_Engine SHALL record: proposal ID, previous status, new status, actor user ID, actor role, workflow action code, proposal version number, comment (if provided), session reference (if available), and timestamp in UTC ISO 8601 format.
2. THE Workflow_Engine SHALL record a `proposal_workflow_history` row for every transition — no transition SHALL complete without a corresponding history entry.
3. THE Workflow_Engine SHALL record an `audit_logs` row for every transition with matching `entity_type = 'PROPOSAL'`, `entity_id` equal to the proposal ID, and the action code as the `action` field.
4. THE `proposal_workflow_history` table SHALL be append-only — the Workflow_Engine SHALL NOT expose any endpoint or code path that updates or deletes workflow history rows.
5. THE `audit_logs` table SHALL be append-only — the Workflow_Engine SHALL NOT expose any endpoint or code path that updates or deletes audit log rows.

---

### Requirement 13: Error Response Contract

**User Story:** As a frontend developer, I want workflow errors to return a consistent, machine-readable response format so that the UI can display appropriate messages without parsing free-form error strings.

#### Acceptance Criteria

1. WHEN a transition fails with an invalid transition (wrong from_status or unknown action), THE Workflow_Engine SHALL return HTTP 422 with a JSON body containing `error`, `code`, `message`, and `statusCode` fields.
2. WHEN a transition fails due to a concurrent edit conflict, THE Workflow_Engine SHALL return HTTP 409 with a JSON body containing `error`, `code` (`CONCURRENT_TRANSITION`), `message`, and `statusCode` fields.
3. WHEN a required comment field is missing or empty, THE Workflow_Engine SHALL return HTTP 422 with `code = 'COMMENT_REQUIRED'` in the JSON body.
4. WHEN RBAC or assignment checks fail, THE Workflow_Engine SHALL return HTTP 403 with a JSON body using the same `error`, `code`, `message`, `statusCode` structure.
5. THE Workflow_Engine SHALL NOT return HTTP 500 for any expected business rule violation — only unhandled exceptions SHALL produce a 500 response.

---

### Requirement 14: TypeScript Strict Mode Compliance

**User Story:** As a developer, I want the workflow engine implementation to pass TypeScript strict-mode compilation so that type errors are caught at build time rather than at runtime.

#### Acceptance Criteria

1. WHEN `npx tsc --noEmit` is executed in `apps/backend`, THE Workflow_Engine SHALL produce exit code 0 with no type errors after all Phase 10 files are implemented.
2. THE Workflow_Engine SHALL use TypeScript strict mode in all new source files, consistent with the project-wide TypeScript configuration.
3. WHEN existing passing tests are re-run after Phase 10 changes, THE Workflow_Engine SHALL not introduce any regressions — all previously passing tests SHALL continue to pass.
