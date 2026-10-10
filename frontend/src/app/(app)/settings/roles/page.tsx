"use client";
import { Check } from "lucide-react";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { NAV } from "@/lib/nav";
import { PERSONAS, ROLE_MODULES } from "@/lib/rbac";
import { UsersAdmin } from "@/components/app/users-admin";
import { remote } from "@/lib/engine/remote";
import { useERP } from "@/lib/store";

export default function Roles() {
  const role = useERP((s) => s.role);
  return (
    <>
      <PageHeader module="settings" title="Settings" description="Role-based access. Permissions scope to all, branch or own records; the server enforces them, the UI only reflects them." />
      <Page>
        {remote && (role === "owner" || role === "admin") && <UsersAdmin />}
        <Section flush title="Module access by role"><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-[13px]"><thead><tr className="border-b text-xs text-muted-foreground"><th className="px-4 py-2 text-left font-medium">Module</th>{PERSONAS.map((p) => <th key={p.role} className="px-2 py-2 text-center font-medium">{p.title.split(" ")[0]}</th>)}</tr></thead><tbody>{NAV.map((n) => <tr key={n.href} className="border-b last:border-0"><td className="px-4 py-1.5">{n.label}</td>{PERSONAS.map((p) => <td key={p.role} className="px-2 text-center">{ROLE_MODULES[p.role].includes(n.module) ? <Check className="mx-auto size-3.5 text-success" /> : <span className="text-muted-foreground/30">·</span>}</td>)}</tr>)}</tbody></table></div></Section>
        <Section title="Demo users"><ul className="space-y-1 text-[13px]">{PERSONAS.map((p) => <li key={p.role} className="flex justify-between"><span>{p.name} <span className="text-muted-foreground">· {p.title}</span></span><span className="font-mono text-xs text-muted-foreground">{p.email}</span></li>)}</ul></Section>
      </Page>
    </>
  );
}
