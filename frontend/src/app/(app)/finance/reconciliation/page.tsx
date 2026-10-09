"use client";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { AiChip } from "@/components/app/ai";
import { Kpi } from "@/components/app/kpi";
import { StatusBadge } from "@/components/app/status";
import { getDB } from "@/lib/data/queries";
import { dateShort, money } from "@/lib/format";
import { useWorld } from "@/lib/store";
import { run } from "@/lib/engine/client";
import { cn } from "@/lib/utils";

export default function Reconciliation() {
  const db = getDB();
  useWorld((s) => s.version);
  const st = (id: string, base: string): string => base;
  const rows = db.bank;
  const unmatched = rows.filter((r) => st(r.id, r.status) !== "matched").length;
  const act = (id: string, v: "matched" | "rejected") => { run("ConfirmBankMatch", { txnId: id, accept: v === "matched" }); };
  return (
    <>
      <PageHeader module="finance" title="Finance" description="MCB collection account · last 40 days. Exact matches are automatic; scored and AI-assisted suggestions need your confirmation." />
      <Page>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Kpi label="Bank lines" value={rows.length} /><Kpi label="Matched" value={rows.length - unmatched} tone="success" /><Kpi label="Suggested" value={rows.filter((r) => st(r.id, r.status) === "suggested").length} /><Kpi label="Unmatched" value={rows.filter((r) => st(r.id, r.status) === "unmatched").length} tone="warning" /></div>
        <Section flush title="Bank statement" description="Compared against invoices, receipts, expenses and transfers">
          <ul className="divide-y">{rows.map((r) => { const s = st(r.id, r.status); return (
            <li key={r.id} className="grid items-center gap-3 px-4 py-2.5 text-[13px] md:grid-cols-[70px_1fr_130px_1.2fr_150px]">
              <span className="text-xs text-muted-foreground">{dateShort(r.date)}</span><span className="truncate font-mono text-xs">{r.description}</span>
              <span className={cn("tabular md:text-right", r.amount < 0 ? "text-danger" : "")}>{money(r.amount)}</span>
              <div className="min-w-0">{r.suggestion && s === "suggested" ? <div className="flex items-center gap-2"><AiChip label={r.suggestion.method === "ai" ? "AI-assisted" : r.suggestion.method} /><span className="truncate">{r.suggestion.label}</span><span className="text-xs text-muted-foreground">{(r.suggestion.confidence * 100).toFixed(0)}%</span></div> : s === "matched" ? <span className="text-xs text-muted-foreground">Matched to a recorded {r.amount > 0 ? "receipt" : "payment"}</span> : <span className="text-xs text-muted-foreground">No match found: investigate or record</span>}</div>
              <div className="flex items-center gap-1.5 md:justify-end">{s === "matched" ? <StatusBadge status="matched" /> : s === "suggested" && r.suggestion ? <><Button size="sm" onClick={() => act(r.id, "matched")}><Check />Confirm</Button><Button size="icon-sm" variant="ghost" aria-label="Reject" onClick={() => act(r.id, "rejected")}><X /></Button></> : <StatusBadge status="unmatched" />}</div>
            </li>); })}</ul>
        </Section>
      </Page>
    </>
  );
}
