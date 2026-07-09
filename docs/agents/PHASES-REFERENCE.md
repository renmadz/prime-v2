# PRIME v2 Phases Reference

Validation of [README.md §24](../../README.md) phases against the [ObraTech AI SDLC Framework §2](../../README.md) and project status.

## Verdict: Phases Are Correct

The **21 phases (0–20)** are logically ordered, match the ObraTech framework, and enforce approval gates before coding.

| Check | Result |
|---|---|
| Planning before code (Phases 0–4) | Correct — explicit "No coding allowed" through Phase 3; Phase 4 gate before Phase 6 |
| UX before full build (Phase 5) | Correct — wireframes/prototype after architecture |
| Incremental MVP build (Phases 6–13) | Correct — foundation → auth → forms → workflow → RTEC → financial → PDF |
| Hardening before deploy (Phases 14–18) | Correct — security → QA → staging → UAT → production readiness |
| Launch and sustain (Phases 19–20) | Correct — production deploy → hypercare |

## ObraTech SDLC → Phase Mapping

| ObraTech step (README §2) | PRIME phase(s) |
|---|---|
| 1. Understand business story | 0, 1 |
| 2. Approve Project Brief | 1 |
| 3. Define and approve MVP | 2 |
| 4. Roles and permissions | 2 |
| 5. User stories and acceptance criteria | 2 |
| 6. Documentation structure | 0 |
| 7. Assign AI agents | 0 (see [AGENTS.md](../../AGENTS.md)) |
| 8. Development phases | README §24 (this reference) |
| 9. Security, testing, deployment plans | 4, 14, 15, 16, 18 |
| 10. Approve architecture | 4 (gate) |
| 11. Begin implementation | 6–13 |
| 12. Test and validate | 15 |
| 13. Deploy to staging | 16 |
| 14. UAT | 17 |
| 15. Deploy to production | 19 |
| 16. Monitor and maintain | 20 |

## Phase Summary Table

| Phase | Name | Code allowed? | Primary agents |
|---|---|---|---|
| 0 | Project Initialization | No | Product Manager, Architect |
| 1 | Business Analysis / Project Brief | No | Product Manager |
| 2 | MVP, Roles, User Stories | No | Product Manager, Security |
| 3 | Form Conversion Specs | No (specs only) | Product Manager, Frontend, QA |
| 4 | Architecture and Data Design | No (design only) | Architect, Database, Security, DevOps |
| 5 | UX and Prototype | Mockups only | Frontend, Architect, QA |
| 6 | Foundation Implementation | **Yes** | Architect, Backend, DevOps, QA |
| 7 | Authentication and Users | Yes | Backend, Security, QA |
| 8 | Dynamic Forms and Drafts | Yes | Frontend, Backend, Database, QA |
| 9 | Submission, Versioning, Comments | Yes | Backend, Frontend, QA |
| 10 | Workflow and Focal Review | Yes | Backend, Frontend, QA |
| 11 | RTEC Review and Consolidation | Yes | Backend, Frontend, Security, QA |
| 12 | Budget, Accounting, RD | Yes | Backend, Frontend, QA |
| 13 | Document Generation / Reports | Yes | Backend, Frontend, QA |
| 14 | Security Hardening | Yes (fixes) | Security, QA |
| 15 | Quality Assurance | Test only | QA |
| 16 | Staging Deployment | Deploy | DevOps, QA |
| 17 | User Acceptance Testing | Fixes only | QA, Product Manager |
| 18 | Production Readiness | Checklist | Production Readiness, Security, DevOps |
| 19 | Production Deployment | Deploy | DevOps |
| 20 | Hypercare and Improvement | Yes | All agents as needed |
| 21 | MVP Integration, Fillable Forms, Deploy Readiness | **Yes** | Frontend, Backend, DevOps, QA |

## Current Project Status (update as you progress)

**You are here: Phase 10 — Complete Focal Workflow UI** (Phase 21B closed 2026-07-09 — see [TEST-MATRIX.md](TEST-MATRIX.md) § Phase 21B). **Phase 21A closed 2026-07-08** — 6/6 manual gate tests pass, automated suite green (127/127).

