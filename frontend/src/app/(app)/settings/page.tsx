"use client";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { KeyValue } from "@/components/app/entity";
import { ORG } from "@/lib/data/catalog";
import { getDB } from "@/lib/data/queries";
import { Mono } from "@/components/app/status";

export default function Settings() {
  const db = getDB();
  return (
    <>
      <PageHeader module="settings" title="Settings" description="Organization, branches and numbering." />
      <Page>
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Organization"><KeyValue items={[["Legal name", ORG.legalName], ["NTN", ORG.ntn], ["STRN", ORG.strn], ["Address", ORG.address], ["Currency", "PKR"], ["Fiscal year", "July – June"], ["Time zone", "Asia/Karachi"], ["Minimum cash", `Rs ${ORG.minCash.toLocaleString("en-US")}`]]} /></Section>
          <Section title="Warehouses" flush><ul className="divide-y text-[13px]">{db.warehouses.map((w) => <li key={w.id} className="flex justify-between px-4 py-2.5"><span>{w.name}</span><Mono className="text-muted-foreground">{w.code}</Mono></li>)}</ul></Section>
        </div>
      </Page>
    </>
  );
}
