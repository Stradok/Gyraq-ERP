"use client";
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeftRight, ClipboardCheck, PackageOpen, ScanLine, SlidersHorizontal, Truck } from "lucide-react";
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
import { run } from "@/lib/engine/client";
import { dateShort, money, moneyCompact, num } from "@/lib/format";
import { useERP, useWorld } from "@/lib/store";
import { can } from "@/lib/rbac";
import { cn } from "@/lib/utils";

function ProductPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const db = getDB();
  return <Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent className="max-h-64">{db.products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>;
}

function TransferDialog({ open, onOpenChange, wh }: { open: boolean; onOpenChange: (o: boolean) => void; wh: string }) {
  const db = getDB();
  const [from, setFrom] = useState(wh), [to, setTo] = useState(db.warehouses.find((w) => w.id !== wh)!.id), [pid, setPid] = useState(db.products[0]!.id), [qty, setQty] = useState("");
  const c = db.stock.get(`${pid}|${from}`);
  const avail = c ? c.on - c.res : 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Transfer inventory</DialogTitle><DialogDescription>Moves stock between warehouses at the source's average cost.</DialogDescription></DialogHeader>
        <div className="space-y-3 text-[13px]">
          <div className="grid grid-cols-2 gap-3">{([["From", from, setFrom], ["To", to, setTo]] as const).map(([l, v, set]) => <div key={l} className="space-y-1.5"><div className="text-xs text-muted-foreground">{l}</div><Select value={v} onValueChange={set}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{db.warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.code}</SelectItem>)}</SelectContent></Select></div>)}</div>
          <div className="space-y-1.5"><div className="text-xs text-muted-foreground">Product</div><ProductPicker value={pid} onChange={setPid} /></div>
          <div className="space-y-1.5"><label htmlFor="trq" className="text-xs text-muted-foreground">Quantity (free at source: {num(avail)})</label><Input id="trq" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} className="tabular" /></div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => { const r = run("TransferStock", { productId: pid, fromId: from, toId: to, qty: +qty }); if (r.ok) onOpenChange(false); }}>Create transfer</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdjustDialog({ open, onOpenChange, wh }: { open: boolean; onOpenChange: (o: boolean) => void; wh: string }) {
  const db = getDB();
  const [pid, setPid] = useState(db.products[0]!.id), [delta, setDelta] = useState(""), [reason, setReason] = useState("");
  const c = db.stock.get(`${pid}|${wh}`);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Adjust stock</DialogTitle><DialogDescription>For damage, loss or found stock. Posts to the ledger; adjustments above Rs 50,000 need Finance approval.</DialogDescription></DialogHeader>
        <div className="space-y-3 text-[13px]">
          <div className="space-y-1.5"><div className="text-xs text-muted-foreground">Product at {idx().wh.get(wh)!.code}</div><ProductPicker value={pid} onChange={setPid} /></div>
          <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><label htmlFor="adq" className="text-xs text-muted-foreground">Change in units (negative = loss)</label><Input id="adq" inputMode="numeric" value={delta} onChange={(e) => setDelta(e.target.value.replace(/[^\d-]/g, ""))} className="tabular" /></div><div className="space-y-1.5"><div className="text-xs text-muted-foreground">On hand now</div><div className="flex h-8 items-center tabular">{num(c?.on ?? 0)}</div></div></div>
          <div className="space-y-1.5"><label htmlFor="adr" className="text-xs text-muted-foreground">Reason</label><Input id="adr" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. damaged in handling" /></div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => { const r = run("AdjustStock", { productId: pid, warehouseId: wh, qtyDelta: +delta, reason }); if (r.ok) onOpenChange(false); }}>Post adjustment</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Warehouses() {
  const sp = useSearchParams();
  useWorld((s) => s.version);
  const db = getDB();
  const role = useERP((s) => s.role);
  const [sel, setSel] = useState(sp.get("wh") ?? db.warehouses[0]!.id);
  const [transfer, setTransfer] = useState(sp.get("transfer") === "1");
  const [adjust, setAdjust] = useState(false);
  const rows = stockRows();
  const w = idx().wh.get(sel)!;
  const mine = rows.filter((r) => r.warehouseId === sel);
  const counts = db.stockCounts.filter((c) => c.warehouseId === sel);
  const disc = insights().find((i) => i.kind === "discrepancy" && sel === "wh_LHE-DC");
  const openOrders = db.orders.filter((o) => o.warehouseId === sel && (o.status === "reserved" || o.status === "confirmed"));
  const incoming = db.pos.filter((p) => p.warehouseId === sel && (p.status === "approved" || p.status === "partially_received"));
  const ops = can(role, "warehouse.ops");
  const adjustOk = can(role, "stock.adjust");
  const transfers = db.transfers.filter((t) => t.fromId === sel || t.toId === sel);
  return (
    <>
      <PageHeader title="Warehouses" description="Receive, pick, count and transfer. The mobile screens use large targets and a barcode field." actions={<>
        {ops && <Button size="sm" variant="outline" onClick={() => setTransfer(true)}><ArrowLeftRight />Transfer</Button>}
        {adjustOk && <Button size="sm" variant="outline" onClick={() => setAdjust(true)}><SlidersHorizontal />Adjust stock</Button>}
      </>} />
      <TransferDialog key={`t${sel}${transfer}`} open={transfer} onOpenChange={setTransfer} wh={sel} />
      <AdjustDialog key={`a${sel}${adjust}`} open={adjust} onOpenChange={setAdjust} wh={sel} />
      <Page>
        <div className="grid gap-3 sm:grid-cols-3">
          {[{ href: `/warehouses/receive?wh=${sel}`, icon: PackageOpen, label: "Receive goods", sub: `${incoming.length} purchase orders expected` }, { href: `/warehouses/pick?wh=${sel}`, icon: Truck, label: "Pick and dispatch", sub: `${openOrders.length} orders to fulfil` }, { href: `/warehouses/count?wh=${sel}`, icon: ClipboardCheck, label: "Cycle count", sub: "Blind count with barcode scan" }].map((a) => (
            <Link key={a.label} href={a.href} className="flex items-center gap-3 rounded-lg border bg-card p-3.5 transition-colors hover:border-primary/40"><span className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary"><a.icon className="size-5" /></span><span><span className="block text-[13.5px] font-medium">{a.label}</span><span className="block text-xs text-muted-foreground">{a.sub}</span></span></Link>
          ))}
        </div>
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
            <dl className="space-y-2 text-[13px]">{[["Stock value", money(mine.reduce((s, r) => s + r.value, 0))], ["Units on hand", num(mine.reduce((s, r) => s + r.on, 0))], ["Reserved for open orders", num(mine.reduce((s, r) => s + r.reserved, 0))], ["Open orders to fulfil", String(openOrders.length)], ["Expected deliveries", String(incoming.length)], ["At-risk SKUs", String(mine.filter((r) => r.status === "critical" || r.status === "out").length)]].map(([k, v]) => <div key={k} className="flex justify-between"><dt className="text-muted-foreground">{k}</dt><dd className="tabular">{v}</dd></div>)}</dl>
          </Section>
          <Section title="Stock counts" description="Cycle and full counts with variance" className="lg:col-span-2" flush>
            <DataTable<StockCount> className="border-0" rows={counts} rowKey={(c) => c.id} pageSize={6} cols={[
              { id: "n", header: "Count", cell: (c) => <Mono>{c.number}</Mono> }, { id: "d", header: "Date", cell: (c) => dateShort(c.date), sort: (c) => c.date }, { id: "by", header: "Counted by", cell: (c) => c.counter, hide: "md" },
              { id: "v", header: "Variance", cell: (c) => { const v = c.lines.reduce((s, l) => s + (l.counted - l.expected) * (idx().prod.get(l.productId)?.cost ?? 0), 0); return <MoneyText v={v} className={v < 0 ? "text-danger" : v > 0 ? "text-success" : "text-muted-foreground"} />; }, align: "right", sort: (c) => c.lines.reduce((s, l) => s + (l.counted - l.expected) * (idx().prod.get(l.productId)?.cost ?? 0), 0) },
              { id: "s", header: "Status", cell: (c) => <StatusBadge status={c.status} /> },
            ]} />
          </Section>
        </div>
        {transfers.length > 0 && <Section title="Transfers" flush><ul className="divide-y text-[13px]">{transfers.slice(0, 8).map((t) => <li key={t.id} className="flex items-center justify-between px-4 py-2.5"><span><Mono>{t.number}</Mono> <span className="text-muted-foreground">{idx().prod.get(t.productId)?.name}</span></span><span className="tabular text-muted-foreground">{t.qty} · {idx().wh.get(t.fromId)!.code} → {idx().wh.get(t.toId)!.code}</span></li>)}</ul></Section>}
      </Page>
    </>
  );
}
export default function Route() { return <Suspense><Warehouses /></Suspense>; }
void ScanLine;
