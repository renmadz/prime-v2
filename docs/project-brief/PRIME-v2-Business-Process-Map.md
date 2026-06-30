# PRIME v2 — Business Process Map

| Field | Value |
|---|---|
| **Document** | PRIME v2 Business Process Map |
| **Version** | 0.2 — Confirmed |
| **Date** | 2026-06-30 |
| **Phase** | 1 — Business Analysis and Project Brief |
| **Status** | CONFIRMED — All open questions answered by supervisor 2026-06-30 |
| **Reference** | [PRIME-v2-Project-Brief.md](PRIME-v2-Project-Brief.md) §7 |

> **Note:** All previously open ⚠️ questions have been confirmed by the supervisor on 2026-06-30.
> This document is ready for Business Owner review as part of the Phase 1 approval gate.

---

## How to Read This Document

Each section describes one stage of the proposal lifecycle. For each stage the table
shows:

- **Actor** — who performs the action
- **Inputs** — what they receive or start with
- **Current step (Manual)** — what happens today
- **Tool used (Current)** — physical or digital tool
- **Proposed step (PRIME v2)** — what will happen in the new system
- **Change annotation** — what is different and why

---

## Stage 1 — Proposal Creation

| Attribute | Detail |
|---|---|
| **Actor** | Applicant |
| **Inputs** | Blank Word, Excel, or PDF form files downloaded from a shared location |
| **Current step (Manual)** | Applicant downloads the correct form template for their proposal type. Applicant fills the form manually in Microsoft Word or Excel. Applicant saves the file locally and may revise it multiple times before submission. |
| **Tool used (Current)** | Microsoft Word, Microsoft Excel, local file system, shared drive or email |
| **Proposed step (PRIME v2)** | Applicant logs in using Google Sign-In. Applicant selects the proposal type. The system loads the correct web form version. Applicant fills fields in the browser. The system autosaves drafts automatically. Applicant may return and continue the draft at any time before submission. |
| **Change annotation** | The draft is saved in the system database rather than as a local file. ✅ Confirmed: browser-based editing is acceptable to applicants (supervisor, 2026-06-30). Autosave interval to be confirmed in Phase 8. |

---

## Stage 2 — Proposal Submission

| Attribute | Detail |
|---|---|
| **Actor** | Applicant |
| **Inputs** | Completed draft proposal and all required attachments |
| **Current step (Manual)** | Applicant emails the completed Word and Excel files, plus any attachments, to the Project Focal or a general inbox. Applicant may also deliver printed copies. No formal receipt confirmation exists. |
| **Tool used (Current)** | Email (Outlook, Gmail, or similar), printer, physical delivery |
| **Proposed step (PRIME v2)** | Applicant clicks Submit. The system validates all required fields and attachments. On successful submission the system locks the version, assigns a proposal ID, records the submission timestamp, creates Version 1, and routes the proposal to the assigned Project Focal. The Applicant and Focal both receive a notification. |
| **Change annotation** | The system creates an immutable version on every submission. The Applicant can no longer edit the submitted version. Any future revision creates a new version number. ✅ Confirmed: required attachment list per proposal type is confirmed by Process Owner (supervisor, 2026-06-30). |

---

## Stage 3 — Project Focal Review

| Attribute | Detail |
|---|---|
| **Actor** | Project Focal |
| **Inputs** | Submitted proposal files received by email |
| **Current step (Manual)** | Focal opens the emailed files. Focal reviews for completeness and technical quality. Focal adds comments by replying to the email, writing a separate memo, annotating a printed copy, or editing a copy of the Word file. Focal decides to return to Applicant or forward to RTEC. Focal sends the next email. |
| **Tool used (Current)** | Email, Microsoft Word (for annotations), printer |
| **Proposed step (PRIME v2)** | Focal logs in and opens the proposal in the system queue. Focal adds structured comments at the field, section, or general level. Comments are tagged as Applicant-visible or internal. Focal selects an action: Return to Applicant or Endorse to RTEC. The system records the action, updates the status, and sends notifications to affected parties. |
| **Change annotation** | ✅ Confirmed: the three structured comment types (field-level, section-level, general) cover all current review annotation patterns (supervisor, 2026-06-30). ✅ Confirmed: the Focal cannot reject a proposal outright at this stage — the only available action is Return to Applicant or Endorse to RTEC. |

