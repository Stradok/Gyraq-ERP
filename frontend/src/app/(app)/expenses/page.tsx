"use client";
import { useMe } from "@/lib/me";
import { useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Page, PageHeader } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { AiChip } from "@/components/app/ai";
import { Mono, StatusBadge } from "@/components/app/status";
import { MoneyText, empName } from "@/components/app/entity";
import { getDB } from "@/lib/data/queries";
import type { Expense } from "@/lib/data/types";
import { dateShort, money, titleCase } from "@/lib/format";
import { useERP, useWorld } from "@/lib/store";
import { run } from "@/lib/engine/client";
import { PERSONAS } from "@/lib/rbac";

function Submit({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [step, setStep] = useState<"form" | "scan" | "review">("form");
  const role = useERP((s) => s.role);
  const db = getDB();
  const me = db.employees.find((e) => e.name === useMe().empName)!;
  const [f, setF] = useState({ category: "Fuel", merchant: "", amount: "", purpose: "", date: db.today, receipt: false });
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setStep("form"); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Submit expense</DialogTitle><DialogDescription>Capture the receipt and the fields are read for you, or type them in.</DialogDescription></DialogHeader>
        {step === "form" && <div className="space-y-3"><button onClick={() => { setStep("scan"); setTimeout(() => { setF({ category: "Fuel", merchant: "Petro Plus Fuel Station", amount: "8450", purpose: "Fuel – route visit", date: db.today, receipt: true }); setStep("review"); }, 900); }} className="flex h-24 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground"><Camera className="size-5" />Capture or upload receipt (sample)</button><button className="text-xs text-primary hover:underline" onClick={() => setStep("review")}>Enter manually instead</button></div>}
        {step === "scan" && <div className="flex h-24 items-center justify-center gap-2 text-sm text-muted-foreground"><span className="ai-dot size-2 rounded-full bg-ai" />Reading receipt…</div>}
        {step === "review" && (
          <div className="space-y-3 text-[13px]">
            {f.receipt && <div className="flex items-center gap-2"><AiChip label="Extracted" /><span className="text-xs text-muted-foreground">Check the fields, then submit</span></div>}
            <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><label htmlFor="exm" className="text-xs text-muted-foreground">Merchant</label><Input id="exm" value={f.merchant} onChange={(e) => set("merchant", e.target.value)} /></div><div className="space-y-1"><label htmlFor="exa" className="text-xs text-muted-foreground">Amount (PKR)</label><Input id="exa" inputMode="numeric" className="tabular" value={f.amount} onChange={(e) => set("amount", e.target.value.replace(/\D/g, ""))} /></div></div>
            <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><div className="text-xs text-muted-foreground">Category</div><Select value={f.category} onValueChange={(v) => set("category", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Fuel", "Travel", "Meals", "Office", "Repairs", "Telephone", "Entertainment"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><label htmlFor="exd" className="text-xs text-muted-foreground">Date</label><Input id="exd" type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></div></div>
            <div className="space-y-1"><label htmlFor="exp" className="text-xs text-muted-foreground">Business purpose</label><Input id="exp" value={f.purpose} onChange={(e) => set("purpose", e.target.value)} placeholder="e.g. route visit, client meeting" /></div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={f.receipt} onChange={(e) => set("receipt", e.target.checked)} />Receipt attached</label>
            <p className="text-[11px] text-muted-foreground">Checks run on submit: category limit, receipt, duplicates. Flagged expenses go to Finance too.</p>
          </div>
        )}
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>{step === "review" && <Button onClick={() => { const r = run("SubmitExpense", { employeeId: me.id, category: f.category, merchant: f.merchant, amount: +f.amount, purpose: f.purpose, date: f.date, hasReceipt: f.receipt }); if (r.ok) { onOpenChange(false); setStep("form"); } }}>Submit expense</Button>}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Expenses() {
  useWorld((s) => s.version);
  const db = getDB();
  const role = useERP((s) => s.role);
  const [open, setOpen] = useState(false);
  const me = db.employees.find((e) => e.name === useMe().empName);
  const rows = role === "employee" || role === "rep" ? db.expenses.filter((e) => e.employeeId === me?.id || e.employeeId === db.employees.find((x) => x.name === "Kashif Raza")?.id) : db.expenses;
  return (
    <>
      <PageHeader title="Expenses" description="Employee → Manager → Finance approval. Receipts are read automatically, categorised, checked for duplicates and policy." actions={<Button size="sm" onClick={() => setOpen(true)}><Camera />Submit expense</Button>} />
      <Submit open={open} onOpenChange={setOpen} />
      <Page>
        <DataTable<Expense> rows={rows} rowKey={(e) => e.id} exportName="expenses" defaultSort={{ id: "d", dir: "desc" }} searchText={(e) => `${e.number} ${e.merchant} ${empName(e.employeeId)} ${e.purpose}`}
          views={[{ label: "Needs approval", filters: { st: "manager_approved" } }, { label: "Flagged", filters: { fl: "y" } }]}
          filters={[{ id: "cat", label: "Category", options: [...new Set(db.expenses.map((e) => e.category))].map((c) => ({ value: c, label: c })), test: (e, v) => e.category === v }, { id: "st", label: "Status", options: ["submitted", "manager_approved", "finance_approved", "reimbursed", "rejected"].map((s) => ({ value: s, label: titleCase(s) })), test: (e, v) => e.status === v }, { id: "fl", label: "Flags", options: [{ value: "y", label: "Has flags" }], test: (e) => e.flags.length > 0 }]}
          footer={(r) => `Total ${money(r.reduce((s, e) => s + e.amount, 0))}`}
          cols={[{ id: "n", header: "Expense", cell: (e) => <Mono>{e.number}</Mono>, sort: (e) => e.number }, { id: "e", header: "Employee", cell: (e) => empName(e.employeeId), sort: (e) => empName(e.employeeId) }, { id: "m", header: "Merchant", cell: (e) => <div><div>{e.merchant}</div><div className="text-xs text-muted-foreground">{e.purpose}</div></div>, hide: "md" }, { id: "c", header: "Category", cell: (e) => e.category, hide: "lg", sort: (e) => e.category }, { id: "d", header: "Date", cell: (e) => dateShort(e.date), sort: (e) => e.date }, { id: "f", header: "Checks", cell: (e) => (e.flags.length ? <span className="text-xs text-warning">{e.flags[0]}</span> : <span className="text-xs text-success">Clear</span>), hide: "xl" }, { id: "a", header: "Amount", cell: (e) => <MoneyText v={e.amount} />, align: "right", sort: (e) => e.amount, exp: (e) => e.amount }, { id: "s", header: "Status", cell: (e) => <StatusBadge status={e.status} />, sort: (e) => e.status, exp: (e) => e.status }]} />
      </Page>
    </>
  );
}
