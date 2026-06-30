# Requirements Document

## Introduction

This specification governs the Phase 1 deliverable for PRIME v2: the Project Brief document
and its supporting artifacts. Phase 1 is a pure documentation phase. No source code is
produced. The output is a set of approved documents that the Business Owner must sign off
before Phase 2 (MVP, Roles, and User Stories) can begin.

The Project Brief captures the business problem, proposed solution, scope, stakeholders,
assumptions, constraints, risks, and objectives that will guide all subsequent phases of
the Project and Research Information Management Environment (PRIME v2).

## Glossary

- **PRIME v2**: Project and Research Information Management Environment, version 2 — the
  web-based proposal submission, review, versioning, routing, and approval system described
  in this brief.
- **Business Owner**: The designated approving authority for the Project Brief whose
  approval is the Phase 1 gate.
- **Project Owner**: The executive who confirmed project name, scope, and stakeholders at
  the Phase 0 gate.
- **Product Owner**: The authority who will approve the MVP specification at the Phase 2
  gate.
- **Project Brief**: The formal planning document that establishes the problem, solution
  direction, scope, assumptions, constraints, stakeholders, and risks at the start of the
  project.
- **RTEC**: Regional Technical Evaluation Committee — the multi-member review body that
  independently evaluates proposals and whose Head consolidates findings.
- **GIA**: Grants-in-Aid — a DOST funding program whose proposal forms are in scope for
  PRIME v2.
- **CEST**: Community Empowerment through Science and Technology — a DOST program whose
  proposal forms are in scope for PRIME v2.
- **SSCP**: Science for Socioeconomic Progress (or similar DOST program) — a program whose
  proposal forms are in scope for PRIME v2.
- **Project Focal**: The internal staff member who manages proposal routing, focal review,
  and endorsement actions for a given program.
- **Regional Director (RD)**: The executive who issues the final approval, deferral, or
  rejection of a proposal.
- **Source Forms**: The 27 original Word, Excel, and PDF files already inventoried in
  `docs/forms/FORM-INVENTORY.md` that PRIME v2 will convert into web forms.
- **MVP**: Minimum Viable Product — the smallest complete version of PRIME v2 that
  delivers the full proposal-to-approval workflow.
- **Stakeholder Matrix**: A structured table listing all stakeholders, their roles,
  interest levels, influence levels, and engagement strategy.
- **Risk Register**: A structured log of identified risks with impact, likelihood,
  mitigation strategy, and owner.
- **Business Process Map**: A side-by-side comparison of the current manual workflow and
  the proposed digital workflow.
- **Approval Gate**: A formal checkpoint at which a designated authority must approve the
  current phase deliverable before the next phase begins.

---

## Requirements

### Requirement 1: Project Brief Document

**User Story:** As the Business Owner, I want a complete Project Brief document so that
I can formally approve the direction of PRIME v2 before detailed requirements work begins.

#### Acceptance Criteria

1. THE Project_Brief SHALL contain a title page identifying the document name as
   "PRIME v2 Project Brief", the date in YYYY-MM-DD format, the version in MAJOR.MINOR
   format, and the approval status using exactly one of: Draft, Pending Approval,
   Approved, or Rejected.
2. THE Project_Brief SHALL contain an Introduction section that includes at minimum: the
   purpose of the document, its role as the Phase 1 gate deliverable, the intended
   audience, and the scope of the brief.
3. THE Project_Brief SHALL contain an Executive Summary of no more than 500 words that
   states the business problem, the proposed solution, and the expected benefit, using no
   undefined acronyms and no domain-specific technical terms that are not explained in the
   Glossary.
4. THE Project_Brief SHALL be stored at the path
   `docs/project-brief/PRIME-v2-Project-Brief.md` in the project repository.
5. WHEN the Business Owner provides written confirmation of approval, THE Project_Brief
   SHALL record the approver's name, role, approval date (YYYY-MM-DD), and approval
   status in a metadata block at the top of the document containing exactly those four
   fields.

---

### Requirement 2: Problem Statement