---

## Stage 4 — Applicant Revision (Post-Focal Return)

| Attribute | Detail |
|---|---|
| **Actor** | Applicant |
| **Inputs** | Returned proposal files with attached comment email or printed annotations |
| **Current step (Manual)** | Applicant receives the returned email. Applicant locates the original file, applies the requested changes, and re-sends the file. The new file is a separate attachment with no formal link to the original submission. Version tracking is informal at best. |
| **Tool used (Current)** | Email, Microsoft Word or Excel |
| **Proposed step (PRIME v2)** | Applicant receives a notification. Applicant logs in and opens the returned proposal. The system displays official comments alongside the relevant fields. Applicant edits the unlocked revision and resubmits. The system creates a new version (Version N+1), locks it, and re-routes to the Project Focal. |
| **Change annotation** | Each resubmission is a new immutable version linked to the original proposal record. The full version chain is visible to authorized users. ✅ Confirmed: the Applicant may revise all fields, not only those referenced in comments (supervisor, 2026-06-30). |

---

## Stage 5 — RTEC Member Review

| Attribute | Detail |
|---|---|
| **Actor** | RTEC Members (multiple, independent) |
| **Inputs** | Proposal files forwarded by Focal via email |
| **Current step (Manual)** | Each RTEC member receives the proposal files by email. Each member reviews independently and sends their individual comments or ratings by email reply, a separate document, or printed notes. There is no formal mechanism to prevent members from seeing each other's comments before consolidation. |
| **Tool used (Current)** | Email, Microsoft Word, printed forms |
| **Proposed step (PRIME v2)** | The system assigns the proposal to the selected RTEC group. Each member logs in and reviews the proposal independently. Members add private comments and ratings. Each member's draft review is saved in the system. Members submit their final review when complete. Submitted reviews are locked. Reviews are visible only to the RTEC Head. |
| **Change annotation** | ✅ Confirmed: RTEC member comments are completely private — members cannot see each other's inputs at any stage; only the RTEC Head can view all member reviews (supervisor, 2026-06-30). ✅ Confirmed: the rating and scoring structure used by RTEC members is confirmed. Exact scoring rubric to be documented in Phase 2. |

---

## Stage 6 — RTEC Head Consolidation

| Attribute | Detail |
|---|---|
| **Actor** | RTEC Head |
| **Inputs** | Individual review emails, documents, or printed notes from each RTEC member |
| **Current step (Manual)** | The RTEC Head collects all member feedback by email, printed notes, or verbal discussion. The Head writes a consolidated assessment by hand or in a Word document. The Head sends the consolidated result to the Project Focal by email. |
| **Tool used (Current)** | Email, Microsoft Word, printed notes, possibly a meeting |
| **Proposed step (PRIME v2)** | The RTEC Head logs in and sees all submitted member reviews in one screen. The Head drafts the consolidated comment set, referencing individual member findings as needed. The Head sets the official RTEC recommendation. The Head submits the final consolidated result. The system routes the result to the Project Focal. |
| **Change annotation** | Only the RTEC Head can submit the final consolidated recommendation. Member reviews are locked after submission and cannot be altered unless the Head formally reopens them. ✅ Confirmed: the RTEC Head may return an individual member's review for clarification before finalizing consolidation (supervisor, 2026-06-30). |

---

## Stage 7 — Post-RTEC Project Focal Routing

| Attribute | Detail |
|---|---|
| **Actor** | Project Focal |
| **Inputs** | Consolidated RTEC result received by email |
| **Current step (Manual)** | Focal receives the RTEC result by email. Focal decides the next action: return to Applicant for revision, send back to RTEC, or endorse to Budget. Focal communicates the decision by email. |
| **Tool used (Current)** | Email |
| **Proposed step (PRIME v2)** | Focal receives a notification. Focal opens the proposal and reviews the RTEC consolidated findings. Focal selects an action: Return to Applicant for Revision, Return to RTEC for Re-review, or Endorse to Budget. The system records the action and routes accordingly. |
| **Change annotation** | ✅ Confirmed: the Focal cannot close a proposal as "not recommended" — only the Regional Director may reject a proposal. The Focal's available actions at this stage are: Return to Applicant for Revision, Return to RTEC for Re-review, or Endorse to Budget (supervisor, 2026-06-30). |

