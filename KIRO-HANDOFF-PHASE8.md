# PRIME v2 — Phase 8 Handoff for Kiro

**Project:** PRIME v2 — grant proposal management system (DOST Region 02)
**Phase:** Phase 8 — Dynamic Forms and Drafts
**Branch:** main
**Current HEAD:** eb0cf3e
**Date:** 2026-07-02

---

## What Phase 8 Does

Adds proposal creation, dynamic form rendering, draft autosave, and file attachments.

Closes MVP items: PROP-01–05, PROP-08, FILE-01–04, ADMIN-03, DASH-01.

---

## Stack

| Layer | Tech |
|---|---|
| Backend | Fastify 4, Prisma 6, PostgreSQL, TypeScript strict, Vitest |
| Frontend | React 18, Vite, TypeScript strict, React Router v6 |
| Storage | MinIO (S3-compatible) |
| Auth | Session cookie (connect-pg-simple), Google OAuth for applicants |

**All imports use `.js` extension (ESM). TypeScript strict mode — no `any`.**

---

## Completed Tasks (do NOT redo these)

| Task | Commit | What was done |
|---|---|---|
| 1. Prisma schema | 6fd0b3c | Added 13 Phase 8 models to `apps/backend/prisma/schema.prisma` |
| 2. MinIO service + packages | 9fae9d4 | Created `apps/backend/src/services/minio.ts`; installed `minio`, `file-type`, `@fastify/multipart` |
| 3. Proposal types routes | ae841a3 | `apps/backend/src/routes/proposalTypes.ts` + tests (4 endpoints) |
| 4. Form template routes | ac7e53d + b9bb662 | `apps/backend/src/routes/formTemplates.ts` + tests (3 endpoints); also registered in `app.ts` |
| 5. Proposals routes | eb0cf3e | `apps/backend/src/routes/proposals.ts` + tests (6 endpoints, autosave 409 guard); registered in `app.ts` |

---

## Remaining Tasks

### Task 6 — Attachments Routes

**Files to create:**
- `apps/backend/src/routes/attachments.ts`
- `apps/backend/src/routes/attachments.test.ts`

**Dependencies already available:**
- `uploadFile`, `getPresignedUrl` from `apps/backend/src/services/minio.ts`
- `@fastify/multipart` already installed (version ^10.0.0)
- `file-type` package installed (version ^22.0.1, ESM-only — import as `import { fileTypeFromBuffer } from 'file-type'`)
- `auditLog` from `apps/backend/src/services/auditLog.ts`
- `requireAuth`, `requireRole` from `apps/backend/src/middleware/auth.ts`
- Prisma models: `ProposalAttachment`, `Proposal`, `ProposalAssignment` (already in schema)

**Routes:**

```
POST /api/proposals/:id/attachments
  - Auth: OWNER only (applicantUserId = currentUser.id)
  - Parse multipart (single file field named "file")
  - Buffer entire file content first (needed for magic byte check)
  - ORDER OF CHECKS (must be in this order, all before any MinIO write):
      1. Extension check: extract extension from original filename — if blocked → 400
      2. MIME magic byte check via fileTypeFromBuffer(buffer) — if not in allowed list → 400
      3. Size check: if buffer.length > 52428800 (50MB) → 400
  - Blocked extensions: .exe .bat .sh .ps1 .cmd .scr .dll .js .py .php .rb .msi .vbs .jar
  - Allowed MIME types:
      application/pdf
      application/msword
      application/vnd.openxmlformats-officedocument.wordprocessingml.document
      application/vnd.ms-excel
      application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
      image/jpeg
      image/png
  - Generate MinIO object key SERVER-SIDE: `{proposalId}/{versionId}/{crypto.randomUUID()}.{ext}`
    where ext comes from MIME-detected type (NOT user filename)
  - Upload via uploadFile(key, buffer, buffer.length, detectedMimeType)
  - Insert ProposalAttachment record
  - Insert audit_log: action=ATTACHMENT_UPLOADED, entity_type=proposal_attachments
  - Return 201: { id, originalFilename, contentType, sizeBytes, uploadedAt }

GET /api/proposals/:id/attachments
  - Auth: OWNER or ASSIGNED or ADMIN (use same canAccessProposal pattern as proposals.ts)
  - Return non-deleted attachments (is_deleted = false)
  - Return: [{ id, originalFilename, contentType, sizeBytes, uploadedAt }]

GET /api/proposals/:id/attachments/:attachmentId/download
  - Auth: OWNER or ASSIGNED or ADMIN
  - Call getPresignedUrl(attachment.minioKey, 60) — 60 second TTL
  - Insert audit_log: action=ATTACHMENT_DOWNLOADED, entity_type=proposal_attachments
  - Return: { url: string }
  - NEVER include MinIO credentials in response
```

