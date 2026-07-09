# PRIME v2 — Developer Coding Guide

How to use **Cursor Agent** on this project, phase by phase, without skipping approvals or agents.

**Who this is for:** All developers (junior, mid, senior, AI-assisted) — not interns only.

**Read first:** [../../DEVELOPERS.md](../../DEVELOPERS.md) · [DEVELOPER-EXECUTION-PLAN.md](DEVELOPER-EXECUTION-PLAN.md) · [TEST-MATRIX.md](TEST-MATRIX.md) · [AGENTS.md](../../AGENTS.md) · [PHASES-REFERENCE.md](PHASES-REFERENCE.md)

---

## How to Vibe Code Here (Rules)

1. **Always say which phase you are in** at the start of your Cursor prompt.
2. **Name the agent** you want (Product Manager, Architect, Security, QA, Frontend, Backend, etc.).
3. **Paste or fill** [TASK-PROMPT-TEMPLATE.md](templates/TASK-PROMPT-TEMPLATE.md) for any feature work.
4. **Phases 0–4 are approved** — follow [DEVELOPER-EXECUTION-PLAN.md](DEVELOPER-EXECUTION-PLAN.md) starting at **Phase 21A**.
5. **Before `git push`:** complete [QA-PUSH-GATE.md](QA-PUSH-GATE.md) and mark relevant rows in [TEST-MATRIX.md](TEST-MATRIX.md).
6. **UI work:** follow [UI-DESIGN-STANDARDS.md](../frontend/UI-DESIGN-STANDARDS.md) — modern, responsive, **left-side nav** for all users.
7. **Local testing:** use [DEV-TEST-ACCOUNTS.md](../deployment/DEV-TEST-ACCOUNTS.md) — one login per role.

---

## Prompt Pattern (use every time)

```text
Project: PRIME v2
Current phase: [Phase N — name]
Act as: [Agent name]

Read before acting:
- README.md (relevant sections)
- [list specific docs/files]

Task:
[One clear deliverable]

Constraints:
- Follow ObraTech SDLC — no coding if this phase forbids it
- Consult Product Manager, Architect, Security, QA as required
- Do not commit secrets
- UI: left-side navbar, responsive mobile/tablet/desktop (if UI)

Output:
[Exact file paths to create or update]
```

---

## Phase 0 — Project Initialization

| | |
|---|---|
| **Coding** | No |
| **You are** | Mostly done — finish remaining items |
| **Agents** | Product Manager, Architect |

**Remaining tasks:** issue template, decision-log template, change-request template, stakeholder list, risk register, backlog.

**Cursor prompt — finish Phase 0:**

```text
Project: PRIME v2
Current phase: Phase 0 — Project Initialization
Act as: Product Manager Agent

Read README.md §24 Phase 0 and docs/agents/PHASES-REFERENCE.md.

Create these files (markdown, concise):
1. docs/project-brief/STAKEHOLDERS.md — table: name, role, contact, responsibility
2. docs/requirements/INITIAL-BACKLOG.md — prioritized list from README MVP
3. docs/requirements/RISK-REGISTER.md — from README §35 risk table, add owner and status
4. .github/ISSUE_TEMPLATE/bug_report.md and feature_request.md (or docs/templates/issue-template.md if no GitHub yet)
5. docs/templates/DECISION-LOG.md — ADR-style: date, decision, rationale, approver
6. docs/templates/CHANGE-REQUEST.md — scope change request form

Do not write application code. Match existing doc style in docs/.
When done, list what is still needed for Phase 0 approval gate.
```

**Done when:** Project owner confirms name, scope, stakeholders ([PHASES-REFERENCE.md](PHASES-REFERENCE.md)).

---

#l/email process)
- Proposed solution (PRIME v2 web workflow)
- Stakeholder matrix (link STAKEHOLDERS.md)
- Current vs proposed process (text or mermaid)
- Assumptions, constraints, success metrics# Phase 1 — Business Analysis and Project Brief

| | ||---|---|
| **Coding** | No |
| **Agents** | Product Manager |

**Cursor prompt:**

```text
Project: PRIME v2
Current phase: Phase 1 — Business Analysis and Project Brief
Act as: Product Manager Agent

Read README.md §3 Business Story, §4 Vision, §5 Objectives, §10 Main Workflow.

Draft docs/project-brief/PRIME-v2-Project-Brief.md with:
- Problem statement (current manual Word/Exce

Do not write code. Flag anything that needs interview confirmation with process owners.
```

**Done when:** Business owner approves Project Brief.

---

## Phase 2 — MVP, Roles, and User Stories

| | |
|---|---|
| **Coding** | No |
| **Agents** | Product Manager, Security |

**Cursor prompts (run separately):**

**2A — MVP spec:**

```text
Project: PRIME v2
Current phase: Phase 2
Act as: Product Manager Agent

Read README.md §6 Scope (in/out), §16 MVP Definition, §17 User Stories.

Create docs/requirements/PRIME-v2-MVP.md — full MVP checklist with pass/fail column.
Create docs/requirements/USER-STORY-BACKLOG.md — all US-* stories from README §17 in backlog table format.
```

