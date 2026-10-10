"use client";
import Link from "next/link";
import { useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { Field, ProblemBox } from "@/components/app/forms";
import { getDB } from "@/lib/data/queries";
import { run } from "@/lib/engine/client";
import type { Problem } from "@/lib/engine/core";
import { can } from "@/lib/rbac";
import { useERP, useWorld } from "@/lib/store";
import { cn } from "@/lib/utils";

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <Section title={`${n}. ${title}`} actions={done ? <span className="flex items-center gap-1 text-xs text-success"><Check className="size-3.5" />Done</span> : <span className="text-xs text-muted-foreground">To do</span>} className={cn(done && "opacity-80")}>{children}</Section>
  );
}
const useRun = () => { const [err, setErr] = useState<Problem | null>(null); return { err, go: (r: ReturnType<typeof run>) => { if (!r.ok) setErr(r.error); else setErr(null); return r.ok; } }; };
const num = (v: string) => +v.replace(/[^\d.]/g, "") || 0;

function Company() {
  const c = getDB().company, { err, go } = useRun();
  const [f, setF] = useState({ name: c.setupDone ? c.name : "", legalName: c.legalName, ntn: c.ntn, strn: c.strn, address: c.address, city: c.city, province: c.province, minCash: String(getDB().settings.minCash) });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Trading name"><Input aria-label="Company name" value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Legal name"><Input aria-label="Legal name" value={f.legalName} onChange={(e) => set("legalName", e.target.value)} placeholder="Acme Traders (Pvt.) Ltd." /></Field>
        <Field label="NTN" hint="Format 1234567-8"><Input aria-label="NTN" value={f.ntn} onChange={(e) => set("ntn", e.target.value)} /></Field>
        <Field label="STRN (sales tax registration)"><Input aria-label="STRN" value={f.strn} onChange={(e) => set("strn", e.target.value)} /></Field>
        <Field label="Address"><Input aria-label="Address" value={f.address} onChange={(e) => set("address", e.target.value)} /></Field>
        <Field label="City"><Input aria-label="City" value={f.city} onChange={(e) => set("city", e.target.value)} /></Field>
        <Field label="Province"><Input aria-label="Province" value={f.province} onChange={(e) => set("province", e.target.value)} /></Field>
        <Field label="Minimum cash to keep (Rs)" hint="The cash forecast warns below this"><Input aria-label="Minimum cash" inputMode="numeric" className="tabular" value={f.minCash} onChange={(e) => set("minCash", e.target.value)} /></Field>
      </div>
      <ProblemBox p={err} />
      <Button size="sm" onClick={() => { if (go(run("SetupCompany", { name: f.name, legalName: f.legalName, ntn: f.ntn, strn: f.strn, address: f.address, city: f.city, province: f.province, minCash: num(f.minCash) }, { quiet: true }))) toast.success("Company profile saved"); }}>Save company</Button>
    </div>
  );
}

