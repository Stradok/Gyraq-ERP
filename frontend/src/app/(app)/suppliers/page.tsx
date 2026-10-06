"use client";
import { Page, PageHeader } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { Mono, StatusBadge } from "@/components/app/status";
import { MoneyText } from "@/components/app/entity";
import { getDB, supplierStats } from "@/lib/data/queries";
import type { Supplier } from "@/lib/data/types";
import { money } from "@/lib/format";
import { useMemo } from "react";

export default function Suppliers() {
  const db = getDB();
  const rows = useMemo(() => db.suppliers.map((s) => ({ s, st: supplierStats(s.id) })), [db]);
  return (
    <>
      <PageHeader title="Suppliers" description="Principals and service vendors: spend, payables, lead time and reliability." />
      <Page>
        <DataTable rows={rows} rowKey={(r) => r.s.id} rowHref={(r) => `/suppliers/${r.s.id}`} exportName="suppliers" searchText={(r) => `${r.s.name} ${r.s.code} ${r.s.city}`} defaultSort={{ id: "spend", dir: "desc" }}
          filters={[{ id: "k", label: "Type", options: [{ value: "goods", label: "Goods" }, { value: "services", label: "Services" }], test: (r, v) => r.s.kind === v }, { id: "p", label: "Principal", options: [{ value: "y", label: "Principal" }], test: (r) => r.s.isPrincipal }]}
          footer={(r) => `Payable ${money(r.reduce((s, x) => s + x.st.payable, 0))}`}
          cols={[
            { id: "n", header: "Supplier", cell: (r) => <div><div className="font-medium">{r.s.name}</div><Mono className="text-muted-foreground">{r.s.code} · {r.s.city}</Mono></div>, sort: (r) => r.s.name },
            { id: "k", header: "Type", cell: (r) => (r.s.isPrincipal ? <StatusBadge status="active" label="Principal" /> : <span className="text-muted-foreground">{r.s.kind === "goods" ? "Supplier" : "Service"}</span>), hide: "md" },
            { id: "spend", header: "Spend (12m)", cell: (r) => <MoneyText v={r.st.spend12m} />, align: "right", sort: (r) => r.st.spend12m, exp: (r) => r.st.spend12m },
            { id: "pay", header: "Payable", cell: (r) => <MoneyText v={r.st.payable} />, align: "right", sort: (r) => r.st.payable, exp: (r) => r.st.payable },
            { id: "lt", header: "Avg lead time", cell: (r) => (r.s.kind === "goods" ? `${r.st.avgLead.toFixed(0)} days` : "—"), align: "right", hide: "lg", sort: (r) => r.st.avgLead },
            { id: "rel", header: "Reliability", cell: (r) => (r.s.kind === "goods" ? `${r.st.reliability.toFixed(0)}%` : "—"), align: "right", hide: "lg", sort: (r) => r.st.reliability },
            { id: "t", header: "Terms", cell: (r) => `${r.s.termsDays}d`, align: "right", hide: "xl", sort: (r) => r.s.termsDays },
            { id: "ex", header: "Bill issues", cell: (r) => (r.st.exceptions ? <span className="text-danger">{r.st.exceptions}</span> : "—"), align: "right", hide: "xl", sort: (r) => r.st.exceptions },
          ]} />
      </Page>
    </>
  );
}
void (null as unknown as Supplier);
