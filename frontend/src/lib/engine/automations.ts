import type { AutomationRule } from "../data/types";
import { audit, money, newId, notify, type Ctx } from "./core";

export type AutoEvent = AutomationRule["event"];
const test = (op: AutomationRule["op"], a: number, b: number) => (op === "any" ? true : op === "gt" ? a > b : op === "gte" ? a >= b : op === "lt" ? a < b : a <= b);

/** Evaluate enabled workflow rules for an event. Rules can notify or request approval; they never post money themselves. */
export function runAutomations(ctx: Ctx, event: AutoEvent, facts: { amount?: number; ref: string; label: string; href: string }) {
  for (const r of ctx.db.rules) {
    if (!r.enabled || r.event !== event) continue;
    if (!test(r.op, facts.amount ?? 0, r.value)) continue;
    r.runs++;
    const title = `${r.name}: ${facts.label}`;
    if (r.action === "require_approval") {
      ctx.db.approvals.unshift({ id: newId("apr"), type: "journal", title, subtitle: `Rule ${r.id} requires review (${facts.amount ? money(facts.amount) : "n/a"})`, amount: facts.amount ?? null, requestedBy: "Workflow", requestedAt: ctx.date, status: "pending", ref: facts.ref, source: "user", step: r.target === "owner" ? "Owner" : "Finance Manager" });
    } else {
      notify(ctx, title, r.action === "create_task" ? `Task for ${r.target}: follow up on ${facts.label}` : r.action === "create_recommendation" ? `Replenishment review suggested for ${facts.label}` : `Rule ${r.id} matched${facts.amount ? ` (${money(facts.amount)})` : ""}.`, "warning", facts.href);
    }
    audit({ ...ctx, source: "workflow" }, "workflow.ran", "Workflow", r.id, title);
  }
}
