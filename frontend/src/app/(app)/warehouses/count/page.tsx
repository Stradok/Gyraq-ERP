"use client";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Page, PageHeader } from "@/components/app/page-header";
import { BarcodeField } from "@/components/app/barcode";
import { getDB, idx, stockRows } from "@/lib/data/queries";
import { run } from "@/lib/engine/client";
import { money, num } from "@/lib/format";
import { useERP, useWorld } from "@/lib/store";
import { PERSONAS } from "@/lib/rbac";
import { cn } from "@/lib/utils";

function Count() {
  const sp = useSearchParams();
  useWorld((s) => s.version);
  const db = getDB();
  const role = useERP((s) => s.role);
  const [wh, setWh] = useState(sp.get("wh") ?? db.warehouses[0]!.id);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ number: string; variance: number } | null>(null);
  // The sheet is the 8 highest-value stocked lines at this warehouse (a cycle count of A-class items).
  const sheet = useMemo(() => stockRows().filter((r) => r.warehouseId === wh && r.on > 0).sort((a, b) => b.value - a.value).slice(0, 8), [wh, db.stock.size, result]); // eslint-disable-line react-hooks/exhaustive-deps
  const scan = (code: string) => { const r = sheet.find((x) => x.product.barcode === code); if (!r) return false; setVals((v) => ({ ...v, [r.product.id]: String((+(v[r.product.id] ?? 0) || 0) + 1) })); return true; };
  const counter = PERSONAS.find((p) => p.role === role)!.name;
  const submit = () => {
    const lines = sheet.filter((r) => vals[r.product.id] !== undefined && vals[r.product.id] !== "").map((r, i) => ({ productId: r.product.id, counted: +vals[r.product.id]!, location: `${"ABCDE"[i % 5]}-${(i % 9) + 1}-0${(i % 4) + 1}` }));
    const r = run("PostCount", { warehouseId: wh, counter, lines });
    if (r.ok) { const v = r.value as { id: string; variance: number }; setResult({ number: db.stockCounts.find((c) => c.id === v.id)?.number ?? "", variance: v.variance }); setVals({}); }
  };
  return (
    <>
      <PageHeader back={{ href: "/warehouses", label: "Warehouses" }} title="Cycle count" description="Blind count: expected quantities stay hidden. Variances post to the ledger; large ones need Finance approval." actions={<Select value={wh} onValueChange={(v) => { setWh(v); setVals({}); setResult(null); }}><SelectTrigger size="sm" className="w-40"><SelectValue /></SelectTrigger><SelectContent>{db.warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.code}</SelectItem>)}</SelectContent></Select>} />
      <Page className="mx-auto max-w-2xl">
        {result && <div className="rounded-lg border border-success/40 bg-success/5 p-3.5 text-[13px]"><b>{result.number} submitted.</b> Net variance {money(result.variance)}.<button className="ml-3 text-xs text-primary hover:underline" onClick={() => setResult(null)}>Count again</button></div>}
        <BarcodeField onScan={scan} placeholder="Scan an item to add one unit to its count" />
        <div className="space-y-2.5">
          {sheet.map((r) => (
            <div key={r.product.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
              <div className="min-w-0 flex-1"><div className="truncate text-[13.5px] font-medium">{r.product.name}</div><div className="text-xs text-muted-foreground">Barcode {r.product.barcode}</div></div>
              <Input aria-label={`Counted ${r.product.name}`} inputMode="numeric" placeholder="Counted" className={cn("h-12 w-28 text-center text-lg tabular")} value={vals[r.product.id] ?? ""} onChange={(e) => setVals({ ...vals, [r.product.id]: e.target.value.replace(/\D/g, "") })} />
            </div>
          ))}
        </div>
        <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:mx-0 md:rounded-lg md:border"><span className="text-xs text-muted-foreground">{Object.values(vals).filter(Boolean).length} of {sheet.length} counted · {idx().wh.get(wh)!.code}</span><Button size="lg" disabled={!Object.values(vals).some(Boolean)} onClick={submit}><ClipboardCheck />Submit count</Button></div>
        <p className="text-center text-xs text-muted-foreground">Total units on this sheet are hidden until you submit ({num(sheet.length)} lines).</p>
      </Page>
    </>
  );
}
export default function Route() { return <Suspense><Count /></Suspense>; }
