"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Bars, CashChart, Waterfall } from "@/components/charts/charts";
import { AiChip } from "./ai";
import { RiskBadge } from "./status";
import type { Proposal, ToolUI } from "@/lib/ai/tools";
import { createPOFromRecommendation } from "@/lib/actions";
import { idx, recommendations } from "@/lib/data/queries";
import { money, moneyM, num } from "@/lib/format";
import { useERP } from "@/lib/store";
import { PERSONAS, can } from "@/lib/rbac";
import { cn } from "@/lib/utils";

/** Tiny markdown subset: **bold**, "- " bullets, blank-line paragraphs. */
export function Md({ text }: { text: string }) {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") ? <b key={i} className="font-medium">{p.slice(2, -2)}</b> : <span key={i}>{p}</span>));
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-2.5 text-[13.5px] leading-relaxed">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        const bullets = lines.filter((l) => l.startsWith("- "));
        if (bullets.length === lines.length) return <ul key={i} className="space-y-1">{bullets.map((l, k) => <li key={k} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" /><span>{inline(l.slice(2))}</span></li>)}</ul>;
        return <p key={i}>{lines.map((l, k) => (l.startsWith("- ") ? <span key={k} className="block pl-3">• {inline(l.slice(2))}</span> : <span key={k} className="block">{inline(l)}</span>))}</p>;
      })}
    </div>
  );
}

export function useProposalExec() {
  const { role, addAudit } = useERP();
  const actor = PERSONAS.find((p) => p.role === role)!.name;
  return (p: Proposal): { ok: boolean; href?: string } => {
    if (!can(role, "ai.confirm")) { toast.error("Your role can't confirm AI proposals", { description: "Switch persona (Finance, Sales Manager or Procurement)." }); return { ok: false }; }
    if (p.command === "CreatePurchaseOrder") {
      const rec = recommendations().find((r) => r.id === p.params.recId);
      if (!rec) { toast.error("This recommendation changed", { description: "Reload the recommendation and try again." }); return { ok: false }; }
      const x = createPOFromRecommendation(rec, Number(p.params.qty));
      return { ok: true, href: `/purchasing/orders/${x.po.id}` };
    }
    if (p.command === "PlaceCreditHold") {
      const c = idx().cus.get(String(p.params.customerId))!;
      const a = { id: `apr_new_hold_${c.id}_${Date.now()}`, type: "credit_limit" as const, title: `Credit hold – ${c.name}`, subtitle: "AI-proposed · confirmed by a person", amount: null, requestedBy: actor, requestedAt: new Date().toISOString().slice(0, 10), status: "pending" as const, ref: c.id, source: "ai" as const, step: "Sales Manager" };
      useERP.setState((s) => ({ extraApprovals: [a, ...s.extraApprovals] }));
      addAudit({ id: `au_new_${Date.now()}`, at: new Date().toISOString(), actor, action: "ai_proposal.confirmed", entity: "Customer", ref: c.name, source: "ai_proposal", detail: "Confirmed AI-proposed credit hold; sent for approval" });
      toast.success("Credit hold sent for approval", { description: c.name });
      return { ok: true, href: "/approvals" };
    }
    return { ok: false };
  };
}

export function ProposalCard({ p }: { p: Proposal }) {
  const exec = useProposalExec();
  const router = useRouter();
  const [state, setState] = useState<"open" | "done" | "rejected">("open");
  const [href, setHref] = useState<string | undefined>();
  return (
    <div className={cn("rounded-lg border bg-card", state !== "open" && "opacity-80")} style={{ borderLeft: "2px solid var(--ai)" }}>
      <div className="flex items-center justify-between border-b px-3.5 py-2"><span className="text-[13px] font-medium">{p.title}</span><AiChip label="Proposal" /></div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 px-3.5 py-2.5 text-[13px]">{p.lines.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="text-right">{v}</dd></div>)}</dl>
      <p className="border-t px-3.5 py-2 text-xs text-muted-foreground">{p.consequence}</p>
      <div className="flex items-center gap-2 border-t px-3.5 py-2.5">
        {state === "open" ? <><Button size="sm" onClick={() => { const r = exec(p); if (r.ok) { setState("done"); setHref(r.href); } }}><Check />Confirm</Button><Button size="sm" variant="ghost" onClick={() => setState("rejected")}>Reject</Button></> : state === "done" ? <><span className="text-xs text-success">Confirmed and executed through the normal command</span>{href && <Button size="xs" variant="outline" className="ml-auto" onClick={() => router.push(href)}>Open</Button>}</> : <span className="text-xs text-muted-foreground">Rejected. Nothing was changed.</span>}
      </div>
    </div>
  );
}

