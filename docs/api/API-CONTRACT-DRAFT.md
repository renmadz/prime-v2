# PRIME v2 — API Contract Draft

| Field | Value |
|---|---|
| Document | PRIME v2 API Contract Draft |
| Version | 1.0 |
| Status | DRAFT — pending Phase 4 approval gate |
| Phase | Phase 4 — Architecture and Data Design |
| Author | Architect Agent |
| Date | 2026-07-01 |

---

## Approval

| Approver | Role | Status |
|---|---|---|
| [TBC] | Architect | Pending |
| [TBC] | Security Agent | Pending |
| [TBC] | Backend Lead | Pending |

> **Gate rule:** No API implementation may begin until this contract is reviewed by the Architect and Security Agent.

---

## Conventions

- All routes are prefixed with `/api`
- All requests and responses use `Content-Type: application/json` unless noted otherwise
- All timestamps are ISO 8601 UTC strings
- All IDs are UUIDs
- Authentication: session cookie (HttpOnly, Secure, SameSite=Strict)
- Role annotations reference `docs/requirements/PRIME-v2-Roles-and-Permissions.md`
- `[AUTH]` = requires valid session
- `[ROLE: X]` = requires role X in addition to auth
- `[OWNER]` = Applicant must be the proposal owner
- `[ASSIGNED]` = Staff must appear in proposal_assignments for this proposal
- HTTP status codes follow REST conventions: 200 OK, 201 Created, 204 No Content, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict, 422 Unprocessable Entity, 429 Too Many Requests, 500 Internal Server Error

---

## 1. Authentication — `/api/auth`

| Method | Path | Auth Required | Roles | Description |
|---|---|---|---|---|
| `GET` | `/api/auth/google` | No | — | Initiates Google OAuth redirect for applicants. Generates CSRF state nonce. |
| `GET` | `/api/auth/google/callback` | No | — | Google OAuth callback. Verifies state nonce and code. Creates account on first login after consent. |
| `POST` | `/api/auth/consent` | Pending session | — | Applicant accepts privacy consent. Creates `users` and `applicant_profiles` rows. Issues full session. |
| `POST` | `/api/auth/staff/login` | No | — | Staff email + password login. Rate-limited (10/15 min per IP, 5/15 min per email). |
| `POST` | `/api/auth/change-password` | `[AUTH]` | Staff only | Staff changes password (required on first login). Clears `must_change_password` flag. |
| `POST` | `/api/auth/forgot-password` | No | Staff only | Initiates password reset. Creates `password_reset_tokens` row. Token delivered to Admin for MVP. |
| `POST` | `/api/auth/reset-password` | No | Staff only | Submits new password using valid reset token. Token is single-use; expires per `expires_at`. |
| `POST` | `/api/auth/logout` | `[AUTH]` | — | Invalidates session. Clears cookie. Logs to audit_logs. |
| `GET` | `/api/auth/me` | `[AUTH]` | — | Returns current user identity, roles, and profile type. Does not return password_hash. |

**Security notes:**
- `/api/auth/google/callback` must reject if the resolved user has any staff role.
- `/api/auth/staff/login` must reject if the resolved user has only the `APPLICANT` role.
- All auth events are written to `audit_logs` regardless of success or failure.

---

