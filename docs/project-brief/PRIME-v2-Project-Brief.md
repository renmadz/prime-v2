# PRIME v2 — Project Brief

| Field | Value |
|---|---|
| **Document** | PRIME v2 Project Brief |
| **Version** | 0.1 — Draft |
| **Date** | 2025-07-01 |
| **Phase** | 1 — Business Analysis and Project Brief |
| **Status** | DRAFT — Pending Business Owner Approval |
| **Prepared by** | Product Manager Agent |
| **Approval authority** | Business Owner (see §12 — Approval Gate) |

---

## Revision History

| Version | Date | Author | Summary of Changes |
|---|---|---|---|
| 0.1 | 2025-07-01 | Product Manager Agent | Initial draft based on Phase 0 context |

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Executive Summary](#2-executive-summary)
3. [Problem Statement](#3-problem-statement)
4. [Proposed Solution](#4-proposed-solution)
5. [Project Objectives](#5-project-objectives)
6. [Scope](#6-scope)
7. [Business Process Map](#7-business-process-map)
8. [Assumptions](#8-assumptions)
9. [Constraints](#9-constraints)
10. [Stakeholder Matrix](#10-stakeholder-matrix)
11. [Risk Register](#11-risk-register)
12. [Approval Gate](#12-approval-gate)

---

## 1. Introduction

This Project Brief is the Phase 1 deliverable for the **Project and Research Information
Management Environment, version 2 (PRIME v2)**.

It documents the business problem, the proposed digital solution, the project objectives,
the MVP scope, assumptions, constraints, stakeholders, and known risks. It serves as the
formal basis for all subsequent planning phases.

Business Owner approval of this brief is the **Phase 1 gate**. Phase 2 work — MVP
definition, roles, user stories, and acceptance criteria — must not begin until this
document is approved.

---

## 2. Executive Summary

The organization manages project and research proposals using a manual, document-driven
process built on Microsoft Word, Excel, PDF files, email, and printed forms. This process
produces version confusion, scattered review comments, no reliable audit trail, delays in
routing, and limited management visibility.

PRIME v2 will replace this process with a secure, web-based proposal management system.
Applicants will submit proposals online using converted web forms. The system will
automatically route each submission through a defined approval chain: Project Focal →
RTEC Members → RTEC Head → Project Focal → Budget Officer → Accountant → Regional
Director. Every version, comment, and decision will be recorded in a tamper-evident audit
history.

The expected outcomes are faster processing times, elimination of version confusion, a
complete and searchable audit trail, and clear management visibility into proposal status
at any point in the workflow.

The system covers three proposal program types: **GIA (Grants-in-Aid)**, **CEST**, and
**SSCP**. It will convert all 27 inventoried source forms into online web forms. No
existing source form files will be modified.

---

## 3. Problem Statement

### 3.1 Current Process

The organization currently receives, routes, reviews, and approves project and research
proposals using:

- Microsoft Word forms (13 documents)
- Microsoft Excel forms (8 documents)
- PDF reference documents (6 files)

Applicants download form files, complete them manually, and submit by email or printed
copy. Reviewers add comments through reply emails, separate Word files, printed
annotations, or verbal instructions in meetings. The approved workflow passes through up
to eight distinct roles before a final decision is issued.

### 3.2 Identified Pain Points

| ID | Pain Point | Observed Impact |
|---|---|---|
| PP-01 | Multiple uncontrolled versions of the same proposal document | Reviewers work on different versions; final version is unclear |
| PP-02 | No reliable audit trail for revisions and decisions | Cannot determine who changed what, when, or why |
| PP-03 | Review comments scattered across email, printed notes, and separate files | Comments are lost, misattributed, or missed during consolidation |
| PP-04 | Manual and error-prone consolidation of RTEC review findings | RTEC Head consolidates by hand from multiple email threads or printouts |
| PP-05 | Budget calculation errors from manual spreadsheet handling | Incorrect totals go undetected until late in the process |
| PP-06 | Delays in routing proposals between reviewers | No automated handoff; proposals wait for manual email forwarding |
| PP-07 | Repetitive manual encoding of applicant and project data | Same data re-entered at multiple stages and in multiple forms |
| PP-08 | Limited management visibility into proposal status | No dashboard; status must be confirmed by asking individuals |
| PP-09 | Risk of unauthorized access to confidential proposal data | Files shared via email without access control |
| PP-10 | Difficulty searching historical proposals | No structured repository; files are stored in personal or shared drives |

> **Note:** Quantitative frequency and impact data for each pain point are pending
> confirmation through stakeholder interviews. Items will be updated as interview findings
> are collected.

---

## 4. Proposed Solution

PRIME v2 is a **web-based proposal submission, review, versioning, routing, and approval
system** that replaces the current manual document-driven process.

### 4.1 Core Capabilities

- **Online form submission.** The 27 inventoried source forms (Word, Excel, PDF) will be
  converted into structured web forms accessible through a browser.
- **Controlled workflow routing.** Each submitted proposal is automatically routed
  through the approval chain based on proposal type and assigned Project Focal
  configuration.
- **Proposal versioning.** Every submission creates a new immutable version. Prior
  versions are never overwritten.
- **Structured commenting.** Reviewers add field-level, section-level, and general
  comments with defined visibility rules. RTEC member comments remain private until
  consolidated.
- **RTEC consolidation.** RTEC members review independently. The RTEC Head is the only
  actor who can finalize the consolidated committee recommendation.
- **Budget and Accounting review stages.** Budget Officer and Accountant roles review
  financial compliance before the proposal reaches the Regional Director.
- **Audit history.** Every workflow action, comment, status change, and decision is
  recorded with actor, role, date, and context. This history cannot be altered after
  the fact.
- **PDF export.** Approved proposals can be exported to official PDF layouts generated
  from structured data.
- **Role-based access control.** Each user sees and acts on only what their assigned role
  permits.

### 4.2 End-to-End Approval Chain

```
Applicant
   ↓ submits proposal
Project Focal
   ↓ reviews completeness; may return to Applicant or endorse to RTEC
RTEC Members (independent, parallel)
   ↓ submit individual reviews
RTEC Head
   ↓ consolidates reviews; issues official RTEC recommendation to Project Focal
Project Focal
   ↓ may return to Applicant for revision or endorse to Budget
Budget Officer
   ↓ reviews line-item budget; may return or endorse to Accountant
Accountant
   ↓ reviews accounting classifications; may return or endorse to Regional Director
Regional Director
   ↓ approves / returns / defers / rejects
```

### 4.3 Proposal Program Types in Scope

- **GIA** — Grants-in-Aid
- **CEST** — Community Empowerment through Science and Technology
- **SSCP** — Science for Socioeconomic Progress (or applicable DOST program)

### 4.4 Technology Direction

The technology stack direction is stated below. Final approval of the stack is the subject
of the Phase 4 Architecture gate; no stack element is committed to implementation until
that gate is passed.

| Layer | Direction |
|---|---|
| Frontend | React, Vite, TypeScript |
| Backend | Fastify, TypeScript |
| Database | PostgreSQL |
| File storage | MinIO |
| Deployment | Docker, Coolify |

---

## 5. Project Objectives

PRIME v2 must achieve the following objectives. Each objective is stated as a verifiable
outcome.

| ID | Objective |
|---|---|
| OBJ-01 | Convert all 27 inventoried source proposal forms into online web forms accessible through a browser without installing software. |
| OBJ-02 | Provide secure applicant authentication using Google Sign-In and secure internal staff authentication using email and password. |
| OBJ-03 | Enforce role-based access control so that each authenticated user can view and act on only the proposals and data their role permits. |
| OBJ-04 | Route each submitted proposal automatically to the correct Project Focal based on proposal type and active focal assignment configuration. |
| OBJ-05 | Create a new immutable version for every proposal submission so that no prior submitted version is ever overwritten or lost. |
| OBJ-06 | Record every workflow action, status transition, comment, endorsement, and decision in an audit log that cannot be altered after the fact. |
| OBJ-07 | Allow RTEC members to submit independent private reviews and allow only the RTEC Head to consolidate those reviews into one official recommendation. |
| OBJ-08 | Support Budget Officer and Accountant review stages with structured findings and endorsement actions before the Regional Director receives the proposal. |
| OBJ-09 | Allow the Regional Director to approve, return, defer, or reject a proposal and notify the Applicant of the final decision. |
| OBJ-10 | Generate official PDF outputs from structured proposal data using approved template layouts. |
| OBJ-11 | Provide administrators with tools to manage users, roles, forms, workflow configuration, and controlled reference lists. |
| OBJ-12 | Provide a proposal status dashboard giving authorized users visibility into where each proposal is in the workflow at any time. |
| OBJ-13 | Support secure deployment on Coolify with automated backups, health monitoring, and documented recovery procedures. |

> When a new objective is identified during stakeholder interviews, this table will be
> updated and the document version will be incremented.

---

## 6. Scope

### 6.1 In Scope for the MVP

The following capabilities are committed for the initial MVP release.

**Authentication and Access**
- Applicant Google Sign-In
- Staff email and password login
- Admin-created staff accounts with role assignment
- Role-based access control
- Session management and expiration
- Password reset

**Proposal Submission**
- Proposal type selection
- Dynamic web form rendering from form specifications
- Conversion of all 27 inventoried source forms into web forms
- Draft saving and autosave
- Attachment upload (stored in MinIO)
- Proposal submission

**Review and Workflow**
- Field-level, section-level, and general comments with defined visibility
- Proposal versioning (every submission creates a new immutable version)
- Automatic routing to assigned Project Focal
- Project Focal review, return, and RTEC endorsement
- RTEC member independent review (draft and final submission)
- RTEC Head consolidation and official recommendation
- Post-RTEC Project Focal routing to Budget or back to Applicant
- Budget Officer review, findings, and Accounting endorsement
- Accountant review, findings, and RD endorsement
- Regional Director final decision (approve / return / defer / reject)

**Notifications and Visibility**
- Email and in-app notifications for workflow events
- Proposal status dashboard for authorized users
- Audit log accessible to authorized roles

**Document Output**
- PDF export of approved proposals

**Administration**
- Admin dashboard for user, role, form, and workflow management
- System settings and controlled reference list management

**Development and Deployment**
- Development seed users for all roles
- Coolify staging deployment
- Backup and recovery procedures

### 6.2 Out of Scope for the MVP

The following items are explicitly excluded from the MVP. They may be considered for
future phases.

| Item | Rationale |
|---|---|
| Digital signatures with legal certification | Requires legal and regulatory review beyond MVP timeline |
| AI-generated proposal writing | Future enhancement |
| AI scoring of proposals | Future enhancement |
| Automatic plagiarism detection | Future enhancement |
| Full grant disbursement management | Separate system concern |
| Procurement management | Out of PRIME v2 domain |
| Project implementation monitoring (post-approval) | Future phase |
| Mobile native application | Web-responsive design is in scope; native app is not |
| Offline-first support | Future enhancement |
| Public proposal search portal | Future enhancement |
| Advanced analytics and reporting | Basic status dashboard is in scope; advanced analytics are not |
| SMS integration | Future enhancement |
| External accounting system integration | Future phase |
| National government platform integration | Future phase |

> Scope changes after Business Owner approval of this brief require a formal change
> request reviewed by the Product Owner.

---

## 7. Business Process Map

The detailed business process map is maintained in a separate file to keep this brief
readable.

**Reference:** [`docs/project-brief/PRIME-v2-Business-Process-Map.md`](PRIME-v2-Business-Process-Map.md)

### 7.1 Summary: Current vs. Proposed

| Stage | Current (Manual) | Proposed (PRIME v2) |
|---|---|---|
| Proposal creation | Applicant downloads Word/Excel files, fills manually | Applicant fills web form in browser; drafts auto-saved |
| Submission | Applicant emails files or delivers printed copies | Applicant clicks Submit; system locks version and routes automatically |
| Project Focal review | Focal receives email with attachments; comments by reply or separate file | Focal opens proposal in system; adds structured comments; clicks Return or Endorse |
| RTEC review | Proposals emailed to each member; members reply separately; Head collates by hand | Members log in and submit independent reviews; Head consolidates in system |
| RTEC consolidation | Head compiles email threads or printouts into a single document | Head drafts consolidation in system; submits official recommendation; system routes to Focal |
| Post-RTEC routing | Focal decides next step by email | Focal selects Return to Applicant or Endorse to Budget in system |
| Budget review | Budget Officer reviews emailed spreadsheets | Budget Officer reviews structured budget fields in system; adds findings; endorses |
| Accounting review | Accountant reviews emailed spreadsheets | Accountant reviews structured data; adds findings; endorses to RD |
| RD decision | RD receives email summary; issues decision by email or memo | RD reviews full proposal and official comments in system; selects Approve/Return/Defer/Reject |
| Status tracking | Must ask reviewer directly | Proposal status dashboard visible to authorized users in real time |
| Audit trail | Fragmented across email threads, printed notes, and file versions | Complete, timestamped, actor-attributed audit log in the system |

---

## 8. Assumptions

The following assumptions are made as of this draft. Each must be confirmed or challenged
by the Business Owner or relevant stakeholder before Phase 2 begins.

| ID | Assumption | Owner | Status |
|---|---|---|---|
| ASM-01 | All 27 source forms in `docs/forms/FORM-INVENTORY.md` are the current official versions and will not change materially before Phase 3 form specification work is complete. | Process Owner | Pending confirmation |
| ASM-02 | The organization has a reliable internet connection suitable for a browser-based web application at all relevant office locations. | Business Owner | Pending confirmation |
| ASM-03 | Google Sign-In is an approved and available authentication method for applicant accounts under organizational IT policy. | Security Owner | Pending confirmation |
| ASM-04 | An SMTP-compatible email service is available for PRIME v2 to send notification emails. | System Admin | Pending confirmation |
| ASM-05 | Coolify is the approved and available deployment platform and will remain so through production launch. | DevOps / Business Owner | Pending confirmation |
| ASM-06 | All identified stakeholders will be available for interviews, reviews, and sign-offs within the timelines defined in the project schedule. | Project Owner | Pending confirmation |
| ASM-07 | The technology stack direction stated in README §19 (React, Vite, TypeScript, Fastify, PostgreSQL, MinIO, Docker, Coolify) is acceptable subject to formal architecture review and approval in Phase 4. | Architect / Business Owner | Pending Phase 4 gate |
| ASM-08 | The RTEC confidentiality rule — that individual member comments are private and visible only to the RTEC Head until consolidation — reflects current official policy. | Process Owner / RTEC Head | Pending confirmation |
| ASM-09 | The Regional Director is the sole final approving authority for proposals in the MVP workflow. No co-approval or committee approval is required at the RD stage. | Business Owner / RD | Pending confirmation |
| ASM-10 | No data migration from existing email threads, printed records, or shared drives is required for the MVP. PRIME v2 will start with new submissions only. | Business Owner | Pending confirmation |

---

## 9. Constraints

The following constraints apply to all phases of PRIME v2. They are non-negotiable unless
formally changed through the change-request process.

| ID | Constraint | Type |
|---|---|---|
| CON-01 | No application source code may be written or committed until Phase 4 (Architecture and Data Design) is formally approved per README §2. | Organizational |
| CON-02 | The system must run on Coolify as the designated deployment platform. | Technical |
| CON-03 | Applicant authentication must use Google Sign-In only. Staff authentication must use email and password only. The two login paths must not be interchangeable. | Security |
| CON-04 | No source form file in `docs/forms/` may be modified. These files are read-only references. | Organizational |
| CON-05 | Every submitted proposal version must be preserved. No submitted version may be overwritten or deleted. | Regulatory / Audit |
| CON-06 | Private RTEC member comments must not be visible to applicants or non-RTEC staff unless organizational policy explicitly and formally permits it. | Confidentiality |
| CON-07 | All workflow actions must be recorded in an audit log. Audit log entries must not be editable or deletable after creation. | Regulatory / Audit |
| CON-08 | Secrets, credentials, API keys, and environment variables must not be committed to the Git repository at any time. | Security |
| CON-09 | No staff user may self-assign a role. Role assignment is performed exclusively by the System Administrator. | Security |
| CON-10 | Scope changes after Phase 1 Business Owner approval require a formal written change request approved by the Product Owner before any work on the change begins. | Organizational |

---

## 10. Stakeholder Matrix

The detailed stakeholder list with names pending supervisor confirmation is maintained in:

**Reference:** [`docs/project-brief/STAKEHOLDERS.md`](STAKEHOLDERS.md)

### 10.1 Summary Matrix

| Stakeholder Role | System Role | Interest | Influence | Gate Authority |
|---|---|---|---|---|
| Project Owner | N/A (executive) | High | High | Phase 0 approval gate |
| Business Owner | N/A (executive) | High | High | Phase 1 approval gate (this brief) |
| Product Owner | N/A (executive) | High | High | Phase 2 MVP gate |
| Security Owner | N/A (security lead) | High | High | Phase 2 permissions gate; Phase 14 security gate |
| Process Owner | N/A (operations lead) | High | Medium | Phase 2 workflow gate |
| System Administrator | Admin | Medium | Medium | Ongoing user and system management |
| Lead Developer | N/A (dev lead) | High | Medium | Technical implementation |
| Applicant representative | Applicant | Medium | Low | Phase 17 UAT input |
| Project Focal representative | Project Focal | High | Medium | Phase 17 UAT input |
| RTEC Member representative | RTEC Member | High | Medium | Phase 17 UAT input |
| RTEC Head representative | RTEC Head | High | Medium | Phase 17 UAT input |
| Budget Officer representative | Budget Officer | High | Medium | Phase 17 UAT input |
| Accountant representative | Accountant | High | Medium | Phase 17 UAT input |
| Regional Director representative | Regional Director | High | High | Phase 17 UAT input; Phase 19 go-live |

> All name fields are `[TBC]`. Names will be confirmed by the supervisor before the
> Phase 1 approval gate. See `docs/project-brief/STAKEHOLDERS.md` for the full table.

---

## 11. Risk Register

The detailed risk register is maintained in a separate file:

**Reference:** [`docs/project-brief/PRIME-v2-Risk-Register.md`](PRIME-v2-Risk-Register.md)

### 11.1 Summary — Top Risks

| ID | Risk | Impact | Likelihood | Score | Mitigation |
|---|---|---|---|---|---|
| RISK-01 | Incorrect or conflicting role-permission rules discovered late in development | Critical | Medium | High | Produce and approve role-permission matrix before Phase 2 gate |
| RISK-02 | Workflow ambiguity — routing and return rules are unclear or disputed | High | High | High | Obtain signed workflow approval from Process Owner at Phase 2 gate |
| RISK-03 | Incomplete form inventory — source forms added or changed after Phase 3 | High | Medium | High | Freeze source forms; version-control any changes; require change request |
| RISK-04 | Data loss — production database or file storage failure | Critical | Low | High | Automated daily backups; tested restore procedure before go-live |
| RISK-05 | Single-container deployment failure (all services in one container) | High | Medium | High | Use separate services per README §20; formalize in ADR-001 |
| RISK-06 | Unauthorized visibility of RTEC private comments | High | Low | Medium | Comment visibility rules; authorization tests at every RTEC endpoint |
| RISK-07 | Scope creep — new requirements added without formal change request | High | High | High | Enforce MVP scope; require written change request after Phase 1 approval |
| RISK-08 | Stakeholder unavailability delaying Phase 1 interviews and sign-off | Medium | Medium | Medium | Schedule interviews early; identify backups for each stakeholder |
| RISK-09 | Source forms change materially during development | Medium | Medium | Medium | Confirm form freeze with Process Owner at Phase 1 gate |
| RISK-10 | Poor user adoption due to unfamiliar digital interface | High | Medium | High | Clickable prototype review in Phase 5; UAT in Phase 17; user training |
| RISK-11 | Excel formula errors not caught during form conversion | High | Medium | High | Formula catalog in Phase 3; calculation tests in Phase 8 exit criteria |
| RISK-12 | Dependency vulnerability introduced through third-party packages | High | Medium | High | Security scanning; pinned dependency versions; Architect review |
| RISK-13 | Incomplete or conflicting business rules discovered during Phase 3 form analysis | High | Medium | High | Early stakeholder interviews; Process Owner sign-off on each form spec |
| RISK-14 | Technology stack change request after Phase 4 approval | Medium | Low | Low | Treat stack change as a formal scope change; require Product Owner approval |
| RISK-15 | Data privacy or confidentiality regulation imposes requirements not yet identified | High | Low | Medium | Security Owner to confirm regulatory requirements before Phase 4 gate |

---

## 12. Approval Gate

This section constitutes the formal Phase 1 approval record.

| Field | Value |
|---|---|
| **Required approver** | Business Owner |
| **Approval type** | Written confirmation or signed record |
| **Approval status** | PENDING |
| **Approved by** | [TBC] |
| **Approval date** | [TBC] |
| **Notes** | [TBC] |

### Approval Conditions

Before approving this brief, the Business Owner should confirm:

1. The problem statement accurately describes the organizational pain points.
2. The proposed solution direction is acceptable.
3. The project objectives are aligned with organizational goals.
4. The MVP scope boundary is appropriate for the initial release.
5. The assumptions are either confirmed or flagged for follow-up.
6. The constraints are accepted.
7. The stakeholder matrix identifies the correct people and gate authorities.
8. The initial risk register captures the most significant known risks.

### Effect of Approval

When this brief is approved:

- The document status changes from `DRAFT` to `APPROVED`.
- Phase 2 (MVP, Roles, and User Stories) work may begin.
- Any subsequent scope change requires a formal written change request approved by the
  Product Owner.

---

*End of PRIME v2 Project Brief — Version 0.1 Draft*
