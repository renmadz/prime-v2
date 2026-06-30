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

## Current Project Status (update as you progress)

**You are here: Phase 2 — MVP, Roles, and User Stories (documents complete, approvals pending)**

Phase 0 has been approved by the supervisor. Phase 1 is now in progress.

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
| Phase 1 approval gate | **Pending — Business Owner written sign-off required** |

| Phase 2 item | Status |
|---|---|
| MVP specification | ✅ Created — `docs/requirements/PRIME-v2-MVP.md` v1.0 DRAFT |
| Roles and permissions matrix | ✅ Created — `docs/requirements/PRIME-v2-Roles-and-Permissions.md` v1.0 DRAFT |
| Workflow statuses document | ✅ Created — `docs/workflows/PRIME-v2-Workflow.md` v1.0 DRAFT |
| User story backlog | ✅ Created — `docs/requirements/USER-STORY-BACKLOG.md` v1.0 DRAFT |
| Definition of Ready | ✅ Included in PRIME-v2-MVP.md §6 |
| Definition of Done | ✅ Included in PRIME-v2-MVP.md §7 |
| Product Owner approves MVP | ❌ Pending written sign-off |
| Security Owner approves permissions | ❌ Pending written sign-off |
| Process Owner approves workflow | ❌ Pending written sign-off |
| Phase 2 approval gate | ❌ Pending — all three approvals required |

**Next:** Obtain three approvals to close Phase 2. After Phase 2 gate, begin Phase 3 (Form Conversion Specifications).

## One Rule

> Do not vibe-code application features until **Phase 4** is approved (MVP, workflow, permissions, architecture). Phases 0–5 are documents, specs, and prototypes only.

For step-by-step Cursor prompts, see [INTERN-VIBE-CODING-GUIDE.md](INTERN-VIBE-CODING-GUIDE.md).
