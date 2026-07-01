# PRIME v2 — Entity Relationship Diagram

| Field | Value |
|---|---|
| Document | PRIME v2 Entity Relationship Diagram |
| Version | 1.0 |
| Status | DRAFT — pending Phase 4 approval gate |
| Phase | Phase 4 — Architecture and Data Design |
| Author | Database Agent |
| Date | 2026-07-01 |

---

## Approval

| Approver | Role | Status |
|---|---|---|
| [TBC] | Database Lead / Architect | Pending |
| [TBC] | Security Agent | Pending |

> **Gate rule:** No database migrations or schema implementation may begin until this ERD and the accompanying Data Dictionary are approved.

---

## Legend

| Notation | Meaning |
|---|---|
| `PK` | Primary key |
| `FK` | Foreign key |
| `UQ` | Unique constraint |
| `IDX` | Non-unique index |
| `NN` | Not null |
| `⚠ IMMUTABLE` | Rows must never be updated or deleted after creation |
| `🔒 VERSIONING` | Versioning table — submitted snapshots are locked |
| `📋 AUDIT` | Audit table — append-only |
| `👥 RTEC` | RTEC committee table |
| `💬 COMMENT` | Comment table with visibility enforcement |

---

## 1. Full ERD (Mermaid)

```mermaid
erDiagram

    %% ─────────────────────────────────────────────────────────
    %% IDENTITY AND ACCESS
    %% ─────────────────────────────────────────────────────────

    users {
        uuid id PK
        varchar email UQ
        varchar google_id "nullable — applicants only"
        varchar password_hash "nullable — staff only"
        varchar first_name NN
        varchar last_name NN
        varchar display_name
        boolean is_active NN
        boolean must_change_password NN
        timestamp last_login_at
        timestamp created_at NN
        timestamp updated_at NN
    }

    roles {
        uuid id PK
        varchar code UQ "APPLICANT ADMIN PROJECT_FOCAL RTEC_MEMBER RTEC_HEAD BUDGET_OFFICER ACCOUNTANT REGIONAL_DIRECTOR"
        varchar name NN
        text description
        boolean is_active NN
    }

    user_roles {
        uuid id PK
        uuid user_id FK
        uuid role_id FK
        timestamp assigned_at NN
        uuid assigned_by FK "nullable — auto-assigned for applicants"
    }

    permissions {
        uuid id PK
        varchar code UQ
        varchar name NN
        text description
    }

    user_invitations {
        uuid id PK
        uuid user_id FK
        varchar token UQ
        timestamp expires_at NN
        boolean used NN
        timestamp created_at NN
    }

    password_reset_tokens {
        uuid id PK
        uuid user_id FK
        varchar token UQ
        timestamp expires_at NN
        boolean used NN
        timestamp created_at NN
    }

    %% ─────────────────────────────────────────────────────────
    %% ORGANIZATIONAL STRUCTURE
    %% ─────────────────────────────────────────────────────────

    offices {
        uuid id PK
        varchar name NN
        varchar code UQ
        boolean is_active NN
    }

    programs {
        uuid id PK
        varchar name NN
        varchar code UQ "GIA CEST SSCP"
        uuid office_id FK
        boolean is_active NN
    }

    staff_profiles {
        uuid id PK
        uuid user_id FK UQ
        uuid office_id FK
        varchar position_title
        varchar employee_number
    }

    applicant_profiles {
        uuid id PK
        uuid user_id FK UQ
        varchar institution
        varchar position_title
        varchar contact_number
        varchar address
        boolean privacy_consent_given NN
        timestamp privacy_consent_at
    }

    %% ─────────────────────────────────────────────────────────
    %% FORM TEMPLATES
    %% ─────────────────────────────────────────────────────────

    form_templates {
        uuid id PK
        varchar form_code UQ "FORM-001 to FORM-021"
        varchar title NN
        varchar source_type "WORD EXCEL PDF"
        varchar source_filename
        varchar program_code "GIA CEST SSCP ALL"
        boolean is_active NN
        timestamp created_at NN
    }

    form_template_versions {
        uuid id PK
        uuid form_template_id FK
        integer version_number NN
        varchar schema_version NN
        boolean is_current NN
        timestamp published_at
        uuid published_by FK
        timestamp created_at NN
    }

    form_sections {
        uuid id PK
        uuid form_template_version_id FK
        varchar section_code NN
        varchar title NN
        integer display_order NN
        boolean is_repeating NN
        boolean is_required NN
    }

    form_fields {
        uuid id PK
        uuid form_section_id FK
        varchar field_code NN
        varchar label NN
        varchar input_type "TEXT TEXTAREA NUMBER CURRENCY DATE SELECT CHECKBOX RADIO FILE TABLE"
        boolean is_required NN
        text validation_rules "JSON"
        text calculation_formula "nullable"
        integer display_order NN
        boolean is_commentable NN
    }

    form_calculations {
        uuid id PK
        uuid form_template_version_id FK
        varchar calculation_code NN
        text formula_description NN
        varchar target_field_code NN
    }

    %% ─────────────────────────────────────────────────────────
    %% PROPOSAL TYPES AND ROUTING
    %% ─────────────────────────────────────────────────────────

    proposal_types {
        uuid id PK
        varchar code UQ
        varchar name NN
        uuid program_id FK
        uuid default_form_template_id FK
        boolean is_active NN
        timestamp created_at NN
    }

    proposal_assignments {
        uuid id PK
        uuid proposal_id FK
        uuid user_id FK
        varchar role_code NN "PROJECT_FOCAL RTEC_MEMBER RTEC_HEAD BUDGET_OFFICER ACCOUNTANT REGIONAL_DIRECTOR"
        timestamp assigned_at NN
        uuid assigned_by FK
        boolean is_active NN
    }

    %% ─────────────────────────────────────────────────────────
    %% PROPOSALS — CORE (🔒 VERSIONING)
    %% ─────────────────────────────────────────────────────────

    proposals {
        uuid id PK
        uuid applicant_user_id FK
        uuid proposal_type_id FK
        varchar status NN "24 values — see workflow doc"
        varchar title NN
        uuid current_version_id FK "nullable — set after first version"
        timestamp created_at NN
        timestamp updated_at NN
        timestamp submitted_at "first submission"
        boolean is_locked NN "true when APPROVED REJECTED WITHDRAWN"
    }

    proposal_versions {
        uuid id PK
        uuid proposal_id FK
        integer version_number NN
        uuid form_template_version_id FK
        uuid created_by FK
        timestamp created_at NN
        timestamp submitted_at "null while in DRAFT"
        uuid source_version_id FK "nullable — previous version"
        varchar status_at_creation NN
        text change_summary
        boolean is_submitted NN "true once submitted — immutable thereafter"
    }

    proposal_field_values {
        uuid id PK
        uuid proposal_version_id FK
        uuid form_field_id FK
        text value "nullable"
        text previous_value "nullable — populated on edit"
        uuid changed_by FK "nullable"
        timestamp changed_at "nullable"
        text change_reason "nullable"
    }

    proposal_attachments {
        uuid id PK
        uuid proposal_id FK
        uuid proposal_version_id FK
        varchar minio_key NN
        varchar original_filename NN
        varchar content_type NN
        bigint size_bytes NN
        uuid uploaded_by FK
        timestamp uploaded_at NN
        boolean is_deleted NN
    }

    %% ─────────────────────────────────────────────────────────
    %% WORKFLOW ENGINE
    %% ─────────────────────────────────────────────────────────

    workflow_definitions {
        uuid id PK
        varchar code UQ
        varchar name NN
        boolean is_active NN
    }

    workflow_steps {
        uuid id PK
        uuid workflow_definition_id FK
        varchar status_code NN
        varchar actor_role NN
        text description
    }

    workflow_transitions {
        uuid id PK
        uuid workflow_definition_id FK
        varchar from_status NN
        varchar to_status NN
        varchar action_code NN
        varchar actor_role NN
        text conditions "JSON — required field checks"
    }

    proposal_workflow_history {
        uuid id PK
        uuid proposal_id FK
        varchar from_status NN
        varchar to_status NN
        uuid actor_user_id FK
        varchar actor_role NN
        varchar workflow_action NN
        integer proposal_version_number NN
        text comment "nullable"
        varchar session_reference "nullable"
        timestamp transitioned_at NN
    }

    %% ─────────────────────────────────────────────────────────
    %% COMMENTS (💬 COMMENT — visibility enforced in API)
    %% ─────────────────────────────────────────────────────────

    comment_threads {
        uuid id PK
        uuid proposal_id FK
        uuid proposal_version_id FK
        varchar scope "FIELD SECTION GENERAL"
        uuid form_field_id FK "nullable — for field-level"
        uuid form_section_id FK "nullable — for section-level"
        timestamp created_at NN
    }

    comments {
        uuid id PK
        uuid thread_id FK
        uuid author_user_id FK
        varchar author_role NN
        text body NN
        varchar visibility NN "APPLICANT_VISIBLE FOCAL_AND_INTERNAL RTEC_PRIVATE RTEC_HEAD_ONLY OFFICIAL_WORKFLOW ADMIN_AUDIT_ONLY"
        varchar comment_type "OFFICIAL PRIVATE CLARIFICATION FINDING"
        varchar status NN "OPEN RESOLVED REOPENED"
        uuid parent_comment_id FK "nullable — for replies"
        uuid resolved_by FK "nullable"
        timestamp resolved_at "nullable"
        timestamp created_at NN
        timestamp updated_at NN
    }

    %% ─────────────────────────────────────────────────────────
    %% RTEC (👥 RTEC)
    %% ─────────────────────────────────────────────────────────

    rtec_groups {
        uuid id PK
        varchar name NN
        uuid program_id FK
        boolean is_active NN
        timestamp created_at NN
    }

    rtec_memberships {
        uuid id PK
        uuid rtec_group_id FK
        uuid user_id FK
        varchar role_in_group "MEMBER HEAD"
        boolean is_active NN
        timestamp assigned_at NN
        uuid assigned_by FK
    }

    rtec_reviews {
        uuid id PK
        uuid proposal_id FK
        uuid proposal_version_id FK
        uuid rtec_group_id FK
        uuid reviewer_user_id FK
        varchar status "DRAFT SUBMITTED"
        text overall_remarks "freeform — no numeric scoring"
        boolean is_submitted NN
        timestamp submitted_at "nullable"
        timestamp created_at NN
        timestamp updated_at NN
    }

    rtec_review_items {
        uuid id PK
        uuid rtec_review_id FK
        uuid form_section_id FK "nullable"
        text remarks NN
        timestamp created_at NN
    }

    rtec_consolidations {
        uuid id PK
        uuid proposal_id FK
        uuid proposal_version_id FK
        uuid rtec_group_id FK
        uuid consolidated_by FK "RTEC Head user_id"
        varchar recommendation NN "FOR_APPROVAL FOR_REVISION NOT_RECOMMENDED"
        text consolidated_remarks NN
        boolean is_submitted NN
        timestamp submitted_at "nullable"
        timestamp created_at NN
        timestamp updated_at NN
    }

    %% ─────────────────────────────────────────────────────────
    %% FINANCIAL REVIEWS
    %% ─────────────────────────────────────────────────────────

    budget_reviews {
        uuid id PK
        uuid proposal_id FK
        uuid proposal_version_id FK
        uuid reviewer_user_id FK
        varchar status "OPEN RETURNED ENDORSED"
        text findings "nullable"
        varchar action_taken "nullable"
        timestamp reviewed_at "nullable"
        timestamp created_at NN
        timestamp updated_at NN
    }

    accounting_reviews {
        uuid id PK
        uuid proposal_id FK
        uuid proposal_version_id FK
        uuid reviewer_user_id FK
        varchar status "OPEN RETURNED ENDORSED"
        text findings "nullable"
        varchar action_taken "nullable"
        timestamp reviewed_at "nullable"
        timestamp created_at NN
        timestamp updated_at NN
    }

    rd_decisions {
        uuid id PK
        uuid proposal_id FK
        uuid proposal_version_id FK
        uuid decided_by FK
        varchar decision NN "APPROVED DEFERRED REJECTED RETURNED"
        text remarks "nullable"
        timestamp decided_at "nullable"
        timestamp created_at NN
    }

    %% ─────────────────────────────────────────────────────────
    %% NOTIFICATIONS
    %% ─────────────────────────────────────────────────────────

    notifications {
        uuid id PK
        uuid recipient_user_id FK
        uuid proposal_id FK "nullable"
        varchar event_type NN
        text message NN
        boolean is_read NN
        timestamp read_at "nullable"
        timestamp created_at NN
    }

    email_logs {
        uuid id PK
        uuid notification_id FK "nullable"
        uuid recipient_user_id FK
        varchar to_address NN
        varchar subject NN
        varchar status "QUEUED SENT FAILED"
        text error_message "nullable"
        timestamp sent_at "nullable"
        timestamp created_at NN
    }

    %% ─────────────────────────────────────────────────────────
    %% AUDIT (📋 AUDIT — append-only, ⚠ IMMUTABLE)
    %% ─────────────────────────────────────────────────────────

    audit_logs {
        uuid id PK
        uuid actor_user_id FK "nullable — system actions"
        varchar actor_role "nullable"
        varchar action NN
        varchar entity_type NN
        uuid entity_id "nullable"
        text before_state "JSON nullable"
        text after_state "JSON nullable"
        varchar ip_address "nullable"
        varchar session_reference "nullable"
        timestamp created_at NN
    }

    %% ─────────────────────────────────────────────────────────
    %% SYSTEM CONFIGURATION
    %% ─────────────────────────────────────────────────────────

    system_settings {
        uuid id PK
        varchar key UQ
        text value NN
        text description
        timestamp updated_at NN
        uuid updated_by FK
    }

    %% ─────────────────────────────────────────────────────────
    %% RELATIONSHIPS
    %% ─────────────────────────────────────────────────────────

    users ||--o{ user_roles : "has"
    roles ||--o{ user_roles : "assigned via"
    users ||--o| applicant_profiles : "has"
    users ||--o| staff_profiles : "has"
    users ||--o{ user_invitations : "receives"
    users ||--o{ password_reset_tokens : "requests"

    offices ||--o{ programs : "contains"
    offices ||--o{ staff_profiles : "belongs to"

    programs ||--o{ proposal_types : "governs"
    programs ||--o{ rtec_groups : "has"

    proposal_types ||--o{ proposals : "categorizes"
    form_templates ||--o{ form_template_versions : "versioned by"
    form_template_versions ||--o{ form_sections : "contains"
    form_sections ||--o{ form_fields : "contains"
    form_template_versions ||--o{ form_calculations : "defines"
    proposal_types ||--o| form_templates : "default form"

    proposals ||--o{ proposal_versions : "has versions"
    proposals ||--o{ proposal_assignments : "assigned to"
    proposals ||--o{ proposal_attachments : "has"
    proposals ||--o{ proposal_workflow_history : "tracks"
    proposals ||--o{ comment_threads : "has"
    proposals ||--o{ notifications : "triggers"
    proposals ||--o{ rtec_reviews : "reviewed via"
    proposals ||--o{ rtec_consolidations : "consolidated via"
    proposals ||--o{ budget_reviews : "budget reviewed via"
    proposals ||--o{ accounting_reviews : "accounting reviewed via"
    proposals ||--o{ rd_decisions : "decided via"

    proposal_versions ||--o{ proposal_field_values : "stores"
    proposal_versions ||--o| proposal_versions : "source version"
    proposal_versions ||--o{ proposal_attachments : "scoped to"
    proposal_versions ||--o{ rtec_reviews : "reviewed at version"
    proposal_versions ||--o{ rtec_consolidations : "consolidated at version"
    proposal_versions ||--o{ budget_reviews : "reviewed at version"
    proposal_versions ||--o{ accounting_reviews : "reviewed at version"
    proposal_versions ||--o{ rd_decisions : "decided at version"
    proposal_versions ||--o{ comment_threads : "scoped to"

    form_fields ||--o{ proposal_field_values : "value stored in"
    form_fields ||--o{ comment_threads : "field-level thread"
    form_sections ||--o{ comment_threads : "section-level thread"

    comment_threads ||--o{ comments : "contains"
    comments ||--o{ comments : "replies to"

    rtec_groups ||--o{ rtec_memberships : "has members"
    rtec_groups ||--o{ rtec_reviews : "performs"
    rtec_groups ||--o{ rtec_consolidations : "produces"
    rtec_reviews ||--o{ rtec_review_items : "contains"

    users ||--o{ proposals : "applicant creates"
    users ||--o{ proposal_assignments : "assigned as"
    users ||--o{ proposal_field_values : "edits"
    users ||--o{ proposal_workflow_history : "triggers"
    users ||--o{ comments : "authors"
    users ||--o{ rtec_reviews : "authors"
    users ||--o{ rtec_consolidations : "consolidates"
    users ||--o{ budget_reviews : "reviews"
    users ||--o{ accounting_reviews : "reviews"
    users ||--o{ rd_decisions : "decides"
    users ||--o{ notifications : "receives"
    users ||--o{ audit_logs : "triggers"

    workflow_definitions ||--o{ workflow_steps : "defines"
    workflow_definitions ||--o{ workflow_transitions : "defines"
```

