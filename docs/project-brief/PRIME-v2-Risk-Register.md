# PRIME v2 — Risk Register

| Field | Value |
|---|---|
| **Document** | PRIME v2 Risk Register |
| **Version** | 0.1 — Draft |
| **Date** | 2025-07-01 |
| **Phase** | 1 — Business Analysis and Project Brief |
| **Status** | DRAFT — Pending Business Owner Acceptance |
| **Reference** | [PRIME-v2-Project-Brief.md](PRIME-v2-Project-Brief.md) §11 |

---

## Risk Scoring Guide

**Impact** (what happens if the risk materializes):
- **Critical** — project failure, data loss, regulatory violation, or security breach
- **High** — major scope, timeline, or quality impact
- **Medium** — moderate delay or rework required
- **Low** — minor inconvenience; easily remediated

**Likelihood** (probability of occurrence):
- **High** — likely to occur without active mitigation
- **Medium** — possible; depends on circumstances
- **Low** — unlikely but plausible

**Risk Score** (composite):
- Critical × High = **Critical**
- Critical × Medium = **High**
- Critical × Low = **High**
- High × High = **High**
- High × Medium = **High**
- High × Low = **Medium**
- Medium × High = **Medium**
- Medium × Medium = **Medium**
- Medium × Low = **Low**
- Low × any = **Low**

---

## Risk Register

### RISK-01 — Incorrect or Conflicting Role-Permission Rules

| Field | Detail |
|---|---|
| **ID** | RISK-01 |
| **Description** | Role-permission rules are unclear, incomplete, or disputed by stakeholders, causing security vulnerabilities or incorrect access control in the built system. |
| **Affected phase** | Phase 2, Phase 7, Phase 14 |
| **Impact** | Critical |
| **Likelihood** | Medium |
| **Risk Score** | **High** |
| **Mitigation** | Produce a formal role-permission matrix as a Phase 2 deliverable. Require written Security Owner approval before Phase 4 gate. Implement authorization tests for every endpoint. |
| **Contingency** | Halt implementation of affected modules until permissions are formally resolved. |
| **Owner** | Security Owner |

---

### RISK-02 — Workflow Ambiguity

| Field | Detail |
|---|---|
| **ID** | RISK-02 |
| **Description** | Routing rules, return paths, escalation steps, and edge cases in the approval workflow are unclear or disputed. Development proceeds on incorrect assumptions. |
| **Affected phase** | Phase 2, Phase 10, Phase 11, Phase 12 |
| **Impact** | High |
| **Likelihood** | High |
| **Risk Score** | **High** |
| **Mitigation** | Obtain signed workflow diagram from Process Owner at Phase 2 gate. Document every transition, return path, and edge case explicitly. |
| **Contingency** | Freeze affected workflow module. Escalate to Business Owner for resolution. |
| **Owner** | Process Owner |

---

### RISK-03 — Incomplete or Changed Source Forms After Phase 3

| Field | Detail |
|---|---|
| **ID** | RISK-03 |
| **Description** | Source forms are added, changed, or superseded by new versions after Phase 3 form specifications are written and approved, requiring rework. |
| **Affected phase** | Phase 3, Phase 8 |
| **Impact** | High |
| **Likelihood** | Medium |
| **Risk Score** | **High** |
| **Mitigation** | Confirm form freeze with Process Owner at Phase 1 gate. Version-control source form files. Treat any form change as a formal change request after Phase 3. |
| **Contingency** | Re-analyze affected form; update specification; re-obtain form-owner approval before re-implementation. |
| **Owner** | Process Owner |

---

### RISK-04 — Production Data Loss

| Field | Detail |
|---|---|
| **ID** | RISK-04 |
| **Description** | Database or file storage failure in production results in loss of proposal data, attachments, or audit logs. |
| **Affected phase** | Phase 16, Phase 18, Phase 19, Phase 20 |
| **Impact** | Critical |
| **Likelihood** | Low |
| **Risk Score** | **High** |
| **Mitigation** | Automated daily PostgreSQL and MinIO backups. Backup retention per approved policy. Restore test required before Phase 19 go-live. Documented RPO and RTO. |
| **Contingency** | Execute documented restore procedure. Notify Business Owner and affected users. Post-incident review required. |
| **Owner** | DevOps Agent / System Admin |

---

### RISK-05 — Single-Container Deployment Failure

