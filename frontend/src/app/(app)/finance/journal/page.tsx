"use client";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { Mono, StatusBadge } from "@/components/app/status";
import { MoneyText } from "@/components/app/entity";
import { fiscalPeriods, getDB, glBalance, idx } from "@/lib/data/queries";
import type { JournalEntry } from "@/lib/data/types";
import { dateLong, dateShort, money, money2 } from "@/lib/format";
import { useERP, useWorld } from "@/lib/store";
import { run } from "@/lib/engine/client";
import { PERSONAS, can } from "@/lib/rbac";
import { cn } from "@/lib/utils";

interface Prob { title: string; detail: string; recovery: string; ref: string; code?: string }
function NewJE({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const db = getDB();
  const [date, setDate] = useState(db.today);
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState([{ a: "6990", d: "", c: "" }, { a: "1100", d: "", c: "" }]);
  const [err, setErr] = useState<Prob | null>(null);
  const dr = lines.reduce((s, l) => s + (+l.d || 0), 0), cr = lines.reduce((s, l) => s + (+l.c || 0), 0), diff = Math.round((dr - cr) * 100) / 100;
  const post = () => {
    const r = run("PostManualJE", { date, memo, lines: lines.map((l) => ({ account: l.a, debit: +l.d || 0, credit: +l.c || 0 })) }, { quiet: true });
    if (!r.ok) { setErr({ ...r.error, ref: `req_${Math.random().toString(36).slice(2, 10)}` }); return; }
    toast.success(r.message ?? "Journal entry posted");
    onOpenChange(false); setErr(null);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>New manual journal entry</DialogTitle><DialogDescription>Entries are immutable once posted; corrections use a reversal.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-[160px_1fr]"><Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setErr(null); }} /><Input placeholder="Memo" value={memo} onChange={(e) => setMemo(e.target.value)} /></div>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_110px_110px_28px] items-center gap-2">
              <Select value={l.a} onValueChange={(v) => setLines(lines.map((x, k) => (k === i ? { ...x, a: v } : x)))}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent className="max-h-64">{db.accounts.map((a) => <SelectItem key={a.code} value={a.code}>{a.code} · {a.name}</SelectItem>)}</SelectContent></Select>
              <Input inputMode="decimal" placeholder="Debit" className="h-8 tabular" value={l.d} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, d: e.target.value.replace(/[^\d.]/g, ""), c: e.target.value ? "" : x.c } : x)))} />
              <Input inputMode="decimal" placeholder="Credit" className="h-8 tabular" value={l.c} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, c: e.target.value.replace(/[^\d.]/g, ""), d: e.target.value ? "" : x.d } : x)))} />
              <button aria-label="Remove line" disabled={lines.length <= 2} onClick={() => setLines(lines.filter((_, k) => k !== i))} className="text-muted-foreground hover:text-danger disabled:opacity-30"><Trash2 className="size-3.5" /></button>
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setLines([...lines, { a: "6990", d: "", c: "" }])}><Plus />Add line</Button>
        </div>
        <div className={cn("flex items-center justify-between rounded-md border px-3 py-2 text-xs", diff === 0 && dr > 0 ? "border-success/40 text-success" : "text-muted-foreground")}><span>Debits {money2(dr)} · Credits {money2(cr)}</span><span>{diff === 0 && dr > 0 ? "✓ Balanced" : `Out of balance by ${money2(Math.abs(diff))}`}</span></div>
        {err && <div className="rounded-md border border-danger/40 bg-danger/5 p-3 text-[13px]"><div className="flex items-center gap-2 font-medium text-danger"><AlertCircle className="size-4" />{err.title}</div><p className="mt-1 text-muted-foreground">{err.detail}</p><p className="mt-1">{err.recovery}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">Reference {err.ref}</p></div>}
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={post}>Post entry</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Journal() {
  const sp = useSearchParams();
  useWorld((s) => s.version);
  const db = getDB();
  const [tab, setTab] = useState(sp.get("account") ? "ledger" : "entries");
  const [acct, setAcct] = useState(sp.get("account") ?? "1200");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<JournalEntry | null>(null);
  const role = useERP((s) => s.role);
  const entries = useMemo(() => db.journal.slice(-6000), [db]);
  const ledger = useMemo(() => {
    let bal = 0;
    const out: { j: JournalEntry; debit: number; credit: number; bal: number }[] = [];
    for (const j of db.journal) for (const l of j.lines) if (l.account === acct) { bal += l.debit - l.credit; out.push({ j, debit: l.debit, credit: l.credit, bal }); }
    return out.reverse();
  }, [db, acct]);
  const periods = fiscalPeriods();
  const checklist = useMemo(() => [
    { label: "Draft sales orders dated in the period", n: db.orders.filter((o) => o.status === "draft").length },
    { label: "Unreconciled bank lines", n: db.bank.filter((b) => b.status !== "matched").length },
    { label: "Goods received but not billed (GRNI)", n: db.grns.filter((g) => g.date > db.today.slice(0, 7) + "-01" && !db.bills.some((b) => b.poId === g.poId)).length },
    { label: "Invoices with FBR submission failed", n: 0 },
    { label: "Supplier bills in exception", n: db.bills.filter((b) => b.status === "exception").length },
  ], [db]);
  return (
    <>
      <PageHeader module="finance" title="Finance" description="Immutable double-entry journal. Every document posts balanced entries; manual entries are rare and guarded." actions={<Button size="sm" onClick={() => setOpen(true)}><Plus />New journal entry</Button>} />
      <NewJE open={open} onOpenChange={setOpen} />
      <Sheet open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <SheetContent className="w-full sm:max-w-[560px]">{sel && <><SheetHeader><SheetTitle><Mono className="text-base">{sel.number}</Mono></SheetTitle><SheetDescription>{sel.memo} · {dateLong(sel.date)} · source {sel.source} · {sel.type}</SheetDescription></SheetHeader>
          <div className="px-4"><table className="w-full text-[13px]"><thead><tr className="border-b text-xs text-muted-foreground"><th className="py-2 text-left font-medium">Account</th><th className="py-2 text-right font-medium">Debit</th><th className="py-2 text-right font-medium">Credit</th></tr></thead><tbody>{sel.lines.map((l, i) => <tr key={i} className="border-b last:border-0"><td className="py-2"><Mono className="mr-2 text-muted-foreground">{l.account}</Mono>{idx().acct.get(l.account)?.name}</td><td className="py-2 text-right tabular">{l.debit ? money2(l.debit) : ""}</td><td className="py-2 text-right tabular">{l.credit ? money2(l.credit) : ""}</td></tr>)}<tr className="font-semibold"><td className="py-2">Total</td><td className="py-2 text-right tabular">{money2(sel.lines.reduce((s, l) => s + l.debit, 0))}</td><td className="py-2 text-right tabular">{money2(sel.lines.reduce((s, l) => s + l.credit, 0))}</td></tr></tbody></table><p className="mt-3 text-xs text-muted-foreground">Posted by {sel.postedBy}. Posted entries cannot be edited or deleted; correct with a reversal.</p></div></>}</SheetContent>
      </Sheet>
      <Page>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList variant="line" className="mb-3"><TabsTrigger value="entries">Journal entries</TabsTrigger><TabsTrigger value="ledger">General ledger</TabsTrigger><TabsTrigger value="coa">Chart of accounts</TabsTrigger><TabsTrigger value="periods">Fiscal periods</TabsTrigger></TabsList>
          <TabsContent value="entries"><DataTable<JournalEntry> rows={entries} rowKey={(j) => j.id} onRowClick={setSel} exportName="journal" pageSize={30} searchText={(j) => `${j.number} ${j.memo} ${j.source}`} searchPlaceholder="Search memo, number or source" defaultSort={{ id: "d", dir: "desc" }}
            filters={[{ id: "t", label: "Type", options: ["auto", "manual", "opening", "closing"].map((t) => ({ value: t, label: t[0]!.toUpperCase() + t.slice(1) })), test: (j, v) => j.type === v }, { id: "src", label: "Source", options: ["Invoice", "Receipt", "GRN", "Bill", "Supplier payment", "Payroll", "Expense", "Credit note", "Count"].map((s) => ({ value: s, label: s })), test: (j, v) => j.source.startsWith(v) }]}
            cols={[{ id: "n", header: "Entry", cell: (j) => <Mono>{j.number}</Mono>, sort: (j) => j.number }, { id: "d", header: "Date", cell: (j) => dateShort(j.date), sort: (j) => j.date + j.number }, { id: "m", header: "Memo", cell: (j) => <span className="line-clamp-1">{j.memo}</span> }, { id: "s", header: "Source", cell: (j) => <span className="text-xs text-muted-foreground">{j.source}</span>, hide: "lg" }, { id: "t", header: "Type", cell: (j) => <StatusBadge status={j.type === "manual" ? "pending" : "posted"} label={j.type} />, hide: "md" }, { id: "a", header: "Amount", cell: (j) => <MoneyText v={j.lines.reduce((s, l) => s + l.debit, 0)} />, align: "right", sort: (j) => j.lines.reduce((s, l) => s + l.debit, 0) }, { id: "by", header: "Posted by", cell: (j) => j.postedBy, hide: "xl" }]} /></TabsContent>
          <TabsContent value="ledger" className="space-y-3">
            <div className="flex items-center gap-3"><Select value={acct} onValueChange={setAcct}><SelectTrigger className="w-80"><SelectValue /></SelectTrigger><SelectContent className="max-h-72">{db.accounts.map((a) => <SelectItem key={a.code} value={a.code}>{a.code} · {a.name}</SelectItem>)}</SelectContent></Select><span className="text-sm text-muted-foreground">Balance <b className="tabular text-foreground">{money(glBalance(acct, db.today))}</b></span></div>
            <DataTable rows={ledger.slice(0, 400)} rowKey={(r) => r.j.id + r.bal} onRowClick={(r) => setSel(r.j)} pageSize={30} exportName={`ledger-${acct}`} searchText={(r) => `${r.j.memo} ${r.j.number}`}
              cols={[{ id: "d", header: "Date", cell: (r) => dateShort(r.j.date) }, { id: "n", header: "Entry", cell: (r) => <Mono>{r.j.number}</Mono> }, { id: "m", header: "Memo", cell: (r) => <span className="line-clamp-1">{r.j.memo}</span> }, { id: "dr", header: "Debit", cell: (r) => (r.debit ? money(r.debit) : ""), align: "right" }, { id: "cr", header: "Credit", cell: (r) => (r.credit ? money(r.credit) : ""), align: "right" }, { id: "b", header: "Balance", cell: (r) => <span className="font-medium">{money(r.bal)}</span>, align: "right" }]} /></TabsContent>
          <TabsContent value="coa"><Section flush><table className="w-full text-[13px]"><thead><tr className="border-b text-xs text-muted-foreground"><th className="px-4 py-2 text-left font-medium">Account</th><th className="px-3 py-2 text-left font-medium">Type</th><th className="hidden px-3 py-2 text-left font-medium md:table-cell">Group</th><th className="px-4 py-2 text-right font-medium">Balance</th></tr></thead><tbody>{db.accounts.map((a) => <tr key={a.code} onClick={() => { setAcct(a.code); setTab("ledger"); }} className="cursor-pointer border-b last:border-0 hover:bg-accent/40"><td className="px-4 py-1.5"><Mono className="mr-2 text-muted-foreground">{a.code}</Mono>{a.name}{a.control && <span className="ml-2 rounded border px-1 text-[10px] text-muted-foreground">control</span>}</td><td className="px-3 capitalize text-muted-foreground">{a.type}</td><td className="hidden px-3 text-muted-foreground md:table-cell">{a.group}</td><td className="px-4 text-right tabular">{money(glBalance(a.code, db.today))}</td></tr>)}</tbody></table></Section></TabsContent>
          <TabsContent value="periods"><div className="grid gap-4 lg:grid-cols-3"><Section title="Fiscal periods" description="July–June fiscal year" className="lg:col-span-2" flush><table className="w-full text-[13px]"><tbody>{periods.filter((p) => p.status !== "future").map((p) => <tr key={p.id} className="border-b last:border-0"><td className="px-4 py-2">{p.name}</td><td className="px-4 text-right"><StatusBadge status={p.status === "closed" ? "cancelled" : p.status === "soft_closed" ? "pending" : "active"} label={p.status.replace("_", "-")} /></td></tr>)}</tbody></table></Section>
            <Section title="Close checklist" description={periods.find((p) => p.status === "open")?.name}><ul className="space-y-2 text-[13px]">{checklist.map((c) => <li key={c.label} className="flex items-start justify-between gap-3"><span className="text-muted-foreground">{c.label}</span><span className={cn("tabular", c.n ? "text-warning" : "text-success")}>{c.n ? c.n : "✓"}</span></li>)}</ul><Button className="mt-4 w-full" size="sm" variant="outline" disabled={!can(role, "period.close")} onClick={() => { const per = periods.find((p) => p.status === "open"); if (per) run("ClosePeriod", { periodId: per.id }); }}>Close period</Button></Section></div></TabsContent>
        </Tabs>
      </Page>
    </>
  );
}
export default function Route() { return <Suspense><Journal /></Suspense>; }
