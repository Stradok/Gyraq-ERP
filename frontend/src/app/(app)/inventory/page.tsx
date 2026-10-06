"use client";
import { useMemo } from "react";
import { Page, PageHeader } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { StatusBadge, Mono } from "@/components/app/status";
import { MoneyText, SupplierLink } from "@/components/app/entity";
import { CATEGORIES } from "@/lib/data/catalog";
import { getDB, productStock } from "@/lib/data/queries";
import type { Product } from "@/lib/data/types";
import { money, num, titleCase } from "@/lib/format";
import { useOverlay } from "@/lib/overlay";

export default function InventoryPage() {
  const db = getDB();
  const ov = useOverlay();
  const rows = useMemo(() => db.products.map((p) => {
    const st = productStock(p.id);
    const inc = st.incoming + [...ov.incoming].filter(([k]) => k.startsWith(p.id + "|")).reduce((a, [, v]) => a + v, 0);
    const daily = st.avgDaily;
    const cover = daily > 0.5 ? st.available / daily : 999;
    const crit = st.rows.some((r) => r.status === "critical" || r.status === "out");
    const status = crit ? "critical" : st.rows.every((r) => r.status === "excess") ? "excess" : st.rows.some((r) => r.status === "low") ? "low" : "ok";
    return { p, st, inc, cover, status, margin: ((p.price - p.cost) / p.price) * 100 };
  }), [db, ov.incoming]);
  type R = (typeof rows)[number];
  return (
    <>
      <PageHeader module="inventory" title="Inventory" description="Products with stock summed across warehouses. Every quantity comes from the stock ledger." />
      <Page>
        <DataTable<R> rows={rows} rowKey={(r) => r.p.id} rowHref={(r) => `/inventory/${r.p.id}`} exportName="products" searchText={(r) => `${r.p.name} ${r.p.sku} ${r.p.brand}`} searchPlaceholder="Search name, SKU or brand" defaultSort={{ id: "value", dir: "desc" }}
          views={[{ label: "Low stock", filters: { st: "critical" } }, { label: "Excess stock", filters: { st: "excess" } }]}
          filters={[
            { id: "cat", label: "Category", options: CATEGORIES.map((c) => ({ value: c.id, label: c.name })), test: (r, v) => r.p.category === v },
            { id: "st", label: "Stock", options: [{ value: "critical", label: "At risk" }, { value: "low", label: "Low" }, { value: "ok", label: "OK" }, { value: "excess", label: "Excess" }], test: (r, v) => r.status === v },
            { id: "sup", label: "Supplier", options: db.suppliers.filter((s) => s.kind === "goods").map((s) => ({ value: s.id, label: s.name })), test: (r, v) => r.p.supplierId === v },
          ]}
          footer={(r) => `Stock value ${money(r.reduce((s, x) => s + x.st.value, 0))}`}
          cols={[
            { id: "sku", header: "SKU", cell: (r) => <Mono>{r.p.sku}</Mono>, sort: (r) => r.p.sku },
            { id: "name", header: "Product", cell: (r) => <span className="font-medium">{r.p.name}</span>, sort: (r) => r.p.name },
            { id: "cat", header: "Category", cell: (r) => titleCase(r.p.category), hide: "lg", sort: (r) => r.p.category },
            { id: "on", header: "On hand", cell: (r) => num(r.st.on), align: "right", sort: (r) => r.st.on, exp: (r) => r.st.on },
            { id: "res", header: "Reserved", cell: (r) => num(r.st.reserved), align: "right", hide: "md", sort: (r) => r.st.reserved },
            { id: "av", header: "Available", cell: (r) => num(r.st.available), align: "right", sort: (r) => r.st.available, exp: (r) => r.st.available },
            { id: "inc", header: "Incoming", cell: (r) => (r.inc ? num(r.inc) : "—"), align: "right", hide: "md", sort: (r) => r.inc },
            { id: "cov", header: "Days cover", cell: (r) => (r.cover > 900 ? "—" : Math.round(r.cover)), align: "right", hide: "lg", sort: (r) => r.cover },
            { id: "price", header: "Price", cell: (r) => <MoneyText v={r.p.price} />, align: "right", hide: "xl", sort: (r) => r.p.price },
            { id: "margin", header: "Margin", cell: (r) => `${r.margin.toFixed(1)}%`, align: "right", hide: "xl", sort: (r) => r.margin, defaultHidden: true },
            { id: "value", header: "Stock value", cell: (r) => <MoneyText v={r.st.value} />, align: "right", hide: "md", sort: (r) => r.st.value, exp: (r) => r.st.value },
            { id: "sup", header: "Supplier", cell: (r) => <SupplierLink id={r.p.supplierId} />, defaultHidden: true },
            { id: "status", header: "Status", cell: (r) => <StatusBadge status={r.status === "critical" ? "critical" : r.status} label={r.status === "critical" ? "At risk" : undefined} />, sort: (r) => r.status, exp: (r) => r.status },
          ]} />
      </Page>
    </>
  );
}
