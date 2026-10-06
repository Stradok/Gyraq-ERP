import Link from "next/link";
import { Sparkline } from "@/components/charts/charts";
import { Delta } from "./status";
import { cn } from "@/lib/utils";

export function Kpi({ label, value, sub, delta, good, spark, href, tone, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; delta?: number; good?: "up" | "down"; spark?: number[]; href?: string; tone?: "danger" | "warning" | "success"; className?: string }) {
  const body = (
    <div className={cn("group flex h-full flex-col justify-between gap-2 rounded-lg border bg-card p-3.5 transition-colors", href && "hover:border-primary/40 hover:bg-accent/30", className)}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        {delta !== undefined && <Delta value={delta} good={good} />}
      </div>
      <div>
        <div className={cn("whitespace-nowrap text-[21px] font-semibold leading-none tracking-tight tabular", tone === "danger" && "text-danger", tone === "warning" && "text-warning", tone === "success" && "text-success")}>{value}</div>
        {sub && <div className="mt-1.5 truncate text-[11px] text-muted-foreground">{sub}</div>}
      </div>
      {spark && <div className="-mb-1 h-6 w-full opacity-80"><Sparkline values={spark} height={24} /></div>}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}