**MIME → extension mapping (use for key generation):**
```typescript
const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};
```

**How to parse multipart with @fastify/multipart:**
```typescript
// In route handler (multipart is registered globally in app.ts by Task 7):
const data = await request.file();
if (!data) return reply.status(400).send({ error: 'No file uploaded', statusCode: 400 });
const buffer = await data.toBuffer();
const originalFilename = data.filename;
```

**Tests (mock MinIO — never call real MinIO in tests):**
```
TC-FILE-01: POST attachment with allowed MIME (PDF) stores in MinIO and returns 201 with metadata
TC-FILE-02: POST attachment with .exe extension → 400
TC-FILE-03: POST attachment exceeding 50MB → 400
TC-FILE-04: GET attachment/download returns { url: string } starting with "http"
TC-FILE-05: GET attachment/download as different applicant → 403
TC-FILE-06: Upload and download both logged in audit_logs
```

**Mock pattern for MinIO in tests:**
```typescript
vi.mock('../services/minio.js', () => ({
  uploadFile: vi.fn().mockResolvedValue(undefined),
  getPresignedUrl: vi.fn().mockResolvedValue('http://minio.test/fake-presigned-url'),
}));
```

**Do NOT register this route in app.ts — Task 7 will do it.**

**Commit message:** `feat(backend): add attachment upload and download routes`

---

### Task 7 — Seed Updates + Route Registration

**Files to edit:**
- `apps/backend/prisma/seed.ts` (extend — do not remove existing content)
- `apps/backend/src/app.ts` (add multipart + attachments route)

**Seed additions (use upsert everywhere):**

```typescript
// 1. Office
const office = await prisma.office.upsert({
  where: { code: 'DOST-RO2' },
  update: {},
  create: { name: 'DOST Regional Office 02', code: 'DOST-RO2', isActive: true },
});

// 2. Three programs
const programs = ['GIA', 'CEST', 'SSCP'];
// For each: { name: 'Grants-in-Aid', code: 'GIA', officeId: office.id, isActive: true }
// GIA = "Grants-in-Aid", CEST = "Community Empowerment Through Science and Technology",
// SSCP = "Small Scholarship and Capability Program"

// 3. For each program: one FormTemplate + FormTemplateVersion + 2 sections + 4 fields
// FormTemplate: { formCode: 'GIA-FORM-001', title: 'GIA Proposal Form', programCode: 'GIA', isActive: true }
// FormTemplateVersion: { versionNumber: 1, schemaVersion: '1.0', isCurrent: true, publishedAt: new Date() }
// Section 1 "Project Information" (displayOrder: 1):
//   - F1: "Project Title", TEXT, required (displayOrder: 1)
//   - F2: "Project Description", TEXTAREA, required (displayOrder: 2)
// Section 2 "Budget" (displayOrder: 2):
//   - F3: "Total Budget Amount", NUMBER, required (displayOrder: 1)
//   - F4: "Supporting Documents", FILE, required (displayOrder: 2)

// 4. One ProposalType per program
// { code: 'GIA-PROPOSAL', name: 'GIA Research Proposal', programId: giaProgram.id,
//   defaultFormTemplateId: giaFormTemplate.id, isActive: true }
```

**app.ts additions:**

```typescript
// Add these imports:
import fastifyMultipart from '@fastify/multipart';
import proposalTypesRoutes from './routes/proposalTypes.js';
import attachmentsRoutes from './routes/attachments.js';

// In buildApp(), BEFORE route registrations (after rate limit):
await app.register(fastifyMultipart, { limits: { fileSize: 52428800 } }); // 50MB

// In route registration block:
await app.register(proposalTypesRoutes);
await app.register(attachmentsRoutes);
```

Note: `formTemplatesRoutes` and `proposalsRoutes` were already registered in app.ts by Tasks 4 and 5.

**After seed changes, run:**
```bash
cd apps/backend && npm run test -- --run
```
All existing + new tests must pass.

**Commit message:** `feat(backend): register attachment routes, add multipart plugin, seed office/programs/form templates`

---

### Task 8 — Frontend API Client

**File to create:** `apps/frontend/src/lib/api.ts`

