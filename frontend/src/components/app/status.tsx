import { cn } from "@/lib/utils";
import { titleCase } from "@/lib/format";

type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "ai";
const MAP: Record<string, Tone> = {
  paid: "success", cleared: "success", active: "success", approved: "success", received: "success", posted: "success", fulfilled: "success", accepted: "success", reimbursed: "success", finance_approved: "success", matched: "success", simulated: "info", delivered: "success", low: "success", ok: "success", high: "danger", "": "neutral",
  partially_paid: "warning", pending: "warning", pending_approval: "warning", partially_received: "warning", partially_fulfilled: "warning", manager_approved: "warning", suggested: "ai", deposited: "info", in_hand: "info", medium: "warning", on_hold: "warning", expiring: "warning", submitted: "warning", pending_match: "warning", probation: "warning", on_leave: "info", proposal: "info", negotiation: "warning", qualified: "info", new: "neutral", won: "success", lost: "neutral",
  overdue: "danger", bounced: "danger", blocked: "danger", rejected: "danger", exception: "danger", out: "danger", critical: "danger", failed: "danger", unmatched: "danger", block: "danger", warn: "warning", pass: "success",
  confirmed: "info", reserved: "info", sent: "info", in_transit: "info", unpaid: "neutral", excess: "info",
  draft: "neutral", closed: "neutral", cancelled: "neutral", expired: "neutral", void: "neutral",
};
const DOT: Record<Tone, string> = { success: "bg-success", warning: "bg-warning", danger: "bg-danger", info: "bg-info", neutral: "bg-muted-foreground/50", ai: "bg-ai" };
const TEXT: Record<Tone, string> = { success: "text-success", warning: "text-warning", danger: "text-danger", info: "text-info", neutral: "text-muted-foreground", ai: "text-ai" };

export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  const tone = MAP[status] ?? "neutral";
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium", TEXT[tone], className)}>
      <span className={cn("size-1.5 rounded-full", DOT[tone])} />
      {label ?? titleCase(status)}
    </span>
  );
}

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-mono text-xs", className)}>{children}</span>;
}

export function Delta({ value, good = "up", dp = 1, suffix = "%" }: { value: number; good?: "up" | "down"; dp?: number; suffix?: string }) {
  if (!Number.isFinite(value)) return null;
  const up = value > 0.05, down = value < -0.05;
  const positive = good === "up" ? up : down;
  const negative = good === "up" ? down : up;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium tabular", positive && "text-success", negative && "text-danger", !positive && !negative && "text-muted-foreground")}>
      {up ? "▲" : down ? "▼" : "–"} {Math.abs(value).toFixed(dp)}{suffix}
    </span>
  );
}

export function RiskBadge({ band, score }: { band: "low" | "medium" | "high"; score?: number }) {
  return <span className="inline-flex items-center gap-1.5"><StatusBadge status={band} label={`${titleCase(band)} risk`} />{score != null && <span className="text-xs text-muted-foreground tabular">{score}</span>}</span>;
}
