import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  api,
  phase9Api,
  assignmentsApi,
  adminApi,
  workflowApi,
  phase12Api,
  exportApi,
  type ProposalExportResult,
  type AttachmentMeta,
  type ProposalDetail,
  type ProposalComment,
  type CommentPayload,
  type ProposalVersionSummary,
  type ProposalAssignment,
  type AdminUser,
  type WorkflowHistoryEntry,
  type RtecGroupSummary,
} from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";

const ASSIGNABLE_ROLES = ["PROJECT_FOCAL", "BUDGET_OFFICER", "ACCOUNTANT"];

interface DownloadResponse {
  url: string;
}

const WORKFLOW_ACTION_LABELS: Record<string, string> = {
  ACKNOWLEDGE: "Acknowledged by Focal",
  RETURN_TO_APPLICANT: "Returned to Applicant",
  ENDORSE_TO_RTEC: "Endorsed to RTEC",
  CONFIRM_RTEC_ASSIGNMENT: "RTEC Assigned",
  ENDORSE_TO_BUDGET: "Endorsed to Budget",
  RETURN_TO_RTEC: "Returned to RTEC",
  FOCAL_REROUTE: "Re-routed by Focal",
};

function workflowActionLabel(action: string): string {
  if (WORKFLOW_ACTION_LABELS[action]) return WORKFLOW_ACTION_LABELS[action];
  return action
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
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

  // Focal workflow actions
  const [focalActionError, setFocalActionError] = useState<string | null>(null);
  const [focalActioning, setFocalActioning] = useState(false);

  // Return-to-applicant modal
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnComment, setReturnComment] = useState("");

  // Endorse-to-RTEC modal
  const [showEndorseRtecModal, setShowEndorseRtecModal] = useState(false);
  const [rtecGroups, setRtecGroups] = useState<RtecGroupSummary[]>([]);
  const [selectedRtecGroupId, setSelectedRtecGroupId] = useState("");
  const [endorseRtecComment, setEndorseRtecComment] = useState("");

  // Endorse-to-budget modal
  const [showEndorseBudgetModal, setShowEndorseBudgetModal] = useState(false);
  const [endorseBudgetComment, setEndorseBudgetComment] = useState("");

  // Return-to-RTEC modal
  const [showReturnRtecModal, setShowReturnRtecModal] = useState(false);
  const [returnRtecComment, setReturnRtecComment] = useState("");

  // Focal re-route (RETURNED_BY_ACCOUNTING → UNDER_FOCAL_REVIEW)
  const [showFocalRerouteModal, setShowFocalRerouteModal] = useState(false);
  const [focalRerouteComment, setFocalRerouteComment] = useState("");

  // Budget Officer actions
  const [budgetActionError, setBudgetActionError] = useState<string | null>(null);
  const [budgetActioning, setBudgetActioning] = useState(false);
  const [showBudgetReturnModal, setShowBudgetReturnModal] = useState(false);
  const [budgetReturnComment, setBudgetReturnComment] = useState("");
  const [showBudgetEndorseModal, setShowBudgetEndorseModal] = useState(false);
  const [budgetEndorseComment, setBudgetEndorseComment] = useState("");
  const [showBudgetReEndorseModal, setShowBudgetReEndorseModal] = useState(false);
  const [budgetReEndorseComment, setBudgetReEndorseComment] = useState("");

  // Accountant actions
  const [accountingActionError, setAccountingActionError] = useState<string | null>(null);
  const [accountingActioning, setAccountingActioning] = useState(false);
  const [showAcctReturnBudgetModal, setShowAcctReturnBudgetModal] = useState(false);
  const [acctReturnBudgetComment, setAcctReturnBudgetComment] = useState("");
  const [showAcctReturnFocalModal, setShowAcctReturnFocalModal] = useState(false);
  const [acctReturnFocalComment, setAcctReturnFocalComment] = useState("");
  const [showAcctEndorseRdModal, setShowAcctEndorseRdModal] = useState(false);
  const [acctEndorseRdComment, setAcctEndorseRdComment] = useState("");

  // Regional Director actions
  const [rdActionError, setRdActionError] = useState<string | null>(null);
  const [rdActioning, setRdActioning] = useState(false);
  const [showRdApproveModal, setShowRdApproveModal] = useState(false);
  const [rdApproveComment, setRdApproveComment] = useState("");
  const [showRdRejectModal, setShowRdRejectModal] = useState(false);
  const [rdRejectComment, setRdRejectComment] = useState("");
  const [showRdDeferModal, setShowRdDeferModal] = useState(false);
  const [rdDeferReason, setRdDeferReason] = useState("");
  const [showRdReturnModal, setShowRdReturnModal] = useState(false);
  const [rdReturnComment, setRdReturnComment] = useState("");

  // Workflow history
  const [workflowHistory, setWorkflowHistory] = useState<WorkflowHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Document export
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState<ProposalExportResult | null>(null);

  useEffect(() => {
    if (!id) {
      setError("Missing proposal ID.");
      setLoading(false);
      return;
    }

    setHistoryLoading(true);
    Promise.all([
      api.get<ProposalDetail>(`/api/proposals/${id}`),
      api.get<AttachmentMeta[]>(`/api/proposals/${id}/attachments`),
      phase9Api.getComments(id),
      phase9Api.getVersions(id),
      workflowApi.getHistory(id),
    ])
      .then(([proposalData, attachmentData, commentData, versionData, historyData]) => {
        setProposal(proposalData);
        setAttachments(attachmentData);
        setComments(commentData);
        setVersions(versionData);
        setWorkflowHistory(historyData.history);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to load proposal";
        setError(message);
      })
      .finally(() => {
        setLoading(false);
        setHistoryLoading(false);
      });

    exportApi
      .getLatest(id)
      .then(setLastExport)
      .catch(() => {
        // 404 (no prior export) or any other failure — silent, export
        // section just won't show a "last generated" hint
      });
  }, [id]);

  const loadWorkflowHistory = () => {
    if (!id) return;
    workflowApi
      .getHistory(id)
      .then((data) => setWorkflowHistory(data.history))
      .catch(() => {
        // silent — history section shows existing data
      });
  };

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

  useEffect(() => {
    if (!showEndorseRtecModal) return;
    workflowApi
      .listRtecGroups()
      .then(({ groups }) => {
        setRtecGroups(groups);
        if (groups.length === 1) {
          setSelectedRtecGroupId(groups[0].id);
        }
      })
      .catch(() => setRtecGroups([]));
  }, [showEndorseRtecModal]);

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

  async function handleAcknowledge() {
    if (!id) return;
    setFocalActionError(null);
    setFocalActioning(true);
    try {
      const result = await workflowApi.acknowledge(id);
      setProposal((prev) => (prev ? { ...prev, status: result.status } : prev));
      loadWorkflowHistory();
    } catch (err: unknown) {
      setFocalActionError(err instanceof Error ? err.message : "Failed to acknowledge proposal.");
    } finally {
      setFocalActioning(false);
    }
  }

  async function handleReturnToApplicant() {
    if (!id) return;
    if (!returnComment.trim()) {
      setFocalActionError("A comment is required to return the proposal to the applicant.");
      return;
    }
    setFocalActionError(null);
    setFocalActioning(true);
    try {
      const result = await workflowApi.returnToApplicant(id, returnComment);
      setProposal((prev) => (prev ? { ...prev, status: result.status } : prev));
      setShowReturnModal(false);
      setReturnComment("");
      loadWorkflowHistory();
    } catch (err: unknown) {
      setFocalActionError(err instanceof Error ? err.message : "Failed to return proposal to applicant.");
    } finally {
      setFocalActioning(false);
    }
  }

  async function handleEndorseToRtec() {
    if (!id) return;
    if (!selectedRtecGroupId) {
      setFocalActionError("Select an RTEC group to endorse this proposal to.");
      return;
    }
    setFocalActionError(null);
    setFocalActioning(true);
    try {
      const result = await workflowApi.endorseToRtec(
        id,
        selectedRtecGroupId,
        endorseRtecComment || undefined,
      );
      setProposal((prev) => (prev ? { ...prev, status: result.status } : prev));
      setShowEndorseRtecModal(false);
      setEndorseRtecComment("");
      setSelectedRtecGroupId("");
      loadWorkflowHistory();
    } catch (err: unknown) {
      setFocalActionError(err instanceof Error ? err.message : "Failed to endorse proposal to RTEC.");
    } finally {
      setFocalActioning(false);
    }
  }

  async function handleEndorseToBudget() {
    if (!id) return;
    setFocalActionError(null);
    setFocalActioning(true);
    try {
      const result = await workflowApi.endorseToBudget(id, endorseBudgetComment || undefined);
      setProposal((prev) => (prev ? { ...prev, status: result.status } : prev));
      setShowEndorseBudgetModal(false);
      setEndorseBudgetComment("");
      loadWorkflowHistory();
    } catch (err: unknown) {
      setFocalActionError(err instanceof Error ? err.message : "Failed to endorse proposal to budget.");
    } finally {
      setFocalActioning(false);
    }
  }

  async function handleReturnToRtec() {
    if (!id) return;
    if (!returnRtecComment.trim()) {
      setFocalActionError("A comment is required to return the proposal to RTEC.");
      return;
    }
    setFocalActionError(null);
    setFocalActioning(true);
    try {
      const result = await workflowApi.returnToRtec(id, returnRtecComment);
      setProposal((prev) => (prev ? { ...prev, status: result.status } : prev));
      setShowReturnRtecModal(false);
      setReturnRtecComment("");
      loadWorkflowHistory();
    } catch (err: unknown) {
      setFocalActionError(err instanceof Error ? err.message : "Failed to return proposal to RTEC.");
    } finally {
      setFocalActioning(false);
    }
  }

  async function handleFocalReroute() {
    if (!id) return;
    if (!focalRerouteComment.trim()) {
      setFocalActionError("A comment is required to re-route this proposal.");
      return;
    }
    setFocalActionError(null);
    setFocalActioning(true);
    try {
      const result = await phase12Api.focalReroute(id, focalRerouteComment);
      setProposal((prev) => (prev ? { ...prev, status: result.status } : prev));
      setShowFocalRerouteModal(false);
      setFocalRerouteComment("");
      loadWorkflowHistory();
    } catch (err: unknown) {
      setFocalActionError(err instanceof Error ? err.message : "Failed to re-route proposal.");
    } finally {
      setFocalActioning(false);
    }
  }

  async function handleBudgetOpen() {
    if (!id) return;
    setBudgetActionError(null);
    setBudgetActioning(true);
    try {
      const result = await phase12Api.budgetOpen(id);
      setProposal((prev) => (prev ? { ...prev, status: result.status } : prev));
      loadWorkflowHistory();
    } catch (err: unknown) {
      setBudgetActionError(err instanceof Error ? err.message : "Failed to open proposal for review.");
    } finally {
      setBudgetActioning(false);
    }
  }

  async function handleBudgetReturn() {
    if (!id) return;
    if (!budgetReturnComment.trim()) {
      setBudgetActionError("A comment is required to return this proposal to Focal.");
      return;
    }
    setBudgetActionError(null);
    setBudgetActioning(true);
    try {
      const result = await phase12Api.budgetReturn(id, budgetReturnComment);
      setProposal((prev) => (prev ? { ...prev, status: result.status } : prev));
      setShowBudgetReturnModal(false);
      setBudgetReturnComment("");
      loadWorkflowHistory();
    } catch (err: unknown) {
      setBudgetActionError(err instanceof Error ? err.message : "Failed to return proposal to Focal.");
    } finally {
      setBudgetActioning(false);
    }
  }

  async function handleBudgetEndorse() {
    if (!id) return;
    setBudgetActionError(null);
    setBudgetActioning(true);
    try {
      const result = await phase12Api.budgetEndorse(id, budgetEndorseComment || undefined);
      setProposal((prev) => (prev ? { ...prev, status: result.status } : prev));
      setShowBudgetEndorseModal(false);
      setBudgetEndorseComment("");
      loadWorkflowHistory();
    } catch (err: unknown) {
      setBudgetActionError(err instanceof Error ? err.message : "Failed to endorse proposal to Accounting.");
    } finally {
      setBudgetActioning(false);
    }
  }

  async function handleBudgetReEndorse() {
    if (!id) return;
    setBudgetActionError(null);
    setBudgetActioning(true);
    try {
      const result = await phase12Api.budgetReEndorse(id, budgetReEndorseComment || undefined);
      setProposal((prev) => (prev ? { ...prev, status: result.status } : prev));
      setShowBudgetReEndorseModal(false);
      setBudgetReEndorseComment("");
      loadWorkflowHistory();
    } catch (err: unknown) {
      setBudgetActionError(err instanceof Error ? err.message : "Failed to re-endorse proposal to Accounting.");
    } finally {
      setBudgetActioning(false);
    }
  }

  async function handleAccountingOpen() {
    if (!id) return;
    setAccountingActionError(null);
    setAccountingActioning(true);
    try {
      const result = await phase12Api.accountingOpen(id);
      setProposal((prev) => (prev ? { ...prev, status: result.status } : prev));
      loadWorkflowHistory();
    } catch (err: unknown) {
      setAccountingActionError(err instanceof Error ? err.message : "Failed to open proposal for review.");
    } finally {
      setAccountingActioning(false);
    }
  }

  async function handleAccountingReturnToBudget() {
    if (!id) return;
    if (!acctReturnBudgetComment.trim()) {
      setAccountingActionError("A comment is required to return this proposal to Budget.");
      return;
    }
    setAccountingActionError(null);
    setAccountingActioning(true);
    try {
      const result = await phase12Api.accountingReturnToBudget(id, acctReturnBudgetComment);
      setProposal((prev) => (prev ? { ...prev, status: result.status } : prev));
      setShowAcctReturnBudgetModal(false);
      setAcctReturnBudgetComment("");
      loadWorkflowHistory();
    } catch (err: unknown) {
      setAccountingActionError(err instanceof Error ? err.message : "Failed to return proposal to Budget.");
    } finally {
      setAccountingActioning(false);
    }
  }

  async function handleAccountingReturnToFocal() {
    if (!id) return;
    if (!acctReturnFocalComment.trim()) {
      setAccountingActionError("A comment is required to return this proposal to Focal.");
      return;
    }
    setAccountingActionError(null);
    setAccountingActioning(true);
    try {
      const result = await phase12Api.accountingReturnToFocal(id, acctReturnFocalComment);
      setProposal((prev) => (prev ? { ...prev, status: result.status } : prev));
      setShowAcctReturnFocalModal(false);
      setAcctReturnFocalComment("");
      loadWorkflowHistory();
    } catch (err: unknown) {
      setAccountingActionError(err instanceof Error ? err.message : "Failed to return proposal to Focal.");
    } finally {
      setAccountingActioning(false);
    }
  }

  async function handleAccountingEndorseToRd() {
    if (!id) return;
    setAccountingActionError(null);
    setAccountingActioning(true);
    try {
      const result = await phase12Api.accountingEndorseToRd(id, acctEndorseRdComment || undefined);
      setProposal((prev) => (prev ? { ...prev, status: result.status } : prev));
      setShowAcctEndorseRdModal(false);
      setAcctEndorseRdComment("");
      loadWorkflowHistory();
    } catch (err: unknown) {
      setAccountingActionError(err instanceof Error ? err.message : "Failed to endorse proposal to RD.");
    } finally {
      setAccountingActioning(false);
    }
  }

  async function handleRdOpen() {
    if (!id) return;
    setRdActionError(null);
    setRdActioning(true);
    try {
      const result = await phase12Api.rdOpen(id);
      setProposal((prev) => (prev ? { ...prev, status: result.status } : prev));
      loadWorkflowHistory();
    } catch (err: unknown) {
      setRdActionError(err instanceof Error ? err.message : "Failed to open proposal for review.");
    } finally {
      setRdActioning(false);
    }
  }

  async function handleRdApprove() {
    if (!id) return;
    if (!rdApproveComment.trim()) {
      setRdActionError("A comment is required to approve this proposal.");
      return;
    }
    setRdActionError(null);
    setRdActioning(true);
    try {
      const result = await phase12Api.rdApprove(id, rdApproveComment);
      setProposal((prev) => (prev ? { ...prev, status: result.status } : prev));
      setShowRdApproveModal(false);
      setRdApproveComment("");
      loadWorkflowHistory();
    } catch (err: unknown) {
      setRdActionError(err instanceof Error ? err.message : "Failed to approve proposal.");
    } finally {
      setRdActioning(false);
    }
  }

  async function handleRdReject() {
    if (!id) return;
    if (!rdRejectComment.trim()) {
      setRdActionError("A comment is required to reject this proposal.");
      return;
    }
    setRdActionError(null);
    setRdActioning(true);
    try {
      const result = await phase12Api.rdReject(id, rdRejectComment);
      setProposal((prev) => (prev ? { ...prev, status: result.status } : prev));
      setShowRdRejectModal(false);
      setRdRejectComment("");
      loadWorkflowHistory();
    } catch (err: unknown) {
      setRdActionError(err instanceof Error ? err.message : "Failed to reject proposal.");
    } finally {
      setRdActioning(false);
    }
  }

  async function handleRdDefer() {
    if (!id) return;
    if (!rdDeferReason.trim()) {
      setRdActionError("A reason is required to defer this proposal.");
      return;
    }
    setRdActionError(null);
    setRdActioning(true);
    try {
      const result = await phase12Api.rdDefer(id, rdDeferReason);
      setProposal((prev) => (prev ? { ...prev, status: result.status } : prev));
      setShowRdDeferModal(false);
      setRdDeferReason("");
      loadWorkflowHistory();
    } catch (err: unknown) {
      setRdActionError(err instanceof Error ? err.message : "Failed to defer proposal.");
    } finally {
      setRdActioning(false);
    }
  }

  async function handleRdResume() {
    if (!id) return;
    setRdActionError(null);
    setRdActioning(true);
    try {
      const result = await phase12Api.rdResume(id);
      setProposal((prev) => (prev ? { ...prev, status: result.status } : prev));
      loadWorkflowHistory();
    } catch (err: unknown) {
      setRdActionError(err instanceof Error ? err.message : "Failed to resume review.");
    } finally {
      setRdActioning(false);
    }
  }

  async function handleRdReturn() {
    if (!id) return;
    if (!rdReturnComment.trim()) {
      setRdActionError("A comment is required to return this proposal to the applicant.");
      return;
    }
    setRdActionError(null);
    setRdActioning(true);
    try {
      const result = await phase12Api.rdReturn(id, rdReturnComment);
      setProposal((prev) => (prev ? { ...prev, status: result.status } : prev));
      setShowRdReturnModal(false);
      setRdReturnComment("");
      loadWorkflowHistory();
    } catch (err: unknown) {
      setRdActionError(err instanceof Error ? err.message : "Failed to return proposal to applicant.");
    } finally {
      setRdActioning(false);
    }
  }

  async function handleExport() {
    if (!id) return;
    setExportError(null);
    setExporting(true);
    try {
      const result = await exportApi.generate(id);
      setLastExport(result);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 409) {
        setExportError("This proposal must be approved before it can be exported.");
      } else {
        setExportError(err instanceof Error ? err.message : "Export failed.");
      }
    } finally {
      setExporting(false);
    }
  }

  // Determine if current user is the proposal owner.
  // useAuth returns a stub — in production this would be the real user id.
  const isApplicant = role === "APPLICANT";
  const isAdmin = role === "ADMIN";
  const isFocal = role === "PROJECT_FOCAL";
  const isBudgetOfficer = role === "BUDGET_OFFICER";
  const isAccountant = role === "ACCOUNTANT";
  const isRd = role === "REGIONAL_DIRECTOR";

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

      {/* Focal workflow actions */}
      {isFocal && (
        <section
          aria-label="Focal workflow actions"
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
            Focal Actions
          </h3>

          {focalActionError && (
            <p role="alert" style={{ color: "#dc2626", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
              {focalActionError}
            </p>
          )}

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {(proposal.status === "SUBMITTED_TO_FOCAL" || proposal.status === "RESUBMITTED_TO_FOCAL") && (
              <button
                type="button"
                onClick={() => void handleAcknowledge()}
                disabled={focalActioning}
                aria-label="Acknowledge proposal"
                style={{
                  minHeight: "44px",
                  padding: "0.5rem 1rem",
                  border: "none",
                  borderRadius: "0.375rem",
                  backgroundColor: "#2563eb",
                  color: "#fff",
                  cursor: focalActioning ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  opacity: focalActioning ? 0.6 : 1,
                }}
              >
                {focalActioning ? "Processing…" : "Acknowledge"}
              </button>
            )}

            {proposal.status === "UNDER_FOCAL_REVIEW" && (
              <button
                type="button"
                onClick={() => setShowReturnModal(true)}
                disabled={focalActioning}
                aria-label="Return proposal to applicant"
                style={{
                  minHeight: "44px",
                  padding: "0.5rem 1rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.375rem",
                  backgroundColor: "#fff",
                  cursor: focalActioning ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  opacity: focalActioning ? 0.6 : 1,
                }}
              >
                Return to Applicant
              </button>
            )}

            {proposal.status === "UNDER_FOCAL_REVIEW" && (
              <button
                type="button"
                onClick={() => setShowEndorseRtecModal(true)}
                disabled={focalActioning}
                aria-label="Endorse proposal to RTEC"
                style={{
                  minHeight: "44px",
                  padding: "0.5rem 1rem",
                  border: "none",
                  borderRadius: "0.375rem",
                  backgroundColor: "#16a34a",
                  color: "#fff",
                  cursor: focalActioning ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  opacity: focalActioning ? 0.6 : 1,
                }}
              >
                Endorse to RTEC
              </button>
            )}

            {proposal.status === "RETURNED_TO_FOCAL_BY_RTEC" && (
              <button
                type="button"
                onClick={() => setShowEndorseBudgetModal(true)}
                disabled={focalActioning}
                aria-label="Endorse proposal to budget"
                style={{
                  minHeight: "44px",
                  padding: "0.5rem 1rem",
                  border: "none",
                  borderRadius: "0.375rem",
                  backgroundColor: "#16a34a",
                  color: "#fff",
                  cursor: focalActioning ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  opacity: focalActioning ? 0.6 : 1,
                }}
              >
                Endorse to Budget
              </button>
            )}

            {proposal.status === "RETURNED_TO_FOCAL_BY_RTEC" && (
              <button
                type="button"
                onClick={() => setShowReturnRtecModal(true)}
                disabled={focalActioning}
                aria-label="Return proposal to RTEC"
                style={{
                  minHeight: "44px",
                  padding: "0.5rem 1rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.375rem",
                  backgroundColor: "#fff",
                  cursor: focalActioning ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  opacity: focalActioning ? 0.6 : 1,
                }}
              >
                Return to RTEC
              </button>
            )}

            {proposal.status === "RETURNED_BY_ACCOUNTING" && (
              <button
                type="button"
                onClick={() => setShowFocalRerouteModal(true)}
                disabled={focalActioning}
                aria-label="Re-route for Focal Review"
                style={{
                  minHeight: "44px",
                  padding: "0.5rem 1rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.375rem",
                  backgroundColor: "#fff",
                  cursor: focalActioning ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  opacity: focalActioning ? 0.6 : 1,
                }}
              >
                Re-route for Focal Review
              </button>
            )}
          </div>
        </section>
      )}

      {/* Budget Officer workflow actions */}
      {isBudgetOfficer && (
        <section
          aria-label="Budget Officer workflow actions"
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
            Budget Actions
          </h3>

          {budgetActionError && (
            <p role="alert" style={{ color: "#dc2626", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
              {budgetActionError}
            </p>
          )}

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {proposal.status === "ENDORSED_TO_BUDGET" && (
              <button
                type="button"
                onClick={() => void handleBudgetOpen()}
                disabled={budgetActioning}
                aria-label="Open for Review"
                style={{
                  minHeight: "44px",
                  padding: "0.5rem 1rem",
                  border: "none",
                  borderRadius: "0.375rem",
                  backgroundColor: "#2563eb",
                  color: "#fff",
                  cursor: budgetActioning ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  opacity: budgetActioning ? 0.6 : 1,
                }}
              >
                {budgetActioning ? "Processing…" : "Open for Review"}
              </button>
            )}

            {proposal.status === "UNDER_BUDGET_REVIEW" && (
              <button
                type="button"
                onClick={() => setShowBudgetReturnModal(true)}
                disabled={budgetActioning}
                aria-label="Return to Focal"
                style={{
                  minHeight: "44px",
                  padding: "0.5rem 1rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.375rem",
                  backgroundColor: "#fff",
                  cursor: budgetActioning ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  opacity: budgetActioning ? 0.6 : 1,
                }}
              >
                Return to Focal
              </button>
            )}

            {proposal.status === "UNDER_BUDGET_REVIEW" && (
              <button
                type="button"
                onClick={() => setShowBudgetEndorseModal(true)}
                disabled={budgetActioning}
                aria-label="Endorse to Accounting"
                style={{
                  minHeight: "44px",
                  padding: "0.5rem 1rem",
                  border: "none",
                  borderRadius: "0.375rem",
                  backgroundColor: "#16a34a",
                  color: "#fff",
                  cursor: budgetActioning ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  opacity: budgetActioning ? 0.6 : 1,
                }}
              >
                Endorse to Accounting
              </button>
            )}

            {proposal.status === "RETURNED_BY_ACCOUNTING" && (
              <button
                type="button"
                onClick={() => setShowBudgetReEndorseModal(true)}
                disabled={budgetActioning}
                aria-label="Re-endorse to Accounting"
                style={{
                  minHeight: "44px",
                  padding: "0.5rem 1rem",
                  border: "none",
                  borderRadius: "0.375rem",
                  backgroundColor: "#16a34a",
                  color: "#fff",
                  cursor: budgetActioning ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  opacity: budgetActioning ? 0.6 : 1,
                }}
              >
                Re-endorse to Accounting
              </button>
            )}
          </div>
        </section>
      )}

      {/* Accountant workflow actions */}
      {isAccountant && (
        <section
          aria-label="Accountant workflow actions"
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
            Accounting Actions
          </h3>

          {accountingActionError && (
            <p role="alert" style={{ color: "#dc2626", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
              {accountingActionError}
            </p>
          )}

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {proposal.status === "ENDORSED_TO_ACCOUNTING" && (
              <button
                type="button"
                onClick={() => void handleAccountingOpen()}
                disabled={accountingActioning}
                aria-label="Open for Review"
                style={{
                  minHeight: "44px",
                  padding: "0.5rem 1rem",
                  border: "none",
                  borderRadius: "0.375rem",
                  backgroundColor: "#2563eb",
                  color: "#fff",
                  cursor: accountingActioning ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  opacity: accountingActioning ? 0.6 : 1,
                }}
              >
                {accountingActioning ? "Processing…" : "Open for Review"}
              </button>
            )}

            {proposal.status === "UNDER_ACCOUNTING_REVIEW" && (
              <button
                type="button"
                onClick={() => setShowAcctReturnBudgetModal(true)}
                disabled={accountingActioning}
                aria-label="Return to Budget"
                style={{
                  minHeight: "44px",
                  padding: "0.5rem 1rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.375rem",
                  backgroundColor: "#fff",
                  cursor: accountingActioning ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  opacity: accountingActioning ? 0.6 : 1,
                }}
              >
                Return to Budget
              </button>
            )}

            {proposal.status === "UNDER_ACCOUNTING_REVIEW" && (
              <button
                type="button"
                onClick={() => setShowAcctReturnFocalModal(true)}
                disabled={accountingActioning}
                aria-label="Return to Focal"
                style={{
                  minHeight: "44px",
                  padding: "0.5rem 1rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.375rem",
                  backgroundColor: "#fff",
                  cursor: accountingActioning ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  opacity: accountingActioning ? 0.6 : 1,
                }}
              >
                Return to Focal
              </button>
            )}

            {proposal.status === "UNDER_ACCOUNTING_REVIEW" && (
              <button
                type="button"
                onClick={() => setShowAcctEndorseRdModal(true)}
                disabled={accountingActioning}
                aria-label="Endorse to RD"
                style={{
                  minHeight: "44px",
                  padding: "0.5rem 1rem",
                  border: "none",
                  borderRadius: "0.375rem",
                  backgroundColor: "#16a34a",
                  color: "#fff",
                  cursor: accountingActioning ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  opacity: accountingActioning ? 0.6 : 1,
                }}
              >
                Endorse to RD
              </button>
            )}
          </div>
        </section>
      )}

      {/* Regional Director workflow actions */}
      {isRd && (
        <section
          aria-label="Regional Director workflow actions"
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
            Regional Director Actions
          </h3>

          {rdActionError && (
            <p role="alert" style={{ color: "#dc2626", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
              {rdActionError}
            </p>
          )}

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {proposal.status === "ENDORSED_TO_RD" && (
              <button
                type="button"
                onClick={() => void handleRdOpen()}
                disabled={rdActioning}
                aria-label="Open for Review"
                style={{
                  minHeight: "44px",
                  padding: "0.5rem 1rem",
                  border: "none",
                  borderRadius: "0.375rem",
                  backgroundColor: "#2563eb",
                  color: "#fff",
                  cursor: rdActioning ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  opacity: rdActioning ? 0.6 : 1,
                }}
              >
                {rdActioning ? "Processing…" : "Open for Review"}
              </button>
            )}

            {proposal.status === "UNDER_RD_REVIEW" && (
              <button
                type="button"
                onClick={() => setShowRdApproveModal(true)}
                disabled={rdActioning}
                aria-label="Approve"
                style={{
                  minHeight: "44px",
                  padding: "0.5rem 1rem",
                  border: "none",
                  borderRadius: "0.375rem",
                  backgroundColor: "#16a34a",
                  color: "#fff",
                  cursor: rdActioning ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  opacity: rdActioning ? 0.6 : 1,
                }}
              >
                Approve
              </button>
            )}

            {proposal.status === "UNDER_RD_REVIEW" && (
              <button
                type="button"
                onClick={() => setShowRdRejectModal(true)}
                disabled={rdActioning}
                aria-label="Reject"
                style={{
                  minHeight: "44px",
                  padding: "0.5rem 1rem",
                  border: "none",
                  borderRadius: "0.375rem",
                  backgroundColor: "#dc2626",
                  color: "#fff",
                  cursor: rdActioning ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  opacity: rdActioning ? 0.6 : 1,
                }}
              >
                Reject
              </button>
            )}

            {proposal.status === "UNDER_RD_REVIEW" && (
              <button
                type="button"
                onClick={() => setShowRdDeferModal(true)}
                disabled={rdActioning}
                aria-label="Defer"
                style={{
                  minHeight: "44px",
                  padding: "0.5rem 1rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.375rem",
                  backgroundColor: "#fff",
                  cursor: rdActioning ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  opacity: rdActioning ? 0.6 : 1,
                }}
              >
                Defer
              </button>
            )}

            {proposal.status === "UNDER_RD_REVIEW" && (
              <button
                type="button"
                onClick={() => setShowRdReturnModal(true)}
                disabled={rdActioning}
                aria-label="Return to Applicant"
                style={{
                  minHeight: "44px",
                  padding: "0.5rem 1rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.375rem",
                  backgroundColor: "#fff",
                  cursor: rdActioning ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  opacity: rdActioning ? 0.6 : 1,
                }}
              >
                Return to Applicant
              </button>
            )}

            {proposal.status === "DEFERRED" && (
              <button
                type="button"
                onClick={() => void handleRdResume()}
                disabled={rdActioning}
                aria-label="Resume Review"
                style={{
                  minHeight: "44px",
                  padding: "0.5rem 1rem",
                  border: "none",
                  borderRadius: "0.375rem",
                  backgroundColor: "#2563eb",
                  color: "#fff",
                  cursor: rdActioning ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  opacity: rdActioning ? 0.6 : 1,
                }}
              >
                {rdActioning ? "Processing…" : "Resume Review"}
              </button>
            )}
          </div>
        </section>
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

      {/* Workflow History */}
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
          Workflow History
        </h3>

        {historyLoading ? (
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>Loading history…</p>
        ) : workflowHistory.length === 0 ? (
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>No workflow history yet.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {[...workflowHistory].reverse().map((entry) => (
              <li
                key={entry.id}
                style={{
                  padding: "0.75rem",
                  border: "1px solid #e5e7eb",
                  borderRadius: "0.375rem",
                  marginBottom: "0.5rem",
                }}
              >
                <p style={{ margin: "0 0 0.25rem 0", fontWeight: 500, fontSize: "0.875rem" }}>
                  {workflowActionLabel(entry.workflowAction)}
                </p>
                <p style={{ margin: "0 0 0.25rem 0", fontSize: "0.75rem", color: "#6b7280" }}>
                  {entry.actorRole} · {entry.fromStatus.replace(/_/g, " ")} → {entry.toStatus.replace(/_/g, " ")}
                  {" · "}
                  {new Date(entry.transitionedAt).toLocaleString()}
                </p>
                {entry.comment && (
                  <p style={{ margin: 0, fontSize: "0.8125rem", color: "#374151" }}>{entry.comment}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Document Export */}
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
          Document Export
        </h3>

        {proposal.status !== "APPROVED" && (
          <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
            Export is available once the proposal is approved.
          </p>
        )}

        {exportError && (
          <p role="alert" style={{ color: "#dc2626", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
            {exportError}
          </p>
        )}

        {proposal.status === "APPROVED" && (
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={exporting}
              aria-label="Generate and download proposal export"
              style={{
                minHeight: "44px",
                padding: "0.5rem 1rem",
                border: "none",
                borderRadius: "0.375rem",
                backgroundColor: "#2563eb",
                color: "#fff",
                cursor: exporting ? "not-allowed" : "pointer",
                fontSize: "0.875rem",
                fontWeight: 500,
                opacity: exporting ? 0.7 : 1,
              }}
            >
              {exporting ? "Generating…" : "Download Export"}
            </button>

            {lastExport && (
              <p style={{ fontSize: "0.8125rem", color: "#6b7280", margin: 0 }}>
                Last generated:{" "}
                {new Date(lastExport.generatedAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}{" "}
                —{" "}
                <button
                  type="button"
                  onClick={() => window.open(lastExport.url, "_blank", "noopener,noreferrer")}
                  aria-label="Re-download last export"
                  style={{
                    background: "none",
                    border: "none",
                    color: "#2563eb",
                    cursor: "pointer",
                    fontSize: "0.8125rem",
                    padding: 0,
                    textDecoration: "underline",
                  }}
                >
                  Re-download
                </button>
              </p>
            )}
          </div>
        )}
      </section>

      {/* Return to Applicant modal */}
      {showReturnModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="return-modal-title"
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
          <div style={{ backgroundColor: "#fff", borderRadius: "0.5rem", padding: "1.5rem", maxWidth: "420px", width: "90%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <h3 id="return-modal-title" style={{ margin: "0 0 0.75rem 0", fontSize: "1rem" }}>
              Return to Applicant
            </h3>
            <textarea
              value={returnComment}
              onChange={(e) => setReturnComment(e.target.value)}
              placeholder="Comment (required)…"
              rows={4}
              aria-label="Return to applicant comment"
              style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem", fontSize: "0.875rem", resize: "vertical", boxSizing: "border-box", marginBottom: "1rem" }}
            />
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => {
                  setShowReturnModal(false);
                  setReturnComment("");
                }}
                aria-label="Cancel return to applicant"
                style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", backgroundColor: "#fff", cursor: "pointer", fontSize: "0.875rem" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleReturnToApplicant()}
                disabled={focalActioning}
                aria-label="Confirm return to applicant"
                style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "none", borderRadius: "0.375rem", backgroundColor: "#7c3aed", color: "#fff", cursor: focalActioning ? "not-allowed" : "pointer", fontSize: "0.875rem", opacity: focalActioning ? 0.7 : 1 }}
              >
                {focalActioning ? "Processing…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Endorse to RTEC modal */}
      {showEndorseRtecModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="endorse-rtec-modal-title"
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
          <div style={{ backgroundColor: "#fff", borderRadius: "0.5rem", padding: "1.5rem", maxWidth: "420px", width: "90%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <h3 id="endorse-rtec-modal-title" style={{ margin: "0 0 0.75rem 0", fontSize: "1rem" }}>
              Endorse to RTEC
            </h3>
            <label htmlFor="rtec-group-select" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500, fontSize: "0.8125rem" }}>
              RTEC Group
            </label>
            <select
              id="rtec-group-select"
              aria-label="Select RTEC group"
              value={selectedRtecGroupId}
              onChange={(e) => setSelectedRtecGroupId(e.target.value)}
              style={{ width: "100%", minHeight: "44px", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", fontSize: "0.875rem", marginBottom: "0.75rem" }}
            >
              <option value="">— Select RTEC group —</option>
              {rtecGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <textarea
              value={endorseRtecComment}
              onChange={(e) => setEndorseRtecComment(e.target.value)}
              placeholder="Comment (optional)…"
              rows={3}
              aria-label="Endorse to RTEC comment"
              style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem", fontSize: "0.875rem", resize: "vertical", boxSizing: "border-box", marginBottom: "1rem" }}
            />
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => {
                  setShowEndorseRtecModal(false);
                  setEndorseRtecComment("");
                  setSelectedRtecGroupId("");
                }}
                aria-label="Cancel endorse to RTEC"
                style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", backgroundColor: "#fff", cursor: "pointer", fontSize: "0.875rem" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleEndorseToRtec()}
                disabled={focalActioning}
                aria-label="Confirm endorse to RTEC"
                style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "none", borderRadius: "0.375rem", backgroundColor: "#16a34a", color: "#fff", cursor: focalActioning ? "not-allowed" : "pointer", fontSize: "0.875rem", opacity: focalActioning ? 0.7 : 1 }}
              >
                {focalActioning ? "Processing…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Endorse to Budget modal */}
      {showEndorseBudgetModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="endorse-budget-modal-title"
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
          <div style={{ backgroundColor: "#fff", borderRadius: "0.5rem", padding: "1.5rem", maxWidth: "420px", width: "90%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <h3 id="endorse-budget-modal-title" style={{ margin: "0 0 0.75rem 0", fontSize: "1rem" }}>
              Endorse to Budget
            </h3>
            <textarea
              value={endorseBudgetComment}
              onChange={(e) => setEndorseBudgetComment(e.target.value)}
              placeholder="Comment (optional)…"
              rows={3}
              aria-label="Endorse to budget comment"
              style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem", fontSize: "0.875rem", resize: "vertical", boxSizing: "border-box", marginBottom: "1rem" }}
            />
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => {
                  setShowEndorseBudgetModal(false);
                  setEndorseBudgetComment("");
                }}
                aria-label="Cancel endorse to budget"
                style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", backgroundColor: "#fff", cursor: "pointer", fontSize: "0.875rem" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleEndorseToBudget()}
                disabled={focalActioning}
                aria-label="Confirm endorse to budget"
                style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "none", borderRadius: "0.375rem", backgroundColor: "#16a34a", color: "#fff", cursor: focalActioning ? "not-allowed" : "pointer", fontSize: "0.875rem", opacity: focalActioning ? 0.7 : 1 }}
              >
                {focalActioning ? "Processing…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return to RTEC modal */}
      {showReturnRtecModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="return-rtec-modal-title"
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
          <div style={{ backgroundColor: "#fff", borderRadius: "0.5rem", padding: "1.5rem", maxWidth: "420px", width: "90%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <h3 id="return-rtec-modal-title" style={{ margin: "0 0 0.75rem 0", fontSize: "1rem" }}>
              Return to RTEC
            </h3>
            <textarea
              value={returnRtecComment}
              onChange={(e) => setReturnRtecComment(e.target.value)}
              placeholder="Comment (required)…"
              rows={4}
              aria-label="Return to RTEC comment"
              style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem", fontSize: "0.875rem", resize: "vertical", boxSizing: "border-box", marginBottom: "1rem" }}
            />
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => {
                  setShowReturnRtecModal(false);
                  setReturnRtecComment("");
                }}
                aria-label="Cancel return to RTEC"
                style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", backgroundColor: "#fff", cursor: "pointer", fontSize: "0.875rem" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleReturnToRtec()}
                disabled={focalActioning}
                aria-label="Confirm return to RTEC"
                style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "none", borderRadius: "0.375rem", backgroundColor: "#7c3aed", color: "#fff", cursor: focalActioning ? "not-allowed" : "pointer", fontSize: "0.875rem", opacity: focalActioning ? 0.7 : 1 }}
              >
                {focalActioning ? "Processing…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Focal re-route modal */}
      {showFocalRerouteModal && (
        <div role="dialog" aria-modal="true" aria-labelledby="focal-reroute-modal-title" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ backgroundColor: "#fff", borderRadius: "0.5rem", padding: "1.5rem", maxWidth: "420px", width: "90%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <h3 id="focal-reroute-modal-title" style={{ margin: "0 0 0.75rem 0", fontSize: "1rem" }}>
              Re-route for Focal Review
            </h3>
            <textarea
              value={focalRerouteComment}
              onChange={(e) => setFocalRerouteComment(e.target.value)}
              placeholder="Comment (required)…"
              rows={4}
              aria-label="Re-route comment"
              style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem", fontSize: "0.875rem", resize: "vertical", boxSizing: "border-box", marginBottom: "0.5rem" }}
            />
            {!focalRerouteComment.trim() && focalActionError && (
              <p role="alert" style={{ color: "#dc2626", fontSize: "0.8125rem", margin: "0 0 0.5rem 0" }}>This field is required.</p>
            )}
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <button type="button" onClick={() => { setShowFocalRerouteModal(false); setFocalRerouteComment(""); }} aria-label="Cancel re-route" style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", backgroundColor: "#fff", cursor: "pointer", fontSize: "0.875rem" }}>Cancel</button>
              <button type="button" onClick={() => void handleFocalReroute()} disabled={focalActioning} aria-label="Confirm re-route" style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "none", borderRadius: "0.375rem", backgroundColor: "#7c3aed", color: "#fff", cursor: focalActioning ? "not-allowed" : "pointer", fontSize: "0.875rem", opacity: focalActioning ? 0.7 : 1 }}>
                {focalActioning ? "Processing…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Budget: Return to Focal modal */}
      {showBudgetReturnModal && (
        <div role="dialog" aria-modal="true" aria-labelledby="budget-return-modal-title" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ backgroundColor: "#fff", borderRadius: "0.5rem", padding: "1.5rem", maxWidth: "420px", width: "90%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <h3 id="budget-return-modal-title" style={{ margin: "0 0 0.75rem 0", fontSize: "1rem" }}>Return to Focal</h3>
            <textarea
              value={budgetReturnComment}
              onChange={(e) => setBudgetReturnComment(e.target.value)}
              placeholder="Comment (required)…"
              rows={4}
              aria-label="Budget return to focal comment"
              style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem", fontSize: "0.875rem", resize: "vertical", boxSizing: "border-box", marginBottom: "0.5rem" }}
            />
            {!budgetReturnComment.trim() && budgetActionError && (
              <p role="alert" style={{ color: "#dc2626", fontSize: "0.8125rem", margin: "0 0 0.5rem 0" }}>This field is required.</p>
            )}
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <button type="button" onClick={() => { setShowBudgetReturnModal(false); setBudgetReturnComment(""); }} aria-label="Cancel return to focal" style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", backgroundColor: "#fff", cursor: "pointer", fontSize: "0.875rem" }}>Cancel</button>
              <button type="button" onClick={() => void handleBudgetReturn()} disabled={budgetActioning} aria-label="Confirm return to focal" style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "none", borderRadius: "0.375rem", backgroundColor: "#7c3aed", color: "#fff", cursor: budgetActioning ? "not-allowed" : "pointer", fontSize: "0.875rem", opacity: budgetActioning ? 0.7 : 1 }}>
                {budgetActioning ? "Processing…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Budget: Endorse to Accounting modal */}
      {showBudgetEndorseModal && (
        <div role="dialog" aria-modal="true" aria-labelledby="budget-endorse-modal-title" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ backgroundColor: "#fff", borderRadius: "0.5rem", padding: "1.5rem", maxWidth: "420px", width: "90%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <h3 id="budget-endorse-modal-title" style={{ margin: "0 0 0.75rem 0", fontSize: "1rem" }}>Endorse to Accounting</h3>
            <textarea
              value={budgetEndorseComment}
              onChange={(e) => setBudgetEndorseComment(e.target.value)}
              placeholder="Comment (optional)…"
              rows={3}
              aria-label="Budget endorse to accounting comment"
              style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem", fontSize: "0.875rem", resize: "vertical", boxSizing: "border-box", marginBottom: "1rem" }}
            />
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => { setShowBudgetEndorseModal(false); setBudgetEndorseComment(""); }} aria-label="Cancel endorse to accounting" style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", backgroundColor: "#fff", cursor: "pointer", fontSize: "0.875rem" }}>Cancel</button>
              <button type="button" onClick={() => void handleBudgetEndorse()} disabled={budgetActioning} aria-label="Confirm endorse to accounting" style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "none", borderRadius: "0.375rem", backgroundColor: "#16a34a", color: "#fff", cursor: budgetActioning ? "not-allowed" : "pointer", fontSize: "0.875rem", opacity: budgetActioning ? 0.7 : 1 }}>
                {budgetActioning ? "Processing…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Budget: Re-endorse to Accounting modal */}
      {showBudgetReEndorseModal && (
        <div role="dialog" aria-modal="true" aria-labelledby="budget-reendorse-modal-title" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ backgroundColor: "#fff", borderRadius: "0.5rem", padding: "1.5rem", maxWidth: "420px", width: "90%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <h3 id="budget-reendorse-modal-title" style={{ margin: "0 0 0.75rem 0", fontSize: "1rem" }}>Re-endorse to Accounting</h3>
            <textarea
              value={budgetReEndorseComment}
              onChange={(e) => setBudgetReEndorseComment(e.target.value)}
              placeholder="Comment (optional)…"
              rows={3}
              aria-label="Budget re-endorse to accounting comment"
              style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem", fontSize: "0.875rem", resize: "vertical", boxSizing: "border-box", marginBottom: "1rem" }}
            />
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => { setShowBudgetReEndorseModal(false); setBudgetReEndorseComment(""); }} aria-label="Cancel re-endorse to accounting" style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", backgroundColor: "#fff", cursor: "pointer", fontSize: "0.875rem" }}>Cancel</button>
              <button type="button" onClick={() => void handleBudgetReEndorse()} disabled={budgetActioning} aria-label="Confirm re-endorse to accounting" style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "none", borderRadius: "0.375rem", backgroundColor: "#16a34a", color: "#fff", cursor: budgetActioning ? "not-allowed" : "pointer", fontSize: "0.875rem", opacity: budgetActioning ? 0.7 : 1 }}>
                {budgetActioning ? "Processing…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Accounting: Return to Budget modal */}
      {showAcctReturnBudgetModal && (
        <div role="dialog" aria-modal="true" aria-labelledby="acct-return-budget-modal-title" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ backgroundColor: "#fff", borderRadius: "0.5rem", padding: "1.5rem", maxWidth: "420px", width: "90%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <h3 id="acct-return-budget-modal-title" style={{ margin: "0 0 0.75rem 0", fontSize: "1rem" }}>Return to Budget</h3>
            <textarea
              value={acctReturnBudgetComment}
              onChange={(e) => setAcctReturnBudgetComment(e.target.value)}
              placeholder="Comment (required)…"
              rows={4}
              aria-label="Accounting return to budget comment"
              style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem", fontSize: "0.875rem", resize: "vertical", boxSizing: "border-box", marginBottom: "0.5rem" }}
            />
            {!acctReturnBudgetComment.trim() && accountingActionError && (
              <p role="alert" style={{ color: "#dc2626", fontSize: "0.8125rem", margin: "0 0 0.5rem 0" }}>This field is required.</p>
            )}
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <button type="button" onClick={() => { setShowAcctReturnBudgetModal(false); setAcctReturnBudgetComment(""); }} aria-label="Cancel return to budget" style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", backgroundColor: "#fff", cursor: "pointer", fontSize: "0.875rem" }}>Cancel</button>
              <button type="button" onClick={() => void handleAccountingReturnToBudget()} disabled={accountingActioning} aria-label="Confirm return to budget" style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "none", borderRadius: "0.375rem", backgroundColor: "#7c3aed", color: "#fff", cursor: accountingActioning ? "not-allowed" : "pointer", fontSize: "0.875rem", opacity: accountingActioning ? 0.7 : 1 }}>
                {accountingActioning ? "Processing…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Accounting: Return to Focal modal */}
      {showAcctReturnFocalModal && (
        <div role="dialog" aria-modal="true" aria-labelledby="acct-return-focal-modal-title" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ backgroundColor: "#fff", borderRadius: "0.5rem", padding: "1.5rem", maxWidth: "420px", width: "90%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <h3 id="acct-return-focal-modal-title" style={{ margin: "0 0 0.75rem 0", fontSize: "1rem" }}>Return to Focal</h3>
            <textarea
              value={acctReturnFocalComment}
              onChange={(e) => setAcctReturnFocalComment(e.target.value)}
              placeholder="Comment (required)…"
              rows={4}
              aria-label="Accounting return to focal comment"
              style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem", fontSize: "0.875rem", resize: "vertical", boxSizing: "border-box", marginBottom: "0.5rem" }}
            />
            {!acctReturnFocalComment.trim() && accountingActionError && (
              <p role="alert" style={{ color: "#dc2626", fontSize: "0.8125rem", margin: "0 0 0.5rem 0" }}>This field is required.</p>
            )}
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <button type="button" onClick={() => { setShowAcctReturnFocalModal(false); setAcctReturnFocalComment(""); }} aria-label="Cancel return to focal" style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", backgroundColor: "#fff", cursor: "pointer", fontSize: "0.875rem" }}>Cancel</button>
              <button type="button" onClick={() => void handleAccountingReturnToFocal()} disabled={accountingActioning} aria-label="Confirm return to focal" style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "none", borderRadius: "0.375rem", backgroundColor: "#7c3aed", color: "#fff", cursor: accountingActioning ? "not-allowed" : "pointer", fontSize: "0.875rem", opacity: accountingActioning ? 0.7 : 1 }}>
                {accountingActioning ? "Processing…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Accounting: Endorse to RD modal */}
      {showAcctEndorseRdModal && (
        <div role="dialog" aria-modal="true" aria-labelledby="acct-endorse-rd-modal-title" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ backgroundColor: "#fff", borderRadius: "0.5rem", padding: "1.5rem", maxWidth: "420px", width: "90%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <h3 id="acct-endorse-rd-modal-title" style={{ margin: "0 0 0.75rem 0", fontSize: "1rem" }}>Endorse to RD</h3>
            <textarea
              value={acctEndorseRdComment}
              onChange={(e) => setAcctEndorseRdComment(e.target.value)}
              placeholder="Comment (optional)…"
              rows={3}
              aria-label="Accounting endorse to RD comment"
              style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem", fontSize: "0.875rem", resize: "vertical", boxSizing: "border-box", marginBottom: "1rem" }}
            />
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => { setShowAcctEndorseRdModal(false); setAcctEndorseRdComment(""); }} aria-label="Cancel endorse to RD" style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", backgroundColor: "#fff", cursor: "pointer", fontSize: "0.875rem" }}>Cancel</button>
              <button type="button" onClick={() => void handleAccountingEndorseToRd()} disabled={accountingActioning} aria-label="Confirm endorse to RD" style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "none", borderRadius: "0.375rem", backgroundColor: "#16a34a", color: "#fff", cursor: accountingActioning ? "not-allowed" : "pointer", fontSize: "0.875rem", opacity: accountingActioning ? 0.7 : 1 }}>
                {accountingActioning ? "Processing…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RD: Approve modal */}
      {showRdApproveModal && (
        <div role="dialog" aria-modal="true" aria-labelledby="rd-approve-modal-title" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ backgroundColor: "#fff", borderRadius: "0.5rem", padding: "1.5rem", maxWidth: "420px", width: "90%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <h3 id="rd-approve-modal-title" style={{ margin: "0 0 0.75rem 0", fontSize: "1rem" }}>Approve Proposal</h3>
            <textarea
              value={rdApproveComment}
              onChange={(e) => setRdApproveComment(e.target.value)}
              placeholder="Comment (required)…"
              rows={4}
              aria-label="RD approve comment"
              style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem", fontSize: "0.875rem", resize: "vertical", boxSizing: "border-box", marginBottom: "0.5rem" }}
            />
            {!rdApproveComment.trim() && rdActionError && (
              <p role="alert" style={{ color: "#dc2626", fontSize: "0.8125rem", margin: "0 0 0.5rem 0" }}>This field is required.</p>
            )}
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <button type="button" onClick={() => { setShowRdApproveModal(false); setRdApproveComment(""); }} aria-label="Cancel approval" style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", backgroundColor: "#fff", cursor: "pointer", fontSize: "0.875rem" }}>Cancel</button>
              <button type="button" onClick={() => void handleRdApprove()} disabled={rdActioning} aria-label="Confirm approval" style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "none", borderRadius: "0.375rem", backgroundColor: "#16a34a", color: "#fff", cursor: rdActioning ? "not-allowed" : "pointer", fontSize: "0.875rem", opacity: rdActioning ? 0.7 : 1 }}>
                {rdActioning ? "Processing…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RD: Reject modal */}
      {showRdRejectModal && (
        <div role="dialog" aria-modal="true" aria-labelledby="rd-reject-modal-title" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ backgroundColor: "#fff", borderRadius: "0.5rem", padding: "1.5rem", maxWidth: "420px", width: "90%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <h3 id="rd-reject-modal-title" style={{ margin: "0 0 0.75rem 0", fontSize: "1rem" }}>Reject Proposal</h3>
            <textarea
              value={rdRejectComment}
              onChange={(e) => setRdRejectComment(e.target.value)}
              placeholder="Comment (required)…"
              rows={4}
              aria-label="RD reject comment"
              style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem", fontSize: "0.875rem", resize: "vertical", boxSizing: "border-box", marginBottom: "0.5rem" }}
            />
            {!rdRejectComment.trim() && rdActionError && (
              <p role="alert" style={{ color: "#dc2626", fontSize: "0.8125rem", margin: "0 0 0.5rem 0" }}>This field is required.</p>
            )}
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <button type="button" onClick={() => { setShowRdRejectModal(false); setRdRejectComment(""); }} aria-label="Cancel rejection" style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", backgroundColor: "#fff", cursor: "pointer", fontSize: "0.875rem" }}>Cancel</button>
              <button type="button" onClick={() => void handleRdReject()} disabled={rdActioning} aria-label="Confirm rejection" style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "none", borderRadius: "0.375rem", backgroundColor: "#dc2626", color: "#fff", cursor: rdActioning ? "not-allowed" : "pointer", fontSize: "0.875rem", opacity: rdActioning ? 0.7 : 1 }}>
                {rdActioning ? "Processing…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RD: Defer modal */}
      {showRdDeferModal && (
        <div role="dialog" aria-modal="true" aria-labelledby="rd-defer-modal-title" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ backgroundColor: "#fff", borderRadius: "0.5rem", padding: "1.5rem", maxWidth: "420px", width: "90%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <h3 id="rd-defer-modal-title" style={{ margin: "0 0 0.75rem 0", fontSize: "1rem" }}>Defer Proposal</h3>
            <textarea
              value={rdDeferReason}
              onChange={(e) => setRdDeferReason(e.target.value)}
              placeholder="Reason (required)…"
              rows={4}
              aria-label="RD defer reason"
              style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem", fontSize: "0.875rem", resize: "vertical", boxSizing: "border-box", marginBottom: "0.5rem" }}
            />
            {!rdDeferReason.trim() && rdActionError && (
              <p role="alert" style={{ color: "#dc2626", fontSize: "0.8125rem", margin: "0 0 0.5rem 0" }}>This field is required.</p>
            )}
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <button type="button" onClick={() => { setShowRdDeferModal(false); setRdDeferReason(""); }} aria-label="Cancel defer" style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", backgroundColor: "#fff", cursor: "pointer", fontSize: "0.875rem" }}>Cancel</button>
              <button type="button" onClick={() => void handleRdDefer()} disabled={rdActioning} aria-label="Confirm defer" style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "none", borderRadius: "0.375rem", backgroundColor: "#7c3aed", color: "#fff", cursor: rdActioning ? "not-allowed" : "pointer", fontSize: "0.875rem", opacity: rdActioning ? 0.7 : 1 }}>
                {rdActioning ? "Processing…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RD: Return to Applicant modal */}
      {showRdReturnModal && (
        <div role="dialog" aria-modal="true" aria-labelledby="rd-return-modal-title" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ backgroundColor: "#fff", borderRadius: "0.5rem", padding: "1.5rem", maxWidth: "420px", width: "90%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <h3 id="rd-return-modal-title" style={{ margin: "0 0 0.75rem 0", fontSize: "1rem" }}>Return to Applicant</h3>
            <textarea
              value={rdReturnComment}
              onChange={(e) => setRdReturnComment(e.target.value)}
              placeholder="Comment (required)…"
              rows={4}
              aria-label="RD return to applicant comment"
              style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem", fontSize: "0.875rem", resize: "vertical", boxSizing: "border-box", marginBottom: "0.5rem" }}
            />
            {!rdReturnComment.trim() && rdActionError && (
              <p role="alert" style={{ color: "#dc2626", fontSize: "0.8125rem", margin: "0 0 0.5rem 0" }}>This field is required.</p>
            )}
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <button type="button" onClick={() => { setShowRdReturnModal(false); setRdReturnComment(""); }} aria-label="Cancel return to applicant" style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", backgroundColor: "#fff", cursor: "pointer", fontSize: "0.875rem" }}>Cancel</button>
              <button type="button" onClick={() => void handleRdReturn()} disabled={rdActioning} aria-label="Confirm return to applicant" style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "none", borderRadius: "0.375rem", backgroundColor: "#7c3aed", color: "#fff", cursor: rdActioning ? "not-allowed" : "pointer", fontSize: "0.875rem", opacity: rdActioning ? 0.7 : 1 }}>
                {rdActioning ? "Processing…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

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