---

## Stage 8 — Budget Review

| Attribute | Detail |
|---|---|
| **Actor** | Budget Officer |
| **Inputs** | Proposal Excel files with line-item budget sheets, forwarded by Focal by email |
| **Current step (Manual)** | Budget Officer opens the Excel budget sheets. Officer manually checks calculations, unit costs, and budget classifications. Officer writes findings by email reply or a separate memo. Officer returns to Focal or endorses to Accounting by email. |
| **Tool used (Current)** | Email, Microsoft Excel |
| **Proposed step (PRIME v2)** | Budget Officer receives a notification and logs in. The system displays the structured budget section with live calculations. Officer adds budget findings at the line-item or general level. Officer selects Return to Project Focal or Endorse to Accounting. |
| **Change annotation** | Excel budget formulas must be reproduced exactly in the web form calculation engine. ✅ Confirmed: the Budget Officer can only return to Project Focal — Budget cannot return directly to the Applicant (supervisor, 2026-06-30). Budget validation rules to be detailed in Phase 3 form specifications. |

---

## Stage 9 — Accounting Review

| Attribute | Detail |
|---|---|
| **Actor** | Accountant |
| **Inputs** | Proposal files forwarded by Budget Officer by email |
| **Current step (Manual)** | Accountant reviews accounting classifications, financial attachments, and compliance details by examining the emailed files. Accountant writes findings by email. Accountant returns to Budget or endorses to RD. |
| **Tool used (Current)** | Email, Microsoft Excel or Word |
| **Proposed step (PRIME v2)** | Accountant receives a notification and logs in. The system displays the accounting-relevant sections and attachments. Accountant adds findings. Accountant selects Return to Budget, Return to Project Focal (per policy), or Endorse to Regional Director. |
| **Change annotation** | ✅ Confirmed: the Accounting return path is confirmed — Accountant may return to Budget or to Project Focal per policy (supervisor, 2026-06-30). Required financial attachments per proposal type to be documented in Phase 3 form specifications. |

---

## Stage 10 — Regional Director Decision

| Attribute | Detail |
|---|---|
| **Actor** | Regional Director |
| **Inputs** | Summary email or printed memo with attached proposal documents and reviews |
| **Current step (Manual)** | RD receives a summary from the Accountant or Focal. RD reviews the proposal, official recommendations, and budget. RD issues a decision by memo, email, or verbal instruction. The Focal communicates the decision to the Applicant. |
| **Tool used (Current)** | Email, printed memo, verbal instruction |
| **Proposed step (PRIME v2)** | RD receives a notification and logs in. The system displays the complete proposal, all official recommendation summaries, and the workflow history. RD selects an action: Approve, Return for Revision, Defer, or Reject. RD may add final comments. The system records the decision, updates the status to the final state, and sends notifications to the Applicant and Focal. |
| **Change annotation** | The RD decision is the final action in the MVP workflow. A deferred or rejected proposal becomes read-only. ✅ Confirmed: a rejected proposal cannot be reopened — a new proposal must be submitted (supervisor, 2026-06-30). |

---

## Stage 11 — Status Tracking and Audit

| Attribute | Detail |
|---|---|
| **Actor** | Any authorized user; management |
| **Inputs** | Questions about proposal status |
| **Current step (Manual)** | Status must be confirmed by contacting the current reviewer directly (by phone, email, or in person). Management has no real-time visibility. |
| **Tool used (Current)** | Phone, email, in-person inquiry |
| **Proposed step (PRIME v2)** | Authorized users access the proposal status dashboard. Management can view the status of all active proposals. The audit log records every action with actor, role, timestamp, and context. Audit logs are exportable for compliance review. |
| **Change annotation** | ✅ Confirmed: full audit log access is granted to System Admin, Admin, and Process Owner. All other roles see a summary status view only (supervisor, 2026-06-30). |

---

*End of PRIME v2 Business Process Map — Version 0.2 Confirmed (2026-06-30)*
