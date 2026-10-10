"use client";
// Owner/Admin screen for the people who can sign in (remote mode only).
import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Section } from "./page-header";
import { Field } from "./forms";
import { getDB } from "@/lib/data/queries";
import { apiJson } from "@/lib/engine/remote";
import { PERSONAS, type Role } from "@/lib/rbac";
import { useERP } from "@/lib/store";

interface U { id: string; email: string; name: string; title: string; role: Role; emp: string; active: boolean }
const ROLES = PERSONAS.map((p) => ({ value: p.role, label: p.title }));
const label = (r: Role) => PERSONAS.find((p) => p.role === r)?.title ?? r;

export function UsersAdmin() {
  const me = useERP((s) => s.user);
  const [users, setUsers] = useState<U[] | null>(null), [open, setOpen] = useState(false), [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => { const r = await apiJson<{ users: U[] }>("/api/users"); if (r.ok) setUsers(r.data.users); else setErr(r.data.error ?? "Couldn't load users"); }, []);
  useEffect(() => { void load(); }, [load]);
  const patch = async (id: string, body: object) => { const r = await apiJson(`/api/users/${id}`, { method: "PATCH", body }); if (!r.ok) toast.error(r.data.error ?? "Couldn't save"); else { toast.success("Saved"); void load(); } };
  const [f, setF] = useState({ email: "", name: "", title: "", role: "rep" as Role, password: "", emp: "" });
  const emps = getDB().employees;
  const add = async () => { const r = await apiJson("/api/users", { method: "POST", body: { ...f, emp: f.emp || f.name } }); if (!r.ok) { setErr(r.data.error ?? "Couldn't create"); return; } toast.success(`${f.name} can now sign in`); setOpen(false); setErr(null); setF({ email: "", name: "", title: "", role: "rep", password: "", emp: "" }); void load(); };
  return (
    <Section title="Users who can sign in" description="Link each user to their employee record. Role changes and disabling apply immediately." actions={<Button size="sm" onClick={() => setOpen(true)}><Plus />Add user</Button>} flush>
      {err && !open && <p className="px-4 py-2 text-xs text-danger">{err}</p>}
      <table className="w-full text-[13px]"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-4 py-2 font-medium">Name</th><th className="px-2 py-2 font-medium">Email</th><th className="px-2 py-2 font-medium">Role</th><th className="px-2 py-2 font-medium">Status</th><th className="px-4 py-2" /></tr></thead>
        <tbody>{(users ?? []).map((u) => (
          <tr key={u.id} className="border-b last:border-0">
            <td className="px-4 py-2">{u.name}<div className="text-[11px] text-muted-foreground">{u.title}</div></td>
            <td className="px-2 py-2 text-muted-foreground">{u.email}</td>
            <td className="px-2 py-2"><Select value={u.role} onValueChange={(v) => void patch(u.id, { role: v })} disabled={u.id === me?.id}><SelectTrigger size="sm" className="h-7 w-44"><SelectValue>{label(u.role)}</SelectValue></SelectTrigger><SelectContent>{ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent></Select></td>
            <td className="px-2 py-2">{u.active ? "Active" : <span className="text-muted-foreground">Disabled</span>}</td>
            <td className="px-4 py-2 text-right"><span className="flex justify-end gap-1">
              <Button size="xs" variant="ghost" onClick={() => { const pw = window.prompt(`New password for ${u.name} (8+ characters)`); if (pw) void patch(u.id, { password: pw }); }}>Reset password</Button>
              {u.id !== me?.id && <Button size="xs" variant="ghost" onClick={() => void patch(u.id, { active: !u.active })}>{u.active ? "Disable" : "Enable"}</Button>}
            </span></td>
          </tr>))}
          {users === null && !err && <tr><td colSpan={5} className="px-4 py-6 text-center text-xs text-muted-foreground">Loading…</td></tr>}
        </tbody></table>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Add user</DialogTitle><DialogDescription>They sign in with this email and password. Add the person under Employees first.</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name"><Input aria-label="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Email"><Input aria-label="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Role"><Select value={f.role} onValueChange={(v) => setF({ ...f, role: v as Role })}><SelectTrigger><SelectValue>{label(f.role)}</SelectValue></SelectTrigger><SelectContent>{ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Employee record"><Select value={f.emp || "same"} onValueChange={(v) => setF({ ...f, emp: v === "same" ? "" : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent className="max-h-64"><SelectItem value="same">Same as full name</SelectItem>{emps.map((e) => <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Job title (optional)"><Input aria-label="Job title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
            <Field label="Password" hint="At least 8 characters"><Input aria-label="Password" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          </div>
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => void add()}>Add user</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}
