# OJT Guide — What Do I Actually Do?

**For:** OJT student (3rd year, assigned to PRIME v2)  
**Date:** 2026-06-30  
**Written by:** Claude Code after reading the entire repository

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

The original guide was written for **Cursor** (an AI-powered code editor). You don't use Cursor.

**That's fine.** You are using **Claude Code** (me). Same idea, different tool.

Instead of Cursor prompts, you just tell me what you need and I'll help you create it. For Phase 0–2, that means:

- Tell me which document to create
- I'll draft it based on the README
- You review it and flag anything that needs supervisor input
- We finalize it together

**Important:** Even with AI help, you must understand every document you submit. Never hand in something you don't understand. If a sentence doesn't make sense to you, ask me to explain it.

---

## What Phase 0–2 Actually Means (Plain English)

### Phase 0 — Set Up the Project Structure

*Goal: Make sure the repository is properly organized with all planning scaffolding in place.*

Phase 0 is mostly already done. The repo has the folder structure, the README, the form files, and the agent docs. What's still missing are a few templates and lists.

**No code. No app. Just files.**

### Phase 1 — Understand the Business

*Goal: Write a formal "Project Brief" that explains the problem, solution, stakeholders, scope, and constraints.*

This is like writing a report that says: "Here is what DOST currently does manually, here is what PRIME v2 will replace, and here is who needs to approve this project."

**No code. Just research and writing.**

### Phase 2 — Define Exactly What to Build

*Goal: Lock in the MVP (what the first version must do), the user roles, the permissions, and the user stories (specific features per role).*

This is like writing a contract for the developers: "Build exactly these features, for exactly these roles, following exactly these rules."

**No code. But every decision made here directly drives what gets coded later.**

---

## Current State of the Repo (What's Done vs. Missing)

### Phase 0 — Almost Complete

| Task | Status | Notes |
|---|---|---|
| Create repository | ✅ Done | GitHub repo exists |
| Create `docs/` folder | ✅ Done | All subfolders created |
| Create form folders | ✅ Done | word/, excel/, pdf/ all exist |
| Add README | ✅ Done | 2,812-line master guide |
| Inventory source forms | ✅ Done | 27 forms cataloged in FORM-INVENTORY.md |
| Agent workflow docs | ✅ Done | AGENTS.md, guides, templates all exist |
| Issue templates | ✅ Done | docs/phase-0/ISSUE-TEMPLATES.md |
| Decision log template | ✅ Done | docs/phase-0/DECISION-LOG.md (8 decisions logged) |
| Change request template | ✅ Done | docs/phase-0/CHANGE-REQUEST.md |
| Initial risk register | ✅ Done | docs/phase-0/RISK-REGISTER.md (13 risks) |
| Initial backlog | ✅ Done | docs/phase-0/INITIAL-BACKLOG.md (21 tasks) |
| Stakeholder list | ❌ Missing | Need names from supervisor |
| **Phase 0 approval** | ❌ Pending | Supervisor must sign off |

### Phase 1 — Not Started

| Task | Status |
|---|---|
| Project Brief document | ❌ Missing |
| Business process map (current vs proposed) | ❌ Missing |
| Problem statement | ❌ Missing |
| **Business owner approval** | ❌ Pending |

### Phase 2 — Not Started

| Task | Status |
|---|---|
| MVP specification document | ❌ Missing |
| Role-permission matrix | ❌ Missing |
| Workflow status document | ❌ Missing |
| User story backlog | ❌ Missing |
| **Approval from product/security/process owner** | ❌ Pending |

---

## Your Action Plan (Step by Step)

Do these in order. Do not skip ahead.

---

### STEP 1 — Read the Repo (Today, ~2–3 hours)

Before you create anything, you need to understand the project. Read these files in this order:

1. **`README.md`** — This is the master document. 2,812 lines. Do not skip it. It contains everything: what the system does, who uses it, how the workflow goes, what the tech stack is.

2. **`AGENTS.md`** — Short. Read it. This explains the "agent" system and the golden rules for the project.

3. **`docs/agents/PHASES-REFERENCE.md`** — Shows all 21 phases and which one you're in.

4. **`docs/agents/DEVELOPMENT-FLOW.md`** — Shows the mandatory flow before any task.

5. **`docs/forms/FORM-INVENTORY.md`** — Look at the 27 forms you'll eventually be working with.

6. **`docs/frontend/UI-DESIGN-STANDARDS.md`** — Even if you're not doing UI now, this has a strict rule: **navigation goes on the RIGHT side, not the top**. You need to know this.

**While reading, write down:**
- Things you don't understand
- Questions for your supervisor
- Anything that seems unclear or missing

