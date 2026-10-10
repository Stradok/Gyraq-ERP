"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RunPayrollDialog } from "@/components/app/forms";
import { can } from "@/lib/rbac";
import { useERP } from "@/lib/store";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { Kpi } from "@/components/app/kpi";
import { Mono, StatusBadge } from "@/components/app/status";
import { MoneyText } from "@/components/app/entity";
import { Bars } from "@/components/charts/charts";
import { getDB } from "@/lib/data/queries";
import { money, moneyCompact, monthLabel } from "@/lib/format";

export default function Payroll() {
  const db = getDB();
  const role = useERP((s) => s.role);
  const [open, setOpen] = useState(false);
  const runs = db.payroll;
  const last = runs[0] ?? { month: "", gross: 0, net: 0, tax: 0, eobi: 0, headcount: db.employees.length, status: "posted" as const };
  return (
    <>
      <PageHeader module="employees" title="Employees" description="Monthly payroll runs post a balanced journal (salaries, withholding tax, EOBI) and a payment from the payroll bank account." actions={can(role, "hr.manage") && <Button size="sm" onClick={() => setOpen(true)}><Plus />Run payroll</Button>} />
      <RunPayrollDialog open={open} onOpenChange={setOpen} />
      <Page>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Kpi label={`Gross payroll · ${(last.month ? monthLabel(last.month) : "no run yet")}`} value={moneyCompact(last.gross)} /><Kpi label="Net pay" value={moneyCompact(last.net)} /><Kpi label="Withholding tax" value={moneyCompact(last.tax)} /><Kpi label="Headcount" value={last.headcount} /></div>
        <Section title="Gross payroll by month"><Bars data={[...runs].reverse().map((r) => ({ month: r.month, gross: r.gross, net: r.net }))} xKey="month" xFmt={monthLabel} series={[{ key: "gross", label: "Gross" }, { key: "net", label: "Net", color: "var(--chart-3)" }]} /></Section>
        <Section title="Payroll runs" flush><table className="w-full text-[13px]"><thead><tr className="border-b text-xs text-muted-foreground"><th className="px-4 py-2 text-left font-medium">Month</th><th className="px-3 py-2 text-right font-medium">Headcount</th><th className="px-3 py-2 text-right font-medium">Gross</th><th className="hidden px-3 py-2 text-right font-medium md:table-cell">Tax</th><th className="hidden px-3 py-2 text-right font-medium md:table-cell">EOBI</th><th className="px-3 py-2 text-right font-medium">Net</th><th className="px-4 py-2 text-right font-medium">Status</th></tr></thead><tbody>{runs.map((r) => <tr key={r.month} className="border-b last:border-0"><td className="px-4 py-2"><Mono>{r.month}</Mono></td><td className="px-3 text-right tabular">{r.headcount}</td><td className="px-3 text-right tabular"><MoneyText v={r.gross} /></td><td className="hidden px-3 text-right tabular md:table-cell">{money(r.tax)}</td><td className="hidden px-3 text-right tabular md:table-cell">{money(r.eobi)}</td><td className="px-3 text-right tabular">{money(r.net)}</td><td className="px-4 text-right"><StatusBadge status="posted" /></td></tr>)}</tbody></table></Section>
      </Page>
    </>
  );
}
