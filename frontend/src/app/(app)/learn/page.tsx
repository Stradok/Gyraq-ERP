"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { PERSONAS, type Role } from "@/lib/rbac";
import { TUTORIALS } from "@/lib/tutorials";
import { useERP } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function Learn() {
  const mine = useERP((s) => s.role);
  const setRole = useERP((s) => s.setRole);
  const [role, setR] = useState<Role>(mine);
  const t = TUTORIALS[role];
  const p = PERSONAS.find((x) => x.role === role)!;
  return (
    <>
      <PageHeader title="Role guides" description="Pick a role to see what that person does here and how to enter the data. Every step works on this live demo." />
      <Page>
        <div className="flex flex-wrap gap-1.5">{PERSONAS.map((x) => <button key={x.role} onClick={() => setR(x.role)} className={cn("rounded-full border px-3 py-1 text-xs text-muted-foreground hover:text-foreground", role === x.role && "border-primary bg-primary/10 text-foreground")}>{x.title}</button>)}</div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
          <p className="max-w-2xl text-[13.5px]">{t.intro}</p>
          {mine !== role ? <Button size="sm" variant="outline" onClick={() => setRole(role)}>Switch the app to {p.name}</Button> : <span className="text-xs text-muted-foreground">You are viewing the app as {p.name}</span>}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {t.tasks.map((k, i) => (
            <Section key={k.title} title={`${i + 1}. ${k.title}`} description={k.goal}>
              <ol className="space-y-2 text-[13px]">{k.steps.map((s, n) => <li key={n} className="flex gap-2.5"><span className="mt-px grid size-5 shrink-0 place-items-center rounded-full border text-[11px] text-muted-foreground">{n + 1}</span><span>{s}</span></li>)}</ol>
              <Button size="sm" variant="outline" className="mt-3" asChild><Link href={k.href}>Try it now<ArrowRight /></Link></Button>
            </Section>
          ))}
        </div>
      </Page>
    </>
  );
}