---

### STEP 2 — Ask Your Supervisor These Questions

Before you create any documents, ask your supervisor:

**Critical (ask first):**
1. Who is the "Project Owner," "Business Owner," "Product Owner," and "Security Owner"? These are the people who approve Phase 0, 1, and 2. Without their names, the documents can't be finalized.
2. Are there any stakeholders (named people) I should list?
3. Is there a timeline or deadline for completing Phase 0–2?
4. What platform do we use for issues? GitHub Issues, Jira, or something else?

**Important:**
5. Is the list of 8 user roles exactly right? (Applicant, System Admin, Project Focal, RTEC Member, RTEC Head, Budget Officer, Accountant, Regional Director)
6. Are the 27 forms in `docs/forms/FORM-INVENTORY.md` the complete and correct set?
7. Who owns each form? (The "Owner" column in FORM-INVENTORY.md is blank.)

Write down all the answers. You'll need them for the documents.

---

### STEP 3 — Complete Phase 0 Missing Tasks

After your supervisor meeting, create the missing Phase 0 files. Tell me "create [file]" and I'll draft it for you to review.

**Files to create (in order):**

**3A — Stakeholder List**
- File: `docs/project-brief/STAKEHOLDERS.md`
- Contents: Table of everyone involved — name, role, contact, what they approve
- Needs: Supervisor-provided names from Step 2

