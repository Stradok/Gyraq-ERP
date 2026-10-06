"use client";
import { Page, PageHeader } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { Mono, StatusBadge } from "@/components/app/status";
import { MoneyText, whCode } from "@/components/app/entity";
import { getDB, stockRows, type StockRow } from "@/lib/data/queries";
import { money, num } from "@/lib/format";

export default function StockPosition() {
  const db = getDB();
  const rows = stockRows().filter((r) => r.on > 0 || r.avgDaily > 0.1);
  return (
    <>
      <PageHeader module="inventory" title="Inventory" description="Stock position per product and warehouse: on hand, reserved, available, incoming and cover." />
      <Page>
        <DataTable<StockRow> rows={rows} rowKey={(r) => r.product.id + r.warehouseId} rowHref={(r) => `/inventory/${r.product.id}`} exportName="stock-position" searchText={(r) => `${r.product.name} ${r.product.sku}`} defaultSort={{ id: "cov", dir: "asc" }}
          views={[{ label: "At risk", filters: { st: "critical" } }, { label: "Out of stock", filters: { st: "out" } }, { label: "Excess", filters: { st: "excess" } }]}
          filters={[{ id: "wh", label: "Warehouse", options: db.warehouses.map((w) => ({ value: w.id, label: w.code })), test: (r, v) => r.warehouseId === v }, { id: "st", label: "Status", options: ["out", "critical", "low", "ok", "excess"].map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) })), test: (r, v) => r.status === v }]}
          footer={(r) => `Value ${money(r.reduce((s, x) => s + x.value, 0))}`}
          cols={[
            { id: "p", header: "Product", cell: (r) => <div><div className="font-medium">{r.product.name}</div><Mono className="text-muted-foreground">{r.product.sku}</Mono></div>, sort: (r) => r.product.name },
            { id: "wh", header: "Warehouse", cell: (r) => <Mono>{whCode(r.warehouseId)}</Mono>, sort: (r) => r.warehouseId },
            { id: "on", header: "On hand", cell: (r) => num(r.on), align: "right", sort: (r) => r.on },
            { id: "res", header: "Reserved", cell: (r) => num(r.reserved), align: "right", hide: "md", sort: (r) => r.reserved },
            { id: "av", header: "Available", cell: (r) => num(r.available), align: "right", sort: (r) => r.available },
            { id: "inc", header: "Incoming", cell: (r) => (r.incoming ? num(r.incoming) : "—"), align: "right", hide: "md", sort: (r) => r.incoming },
            { id: "rop", header: "Reorder pt", cell: (r) => num(r.reorderPoint), align: "right", hide: "xl", sort: (r) => r.reorderPoint },
            { id: "cov", header: "Cover", cell: (r) => (r.daysCover > 900 ? "—" : `${Math.round(r.daysCover)}d`), align: "right", sort: (r) => r.daysCover },
            { id: "val", header: "Value", cell: (r) => <MoneyText v={r.value} />, align: "right", hide: "lg", sort: (r) => r.value },
            { id: "st", header: "Status", cell: (r) => <StatusBadge status={r.status} />, sort: (r) => r.status },
          ]} />
      </Page>
    </>
  );
}
