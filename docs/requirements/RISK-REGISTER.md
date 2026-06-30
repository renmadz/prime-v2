> ⚠️ SUPERSEDED — This is the Phase 0 draft risk register.
> The current authoritative risk register is:
> `docs/project-brief/PRIME-v2-Risk-Register.md` (Phase 1, v0.1, 15 risks, fully detailed)
> Do not update this file. Update the Phase 1 version instead.

# Risk Register — PRIME v2

**Source:** README.md §35  
**Phase:** 0  
**Owner:** [TBC — requires supervisor input]  
**Review:** At each phase gate

---

## Impact Levels

- **Critical** — could cause data loss, security breach, or project failure
- **High** — significant impact on timeline, quality, or user safety
- **Medium** — manageable with reasonable effort

## Status

- **Open** — no mitigation in place
- **In Progress** — mitigation started
- **Mitigated** — fully addressed
- **Accepted** — accepted with no mitigation (owner must approve)

---

## Risks

| ID | Risk | Impact | Likelihood | Mitigation | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- |
| RK-001 | Incorrect role permissions allow unauthorized access to proposals | Critical | Medium | Permission matrix (Phase 2); authorization tests (Phase 6+); security owner approval required | [TBC] | Open |
| RK-002 | Data loss — no backup or untested restore | Critical | Low | Automated backups; tested restore drills before go-live | [TBC] | Open |
| RK-003 | Incomplete form inventory — missing forms found during Phase 3 | High | Medium | Finalize FORM-INVENTORY.md; confirm with form owners before Phase 3 | [TBC] | Open |
| RK-004 | Workflow ambiguity — unclear transition rules cause build errors | High | High | Signed workflow approval (Phase 2) before any coding | [TBC] | Open |
| RK-005 | Dependency vulnerability in npm or Docker packages | High | Medium | Security scanning in CI/CD; regular dependency updates | [TBC] | Open |
| RK-006 | Unauthorized RTEC comment visibility — wrong role sees confidential review notes | High | Medium | Comment visibility rules from README §14; visibility tests (Phase 6+) | [TBC] | Open |
| RK-007 | Scope creep — unapproved features added during development | High | High | Approved MVP (Phase 2); all changes through CHANGE-REQUEST.md | [TBC] | Open |
| RK-008 | Single-container deployment — all services down if one crashes | High | Low | Separate Docker services per component; see DL-005 | [TBC] | Open |
| RK-009 | Incorrect Excel formula output in exported reports | High | Medium | Formula catalog (Phase 3); calculation tests (Phase 6+) | [TBC] | Open |
| RK-010 | Poor user adoption — staff revert to email | High | Medium | User prototype review (Phase 5); training; UAT before go-live | [TBC] | Open |
| RK-011 | Source forms change during development — specs become outdated | Medium | Medium | Version source forms; lock specs before Phase 6 | [TBC] | Open |
| RK-012 | Email notification failure — users miss status updates | Medium | Medium | In-app notifications as fallback; retry queue with logging | [TBC] | Open |
| RK-013 | Large attachment storage growth — MinIO fills up | Medium | Low | File size limits per upload; storage quota alerts; retention policy | [TBC] | Open |

---

## Owner Names Required

All [TBC] owner fields require supervisor input. Bring this table to the supervisor meeting (see OJT_GUIDE.md Step 2).
