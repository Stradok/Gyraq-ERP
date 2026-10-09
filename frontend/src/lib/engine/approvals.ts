import { recommendations } from "../data/queries";
import type { Approval, Expense } from "../data/types";
import { can, type Role } from "../rbac";
import { applyAdjustment } from "./inventory";
import { applyCount } from "./inventory";
import { audit, fail, money, newId, notify, ok, postJE, assertPostable, type Ctx, type Result } from "./core";
import { confirmOrder, } from "./sales";
import { approvePOEffects, createPO, resolveBill } from "./purchasing";

export function canDecide(role: Role, type: Approval["type"]): boolean {
  switch (type) {
    case "purchase_order": return can(role, "approve.po");
    case "expense": return can(role, "approve.expense");
    case "credit_limit": case "credit_override": return can(role, "approve.credit");
    case "bill_variance": case "stock_adjustment": case "journal": return can(role, "approve.finance");
    case "ai_recommendation": return can(role, "ai.confirm");
    default: return role !== "employee" && role !== "rep";
  }
}
const EXPENSE_GL: Record<string, string> = { Fuel: "6040", Travel: "6100", Meals: "6100", Office: "6110", Repairs: "6060", Telephone: "6070", Entertainment: "6100" };
export const EXPENSE_FINANCE_LIMIT = 25_000;

function finishExpense(ctx: Ctx, e: Expense) {
  const blocked = assertPostable(ctx.db, ctx.date);
  if (blocked) return blocked;
  e.status = "finance_approved";
  postJE(ctx, `Expense ${e.number}: ${e.merchant}`, `Expense ${e.number}`, [{ account: EXPENSE_GL[e.category] ?? "6990", debit: e.amount, credit: 0 }, { account: "2210", debit: 0, credit: e.amount }]);
  return null;
}

