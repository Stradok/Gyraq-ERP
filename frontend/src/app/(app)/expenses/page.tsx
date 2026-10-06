"use client";
import { useState } from "react";
import { Camera } from "lucide-react";
import { toast } from "sonner";
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
import { useERP } from "@/lib/store";
import { PERSONAS } from "@/lib/rbac";

function Submit({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [step, setStep] = useState<"form" | "scan" | "review">("form");
  const [cat, setCat] = useState("Fuel");
  const { role, addAudit } = useERP();
  const db = getDB();
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setStep("form"); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Submit expense</DialogTitle><DialogDescription>Take a photo of the receipt. The amount, merchant and category are read for you.</DialogDescription></DialogHeader>
        {step === "form" && <div className="space-y-3"><button onClick={() => { setStep("scan"); setTimeout(() => setStep("review"), 1100); }} className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground"><Camera className="size-6" />Capture or upload receipt (sample)</button><p className="text-[11px] text-muted-foreground">Demo uses a sample receipt. Live OCR runs through the same review screen.</p></div>}
        {step === "scan" && <div className="flex h-32 items-center justify-center gap-2 text-sm text-muted-foreground"><span className="ai-dot size-2 rounded-full bg-ai" />Reading receipt…</div>}
        {step === "review" && (
          <div className="space-y-3 text-[13px]">
            <div className="flex items-center gap-2"><AiChip label="Extracted" /><span className="text-xs text-muted-foreground">Check the fields, then submit</span></div>
            <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><div className="text-xs text-muted-foreground">Merchant</div><Input defaultValue="Petro Plus Fuel Station" /></div><div className="space-y-1"><div className="text-xs text-muted-foreground">Amount (PKR)</div><Input defaultValue="8,450" className="tabular" /></div></div>
            <div className="space-y-1"><div className="text-xs text-muted-foreground">Category (suggested)</div><Select value={cat} onValueChange={setCat}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Fuel", "Travel", "Meals", "Office", "Repairs", "Telephone", "Entertainment"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
            <ul className="space-y-1 rounded-md border p-2.5 text-xs"><li className="text-success">✓ No duplicate found</li><li className="text-success">✓ Within Fuel policy limit (Rs 15,000)</li><li className="text-muted-foreground">Proposed GL account: 6040 Fuel &amp; Vehicle Running</li></ul>
          </div>
        )}
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>{step === "review" && <Button onClick={() => { addAudit({ id: `au_new_${Date.now()}`, at: new Date().toISOString(), actor: PERSONAS.find((p) => p.role === role)!.name, action: "expense.submitted", entity: "Expense", ref: "EXP-new", source: "user", detail: "Rs 8,450 · Fuel · receipt read by AI" }); toast.success("Expense submitted", { description: "Routed to your manager, then Finance." }); onOpenChange(false); setStep("form"); }}>Submit expense</Button>}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Expenses() {
  const db = getDB();
  const role = useERP((s) => s.role);
  const [open, setOpen] = useState(false);
  const me = db.employees.find((e) => e.name === PERSONAS.find((p) => p.role === role)!.empName);
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