## 2. Users — `/api/users`

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/api/users` | `[AUTH]` | `[ROLE: ADMIN]` | List all users. Supports filter by role, status. Paginated. |
| `POST` | `/api/users` | `[AUTH]` | `[ROLE: ADMIN]` | Create a new staff user. Sets `must_change_password = true`. Creates invitation token. |
| `GET` | `/api/users/:id` | `[AUTH]` | `[ROLE: ADMIN]` | Get full user profile by ID. |
| `PATCH` | `/api/users/:id` | `[AUTH]` | `[ROLE: ADMIN]` | Update user profile fields (name, office, position). Logged to audit_logs. |
| `POST` | `/api/users/:id/deactivate` | `[AUTH]` | `[ROLE: ADMIN]` | Deactivate user. Sets `is_active = false`. Invalidates sessions. Logged. |
| `POST` | `/api/users/:id/reactivate` | `[AUTH]` | `[ROLE: ADMIN]` | Reactivate user. Sets `is_active = true`, `must_change_password = true`. Logged. |
| `POST` | `/api/users/:id/resend-invitation` | `[AUTH]` | `[ROLE: ADMIN]` | Regenerates and reissues the activation invitation token. |
| `GET` | `/api/users/me/profile` | `[AUTH]` | — | Returns the current user's own profile (applicant or staff). |
| `PATCH` | `/api/users/me/profile` | `[AUTH]` | — | Applicant updates own profile fields (institution, contact). Non-credential fields only. |

---

## 3. Roles — `/api/roles`

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/api/roles` | `[AUTH]` | `[ROLE: ADMIN]` | List all defined roles. |
| `GET` | `/api/users/:id/roles` | `[AUTH]` | `[ROLE: ADMIN]` | List roles assigned to a user. |
| `POST` | `/api/users/:id/roles` | `[AUTH]` | `[ROLE: ADMIN]` | Assign one or more roles to a user. Logged to audit_logs. |
| `DELETE` | `/api/users/:id/roles/:roleId` | `[AUTH]` | `[ROLE: ADMIN]` | Remove a role from a user. Logged to audit_logs. |

**Notes:**
- Role codes are seeded constants. New role codes cannot be created via the API in the MVP.
- Removing the last active role from a staff user triggers a warning. Admin must confirm.

---

## 4. Programs — `/api/programs`

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/api/programs` | `[AUTH]` | `[ROLE: ADMIN]` | List all programs (GIA, CEST, SSCP). |
| `GET` | `/api/programs/:id` | `[AUTH]` | `[ROLE: ADMIN]` | Get program details including assigned focals. |
| `PATCH` | `/api/programs/:id` | `[AUTH]` | `[ROLE: ADMIN]` | Update program properties (name, active status). Logged. |
| `GET` | `/api/offices` | `[AUTH]` | `[ROLE: ADMIN]` | List all offices. |

---

## 5. Proposal Types — `/api/proposal-types`

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/api/proposal-types` | `[AUTH]` | — | List active proposal types. Applicants use this to select a type. Returns `id`, `name`, `program`. |
| `GET` | `/api/proposal-types/:id` | `[AUTH]` | — | Get proposal type details including default form template. |
| `POST` | `/api/proposal-types` | `[AUTH]` | `[ROLE: ADMIN]` | Create a new proposal type. Assigns program and default form template. |
| `PATCH` | `/api/proposal-types/:id` | `[AUTH]` | `[ROLE: ADMIN]` | Update a proposal type (name, form template, active status). Logged. |
| `POST` | `/api/proposal-types/:id/assign-focal` | `[AUTH]` | `[ROLE: ADMIN]` | Assign a Project Focal user to a proposal type. |

---