**2B — Roles and permissions:**

```text
Project: PRIME v2
Current phase: Phase 2
Act as: Security Agent

Read README.md §7 Authentication, §8 User Roles.

Create docs/requirements/PRIME-v2-Roles-and-Permissions.md:
- Role list
- Permission matrix (action × role): view, edit, submit, comment, return, endorse, approve, admin
- Applicant Google-only vs staff email/password rules
```

**2C — Workflow statuses:**

```text
Project: PRIME v2
Current phase: Phase 2
Act as: Product Manager Agent

Read README.md §10 Workflow, §11 Proposal Statuses.

Create docs/workflows/PRIME-v2-Workflow.md:
- Status list with definitions
- Allowed transitions diagram (mermaid)
- Who can trigger each transition
```

**Done when:** Product owner approves MVP; Security approves permissions; process owner approves workflow.

---

## Phase 3 — Form Conversion Specifications

| | |
|---|---|
| **Coding** | No — specifications only |
| **Agents** | Product Manager, Frontend, QA |

**Cursor prompt (one form at a time):**

```text
Project: PRIME v2
Current phase: Phase 3
Act as: Frontend Agent (with QA input for validations)

Read docs/forms/FORM-INVENTORY.md and the source file:
docs/forms/[word|excel|pdf]/[filename]

Create docs/forms/converted-form-specs/FORM-XXX-[short-name].md with:
- Form ID, title, program, source file
- Sections and fields (name, type, required, validation)
- Excel formulas documented (if Excel)
- Role/comment permissions per field
- Attachment and PDF output requirements

Do not implement React. Update FORM-INVENTORY.md status to "Specification Draft".
```

**Done when:** Form owner approves each spec; no web-form coding until approved.

---

## Phase 4 — Architecture and Data Design

| | |
|---|---|
| **Coding** | No — design docs only |
| **Agents** | Architect, Database, Security, DevOps |

**Cursor prompts:**

**4A — Architecture:**

```text
Project: PRIME v2
Current phase: Phase 4
Act as: Architect Agent

Read README.md §19 Tech Stack, §20 Architecture, docs/frontend/UI-DESIGN-STANDARDS.md.

Create:
1. docs/architecture/PRIME-v2-Architecture.md — logical diagram, frontend/backend/PostgreSQL/MinIO
2. docs/architecture/ADR-001-deployment-container-strategy.md — Option A multi-container vs Option B (recommend A)

Include: React+Vite+TS, Fastify, left-side AppShell (SideNav), Coolify deployment.
```

**4B — Database:**

```text
Project: PRIME v2
Current phase: Phase 4
Act as: Database Agent

Read README.md §21 High-Level Data Model.

Create docs/database/PRIME-v2-ERD.md — entities, relationships, versioning tables, audit tables.
Create docs/database/DATA-DICTIONARY.md — key tables and columns.
```

**4C — Security and API draft:**

```text
Project: PRIME v2
Current phase: Phase 4
Act as: Security Agent + Architect Agent

Create docs/security/PRIME-v2-Security-Plan.md (auth, RBAC, uploads, secrets).
Create docs/api/API-CONTRACT-DRAFT.md — domain areas from README §22, no implementation yet.
```

**Done when:** Architect, Security, DevOps, and product owner approve. **After this gate, coding may begin (Phase 6+).**

---

## Phase 5 — UX and Prototype

| | |
|---|---|
| **Coding** | Prototype / wireframes only — not production backend |
| **Agents** | Frontend, Architect, QA |

**Cursor prompt:**

```text
Project: PRIME v2
Current phase: Phase 5 — UX and Prototype
Act as: Frontend Agent

Read docs/frontend/UI-DESIGN-STANDARDS.md and README.md §24 Phase 5 required screens.

Create docs/frontend/WIREFRAMES.md describing each screen:
- Right-side navigation (not top navbar) for all authenticated roles
- Mobile, tablet, desktop behavior
- Empty, loading, error states

Optional: scaffold frontend/ with Vite+React+TS placeholder pages ONLY if architecture approved — AppShell with SideNav (left side), no real API yet.

Do not connect to production database. Prototype only.
```

**Done when:** Users approve prototype; accessibility review done.

---

## Phase 6 — Foundation Implementation

| | |
|---|---|
| **Coding** | **Yes — start here for real app code** |
| **Agents** | Architect, Backend, DevOps, QA |

**Cursor prompt:**

```text
Project: PRIME v2
Current phase: Phase 6 — Foundation Implementation
Act as: Architect Agent + Backend Agent + DevOps Agent

Read docs/architecture/PRIME-v2-Architecture.md and UI-DESIGN-STANDARDS.md.

Scaffold monorepo or separate folders:
- frontend/ — React, Vite, TypeScript strict, AppShell + SideNav (left side)
- backend/ — Fastify, TypeScript, health endpoint
- docker-compose.yml — PostgreSQL, MinIO, app services
- .env.example — no real secrets

Include: migrations setup, logging, error handling, test runner, CI stub.
Run tests. Document setup in docs/deployment/LOCAL-DEVELOPMENT.md.

Consult Security Agent for env var naming. QA Agent: define foundation test cases first.
Complete QA-PUSH-GATE before git push.
```