**User Story:** As the Business Owner, I want a clear and specific problem statement so
that I can confirm that PRIME v2 is solving the right organizational problem.

#### Acceptance Criteria

1. THE Problem_Statement SHALL identify the current manual process used to receive, route,
   review, and approve project and research proposals, describing each of the four stages
   (receive, route, review, approve) with at least one observable characteristic of how
   that stage is currently performed.
2. THE Problem_Statement SHALL enumerate at least the following specific pain points, each
   accompanied by at least one observable manifestation (a named frequency, scope, or
   consequence):
   - Multiple uncontrolled versions of the same proposal document
   - No reliable audit trail for proposal revisions and decisions
   - Comments and review notes scattered across email, printed notes, and separate files
   - Manual and error-prone consolidation of RTEC review findings
   - Budget calculation errors from manual spreadsheet handling
   - Delays in routing proposals between reviewers
   - Repetitive manual encoding of applicant and project data
   - Limited management visibility into proposal status
3. THE Problem_Statement SHALL accompany each pain point with at least one of: observed
   frequency, known scope, or a described consequence, where that information has been
   confirmed through documented stakeholder input.
4. IF documented stakeholder input confirming a pain point's frequency, scope, or
   consequence is not yet available, THEN THE Problem_Statement SHALL include an inline
   note adjacent to that pain point stating that the data is pending stakeholder interview
   confirmation.

---

### Requirement 3: Proposed Solution Description

**User Story:** As the Business Owner, I want a clear description of the proposed
solution so that I understand what PRIME v2 will replace and what it will provide.

#### Acceptance Criteria

1. THE Solution_Description SHALL describe PRIME v2 as a web-based proposal submission,
   review, versioning, routing, and approval system.
2. THE Solution_Description SHALL state that PRIME v2 will convert all 27 inventoried
   source forms into online web forms, where "convert" means all form fields are retained
   and the form is submittable entirely through a web browser without downloading or
   installing software.
3. THE Solution_Description SHALL describe the end-to-end processing chain including both
   the nominal forward path (Applicant → Project Focal → RTEC Members → RTEC Head →
   Project Focal → Budget Officer → Accountant → Regional Director) and the return or
   rejection paths at each stage where a reviewer may send the proposal back.
4. THE Solution_Description SHALL state the three proposal program types in scope: GIA,
   CEST, and SSCP.
5. THE Solution_Description SHALL state that PRIME v2 will preserve a complete audit
   history for every proposal, where "complete" means at minimum: every proposal
   submission, every review action, every version save, and every role assignment is
   recorded with the actor's identity, their role at the time of the action, and a
   timestamp.
6. THE Solution_Description SHALL state that audit history entries cannot be deleted or
   modified after creation and are readable by authorized roles.

---

### Requirement 4: Project Objectives

**User Story:** As the Business Owner, I want a numbered list of project objectives so
that I can evaluate whether the project outcome meets organizational goals.

#### Acceptance Criteria

1. THE Objectives_Section SHALL contain at least the following objectives, each stated
   as a testable outcome that names a capability, the actor it serves, and the condition
   under which it applies:
   - Convert existing proposal forms into online web forms accessible through a browser
     without requiring software installation.
   - Provide secure authentication for applicants using Google Sign-In and for internal
     staff using email and password, with the two paths kept strictly separate.
   - Enforce role-based access control so that each authenticated user can view and
     act on only the proposals and data their assigned role permits.
   - Route proposals automatically to the assigned Project Focal based on proposal type
     and active focal assignment configuration.
   - Create a new immutable version for every proposal submission so that no prior
     submitted version is overwritten or deleted.
   - Record every workflow action, status transition, comment, and decision in an audit
     log with actor identity, role, and timestamp.
   - Allow RTEC members to submit independent private reviews and allow only the RTEC
     Head to consolidate those reviews into one official recommendation.
   - Support Budget Officer review (add findings, return or endorse), Accountant review
     (add findings, return or endorse), and Regional Director final decision (approve,
     return, defer, or reject).
   - Generate official PDF outputs from structured proposal data using approved template
     layouts.
   - Provide System Administrators with tools to manage users, roles, proposal types,
     form versions, and workflow configuration.
