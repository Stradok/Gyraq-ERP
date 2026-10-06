"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { dateLong } from "@/lib/format";

export function useRange() {
  const sp = useSearchParams();
  const from = sp.get("from"), to = sp.get("to");
  const ok = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  return ok(from) && ok(to) ? { from: from!, to: to! } : null;
}
export const inRange = (d: string, r: { from: string; to: string } | null) => !r || (d >= r.from && d <= r.to);

export function RangeBanner({ range }: { range: { from: string; to: string } | null }) {
  const path = usePathname();
  if (!range) return null;
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-xs"><CalendarRange className="size-3.5 text-primary" /><span className="text-muted-foreground">Showing</span><b className="font-medium">{dateLong(range.from)} → {dateLong(range.to)}</b><Link href={path} className="ml-auto text-muted-foreground hover:text-foreground">Clear</Link></div>
  );
}
