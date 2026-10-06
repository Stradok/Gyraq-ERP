"use client";
import Link from "next/link";
import { idx } from "@/lib/data/queries";
import type { DocLine } from "@/lib/data/types";
import { money, money2, num } from "@/lib/format";
import { Mono } from "./status";
import { cn } from "@/lib/utils";

export function CustomerLink({ id, className }: { id: string; className?: string }) {
  const c = idx().cus.get(id);
  if (!c) return <span>—</span>;
  return <Link href={`/customers/${id}`} onClick={(e) => e.stopPropagation()} className={cn("hover:text-primary hover:underline", className)}>{c.name}</Link>;
}
export function SupplierLink({ id }: { id: string }) {
  const s = idx().sup.get(id);
  return s ? <Link href={`/suppliers/${id}`} onClick={(e) => e.stopPropagation()} className="hover:text-primary hover:underline">{s.name}</Link> : <span>—</span>;
}
export function ProductLink({ id }: { id: string }) {
  const p = idx().prod.get(id);
  return p ? <Link href={`/inventory/${id}`} onClick={(e) => e.stopPropagation()} className="hover:text-primary hover:underline">{p.name}</Link> : <span>—</span>;
}
export const whCode = (id: string) => idx().wh.get(id)?.code ?? id;
export const empName = (id: string) => idx().emp.get(id)?.name ?? "—";

export function MoneyText({ v, dp = 0, className }: { v: number; dp?: number; className?: string }) {
  return <span className={cn("tabular", className)}>{dp ? money2(v) : money(v)}</span>;
}

/** Document lines with pack display (CTN × pcs), price, discount, tax. */
export function LinesTable({ lines, showTax = true }: { lines: DocLine[]; showTax?: boolean }) {
  const { prod } = idx();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="px-4 py-2 font-medium">Product</th><th className="px-2 py-2 text-right font-medium">Qty</th><th className="hidden px-2 py-2 text-right font-medium md:table-cell">Cartons</th>
            <th className="px-2 py-2 text-right font-medium">Price</th><th className="hidden px-2 py-2 text-right font-medium md:table-cell">Discount</th>{showTax && <th className="hidden px-2 py-2 text-right font-medium lg:table-cell">Sales tax</th>}<th className="px-4 py-2 text-right font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const p = prod.get(l.productId)!;
            return (
              <tr key={i} className="border-b last:border-0">
                <td className="px-4 py-2"><Link href={`/inventory/${p.id}`} className="hover:text-primary hover:underline">{p.name}</Link>{l.free && <span className="ml-2 rounded border border-info/40 px-1 text-[10px] text-info">Free goods</span>}<div><Mono className="text-muted-foreground">{p.sku}</Mono></div></td>
                <td className="px-2 py-2 text-right tabular">{num(l.qty)}</td>
                <td className="hidden px-2 py-2 text-right tabular text-muted-foreground md:table-cell">{(l.qty / p.cartonSize).toFixed(l.qty % p.cartonSize ? 1 : 0)}</td>
                <td className="px-2 py-2 text-right tabular">{l.free ? "—" : money2(l.price)}</td>
                <td className="hidden px-2 py-2 text-right tabular text-muted-foreground md:table-cell">{l.discount ? money(l.discount) : "—"}</td>
                {showTax && <td className="hidden px-2 py-2 text-right tabular text-muted-foreground lg:table-cell">{l.salesTax ? money(l.salesTax) : "—"}</td>}
                <td className="px-4 py-2 text-right tabular font-medium">{money(l.value)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Totals({ rows }: { rows: { label: string; value: number; strong?: boolean; muted?: boolean }[] }) {
  return (
    <dl className="ml-auto w-full max-w-xs space-y-1.5 px-4 py-3 text-[13px]">
      {rows.filter((r) => r.value !== 0 || r.strong).map((r) => (
        <div key={r.label} className={cn("flex justify-between gap-6", r.strong && "border-t pt-2 text-sm font-semibold", r.muted && "text-muted-foreground")}>
          <dt>{r.label}</dt><dd className="tabular">{money2(r.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function KeyValue({ items, cols = 2 }: { items: [string, React.ReactNode][]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3 text-[13px]", cols === 1 && "grid-cols-1", cols === 2 && "grid-cols-1 sm:grid-cols-2", cols === 3 && "grid-cols-2 lg:grid-cols-3")}>
      {items.map(([k, v]) => (<div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="mt-0.5">{v ?? "—"}</dd></div>))}
    </dl>
  );
}
