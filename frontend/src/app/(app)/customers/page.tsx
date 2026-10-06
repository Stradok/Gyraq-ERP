"use client";
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Filter, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Page, PageHeader } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { RiskBadge, StatusBadge, Mono } from "@/components/app/status";
import { MoneyText, empName } from "@/components/app/entity";
import { getDB } from "@/lib/data/queries";
import { customerRows, filterCustomers, type CustomerFilter, type CustomerRow } from "@/lib/nl";
import { money, titleCase } from "@/lib/format";
import { useERP } from "@/lib/store";
import { cn } from "@/lib/utils";

function Customers() {
  const sp = useSearchParams();
  const role = useERP((s) => s.role);
  const db = getDB();
  const f: CustomerFilter = useMemo(() => ({
    overdue: sp.get("overdue") === "1" || sp.get("filter") === "overdue", city: sp.get("city") ?? undefined, minBalance: sp.get("minBalance") ? +sp.get("minBalance")! : undefined,
    minDays: sp.get("minDays") ? +sp.get("minDays")! : undefined, band: sp.get("band") ?? undefined,
  }), [sp]);
  const hasF = Object.values(f).some(Boolean);
  const rep = db.employees.find((e) => e.name === "Usman Ghani")!;
  const rows = useMemo(() => {
    const base = hasF ? filterCustomers(f) : customerRows();
    return role === "rep" ? base.filter((r) => r.c.repId === rep.id) : base;
  }, [f, hasF, role, rep.id]);
  const chips = [f.overdue && "Overdue", f.city && `City = ${f.city}`, f.minBalance && `Balance > ${money(f.minBalance)}`, f.minDays && `Overdue ≥ ${f.minDays} days`, f.band && `Risk = ${titleCase(f.band)}`].filter(Boolean) as string[];
  return (
    <>
      <PageHeader module={undefined} title="Customers" description={role === "rep" ? "Your accounts" : "Accounts, credit exposure and AI-computed payment risk."} actions={<Button size="sm" variant="outline" disabled title="Customer creation form arrives with the backend"><Plus />New customer</Button>} />
      <Page>
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-2 text-xs">
            <Filter className="size-3.5 text-primary" /><span className="text-muted-foreground">Interpreted as</span>{chips.map((c) => <span key={c} className="rounded border bg-accent px-1.5 py-0.5">{c}</span>)}
            <Link href="/customers" className="ml-auto text-muted-foreground hover:text-foreground">Clear</Link>
          </div>
        )}
        <DataTable<CustomerRow>
          rows={rows} rowKey={(r) => r.c.id} rowHref={(r) => `/customers/${r.c.id}`} exportName="customers" defaultSort={{ id: "overdue", dir: "desc" }}
          searchText={(r) => `${r.c.name} ${r.c.code} ${r.c.city} ${r.c.area}`} searchPlaceholder="Search customers"
          views={[{ label: "Overdue", filters: { od: "yes" } }, { label: "High risk", filters: { risk: "high" } }, { label: "Over credit limit", filters: { lim: "over" } }]}
          filters={[
            { id: "ch", label: "Channel", options: ["modern_trade", "wholesale", "retail", "sub_distributor", "horeca"].map((x) => ({ value: x, label: titleCase(x) })), test: (r, v) => r.c.channel === v },
            { id: "city", label: "City", options: [...new Set(db.customers.map((c) => c.city))].sort().map((x) => ({ value: x, label: x })), test: (r, v) => r.c.city === v },
            { id: "risk", label: "Risk", options: ["high", "medium", "low"].map((x) => ({ value: x, label: titleCase(x) })), test: (r, v) => r.s.band === v },
            { id: "od", label: "Overdue", options: [{ value: "yes", label: "Has overdue" }], test: (r) => r.s.overdue > 0 },
            { id: "lim", label: "Limit", options: [{ value: "over", label: "Over limit" }], test: (r) => r.s.outstanding > r.c.creditLimit },
          ]}
          footer={(r) => `Outstanding ${money(r.reduce((s, x) => s + x.s.outstanding, 0))}`}
          cols={[
            { id: "name", header: "Customer", cell: (r) => <div><div className="font-medium">{r.c.name}</div><Mono className="text-muted-foreground">{r.c.code}</Mono></div>, sort: (r) => r.c.name },
            { id: "ch", header: "Channel", cell: (r) => titleCase(r.c.channel), hide: "lg", sort: (r) => r.c.channel },
            { id: "city", header: "City", cell: (r) => r.c.city, hide: "md", sort: (r) => r.c.city },
            { id: "rep", header: "Rep", cell: (r) => empName(r.c.repId), hide: "xl", defaultHidden: true },
            { id: "out", header: "Outstanding", cell: (r) => <MoneyText v={r.s.outstanding} />, align: "right", sort: (r) => r.s.outstanding, exp: (r) => r.s.outstanding },
            { id: "overdue", header: "Overdue", cell: (r) => <MoneyText v={r.s.overdue} className={r.s.overdue > 0 ? "text-danger" : "text-muted-foreground"} />, align: "right", sort: (r) => r.s.overdue, exp: (r) => r.s.overdue },
            { id: "days", header: "Max days", cell: (r) => r.s.maxDaysOverdue || "—", align: "right", hide: "lg", sort: (r) => r.s.maxDaysOverdue },
            { id: "util", header: "Credit used", cell: (r) => { const u = (r.s.outstanding / r.c.creditLimit) * 100; return <div className="flex w-28 items-center gap-2"><Progress value={Math.min(100, u)} className={cn("h-1.5", u > 100 && "[&>div]:bg-danger")} /><span className={cn("w-9 text-right text-xs tabular", u > 100 && "text-danger")}>{u.toFixed(0)}%</span></div>; }, hide: "xl", sort: (r) => r.s.outstanding / r.c.creditLimit },
            { id: "risk", header: "Risk", cell: (r) => <RiskBadge band={r.s.band} score={r.s.risk} />, sort: (r) => r.s.risk, exp: (r) => r.s.band },
            { id: "status", header: "Status", cell: (r) => <StatusBadge status={r.c.status} />, hide: "xl", defaultHidden: true },
          ]}
        />
      </Page>
    </>
  );
}
export default function Route() { return <Suspense><Customers /></Suspense>; }
