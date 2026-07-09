import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  api,
  workflowApi,
  rtecApi,
  type ProposalDetail,
  type RtecReview,
  type RtecConsolidation,
} from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";

type SaveStatus = "idle" | "saving" | "saved" | "failed";
type Recommendation = "FOR_APPROVAL" | "FOR_REVISION" | "NOT_RECOMMENDED";

const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  FOR_APPROVAL: "Recommend for Approval",
  FOR_REVISION: "Return for Revision",
  NOT_RECOMMENDED: "Not Recommended",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  border: "1px solid #d1d5db",
  borderRadius: "0.375rem",
  fontSize: "0.875rem",
  boxSizing: "border-box",
};

export default function RtecHeadConsolidationPage() {
  const { proposalId } = useParams<{ proposalId: string }>();
  useAuth();

  const [proposal, setProposal] = useState<ProposalDetail | null>(null);
  const [rtecGroupId, setRtecGroupId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<RtecReview[]>([]);
  const [consolidation, setConsolidation] = useState<RtecConsolidation | null>(null);
  const [recommendation, setRecommendation] = useState<Recommendation>("FOR_APPROVAL");
  const [consolidatedRemarks, setConsolidatedRemarks] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notAssigned, setNotAssigned] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [beginning, setBeginning] = useState(false);
  const [beginError, setBeginError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [reopeningId, setReopeningId] = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function loadReviews() {
    if (!proposalId) return;
    rtecApi
      .getAllReviews(proposalId)
      .then(({ reviews: r }) => setReviews(r))
      .catch(() => setReviews([]));
  }

  useEffect(() => {
    if (!proposalId) {
      setError("Missing proposal ID.");
      setLoading(false);
      return;
    }

    async function init() {
      try {
        const proposalData = await api.get<ProposalDetail>(`/api/proposals/${proposalId}`);
        setProposal(proposalData);

        const { groups } = await workflowApi.listRtecGroups();
        const myGroup = groups.find((g) =>
          g.memberships.some((m) => m.roleInGroup === "HEAD" && m.isActive),
        );
        if (myGroup) setRtecGroupId(myGroup.id);

        loadReviews();

        try {
          const { consolidation: existing } = await rtecApi.getConsolidation(proposalId!);
          setConsolidation(existing);
          setRecommendation(existing.recommendation);
          setConsolidatedRemarks(existing.consolidatedRemarks);
        } catch (err: unknown) {
          const status = (err as { status?: number }).status;
          if (status === 403) {
            setNotAssigned(true);
          } else if (status !== 404) {
            throw err;
          }
        }
      } catch (err: unknown) {
        const status = (err as { status?: number }).status;
        if (status === 403) {
          setNotAssigned(true);
        } else {
          setError(err instanceof Error ? err.message : "Failed to load consolidation.");
        }
      } finally {
        setLoading(false);
      }
    }

    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalId]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    };
  }, []);

  function saveDraft(nextRecommendation: Recommendation, nextRemarks: string) {
    if (!proposalId || !rtecGroupId) return;
    setSaveStatus("saving");
    rtecApi
      .saveConsolidation(proposalId, {
        rtecGroupId,
        recommendation: nextRecommendation,
        consolidatedRemarks: nextRemarks,
      })
      .then(({ consolidation: saved }) => {
        setConsolidation(saved);
        setSaveStatus("saved");
      })
      .catch(() => setSaveStatus("failed"));
  }

  function scheduleAutosave(nextRecommendation: Recommendation, nextRemarks: string) {
    if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      saveDraft(nextRecommendation, nextRemarks);
    }, 1500);
  }

  function handleRecommendationChange(value: Recommendation) {
    setRecommendation(value);
    scheduleAutosave(value, consolidatedRemarks);
  }

  function handleRemarksChange(value: string) {
    setConsolidatedRemarks(value);
    scheduleAutosave(recommendation, value);
  }

  function handleSaveNow() {
    if (debounceTimer.current !== null) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    saveDraft(recommendation, consolidatedRemarks);
  }

  async function handleBeginConsolidation() {
    if (!proposalId) return;
    setBeginError(null);
    setBeginning(true);
    try {
      const result = await rtecApi.beginConsolidation(proposalId);
      setProposal((prev) => (prev ? { ...prev, status: result.status } : prev));
    } catch (err: unknown) {
      setBeginError(err instanceof Error ? err.message : "Failed to begin consolidation.");
    } finally {
      setBeginning(false);
    }
  }

  async function handleSubmitRecommendation() {
    if (!proposalId) return;
    if (!consolidatedRemarks.trim()) {
      setSubmitError("Consolidated remarks are required before submitting.");
      setShowSubmitConfirm(false);
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      handleSaveNow();
      const result = await rtecApi.submitConsolidation(proposalId);
      setProposal((prev) => (prev ? { ...prev, status: result.status } : prev));
      setShowSubmitConfirm(false);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit recommendation.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReopen(reviewId: string) {
    if (!proposalId) return;
    setReopeningId(reviewId);
    try {
      await rtecApi.reopenReview(proposalId, reviewId);
      loadReviews();
    } catch {
      // silent — reviewer keeps prior state, head can retry
    } finally {
      setReopeningId(null);
    }
  }

  if (loading) {
    return <p style={{ padding: "1rem" }}>Loading consolidation…</p>;
  }

  if (notAssigned) {
    return (
      <p role="alert" style={{ padding: "1rem", color: "#dc2626" }}>
        You are not assigned as RTEC Head for this proposal.
      </p>
    );
  }

  if (error || !proposal) {
    return (
      <p role="alert" style={{ padding: "1rem", color: "#dc2626" }}>
        Error: {error ?? "Proposal not found"}
      </p>
    );
  }

  const saveStatusLabel =
    saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : saveStatus === "failed" ? "Save failed" : "";
  const saveStatusColor = saveStatus === "failed" ? "#dc2626" : saveStatus === "saved" ? "#16a34a" : "#6b7280";

  return (
    <div style={{ padding: "1rem", maxWidth: "760px" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ margin: "0 0 0.5rem 0" }}>{proposal.title}</h2>
        <span
          style={{
            display: "inline-block",
            padding: "0.25rem 0.625rem",
            borderRadius: "9999px",
            fontSize: "0.75rem",
            fontWeight: 600,
            color: "#fff",
            backgroundColor: "#d97706",
          }}
        >
          {proposal.status.replace(/_/g, " ")}
        </span>
      </div>

      {proposal.status === "RTEC_MEMBER_REVIEWS_COMPLETE" && (
        <div style={{ marginBottom: "1.5rem" }}>
          {beginError && (
            <p role="alert" style={{ color: "#dc2626", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
              {beginError}
            </p>
          )}
          <button
            type="button"
            onClick={() => void handleBeginConsolidation()}
            disabled={beginning}
            aria-label="Begin Consolidation"
            style={{
              minHeight: "44px",
              padding: "0.5rem 1rem",
              border: "none",
              borderRadius: "0.375rem",
              backgroundColor: "#2563eb",
              color: "#fff",
              cursor: beginning ? "not-allowed" : "pointer",
              fontSize: "0.875rem",
              fontWeight: 500,
              opacity: beginning ? 0.6 : 1,
            }}
          >
            {beginning ? "Starting…" : "Begin Consolidation"}
          </button>
        </div>
      )}

      {proposal.status === "UNDER_RTEC_HEAD_CONSOLIDATION" && (
        <section style={{ marginBottom: "1.5rem", border: "1px solid #e5e7eb", borderRadius: "0.5rem", padding: "1rem" }}>
          <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "1rem", fontWeight: 600 }}>Consolidation</h3>

          <div
            aria-live="polite"
            aria-atomic="true"
            style={{ fontSize: "0.8125rem", color: saveStatusColor, minHeight: "1.25rem", marginBottom: "0.5rem" }}
          >
            {saveStatusLabel}
          </div>

          <div style={{ marginBottom: "0.75rem" }}>
            <label htmlFor="recommendation-select" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500, fontSize: "0.875rem" }}>
              Recommendation
            </label>
            <select
              id="recommendation-select"
              aria-label="Recommendation"
              value={recommendation}
              onChange={(e) => handleRecommendationChange(e.target.value as Recommendation)}
              style={inputStyle}
            >
              {(Object.keys(RECOMMENDATION_LABELS) as Recommendation[]).map((key) => (
                <option key={key} value={key}>
                  {RECOMMENDATION_LABELS[key]}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label htmlFor="consolidated-remarks" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500, fontSize: "0.875rem" }}>
              Consolidated Remarks<span style={{ color: "#dc2626", marginLeft: "0.25rem" }} aria-hidden="true">*</span>
            </label>
            <textarea
              id="consolidated-remarks"
              aria-label="Consolidated Remarks"
              value={consolidatedRemarks}
              onChange={(e) => handleRemarksChange(e.target.value)}
              rows={5}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          {submitError && (
            <p role="alert" style={{ color: "#dc2626", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
              {submitError}
            </p>
          )}

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleSaveNow}
              aria-label="Save Draft"
              style={{
                minHeight: "44px",
                padding: "0.5rem 1rem",
                border: "1px solid #d1d5db",
                borderRadius: "0.375rem",
                backgroundColor: "#fff",
                cursor: "pointer",
                fontSize: "0.875rem",
                fontWeight: 500,
              }}
            >
              Save Draft
            </button>

            <button
              type="button"
              onClick={() => setShowSubmitConfirm(true)}
              disabled={submitting}
              aria-label="Submit Recommendation"
              style={{
                minHeight: "44px",
                padding: "0.5rem 1rem",
                border: "none",
                borderRadius: "0.375rem",
                backgroundColor: "#16a34a",
                color: "#fff",
                cursor: submitting ? "not-allowed" : "pointer",
                fontSize: "0.875rem",
                fontWeight: 500,
                opacity: submitting ? 0.6 : 1,
              }}
            >
              Submit Recommendation
            </button>
          </div>
        </section>
      )}

      {proposal.status === "RETURNED_TO_FOCAL_BY_RTEC" && consolidation && (
        <section style={{ marginBottom: "1.5rem", border: "1px solid #e5e7eb", borderRadius: "0.5rem", padding: "1rem" }}>
          <p style={{ margin: "0 0 0.75rem 0", color: "#16a34a", fontWeight: 500, fontSize: "0.875rem" }}>
            Recommendation submitted
          </p>
          <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.875rem" }}>
            <strong>Recommendation:</strong> {RECOMMENDATION_LABELS[consolidation.recommendation]}
          </p>
          <p style={{ margin: 0, fontSize: "0.875rem", whiteSpace: "pre-wrap" }}>{consolidation.consolidatedRemarks}</p>
        </section>
      )}

      <section>
        <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "1rem", fontWeight: 600, borderBottom: "1px solid #e5e7eb", paddingBottom: "0.5rem" }}>
          Member Reviews
        </h3>
        {reviews.length === 0 ? (
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>No reviews yet.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {reviews.map((r) => (
              <li key={r.id} style={{ border: "1px solid #e5e7eb", borderRadius: "0.375rem", padding: "0.75rem", marginBottom: "0.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: "0 0 0.25rem 0", fontWeight: 500, fontSize: "0.875rem" }}>{r.reviewerUserId}</p>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "0.125rem 0.5rem",
                        borderRadius: "9999px",
                        fontSize: "0.6875rem",
                        fontWeight: 600,
                        color: "#fff",
                        backgroundColor: r.isSubmitted ? "#16a34a" : "#6b7280",
                        marginBottom: "0.5rem",
                      }}
                    >
                      {r.isSubmitted ? "SUBMITTED" : "DRAFT"}
                    </span>
                    {r.overallRemarks && (
                      <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.8125rem", whiteSpace: "pre-wrap" }}>{r.overallRemarks}</p>
                    )}
                    {r.items.length > 0 && (
                      <ul style={{ margin: "0.5rem 0 0 0", paddingLeft: "1.25rem" }}>
                        {r.items.map((item) => (
                          <li key={item.id} style={{ fontSize: "0.8125rem", marginBottom: "0.25rem" }}>
                            {item.remarks}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {r.isSubmitted && proposal.status === "UNDER_RTEC_HEAD_CONSOLIDATION" && (
                    <button
                      type="button"
                      onClick={() => void handleReopen(r.id)}
                      disabled={reopeningId === r.id}
                      aria-label={`Reopen review ${r.id}`}
                      style={{
                        minHeight: "44px",
                        padding: "0.375rem 0.75rem",
                        border: "1px solid #d1d5db",
                        borderRadius: "0.375rem",
                        backgroundColor: "#fff",
                        cursor: reopeningId === r.id ? "not-allowed" : "pointer",
                        fontSize: "0.8125rem",
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      {reopeningId === r.id ? "Reopening…" : "Reopen"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showSubmitConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="submit-consolidation-title"
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
            <h3 id="submit-consolidation-title" style={{ margin: "0 0 0.75rem 0", fontSize: "1rem" }}>
              Submit Recommendation
            </h3>
            <p style={{ margin: "0 0 1.25rem 0", fontSize: "0.875rem", color: "#374151" }}>
              Once submitted, this recommendation cannot be changed.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShowSubmitConfirm(false)}
                aria-label="Cancel submission"
                style={{ minHeight: "44px", padding: "0.5rem 1rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", backgroundColor: "#fff", cursor: "pointer", fontSize: "0.875rem" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSubmitRecommendation()}
                disabled={submitting}
                aria-label="Confirm submit recommendation"
                style={{
                  minHeight: "44px",
                  padding: "0.5rem 1rem",
                  border: "none",
                  borderRadius: "0.375rem",
                  backgroundColor: "#16a34a",
                  color: "#fff",
                  cursor: submitting ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? "Submitting…" : "Confirm Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