Implementation is open to **all developers**. Follow agent consultation ([AGENTS.md](../../AGENTS.md)), [DEVELOPER-EXECUTION-PLAN.md](DEVELOPER-EXECUTION-PLAN.md), [TEST-MATRIX.md](TEST-MATRIX.md), and [QA-PUSH-GATE.md](QA-PUSH-GATE.md).

| Phase 21 sub-phase | Focus | Status |
|---|---|---|
| **21A** | Seed sample proposals + assignments; admin assignment API/UI | ✅ **Closed 2026-07-08** |
| **21B** | Expand GIA/CEST/SSCP forms; TABLE/required validation | ✅ **Closed 2026-07-09** — automated gates 13/13 Pass; manual browser smoke deferred to developer walkthrough |

| Phase 21 item | Status |
|---|---|
| Dev test account per role (`seed.ts`) | ✅ Done |
| [DEV-TEST-ACCOUNTS.md](../deployment/DEV-TEST-ACCOUNTS.md) | ✅ Done |
| `@dev.local` applicant login in development | ✅ Done |
| Left nav + admin/queue/notification UI | ✅ Done |
| Fillable dynamic forms (3 seeded types) | ✅ Partial — expand to all 21 forms (21B) |
| Sample `SUBMITTED_TO_FOCAL` proposal + focal assignment seed | ✅ Done (21A) |
| Admin staff-assignment API + UI | ✅ Done (21A) — `assignments.ts` route, "Staff Assignments" panel on proposal detail |
| Focal workflow buttons on proposal detail (acknowledge/return/endorse) | ⏳ Pending — backend routes work, UI not wired (candidate for Phase 10) |
| Staging deploy smoke checklist | ⏳ Pending |
| Phase 21A approval gate | ✅ **Closed 2026-07-08** |
| Phase 21 (overall) approval gate | ⏳ Open — 21B in progress |

**Previous:** Phase 10 — Workflow and Focal Review (Phase 9 gate closed 2026-07-02)

> Note: Phases 4–8 status detail is not recorded in this table (tracking gap — see git history for those phases). This table was last kept current through Phase 3; the entries below for Phase 9 were added at the Phase 9→10 gate.

Phases 0, 1, and 2 approved by supervisor 2026-07-01 (B-01..B-04). Phase 3 form specs drafted for all 21 web forms; 6 PDFs are reference-only.

| Phase 0 item | Status |
|---|---|
| Repository / folder structure | Done |
| README and docs folders | Done |
| Form folders + 27 source files | Done |
| FORM-INVENTORY.md | Done |
| Agent workflow (AGENTS.md, hooks, rules) | Done |
| UI design standards | Done |
| Issue templates | Done (docs/templates/issue-template.md created 2026-06-30) |
| Decision-log template | Done (docs/templates/DECISION-LOG.md created 2026-06-30) |
| Change-request template | Done (docs/templates/CHANGE-REQUEST.md created 2026-06-30) |
| Stakeholder list | Draft (names TBC — pending supervisor confirmation) |
| Initial risk register | Draft (see docs/project-brief/PRIME-v2-Risk-Register.md) |
| Initial backlog | Done (docs/requirements/INITIAL-BACKLOG.md created 2026-06-30) |
| Phase 0 approval gate | **Approved (supervisor verbal confirmation)** |

| Phase 1 item | Status |
|---|---|
| Project Brief | Created and submitted — `docs/project-brief/PRIME-v2-Project-Brief.md` v0.1 — pending Business Owner approval |
| Business Process Map | Confirmed — `docs/project-brief/PRIME-v2-Business-Process-Map.md` v0.2 — all questions answered 2026-06-30 |
| Problem statement | Included in Project Brief §3 |
| Objectives | Included in Project Brief §5 |
| Scope (in/out) | Included in Project Brief §6 |
| Assumptions | Included in Project Brief §8 |
| Constraints | Included in Project Brief §9 |
| Stakeholder matrix | Included in Project Brief §10; detail in STAKEHOLDERS.md |
| Risk register | Draft — `docs/project-brief/PRIME-v2-Risk-Register.md` |
| Kiro spec (requirements.md) | Created — `.kiro/specs/phase-1-project-brief/requirements.md` |
| Phase 1 approval gate | **Approved 2026-07-01 (B-04, supervisor confirmed; approver name TBC)** |

