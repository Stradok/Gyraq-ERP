"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { AiChip } from "@/components/app/ai";
import { ApprovalButtons, canDecide } from "@/components/app/approval-actions";
import { StatusBadge } from "@/components/app/status";
import { KeyValue } from "@/components/app/entity";
import { customerStats, getDB, idx, recommendations } from "@/lib/data/queries";
import { dateShort, money, moneyCompact, titleCase } from "@/lib/format";
import { useOverlay } from "@/lib/overlay";
import { useERP } from "@/lib/store";
import type { Approval } from "@/lib/data/types";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = { purchase_order: "Purchase order", expense: "Expense", ai_recommendation: "AI recommendation", bill_variance: "Supplier bill variance", credit_limit: "Credit limit", credit_override: "Credit override", stock_adjustment: "Stock adjustment", leave: "Leave", journal: "Journal entry" };

function Detail({ a }: { a: Approval }) {
  const db = getDB();
  const ov = useOverlay();
  if (a.type === "purchase_order") { const po = ov.pos.find((p) => p.id === a.ref); return po ? <div className="space-y-2 text-[13px]"><ul className="divide-y rounded-md border">{po.lines.map((l, i) => <li key={i} className="flex justify-between px-3 py-1.5"><span>{idx().prod.get(l.productId)?.name}</span><span className="tabular text-muted-foreground">{l.qty.toLocaleString("en-US")} × {l.price.toFixed(2)}</span></li>)}</ul><div className="flex justify-between"><span className="text-muted-foreground">Total incl. tax</span><b className="tabular">{money(po.total)}</b></div><Link href={`/purchasing/orders/${po.id}`} className="text-xs text-primary hover:underline">Open purchase order →</Link></div> : null; }
  if (a.type === "ai_recommendation") { const r = recommendations().find((x) => x.id === "rec_" + a.ref.replace("rec_", "")) ?? recommendations().find((x) => x.product.name.startsWith("NestFresh Mineral Water 1L")) ?? recommendations()[0]; return r ? <div className="space-y-2 text-[13px]"><p>{r.product.name} at {idx().wh.get(r.warehouseId)?.code}: {r.available.toLocaleString("en-US")} available, {r.forecast30.toLocaleString("en-US")} forecast for 30 days, lead time {r.leadTime} days. Recommended {r.recommendedQty.toLocaleString("en-US")} units ({money(r.value)}).</p><ul className="space-y-1 text-xs text-muted-foreground">{r.why.slice(0, 3).map((w, i) => <li key={i}>· {w}</li>)}</ul><Link href="/inventory/replenishment" className="text-xs text-primary hover:underline">Adjust quantity and create PO →</Link></div> : null; }
  if (a.type === "bill_variance") { const b = db.bills.find((x) => x.id === a.ref); return b ? <div className="space-y-2 text-[13px]"><ul className="space-y-1">{b.exceptions.map((e, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-danger" /><span>{titleCase(e.type.toLowerCase())}: {e.note}</span></li>)}</ul><Link href={`/purchasing/bills/${b.id}`} className="text-xs text-primary hover:underline">Open three-way match →</Link></div> : null; }
  if (a.type === "credit_limit" || a.type === "credit_override") { const cid = a.type === "credit_limit" ? a.ref : db.orders.find((o) => o.id === a.ref)?.customerId; const c = cid ? idx().cus.get(cid) : null; if (!c) return null; const s = customerStats(c.id); return <KeyValue cols={2} items={[["Customer", c.name], ["Current limit", money(c.creditLimit)], ["Outstanding", money(s.outstanding)], ["Overdue", money(s.overdue)], ["Risk", `${titleCase(s.band)} (${s.risk})`], ["Bounced cheques (180d)", String(s.bounces180)]]} />; }
  if (a.type === "expense") { const e = db.expenses.find((x) => x.id === a.ref); return e ? <div className="space-y-2 text-[13px]"><KeyValue items={[["Merchant", e.merchant], ["Category", e.category], ["Date", dateShort(e.date)], ["Purpose", e.purpose]]} />{e.flags.length > 0 && <ul className="text-xs text-warning">{e.flags.map((f) => <li key={f}>⚠ {f}</li>)}</ul>}</div> : null; }
  return <p className="text-[13px] text-muted-foreground">{a.subtitle}</p>;
}

export default function Approvals() {
  const ov = useOverlay();
  const role = useERP((s) => s.role);
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [selId, setSelId] = useState<string | null>(null);
  const all = useMemo(() => ov.approvals.map((a) => { const d = ov.decisions[a.id]; return d ? { ...a, status: d.decision } : a; }), [ov.approvals, ov.decisions]);
  const list = all.filter((a) => (tab === "pending" ? a.status === "pending" : a.status !== "pending"));
  const sel = list.find((a) => a.id === selId) ?? list[0];
  const pending = all.filter((a) => a.status === "pending");
  const total = pending.reduce((s, a) => s + (a.amount ?? 0), 0);
  return (
    <>
      <PageHeader title="Approvals" description={`${pending.length} waiting${total ? ` · ${moneyCompact(total)} in value` : ""}. One inbox for purchase orders, expenses, AI recommendations, variances and credit.`} />
      <Page>
        <div className="flex gap-1 text-[13px]">{(["pending", "history"] as const).map((t) => <button key={t} onClick={() => { setTab(t); setSelId(null); }} className={cn("rounded-md px-3 py-1 text-muted-foreground hover:text-foreground", tab === t && "bg-accent font-medium text-foreground")}>{t === "pending" ? `Waiting (${pending.length})` : "Decided"}</button>)}</div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
          <div className="space-y-2">
            {list.map((a) => (
              <button key={a.id} onClick={() => setSelId(a.id)} className={cn("w-full rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/40", sel?.id === a.id && "border-primary/60 bg-primary/5")}>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><span className="uppercase tracking-wide">{TYPE_LABEL[a.type]}</span>{a.source === "ai" && <AiChip />}<span className="ml-auto">{dateShort(a.requestedAt)}</span></div>
                <div className="mt-1 text-[13px] font-medium">{a.title}</div>
                <div className="mt-0.5 flex items-center justify-between text-xs text-muted-foreground"><span className="truncate">{a.subtitle}</span>{a.amount ? <span className="shrink-0 pl-2 tabular text-foreground">{moneyCompact(a.amount)}</span> : null}</div>
                {a.status !== "pending" && <div className="mt-1.5"><StatusBadge status={a.status} /></div>}
              </button>
            ))}
            {list.length === 0 && <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">{tab === "pending" ? "You're all caught up." : "No decisions yet."}</div>}
          </div>
          {sel && (
            <Section title={sel.title} description={`${TYPE_LABEL[sel.type]} · requested by ${sel.requestedBy} · step: ${sel.step}`} actions={sel.source === "ai" ? <AiChip label="AI-generated" /> : undefined} className="h-fit lg:sticky lg:top-4">
              <div className="space-y-4">
                {sel.amount ? <div className="text-2xl font-semibold tabular">{money(sel.amount)}</div> : null}
                <Detail a={sel} />
                {sel.status === "pending" ? <Decide a={sel} /> : <p className="text-[13px] text-muted-foreground">{sel.status === "approved" ? "Approved" : "Rejected"}{ov.decisions[sel.id] ? ` by ${ov.decisions[sel.id]!.by}` : ""}.</p>}
              </div>
            </Section>
          )}
        </div>
      </Page>
    </>
  );
}

function Decide({ a }: { a: Approval }) {
  const role = useERP((s) => s.role);
  const [c, setC] = useState("");
  return (
    <div className="space-y-2 border-t pt-4">
      <Textarea value={c} onChange={(e) => setC(e.target.value)} placeholder="Comment (optional, recorded in the audit log)" className="min-h-16 text-[13px]" />
      <div className="flex items-center gap-3"><ApprovalButtons approval={a} size="default" onDone={() => toast.dismiss()} />{!canDecide(role, a) && <span className="text-xs text-muted-foreground">Switch persona to the required role to act.</span>}</div>
      <p className="text-[11px] text-muted-foreground">Approving executes through the same command a person would use, then records an audit event with this approval reference.</p>
    </div>
  );
}
void Button;