2. WHEN an objective is added or changed at any point during the Phase 1 lifecycle, THE
   Objectives_Section SHALL be updated to reflect the change.
3. WHEN the Objectives_Section is updated after an objective is added or changed, THE
   Project_Brief version number SHALL be incremented by one minor version (e.g., 1.0
   to 1.1).

---

### Requirement 5: Scope Definition

**User Story:** As the Product Owner, I want a clearly bounded scope statement so that
the team and stakeholders share a common understanding of what PRIME v2 will and will not
deliver in the MVP.

#### Acceptance Criteria

1. THE Scope_Section SHALL contain an In-Scope subsection listing all capabilities
   committed for the MVP such that every item in README §6.1 appears in the subsection
   without omission or contradiction.
2. THE Scope_Section SHALL contain an Out-of-Scope subsection listing all items explicitly
   excluded from the MVP such that every item in README §6.2 appears in the subsection
   without omission or contradiction.
3. THE In_Scope_Subsection SHALL include exactly the following items (no item may be
   omitted): applicant Google login, staff email and password login, admin-created staff
   accounts, role-based access control, proposal type selection, dynamic web forms, all
   27 source form conversions, draft saving, autosave, proposal submission, field-level
   comments, section-level comments, general comments, proposal versioning, workflow
   routing, Project Focal review, RTEC member review, RTEC Head consolidation, Budget
   review, Accounting review, RD approval, email and in-app notifications, attachments
   stored in MinIO, audit logs, PDF export, admin dashboard, proposal status dashboard,
   development seed users, Coolify staging deployment, and backup and recovery procedures.
4. THE Out_of_Scope_Subsection SHALL include exactly the following items (no item may be
   omitted): digital signatures with legal certification, AI-generated proposal writing,
   AI scoring of proposals, automatic plagiarism detection, full grant disbursement,
   procurement management, project implementation monitoring, mobile native application,
   offline-first support, public proposal search portal, advanced analytics, SMS
   integration, external accounting system integration, and national government platform
   integration.
5. THE Scope_Section SHALL include a note stating that scope changes after Product Owner
   approval of this brief require a formal written change request approved by the Product
   Owner before any work on the change begins.

---

### Requirement 6: Business Process Map

**User Story:** As the Process Owner, I want a side-by-side business process map so that
I can confirm the proposed digital workflow correctly replaces the current manual process.

#### Acceptance Criteria

1. THE Business_Process_Map SHALL document the current manual process for each of the
   following stages: proposal creation, initial submission, Project Focal review, RTEC
   review, RTEC consolidation, post-RTEC routing, Budget review, Accounting review, and
   Regional Director decision.
2. THE Business_Process_Map SHALL document the proposed PRIME v2 digital process for each
   of those same stages, showing for each stage: (a) which manual steps are eliminated,
   (b) which manual steps are replaced by a system action, and (c) which steps remain
   manual and are only supported by the system.
3. THE Business_Process_Map SHALL identify for each stage, in both the current and
   proposed process: the actor, the inputs, the outputs, and the tools or system used.
4. WHEN a proposed process step removes, replaces, or significantly changes a current
   manual step — defined as a change to the actor, the tool used, or the trigger
   condition — THE Business_Process_Map SHALL include an annotation for that step
   explaining what changed, why it changed, and any open question requiring Process Owner
   confirmation.
5. THE Business_Process_Map SHALL be stored as a separate file at
   `docs/project-brief/PRIME-v2-Business-Process-Map.md` and referenced from the main
   Project Brief via a markdown hyperlink to that file path.

---

### Requirement 7: Assumptions

**User Story:** As the Business Owner, I want a documented list of assumptions so that I
can confirm or challenge them before detailed planning proceeds.

#### Acceptance Criteria

1. THE Assumptions_Section SHALL list each assumption with a unique identifier in the
   format ASM-NNN, a description of no more than 200 words, the owner responsible for
   confirming it, and a status field using exactly one of: Pending, Confirmed, or
   Invalidated.
