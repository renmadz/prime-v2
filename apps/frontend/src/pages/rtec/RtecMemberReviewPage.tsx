import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  api,
  workflowApi,
  rtecApi,
  type ProposalDetail,
  type RtecReview,
} from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";

type SaveStatus = "idle" | "saving" | "saved" | "failed";

interface ItemRow {
  formSectionId: string;
  remarks: string;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  border: "1px solid #d1d5db",
  borderRadius: "0.375rem",
  fontSize: "0.875rem",
  boxSizing: "border-box",
  resize: "vertical",
};

export default function RtecMemberReviewPage() {
  const { proposalId } = useParams<{ proposalId: string }>();
  const { user } = useAuth();

  const [proposal, setProposal] = useState<ProposalDetail | null>(null);
  const [rtecGroupId, setRtecGroupId] = useState<string | null>(null);
  const [review, setReview] = useState<RtecReview | null>(null);
  const [overallRemarks, setOverallRemarks] = useState("");
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notAssigned, setNotAssigned] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          g.memberships.some((m) => m.userId === user?.id && m.roleInGroup === "MEMBER" && m.isActive),
        );
        if (myGroup) setRtecGroupId(myGroup.id);

        try {
          const { review: existing } = await rtecApi.getMyReview(proposalId!);
          setReview(existing);
          setOverallRemarks(existing.overallRemarks ?? "");
          setItems(
            existing.items.map((item) => ({
              formSectionId: item.formSectionId ?? "",
              remarks: item.remarks,
            })),
          );
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
          setError(err instanceof Error ? err.message : "Failed to load review.");
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

  function saveDraft(nextRemarks: string, nextItems: ItemRow[]) {
    if (!proposalId || !rtecGroupId) return;
    setSaveStatus("saving");
    rtecApi
      .saveReview(proposalId, {
        rtecGroupId,
        overallRemarks: nextRemarks,
        items: nextItems
          .filter((item) => item.remarks.trim().length > 0)
          .map((item) => ({
            formSectionId: item.formSectionId || undefined,
            remarks: item.remarks,
          })),
      })
      .then(({ review: saved }) => {
        setReview(saved);
        setSaveStatus("saved");
      })
      .catch(() => setSaveStatus("failed"));
  }

  function scheduleAutosave(nextRemarks: string, nextItems: ItemRow[]) {
    if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      saveDraft(nextRemarks, nextItems);
    }, 1500);
  }

  function handleRemarksChange(value: string) {
    setOverallRemarks(value);
    scheduleAutosave(value, items);
  }

  function handleAddItem() {
    const next = [...items, { formSectionId: "", remarks: "" }];
    setItems(next);
    scheduleAutosave(overallRemarks, next);
  }

  function handleItemChange(index: number, field: "formSectionId" | "remarks", value: string) {
    const next = items.map((item, i) => (i === index ? { ...item, [field]: value } : item));
    setItems(next);
    scheduleAutosave(overallRemarks, next);
  }

  function handleRemoveItem(index: number) {
    const next = items.filter((_, i) => i !== index);
    setItems(next);
    scheduleAutosave(overallRemarks, next);
  }

  function handleSaveNow() {
    if (debounceTimer.current !== null) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    saveDraft(overallRemarks, items);
  }

  async function handleSubmitReview() {
    if (!proposalId) return;
    setSubmitError(null);
    if (!overallRemarks.trim() && items.length === 0) {
      setSubmitError("Add overall remarks or at least one item before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      handleSaveNow();
      const { review: submitted } = await rtecApi.submitReview(proposalId);
      setReview(submitted);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit review.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p style={{ padding: "1rem" }}>Loading review…</p>;
  }

  if (notAssigned) {
    return (
      <p role="alert" style={{ padding: "1rem", color: "#dc2626" }}>
        You are not assigned to review this proposal.
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

  const isSubmitted = review?.isSubmitted === true;

  const saveStatusLabel =
    saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : saveStatus === "failed" ? "Save failed" : "";
  const saveStatusColor = saveStatus === "failed" ? "#dc2626" : saveStatus === "saved" ? "#16a34a" : "#6b7280";

  return (
    <div style={{ padding: "1rem", maxWidth: "720px" }}>
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

      <div
        aria-live="polite"
        aria-atomic="true"
        style={{ fontSize: "0.8125rem", color: saveStatusColor, minHeight: "1.25rem", marginBottom: "0.5rem" }}
      >
        {saveStatusLabel}
      </div>

      {isSubmitted && (
        <p style={{ color: "#16a34a", fontSize: "0.875rem", fontWeight: 500, marginBottom: "1rem" }}>
          Review submitted
        </p>
      )}

      <div style={{ marginBottom: "1rem" }}>
        <label htmlFor="overall-remarks" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500, fontSize: "0.875rem" }}>
          Overall Remarks<span style={{ color: "#dc2626", marginLeft: "0.25rem" }} aria-hidden="true">*</span>
        </label>
        <textarea
          id="overall-remarks"
          aria-label="Overall Remarks"
          value={overallRemarks}
          onChange={(e) => handleRemarksChange(e.target.value)}
          rows={5}
          disabled={isSubmitted}
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "0.5rem" }}>Section Remarks</h3>
        {items.map((item, index) => (
          <div
            key={index}
            style={{ border: "1px solid #e5e7eb", borderRadius: "0.375rem", padding: "0.75rem", marginBottom: "0.5rem" }}
          >
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", alignItems: "center" }}>
              <input
                type="text"
                aria-label={`Section label for item ${index + 1}`}
                placeholder="Section label (optional)"
                value={item.formSectionId}
                onChange={(e) => handleItemChange(index, "formSectionId", e.target.value)}
                disabled={isSubmitted}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                type="button"
                onClick={() => handleRemoveItem(index)}
                disabled={isSubmitted}
                aria-label={`Remove item ${index + 1}`}
                style={{
                  minHeight: "44px",
                  minWidth: "44px",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.375rem",
                  backgroundColor: "#fff",
                  cursor: isSubmitted ? "not-allowed" : "pointer",
                }}
              >
                ×
              </button>
            </div>
            <textarea
              aria-label={`Remarks for item ${index + 1}`}
              placeholder="Remarks…"
              value={item.remarks}
              onChange={(e) => handleItemChange(index, "remarks", e.target.value)}
              rows={3}
              disabled={isSubmitted}
              style={inputStyle}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={handleAddItem}
          disabled={isSubmitted}
          aria-label="Add item"
          style={{
            minHeight: "44px",
            padding: "0.5rem 1rem",
            border: "1px solid #d1d5db",
            borderRadius: "0.375rem",
            backgroundColor: "#fff",
            cursor: isSubmitted ? "not-allowed" : "pointer",
            fontSize: "0.875rem",
          }}
        >
          + Add Item
        </button>
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
          disabled={isSubmitted}
          aria-label="Save Draft"
          style={{
            minHeight: "44px",
            padding: "0.5rem 1rem",
            border: "1px solid #d1d5db",
            borderRadius: "0.375rem",
            backgroundColor: "#fff",
            cursor: isSubmitted ? "not-allowed" : "pointer",
            fontSize: "0.875rem",
            fontWeight: 500,
          }}
        >
          Save Draft
        </button>

        <button
          type="button"
          onClick={() => void handleSubmitReview()}
          disabled={isSubmitted || submitting}
          aria-label="Submit Review"
          style={{
            minHeight: "44px",
            padding: "0.5rem 1rem",
            border: "none",
            borderRadius: "0.375rem",
            backgroundColor: "#16a34a",
            color: "#fff",
            cursor: isSubmitted || submitting ? "not-allowed" : "pointer",
            fontSize: "0.875rem",
            fontWeight: 500,
            opacity: isSubmitted || submitting ? 0.6 : 1,
          }}
        >
          {isSubmitted ? "Review submitted" : submitting ? "Submitting…" : "Submit Review"}
        </button>
      </div>
    </div>
  );
}
