"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`http://127.0.0.1:8000/api/cases/${id}`)
      .then((r) => r.json())
      .then((data) => setState(data))
      .catch((e) => setError(String(e)));
  }, [id]);

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

  return (
    <main style={{ padding: 32 }}>
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

      <h3>Raw state (debug)</h3>
      <pre style={{ background: "#eee", padding: 12 }}>
        {JSON.stringify(state, null, 2)}
      </pre>
    </main>
  );
}