2. THE Assumptions_Section SHALL include at a minimum the following assumptions:
   - All 27 source forms inventoried in `docs/forms/FORM-INVENTORY.md` are the current
     official versions and will not have fields added, removed, or renamed before Phase 3
     form specification work is complete.
   - The organization has an internet connection at all relevant office locations that
     allows users to load and submit web pages without requiring an offline mode.
   - Google Sign-In is an approved and available authentication method for applicant
     accounts under organizational IT policy.
   - An SMTP-compatible email service is available and configured for PRIME v2 to send
     notification emails.
   - Coolify is the approved deployment platform and will remain so through production
     launch.
   - All identified stakeholders will be available for scheduled interviews, reviews, and
     sign-offs within the timelines defined in the project schedule.
   - The technology stack direction stated in README §19 (React, Vite, TypeScript,
     Fastify, PostgreSQL, MinIO, Docker, Coolify) is acceptable subject to formal
     architecture review and approval in Phase 4.
3. WHEN a stakeholder interview, review session, or written communication confirms or
   invalidates an assumption, THE Assumptions_Section SHALL be updated to reflect the
   new status within 2 business days.
4. WHEN the Assumptions_Section is updated after a status change, THE Project_Brief
   version number SHALL be incremented.

---

### Requirement 8: Constraints

**User Story:** As the Business Owner, I want a documented list of constraints so that
the project team operates within known boundaries from the start.

#### Acceptance Criteria

1. THE Constraints_Section SHALL list each constraint with a unique identifier in the
   format CON-NNN, a description, and the constraint type using exactly one of:
   Technical, Organizational, Regulatory, or Budgetary.
2. THE Constraints_Section SHALL include at a minimum the following constraints:
   - No application source code may be written or committed until Phase 4 (Architecture
     and Data Design) is formally approved per README §2. (Organizational)
   - The system must run on Coolify as the designated deployment platform. (Technical)
   - Staff login must use email and password; Google Sign-In is reserved for applicants
     only and the two paths must not be interchangeable. (Security / Organizational)
   - No source form file in `docs/forms/` may be modified; they are read-only references.
     (Organizational)
   - The system must preserve all submitted proposal versions; no submitted version may
     be overwritten or deleted. (Regulatory / Audit)
   - Private RTEC member comments must not be visible to applicants or non-RTEC staff
     unless the Roles and Permissions document (Phase 2 deliverable) explicitly grants
     visibility. (Regulatory / Confidentiality)
   - All workflow actions must be recorded in an append-only audit log; existing entries
     must not be modifiable or deletable after creation. (Regulatory / Audit)
   - Secrets, credentials, API keys, and environment variables must not be committed to
     the Git repository at any time. (Security)
3. WHEN a new constraint is identified during any stakeholder review or interview, THE
   Constraints_Section SHALL be updated and the Project Brief version number SHALL be
   incremented by one minor version (e.g., 1.0 to 1.1).
4. WHEN the Constraints_Section is updated after a new constraint is added, THE
   Project_Brief revision history SHALL record the change summary, the author, and the
   date.

---

### Requirement 9: Stakeholder Matrix

**User Story:** As the Project Owner, I want a stakeholder matrix so that the project
team knows who to consult, who to keep informed, and who holds approval authority at each
gate.

#### Acceptance Criteria

1. THE Stakeholder_Matrix SHALL list every stakeholder with the following attributes:
   name (or `[TBC]` if not yet confirmed), organizational role, system role (using a role
   name from README §8 or "N/A" for non-system stakeholders), interest level (High,
   Medium, or Low), influence level (High, Medium, or Low), engagement strategy (using
   exactly one of: Manage Closely, Keep Satisfied, Keep Informed, or Monitor), and gate
   authority.
2. THE Stakeholder_Matrix SHALL include at a minimum the following stakeholders: Project
   Owner, Business Owner, Product Owner, Security Owner, Process Owner, System
   Administrator, Lead Developer, and a representative for each user role (Applicant,
   Project Focal, RTEC Member, RTEC Head, Budget Officer, Accountant, Regional Director).
