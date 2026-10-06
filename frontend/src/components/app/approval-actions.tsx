"use client";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PERSONAS, can } from "@/lib/rbac";
import { useERP } from "@/lib/store";
import type { Approval } from "@/lib/data/types";

export function canDecide(role: ReturnType<typeof useERP.getState>["role"], a: Approval): boolean {
  switch (a.type) {
    case "purchase_order": return can(role, "approve.po");
    case "expense": return can(role, "approve.expense");
    case "credit_limit": case "credit_override": return can(role, "approve.credit");
    case "bill_variance": case "stock_adjustment": return can(role, "approve.finance");
    case "ai_recommendation": return can(role, "ai.confirm");
    default: return role !== "employee" && role !== "rep";
  }
}

export function ApprovalButtons({ approval, size = "sm", onDone }: { approval: Approval; size?: "sm" | "default"; onDone?: () => void }) {
  const { role, decide, addAudit } = useERP();
  const me = PERSONAS.find((p) => p.role === role)!;
  const ok = canDecide(role, approval);
  const act = (decision: "approved" | "rejected") => {
    decide(approval.id, { decision, at: new Date().toISOString(), by: me.name });
    addAudit({ id: `au_new_${Date.now()}`, at: new Date().toISOString(), actor: me.name, action: `approval.${decision}`, entity: approval.type.replace("_", " "), ref: approval.title, source: approval.source === "ai" ? "ai_proposal" : "user", detail: `${decision === "approved" ? "Approved" : "Rejected"} (${approval.step} step)` });
    toast[decision === "approved" ? "success" : "message"](decision === "approved" ? "Approved" : "Rejected", { description: approval.title });
    onDone?.();
  };
  if (!ok) return <span className="text-xs text-muted-foreground" title="Switch persona to act on this">Needs {approval.step}</span>;
  return (
    <div className="flex gap-1.5">
      <Button size={size} onClick={() => act("approved")}><Check />Approve</Button>
      <Button size={size} variant="outline" onClick={() => act("rejected")}><X />Reject</Button>
    </div>
  );
}
