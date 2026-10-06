"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { Kpi } from "@/components/app/kpi";
import { Mono, StatusBadge } from "@/components/app/status";
import { KeyValue, MoneyText, SupplierLink, whCode } from "@/components/app/entity";
import { AiChip } from "@/components/app/ai";
import { Bars } from "@/components/charts/charts";
import { batchesFor, getDB, idx, productStock, productWeekly, recommendations, stockMovements } from "@/lib/data/queries";
import { dateShort, money, num, titleCase } from "@/lib/format";
import { diffDays } from "@/lib/data/dates";
import { useOverlay } from "@/lib/overlay";

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const ov = useOverlay();
  const p = idx().prod.get(id);
  if (!p) return <Page><p className="text-sm text-muted-foreground">Product not found.</p></Page>;
  const db = getDB();
  const st = productStock(id);
  const inc = st.incoming + [...ov.incoming].filter(([k]) => k.startsWith(id + "|")).reduce((a, [, v]) => a + v, 0);
  const weekly = productWeekly(id);
  const mv = stockMovements(id, 25);
  const recs = recommendations().filter((r) => r.product.id === id);
  const sup = idx().sup.get(p.supplierId)!;
  const cover = st.avgDaily > 0.5 ? st.available / st.avgDaily : null;
  return (
    <>
      <PageHeader back={{ href: "/inventory", label: "Inventory" }} title={<span className="flex items-center gap-3">{p.name}<StatusBadge status={recs.length ? "critical" : "ok"} label={recs.length ? "Replenishment due" : "Healthy"} /></span>} description={<span><Mono>{p.sku}</Mono> · {titleCase(p.category)} · {p.brand} · HS {p.hsCode}</span>} />
      <Page>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Kpi label="On hand" value={num(st.on)} /><Kpi label="Reserved" value={num(st.reserved)} /><Kpi label="Available" value={num(st.available)} tone={st.available <= 0 ? "danger" : undefined} />
          <Kpi label="Incoming" value={inc ? num(inc) : "—"} sub={ov.incoming.size ? "includes approved PO" : "Open POs"} /><Kpi label="Avg daily demand" value={num(st.avgDaily)} /><Kpi label="Days of cover" value={cover ? Math.round(cover) : "—"} sub={`Lead time ${sup.leadTimeDays}d`} tone={cover != null && cover < sup.leadTimeDays ? "danger" : undefined} />
        </div>
        {recs.length > 0 && (
          <div className="rounded-lg border bg-card p-3.5" style={{ borderLeft: "2px solid var(--ai)" }}>
            <div className="mb-1 flex items-center gap-2 text-sm font-medium">Replenishment recommended <AiChip label="Forecast" /></div>
            <ul className="space-y-1 text-[13px] text-muted-foreground">{recs.slice(0, 3).map((r) => <li key={r.id}>{whCode(r.warehouseId)}: order {num(r.recommendedQty)} units ({r.recommendedCartons} cartons); stockout in ~{r.stockoutDays} days vs {r.leadTime}-day lead time.</li>)}</ul>
            <Link href="/inventory/replenishment" className="mt-2 inline-block text-xs text-primary hover:underline">Review and create purchase order →</Link>
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-3">
          <Section title="Weekly demand and forecast" description="Units sold per week (last 26) with 6-week projection" className="lg:col-span-2">
            <Bars height={220} data={weekly.map((w) => ({ label: w.label, units: w.units, forecast: w.forecast ?? 0 }))} xKey="label" series={[{ key: "units", label: "Units sold" }, { key: "forecast", label: "Forecast", color: "var(--chart-3)" }]} fmt={(n) => num(n)} stacked />
          </Section>
          <Section title="Product"><KeyValue cols={1} items={[["Supplier", <SupplierLink key="s" id={p.supplierId} />], ["Pack", `${p.cartonSize} pieces per carton`], ["Trade price", `${money(p.price)} per piece`], ["Moving avg cost", money(p.cost)], ["Retail price (MRP)", money(p.mrp)], ["Tax category", p.taxCategory === "third_schedule" ? "Third Schedule (18% on retail price)" : p.taxCategory === "exempt" ? "Exempt" : "Standard 18%"], ["Shelf life", `${p.shelfLifeDays} days`], ["Safety stock", `${p.safetyDays} days`], ["Barcode", <Mono key="b">{p.barcode}</Mono>]]} /></Section>
        </div>
        <Section title="Stock by warehouse" flush>
          <table className="w-full text-[13px]"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-4 py-2 font-medium">Warehouse</th><th className="px-2 py-2 text-right font-medium">On hand</th><th className="px-2 py-2 text-right font-medium">Reserved</th><th className="px-2 py-2 text-right font-medium">Available</th><th className="hidden px-2 py-2 text-right font-medium md:table-cell">Daily demand</th><th className="hidden px-2 py-2 text-right font-medium md:table-cell">Cover</th><th className="px-2 py-2 text-right font-medium">Value</th><th className="px-4 py-2 text-right font-medium">Status</th></tr></thead>
            <tbody>{st.rows.filter((r) => r.on || r.avgDaily > 0.1).map((r) => (<tr key={r.warehouseId} className="border-b last:border-0"><td className="px-4 py-2"><Mono>{whCode(r.warehouseId)}</Mono></td><td className="px-2 text-right tabular">{num(r.on)}</td><td className="px-2 text-right tabular text-muted-foreground">{num(r.reserved)}</td><td className="px-2 text-right tabular">{num(r.available)}</td><td className="hidden px-2 text-right tabular md:table-cell">{r.avgDaily.toFixed(1)}</td><td className="hidden px-2 text-right tabular md:table-cell">{r.daysCover > 900 ? "—" : `${Math.round(r.daysCover)}d`}</td><td className="px-2 text-right tabular"><MoneyText v={r.value} /></td><td className="px-4 text-right"><StatusBadge status={r.status} /></td></tr>))}</tbody></table>
        </Section>
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Batches and expiry" description="Remaining stock attributed to latest receipts (FEFO at pick)" flush>
            <table className="w-full text-[13px]"><tbody>{db.warehouses.flatMap((w) => batchesFor(id, w.id).slice(0, 3).map((b) => ({ w, b }))).slice(0, 8).map(({ w, b }, i) => { const d = diffDays(b.expiry, db.today); return <tr key={i} className="border-b last:border-0"><td className="px-4 py-2"><Mono>{b.batch}</Mono></td><td className="px-2"><Mono className="text-muted-foreground">{w.code}</Mono></td><td className="px-2 text-right tabular">{num(b.qty)}</td><td className="px-4 text-right text-xs"><span className={d < 60 ? "text-warning" : "text-muted-foreground"}>exp {dateShort(b.expiry)} · {d}d</span></td></tr>; })}</tbody></table>
          </Section>
          <Section title="Stock ledger" description="Last 120 days of movements" flush>
            <div className="max-h-[320px] overflow-y-auto"><table className="w-full text-[13px]"><tbody>{mv.map((m, i) => (<tr key={i} className="border-b last:border-0"><td className="whitespace-nowrap px-4 py-1.5 text-xs text-muted-foreground">{dateShort(m.date)}</td><td className="px-2 py-1.5"><div>{m.type}</div><div className="text-xs text-muted-foreground">{m.note}</div></td><td className="px-2 py-1.5"><Link href={m.href} className="font-mono text-xs hover:text-primary">{m.ref}</Link></td><td className="px-2 py-1.5"><Mono className="text-muted-foreground">{whCode(m.warehouseId)}</Mono></td><td className={`px-4 py-1.5 text-right tabular ${m.qty > 0 ? "text-success" : ""}`}>{m.qty > 0 ? "+" : ""}{num(m.qty)}</td></tr>))}</tbody></table></div>
          </Section>
        </div>
      </Page>
    </>
  );
}