3. THE Stakeholder_Matrix SHALL identify the approval authority holder for each of the
   following gates: Phase 0 (Project Owner), Phase 1 (Business Owner), Phase 2 (Product
   Owner, Security Owner, Process Owner), Phase 4 (Architect, Security Agent, DevOps
   Agent, Product Owner), Phase 17 (Product Owner), and Phase 19 (Business Owner and
   Product Owner).
4. WHERE a stakeholder's name is not yet confirmed, THE Stakeholder_Matrix SHALL use the
   placeholder `[TBC]` as an inline annotation in the name field of the same table row,
   with a note at the bottom of the table stating that all `[TBC]` entries require
   supervisor confirmation before the Phase 1 gate is closed.
5. THE Stakeholder_Matrix SHALL be maintained in `docs/project-brief/STAKEHOLDERS.md` and
   referenced from the main Project Brief via a markdown hyperlink to that file path.

---

### Requirement 10: Risk Register

**User Story:** As the Business Owner, I want an initial risk register so that known
risks are documented and mitigation plans are in place before Phase 2 begins.

#### Acceptance Criteria

1. THE Risk_Register SHALL record each risk with: a unique identifier, a description, the
   affected phase or deliverable, an impact rating (Critical, High, Medium, or Low), a
   likelihood rating (High, Medium, or Low), a risk score derived using the matrix where
   Critical×High=Critical, Critical×Medium=High, Critical×Low=High, High×High=High,
   High×Medium=High, High×Low=Medium, Medium×High=Medium, Medium×Medium=Medium,
   Medium×Low=Low, Low×any=Low, a mitigation strategy, a contingency plan, and a risk
   owner.
2. THE Risk_Register SHALL include at a minimum all risks listed in README §35, each
   updated with an impact rating, likelihood rating, risk score, mitigation strategy,
   contingency plan, and owner that reflect the Phase 1 planning context.
3. THE Risk_Register SHALL include the following additional risks not listed in README §35:
   - Stakeholder unavailability delaying Phase 1 interviews and sign-off.
   - Incomplete or conflicting business rules discovered during form analysis in Phase 3.
   - Technology stack change request after Phase 4 approval requiring re-scoping.
   - Data privacy or confidentiality requirements imposed by regulation that affect system
     design.
4. WHEN the Business Owner approves the Project Brief, THE Risk_Register SHALL record the
   approver's name, the approval date, and a statement that all listed risks are accepted
   subject to the mitigation strategies being executed.
5. THE Risk_Register SHALL be stored at `docs/project-brief/PRIME-v2-Risk-Register.md`
   and referenced from the main Project Brief via a markdown hyperlink to that file path.

---

### Requirement 11: Phase 1 Approval Gate

**User Story:** As the Project Team, I want a defined approval gate so that Phase 2 work
cannot begin until the Business Owner formally confirms the Project Brief is acceptable.

#### Acceptance Criteria

1. THE Project_Brief SHALL include an Approval section that lists the required approver
   (Business Owner), an approval date field (YYYY-MM-DD), and a written-confirmation
   field that captures the approver's name and an explicit statement of acceptance.
2. WHEN the Business Owner completes the Approval section with their name, an explicit
   statement of acceptance, and the approval date, THE Project_Brief status SHALL change
   from `DRAFT` to `APPROVED` and the approval date SHALL be recorded in the document
   header metadata.
3. WHILE the Project_Brief status is `DRAFT`, THE Project_Team SHALL NOT begin any Phase 2
   deliverable including the MVP specification, roles and permissions document, user
   stories, or any other artifact defined as a Phase 2 output.
4. IF the Business Owner requests changes before approval, THEN THE Project_Team SHALL
   update the Project Brief, increment the version number by one minor version (e.g.,
   1.0 to 1.1), record a change summary in the revision history, and resubmit for review.
5. THE Project_Brief SHALL record the full revision history in a table containing version
   number, change summary, author, and date for every revision made after the initial
   draft.
6. IF no approval decision is recorded within 5 business days of the Project Brief being
   submitted to the Business Owner, THEN THE Project_Team SHALL escalate to the Project
   Owner and record the escalation date and outcome in the revision history.
