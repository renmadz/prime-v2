# PRIME v2 — AI Development Plan (Read Before Coding)

**Audience:** Cursor, Codex, Copilot, and any AI assistant working in this repo.  
**Audience (humans):** Developers after `git pull` — same rules apply.

> **Rule:** This document is the **canonical execution plan**. Do **not** implement features ahead of the active phase. Do **not** skip to production deploy (Phases 16–20) until Phases 21A → 21B → 10 → 11 → 12 → 13 → 14–15 are complete and tested.

---

## Machine-readable summary (for AI routing)

```yaml
project: PRIME v2
repo_entry: DEVELOPERS.md
execution_plan: docs/agents/DEVELOPER-EXECUTION-PLAN.md
test_checklist: docs/agents/TEST-MATRIX.md
phase_status: docs/agents/PHASES-REFERENCE.md
active_phase: "Phase 10"
active_phase_name: "Complete Focal Workflow UI (Phase 21B closed 2026-07-09)"
do_not_implement_yet:
  - RTEC workflow (Phase 11) until Phase 10 gate closed
  - Budget/Accounting/RD workflow (Phase 12) until Phase 11 closed
  - PDF export (Phase 13) until Phase 12 closed
  - Staging/production deploy (Phases 16–20) until Phase 15 QA pass
local_ui: http://localhost:5173
local_api: http://localhost:3000
dev_logins: docs/deployment/DEV-TEST-ACCOUNTS.md
pre_push_gate: docs/agents/QA-PUSH-GATE.md
```

---

## Read order (mandatory)

| Step | File | Why |
|------|------|-----|
| 1 | [../../DEVELOPERS.md](../../DEVELOPERS.md) | Run Docker, seed DB, run tests |
| 2 | [DEVELOPER-EXECUTION-PLAN.md](DEVELOPER-EXECUTION-PLAN.md) | Current phase tasks and exit gates |
| 3 | [PHASES-REFERENCE.md](PHASES-REFERENCE.md) | Confirm phase is approved for coding |
| 4 | [TEST-MATRIX.md](TEST-MATRIX.md) | What to verify after each change |
| 5 | [QA-PUSH-GATE.md](QA-PUSH-GATE.md) | Before `git commit` / `git push` |
| 6 | [../../AGENTS.md](../../AGENTS.md) | Which agent to consult per change type |

---

## What is already built (do not rebuild)

| Area | Status | Key paths |
|------|--------|-----------|
| Auth + 8 dev roles | Done | `apps/backend/prisma/seed.ts`, `docs/deployment/DEV-TEST-ACCOUNTS.md` |
| Left nav + all routes | Done | `apps/frontend/src/App.tsx`, `apps/frontend/src/components/shell/` |
| Proposals CRUD, submit, versions, comments | Done | `apps/backend/src/routes/proposals.ts`, `submission.ts`, `comments.ts` |
| Focal workflow API (5 actions) | Backend only | `apps/backend/src/routes/workflow.ts` |
| Admin / queue / notification / profile pages | Done (API wired) | `apps/frontend/src/pages/admin/`, `queues/`, `notifications/` |
| Form templates | Partial (3 stubs) | `apps/backend/prisma/seed.ts` |

---

## What is NOT built yet (implement only in the matching phase)

| Phase | Feature | Blocked until |
|-------|---------|---------------|
| **21A** | Seed sample proposals + assignments; focal UI on proposal detail; notification badge; admin assignment UI | Now (start here) |
| **21B** | Full GIA/CEST/SSCP forms; TABLE fields; required validation | 21A gate Pass |
| **10** | Complete focal workflow UI + history display | 21B gate Pass |
| **11** | RTEC review + consolidation backend + UI | Phase 10 gate Pass |
| **12** | Budget, Accounting, RD workflow | Phase 11 gate Pass |
| **13** | PDF/document export | Phase 12 gate Pass |
| **14–15** | Security hardening + full QA regression | Phase 13 gate Pass |
| **16–18** | Staging, UAT, production readiness | Phase 15 gate Pass |
| **19–20** | Production launch + hypercare | Phase 18 sign-off |

---

## Phase 21A — AI task spec (✅ closed 2026-07-08)

**Goal:** Any developer can demo Applicant → Focal without manual DB edits.

### Files changed