export function decideApproval(ctx: Ctx, p: { id: string; decision: "approved" | "rejected"; comment?: string }): Result {
  const db = ctx.db;
  const a = db.approvals.find((x) => x.id === p.id);
  if (!a) return fail("APR_NOT_FOUND", "Approval not found", "It may have been decided already.", "Refresh the inbox.");
  if (a.status !== "pending") return fail("APR_DECIDED", "Already decided", `This request was ${a.status}.`, "Refresh the inbox.");
  if (!canDecide(ctx.role, a.type)) return fail("PERM", "This isn't yours to approve", `It needs ${a.step}.`, "Switch to a user with that role.");
  if (a.requestedBy === ctx.actor) return fail("APR_SOD", "You can't approve your own request", "Segregation of duties: someone else must approve what you submitted.", "Ask a colleague with the right role to approve it.");
  const approve = p.decision === "approved";
  const done = () => { a.status = p.decision; a.decidedBy = ctx.actor; a.decidedAt = ctx.now; a.comment = p.comment; };
  const log = (action: string, detail?: string) => audit(ctx, action, a.type.replace(/_/g, " "), a.title, detail ?? (p.comment || undefined));
  switch (a.type) {
    case "purchase_order": {
      const po = db.pos.find((x) => x.id === a.ref);
      if (!po || po.status !== "pending_approval") return fail("PO_STATE", "Purchase order changed", "It is no longer waiting for approval.", "Open the order.");
      if (approve) approvePOEffects(db, po); else po.status = "cancelled";
      done(); log(approve ? "approval.approved" : "approval.rejected", `${po.number} ${approve ? "approved" : "rejected"} (${a.step})`);
      if (approve) notify(ctx, `Purchase order approved: ${po.number}`, "Incoming stock and the cash forecast were updated.", "success", `/purchasing/orders/${po.id}`);
      return ok(undefined, approve ? `${po.number} approved. Incoming stock, cash forecast and supplier commitments updated.` : `${po.number} rejected`);
    }
    case "bill_variance": { const r = resolveBill(ctx, { billId: a.ref, decision: approve ? "approve" : "reject", comment: p.comment }); if (r.ok) { done(); } return r; }
    case "credit_limit": {
      const c = db.customers.find((x) => x.id === a.ref);
      if (!c) return fail("CUS_NOT_FOUND", "Customer not found", "It may have been removed.", "Refresh the inbox.");
      if (approve) { if (a.title.startsWith("Credit hold")) { c.status = "on_hold"; c.holdReason = a.subtitle; } else if (a.payload?.newLimit != null) c.creditLimit = Number(a.payload.newLimit); else c.creditLimit = a.amount ?? c.creditLimit; }
      done(); log(approve ? "approval.approved" : "approval.rejected", `${c.name}: ${approve ? (a.title.startsWith("Credit hold") ? "on hold" : `limit ${money(c.creditLimit)}`) : "no change"}`);
      return ok(undefined, approve ? (a.title.startsWith("Credit hold") ? `${c.name} placed on credit hold` : `${c.name}'s credit limit is now ${money(c.creditLimit)}`) : "Request rejected");
    }
    case "credit_override": {
      if (approve) { const r = confirmOrder(ctx, { orderId: a.ref, override: true }); if (!r.ok && db.orders.some((o) => o.id === a.ref)) return r; }
      done(); log(approve ? "approval.approved" : "approval.rejected", "Credit override");
      return ok(undefined, approve ? "Override approved and the order confirmed" : "Override rejected");
    }
    case "stock_adjustment": {
      if (approve) {
        if (a.payload?.countId) { const r = applyCount(ctx, String(a.payload.countId)); if (!r.ok) return r; }
        else if (a.payload?.productId) { const r = applyAdjustment(ctx, { productId: String(a.payload.productId), warehouseId: String(a.payload.warehouseId), qtyDelta: Number(a.payload.qtyDelta), reason: String(a.payload.reason) }); if (!r.ok) return r; }
      }
      done(); log(approve ? "approval.approved" : "approval.rejected"); return ok(undefined, approve ? "Adjustment approved and posted" : "Adjustment rejected");
    }
    case "journal": {
      if (approve && a.payload?.lines) { const lines = JSON.parse(String(a.payload.lines)); const date = String(a.payload.date); const blocked = assertPostable(db, ctx.date, can(ctx.role, "period.close")); if (blocked) return blocked; postJE(ctx, String(a.payload.memo), "Manual journal", lines, "manual", date); }
      done(); log(approve ? "approval.approved" : "approval.rejected"); return ok(undefined, approve ? "Journal approved and posted" : "Journal rejected");
    }
    case "expense": {
      const e = db.expenses.find((x) => x.id === a.ref);
      if (!e) { done(); return ok(undefined, "Recorded"); }
      if (!approve) { e.status = "rejected"; done(); log("approval.rejected", `${e.number} rejected`); return ok(undefined, `${e.number} rejected`); }
      if (a.step === "Line manager" && (e.amount > EXPENSE_FINANCE_LIMIT || e.flags.length)) {
        e.status = "manager_approved";
        db.approvals.unshift({ id: newId("apr"), type: "expense", title: a.title, subtitle: `${a.subtitle} · manager approved`, amount: e.amount, requestedBy: a.requestedBy, requestedAt: ctx.date, status: "pending", ref: e.id, source: "user", step: "Finance Manager" });
        done(); log("approval.approved", `${e.number} → Finance`); return ok(undefined, `${e.number} approved by the manager and sent to Finance`);
      }
      const blocked = finishExpense(ctx, e);
      if (blocked) return blocked;
      done(); log("approval.approved", `${e.number} finance approved ${money(e.amount)}`); return ok(undefined, `${e.number} approved and posted (${money(e.amount)})`);
    }
    case "leave": {
      const l = db.leaves.find((x) => x.id === a.ref);
      if (l) l.status = approve ? "approved" : "rejected";
      done(); log(approve ? "approval.approved" : "approval.rejected"); return ok(undefined, approve ? "Leave approved" : "Leave rejected");
    }
    case "ai_recommendation": {
      if (approve) {
        const rec = recommendations().find((r) => r.product.name.startsWith("NestFresh Mineral Water 1L")) ?? recommendations()[0];
        if (rec) { const r = createPO({ ...ctx, source: "ai_proposal" }, { supplierId: rec.supplierId, warehouseId: rec.warehouseId, lines: [{ productId: rec.product.id, cartons: rec.recommendedCartons, price: Math.round(rec.unitCost * 100) / 100 }], source: "ai_proposal" }); if (!r.ok) return r; done(); log("ai_proposal.confirmed", r.message); return ok(undefined, r.message); }
      }
      done(); log(approve ? "approval.approved" : "approval.rejected"); return ok(undefined, approve ? "Recommendation accepted" : "Recommendation dismissed");
    }
  }
}
