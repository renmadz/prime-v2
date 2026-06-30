# OJT Guide — What Do I Actually Do?

**For:** OJT student (3rd year, assigned to PRIME v2)
**Last updated:** 2026-06-30 (Phase 2 docs created)
**Written by:** Kiro after reading the entire repository

---

## The Short Answer

Your supervisor said "do Phase 0–2."

**Phase 0–2 = zero code. Pure documentation.**

You are not building anything yet. You are writing planning documents so that when coding starts (Phase 6), everything is already decided, approved, and safe to build.

This is not busywork. The documents you create in Phase 0–2 will be the reference that every future developer — and every AI prompt — will use to build the actual system.

---

## What Is PRIME v2?

PRIME v2 is a web system for DOST (Dept of Science and Technology). Right now, researchers submit proposals using Word, Excel, and PDF files sent by email. It is messy, hard to track, and has no audit trail.

PRIME v2 will replace that with a proper web app where:

- Researchers submit proposals online
- Reviewers give feedback through the system
- Proposals are automatically routed (Focal → RTEC → Budget → Accounting → Regional Director)
- Everything is versioned and logged
- Final output is a proper PDF

**Tech stack (planned, not built yet):**

| Part | Technology |
|---|---|
| Frontend (UI) | React + Vite + TypeScript |
| Backend (API) | Fastify (Node.js) + TypeScript |
| Database | PostgreSQL |
| File storage | MinIO |
| Deployment | Docker + Coolify |
| Login | Google OAuth (applicants) / Email+Password (staff) |

None of this exists yet. There is no `src/`, no `frontend/`, no `backend/` folder. The repo is 100% documentation and planning right now.

---

## What Does "Vibe Coding" Mean Here?

In this project, "vibe coding" means using AI to help you write documentation, prompts, and eventually code.

You are using **Kiro** (this AI). Same idea as Cursor, different tool.

Instead of writing everything manually, you describe what you need and Kiro helps you create it. For Phase 0–2, that means:

- Tell Kiro which document to create or update
- Kiro drafts it based on the README and existing docs
- You review it and flag anything that needs supervisor input
- You finalize it together

**Important:** Even with AI help, you must understand every document you submit. Never hand in something you don't understand. If a sentence doesn't make sense to you, ask Kiro to explain it.

---

## What Phase 0–2 Actually Means (Plain English)

### Phase 0 — Set Up the Project Structure

*Goal: Make sure the repository is properly organized with all planning scaffolding in place.*

**Status: ✅ COMPLETE — supervisor approved on 2026-06-30.**

### Phase 1 — Understand the Business

*Goal: Write a formal "Project Brief" that explains the problem, solution, stakeholders, scope, and constraints.*

This is like writing a report that says: "Here is what DOST currently does manually, here is what PRIME v2 will replace, and here is who needs to approve this project."

**Status: 🔄 IN PROGRESS — documents created, pending Business Owner approval.**

### Phase 2 — Define Exactly What to Build

*Goal: Lock in the MVP (what the first version must do), the user roles, the permissions, and the user stories (specific features per role).*

This is like writing a contract for the developers: "Build exactly these features, for exactly these roles, following exactly these rules."

**Status: 🔄 IN PROGRESS — all four documents created, pending three approvals (Product Owner, Security Owner, Process Owner).**

---

## Current State of the Repo

### Phase 0 — ✅ Complete (Supervisor Approved 2026-06-30)

| Task | Status | Notes |
|---|---|---|
| Create repository | ✅ Done | GitHub repo exists |
| Create `docs/` folder | ✅ Done | All subfolders created |
| Create form folders | ✅ Done | word/, excel/, pdf/ all exist |
| Add README | ✅ Done | 2,812-line master guide |
| Inventory source forms | ✅ Done | 27 forms cataloged in FORM-INVENTORY.md |
| Agent workflow docs | ✅ Done | AGENTS.md, guides, templates all exist |
| Issue templates | ✅ Done | docs/templates/ISSUE-TEMPLATES.md |
| Decision log template | ✅ Done | docs/templates/DECISION-LOG.md |
| Change request template | ✅ Done | docs/templates/CHANGE-REQUEST.md |
| Initial risk register | ✅ Done | docs/requirements/RISK-REGISTER.md |
| Initial backlog | ✅ Done | docs/requirements/INITIAL-BACKLOG.md |
| Stakeholder list | ⚠️ Draft | docs/project-brief/STAKEHOLDERS.md — names are [TBC], pending supervisor |
| **Phase 0 approval** | ✅ Approved | Supervisor sign-off received 2026-06-30 |

