"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowUp, Check, Loader2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiChip } from "./ai";
import { BookSlot } from "./book-slot";
import { Md, ToolResultView } from "./ai-results";
import { checkFigures } from "@/lib/ai/grounding";
import { useAssistant } from "@/lib/ai/use-assistant";
import { PERSONAS } from "@/lib/rbac";
import { useERP } from "@/lib/store";
import { cn } from "@/lib/utils";

const IDEAS = ["Show revenue from 1 Sep to 30 Sep by category", "Open overdue invoices", "Which customers are risky?", "Record a payment of 200,000 from Metro Mart by bank transfer"];

export function AssistantDock() {
  const role = useERP((s) => s.role);
  const p = PERSONAS.find((x) => x.role === role)!;
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const { llm, view, loading, send, reset, useLlm, error } = useAssistant({ name: p.name, title: p.title });
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [view.length, loading, open]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "/") { e.preventDefault(); setOpen((o) => !o); } };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, []);
  if (pathname.startsWith("/ai")) return null;
  const submit = (t: string) => { setInput(""); void send(t); };
  return (
    <>
      {!open && <button onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border bg-card px-4 py-2.5 text-[13px] font-medium shadow-lg transition-colors hover:border-primary/50"><span className="size-2 rounded-full bg-ai" />Assistant<kbd className="hidden rounded border px-1 font-mono text-[10px] text-muted-foreground sm:block">⌘/</kbd></button>}
      {open && (
        <div className="fixed inset-x-3 bottom-3 z-40 flex h-[min(640px,calc(100dvh-90px))] flex-col overflow-hidden rounded-xl border bg-popover shadow-2xl sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[430px]">
          <div className="flex items-center gap-2 border-b px-3.5 py-2.5"><span className="size-2 rounded-full bg-ai" /><span className="text-sm font-medium">Assistant</span><AiChip label={useLlm ? "AI" : "Computed"} /><span className="ml-auto flex gap-1"><Button variant="ghost" size="icon-sm" aria-label="New chat" onClick={reset}><RotateCcw /></Button><Button variant="ghost" size="icon-sm" aria-label="Close" onClick={() => setOpen(false)}><X /></Button></span></div>
          <div className="flex-1 space-y-4 overflow-y-auto px-3.5 py-3">
            {view.length === 0 && (
              <div className="space-y-3 pt-2 text-[13px]">
                <p className="text-muted-foreground">I can read your data, open pages and filters for you, and prepare actions. Anything that changes records is shown as a card you confirm first.</p>
                <div className="space-y-1.5">{IDEAS.map((i) => <button key={i} onClick={() => submit(i)} className="block w-full rounded-md border px-3 py-2 text-left text-xs hover:border-primary/40 hover:bg-accent/40">{i}</button>)}</div>
              </div>
            )}
            {view.map((m) => m.role === "user" ? (
              <div key={m.id} className="flex justify-end"><div className="max-w-[85%] rounded-lg bg-primary/10 px-3 py-1.5 text-[13px]">{m.text}</div></div>
            ) : (
              <div key={m.id} className="space-y-2.5">
                {m.steps.length > 0 && <ul className="space-y-0.5 text-[11px] text-muted-foreground">{m.steps.map((s, i) => <li key={i} className="flex items-center gap-1.5">{s.done ? <Check className="size-3 text-success" /> : <Loader2 className="size-3 animate-spin" />}<span className="font-mono">{s.name}</span></li>)}</ul>}
                {m.text && <Md text={m.text} />}
                {m.results.map((r, i) => <ToolResultView key={i} ui={r.ui} />)}
                {useLlm && !loading && m.text && (() => { const u = checkFigures(m.text, m.results).unverified; return u.length ? <p className="text-[11px] text-warning">Couldn&apos;t verify {u.slice(0, 3).join(", ")} against your data. Check before relying on it.</p> : null; })()}
              </div>
            ))}
            {loading && <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="ai-dot size-2 rounded-full bg-ai" />Working…</div>}
            {error && <p className="rounded-md border border-danger/40 bg-danger/5 p-2 text-xs text-danger">The AI service didn&apos;t respond ({error.message.slice(0, 80)}). Try again in a moment.</p>}
            <div ref={end} />
          </div>
          {llm && !useLlm && <BookSlot what="The live AI assistant" className="mx-2.5 mb-1" />}
          <form onSubmit={(e) => { e.preventDefault(); submit(input); }} className="border-t p-2.5">
            <div className={cn("flex items-center gap-2 rounded-lg border bg-card p-1 focus-within:border-primary/50")}>
              <input autoFocus value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask or tell me what to do…" className="h-8 flex-1 bg-transparent px-2 text-[13px] outline-none placeholder:text-muted-foreground" />
              <Button type="submit" size="icon-sm" disabled={!input.trim() || loading} aria-label="Send"><ArrowUp /></Button>
            </div>
            <p className="mt-1 px-1 text-[10px] text-muted-foreground">{useLlm ? `${llm?.model}` : "Computed mode"} · changes need your confirmation</p>
          </form>
        </div>
      )}
    </>
  );
}
