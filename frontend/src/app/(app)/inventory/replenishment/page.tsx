"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Page, PageHeader } from "@/components/app/page-header";
import { AiChip, ConfidenceBadge } from "@/components/app/ai";
import { StatusBadge, Mono } from "@/components/app/status";
import { SupplierLink, whCode } from "@/components/app/entity";
import { recommendations, type Recommendation } from "@/lib/data/queries";
import { createPOFromRecommendation } from "@/lib/actions";
import { money, num } from "@/lib/format";
import { useERP } from "@/lib/store";
import { can } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const SEV = { critical: "danger", high: "warning", medium: "info" } as const;

function RecCard({ r }: { r: Recommendation }) {
  const router = useRouter();
  const { role, actedRecs, actRec } = useERP();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(r.recommendedQty);
  const acted = actedRecs[r.id];
  const canCreate = can(role, "po.create") || can(role, "ai.confirm");
  return (
    <div className={cn("rounded-lg border bg-card transition-opacity", acted && "opacity-60")} style={{ borderLeft: "2px solid var(--ai)" }}>
      <div className="grid gap-4 p-4 lg:grid-cols-[1.3fr_1fr_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><span className="text-[14px] font-medium">{r.product.name}</span><Mono className="text-muted-foreground">{whCode(r.warehouseId)}</Mono><StatusBadge status={SEV[r.severity] === "danger" ? "critical" : r.severity === "high" ? "low" : "medium"} label={r.severity === "critical" ? "Stockout before delivery" : r.severity === "high" ? "Tight" : "Watch"} className={r.severity === "high" ? "text-warning" : undefined} /><AiChip label="Recommended" /></div>
          <div className="mt-0.5 text-xs text-muted-foreground"><SupplierLink id={r.supplierId} /> · {r.product.sku}</div>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-4">
            <div><dt className="text-xs text-muted-foreground">Available</dt><dd className="tabular">{num(r.available)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">30-day forecast</dt><dd className="tabular">{num(r.forecast30)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Lead time</dt><dd className="tabular">{r.leadTime} days</dd></div>
            <div><dt className="text-xs text-muted-foreground">Expected stockout</dt><dd className={cn("tabular", r.stockoutDays < r.leadTime && "text-danger")}>{r.stockoutDays} days</dd></div>
          </dl>
        </div>
        <div className="rounded-md border bg-subtle p-3 text-[13px]">
          <div className="text-xs text-muted-foreground">Recommended purchase</div>
          <div className="mt-0.5 flex items-center gap-2"><Input type="number" step={r.product.cartonSize} min={r.product.cartonSize} value={qty} onChange={(e) => setQty(Math.max(r.product.cartonSize, Math.round(+e.target.value / r.product.cartonSize) * r.product.cartonSize))} disabled={!!acted} className="h-8 w-28 tabular" /><span className="text-xs text-muted-foreground">units · {qty / r.product.cartonSize} ctn</span></div>
          <div className="mt-1.5 text-xs text-muted-foreground">≈ {money(qty * r.unitCost)} at cost{r.incoming ? ` · ${num(r.incoming)} already incoming` : ""}</div>
        </div>
        <div className="flex flex-row items-start gap-2 lg:flex-col lg:items-stretch">
          {acted ? <StatusBadge status={acted === "accepted" ? "approved" : "cancelled"} label={acted === "accepted" ? "PO created" : "Dismissed"} /> : <>
            <Button size="sm" disabled={!canCreate} onClick={() => { const x = createPOFromRecommendation(r, qty); router.push(`/purchasing/orders/${x.po.id}`); }}>Create purchase order</Button>
            <Button size="sm" variant="ghost" onClick={() => { actRec(r.id, "dismissed"); toast("Dismissed"); }}>Dismiss</Button>
          </>}
        </div>
      </div>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-1.5 border-t px-4 py-2 text-xs text-muted-foreground hover:text-foreground">{open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}Why?<span className="ml-auto"><ConfidenceBadge level={r.confidence} basis={r.basis} /></span></button>
      {open && (
        <div className="border-t bg-subtle px-4 py-3 text-[13px]">
          <ul className="space-y-1.5">{r.why.map((w, i) => <li key={i} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />{w}</li>)}</ul>
          <p className="mt-2 text-xs text-muted-foreground">Basis: {r.basis}. Computed by the forecasting engine; the AI never purchases without your approval.</p>
        </div>
      )}
    </div>
  );
}

export default function Replenishment() {
  const recs = useMemo(() => recommendations(), []);
  const [sev, setSev] = useState<string>("all");
  const shown = recs.filter((r) => sev === "all" || r.severity === sev);
  const crit = recs.filter((r) => r.severity === "critical").length;
  return (
    <>
      <PageHeader module="inventory" title="Inventory" description="Forecast-driven purchase recommendations. Review, adjust the quantity, then create the PO; approval rules apply as usual." />
      <Page>
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          {[["all", `All (${recs.length})`], ["critical", `Stockout before delivery (${crit})`], ["high", "Tight"], ["medium", "Watch"]].map(([k, l]) => <button key={k} onClick={() => setSev(k!)} className={cn("rounded-md border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground", sev === k && "border-primary/50 bg-primary/10 text-foreground")}>{l}</button>)}
          <span className="ml-auto text-xs text-muted-foreground">Demand forecast = recent daily demand × trend × seasonality · safety stock = days of cover target</span>
        </div>
        <div className="space-y-3">{shown.slice(0, 20).map((r) => <RecCard key={r.id} r={r} />)}</div>
        {shown.length > 20 && <p className="text-center text-xs text-muted-foreground">Showing the 20 most important of {shown.length}.</p>}
      </Page>
    </>
  );
}