| Field | Detail |
|---|---|
| **ID** | RISK-05 |
| **Description** | All services (application, database, file storage) are deployed in a single container, creating high blast radius for failures and difficult backup/restore. |
| **Affected phase** | Phase 4, Phase 16, Phase 19 |
| **Impact** | High |
| **Likelihood** | Medium |
| **Risk Score** | **High** |
| **Mitigation** | Adopt separate-services architecture (one Coolify project, multiple containers) per README §20. Formalize in ADR-001 at Phase 4. |
| **Contingency** | If single-container architecture is mandated, document risks and obtain written Business Owner acceptance. |
| **Owner** | Architect Agent / DevOps Agent |

---

### RISK-06 — Unauthorized Visibility of RTEC Private Comments

| Field | Detail |
|---|---|
| **ID** | RISK-06 |
| **Description** | A bug or misconfigured permission allows applicants or non-RTEC staff to see individual RTEC member comments before or after consolidation, violating confidentiality. |
| **Affected phase** | Phase 7, Phase 11, Phase 14 |
| **Impact** | High |
| **Likelihood** | Low |
| **Risk Score** | **Medium** |
| **Mitigation** | Explicit comment-visibility rules per README §13. Mandatory authorization tests for every RTEC endpoint at Phase 11 exit criteria. Security review at Phase 14. |
| **Contingency** | Immediately restrict access. Notify Business Owner and RTEC Head. Patch and re-test before restoring access. |
| **Owner** | Security Owner |

---

### RISK-07 — Scope Creep

| Field | Detail |
|---|---|
| **ID** | RISK-07 |
| **Description** | Stakeholders add new requirements after MVP scope is approved, causing timeline overruns, budget increases, or quality degradation. |
| **Affected phase** | All phases after Phase 1 |
| **Impact** | High |
| **Likelihood** | High |
| **Risk Score** | **High** |
| **Mitigation** | Enforce MVP scope boundary from Phase 1 approval. Require formal written change request approved by Product Owner for any scope addition after Phase 1. |
| **Contingency** | Defer change to post-MVP backlog. Log in change-request register with Product Owner decision. |
| **Owner** | Product Owner / Project Owner |

---

### RISK-08 — Stakeholder Unavailability

| Field | Detail |
|---|---|
| **ID** | RISK-08 |
| **Description** | Key stakeholders are unavailable for interviews, reviews, or approvals within planned timelines, delaying Phase 1 sign-off and downstream phases. |
| **Affected phase** | Phase 1, Phase 2 |
| **Impact** | Medium |
| **Likelihood** | Medium |
| **Risk Score** | **Medium** |
| **Mitigation** | Schedule interviews early. Identify a backup contact for each critical stakeholder. Define a decision escalation path to Project Owner if a stakeholder is unresponsive. |
| **Contingency** | Escalate to Project Owner. Allow a reasonable grace period; proceed with documented assumption if escalation fails within agreed timeframe. |
| **Owner** | Project Owner |

---

### RISK-09 — Source Form Version Change During Development

| Field | Detail |
|---|---|
| **ID** | RISK-09 |
| **Description** | An official regulatory or policy update changes one or more source forms after Phase 3 specifications are approved, requiring rework of the corresponding web form. |
| **Affected phase** | Phase 3, Phase 8 |
| **Impact** | Medium |
| **Likelihood** | Medium |
| **Risk Score** | **Medium** |
| **Mitigation** | Version-control all source forms at their committed state. Monitor for regulatory updates from DOST or relevant authorities. Treat form version changes as change requests. |
| **Contingency** | Update form specification; re-obtain form-owner approval; update implementation. |
| **Owner** | Process Owner |

---

### RISK-10 — Poor User Adoption

| Field | Detail |
|---|---|
| **ID** | RISK-10 |
| **Description** | Users (particularly Applicants, RTEC Members, or the Regional Director) are reluctant to use the new system and continue submitting by email or paper, reducing system value. |
| **Affected phase** | Phase 5, Phase 17, Phase 20 |
| **Impact** | High |
| **Likelihood** | Medium |
| **Risk Score** | **High** |
| **Mitigation** | Clickable prototype review with user representatives in Phase 5. UAT in Phase 17 with real users from each role. User training and documentation before go-live. |
| **Contingency** | Targeted training for resistant user groups. Identify and address specific usability barriers. |
| **Owner** | Product Owner / Business Owner |

