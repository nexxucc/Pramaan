"use client";

import { useState } from "react";
import Link from "next/link";

import { api, REASON_CODES, type ReasonCode, type WebhookResponse } from "@/lib/api";
import { DECISION_TONE, decisionLabel, titleCase } from "@/lib/format";
import {
  Badge,
  Card,
  CardHeader,
  ErrorNote,
  PageHeader,
} from "@/components/ui";

type Form = {
  dispute_id: string;
  reason_code: ReasonCode;
  amount: number;
  merchant_category: string;
  sender_bank: string;
  receiver_bank: string;
  fraud_flag: 0 | 1;
  delivery_partner: string;
  delivery_status: string;
  delayed: "yes" | "no";
  delivery_rating: number;
  region: string;
  communication: string;
  includeDelivery: boolean;
  includeCommunication: boolean;
};

const BASE: Form = {
  dispute_id: "demo-1",
  reason_code: "item_not_received",
  amount: 1500,
  merchant_category: "Electronics",
  sender_bank: "HDFC",
  receiver_bank: "ICICI",
  fraud_flag: 0,
  delivery_partner: "bluedart",
  delivery_status: "delivered",
  delayed: "no",
  delivery_rating: 4.5,
  region: "north",
  communication: "Customer says the item never arrived.",
  includeDelivery: true,
  includeCommunication: true,
};

/** Four shapes worth showing a judge: a contestable claim, a claim the
 *  merchant will probably lose, a case that never reaches the model at all,
 *  and a fraud-flagged transaction. */
const PRESETS: { name: string; note: string; form: Form }[] = [
  {
    name: "Delivered, customer says otherwise",
    note: "Strong delivery evidence against an item-not-received claim.",
    form: BASE,
  },
  {
    name: "Genuinely undelivered",
    note: "Delivery failed and the courier was late — the merchant is at fault.",
    form: {
      ...BASE,
      dispute_id: "demo-2",
      amount: 3200,
      delivery_status: "failed",
      delayed: "yes",
      delivery_rating: 1.5,
      communication:
        "Courier marked the shipment as failed twice; customer never received it.",
    },
  },
  {
    name: "Evidence missing",
    note: "No delivery record attached — the pre-check short-circuits and no model is ever called.",
    form: {
      ...BASE,
      dispute_id: "demo-3",
      includeDelivery: false,
      includeCommunication: false,
    },
  },
  {
    name: "Flagged as fraud",
    note: "Unauthorized-transaction claim on a transaction the bank already flagged.",
    form: {
      ...BASE,
      dispute_id: "demo-4",
      reason_code: "unauthorized_transaction",
      amount: 8900,
      fraud_flag: 1,
      merchant_category: "Fuel",
      communication: "Cardholder does not recognise this transaction.",
    },
  },
];

