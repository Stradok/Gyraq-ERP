"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Page } from "@/components/app/page-header";
import { run } from "@/lib/engine/client";
import { useERP, useWorld } from "@/lib/store";
import { can } from "@/lib/rbac";
import { DataTable } from "@/components/app/data-table";
import { StatusBadge, Mono } from "@/components/app/status";
import { CustomerLink, MoneyText, empName } from "@/components/app/entity";
import { getDB, idx } from "@/lib/data/queries";
import { dateShort } from "@/lib/format";

export default function QuotesPage() {
  useWorld((s) => s.version);
  const router = useRouter();
  const role = useERP((s) => s.role);
  const db = getDB();
  return (
    <>
      <PageHeader module="sales" title="Sales" description="Quotations flow Draft → Sent → Accepted, or Expired / Rejected. Accepted quotes convert to sales orders." actions={can(role, "order.create") && <Button size="sm" asChild><Link href="/sales/quotes/new"><Plus />New quotation</Link></Button>} />
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
            { id: "act", header: "", align: "right", cell: (q) => !can(role, "order.create") ? null : q.status === "draft" ? <Button size="xs" variant="outline" onClick={() => run("SetQuoteStatus", { id: q.id, status: "sent" })}>Send</Button> : q.status === "sent" ? <span className="flex justify-end gap-1"><Button size="xs" variant="outline" onClick={() => run("SetQuoteStatus", { id: q.id, status: "accepted" })}>Accept</Button><Button size="xs" variant="ghost" onClick={() => run("SetQuoteStatus", { id: q.id, status: "rejected" })}>Reject</Button></span> : q.status === "accepted" ? <Button size="xs" onClick={() => { const r = run("CreateOrder", { customerId: q.customerId, mode: "draft", lines: q.lines.filter((l) => !l.free).map((l) => ({ productId: l.productId, cartons: Math.max(1, Math.round(l.qty / (db.products.find((p) => p.id === l.productId)?.cartonSize ?? 1))), discPct: 0 })) }); if (r.ok) router.push(`/sales/orders/${(r.value as { id: string }).id}`); }}>Convert to order</Button> : null },
          ]} />
      </Page>
    </>
  );
}