---

### RISK-11 — Excel Formula Errors in Budget Conversion

| Field | Detail |
|---|---|
| **ID** | RISK-11 |
| **Description** | Budget calculation formulas from the source Excel forms are not correctly reproduced in the web form calculation engine, resulting in incorrect totals approved for funding. |
| **Affected phase** | Phase 3, Phase 8, Phase 15 |
| **Impact** | High |
| **Likelihood** | Medium |
| **Risk Score** | **High** |
| **Mitigation** | Document every formula in a formula catalog during Phase 3. Implement dedicated calculation tests comparing web form output to source Excel results. Budget Officer review in Phase 17 UAT. |
| **Contingency** | Halt affected budget form; correct formula; re-test; re-obtain form-owner approval. |
| **Owner** | Budget Officer / QA Agent |

---

### RISK-12 — Third-Party Dependency Vulnerability

| Field | Detail |
|---|---|
| **ID** | RISK-12 |
| **Description** | A third-party package used in the frontend or backend has a known vulnerability that allows unauthorized access, code execution, or data exposure. |
| **Affected phase** | Phase 6 onwards |
| **Impact** | High |
| **Likelihood** | Medium |
| **Risk Score** | **High** |
| **Mitigation** | Pin exact dependency versions. Architect and Security Agent review all dependencies before Phase 6 coding. Automated security scanning in CI pipeline. Dependency update process defined. |
| **Contingency** | Patch or replace vulnerable dependency. Re-run security tests. Notify Security Owner. |
| **Owner** | Security Owner / Architect Agent |

---

### RISK-13 — Conflicting Business Rules Discovered During Phase 3

| Field | Detail |
|---|---|
| **ID** | RISK-13 |
| **Description** | Form analysis in Phase 3 reveals that current practice differs from documented policy, or that stakeholders disagree on business rules, requiring policy decisions before specifications can be finalized. |
| **Affected phase** | Phase 3 |
| **Impact** | High |
| **Likelihood** | Medium |
| **Risk Score** | **High** |
| **Mitigation** | Conduct early stakeholder interviews in Phase 1. Require Process Owner sign-off on each form specification before implementation. Escalate conflicts to Business Owner promptly. |
| **Contingency** | Pause affected form specification. Escalate to Business Owner for policy decision. Document resolution in form specification. |
| **Owner** | Process Owner / Business Owner |

---

### RISK-14 — Technology Stack Change After Phase 4 Approval

| Field | Detail |
|---|---|
| **ID** | RISK-14 |
| **Description** | A stakeholder requests a change to the approved technology stack after Phase 4 architecture approval, requiring architectural rework. |
| **Affected phase** | Phase 4 and beyond |
| **Impact** | Medium |
| **Likelihood** | Low |
| **Risk Score** | **Low** |
| **Mitigation** | Treat stack change as a formal scope change requiring Product Owner approval. Document the decision and rationale in an ADR. |
| **Contingency** | Assess rework cost and timeline impact. Present to Product Owner and Business Owner for go/no-go decision. |
| **Owner** | Architect Agent / Product Owner |

---

### RISK-15 — Unidentified Data Privacy or Regulatory Requirements

| Field | Detail |
|---|---|
| **ID** | RISK-15 |
| **Description** | A data privacy law, DOST regulation, or government policy imposes requirements on the system (data retention, encryption, consent, breach notification) that have not yet been identified and may require design changes. |
| **Affected phase** | Phase 2, Phase 4, Phase 14 |
| **Impact** | High |
| **Likelihood** | Low |
| **Risk Score** | **Medium** |
| **Mitigation** | Security Owner to research applicable regulations (e.g., Data Privacy Act of 2012, DOST data management policies) before Phase 4 gate. Document compliance requirements in the security plan. |
| **Contingency** | Halt deployment if a critical compliance gap is found in Phase 14 or later. Remediate before staging or production release. |
| **Owner** | Security Owner |

---

## Approval Record

When the Business Owner approves the Project Brief, the following risks are considered
accepted (subject to mitigations being executed):

| Field | Value |
|---|---|
| **Approved by** | [TBC] |
| **Approval date** | [TBC] |
| **Accepted risks** | All risks listed above with mitigation strategies in place |
| **Notes** | [TBC] |

---

*End of PRIME v2 Risk Register — Version 0.1 Draft*