## 6. Form Templates — `/api/form-templates`

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/api/form-templates` | `[AUTH]` | `[ROLE: ADMIN]` | List all form templates (FORM-001 to FORM-021). |
| `GET` | `/api/form-templates/:id` | `[AUTH]` | `[ROLE: ADMIN]` | Get form template metadata. |
| `GET` | `/api/form-templates/:id/versions` | `[AUTH]` | `[ROLE: ADMIN]` | List all versions of a form template. |
| `GET` | `/api/form-templates/:id/versions/:versionId` | `[AUTH]` | — | Get full form schema for a specific version — sections, fields, validation rules, calculations. Used by the frontend form renderer. |
| `GET` | `/api/form-templates/:id/versions/current` | `[AUTH]` | — | Get the current active form schema version. |
| `POST` | `/api/form-templates/:id/versions` | `[AUTH]` | `[ROLE: ADMIN]` | Publish a new form template version. Previous version remains accessible for historical proposals. |
| `PATCH` | `/api/form-templates/:id` | `[AUTH]` | `[ROLE: ADMIN]` | Update form template metadata (title, active status). Schema changes require a new version. |

---

## 7. Proposals — `/api/proposals`

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/api/proposals` | `[AUTH]` | Role-filtered | List proposals. Applicants see only their own. Staff see assigned proposals. Admin sees all. Paginated; filterable by status. |
| `POST` | `/api/proposals` | `[AUTH]` | `[ROLE: APPLICANT]` | Create a new proposal in `DRAFT` status. Requires `proposal_type_id`. |
| `GET` | `/api/proposals/:id` | `[AUTH]` | `[OWNER] or [ASSIGNED] or [ROLE: ADMIN]` | Get proposal summary, current status, and current version reference. |
| `PATCH` | `/api/proposals/:id` | `[AUTH]` | `[OWNER]` | Update proposal title or other non-field-value metadata while in `DRAFT`. |
| `POST` | `/api/proposals/:id/submit` | `[AUTH]` | `[OWNER]` | Submit the draft proposal. Locks current version (`is_submitted = true`). Transitions status to `SUBMITTED_TO_FOCAL`. Creates audit and workflow history entries. |
| `POST` | `/api/proposals/:id/withdraw` | `[AUTH]` | `[OWNER]` | Withdraw proposal. Only permitted in pre-final statuses per workflow doc. Transitions to `WITHDRAWN`. Logged. |

---

## 8. Proposal Versions — `/api/proposals/:id/versions`

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/api/proposals/:id/versions` | `[AUTH]` | `[OWNER] or [ASSIGNED] or [ROLE: ADMIN]` | List all versions for a proposal. Returns version number, status at creation, created-by, date. |
| `GET` | `/api/proposals/:id/versions/:versionId` | `[AUTH]` | `[OWNER] or [ASSIGNED] or [ROLE: ADMIN]` | Get full field value snapshot for a specific version. Returns all `proposal_field_values` for that version. |
| `GET` | `/api/proposals/:id/versions/:versionId/diff` | `[AUTH]` | `[ASSIGNED] or [ROLE: ADMIN]` | Return field-by-field diff between two versions. Accepts `compareWith` query parameter (version ID or number). Applicants are not permitted to use this endpoint. |
| `PATCH` | `/api/proposals/:id/versions/draft/fields` | `[AUTH]` | `[OWNER]` | Autosave: update one or more field values on the current draft version. Only permitted when `proposal_versions.is_submitted = false`. |

**Immutability enforcement:**
- Any write to `/versions/:versionId/fields` where the target version has `is_submitted = true` must return `409 Conflict`.
- This check must occur at the route handler level before any database operation.

---

## 9. Comments — `/api/proposals/:id/comments`

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/api/proposals/:id/comments` | `[AUTH]` | Role-filtered | List comment threads and their comments for a proposal. Visibility filter applied server-side based on current user's role. Applicants never receive RTEC_PRIVATE, RTEC_HEAD_ONLY, FOCAL_AND_INTERNAL, or OFFICIAL_WORKFLOW comments. |
| `POST` | `/api/proposals/:id/comments` | `[AUTH]` | `[ASSIGNED] or [ROLE: REGIONAL_DIRECTOR]` | Create a new comment thread and first comment. Body must include `scope` (FIELD / SECTION / GENERAL), `visibility`, and `body`. Applicants cannot create comments. |
| `POST` | `/api/proposals/:id/comments/:commentId/reply` | `[AUTH]` | `[ASSIGNED] or [ROLE: REGIONAL_DIRECTOR]` | Add a reply to an existing comment. |
| `PATCH` | `/api/proposals/:id/comments/:commentId/resolve` | `[AUTH]` | Per permissions matrix §3.3 | Mark a comment as resolved. Role-checked per Roles-and-Permissions §3.3. |
| `PATCH` | `/api/proposals/:id/comments/:commentId/reopen` | `[AUTH]` | Per permissions matrix §3.3 | Reopen a resolved comment. Role-checked per Roles-and-Permissions §3.3. |

