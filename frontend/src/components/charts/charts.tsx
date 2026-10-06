"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { moneyM } from "@/lib/format";

const AXIS = { fontSize: 11, fill: "var(--muted-foreground)" } as const;
const GRID = "var(--border)";
export const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

interface TipProps { active?: boolean; payload?: { name?: string; value?: number; color?: string; dataKey?: string }[]; label?: string | number; fmt: (n: number) => string; labelFmt?: (l: string) => string }
function Tip({ active, payload, label, fmt, labelFmt }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium">{labelFmt ? labelFmt(String(label)) : label}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground"><span className="size-2 rounded-sm" style={{ background: p.color }} />{p.name}</span>
          <span className="tabular font-medium">{fmt(p.value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

export interface Series { key: string; label: string; color?: string }

export function AreaTrend({ data, xKey, series, height = 220, fmt = moneyM, xFmt }: { data: Record<string, number | string>[]; xKey: string; series: Series[]; height?: number; fmt?: (n: number) => string; xFmt?: (s: string) => string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 6, left: -8, bottom: 0 }}>
        <defs>{series.map((s, i) => (
          <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color ?? SERIES_COLORS[i]} stopOpacity={0.28} /><stop offset="100%" stopColor={s.color ?? SERIES_COLORS[i]} stopOpacity={0} />
          </linearGradient>
        ))}</defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} tickFormatter={xFmt} interval="preserveStartEnd" minTickGap={24} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={fmt} width={48} />
        <Tooltip content={<Tip fmt={fmt} labelFmt={xFmt} />} cursor={{ stroke: "var(--border)" }} />
        {series.map((s, i) => <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? SERIES_COLORS[i]} strokeWidth={1.75} fill={`url(#g-${s.key})`} />)}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function Bars({ data, xKey, series, height = 220, stacked, fmt = moneyM, xFmt, layout = "horizontal", colorByIndex }: { data: Record<string, number | string>[]; xKey: string; series: Series[]; height?: number; stacked?: boolean; fmt?: (n: number) => string; xFmt?: (s: string) => string; layout?: "horizontal" | "vertical"; colorByIndex?: string[] }) {
  const v = layout === "vertical";
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={layout} margin={{ top: 6, right: 6, left: v ? 24 : -8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={v} horizontal={!v} />
        {v ? (
          <>
            <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={fmt} />
            <YAxis type="category" dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} interval={0} width={110} tickFormatter={xFmt} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} tickFormatter={xFmt} interval="preserveStartEnd" minTickGap={12} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={fmt} width={48} />
          </>
        )}
        <Tooltip content={<Tip fmt={fmt} labelFmt={xFmt} />} cursor={{ fill: "var(--accent)", opacity: 0.5 }} />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} stackId={stacked ? "a" : undefined} fill={s.color ?? SERIES_COLORS[i]} radius={stacked ? 0 : [3, 3, 0, 0]} maxBarSize={36}>
            {colorByIndex && data.map((_, k) => <Cell key={k} fill={colorByIndex[k % colorByIndex.length]} />)}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Sparkline({ values, color = "var(--chart-1)", height = 28 }: { values: number[]; color?: string; height?: number }) {
  const data = values.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs><linearGradient id="spark" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.25} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill="url(#spark)" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CashChart({ data, min, height = 280 }: { data: { label: string; closing: number }[]; min: number; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
        <defs><linearGradient id="cashg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.25} /><stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} /></linearGradient></defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={moneyM} width={52} />
        <Tooltip content={<Tip fmt={moneyM} />} />
        <ReferenceLine y={0} stroke="var(--border)" />
        <ReferenceLine y={min} stroke="var(--danger)" strokeDasharray="4 4" label={{ value: "Minimum cash", position: "insideTopRight", fill: "var(--danger)", fontSize: 11 }} />
        <Area type="monotone" dataKey="closing" name="Projected balance" stroke="var(--chart-1)" strokeWidth={2} fill="url(#cashg)" />
        <Line type="monotone" dataKey="closing" stroke="none" dot={{ r: 3, fill: "var(--chart-1)" }} activeDot={{ r: 5 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function Waterfall({ steps, height = 260 }: { steps: { label: string; value: number; total?: boolean }[]; height?: number }) {
  let run = 0;
  const data = steps.map((s) => {
    if (s.total) { run = s.value; return { label: s.label, base: 0, up: 0, down: 0, total: s.value }; }
    const start = run; run += s.value;
    return { label: s.label, base: Math.min(start, run), up: s.value > 0 ? s.value : 0, down: s.value < 0 ? -s.value : 0, total: 0 };
  });
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 6, left: -4, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval={0} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={moneyM} width={48} domain={["auto", "auto"]} />
        <Tooltip content={<Tip fmt={moneyM} />} cursor={{ fill: "var(--accent)", opacity: 0.4 }} />
        <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="total" name="Total" stackId="w" fill="var(--chart-4)" />
        <Bar dataKey="up" name="Increase" stackId="w" fill="var(--success)" />
        <Bar dataKey="down" name="Decrease" stackId="w" fill="var(--danger)" />
      </BarChart>
    </ResponsiveContainer>
  );
}
