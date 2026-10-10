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
import { getDB, idx } from "@/lib/data/queries";
import { docTotals, priceLine } from "@/lib/engines";
import { run } from "@/lib/engine/client";
import { money, money2 } from "@/lib/format";
import { useWorld } from "@/lib/store";

interface Row { productId: string; cartons: number; disc: number }
function NewQuoteInner() {
  useWorld((s) => s.version);
  const router = useRouter();
  const db = getDB();
  const [cid, setCid] = useState(db.customers[0]?.id ?? "");
  const [days, setDays] = useState("14");
  const [rows, setRows] = useState<Row[]>([]);
  const [pick, setPick] = useState(false);
  const c = idx().cus.get(cid)!;
  const priced = useMemo(() => rows.flatMap((r) => priceLine(idx().prod.get(r.productId)!, c, r.cartons, r.disc)), [rows, c]);
  const t = docTotals(priced, c);
  const set = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...p } : r)));
  return (
    <>
      <PageHeader back={{ href: "/sales/quotes", label: "Quotations" }} title="New quotation" description="Prices and taxes are calculated the same way as an order. Accepted quotations convert to a sales order in one click." />
      <Page>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Section title="Customer and validity"><div className="grid gap-3 sm:grid-cols-2"><Select value={cid} onValueChange={setCid}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent className="max-h-72">{db.customers.map((x) => <SelectItem key={x.id} value={x.id}>{x.name} · {x.city}</SelectItem>)}</SelectContent></Select><div className="flex items-center gap-2 text-[13px]"><span className="text-muted-foreground">Valid for</span><Input aria-label="Valid days" inputMode="numeric" className="h-8 w-16 tabular" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} /><span className="text-muted-foreground">days</span></div></div></Section>
            <Section title="Lines" flush actions={<Popover open={pick} onOpenChange={setPick}><PopoverTrigger asChild><Button size="sm" variant="outline"><Plus />Add product</Button></PopoverTrigger><PopoverContent align="end" className="w-[340px] p-0"><Command><CommandInput placeholder="Search product or SKU…" /><CommandList><CommandEmpty>No product found.</CommandEmpty>{db.products.filter((p) => !rows.some((r) => r.productId === p.id)).map((p) => <CommandItem key={p.id} value={`${p.name} ${p.sku}`} onSelect={() => { setRows((r) => [...r, { productId: p.id, cartons: 1, disc: 0 }]); setPick(false); }}><span className="flex-1 truncate">{p.name}</span><span className="text-xs text-muted-foreground tabular">{money(p.price)}</span></CommandItem>)}</CommandList></Command></PopoverContent></Popover>}>
              {rows.length === 0 ? <p className="px-4 py-10 text-center text-sm text-muted-foreground">Add products to quote.</p> : (
                <div className="overflow-x-auto"><table className="w-full text-[13px]"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-4 py-2 font-medium">Product</th><th className="px-2 py-2 font-medium">Cartons</th><th className="px-2 py-2 font-medium">Disc %</th><th className="px-4 py-2 text-right font-medium">Value</th><th className="w-8" /></tr></thead>
                  <tbody>{priced.map((l, k) => { const ri = rows.findIndex((r) => r.productId === l.productId); const p = idx().prod.get(l.productId)!; if (l.free) return <tr key={k} className="border-b bg-info/5 text-xs"><td className="px-4 py-1.5 text-info" colSpan={4}>+ Free goods: {l.trace[0]}</td><td /></tr>; return <tr key={k} className="border-b last:border-0"><td className="px-4 py-2">{p.name}<div className="text-[11px] text-muted-foreground">{money2(l.price)}/pc</div></td><td className="px-2"><Input aria-label={`Cartons ${p.name}`} type="number" min={1} className="h-8 w-20 tabular" value={rows[ri]!.cartons} onChange={(e) => set(ri, { cartons: Math.max(1, Math.round(+e.target.value || 1)) })} /></td><td className="px-2"><Input aria-label={`Discount ${p.name}`} type="number" min={0} max={5} step={0.5} className="h-8 w-16 tabular" value={rows[ri]!.disc} onChange={(e) => set(ri, { disc: Math.min(5, Math.max(0, +e.target.value || 0)) })} /></td><td className="px-4 text-right tabular font-medium">{money(l.value)}</td><td className="pr-3"><button aria-label="Remove" onClick={() => setRows((r) => r.filter((_, i) => i !== ri))} className="text-muted-foreground hover:text-danger"><Trash2 className="size-3.5" /></button></td></tr>; })}</tbody></table></div>
              )}
              <Totals rows={[{ label: "Value", value: t.gross - t.discount, muted: true }, { label: "Sales tax", value: t.tax, muted: true }, { label: "Total incl. tax", value: t.total, strong: true }]} />
            </Section>
          </div>
          <div><Button className="w-full" disabled={!rows.length} onClick={() => { const r = run("CreateQuote", { customerId: cid, validDays: +days || 14, lines: rows.map((x) => ({ productId: x.productId, cartons: x.cartons, discPct: x.disc })) }); if (r.ok) router.push("/sales/quotes"); }}>Save quotation</Button></div>
        </div>
      </Page>
    </>
  );
}

export default function NewQuote() {
  useWorld((s) => s.version);
  const db = getDB();
  const missing = [
    ...(db.customers.length ? [] : [{ text: "Add a customer", href: "/customers" }]),
    ...(db.products.length ? [] : [{ text: "Add a product", href: "/inventory" }]),
  ];
  return missing.length ? <Needs title="New quotation" missing={missing} /> : <NewQuoteInner />;
}