---

## Phases 7–13 — Feature slices

For each phase, use this **generic vibe coding prompt** and replace the bracketed parts:

```text
Project: PRIME v2
Current phase: Phase [7|8|9|10|11|12|13] — [phase name from README §24]
Act as: [Backend / Frontend] Agent as lead

Read:
- README.md §24 Phase [N]
- docs/requirements/PRIME-v2-MVP.md
- docs/requirements/PRIME-v2-Roles-and-Permissions.md
- docs/workflows/PRIME-v2-Workflow.md
- docs/frontend/UI-DESIGN-STANDARDS.md (if UI)

User story: [paste from backlog]
Acceptance criteria: [paste]

Implement only this phase scope:
[Phase 7: auth | Phase 8: forms | Phase 9: versioning | Phase 10: focal workflow | Phase 11: RTEC | Phase 12: budget/accounting/RD | Phase 13: PDF]

Constraints:
- RBAC on every backend route
- Never overwrite submitted proposal versions
- Never expose private RTEC comments to applicants
- Right-side nav shell for all UI
- Responsive mobile/tablet/desktop

QA Agent: list and run tests before I push.
Security Agent: review auth/permission changes.
```

| Phase | Focus | Lead agent |
|---|---|---|
| 7 | Google login, staff login, roles, seed users | Backend + Security |
| 8 | Dynamic forms, drafts, autosave, attachments | Frontend + Backend |
| 9 | Submit, versions, comments | Backend + Frontend |
| 10 | Workflow engine, focal queue | Backend |
| 11 | RTEC member + head consolidation | Backend + Security |
| 12 | Budget, accounting, RD decisions | Backend |
| 13 | PDF export, reports | Backend + Frontend |

---

## Phases 14–20 — Hardening, deploy, sustain

| Phase | Cursor prompt summary |
|---|---|
| **14 Security** | Act as Security Agent — threat model review, fix findings, docs/security/SECURITY-TEST-REPORT.md |
| **15 QA** | Act as QA Agent — run full test plan README §26, docs/testing/TEST-EXECUTION-REPORT.md |
| **16 Staging** | Act as DevOps Agent — Coolify deploy, docs/deployment/STAGING-GUIDE.md, smoke tests |
| **17 UAT** | Act as QA + Product Manager — UAT script, collect findings, no scope creep |
| **18 Production readiness** | Act as Production Readiness Agent — checklist README §29 |
| **19 Production** | Act as DevOps Agent — tagged release, deployment record |
| **20 Hypercare** | Act as Product Manager — monitor, defect triage, enhancement backlog |

---

## Phase 21 — MVP Integration (current focus)

| | |
|---|---|
| **Coding** | Yes — all developers |
| **Goal** | Deploy-ready MVP, fillable forms, test accounts per role |
| **Detail** | [PHASE-21-MVP-COMPLETION.md](PHASE-21-MVP-COMPLETION.md) |

**Cursor prompt — Phase 21 slice:**

```text
Project: PRIME v2
Current phase: Phase 21 — MVP Integration
Act as: Frontend + Backend + DevOps + QA

Read:
- docs/agents/PHASE-21-MVP-COMPLETION.md
- docs/deployment/DEV-TEST-ACCOUNTS.md

Task: [one checklist item from Phase 21 — e.g. wire focal workflow buttons, seed sample proposal]

Constraints:
- Use @dev.local test accounts only in seed/docs
- Follow UI-DESIGN-STANDARDS.md (left nav)
- Run tests before push
```

---

## Daily Checklist for Developers

1. Check [PHASES-REFERENCE.md](PHASES-REFERENCE.md) — am I in the right phase?
2. Open Cursor Agent with **phase + agent name** in the prompt.
3. Let agents confirm scope/design/security/tests **before** code.
4. Implement small slice; run tests.
5. [QA-PUSH-GATE.md](QA-PUSH-GATE.md) → then `git push`.

---

## If Cursor Wants to Code Outside the Current Phase

Reply with:

```text
Stop. PRIME v2 is in Phase [N]. Confirm the task is in the current phase checklist
(PHASES-REFERENCE.md / PHASE-21-MVP-COMPLETION.md) before implementing.
```

---

## Quick Links

| Doc | Use |
|---|---|
| [PHASE-21-MVP-COMPLETION.md](PHASE-21-MVP-COMPLETION.md) | Integration, forms, deploy |
| [DEV-TEST-ACCOUNTS.md](../deployment/DEV-TEST-ACCOUNTS.md) | Login for every role |
| [PHASES-REFERENCE.md](PHASES-REFERENCE.md) | Phase validation and status |
| [AGENT-ROSTER.md](AGENT-ROSTER.md) | Which agent does what |
| [QA-PUSH-GATE.md](QA-PUSH-GATE.md) | Before every push |
| [UI-DESIGN-STANDARDS.md](../frontend/UI-DESIGN-STANDARDS.md) | Left nav + responsive UI |
