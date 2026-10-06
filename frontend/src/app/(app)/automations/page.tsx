"use client";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { Mono } from "@/components/app/status";

const RULES = [
  { id: "WF-001", name: "Large invoice approval", when: "invoice.posted AND invoice.amount > 500,000", then: "Require approval from Finance Manager before sending", runs: 41 },
  { id: "WF-002", name: "Low stock → recommendation", when: "inventory.available < inventory.reorder_point", then: "Create AI replenishment recommendation (once per SKU per day)", runs: 128 },
  { id: "WF-003", name: "Bounced cheque follow-up", when: "payment.cheque_bounced", then: "Notify Sales Manager, create task “Contact customer”, recompute risk", runs: 9 },
  { id: "WF-004", name: "Invoices due in 3 days", when: "Every day at 09:00", then: "Send each rep a digest of due invoices for their customers", runs: 96 },
];
export default function Automations() {
  const [on, setOn] = useState<Record<string, boolean>>({});
  return (
    <>
      <PageHeader title="Automations" description="WHEN a business event happens, IF a condition holds, THEN run a typed action. Rules can notify, create tasks or require approval; they never change financial records directly." />
      <Page>
        <div className="space-y-3">{RULES.map((r) => (
          <Section key={r.id} title={<span className="flex items-center gap-2">{r.name}<Mono className="text-muted-foreground">{r.id}</Mono></span>} actions={<Switch checked={on[r.id] ?? true} onCheckedChange={(v) => setOn({ ...on, [r.id]: v })} />}>
            <div className="grid gap-3 text-[13px] md:grid-cols-[1fr_1fr_auto]"><div><div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">When</div><code className="text-xs">{r.when}</code></div><div><div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Then</div>{r.then}</div><div className="text-xs text-muted-foreground tabular">{r.runs} runs (30d)</div></div>
          </Section>))}</div>
      </Page>
    </>
  );
}
