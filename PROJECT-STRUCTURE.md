# PRIME v2 Project Structure

Quick map of the repository. For full SDLC details, see [README.md](README.md).

## Start Here

| If you need… | Open |
|---|---|
| Business rules, workflow, development phases | [README.md](README.md) |
| Documentation folder guide | [docs/README.md](docs/README.md) |
| List of all proposal forms | [docs/forms/FORM-INVENTORY.md](docs/forms/FORM-INVENTORY.md) |
| **Agent workflow and vibe coding (intern)** | [docs/agents/INTERN-VIBE-CODING-GUIDE.md](docs/agents/INTERN-VIBE-CODING-GUIDE.md) |
| Phase status and validation | [docs/agents/PHASES-REFERENCE.md](docs/agents/PHASES-REFERENCE.md) |

## Folder Tree

```text
primev2/
├── README.md                    ← Full SDLC guide (ObraTech AI SDLC)
├── AGENTS.md                    ← Agent routing + QA push rules (Cursor)
├── PROJECT-STRUCTURE.md         ← This file
│
└── docs/
    ├── README.md                ← Documentation index
    ├── agents/                  ← Intern guide, phases, QA gate, task templates
    │   ├── INTERN-VIBE-CODING-GUIDE.md
    │   ├── PHASES-REFERENCE.md
    │   ├── DEVELOPMENT-FLOW.md
    │   ├── QA-PUSH-GATE.md
    │   └── AGENT-ROSTER.md
    │
    ├── project-brief/           ← Business context and objectives
    ├── requirements/              ← MVP scope and role permissions
    ├── workflows/               ← Proposal routing and statuses
    │
    ├── architecture/            ← System design and ADRs
    ├── database/                ← ERD and data dictionary
    ├── api/                     ← API contracts
    ├── frontend/                ← UI specs; UI-DESIGN-STANDARDS.md (right nav, responsive)
    ├── security/                ← Security plan and threat model
    ├── testing/                 ← Test plans and UAT scripts
    ├── deployment/              ← Coolify and Docker setup
    │
    ├── user-manual/             ← End-user guide
    ├── admin-manual/            ← Administrator guide
    │
    └── forms/
        ├── README.md            ← Form pipeline overview
        ├── FORM-INVENTORY.md    ← Catalog of all 27 source forms
        ├── word/                ← 13 original Word forms
        ├── excel/               ← 8 original Excel forms
        ├── pdf/                 ← 6 original PDF forms and references
        └── converted-form-specs/ ← Approved web-form specifications
```

## Current Status

- **Phase:** 2 — MVP, Roles, and User Stories (documents complete, pending approvals)
- **Phase 0:** ✅ Approved (supervisor 2026-06-30)
- **Phase 1:** 🔄 Documents created — pending Business Owner sign-off
- **Phase 2:** 🔄 Documents created — pending Product Owner, Security Owner, Process Owner sign-off
- **Coding:** Not started (awaiting MVP and architecture approval)
- **Forms:** 27 source files inventoried in `docs/forms/`

## Next Steps

1. Get Business Owner written approval on Project Brief → closes Phase 1
2. Get Product Owner written approval on MVP spec → contributes to Phase 2 gate
3. Get Security Owner written approval on Roles and Permissions → contributes to Phase 2 gate
4. Get Process Owner written approval on Workflow → closes Phase 2 gate
5. Begin Phase 3 (Form Conversion Specifications) only after Phase 2 gate is closed
6. Approve architecture in Phase 4
7. Begin development only after Phase 4 approval
