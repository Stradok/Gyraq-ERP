"use client";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { run } from "@/lib/engine/client";
import { canDecide as canDecideRole } from "@/lib/engine/approvals";
import { useERP } from "@/lib/store";
import type { Approval } from "@/lib/data/types";
import type { Role } from "@/lib/rbac";

export function canDecide(role: Role, a: Approval): boolean { return canDecideRole(role, a.type); }

export function ApprovalButtons({ approval, size = "sm", onDone }: { approval: Approval; size?: "sm" | "default"; onDone?: () => void }) {
  const role = useERP((s) => s.role);
  if (!canDecide(role, approval)) return <span className="text-xs text-muted-foreground" title="Switch persona to act on this">Needs {approval.step}</span>;
  const act = (decision: "approved" | "rejected") => { const r = run("DecideApproval", { id: approval.id, decision }); if (r.ok) onDone?.(); };
  return (
    <div className="flex gap-1.5">
      <Button size={size} onClick={() => act("approved")}><Check />Approve</Button>
      <Button size={size} variant="outline" onClick={() => act("rejected")}><X />Reject</Button>
    </div>
  );
}
