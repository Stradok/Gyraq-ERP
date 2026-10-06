"use client";
// Demo "commands": the same path a human or an AI proposal takes (docs/plan/06 §7) – validate → create → approval → audit.
import { toast } from "sonner";
import { getDB, idx } from "./data/queries";
import type { Recommendation } from "./data/queries";
import type { Approval, AuditEvent, CustomerPayment, PurchaseOrder } from "./data/types";
import { useERP } from "./store";
import { PERSONAS, can } from "./rbac";
import { addDays } from "./data/dates";
import { money } from "./format";

const PO_APPROVAL_LIMIT = 1_000_000;
const now = () => new Date().toISOString();

function audit(action: string, entity: string, ref: string, source: AuditEvent["source"], detail?: string) {
  const st = useERP.getState();
  const actor = PERSONAS.find((p) => p.role === st.role)!.name;
  st.addAudit({ id: `au_new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, at: now(), actor, action, entity, ref, source, detail });
}

export function createPOFromRecommendation(rec: Recommendation, qty: number, source: "ai_proposal" | "user" = "ai_proposal") {
  const st = useERP.getState();
  const db = getDB();
  const sup = idx().sup.get(rec.supplierId)!;
  const n = 5000 + db.pos.length + st.extraPOs.length + 1;
  const price = Math.round(rec.unitCost * 100) / 100;
  const sub = Math.round(qty * price * 100) / 100;
  const po: PurchaseOrder = {
    id: `po_new_${n}`, number: `PO-${n}`, supplierId: rec.supplierId, warehouseId: rec.warehouseId, date: db.today, expectedDate: addDays(db.today, sup.leadTimeDays),
    status: "pending_approval", lines: [{ productId: rec.product.id, qty, price, received: 0 }], subtotal: sub, tax: Math.round(sub * 0.17 * 100) / 100, total: Math.round(sub * 1.17 * 100) / 100, source,
  };
  const needsOwner = po.total > PO_APPROVAL_LIMIT;
  const approval: Approval = {
    id: `apr_new_${n}`, type: "purchase_order", title: `Purchase order ${po.number} – ${sup.name}`, subtitle: `${rec.product.name} · ${qty.toLocaleString("en-US")} units${source === "ai_proposal" ? " · from AI recommendation" : ""}`,
    amount: po.total, requestedBy: PERSONAS.find((p) => p.role === st.role)!.name, requestedAt: db.today, status: "pending", ref: po.id, source: source === "ai_proposal" ? "ai" : "user", step: needsOwner ? "Owner" : "Procurement Manager",
  };
  st.addPO(po, approval);
  st.actRec(rec.id, "accepted");
  audit("ai_proposal.confirmed", "Purchase order", po.number, source === "ai_proposal" ? "ai_proposal" : "user", `Confirmed AI-proposed purchase order for ${rec.product.name}, ${money(po.total)}`);
  // auto-approve when the creator may approve and value is within limit
  if (!needsOwner && can(st.role, "approve.po")) {
    st.decide(approval.id, { decision: "approved", at: now(), by: PERSONAS.find((p) => p.role === st.role)!.name, comment: "Within approval limit" });
    audit("approval.approved", "Purchase order", po.number, "user", "Approved within procurement limit");
  }
  toast.success(`${po.number} created`, { description: needsOwner ? `Needs Owner approval (${money(po.total)} is above ${money(PO_APPROVAL_LIMIT)}).` : "Approved within your limit." });
  return { po, approval };
}

export function recordPayment(input: { customerId: string; amount: number; method: CustomerPayment["method"]; ref?: string }) {
  const st = useERP.getState();
  const db = getDB();
  const open = db.invoices.filter((i) => i.customerId === input.customerId && i.total - i.paid > 0.5).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const paidBy = new Map<string, number>();
  for (const p of st.extraPayments) for (const a of p.allocations) paidBy.set(a.invoiceId, (paidBy.get(a.invoiceId) ?? 0) + a.amount);
  let left = input.amount;
  const allocations: CustomerPayment["allocations"] = [];
  for (const i of open) {
    if (left <= 0) break;
    const bal = i.total - i.paid - (paidBy.get(i.id) ?? 0);
    if (bal <= 0.5) continue;
    const a = Math.min(bal, left);
    allocations.push({ invoiceId: i.id, amount: Math.round(a * 100) / 100 }); left -= a;
  }
  const n = 4000 + db.payments.length + st.extraPayments.length + 1;
  const pay: CustomerPayment = { id: `pay_new_${n}`, number: `RCP-${n}`, customerId: input.customerId, date: db.today, method: input.method, amount: input.amount - Math.max(0, left), status: input.method === "pdc" ? "in_hand" : input.method === "cheque" ? "deposited" : "cleared", chequeNo: input.ref, allocations };
  st.addPayment(pay);
  audit("payment.recorded", "Payment", pay.number, "user", `${money(pay.amount)} from ${idx().cus.get(input.customerId)!.name}, allocated to ${allocations.length} invoice(s)`);
  toast.success(`${pay.number} recorded`, { description: `${money(pay.amount)} allocated to ${allocations.length} oldest invoice${allocations.length === 1 ? "" : "s"}.` });
  return pay;
}
