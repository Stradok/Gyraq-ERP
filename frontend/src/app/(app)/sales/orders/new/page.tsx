"use client";
import { Needs } from "@/components/app/needs";
import { useWorld } from "@/lib/store";
import { useMe } from "@/lib/me";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Plus, Trash2, X } from "lucide-react";
import { run } from "@/lib/engine/client";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { StatusBadge, RiskBadge } from "@/components/app/status";
import { Totals } from "@/components/app/entity";
import { customerStats, getDB, idx } from "@/lib/data/queries";
import { creditCheck, docTotals, priceLine, type PricedLine } from "@/lib/engines";
import { money, money2 } from "@/lib/format";
import { useERP } from "@/lib/store";
import { PERSONAS } from "@/lib/rbac";
import { cn } from "@/lib/utils";

interface Row { productId: string; cartons: number; disc: number }

function NewOrderInner() {
  const router = useRouter();
  const role = useERP((s) => s.role);
  const db = getDB();
  const who = useMe();
  const me = db.employees.find((e) => e.name === who.empName);
  const custs = role === "rep" ? db.customers.filter((c) => c.repId === me?.id) : db.customers;
  const [cid, setCid] = useState(custs[0]?.id ?? "");
  const [rows, setRows] = useState<Row[]>([]);
  const [pick, setPick] = useState(false);
  const c = idx().cus.get(cid)!;
  const stats = useMemo(() => customerStats(cid), [cid]);

  const priced = useMemo(() => rows.flatMap((r) => priceLine(idx().prod.get(r.productId)!, c, r.cartons, r.disc)), [rows, c]);
  const totals = useMemo(() => docTotals(priced, c), [priced, c]);
  const check = useMemo(() => creditCheck(c, stats, totals.total), [c, stats, totals.total]);
  const stock = priced.filter((l) => !l.free).map((l) => { const cell = db.stock.get(`${l.productId}|${c.warehouseId}`); const free = cell ? cell.on - cell.res : 0; return { l, free, ok: free >= l.qty }; });
  const stockOk = stock.every((s) => s.ok);
  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const save = (mode: "confirm" | "draft") => {
    const r = run("CreateOrder", { customerId: cid, lines: rows.map((x) => ({ productId: x.productId, cartons: x.cartons, discPct: x.disc })), mode });
    if (r.ok) router.push(`/sales/orders/${(r.value as { id: string }).id}`);
  };

  const available = db.products.filter((p) => !rows.some((r) => r.productId === p.id));
  return (
    <>
      <PageHeader back={{ href: "/sales/orders", label: "Orders" }} title="New sales order" description="Pricing, tax, stock and credit are checked live. Confirming reserves stock." />
      <Page>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Section title="Customer">
              <div className="grid gap-3 sm:grid-cols-2">
                <Select value={cid} onValueChange={(v) => { setCid(v); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent className="max-h-72">{custs.map((x) => <SelectItem key={x.id} value={x.id}>{x.name} · {x.city}</SelectItem>)}</SelectContent></Select>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"><RiskBadge band={stats.band} score={stats.risk} /><span>Limit {money(c.creditLimit)}</span><span>Outstanding {money(stats.outstanding)}</span><span>Terms {c.termsDays}d</span></div>
              </div>
            </Section>
            <Section title="Lines" actions={
              <Popover open={pick} onOpenChange={setPick}>
                <PopoverTrigger asChild><Button size="sm" variant="outline"><Plus />Add product</Button></PopoverTrigger>
                <PopoverContent align="end" className="w-[360px] p-0">
                  <Command><CommandInput placeholder="Search product or SKU…" /><CommandList><CommandEmpty>No product found.</CommandEmpty>
                    {available.map((p) => <CommandItem key={p.id} value={`${p.name} ${p.sku}`} onSelect={() => { setRows((r) => [...r, { productId: p.id, cartons: 1, disc: 0 }]); setPick(false); }}><span className="flex-1 truncate">{p.name}</span><span className="text-xs text-muted-foreground tabular">{money(p.price)}/pc · {p.cartonSize}/ctn</span></CommandItem>)}
                  </CommandList></Command>
                </PopoverContent>
              </Popover>} flush>
              {rows.length === 0 ? <p className="px-4 py-10 text-center text-sm text-muted-foreground">Add products to start. Prices come from the customer&apos;s channel price list.</p> : (
                <div className="overflow-x-auto"><table className="w-full text-[13px]">
                  <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-4 py-2 font-medium">Product</th><th className="px-2 py-2 font-medium">Cartons</th><th className="px-2 py-2 text-right font-medium">Units</th><th className="px-2 py-2 text-right font-medium">Price</th><th className="px-2 py-2 font-medium">Disc %</th><th className="px-2 py-2 text-right font-medium">Stock</th><th className="px-4 py-2 text-right font-medium">Value</th><th className="w-8" /></tr></thead>
                  <tbody>{priced.map((l: PricedLine, k) => {
                    const ri = rows.findIndex((r) => r.productId === l.productId);
                    const p = idx().prod.get(l.productId)!;
                    const s = stock.find((x) => x.l === l);
                    if (l.free) return <tr key={k} className="border-b bg-info/5 text-xs"><td className="px-4 py-1.5 text-info" colSpan={2}>+ Free goods ({l.trace[0]})</td><td className="px-2 text-right tabular">{l.qty}</td><td colSpan={5} /></tr>;
                    return (
                      <tr key={k} className="border-b align-top">
                        <td className="px-4 py-2"><div>{p.name}</div><div className="text-[11px] text-muted-foreground">{l.trace[2]}</div></td>
                        <td className="px-2 py-2"><Input type="number" min={1} value={rows[ri]!.cartons} onChange={(e) => setRow(ri, { cartons: Math.max(1, Math.round(+e.target.value || 1)) })} className="h-7 w-20 tabular" /></td>
                        <td className="px-2 py-2 text-right tabular">{l.qty.toLocaleString("en-US")}</td>
                        <td className="px-2 py-2 text-right tabular">{money2(l.price)}</td>
                        <td className="px-2 py-2"><Input type="number" min={0} max={5} step={0.5} value={rows[ri]!.disc} onChange={(e) => setRow(ri, { disc: Math.min(5, Math.max(0, +e.target.value || 0)) })} className="h-7 w-16 tabular" /></td>
                        <td className={cn("px-2 py-2 text-right tabular", s && !s.ok && "text-danger")}>{s ? s.free.toLocaleString("en-US") : ""}</td>
                        <td className="px-4 py-2 text-right tabular font-medium">{money(l.value)}</td>
                        <td className="pr-3"><button aria-label="Remove" onClick={() => setRows((r) => r.filter((_, i) => i !== ri))} className="text-muted-foreground hover:text-danger"><Trash2 className="size-3.5" /></button></td>
                      </tr>
                    );
                  })}</tbody></table></div>
              )}
              <Totals rows={[{ label: "Gross sales", value: totals.gross, muted: true }, { label: "Discounts", value: -totals.discount, muted: true }, { label: "Sales tax", value: totals.tax, muted: true }, { label: "Further tax (unregistered)", value: totals.further, muted: true }, { label: "Advance tax 236H", value: totals.wht, muted: true }, { label: "Total", value: totals.total, strong: true }]} />
            </Section>
          </div>
          <div className="space-y-4">
            <Section title="On confirm" description="Checks run in this order">
              <ul className="space-y-3 text-[13px]">
                <Check_ ok={rows.length > 0} label="Pricing rules applied" detail={rows.length ? "Channel price list, schemes and discount limits" : "Add lines to price"} />
                <Check_ ok={rows.length > 0} label="Taxes calculated" detail={c.registered && c.atl ? "Registered buyer: standard rates" : "Unregistered / non-ATL: further tax 4% added"} />
                <Check_ ok={rows.length > 0 && stockOk} bad={rows.length > 0 && !stockOk} label="Stock available" detail={stockOk ? `Reserved at ${idx().wh.get(c.warehouseId)!.code}` : "Some lines exceed free stock; they would be partially reserved"} />
                <Check_ ok={check.decision === "pass"} warn={check.decision === "warn"} bad={check.decision === "block"} label={`Credit check: ${check.decision.toUpperCase()}`} detail={check.reasons.join(" · ")} />
              </ul>
              {check.decision === "block" && <div className="mt-3 rounded-md border border-danger/40 bg-danger/5 p-2.5 text-xs text-danger">Confirmation is blocked. You can save a draft and request a credit override from the Sales Manager.</div>}
            </Section>
            <div className="flex gap-2">
              <Button className="flex-1" disabled={!rows.length || check.decision === "block"} onClick={() => save("confirm")}>Confirm order</Button>
              <Button variant="outline" disabled={!rows.length} onClick={() => save("draft")}>{check.decision === "block" ? "Save draft" : "Save as draft"}</Button>
            </div>
          </div>
        </div>
      </Page>
    </>
  );
}

function Check_({ ok, warn, bad, label, detail }: { ok?: boolean; warn?: boolean; bad?: boolean; label: string; detail: string }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5">{bad ? <X className="size-4 text-danger" /> : warn ? <AlertTriangle className="size-4 text-warning" /> : ok ? <Check className="size-4 text-success" /> : <span className="block size-4 rounded-full border" />}</span>
      <span><span className="block font-medium">{label}</span><span className="block text-xs text-muted-foreground">{detail}</span></span>
    </li>
  );
}
void StatusBadge;

export default function NewOrder() {
  useWorld((s) => s.version);
  const db = getDB();
  const missing = [
    ...(db.customers.length ? [] : [{ text: "Add a customer", href: "/customers" }]),
    ...(db.products.length ? [] : [{ text: "Add a product", href: "/inventory" }]),
    ...(db.warehouses.length ? [] : [{ text: "Create a warehouse", href: "/setup" }]),
  ];
  return missing.length ? <Needs title="New sales order" missing={missing} /> : <NewOrderInner />;
}
