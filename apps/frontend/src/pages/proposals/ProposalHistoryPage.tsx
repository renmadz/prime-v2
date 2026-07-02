import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { phase9Api, type HistoryEntry } from "../../lib/api";

const ACTION_LABELS: Record<string, string> = {
  PROPOSAL_SUBMITTED: "Proposal Submitted",
  PROPOSAL_RESUBMITTED: "Proposal Resubmitted",
  STATUS_CHANGED: "Status Changed",
  COMMENT_ADDED: "Comment Added",
  COMMENT_RESOLVED: "Comment Resolved",
};

function humanizeAction(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}

export default function ProposalHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError("Missing proposal ID.");
      setLoading(false);
      return;
    }
    phase9Api
      .getHistory(id)
      .then((data) => setHistory(data))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load history.");
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <p style={{ padding: "1rem" }}>Loading history…</p>;
  }

  if (error) {
    return (
      <p role="alert" style={{ padding: "1rem", color: "#dc2626" }}>
        Error: {error}
      </p>
    );
  }

  return (
    <div style={{ padding: "1rem", maxWidth: "720px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
        <button
          type="button"
          onClick={() => navigate(`/proposals/${id ?? ""}`)}
          aria-label="Back to proposal"
          style={{
            padding: "0.375rem 0.75rem",
            border: "1px solid #d1d5db",
            borderRadius: "0.375rem",
            backgroundColor: "#fff",
            cursor: "pointer",
            fontSize: "0.8125rem",
          }}
        >
          ← Back
        </button>
        <h2 style={{ margin: 0 }}>Change History</h2>
      </div>

      {history.length === 0 ? (
        <p style={{ color: "#6b7280" }}>No history entries yet.</p>
      ) : (
        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {history.map((entry, index) => (
            <li
              key={index}
              role="listitem"
              style={{
                display: "flex",
                gap: "1rem",
                marginBottom: "1.25rem",
              }}
            >
              {/* Timeline dot */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div
                  style={{
                    width: "0.75rem",
                    height: "0.75rem",
                    borderRadius: "9999px",
                    backgroundColor: "#2563eb",
                    flexShrink: 0,
                    marginTop: "0.25rem",
                  }}
                />
                {index < history.length - 1 && (
                  <div style={{ width: "2px", flex: 1, backgroundColor: "#e5e7eb", marginTop: "0.25rem" }} />
                )}
              </div>

              {/* Entry content */}
              <div style={{ flex: 1, paddingBottom: "0.5rem" }}>
                <p style={{ margin: "0 0 0.125rem 0", fontWeight: 600, fontSize: "0.9375rem" }}>
                  {humanizeAction(entry.action)}
                </p>
                <p style={{ margin: "0 0 0.25rem 0", fontSize: "0.8125rem", color: "#6b7280" }}>
                  {new Date(entry.createdAt).toLocaleString()}
                  {entry.actorUserId && (
                    <span style={{ marginLeft: "0.5rem" }}>· by {entry.actorUserId}</span>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