### Phase 1 — 🔄 In Progress

| Task | Status | Notes |
|---|---|---|
| Project Brief | ✅ Created | `docs/project-brief/PRIME-v2-Project-Brief.md` |
| Business Process Map | ✅ Created | `docs/project-brief/PRIME-v2-Business-Process-Map.md` |
| Risk Register | ✅ Created | `docs/project-brief/PRIME-v2-Risk-Register.md` |
| Stakeholder interviews | ⚠️ Pending | 11 open questions in Business Process Map need confirmation |
| **Business Owner approval** | ❌ Pending | Brief is DRAFT — needs written sign-off to close Phase 1 |

### Phase 2 — 🔄 In Progress

| Task | Status | Notes |
|---|---|---|
| MVP specification document | ✅ Created | `docs/requirements/PRIME-v2-MVP.md` — DRAFT, 70+ checklist items |
| Role-permission matrix | ✅ Created | `docs/requirements/PRIME-v2-Roles-and-Permissions.md` — DRAFT |
| Workflow status document | ✅ Created | `docs/workflows/PRIME-v2-Workflow.md` — DRAFT, includes Mermaid diagram |
| User story backlog | ✅ Created | `docs/requirements/USER-STORY-BACKLOG.md` — DRAFT, all US-* stories |
| **Product Owner approves MVP** | ❌ Pending | Needs written sign-off on PRIME-v2-MVP.md |
| **Security Owner approves permissions** | ❌ Pending | Needs written sign-off on PRIME-v2-Roles-and-Permissions.md |
| **Process Owner approves workflow** | ❌ Pending | Needs written sign-off on PRIME-v2-Workflow.md |

---

## Your Action Plan (Step by Step)

Do these in order. Do not skip ahead.

---

### STEP 1 — Read the Repo ✅ (Should be done already)

If you haven't read these yet, do it now before anything else:

1. **`README.md`** — The master document. 2,812 lines. Read it fully. It contains everything: what the system does, who uses it, how the workflow goes, what the tech stack is.
2. **`AGENTS.md`** — Short. Explains the agent system and the golden rules.
3. **`docs/agents/PHASES-REFERENCE.md`** — Shows all 21 phases and which one you're in.
4. **`docs/agents/DEVELOPMENT-FLOW.md`** — Mandatory flow before any task.
5. **`docs/forms/FORM-INVENTORY.md`** — The 27 forms you'll eventually work with.
6. **`docs/frontend/UI-DESIGN-STANDARDS.md`** — Has a strict rule: **navigation goes on the RIGHT side, not the top.**

---

### STEP 2 — Finish Phase 1 (Current Focus)

Phase 1 documents have been created. Two things still needed to close Phase 1:

#### 2A — Answer the Open Questions in the Business Process Map

Open `docs/project-brief/PRIME-v2-Business-Process-Map.md` and look for every line marked with ⚠️. These are questions that need a real answer from the Process Owner or the relevant role representative before the brief is considered complete.

Key open questions include:

- Is browser-based form editing acceptable to applicants? (Stage 1)
- What is the required attachment list per proposal type? (Stage 2)
- Do the three comment types (field-level, section-level, general) cover all review patterns? (Stage 3)
- Can the Focal reject outright, or only return? (Stage 3)
- Can the applicant revise all fields or only those referenced in comments? (Stage 4)
- Are RTEC member comments completely private from other members? (Stage 5)
- What is the RTEC rating or scoring structure? (Stage 5)
- Can the RTEC Head return an individual member's review for clarification? (Stage 6)
- Can the Focal close a proposal as "not recommended," or only the RD? (Stage 7)
- Can Budget return directly to the Applicant, or only to the Focal? (Stage 8)
- Can Accounting return directly to the Focal, or only to Budget? (Stage 9)
- Can a rejected proposal be reopened, or must a new proposal be submitted? (Stage 10)
- Which roles can view the full audit log vs. a summary status view? (Stage 11)

