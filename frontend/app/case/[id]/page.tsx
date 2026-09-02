"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Explanation = {
  predicted_score: number;
  base_value: number;
  contributions: Record<string, number>;
};

type CaseState = {
  raw_payload?: { dispute_id?: string };
  evidence_bundle?: Record<string, unknown>;
  precheck_passed?: boolean;
  vlm_validity_score?: number;
  vlm_draft_response?: string;
  postcheck_passed?: boolean;
  calibrated_score?: number;
  decision?: string;
  human_decision?: string;
  human_note?: string;
  error?: string;
};

const API = "http://127.0.0.1:8000";

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<CaseState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [resuming, setResuming] = useState(false);
  const [note, setNote] = useState("");

  const loadState = useCallback(() => {
    fetch(`${API}/api/cases/${id}`)
      .then((r) => r.json())
      .then((data) => setState(data))
      .catch((e) => setError(String(e)));
  }, [id]);

  useEffect(() => {
    loadState();
  }, [loadState]);

  useEffect(() => {
    if (state?.vlm_validity_score == null) return;
    fetch(`${API}/api/cases/${id}/explain`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setExplanation(data);
      })
      .catch(() => {
        /* SHAP explanation is a nice-to-have, don't block the page on it */
      });
  }, [id, state?.vlm_validity_score]);

  const resume = async (action: "approve" | "reject") => {
    setResuming(true);
    try {
      await fetch(`${API}/api/cases/${id}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      loadState();
    } finally {
      setResuming(false);
    }
  };

  if (error) return <main style={{ padding: 32 }}>Error: {error}</main>;
  if (!state) return <main style={{ padding: 32 }}>Loading...</main>;

  const stages = [
    { name: "Webhook trigger", value: state.raw_payload?.dispute_id },
    { name: "Standardize bundle", value: state.evidence_bundle ? "done" : "-" },
    { name: "Completeness pre-check", value: `passed: ${state.precheck_passed}` },
    { name: "VLM propose", value: `score: ${state.vlm_validity_score}` },
    { name: "Compliance post-check", value: `passed: ${state.postcheck_passed}` },
    { name: "Calibrator", value: `score: ${state.calibrated_score}` },
    { name: "Router", value: `decision: ${state.decision}` },
  ];

  const awaitingHumanReview = state.decision === "escalate" && !state.human_decision;

  const sortedContributions = explanation
    ? Object.entries(explanation.contributions).sort(
        (a, b) => Math.abs(b[1]) - Math.abs(a[1])
      )
    : [];
  const maxAbsContribution = sortedContributions.length
    ? Math.max(...sortedContributions.map(([, v]) => Math.abs(v)))
    : 1;

  return (
    <main style={{ padding: 32, maxWidth: 800 }}>
      <h1>Case {id}</h1>
      <ol>
        {stages.map((s) => (
          <li key={s.name} style={{ marginBottom: 12 }}>
            <strong>{s.name}</strong> — {String(s.value)}
          </li>
        ))}
      </ol>

      <h3>VLM draft response</h3>
      <p>{state.vlm_draft_response}</p>

      {awaitingHumanReview && (
        <div style={{ background: "#fff8e1", border: "1px solid #e0c46c", padding: 16, marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Escalated — awaiting human review</h3>
          <textarea
            placeholder="review note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ width: "100%", minHeight: 60, marginBottom: 8 }}
          />
          <div>
            <button onClick={() => resume("approve")} disabled={resuming} style={{ marginRight: 8 }}>
              {resuming ? "Submitting..." : "Approve"}
            </button>
            <button onClick={() => resume("reject")} disabled={resuming}>
              {resuming ? "Submitting..." : "Reject"}
            </button>
          </div>
        </div>
      )}

      {state.human_decision && (
        <div style={{ background: "#e8f5e9", border: "1px solid #7cb87f", padding: 16, marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Human review complete</h3>
          <p>
            Decision: <strong>{state.human_decision}</strong>
            {state.human_note ? ` — "${state.human_note}"` : ""}
          </p>
        </div>
      )}

      {explanation && (
        <div style={{ marginTop: 24 }}>
          <h3>Calibrator explanation (SHAP)</h3>
          <p style={{ color: "#555" }}>
            Predicted score {explanation.predicted_score.toFixed(3)}, base rate{" "}
            {explanation.base_value.toFixed(3)}. Bars show each feature&apos;s push away from
            the base rate.
          </p>
          {sortedContributions.map(([feature, value]) => (
            <div key={feature} style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
              <div style={{ width: 200, fontSize: 13 }}>{feature}</div>
              <div style={{ flex: 1, background: "#eee", height: 18, position: "relative" }}>
                <div
                  style={{
                    position: "absolute",
                    left: value >= 0 ? "50%" : `${50 - (Math.abs(value) / maxAbsContribution) * 50}%`,
                    width: `${(Math.abs(value) / maxAbsContribution) * 50}%`,
                    height: "100%",
                    background: value >= 0 ? "#4caf50" : "#e53935",
                  }}
                />
                <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#999" }} />
              </div>
              <div style={{ width: 70, textAlign: "right", fontSize: 13 }}>{value.toFixed(3)}</div>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ marginTop: 24 }}>Raw state (debug)</h3>
      <pre style={{ background: "#eee", padding: 12, overflowX: "auto" }}>
        {JSON.stringify(state, null, 2)}
      </pre>
    </main>
  );
}
