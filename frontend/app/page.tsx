"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type CaseSummary = {
  case_id: string;
  reason_code: string;
  status: string;
  decision: string | null;
  calibrated_score: number | null;
  created_at: string | null;
};

export default function CaseListPage() {
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newId, setNewId] = useState("");

  useEffect(() => {
    fetch("http://127.0.0.1:8000/api/cases")
      .then((r) => r.json())
      .then((data) => setCases(data))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <main style={{ padding: 32 }}>
      <h1>Pramaan — Cases</h1>

      {error && <p style={{ color: "crimson" }}>Error loading cases: {error}</p>}
      {!cases && !error && <p>Loading...</p>}
      {cases && cases.length === 0 && <p>No cases yet — post a dispute to /api/webhook/dispute.</p>}

      {cases && cases.length > 0 && (
        <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 16 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #333" }}>
              <th style={{ padding: 8 }}>Case ID</th>
              <th style={{ padding: 8 }}>Reason</th>
              <th style={{ padding: 8 }}>Status</th>
              <th style={{ padding: 8 }}>Router decision</th>
              <th style={{ padding: 8 }}>Calibrated score</th>
              <th style={{ padding: 8 }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c.case_id} style={{ borderBottom: "1px solid #ddd" }}>
                <td style={{ padding: 8 }}>
                  <Link href={`/case/${c.case_id}`}>{c.case_id.slice(0, 8)}...</Link>
                </td>
                <td style={{ padding: 8 }}>{c.reason_code}</td>
                <td style={{ padding: 8 }}>{c.status}</td>
                <td style={{ padding: 8 }}>{c.decision ?? "-"}</td>
                <td style={{ padding: 8 }}>
                  {c.calibrated_score != null ? c.calibrated_score.toFixed(3) : "-"}
                </td>
                <td style={{ padding: 8 }}>
                  {c.created_at ? new Date(c.created_at).toLocaleString() : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: 24 }}>
        <input
          placeholder="paste case_id from webhook response"
          value={newId}
          onChange={(e) => setNewId(e.target.value)}
          style={{ width: 320, marginRight: 8 }}
        />
        <Link href={`/case/${newId}`}>View</Link>
      </div>
    </main>
  );
}