export default function SimulatePage() {
  const [form, setForm] = useState<Form>(BASE);
  const [result, setResult] = useState<WebhookResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.submitDispute({
        dispute_id: form.dispute_id,
        reason_code: form.reason_code,
        transaction: {
          transaction_id: `TXN${Math.floor(Math.random() * 1e10)}`,
          amount: form.amount,
          merchant_category: form.merchant_category,
          sender_bank: form.sender_bank,
          receiver_bank: form.receiver_bank,
          fraud_flag: form.fraud_flag,
          timestamp: new Date().toISOString().slice(0, 19).replace("T", " "),
        },
        ...(form.includeDelivery
          ? {
              delivery: {
                delivery_partner: form.delivery_partner,
                delivery_status: form.delivery_status,
                delayed: form.delayed,
                delivery_rating: form.delivery_rating,
                region: form.region,
              },
            }
          : {}),
        ...(form.includeCommunication && form.communication.trim()
          ? { communication: [form.communication.trim()] }
          : {}),
      });
      setResult(res);
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  };

  const state = result?.state;

  return (
    <div className="rise">
      <PageHeader
        title="Run a dispute"
        subtitle="Posts to the same webhook Razorpay would call. The request runs all seven stages synchronously — including one live model call — so a response can take a few seconds."
      />

      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            onClick={() => {
              setForm(p.form);
              setResult(null);
              setError(null);
            }}
            className={`rounded-xl border px-4 py-3 text-left transition-colors ${
              form.dispute_id === p.form.dispute_id
                ? "border-accent bg-accent-soft"
                : "border-line bg-surface hover:bg-surface-2"
            }`}
          >
            <div className="text-[12.5px] font-medium">{p.name}</div>
            <div className="mt-1 text-[11.5px] leading-relaxed text-muted">
              {p.note}
            </div>
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader
            title="Dispute payload"
            hint="Which evidence a reason code requires is a deterministic rule — drop a required section and the case never reaches the model."
          />
          <div className="space-y-4 px-5 py-4">
            <Field label="Reason code">
              <select
                value={form.reason_code}
                onChange={(e) => set("reason_code", e.target.value as ReasonCode)}
                className={inputClass}
              >
                {REASON_CODES.map((r) => (
                  <option key={r} value={r}>
                    {titleCase(r)}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount (₹)">
                <input
                  type="number"
                  min={0}
                  value={form.amount}
                  onChange={(e) => set("amount", Number(e.target.value))}
                  className={inputClass}
                />
              </Field>
              <Field label="Merchant category">
                <input
                  value={form.merchant_category}
                  onChange={(e) => set("merchant_category", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Sender bank">
                <input
                  value={form.sender_bank}
                  onChange={(e) => set("sender_bank", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Receiver bank">
                <input
                  value={form.receiver_bank}
                  onChange={(e) => set("receiver_bank", e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>

            <label className="flex items-center gap-2 text-[12px] text-muted">
              <input
                type="checkbox"
                checked={form.fraud_flag === 1}
                onChange={(e) => set("fraud_flag", e.target.checked ? 1 : 0)}
                className="accent-[var(--accent)]"
              />
              Transaction already flagged as fraud by the bank
            </label>

            <div className="border-t border-line pt-4">
              <label className="mb-3 flex items-center gap-2 text-[12px] font-medium">
                <input
                  type="checkbox"
                  checked={form.includeDelivery}
                  onChange={(e) => set("includeDelivery", e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                Attach delivery evidence
              </label>
              {form.includeDelivery && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Delivery status">
                    <select
                      value={form.delivery_status}
                      onChange={(e) => set("delivery_status", e.target.value)}
                      className={inputClass}
                    >
                      {["delivered", "in transit", "failed", "returned"].map(
                        (s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ),
                      )}
                    </select>
                  </Field>
                  <Field label="Partner">
                    <input
                      value={form.delivery_partner}
                      onChange={(e) => set("delivery_partner", e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Rating">
                    <input
                      type="number"
                      step={0.1}
                      min={0}
                      max={5}
                      value={form.delivery_rating}
                      onChange={(e) =>
                        set("delivery_rating", Number(e.target.value))
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Delayed">
                    <select
                      value={form.delayed}
                      onChange={(e) =>
                        set("delayed", e.target.value as "yes" | "no")
                      }
                      className={inputClass}
                    >
                      <option value="no">no</option>
                      <option value="yes">yes</option>
                    </select>
                  </Field>
                </div>
              )}
            </div>

            <div className="border-t border-line pt-4">
              <label className="mb-3 flex items-center gap-2 text-[12px] font-medium">
                <input
                  type="checkbox"
                  checked={form.includeCommunication}
                  onChange={(e) => set("includeCommunication", e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                Attach customer communication
              </label>
              {form.includeCommunication && (
                <textarea
                  value={form.communication}
                  onChange={(e) => set("communication", e.target.value)}
                  className={`${inputClass} min-h-[68px]`}
                />
              )}
            </div>

            <button
              onClick={submit}
              disabled={running}
              className="w-full rounded-lg bg-accent px-3 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {running ? "Running the pipeline…" : "Send to the webhook"}
            </button>
          </div>
        </Card>

        <div className="min-w-0 space-y-3">
          {error && <ErrorNote error={error} />}

          {running && (
            <Card className="px-5 py-6">
              <p className="text-[13px] font-medium">Pipeline running</p>
              <ul className="mt-3 space-y-2 text-[12px] text-muted">
                {[
                  "Standardizing the payload into an evidence bundle",
                  "Checking required evidence for this reason code",
                  "Asking the model for a validity score and a draft",
                  "Verifying every citation resolves in the bundle",
                  "Calibrating into a probability and routing",
                ].map((s, i) => (
                  <li key={s} className="flex items-center gap-2.5">
                    <span
                      className="size-1.5 animate-pulse rounded-full bg-accent"
                      style={{ animationDelay: `${i * 180}ms` }}
                    />
                    {s}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {result && state && (
            <>
              <Card className="px-5 py-5">
                <div className="flex items-center justify-between">
                  <Badge tone={DECISION_TONE[result.decision ?? ""] ?? "neutral"}>
                    {decisionLabel(result.decision)}
                  </Badge>
                  <Link
                    href={`/cases/${result.case_id}`}
                    className="text-[12.5px] font-medium text-accent hover:underline"
                  >
                    Open full case →
                  </Link>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3">
                  {[
                    [
                      "Pre-check",
                      state.precheck_passed === false
                        ? `failed — missing ${(state.precheck_missing ?? []).join(", ")}`
                        : "passed",
                    ],
                    [
                      "Model validity score",
                      state.vlm_validity_score?.toFixed(2) ?? "not called",
                    ],
                    [
                      "Citations verified",
                      state.postcheck_passed == null
                        ? "not run"
                        : state.postcheck_passed
                          ? `all ${state.vlm_citations?.length ?? 0} resolved`
                          : `${state.postcheck_violations?.length ?? 0} unresolvable`,
                    ],
                    [
                      "Calibrated score",
                      state.calibrated_score?.toFixed(3) ?? "not scored",
                    ],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-[11px] text-muted">{k}</dt>
                      <dd className="num mt-0.5 text-[13px]">{v}</dd>
                    </div>
                  ))}
                </dl>

                {state.__interrupt__ && (
                  <p className="mt-4 rounded-lg bg-warn-soft px-3 py-2.5 text-[12px] text-warn">
                    The graph is paused on an interrupt. It stays paused until a
                    reviewer approves or rejects it on the case page.
                  </p>
                )}

                {state.vlm_draft_response && (
                  <div className="mt-4 border-t border-line pt-4">
                    <div className="mb-1.5 text-[11px] font-medium tracking-wide text-muted uppercase">
                      Drafted response
                    </div>
                    <p className="text-[12.5px] leading-relaxed">
                      {state.vlm_draft_response}
                    </p>
                  </div>
                )}
              </Card>

              <Card className="min-w-0">
                <CardHeader title="Raw webhook response" />
                <pre className="num max-h-80 overflow-auto px-5 py-4 text-[11px] leading-relaxed">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </Card>
            </>
          )}

          {!running && !result && !error && (
            <Card className="px-5 py-10 text-center">
              <p className="text-[13px] text-muted">
                Pick a preset or edit the payload, then send it.
              </p>
              <p className="mx-auto mt-2 max-w-sm text-[11.5px] leading-relaxed text-faint">
                Nothing here is mocked: the case is written to the same database,
                checkpointer and audit log the rest of this UI reads from.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium tracking-wide text-muted uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}
