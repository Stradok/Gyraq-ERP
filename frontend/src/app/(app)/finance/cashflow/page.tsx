"use client";
import { useMemo } from "react";
import Link from "next/link";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { AiChip, InsightCard } from "@/components/app/ai";
import { Kpi } from "@/components/app/kpi";
import { CashChart } from "@/components/charts/charts";
import { ORG } from "@/lib/data/catalog";
import { cashBalance, cashProjection, insights } from "@/lib/data/queries";
import { dateShort, money, moneyCompact } from "@/lib/format";
import { useOverlay } from "@/lib/overlay";
import { cn } from "@/lib/utils";

export default function CashFlow() {
  const ov = useOverlay();
  const base = useMemo(() => cashProjection(), []);
  const cp = useMemo(() => cashProjection(ov.newlyApproved), [ov.newlyApproved]);
  const ins = useMemo(() => insights().find((i) => i.kind === "cashflow")!, []);
  const min = [...cp.weeks].sort((a, b) => a.closing - b.closing)[0]!;
  const breach = cp.weeks.filter((w) => w.closing < ORG.minCash).length;
  const delta = cp.weeks[12]!.closing - base.weeks[12]!.closing;
  return (
    <>
      <PageHeader module="finance" title="Finance" description="13-week projection from open receivables, payables, payroll, recurring costs and approved purchase orders. Assumptions are shown below." />
      <Page>
        {ov.newlyApproved.length > 0 && <div className="rounded-lg border border-info/40 bg-info/5 p-3 text-[13px]">Includes {ov.newlyApproved.length} purchase order{ov.newlyApproved.length > 1 ? "s" : ""} approved in this session ({money(ov.newlyApproved.reduce((s, p) => s + p.total, 0))}). Week-13 balance is {money(Math.abs(delta))} {delta < 0 ? "lower" : "higher"} than before.</div>}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Kpi label="Cash today" value={moneyCompact(cashBalance())} /><Kpi label="Lowest projected" value={moneyCompact(min.closing)} sub={`Week ${min.week} (${dateShort(min.start)})`} tone={min.closing < ORG.minCash ? "danger" : undefined} /><Kpi label="Weeks below minimum" value={breach} sub={`Minimum ${moneyCompact(ORG.minCash)}`} tone={breach ? "danger" : "success"} /><Kpi label="Week-13 balance" value={moneyCompact(cp.weeks[12]!.closing)} /></div>
        <InsightCard insight={ins} compact />
        <Section title="Projected cash balance" actions={<AiChip label="Forecast" />}><CashChart data={cp.weeks.map((w) => ({ label: `W${w.week}`, closing: w.closing }))} min={ORG.minCash} /></Section>
        <Section title="Weekly detail" flush>
          <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-[13px]"><thead><tr className="border-b text-xs text-muted-foreground"><th className="px-4 py-2 text-left font-medium">Week</th><th className="px-3 py-2 text-right font-medium">Opening</th><th className="px-3 py-2 text-right font-medium">Collections</th><th className="px-3 py-2 text-right font-medium">Supplier payments</th><th className="px-3 py-2 text-right font-medium">Payroll</th><th className="px-3 py-2 text-right font-medium">Recurring</th><th className="px-3 py-2 text-right font-medium">Open POs</th><th className="px-3 py-2 text-right font-medium">Closing</th><th className="px-4 py-2 text-left font-medium">Drivers</th></tr></thead><tbody>
            {cp.weeks.map((w) => <tr key={w.week} className={cn("border-b last:border-0", w.closing < ORG.minCash && "bg-danger/5")}><td className="px-4 py-1.5"><span className="font-medium">W{w.week}</span> <span className="text-xs text-muted-foreground">{dateShort(w.start)}</span></td><td className="px-3 text-right tabular text-muted-foreground">{moneyCompact(w.opening)}</td><td className="px-3 text-right tabular text-success">+{moneyCompact(w.collections)}</td><td className="px-3 text-right tabular">−{moneyCompact(w.supplier)}</td><td className="px-3 text-right tabular">{w.payroll ? `−${moneyCompact(w.payroll)}` : "—"}</td><td className="px-3 text-right tabular">−{moneyCompact(w.recurring)}</td><td className="px-3 text-right tabular">{w.commitments ? `−${moneyCompact(w.commitments)}` : "—"}</td><td className={cn("px-3 text-right tabular font-medium", w.closing < ORG.minCash && "text-danger")}>{moneyCompact(w.closing)}</td><td className="max-w-[240px] truncate px-4 text-xs text-muted-foreground">{w.drivers.slice(0, 2).map((d) => `${d.label} ${moneyCompact(d.amount)}`).join(" · ")}</td></tr>)}</tbody></table></div>
        </Section>
        <Section title="Assumptions"><ul className="space-y-1.5 text-[13px] text-muted-foreground">{cp.assumptions.map((a, i) => <li key={i} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />{a}</li>)}</ul><p className="mt-3 text-xs text-muted-foreground">Approve or reject purchase orders in <Link href="/approvals" className="text-primary hover:underline">Approvals</Link> and watch this projection update.</p></Section>
      </Page>
    </>
  );
}
