"use client";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Page, PageHeader } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { StatusBadge, Mono } from "@/components/app/status";
import { MoneyText, SupplierLink, whCode } from "@/components/app/entity";
import { AiChip } from "@/components/app/ai";
import { getDB, idx } from "@/lib/data/queries";
import type { PurchaseOrder } from "@/lib/data/types";
import { dateShort, money, titleCase } from "@/lib/format";
import { useOverlay } from "@/lib/overlay";
import { useERP, useWorld } from "@/lib/store";
import { can } from "@/lib/rbac";

export default function POs() {
  useWorld((s) => s.version);
  const ov = useOverlay();
  const role = useERP((s) => s.role);
  const db = getDB();
  return (
    <>
      <PageHeader module="purchasing" title="Purchasing" description="Purchase orders: Draft → Pending approval → Approved → Received. POs above Rs 1M need Owner approval." actions={can(role, "po.create") ? <><Button size="sm" variant="outline" asChild><Link href="/inventory/replenishment">From recommendations</Link></Button><Button size="sm" asChild><Link href="/purchasing/orders/new"><Plus />New purchase order</Link></Button></> : <Button size="sm" disabled title="Your role can't create purchase orders. Switch to Owner, Admin or Procurement (bottom of the sidebar)."><Plus />New purchase order</Button>} />
      <Page>
        <DataTable<PurchaseOrder> rows={ov.pos} rowKey={(p) => p.id} rowHref={(p) => `/purchasing/orders/${p.id}`} exportName="purchase-orders" defaultSort={{ id: "date", dir: "desc" }} searchText={(p) => `${p.number} ${idx().sup.get(p.supplierId)?.name}`}
          views={[{ label: "Needs approval", filters: { status: "pending_approval" } }, { label: "In transit", filters: { status: "approved" } }, { label: "AI-proposed", filters: { src: "ai_proposal" } }]}
          filters={[
            { id: "status", label: "Status", options: ["draft", "pending_approval", "approved", "partially_received", "received", "cancelled"].map((s) => ({ value: s, label: titleCase(s) })), test: (p, v) => p.status === v },
            { id: "sup", label: "Supplier", options: db.suppliers.filter((s) => s.kind === "goods").map((s) => ({ value: s.id, label: s.name })), test: (p, v) => p.supplierId === v },
            { id: "wh", label: "Warehouse", options: db.warehouses.map((w) => ({ value: w.id, label: w.code })), test: (p, v) => p.warehouseId === v },
            { id: "src", label: "Source", options: [{ value: "ai_proposal", label: "AI proposal" }, { value: "user", label: "Manual" }, { value: "reorder_rule", label: "Reorder rule" }], test: (p, v) => p.source === v },
          ]}
          footer={(r) => `Total ${money(r.reduce((s, p) => s + p.total, 0))}`}
          cols={[
            { id: "n", header: "PO", cell: (p) => <span className="flex items-center gap-1.5"><Mono>{p.number}</Mono>{p.source === "ai_proposal" && <AiChip />}</span>, sort: (p) => p.number },
            { id: "s", header: "Supplier", cell: (p) => <SupplierLink id={p.supplierId} />, sort: (p) => idx().sup.get(p.supplierId)!.name },
            { id: "wh", header: "Deliver to", cell: (p) => <Mono>{whCode(p.warehouseId)}</Mono>, hide: "lg", sort: (p) => p.warehouseId },
            { id: "date", header: "Ordered", cell: (p) => dateShort(p.date), sort: (p) => p.date },
            { id: "eta", header: "Expected", cell: (p) => dateShort(p.expectedDate), hide: "md", sort: (p) => p.expectedDate },
            { id: "lines", header: "Lines", cell: (p) => p.lines.length, align: "right", hide: "xl", sort: (p) => p.lines.length },
            { id: "t", header: "Total", cell: (p) => <MoneyText v={p.total} />, align: "right", sort: (p) => p.total, exp: (p) => p.total },
            { id: "st", header: "Status", cell: (p) => <StatusBadge status={p.status} />, sort: (p) => p.status, exp: (p) => p.status },
          ]} />
      </Page>
    </>
  );
}
