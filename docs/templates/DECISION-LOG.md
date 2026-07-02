# Decision Log — PRIME v2

ADR-style record of significant project decisions. Log any decision that affects scope, architecture, workflow, permissions, forms, or timeline.

---

## How to Add an Entry

Copy the template below. Add to the table. Commit after every entry.

```text
| DL-NNN | YYYY-MM-DD | [Phase] | [Decision — one sentence] | [Rationale] | [Name / Role] | Accepted |
```

Status values: `Proposed` · `Accepted` · `Deprecated` · `Superseded by DL-NNN`

---

## Log

| ID | Date | Phase | Decision | Rationale | Approver | Status |
| --- | --- | --- | --- | --- | --- | --- |
| DL-001 | 2026-06-30 | 0 | Use React + Vite + TypeScript for frontend | Defined in README as mandated tech stack | Project Owner | Accepted |
| DL-002 | 2026-06-30 | 0 | Use Fastify (Node.js) + TypeScript for backend | Defined in README as mandated tech stack | Project Owner | Accepted |
| DL-003 | 2026-06-30 | 0 | Use PostgreSQL as database | Relational model required for proposal workflow and audit trail | Project Owner | Accepted |
| DL-004 | 2026-06-30 | 0 | Use MinIO for file storage | S3-compatible self-hosted object storage for attachments | Project Owner | Accepted |
| DL-005 | 2026-06-30 | 0 | Use Docker + Coolify for deployment | Consistent dev/prod environments; self-hosted infra | Project Owner | Accepted |
| DL-006 | 2026-06-30 | 0 | Google OAuth for applicants; email+password for staff | Applicants are external DOST researchers; staff needs role-controlled access | Project Owner | Accepted |
| DL-007 | 2026-06-30 | 0 | Right-side navigation for all UI (not top navbar) | Non-negotiable design rule per UI-DESIGN-STANDARDS.md | Project Owner | Accepted |
| DL-008 | 2026-06-30 | 0 | No application code until Phase 4 architecture approved | ObraTech SDLC mandate — prevents building on unapproved design | Project Owner | Accepted |
| DL-009 | 2026-07-01 | 2 | Phase 1 & 2 documents approved: Project Brief, MVP, Roles/Permissions, Workflow | Supervisor sign-off (B-01..B-04); closes Phase 1 & 2 gates | Business/Product/Security/Process Owner | Accepted |
| DL-010 | 2026-07-01 | 2 | Email notifications deferred to final phase; MVP ships in-app notifications only | No SMTP service available (ASM-04 invalidated, C-01) | Product Owner | Accepted |
| DL-011 | 2026-07-01 | 3 | Domain name available for staging and production | Confirmed by supervisor (D-1); feeds Phase 4 architecture/deployment docs | Business Owner | Accepted |
| DL-012 | 2026-07-01 | 3 | Coolify server/VM already provisioned — no new provisioning needed | Confirmed by supervisor (D-2) | Business Owner | Accepted |
| DL-013 | 2026-07-01 | 3 | No external data-privacy regulatory requirement; applicant consent-to-share shown at sign-up | Confirmed by supervisor (D-3); consent captured as AUTH-11 in MVP | Security Owner | Accepted |
| DL-014 | 2026-07-01 | 3 | GIA/CEST/SSCP per-program form mapping, required attachments, and Excel budget formulas deferred | Verify later — mapping/attachments with Process Owner (A-2, A-3), formulas with Budget Officer in final phase (A-4); does not block Phase 3 spec drafting | Process/Budget Owner | Proposed |
| DL-015 | 2026-07-01 | 3 | Stakeholder/approver names left [TBC] until at least a prototype exists | Supervisor directive — names on hold pending prototype | Project Owner | Accepted |
| DL-016 | 2026-07-01 | 4 | Phase 4 approval gates formally waived by supervisor | Named approvers not yet assigned (DL-015); supervisor authorised Phase 6 to proceed without blocking on named sign-offs | Supervisor | Accepted |
| DL-017 | 2026-07-01 | 6 | ORM: Prisma selected over Drizzle | Supervisor decision; Prisma chosen for its type-safe client, migration tooling, and broader community docs | Supervisor | Accepted |
| DL-018 | 2026-07-01 | 6 | Security Plan §12 infrastructure checklist items are pending — not yet completed on Coolify server | Supervisor confirmed items (MinIO bucket ACL, PostgreSQL dedicated user, session secret) will be completed before any auth implementation begins | Supervisor | Accepted |
| DL-019 | 2026-07-02 | 9 | Phase 9 gate closed; sequential test execution (`vitest --run --no-file-parallelism`) adopted as interim mitigation for known parallel-mode DB collision (ticketed as RISK-16 for Phase 15) | Supervisor sign-off on teardown fix (auth.test.ts/users.test.ts) and 65/65 double-run verification; parallel-mode collision confirmed pre-existing infra debt, not caused by the fix | Supervisor | Accepted |

---

## Open Questions (log as decisions after supervisor confirms)

| Question | Needed for |
| --- | --- |
| Who are the named Project/Business/Product/Security/Process Owners? | STAKEHOLDERS.md; all phase gates |
| Which issue tracker: GitHub Issues, Jira, or other? | Issue templates |
| What is the Phase 0–2 deadline? | INITIAL-BACKLOG.md |
| Who owns each of the 27 forms? | FORM-INVENTORY.md |
| Are the 8 defined user roles confirmed as final? | Phase 2 permissions |
