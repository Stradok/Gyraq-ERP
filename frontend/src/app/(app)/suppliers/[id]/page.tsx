"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { Kpi } from "@/components/app/kpi";
import { Mono, StatusBadge } from "@/components/app/status";
import { KeyValue, MoneyText } from "@/components/app/entity";
import { AreaTrend } from "@/components/charts/charts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getDB, idx, supplierStats } from "@/lib/data/queries";
import { dateShort, money, money2, moneyCompact } from "@/lib/format";
import { useOverlay } from "@/lib/overlay";

export default function SupplierDetail() {
  const { id } = useParams<{ id: string }>();
  const s = idx().sup.get(id);
  const ov = useOverlay();
  const st = s ? supplierStats(id) : null;
  const db = getDB();
  const histProducts = st ? [...st.priceHistory.keys()].filter((k) => (st.priceHistory.get(k)?.length ?? 0) > 3) : [];
  const [pid, setPid] = useState<string | undefined>(undefined);
  if (!s || !st) return <Page><p className="text-sm text-muted-foreground">Supplier not found.</p></Page>;
  const cur = pid ?? histProducts[0];
  const hist = cur ? [...(st.priceHistory.get(cur) ?? [])].sort((a, b) => a.date.localeCompare(b.date)).map((h) => ({ date: h.date, price: h.price })) : [];
  const pos = ov.pos.filter((p) => p.supplierId === id);
  const commitments = pos.filter((p) => p.status === "approved" || p.status === "partially_received").reduce((a, p) => a + p.lines.reduce((x, l) => x + (l.qty - l.received) * l.price, 0), 0);
  const bills = db.bills.filter((b) => b.supplierId === id);
  return (
    <>
      <PageHeader back={{ href: "/suppliers", label: "Suppliers" }} title={<span className="flex items-center gap-3">{s.name}{s.isPrincipal && <StatusBadge status="active" label="Principal" />}</span>} description={<span><Mono>{s.code}</Mono> · {s.city}, {s.province} · NTN {s.ntn}</span>} />
      <Page>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Total spend (12m)" value={moneyCompact(st.spend12m)} /><Kpi label="Outstanding payable" value={moneyCompact(st.payable)} /><Kpi label="Open commitments" value={moneyCompact(commitments)} sub="Approved, not yet received" /><Kpi label="Avg lead time" value={`${st.avgLead.toFixed(0)}d`} sub={`Promised ${s.leadTimeDays}d`} /><Kpi label="On-time delivery" value={`${st.reliability.toFixed(0)}%`} /><Kpi label="Bills with issues" value={st.exceptions} tone={st.exceptions ? "danger" : undefined} />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Section title="Historical unit price" description="From supplier bills" className="lg:col-span-2" actions={histProducts.length > 0 && <Select value={cur} onValueChange={setPid}><SelectTrigger size="sm" className="w-56 text-xs"><SelectValue /></SelectTrigger><SelectContent>{histProducts.map((p) => <SelectItem key={p} value={p}>{idx().prod.get(p)?.name}</SelectItem>)}</SelectContent></Select>}>
            {hist.length ? <AreaTrend height={220} data={hist.map((h) => ({ date: h.date, price: h.price }))} xKey="date" xFmt={(d) => dateShort(d)} fmt={(n) => money2(n)} series={[{ key: "price", label: "Unit price" }]} /> : <p className="py-10 text-center text-sm text-muted-foreground">No goods history for this supplier.</p>}
          </Section>
          <Section title="Profile"><KeyValue cols={1} items={[["Contact", s.contact], ["Phone", s.phone], ["Email", s.email], ["Payment terms", `${s.termsDays} days`], ["STRN", s.strn], ["Reliability score", `${st.reliability.toFixed(0)}% on time`]]} /></Section>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Purchase history" flush><ul className="max-h-[340px] divide-y overflow-y-auto text-[13px]">{pos.slice(0, 15).map((p) => <li key={p.id}><Link href={`/purchasing/orders/${p.id}`} className="flex items-center justify-between px-4 py-2 hover:bg-accent/40"><span><Mono>{p.number}</Mono><span className="ml-2 text-muted-foreground">{dateShort(p.date)}</span></span><span className="flex items-center gap-2"><MoneyText v={p.total} /><StatusBadge status={p.status} /></span></Link></li>)}{pos.length === 0 && <li className="px-4 py-6 text-center text-xs text-muted-foreground">No purchase orders.</li>}</ul></Section>
          <Section title="Bills" flush><ul className="max-h-[340px] divide-y overflow-y-auto text-[13px]">{bills.slice(0, 15).map((b) => <li key={b.id}><Link href={`/purchasing/bills/${b.id}`} className="flex items-center justify-between px-4 py-2 hover:bg-accent/40"><span><Mono>{b.supplierInvoiceNo}</Mono><span className="ml-2 text-muted-foreground">{dateShort(b.date)}</span></span><span className="flex items-center gap-2"><span className="tabular">{money(b.total)}</span><StatusBadge status={b.status} /></span></Link></li>)}</ul></Section>
        </div>
      </Page>
    </>
  );
}