```typescript
const BASE_URL = import.meta.env.VITE_API_URL ?? '';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Request failed' }));
    throw Object.assign(new Error(err.error ?? 'Request failed'), {
      status: response.status,
      data: err,
    });
  }
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  uploadFile: async <T>(path: string, file: File): Promise<T> => {
    const form = new FormData();
    form.append('file', file);
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw Object.assign(new Error(err.error ?? 'Upload failed'), {
        status: response.status,
        data: err,
      });
    }
    return response.json() as Promise<T>;
  },
};

// API response types
export interface ProposalTypeSummary {
  id: string;
  code: string;
  name: string;
  programId: string;
  defaultFormTemplateId: string | null;
  isActive: boolean;
}

export interface FormField {
  id: string;
  fieldCode: string;
  label: string;
  inputType: 'TEXT' | 'TEXTAREA' | 'NUMBER' | 'CURRENCY' | 'DATE' | 'SELECT' | 'CHECKBOX' | 'RADIO' | 'FILE' | 'TABLE';
  isRequired: boolean;
  validationRules: string | null;
  displayOrder: number;
}

export interface FormSection {
  id: string;
  sectionCode: string;
  title: string;
  displayOrder: number;
  isRepeating: boolean;
  isRequired: boolean;
  fields: FormField[];
}

export interface FormTemplateVersionResponse {
  id: string;
  formTemplateId: string;
  versionNumber: number;
  schemaVersion: string;
  isCurrent: boolean;
  sections: FormSection[];
}

export interface ProposalSummary {
  id: string;
  title: string;
  status: string;
  proposalType: { name: string };
  createdAt: string;
  updatedAt: string;
}

export interface ProposalDetail extends ProposalSummary {
  currentVersionId: string | null;
  applicantUserId: string;
  proposalType: { id: string; name: string };
  currentVersion: {
    id: string;
    versionNumber: number;
    isSubmitted: boolean;
    fieldValues: Array<{ formFieldId: string; value: string | null }>;
  } | null;
}

export interface AttachmentMeta {
  id: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
}
```

**After creating:**
```bash
cd apps/frontend && npx tsc --noEmit
```

**Commit message:** `feat(frontend): add typed API client`

---

### Task 9 — Frontend Pages

**Existing frontend structure to understand first:**
- `apps/frontend/src/App.tsx` — BrowserRouter + Routes
- `apps/frontend/src/components/shell/AppShell.tsx` — right-side nav shell (already built)
- `apps/frontend/src/hooks/useAuth.ts` — provides `{ role, user }` from session
- `apps/frontend/src/pages/DashboardPage.tsx` — existing page to match style
- CSS modules already handle responsive breakpoints

**Read existing `App.tsx` for exact Router/Route pattern before editing.**

**Add to `apps/frontend/src/App.tsx`:**
```tsx
// New imports:
import ProposalListPage from './pages/proposals/ProposalListPage';
import ProposalTypePage from './pages/proposals/ProposalTypePage';
import ProposalFormPage from './pages/proposals/ProposalFormPage';
import ProposalDetailPage from './pages/proposals/ProposalDetailPage';

// New routes inside <Routes> (wrap each in AppShell with role from useAuth):
<Route path="/proposals" element={<AppShell role={role} title="My Proposals"><ProposalListPage /></AppShell>} />
<Route path="/proposals/new" element={<AppShell role={role} title="Select Proposal Type"><ProposalTypePage /></AppShell>} />
<Route path="/proposals/new/:typeId" element={<AppShell role={role} title="New Proposal"><ProposalFormPage /></AppShell>} />
<Route path="/proposals/:id" element={<AppShell role={role} title="Proposal Detail"><ProposalDetailPage /></AppShell>} />
```

**ProposalListPage** (`apps/frontend/src/pages/proposals/ProposalListPage.tsx`):
- Fetch `GET /api/proposals` on mount → `api.get<ProposalSummary[]>('/api/proposals')`
- Loading / error / empty states
- Cards showing: title, status badge (color-coded), proposal type name, last updated
- "Create New Proposal" button → `navigate('/proposals/new')`

**ProposalTypePage** (`apps/frontend/src/pages/proposals/ProposalTypePage.tsx`):
- Fetch `GET /api/proposal-types` on mount → `api.get<ProposalTypeSummary[]>('/api/proposal-types')`
- Filter `isActive === true`
- Render clickable cards
- On click → `navigate(`/proposals/new/${type.id}`)`

**ProposalFormPage** (`apps/frontend/src/pages/proposals/ProposalFormPage.tsx`):
- `const { typeId } = useParams<{ typeId: string }>()`
- On mount (in useEffect):
  1. `POST /api/proposals` `{ proposalTypeId: typeId, title: 'Draft Proposal' }` → save `proposalId`
  2. `GET /api/proposal-types/:typeId` → get `defaultFormTemplateId`
  3. `GET /api/form-templates/:formTemplateId/versions/current` → get form schema