---

## 2. Table Group Summary

### Identity and Access

| Table | Description |
|---|---|
| `users` | All users — applicants and staff — single table with nullable credential columns |
| `roles` | 8 role codes as defined in Roles-and-Permissions doc |
| `user_roles` | Many-to-many: users can hold multiple roles simultaneously |
| `permissions` | Fine-grained permission codes for future expansion |
| `user_invitations` | Activation links for new staff accounts |
| `password_reset_tokens` | Secure one-time password reset tokens |

### Organizational Structure

| Table | Description |
|---|---|
| `offices` | Organizational units |
| `programs` | GIA, CEST, SSCP — linked to offices |
| `staff_profiles` | Staff-specific profile data, separate from auth |
| `applicant_profiles` | Applicant-specific profile, privacy consent flag |

### Form Templates

| Table | Description |
|---|---|
| `form_templates` | Master catalog of 21 web forms (FORM-001 to FORM-021) |
| `form_template_versions` | Versioned schema per form; `is_current` flags the active version |
| `form_sections` | Sections within a form version |
| `form_fields` | Individual input fields; stores type, validation, formula reference |
| `form_calculations` | Formula documentation for Excel-derived calculated fields |

### 🔒 Versioning Tables

| Table | Immutability Rule |
|---|---|
| `proposal_versions` | Once `is_submitted = true`, the row is immutable. No UPDATE or DELETE permitted. |
| `proposal_field_values` | Field values belonging to a submitted version must not be changed. |

