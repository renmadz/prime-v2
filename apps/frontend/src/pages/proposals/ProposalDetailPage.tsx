import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  api,
  phase9Api,
  assignmentsApi,
  adminApi,
  type AttachmentMeta,
  type ProposalDetail,
  type ProposalComment,
  type CommentPayload,
  type ProposalVersionSummary,
  type ProposalAssignment,
  type AdminUser,
} from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";

const ASSIGNABLE_ROLES = ["PROJECT_FOCAL", "BUDGET_OFFICER", "ACCOUNTANT"];

interface DownloadResponse {
  url: string;
}

export default function ProposalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();

  const [proposal, setProposal] = useState<ProposalDetail | null>(null);
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [comments, setComments] = useState<ProposalComment[]>([]);
  const [versions, setVersions] = useState<ProposalVersionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Comment form state
  const [commentBody, setCommentBody] = useState("");
  const [commentType, setCommentType] = useState<"GENERAL" | "FIELD" | "SECTION">("GENERAL");
  const [addingComment, setAddingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  // Resubmit state
  const [showResubmitConfirm, setShowResubmitConfirm] = useState(false);
  const [resubmitting, setResubmitting] = useState(false);
  const [resubmitError, setResubmitError] = useState<string | null>(null);

  // Admin: staff assignment panel state
  const [assignments, setAssignments] = useState<ProposalAssignment[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<AdminUser[]>([]);
  const [assignUserId, setAssignUserId] = useState("");
  const [assignRoleCode, setAssignRoleCode] = useState(ASSIGNABLE_ROLES[0]);
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [unassigningId, setUnassigningId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError("Missing proposal ID.");
      setLoading(false);
      return;
    }

    Promise.all([
      api.get<ProposalDetail>(`/api/proposals/${id}`),
      api.get<AttachmentMeta[]>(`/api/proposals/${id}/attachments`),
      phase9Api.getComments(id),
      phase9Api.getVersions(id),
    ])
      .then(([proposalData, attachmentData, commentData, versionData]) => {
        setProposal(proposalData);
        setAttachments(attachmentData);
        setComments(commentData);
        setVersions(versionData);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to load proposal";
        setError(message);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const loadAssignments = () => {
    if (!id) return;
    assignmentsApi.list(id).then(setAssignments).catch(() => setAssignments([]));
  };

  useEffect(() => {
    if (!id || role !== "ADMIN") return;
    loadAssignments();
    adminApi
      .listUsers(false)
      .then(setAssignableUsers)
      .catch(() => setAssignableUsers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, role]);

  async function handleDownload(attachmentId: string) {
    if (!id) return;
    setDownloadError(null);
    try {
      const response = await api.get<DownloadResponse>(
        `/api/proposals/${id}/attachments/${attachmentId}/download`
      );
      window.open(response.url, "_blank", "noopener,noreferrer");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Download failed";
      setDownloadError(message);
    }
  }

  async function handleAddComment() {
    if (!id || !commentBody.trim()) return;
    setCommentError(null);
    setAddingComment(true);
    try {
      const payload: CommentPayload = {
        commentType,
        visibility: "PUBLIC",
        body: commentBody.trim(),
      };
      const newComment = await phase9Api.addComment(id, payload);
      setComments((prev) => [...prev, newComment]);
      setCommentBody("");
      setCommentType("GENERAL");
    } catch (err: unknown) {
      setCommentError(err instanceof Error ? err.message : "Failed to add comment.");
    } finally {
      setAddingComment(false);
    }
  }

  async function handleResolveComment(commentId: string) {
    if (!id) return;
    try {
      const updated = await phase9Api.resolveComment(id, commentId);
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, isResolved: updated.isResolved, resolvedAt: updated.resolvedAt }
            : c,
        ),
      );
    } catch {
      // silent — comment stays unchanged
    }
  }

  async function handleReopenComment(commentId: string) {
    if (!id) return;
    try {
      await phase9Api.reopenComment(id, commentId);
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId ? { ...c, isResolved: false, resolvedAt: null } : c,
        ),
      );
    } catch {
      // silent
    }
  }

  async function handleResubmit() {
    if (!id) return;
    setResubmitError(null);
    setResubmitting(true);
    try {
      await phase9Api.resubmitProposal(id);
      setShowResubmitConfirm(false);
      navigate(`/proposals/${id}`);
      window.location.reload();
    } catch (err: unknown) {
      setResubmitError(err instanceof Error ? err.message : "Resubmit failed.");
    } finally {
      setResubmitting(false);
    }
  }

  async function handleAssign() {
    if (!id || !assignUserId) return;
    setAssignError(null);
    setAssigning(true);
    try {
      await assignmentsApi.create(id, { userId: assignUserId, roleCode: assignRoleCode });
      setAssignUserId("");
      loadAssignments();
    } catch (err: unknown) {
      setAssignError(err instanceof Error ? err.message : "Failed to assign staff.");
    } finally {
      setAssigning(false);
    }
  }

  async function handleUnassign(assignmentId: string) {
    if (!id) return;
    setUnassigningId(assignmentId);
    try {
      await assignmentsApi.remove(id, assignmentId);
      loadAssignments();
    } catch {
      // silent — assignment stays in the list, admin can retry
    } finally {
      setUnassigningId(null);
    }
  }

  // Determine if current user is the proposal owner.
  // useAuth returns a stub — in production this would be the real user id.
  const isApplicant = role === "APPLICANT";
  const isAdmin = role === "ADMIN";

  if (loading) {
    return <p style={{ padding: "1rem" }}>Loading proposal…</p>;
  }

  if (error || !proposal) {
    return (
      <p role="alert" style={{ padding: "1rem", color: "#dc2626" }}>
        Error: {error ?? "Proposal not found"}
      </p>
    );
  }

  const visibleComments = isApplicant
    ? comments.filter((c) => c.visibility !== "INTERNAL")
    : comments;

  const fieldValues = proposal.currentVersion?.fieldValues ?? [];

  return (
    <div style={{ padding: "1rem", maxWidth: "720px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1.5rem",
          gap: "1rem",
        }}
      >
        <div>
          <h2 style={{ margin: "0 0 0.5rem 0" }}>{proposal.title}</h2>
          <p style={{ margin: "0 0 0.25rem 0", fontSize: "0.875rem", color: "#6b7280" }}>
            {proposal.proposalType.name}
          </p>
          <span
            style={{
              display: "inline-block",
              padding: "0.25rem 0.625rem",
              borderRadius: "9999px",
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "#fff",
              backgroundColor:
                proposal.status === "DRAFT"
                  ? "#888"
                  : proposal.status === "SUBMITTED"
                  ? "#2563eb"
                  : proposal.status === "UNDER_REVIEW"
                  ? "#d97706"
                  : proposal.status === "APPROVED"
                  ? "#16a34a"
                  : proposal.status === "REJECTED"
                  ? "#dc2626"
                  : proposal.status === "RETURNED"
                  ? "#7c3aed"
                  : "#888",
            }}
          >
            {proposal.status.replace(/_/g, " ")}
          </span>
        </div>

        {proposal.status === "DRAFT" && (
          <button
            type="button"
            onClick={() => navigate(`/proposals/new/${proposal.proposalType.id}`)}
            aria-label="Edit draft proposal"
            style={{
              padding: "0.5rem 1rem",
              border: "1px solid #d1d5db",
              borderRadius: "0.375rem",
              backgroundColor: "#fff",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: 500,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            Edit Draft
          </button>
        )}
      </div>

      {/* Phase 9 action buttons */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <button
          type="button"
          onClick={() => navigate(`/proposals/${id}/history`)}
          aria-label="View change history"
          style={{
            padding: "0.375rem 0.75rem",
            border: "1px solid #d1d5db",
            borderRadius: "0.375rem",
            backgroundColor: "#fff",
            cursor: "pointer",
            fontSize: "0.8125rem",
          }}
        >
          View Change History
        </button>

        {versions.length > 1 && (
          <button
            type="button"
            onClick={() => navigate(`/proposals/${id}/compare`)}
            aria-label="Compare versions"
            style={{
              padding: "0.375rem 0.75rem",
              border: "1px solid #d1d5db",
              borderRadius: "0.375rem",
              backgroundColor: "#fff",
              cursor: "pointer",
              fontSize: "0.8125rem",
            }}
          >
            Compare Versions
          </button>
        )}

        {proposal.status === "RETURNED_TO_APPLICANT" && isApplicant && (
          <button
            type="button"
            onClick={() => setShowResubmitConfirm(true)}
            aria-label="Resubmit proposal"
            style={{
              padding: "0.375rem 0.75rem",
              border: "none",
              borderRadius: "0.375rem",
              backgroundColor: "#7c3aed",
              color: "#fff",
              cursor: "pointer",
              fontSize: "0.8125rem",
              fontWeight: 500,
            }}
          >
            Resubmit
          </button>
        )}
      </div>

      {resubmitError && (
        <p role="alert" style={{ color: "#dc2626", fontSize: "0.875rem", marginBottom: "1rem" }}>
          {resubmitError}
        </p>
      )}

      {/* Admin: staff assignment panel */}
      {isAdmin && (
        <section
          aria-label="Staff assignments"
          style={{ marginBottom: "2rem", border: "1px solid #e5e7eb", borderRadius: "0.5rem", padding: "1rem" }}
        >
          <h3
            style={{
              margin: "0 0 0.75rem 0",
              fontSize: "1rem",
              fontWeight: 600,
              borderBottom: "1px solid #e5e7eb",
              paddingBottom: "0.5rem",
            }}
          >
            Staff Assignments
          </h3>

          {assignments.length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "1rem" }}>
              No staff assigned to this proposal yet.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: "0 0 1rem 0", padding: 0 }}>
              {assignments.map((a) => (
                <li
                  key={a.id}
                  role="listitem"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.75rem",
                    border: "1px solid #e5e7eb",
                    borderRadius: "0.375rem",
                    marginBottom: "0.5rem",
                    gap: "1rem",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: "0 0 0.125rem 0", fontWeight: 500, fontSize: "0.875rem" }}>
                      {a.user.firstName} {a.user.lastName}{" "}
                      <span style={{ fontWeight: 400, color: "#6b7280" }}>({a.user.email})</span>
                    </p>
                    <p style={{ margin: 0, fontSize: "0.75rem", color: "#9ca3af" }}>{a.roleCode}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleUnassign(a.id)}
                    disabled={unassigningId === a.id}
                    aria-label={`Unassign ${a.user.firstName} ${a.user.lastName}`}
                    style={{
                      minHeight: "44px",
                      padding: "0.5rem 1rem",
                      border: "1px solid #d1d5db",
                      borderRadius: "0.375rem",
                      backgroundColor: "#fff",
                      cursor: unassigningId === a.id ? "not-allowed" : "pointer",
                      fontSize: "0.8125rem",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    {unassigningId === a.id ? "Removing…" : "Unassign"}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              flexWrap: "wrap",
              alignItems: "flex-end",
              border: "1px solid #e5e7eb",
              borderRadius: "0.375rem",
              padding: "0.75rem",
            }}
          >
            <div style={{ flex: "1 1 200px" }}>
              <label
                htmlFor="assign-user"
                style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500, fontSize: "0.8125rem" }}
              >
                Staff member
              </label>
              <select
                id="assign-user"
                aria-label="Select staff member to assign"
                value={assignUserId}
                onChange={(e) => setAssignUserId(e.target.value)}
                style={{
                  width: "100%",
                  minHeight: "44px",
                  padding: "0.5rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.375rem",
                  fontSize: "0.875rem",
                }}
              >
                <option value="">— Select staff —</option>
                {assignableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName} ({u.email})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ flex: "0 1 180px" }}>
              <label
                htmlFor="assign-role"
                style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500, fontSize: "0.8125rem" }}
              >
                Role
              </label>
              <select
                id="assign-role"
                aria-label="Select role for assignment"
                value={assignRoleCode}
                onChange={(e) => setAssignRoleCode(e.target.value)}
                style={{
                  width: "100%",
                  minHeight: "44px",
                  padding: "0.5rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.375rem",
                  fontSize: "0.875rem",
                }}
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => void handleAssign()}
              disabled={assigning || !assignUserId}
              aria-label="Assign staff to proposal"
              style={{
                minHeight: "44px",
                padding: "0.5rem 1rem",
                border: "none",
                borderRadius: "0.375rem",
                backgroundColor: "#2563eb",
                color: "#fff",
                cursor: assigning || !assignUserId ? "not-allowed" : "pointer",
                fontSize: "0.875rem",
                fontWeight: 500,
                opacity: assigning || !assignUserId ? 0.6 : 1,
              }}
            >
              {assigning ? "Assigning…" : "Assign"}
            </button>
          </div>

          {assignError && (
            <p role="alert" style={{ color: "#dc2626", fontSize: "0.8125rem", margin: "0.75rem 0 0 0" }}>
              {assignError}
            </p>
          )}
        </section>
      )}

      {/* Field values */}
      {fieldValues.length > 0 && (
        <section style={{ marginBottom: "2rem" }}>
          <h3
            style={{
              margin: "0 0 0.75rem 0",
              fontSize: "1rem",
              fontWeight: 600,
              borderBottom: "1px solid #e5e7eb",
              paddingBottom: "0.5rem",
            }}
          >
            Form Responses
          </h3>
          <dl style={{ margin: 0 }}>
            {fieldValues.map(({ formFieldId, value }) => (
              <div
                key={formFieldId}
                style={{ marginBottom: "0.75rem" }}
              >
                <dt
                  style={{
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                    color: "#6b7280",
                    marginBottom: "0.125rem",
                  }}
                >
                  {formFieldId}
                </dt>
                <dd
                  style={{
                    margin: 0,
                    fontSize: "0.9375rem",
                    color: value ? "#111827" : "#9ca3af",
                  }}
                >
                  {value ?? "—"}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* Attachments */}
      <section style={{ marginBottom: "2rem" }}>
        <h3
          style={{
            margin: "0 0 0.75rem 0",
            fontSize: "1rem",
            fontWeight: 600,
            borderBottom: "1px solid #e5e7eb",
            paddingBottom: "0.5rem",
          }}
        >
          Attachments
        </h3>

        {downloadError && (
          <p role="alert" style={{ color: "#dc2626", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
            {downloadError}
          </p>
        )}

        {attachments.length === 0 ? (
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>No attachments uploaded.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {attachments.map((attachment) => (
              <li
                key={attachment.id}
                role="listitem"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.75rem",
                  border: "1px solid #e5e7eb",
                  borderRadius: "0.375rem",
                  marginBottom: "0.5rem",
                  gap: "1rem",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: "0 0 0.125rem 0",
                      fontWeight: 500,
                      fontSize: "0.875rem",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {attachment.originalFilename}
                  </p>
                  <p style={{ margin: 0, fontSize: "0.75rem", color: "#9ca3af" }}>
                    {attachment.contentType} &middot;{" "}
                    {(attachment.sizeBytes / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDownload(attachment.id)}
                  aria-label={`Download ${attachment.originalFilename}`}
                  style={{
                    padding: "0.375rem 0.75rem",
                    border: "1px solid #d1d5db",
                    borderRadius: "0.375rem",
                    backgroundColor: "#fff",
                    cursor: "pointer",
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  Download
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Comments */}
      <section style={{ marginBottom: "2rem" }}>
        <h3
          style={{
            margin: "0 0 0.75rem 0",
            fontSize: "1rem",
            fontWeight: 600,
            borderBottom: "1px solid #e5e7eb",
            paddingBottom: "0.5rem",
          }}
        >
          Comments
        </h3>

        {visibleComments.length === 0 ? (
          <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "1rem" }}>
            No comments yet.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: "0 0 1rem 0", padding: 0 }}>
            {visibleComments.map((comment) => (
              <li
                key={comment.id}
                role="listitem"
                style={{
                  padding: "0.75rem",
                  border: `1px solid ${comment.visibility === "INTERNAL" ? "#fde68a" : "#e5e7eb"}`,
                  borderRadius: "0.375rem",
                  marginBottom: "0.5rem",
                  backgroundColor: comment.isResolved ? "#f9fafb" : "#fff",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: "0 0 0.25rem 0", fontSize: "0.875rem" }}>{comment.body}</p>
                    <p style={{ margin: 0, fontSize: "0.75rem", color: "#9ca3af" }}>
                      {comment.commentType}
                      {comment.visibility === "INTERNAL" && (
                        <span style={{ marginLeft: "0.5rem", color: "#d97706", fontWeight: 600 }}>INTERNAL</span>
                      )}
                      {" · "}
                      {new Date(comment.createdAt).toLocaleDateString()}
                      {comment.isResolved && (
                        <span style={{ marginLeft: "0.5rem", color: "#16a34a" }}> · Resolved</span>
                      )}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "0.375rem", flexShrink: 0 }}>
                    {!comment.isResolved && (isAdmin || comment.authorUserId === "current") && (
                      <button
                        type="button"
                        onClick={() => void handleResolveComment(comment.id)}
                        aria-label="Resolve comment"
                        style={{
                          padding: "0.25rem 0.5rem",
                          border: "1px solid #d1d5db",
                          borderRadius: "0.25rem",
                          backgroundColor: "#fff",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                        }}
                      >
                        Resolve
                      </button>
                    )}
                    {comment.isResolved && (isAdmin || comment.authorUserId === "current") && (
                      <button
                        type="button"
                        onClick={() => void handleReopenComment(comment.id)}
                        aria-label="Reopen comment"
                        style={{
                          padding: "0.25rem 0.5rem",
                          border: "1px solid #d1d5db",
                          borderRadius: "0.25rem",
                          backgroundColor: "#fff",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                        }}
                      >
                        Reopen
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Add comment form */}
        <div style={{ border: "1px solid #e5e7eb", borderRadius: "0.375rem", padding: "0.75rem" }}>
          <div style={{ marginBottom: "0.5rem" }}>
            <label htmlFor="comment-type" style={{ fontSize: "0.8125rem", fontWeight: 500, marginRight: "0.5rem" }}>
              Type:
            </label>
            <select
              id="comment-type"
              value={commentType}
              onChange={(e) => setCommentType(e.target.value as "GENERAL" | "FIELD" | "SECTION")}
              style={{ fontSize: "0.8125rem", padding: "0.25rem 0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem" }}
            >
              <option value="GENERAL">General</option>
              <option value="FIELD">Field</option>
              <option value="SECTION">Section</option>
            </select>
          </div>
          <textarea
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder="Add a comment…"
            rows={3}
            aria-label="Comment text"
            style={{
              width: "100%",
              padding: "0.5rem",
              border: "1px solid #d1d5db",
              borderRadius: "0.25rem",
              fontSize: "0.875rem",
              resize: "vertical",
              boxSizing: "border-box",
              marginBottom: "0.5rem",
            }}
          />
          {commentError && (
            <p role="alert" style={{ color: "#dc2626", fontSize: "0.8125rem", margin: "0 0 0.5rem 0" }}>
              {commentError}
            </p>
          )}
          <button
            type="button"
            onClick={() => void handleAddComment()}
            disabled={addingComment || !commentBody.trim()}
            aria-label="Submit comment"
            style={{
              padding: "0.375rem 0.75rem",
              border: "none",
              borderRadius: "0.25rem",
              backgroundColor: "#2563eb",
              color: "#fff",
              cursor: addingComment || !commentBody.trim() ? "not-allowed" : "pointer",
              fontSize: "0.8125rem",
              opacity: addingComment || !commentBody.trim() ? 0.6 : 1,
            }}
          >
            {addingComment ? "Adding…" : "Add Comment"}
          </button>
        </div>
      </section>

      {/* Resubmit confirmation dialog */}
      {showResubmitConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="resubmit-confirm-title"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: "0.5rem",
              padding: "1.5rem",
              maxWidth: "400px",
              width: "90%",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
            }}
          >
            <h3 id="resubmit-confirm-title" style={{ margin: "0 0 0.75rem 0", fontSize: "1rem" }}>
              Resubmit Proposal
            </h3>
            <p style={{ margin: "0 0 1.25rem 0", fontSize: "0.875rem", color: "#374151" }}>
              Resubmitting will create a new version.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShowResubmitConfirm(false)}
                aria-label="Cancel resubmission"
                style={{
                  padding: "0.5rem 1rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.375rem",
                  backgroundColor: "#fff",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleResubmit()}
                disabled={resubmitting}
                aria-label="Confirm resubmission"
                style={{
                  padding: "0.5rem 1rem",
                  border: "none",
                  borderRadius: "0.375rem",
                  backgroundColor: "#7c3aed",
                  color: "#fff",
                  cursor: resubmitting ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  opacity: resubmitting ? 0.7 : 1,
                }}
              >
                {resubmitting ? "Resubmitting…" : "Confirm Resubmit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
