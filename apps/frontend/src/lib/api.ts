export const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

const BASE_URL = API_BASE_URL;

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
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  mustChangePassword: boolean;
}

export const authApi = {
  me: () => request<AuthUser>('GET', '/api/auth/me'),
  staffLogin: (email: string, password: string) =>
    request<{ status: string; mustChangePassword: boolean }>(
      'POST',
      '/api/auth/staff/login',
      { email, password },
    ),
  logout: () => request<{ status: string }>('POST', '/api/auth/logout'),
};

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

// ── Proposal assignments (Phase 21A, admin-only) ────────────────────────────────

export interface ProposalAssignment {
  id: string;
  proposalId: string;
  userId: string;
  roleCode: string;
  assignedAt: string;
  assignedBy: string;
  isActive: boolean;
  user: { id: string; email: string; firstName: string; lastName: string };
}

export const assignmentsApi = {
  list: (proposalId: string) =>
    request<ProposalAssignment[]>('GET', `/api/proposals/${proposalId}/assignments`),
  create: (proposalId: string, body: { userId: string; roleCode: string }) =>
    request<ProposalAssignment>('POST', `/api/proposals/${proposalId}/assignments`, body),
  remove: (proposalId: string, assignmentId: string) =>
    request<ProposalAssignment>('DELETE', `/api/proposals/${proposalId}/assignments/${assignmentId}`),
};

// ── Notifications ─────────────────────────────────────────────────────────────

export interface NotificationItem {
  id: string;
  proposalId: string | null;
  eventType: string;
  message: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export const notificationsApi = {
  list: (unreadOnly = false) =>
    request<NotificationItem[]>(
      'GET',
      `/api/notifications${unreadOnly ? '?unreadOnly=true' : ''}`,
    ),
  unreadCount: () =>
    request<{ count: number }>('GET', '/api/notifications/unread-count'),
  markRead: (id: string) =>
    request<NotificationItem>('POST', `/api/notifications/${id}/read`),
  markAllRead: () =>
    request<{ updated: number }>('POST', '/api/notifications/read-all'),
};

// ── Profile ───────────────────────────────────────────────────────────────────

export interface RoleSummary {
  id: string;
  code: string;
  name: string;
}

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roles: RoleSummary[];
  applicantProfile: {
    institution: string | null;
    positionTitle: string | null;
    contactNumber: string | null;
    address: string | null;
  } | null;
  staffProfile: {
    officeId: string | null;
    positionTitle: string | null;
    employeeNumber: string | null;
  } | null;
}

export interface ProfileUpdatePayload {
  firstName?: string;
  lastName?: string;
  displayName?: string | null;
  institution?: string | null;
  contactNumber?: string | null;
  address?: string | null;
  positionTitle?: string | null;
  employeeNumber?: string | null;
}

export const profileApi = {
  get: () => request<UserProfile>('GET', '/api/users/me/profile'),
  update: (body: ProfileUpdatePayload) =>
    request<UserProfile>('PATCH', '/api/users/me/profile', body),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ status: string }>('POST', '/api/auth/change-password', {
      currentPassword,
      newPassword,
    }),
};

// ── Queues ────────────────────────────────────────────────────────────────────

export type QueueKey =
  | 'focal'
  | 'rtec'
  | 'rtec_reviews'
  | 'rtec_consolidation'
  | 'budget'
  | 'accounting'
  | 'rd';

export interface QueueProposal {
  id: string;
  title: string;
  status: string;
  proposalType: { name: string };
  createdAt: string;
  updatedAt: string;
}

export interface QueueResponse {
  queueKey: QueueKey;
  label: string;
  count: number;
  proposals: QueueProposal[];
}

export const queuesApi = {
  get: (queueKey: QueueKey) =>
    request<QueueResponse>('GET', `/api/queues/${queueKey}`),
};

// ── Admin / shared ────────────────────────────────────────────────────────────

export interface AdminUser extends Omit<UserProfile, 'applicantProfile' | 'staffProfile'> {
  roles: RoleSummary[];
}

export interface RoleRecord extends RoleSummary {
  description: string | null;
  isActive: boolean;
}

export interface ProgramSummary {
  id: string;
  code: string;
  name: string;
  officeId: string;
  office: { id: string; name: string; code: string };
  isActive: boolean;
}

export interface ProposalTypeAdmin extends ProposalTypeSummary {
  program: { id: string; code: string; name: string };
  createdAt: string;
}

