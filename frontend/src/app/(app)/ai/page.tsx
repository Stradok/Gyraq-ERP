"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUp, Check, Loader2, Mic, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiChip } from "@/components/app/ai";
import { Md, ToolResultView } from "@/components/app/ai-results";
import { answerLocal } from "@/lib/ai/local";
import type { ToolResult, ToolUI } from "@/lib/ai/tools";
import { TOOLS } from "@/lib/ai/tools";
import { withBase } from "@/lib/config";
import { PERSONAS } from "@/lib/rbac";
import { useERP } from "@/lib/store";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface VMsg { id: string; role: "user" | "assistant"; text: string; steps: { name: string; done: boolean }[]; results: ToolResult[]; computed?: boolean; suggestions?: string[]; insufficient?: boolean }

const STARTERS: Record<string, string[]> = {
  default: ["Show overdue customers in Karachi with balances over 1 million", "What inventory is at risk?", "Why is profit down this month?", "Which sales reps are underperforming?", "What are our biggest expenses?", "Find customers overdue by more than 60 days and draft follow-up messages"],
};
const HISTORY = ["Collections review", "Replenishment plan", "Profit variance, September", "Supplier price check"];

function Chat() {
  const sp = useSearchParams();
  const role = useERP((s) => s.role);
  const persona = PERSONAS.find((p) => p.role === role)!;
  const [llm, setLlm] = useState<{ enabled: boolean; model: string; provider: string } | null>(null);
  const [msgs, setMsgs] = useState<VMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const topic = useRef<string | undefined>(undefined);
  const end = useRef<HTMLDivElement>(null);
  const sent = useRef(false);

  useEffect(() => { fetch(withBase("/api/ai/status")).then((r) => r.json()).then(setLlm).catch(() => setLlm({ enabled: false, model: "", provider: "" })); }, []);
  const chat = useChat({ transport: new DefaultChatTransport({ api: withBase("/api/chat"), body: { user: { name: persona.name, title: persona.title } } }) });
  const useLlm = !!llm?.enabled;

  const llmMsgs: VMsg[] = useMemo(() => chat.messages.map((m) => {
    const parts = m.parts as { type: string; text?: string; state?: string; output?: ToolResult }[];
    return { id: m.id, role: m.role as "user" | "assistant", text: parts.filter((p) => p.type === "text").map((p) => p.text).join(""), steps: parts.filter((p) => p.type.startsWith("tool-")).map((p) => ({ name: p.type.slice(5), done: p.state === "output-available" })), results: parts.filter((p) => p.type.startsWith("tool-") && p.output).map((p) => p.output as ToolResult) };
  }), [chat.messages]);

  const send = async (text: string) => {
    const q = text.trim(); if (!q || busy) return;
    setInput("");
    if (useLlm) { void chat.sendMessage({ text: q }); return; }
    const id = Date.now().toString();
    setMsgs((m) => [...m, { id: id + "u", role: "user", text: q, steps: [], results: [] }]);
    setBusy(true);
    const a = answerLocal(q, topic.current);
    topic.current = a.topic;
    const base: VMsg = { id: id + "a", role: "assistant", text: "", steps: a.steps.map((s) => ({ name: s.tool, done: false })), results: [], computed: true, suggestions: a.suggestions, insufficient: a.status === "insufficient_data" };
    setMsgs((m) => [...m, base]);
    for (let i = 0; i < a.steps.length; i++) { await new Promise((r) => setTimeout(r, 380)); setMsgs((m) => m.map((x) => (x.id === base.id ? { ...x, steps: x.steps.map((s, k) => (k <= i ? { ...s, done: true } : s)) } : x))); }
    await new Promise((r) => setTimeout(r, 250));
    setMsgs((m) => m.map((x) => (x.id === base.id ? { ...x, text: a.text, results: a.results } : x)));
    setBusy(false);
  };
  useEffect(() => { const q = sp.get("q"); if (q && !sent.current && llm) { sent.current = true; void send(q); } /* eslint-disable-next-line */ }, [llm]);
  const view = useLlm ? llmMsgs : msgs;
  const loading = useLlm ? chat.status === "submitted" || chat.status === "streaming" : busy;
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [view.length, loading]);
  const records = [...new Map(view.flatMap((m) => m.results.flatMap((r) => r.records ?? [])).map((r) => [r.href, r])).values()];
  const metrics = view.flatMap((m) => m.results.flatMap((r) => r.metrics ?? [])).slice(-6);
  const listen = () => { const R = (window as unknown as { SpeechRecognition?: new () => { lang: string; onresult: (e: { results: { 0: { 0: { transcript: string } } } }) => void; start: () => void }; webkitSpeechRecognition?: new () => { lang: string; onresult: (e: { results: { 0: { 0: { transcript: string } } } }) => void; start: () => void } }); const C = R.SpeechRecognition ?? R.webkitSpeechRecognition; if (!C) return; const r = new C(); r.lang = "en-PK"; r.onresult = (e) => setInput(e.results[0][0].transcript); r.start(); };

  return (
    <div className="grid h-[calc(100dvh-56px)] lg:grid-cols-[220px_1fr_300px]">
      <aside className="hidden flex-col border-r bg-subtle lg:flex">
        <div className="p-3"><Button variant="outline" size="sm" className="w-full" onClick={() => { setMsgs([]); chat.setMessages([]); topic.current = undefined; }}><Plus />New conversation</Button></div>
        <div className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">History</div>
        <ul className="px-2 text-[13px]">{HISTORY.map((h) => <li key={h}><button onClick={() => void send(h === "Collections review" ? "Show overdue customers" : h === "Replenishment plan" ? "What inventory is at risk?" : h.startsWith("Profit") ? "Why is profit down this month?" : "Any supplier price anomalies?")} className="w-full truncate rounded-md px-2.5 py-1.5 text-left text-muted-foreground hover:bg-accent hover:text-foreground">{h}</button></li>)}</ul>
      </aside>
      <section className="flex min-h-0 flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-5 md:px-8">
          {view.length === 0 && (
            <div className="mx-auto max-w-2xl pt-8">
              <h1 className="text-xl font-semibold tracking-tight">AI Command Center</h1>
              <p className="mt-1 text-[13px] text-muted-foreground">Ask about receivables, stock, margins, cash or suppliers. Answers use live ERP data through permissioned tools. Actions are proposals you confirm.</p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">{STARTERS.default.map((s) => <button key={s} onClick={() => void send(s)} className="rounded-lg border bg-card p-3 text-left text-[13px] hover:border-primary/40 hover:bg-accent/30">{s}</button>)}</div>
            </div>
          )}
          <div className="mx-auto max-w-3xl space-y-6">
            {view.map((m) => m.role === "user" ? (
              <div key={m.id} className="flex justify-end"><div className="max-w-[80%] rounded-lg bg-primary/10 px-3.5 py-2 text-[13.5px]">{m.text}</div></div>
            ) : (
              <div key={m.id} className="space-y-3">
                <div className="flex items-center gap-2"><AiChip label={m.computed ? "Computed" : "AI"} />{m.steps.length > 0 && <span className="text-[11px] text-muted-foreground">{m.steps.filter((s) => s.done).length}/{m.steps.length} checks</span>}</div>
                {m.steps.length > 0 && <ul className="space-y-1 text-xs text-muted-foreground">{m.steps.map((s, i) => <li key={i} className="flex items-center gap-2">{s.done ? <Check className="size-3 text-success" /> : <Loader2 className="size-3 animate-spin" />}<span className="font-mono">{s.name}</span><span className="hidden sm:inline">{(TOOLS as Record<string, { description: string }>)[s.name]?.description.split(".")[0]}</span></li>)}</ul>}
                {m.text && <Md text={m.text} />}
                {m.results.map((r, i) => <ToolResultView key={i} ui={r.ui as ToolUI} />)}
                {m.suggestions && <div className="flex flex-wrap gap-2">{m.suggestions.map((s) => <button key={s} onClick={() => void send(s)} className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:text-foreground">{s}</button>)}</div>}
                {m.insufficient && <p className="text-[11px] text-muted-foreground">No figures were produced because the data isn&apos;t there.</p>}
              </div>
            ))}
            {loading && view[view.length - 1]?.role === "user" && <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="ai-dot size-2 rounded-full bg-ai" />Thinking…</div>}
            <div ref={end} />
          </div>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className="border-t p-3 md:px-8">
          <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-lg border bg-card p-1.5 focus-within:border-primary/50">
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your business…" className="h-9 flex-1 bg-transparent px-2.5 text-[13.5px] outline-none placeholder:text-muted-foreground" />
            <Button type="button" variant="ghost" size="icon" onClick={listen} aria-label="Dictate"><Mic /></Button>
            <Button type="submit" size="icon" disabled={!input.trim() || loading} aria-label="Send"><ArrowUp /></Button>
          </div>
          <p className="mx-auto mt-1.5 max-w-3xl text-[11px] text-muted-foreground">{useLlm ? `Model: ${llm?.model} via ${llm?.provider}.` : "Computed mode: no AI key configured, answers are generated by deterministic analysis of ERP data."} The assistant can&apos;t change records; proposals need your confirmation.</p>
        </form>
      </section>
      <aside className="hidden overflow-y-auto border-l bg-subtle p-4 text-[13px] lg:block">
        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Context</div>
        <div className="space-y-4">
          <div><div className="mb-1 text-xs text-muted-foreground">Asking as</div>{persona.name}<div className="text-xs text-muted-foreground">{persona.title}</div></div>
          <div><div className="mb-1 text-xs text-muted-foreground">Metrics used</div>{metrics.length ? <ul className="space-y-1">{metrics.map((m, i) => <li key={i} className="flex justify-between gap-2"><span className="text-muted-foreground">{m.label}</span><span className="tabular">{m.value}</span></li>)}</ul> : <span className="text-xs text-muted-foreground">None yet</span>}</div>
          <div><div className="mb-1 text-xs text-muted-foreground">Relevant records</div>{records.length ? <ul className="space-y-1">{records.slice(0, 10).map((r) => <li key={r.href}><Link href={r.href} className="hover:text-primary hover:underline">{r.label}</Link> <span className="text-[11px] text-muted-foreground">{r.type}</span></li>)}</ul> : <span className="text-xs text-muted-foreground">None yet</span>}</div>
          <div className="rounded-md border p-2.5 text-xs text-muted-foreground">Tools are read-only except <span className="font-mono">propose_*</span>, which never execute. Every confirmed proposal is audited with its source.</div>
        </div>
      </aside>
    </div>
  );
}
export default function Route() { return <Suspense><Chat /></Suspense>; }
void cn;
