"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, FileUp, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AiChip } from "./ai";
import { ProblemBox } from "./forms";
import { getDB } from "@/lib/data/queries";
import { matchPO, matchProduct, matchSupplier, validateExtraction, type InvoiceExtractionT } from "@/lib/ai/extract";
import { withBase } from "@/lib/config";
import { run } from "@/lib/engine/client";
import type { Problem } from "@/lib/engine/core";
import { money, num } from "@/lib/format";
import { cn } from "@/lib/utils";

const STEPS = ["Reading the document", "Extracting fields", "Matching supplier, purchase order and products", "Validating arithmetic"];
const SAMPLES = [{ file: "sample-invoice-indus.png", label: "Indus Beverages invoice" }, { file: "sample-invoice-lucky.png", label: "Lucky Foods invoice" }];

async function toBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function ExtractionSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false), [step, setStep] = useState(0);
  const [x, setX] = useState<InvoiceExtractionT | null>(null);
  const [model, setModel] = useState(""), [error, setError] = useState(""), [prob, setProb] = useState<Problem | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const db = getDB();
  useEffect(() => { if (!open) { setBusy(false); setX(null); setError(""); setProb(null); setStep(0); } }, [open]);
  useEffect(() => { if (!busy || step >= STEPS.length - 1) return; const t = setTimeout(() => setStep((s) => s + 1), 6000); return () => clearTimeout(t); }, [busy, step]);

  const extract = async (blob: Blob) => {
    setBusy(true); setError(""); setX(null); setStep(0); setProb(null);
    try {
      const body = JSON.stringify({ mediaType: blob.type, data: await toBase64(blob) });
      let res = await fetch(withBase("/api/extract"), { method: "POST", headers: { "content-type": "application/json" }, body });
      if (res.status === 502) { await new Promise((r) => setTimeout(r, 4000)); res = await fetch(withBase("/api/extract"), { method: "POST", headers: { "content-type": "application/json" }, body }); } // free models are often busy; retry once
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "Extraction failed."); return; }
      setX(j.extraction); setModel(j.model);
      const m = matchSupplier(getDB(), j.extraction);
      setSupplierId(m?.supplier.id ?? "");
    } catch { setError("Couldn't reach the extraction service. Check your connection and try again."); }
    finally { setBusy(false); }
  };
  const useSample = async (file: string) => { const r = await fetch(withBase(`/samples/${file}`)); await extract(await r.blob()); };

  const sup = supplierId ? db.suppliers.find((s) => s.id === supplierId) ?? null : null;
  const po = sup && x ? matchPO(db, sup.id, x.poReference) : null;
  const lines = x ? x.lines.map((l) => ({ l, m: sup ? matchProduct(db, sup.id, l.description) : null })) : [];
  const checks = x ? validateExtraction(x) : [];
  const allOk = checks.every((c) => c.ok);
  const create = () => {
    if (!x || !sup) return;
    const r = run("CreateBill", { supplierId: sup.id, poId: po?.id ?? null, supplierInvoiceNo: x.invoiceNo, date: x.invoiceDate > db.today ? db.today : x.invoiceDate, source: "ai_extraction", lines: lines.map(({ l, m }) => ({ productId: m?.product.id, description: l.description, qty: m ? l.qty : l.qty, price: l.unitPrice })) }, { quiet: true });
    if (!r.ok) { setProb(r.error); return; }
    onOpenChange(false); router.push(`/purchasing/bills/${(r.value as { id: string }).id}`);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[640px]">
        <SheetHeader><div className="flex items-center gap-2"><AiChip label="Extraction" /><span className="text-xs text-muted-foreground">Vision model reads the document</span></div><SheetTitle>Extract supplier bill from a document</SheetTitle><SheetDescription>Upload a photo or PDF of a supplier invoice. The AI reads it, you check it, and the bill is matched to your records. Nothing posts until the match is clean or a person approves.</SheetDescription></SheetHeader>
        <div className="space-y-4 px-4 pb-6 text-[13px]">
          {!busy && !x && (
            <div className="space-y-3">
              <button onClick={() => input.current?.click()} className="flex h-28 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground hover:border-primary/50 hover:text-foreground"><FileUp className="size-6" />Choose an invoice (PNG, JPG, WebP or PDF, up to 4 MB)</button>
              <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" aria-label="Invoice file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void extract(f); e.target.value = ""; }} />
              <div className="text-xs text-muted-foreground">Or try a generated sample:</div>
              <div className="flex flex-wrap gap-2">{SAMPLES.map((s) => <Button key={s.file} size="sm" variant="outline" onClick={() => void useSample(s.file)}>{s.label}</Button>)}</div>
              {error && <p className="rounded-md border border-danger/40 bg-danger/5 p-2.5 text-xs text-danger">{error}</p>}
              <p className="text-[11px] text-muted-foreground">Free vision models can take 20–40 seconds. The file is sent to the AI service to be read and isn't stored.</p>
            </div>
          )}
          {busy && <ol className="space-y-2 py-4">{STEPS.map((t, i) => <li key={t} className="flex items-center gap-2">{i < step ? <Check className="size-4 text-success" /> : i === step ? <Loader2 className="size-4 animate-spin text-ai" /> : <span className="size-4 rounded-full border" />}<span className={cn(i > step && "text-muted-foreground")}>{t}</span></li>)}</ol>}
          {x && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><AiChip label="Extracted" />by {model}</div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2">{([["Supplier (read)", x.supplierName], ["NTN", x.supplierNtn ?? "not printed"], ["Invoice no.", x.invoiceNo], ["Date", x.invoiceDate], ["PO reference", x.poReference ?? "none printed"], ["Total", money(x.total)]] as const).map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd>{v}</dd></div>)}</dl>
              <div className="space-y-1.5"><div className="text-xs text-muted-foreground">Matched supplier {sup ? <span className="text-success">✓ by {matchSupplier(db, x)?.how ?? "your choice"}</span> : <span className="text-warning">not found, choose one</span>}</div>
                <Select value={supplierId} onValueChange={setSupplierId}><SelectTrigger><SelectValue placeholder="Choose supplier" /></SelectTrigger><SelectContent className="max-h-64">{db.suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
                {sup && <div className="text-xs text-muted-foreground">{po ? `Matched purchase order ${po.number}` : "No purchase order reference matched: this will be treated as a direct bill."}</div>}</div>
              <table className="w-full"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-1.5 font-medium">Line</th><th className="py-1.5 text-right font-medium">Qty</th><th className="py-1.5 text-right font-medium">Price</th><th className="py-1.5 pl-2 font-medium">Product</th></tr></thead>
                <tbody>{lines.map(({ l, m }, i) => <tr key={i} className="border-b last:border-0"><td className="py-1.5 pr-2">{l.description}</td><td className="py-1.5 text-right tabular">{num(l.qty)}</td><td className="py-1.5 text-right tabular">{l.unitPrice.toFixed(2)}</td><td className="py-1.5 pl-2 text-xs">{m ? <span className="text-success">{m.product.sku}</span> : <span className="text-warning">no match</span>}</td></tr>)}</tbody></table>
              <ul className="space-y-1 rounded-md border p-2.5 text-xs">{checks.map((c) => <li key={c.label} className={cn("flex gap-1.5", c.ok ? "text-success" : "text-danger")}>{c.ok ? <Check className="size-3.5 shrink-0" /> : <X className="size-3.5 shrink-0" />}{c.label}</li>)}</ul>
              <ProblemBox p={prob} />
              <div className="flex gap-2"><Button className="flex-1" disabled={!sup} onClick={create}>{allOk ? "Create bill and match" : "Create bill anyway (review needed)"}</Button><Button variant="ghost" onClick={() => setX(null)}>Start over</Button></div>
              <p className="text-[11px] text-muted-foreground">The bill goes through the same three-way match as a typed bill. Prices, quantities and duplicates are checked before anything posts.</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