- Render sections and fields from schema:
  - `TEXT` → `<input type="text">`
  - `TEXTAREA` → `<textarea>`
  - `NUMBER` / `CURRENCY` → `<input type="number">`
  - `DATE` → `<input type="date">`
  - `SELECT` → `<select>` with empty option
  - `CHECKBOX` → `<input type="checkbox">`
  - `RADIO` → `<input type="radio">`
  - `FILE` → `<input type="file">` — on change, call `api.uploadFile(`/api/proposals/${proposalId}/attachments`, file)`
  - `TABLE` → `<p>Table field — use file upload</p>`
- Autosave: debounce 1500ms on field changes → `PATCH /api/proposals/:id/versions/draft/fields`
  - Body: `{ fields: [{ formFieldId, value }] }`
  - Show status: "Saving…" / "Saved" / "Save failed"
- "Save as Draft" button → explicit save (same PATCH call, immediate)
- "Next: Review" button → `navigate(`/proposals/${proposalId}`)`

**ProposalDetailPage** (`apps/frontend/src/pages/proposals/ProposalDetailPage.tsx`):
- `const { id } = useParams<{ id: string }>()`
- Fetch on mount:
  - `GET /api/proposals/:id` → proposal detail
  - `GET /api/proposals/:id/attachments` → attachment list
- Render: title, status, proposal type name
- Render field values read-only (label + value pairs)
- Render attachment list:
  - Each: filename, content type, size
  - "Download" button → `GET /api/proposals/:id/attachments/:attachmentId/download` → open `response.url` in new tab
- "Edit Draft" button — visible only if `proposal.status === 'DRAFT'` → navigate back to form

**Style:** Match existing pages (use same CSS module patterns as `DashboardPage`). No new CSS frameworks.

**After creating all pages:**
```bash
cd apps/frontend && npx tsc --noEmit
```
Must exit 0.

**Commit message:** `feat(frontend): add proposal list, type selection, form, and detail pages`

---

## Security Checklist (verify before git push)

- [ ] MIME magic byte check runs BEFORE MinIO write
- [ ] Extension block check runs BEFORE MinIO write
- [ ] MinIO presigned URL TTL is 60 seconds exactly
- [ ] MinIO credentials absent from all response bodies and logs
- [ ] Autosave 409 check at handler level before any DB write
- [ ] All attachment routes have `requireAuth()` minimum
- [ ] audit_logs has no UPDATE or DELETE calls
- [ ] `test-applicant-login` route guarded by `NODE_ENV !== 'production'`

---

## Key File Paths

```
apps/backend/
  prisma/
    schema.prisma          ← Phase 8 models already added
    seed.ts                ← extend in Task 7
  src/
    app.ts                 ← register multipart + attachments in Task 7
    services/
      minio.ts             ← done (Task 2)
      auditLog.ts          ← already built (use as-is)
    middleware/
      auth.ts              ← already built (requireAuth, requireRole, requireOwner)
    routes/
      proposalTypes.ts     ← done (Task 3)
      formTemplates.ts     ← done (Task 4)
      proposals.ts         ← done (Task 5)
      attachments.ts       ← Task 6
      auth.ts              ← has test-applicant-login helper for dev/test
    db/
      client.ts            ← prisma singleton, import as: import { prisma } from '../db/client.js'

apps/frontend/
  src/
    App.tsx                ← add routes in Task 9
    lib/
      api.ts               ← Task 8
    hooks/
      useAuth.ts           ← use { role } from this
    components/
      shell/
        AppShell.tsx       ← use this wrapper on all pages
    pages/
      DashboardPage.tsx    ← reference for style
      proposals/           ← create this directory in Task 9
```

---

## Running Tests

```bash
# Backend (from apps/backend/)
npm run test -- --run

# Frontend TypeScript check (from apps/frontend/)
npx tsc --noEmit

# Backend TypeScript check (from apps/backend/)
npx tsc --noEmit
```

**Note:** 13 pre-existing test failures in `auth.test.ts` / `users.test.ts` are stale DB row conflicts from accumulated test runs. They existed before Phase 8 and are NOT caused by Phase 8 code. Do not attempt to fix them unless specifically asked.

---

## Do NOT Implement (Out of Scope for Phase 8)

- Proposal submission (Phase 9)
- Comments (Phase 9)
- Workflow transitions (Phase 10)
- Email notifications (Phase 4+)
- RTEC reviews (later phase)

---

## Environment Variables Required

```
# Backend (.env)
DATABASE_URL=postgresql://...
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...
MINIO_BUCKET_NAME=prime-v2

# Frontend (.env)
VITE_API_URL=http://localhost:3000
```
