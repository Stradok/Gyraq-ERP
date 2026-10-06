"use client";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { Mono, StatusBadge } from "@/components/app/status";
import { MoneyText, SupplierLink } from "@/components/app/entity";
import { Kpi } from "@/components/app/kpi";
import { Bars } from "@/components/charts/charts";
import { apAging, apOpen, getDB, idx } from "@/lib/data/queries";
import { dateShort, money, moneyCompact } from "@/lib/format";
import { diffDays } from "@/lib/data/dates";

export default function Payables() {
  const rows = apOpen();
  const t = getDB().today;
  const total = rows.reduce((s, b) => s + b.total - b.paid, 0);
  const due7 = rows.filter((b) => diffDays(b.dueDate, t) <= 7).reduce((s, b) => s + b.total - b.paid, 0);
  return (
    <>
      <PageHeader module="finance" title="Finance" description="Accounts payable by supplier bill. Bills in exception or pending match are excluded until approved." />
      <Page>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Kpi label="Total payable" value={moneyCompact(total)} /><Kpi label="Due within 7 days" value={moneyCompact(due7)} tone="warning" /><Kpi label="Overdue" value={moneyCompact(rows.filter((b) => b.dueDate < t).reduce((s, b) => s + b.total - b.paid, 0))} /><Kpi label="Open bills" value={rows.length} /></div>
        <Section title="Aging by due date"><Bars height={180} data={apAging().map((a) => ({ bucket: a.bucket === "current" ? "Not yet due" : `${a.bucket} days`, amount: a.amount }))} xKey="bucket" series={[{ key: "amount", label: "Payable" }]} colorByIndex={["var(--chart-3)", "var(--chart-2)", "var(--warning)", "var(--danger)", "var(--danger)"]} /></Section>
        <DataTable rows={rows} rowKey={(b) => b.id} rowHref={(b) => `/purchasing/bills/${b.id}`} exportName="ap-open-items" searchText={(b) => `${b.supplierInvoiceNo} ${idx().sup.get(b.supplierId)?.name}`} defaultSort={{ id: "due", dir: "asc" }} footer={(r) => `Payable ${money(r.reduce((s, b) => s + b.total - b.paid, 0))}`}
          cols={[{ id: "i", header: "Supplier invoice", cell: (b) => <Mono>{b.supplierInvoiceNo}</Mono>, sort: (b) => b.supplierInvoiceNo }, { id: "s", header: "Supplier", cell: (b) => <SupplierLink id={b.supplierId} />, sort: (b) => idx().sup.get(b.supplierId)!.name }, { id: "d", header: "Billed", cell: (b) => dateShort(b.date), hide: "md", sort: (b) => b.date }, { id: "due", header: "Due", cell: (b) => dateShort(b.dueDate), sort: (b) => b.dueDate }, { id: "st", header: "Timing", cell: (b) => (b.dueDate < t ? <StatusBadge status="overdue" label={`${diffDays(t, b.dueDate)}d late`} /> : <span className="text-xs text-muted-foreground">in {diffDays(b.dueDate, t)}d</span>) }, { id: "a", header: "Payable", cell: (b) => <MoneyText v={b.total - b.paid} />, align: "right", sort: (b) => b.total - b.paid }]} />
      </Page>
    </>
  );
}