**Visibility enforcement note:**
- The `GET` endpoint must apply the server-side visibility filter described in Security Plan §5.2 before any comment data is serialized.
- A post-query assertion must confirm no `RTEC_PRIVATE` comment appears in responses to Applicant sessions.

---

## 10. Workflow — `/api/proposals/:id/workflow`

Each endpoint below represents a named workflow action. All trigger a `proposal_workflow_history` row and an `audit_logs` row before returning.

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| `POST` | `/api/proposals/:id/workflow/acknowledge` | `[AUTH]` | `[ROLE: PROJECT_FOCAL]` | Focal opens/acknowledges proposal. Transitions `SUBMITTED_TO_FOCAL` → `UNDER_FOCAL_REVIEW` or `RESUBMITTED_TO_FOCAL` → `UNDER_FOCAL_REVIEW`. |
| `POST` | `/api/proposals/:id/workflow/return-to-applicant` | `[AUTH]` | `[ROLE: PROJECT_FOCAL]` | Return proposal to Applicant with required official comment. Transitions to `RETURNED_TO_APPLICANT` or `FOR_APPLICANT_REVISION_AFTER_RTEC`. Applicant notified. (RD's equivalent action is the separate `rd-return` endpoint below — different actor and unlock semantics.) |
| `POST` | `/api/proposals/:id/workflow/endorse-to-rtec` | `[AUTH]` | `[ROLE: PROJECT_FOCAL]` | Endorse proposal to RTEC group. Must include `rtec_group_id`. Transitions to `ENDORSED_TO_RTEC`. RTEC members notified. |
| `POST` | `/api/proposals/:id/workflow/return-to-rtec` | `[AUTH]` | `[ROLE: PROJECT_FOCAL]` | Return proposal back to RTEC for re-review (from `RETURNED_TO_FOCAL_BY_RTEC`). Transitions to `ENDORSED_TO_RTEC`. |
| `POST` | `/api/proposals/:id/workflow/endorse-to-budget` | `[AUTH]` | `[ROLE: PROJECT_FOCAL]` | Endorse proposal to Budget Officer. Transitions to `ENDORSED_TO_BUDGET`. Budget Officer notified. |
| `POST` | `/api/proposals/:id/workflow/rtec-begin-consolidation` | `[AUTH]` | `[ROLE: RTEC_HEAD]` | RTEC Head begins consolidation. Transitions `RTEC_MEMBER_REVIEWS_COMPLETE` → `UNDER_RTEC_HEAD_CONSOLIDATION`. |
| `POST` | `/api/proposals/:id/workflow/rtec-submit-recommendation` | `[AUTH]` | `[ROLE: RTEC_HEAD]` | RTEC Head submits final recommendation. Requires `rtec_consolidations.is_submitted = false` first. Transitions to `RETURNED_TO_FOCAL_BY_RTEC`. Focal notified. |
| `POST` | `/api/proposals/:id/workflow/budget-open` | `[AUTH]` | `[ROLE: BUDGET_OFFICER]` | Budget Officer opens review. Transitions `ENDORSED_TO_BUDGET` → `UNDER_BUDGET_REVIEW`. |
| `POST` | `/api/proposals/:id/workflow/budget-return` | `[AUTH]` | `[ROLE: BUDGET_OFFICER]` | Budget Officer returns to Project Focal with findings (comment required). Transitions to `RETURNED_BY_BUDGET`. Focal notified. |
| `POST` | `/api/proposals/:id/workflow/budget-endorse` | `[AUTH]` | `[ROLE: BUDGET_OFFICER]` | Budget Officer endorses to Accounting. Transitions to `ENDORSED_TO_ACCOUNTING`. Accountant notified. |
| `POST` | `/api/proposals/:id/workflow/budget-re-endorse` | `[AUTH]` | `[ROLE: BUDGET_OFFICER]` | Budget Officer re-endorses after Accounting returned it to Budget. Transitions `RETURNED_BY_ACCOUNTING` → `ENDORSED_TO_ACCOUNTING`. Accountant notified. |
| `POST` | `/api/proposals/:id/workflow/accounting-open` | `[AUTH]` | `[ROLE: ACCOUNTANT]` | Accountant opens review. Transitions `ENDORSED_TO_ACCOUNTING` → `UNDER_ACCOUNTING_REVIEW`. |
| `POST` | `/api/proposals/:id/workflow/accounting-return-to-budget` | `[AUTH]` | `[ROLE: ACCOUNTANT]` | Accountant returns proposal to Budget with findings (comment required). Transitions to `RETURNED_BY_ACCOUNTING`. Budget Officer notified. Distinct action code from the direct-to-Focal path below for an unambiguous audit trail. |
| `POST` | `/api/proposals/:id/workflow/accounting-return-to-focal` | `[AUTH]` | `[ROLE: ACCOUNTANT]` | Accountant returns proposal directly to Project Focal, skipping Budget (policy-confirmed). Transitions to `RETURNED_BY_ACCOUNTING`. Focal notified (not Budget Officer). |
| `POST` | `/api/proposals/:id/workflow/accounting-endorse-to-rd` | `[AUTH]` | `[ROLE: ACCOUNTANT]` | Accountant endorses to Regional Director. Transitions to `ENDORSED_TO_RD`. All active `REGIONAL_DIRECTOR` role-holders notified (role-based, not assignment-based — RD has unconditional access per Roles-and-Permissions §3.1). |
| `POST` | `/api/proposals/:id/workflow/focal-reroute` | `[AUTH]` | `[ROLE: PROJECT_FOCAL]` | Project Focal re-routes a proposal the Accountant returned directly (comment required). Transitions `RETURNED_BY_ACCOUNTING` → `UNDER_FOCAL_REVIEW`. |
| `POST` | `/api/proposals/:id/workflow/rd-open` | `[AUTH]` | `[ROLE: REGIONAL_DIRECTOR]` | RD opens proposal for review. Transitions `ENDORSED_TO_RD` → `UNDER_RD_REVIEW`. |
| `POST` | `/api/proposals/:id/workflow/rd-approve` | `[AUTH]` | `[ROLE: REGIONAL_DIRECTOR]` | RD approves (comment required). Transitions to `APPROVED`. Applicant and Focal notified. Proposal locked (`isLocked = true`). |
| `POST` | `/api/proposals/:id/workflow/rd-defer` | `[AUTH]` | `[ROLE: REGIONAL_DIRECTOR]` | RD defers (reason required). Transitions to `DEFERRED`. No Applicant notification — internal hold. |
| `POST` | `/api/proposals/:id/workflow/rd-resume` | `[AUTH]` | `[ROLE: REGIONAL_DIRECTOR]` | RD resumes deferred review. Transitions `DEFERRED` → `UNDER_RD_REVIEW`. |
| `POST` | `/api/proposals/:id/workflow/rd-reject` | `[AUTH]` | `[ROLE: REGIONAL_DIRECTOR]` | RD rejects proposal (comment required). Transitions to `REJECTED`. Applicant and Focal notified. Proposal locked (`isLocked = true`). |
| `POST` | `/api/proposals/:id/workflow/rd-return` | `[AUTH]` | `[ROLE: REGIONAL_DIRECTOR]` | RD returns proposal to Applicant for revision (comment required). Transitions to `RETURNED_TO_APPLICANT`. Unlocks the proposal (`isLocked = false`). Applicant notified. Separate endpoint from the Focal-stage `return-to-applicant` above since the actor role and unlock behavior differ. |
| `GET` | `/api/proposals/:id/workflow/history` | `[AUTH]` | `[OWNER] or [ASSIGNED] or [ROLE: ADMIN]` | Get full workflow history for a proposal (all `proposal_workflow_history` rows). |

**Implementation rules for all workflow endpoints:**
- Every endpoint must validate the transition is permitted per the allowed-transitions table in `docs/workflows/PRIME-v2-Workflow.md §3`.
- Invalid transitions must return `422 Unprocessable Entity` with an error code, not `500`.
- The `from_status` must match the proposal's current status at query time. A concurrent transition must result in `409 Conflict`.

---

## 11. RTEC — `/api/proposals/:id/rtec`

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/api/proposals/:id/rtec/reviews` | `[AUTH]` | `[ROLE: RTEC_HEAD]` | List all RTEC member reviews for this proposal. RTEC Head only. |
| `GET` | `/api/proposals/:id/rtec/reviews/mine` | `[AUTH]` | `[ROLE: RTEC_MEMBER]` | Get the current member's own review for this proposal. |
| `POST` | `/api/proposals/:id/rtec/reviews` | `[AUTH]` | `[ROLE: RTEC_MEMBER]` | Create or update the member's review (draft). |
| `POST` | `/api/proposals/:id/rtec/reviews/submit` | `[AUTH]` | `[ROLE: RTEC_MEMBER]` | Submit the member's final review. Locks the review (`is_submitted = true`). System checks if all members submitted; if so, transitions proposal to `RTEC_MEMBER_REVIEWS_COMPLETE`. |
| `GET` | `/api/proposals/:id/rtec/consolidation` | `[AUTH]` | `[ROLE: RTEC_HEAD]` | Get current consolidation draft for this proposal. |
| `POST` | `/api/proposals/:id/rtec/consolidation` | `[AUTH]` | `[ROLE: RTEC_HEAD]` | Create or update the consolidation draft. |
| `POST` | `/api/proposals/:id/rtec/consolidation/submit` | `[AUTH]` | `[ROLE: RTEC_HEAD]` | Submit the official RTEC consolidation. Triggers `rtec-submit-recommendation` workflow action. |
| `POST` | `/api/proposals/:id/rtec/reviews/:reviewId/reopen` | `[AUTH]` | `[ROLE: RTEC_HEAD]` | Reopen a submitted member review for clarification. Logged. |

**Notes:**
- `GET /rtec/reviews` must return all member reviews including private remarks — visible to RTEC Head only. The API must verify the requester is the RTEC Head for this proposal's group.
- Member reviews must never be returned in any response to an Applicant session.

---

## 12. Budget Review — `budget_reviews` table (no standalone endpoints)

**Superseded by the workflow-action pattern.** As built in Phase 12, `budget_reviews` rows are created/updated as a side effect of the workflow actions in §10 (`budget-open` creates an `OPEN` row; `budget-return`/`budget-endorse`/`budget-re-endorse` update or create the row with `findings`/`action_taken`/`reviewed_at`) — there is no standalone `GET/POST/PATCH /api/proposals/:id/budget-review` endpoint. Findings are visible via each action's response and via `proposal_workflow_history`. A dedicated read endpoint may be added in a later phase if a Budget review detail view is needed.

---

## 13. Accounting Review — `accounting_reviews` table (no standalone endpoints)

**Superseded by the workflow-action pattern**, same as §12: `accounting_reviews` rows are created/updated by the `accounting-open`/`accounting-return-to-budget`/`accounting-return-to-focal`/`accounting-endorse-to-rd` actions in §10. No standalone CRUD endpoint exists.

---

## 14. RD Decision — `rd_decisions` table (no standalone endpoint)

`rd_decisions` rows are created by the workflow endpoints in §10 (`rd-approve`, `rd-defer`, `rd-reject`, `rd-return`). There is no standalone `GET /api/proposals/:id/rd-decision` endpoint as originally drafted — decision history is visible via `GET /api/proposals/:id/workflow/history`. A dedicated read endpoint may be added later if needed.

---

## 15. Attachments — `/api/proposals/:id/attachments`

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/api/proposals/:id/attachments` | `[AUTH]` | `[OWNER] or [ASSIGNED] or [ROLE: ADMIN]` | List all non-deleted attachments for a proposal (all versions). |
| `POST` | `/api/proposals/:id/attachments` | `[AUTH]` | `[OWNER]` | Upload a new attachment. `multipart/form-data`. File validated by type (MIME magic bytes), size, and extension allow-list before streaming to MinIO. Returns attachment metadata. |
| `GET` | `/api/proposals/:id/attachments/:attachmentId` | `[AUTH]` | `[OWNER] or [ASSIGNED] or [ROLE: ADMIN]` | Get attachment metadata (filename, size, uploaded_by, date). Does not return file content. |
| `GET` | `/api/proposals/:id/attachments/:attachmentId/download` | `[AUTH]` | `[OWNER] or [ASSIGNED] or [ROLE: ADMIN]` | Returns a short-lived MinIO presigned URL (TTL: 60 seconds). Access permission verified before URL is generated. |

**Security rules:**
- MinIO object keys must never appear in API responses.
- The download endpoint must log to `audit_logs` on every call.
- Executable file types must be blocked at upload; see Security Plan §6.1.

---

## 16. Notifications — `/api/notifications`

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/api/notifications` | `[AUTH]` | — | List notifications for the current user. Paginated. Filterable by `is_read`. |
| `GET` | `/api/notifications/unread-count` | `[AUTH]` | — | Returns the count of unread notifications for the RightNav badge. |
| `POST` | `/api/notifications/:id/read` | `[AUTH]` | — | Mark a single notification as read. |
| `POST` | `/api/notifications/read-all` | `[AUTH]` | — | Mark all notifications for the current user as read. |
| `GET` | `/api/notifications/stream` | `[AUTH]` | — | Server-Sent Events (SSE) endpoint for real-time notification delivery. Connection requires valid session cookie. |

**Notes:**
- Notifications are always scoped to `recipient_user_id = current_user.id`. A user cannot read another user's notifications.
- Email notifications are out of scope for the MVP (OOS-15). The `email_logs` table is reserved for a future phase.

---

## 17. Audit Logs — `/api/audit-logs`

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/api/audit-logs` | `[AUTH]` | `[ROLE: ADMIN]` | List audit log entries. Paginated. Filterable by `actor_user_id`, `action`, `entity_type`, `entity_id`, date range. |
| `GET` | `/api/audit-logs/:id` | `[AUTH]` | `[ROLE: ADMIN]` | Get a single audit log entry by ID. |
| `GET` | `/api/proposals/:id/audit-logs` | `[AUTH]` | `[ROLE: ADMIN]` | Get all audit log entries for a specific proposal. |

**Rules:**
- Audit log endpoints are read-only. There are no `POST`, `PATCH`, or `DELETE` endpoints for `audit_logs`.
- Applicants must never receive audit log data.
- Staff roles other than Admin must not access the general audit log. They may view `proposal_workflow_history` through the workflow history endpoint (§10).

---

## 18. Reports — `/api/reports`

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/api/reports/proposal-status-summary` | `[AUTH]` | `[ROLE: ADMIN]` | Summary counts of proposals by status. |
| `GET` | `/api/reports/proposals-by-program` | `[AUTH]` | `[ROLE: ADMIN]` | Proposal count and status breakdown by program. |
| `GET` | `/api/proposals/:id/export/pdf` | `[AUTH]` | `[OWNER] or [ASSIGNED] or [ROLE: ADMIN]` | Generate and return a PDF of the proposal version. RTEC_PRIVATE comments excluded from Applicant-facing output. Export logged to audit_logs. |

**Notes:**
- Advanced analytics and cross-system reports are out of scope for the MVP (OOS-11).
- The PDF export uses a server-side rendering library (PDFKit or Puppeteer — pending ADR-002).
- PDF content reflects the stored version snapshot, not live recalculated values.

---

## 19. System Administration — `/api/admin`

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/api/admin/settings` | `[AUTH]` | `[ROLE: ADMIN]` | List all system settings (key-value pairs). |
| `PATCH` | `/api/admin/settings/:key` | `[AUTH]` | `[ROLE: ADMIN]` | Update a system setting value. Logged to audit_logs. |
| `GET` | `/api/admin/rtec-groups` | `[AUTH]` | `[ROLE: ADMIN]` | List all RTEC groups. |
| `POST` | `/api/admin/rtec-groups` | `[AUTH]` | `[ROLE: ADMIN]` | Create a new RTEC group. |
| `GET` | `/api/admin/rtec-groups/:id/members` | `[AUTH]` | `[ROLE: ADMIN]` | List members of an RTEC group. |
| `POST` | `/api/admin/rtec-groups/:id/members` | `[AUTH]` | `[ROLE: ADMIN]` | Add a member (or designate head) to an RTEC group. |
| `DELETE` | `/api/admin/rtec-groups/:id/members/:userId` | `[AUTH]` | `[ROLE: ADMIN]` | Remove a member from an RTEC group. |
| `GET` | `/api/admin/workflow-config` | `[AUTH]` | `[ROLE: ADMIN]` | List active workflow definitions and transition rules. |
| `POST` | `/api/admin/proposals/:id/reassign` | `[AUTH]` | `[ROLE: ADMIN]` | Reassign a pending task from one user to another. Used when a staff member is deactivated. Logged. |
| `GET` | `/api/admin/health` | `[AUTH]` | `[ROLE: ADMIN]` | Returns system health summary (database connectivity, MinIO reachability, background job status). |
| `GET` | `/health` | No | — | Public health check endpoint for Coolify container health probe. Returns `{ "status": "ok" }`. |

---

## 20. Response Envelope

All API responses follow this envelope for consistency:

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 150
  }
}
```
`meta` is omitted for non-paginated responses.

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "One or more fields are invalid.",
    "fields": {
      "email": "Invalid email format"
    }
  },
  "requestId": "uuid"
}
```

