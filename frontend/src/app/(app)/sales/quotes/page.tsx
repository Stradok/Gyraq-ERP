"use client";
import { PageHeader, Page } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { StatusBadge, Mono } from "@/components/app/status";
import { CustomerLink, MoneyText, empName } from "@/components/app/entity";
import { getDB, idx } from "@/lib/data/queries";
import { dateShort } from "@/lib/format";

export default function QuotesPage() {
  const db = getDB();
  return (
    <>
      <PageHeader module="sales" title="Sales" description="Quotations flow Draft → Sent → Accepted, or Expired / Rejected. Accepted quotes convert to sales orders." />
      <Page>
        <DataTable rows={db.quotes} rowKey={(q) => q.id} searchText={(q) => `${q.number} ${idx().cus.get(q.customerId)?.name}`} exportName="quotations" defaultSort={{ id: "date", dir: "desc" }}
          filters={[{ id: "status", label: "Status", options: ["draft", "sent", "accepted", "rejected", "expired"].map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) })), test: (q, v) => q.status === v }]}
          cols={[
            { id: "n", header: "Quote", cell: (q) => <Mono>{q.number}</Mono>, sort: (q) => q.number },
            { id: "c", header: "Customer", cell: (q) => <CustomerLink id={q.customerId} />, sort: (q) => idx().cus.get(q.customerId)!.name },
            { id: "date", header: "Date", cell: (q) => dateShort(q.date), sort: (q) => q.date },
            { id: "valid", header: "Valid until", cell: (q) => dateShort(q.validUntil), hide: "md", sort: (q) => q.validUntil },
            { id: "rep", header: "Rep", cell: (q) => empName(q.repId), hide: "lg" },
            { id: "total", header: "Value (excl. tax)", cell: (q) => <MoneyText v={q.total} />, align: "right", sort: (q) => q.total, exp: (q) => q.total },
            { id: "s", header: "Status", cell: (q) => <StatusBadge status={q.status} />, sort: (q) => q.status, exp: (q) => q.status },
          ]} />
      </Page>
    </>
  );
}
