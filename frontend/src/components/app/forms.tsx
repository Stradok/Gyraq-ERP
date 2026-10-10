"use client";
// Create/edit dialogs for master data and money movements. Each one validates in the engine and shows its problem inline.
import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES } from "@/lib/data/catalog";
import { customerStats, getDB, idx } from "@/lib/data/queries";
import type { CommandInput, CommandType } from "@/lib/engine/commands";
import { run } from "@/lib/engine/client";
import type { Problem } from "@/lib/engine/core";
import { money } from "@/lib/format";
import type { CustomerPayment, CreditNote } from "@/lib/data/types";

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <div className="space-y-1.5"><div className="text-xs text-muted-foreground">{label}</div>{children}{hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}</div>;
}
export function ProblemBox({ p }: { p: Problem | null }) {
  if (!p) return null;
  return <div className="rounded-md border border-danger/40 bg-danger/5 p-3 text-[13px]"><div className="flex items-center gap-2 font-medium text-danger"><AlertCircle className="size-4" />{p.title}</div><p className="mt-1 text-muted-foreground">{p.detail}</p><p className="mt-1">{p.recovery}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">Code {p.code}</p></div>;
}
function Sel({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent className="max-h-64">{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>;
}
const CITIES: [string, string][] = [["Karachi", "Sindh"], ["Hyderabad", "Sindh"], ["Lahore", "Punjab"], ["Faisalabad", "Punjab"], ["Multan", "Punjab"], ["Sialkot", "Punjab"], ["Rawalpindi", "Punjab"], ["Islamabad", "ICT"]];

/** Submit a command, show the engine's problem inline on failure, close on success. */
function useSubmit<T extends CommandType>(type: T, onDone: (value: unknown) => void) {
  const [err, setErr] = useState<Problem | null>(null);
  return { err, setErr, submit: (payload: CommandInput<T>) => { const r = run(type, payload, { quiet: true }); if (!r.ok) { setErr(r.error); return; } if (r.message) toast.success(r.message); setErr(null); onDone(r.value); } };
}
type DlgProps = { open: boolean; onOpenChange: (o: boolean) => void };

export function NewCustomerDialog({ open, onOpenChange, onCreated }: DlgProps & { onCreated?: (id: string) => void }) {
  const db = getDB();
  const reps = db.employees.filter((e) => e.position.startsWith("Order Booker"));
  const [f, setF] = useState({ name: "", channel: "retail", city: "Karachi", area: "", registered: false, ntn: "", cnic: "", atl: false, limit: "500000", terms: "7", contact: "", phone: "", email: "", rep: reps[0]!.id });
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const { err, submit } = useSubmit("CreateCustomer", (v) => { onOpenChange(false); onCreated?.((v as { id: string }).id); });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>New customer</DialogTitle><DialogDescription>Tax identity decides how invoices are taxed: unregistered and non-ATL buyers attract further tax and higher withholding.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Trading name"><Input aria-label="Trading name" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Al-Karam General Store" /></Field></div>
          <Field label="Channel"><Sel value={f.channel} onChange={(v) => set("channel", v)} options={["modern_trade", "wholesale", "retail", "sub_distributor", "horeca"].map((c) => ({ value: c, label: c.replace("_", " ") }))} /></Field>
          <Field label="City"><Sel value={f.city} onChange={(v) => set("city", v)} options={CITIES.map(([c]) => ({ value: c, label: c }))} /></Field>
          <Field label="Area"><Input aria-label="Area" value={f.area} onChange={(e) => set("area", e.target.value)} placeholder="e.g. Gulshan-e-Iqbal" /></Field>
          <Field label="Sales representative"><Sel value={f.rep} onChange={(v) => set("rep", v)} options={reps.map((r) => ({ value: r.id, label: r.name }))} /></Field>
          <Field label="Sales-tax registered?"><Sel value={f.registered ? "y" : "n"} onChange={(v) => set("registered", v === "y")} options={[{ value: "y", label: "Registered" }, { value: "n", label: "Unregistered" }]} /></Field>
          <Field label={f.registered ? "NTN" : "CNIC (optional)"} hint={f.registered ? "Format 1234567-8" : "Format 42101-1234567-1"}><Input aria-label="Tax id" value={f.registered ? f.ntn : f.cnic} onChange={(e) => set(f.registered ? "ntn" : "cnic", e.target.value)} /></Field>
          <Field label="Active taxpayer list (ATL)"><Sel value={f.atl ? "y" : "n"} onChange={(v) => set("atl", v === "y")} options={[{ value: "y", label: "On the ATL" }, { value: "n", label: "Not on the ATL" }]} /></Field>
          <Field label="Credit limit (PKR)"><Input aria-label="Credit limit" inputMode="numeric" className="tabular" value={f.limit} onChange={(e) => set("limit", e.target.value.replace(/\D/g, ""))} /></Field>
          <Field label="Payment terms"><Sel value={f.terms} onChange={(v) => set("terms", v)} options={["7", "15", "30", "45"].map((d) => ({ value: d, label: `${d} days` }))} /></Field>
          <Field label="Contact person"><Input aria-label="Contact" value={f.contact} onChange={(e) => set("contact", e.target.value)} /></Field>
          <Field label="Phone"><Input aria-label="Phone" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="0300-1234567" /></Field>
        </div>
        <ProblemBox p={err} />
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => submit({ name: f.name, channel: f.channel as never, city: f.city, province: CITIES.find((c) => c[0] === f.city)![1], area: f.area, registered: f.registered, ntn: f.ntn, cnic: f.cnic, atl: f.atl, creditLimit: +f.limit, termsDays: +f.terms, contact: f.contact, phone: f.phone, email: f.email, repId: f.rep })}>Create customer</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NewSupplierDialog({ open, onOpenChange, onCreated }: DlgProps & { onCreated?: (id: string) => void }) {
  const [f, setF] = useState({ name: "", city: "Karachi", ntn: "", strn: "", kind: "goods", principal: false, lead: "8", terms: "30", contact: "", phone: "", email: "" });
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const { err, submit } = useSubmit("CreateSupplier", (v) => { onOpenChange(false); onCreated?.((v as { id: string }).id); });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>New supplier</DialogTitle><DialogDescription>An NTN is required so input tax can be claimed.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Registered name"><Input aria-label="Supplier name" value={f.name} onChange={(e) => set("name", e.target.value)} /></Field></div>
          <Field label="Type"><Sel value={f.kind} onChange={(v) => set("kind", v)} options={[{ value: "goods", label: "Goods supplier" }, { value: "services", label: "Service vendor" }]} /></Field>
          <Field label="City"><Sel value={f.city} onChange={(v) => set("city", v)} options={CITIES.map(([c]) => ({ value: c, label: c }))} /></Field>
          <Field label="NTN" hint="Format 1234567-8"><Input aria-label="NTN" value={f.ntn} onChange={(e) => set("ntn", e.target.value)} /></Field>
          <Field label="STRN (optional)"><Input aria-label="STRN" value={f.strn} onChange={(e) => set("strn", e.target.value)} /></Field>
          <Field label="Lead time (days)"><Input aria-label="Lead time" inputMode="numeric" value={f.lead} onChange={(e) => set("lead", e.target.value.replace(/\D/g, ""))} /></Field>
          <Field label="Payment terms (days)"><Input aria-label="Terms" inputMode="numeric" value={f.terms} onChange={(e) => set("terms", e.target.value.replace(/\D/g, ""))} /></Field>
          <Field label="Contact"><Input aria-label="Contact" value={f.contact} onChange={(e) => set("contact", e.target.value)} /></Field>
          <Field label="Phone"><Input aria-label="Phone" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        </div>
        <ProblemBox p={err} />
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => submit({ name: f.name, city: f.city, province: CITIES.find((c) => c[0] === f.city)![1], ntn: f.ntn, strn: f.strn, isPrincipal: f.principal, leadTimeDays: +f.lead, termsDays: +f.terms, contact: f.contact, phone: f.phone, email: f.email, kind: f.kind as "goods" | "services" })}>Create supplier</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NewProductDialog({ open, onOpenChange, onCreated }: DlgProps & { onCreated?: (id: string) => void }) {
  const db = getDB();
  const goods = db.suppliers.filter((s) => s.kind === "goods");
  const [f, setF] = useState({ name: "", brand: "", category: "packaged_foods", supplier: goods[0]!.id, carton: "24", price: "", cost: "", mrp: "", tax: "third_schedule", hs: "", shelf: "365" });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const { err, submit } = useSubmit("CreateProduct", (v) => { onOpenChange(false); onCreated?.((v as { id: string }).id); });
  const n = (v: string) => +v || 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>New product</DialogTitle><DialogDescription>Prices are per piece. Third Schedule goods are taxed on the printed retail price.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Product name (with pack size)"><Input aria-label="Product name" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Brite Wash Detergent 2kg" /></Field></div>
          <Field label="Brand"><Input aria-label="Brand" value={f.brand} onChange={(e) => set("brand", e.target.value)} /></Field>
          <Field label="Category"><Sel value={f.category} onChange={(v) => set("category", v)} options={CATEGORIES.map((c) => ({ value: c.id, label: c.name }))} /></Field>
          <Field label="Supplier"><Sel value={f.supplier} onChange={(v) => set("supplier", v)} options={goods.map((s) => ({ value: s.id, label: s.name }))} /></Field>
          <Field label="Pieces per carton"><Input aria-label="Carton" inputMode="numeric" value={f.carton} onChange={(e) => set("carton", e.target.value.replace(/\D/g, ""))} /></Field>
          <Field label="Trade price"><Input aria-label="Price" inputMode="decimal" className="tabular" value={f.price} onChange={(e) => set("price", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
          <Field label="Cost"><Input aria-label="Cost" inputMode="decimal" className="tabular" value={f.cost} onChange={(e) => set("cost", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
          <Field label="Retail price (MRP)"><Input aria-label="MRP" inputMode="decimal" className="tabular" value={f.mrp} onChange={(e) => set("mrp", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
          <Field label="Tax category"><Sel value={f.tax} onChange={(v) => set("tax", v)} options={[{ value: "third_schedule", label: "Third Schedule (retail price)" }, { value: "standard", label: "Standard 18%" }, { value: "exempt", label: "Exempt" }]} /></Field>
          <Field label="HS code" hint="Format 2202.1010"><Input aria-label="HS code" value={f.hs} onChange={(e) => set("hs", e.target.value)} /></Field>
          <Field label="Shelf life (days)"><Input aria-label="Shelf life" inputMode="numeric" value={f.shelf} onChange={(e) => set("shelf", e.target.value.replace(/\D/g, ""))} /></Field>
        </div>
        <ProblemBox p={err} />
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => submit({ name: f.name, brand: f.brand, category: f.category as never, supplierId: f.supplier, cartonSize: n(f.carton), price: n(f.price), cost: n(f.cost), mrp: n(f.mrp), taxCategory: f.tax as never, hsCode: f.hs, shelfLifeDays: n(f.shelf) })}>Create product</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NewLeadDialog({ open, onOpenChange }: DlgProps) {
  const reps = getDB().employees.filter((e) => e.position.startsWith("Order Booker"));
  const [f, setF] = useState({ company: "", contact: "", city: "Karachi", source: "Field visit", rep: reps[0]!.id, value: "500000" });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const { err, submit } = useSubmit("CreateLead", () => onOpenChange(false));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>New lead</DialogTitle><DialogDescription>A prospective retailer or sub-distributor.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Company"><Input aria-label="Company" value={f.company} onChange={(e) => set("company", e.target.value)} /></Field></div>
          <Field label="Contact"><Input aria-label="Contact" value={f.contact} onChange={(e) => set("contact", e.target.value)} /></Field>
          <Field label="City"><Sel value={f.city} onChange={(v) => set("city", v)} options={CITIES.map(([c]) => ({ value: c, label: c }))} /></Field>
          <Field label="Source"><Sel value={f.source} onChange={(v) => set("source", v)} options={["Field visit", "Referral", "Walk-in", "WhatsApp inquiry", "Trade expo"].map((c) => ({ value: c, label: c }))} /></Field>
          <Field label="Sales rep"><Sel value={f.rep} onChange={(v) => set("rep", v)} options={reps.map((r) => ({ value: r.id, label: r.name }))} /></Field>
          <Field label="Estimated value (PKR)"><Input aria-label="Value" inputMode="numeric" className="tabular" value={f.value} onChange={(e) => set("value", e.target.value.replace(/\D/g, ""))} /></Field>
        </div>
        <ProblemBox p={err} />
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => submit({ company: f.company, contact: f.contact, city: f.city, source: f.source, repId: f.rep, value: +f.value, probability: 10 })}>Add lead</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CreditLimitDialog({ open, onOpenChange, customerId, requestedBy }: DlgProps & { customerId: string; requestedBy: string }) {
  const c = idx().cus.get(customerId)!;
  const s = customerStats(c.id);
  const [v, setV] = useState(String(c.creditLimit)), [reason, setReason] = useState("");
  const { err, submit } = useSubmit("RequestCreditLimit", () => onOpenChange(false));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Change credit limit</DialogTitle><DialogDescription>{c.name} · outstanding {money(s.outstanding)} · risk {s.band}. Needs Finance approval; above Rs 5,000,000 the Owner approves.</DialogDescription></DialogHeader>
        <Field label="New limit (PKR)"><Input aria-label="New limit" inputMode="numeric" className="tabular" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, ""))} /></Field>
        <Field label="Reason"><Input aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. 18 months on time, volumes up" /></Field>
        <ProblemBox p={err} />
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => submit({ customerId, newLimit: +v, reason, requestedBy })}>Request change</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReturnDialog({ open, onOpenChange, invoiceId }: DlgProps & { invoiceId: string }) {
  const inv = idx().inv.get(invoiceId)!;
  const db = getDB();
  const lines = inv.lines.filter((l) => !l.free);
  const done = new Map<string, number>();
  for (const cn of db.creditNotes.filter((x) => x.invoiceId === invoiceId)) for (const l of cn.lines ?? []) done.set(l.productId, (done.get(l.productId) ?? 0) + l.qty);
  const [q, setQ] = useState<Record<string, string>>({});
  const [cond, setCond] = useState<Record<string, "resellable" | "damaged" | "expired">>({});
  const [reason, setReason] = useState<CreditNote["reason"]>("damaged");
  const { err, submit } = useSubmit("CreateReturn", () => onOpenChange(false));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Return goods / credit note</DialogTitle><DialogDescription>Reverses revenue and tax. Resellable stock goes back on the shelf; damaged and expired goods become a claim on the principal.</DialogDescription></DialogHeader>
        <div className="space-y-2">{lines.map((l) => { const p = idx().prod.get(l.productId)!; const max = l.qty - (done.get(l.productId) ?? 0); return (
          <div key={l.productId} className="grid grid-cols-[1fr_90px_120px] items-center gap-2 text-[13px]"><div className="min-w-0"><div className="truncate">{p.name}</div><div className="text-[11px] text-muted-foreground">up to {max} units</div></div>
            <Input aria-label={`Quantity ${p.name}`} inputMode="numeric" className="h-8 tabular" placeholder="0" value={q[l.productId] ?? ""} onChange={(e) => setQ({ ...q, [l.productId]: e.target.value.replace(/\D/g, "") })} />
            <Sel value={cond[l.productId] ?? "resellable"} onChange={(v) => setCond({ ...cond, [l.productId]: v as never })} options={[{ value: "resellable", label: "Resellable" }, { value: "damaged", label: "Damaged" }, { value: "expired", label: "Expired" }]} /></div>); })}</div>
        <Field label="Reason"><Sel value={reason} onChange={(v) => setReason(v as never)} options={[{ value: "damaged", label: "Damaged" }, { value: "expired", label: "Expired" }, { value: "short_delivery", label: "Short delivery" }, { value: "price_difference", label: "Price difference" }]} /></Field>
        <ProblemBox p={err} />
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => submit({ invoiceId, reason, lines: lines.filter((l) => +(q[l.productId] ?? 0) > 0).map((l) => ({ productId: l.productId, qty: +q[l.productId]!, condition: cond[l.productId] ?? "resellable" })) })}>Issue credit note</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PaySupplierDialog({ open, onOpenChange, billIds }: DlgProps & { billIds: string[] }) {
  const db = getDB();
  const bills = db.bills.filter((b) => billIds.includes(b.id));
  const total = bills.reduce((s, b) => s + b.total - b.paid, 0);
  const [bank, setBank] = useState("1100"), [method, setMethod] = useState<"bank_transfer" | "cheque">("bank_transfer");
  const bal = (a: string) => db.journal.reduce((s, j) => s + j.lines.filter((l) => l.account === a).reduce((x, l) => x + l.debit - l.credit, 0), 0);
  const { err, submit } = useSubmit("PaySupplier", () => onOpenChange(false));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Pay supplier</DialogTitle><DialogDescription>{bills.length} bill{bills.length === 1 ? "" : "s"} · {money(total)}. Posts Dr Trade Creditors / Cr Bank.</DialogDescription></DialogHeader>
        <Field label="Pay from"><Sel value={bank} onChange={setBank} options={db.accounts.filter((a) => ["1100", "1110", "1120", "1130"].includes(a.code)).map((a) => ({ value: a.code, label: `${a.name} · ${money(bal(a.code))}` }))} /></Field>
        <Field label="Method"><Sel value={method} onChange={(v) => setMethod(v as never)} options={[{ value: "bank_transfer", label: "Bank transfer" }, { value: "cheque", label: "Cheque" }]} /></Field>
        <ProblemBox p={err} />
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => submit({ billIds, method, bankAccount: bank })}>Pay {money(total)}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DepositCashDialog({ open, onOpenChange }: DlgProps) {
  const db = getDB();
  const held = db.journal.reduce((s, j) => s + j.lines.filter((l) => l.account === "1015").reduce((x, l) => x + l.debit - l.credit, 0), 0);
  const [amt, setAmt] = useState(String(Math.max(0, Math.round(held))));
  const [bank, setBank] = useState("1110");
  const { err, submit } = useSubmit("DepositCash", () => onOpenChange(false));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Deposit salesman cash</DialogTitle><DialogDescription>Cash collected on routes is held until deposited. Salesmen are holding {money(held)}.</DialogDescription></DialogHeader>
        <Field label="Amount"><Input aria-label="Amount" inputMode="numeric" className="tabular" value={amt} onChange={(e) => setAmt(e.target.value.replace(/\D/g, ""))} /></Field>
        <Field label="Deposit to"><Sel value={bank} onChange={setBank} options={[["1100", "Meezan Bank"], ["1110", "HBL Collection"], ["1120", "MCB Collection"]].map(([v, l]) => ({ value: v!, label: l! }))} /></Field>
        <ProblemBox p={err} />
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => submit({ amount: +amt, bankAccount: bank })}>Deposit</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
void (null as unknown as CustomerPayment);

const DEPARTMENTS = ["Sales", "Warehouse", "Procurement", "Finance", "Administration", "Management"];
export function EmployeeDialog({ open, onOpenChange, employee, onCreated }: DlgProps & { employee?: import("@/lib/data/types").Employee; onCreated?: (id: string) => void }) {
  const db = getDB();
  const blank = { name: "", department: "Sales", position: "", manager: "none", branch: db.warehouses[0]?.city ?? "Karachi", join: db.today, salary: "", phone: "", email: "", cnic: "", status: "active" };
  const from = (e: NonNullable<typeof employee>) => ({ ...blank, name: e.name, department: e.department, position: e.position, manager: e.managerId ?? "none", branch: e.branch, join: e.joinDate, salary: String(e.salary), phone: e.phone, email: e.email, cnic: e.cnic, status: e.status });
  const [f, setF] = useState(employee ? from(employee) : blank);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const [err, setErr] = useState<Problem | null>(null);
  const branches = [...new Set(db.employees.map((e) => e.branch))];
  const depts = [...new Set([...DEPARTMENTS, ...db.employees.map((e) => e.department)])];
  const finish = (r: ReturnType<typeof run>) => { if (!r.ok) { setErr(r.error); return; } if (r.message) toast.success(r.message); setErr(null); onOpenChange(false); if (!employee) { onCreated?.((r.value as { id: string }).id); setF(blank); } };
  const managerId = f.manager === "none" ? null : f.manager;
  const submit = () => finish(employee
    ? run("UpdateEmployee", { id: employee.id, position: f.position, department: f.department, managerId, branch: f.branch, salary: +f.salary || 0, phone: f.phone, email: f.email, status: f.status as never }, { quiet: true })
    : run("CreateEmployee", { name: f.name, department: f.department, position: f.position, managerId, branch: f.branch, joinDate: f.join, salary: +f.salary || 0, phone: f.phone, email: f.email, cnic: f.cnic, status: f.status as never }, { quiet: true }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{employee ? `Edit ${employee.name}` : "New employee"}</DialogTitle><DialogDescription>{employee ? "Name, CNIC and join date are fixed. Changes are written to the audit log." : "Salary is gross monthly. The employee is included in the next payroll run."}</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {!employee && <div className="sm:col-span-2"><Field label="Full name"><Input aria-label="Full name" value={f.name} onChange={(e) => set("name", e.target.value)} /></Field></div>}
          <Field label="Department"><Sel value={f.department} onChange={(v) => set("department", v)} options={depts.map((d) => ({ value: d, label: d }))} /></Field>
          <Field label="Position"><Input aria-label="Position" value={f.position} onChange={(e) => set("position", e.target.value)} placeholder="e.g. Order Booker" /></Field>
          <Field label="Reports to"><Sel value={f.manager} onChange={(v) => set("manager", v)} options={[{ value: "none", label: "No manager" }, ...db.employees.filter((e) => e.id !== employee?.id).map((e) => ({ value: e.id, label: e.name }))]} /></Field>
          <Field label="Branch"><Sel value={f.branch} onChange={(v) => set("branch", v)} options={branches.map((b) => ({ value: b, label: b }))} /></Field>
          <Field label="Monthly salary (Rs)"><Input aria-label="Salary" inputMode="numeric" className="tabular" value={f.salary} onChange={(e) => set("salary", e.target.value.replace(/\D/g, ""))} /></Field>
          <Field label="Status"><Sel value={f.status} onChange={(v) => set("status", v)} options={[{ value: "active", label: "Active" }, { value: "probation", label: "Probation" }, { value: "on_leave", label: "On leave" }]} /></Field>
          <Field label="Phone"><Input aria-label="Phone" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="0300-1234567" /></Field>
          <Field label="Email"><Input aria-label="Email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
          {!employee && <Field label="CNIC" hint="Format 12345-1234567-1"><Input aria-label="CNIC" value={f.cnic} onChange={(e) => set("cnic", e.target.value)} /></Field>}
          {!employee && <Field label="Join date"><Input aria-label="Join date" type="date" max={db.today} value={f.join} onChange={(e) => set("join", e.target.value)} /></Field>}
        </div>
        <ProblemBox p={err} />
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit}>{employee ? "Save changes" : "Add employee"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LeaveDialog({ open, onOpenChange, employeeId }: DlgProps & { employeeId: string }) {
  const db = getDB();
  const [f, setF] = useState({ type: "Annual", from: db.today, to: db.today, reason: "" });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const { err, submit } = useSubmit("SubmitLeave", () => onOpenChange(false));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Request leave</DialogTitle><DialogDescription>For {idx().emp.get(employeeId)?.name}. Goes to the line manager for approval.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Type"><Sel value={f.type} onChange={(v) => set("type", v)} options={["Annual", "Sick", "Casual"].map((t) => ({ value: t, label: t }))} /></Field></div>
          <Field label="From"><Input aria-label="From" type="date" value={f.from} onChange={(e) => set("from", e.target.value)} /></Field>
          <Field label="To"><Input aria-label="To" type="date" min={f.from} value={f.to} onChange={(e) => set("to", e.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="Reason"><Input aria-label="Reason" value={f.reason} onChange={(e) => set("reason", e.target.value)} /></Field></div>
        </div>
        <ProblemBox p={err} />
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => submit({ employeeId, type: f.type as never, from: f.from, to: f.to, reason: f.reason })}>Send request</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RunPayrollDialog({ open, onOpenChange }: DlgProps) {
  const db = getDB();
  const done = new Set(db.payroll.map((r) => r.month));
  const prev = (() => { const d = new Date(Date.UTC(+db.today.slice(0, 4), +db.today.slice(5, 7) - 2, 1)); return d.toISOString().slice(0, 7); })();
  const [month, setMonth] = useState(prev);
  const { err, submit } = useSubmit("RunPayroll", () => onOpenChange(false));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Run payroll</DialogTitle><DialogDescription>Posts salaries, withholding tax and EOBI to the ledger and pays the net from the payroll bank account.</DialogDescription></DialogHeader>
        <Field label="Month" hint={done.has(month) ? "Already paid" : `${db.employees.filter((e) => e.joinDate <= `${month}-31`).length} employees`}><Input aria-label="Payroll month" type="month" max={prev} value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
        <ProblemBox p={err} />
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => submit({ month })}>Post payroll</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
