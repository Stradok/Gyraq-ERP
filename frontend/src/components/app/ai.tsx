"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Check, ChevronRight, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { Insight } from "@/lib/data/queries";
import { recommendations } from "@/lib/data/queries";
import { createPOFromRecommendation } from "@/lib/actions";
import { useERP } from "@/lib/store";
import { can } from "@/lib/rbac";
import { dateShort } from "@/lib/format";

export function AiChip({ label = "AI", className }: { label?: string; className?: string }) {
  return <span className={cn("inline-flex h-[18px] items-center rounded border border-ai/40 bg-ai/10 px-1.5 text-[10px] font-semibold tracking-wide text-ai", className)}>{label}</span>;
}

export function ConfidenceBadge({ level, basis }: { level: "high" | "medium" | "low"; basis?: string }) {
  const c = level === "high" ? "text-success" : level === "medium" ? "text-warning" : "text-danger";
  return <span title={basis} className={cn("inline-flex items-center gap-1 text-[11px] font-medium", c)}><span className={cn("size-1.5 rounded-full bg-current")} />{level[0]!.toUpperCase() + level.slice(1)} confidence</span>;
}

const SEV = { critical: "border-danger/60", high: "border-warning/60", medium: "border-info/50", info: "border-border" } as const;
const SEVTXT = { critical: "text-danger", high: "text-warning", medium: "text-info", info: "text-muted-foreground" } as const;

export function InsightCard({ insight, compact }: { insight: Insight; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { dismiss, dismissed, role } = useERP();
  if (dismissed.includes(insight.id)) return null;
  return (
    <>
      <div className={cn("group relative rounded-lg border-l-2 border bg-card p-3.5 transition-colors hover:bg-accent/30", SEV[insight.severity])} style={{ borderLeftColor: "var(--ai)" }}>
        <div className="flex items-start gap-3">
          <div className={cn("mt-0.5 shrink-0", SEVTXT[insight.severity])}>{insight.severity === "info" ? <Info className="size-4" /> : <AlertTriangle className="size-4" />}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setOpen(true)} className="text-left text-[13.5px] font-medium hover:underline">{insight.title}</button>
              <AiChip label="Detected" />
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{insight.statement}</p>
            {!compact && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => (insight.action.propose ? setOpen(true) : router.push(insight.action.href))}>{insight.action.label}</Button>
                <Button size="sm" variant="outline" onClick={() => router.push(`/ai?q=${encodeURIComponent(`Investigate: ${insight.title}`)}`)}>Investigate</Button>
                <Button size="sm" variant="ghost" onClick={() => { dismiss(insight.id); toast("Dismissed", { description: "We won't raise this again unless it gets worse." }); }}>Dismiss</Button>
                <button onClick={() => setOpen(true)} className="ml-auto inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground">Why this?<ChevronRight className="size-3" /></button>
              </div>
            )}
          </div>
        </div>
      </div>
      <InsightDrawer insight={insight} open={open} onOpenChange={setOpen} canAct={can(role, "ai.confirm")} />
    </>
  );
}

export function InsightDrawer({ insight, open, onOpenChange, canAct }: { insight: Insight; open: boolean; onOpenChange: (o: boolean) => void; canAct: boolean }) {
  const router = useRouter();
  const rec = insight.action.propose ? recommendations().find((r) => r.id === insight.action.propose!.recId) : null;
  const [qty, setQty] = useState<number | null>(null);
  const q = qty ?? rec?.recommendedQty ?? 0;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[520px]">
        <SheetHeader>
          <div className="flex items-center gap-2"><AiChip label="Detected" /><ConfidenceBadge level={insight.confidence} basis={insight.basis} /></div>
          <SheetTitle className="text-base leading-snug">{insight.title}</SheetTitle>
          <SheetDescription>{insight.statement}</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-6 text-[13px]">
          <div>
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Why it was generated</div>
            <ul className="space-y-1.5">{insight.why.map((w, i) => <li key={i} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" /><span>{w}</span></li>)}</ul>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Data sources</div>
            <div className="flex flex-wrap gap-1.5">{insight.sources.map((s) => <Link key={s.label} href={s.href} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"><span className="text-muted-foreground">{s.type}</span>{s.label}<ArrowRight className="size-3 text-muted-foreground" /></Link>)}</div>
          </div>
          <div className="rounded-md border bg-subtle p-3 text-xs text-muted-foreground">
            <div><span className="text-foreground">Basis:</span> {insight.basis}</div>
            <div className="mt-1"><span className="text-foreground">Generated:</span> {dateShort(insight.generatedAt.slice(0, 10))} {insight.generatedAt.slice(11, 16)} · computed from ERP records, narrated for review</div>
          </div>
          {rec && (
            <div className="rounded-lg border border-l-2 p-3.5" style={{ borderLeftColor: "var(--ai)" }}>
              <div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium">Recommended purchase</span><AiChip label="Proposal" /></div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <dt className="text-muted-foreground">Current available</dt><dd className="text-right tabular">{rec.available.toLocaleString("en-US")} units</dd>
                <dt className="text-muted-foreground">30-day forecast</dt><dd className="text-right tabular">{rec.forecast30.toLocaleString("en-US")} units</dd>
                <dt className="text-muted-foreground">Supplier lead time</dt><dd className="text-right tabular">{rec.leadTime} days</dd>
                <dt className="text-muted-foreground">Expected stockout</dt><dd className="text-right tabular">{rec.stockoutDays} days</dd>
                <dt className="text-muted-foreground">Quantity</dt>
                <dd className="flex items-center justify-end gap-1.5">
                  <input type="number" step={rec.product.cartonSize} min={rec.product.cartonSize} value={q} onChange={(e) => setQty(Math.max(rec.product.cartonSize, Math.round(+e.target.value / rec.product.cartonSize) * rec.product.cartonSize))} className="h-7 w-24 rounded border bg-background px-2 text-right tabular" />
                  <span className="text-muted-foreground">units</span>
                </dd>
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" disabled={!canAct} onClick={() => { const r = createPOFromRecommendation(rec, q); onOpenChange(false); router.push(`/purchasing/orders/${r.po.id}`); }}><Check />Create purchase order</Button>
                <Button size="sm" variant="outline" onClick={() => router.push("/inventory/replenishment")}>Open replenishment</Button>
              </div>
              {!canAct && <p className="mt-2 text-[11px] text-muted-foreground">Your role can&apos;t confirm AI proposals. Switch persona to try it.</p>}
              <p className="mt-2 text-[11px] text-muted-foreground">Nothing is purchased until you confirm. The PO then follows normal approval rules.</p>
            </div>
          )}
          {!rec && <Button onClick={() => router.push(insight.action.href)}>{insight.action.label}<ArrowRight /></Button>}
        </div>
      </SheetContent>
    </Sheet>
  );
}

