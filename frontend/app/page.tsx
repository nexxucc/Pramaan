"use client";

import { useState } from "react";
import Link from "next/link";

// TODO Day 2: replace with fetch("http://127.0.0.1:8000/api/cases") once DB-backed
const KNOWN_CASE_IDS = [
  "2b33c20a-5d02-435d-90ca-8babdc59c607",
];

export default function CaseListPage() {
  const [newId, setNewId] = useState("");

  return (
    <main style={{ padding: 32 }}>
      <h1>Pramaan — Cases</h1>

      <ul>
        {KNOWN_CASE_IDS.map((id) => (
          <li key={id}>
            <Link href={`/case/${id}`}>{id}</Link>
          </li>
        ))}
      </ul>

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