"use client";
import { useState } from "react";
import { FileUp, Plus } from "lucide-react";
import Link from "next/link";
import { PaySupplierDialog } from "@/components/app/forms";
import { can } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { Page, PageHeader } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { StatusBadge, Mono } from "@/components/app/status";
import { MoneyText, SupplierLink } from "@/components/app/entity";
import { AiChip } from "@/components/app/ai";
import { ExtractionSheet } from "@/components/app/extraction";
import { getDB, idx } from "@/lib/data/queries";
import type { SupplierBill } from "@/lib/data/types";
import { dateShort, money, titleCase } from "@/lib/format";
import { useERP, useWorld } from "@/lib/store";

export default function Bills() {
  useWorld((s) => s.version);
  const db = getDB();
  const [open, setOpen] = useState(false);
  const [pay, setPay] = useState<string[] | null>(null);
  const role = useERP((s) => s.role);
  const status = (b: SupplierBill) => b.status;
  return (
    <>
      <PageHeader module="purchasing" title="Purchasing" description="Supplier bills with automatic three-way matching against purchase order and goods receipt. Nothing posts until exceptions are resolved." actions={<><Button size="sm" variant="outline" onClick={() => setOpen(true)}><FileUp />Extract from document</Button>{can(role, "bill.create") && <Button size="sm" asChild><Link href="/purchasing/bills/new"><Plus />Enter bill</Link></Button>}</>} />
      {pay && <PaySupplierDialog open onOpenChange={(o) => !o && setPay(null)} billIds={pay} />}
      <ExtractionSheet open={open} onOpenChange={setOpen} />
      <Page>
        <DataTable<SupplierBill> bulk={can(role, "supplier.pay") ? (sel) => <Button size="xs" onClick={() => setPay(sel.filter((b) => b.status === "posted").map((b) => b.id))} disabled={!sel.some((b) => b.status === "posted")}>Pay selected</Button> : undefined} rows={db.bills} rowKey={(b) => b.id} rowHref={(b) => `/purchasing/bills/${b.id}`} exportName="supplier-bills" defaultSort={{ id: "d", dir: "desc" }} searchText={(b) => `${b.supplierInvoiceNo} ${b.number} ${idx().sup.get(b.supplierId)?.name}`}
          views={[{ label: "Exceptions", filters: { status: "exception" } }, { label: "Unpaid", filters: { status: "posted" } }]}
          filters={[{ id: "status", label: "Status", options: ["exception", "pending_match", "posted", "paid"].map((s) => ({ value: s, label: titleCase(s) })), test: (b, v) => status(b) === v || (v === "exception" && b.exceptions.length > 0 && status(b) === "exception") }, { id: "sup", label: "Supplier", options: db.suppliers.map((s) => ({ value: s.id, label: s.name })), test: (b, v) => b.supplierId === v }]}
          footer={(r) => `Outstanding ${money(r.filter((b) => status(b) === "posted").reduce((s, b) => s + b.total - b.paid, 0))}`}
          cols={[
            { id: "n", header: "Supplier invoice", cell: (b) => <span className="flex items-center gap-1.5"><Mono>{b.supplierInvoiceNo}</Mono>{b.source === "ai_extraction" && <AiChip label="Extracted" />}</span>, sort: (b) => b.supplierInvoiceNo },
            { id: "s", header: "Supplier", cell: (b) => <SupplierLink id={b.supplierId} />, sort: (b) => idx().sup.get(b.supplierId)!.name },
            { id: "d", header: "Date", cell: (b) => dateShort(b.date), sort: (b) => b.date },
            { id: "due", header: "Due", cell: (b) => dateShort(b.dueDate), hide: "md", sort: (b) => b.dueDate },
            { id: "po", header: "PO", cell: (b) => <Mono>{b.poId ? db.pos.find((p) => p.id === b.poId)?.number : "—"}</Mono>, hide: "lg" },
            { id: "t", header: "Total", cell: (b) => <MoneyText v={b.total} />, align: "right", sort: (b) => b.total, exp: (b) => b.total },
            { id: "ex", header: "Match", cell: (b) => (b.exceptions.length ? <span className="text-xs text-danger">{b.exceptions.length} exception{b.exceptions.length > 1 ? "s" : ""}</span> : <span className="text-xs text-success">Matched</span>), hide: "lg" },
            { id: "st", header: "Status", cell: (b) => <StatusBadge status={status(b)} />, sort: (b) => status(b), exp: (b) => status(b) },
          ]} />
      </Page>
    </>
  );
}
