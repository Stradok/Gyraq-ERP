"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Page, PageHeader } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { StatusBadge, Mono } from "@/components/app/status";
import { CustomerLink, MoneyText } from "@/components/app/entity";
import { RecordPaymentDialog } from "@/components/app/record-payment";
import { getDB, idx } from "@/lib/data/queries";
import { dateShort, money, titleCase } from "@/lib/format";
import { useOverlay } from "@/lib/overlay";
import { useERP } from "@/lib/store";
import { can } from "@/lib/rbac";

function Payments() {
  const sp = useSearchParams();
  const ov = useOverlay();
  const role = useERP((s) => s.role);
  const [open, setOpen] = useState(sp.get("new") === "1");
  const rows = [...ov.payments, ...getDB().payments];
  return (
    <>
      <PageHeader module="sales" title="Sales" description="Customer receipts: cash, bank transfer, cheque and post-dated cheques with their lifecycle." actions={can(role, "payment.record") && <Button size="sm" onClick={() => setOpen(true)}><Plus />Record payment</Button>} />
      <RecordPaymentDialog open={open} onOpenChange={setOpen} />
      <Page>
        <DataTable rows={rows} rowKey={(p) => p.id} exportName="customer-payments" defaultSort={{ id: "date", dir: "desc" }} searchText={(p) => `${p.number} ${idx().cus.get(p.customerId)?.name} ${p.chequeNo ?? ""}`}
          views={[{ label: "Cheque register", filters: { method: "cheque" } }, { label: "PDCs in hand", filters: { status: "in_hand" } }, { label: "Bounced", filters: { status: "bounced" } }]}
          filters={[
            { id: "method", label: "Method", options: ["bank_transfer", "cash", "cheque", "pdc"].map((m) => ({ value: m, label: titleCase(m) })), test: (p, v) => (v === "cheque" ? p.method === "cheque" || p.method === "pdc" : p.method === v) },
            { id: "status", label: "Status", options: ["cleared", "deposited", "in_hand", "bounced"].map((m) => ({ value: m, label: titleCase(m) })), test: (p, v) => p.status === v },
          ]}
          footer={(r) => `Total ${money(r.filter((p) => p.status !== "bounced").reduce((s, p) => s + p.amount, 0))}`}
          cols={[
            { id: "n", header: "Receipt", cell: (p) => <Mono>{p.number}</Mono>, sort: (p) => p.number },
            { id: "c", header: "Customer", cell: (p) => <CustomerLink id={p.customerId} />, sort: (p) => idx().cus.get(p.customerId)!.name },
            { id: "d", header: "Date", cell: (p) => dateShort(p.date), sort: (p) => p.date },
            { id: "m", header: "Method", cell: (p) => titleCase(p.method), sort: (p) => p.method },
            { id: "chq", header: "Cheque / bank", cell: (p) => (p.chequeNo ? <span><Mono>{p.chequeNo}</Mono> <span className="text-xs text-muted-foreground">{p.bank}</span></span> : "—"), hide: "lg" },
            { id: "alloc", header: "Allocated to", cell: (p) => (p.allocations.length ? <Mono>{p.allocations.map((a) => idx().inv.get(a.invoiceId)?.number).join(", ")}</Mono> : <span className="text-muted-foreground">—</span>), hide: "xl" },
            { id: "a", header: "Amount", cell: (p) => <MoneyText v={p.amount} />, align: "right", sort: (p) => p.amount, exp: (p) => p.amount },
            { id: "s", header: "Status", cell: (p) => <StatusBadge status={p.status} />, sort: (p) => p.status, exp: (p) => p.status },
          ]} />
      </Page>
    </>
  );
}
export default function Route() { return <Suspense><Payments /></Suspense>; }
