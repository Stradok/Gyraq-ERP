"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AiChip } from "./ai";
import { InvoiceDoc } from "./doc-preview";
import { getDB, idx } from "@/lib/data/queries";
import { dateShort, money } from "@/lib/format";
import { cn } from "@/lib/utils";

const STEPS = ["Reading document", "Identifying supplier by NTN", "Matching purchase order and receipt", "Validating arithmetic and tax", "Proposing accounting"];

export function ExtractionSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const db = getDB();
  const router = useRouter();
  const samples = [
    { id: "var", label: "Indus Beverages · price variance", bill: db.bills.find((b) => b.id === db.scenario.indusBillId)! },
    { id: "dup", label: "Lucky Foods · possible duplicate", bill: db.bills.find((b) => b.id === db.scenario.dupBillId)! },
    { id: "ok", label: "Clean invoice · auto-matches", bill: db.bills.find((b) => b.poId && b.exceptions.length === 0 && b.source === "manual" && b.status === "posted")! },
  ];
  const [sel, setSel] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  useEffect(() => { if (!open) { setSel(null); setStep(0); } }, [open]);
  useEffect(() => {
    if (!sel || step >= STEPS.length) return;
    const t = setTimeout(() => setStep((s) => s + 1), 450);
    return () => clearTimeout(t);
  }, [sel, step]);
  const s = samples.find((x) => x.id === sel);
  const done = step >= STEPS.length;
  const b = s?.bill;
  const sup = b ? idx().sup.get(b.supplierId) : null;
  const po = b?.poId ? db.pos.find((p) => p.id === b.poId) : null;
  const sumLines = b ? b.lines.reduce((a, l) => a + l.total, 0) : 0;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[820px]">
        <SheetHeader><div className="flex items-center gap-2"><AiChip label="Extraction" /><span className="text-xs text-muted-foreground">Sample documents</span></div><SheetTitle>Extract supplier bill from document</SheetTitle><SheetDescription>The AI reads the document, matches it to your records and proposes coding. A person reviews and approves; nothing posts automatically.</SheetDescription></SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          {!sel && <div className="grid gap-2">{samples.map((x) => <button key={x.id} onClick={() => { setSel(x.id); setStep(0); }} className="flex items-center justify-between rounded-lg border p-3 text-left text-[13px] hover:border-primary/50 hover:bg-accent/30"><span><span className="font-medium">{x.label}</span><span className="block text-xs text-muted-foreground">{x.bill.supplierInvoiceNo} · {money(x.bill.total)}</span></span><span className="text-xs text-primary">Extract →</span></button>)}<p className="text-[11px] text-muted-foreground">Demo shows a precomputed extraction of generated sample invoices. In the live product, uploads are read by a vision model through the same review screen.</p></div>}
          {sel && b && sup && (
            <>
              <ol className="space-y-1.5 text-[13px]">{STEPS.map((t, i) => <li key={t} className="flex items-center gap-2">{i < step ? <Check className="size-4 text-success" /> : i === step ? <Loader2 className="size-4 animate-spin text-ai" /> : <span className="size-4 rounded-full border" />}<span className={cn(i > step && "text-muted-foreground")}>{t}</span></li>)}</ol>
              {done && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div><div className="mb-1 text-xs text-muted-foreground">Document</div><InvoiceDoc bill={b} highlight={["invoiceNo", "total", ...b.exceptions.filter((e) => e.type === "PRICE_VARIANCE").map((_, i) => `price${i}`)]} /></div>
                  <div className="space-y-3 text-[13px]">
                    <div className="text-xs text-muted-foreground">Extracted fields</div>
                    <dl className="space-y-1.5">{([["Supplier", sup.name, "99%"], ["NTN", sup.ntn, "99%"], ["Invoice no.", b.supplierInvoiceNo, b.exceptions.some((e) => e.type === "DUPLICATE_BILL") ? "81%" : "98%"], ["Date", dateShort(b.date), "97%"], ["Subtotal", money(b.subtotal), "99%"], ["Sales tax", money(b.tax), "96%"], ["Total", money(b.total), "99%"], ["PO reference", po?.number ?? "None found", po ? "94%" : "—"]] as const).map(([k, v, c]) => <div key={k} className="flex items-center justify-between gap-3 border-b pb-1.5 last:border-0"><dt className="text-muted-foreground">{k}</dt><dd className="flex items-center gap-2"><span className="tabular">{v}</span><span className={cn("text-[10px]", parseInt(c) < 90 ? "text-warning" : "text-muted-foreground")}>{c}</span></dd></div>)}</dl>
                    <div className="rounded-md border p-2.5 text-xs"><div className="mb-1 font-medium">Validation</div><ul className="space-y-1"><li className="flex gap-1.5"><Check className="size-3.5 text-success" />Lines sum to subtotal ({money(sumLines)})</li><li className="flex gap-1.5"><Check className="size-3.5 text-success" />Subtotal + taxes = total</li>{b.exceptions.map((e, i) => <li key={i} className="flex gap-1.5 text-danger"><span>!</span>{e.type.replace(/_/g, " ").toLowerCase()}: {e.note}</li>)}{b.exceptions.length === 0 && <li className="flex gap-1.5"><Check className="size-3.5 text-success" />Matches PO and receipt; no exceptions</li>}</ul></div>
                    <Button className="w-full" onClick={() => { onOpenChange(false); router.push(`/purchasing/bills/${b.id}`); }}>Open draft bill for review</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
