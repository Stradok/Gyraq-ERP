"use client";
import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, Check, GraduationCap, X } from "lucide-react";
import { run } from "@/lib/engine/client";
import { Button } from "@/components/ui/button";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { Kpi } from "@/components/app/kpi";
import { AiChip, InsightCard } from "@/components/app/ai";
import { StatusBadge } from "@/components/app/status";
import { AreaTrend, Bars, CashChart } from "@/components/charts/charts";
import { aiBrief, arAging, cashProjection, getDB, insights, monthSeries, overviewKpis } from "@/lib/data/queries";
import { ORG } from "@/lib/data/catalog";
import { fiscalQuarter } from "@/lib/data/dates";
import { dateLong, dateShort, moneyCompact, monthLabel, pct0 } from "@/lib/format";
import { useApprovals } from "@/lib/hooks";
import { useOverlay } from "@/lib/overlay";
import { useERP } from "@/lib/store";
import { PERSONAS, can } from "@/lib/rbac";

const pctChange = (a: number, b: number) => (b ? (a / b - 1) * 100 : 0);

export default function OverviewPage() {
  const role = useERP((s) => s.role);
  const dismissed = useERP((s) => s.dismissed);
  const ov = useOverlay();
  const approvals = useApprovals();
  const k = useMemo(() => overviewKpis(), []);
  const months = useMemo(() => monthSeries(15), []);
  const brief = useMemo(() => aiBrief(), []);
  const all = useMemo(() => insights(), []);
  const aging = useMemo(() => arAging(), []);
  const cp = useMemo(() => cashProjection(ov.newlyApproved), [ov.newlyApproved]);
  const showFinance = role === "owner" || role === "admin" || role === "finance";
  const persona = PERSONAS.find((p) => p.role === role)!;

  const ar = k.ar - ov.paidTotal, cash = k.cash + ov.cashIn, overdue = Math.max(0, k.overdue - ov.paidTotal * 0.4);
  const rev = months.slice(-12);
  const pending = approvals.filter((a) => a.status === "pending");
  const insightList = all.filter((i) => !dismissed.includes(i.id));
  const forYou = role === "warehouse" ? insightList.filter((i) => ["replenishment", "discrepancy"].includes(i.kind)) : role === "procurement" ? insightList.filter((i) => ["replenishment", "supplier_price", "duplicate_bill"].includes(i.kind)) : role === "sales_manager" || role === "rep" ? insightList.filter((i) => ["collection_risk", "sales_trend", "replenishment"].includes(i.kind)) : insightList;

  return (
    <>
      <PageHeader title="Overview" description={`${dateLong(k.today)} · ${fiscalQuarter(k.today)} · ${ORG.name}`} actions={<Button variant="outline" size="sm" asChild><Link href="/reports">All reports</Link></Button>} />
      <Page>
        {!dismissed.includes("tour") && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3 text-[13px]">
            <GraduationCap className="size-4 text-primary" />
            <span className="flex-1">New here? This is a working demo: you can add, edit and cancel records. See what <b className="font-medium">{persona.title}</b> does and how to enter each thing.</span>
            <Button size="sm" asChild><Link href="/learn">Open role guide</Link></Button>
            <Button size="icon-sm" variant="ghost" aria-label="Hide" onClick={() => useERP.getState().dismiss("tour")}><X /></Button>
          </div>
        )}
        <section className="rounded-lg border bg-card" style={{ borderLeft: "2px solid var(--ai)" }}>
          <div className="grid gap-0 lg:grid-cols-[1.5fr_1fr]">
            <div className="p-4 md:p-5">
              <div className="mb-2 flex items-center gap-2"><h2 className="text-sm font-medium">AI Business Brief</h2><AiChip label="Computed" /><span className="text-[11px] text-muted-foreground">{dateShort(brief.generatedAt.slice(0, 10))} {brief.generatedAt.slice(11, 16)} · from ledger and subledgers</span></div>
              <p className="text-[15px] leading-relaxed">{brief.paragraph}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <span>Sources: General ledger · AR aging · stock ledger · open POs</span>
                <span>Confidence: <b className="font-medium text-success">High</b> (15 months history)</span>
              </div>
            </div>
            <div className="border-t p-4 md:p-5 lg:border-l lg:border-t-0">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Recommended actions</div>
              <ol className="space-y-2">
                {brief.actions.map((a, i) => (
                  <li key={i}>
                    <Link href={a.href} className="group flex items-start gap-2.5 text-[13px] hover:text-primary">
                      <span className="mt-px grid size-5 shrink-0 place-items-center rounded-full border text-[11px] text-muted-foreground group-hover:border-primary group-hover:text-primary">{i + 1}</span>
                      <span className="flex-1">{a.text}</span>
                      <ArrowRight className="mt-0.5 size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {showFinance && (
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Financial health · last 30 days</div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
              <Kpi label="Revenue" value={moneyCompact(k.cur.revenue)} delta={pctChange(k.cur.revenue, k.prev.revenue)} spark={rev.map((m) => m.revenue)} href="/finance/statements" />
              <Kpi label="Gross profit" value={moneyCompact(k.cur.grossProfit)} sub={`Margin ${pct0(k.cur.gm)}`} delta={pctChange(k.cur.grossProfit, k.prev.grossProfit)} spark={rev.map((m) => m.gp)} href="/finance/statements" />
              <Kpi label="Net profit" value={moneyCompact(k.cur.netProfit)} sub={`YTD ${moneyCompact(k.ytd.netProfit)}`} delta={pctChange(k.cur.netProfit, k.prev.netProfit)} spark={rev.map((m) => m.net)} href="/finance/statements" />
              <Kpi label="Accounts receivable" value={moneyCompact(ar)} sub={`${moneyCompact(overdue)} overdue`} tone={overdue / ar > 0.15 ? "warning" : undefined} href="/finance/receivables" />
              <Kpi label="Accounts payable" value={moneyCompact(k.ap)} href="/finance/payables" />
              <Kpi label="Cash position" value={moneyCompact(cash)} sub="All bank + cash accounts" href="/finance/cashflow" />
              <Kpi label="Outstanding invoices" value={k.openInvoiceCount.toLocaleString("en-US")} sub={`${k.overdueCount} overdue`} href="/sales/invoices?status=overdue" />
            </div>
          </div>
        )}

        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Operations</div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <Kpi label="Orders today" value={k.ordersToday} href="/sales/orders" />
            <Kpi label="Awaiting fulfilment" value={k.awaitingFulfilment} href="/sales/orders?status=reserved" />
            <Kpi label="Low-stock products" value={k.lowStockCount} tone={k.lowStockCount > 20 ? "danger" : "warning"} href="/inventory/replenishment" />
            <Kpi label="Purchase orders pending" value={k.posPending} href="/purchasing/orders" />
            <Kpi label="Warehouse alerts" value={k.warehouseAlerts} href="/warehouses" />
            <Kpi label="Returns (MTD)" value={k.returnsMtd} sub={moneyCompact(k.returnsValueMtd)} href="/sales/returns" />
            <Kpi label="Inventory value" value={moneyCompact(k.inventoryValue)} href="/inventory/stock" />
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Insights for {role === "owner" || role === "admin" ? "management" : persona.title.toLowerCase()}</h2>
              <Link href="/ai" className="text-xs text-muted-foreground hover:text-foreground">Ask a question →</Link>
            </div>
            <div className="grid gap-3">{forYou.slice(0, 5).map((i) => <InsightCard key={i.id} insight={i} />)}</div>
          </div>
          <div className="space-y-4">
            <Section title="Approvals" description={`${pending.length} waiting`} actions={<Link href="/approvals" className="text-xs text-muted-foreground hover:text-foreground">View all</Link>} flush>
              <ul className="divide-y">
                {pending.slice(0, 5).map((a) => (
                  <li key={a.id} className="flex items-start gap-2 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">{a.source === "ai" && <AiChip />}<span className="truncate text-[13px] font-medium">{a.title}</span></div>
                      <div className="truncate text-xs text-muted-foreground">{a.subtitle}</div>
                      {a.amount ? <div className="mt-0.5 text-xs tabular">{moneyCompact(a.amount)}</div> : null}
                    </div>
                    {can(role, "approve.finance") || can(role, "approve.po") ? (
                      <div className="flex gap-1">
                        <Button size="icon-sm" variant="outline" aria-label="Approve" onClick={() => { run("DecideApproval", { id: a.id, decision: "approved" }); }}><Check /></Button>
                        <Button size="icon-sm" variant="ghost" aria-label="Reject" onClick={() => { run("DecideApproval", { id: a.id, decision: "rejected" }); }}><X /></Button>
                      </div>
                    ) : <StatusBadge status="pending" />}
                  </li>
                ))}
                {pending.length === 0 && <li className="px-4 py-6 text-center text-xs text-muted-foreground">Nothing waiting for you.</li>}
              </ul>
            </Section>
          </div>
        </div>

        {showFinance && (
          <div className="grid gap-4 lg:grid-cols-3">
            <Section title="Revenue and gross profit" description="Last 12 months, from the general ledger" className="lg:col-span-2">
              <AreaTrend data={rev.map((m) => ({ month: m.month, revenue: m.revenue, gp: m.gp }))} xKey="month" xFmt={monthLabel} series={[{ key: "revenue", label: "Revenue" }, { key: "gp", label: "Gross profit", color: "var(--success)" }]} />
            </Section>
            <Section title="Receivables aging" description="Open invoices by days past due" actions={<Link href="/finance/receivables" className="text-xs text-muted-foreground hover:text-foreground">Details</Link>}>
              <Bars data={aging.map((a) => ({ bucket: a.bucket === "current" ? "Current" : a.bucket, amount: a.amount }))} xKey="bucket" series={[{ key: "amount", label: "Open" }]} colorByIndex={["var(--chart-3)", "var(--chart-2)", "var(--warning)", "var(--danger)", "var(--danger)"]} />
            </Section>
            <Section title="Cash projection · next 13 weeks" description="Collections, supplier payments, payroll and open POs" className="lg:col-span-3" actions={<Link href="/finance/cashflow" className="text-xs text-muted-foreground hover:text-foreground">Assumptions & drivers →</Link>}>
              <CashChart data={cp.weeks.map((w) => ({ label: `W${w.week}`, closing: w.closing }))} min={getDB().settings.minCash} height={220} />
            </Section>
          </div>
        )}
      </Page>
    </>
  );
}
