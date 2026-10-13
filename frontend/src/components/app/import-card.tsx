"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getDB } from "@/lib/data/queries";
import { run } from "@/lib/engine/client";
import { plan, TEMPLATES, type Kind } from "@/lib/import";

/** Load a spreadsheet saved as CSV. Rows are checked first; valid rows are entered one by one through the normal commands. */
export function ImportCard() {
  const [kind, setKind] = useState<Kind>("customers");
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ done: number; errors: { row: number; error: string }[] } | null>(null);
  const t = TEMPLATES[kind];
  const go = () => {
    const { good, bad } = plan(kind, text, getDB());
    const errors = [...bad];
    let done = 0;
    for (const g of good) { const r = run(g.type, g.payload as never, { quiet: true }); if (r.ok) done++; else errors.push({ row: g.row, error: `${r.error.title}. ${r.error.detail}` }); }
    errors.sort((a, b) => a.row - b.row); setResult({ done, errors });
    if (done) toast.success(`${done} row${done > 1 ? "s" : ""} imported`);
  };
  const download = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([`${t.columns}\n${t.example}\n`], { type: "text/csv" })); a.download = `${kind}-template.csv`; a.click(); URL.revokeObjectURL(a.href); };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="What to import" value={kind} onChange={(e) => { setKind(e.target.value as Kind); setResult(null); }} className="h-8 rounded-md border bg-background px-2 text-[13px]">{(Object.keys(TEMPLATES) as Kind[]).map((k) => <option key={k} value={k}>{TEMPLATES[k].title}</option>)}</select>
        <Button size="sm" variant="outline" onClick={download}>Download template</Button>
        <label className="text-xs text-muted-foreground">or choose a file <input aria-label="CSV file" type="file" accept=".csv,text/csv" className="ml-1 text-xs" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} /></label>
      </div>
      <p className="text-xs text-muted-foreground">Columns: <span className="font-mono">{t.columns}</span>. Save your spreadsheet as CSV (Excel: File, Save As, CSV). Import suppliers before products, customers before opening receivables.</p>
      <textarea aria-label="CSV text" value={text} onChange={(e) => setText(e.target.value)} placeholder={`${t.columns}\n${t.example}`} className="h-32 w-full rounded-md border bg-background p-2 font-mono text-xs" />
      <Button size="sm" disabled={!text.trim()} onClick={go}>Import</Button>
      {result && (
        <div className="rounded-md border p-3 text-[13px]">
          <div className="font-medium">{result.done} imported, {result.errors.length} not imported</div>
          {result.errors.length > 0 && <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">{result.errors.slice(0, 50).map((e) => <li key={e.row}>Row {e.row}: {e.error}</li>)}{result.errors.length > 50 && <li>…and {result.errors.length - 50} more</li>}</ul>}
        </div>
      )}
    </div>
  );
}
