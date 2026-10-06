"use client";
import { useMemo } from "react";
import { Check, X } from "lucide-react";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { apOpen, getDB, glBalance, trialBalance } from "@/lib/data/queries";
import { money } from "@/lib/format";

export default function Health() {
  const db = getDB();
  const checks = useMemo(() => {
    const tb = trialBalance(db.today), d = tb.reduce((s, r) => s + r.debit, 0), c = tb.reduce((s, r) => s + r.credit, 0);
    const ar = db.invoices.reduce((s, i) => s + i.total - i.paid, 0), ap = apOpen().reduce((s, b) => s + b.total - b.paid, 0);
    const stock = [...db.stock.values()].reduce((s, x) => s + x.val, 0);
    return [
      ["Trial balance balances", Math.abs(d - c) < 1, `Debits ${money(d)} = Credits ${money(c)}`],
      ["Receivables subledger = Trade Debtors (1200)", Math.abs(ar - glBalance("1200", db.today)) < 1, `${money(ar)} vs ${money(glBalance("1200", db.today))}`],
      ["Payables subledger = Trade Creditors (2010)", Math.abs(ap - -glBalance("2010", db.today)) < 1, `${money(ap)} vs ${money(-glBalance("2010", db.today))}`],
      ["Stock ledger value = Stock in Trade (1300)", Math.abs(stock - glBalance("1300", db.today)) < 1, `${money(stock)} vs ${money(glBalance("1300", db.today))}`],
      ["No negative stock balances", [...db.stock.values()].every((x) => x.on >= 0), "All product × warehouse cells ≥ 0"],
      ["All journal entries balanced", db.journal.every((j) => Math.abs(j.lines.reduce((s, l) => s + l.debit - l.credit, 0)) < 0.02), `${db.journal.length.toLocaleString("en-US")} entries`],
    ] as [string, boolean, string][];
  }, [db]);
  return (
    <>
      <PageHeader module="settings" title="Settings" description="Integrity checks the system runs nightly. These are what make the numbers trustworthy." />
      <Page><Section flush><ul className="divide-y">{checks.map(([n, ok, d]) => <li key={n} className="flex items-center gap-3 px-4 py-3 text-[13px]">{ok ? <Check className="size-4 text-success" /> : <X className="size-4 text-danger" />}<span className="flex-1 font-medium">{n}</span><span className="text-xs text-muted-foreground tabular">{d}</span></li>)}</ul></Section></Page>
    </>
  );
}
