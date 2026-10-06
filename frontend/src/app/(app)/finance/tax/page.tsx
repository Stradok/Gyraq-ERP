"use client";
import { useMemo } from "react";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { Kpi } from "@/components/app/kpi";
import { Mono, StatusBadge } from "@/components/app/status";
import { CustomerLink, MoneyText } from "@/components/app/entity";
import { getDB, glNet } from "@/lib/data/queries";
import { addDays } from "@/lib/data/dates";
import type { Invoice } from "@/lib/data/types";
import { dateShort, money, moneyCompact } from "@/lib/format";

const RULES = [
  ["Sales tax – standard", "18% of value", "Registered or unregistered buyer, standard-rated goods", "Always"],
  ["Sales tax – Third Schedule", "18% of retail price (MRP)", "Packed FMCG: oils, sauces, noodles, dairy, toiletries (expanded by Finance Act 2026)", "From 1 Jul 2026"],
  ["Further tax", "4% of value", "Buyer unregistered or not on the Active Taxpayer List", "Configurable"],
  ["Advance tax 236H", "0.5% (ATL) / 2.5% (non-ATL) of gross", "Collected on sales to retailers; wholesalers 0.5% / 1%", "Adjustable"],
  ["Advance tax 236G", "0.1% (ATL) / 2% (non-ATL)", "Collected by manufacturers from Meridian on purchases", "Adjustable"],
] as const;

export default function Tax() {
  const db = getDB();
  const t = db.today, from = `${t.slice(0, 7)}-01`, prevFrom = addDays(from, -30).slice(0, 7) + "-01";
  const stats = useMemo(() => ({
    out: -glNet(["2100"], from, t), further: -glNet(["2105"], from, t), h: -glNet(["2120"], from, t), inp: glNet(["1400"], from, t), g: glNet(["1410"], from, t),
    pOut: -glNet(["2100"], prevFrom, addDays(from, -1)), pIn: glNet(["1400"], prevFrom, addDays(from, -1)),
  }), [from, t, prevFrom]);
  const recent = db.invoices.slice(0, 400);
  return (
    <>
      <PageHeader module="finance" title="Finance" description="Sales-tax position and FBR Digital Invoicing log. Tax rules are effective-dated configuration, never hard-coded." />
      <Page>
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-[13px] text-muted-foreground"><b className="text-foreground">Demo configuration.</b> Rates shown reflect FY2026-27 rules researched for this demo (Finance Act 2026). Verify with your tax advisor before use. FBR submission is <b className="text-foreground">simulated</b>: invoices get a SIM reference and nothing is transmitted.</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5"><Kpi label="Output sales tax (MTD)" value={moneyCompact(stats.out)} /><Kpi label="Input sales tax (MTD)" value={moneyCompact(stats.inp)} /><Kpi label="Net payable to FBR (MTD)" value={moneyCompact(stats.out - stats.inp)} sub={`Last month ${moneyCompact(stats.pOut - stats.pIn)}`} /><Kpi label="Further tax collected" value={moneyCompact(stats.further)} /><Kpi label="236H collected / 236G paid" value={`${moneyCompact(stats.h)} / ${moneyCompact(stats.g)}`} /></div>
        <Section title="Tax rules in force" description="Effective-dated rules the tax engine evaluates for every document" flush><table className="w-full text-[13px]"><thead><tr className="border-b text-xs text-muted-foreground"><th className="px-4 py-2 text-left font-medium">Rule</th><th className="px-3 py-2 text-left font-medium">Rate / basis</th><th className="hidden px-3 py-2 text-left font-medium md:table-cell">Applies to</th><th className="px-4 py-2 text-left font-medium">Effective</th></tr></thead><tbody>{RULES.map((r) => <tr key={r[0]} className="border-b last:border-0"><td className="px-4 py-2 font-medium">{r[0]}</td><td className="px-3">{r[1]}</td><td className="hidden px-3 text-muted-foreground md:table-cell">{r[2]}</td><td className="px-4 text-muted-foreground">{r[3]}</td></tr>)}</tbody></table></Section>
        <div>
          <h2 className="mb-2 text-sm font-medium">FBR Digital Invoicing log</h2>
          <DataTable<Invoice> rows={recent} rowKey={(i) => i.id} rowHref={(i) => `/sales/invoices/${i.id}`} pageSize={15} exportName="fbr-log" searchText={(i) => `${i.number} ${i.fbr.irn}`} defaultSort={{ id: "d", dir: "desc" }}
            cols={[{ id: "n", header: "Invoice", cell: (i) => <Mono>{i.number}</Mono> }, { id: "c", header: "Buyer", cell: (i) => <CustomerLink id={i.customerId} />, hide: "md" }, { id: "irn", header: "IRN", cell: (i) => <Mono className="text-muted-foreground">{i.fbr.irn}</Mono>, hide: "lg" }, { id: "d", header: "Submitted", cell: (i) => dateShort(i.fbr.at), sort: (i) => i.fbr.at }, { id: "t", header: "Sales tax", cell: (i) => <MoneyText v={i.salesTax + i.furtherTax} />, align: "right" }, { id: "s", header: "Status", cell: () => <StatusBadge status="simulated" label="Simulated" /> }]} />
        </div>
      </Page>
    </>
  );
}
void money;
