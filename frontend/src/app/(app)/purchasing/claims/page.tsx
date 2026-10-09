"use client";
import { Button } from "@/components/ui/button";
import { Page, PageHeader } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { Mono, StatusBadge } from "@/components/app/status";
import { MoneyText, SupplierLink } from "@/components/app/entity";
import { getDB } from "@/lib/data/queries";
import type { PrincipalClaim } from "@/lib/data/types";
import { run } from "@/lib/engine/client";
import { dateShort, money, titleCase } from "@/lib/format";
import { useERP, useWorld } from "@/lib/store";
import { can } from "@/lib/rbac";

const NEXT: Record<string, "submitted" | "accepted" | "settled" | undefined> = { draft: "submitted", submitted: "accepted", accepted: "settled" };
export default function Claims() {
  useWorld((s) => s.version);
  const role = useERP((s) => s.role);
  const db = getDB();
  const unfiledFree = db.invoices.slice(0, 600).flatMap((i) => i.lines.filter((l) => l.free)).reduce((s, l) => s + l.qty * (db.products.find((p) => p.id === l.productId)?.cost ?? 0), 0);
  return (
    <>
      <PageHeader module="purchasing" title="Purchasing" description="Claims on principal companies for expired and damaged returns, scheme free goods and price differences. Accepted claims are settled against what you owe them." />
      <Page>
        <div className="rounded-lg border bg-card p-3.5 text-[13px] text-muted-foreground">Recent scheme free goods carry about <b className="tabular text-foreground">{money(unfiledFree)}</b> of cost that can be claimed back. Returns of damaged or expired goods draft a claim automatically.</div>
        <DataTable<PrincipalClaim> rows={db.claims} rowKey={(c) => c.id} exportName="claims" defaultSort={{ id: "d", dir: "desc" }} empty="No claims yet. Issue a return with damaged or expired goods to draft one."
          cols={[{ id: "n", header: "Claim", cell: (c) => <Mono>{c.number}</Mono> }, { id: "s", header: "Principal", cell: (c) => <SupplierLink id={c.supplierId} /> }, { id: "t", header: "Type", cell: (c) => titleCase(c.type) }, { id: "d", header: "Date", cell: (c) => dateShort(c.date), sort: (c) => c.date }, { id: "r", header: "Reference", cell: (c) => <span className="text-muted-foreground">{c.note}</span>, hide: "lg" }, { id: "a", header: "Amount", cell: (c) => <MoneyText v={c.amount} />, align: "right", sort: (c) => c.amount }, { id: "st", header: "Status", cell: (c) => <StatusBadge status={c.status} /> },
            { id: "act", header: "", align: "right", cell: (c) => { const n = NEXT[c.status]; return n && can(role, "supplier.pay") ? <Button size="xs" variant="outline" onClick={() => run("SetClaimStatus", { id: c.id, status: n })}>Mark {n}</Button> : null; } }]} />
      </Page>
    </>
  );
}
