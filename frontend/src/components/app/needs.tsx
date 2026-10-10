"use client";
// Shown in place of a form that can't work yet because the company hasn't got the records it depends on.
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState, Page, PageHeader } from "./page-header";

export interface Missing { text: string; href: string }
export function Needs({ title, missing }: { title: string; missing: Missing[] }) {
  return (
    <>
      <PageHeader title={title} description="A few things need to exist first." />
      <Page>
        <div className="rounded-lg border bg-card"><EmptyState title="Not ready yet" body="Add these first, then come back." action={<div className="flex flex-wrap justify-center gap-2">{missing.map((m) => <Button key={m.href + m.text} size="sm" variant="outline" asChild><Link href={m.href}>{m.text}</Link></Button>)}</div>} /></div>
      </Page>
    </>
  );
}