| Task | Files | Status |
|------|-------|--------|
| Seed a `SUBMITTED_TO_FOCAL` proposal | `apps/backend/prisma/seed.ts` | ✅ Done — idempotent, reuses existing or creates one |
| Seed `ProposalAssignment` rows | `apps/backend/prisma/seed.ts` | ✅ Done for `focal@dev.local` / PROJECT_FOCAL |
| Focal workflow buttons (acknowledge, return, endorse) | `apps/frontend/src/pages/proposals/ProposalDetailPage.tsx`, `apps/frontend/src/lib/api.ts` | ⏳ Not done — routes exercised via API in the gate test; UI buttons deferred to Phase 10 |
| Admin assign staff to proposal | `apps/backend/src/routes/assignments.ts` + "Staff Assignments" panel on `ProposalDetailPage.tsx` | ✅ Done |
| Notification unread badge | `apps/frontend/src/components/shell/SideNav.tsx` | Not done — not required by the gate |

### Exit gate (manual) — 6/6 Pass 2026-07-08

Full results in [TEST-MATRIX.md](TEST-MATRIX.md) § Phase 21A.

1. applicant@dev.local — create + submit GIA → `SUBMITTED_TO_FOCAL` ✅
2. focal@dev.local — `/queue` shows proposal ✅
3. focal@dev.local — acknowledge → `UNDER_FOCAL_REVIEW` ✅
4. focal@dev.local — return to applicant → applicant notification ✅
5. applicant@dev.local — `/notifications` mark read ✅
6. admin@dev.local — `/admin/users` loads ✅

### Exit gate (automated) — 127/127 Pass 2026-07-08

```powershell
cd apps/frontend && npx vitest run   # 7/7
cd apps/backend && npm test          # 120/120
```

### Now on Phase 21B

See [DEVELOPER-EXECUTION-PLAN.md](DEVELOPER-EXECUTION-PLAN.md) § Phase 21B (fillable forms — GIA/CEST/SSCP full multi-section forms, TABLE fields, required validation).

---

## Standard AI prompt template

When the user asks you to implement work, respond with this structure first:

```text
Project: PRIME v2
Active phase: [from PHASES-REFERENCE.md]
Task: [one deliverable from DEVELOPER-EXECUTION-PLAN.md]

Read before coding:
- docs/agents/DEVELOPER-EXECUTION-PLAN.md (current phase section)
- docs/agents/TEST-MATRIX.md (relevant rows)
- [specific source files listed in plan]

Constraints:
- Do not implement features from later phases
- Follow AGENTS.md agent consultation
- Left-side nav only (not top navbar)
- No secrets in code
- Run QA-PUSH-GATE before suggesting push

Deliverables:
- [exact files]
- Update TEST-MATRIX Pass/Fail after manual test
- Update PHASES-REFERENCE if phase gate closed
```

Copy-paste template: [templates/TASK-PROMPT-TEMPLATE.md](templates/TASK-PROMPT-TEMPLATE.md)

---

## Testing map (all roles)

Use [TEST-MATRIX.md](TEST-MATRIX.md) for the full Pass/Fail table. Quick reference:

| Role | Email | Primary URLs |
|------|-------|--------------|
| Applicant | applicant@dev.local | `/proposals/new`, `/proposals`, `/notifications` |
| Project Focal | focal@dev.local | `/queue`, `/proposals/:id` |
| RTEC Member | rtec.member@dev.local | `/rtec/reviews` |
| RTEC Head | rtec.head@dev.local | `/rtec/consolidation` |
| Budget | budget@dev.local | `/budget/queue` |
| Accountant | accountant@dev.local | `/accounting/queue` |
| Regional Director | rd@dev.local | `/rd/queue` |
| Admin | admin@dev.local | `/admin/*` |

Passwords: [DEV-TEST-ACCOUNTS.md](../deployment/DEV-TEST-ACCOUNTS.md)

---

## Definition of MVP finished

1. [TEST-MATRIX.md](TEST-MATRIX.md) — all applicable rows **Pass** on staging
2. Phase 21 closed (8 logins, focal E2E, 3 fillable proposal types)
3. Phases 10–13 closed per [README.md](../../README.md) §24
4. Phases 16–18 sign-off complete
5. Phase 19 production smoke passed

**Do not deploy to production until all five are true.**

---

## Related plans (do not duplicate)

| Document | Use |
|----------|-----|
| [DEVELOPER-EXECUTION-PLAN.md](DEVELOPER-EXECUTION-PLAN.md) | Human-readable phase checklist (same content, more detail) |
| [PHASE-21-MVP-COMPLETION.md](PHASE-21-MVP-COMPLETION.md) | Phase 21 integration notes |
| [INTERN-VIBE-CODING-GUIDE.md](INTERN-VIBE-CODING-GUIDE.md) | Cursor prompt patterns per phase |
| [DEVELOPMENT-FLOW.md](DEVELOPMENT-FLOW.md) | Agent consultation workflow |