### 📋 Audit Tables

| Table | Immutability Rule |
|---|---|
| `proposal_workflow_history` | Append-only. No UPDATE or DELETE. |
| `audit_logs` | Append-only. No UPDATE or DELETE. Used for all actor actions, logins, exports, and admin changes. |

### 👥 RTEC Tables

| Table | Description |
|---|---|
| `rtec_groups` | Named committee groups linked to programs |
| `rtec_memberships` | Members and Head assigned to each group |
| `rtec_reviews` | Individual member review per proposal version; freeform remarks only (no numeric scoring) |
| `rtec_review_items` | Per-section remarks within an individual review |
| `rtec_consolidations` | RTEC Head's official consolidated recommendation; one per proposal per RTEC round |

### 💬 Comment Tables

| Table | Description |
|---|---|
| `comment_threads` | Anchors a thread to a proposal version, and optionally to a field or section |
| `comments` | Individual comment with `visibility` column enforcing RTEC_PRIVATE, APPLICANT_VISIBLE, etc. |

---

## 3. Key Indexes Summary

| Table | Index Columns | Reason |
|---|---|---|
| `users` | `email` (UQ), `google_id` | Login lookups |
| `user_roles` | `user_id`, `role_id` | Role checks per user |
| `proposals` | `applicant_user_id`, `status`, `proposal_type_id` | Dashboard filtering |
| `proposal_versions` | `proposal_id`, `version_number` | Version retrieval |
| `proposal_field_values` | `proposal_version_id`, `form_field_id` | Form rendering |
| `proposal_workflow_history` | `proposal_id`, `transitioned_at` | History timeline |
| `comments` | `thread_id`, `visibility`, `status` | Filtered comment retrieval |
| `audit_logs` | `actor_user_id`, `entity_type`, `entity_id`, `created_at` | Audit search |
| `notifications` | `recipient_user_id`, `is_read`, `created_at` | Unread count badge |
| `rtec_reviews` | `proposal_id`, `reviewer_user_id` | Member review lookup |
| `rtec_consolidations` | `proposal_id`, `rtec_group_id` | Consolidation lookup |
| `proposal_assignments` | `proposal_id`, `role_code`, `is_active` | Routing and access checks |

---

## 4. Revision History

| Version | Summary | Author | Date |
|---|---|---|---|
| 1.0 | Initial ERD — Phase 4 | Database Agent | 2026-07-01 |
