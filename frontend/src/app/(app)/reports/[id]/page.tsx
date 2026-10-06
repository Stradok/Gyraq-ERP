"use client";
import { useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { Bars } from "@/components/charts/charts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getDB } from "@/lib/data/queries";
import { money, moneyM, num } from "@/lib/format";
import { PRESETS, REPORTS, runReport, type ReportRow } from "@/lib/reports";

export default function ReportView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sp = useSearchParams();
  const def = REPORTS.find((r) => r.id === id);
  const t = getDB().today;
  const presets = PRESETS(t);
  const [p, setP] = useState(sp.get("from") && sp.get("to") ? "custom" : "90");
  const cf = sp.get("from"), ct = sp.get("to");
  const custom = cf && ct && /^\d{4}-\d{2}-\d{2}$/.test(cf) && /^\d{4}-\d{2}-\d{2}$/.test(ct) ? { id: "custom", label: `${cf} to ${ct}`, from: cf, to: ct } : null;
  const range = custom && p === "custom" ? custom : presets.find((x) => x.id === (p === "custom" ? "90" : p))!;
  const out = useMemo(() => (def ? runReport(def.id, range.from, range.to) : null), [def, range.from, range.to]);
  if (!def || !out) return <Page><p className="text-sm text-muted-foreground">Report not found.</p></Page>;
  const fmt = (k: string, v: number) => (k === "money" ? money(v) : k === "pct" ? `${v.toFixed(1)}%` : num(v));
  const keys = ["a", "b", "c", "d"] as const;
  const top = [...out.rows].sort((x, y) => y[out.chartKey] - x[out.chartKey]).slice(0, 10);
  const needsRange = !["inventory-valuation", "inventory-aging", "supplier-performance"].includes(def.id);
  return (
    <>
      <PageHeader back={{ href: "/reports", label: "Reports" }} title={def.name} description={def.description} actions={needsRange && <Select value={p} onValueChange={setP}><SelectTrigger size="sm" className="w-44"><SelectValue /></SelectTrigger><SelectContent>{custom && <SelectItem value="custom">{custom.label}</SelectItem>}{presets.map((x) => <SelectItem key={x.id} value={x.id}>{x.label}</SelectItem>)}</SelectContent></Select>} />
      <Page>
        {out.kinds[0] === "money" && <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-md border bg-card px-4 py-3 text-[13px]"><span className="text-muted-foreground">{range.label ?? ""} · {range.from} → {range.to}</span><span>{out.cols[0]} total <b className="tabular">{money(out.rows.reduce((s, r) => s + r.a, 0))}</b></span><span className="text-muted-foreground">{out.rows.length} rows</span></div>}
        <Section title="Top 10" description={out.cols[out.chartKey === "a" ? 0 : 1]}><Bars layout="vertical" height={Math.max(180, top.length * 28)} data={top.map((r) => ({ label: r.label.length > 22 ? r.label.slice(0, 21) + "…" : r.label, v: r[out.chartKey] }))} xKey="label" series={[{ key: "v", label: out.cols[out.chartKey === "a" ? 0 : 1] }]} fmt={out.kinds[out.chartKey === "a" ? 0 : 1] === "money" ? moneyM : (n) => (out.kinds[1] === "pct" ? `${n.toFixed(0)}%` : num(n))} /></Section>
        <DataTable<ReportRow> rows={out.rows} rowKey={(r) => r.key} onRowClick={(r) => { if (r.href) router.push(r.href); }} exportName={def.id} searchText={(r) => `${r.label} ${r.sub ?? ""}`} pageSize={20} defaultSort={{ id: "a", dir: "desc" }}
          cols={[{ id: "label", header: "Name", cell: (r) => <div><div className="font-medium">{r.label}</div>{r.sub && <div className="text-xs text-muted-foreground">{r.sub}</div>}</div>, sort: (r) => r.label, exp: (r) => r.label }, ...keys.map((k, i) => ({ id: k, header: out.cols[i]!, cell: (r: ReportRow) => fmt(out.kinds[i]!, r[k]), align: "right" as const, sort: (r: ReportRow) => r[k], exp: (r: ReportRow) => r[k] }))]} />
      </Page>
    </>
  );
}
