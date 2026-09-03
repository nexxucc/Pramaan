"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { api, REASON_CODES, type CaseSummary } from "@/lib/api";
import {
  DECISION_TONE,
  decisionLabel,
  relativeTime,
  shortId,
  titleCase,
} from "@/lib/format";
import { MiniBar } from "@/components/charts";
import {
  Badge,
  Card,
  Empty,
  ErrorNote,
  LinkButton,
  PageHeader,
  Skeleton,
} from "@/components/ui";

const DECISION_FILTERS = [
  { key: "all", label: "All" },
  { key: "escalate", label: "Escalated" },
  { key: "auto_resolve", label: "Auto-resolved" },
  { key: "request_evidence", label: "Evidence requested" },
] as const;

type Sort = "recent" | "score";

export default function CaseQueuePage() {
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<string>("all");
  const [reason, setReason] = useState<string>("all");
  const [awaitingOnly, setAwaitingOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("recent");

  useEffect(() => {
    api.listCases().then(setCases).catch((e) => setError(String(e)));
  }, []);

  const filtered = useMemo(() => {
    if (!cases) return [];
    const rows = cases.filter((c) => {
      if (decision !== "all" && c.decision !== decision) return false;
      if (reason !== "all" && c.reason_code !== reason) return false;
      // "Awaiting review" is the escalate branch that no human has resumed
      // yet — status still reads `escalate` rather than approved/rejected.
      if (awaitingOnly && !(c.decision === "escalate" && c.status === "escalate"))
        return false;
      return true;
    });
    return rows.sort((a, b) =>
      sort === "score"
        ? (b.calibrated_score ?? -1) - (a.calibrated_score ?? -1)
        : (b.created_at ?? "").localeCompare(a.created_at ?? ""),
    );
  }, [cases, decision, reason, awaitingOnly, sort]);

  const awaitingCount = useMemo(
    () =>
      (cases ?? []).filter(
        (c) => c.decision === "escalate" && c.status === "escalate",
      ).length,
    [cases],
  );

  if (error) {
    return (
      <>
        <PageHeader title="Case queue" />
        <ErrorNote error={error} />
      </>
    );
  }

  return (
    <div className="rise">
      <PageHeader
        title="Case queue"
        subtitle="Every case the pipeline has produced. The router's verdict never changes; the status column is what moves once a human resumes an escalated case."
        right={<LinkButton href="/simulate" variant="solid">Run a dispute</LinkButton>}
      />

      <Card className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3.5">
        <div className="flex items-center gap-1">
          {DECISION_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setDecision(f.key)}
              className={`rounded-lg px-2.5 py-1.5 text-[12px] transition-colors ${
                decision === f.key
                  ? "bg-surface-2 font-medium text-ink"
                  : "text-muted hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] outline-none focus:border-accent"
        >
          <option value="all">All reason codes</option>
          {REASON_CODES.map((r) => (
            <option key={r} value={r}>
              {titleCase(r)}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-[12px] text-muted">
          <input
            type="checkbox"
            checked={awaitingOnly}
            onChange={(e) => setAwaitingOnly(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          Awaiting review
          {awaitingCount > 0 && (
            <Badge tone="warn">{awaitingCount}</Badge>
          )}
        </label>

        <div className="ml-auto flex items-center gap-2 text-[12px] text-muted">
          <span>Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] outline-none focus:border-accent"
          >
            <option value="recent">Most recent</option>
            <option value="score">Highest score</option>
          </select>
        </div>
      </Card>

      <Card>
        {!cases ? (
          <div className="space-y-3 px-5 py-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Empty>
            {cases.length === 0 ? (
              <>
                Nothing here yet — send a dispute through from{" "}
                <Link href="/simulate" className="text-accent hover:underline">
                  Run a dispute
                </Link>
                .
              </>
            ) : (
              "No cases match these filters."
            )}
          </Empty>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-[11px] tracking-wide text-muted uppercase">
                <th className="px-5 py-2.5 text-left font-medium">Case</th>
                <th className="px-5 py-2.5 text-left font-medium">Reason</th>
                <th className="px-5 py-2.5 text-left font-medium">Routed to</th>
                <th className="px-5 py-2.5 text-left font-medium">Status</th>
                <th className="w-52 px-5 py-2.5 text-left font-medium">
                  Calibrated score
                </th>
                <th className="px-5 py-2.5 text-right font-medium">Arrived</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const awaiting =
                  c.decision === "escalate" && c.status === "escalate";
                return (
                  <tr
                    key={c.case_id}
                    className="border-t border-line hover:bg-surface-2"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/cases/${c.case_id}`}
                        className="num text-accent hover:underline"
                      >
                        {shortId(c.case_id)}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {titleCase(c.reason_code ?? "—")}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={DECISION_TONE[c.decision ?? ""] ?? "neutral"}>
                        {decisionLabel(c.decision)}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      {awaiting ? (
                        <span className="text-warn">Awaiting review</span>
                      ) : (
                        <span className="text-muted">{titleCase(c.status)}</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {c.calibrated_score == null ? (
                        <span
                          className="text-faint"
                          title="Case short-circuited before the calibrator ran."
                        >
                          not scored
                        </span>
                      ) : (
                        <div className="flex items-center gap-3">
                          <MiniBar value={c.calibrated_score} />
                          <span className="num w-10 text-right">
                            {c.calibrated_score.toFixed(3)}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right text-muted">
                      {relativeTime(c.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {cases && (
        <p className="mt-3 text-[11.5px] text-faint">
          Showing {filtered.length} of {cases.length} cases.
        </p>
      )}
    </div>
  );
}
