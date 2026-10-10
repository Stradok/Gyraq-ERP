"use client";
import { meNow } from "@/lib/me";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { AiChip, ConfidenceBadge } from "@/components/app/ai";
import { Mono, RiskBadge, StatusBadge } from "@/components/app/status";
import { DataTable } from "@/components/app/data-table";
import { KeyValue, MoneyText, empName, whCode } from "@/components/app/entity";
import { RecordPaymentDialog } from "@/components/app/record-payment";
import { AreaTrend, Bars } from "@/components/charts/charts";
import { BUCKETS, customerStats, getDB, idx, invoiceStatusLabel, openInvoices } from "@/lib/data/queries";
import { addDays, monthKey } from "@/lib/data/dates";
import { dateShort, money, moneyCompact, monthLabel, titleCase } from "@/lib/format";
import { useOverlay } from "@/lib/overlay";
import { useERP, useWorld } from "@/lib/store";
import { run } from "@/lib/engine/client";
import { CreditLimitDialog } from "@/components/app/forms";
import { PERSONAS } from "@/lib/rbac";
import { can } from "@/lib/rbac";
import { cn } from "@/lib/utils";

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useWorld((s) => s.version);
  const ov = useOverlay();
  const role = useERP((s) => s.role);
  const [limitOpen, setLimitOpen] = useState(false);
  const c = idx().cus.get(id);
  const db = getDB();
  const s = useMemo(() => (c ? customerStats(id) : null), [c, id]);
  const [tab, setTab] = useState("overview");
  if (!c || !s) return <Page><p className="text-sm text-muted-foreground">Customer not found.</p></Page>;
  const invs = db.invoices.filter((i) => i.customerId === id).map(ov.invoice);
  const orders = ov.orders.filter((o) => o.customerId === id);
  const pays = [...ov.payments, ...db.payments].filter((p) => p.customerId === id);
  const paidOv = ov.payments.filter((p) => p.customerId === id).reduce((a, p) => a + p.amount, 0);
  const outstanding = Math.max(0, s.outstanding - paidOv);
  const open = openInvoices().filter((o) => o.customer.id === id);
  const aging = BUCKETS.map((b) => ({ bucket: b === "current" ? "Current" : b, amount: open.filter((o) => o.bucket === b).reduce((a, o) => a + o.balance, 0) }));
  const months = Array.from({ length: 12 }, (_, i) => { const m = monthKey(addDays(db.today, -(11 - i) * 30)); return { month: m, revenue: invs.filter((x) => monthKey(x.date) === m).reduce((a, x) => a + x.subtotal - x.discount, 0) }; });
  const topProducts = [...invs.slice(0, 120).flatMap((i) => i.lines).reduce((m, l) => m.set(l.productId, (m.get(l.productId) ?? 0) + l.value), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const util = (outstanding / c.creditLimit) * 100;
  const risky = s.band !== "low";
  return (
    <>
      <PageHeader back={{ href: "/customers", label: "Customers" }}
        title={<span className="flex items-center gap-3">{c.name}<StatusBadge status={c.status} /></span>}
        description={<span><Mono>{c.code}</Mono> · {titleCase(c.channel)} · {c.area}, {c.city} · Rep {empName(c.repId)}</span>}
        meta={<div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px]"><span><span className="text-muted-foreground">Credit limit </span><b className="tabular font-medium">{money(c.creditLimit)}</b></span><span><span className="text-muted-foreground">Outstanding </span><b className={cn("tabular font-medium", util > 100 && "text-danger")}>{money(outstanding)}</b></span><span><span className="text-muted-foreground">Overdue </span><b className={cn("tabular font-medium", s.overdue > 0 && "text-danger")}>{money(s.overdue)}</b></span><span><span className="text-muted-foreground">Terms </span><b className="font-medium">{c.termsDays} days</b></span></div>}
        actions={<>
          {can(role, "order.create") && <Button size="sm" asChild><Link href="/sales/orders/new">Create order</Link></Button>}
          {can(role, "approve.credit") && <Button size="sm" variant="outline" onClick={() => setLimitOpen(true)}>Change limit</Button>}
          {can(role, "approve.credit") && (c.status === "on_hold" ? <Button size="sm" variant="outline" onClick={() => run("ReleaseCreditHold", { customerId: id })}>Release hold</Button> : <Button size="sm" variant="outline" onClick={() => run("RequestCreditHold", { customerId: id, reason: "Placed on hold from the customer page" })}>Credit hold</Button>)}
          {can(role, "payment.record") && outstanding > 0 && <RecordPaymentDialog customerId={id} trigger={<Button size="sm" variant="outline">Record payment</Button>} />}
          <DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" variant="outline">Contact</Button></DropdownMenuTrigger><DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => toast.info("Simulated: call logged", { description: `${c.contact} · ${c.phone}` })}><Phone />Call {c.contact}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => toast.info("Simulated: WhatsApp queued", { description: "Nothing was sent; see Integrations → outbox." })}><MessageCircle />WhatsApp</DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push(`/ai?q=${encodeURIComponent(`Draft a collection follow-up for ${c.name}`)}`)}><Mail />Draft follow-up with AI</DropdownMenuItem>
          </DropdownMenuContent></DropdownMenu></>} />
      <CreditLimitDialog key={String(limitOpen)} open={limitOpen} onOpenChange={setLimitOpen} customerId={id} requestedBy={meNow().name} />
      <Page>
        {c.status === "on_hold" && <div className="rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-[13px]"><b>On credit hold.</b> {c.holdReason ?? ""} New orders are blocked until the hold is released.</div>}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList variant="line" className="mb-3">{["overview", "orders", "invoices", "payments", "contacts", "activity"].map((t) => <TabsTrigger key={t} value={t} className="capitalize">{t}</TabsTrigger>)}</TabsList>
              <TabsContent value="overview" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Section title="Credit utilisation"><div className="space-y-2"><div className="flex items-end justify-between"><span className={cn("text-2xl font-semibold tabular", util > 100 && "text-danger")}>{util.toFixed(0)}%</span><span className="text-xs text-muted-foreground">{money(outstanding)} of {money(c.creditLimit)}</span></div><Progress value={Math.min(100, util)} className={cn("h-2", util > 100 && "[&>div]:bg-danger")} /></div></Section>
                  <Section title="Receivables aging"><Bars height={110} data={aging} xKey="bucket" series={[{ key: "amount", label: "Open" }]} colorByIndex={["var(--chart-3)", "var(--chart-2)", "var(--warning)", "var(--danger)", "var(--danger)"]} /></Section>
                </div>
                <Section title="Revenue, last 12 months"><AreaTrend height={190} data={months} xKey="month" xFmt={monthLabel} series={[{ key: "revenue", label: "Revenue (excl. tax)" }]} /></Section>
                <Section title="Top products (12 months)" flush><ul className="divide-y">{topProducts.map(([pid, v]) => <li key={pid} className="flex justify-between px-4 py-2 text-[13px]"><Link href={`/inventory/${pid}`} className="hover:text-primary">{idx().prod.get(pid)!.name}</Link><span className="tabular text-muted-foreground">{moneyCompact(v)}</span></li>)}</ul></Section>
              </TabsContent>
              <TabsContent value="orders"><DataTable rows={orders} rowKey={(o) => o.id} rowHref={(o) => `/sales/orders/${o.id}`} defaultSort={{ id: "d", dir: "desc" }} pageSize={12} cols={[{ id: "n", header: "Order", cell: (o) => <Mono>{o.number}</Mono>, sort: (o) => o.number }, { id: "d", header: "Date", cell: (o) => dateShort(o.date), sort: (o) => o.date }, { id: "t", header: "Total", cell: (o) => <MoneyText v={o.total} />, align: "right", sort: (o) => o.total }, { id: "s", header: "Status", cell: (o) => <StatusBadge status={o.status} /> }]} /></TabsContent>
              <TabsContent value="invoices"><DataTable rows={invs} rowKey={(i) => i.id} rowHref={(i) => `/sales/invoices/${i.id}`} defaultSort={{ id: "d", dir: "desc" }} pageSize={12} cols={[{ id: "n", header: "Invoice", cell: (i) => <Mono>{i.number}</Mono>, sort: (i) => i.number }, { id: "d", header: "Date", cell: (i) => dateShort(i.date), sort: (i) => i.date }, { id: "due", header: "Due", cell: (i) => dateShort(i.dueDate), sort: (i) => i.dueDate }, { id: "t", header: "Amount", cell: (i) => <MoneyText v={i.total} />, align: "right", sort: (i) => i.total }, { id: "b", header: "Balance", cell: (i) => <MoneyText v={i.total - i.paid} />, align: "right", sort: (i) => i.total - i.paid }, { id: "s", header: "Status", cell: (i) => <StatusBadge status={invoiceStatusLabel(i, db.today)} /> }]} /></TabsContent>
              <TabsContent value="payments"><DataTable rows={pays} rowKey={(p) => p.id} defaultSort={{ id: "d", dir: "desc" }} pageSize={12} cols={[{ id: "n", header: "Receipt", cell: (p) => <Mono>{p.number}</Mono> }, { id: "d", header: "Date", cell: (p) => dateShort(p.date), sort: (p) => p.date }, { id: "m", header: "Method", cell: (p) => titleCase(p.method) }, { id: "a", header: "Amount", cell: (p) => <MoneyText v={p.amount} />, align: "right", sort: (p) => p.amount }, { id: "s", header: "Status", cell: (p) => <StatusBadge status={p.status} /> }]} /></TabsContent>
              <TabsContent value="contacts"><Section title="Contacts"><KeyValue items={[["Primary contact", c.contact], ["Phone", c.phone], ["Email", c.email], ["Billing address", `${c.area}, ${c.city}, ${c.province}`], ["Delivery warehouse", whCode(c.warehouseId)], ["Customer since", dateShort(c.since) + " " + c.since.slice(0, 4)]]} /></Section></TabsContent>
              <TabsContent value="activity"><Section title="Activity" flush><ul className="divide-y text-[13px]">{[...pays.slice(0, 4).map((p) => ({ d: p.date, t: `Payment ${p.number} · ${money(p.amount)} (${p.status})` })), ...invs.slice(0, 4).map((i) => ({ d: i.date, t: `Invoice ${i.number} issued · ${money(i.total)}` })), ...orders.slice(0, 3).map((o) => ({ d: o.date, t: `Order ${o.number} ${o.status}` }))].sort((a, b) => b.d.localeCompare(a.d)).slice(0, 10).map((x, i) => <li key={i} className="flex gap-4 px-4 py-2.5"><span className="w-14 shrink-0 text-xs text-muted-foreground">{dateShort(x.d)}</span><span>{x.t}</span></li>)}</ul></Section></TabsContent>
            </Tabs>
          </div>
          <div className="space-y-4">
            <section className="rounded-lg border bg-card p-4" style={{ borderLeft: "2px solid var(--ai)" }}>
              <div className="mb-2 flex items-center gap-2"><h3 className="text-sm font-medium">Customer health</h3><AiChip label="Computed" /></div>
              <RiskBadge band={s.band} score={s.risk} />
              <p className="mt-2 text-[13px] text-muted-foreground">{s.band === "low" ? "Pays within terms; no overdue invoices of concern." : `${titleCase(s.band)} risk: ${s.avgDaysToPayPrev90 && s.avgDaysToPay90 > s.avgDaysToPayPrev90 + 3 ? "payment behaviour has deteriorated over the last 90 days" : "overdue balance and history raise concern"}.`}</p>
              <ul className="mt-3 space-y-2">{s.factors.filter((f) => f.points > 0.5).map((f) => (<li key={f.label} className="text-xs"><div className="flex justify-between"><span>{f.label}</span><span className="tabular text-muted-foreground">+{f.points.toFixed(0)}</span></div><div className="text-muted-foreground">{f.detail}</div></li>))}</ul>
              <div className="mt-3 flex items-center justify-between border-t pt-2"><ConfidenceBadge level="high" basis={`${invs.length} invoices`} /><span className="text-[11px] text-muted-foreground">{invs.length} invoices · computed</span></div>
              {risky && <div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={() => router.push(`/ai?q=${encodeURIComponent(`What should I do about ${c.name}?`)}`)}>Investigate</Button></div>}
            </section>
            <Section title="Tax identity"><KeyValue cols={1} items={[["Registration", c.registered ? "Registered for sales tax" : "Unregistered"], ["NTN", c.ntn ?? "—"], ["STRN", c.strn ?? "—"], ["CNIC", c.cnic ?? "—"], ["Active taxpayer list", c.atl ? "Yes" : "No: further tax and higher withholding apply"]]} /></Section>
          </div>
        </div>
      </Page>
    </>
  );
}
