"use client";
import Link from "next/link";
import { Page, PageHeader } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { Mono } from "@/components/app/status";
import { MoneyText, SupplierLink, whCode } from "@/components/app/entity";
import { getDB, idx } from "@/lib/data/queries";
import { dateShort, money } from "@/lib/format";

export default function Receipts() {
  const db = getDB();
  return (
    <>
      <PageHeader module="purchasing" title="Purchasing" description="Goods receipts post stock to the ledger and credit GRNI (goods received not invoiced) until the supplier bill is matched." />
      <Page>
        <DataTable rows={db.grns} rowKey={(g) => g.id} exportName="goods-receipts" defaultSort={{ id: "d", dir: "desc" }} searchText={(g) => `${g.number} ${idx().sup.get(g.supplierId)?.name}`}
          filters={[{ id: "wh", label: "Warehouse", options: db.warehouses.map((w) => ({ value: w.id, label: w.code })), test: (g, v) => g.warehouseId === v }]} footer={(r) => `Value ${money(r.reduce((s, g) => s + g.value, 0))}`}
          cols={[
            { id: "n", header: "Receipt", cell: (g) => <Mono>{g.number}</Mono>, sort: (g) => g.number },
            { id: "po", header: "PO", cell: (g) => <Link href={`/purchasing/orders/${g.poId}`} className="font-mono text-xs hover:text-primary">{db.pos.find((p) => p.id === g.poId)?.number}</Link> },
            { id: "s", header: "Supplier", cell: (g) => <SupplierLink id={g.supplierId} />, sort: (g) => idx().sup.get(g.supplierId)!.name },
            { id: "wh", header: "Warehouse", cell: (g) => <Mono>{whCode(g.warehouseId)}</Mono>, sort: (g) => g.warehouseId },
            { id: "d", header: "Received", cell: (g) => dateShort(g.date), sort: (g) => g.date },
            { id: "l", header: "Lines", cell: (g) => g.lines.length, align: "right", hide: "md" },
            { id: "v", header: "Value", cell: (g) => <MoneyText v={g.value} />, align: "right", sort: (g) => g.value, exp: (g) => g.value },
          ]} />
      </Page>
    </>
  );
}