**Ask your supervisor or the process owner for these answers. Record the answers in the Business Process Map — replace the ⚠️ notes with the confirmed answers.**

#### 2B — Get Business Owner Approval

Once the open questions are answered:

1. Send `docs/project-brief/PRIME-v2-Project-Brief.md` to the Business Owner for review.
2. If they request changes, update the brief, bump the version (e.g., 0.1 → 0.2), and resubmit.
3. Once approved, fill in the Approval section at the bottom of the brief with their name, statement of acceptance, and the date.
4. Change the document status from `DRAFT` to `APPROVED`.

**Phase 1 is closed when the Approval section is filled in.**

---

### STEP 3 — Get Phase 2 Approvals (Current Focus)

Phase 2 documents have all been created. Three approvals are needed to close this phase.

#### 3A — Get Product Owner Approval on the MVP Spec

1. Send `docs/requirements/PRIME-v2-MVP.md` to the Product Owner for review.
2. The doc has a pass/fail column for 70+ checklist items — review these with the Product Owner.
3. If they request changes, update the file, bump the version, and resubmit.
4. Once approved, fill in the Approval section at the top of the file.

Key things the Product Owner will want to confirm:
- The 20-step MVP end-to-end scenario (§2)
- The out-of-scope table (§4) — anything they want added or removed?
- The Definition of Done (§7) — are the criteria strict enough?

#### 3B — Get Security Owner Approval on Roles and Permissions

1. Send `docs/requirements/PRIME-v2-Roles-and-Permissions.md` to the Security Owner.
2. Walk them through the permission matrix tables (§3.1, §3.2, §3.3) — these are the most important.
3. Confirm the comment visibility rules (§4) and the 8 security constraints (§5).
4. Once approved, fill in the Approval section.

Key questions the Security Owner may raise:
- Are the "Stage" restrictions enforced server-side?
- Is the multi-role scenario handled correctly?
- Is the RTEC private comment isolation strong enough?

#### 3C — Get Process Owner Approval on the Workflow

1. Send `docs/workflows/PRIME-v2-Workflow.md` to the Process Owner.
2. Walk them through the Mermaid transition diagram (§2) and the transition table (§3).
3. Confirm every row in the transition table — especially the "Required Conditions" column.
4. Once approved, fill in the Approval section.

Key things the Process Owner will want to verify:
- Are all 24 statuses correct and complete?
- Is the `RETURNED_BY_ACCOUNTING` → `UNDER_FOCAL_REVIEW` path policy-approved?
- Can the Admin `CLOSE` a proposal at any stage, or only specific ones?

#### 3D — Phase 2 is Closed When All Three Approvals Are Recorded

Fill in the Approval section in each of the three documents. Phase 3 (form specs) cannot start until all three are signed off.

---

### STEP 4 — After Phase 2 (Next Phase)

After Phase 2 you move to Phase 3 (form conversion specs) and Phase 4 (architecture). Coding starts only after Phase 4 is approved.

| Phase | What it is | Code? |
|---|---|---|
| 3 | Analyze and spec the 27 forms | No |
| 4 | Design the architecture | No |
| 5 | Prototype the UI | Mockups only |
| **6+** | **Actually build it** | **Yes** |

---

## How to Work With Kiro

**To draft a document:**
> "Draft the MVP specification for PRIME v2."

**To update a document:**
> "Update the Business Process Map to answer the open RTEC questions."

**To check something:**
> "Read FORM-INVENTORY.md and tell me if anything is missing."

**To understand a concept:**
> "What is MinIO and why does PRIME v2 use it?"

**To check current status:**
> "What still needs to be done to finish Phase 1?"

Kiro will not write application code until Phase 4 is approved. If you ask for React or Fastify code before then, it'll remind you of this rule.

---

## File Map — What Goes Where