`fields` is included for `400` validation errors only. For `403`, `404`, `409`, and `500`, `fields` is omitted. Stack traces and internal error messages must never appear in production error responses.

---

## 21. Global Rules

1. Every authenticated route must check `is_active = true` on the requesting user before executing.
2. Role and ownership checks are mandatory on every route that accesses or modifies proposal data.
3. All writes that change workflow status must be atomic: status update + workflow history row + audit log row must succeed together or all roll back.
4. Rate limiting is applied at the authentication endpoints (§1). Application-level rate limiting on non-auth routes may be added in Phase 14.
5. `Content-Type: application/json` must be validated on all `POST` and `PATCH` requests. Requests with unexpected content types return `415 Unsupported Media Type`.
6. API versioning is not required for the MVP. Routes are unversioned. A versioning strategy will be defined before production go-live.

---

## 22. References

| Document | Location |
|---|---|
| Roles and Permissions | `docs/requirements/PRIME-v2-Roles-and-Permissions.md` |
| Workflow and Statuses | `docs/workflows/PRIME-v2-Workflow.md` |
| MVP Specification | `docs/requirements/PRIME-v2-MVP.md` |
| Security Plan | `docs/security/PRIME-v2-Security-Plan.md` |
| System Architecture | `docs/architecture/PRIME-v2-Architecture.md` |
| ERD | `docs/database/PRIME-v2-ERD.md` |

---

## 23. Revision History

| Version | Summary | Author | Date |
|---|---|---|---|
| 1.0 | Initial API contract draft — Phase 4 | Architect Agent | 2026-07-01 |
