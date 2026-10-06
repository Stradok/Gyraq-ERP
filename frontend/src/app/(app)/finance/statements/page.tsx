"use client";
import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { Mono } from "@/components/app/status";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Kpi } from "@/components/app/kpi";
import { acctMonthly, balanceSheet, cashFlowStatement, getDB, idx, trialBalance } from "@/lib/data/queries";
import { addDays, fiscalYear } from "@/lib/data/dates";
import { money, monthLabel, moneyCompact, pct0 } from "@/lib/format";
import { cn } from "@/lib/utils";

const cell = "px-3 py-1.5 text-right tabular";
function Row({ label, vals, bold, code, indent }: { label: string; vals: number[]; bold?: boolean; code?: string; indent?: boolean }) {
  return (
    <tr className={cn("border-b last:border-0", bold && "bg-subtle font-semibold")}>
      <td className={cn("px-4 py-1.5", indent && "pl-8")}>{code ? <Link href={`/finance/journal?account=${code}`} className="hover:text-primary"><Mono className="mr-2 text-muted-foreground">{code}</Mono>{label}</Link> : label}</td>
      {vals.map((v, i) => <td key={i} className={cn(cell, v < 0 && "text-danger", i === vals.length - 1 && "font-medium")}>{v === 0 ? "—" : money(v)}</td>)}
    </tr>
  );
}

