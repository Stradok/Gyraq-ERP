"use client";
// Headless-light DataTable: sort, search, filter chips, saved views, column visibility, selection + bulk actions,
// keyboard navigation (j/k/↵), CSV export, pagination. Client-side over in-memory demo data; the same props
// map onto server-side pagination/filtering when the API arrives (docs/plan/08 §4).
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3, Download, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "./page-header";
import { cn } from "@/lib/utils";

export interface Col<T> {
  id: string;
  header: string;
  cell: (r: T) => React.ReactNode;
  sort?: (r: T) => string | number;
  exp?: (r: T) => string | number;
  align?: "right";
  className?: string;
  hide?: "md" | "lg" | "xl";
  defaultHidden?: boolean;
}
export interface FilterDef<T> { id: string; label: string; options: { value: string; label: string }[]; test: (r: T, v: string) => boolean }
export interface ViewDef { label: string; filters?: Record<string, string>; search?: string }

interface Props<T> {
  rows: T[];
  cols: Col<T>[];
  rowKey: (r: T) => string;
  searchText?: (r: T) => string;
  searchPlaceholder?: string;
  initialSearch?: string;
  filters?: FilterDef<T>[];
  initialFilters?: Record<string, string>;
  views?: ViewDef[];
  pageSize?: number;
  onRowClick?: (r: T) => void;
  rowHref?: (r: T) => string;
  toolbar?: React.ReactNode;
  bulk?: (selected: T[], clear: () => void) => React.ReactNode;
  defaultSort?: { id: string; dir: "asc" | "desc" };
  exportName?: string;
  empty?: string;
  footer?: (rows: T[]) => React.ReactNode;
  className?: string;
  flush?: boolean;
}

const HIDE = { md: "hidden md:table-cell", lg: "hidden lg:table-cell", xl: "hidden xl:table-cell" } as const;

