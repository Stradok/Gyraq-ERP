"use client";
import { useRouteId } from "@/lib/route-id";
import Link from "next/link";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { Mono, StatusBadge } from "@/components/app/status";
import { CustomerLink, KeyValue, whCode } from "@/components/app/entity";
import { getDB, idx } from "@/lib/data/queries";
import { run } from "@/lib/engine/client";
import { dateLong, num } from "@/lib/format";
import { useERP, useWorld } from "@/lib/store";
import { can } from "@/lib/rbac";

export default function ShipmentDetail() {
  const id = useRouteId();
  useWorld((s) => s.version);
  const role = useERP((s) => s.role);
  const sh = getDB().shipments.find((s) => s.id === id);
  if (!sh) return <Page><p className="text-sm text-muted-foreground">Delivery challan not found.</p></Page>;
  const c = idx().cus.get(sh.customerId)!;
  const so = getDB().orders.find((o) => o.id === sh.orderId);
  const inv = idx().inv.get(sh.invoiceId);
  return (
    <>
      <PageHeader back={{ href: "/sales/shipments", label: "Delivery challans" }} title={<span className="flex items-center gap-3"><Mono className="text-xl">{sh.number}</Mono><StatusBadge status={sh.status} /></span>} description={<span><CustomerLink id={c.id} /> · dispatched {dateLong(sh.date)} from {whCode(sh.warehouseId)}</span>}
        actions={<>{sh.status === "dispatched" && can(role, "warehouse.ops") && <Button size="sm" onClick={() => run("MarkDelivered", { shipmentId: sh.id })}>Mark delivered</Button>}<Button size="sm" variant="outline" onClick={() => window.print()}><Printer />Print</Button></>} />
      <Page>
        <div className="grid gap-4 lg:grid-cols-3">
          <Section title="Goods" className="lg:col-span-2" flush>
            <table className="w-full text-[13px]"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-4 py-2 font-medium">Product</th><th className="px-2 py-2 text-right font-medium">Cartons</th><th className="px-4 py-2 text-right font-medium">Units</th></tr></thead>
              <tbody>{sh.lines.map((l, i) => { const p = idx().prod.get(l.productId)!; return <tr key={i} className="border-b last:border-0"><td className="px-4 py-2">{p.name}<div className="font-mono text-[11px] text-muted-foreground">{p.sku}</div></td><td className="px-2 text-right tabular">{(l.qty / p.cartonSize).toFixed(l.qty % p.cartonSize ? 1 : 0)}</td><td className="px-4 text-right tabular">{num(l.qty)}</td></tr>; })}</tbody></table>
            <div className="grid grid-cols-2 gap-6 border-t px-4 py-6 text-xs text-muted-foreground"><div className="border-t pt-1">Dispatched by (signature)</div><div className="border-t pt-1">Received by (signature and stamp)</div></div>
          </Section>
          <Section title="Gate pass"><KeyValue cols={1} items={[["Gate pass", <Mono key="g">{sh.gatePass}</Mono>], ["Vehicle", <Mono key="v">{sh.vehicle}</Mono>], ["Driver", sh.driver], ["Deliver to", `${c.name}, ${c.area}, ${c.city}`], ["Order", so ? <Link key="o" href={`/sales/orders/${so.id}`} className="font-mono text-xs hover:text-primary">{so.number}</Link> : "—"], ["Invoice", inv ? <Link key="i" href={`/sales/invoices/${inv.id}`} className="font-mono text-xs hover:text-primary">{inv.number}</Link> : "—"]]} /></Section>
        </div>
      </Page>
    </>
  );
}
