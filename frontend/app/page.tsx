"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import { api, type CaseSummary, type Metrics } from "@/lib/api";
import {
  DECISION_COLOR,
  DECISION_TONE,
  decisionLabel,
  pct,
  relativeTime,
  toUtcIso,
  shortId,
  titleCase,
} from "@/lib/format";
import { AXIS, ChartBox, GRID, TooltipShell } from "@/components/charts";
import {
  Badge,
  Card,
  CardHeader,
  Empty,
  ErrorNote,
  LinkButton,
  PageHeader,
  Skeleton,
  Stat,
} from "@/components/ui";

const DECISIONS = ["auto_resolve", "escalate", "request_evidence"] as const;

export default function OverviewPage() {
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listCases().then(setCases).catch((e) => setError(String(e)));
    // The metrics artifact is a nice-to-have on this page -- the dashboard
    // still works without it, so its failure is swallowed rather than shown.
    api.metrics().then(setMetrics).catch(() => {});
  }, []);

  const stats = useMemo(() => {
    if (!cases) return null;
    const n = cases.length;
    const by = (d: string) => cases.filter((c) => c.decision === d).length;
    const awaiting = cases.filter(
      (c) => c.status === "escalate" && c.decision === "escalate",
    ).length;
    const scored = cases.filter((c) => c.calibrated_score != null);
    const avg =
      scored.reduce((s, c) => s + (c.calibrated_score ?? 0), 0) /
      Math.max(1, scored.length);
    return {
      n,
      auto: by("auto_resolve"),
      escalated: by("escalate"),
      requested: by("request_evidence"),
      awaiting,
      avg,
      reviewed: cases.filter(
        (c) => c.status === "approved" || c.status === "rejected",
      ).length,
    };
  }, [cases]);

  const mix = useMemo(() => {
    if (!cases) return [];
    return DECISIONS.map((d) => ({
      name: titleCase(d),
      key: d,
      value: cases.filter((c) => c.decision === d).length,
    })).filter((r) => r.value > 0);
  }, [cases]);

  const byReason = useMemo(() => {
    if (!cases) return [];
    const codes = Array.from(
      new Set(cases.map((c) => c.reason_code).filter(Boolean)),
    ) as string[];
    return codes
      .map((code) => {
        const rows = cases.filter((c) => c.reason_code === code);
        return {
          reason: titleCase(code),
          auto_resolve: rows.filter((c) => c.decision === "auto_resolve").length,
          escalate: rows.filter((c) => c.decision === "escalate").length,
          request_evidence: rows.filter(
            (c) => c.decision === "request_evidence",
          ).length,
          total: rows.length,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [cases]);

  const scatter = useMemo(() => {
    if (!cases) return [];
    return cases
      .filter((c) => c.calibrated_score != null && c.created_at)
      .map((c) => ({
        t: new Date(toUtcIso(c.created_at as string)).getTime(),
        score: c.calibrated_score as number,
        decision: c.decision ?? "pending",
        reason: titleCase(c.reason_code ?? "—"),
        id: c.case_id,
      }));
  }, [cases]);

  if (error) {
    return (
      <>
        <PageHeader title="Overview" />
        <ErrorNote error={error} />
      </>
    );
  }

  return (
    <div className="rise">
      <PageHeader
        title="Overview"
        subtitle="Every dispute that reaches the webhook is standardized, checked for completeness, reviewed by a vision-language model, verified against the evidence it cites, calibrated into a probability, and routed. This is what the pipeline has done so far."
        right={<LinkButton href="/simulate" variant="solid">Run a dispute</LinkButton>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {!stats ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="px-5 py-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-6 w-14" />
            </Card>
          ))
        ) : (
          <>
            <Stat
              label="Cases processed"
              value={stats.n}
              sub={`${stats.reviewed} closed by a human reviewer`}
            />
            <Stat
              label="Auto-resolved"
              tone="ok"
              value={pct(stats.auto / Math.max(1, stats.n), 0)}
              sub={`${stats.auto} of ${stats.n} cleared without a human`}
            />
            <Stat
              label="Awaiting review"
              tone="warn"
              value={stats.awaiting}
              sub={`${stats.escalated} escalated in total`}
            />
            <Stat
              label="Mean calibrated score"
              tone="info"
              value={stats.avg.toFixed(3)}
              sub={
                metrics
                  ? `Auto-resolve bar sits at ${metrics.thresholds.auto_resolve.toFixed(3)}`
                  : "Probability the dispute is valid"
              }
            />
          </>
        )}
      </div>

      {metrics && (
        <Card className="mt-3 px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div>
              <div className="text-[11px] font-medium tracking-wide text-muted uppercase">
                Out-of-fold model performance
              </div>
              <div className="mt-1 text-[12px] text-muted">
                {metrics.method.primary}, n&nbsp;=&nbsp;{metrics.dataset.n}
              </div>
            </div>
            {[
              ["ROC-AUC", metrics.cv.roc_auc.toFixed(3)],
              ["Precision", metrics.cv.at_operating_point.precision.toFixed(3)],
              ["Recall", metrics.cv.at_operating_point.recall.toFixed(3)],
              [
                "False positives",
                `${metrics.cv.at_operating_point.fp} of ${metrics.dataset.negatives}`,
              ],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="text-[11px] text-muted">{k}</div>
                <div className="num mt-0.5 text-[17px] font-semibold">{v}</div>
              </div>
            ))}
            <Link
              href="/metrics"
              className="ml-auto text-[12.5px] font-medium text-accent hover:underline"
            >
              Full evaluation →
            </Link>
          </div>
        </Card>
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader
            title="Routing mix"
            hint="Where the router sent each case. Escalations pause on a LangGraph interrupt until a human resumes them."
          />
          {mix.length === 0 ? (
            <Empty>No routed cases yet.</Empty>
          ) : (
            <ChartBox height={250}>
              <PieChart>
                <Pie
                  data={mix}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={54}
                  outerRadius={82}
                  paddingAngle={2}
                  stroke="var(--surface)"
                  strokeWidth={2}
                >
                  {mix.map((m) => (
                    <Cell key={m.key} fill={DECISION_COLOR[m.key]} />
                  ))}
                </Pie>
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  iconSize={7}
                  formatter={(v) => (
                    <span className="text-[11.5px] text-muted">{v}</span>
                  )}
                />
                <Tooltip
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <TooltipShell
                        title={payload[0].name as string}
                        rows={[["Cases", payload[0].value as number]]}
                      />
                    ) : null
                  }
                />
              </PieChart>
            </ChartBox>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Routing by reason code"
            hint="Completeness rules differ per reason code, so the routing mix legitimately differs too."
          />
          {byReason.length === 0 ? (
            <Empty>No cases yet.</Empty>
          ) : (
            <ChartBox height={250}>
              <BarChart data={byReason} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid {...GRID} horizontal={false} vertical />
                <XAxis type="number" allowDecimals={false} {...AXIS} />
                <YAxis
                  type="category"
                  dataKey="reason"
                  width={140}
                  {...AXIS}
                />
                <Tooltip
                  cursor={{ fill: "var(--surface-2)" }}
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <TooltipShell
                        title={label as string}
                        rows={payload.map((p) => [
                          titleCase(String(p.dataKey)),
                          p.value as number,
                          p.color,
                        ])}
                      />
                    ) : null
                  }
                />
                {DECISIONS.map((d) => (
                  <Bar
                    key={d}
                    dataKey={d}
                    stackId="a"
                    fill={DECISION_COLOR[d]}
                    radius={d === "request_evidence" ? [0, 3, 3, 0] : 0}
                    maxBarSize={22}
                  />
                ))}
              </BarChart>
            </ChartBox>
          )}
        </Card>
      </div>

      <Card className="mt-3">
        <CardHeader
          title="Calibrated score over time"
          hint={
            metrics
              ? `Each dot is one case. The two rules are the learned routing thresholds — above ${metrics.thresholds.auto_resolve.toFixed(3)} a case auto-resolves, below ${metrics.thresholds.escalate.toFixed(3)} it goes back for more evidence.`
              : "Each dot is one case, positioned by when it arrived and how confident the calibrator was."
          }
        />
        {scatter.length === 0 ? (
          <Empty>No scored cases yet.</Empty>
        ) : (
          <ChartBox height={260}>
            <ScatterChart margin={{ left: 4, right: 16, top: 8 }}>
              <CartesianGrid {...GRID} />
              <XAxis
                type="number"
                dataKey="t"
                domain={["dataMin - 60000", "dataMax + 60000"]}
                tickFormatter={(v) =>
                  new Date(v).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                }
                {...AXIS}
              />
              <YAxis
                type="number"
                dataKey="score"
                domain={[0, 1]}
                tickFormatter={(v) => v.toFixed(1)}
                {...AXIS}
              />
              <ZAxis range={[70, 70]} />
              {metrics && (
                <>
                  <ReferenceLine
                    y={metrics.thresholds.auto_resolve}
                    stroke="var(--ok)"
                    strokeDasharray="4 4"
                    label={{
                      value: "auto-resolve",
                      position: "insideTopRight",
                      fill: "var(--ok)",
                      fontSize: 10,
                    }}
                  />
                  <ReferenceLine
                    y={metrics.thresholds.escalate}
                    stroke="var(--info)"
                    strokeDasharray="4 4"
                    label={{
                      value: "request evidence",
                      position: "insideBottomRight",
                      fill: "var(--info)",
                      fontSize: 10,
                    }}
                  />
                </>
              )}
              <Tooltip
                cursor={{ stroke: "var(--border-strong)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as (typeof scatter)[number];
                  return (
                    <TooltipShell
                      title={shortId(p.id)}
                      rows={[
                        ["Reason", p.reason],
                        ["Score", p.score.toFixed(3)],
                        [
                          "Routed to",
                          decisionLabel(p.decision),
                          DECISION_COLOR[p.decision],
                        ],
                      ]}
                    />
                  );
                }}
              />
              {DECISIONS.map((d) => (
                <Scatter
                  key={d}
                  name={titleCase(d)}
                  data={scatter.filter((s) => s.decision === d)}
                  fill={DECISION_COLOR[d]}
                  fillOpacity={0.85}
                />
              ))}
            </ScatterChart>
          </ChartBox>
        )}
      </Card>

      <Card className="mt-3">
        <CardHeader
          title="Recent cases"
          right={
            <Link
              href="/cases"
              className="text-[12.5px] font-medium text-accent hover:underline"
            >
              All cases →
            </Link>
          }
        />
        {!cases ? (
          <div className="space-y-3 px-5 py-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        ) : cases.length === 0 ? (
          <Empty>
            No cases yet — send one through from{" "}
            <Link href="/simulate" className="text-accent hover:underline">
              Run a dispute
            </Link>
            .
          </Empty>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-[11px] tracking-wide text-muted uppercase">
                <th className="px-5 py-2 text-left font-medium">Case</th>
                <th className="px-5 py-2 text-left font-medium">Reason</th>
                <th className="px-5 py-2 text-left font-medium">Routed to</th>
                <th className="px-5 py-2 text-left font-medium">Status</th>
                <th className="px-5 py-2 text-right font-medium">Score</th>
                <th className="px-5 py-2 text-right font-medium">Arrived</th>
              </tr>
            </thead>
            <tbody>
              {cases.slice(0, 6).map((c) => (
                <tr
                  key={c.case_id}
                  className="border-t border-line hover:bg-surface-2"
                >
                  <td className="px-5 py-2.5">
                    <Link
                      href={`/cases/${c.case_id}`}
                      className="num text-accent hover:underline"
                    >
                      {shortId(c.case_id)}
                    </Link>
                  </td>
                  <td className="px-5 py-2.5 text-muted">
                    {titleCase(c.reason_code ?? "—")}
                  </td>
                  <td className="px-5 py-2.5">
                    <Badge tone={DECISION_TONE[c.decision ?? ""] ?? "neutral"}>
                      {decisionLabel(c.decision)}
                    </Badge>
                  </td>
                  <td className="px-5 py-2.5 text-muted">
                    {titleCase(c.status)}
                  </td>
                  <td className="num px-5 py-2.5 text-right">
                    {c.calibrated_score?.toFixed(3) ?? "—"}
                  </td>
                  <td className="px-5 py-2.5 text-right text-muted">
                    {relativeTime(c.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
