import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { phase9Api, type VersionDiff, type ProposalVersionSummary } from "../../lib/api";

export default function ProposalComparePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [versions, setVersions] = useState<ProposalVersionSummary[]>([]);
  const [versionA, setVersionA] = useState<string>("");
  const [versionB, setVersionB] = useState<string>("");
  const [diff, setDiff] = useState<VersionDiff[] | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError("Missing proposal ID.");
      setLoadingVersions(false);
      return;
    }
    phase9Api
      .getVersions(id)
      .then((data) => setVersions(data))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load versions.");
      })
      .finally(() => setLoadingVersions(false));
  }, [id]);

  useEffect(() => {
    if (!id || !versionA || !versionB || versionA === versionB) {
      setDiff(null);
      return;
    }
    setDiffError(null);
    setLoadingDiff(true);
    phase9Api
      .compareVersions(id, versionA, versionB)
      .then((data) => setDiff(data))
      .catch((err: unknown) => {
        setDiffError(err instanceof Error ? err.message : "Failed to compare versions.");
        setDiff(null);
      })
      .finally(() => setLoadingDiff(false));
  }, [id, versionA, versionB]);

  if (loadingVersions) {
    return <p style={{ padding: "1rem" }}>Loading versions…</p>;
  }

  if (error) {
    return (
      <p role="alert" style={{ padding: "1rem", color: "#dc2626" }}>
        Error: {error}
      </p>
    );
  }

  return (
    <div style={{ padding: "1rem", maxWidth: "860px" }}>
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
        <h2 style={{ margin: 0 }}>Compare Versions</h2>
      </div>

      {/* Version selectors */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <div>
          <label
            htmlFor="version-a"
            style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, marginBottom: "0.25rem" }}
          >
            Version A
          </label>
          <select
            id="version-a"
            value={versionA}
            onChange={(e) => setVersionA(e.target.value)}
            style={{
              padding: "0.5rem 0.75rem",
              border: "1px solid #d1d5db",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              minWidth: "180px",
            }}
          >
            <option value="">— Select version —</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.versionNumber} — {v.statusAtCreation.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="version-b"
            style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, marginBottom: "0.25rem" }}
          >
            Version B
          </label>
          <select
            id="version-b"
            value={versionB}
            onChange={(e) => setVersionB(e.target.value)}
            style={{
              padding: "0.5rem 0.75rem",
              border: "1px solid #d1d5db",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              minWidth: "180px",
            }}
          >
            <option value="">— Select version —</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.versionNumber} — {v.statusAtCreation.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loadingDiff && <p style={{ color: "#6b7280" }}>Comparing…</p>}

      {diffError && (
        <p role="alert" style={{ color: "#dc2626", fontSize: "0.875rem", marginBottom: "1rem" }}>
          {diffError}
        </p>
      )}

      {diff !== null && !loadingDiff && (
        <>
          {diff.length === 0 ? (
            <p style={{ color: "#6b7280" }}>No field differences between these versions.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.875rem",
                }}
              >
                <thead>
                  <tr style={{ backgroundColor: "#f9fafb" }}>
                    <th
                      style={{
                        padding: "0.625rem 0.75rem",
                        textAlign: "left",
                        border: "1px solid #e5e7eb",
                        fontWeight: 600,
                        width: "30%",
                      }}
                    >
                      Field
                    </th>
                    <th
                      style={{
                        padding: "0.625rem 0.75rem",
                        textAlign: "left",
                        border: "1px solid #e5e7eb",
                        fontWeight: 600,
                      }}
                    >
                      Version A
                    </th>
                    <th
                      style={{
                        padding: "0.625rem 0.75rem",
                        textAlign: "left",
                        border: "1px solid #e5e7eb",
                        fontWeight: 600,
                      }}
                    >
                      Version B
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {diff.map((row) => (
                    <tr
                      key={row.fieldId}
                      style={{
                        backgroundColor: row.changed ? "#fefce8" : "#fff",
                      }}
                    >
                      <td
                        style={{
                          padding: "0.5rem 0.75rem",
                          border: "1px solid #e5e7eb",
                          fontWeight: 500,
                          color: "#374151",
                        }}
                      >
                        {row.label}
                      </td>
                      <td
                        style={{
                          padding: "0.5rem 0.75rem",
                          border: "1px solid #e5e7eb",
                          color: row.changed ? "#b45309" : "#374151",
                        }}
                      >
                        {row.v1Value ?? <span style={{ color: "#9ca3af" }}>—</span>}
                      </td>
                      <td
                        style={{
                          padding: "0.5rem 0.75rem",
                          border: "1px solid #e5e7eb",
                          color: row.changed ? "#15803d" : "#374151",
                        }}
                      >
                        {row.v2Value ?? <span style={{ color: "#9ca3af" }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
