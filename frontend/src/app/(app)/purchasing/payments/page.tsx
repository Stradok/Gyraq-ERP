"use client";
import { Page, PageHeader } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { Mono } from "@/components/app/status";
import { MoneyText, SupplierLink } from "@/components/app/entity";
import { getDB, idx } from "@/lib/data/queries";
import { dateShort, money, titleCase } from "@/lib/format";

export default function SupplierPayments() {
  const db = getDB();
  return (
    <>
      <PageHeader module="purchasing" title="Purchasing" description="Payments to suppliers. Each posts Dr Trade Creditors / Cr Bank." />
      <Page>
        <DataTable rows={db.supplierPayments} rowKey={(p) => p.id} exportName="supplier-payments" defaultSort={{ id: "d", dir: "desc" }} searchText={(p) => `${p.number} ${idx().sup.get(p.supplierId)?.name}`} footer={(r) => `Paid ${money(r.reduce((s, p) => s + p.amount, 0))}`}
          cols={[{ id: "n", header: "Payment", cell: (p) => <Mono>{p.number}</Mono>, sort: (p) => p.number }, { id: "s", header: "Supplier", cell: (p) => <SupplierLink id={p.supplierId} />, sort: (p) => idx().sup.get(p.supplierId)!.name }, { id: "d", header: "Date", cell: (p) => dateShort(p.date), sort: (p) => p.date }, { id: "m", header: "Method", cell: (p) => titleCase(p.method) }, { id: "b", header: "Bills", cell: (p) => <Mono>{p.billIds.map((b) => db.bills.find((x) => x.id === b)?.supplierInvoiceNo).join(", ")}</Mono>, hide: "lg" }, { id: "a", header: "Amount", cell: (p) => <MoneyText v={p.amount} />, align: "right", sort: (p) => p.amount, exp: (p) => p.amount }]} />
      </Page>
    </>
  );
}
