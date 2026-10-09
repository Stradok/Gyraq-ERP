"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { getDB } from "@/lib/data/queries";
import type { Settings } from "@/lib/data/types";
import { run } from "@/lib/engine/client";
import { useERP, useWorld } from "@/lib/store";

const GROUPS: { title: string; note: string; fields: { key: keyof Settings; label: string; hint: string; pct?: boolean }[] }[] = [
  { title: "Approval limits", note: "Documents above these amounts need a second person.", fields: [
    { key: "poOwnerLimit", label: "Purchase order needs Owner above (PKR)", hint: "At or below this, a Procurement Manager approves" },
    { key: "jeApprovalLimit", label: "Manual journal needs second approver above (PKR)", hint: "Prepared by one Finance user, approved by another" },
    { key: "adjustApprovalLimit", label: "Stock adjustment / count variance needs Finance above (PKR)", hint: "Applies to adjustments and cycle-count variances" },
    { key: "expenseFinanceLimit", label: "Expense also needs Finance above (PKR)", hint: "Flagged expenses always go to Finance" } ] },
  { title: "Credit and cash", note: "Used by the credit check and the cash forecast.", fields: [
    { key: "maxOverdueDays", label: "Block new orders when an invoice is overdue by more than (days)", hint: "Counted from the due date" },
    { key: "minCash", label: "Minimum cash threshold (PKR)", hint: "The cash forecast warns when the balance falls below this" } ] },
  { title: "Tax rules", note: "Effective immediately for new documents. Verify rates with your tax advisor.", fields: [
    { key: "furtherTaxRate", label: "Further tax on unregistered / non-ATL buyers", hint: "Charged on the value of taxable supplies", pct: true },
    { key: "wht236hAtl", label: "Advance tax 236H: ATL retailers and wholesalers", hint: "Collected on the sale and paid to FBR", pct: true },
    { key: "wht236hNonAtlRetail", label: "Advance tax 236H: non-ATL retailers", hint: "", pct: true },
    { key: "wht236hNonAtlOther", label: "Advance tax 236H: non-ATL wholesalers and sub-distributors", hint: "", pct: true } ] },
];

export default function Policies() {
  useWorld((s) => s.version);
  const role = useERP((s) => s.role);
  const st = getDB().settings;
  const [f, setF] = useState<Record<string, string>>({});
  const val = (k: keyof Settings, pct?: boolean) => f[k] ?? String(pct ? +(st[k] * 100).toFixed(3) : st[k]);
  const canEdit = role === "owner" || role === "admin";
  const save = () => {
    const patch: Partial<Settings> = {};
    for (const g of GROUPS) for (const fl of g.fields) if (f[fl.key] !== undefined) patch[fl.key] = fl.pct ? +f[fl.key]! / 100 : +f[fl.key]!;
    const r = run("UpdateSettings", patch);
    if (r.ok) setF({});
  };
  return (
    <>
      <PageHeader module="settings" title="Settings" description="Approval limits, credit policy and tax rates are data, not code. Changes are audited and apply to new documents." actions={<Button size="sm" disabled={!canEdit || Object.keys(f).length === 0} onClick={save}>Save changes</Button>} />
      <Page>
        {!canEdit && <div className="rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-[13px]">Only the Owner or an Admin can change these. Switch persona to edit.</div>}
        {GROUPS.map((g) => (
          <Section key={g.title} title={g.title} description={g.note}>
            <div className="grid gap-4 md:grid-cols-2">
              {g.fields.map((fl) => (
                <div key={fl.key} className="space-y-1.5"><label htmlFor={fl.key} className="text-[13px]">{fl.label}</label>
                  <div className="flex items-center gap-2"><Input id={fl.key} inputMode="decimal" disabled={!canEdit} className="h-8 w-40 tabular" value={val(fl.key, fl.pct)} onChange={(e) => setF({ ...f, [fl.key]: e.target.value.replace(/[^\d.]/g, "") })} />{fl.pct && <span className="text-xs text-muted-foreground">%</span>}</div>
                  {fl.hint && <div className="text-[11px] text-muted-foreground">{fl.hint}</div>}</div>
              ))}
            </div>
          </Section>
        ))}
      </Page>
    </>
  );
}
