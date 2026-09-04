import type { Decision } from "./api";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrCompact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
});

export const money = (n: number) => inr.format(n);
export const moneyCompact = (n: number) => inrCompact.format(n);
export const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;
export const num = (n: number | null | undefined, digits = 3) =>
  n == null ? "—" : n.toFixed(digits);

export const titleCase = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const shortId = (id: string) => id.slice(0, 8);

/** The backend stores `datetime.utcnow()`, so most timestamps arrive naive and
 *  need a `Z` to be read as UTC rather than as browser-local time. A few --
 *  `metrics.generated_at` among them -- already carry an offset; appending `Z`
 *  to those produces an unparseable string, so the suffix is added only when
 *  no offset is present. */
export function toUtcIso(iso: string): string {
  return /(?:Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`;
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(toUtcIso(iso)).getTime();
  const diff = Date.now() - then;
  if (Number.isNaN(diff)) return "—";
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/** The four outcomes are the only things in this UI that carry a colour. */
export const DECISION_TONE: Record<string, "ok" | "warn" | "info" | "bad"> = {
  auto_resolve: "ok",
  escalate: "warn",
  request_evidence: "info",
  approved: "ok",
  rejected: "bad",
  pending: "info",
};

export const DECISION_COLOR: Record<string, string> = {
  auto_resolve: "var(--ok)",
  escalate: "var(--warn)",
  request_evidence: "var(--info)",
  approved: "var(--ok)",
  rejected: "var(--bad)",
  pending: "var(--text-faint)",
};

export const decisionLabel = (d: Decision | string | null | undefined) =>
  d ? titleCase(d) : "—";
