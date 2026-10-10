"use client";
import { Needs } from "@/components/app/needs";
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Page, PageHeader } from "@/components/app/page-header";
import { BarcodeField } from "@/components/app/barcode";
import { StatusBadge, Mono } from "@/components/app/status";
import { getDB, idx } from "@/lib/data/queries";
import { addDays } from "@/lib/data/dates";
import { run } from "@/lib/engine/client";
import { dateShort, money, num } from "@/lib/format";
import { useWorld } from "@/lib/store";
import { cn } from "@/lib/utils";

interface L { qty: string; rejected: string; batch: string; expiry: string }

function Receive() {
  const sp = useSearchParams();
  useWorld((s) => s.version);
  const db = getDB();
  const [wh, setWh] = useState(sp.get("wh") ?? db.warehouses[0]?.id ?? "");
  const pos = db.pos.filter((p) => p.warehouseId === wh && (p.status === "approved" || p.status === "partially_received"));
  const [poId, setPoId] = useState<string | null>(null);
  const po = pos.find((p) => p.id === poId) ?? null;
  const [f, setF] = useState<Record<string, L>>({});
  const get = (id: string): L => f[id] ?? { qty: "", rejected: "", batch: "", expiry: "" };
  const set = (id: string, k: keyof L, v: string) => setF((x) => ({ ...x, [id]: { ...get(id), [k]: v } }));
  const scan = (code: string) => { if (!po) return false; const l = po.lines.find((x) => idx().prod.get(x.productId)?.barcode === code); if (!l) return false; set(l.productId, "qty", String((+get(l.productId).qty || 0) + idx().prod.get(l.productId)!.cartonSize)); return true; };
  const fillAll = () => { if (!po) return; const n: Record<string, L> = {}; for (const l of po.lines) n[l.productId] = { ...get(l.productId), qty: String(l.qty - l.received) }; setF(n); };
  const submit = () => {
    if (!po) return;
    const r = run("ReceiveGoods", { poId: po.id, lines: po.lines.map((l) => ({ productId: l.productId, qty: +get(l.productId).qty || 0, rejected: +get(l.productId).rejected || 0, batch: get(l.productId).batch || undefined, expiry: get(l.productId).expiry || undefined })) });
    if (r.ok) { setPoId(null); setF({}); }
  };
  const total = useMemo(() => (po ? po.lines.reduce((s, l) => s + (+get(l.productId).qty || 0) * l.price, 0) : 0), [po, f]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <PageHeader back={{ href: "/warehouses", label: "Warehouses" }} title="Receive goods" description="Count the delivery against the purchase order. Accepted units go to stock; rejected units are recorded and returned." actions={<Select value={wh} onValueChange={(v) => { setWh(v); setPoId(null); }}><SelectTrigger size="sm" className="w-40"><SelectValue /></SelectTrigger><SelectContent>{db.warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.code}</SelectItem>)}</SelectContent></Select>} />
      <Page className="mx-auto max-w-2xl">
        {!po && (
          <div className="space-y-2">
            {pos.length === 0 && <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">Nothing is expected at this warehouse. Approved purchase orders appear here.</div>}
            {pos.map((p) => (
              <button key={p.id} onClick={() => { setPoId(p.id); setF({}); }} className="w-full rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/40">
                <div className="flex items-center justify-between"><Mono className="text-sm">{p.number}</Mono><StatusBadge status={p.status} /></div>
                <div className="mt-1 text-[13px]">{idx().sup.get(p.supplierId)!.name}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{p.lines.length} lines · expected {dateShort(p.expectedDate)} · {money(p.total)}</div>
              </button>
            ))}
          </div>
        )}
        {po && (
          <div className="space-y-4">
            <div className="flex items-center justify-between"><div><Mono className="text-base">{po.number}</Mono><div className="text-xs text-muted-foreground">{idx().sup.get(po.supplierId)!.name}</div></div><Button variant="ghost" size="sm" onClick={() => setPoId(null)}>Change order</Button></div>
            <BarcodeField onScan={scan} placeholder="Scan a carton barcode to add one carton" />
            <div className="space-y-3">
              {po.lines.map((l) => {
                const p = idx().prod.get(l.productId)!;
                const rem = l.qty - l.received;
                const v = get(l.productId);
                const over = (+v.qty || 0) + (+v.rejected || 0) > rem;
                return (
                  <div key={l.productId} className={cn("rounded-lg border bg-card p-3.5", over && "border-danger/60")}>
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-[13.5px] font-medium">{p.name}</div><div className="text-xs text-muted-foreground">Barcode {p.barcode} · {p.cartonSize}/carton</div></div><div className="text-right text-xs"><div className="text-muted-foreground">still expected</div><div className="text-base font-semibold tabular">{num(rem)}</div></div></div>
                    <div className="mt-3 grid grid-cols-2 gap-2.5">
                      <div className="space-y-1"><label className="text-[11px] text-muted-foreground" htmlFor={`q${l.productId}`}>Received (units)</label><Input id={`q${l.productId}`} inputMode="numeric" className="h-11 text-base tabular" value={v.qty} onChange={(e) => set(l.productId, "qty", e.target.value.replace(/\D/g, ""))} /></div>
                      <div className="space-y-1"><label className="text-[11px] text-muted-foreground" htmlFor={`r${l.productId}`}>Rejected / damaged</label><Input id={`r${l.productId}`} inputMode="numeric" className="h-11 text-base tabular" value={v.rejected} onChange={(e) => set(l.productId, "rejected", e.target.value.replace(/\D/g, ""))} /></div>
                      <div className="space-y-1"><label className="text-[11px] text-muted-foreground" htmlFor={`b${l.productId}`}>Batch (optional)</label><Input id={`b${l.productId}`} className="h-11" value={v.batch} onChange={(e) => set(l.productId, "batch", e.target.value)} placeholder="auto" /></div>
                      <div className="space-y-1"><label className="text-[11px] text-muted-foreground" htmlFor={`e${l.productId}`}>Expiry (optional)</label><Input id={`e${l.productId}`} type="date" className="h-11" value={v.expiry} onChange={(e) => set(l.productId, "expiry", e.target.value)} placeholder={addDays(db.today, p.shelfLifeDays)} /></div>
                    </div>
                    {over && <p className="mt-2 text-xs text-danger">More than the {num(rem)} still expected.</p>}
                  </div>
                );
              })}
            </div>
            <div className="sticky bottom-0 -mx-4 flex items-center gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:mx-0 md:rounded-lg md:border">
              <div className="flex-1 text-sm"><div className="text-xs text-muted-foreground">Value to stock</div><div className="font-semibold tabular">{money(total)}</div></div>
              <Button variant="outline" onClick={fillAll}>Fill all as expected</Button>
              <Button size="lg" onClick={submit}><Check />Post receipt</Button>
            </div>
          </div>
        )}
        <p className="text-center text-xs text-muted-foreground"><Link href="/purchasing/receipts" className="hover:text-foreground">View goods receipts →</Link></p>
      </Page>
    </>
  );
}
function RouteInner() { return <Suspense><Receive /></Suspense>; }

export default function Route() {
  useWorld((s) => s.version);
  const db = getDB();
  const missing = [
    ...(db.warehouses.length ? [] : [{ text: "Create a warehouse", href: "/setup" }]),
  ];
  return missing.length ? <Needs title="Receive goods" missing={missing} /> : <RouteInner />;
}
