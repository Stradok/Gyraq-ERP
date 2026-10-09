// Post-check: every money figure or percentage in an assistant answer must appear in the tool results of the same turn.
// Models can misquote numbers; this makes that visible instead of silently trusted.
import type { ToolResult } from "./tools";

const UNIT: Record<string, number> = { k: 1e3, m: 1e6, l: 1e5, cr: 1e7 };
function parse(raw: string): { v: number; pct: boolean } | null {
  const pct = /%/.test(raw);
  const m = raw.match(/([\d,]+(?:\.\d+)?)\s*(cr|m|l|k)?\b/i);
  if (!m) return null;
  const n = parseFloat(m[1]!.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return { v: n * (m[2] ? UNIT[m[2].toLowerCase()]! : 1), pct };
}

export function figuresIn(text: string): string[] {
  const out = text.match(/Rs\.?\s?−?[\d,]+(?:\.\d+)?\s?(?:Cr|M|L|K)?|(?<![\d.])\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\d])|\d+(?:\.\d+)?\s?%/g) ?? [];
  return [...new Set(out.map((s) => s.trim()))];
}

export function checkFigures(text: string, results: ToolResult[]): { checked: number; unverified: string[] } {
  const pool: number[] = [];
  const grab = (s: string) => { for (const m of s.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)) { const n = parseFloat(m[0].replace(/,/g, "")); if (Number.isFinite(n)) pool.push(Math.abs(n)); } };
  for (const r of results) { grab(r.summary); grab(JSON.stringify(r.ui)); for (const m of r.metrics ?? []) grab(m.value); }
  const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.006) || Math.abs(a - Math.round(b)) < 0.51 || Math.abs(a - b / 1e6) < 0.06 || Math.abs(a - b / 1e5) < 0.06 || Math.abs(a - b / 1e7) < 0.006;
  const unverified: string[] = [];
  const figs = figuresIn(text);
  for (const f of figs) {
    const p = parse(f.replace(/^Rs\.?\s?/i, "").replace("−", "-"));
    if (!p) continue;
    const ok = pool.some((n) => near(p.v, n) || (p.pct && Math.abs(p.v - n) < 0.06) || near(p.v * 1, n * 1));
    if (!ok) unverified.push(f);
  }
  return { checked: figs.length, unverified };
}
