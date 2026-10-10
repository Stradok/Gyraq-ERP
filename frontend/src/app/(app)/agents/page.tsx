"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Bot, Check, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { AiChip, InsightCard } from "@/components/app/ai";
import { ToolResultView } from "@/components/app/ai-results";
import { BookSlot } from "@/components/app/book-slot";
import { AGENTS, type AgentDef } from "@/lib/agents";
import { runTool, type ToolResult } from "@/lib/ai/tools";
import { createPOFromRecommendation } from "@/lib/actions";
import { withBase } from "@/lib/config";
import { insights, recommendations } from "@/lib/data/queries";
import { dateShort, num } from "@/lib/format";
import { useERP, useWorld } from "@/lib/store";
import { cn } from "@/lib/utils";

interface Status { enabled: boolean; edition?: string; tiers?: Record<string, { provider: string; model: string } | null> }
const KEYS: Record<string, string> = { reasoning: "chat and agents", fast: "quick tasks", vision: "documents", agent: "autonomous agents" };

type Out = { id: string; results?: ToolResult[]; recs?: ReturnType<typeof recommendations>; found?: ReturnType<typeof insights> };

export default function AgentCenter() {
  useWorld((s) => s.version);
  const role = useERP((s) => s.role), on = useERP((s) => s.agentOn), runs = useERP((s) => s.agentRuns), setOn = useERP((s) => s.setAgentOn), record = useERP((s) => s.recordAgentRun);
  const [st, setSt] = useState<Status | null>(null), [out, setOut] = useState<Out | null>(null);
  useEffect(() => { fetch(withBase("/api/ai/status")).then((r) => r.json()).then(setSt).catch(() => setSt({ enabled: false })); }, []);

  const run = (a: AgentDef) => {
    if (a.id === "collections") {
      const found = runTool("search_customers", { overdueOnly: true, minDaysOverdue: 30, limit: 3 }, role);
      const rows = found.ui.kind === "customers" ? found.ui.rows : [];
      const drafts = rows.map((c) => runTool("draft_collection_message", { customerName: c.name, channel: "WhatsApp" }, role));
      setOut({ id: a.id, results: [found, ...drafts] }); record(a.id, rows.length ? `${rows.length} customers, ${rows.length} drafts ready` : "Nobody is 30+ days overdue");
    } else if (a.id === "replenishment") {
      const recs = recommendations().slice(0, 5); setOut({ id: a.id, recs }); record(a.id, recs.length ? `${recs.length} products at risk` : "No stock-outs expected");
    } else if (a.id === "watcher") {
      const found = insights().slice(0, 6); setOut({ id: a.id, found }); record(a.id, found.length ? `${found.length} findings` : "Nothing to report");
    }
    toast.success(`${a.name} ran`);
  };

  const info = (a: AgentDef) => {
    if (a.status === "planned") return { label: "Not built yet", tone: "text-muted-foreground" };
    if (a.needsAi && !st?.enabled) return { label: "Needs an AI key", tone: "text-warning" };
    return { label: st?.enabled && (a.id === "assistant" || a.id === "bill_reader") ? "Live · AI" : "Live", tone: "text-success" };
  };

  return (
    <>
      <PageHeader title="Agent Center" description="The agents that work for you: what each does, whether it is running, what it found, and what it needs to switch on. Agents propose; you approve." />
      <Page>
        <Section title="AI engine" description={st?.edition ? `Edition: ${st.edition}` : undefined} actions={<Button size="sm" variant="outline" asChild><Link href="/settings/ai">AI settings</Link></Button>}>
          {!st ? <p className="text-sm text-muted-foreground">Checking…</p> : st.enabled ? (
            <ul className="grid gap-2 text-[13px] sm:grid-cols-2">{Object.entries(st.tiers ?? {}).map(([k, v]) => <li key={k} className="flex justify-between gap-3 rounded-md border px-3 py-2"><span className="text-muted-foreground">{KEYS[k] ?? k}</span><span className="text-right">{v ? `${v.provider} · ${v.model}` : "not configured"}</span></li>)}</ul>
          ) : (
            <div className="space-y-2 text-[13px]"><p>No AI key is configured, so agents run in <b className="font-medium">computed mode</b>: the same checks on your ledger, written from templates.</p>
              <p className="text-muted-foreground">To switch on AI: add <code className="font-mono">OPENROUTER_API_KEY</code> (free models), or <code className="font-mono">GOOGLE_GENERATIVE_AI_API_KEY</code> (Standard), or <code className="font-mono">ANTHROPIC_API_KEY</code> with <code className="font-mono">AI_EDITION=premium</code>, to the server&apos;s <code className="font-mono">.env</code> and restart. Nothing else changes.</p></div>
          )}
        </Section>

        <div className="grid gap-3 lg:grid-cols-2">
          {AGENTS.map((a) => {
            const s = info(a), enabled = on[a.id] ?? a.status === "live", last = runs[a.id];
            return (
              <div key={a.id} className="rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2"><Bot className="size-4 text-muted-foreground" /><h3 className="text-sm font-medium">{a.name}</h3>{a.status === "live" && <AiChip label={a.tier} />}{a.status === "planned" && <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{a.tier}</span>}</div>
                  <span className={cn("text-xs", s.tone)}>{s.label}</span>
                </div>
                <p className="mt-2 text-[13px] text-muted-foreground">{a.does}</p>
                {a.tools && <p className="mt-1 text-xs text-muted-foreground">{a.tools}</p>}
                {a.status === "live" && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {a.runnable && <Button size="sm" onClick={() => run(a)} disabled={!enabled}><Play />Run now</Button>}
                    {a.runnable && <label className="flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" checked={enabled} onChange={(e) => setOn(a.id, e.target.checked)} />Enabled</label>}
                    {last && <span className="ml-auto text-xs text-muted-foreground">Last run {dateShort(last.at.slice(0, 10))} · {last.summary}</span>}
                  </div>
                )}
                {a.status === "planned" && <BookSlot what={a.name} className="mt-3" />}
              </div>
            );
          })}
        </div>

        {out && (
          <Section title={`Result: ${AGENTS.find((a) => a.id === out.id)!.name}`} actions={<Button size="sm" variant="ghost" onClick={() => setOut(null)}>Clear</Button>}>
            <div className="space-y-3">
              {out.results?.map((r, i) => <ToolResultView key={i} ui={r.ui} />)}
              {out.recs && (out.recs.length === 0 ? <p className="text-sm text-muted-foreground">No stock-outs are expected before supplier lead times.</p> : out.recs.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3.5 py-2.5 text-[13px]">
                  <div className="min-w-0 flex-1"><Link href={`/inventory/${r.product.id}`} className="font-medium hover:text-primary">{r.product.name}</Link><div className="text-xs text-muted-foreground">{num(r.available)} available · stockout in ~{r.stockoutDays} days · lead time {r.leadTime} days</div></div>
                  <Button size="sm" onClick={() => { const x = createPOFromRecommendation(r, r.recommendedQty, "user"); if (x.ok) toast.success("Purchase order created for approval"); }}><Check />Create PO for {num(r.recommendedQty)}</Button>
                </div>
              )))}
              {out.found && (out.found.length === 0 ? <p className="text-sm text-muted-foreground">Nothing to report.</p> : out.found.map((i) => <InsightCard key={i.id} insight={i} />))}
            </div>
          </Section>
        )}
      </Page>
    </>
  );
}
