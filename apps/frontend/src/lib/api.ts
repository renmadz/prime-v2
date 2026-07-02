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

// ── Phase 9 types ─────────────────────────────────────────────────────────────

export interface ProposalComment {
  id: string;
  commentType: string;
  visibility: string;
  body: string;
  targetFieldId: string | null;
  targetSectionId: string | null;
  isResolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
  authorUserId: string;
}

export interface VersionDiff {
  fieldId: string;
  label: string;
  v1Value: string | null;
  v2Value: string | null;
  changed: boolean;
}

export interface HistoryEntry {
  action: string;
  actorUserId: string | null;
  createdAt: string;
  beforeState: string | null;
  afterState: string | null;
}

export interface CommentPayload {
  commentType: 'GENERAL' | 'FIELD' | 'SECTION';
  visibility: 'PUBLIC' | 'INTERNAL';
  body: string;
  targetFieldId?: string;
  targetSectionId?: string;
}

export interface ProposalVersionSummary {
  id: string;
  versionNumber: number;
  isSubmitted: boolean;
  statusAtCreation: string;
  createdAt: string;
  submittedAt: string | null;
}

export interface SubmitResponse {
  id: string;
  status: string;
  submittedAt: string;
  currentVersionId: string;
}

export interface ResubmitResponse {
  id: string;
  status: string;
  currentVersionId: string;
  versionNumber: number;
}

// ── Phase 9 API methods ───────────────────────────────────────────────────────

export const phase9Api = {
  submitProposal: (id: string) =>
    request<SubmitResponse>('POST', `/api/proposals/${id}/submit`),

  resubmitProposal: (id: string) =>
    request<ResubmitResponse>('POST', `/api/proposals/${id}/resubmit`),

  getComments: (proposalId: string) =>
    request<ProposalComment[]>('GET', `/api/proposals/${proposalId}/comments`),

  addComment: (proposalId: string, body: CommentPayload) =>
    request<ProposalComment>('POST', `/api/proposals/${proposalId}/comments`, body),

  resolveComment: (proposalId: string, commentId: string) =>
    request<{ id: string; isResolved: boolean; resolvedAt: string }>(
      'PATCH',
      `/api/proposals/${proposalId}/comments/${commentId}/resolve`,
    ),

  reopenComment: (proposalId: string, commentId: string) =>
    request<{ id: string; isResolved: boolean }>(
      'PATCH',
      `/api/proposals/${proposalId}/comments/${commentId}/reopen`,
    ),

  compareVersions: (proposalId: string, v1: string, v2: string) =>
    request<VersionDiff[]>(
      'GET',
      `/api/proposals/${proposalId}/versions/${v1}/compare/${v2}`,
    ),

  getHistory: (proposalId: string) =>
    request<HistoryEntry[]>('GET', `/api/proposals/${proposalId}/history`),

  getVersions: (proposalId: string) =>
    request<ProposalVersionSummary[]>('GET', `/api/proposals/${proposalId}/versions`),
};
