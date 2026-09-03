"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api, type Metrics, type SweepRow } from "@/lib/api";
import { money, moneyCompact, num, pct, titleCase } from "@/lib/format";
import { AXIS, ChartBox, GRID, MiniBar, TooltipShell } from "@/components/charts";
import {
  Card,
  CardHeader,
  ErrorNote,
  PageHeader,
  Skeleton,
  Stat,
} from "@/components/ui";

/** Unit costs are operator inputs, not constants baked into the model.
 *  Defaults are order-of-magnitude figures for Indian card/UPI chargebacks;
 *  they are meant to be argued with, which is why they are editable. */
const DEFAULT_COSTS = {
  chargebackFee: 750, // network + gateway fee eaten per wrongly auto-resolved dispute
  analystReview: 250, // fully-loaded cost of one human review
  evidenceRequest: 80, // ops cost of going back to the merchant for evidence
};

export default function MetricsPage() {
  const [m, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [costs, setCosts] = useState(DEFAULT_COSTS);

  useEffect(() => {
    api
      .metrics()
      .then((data) => {
        setMetrics(data);
        setThreshold(data.thresholds.auto_resolve);
      })
      .catch((e) => setError(String(e)));
  }, []);

  // Memoized so the derived useMemos below do not see a fresh [] identity on
  // every render while the metrics artifact is still loading.
  const sweep = useMemo(() => m?.cv.threshold_sweep ?? [], [m]);

  /** Total expected cost of running at one threshold, under the operator's
   *  unit costs. Money wrongly refunded is counted at its full rupee value;
   *  everything the model declines to auto-resolve costs human time instead. */
  const costOf = useMemo(
    () => (r: SweepRow) => ({
      wrongRefunds: r.fp_amount,
      fees: r.fp * costs.chargebackFee,
      review: r.n_escalate * costs.analystReview,
      evidence: r.n_request_evidence * costs.evidenceRequest,
      get total() {
        return this.wrongRefunds + this.fees + this.review + this.evidence;
      },
    }),
    [costs],
  );

  const costCurve = useMemo(
    () =>
      sweep.map((r) => {
        const c = costOf(r);
        return {
          threshold: r.threshold,
          wrongRefunds: c.wrongRefunds,
          fees: c.fees,
          review: c.review,
          evidence: c.evidence,
          total: c.total,
        };
      }),
    [sweep, costOf],
  );

  const optimal = useMemo(() => {
    if (costCurve.length === 0) return null;
    return costCurve.reduce((best, r) => (r.total < best.total ? r : best));
  }, [costCurve]);

  const current = useMemo(() => {
    if (!sweep.length || threshold == null) return null;
    return sweep.reduce((best, r) =>
      Math.abs(r.threshold - threshold) < Math.abs(best.threshold - threshold)
        ? r
        : best,
    );
  }, [sweep, threshold]);

  const deployed = useMemo(() => {
    if (!m || !sweep.length) return null;
    const t = m.thresholds.auto_resolve;
    return sweep.reduce((best, r) =>
      Math.abs(r.threshold - t) < Math.abs(best.threshold - t) ? r : best,
    );
  }, [m, sweep]);

  const prVsThreshold = useMemo(
    () =>
      sweep.map((r) => ({
        threshold: r.threshold,
        precision: r.precision,
        recall: r.recall,
        f1: r.f1,
        automation: r.automation_rate,
      })),
    [sweep],
  );

  if (error) {
    return (
      <>
        <PageHeader title="Model performance" />
        <ErrorNote error={error} />
      </>
    );
  }

  // A successful response with an empty sweep leaves `current` and `deployed`
  // null forever, which the loading guard below would render as skeletons that
  // never resolve. Say so instead: the report arrived, it just has no
  // operating points to draw.
  if (m && !sweep.length) {
    return (
      <>
        <PageHeader title="Model performance" />
        <ErrorNote error="The evaluation report contains no threshold sweep, so there are no operating points to show. Retrain the calibrator (python -m app.calibrator.train from backend/) and refresh the metrics artifact." />
      </>
    );
  }

  if (!m || !current || !deployed || threshold == null) {
    return (
      <>
        <PageHeader title="Model performance" />
        <div className="grid gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="px-5 py-6">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-6 w-16" />
            </Card>
          ))}
        </div>
      </>
    );
  }

  const op = m.cv.at_operating_point;
  const cost = costOf(current);
  const deployedCost = costOf(deployed).total;

  return (
    <div className="rise">
      <PageHeader
        title="Model performance"
        subtitle={`${m.method.note} ${m.method.primary}, ${m.dataset.n} cases, ${pct(m.dataset.positive_rate)} of them valid disputes.`}
      />

      <Card className="mb-3 px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-[12px]">
          <span className="text-[11px] font-medium tracking-wide text-muted uppercase">
            How this was measured
          </span>
          <span className="text-muted">
            Model:{" "}
            <span className="num text-ink">{m.method.model}</span>
          </span>
          <span className="text-muted">
            Positive class:{" "}
            <span className="text-ink">valid dispute (merchant at fault)</span>
          </span>
          <span className="text-muted">
            Thresholds: <span className="text-ink">{m.thresholds.source}</span>
          </span>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="ROC-AUC"
          value={m.cv.roc_auc.toFixed(3)}
          sub={`Single 80/20 holdout agrees at ${m.holdout.roc_auc.toFixed(3)} (n=${m.holdout.n})`}
        />
        <Stat
          label="PR-AUC"
          value={m.cv.pr_auc.toFixed(3)}
          tone="info"
          sub={`Against a ${pct(m.cv.baseline_precision)} base rate — that is the number to beat, not 0.5`}
        />
        <Stat
          label="Precision at the deployed bar"
          tone="ok"
          value={op.precision.toFixed(3)}
          sub={`${op.fp} false positives out of ${op.tp + op.fp} auto-resolved`}
        />
        <Stat
          label="Recall at the deployed bar"
          tone="warn"
          value={op.recall.toFixed(3)}
          sub={`${op.fn} valid disputes sent to a human instead of auto-resolved`}
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="ROC curve"
            hint="True-positive rate against false-positive rate across every threshold. The dot is where the deployed threshold sits."
          />
          <ChartBox height={260}>
            <LineChart
              data={m.cv.roc_curve}
              margin={{ left: 4, right: 16, top: 8 }}
            >
              <CartesianGrid {...GRID} />
              <XAxis
                type="number"
                dataKey="fpr"
                domain={[0, 1]}
                tickFormatter={(v) => v.toFixed(1)}
                {...AXIS}
              />
              <YAxis
                type="number"
                domain={[0, 1]}
                tickFormatter={(v) => v.toFixed(1)}
                {...AXIS}
              />
              <ReferenceLine
                segment={[
                  { x: 0, y: 0 },
                  { x: 1, y: 1 },
                ]}
                stroke="var(--border-strong)"
                strokeDasharray="3 3"
              />
              <Line
                type="monotone"
                dataKey="tpr"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <ReferenceDot
                x={op.fpr}
                y={op.recall}
                r={4}
                fill="var(--ok)"
                stroke="var(--surface)"
                strokeWidth={2}
              />
              <Tooltip
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <TooltipShell
                      rows={[
                        [
                          "False-positive rate",
                          (payload[0].payload.fpr as number).toFixed(3),
                        ],
                        [
                          "True-positive rate",
                          (payload[0].payload.tpr as number).toFixed(3),
                        ],
                      ]}
                    />
                  ) : null
                }
              />
            </LineChart>
          </ChartBox>
        </Card>

        <Card>
          <CardHeader
            title="Precision–recall curve"
            hint={`The dashed rule is the ${pct(m.cv.baseline_precision)} base rate a coin-flip classifier would reach. Distance above it is the real signal.`}
          />
          <ChartBox height={260}>
            <LineChart
              data={m.cv.pr_curve}
              margin={{ left: 4, right: 16, top: 8 }}
            >
              <CartesianGrid {...GRID} />
              <XAxis
                type="number"
                dataKey="recall"
                domain={[0, 1]}
                tickFormatter={(v) => v.toFixed(1)}
                {...AXIS}
              />
              <YAxis
                type="number"
                domain={[0, 1]}
                tickFormatter={(v) => v.toFixed(1)}
                {...AXIS}
              />
              <ReferenceLine
                y={m.cv.baseline_precision}
                stroke="var(--border-strong)"
                strokeDasharray="3 3"
              />
              <Line
                type="monotone"
                dataKey="precision"
                stroke="var(--info)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <ReferenceDot
                x={op.recall}
                y={op.precision}
                r={4}
                fill="var(--ok)"
                stroke="var(--surface)"
                strokeWidth={2}
              />
              <Tooltip
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <TooltipShell
                      rows={[
                        [
                          "Recall",
                          (payload[0].payload.recall as number).toFixed(3),
                        ],
                        [
                          "Precision",
                          (payload[0].payload.precision as number).toFixed(3),
                        ],
                      ]}
                    />
                  ) : null
                }
              />
            </LineChart>
          </ChartBox>
        </Card>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader
            title="Score separation"
            hint="Out-of-fold calibrated score for valid disputes against invalid ones. Overlap in the middle band is exactly what the human-review branch exists to absorb."
          />
          <ChartBox height={270}>
            <BarChart
              data={m.cv.score_distribution}
              margin={{ left: 4, right: 16, top: 20 }}
              barGap={0}
            >
              <CartesianGrid {...GRID} />
              <XAxis
                dataKey="mid"
                type="number"
                domain={[0, "dataMax"]}
                tickFormatter={(v) => Number(v).toFixed(2)}
                {...AXIS}
              />
              <YAxis allowDecimals={false} {...AXIS} />
              <ReferenceLine
                x={m.thresholds.escalate}
                stroke="var(--info)"
                strokeDasharray="4 4"
              />
              <ReferenceLine
                x={m.thresholds.auto_resolve}
                stroke="var(--ok)"
                strokeDasharray="4 4"
                label={{
                  value: "auto-resolve",
                  position: "top",
                  fill: "var(--ok)",
                  fontSize: 10,
                }}
              />
              <Bar
                dataKey="invalid"
                name="Invalid dispute"
                fill="var(--border-strong)"
                maxBarSize={26}
              />
              <Bar
                dataKey="valid"
                name="Valid dispute"
                fill="var(--accent)"
                maxBarSize={26}
              />
              <Tooltip
                cursor={{ fill: "var(--surface-2)" }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <TooltipShell
                      title={`score ≈ ${Number(payload[0].payload.mid).toFixed(2)}`}
                      rows={payload.map((p) => [
                        p.name as string,
                        p.value as number,
                        p.color,
                      ])}
                    />
                  ) : null
                }
              />
            </BarChart>
          </ChartBox>
        </Card>

        <Card>
          <CardHeader
            title="Calibration"
            hint="A score of 0.6 should mean 60% of those cases are genuinely valid. Points on the diagonal mean the probability can be trusted as a probability."
          />
          <ChartBox height={270}>
            <LineChart
              data={m.cv.calibration}
              margin={{ left: 4, right: 16, top: 8 }}
            >
              <CartesianGrid {...GRID} />
              <XAxis
                type="number"
                dataKey="predicted"
                domain={[0, 1]}
                tickFormatter={(v) => v.toFixed(1)}
                {...AXIS}
              />
              <YAxis
                type="number"
                domain={[0, 1]}
                tickFormatter={(v) => v.toFixed(1)}
                {...AXIS}
              />
              <ReferenceLine
                segment={[
                  { x: 0, y: 0 },
                  { x: 1, y: 1 },
                ]}
                stroke="var(--border-strong)"
                strokeDasharray="3 3"
              />
              <Line
                type="monotone"
                dataKey="observed"
                stroke="var(--warn)"
                strokeWidth={2}
                dot={{ r: 3, fill: "var(--warn)" }}
                isAnimationActive={false}
              />
              <Tooltip
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <TooltipShell
                      rows={[
                        [
                          "Predicted",
                          (payload[0].payload.predicted as number).toFixed(3),
                        ],
                        [
                          "Observed",
                          (payload[0].payload.observed as number).toFixed(3),
                        ],
                        ["Cases in bin", payload[0].payload.count as number],
                      ]}
                    />
                  ) : null
                }
              />
            </LineChart>
          </ChartBox>
          <p className="border-t border-line px-5 py-3 text-[11.5px] text-muted">
            Brier score{" "}
            <span className="num text-ink">{m.cv.brier.toFixed(3)}</span> — lower
            is better; 0.25 is what predicting the base rate for everything would
            give you.
          </p>
        </Card>
      </div>

      {/* ── False-positive cost explorer ─────────────────────────────── */}
      <Card className="mt-3">
        <CardHeader
          title="What a false positive actually costs"
          hint="Precision alone hides the asymmetry: auto-resolving a dispute that was not valid refunds real money, while being too cautious only burns analyst time. Move the threshold and change the unit costs to see which side of that trade the model should sit on."
        />

        <div className="grid gap-0 lg:grid-cols-[320px_1fr]">
          <div className="space-y-5 border-b border-line px-5 py-5 lg:border-r lg:border-b-0">
            <div>
              <div className="flex items-baseline justify-between">
                <label
                  htmlFor="threshold"
                  className="text-[11px] font-medium tracking-wide text-muted uppercase"
                >
                  Auto-resolve threshold
                </label>
                <span className="num text-[15px] font-semibold">
                  {threshold.toFixed(2)}
                </span>
              </div>
              <input
                id="threshold"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="mt-2 w-full accent-[var(--accent)]"
              />
              <div className="mt-1 flex justify-between text-[11px] text-faint">
                <span>refund everything</span>
                <span>refund nothing</span>
              </div>
              <button
                onClick={() => setThreshold(m.thresholds.auto_resolve)}
                className="mt-2 text-[11.5px] font-medium text-accent hover:underline"
              >
                Reset to deployed ({m.thresholds.auto_resolve.toFixed(3)})
              </button>
            </div>

            <div className="space-y-3">
              <div className="text-[11px] font-medium tracking-wide text-muted uppercase">
                Unit costs
              </div>
              {(
                [
                  ["chargebackFee", "Fee per wrong auto-resolve"],
                  ["analystReview", "Cost of one human review"],
                  ["evidenceRequest", "Cost of an evidence request"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-3">
                  <span className="flex-1 text-[12px] text-muted">{label}</span>
                  <span className="text-[12px] text-faint">₹</span>
                  <input
                    type="number"
                    min={0}
                    value={costs[key]}
                    onChange={(e) =>
                      setCosts((c) => ({
                        ...c,
                        [key]: Math.max(0, Number(e.target.value)),
                      }))
                    }
                    className="num w-20 rounded-md border border-line bg-surface-2 px-2 py-1 text-right text-[12px] outline-none focus:border-accent"
                  />
                </label>
              ))}
              <p className="text-[11px] leading-relaxed text-faint">
                A wrongly auto-resolved dispute also refunds the full transaction
                amount, taken from the case data rather than assumed.
              </p>
            </div>
          </div>

          <div className="px-5 py-5">
            <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
              <ConfusionMatrix row={current} />

              <div className="grid grid-cols-2 gap-x-6 gap-y-3 self-start">
                {[
                  ["Precision", current.precision.toFixed(3)],
                  ["Recall", current.recall.toFixed(3)],
                  ["Automation rate", pct(current.automation_rate, 0)],
                  ["Cases auto-resolved", `${current.n_auto}`],
                  ["Sent to a human", `${current.n_escalate}`],
                  ["Evidence requested", `${current.n_request_evidence}`],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[11px] text-muted">{k}</div>
                    <div className="num text-[15px] font-semibold">{v}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-line bg-surface-2 px-4 py-3.5">
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                <div>
                  <div className="text-[11px] text-muted">
                    Total cost at this threshold
                  </div>
                  <div className="num text-[22px] font-semibold">
                    {money(cost.total)}
                  </div>
                </div>
                <div className="text-[12px] text-muted">
                  <span className="num text-bad">{money(cost.wrongRefunds)}</span>{" "}
                  wrongly refunded ·{" "}
                  <span className="num">{money(cost.fees)}</span> in fees ·{" "}
                  <span className="num">{money(cost.review)}</span> analyst time ·{" "}
                  <span className="num">{money(cost.evidence)}</span> evidence
                  chasing
                </div>
              </div>
              {optimal && (
                <p className="mt-2.5 border-t border-line pt-2.5 text-[12px] text-muted">
                  Cheapest threshold on this data is{" "}
                  <span className="num text-ink">
                    {optimal.threshold.toFixed(2)}
                  </span>{" "}
                  at <span className="num text-ink">{money(optimal.total)}</span>.
                  The deployed threshold{" "}
                  <span className="num text-ink">
                    {m.thresholds.auto_resolve.toFixed(3)}
                  </span>{" "}
                  costs <span className="num text-ink">{money(deployedCost)}</span>{" "}
                  — a gap of{" "}
                  <span className="num text-ink">
                    {money(deployedCost - optimal.total)}
                  </span>{" "}
                  across {m.dataset.n} cases, the price of a threshold picked
                  from the score distribution rather than from the cost curve.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-line">
          <ChartBox height={280}>
            <AreaChart data={costCurve} margin={{ left: 12, right: 16, top: 8 }}>
              <CartesianGrid {...GRID} />
              <XAxis
                dataKey="threshold"
                type="number"
                domain={[0, 1]}
                tickFormatter={(v) => Number(v).toFixed(1)}
                {...AXIS}
              />
              <YAxis tickFormatter={(v) => moneyCompact(Number(v))} {...AXIS} />
              <Area
                type="monotone"
                dataKey="wrongRefunds"
                stackId="c"
                stroke="var(--bad)"
                fill="var(--bad)"
                fillOpacity={0.5}
                name="Wrongly refunded"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="fees"
                stackId="c"
                stroke="var(--warn)"
                fill="var(--warn)"
                fillOpacity={0.45}
                name="Chargeback fees"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="review"
                stackId="c"
                stroke="var(--info)"
                fill="var(--info)"
                fillOpacity={0.4}
                name="Analyst review"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="evidence"
                stackId="c"
                stroke="var(--ok)"
                fill="var(--ok)"
                fillOpacity={0.35}
                name="Evidence requests"
                isAnimationActive={false}
              />
              <ReferenceLine
                x={threshold}
                stroke="var(--text)"
                strokeWidth={1.5}
                label={{
                  value: "you are here",
                  position: "insideTopLeft",
                  fontSize: 10,
                  fill: "var(--text-muted)",
                }}
              />
              {optimal && (
                <ReferenceLine
                  x={optimal.threshold}
                  stroke="var(--accent)"
                  strokeDasharray="4 4"
                  label={{
                    value: "cheapest",
                    position: "insideBottomRight",
                    fontSize: 10,
                    fill: "var(--accent)",
                  }}
                />
              )}
              <Tooltip
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <TooltipShell
                      title={`threshold ${Number(label).toFixed(2)}`}
                      rows={[
                        ...payload.map(
                          (p) =>
                            [
                              p.name as string,
                              money(p.value as number),
                              p.color,
                            ] as [string, string, string],
                        ),
                        [
                          "Total",
                          money(payload[0].payload.total as number),
                        ] as [string, string],
                      ]}
                    />
                  ) : null
                }
              />
            </AreaChart>
          </ChartBox>
          <p className="px-5 pb-4 text-[11.5px] text-muted">
            Cost composition across every candidate threshold. Push the bar down
            and the red band grows as invalid disputes get auto-refunded; push it
            up and the blue band grows as more work lands on humans. The whole
            argument for this pipeline is the shape of the valley between them.
          </p>
        </div>
      </Card>

      <Card className="mt-3">
        <CardHeader
          title="Precision, recall and automation against threshold"
          hint="The same sweep without the money: what you gain and give up at each bar."
        />
        <ChartBox height={260}>
          <LineChart data={prVsThreshold} margin={{ left: 4, right: 16, top: 8 }}>
            <CartesianGrid {...GRID} />
            <XAxis
              dataKey="threshold"
              type="number"
              domain={[0, 1]}
              tickFormatter={(v) => Number(v).toFixed(1)}
              {...AXIS}
            />
            <YAxis
              domain={[0, 1]}
              tickFormatter={(v) => Number(v).toFixed(1)}
              {...AXIS}
            />
            <ReferenceLine
              x={m.thresholds.auto_resolve}
              stroke="var(--border-strong)"
              strokeDasharray="4 4"
            />
            {(
              [
                ["precision", "var(--ok)", "Precision"],
                ["recall", "var(--warn)", "Recall"],
                ["f1", "var(--accent)", "F1"],
                ["automation", "var(--info)", "Automation rate"],
              ] as const
            ).map(([key, color, name]) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={name}
                stroke={color}
                strokeWidth={key === "f1" ? 2 : 1.5}
                strokeDasharray={key === "automation" ? "4 3" : undefined}
                dot={false}
                isAnimationActive={false}
              />
            ))}
            <Tooltip
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipShell
                    title={`threshold ${Number(label).toFixed(2)}`}
                    rows={payload.map((p) => [
                      p.name as string,
                      (p.value as number).toFixed(3),
                      p.color,
                    ])}
                  />
                ) : null
              }
            />
          </LineChart>
        </ChartBox>
      </Card>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader
            title="By reason code"
            hint="Measured at the deployed threshold. Slices with no positive labels get a blank AUC rather than a made-up 0.5."
          />
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-[11px] tracking-wide text-muted uppercase">
                <th className="px-5 py-2 text-left font-medium">Reason</th>
                <th className="px-5 py-2 text-right font-medium">n</th>
                <th className="px-5 py-2 text-right font-medium">Valid</th>
                <th className="px-5 py-2 text-right font-medium">AUC</th>
                <th className="px-5 py-2 text-right font-medium">Precision</th>
                <th className="w-28 px-5 py-2 text-right font-medium">Recall</th>
              </tr>
            </thead>
            <tbody>
              {m.cv.per_reason.map((r) => (
                <tr key={r.reason_code} className="border-t border-line">
                  <td className="px-5 py-2.5">{titleCase(r.reason_code)}</td>
                  <td className="num px-5 py-2.5 text-right text-muted">{r.n}</td>
                  <td className="num px-5 py-2.5 text-right text-muted">
                    {pct(r.positive_rate, 0)}
                  </td>
                  <td className="num px-5 py-2.5 text-right">
                    {r.roc_auc == null ? (
                      <span
                        className="text-faint"
                        title="Only one class present in this slice — AUC is undefined."
                      >
                        n/a
                      </span>
                    ) : (
                      r.roc_auc.toFixed(3)
                    )}
                  </td>
                  <td className="num px-5 py-2.5 text-right">
                    {r.tp + r.fp === 0 ? (
                      <span className="text-faint">—</span>
                    ) : (
                      num(r.precision)
                    )}
                  </td>
                  <td className="px-5 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <MiniBar value={r.recall} />
                      <span className="num w-9 text-right text-[11.5px]">
                        {r.recall.toFixed(2)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <CardHeader
            title="Feature importance"
            hint="Drop in ROC-AUC when that feature is shuffled. Measured on the fitted model, averaged over 10 shuffles."
          />
          <ChartBox height={280}>
            <BarChart
              data={m.feature_importance}
              layout="vertical"
              margin={{ left: 8, right: 24 }}
            >
              <CartesianGrid {...GRID} horizontal={false} vertical />
              <XAxis type="number" {...AXIS} />
              <YAxis
                type="category"
                dataKey="feature"
                width={152}
                tickFormatter={(v: string) => v.replace(/^reason_/, "")}
                {...AXIS}
              />
              <Bar dataKey="importance" radius={[0, 3, 3, 0]} maxBarSize={16}>
                {m.feature_importance.map((f) => (
                  <Cell
                    key={f.feature}
                    fill={
                      f.importance > 0.01 ? "var(--accent)" : "var(--border-strong)"
                    }
                  />
                ))}
              </Bar>
              <Tooltip
                cursor={{ fill: "var(--surface-2)" }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <TooltipShell
                      title={payload[0].payload.feature as string}
                      rows={[
                        [
                          "AUC drop",
                          (payload[0].value as number).toFixed(4),
                        ],
                        [
                          "Std dev",
                          (payload[0].payload.std as number).toFixed(4),
                        ],
                      ]}
                    />
                  ) : null
                }
              />
            </BarChart>
          </ChartBox>
        </Card>
      </div>

      <Card className="mt-3">
        <CardHeader
          title="What these numbers do not cover"
          hint="Stated up front rather than left for a judge to find."
        />
        <ul className="space-y-2.5 px-5 py-4">
          {m.limitations.map((l) => (
            <li key={l} className="flex gap-3 text-[12.5px] leading-relaxed">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warn" />
              <span className="text-muted">{l}</span>
            </li>
          ))}
        </ul>
        <p className="border-t border-line px-5 py-3 text-[11.5px] text-faint">
          Generated {new Date(m.generated_at).toLocaleString()} · random_state{" "}
          {m.method.random_state} · regenerate with{" "}
          <code className="num">python -m app.calibrator.evaluate</code>
        </p>
      </Card>
    </div>
  );
}

function ConfusionMatrix({ row }: { row: SweepRow }) {
  const cells: [string, number, string, string][] = [
    ["True positive", row.tp, "var(--ok)", "Valid dispute, auto-resolved"],
    ["False positive", row.fp, "var(--bad)", "Invalid dispute, auto-resolved anyway"],
    ["False negative", row.fn, "var(--warn)", "Valid dispute, held back for a human"],
    ["True negative", row.tn, "var(--info)", "Invalid dispute, correctly held back"],
  ];
  const max = Math.max(...cells.map((c) => c[1]), 1);

  return (
    <div>
      <div className="mb-2 text-[11px] font-medium tracking-wide text-muted uppercase">
        At this threshold
      </div>
      <div className="grid w-[220px] grid-cols-2 gap-1.5">
        {cells.map(([label, value, color, title]) => (
          <div
            key={label}
            title={title}
            className="rounded-lg border border-line px-3 py-2.5"
            style={{
              background: `color-mix(in srgb, ${color} ${8 + (value / max) * 22}%, var(--surface))`,
            }}
          >
            <div className="num text-[19px] leading-none font-semibold">
              {value}
            </div>
            <div className="mt-1 text-[10.5px] leading-tight" style={{ color }}>
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