**3B — Issue Templates**
- Where: `docs/templates/ISSUE-TEMPLATES.md` (since you probably don't use GitHub Issues workflow yet)
- Contents: Bug report template, documentation task template, phase gate review template

**3C — Decision Log Template**
- File: `docs/templates/DECISION-LOG.md`
- Contents: Table for recording decisions — date, decision made, reason, who approved

**3D — Change Request Template**
- File: `docs/templates/CHANGE-REQUEST.md`
- Contents: Form for requesting changes to scope or requirements

**3E — Initial Risk Register**
- File: `docs/requirements/RISK-REGISTER.md`
- Contents: Table of project risks — already identified in README.md §35, just needs formatting and owners

**3F — Initial Backlog**
- File: `docs/requirements/INITIAL-BACKLOG.md`
- Contents: Prioritized list of documentation tasks only (no coding tasks yet)

Once all six are created → **ask supervisor to confirm Phase 0 is complete.**

---

### STEP 4 — Create Phase 1 Documents

Phase 1 = writing the Project Brief. Most of the content already exists inside README.md — you're just extracting, organizing, and putting it in the right format for business-owner approval.

**What to create:**

**4A — Project Brief**
- File: `docs/project-brief/PRIME-v2-Project-Brief.md`
- Contents:
  - Problem statement (why the manual process is broken)
  - Proposed solution (what PRIME v2 will do)
  - Stakeholder matrix (link to STAKEHOLDERS.md)
  - Current process vs proposed process (simple flow diagram)
  - Assumptions (what we're assuming is true)
  - Constraints (limits we must follow)
  - Success criteria (how we know the project succeeded)

Most content comes from `README.md` §3, §4, §5, §10. I'll help you draft this — just say "draft the Project Brief."

Once drafted → **supervisor (business owner) must approve it before Phase 2 starts.**

---

### STEP 5 — Create Phase 2 Documents

Phase 2 = locking down exactly what to build. Again, all the information already exists in README.md. You're extracting it into proper standalone documents.

**What to create (do these in order):**

**5A — MVP Specification**
- File: `docs/requirements/PRIME-v2-MVP.md`
- Contents: The 20-step scenario from README.md §16 formatted as a checklist, plus what's in-scope and out-of-scope
- Source: `README.md` §6 (scope) and §16 (MVP definition)

**5B — Roles and Permissions Matrix**
- File: `docs/requirements/PRIME-v2-Roles-and-Permissions.md`
- Contents: Table showing which role can do what (view, edit, submit, comment, return, approve, etc.)
- Source: `README.md` §7 (auth rules) and §8 (user roles)
- Note: This needs security owner approval — it controls who can access what

**5C — Workflow Document**
- File: `docs/workflows/PRIME-v2-Workflow.md`
- Contents: All 24 proposal statuses, who triggers each transition, allowed paths
- Source: `README.md` §10 (workflow) and §11 (proposal statuses)

**5D — User Story Backlog**
- File: `docs/requirements/USER-STORY-BACKLOG.md`
- Contents: All user stories from README.md §17 in table format with IDs and acceptance criteria
- Source: `README.md` §17 (already has ~30+ user stories written)

Once all created → **three approvals needed: product owner (MVP), security owner (permissions), process owner (workflow).**

---

### STEP 6 — Get All Approvals

Collect sign-offs for Phase 0, 1, and 2. These can be simple email confirmations or signed documents depending on what your supervisor prefers.

- [ ] Phase 0: Project owner confirms name, scope, stakeholders
- [ ] Phase 1: Business owner approves Project Brief
- [ ] Phase 2: Product owner approves MVP
- [ ] Phase 2: Security owner approves role-permission matrix
- [ ] Phase 2: Process owner approves workflow document

**Only after all approvals → you can move to Phase 3 (form conversion specs) and eventually Phase 4 (architecture), which gates Phase 6 (first real code).**

---

## How to Work With Me (Claude Code)

Since you don't use Cursor, here's how we work together:

**To draft a document:**
> "Draft the Project Brief for PRIME v2."

**To review a section of README:**
> "Explain what README section 10 says about the workflow in simple terms."

**To create a specific file:**
> "Create STAKEHOLDERS.md using the template from the PHASE_0_1_2_WORKPLAN.md."

**To check something:**
> "Read FORM-INVENTORY.md and tell me if anything is missing."

**To understand a concept:**
> "What is MinIO and why does PRIME v2 use it?"

I will not write application code until Phase 4 is approved. If you ask me to write React or Fastify code before then, I'll remind you of this rule. That is the right thing to do — not a limitation.

---

## File Map — What Goes Where

```
prime-v2/
├── OJT_GUIDE.md                         ← this file
├── README.md                            ← master SDLC guide (do not modify)
├── AGENTS.md                            ← agent routing (do not modify)
│
└── docs/
    ├── project-brief/
    │   ├── STAKEHOLDERS.md              ← Step 3A (create with supervisor input)
    │   └── PRIME-v2-Project-Brief.md    ← Step 4A (create after stakeholders)
    │
    ├── requirements/
    │   ├── RISK-REGISTER.md             ← Step 3E
    │   ├── INITIAL-BACKLOG.md           ← Step 3F
    │   ├── PRIME-v2-MVP.md              ← Step 5A
    │   ├── PRIME-v2-Roles-and-Permissions.md ← Step 5B
    │   └── USER-STORY-BACKLOG.md        ← Step 5D
    │
    ├── workflows/
    │   └── PRIME-v2-Workflow.md         ← Step 5C
    │
    └── templates/
        ├── ISSUE-TEMPLATES.md           ← Step 3B
        ├── DECISION-LOG.md              ← Step 3C
        └── CHANGE-REQUEST.md            ← Step 3D
```

---

## Rules You Must Follow

These come directly from the project's official documents.

1. **No code until Phase 4 is approved.** Not even a `hello world`. The README says it, the PHASES-REFERENCE says it, the INTERN-VIBE-CODING-GUIDE says it. This is a hard rule.

2. **One document at a time.** Don't try to create everything in one session. Finish, review, and confirm each document before moving to the next.

3. **Never invent business rules.** If you don't know something (who a stakeholder is, what a return path is), write "Requires confirmation from supervisor" and ask. Don't guess.

4. **Keep commits small.** After creating each document, make a git commit. Don't batch everything into one giant commit.

5. **Understand what you submit.** AI can draft documents, but you are responsible for what's in them. If a sentence doesn't make sense to you, fix it before submitting.

6. **Right-side navigation.** When Phase 6 coding eventually starts, all UI navigation goes on the RIGHT side of the screen. Not top. This is a non-negotiable design rule from `docs/frontend/UI-DESIGN-STANDARDS.md`.

---

## What You Are NOT Doing Yet

To be completely clear, here is what Phase 0–2 does NOT include:

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

| Phase | What it is | Code? | Main output | Who approves |
|---|---|---|---|---|
| 0 | Set up project structure & templates | No | Stakeholder list, risk register, templates | Project owner |
| 1 | Understand and document the business | No | Project Brief | Business owner |
| 2 | Define what to build and who can do what | No | MVP spec, permissions, workflow, user stories | Product + Security + Process owner |
| 3 | Analyze and spec the 27 forms | No | Form specs (one per form) | Form owners |
| 4 | Design the architecture | No | Architecture doc, ERD, security plan | Architect + Security |
| 5 | Prototype the UI | Mockups only | Wireframes | Users |
| **6+** | **Actually build it** | **Yes** | Working code | QA gate + supervisor |

You are here: **Phase 0 → Phase 2**

---

## Start Here Right Now

If you just opened this file and want to know what to do in the next 30 minutes:

1. Open `README.md` and read sections 1 through 10.
2. Come back here.
3. Ask me: "Draft STAKEHOLDERS.md so I can show it to my supervisor and fill in the names."

That's step one.
