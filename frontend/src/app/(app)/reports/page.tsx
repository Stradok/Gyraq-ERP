"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Page, PageHeader } from "@/components/app/page-header";
import { REPORTS } from "@/lib/reports";

export default function Reports() {
  return (
    <>
      <PageHeader title="Reports" description="Filter, group, drill down and export. Every report runs on the same ledger and stock data as the screens." />
      <Page>
        {(["Sales", "Inventory", "Purchasing", "Finance"] as const).map((g) => (
          <div key={g}>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{g}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {REPORTS.filter((r) => r.group === g).map((r) => (
                <Link key={r.id} href={r.href ?? `/reports/${r.id}`} className="group rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/30">
                  <div className="flex items-start justify-between"><span className="text-[13.5px] font-medium">{r.name}</span><ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" /></div>
                  <p className="mt-1 text-xs text-muted-foreground">{r.description}</p>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </Page>
    </>
  );
}
