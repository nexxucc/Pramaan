"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import {
  api,
  type AuditEntry,
  type Explanation,
  type PipelineState,
} from "@/lib/api";
import {
  DECISION_TONE,
  decisionLabel,
  money,
  relativeTime,
  titleCase,
} from "@/lib/format";
import { DivergingBar } from "@/components/charts";
import {
  Badge,
  Card,
  CardHeader,
  Empty,
  ErrorNote,
  KeyValue,
  LinkButton,
  PageHeader,
  Skeleton,
} from "@/components/ui";

type StageStatus = "done" | "failed" | "skipped" | "paused" | "pending";

const STAGE_TONE: Record<StageStatus, "ok" | "bad" | "warn" | "info" | "neutral"> =
  {
    done: "ok",
    failed: "bad",
    paused: "warn",
    skipped: "info",
    pending: "neutral",
  };

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<PipelineState | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [resuming, setResuming] = useState(false);
  const [thresholds, setThresholds] = useState<{
    auto_resolve: number;
    escalate: number;
  } | null>(null);

  // Next.js reuses this component across /cases/A -> /cases/B, so `id` can
  // change without a remount. Every response is checked against the id that
  // is current when it lands: a slow response for A must not overwrite B's
  // state, or the page would show A while the approve/reject buttons submit
  // against B.
  const currentId = useRef(id);
  currentId.current = id;

  const load = useCallback(() => {
    const requestedId = id;
    const isStale = () => currentId.current !== requestedId;
    api
      .getCase(requestedId)
      .then((d) => {
        if (!isStale()) setState(d);
      })
      .catch((e) => {
        if (!isStale()) setError(String(e));
      });
    api
      .getAudit(requestedId)
      .then((d) => {
        if (!isStale()) setAudit(d);
      })
      .catch(() => {});
  }, [id]);

  // Clear the previous case before its replacement arrives, so the page shows
  // skeletons rather than another case's evidence and explanation.
  useEffect(() => {
    setState(null);
    setAudit([]);
    setExplanation(null);
    setError(null);
    setNote("");
  }, [id]);

  useEffect(load, [load]);

  useEffect(() => {
    api
      .metrics()
      .then((m) => setThresholds(m.thresholds))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (state?.vlm_validity_score == null) return;
    // SHAP is recomputed server-side per call and is slow; the page is fully
    // usable without it, so a failure here stays silent. It is also the
    // slowest call on the page, so it is the most likely to land late.
    const requestedId = id;
    api
      .explain(requestedId)
      .then((d) => {
        if (currentId.current === requestedId && !d.error) setExplanation(d);
      })
      .catch(() => {});
  }, [id, state?.vlm_validity_score]);

  const resume = async (action: "approve" | "reject") => {
    setResuming(true);
    try {
      await api.resume(id, action, note);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setResuming(false);
    }
  };

  const stages = useMemo(() => {
    if (!state) return [];
    const at = (stage: string) =>
      audit.find((a) => a.stage === stage)?.created_at ?? null;
    const s = state;

    const precheckPassed = s.precheck_passed;
    const vlmRan = s.vlm_validity_score != null || s.vlm_error != null;

    const rows: {
      name: string;
      status: StageStatus;
      detail: string;
      at: string | null;
    }[] = [
      {
        name: "Webhook trigger",
        status: "done",
        detail: `Dispute ${String(s.raw_payload?.dispute_id ?? "—")} received`,
        at: at("webhook_trigger"),
      },
      {
        name: "Standardize bundle",
        status: s.evidence_bundle ? "done" : "pending",
        detail: s.evidence_bundle
          ? "Raw payload normalized into a typed evidence bundle"
          : "Not reached",
        at: at("standardize_bundle"),
      },
      {
        name: "Completeness pre-check",
        status:
          precheckPassed == null ? "pending" : precheckPassed ? "done" : "failed",
        detail:
          precheckPassed === false
            ? `Missing: ${(s.precheck_missing ?? []).join(", ") || "unknown"}`
            : "All evidence required by this reason code is present",
        at: at("completeness_precheck"),
      },
      {
        name: "VLM propose",
        status: s.vlm_error ? "failed" : vlmRan ? "done" : "skipped",
        detail: s.vlm_error
          ? s.vlm_error
          : vlmRan
            ? `Validity score ${s.vlm_validity_score?.toFixed(2)} with ${s.vlm_citations?.length ?? 0} citations`
            : "Skipped — the pre-check short-circuited before any model was called",
        at: at("vlm_propose"),
      },
      {
        name: "Compliance post-check",
        status:
          s.postcheck_passed == null
            ? "skipped"
            : s.postcheck_passed
              ? "done"
              : "failed",
        detail:
          s.postcheck_passed === false
            ? `Unresolvable citations: ${(s.postcheck_violations ?? []).join(", ")}`
            : s.postcheck_passed
              ? "Every citation resolves to a real path in the bundle"
              : "Not reached",
        at: at("compliance_postcheck"),
      },
      {
        name: "Calibrator",
        status: s.calibrated_score == null ? "skipped" : "done",
        detail:
          s.calibrated_score == null
            ? "Not reached"
            : `Calibrated probability ${s.calibrated_score.toFixed(3)}`,
        at: at("calibrator"),
      },
      {
        name: "Router",
        status: s.decision ? "done" : "pending",
        detail: s.decision
          ? `Routed to ${titleCase(s.decision)}`
          : "Not reached",
        at: at("router"),
      },
    ];

    if (s.decision === "escalate") {
      rows.push({
        name: "Human review",
        status: s.human_decision ? "done" : "paused",
        detail: s.human_decision
          ? `${titleCase(s.human_decision)}${s.human_note ? ` — “${s.human_note}”` : ""}`
          : "Pipeline paused on a LangGraph interrupt, waiting for a reviewer",
        at: at("human_review"),
      });
    }

    return rows;
  }, [state, audit]);

  const contributions = useMemo(() => {
    if (!explanation) return [];
    return Object.entries(explanation.contributions)
      .map(([feature, value]) => ({ feature, value }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  }, [explanation]);

  const maxAbs = Math.max(...contributions.map((c) => Math.abs(c.value)), 1e-9);

  if (error) {
    return (
      <>
        <PageHeader title="Case" />
        <ErrorNote error={error} />
      </>
    );
  }

  if (!state) {
    return (
      <>
        <PageHeader title="Case" />
        <Card className="px-5 py-6">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="mt-3 h-4 w-full" />
        </Card>
      </>
    );
  }

  if (state.error) {
    return (
      <>
        <PageHeader title="Case not found" />
        <Card className="px-5 py-8 text-center">
          <p className="text-[13px] text-muted">
            No case with id <code className="num">{id}</code> exists in the
            checkpointer.
          </p>
          <div className="mt-4">
            <LinkButton href="/cases">Back to the queue</LinkButton>
          </div>
        </Card>
      </>
    );
  }

  const bundle = (state.evidence_bundle ?? {}) as Record<string, unknown>;
  const transaction = (bundle.transaction ?? {}) as Record<string, unknown>;
  const delivery = (bundle.delivery ?? {}) as Record<string, unknown>;
  const communication = (bundle.communication ?? []) as string[];
  const awaiting = state.decision === "escalate" && !state.human_decision;

  return (
    <div className="rise">
      <PageHeader
        title={`Case ${id.slice(0, 8)}`}
        subtitle={
          <span className="num text-[11.5px] text-faint">{id}</span>
        }
        right={<LinkButton href="/cases">Back to queue</LinkButton>}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone={DECISION_TONE[state.decision ?? ""] ?? "neutral"}>
          Router: {decisionLabel(state.decision)}
        </Badge>
        {state.human_decision && (
          <Badge tone={state.human_decision === "approve" ? "ok" : "bad"}>
            Human: {titleCase(state.human_decision)}
          </Badge>
        )}
        {awaiting && <Badge tone="warn">Awaiting review</Badge>}
        <Badge>{titleCase(String(bundle.reason_code ?? "—"))}</Badge>
        {typeof transaction.amount === "number" && (
          <Badge>{money(transaction.amount)}</Badge>
        )}
      </div>

      {state.calibrated_score != null && thresholds && (
        <ScoreBand score={state.calibrated_score} thresholds={thresholds} />
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0 space-y-3">
          <Card>
            <CardHeader
              title="Pipeline trail"
              hint="Seven stages, each writing its input and output to the audit log. Timestamps come from that table, not from the UI."
            />
            <ol className="px-5 py-4">
              {stages.map((s, i) => (
                <li key={s.name} className="flex gap-3.5">
                  <div className="flex flex-col items-center">
                    <span
                      className="mt-1 size-2.5 rounded-full ring-4"
                      style={{
                        background:
                          s.status === "pending" || s.status === "skipped"
                            ? "var(--border-strong)"
                            : `var(--${STAGE_TONE[s.status]})`,
                        // @ts-expect-error -- CSS custom property on a style object
                        "--tw-ring-color": "var(--surface)",
                      }}
                    />
                    {i < stages.length - 1 && (
                      <span className="my-1 w-px flex-1 bg-line" />
                    )}
                  </div>
                  <div className="flex-1 pb-5">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[13px] font-medium">{s.name}</span>
                      <Badge tone={STAGE_TONE[s.status]}>{s.status}</Badge>
                      <span className="ml-auto text-[11px] text-faint">
                        {relativeTime(s.at)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
                      {s.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          {(state.vlm_draft_response || state.vlm_error) && (
            <Card>
              <CardHeader
                title="Drafted evidence response"
                hint="Written by the model, then checked against the bundle before anyone can act on it."
              />
              {state.vlm_error ? (
                <p className="px-5 py-4 text-[12.5px] text-bad">
                  {state.vlm_error}
                </p>
              ) : (
                <p className="px-5 py-4 text-[13px] leading-relaxed">
                  {state.vlm_draft_response}
                </p>
              )}
              {state.vlm_citations && state.vlm_citations.length > 0 && (
                <div className="border-t border-line px-5 py-3.5">
                  <div className="mb-2 text-[11px] font-medium tracking-wide text-muted uppercase">
                    Citations
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {state.vlm_citations.map((c) => {
                      const violated =
                        state.postcheck_violations?.includes(c) ?? false;
                      return (
                        <span
                          key={c}
                          title={
                            violated
                              ? "Did not resolve to a path in the evidence bundle"
                              : "Resolved against the evidence bundle"
                          }
                          className={`num rounded-md px-2 py-1 text-[11px] ${
                            violated
                              ? "bg-bad-soft text-bad"
                              : "bg-surface-2 text-muted"
                          }`}
                        >
                          {c}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          )}

          <Card>
            <CardHeader title="Evidence bundle" />
            <KeyValue
              rows={[
                ["Reason code", titleCase(String(bundle.reason_code ?? "—"))],
                ...Object.entries(transaction).map(
                  ([k, v]) =>
                    [
                      `transaction.${k}`,
                      k === "amount" && typeof v === "number"
                        ? money(v)
                        : String(v),
                    ] as [string, string],
                ),
                ...Object.entries(delivery).map(
                  ([k, v]) => [`delivery.${k}`, String(v)] as [string, string],
                ),
              ]}
            />
            {communication.length > 0 && (
              <div className="border-t border-line px-5 py-4">
                <div className="mb-2 text-[11px] font-medium tracking-wide text-muted uppercase">
                  Communication
                </div>
                <ul className="space-y-2">
                  {communication.map((c, i) => (
                    <li
                      key={i}
                      className="rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] leading-relaxed"
                    >
                      <span className="num mr-2 text-[11px] text-faint">
                        [{i}]
                      </span>
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-3">
          {awaiting && (
            <Card className="border-warn/40">
              <CardHeader
                title="Escalated — awaiting your decision"
                hint="The graph is paused mid-run. Resuming it writes your verdict into the same checkpoint the pipeline stopped at."
              />
              <div className="px-5 py-4">
                <textarea
                  placeholder="Review note (stored on the case)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="min-h-[72px] w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px] outline-none focus:border-accent"
                />
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => resume("approve")}
                    disabled={resuming}
                    className="flex-1 rounded-lg bg-ok px-3 py-2 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {resuming ? "Submitting…" : "Approve"}
                  </button>
                  <button
                    onClick={() => resume("reject")}
                    disabled={resuming}
                    className="flex-1 rounded-lg border border-line px-3 py-2 text-[12.5px] font-medium text-bad transition-colors hover:bg-bad-soft disabled:opacity-50"
                  >
                    {resuming ? "Submitting…" : "Reject"}
                  </button>
                </div>
              </div>
            </Card>
          )}

          {state.human_decision && (
            <Card>
              <CardHeader title="Human review" />
              <div className="px-5 py-4">
                <Badge tone={state.human_decision === "approve" ? "ok" : "bad"}>
                  {titleCase(state.human_decision)}
                </Badge>
                {state.human_note && (
                  <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted">
                    “{state.human_note}”
                  </p>
                )}
                <p className="mt-3 border-t border-line pt-3 text-[11.5px] text-faint">
                  The router&apos;s original verdict stays{" "}
                  <span className="text-muted">
                    {decisionLabel(state.decision)}
                  </span>{" "}
                  for audit fidelity — only the case status moves.
                </p>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Why this score"
              hint="SHAP contributions against the calibrator's average prediction. Green pushes the score up, red pulls it down."
            />
            {!explanation ? (
              state.vlm_validity_score == null ? (
                <Empty>
                  This case never reached the calibrator, so there is nothing to
                  explain.
                </Empty>
              ) : (
                <div className="space-y-2.5 px-5 py-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-4 w-full" />
                  ))}
                  <p className="pt-1 text-[11.5px] text-faint">
                    Computing SHAP values…
                  </p>
                </div>
              )
            ) : (
              <>
                <div className="flex items-baseline gap-4 px-5 py-3.5">
                  <div>
                    <div className="text-[11px] text-muted">Base rate</div>
                    <div className="num text-[15px] font-semibold">
                      {explanation.base_value.toFixed(3)}
                    </div>
                  </div>
                  <span className="text-[11px] text-faint">plus contributions equals</span>
                  <div>
                    <div className="text-[11px] text-muted">This case</div>
                    <div className="num text-[15px] font-semibold">
                      {explanation.predicted_score.toFixed(3)}
                    </div>
                  </div>
                </div>
                <div className="space-y-2 border-t border-line px-5 py-4">
                  {contributions.map((c) => (
                    <div key={c.feature} className="flex items-center gap-3">
                      <span className="num w-40 shrink-0 truncate text-[11.5px] text-muted">
                        {c.feature}
                      </span>
                      <DivergingBar value={c.value} maxAbs={maxAbs} />
                      <span
                        className="num w-14 shrink-0 text-right text-[11.5px]"
                        style={{
                          color: c.value >= 0 ? "var(--ok)" : "var(--bad)",
                        }}
                      >
                        {c.value >= 0 ? "+" : ""}
                        {c.value.toFixed(3)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          <Card>
            <CardHeader title="Raw pipeline state" />
            <details className="px-5 py-3.5">
              <summary className="cursor-pointer text-[12px] text-muted select-none">
                Show the full checkpointer state
              </summary>
              <pre className="num mt-3 max-h-96 overflow-auto rounded-lg bg-surface-2 p-3 text-[11px] leading-relaxed">
                {JSON.stringify(state, null, 2)}
              </pre>
            </details>
          </Card>
        </div>
      </div>

      <p className="mt-4 text-[11.5px] text-faint">
        Full API for this case:{" "}
        <Link
          href="/cases"
          className="text-accent hover:underline"
        >
          queue
        </Link>{" "}
        · state, audit trail and SHAP explanation are three separate endpoints,
        all keyed on this case id.
      </p>
    </div>
  );
}

/** The score placed on the two learned thresholds, because "0.41" means
 *  nothing without knowing where the bars sit. */
function ScoreBand({
  score,
  thresholds,
}: {
  score: number;
  thresholds: { auto_resolve: number; escalate: number };
}) {
  const pos = Math.max(0, Math.min(1, score)) * 100;
  const esc = thresholds.escalate * 100;
  const auto = thresholds.auto_resolve * 100;

  return (
    <Card className="px-5 py-4">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-medium tracking-wide text-muted uppercase">
          Calibrated probability the dispute is valid
        </span>
        <span className="num text-[20px] font-semibold">
          {score.toFixed(3)}
        </span>
      </div>

      <div className="relative mt-4 h-2.5 w-full overflow-hidden rounded-full">
        <div
          className="absolute inset-y-0 left-0"
          style={{ width: `${esc}%`, background: "var(--info-soft)" }}
        />
        <div
          className="absolute inset-y-0"
          style={{
            left: `${esc}%`,
            width: `${auto - esc}%`,
            background: "var(--warn-soft)",
          }}
        />
        <div
          className="absolute inset-y-0"
          style={{
            left: `${auto}%`,
            right: 0,
            background: "var(--ok-soft)",
          }}
        />
        <div
          className="absolute -top-1 h-4.5 w-[3px] rounded-full"
          style={{ left: `calc(${pos}% - 1.5px)`, background: "var(--text)" }}
        />
      </div>

      <div className="mt-2 flex text-[11px] text-muted">
        <span style={{ width: `${esc}%` }}>Request evidence</span>
        <span style={{ width: `${auto - esc}%` }}>Escalate to a human</span>
        <span className="flex-1 text-right">Auto-resolve</span>
      </div>
    </Card>
  );
}
