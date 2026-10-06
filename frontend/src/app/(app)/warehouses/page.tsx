"use client";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeftRight, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { Mono, StatusBadge } from "@/components/app/status";
import { MoneyText, empName } from "@/components/app/entity";
import { InsightCard } from "@/components/app/ai";
import { getDB, idx, insights, stockRows } from "@/lib/data/queries";
import type { StockCount } from "@/lib/data/types";
import { dateShort, money, moneyCompact, num } from "@/lib/format";
import { useERP } from "@/lib/store";
import { PERSONAS } from "@/lib/rbac";
import { cn } from "@/lib/utils";

function CountDialog({ whId, open, onOpenChange }: { whId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const rows = useMemo(() => stockRows().filter((r) => r.warehouseId === whId && r.on > 24).sort((a, b) => b.value - a.value).slice(0, 5), [whId]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const { role, addAudit } = useERP();
  const submit = () => {
    setDone(true);
    const loss = rows.reduce((s, r) => { const c = vals[r.product.id]; return s + (c !== undefined && c !== "" ? (+c - r.on) * (r.value / r.on) : 0); }, 0);
    addAudit({ id: `au_new_${Date.now()}`, at: new Date().toISOString(), actor: PERSONAS.find((p) => p.role === role)!.name, action: "stock_count.submitted", entity: "Stock count", ref: idx().wh.get(whId)!.code, source: "user", detail: `Cycle count submitted, variance ${money(loss)}` });
    toast.success("Count submitted for review", { description: `Net variance ${money(loss)}. Variances over Rs 50,000 need Finance approval.` });
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setDone(false); setVals({}); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Cycle count: {idx().wh.get(whId)?.code}</DialogTitle><DialogDescription>Blind count: expected quantities are hidden until you submit.</DialogDescription></DialogHeader>
        <div className="space-y-2">{rows.map((r) => { const c = vals[r.product.id]; const diff = c !== undefined && c !== "" ? +c - r.on : null; return (
          <div key={r.product.id} className="flex items-center gap-3 rounded-md border p-2.5 text-[13px]"><div className="min-w-0 flex-1"><div className="truncate">{r.product.name}</div><div className="text-xs text-muted-foreground">{done ? `expected ${num(r.on)}` : "expected hidden"}</div></div><Input inputMode="numeric" className="h-8 w-24 tabular" placeholder="Counted" disabled={done} value={vals[r.product.id] ?? ""} onChange={(e) => setVals({ ...vals, [r.product.id]: e.target.value.replace(/\D/g, "") })} />{done && diff !== null && <span className={cn("w-14 text-right text-xs tabular", diff < 0 && "text-danger", diff > 0 && "text-success")}>{diff > 0 ? "+" : ""}{diff}</span>}</div>); })}</div>
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>{done ? "Close" : "Cancel"}</Button>{!done && <Button disabled={Object.keys(vals).length === 0} onClick={submit}>Submit count</Button>}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const db = getDB();
  const [from, setFrom] = useState(db.warehouses[0]!.id), [to, setTo] = useState(db.warehouses[1]!.id), [pid, setPid] = useState(db.products[0]!.id), [qty, setQty] = useState("");
  const { role, addAudit } = useERP();
  const avail = (() => { const c = db.stock.get(`${pid}|${from}`); return c ? c.on - c.res : 0; })();
  const ok = from !== to && +qty > 0 && +qty <= avail;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Transfer inventory</DialogTitle><DialogDescription>Posts stock-in-transit and moves cost at the source average.</DialogDescription></DialogHeader>
        <div className="space-y-3 text-[13px]">
          <div className="grid grid-cols-2 gap-3">{[["From", from, setFrom], ["To", to, setTo]].map(([l, v, set]) => <div key={String(l)} className="space-y-1.5"><div className="text-xs text-muted-foreground">{String(l)}</div><Select value={v as string} onValueChange={set as (v: string) => void}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{db.warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.code}</SelectItem>)}</SelectContent></Select></div>)}</div>
          <div className="space-y-1.5"><div className="text-xs text-muted-foreground">Product</div><Select value={pid} onValueChange={setPid}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent className="max-h-64">{db.products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><div className="text-xs text-muted-foreground">Quantity (available at source: {num(avail)})</div><Input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} className="tabular" /></div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!ok} onClick={() => { addAudit({ id: `au_new_${Date.now()}`, at: new Date().toISOString(), actor: PERSONAS.find((p) => p.role === role)!.name, action: "stock_transfer.created", entity: "Stock transfer", ref: `${idx().wh.get(from)!.code} → ${idx().wh.get(to)!.code}`, source: "user", detail: `${qty} × ${idx().prod.get(pid)!.name}` }); toast.success("Transfer created", { description: `${qty} units in transit to ${idx().wh.get(to)!.code}.` }); onOpenChange(false); }}>Create transfer</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Warehouses() {
  const sp = useSearchParams();
  const db = getDB();
  const [sel, setSel] = useState(sp.get("wh") ?? db.warehouses[0]!.id);
  const [count, setCount] = useState(false);
  const [transfer, setTransfer] = useState(sp.get("transfer") === "1");
  const rows = stockRows();
  const w = idx().wh.get(sel)!;
  const mine = rows.filter((r) => r.warehouseId === sel);
  const counts = db.stockCounts.filter((c) => c.warehouseId === sel);
  const disc = insights().find((i) => i.kind === "discrepancy" && sel === "wh_LHE-DC");
  const open = db.orders.filter((o) => o.warehouseId === sel && (o.status === "reserved" || o.status === "confirmed"));
  return (
    <>
      <PageHeader title="Warehouses" description="Five distribution centres and depots. Receive, pick, count and transfer; mobile-friendly." actions={<><Button size="sm" variant="outline" onClick={() => setTransfer(true)}><ArrowLeftRight />Transfer</Button><Button size="sm" onClick={() => setCount(true)}><ClipboardCheck />Start cycle count</Button></>} />
      <TransferDialog open={transfer} onOpenChange={setTransfer} /><CountDialog whId={sel} open={count} onOpenChange={setCount} />
      <Page>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {db.warehouses.map((x) => { const r = rows.filter((y) => y.warehouseId === x.id); const val = r.reduce((s, y) => s + y.value, 0); const risk = r.filter((y) => y.status === "critical" || y.status === "out").length; return (
            <button key={x.id} onClick={() => setSel(x.id)} className={cn("rounded-lg border bg-card p-3.5 text-left transition-colors hover:border-primary/40", sel === x.id && "border-primary/60 bg-primary/5")}>
              <div className="flex items-center justify-between"><Mono className="font-medium">{x.code}</Mono><span className="text-xs text-muted-foreground">{x.city}</span></div>
              <div className="mt-2 text-lg font-semibold tabular">{moneyCompact(val)}</div><div className="text-xs text-muted-foreground">{r.filter((y) => y.on > 0).length} SKUs in stock</div>
              <div className={cn("mt-2 text-xs", risk ? "text-danger" : "text-success")}>{risk ? `${risk} SKUs at risk` : "Healthy"}</div>
            </button>); })}
        </div>
        {disc && <InsightCard insight={disc} />}
        <div className="grid gap-4 lg:grid-cols-3">
          <Section title={w.name} description={`Manager ${empName(w.managerId)}`} className="lg:col-span-1">
            <dl className="space-y-2 text-[13px]">{[["Stock value", money(mine.reduce((s, r) => s + r.value, 0))], ["Units on hand", num(mine.reduce((s, r) => s + r.on, 0))], ["Reserved for open orders", num(mine.reduce((s, r) => s + r.reserved, 0))], ["Open orders to fulfil", String(open.length)], ["At-risk SKUs", String(mine.filter((r) => r.status === "critical" || r.status === "out").length)], ["Expected network share", `${(w.share * 100).toFixed(0)}%`]].map(([k, v]) => <div key={k} className="flex justify-between"><dt className="text-muted-foreground">{k}</dt><dd className="tabular">{v}</dd></div>)}</dl>
          </Section>
          <Section title="Stock counts" description="Cycle and full counts with variance" className="lg:col-span-2" flush>
            <DataTable<StockCount> className="border-0" rows={counts} rowKey={(c) => c.id} pageSize={6} cols={[
              { id: "n", header: "Count", cell: (c) => <Mono>{c.number}</Mono> }, { id: "d", header: "Date", cell: (c) => dateShort(c.date), sort: (c) => c.date }, { id: "by", header: "Counted by", cell: (c) => c.counter, hide: "md" },
              { id: "loc", header: "Locations", cell: (c) => <Mono className="text-muted-foreground">{[...new Set(c.lines.map((l) => l.location.slice(0, 1)))].join(", ")}</Mono>, hide: "lg" },
              { id: "v", header: "Variance", cell: (c) => { const v = c.lines.reduce((s, l) => s + (l.counted - l.expected) * (idx().prod.get(l.productId)?.cost ?? 0), 0); return <MoneyText v={v} className={v < 0 ? "text-danger" : v > 0 ? "text-success" : "text-muted-foreground"} />; }, align: "right", sort: (c) => c.lines.reduce((s, l) => s + (l.counted - l.expected) * (idx().prod.get(l.productId)?.cost ?? 0), 0) },
              { id: "s", header: "Status", cell: (c) => <StatusBadge status={c.status} /> },
            ]} />
          </Section>
        </div>
      </Page>
    </>
  );
}
export default function Route() { return <Suspense><Warehouses /></Suspense>; }
