"use client";
import { useMe } from "@/lib/me";
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { RangeBanner, inRange, useRange } from "@/components/app/range-banner";
import { Page, PageHeader } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { StatusBadge, Mono } from "@/components/app/status";
import { CustomerLink, MoneyText } from "@/components/app/entity";
import { getDB, idx, invoiceStatusLabel } from "@/lib/data/queries";
import type { Invoice } from "@/lib/data/types";
import { dateShort, money } from "@/lib/format";
import { useOverlay } from "@/lib/overlay";
import { useERP } from "@/lib/store";

function Invoices() {
  const sp = useSearchParams();
  const range = useRange();
  const ov = useOverlay();
  const role = useERP((s) => s.role);
  const db = getDB();
  const who = useMe();
  const rep = db.employees.find((e) => e.name === who.empName);
  const rows = useMemo(() => {
    const base = db.invoices.map(ov.invoice);
    return role === "rep" ? base.filter((i) => idx().cus.get(i.customerId)!.repId === rep?.id) : base;
  }, [db, ov, role, rep?.id]);
  const st = (i: Invoice) => invoiceStatusLabel(i, db.today);
  return (
    <>
      <PageHeader module="sales" title="Sales" description="Invoices raised on dispatch. Overdue is derived from due date and balance, never stored." />
      <Page>
        <RangeBanner range={range} />
        <DataTable<Invoice>
          rows={rows} rowKey={(i) => i.id} rowFilter={(i) => inRange(i.date, range)} rowHref={(i) => `/sales/invoices/${i.id}`} exportName="invoices" initialFilters={sp.get("status") ? { status: sp.get("status")! } : undefined}
          searchText={(i) => `${i.number} ${idx().cus.get(i.customerId)?.name} ${i.fbr.irn}`} searchPlaceholder="Search invoice, customer or IRN" defaultSort={{ id: "date", dir: "desc" }}
          views={[{ label: "Overdue", filters: { status: "overdue" } }, { label: "Unpaid", filters: { status: "unpaid" } }, { label: "Partially paid", filters: { status: "partially_paid" } }]}
          filters={[
            { id: "status", label: "Status", options: [{ value: "overdue", label: "Overdue" }, { value: "unpaid", label: "Unpaid" }, { value: "partially_paid", label: "Partially paid" }, { value: "paid", label: "Paid" }], test: (i, v) => (v === "unpaid" ? i.paymentStatus === "unpaid" : st(i) === v) },
            { id: "wh", label: "Warehouse", options: db.warehouses.map((w) => ({ value: w.id, label: w.code })), test: (i, v) => i.warehouseId === v },
          ]}
          footer={(r) => `Balance ${money(r.reduce((s, i) => s + i.total - i.paid, 0))}`}
          cols={[
            { id: "n", header: "Invoice", cell: (i) => <Mono>{i.number}</Mono>, sort: (i) => i.number },
            { id: "c", header: "Customer", cell: (i) => <CustomerLink id={i.customerId} />, sort: (i) => idx().cus.get(i.customerId)!.name },
            { id: "date", header: "Date", cell: (i) => dateShort(i.date), sort: (i) => i.date },
            { id: "due", header: "Due", cell: (i) => dateShort(i.dueDate), sort: (i) => i.dueDate },
            { id: "amt", header: "Amount", cell: (i) => <MoneyText v={i.total} />, align: "right", sort: (i) => i.total, exp: (i) => i.total },
            { id: "bal", header: "Balance", cell: (i) => <MoneyText v={i.total - i.paid} className={i.total - i.paid < 1 ? "text-muted-foreground" : ""} />, align: "right", hide: "md", sort: (i) => i.total - i.paid, exp: (i) => i.total - i.paid },
            { id: "fbr", header: "FBR", cell: (i) => <StatusBadge status="simulated" label="Simulated" />, hide: "xl" },
            { id: "s", header: "Status", cell: (i) => <StatusBadge status={st(i)} />, sort: (i) => st(i), exp: (i) => st(i) },
          ]}
        />
      </Page>
    </>
  );
}
export default function Route() { return <Suspense><Invoices /></Suspense>; }
