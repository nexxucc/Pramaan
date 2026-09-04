/** Typed client for the Pramaan FastAPI backend.
 *
 * Two quirks of that API are handled here rather than at every call site:
 *   - a lookup miss returns HTTP 200 with `{"error": "not found"}`, so a
 *     successful fetch is not proof the thing exists;
 *   - `POST /api/webhook/dispute` runs the whole pipeline synchronously,
 *     including an LLM call, so it can legitimately take tens of seconds.
 */

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

export const REASON_CODES = [
  "item_not_received",
  "not_as_described",
  "duplicate_charge",
  "unauthorized_transaction",
  "defective_product",
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];
export type Decision = "auto_resolve" | "escalate" | "request_evidence" | null;

export type CaseSummary = {
  case_id: string;
  reason_code: ReasonCode | null;
  status: string;
  decision: Decision;
  calibrated_score: number | null;
  created_at: string | null;
};

export type PipelineState = {
  case_id?: string;
  raw_payload?: Record<string, unknown>;
  evidence_bundle?: Record<string, unknown>;
  precheck_passed?: boolean;
  precheck_missing?: string[];
  vlm_validity_score?: number;
  vlm_draft_response?: string;
  vlm_citations?: string[];
  vlm_error?: string;
  postcheck_passed?: boolean;
  postcheck_violations?: string[];
  calibrated_score?: number;
  decision?: Decision;
  human_decision?: string | null;
  human_note?: string | null;
  __interrupt__?: unknown[];
  error?: string;
};

export type Explanation = {
  predicted_score: number;
  base_value: number;
  contributions: Record<string, number>;
  error?: string;
};

export type AuditEntry = {
  id: string;
  stage: string;
  created_at: string | null;
  output_keys: string[];
};

export type PointMetrics = {
  threshold: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
  specificity: number;
  fpr: number;
  accuracy: number;
};

export type SweepRow = PointMetrics & {
  n_auto: number;
  n_escalate: number;
  n_request_evidence: number;
  automation_rate: number;
  fp_amount: number;
  tp_amount: number;
  fn_amount: number;
};

export type Metrics = {
  generated_at: string;
  method: {
    primary: string;
    note: string;
    model: string;
    random_state: number;
  };
  dataset: {
    n: number;
    positives: number;
    negatives: number;
    positive_rate: number;
    features: string[];
    mean_amount: number;
    total_amount: number;
    label_meaning: string;
  };
  thresholds: { auto_resolve: number; escalate: number; source: string };
  cv: {
    roc_auc: number;
    pr_auc: number;
    brier: number;
    at_operating_point: PointMetrics;
    roc_curve: { fpr: number; tpr: number }[];
    pr_curve: { recall: number; precision: number }[];
    calibration: {
      bin_start: number;
      bin_end: number;
      predicted: number;
      observed: number;
      count: number;
    }[];
    score_distribution: {
      bin_start: number;
      bin_end: number;
      mid: number;
      valid: number;
      invalid: number;
    }[];
    threshold_sweep: SweepRow[];
    per_reason: (PointMetrics & {
      reason_code: ReasonCode;
      n: number;
      positive_rate: number;
      roc_auc: number | null;
    })[];
    baseline_precision: number;
  };
  holdout: {
    n: number;
    split: string;
    roc_auc: number;
    pr_auc: number;
    brier: number;
    at_operating_point: PointMetrics;
  };
  feature_importance: { feature: string; importance: number; std: number }[];
  limitations: string[];
};

export type DisputePayload = {
  dispute_id: string;
  reason_code: ReasonCode;
  transaction?: Record<string, unknown>;
  delivery?: Record<string, unknown>;
  communication?: string[];
};

export type WebhookResponse = {
  case_id: string;
  decision: Decision;
  state: PipelineState;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => request<{ status: string }>("/health"),
  listCases: () => request<CaseSummary[]>("/api/cases"),
  getCase: (id: string) => request<PipelineState>(`/api/cases/${id}`),
  getAudit: (id: string) => request<AuditEntry[]>(`/api/cases/${id}/audit`),
  explain: (id: string) => request<Explanation>(`/api/cases/${id}/explain`),
  metrics: () => request<Metrics>("/api/metrics"),
  resume: (id: string, action: "approve" | "reject", note: string) =>
    request<{ case_id: string; state: PipelineState }>(
      `/api/cases/${id}/resume`,
      { method: "POST", body: JSON.stringify({ action, note }) },
    ),
  submitDispute: (payload: DisputePayload) =>
    request<WebhookResponse>("/api/webhook/dispute", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
