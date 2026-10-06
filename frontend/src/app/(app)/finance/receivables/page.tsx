"use client";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { Mono, StatusBadge } from "@/components/app/status";
import { CustomerLink, MoneyText } from "@/components/app/entity";
import { Kpi } from "@/components/app/kpi";
import { Bars } from "@/components/charts/charts";
import { arAging, openInvoices, type OpenInv } from "@/lib/data/queries";
import { dateShort, money, moneyCompact } from "@/lib/format";
import { useOverlay } from "@/lib/overlay";

export default function Receivables() {
  const router = useRouter();
  const ov = useOverlay();
  const rows = useMemo(() => openInvoices().map((o) => { const paid = ov.paidBy.get(o.inv.id) ?? 0; return { ...o, balance: Math.max(0, o.balance - paid) }; }).filter((o) => o.balance > 0.5), [ov.paidBy]);
  const aging = arAging();
  const total = rows.reduce((s, o) => s + o.balance, 0), od = rows.filter((o) => o.daysOverdue > 0).reduce((s, o) => s + o.balance, 0);
  return (
    <>
      <PageHeader module="finance" title="Finance" description="Accounts receivable by invoice. The subledger equals the Trade Debtors control account in the general ledger." actions={<Button size="sm" variant="outline" onClick={() => router.push(`/ai?q=${encodeURIComponent("Find customers overdue by more than 60 days and draft follow-up messages")}`)}>Draft follow-ups with AI</Button>} />
      <Page>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Kpi label="Total receivable" value={moneyCompact(total)} /><Kpi label="Overdue" value={moneyCompact(od)} sub={`${((od / total) * 100).toFixed(0)}% of AR`} tone="warning" /><Kpi label="Over 60 days" value={moneyCompact(rows.filter((o) => o.daysOverdue > 60).reduce((s, o) => s + o.balance, 0))} tone="danger" /><Kpi label="Open invoices" value={rows.length} /></div>
        <Section title="Aging"><Bars height={190} data={aging.map((a) => ({ bucket: a.bucket === "current" ? "Current" : `${a.bucket} days`, amount: a.amount }))} xKey="bucket" series={[{ key: "amount", label: "Open" }]} colorByIndex={["var(--chart-3)", "var(--chart-2)", "var(--warning)", "var(--danger)", "var(--danger)"]} /></Section>
        <DataTable<OpenInv> rows={rows} rowKey={(o) => o.inv.id} rowHref={(o) => `/sales/invoices/${o.inv.id}`} exportName="ar-open-items" searchText={(o) => `${o.inv.number} ${o.customer.name}`} defaultSort={{ id: "days", dir: "desc" }}
          views={[{ label: "Overdue 60+", filters: { b: "61-90" } }]}
          filters={[{ id: "b", label: "Bucket", options: [["current", "Current"], ["1-30", "1–30"], ["31-60", "31–60"], ["61-90", "61–90"], ["90+", "90+"]].map(([v, l]) => ({ value: v!, label: l! })), test: (o, v) => o.bucket === v }]}
          footer={(r) => `Balance ${money(r.reduce((s, o) => s + o.balance, 0))}`}
          cols={[
            { id: "i", header: "Invoice", cell: (o) => <Mono>{o.inv.number}</Mono>, sort: (o) => o.inv.number },
            { id: "c", header: "Customer", cell: (o) => <CustomerLink id={o.customer.id} />, sort: (o) => o.customer.name },
            { id: "d", header: "Date", cell: (o) => dateShort(o.inv.date), hide: "md", sort: (o) => o.inv.date },
            { id: "due", header: "Due", cell: (o) => dateShort(o.inv.dueDate), sort: (o) => o.inv.dueDate },
            { id: "days", header: "Days overdue", cell: (o) => (o.daysOverdue > 0 ? o.daysOverdue : "—"), align: "right", sort: (o) => o.daysOverdue },
            { id: "b", header: "Bucket", cell: (o) => <StatusBadge status={o.bucket === "current" ? "ok" : o.bucket === "1-30" ? "pending" : "overdue"} label={o.bucket === "current" ? "Current" : o.bucket + "d"} />, hide: "lg" },
            { id: "bal", header: "Balance", cell: (o) => <MoneyText v={o.balance} />, align: "right", sort: (o) => o.balance, exp: (o) => o.balance },
          ]} />
      </Page>
    </>
  );
}
