"use client";
import { PageHeader, Page } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { Mono } from "@/components/app/status";
import { CustomerLink, MoneyText } from "@/components/app/entity";
import { getDB, idx } from "@/lib/data/queries";
import { dateShort, titleCase } from "@/lib/format";
import Link from "next/link";

export default function ReturnsPage() {
  const db = getDB();
  return (
    <>
      <PageHeader module="sales" title="Sales" description="Credit notes for expired, damaged and short-delivered goods. Each one reverses revenue, tax and receivable in the ledger." />
      <Page>
        <DataTable rows={db.creditNotes} rowKey={(c) => c.id} exportName="credit-notes" defaultSort={{ id: "date", dir: "desc" }} searchText={(c) => `${c.number} ${idx().cus.get(c.customerId)?.name}`}
          filters={[{ id: "reason", label: "Reason", options: ["expired", "damaged", "price_difference", "short_delivery"].map((r) => ({ value: r, label: titleCase(r) })), test: (c, v) => c.reason === v }]}
          cols={[
            { id: "n", header: "Credit note", cell: (c) => <Mono>{c.number}</Mono>, sort: (c) => c.number },
            { id: "c", header: "Customer", cell: (c) => <CustomerLink id={c.customerId} />, sort: (c) => idx().cus.get(c.customerId)!.name },
            { id: "i", header: "Against", cell: (c) => <Link className="hover:text-primary hover:underline" href={`/sales/invoices/${c.invoiceId}`}><Mono>{idx().inv.get(c.invoiceId)?.number}</Mono></Link> },
            { id: "d", header: "Date", cell: (c) => dateShort(c.date), sort: (c) => c.date },
            { id: "r", header: "Reason", cell: (c) => titleCase(c.reason), sort: (c) => c.reason },
            { id: "sub", header: "Value", cell: (c) => <MoneyText v={c.subtotal} />, align: "right", hide: "md", sort: (c) => c.subtotal },
            { id: "t", header: "Total", cell: (c) => <MoneyText v={c.total} />, align: "right", sort: (c) => c.total, exp: (c) => c.total },
          ]} />
      </Page>
    </>
  );
}
