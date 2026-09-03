import Link from "next/link";
import type { ReactNode } from "react";

type Tone = "ok" | "warn" | "info" | "bad" | "neutral";

const TONE_CLASS: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  info: "bg-info-soft text-info",
  bad: "bg-bad-soft text-bad",
  neutral: "bg-surface-2 text-muted",
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium tracking-wide whitespace-nowrap ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral" }: { tone?: Tone }) {
  const color =
    tone === "neutral" ? "var(--text-faint)" : `var(--${tone})`;
  return (
    <span
      aria-hidden
      className="inline-block size-1.5 rounded-full"
      style={{ background: color }}
    />
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-surface ${className}`}
      style={{ boxShadow: "var(--shadow)" }}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  hint,
  right,
}: {
  title: string;
  hint?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
        {hint && (
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
            {hint}
          </p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
}) {
  return (
    <Card className="px-5 py-4">
      <div className="flex items-center gap-1.5">
        <Dot tone={tone} />
        <span className="text-[11px] font-medium tracking-wide text-muted uppercase">
          {label}
        </span>
      </div>
      <div className="num mt-2 text-[26px] leading-none font-semibold tracking-tight">
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[11.5px] text-muted">{sub}</div>}
    </Card>
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">
            {subtitle}
          </p>
        )}
      </div>
      {right}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="px-5 py-12 text-center text-[13px] text-muted">
      {children}
    </div>
  );
}

export function ErrorNote({ error }: { error: string }) {
  return (
    <Card className="border-bad/40 bg-bad-soft px-5 py-4">
      <p className="text-[13px] font-medium text-bad">Could not reach the API</p>
      <p className="mt-1 text-[12px] text-muted">{error}</p>
      <p className="mt-2 text-[12px] text-muted">
        Start the backend with{" "}
        <code className="num rounded bg-surface px-1.5 py-0.5 text-[11px]">
          uvicorn app.main:app --reload --port 8000
        </code>{" "}
        from <code className="num text-[11px]">backend/</code>.
      </p>
    </Card>
  );
}

export function Skeleton({ className = "h-4 w-24" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-surface-2 ${className}`} />;
}

export function LinkButton({
  href,
  children,
  variant = "ghost",
}: {
  href: string;
  children: ReactNode;
  variant?: "ghost" | "solid";
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors";
  const style =
    variant === "solid"
      ? "bg-accent text-white hover:opacity-90"
      : "border border-line bg-surface text-ink hover:bg-surface-2";
  return (
    <Link href={href} className={`${base} ${style}`}>
      {children}
    </Link>
  );
}

/** Two-column definition list used for evidence / raw values. */
export function KeyValue({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-line">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-4 px-5 py-2.5">
          <dt className="w-44 shrink-0 text-[12px] text-muted">{k}</dt>
          <dd className="num min-w-0 flex-1 text-[12.5px] break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