export default function Statements() {
  const db = getDB();
  const t = db.today;
  const fyNow = fiscalYear(t), fyPrev = fiscalYear(addDays(fyNow.start, -1));
  const [period, setPeriod] = useState<"ytd" | "last" | "3m">("ytd");
  const am = useMemo(() => acctMonthly(), []);
  const range = period === "ytd" ? { from: fyNow.start, to: t, label: `${fyNow.label} to date` } : period === "last" ? { from: fyPrev.start, to: fyPrev.end, label: fyPrev.label } : { from: addDays(t, -90), to: t, label: "Last 3 months" };
  const months = useMemo(() => { const out: string[] = []; for (let d = range.from; d <= range.to; d = addDays(d.slice(0, 7) + "-28", 5).slice(0, 7) + "-01") { out.push(d.slice(0, 7)); if (out.length > 14) break; } return out.slice(-7); }, [range.from, range.to]);
  const acctRows = (type: string, group?: string) => db.accounts.filter((a) => a.type === type && (!group || a.group === group)).map((a) => ({ a, byM: months.map((m) => (am.get(a.code)?.get(m) ?? 0) * (type === "income" ? -1 : 1)) })).map((r) => ({ ...r, total: [...(am.get(r.a.code)?.entries() ?? [])].filter(([m]) => m >= range.from.slice(0, 7) && m <= range.to.slice(0, 7)).reduce((s, [, v]) => s + v * (r.a.type === "income" ? -1 : 1), 0) })).filter((r) => Math.abs(r.total) > 0.5);
  const inc = acctRows("income"), cogs = acctRows("expense", "Cost of Sales"), opex = acctRows("expense", "Operating Expenses");
  const sumM = (rows: typeof inc) => months.map((_, i) => rows.reduce((s, r) => s + r.byM[i]!, 0));
  const sumT = (rows: typeof inc) => rows.reduce((s, r) => s + r.total, 0);
  const rev = sumM(inc), cg = sumM(cogs), ox = sumM(opex);
  const gp = rev.map((v, i) => v - cg[i]!), np = gp.map((v, i) => v - ox[i]!);
  const revT = sumT(inc), gpT = revT - sumT(cogs), npT = gpT - sumT(opex);
  const bs = useMemo(() => balanceSheet(t), [t]);
  const tb = useMemo(() => trialBalance(t), [t]);
  const cf = useMemo(() => cashFlowStatement(range.from, range.to), [range.from, range.to]);
  const tbD = tb.reduce((s, r) => s + r.debit, 0), tbC = tb.reduce((s, r) => s + r.credit, 0);
  return (
    <>
      <PageHeader module="finance" title="Finance" description="Statements are computed from posted double-entry journals. Click any account to drill into the ledger." actions={
        <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}><SelectTrigger size="sm" className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ytd">{fyNow.label} to date</SelectItem><SelectItem value="last">{fyPrev.label} (closed)</SelectItem><SelectItem value="3m">Last 3 months</SelectItem></SelectContent></Select>} />
      <Page>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Kpi label="Revenue" value={moneyCompact(revT)} sub={range.label} /><Kpi label="Gross profit" value={moneyCompact(gpT)} sub={`Margin ${pct0(revT ? (gpT / revT) * 100 : 0)}`} /><Kpi label="Net profit" value={moneyCompact(npT)} sub={`Net margin ${pct0(revT ? (npT / revT) * 100 : 0)}`} /><Kpi label="Trial balance" value={Math.abs(tbD - tbC) < 1 ? "Balanced" : "Out of balance"} tone={Math.abs(tbD - tbC) < 1 ? "success" : "danger"} sub={`Debits = Credits = ${moneyCompact(tbD)}`} /></div>
        <Tabs defaultValue="pl">
          <TabsList variant="line" className="mb-3"><TabsTrigger value="pl">Profit & Loss</TabsTrigger><TabsTrigger value="bs">Balance Sheet</TabsTrigger><TabsTrigger value="cf">Cash Flow</TabsTrigger><TabsTrigger value="tb">Trial Balance</TabsTrigger></TabsList>
          <TabsContent value="pl"><Section flush description={undefined}>
            <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-[13px]"><thead><tr className="border-b text-xs text-muted-foreground"><th className="px-4 py-2 text-left font-medium">{range.label}</th>{months.map((m) => <th key={m} className="px-3 py-2 text-right font-medium">{monthLabel(m)}</th>)}<th className="px-3 py-2 text-right font-medium">Period total</th></tr></thead><tbody>
              <tr className="bg-subtle text-xs font-medium text-muted-foreground"><td className="px-4 py-1.5" colSpan={months.length + 2}>Revenue</td></tr>
              {inc.map((r) => <Row key={r.a.code} code={r.a.code} label={r.a.name} indent vals={[...r.byM, r.total]} />)}
              <Row label="Net revenue" bold vals={[...rev, revT]} />
              <tr className="bg-subtle text-xs font-medium text-muted-foreground"><td className="px-4 py-1.5" colSpan={months.length + 2}>Cost of sales</td></tr>
              {cogs.map((r) => <Row key={r.a.code} code={r.a.code} label={r.a.name} indent vals={[...r.byM, r.total]} />)}
              <Row label="Gross profit" bold vals={[...gp, gpT]} />
              <tr className="bg-subtle text-xs font-medium text-muted-foreground"><td className="px-4 py-1.5" colSpan={months.length + 2}>Operating expenses</td></tr>
              {opex.map((r) => <Row key={r.a.code} code={r.a.code} label={r.a.name} indent vals={[...r.byM, r.total]} />)}
              <Row label="Net profit" bold vals={[...np, npT]} />
            </tbody></table></div>
          </Section></TabsContent>
          <TabsContent value="bs"><div className="grid gap-4 lg:grid-cols-2">
            <Section title="Assets" description={`As of ${t}`} flush><table className="w-full text-[13px]"><tbody>{bs.assets.map((a) => <Row key={a.code} code={a.code} label={a.name} indent vals={[a.amount]} />)}<Row label="Total assets" bold vals={[bs.totalAssets]} /></tbody></table></Section>
            <Section title="Liabilities and equity" flush><table className="w-full text-[13px]"><tbody>{bs.liab.map((a) => <Row key={a.code} code={a.code} label={a.name} indent vals={[a.amount]} />)}<Row label="Total liabilities" bold vals={[bs.totalLiab]} />{bs.eq.map((a) => <Row key={a.code} code={a.code} label={a.name} indent vals={[a.amount]} />)}<Row label="Current-year profit" indent vals={[bs.profit]} /><Row label="Total equity" bold vals={[bs.totalEq]} /><Row label="Liabilities + equity" bold vals={[bs.totalLiab + bs.totalEq]} /></tbody></table>
              <div className={cn("border-t px-4 py-2 text-xs", Math.abs(bs.totalAssets - bs.totalLiab - bs.totalEq) < 1 ? "text-success" : "text-danger")}>{Math.abs(bs.totalAssets - bs.totalLiab - bs.totalEq) < 1 ? "✓ Assets = Liabilities + Equity" : "Balance sheet does not balance"}</div></Section>
          </div></TabsContent>
          <TabsContent value="cf"><Section title="Cash flow (indirect)" description={range.label} flush><table className="w-full text-[13px]"><tbody>
            <Row label="Net profit" vals={[cf.netProfit]} />{cf.wc.map((w) => <Row key={w.label} label={w.label} indent vals={[w.amount]} />)}<Row label="Cash from operating activities" bold vals={[cf.ops]} /><Row label="Fixed assets" indent vals={[cf.investing]} /><Row label="Cash from investing" bold vals={[cf.investing]} /><Row label="Owner capital and drawings" indent vals={[cf.financing]} /><Row label="Cash from financing" bold vals={[cf.financing]} />
            <Row label="Net change in cash" bold vals={[cf.net]} /><Row label="Opening cash" vals={[cf.opening]} /><Row label="Closing cash" bold vals={[cf.closing]} /></tbody></table>
            <div className={cn("border-t px-4 py-2 text-xs", Math.abs(cf.opening + cf.net - cf.closing) < 1 ? "text-success" : "text-warning")}>{Math.abs(cf.opening + cf.net - cf.closing) < 1 ? "✓ Reconciles to bank and cash balances" : `Difference to ledger cash: ${money(cf.closing - cf.opening - cf.net)}`}</div></Section></TabsContent>
          <TabsContent value="tb"><Section title="Trial balance" description={`As of ${t}`} flush><table className="w-full text-[13px]"><thead><tr className="border-b text-xs text-muted-foreground"><th className="px-4 py-2 text-left font-medium">Account</th><th className="px-3 py-2 text-right font-medium">Debit</th><th className="px-3 py-2 text-right font-medium">Credit</th></tr></thead><tbody>
            {tb.map((r) => <tr key={r.code} className="border-b last:border-0"><td className="px-4 py-1.5"><Link href={`/finance/journal?account=${r.code}`} className="hover:text-primary"><Mono className="mr-2 text-muted-foreground">{r.code}</Mono>{r.name}</Link></td><td className={cell}>{r.debit ? money(r.debit) : ""}</td><td className={cell}>{r.credit ? money(r.credit) : ""}</td></tr>)}
            <tr className="bg-subtle font-semibold"><td className="px-4 py-2">Total</td><td className={cell}>{money(tbD)}</td><td className={cell}>{money(tbC)}</td></tr></tbody></table></Section></TabsContent>
        </Tabs>
      </Page>
    </>
  );
}
void Fragment; void idx;
