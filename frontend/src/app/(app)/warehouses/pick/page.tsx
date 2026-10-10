"use client";
import { Needs } from "@/components/app/needs";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PackageCheck, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Page, PageHeader } from "@/components/app/page-header";
import { DispatchDialog } from "@/components/app/dispatch-dialog";
import { Mono, StatusBadge } from "@/components/app/status";
import { batchesFor, getDB, idx } from "@/lib/data/queries";
import { run } from "@/lib/engine/client";
import { dateShort, money, num } from "@/lib/format";
import { useERP, useWorld } from "@/lib/store";
import { can } from "@/lib/rbac";
import { diffDays } from "@/lib/data/dates";

function Pick() {
  const sp = useSearchParams();
  const router = useRouter();
  useWorld((s) => s.version);
  const role = useERP((s) => s.role);
  const db = getDB();
  const [wh, setWh] = useState(sp.get("wh") ?? db.warehouses[0]?.id ?? "");
  const [dispatch, setDispatch] = useState<string | null>(null);
  const orders = db.orders.filter((o) => o.warehouseId === wh && (o.status === "reserved" || o.status === "confirmed")).sort((a, b) => a.date.localeCompare(b.date));
  const ops = can(role, "warehouse.ops");
  return (
    <>
      <PageHeader back={{ href: "/warehouses", label: "Warehouses" }} title="Pick and dispatch" description="Pick lists use first-expiry-first-out: take the earliest-expiring batch first. Mark picked, then dispatch to issue the challan and invoice." actions={<Select value={wh} onValueChange={setWh}><SelectTrigger size="sm" className="w-40"><SelectValue /></SelectTrigger><SelectContent>{db.warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.code}</SelectItem>)}</SelectContent></Select>} />
      {dispatch && <DispatchDialog orderId={dispatch} open onOpenChange={(o) => !o && setDispatch(null)} onDone={(r) => router.push(`/sales/shipments/${r.shipmentId}`)} />}
      <Page className="mx-auto max-w-2xl">
        {orders.length === 0 && <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">No confirmed orders waiting at this warehouse.</div>}
        {orders.map((o) => {
          const c = idx().cus.get(o.customerId)!;
          return (
            <div key={o.id} className="rounded-lg border bg-card">
              <div className="flex items-start justify-between gap-3 border-b p-3.5"><div><Mono className="text-sm">{o.number}</Mono><div className="text-[13px]">{c.name}</div><div className="text-xs text-muted-foreground">{c.area}, {c.city} · {money(o.total)} · ordered {dateShort(o.date)}</div></div><StatusBadge status={o.picked ? "approved" : "reserved"} label={o.picked ? "Picked" : "To pick"} /></div>
              <ul className="divide-y">
                {o.lines.map((l, i) => {
                  const p = idx().prod.get(l.productId)!;
                  const bs = batchesFor(l.productId, wh);
                  let need = l.qty;
                  const take: { batch: string; qty: number; expiry: string }[] = [];
                  for (const b of [...bs].sort((x, y) => x.expiry.localeCompare(y.expiry))) { if (need <= 0) break; const q = Math.min(need, b.qty); take.push({ batch: b.batch, qty: q, expiry: b.expiry }); need -= q; }
                  return (
                    <li key={i} className="p-3.5 text-[13px]">
                      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-medium">{p.name}{l.free && <span className="ml-2 rounded border border-info/40 px-1 text-[10px] text-info">Free goods</span>}</div><div className="text-xs text-muted-foreground">{l.qty / p.cartonSize} cartons × {p.cartonSize}</div></div><div className="text-right text-base font-semibold tabular">{num(l.qty)}</div></div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">{take.map((t, k) => <span key={k} className="rounded border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{t.batch} · {num(t.qty)} · exp {dateShort(t.expiry)}{diffDays(t.expiry, db.today) < 60 ? " ⚠" : ""}</span>)}</div>
                    </li>
                  );
                })}
              </ul>
              {ops && <div className="flex gap-2 border-t p-3"><Button className="h-11 flex-1" variant={o.picked ? "outline" : "default"} disabled={!!o.picked} onClick={() => run("PickOrder", { orderId: o.id })}><PackageCheck />{o.picked ? "Picked" : "Mark picked"}</Button><Button className="h-11 flex-1" disabled={!o.picked} onClick={() => setDispatch(o.id)}><Truck />Dispatch</Button></div>}
            </div>
          );
        })}
      </Page>
    </>
  );
}
function RouteInner() { return <Suspense><Pick /></Suspense>; }

export default function Route() {
  useWorld((s) => s.version);
  const db = getDB();
  const missing = [
    ...(db.warehouses.length ? [] : [{ text: "Create a warehouse", href: "/setup" }]),
  ];
  return missing.length ? <Needs title="Pick orders" missing={missing} /> : <RouteInner />;
}