function Warehouses() {
  const db = getDB(), { err, go } = useRun();
  const [f, setF] = useState({ code: "", name: "", city: "" });
  return (
    <div className="space-y-3">
      {db.warehouses.length > 0 && <ul className="text-[13px]">{db.warehouses.map((w) => <li key={w.id}><span className="font-mono text-xs">{w.code}</span> · {w.name}{w.city ? `, ${w.city}` : ""}</li>)}</ul>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Code"><Input aria-label="Warehouse code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="KHI-DC1" /></Field>
        <Field label="Name"><Input aria-label="Warehouse name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Karachi DC" /></Field>
        <Field label="City"><Input aria-label="Warehouse city" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
      </div>
      <ProblemBox p={err} />
      <Button size="sm" onClick={() => { if (go(run("CreateWarehouse", f, { quiet: true }))) { toast.success("Warehouse added"); setF({ code: "", name: "", city: "" }); } }}>Add warehouse</Button>
    </div>
  );
}

function OpeningStock() {
  const db = getDB(), { err, go } = useRun();
  const [wh, setWh] = useState(db.warehouses[0]?.id ?? "");
  const [rows, setRows] = useState<Record<string, { qty: string; cost: string }>>({});
  const set = (id: string, k: "qty" | "cost", v: string) => setRows((r) => ({ ...r, [id]: { qty: r[id]?.qty ?? "", cost: r[id]?.cost ?? "", [k]: v } }));
  if (!db.warehouses.length || !db.products.length) return <p className="text-sm text-muted-foreground">Add a warehouse and your products first.</p>;
  return (
    <div className="space-y-3">
      <select aria-label="Warehouse" value={wh} onChange={(e) => setWh(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-[13px]">{db.warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}</select>
      <div className="max-h-72 overflow-y-auto rounded-md border"><table className="w-full text-[13px]"><thead className="sticky top-0 bg-card"><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-3 py-1.5 font-medium">Product</th><th className="px-2 py-1.5 font-medium">Pieces</th><th className="px-2 py-1.5 font-medium">Cost per piece</th></tr></thead>
        <tbody>{db.products.map((p) => <tr key={p.id} className="border-b last:border-0"><td className="px-3 py-1">{p.name}</td><td className="px-2"><Input aria-label={`Qty ${p.sku}`} inputMode="numeric" className="h-7 w-24 tabular" value={rows[p.id]?.qty ?? ""} onChange={(e) => set(p.id, "qty", e.target.value.replace(/\D/g, ""))} /></td><td className="px-2"><Input aria-label={`Cost ${p.sku}`} inputMode="decimal" className="h-7 w-24 tabular" placeholder={String(p.cost)} value={rows[p.id]?.cost ?? ""} onChange={(e) => set(p.id, "cost", e.target.value)} /></td></tr>)}</tbody></table></div>
      <ProblemBox p={err} />
      <Button size="sm" onClick={() => { const lines = db.products.map((p) => ({ productId: p.id, warehouseId: wh, qty: num(rows[p.id]?.qty ?? ""), unitCost: num(rows[p.id]?.cost ?? "") || p.cost })).filter((l) => l.qty > 0); if (go(run("PostOpeningStock", { lines }, { quiet: true }))) { toast.success("Opening stock posted"); setRows({}); } }}>Post opening stock</Button>
    </div>
  );
}

function OpeningCash() {
  const db = getDB(), { err, go } = useRun();
  const accounts = db.accounts.filter((a) => db.bankBalanceAccounts.includes(a.code));
  const [rows, setRows] = useState<Record<string, string>>({});
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">{accounts.map((a) => <Field key={a.code} label={`${a.code} · ${a.name}`}><Input aria-label={`Balance ${a.code}`} inputMode="decimal" className="tabular" value={rows[a.code] ?? ""} onChange={(e) => setRows({ ...rows, [a.code]: e.target.value.replace(/[^\d.]/g, "") })} /></Field>)}</div>
      <ProblemBox p={err} />
      <Button size="sm" onClick={() => { const lines = accounts.map((a) => ({ account: a.code, amount: num(rows[a.code] ?? "") })).filter((l) => l.amount > 0); if (go(run("PostOpeningCash", { lines }, { quiet: true }))) { toast.success("Opening balances posted"); setRows({}); } }}>Post opening balances</Button>
    </div>
  );
}

export default function Setup() {
  useWorld((s) => s.version);
  const role = useERP((s) => s.role), db = getDB();
  const done = (src: string) => db.journal.some((j) => j.type === "opening" && j.memo.startsWith(src));
  const owner = can(role, "setup.manage");
  return (
    <>
      <PageHeader title="Getting started" description={`Set up ${db.company.setupDone ? db.company.name : "your company"} step by step. Opening balances are posted against Owner's Capital so your books balance from day one.`} />
      <Page>
        {!owner && <p className="rounded-md border border-warning/40 bg-warning/5 p-3 text-[13px]">Only the Owner or Admin can change company setup. You can still add records from their own screens.</p>}
        <div className="grid gap-4 xl:grid-cols-2">
          <Step n={1} title="Company profile" done={db.company.setupDone}><Company /></Step>
          <Step n={2} title="Warehouses" done={db.warehouses.length > 0}><Warehouses /></Step>
          <Step n={3} title="Suppliers and products" done={db.suppliers.length > 0 && db.products.length > 0}>
            <p className="text-[13px] text-muted-foreground">Add the principals you buy from, then your product list with prices and tax category.</p>
            <div className="mt-3 flex gap-2"><Button size="sm" variant="outline" asChild><Link href="/suppliers">Suppliers ({db.suppliers.length})</Link></Button><Button size="sm" variant="outline" asChild><Link href="/inventory">Products ({db.products.length})</Link></Button></div>
          </Step>
          <Step n={4} title="Customers" done={db.customers.length > 0}>
            <p className="text-[13px] text-muted-foreground">Add your customers with credit limits and terms.</p>
            <div className="mt-3"><Button size="sm" variant="outline" asChild><Link href="/customers">Customers ({db.customers.length})</Link></Button></div>
          </Step>
          <Step n={5} title="Opening stock" done={done("Opening stock")}><OpeningStock /></Step>
          <Step n={6} title="Opening cash and bank" done={done("Opening cash")}><OpeningCash /></Step>
          <Step n={7} title="Your team" done={db.employees.length > 0}>
            <p className="text-[13px] text-muted-foreground">Add employees, then create sign-in accounts for the people who will use the system.</p>
            <div className="mt-3 flex gap-2"><Button size="sm" variant="outline" asChild><Link href="/employees">Employees ({db.employees.length})</Link></Button><Button size="sm" variant="outline" asChild><Link href="/settings/roles">Users and roles</Link></Button></div>
          </Step>
        </div>
        <p className="text-xs text-muted-foreground">Customer receivables and supplier payables already owed at your start date can&apos;t be loaded here yet. Enter them as the first invoices and bills, dated before your start.</p>
      </Page>
    </>
  );
}