| Phase 2 item | Status |
|---|---|
| MVP specification | ✅ Approved — `docs/requirements/PRIME-v2-MVP.md` v1.1 APPROVED |
| Roles and permissions matrix | ✅ Approved — `docs/requirements/PRIME-v2-Roles-and-Permissions.md` v1.1 APPROVED |
| Workflow statuses document | ✅ Approved — `docs/workflows/PRIME-v2-Workflow.md` v1.1 APPROVED |
| User story backlog | ✅ Created — `docs/requirements/USER-STORY-BACKLOG.md` v1.0 |
| Definition of Ready | ✅ Included in PRIME-v2-MVP.md §6 |
| Definition of Done | ✅ Included in PRIME-v2-MVP.md §7 |
| Product Owner approves MVP | ✅ Approved 2026-07-01 (B-01; C-01 email deferred, in-app only) |
| Security Owner approves permissions | ✅ Approved 2026-07-01 (B-02) |
| Process Owner approves workflow | ✅ Approved 2026-07-01 (B-03) |
| Phase 2 approval gate | ✅ **Closed 2026-07-01 — all three approvals recorded** |

| Phase 3 item | Status |
|---|---|
| Form spec template | ✅ Created — `docs/forms/converted-form-specs/FORM-SPEC-TEMPLATE.md` |
| Web-form specs (FORM-001–021) | ✅ All 21 drafted — `Specification Draft`; form-owner approval per A-01 |
| PDF reference annexes (FORM-022–027) | ✅ Reference-only, no spec required |
| Deferred (A-2/A-3/A-4) | Program mapping + attachments (Process Owner), Excel budget formulas (Budget Officer, final phase) — see DL-014 |
| Phase 3 approval gate | Specs ready for form-owner approval; approver names TBC pending prototype (DL-015) |

| Phase 9 item | Status |
|---|---|
| Submission, versioning, comments routes | ✅ Implemented (`submission.ts`, `versions.ts`, `comments.ts`) |
| Test teardown hygiene fix (auth.test.ts, users.test.ts) | ✅ Committed 39193e6 — `TEST_EMAILS` + FK-ordered `cleanupUsers()` pattern |
| Full backend suite | ✅ 65/65 passing, two consecutive `--no-file-parallelism` runs (verified 2026-07-02) |
| Vitest parallel-mode DB collision (formTemplates/proposals/submission) | Known issue, ticketed as RISK-16 in `docs/project-brief/PRIME-v2-Risk-Register.md`; interim mitigation is sequential test execution (`package.json` `test`/`test:local` scripts); real fix deferred to Phase 15 |
| Phase 9 approval gate | ✅ **Closed 2026-07-02** |

**Next:** Phase 10 — Workflow and Focal Review. New test files from Phase 10 onward must use the `TEST_EMAILS` + FK-ordered cleanup pattern from the start.

## One Rule

> Phases 0–4 planning gates are **closed**. Phase 21A is **closed** (2026-07-08). Active work: **Phase 21B**, then Phases 10–13, then harden and deploy (14–20). All developers may implement when following [AGENTS.md](../../AGENTS.md) and the current phase checklist.

**Start here after git pull:** [../../DEVELOPERS.md](../../DEVELOPERS.md) → [DEVELOPER-EXECUTION-PLAN.md](DEVELOPER-EXECUTION-PLAN.md) → [TEST-MATRIX.md](TEST-MATRIX.md).

For step-by-step Cursor prompts, see [INTERN-VIBE-CODING-GUIDE.md](INTERN-VIBE-CODING-GUIDE.md) (all developers). Phase 21 detail: [PHASE-21-MVP-COMPLETION.md](PHASE-21-MVP-COMPLETION.md).