function RecCard({ id }: { id: string }) {
  const r = recommendations().find((x) => x.id === id);
  if (!r) return null;
  return (
    <div className="rounded-lg border bg-card p-3.5 text-[13px]" style={{ borderLeft: "2px solid var(--ai)" }}>
      <div className="flex items-center justify-between"><Link href={`/inventory/${r.product.id}`} className="font-medium hover:text-primary">{r.product.name}</Link><span className="font-mono text-[11px] text-muted-foreground">{idx().wh.get(r.warehouseId)!.code}</span></div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4"><div><div className="text-[11px] text-muted-foreground">Available</div>{num(r.available)}</div><div><div className="text-[11px] text-muted-foreground">30d forecast</div>{num(r.forecast30)}</div><div><div className="text-[11px] text-muted-foreground">Lead time</div>{r.leadTime} days</div><div><div className="text-[11px] text-muted-foreground">Stockout in</div><span className={r.stockoutDays < r.leadTime ? "text-danger" : ""}>{r.stockoutDays} days</span></div></div>
      <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">{r.why.slice(0, 3).map((w, i) => <li key={i}>· {w}</li>)}</ul>
      <div className="mt-2 text-xs">Recommended: <b className="tabular">{num(r.recommendedQty)} units</b> ({r.recommendedCartons} cartons)</div>
    </div>
  );
}

export function ToolResultView({ ui }: { ui: ToolUI }) {
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const { role, addAudit } = useERP();
  switch (ui.kind) {
    case "customers": return (
      <div className="overflow-hidden rounded-lg border bg-card"><table className="w-full text-[13px]"><thead><tr className="border-b bg-subtle text-xs text-muted-foreground"><th className="px-3 py-1.5 text-left font-medium">Customer</th><th className="px-2 py-1.5 text-right font-medium">Outstanding</th><th className="px-2 py-1.5 text-right font-medium">Overdue</th><th className="hidden px-2 py-1.5 text-right font-medium sm:table-cell">Oldest</th><th className="px-3 py-1.5 text-right font-medium">Risk</th></tr></thead>
        <tbody>{ui.rows.map((c) => <tr key={c.id} className="border-b last:border-0"><td className="px-3 py-1.5"><Link href={`/customers/${c.id}`} className="hover:text-primary hover:underline">{c.name}</Link><div className="text-[11px] text-muted-foreground">{c.city}</div></td><td className="px-2 text-right tabular">{money(c.outstanding)}</td><td className={cn("px-2 text-right tabular", c.overdue > 0 && "text-danger")}>{money(c.overdue)}</td><td className="hidden px-2 text-right tabular sm:table-cell">{c.maxDays ? `${c.maxDays}d` : "—"}</td><td className="px-3 text-right"><RiskBadge band={c.band as "low" | "medium" | "high"} score={c.risk} /></td></tr>)}</tbody></table></div>
    );
    case "recs": return <div className="space-y-2">{ui.ids.map((id) => <RecCard key={id} id={id} />)}</div>;
    case "waterfall": return <div className="rounded-lg border bg-card p-3"><div className="mb-1 text-xs font-medium text-muted-foreground">Net profit bridge</div><Waterfall steps={ui.steps} height={230} /></div>;
    case "bars": return <div className="rounded-lg border bg-card p-3"><div className="mb-1 text-xs font-medium text-muted-foreground">{ui.title}</div><Bars layout="vertical" height={Math.max(150, ui.data.length * 26)} data={ui.data.map((d) => ({ label: d.label.length > 20 ? d.label.slice(0, 19) + "…" : d.label, v: d.value }))} xKey="label" series={[{ key: "v", label: "Amount" }]} fmt={ui.money ? moneyM : num} /></div>;
    case "metrics": return <div className="grid gap-2 sm:grid-cols-2">{ui.items.map((m) => <div key={m.label} className="rounded-lg border bg-card px-3 py-2"><div className="truncate text-[11px] text-muted-foreground">{m.label}</div><div className="text-[13px] font-medium tabular">{m.value}</div></div>)}</div>;
    case "cash": return <div className="rounded-lg border bg-card p-3"><div className="mb-1 text-xs font-medium text-muted-foreground">Projected cash, 13 weeks</div><CashChart data={ui.weeks} min={ui.min} height={200} /></div>;
    case "proposal": return <ProposalCard p={ui.proposal} />;
    case "draft": return (
      <div className="rounded-lg border bg-card" style={{ borderLeft: "2px solid var(--ai)" }}>
        <div className="flex items-center justify-between border-b px-3.5 py-2 text-[13px]"><span className="font-medium">Draft {ui.channel} message · {ui.customer}</span><AiChip label="Draft" /></div>
        <pre className="whitespace-pre-wrap px-3.5 py-3 font-sans text-[13px] leading-relaxed">{ui.text}</pre>
        <div className="flex flex-wrap items-center gap-2 border-t px-3.5 py-2.5">
          <Button size="sm" onClick={() => { addAudit({ id: `au_new_${Date.now()}`, at: new Date().toISOString(), actor: PERSONAS.find((p) => p.role === role)!.name, action: "message.queued", entity: "Customer", ref: ui.customer, source: "ai_proposal", detail: `${ui.channel} collection follow-up queued (simulated, not sent)` }); toast.success("Queued in the outbox (simulated)", { description: "Nothing was sent. Connect WhatsApp in Integrations to deliver for real." }); }}><MessageCircle />Send via {ui.channel}</Button>
          <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard?.writeText(ui.text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy"}</Button>
          <Button size="sm" variant="ghost" onClick={() => router.push(`/customers/${ui.customerId}`)}>Open customer</Button>
          <span className="ml-auto text-[11px] text-muted-foreground">Simulated send</span>
        </div>
      </div>
    );
    case "none": return <div className="rounded-lg border border-dashed px-3 py-2 text-[13px] text-muted-foreground">{ui.reason}</div>;
  }
}
