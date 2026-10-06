"use client";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { Mono, StatusBadge } from "@/components/app/status";
import { MoneyText, whCode } from "@/components/app/entity";
import { Kpi } from "@/components/app/kpi";
import { expiryRisk } from "@/lib/data/queries";
import { dateShort, money, num } from "@/lib/format";

export default function Expiry() {
  const rows = expiryRisk(120);
  const within = (d: number) => rows.filter((r) => r.daysLeft <= d);
  return (
    <>
      <PageHeader module="inventory" title="Inventory" description="Batches approaching expiry. Modern-trade customers often reject stock under 60% remaining shelf life." />
      <Page>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Kpi label="Expiring ≤ 30 days" value={within(30).length} sub={money(within(30).reduce((s, r) => s + r.value, 0))} tone={within(30).length ? "danger" : undefined} /><Kpi label="Expiring ≤ 60 days" value={within(60).length} sub={money(within(60).reduce((s, r) => s + r.value, 0))} /><Kpi label="Expiring ≤ 120 days" value={rows.length} sub={money(rows.reduce((s, r) => s + r.value, 0))} /><Kpi label="Claimable from principals" value="Expired + damaged" sub="File claims monthly" /></div>
        <Section flush>
          <DataTable className="border-0" rows={rows} rowKey={(r) => r.product.id + r.warehouseId + r.batch} rowHref={(r) => `/inventory/${r.product.id}`} exportName="expiry-risk" searchText={(r) => `${r.product.name} ${r.batch}`} defaultSort={{ id: "left", dir: "asc" }}
            cols={[
              { id: "p", header: "Product", cell: (r) => <span className="font-medium">{r.product.name}</span>, sort: (r) => r.product.name },
              { id: "b", header: "Batch", cell: (r) => <Mono>{r.batch}</Mono> },
              { id: "w", header: "Warehouse", cell: (r) => <Mono>{whCode(r.warehouseId)}</Mono>, sort: (r) => r.warehouseId },
              { id: "q", header: "Qty", cell: (r) => num(r.qty), align: "right", sort: (r) => r.qty },
              { id: "e", header: "Expiry", cell: (r) => dateShort(r.expiry), sort: (r) => r.expiry },
              { id: "left", header: "Days left", cell: (r) => <StatusBadge status={r.daysLeft <= 30 ? "critical" : r.daysLeft <= 60 ? "low" : "ok"} label={`${r.daysLeft}d`} className={r.daysLeft > 30 && r.daysLeft <= 60 ? "text-warning" : undefined} />, align: "right", sort: (r) => r.daysLeft },
              { id: "v", header: "Value at risk", cell: (r) => <MoneyText v={r.value} />, align: "right", sort: (r) => r.value },
            ]} />
        </Section>
      </Page>
    </>
  );
}
