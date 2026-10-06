"use client";
import { ShieldCheck } from "lucide-react";
import type { Invoice } from "@/lib/data/types";
import { dateLong } from "@/lib/format";
import { diffDays } from "@/lib/data/dates";
import { getDB } from "@/lib/data/queries";
import { Mono, StatusBadge } from "./status";

/** Deterministic pseudo-QR so the invoice has a recognisable (clearly simulated) QR block. */
export function QrBlock({ seed, size = 92 }: { seed: string; size?: number }) {
  const n = 25;
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000) / 1000; };
  const cells: boolean[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => rnd() > 0.52));
  const finder = (x: number, y: number) => { for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) cells[y + j]![x + i] = i === 0 || j === 0 || i === 6 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4); for (let i = -1; i < 8; i++) { if (y + 7 < n && x + i >= 0 && x + i < n) cells[y + 7]![x + i] = false; } };
  finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} className="rounded bg-white p-1" shapeRendering="crispEdges" aria-label="Simulated QR code">
      {cells.map((r, y) => r.map((c, x) => c && <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#0a0a0a" />))}
    </svg>
  );
}

export function FbrPanel({ inv }: { inv: Invoice }) {
  const now = `${getDB().today}T12:00`;
  const issued = `${inv.date}T17:30`;
  const hours = Math.round((Date.parse(now) - Date.parse(issued)) / 3_600_000);
  const left = 72 - hours;
  return (
    <div className="flex gap-4">
      <QrBlock seed={inv.fbr.irn} />
      <div className="min-w-0 space-y-1.5 text-[13px]">
        <div className="flex items-center gap-2"><ShieldCheck className="size-4 text-info" /><span className="font-medium">FBR Digital Invoicing</span><StatusBadge status="simulated" label="Simulated" /></div>
        <div><span className="text-xs text-muted-foreground">Invoice reference number (IRN)</span><div><Mono>{inv.fbr.irn}</Mono></div></div>
        <div className="text-xs text-muted-foreground">Submitted {dateLong(inv.fbr.at)} · not transmitted to FBR (demo)</div>
        {left > 0 ? <div className="text-xs text-warning">Editable for {left}h more. After that, corrections need a credit/debit note linked to the IRN.</div> : <div className="text-xs text-muted-foreground">72-hour correction window closed {diffDays(getDB().today, inv.date)}d ago. Use a credit note to correct.</div>}
      </div>
    </div>
  );
}
