"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RangeBanner, inRange, useRange } from "@/components/app/range-banner";
import { Page, PageHeader } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { StatusBadge, Mono } from "@/components/app/status";
import { CustomerLink, MoneyText, empName, whCode } from "@/components/app/entity";
import { getDB } from "@/lib/data/queries";
import type { SalesOrder } from "@/lib/data/types";
import { dateShort, money } from "@/lib/format";
import { useOverlay } from "@/lib/overlay";
import { useERP } from "@/lib/store";
import { can } from "@/lib/rbac";
import { idx } from "@/lib/data/queries";

function Orders() {
  const sp = useSearchParams();
  const range = useRange();
  const { orders } = useOverlay();
  const role = useERP((s) => s.role);
  const db = getDB();
  const me = db.employees.find((e) => e.name === "Usman Ghani")!;
  const rows = useMemo(() => (role === "rep" ? orders.filter((o) => o.repId === me.id) : orders), [orders, role, me.id]);
  return (
    <>
      <PageHeader module="sales" title="Sales" description={role === "rep" ? "Your orders" : "Orders from draft to fulfilment. Stock is reserved when an order is confirmed."} actions={can(role, "order.create") ? <Button size="sm" asChild><Link href="/sales/orders/new"><Plus />New order</Link></Button> : <Button size="sm" disabled title="Your role can't create orders. Switch to Owner, Admin, Sales Manager or Order Booker (bottom of the sidebar)."><Plus />New order</Button>} />
      <Page>
        <RangeBanner range={range} />
        <DataTable<SalesOrder>
          rows={rows} rowKey={(o) => o.id} rowFilter={(o) => inRange(o.date, range)} rowHref={(o) => `/sales/orders/${o.id}`} exportName="sales-orders" initialFilters={sp.get("status") ? { status: sp.get("status")! } : undefined}
          searchText={(o) => `${o.number} ${idx().cus.get(o.customerId)?.name}`} searchPlaceholder="Search order or customer"
          views={[{ label: "Awaiting fulfilment", filters: { status: "open" } }, { label: "Needs credit override", filters: { status: "draft" } }]}
          filters={[
            { id: "status", label: "Status", options: [{ value: "open", label: "Open (confirmed/reserved)" }, { value: "draft", label: "Draft" }, { value: "fulfilled", label: "Fulfilled" }, { value: "cancelled", label: "Cancelled" }, { value: "reserved", label: "Reserved" }], test: (o, v) => (v === "open" ? o.status === "confirmed" || o.status === "reserved" : o.status === v) },
            { id: "wh", label: "Warehouse", options: db.warehouses.map((w) => ({ value: w.id, label: w.code })), test: (o, v) => o.warehouseId === v },
          ]}
          defaultSort={{ id: "date", dir: "desc" }}
          footer={(r) => `Total ${money(r.reduce((s, o) => s + o.total, 0))}`}
          cols={[
            { id: "number", header: "Order", cell: (o) => <Mono>{o.number}</Mono>, sort: (o) => o.number },
            { id: "customer", header: "Customer", cell: (o) => <CustomerLink id={o.customerId} />, sort: (o) => idx().cus.get(o.customerId)!.name },
            { id: "date", header: "Date", cell: (o) => dateShort(o.date), sort: (o) => o.date },
            { id: "wh", header: "Warehouse", cell: (o) => <Mono>{whCode(o.warehouseId)}</Mono>, hide: "lg", sort: (o) => o.warehouseId },
            { id: "rep", header: "Rep", cell: (o) => empName(o.repId), hide: "xl" },
            { id: "lines", header: "Lines", cell: (o) => o.lines.length, align: "right", hide: "lg", sort: (o) => o.lines.length },
            { id: "total", header: "Total", cell: (o) => <MoneyText v={o.total} />, align: "right", sort: (o) => o.total, exp: (o) => o.total },
            { id: "status", header: "Status", cell: (o) => <span className="flex items-center gap-1.5"><StatusBadge status={o.status} />{o.creditCheck?.decision === "block" && <StatusBadge status="blocked" label="Credit" />}</span>, sort: (o) => o.status, exp: (o) => o.status },
          ]}
        />
      </Page>
    </>
  );
}
export default function Route() { return <Suspense><Orders /></Suspense>; }
