"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { ProblemBox } from "@/components/app/forms";
import { Totals } from "@/components/app/entity";
import { getDB } from "@/lib/data/queries";
import { run } from "@/lib/engine/client";
import type { Problem } from "@/lib/engine/core";
import { money, money2 } from "@/lib/format";
import { useWorld } from "@/lib/store";

interface Row { productId: string; description: string; qty: string; price: string }

export default function NewBill() {
  useWorld((s) => s.version);
  const router = useRouter();
  const db = getDB();
  const [sid, setSid] = useState(db.suppliers.find((s) => s.kind === "goods")!.id);
  const [poId, setPoId] = useState("none");
  const [no, setNo] = useState(""), [date, setDate] = useState(db.today);
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<Problem | null>(null);
  const sup = db.suppliers.find((s) => s.id === sid)!;
  const pos = db.pos.filter((p) => p.supplierId === sid && ["approved", "partially_received", "received"].includes(p.status));
  const choosePO = (id: string) => {
    setPoId(id);
    const po = db.pos.find((p) => p.id === id);
    if (!po) { setRows([]); return; }
    const billed = (pid: string) => db.bills.filter((b) => b.poId === po.id && (b.status === "posted" || b.status === "paid")).reduce((s, b) => s + b.lines.filter((l) => l.productId === pid).reduce((a, l) => a + l.qty, 0), 0);
    setRows(po.lines.map((l) => { const rec = db.grns.filter((g) => g.poId === po.id).reduce((s, g) => s + g.lines.filter((x) => x.productId === l.productId).reduce((a, x) => a + x.qty, 0), 0); const q = Math.max(0, rec - billed(l.productId)); return { productId: l.productId, description: db.products.find((p) => p.id === l.productId)!.name, qty: String(q), price: String(l.price) }; }).filter((r) => +r.qty > 0));
  };
  const sub = useMemo(() => rows.reduce((s, r) => s + (+r.qty || 0) * (+r.price || 0), 0), [rows]);
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const submit = () => {
    const r = run("CreateBill", { supplierId: sid, poId: poId === "none" ? null : poId, supplierInvoiceNo: no, date, lines: rows.map((x) => ({ productId: x.productId || undefined, description: x.description, qty: +x.qty || 0, price: +x.price || 0 })) }, { quiet: true });
    if (!r.ok) { setErr(r.error); return; }
    setErr(null); router.push(`/purchasing/bills/${(r.value as { id: string }).id}`);
  };
  return (
    <>
      <PageHeader back={{ href: "/purchasing/bills", label: "Supplier bills" }} title="Enter supplier bill" description="The bill is matched against the purchase order and goods receipt. Clean bills post straight away; exceptions wait for approval." />
      <Page>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Section title="Invoice">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><div className="text-xs text-muted-foreground">Supplier</div><Select value={sid} onValueChange={(v) => { setSid(v); setPoId("none"); setRows([]); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{db.suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><div className="text-xs text-muted-foreground">Purchase order</div><Select value={poId} onValueChange={choosePO}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No PO (service or direct bill)</SelectItem>{pos.map((p) => <SelectItem key={p.id} value={p.id}>{p.number} · {money(p.total)}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><label htmlFor="bno" className="text-xs text-muted-foreground">Supplier's invoice number</label><Input id="bno" value={no} onChange={(e) => setNo(e.target.value)} placeholder="e.g. IB-48250" /></div>
                <div className="space-y-1.5"><label htmlFor="bdt" className="text-xs text-muted-foreground">Invoice date</label><Input id="bdt" type="date" value={date} max={db.today} onChange={(e) => setDate(e.target.value)} /></div>
              </div>
            </Section>
            <Section title="Lines" flush description={poId !== "none" ? "Pre-filled with received, not-yet-billed quantities at PO prices. Edit to what the invoice says." : "Type what the invoice charges."}>
              <div className="overflow-x-auto"><table className="w-full text-[13px]"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-4 py-2 font-medium">Description</th><th className="px-2 py-2 font-medium">Qty</th><th className="px-2 py-2 font-medium">Unit price</th><th className="px-4 py-2 text-right font-medium">Amount</th></tr></thead>
                <tbody>{rows.map((r, i) => <tr key={i} className="border-b last:border-0"><td className="px-4 py-2">{r.description}</td><td className="px-2"><Input aria-label={`Quantity ${r.description}`} inputMode="numeric" className="h-8 w-24 tabular" value={r.qty} onChange={(e) => set(i, { qty: e.target.value.replace(/\D/g, "") })} /></td><td className="px-2"><Input aria-label={`Price ${r.description}`} inputMode="decimal" className="h-8 w-28 tabular" value={r.price} onChange={(e) => set(i, { price: e.target.value.replace(/[^\d.]/g, "") })} /></td><td className="px-4 text-right tabular">{money2((+r.qty || 0) * (+r.price || 0))}</td></tr>)}
                  {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-3">{poId === "none" && sup.kind === "services" ? <Button size="sm" variant="outline" onClick={() => setRows([{ productId: "", description: `${sup.name} services`, qty: "1", price: "" }])}>Add a service line</Button> : <span className="text-muted-foreground">{poId === "none" ? "Choose a purchase order to load its lines, or pick a service vendor." : "Everything on this order has already been billed."}</span>}</td></tr>}</tbody></table></div>
              <Totals rows={[{ label: "Value excl. tax", value: sub, muted: true }, { label: "Tax is calculated from the product's tax category", value: 0 }]} />
            </Section>
          </div>
          <div className="space-y-4">
            <Section title="Checks on save"><ul className="space-y-1.5 text-[13px] text-muted-foreground"><li>· Same or near-identical invoice number from this supplier</li><li>· Quantity billed vs received and not yet billed</li><li>· Price vs the PO and the 90-day median</li><li>· Tax recalculated from the product</li></ul></Section>
            <ProblemBox p={err} />
            <Button className="w-full" disabled={!rows.length || !no.trim()} onClick={submit}>Save and match</Button>
          </div>
        </div>
      </Page>
    </>
  );
}