export interface FormTemplateSummary {
  id: string;
  formCode: string;
  title: string;
  sourceType: string | null;
  programCode: string | null;
  isActive: boolean;
  createdAt: string;
  currentVersion: {
    id: string;
    versionNumber: number;
    schemaVersion: string;
    publishedAt: string | null;
  } | null;
}

export interface FormTemplateDetail extends Omit<FormTemplateSummary, 'currentVersion'> {
  versions: Array<{
    id: string;
    versionNumber: number;
    schemaVersion: string;
    isCurrent: boolean;
    publishedAt: string | null;
    createdAt: string;
  }>;
}

export interface WorkflowTransitionRecord {
  id: string;
  fromStatus: string;
  toStatus: string;
  actionCode: string;
  actorRole: string;
}

export interface WorkflowDefinitionRecord {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  steps: Array<{
    id: string;
    statusCode: string;
    actorRole: string;
    description: string | null;
  }>;
  transitions: WorkflowTransitionRecord[];
}

export interface AuditLogItem {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  beforeState: string | null;
  afterState: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface AuditLogListResponse {
  total: number;
  limit: number;
  offset: number;
  items: AuditLogItem[];
}

export interface SystemInfo {
  environment: string;
  timestamp: string;
  stats: {
    users: number;
    activeUsers: number;
    proposals: number;
    notifications: number;
    auditLogs: number;
    roles: number;
    proposalTypes: number;
    formTemplates: number;
  };
}

export const adminApi = {
  listUsers: (includeInactive = false, search = '') => {
    const params = new URLSearchParams();
    if (includeInactive) params.set('includeInactive', 'true');
    if (search) params.set('search', search);
    const qs = params.toString();
    return request<AdminUser[]>('GET', `/api/users${qs ? `?${qs}` : ''}`);
  },
  createUser: (body: {
    email: string;
    firstName: string;
    lastName: string;
    roleCodes: string[];
  }) =>
    request<AdminUser & { invitationToken: string }>('POST', '/api/users', body),
  updateUser: (
    id: string,
    body: { firstName?: string; lastName?: string; displayName?: string | null },
  ) => request<AdminUser>('PATCH', `/api/users/${id}`, body),
  deactivateUser: (id: string) =>
    request<AdminUser>('POST', `/api/users/${id}/deactivate`),
  reactivateUser: (id: string) =>
    request<AdminUser>('POST', `/api/users/${id}/reactivate`),
  assignRoles: (id: string, roleCodes: string[]) =>
    request<{ status: string }>('POST', `/api/users/${id}/roles`, { roleCodes }),
  removeRole: (userId: string, roleId: string) =>
    request<{ status: string }>('DELETE', `/api/users/${userId}/roles/${roleId}`),
  listRoles: () => request<RoleRecord[]>('GET', '/api/roles'),
  getUserRoles: (userId: string) =>
    request<Array<RoleSummary & { assignedAt: string }>>(
      'GET',
      `/api/users/${userId}/roles`,
    ),
  listPrograms: () => request<ProgramSummary[]>('GET', '/api/programs'),
  listProposalTypes: (includeInactive = true) =>
    request<ProposalTypeAdmin[]>(
      'GET',
      `/api/proposal-types?includeInactive=${includeInactive}`,
    ),
  createProposalType: (body: {
    code: string;
    name: string;
    programId: string;
    defaultFormTemplateId?: string;
  }) => request<ProposalTypeSummary>('POST', '/api/proposal-types', body),
  updateProposalType: (
    id: string,
    body: { name?: string; isActive?: boolean; defaultFormTemplateId?: string | null },
  ) => request<ProposalTypeSummary>('PATCH', `/api/proposal-types/${id}`, body),
  listFormTemplates: () =>
    request<FormTemplateSummary[]>('GET', '/api/form-templates'),
  getFormTemplate: (id: string) =>
    request<FormTemplateDetail>('GET', `/api/form-templates/${id}`),
  getWorkflowConfig: () =>
    request<WorkflowDefinitionRecord[]>('GET', '/api/admin/workflow-config'),
  listAuditLogs: (limit = 50, offset = 0) =>
    request<AuditLogListResponse>(
      'GET',
      `/api/audit-logs?limit=${limit}&offset=${offset}`,
    ),
  getSystemInfo: () => request<SystemInfo>('GET', '/api/admin/system'),
};