```
prime-v2/
├── OJT_GUIDE.md                              ← this file
├── README.md                                 ← master SDLC guide (do not modify)
├── AGENTS.md                                 ← agent routing (do not modify)
│
└── docs/
    ├── project-brief/
    │   ├── STAKEHOLDERS.md                   ← Draft (names TBC)
    │   ├── PRIME-v2-Project-Brief.md         ← ✅ Created — needs approval
    │   ├── PRIME-v2-Business-Process-Map.md  ← ✅ Created — needs interview answers
    │   └── PRIME-v2-Risk-Register.md         ← ✅ Created
    │
    ├── requirements/
    │   ├── RISK-REGISTER.md                  ← ✅ Done (Phase 0)
    │   ├── INITIAL-BACKLOG.md                ← ✅ Done (Phase 0)
    │   ├── PRIME-v2-MVP.md                   ← ✅ Created — pending Product Owner approval
    │   ├── PRIME-v2-Roles-and-Permissions.md ← ✅ Created — pending Security Owner approval
    │   └── USER-STORY-BACKLOG.md             ← ✅ Created — pending Product Owner approval
    │
    ├── workflows/
    │   └── PRIME-v2-Workflow.md              ← ✅ Created — pending Process Owner approval
    │
    └── templates/
        ├── ISSUE-TEMPLATES.md                ← ✅ Done
        ├── DECISION-LOG.md                   ← ✅ Done
        └── CHANGE-REQUEST.md                 ← ✅ Done
```

---

## Rules You Must Follow

These come directly from the project's official documents.

1. **No code until Phase 4 is approved.** Not even a `hello world`. Hard rule — no exceptions.
2. **One document at a time.** Finish, review, and confirm each document before moving to the next.
3. **Never invent business rules.** If you don't know something, write "Requires confirmation" and ask. Don't guess.
4. **Keep commits small.** After creating each document, make a git commit. Don't batch everything.
5. **Understand what you submit.** AI can draft documents, but you are responsible for their content.
6. **Right-side navigation.** When Phase 6 coding starts, all UI navigation goes on the RIGHT side. Not top. Non-negotiable.

---

## What You Are NOT Doing Yet

To be completely clear, Phase 0–2 does NOT include:

- ❌ Writing any React, TypeScript, or JavaScript
- ❌ Setting up a database
- ❌ Creating Docker files
- ❌ Installing Node.js packages
- ❌ Building any UI screens
- ❌ Creating any API endpoints
- ❌ Connecting to any services (MinIO, PostgreSQL, etc.)

All of that starts at Phase 6, which requires Phase 4 (architecture) approval first.

---

## One-Page Summary

| Phase | What it is | Code? | Main output | Who approves | Status |
|---|---|---|---|---|---|
| 0 | Set up project structure & templates | No | Stakeholder list, risk register, templates | Project owner | ✅ Done |
| 1 | Understand and document the business | No | Project Brief | Business owner | 🔄 Documents created — pending Business Owner approval |
| 2 | Define what to build and who can do what | No | MVP spec, permissions, workflow, user stories | Product + Security + Process owner | 🔄 Documents created — pending 3 approvals |
| 3 | Analyze and spec the 27 forms | No | Form specs (one per form) | Form owners | ⏳ Not started |
| 4 | Design the architecture | No | Architecture doc, ERD, security plan | Architect + Security | ⏳ Not started |
| 5 | Prototype the UI | Mockups only | Wireframes | Users | ⏳ Not started |
| **6+** | **Actually build it** | **Yes** | Working code | QA gate + supervisor | ⏳ Not started |

**You are here: Phase 1 (approval pending) → Phase 2 (documents created, approvals pending)**

---

## Start Here Right Now

**What to do today (in order):**

**1. Get stakeholder names from your supervisor**
Go to `docs/project-brief/STAKEHOLDERS.md` and `docs/project-brief/PRIME-v2-Project-Brief.md` §10.
Fill in every [TBC] field with real names. These are needed before Phase 1 can formally close.

**2. Submit Phase 1 for approval**
Send `docs/project-brief/PRIME-v2-Project-Brief.md` to the Business Owner.
When they approve, fill in the Approval section (§12) with their name, date, and "APPROVED".

**3. Submit Phase 2 for approval (all three)**
- Send `docs/requirements/PRIME-v2-MVP.md` → Product Owner
- Send `docs/requirements/PRIME-v2-Roles-and-Permissions.md` → Security Owner
- Send `docs/workflows/PRIME-v2-Workflow.md` → Process Owner

**4. When all three Phase 2 approvals are received:**
- Fill in the Approval section of each document
- Phase 2 gate is closed
- Phase 3 (Form Conversion Specs) can begin

**5. Use the Phase 2 Approval Package**
See `docs/templates/PHASE-2-APPROVAL-PACKAGE.md` for the ready-to-send review summary.