export function DataTable<T>(p: Props<T>) {
  const { rows, cols, rowKey, pageSize = 25 } = p;
  const router = useRouter();
  const [q, setQ] = useState(p.initialSearch ?? "");
  const [fv, setFv] = useState<Record<string, string>>(p.initialFilters ?? {});
  const [sort, setSort] = useState(p.defaultSort ?? null);
  const [page, setPage] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(new Set(cols.filter((c) => c.defaultHidden).map((c) => c.id)));
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState(-1);
  const wrap = useRef<HTMLDivElement>(null);
  const [activeView, setActiveView] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = rows;
    if (needle && p.searchText) out = out.filter((r) => p.searchText!(r).toLowerCase().includes(needle));
    for (const f of p.filters ?? []) { const v = fv[f.id]; if (v && v !== "all") out = out.filter((r) => f.test(r, v)); }
    if (sort) {
      const c = cols.find((x) => x.id === sort.id);
      if (c?.sort) {
        const s = c.sort, d = sort.dir === "asc" ? 1 : -1;
        out = [...out].sort((a, b) => { const x = s(a), y = s(b); return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * d; });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, fv, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const view = filtered.slice(cur * pageSize, cur * pageSize + pageSize);
  const visCols = cols.filter((c) => !hidden.has(c.id));
  useEffect(() => { setPage(0); setFocus(-1); }, [q, fv, sort]);

  const open = (r: T) => { if (p.rowHref) router.push(p.rowHref(r)); else p.onRowClick?.(r); };
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("input, button, [role=checkbox]")) return;
    if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); setFocus((f) => Math.min(view.length - 1, f + 1)); }
    if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); setFocus((f) => Math.max(0, f - 1)); }
    if (e.key === "Enter" && focus >= 0 && view[focus]) open(view[focus]!);
    if (e.key === "x" && focus >= 0 && view[focus]) toggle(rowKey(view[focus]!));
  };
  const toggle = (k: string) => setSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const selected = rows.filter((r) => sel.has(rowKey(r)));
  const clear = () => setSel(new Set());

  const exportCsv = () => {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const head = visCols.map((c) => esc(c.header)).join(",");
    const body = filtered.map((r) => visCols.map((c) => esc(c.exp ? c.exp(r) : c.sort ? c.sort(r) : "")).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([`${head}\n${body}`], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `${p.exportName ?? "export"}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const applyView = (v: ViewDef | null) => { setActiveView(v?.label ?? null); setFv(v?.filters ?? {}); setQ(v?.search ?? ""); };

  return (
    <div className={cn("overflow-hidden rounded-lg border bg-card", p.className)}>
      {p.views && (
        <div className="flex gap-1 overflow-x-auto border-b px-2 py-1.5">
          {[{ label: "All" } as ViewDef, ...p.views].map((v) => {
            const on = (v.label === "All" && !activeView) || activeView === v.label;
            return <button key={v.label} onClick={() => applyView(v.label === "All" ? null : v)} className={cn("whitespace-nowrap rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground", on && "bg-accent font-medium text-foreground")}>{v.label}</button>;
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        {p.searchText && (
          <div className="relative w-full min-w-[160px] max-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setActiveView(null); }} placeholder={p.searchPlaceholder ?? "Search…"} className="h-8 pl-8 text-[13px]" />
          </div>
        )}
        {(p.filters ?? []).map((f) => (
          <Select key={f.id} value={fv[f.id] ?? "all"} onValueChange={(v) => { setFv((s) => ({ ...s, [f.id]: v })); setActiveView(null); }}>
            <SelectTrigger size="sm" className="h-8 w-auto min-w-[110px] gap-2 text-[13px]"><span className="text-muted-foreground">{f.label}:</span><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {f.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        ))}
        {(q || Object.values(fv).some((v) => v && v !== "all")) && (
          <Button variant="ghost" size="sm" onClick={() => { setQ(""); setFv({}); setActiveView(null); }}><X />Clear</Button>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {p.toolbar}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" size="sm"><Columns3 />Columns</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
              {cols.map((c) => (
                <DropdownMenuCheckboxItem key={c.id} checked={!hidden.has(c.id)} onCheckedChange={(v) => setHidden((h) => { const n = new Set(h); v ? n.delete(c.id) : n.add(c.id); return n; })} onSelect={(e) => e.preventDefault()}>{c.header}</DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download />Export</Button>
        </div>
      </div>
      {p.bulk && selected.length > 0 && (
        <div className="flex items-center gap-3 border-b bg-primary/5 px-3 py-1.5 text-xs">
          <span className="font-medium">{selected.length} selected</span>
          {p.bulk(selected, clear)}
          <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={clear}>Clear</button>
        </div>
      )}
      <div ref={wrap} tabIndex={0} onKeyDown={onKey} className="overflow-x-auto outline-none">
        <Table>
          <TableHeader>
            <TableRow className="bg-subtle hover:bg-subtle">
              {p.bulk && <TableHead className="w-8"><Checkbox checked={view.length > 0 && view.every((r) => sel.has(rowKey(r)))} onCheckedChange={(v) => setSel((s) => { const n = new Set(s); view.forEach((r) => (v ? n.add(rowKey(r)) : n.delete(rowKey(r)))); return n; })} /></TableHead>}
              {visCols.map((c) => (
                <TableHead key={c.id} className={cn("h-9 whitespace-nowrap text-xs font-medium text-muted-foreground", c.align === "right" && "text-right", c.hide && HIDE[c.hide], c.className)}>
                  {c.sort ? (
                    <button className={cn("inline-flex items-center gap-1 hover:text-foreground", c.align === "right" && "flex-row-reverse")} onClick={() => setSort((s) => (s?.id === c.id ? (s.dir === "asc" ? { id: c.id, dir: "desc" } : null) : { id: c.id, dir: "asc" }))}>
                      {c.header}
                      {sort?.id === c.id && (sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                    </button>
                  ) : c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.map((r, i) => {
              const k = rowKey(r), clickable = !!(p.rowHref || p.onRowClick);
              return (
                <TableRow key={k} data-state={sel.has(k) ? "selected" : undefined} onClick={() => open(r)} className={cn(clickable && "cursor-pointer", focus === i && "bg-accent/70 outline outline-1 -outline-offset-1 outline-primary/40")}>
                  {p.bulk && <TableCell onClick={(e) => e.stopPropagation()}><Checkbox checked={sel.has(k)} onCheckedChange={() => toggle(k)} /></TableCell>}
                  {visCols.map((c) => <TableCell key={c.id} className={cn("py-2 text-[13px]", c.align === "right" && "text-right tabular", c.hide && HIDE[c.hide], c.className)}>{c.cell(r)}</TableCell>)}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {view.length === 0 && <EmptyState title={p.empty ?? "Nothing matches"} body="Try clearing the search or filters." />}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
        <span>{filtered.length === rows.length ? `${filtered.length.toLocaleString("en-US")} rows` : `${filtered.length.toLocaleString("en-US")} of ${rows.length.toLocaleString("en-US")} rows`}</span>
        {p.footer && <span className="tabular text-foreground">{p.footer(filtered)}</span>}
        <div className="flex items-center gap-1">
          <span className="mr-2 tabular">Page {cur + 1} / {pages}</span>
          <Button variant="outline" size="icon-sm" disabled={cur === 0} onClick={() => setPage(cur - 1)} aria-label="Previous"><ChevronLeft /></Button>
          <Button variant="outline" size="icon-sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} aria-label="Next"><ChevronRight /></Button>
        </div>
      </div>
    </div>
  );
}
