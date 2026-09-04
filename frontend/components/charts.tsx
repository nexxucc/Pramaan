"use client";

import type { ReactNode } from "react";
import { ResponsiveContainer } from "recharts";

/** Shared chart chrome. Recharts is styled here once so no chart in the app
 *  hand-rolls its own axis colours, gridlines or tooltip box. */

export const AXIS = {
  stroke: "var(--border)",
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 11, fill: "var(--text-faint)" },
} as const;

export const GRID = {
  stroke: "var(--grid)",
  strokeDasharray: "0",
  vertical: false,
} as const;

export function ChartBox({
  height = 240,
  children,
}: {
  height?: number;
  children: React.ReactElement;
}) {
  return (
    <div style={{ height }} className="px-2 pt-4 pb-1">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export function TooltipShell({
  title,
  rows,
}: {
  title?: ReactNode;
  rows: [string, ReactNode, string?][];
}) {
  return (
    <div
      className="rounded-lg border border-line bg-surface px-3 py-2 text-[11.5px]"
      style={{ boxShadow: "0 4px 16px rgba(0,0,0,.10)" }}
    >
      {title && (
        <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
          {title}
        </div>
      )}
      <div className="space-y-1">
        {rows.map(([label, value, color]) => (
          <div key={label} className="flex items-center gap-3">
            {color && (
              <span
                className="size-1.5 rounded-full"
                style={{ background: color }}
              />
            )}
            <span className="text-muted">{label}</span>
            <span className="num ml-auto font-medium">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Small inline bar used inside tables, where a full chart would be noise. */
export function MiniBar({
  value,
  max = 1,
  color = "var(--accent)",
}: {
  value: number;
  max?: number;
  color?: string;
}) {
  const w = Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${w}%`, background: color }}
      />
    </div>
  );
}

/** Diverging bar: signed value pushed left or right of a centre rule.
 *  Used for SHAP contributions, where the sign is the whole point. */
export function DivergingBar({
  value,
  maxAbs,
}: {
  value: number;
  maxAbs: number;
}) {
  const frac = maxAbs === 0 ? 0 : Math.min(1, Math.abs(value) / maxAbs);
  const width = frac * 50;
  const positive = value >= 0;
  return (
    <div className="relative h-4 w-full rounded bg-surface-2">
      <div
        className="absolute top-0 bottom-0 rounded transition-all duration-500"
        style={{
          left: positive ? "50%" : `${50 - width}%`,
          width: `${width}%`,
          background: positive ? "var(--ok)" : "var(--bad)",
        }}
      />
      <div
        className="absolute top-0 bottom-0 w-px"
        style={{ left: "50%", background: "var(--border-strong)" }}
      />
    </div>
  );
}
