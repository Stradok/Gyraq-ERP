"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Page, PageHeader } from "@/components/app/page-header";
import { NewLeadDialog } from "@/components/app/forms";
import { run } from "@/lib/engine/client";
import { useERP, useWorld } from "@/lib/store";
import { can } from "@/lib/rbac";
import { empName } from "@/components/app/entity";
import { getDB } from "@/lib/data/queries";
import { moneyCompact } from "@/lib/format";

const STAGES = [["new", "New"], ["qualified", "Qualified"], ["proposal", "Proposal"], ["negotiation", "Negotiation"], ["won", "Won"], ["lost", "Lost"]] as const;

export default function LeadsPage() {
  useWorld((s) => s.version);
  const role = useERP((s) => s.role);
  const [openNew, setOpenNew] = useState(false);
  const leads = getDB().leads;
  return (
    <>
      <PageHeader module="sales" title="Sales" description="Pipeline of prospective retailers and sub-distributors." actions={can(role, "order.create") && <Button size="sm" onClick={() => setOpenNew(true)}><Plus />New lead</Button>} />
      <NewLeadDialog open={openNew} onOpenChange={setOpenNew} />
      <Page>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {STAGES.map(([k, label]) => {
            const items = leads.filter((l) => l.stage === k);
            return (
              <div key={k} className="rounded-lg border bg-subtle">
                <div className="flex items-center justify-between border-b px-3 py-2 text-xs"><span className="font-medium">{label}</span><span className="text-muted-foreground tabular">{items.length} · {moneyCompact(items.reduce((s, l) => s + l.value, 0))}</span></div>
                <div className="space-y-2 p-2">
                  {items.map((l) => (
                    <div key={l.id} className="rounded-md border bg-card p-2.5 text-[13px] transition-colors hover:border-primary/40">
                      <div className="font-medium">{l.company}</div>
                      <div className="text-xs text-muted-foreground">{l.contact} · {l.city}</div>
                      <div className="mt-1.5 flex items-center justify-between text-xs"><span className="tabular">{moneyCompact(l.value)}</span><span className="text-muted-foreground">{l.probability}%</span></div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{l.source} · {empName(l.repId)}</div>
                      <Select value={l.stage} onValueChange={(v) => run("MoveLead", { id: l.id, stage: v as never })}><SelectTrigger size="sm" className="mt-2 h-7 text-xs"><SelectValue /></SelectTrigger><SelectContent>{STAGES.map(([k2, l2]) => <SelectItem key={k2} value={k2}>{l2}</SelectItem>)}</SelectContent></Select>
                    </div>
                  ))}
                  {!items.length && <div className="px-2 py-4 text-center text-xs text-muted-foreground">No leads</div>}
                </div>
              </div>
            );
          })}
        </div>
      </Page>
    </>
  );
}
