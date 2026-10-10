"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { BookSlot } from "@/components/app/book-slot";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { Field, ProblemBox } from "@/components/app/forms";
import { Mono } from "@/components/app/status";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { diffDays } from "@/lib/data/dates";
import { getDB } from "@/lib/data/queries";
import type { AutomationRule } from "@/lib/data/types";
import { run } from "@/lib/engine/client";
import type { Problem } from "@/lib/engine/core";
import { money } from "@/lib/format";
import { useERP, useWorld } from "@/lib/store";

const EVENTS: Record<AutomationRule["event"], { label: string; facts: { fact: AutomationRule["fact"]; label: string }[] }> = {
  "invoice.posted": { label: "An invoice is issued", facts: [{ fact: "invoice.total", label: "Invoice total" }] },
  "order.confirmed": { label: "A sales order is confirmed", facts: [{ fact: "order.total", label: "Order total" }] },
  "stock.low": { label: "Stock runs low after a dispatch", facts: [] },
  "payment.bounced": { label: "A cheque bounces", facts: [{ fact: "payment.amount", label: "Cheque amount" }] },
  "po.received": { label: "Goods are received", facts: [{ fact: "po.total", label: "Receipt value" }] },
  "bill.exception": { label: "A supplier bill has exceptions", facts: [{ fact: "bill.total", label: "Bill total" }] },
};
const ACTIONS: Record<AutomationRule["action"], string> = { notify: "Notify", create_task: "Create a task", require_approval: "Require approval", create_recommendation: "Create a replenishment recommendation" };
const OPS = [["gt", "is greater than"], ["gte", "is at least"], ["lt", "is less than"], ["lte", "is at most"], ["any", "(any amount)"]] as const;

function RuleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [f, setF] = useState({ name: "", event: "invoice.posted" as AutomationRule["event"], op: "gt" as AutomationRule["op"], value: "500000", action: "notify" as AutomationRule["action"], target: "finance" });
  const [err, setErr] = useState<Problem | null>(null);
  const ev = EVENTS[f.event];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>New rule</DialogTitle><DialogDescription>When something happens, and a condition holds, do one safe action. Rules can notify, create tasks or ask for approval. They never post money.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <Field label="Name"><Input aria-label="Rule name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Big invoice alert" /></Field>
          <Field label="WHEN"><Select value={f.event} onValueChange={(v) => setF({ ...f, event: v as AutomationRule["event"], op: EVENTS[v as AutomationRule["event"]].facts.length ? f.op : "any" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(EVENTS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent></Select></Field>
          {ev.facts.length > 0 && <Field label="IF"><div className="flex flex-wrap items-center gap-2 text-[13px]"><span>{ev.facts[0]!.label}</span><Select value={f.op} onValueChange={(v) => setF({ ...f, op: v as AutomationRule["op"] })}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent>{OPS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>{f.op !== "any" && <Input aria-label="Threshold" inputMode="numeric" className="h-8 w-32 tabular" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value.replace(/\D/g, "") })} />}</div></Field>}
          <div className="grid gap-3 sm:grid-cols-2"><Field label="THEN"><Select value={f.action} onValueChange={(v) => setF({ ...f, action: v as AutomationRule["action"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ACTIONS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Who"><Select value={f.target} onValueChange={(v) => setF({ ...f, target: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["finance", "owner", "sales_manager", "procurement", "warehouse"].map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}</SelectContent></Select></Field></div>
        </div>
        <ProblemBox p={err} />
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => { const r = run("CreateRule", { name: f.name, event: f.event, fact: ev.facts[0]?.fact ?? "", op: ev.facts.length ? f.op : "any", value: +f.value || 0, action: f.action, target: f.target, enabled: true }, { quiet: true }); if (!r.ok) { setErr(r.error); return; } onOpenChange(false); }}>Create rule</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Dry run: how many of the last 30 days' documents would have matched. */
function matches(r: AutomationRule): string {
  const db = getDB();
  const ok = (a: number) => (r.op === "any" ? true : r.op === "gt" ? a > r.value : r.op === "gte" ? a >= r.value : r.op === "lt" ? a < r.value : a <= r.value);
  if (r.event === "invoice.posted") { const n = db.invoices.filter((i) => diffDays(db.today, i.date) <= 30 && ok(i.total)).length; return `${n} invoices in the last 30 days would match`; }
  if (r.event === "order.confirmed") { const n = db.orders.filter((o) => diffDays(db.today, o.date) <= 30 && o.status !== "draft" && ok(o.total)).length; return `${n} orders in the last 30 days would match`; }
  if (r.event === "payment.bounced") return `${db.payments.filter((p) => p.status === "bounced" && diffDays(db.today, p.date) <= 90).length} bounced cheques in the last 90 days`;
  if (r.event === "bill.exception") return `${db.bills.filter((b) => b.exceptions.length).length} bills currently have exceptions`;
  return "Runs on live events";
}

export default function Automations() {
  useWorld((s) => s.version);
  const role = useERP((s) => s.role);
  const [open, setOpen] = useState(false);
  const rules = getDB().rules;
  const canEdit = role === "owner" || role === "admin" || role === "finance";
  return (
    <>
      <PageHeader title="Automations" description="WHEN a business event happens, IF a condition holds, THEN run a safe action. Rules never change financial records directly." actions={canEdit && <Button size="sm" onClick={() => setOpen(true)}><Plus />New rule</Button>} />
      <RuleDialog key={String(open)} open={open} onOpenChange={setOpen} />
      <Page>
        <BookSlot what="Autonomous agents" />
        <div className="space-y-3">{rules.map((r) => { const ev = EVENTS[r.event]; return (
          <Section key={r.id} title={<span className="flex items-center gap-2">{r.name}<Mono className="text-muted-foreground">{r.id}</Mono></span>} actions={<Switch aria-label={`Enable ${r.name}`} disabled={!canEdit} checked={r.enabled} onCheckedChange={(v) => run("SetRule", { id: r.id, enabled: v })} />}>
            <div className="grid gap-3 text-[13px] md:grid-cols-[1fr_1fr_1fr]">
              <div><div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">When</div>{ev.label}</div>
              <div><div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">If</div>{ev.facts.length && r.op !== "any" ? `${ev.facts[0]!.label} ${OPS.find((o) => o[0] === r.op)![1]} ${money(r.value)}` : "Always"}</div>
              <div><div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Then</div>{ACTIONS[r.action]} · {r.target.replace("_", " ")}</div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground"><span>{matches(r)}</span><span className="tabular">{r.runs} runs</span></div>
          </Section>); })}</div>
      </Page>
    </>
  );
}
