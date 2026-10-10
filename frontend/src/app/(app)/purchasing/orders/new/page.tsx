"use client";
import { Needs } from "@/components/app/needs";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { Totals } from "@/components/app/entity";
import { getDB } from "@/lib/data/queries";
import { run } from "@/lib/engine/client";
import { money, money2, num } from "@/lib/format";
import { useWorld } from "@/lib/store";

interface Row { productId: string; cartons: string; price: string }

function NewPOInner() {
  useWorld((s) => s.version);
  const router = useRouter();
  const db = getDB();
  const goods = db.suppliers.filter((s) => s.kind === "goods");
  const [sid, setSid] = useState(goods[0]?.id ?? ""), [wid, setWid] = useState(db.warehouses[0]?.id ?? "");
  const [rows, setRows] = useState<Row[]>([]);
  const [pick, setPick] = useState(false);
  const sup = goods.find((s) => s.id === sid)!;
  const products = useMemo(() => db.products.filter((p) => p.supplierId === sid && !rows.some((r) => r.productId === p.id)), [db, sid, rows]);
  const lines = rows.map((r) => { const p = db.products.find((x) => x.id === r.productId)!; const c = db.stock.get(`${p.id}|${wid}`); return { r, p, units: (+r.cartons || 0) * p.cartonSize, price: +r.price || 0, cost: c && c.on ? c.val / c.on : p.cost }; });
  const sub = lines.reduce((s, l) => s + l.units * l.price, 0), total = sub * 1.17;
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <>
      <PageHeader back={{ href: "/purchasing/orders", label: "Purchase orders" }} title="New purchase order" description="Orders above Rs 1,000,000 need Owner approval. Approved orders show as incoming stock and in the cash forecast." />
      <Page>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Section title="Supplier and delivery">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><div className="text-xs text-muted-foreground">Supplier</div><Select value={sid} onValueChange={(v) => { setSid(v); setRows([]); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{goods.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><div className="text-xs text-muted-foreground">Deliver to</div><Select value={wid} onValueChange={setWid}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{db.warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Lead time {sup.leadTimeDays} days · terms {sup.termsDays} days · expected around {new Date(Date.parse(db.today) + sup.leadTimeDays * 86400000).toISOString().slice(0, 10)}</p>
            </Section>
            <Section title="Lines" flush actions={<Popover open={pick} onOpenChange={setPick}><PopoverTrigger asChild><Button size="sm" variant="outline"><Plus />Add product</Button></PopoverTrigger><PopoverContent align="end" className="w-[340px] p-0"><Command><CommandInput placeholder="Search this supplier's products…" /><CommandList><CommandEmpty>No more products.</CommandEmpty>{products.map((p) => <CommandItem key={p.id} value={`${p.name} ${p.sku}`} onSelect={() => { setRows((r) => [...r, { productId: p.id, cartons: "10", price: String(p.cost) }]); setPick(false); }}><span className="flex-1 truncate">{p.name}</span><span className="text-xs text-muted-foreground tabular">cost {money2(p.cost)}</span></CommandItem>)}</CommandList></Command></PopoverContent></Popover>}>
              {lines.length === 0 ? <p className="px-4 py-10 text-center text-sm text-muted-foreground">Add the products to order from {sup.name}.</p> : (
                <div className="overflow-x-auto"><table className="w-full text-[13px]"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-4 py-2 font-medium">Product</th><th className="px-2 py-2 font-medium">Cartons</th><th className="px-2 py-2 text-right font-medium">Units</th><th className="px-2 py-2 font-medium">Unit price</th><th className="px-4 py-2 text-right font-medium">Value</th><th className="w-8" /></tr></thead>
                  <tbody>{lines.map((l, i) => <tr key={l.p.id} className="border-b last:border-0"><td className="px-4 py-2">{l.p.name}<div className="text-[11px] text-muted-foreground">{l.p.cartonSize} per carton · avg cost {money2(l.cost)}</div></td><td className="px-2"><Input aria-label={`Cartons ${l.p.name}`} inputMode="numeric" className="h-8 w-20 tabular" value={l.r.cartons} onChange={(e) => set(i, { cartons: e.target.value.replace(/\D/g, "") })} /></td><td className="px-2 text-right tabular">{num(l.units)}</td><td className="px-2"><Input aria-label={`Price ${l.p.name}`} inputMode="decimal" className="h-8 w-24 tabular" value={l.r.price} onChange={(e) => set(i, { price: e.target.value.replace(/[^\d.]/g, "") })} /></td><td className="px-4 text-right tabular font-medium">{money(l.units * l.price)}</td><td className="pr-3"><button aria-label="Remove" onClick={() => setRows((r) => r.filter((_, k) => k !== i))} className="text-muted-foreground hover:text-danger"><Trash2 className="size-3.5" /></button></td></tr>)}</tbody></table></div>
              )}
              <Totals rows={[{ label: "Subtotal", value: sub, muted: true }, { label: "Sales tax and advance tax (est. 17%)", value: total - sub, muted: true }, { label: "PO total", value: total, strong: true }]} />
            </Section>
          </div>
          <div className="space-y-4">
            <Section title="Approval">
              <p className="text-[13px] text-muted-foreground">{total > db.settings.poOwnerLimit ? <>This order is above {money(db.settings.poOwnerLimit)} so the <b className="text-foreground">Owner</b> will be asked to approve it.</> : <>Within the procurement limit. If you are a Procurement Manager or the Owner it approves immediately.</>}</p>
            </Section>
            <Button className="w-full" disabled={!rows.length} onClick={() => { const r = run("CreatePO", { supplierId: sid, warehouseId: wid, lines: lines.map((l) => ({ productId: l.p.id, cartons: +l.r.cartons || 0, price: l.price })) }); if (r.ok) router.push(`/purchasing/orders/${(r.value as { id: string }).id}`); }}>Create purchase order</Button>
          </div>
        </div>
      </Page>
    </>
  );
}

export default function NewPO() {
  useWorld((s) => s.version);
  const db = getDB();
  const missing = [
    ...(db.suppliers.some((s) => s.kind === "goods") ? [] : [{ text: "Add a supplier", href: "/suppliers" }]),
    ...(db.products.length ? [] : [{ text: "Add a product", href: "/inventory" }]),
    ...(db.warehouses.length ? [] : [{ text: "Create a warehouse", href: "/setup" }]),
  ];
  return missing.length ? <Needs title="New purchase order" missing={missing} /> : <NewPOInner />;
}
