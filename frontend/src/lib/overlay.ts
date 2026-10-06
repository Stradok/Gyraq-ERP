"use client";
// Merges the session overlay (user actions) with the deterministic base dataset.
import { useMemo } from "react";
import { getDB, idx } from "./data/queries";
import type { Invoice, PurchaseOrder, SalesOrder } from "./data/types";
import { useMounted } from "./hooks";
import { useERP } from "./store";

export function useOverlay() {
  const s = useERP();
  const mounted = useMounted();
  return useMemo(() => {
    const db = getDB();
    const decisions = mounted ? s.decisions : {};
    const approvals = [...(mounted ? s.extraApprovals : []), ...db.approvals];
    const decisionFor = (type: string, ref: string) => { const a = approvals.find((x) => x.type === type && x.ref === ref); return a ? decisions[a.id] : undefined; };
    const poStatus = (po: PurchaseOrder): PurchaseOrder["status"] => {
      if (po.status !== "pending_approval") return po.status;
      const d = decisionFor("purchase_order", po.id);
      return d ? (d.decision === "approved" ? "approved" : "cancelled") : po.status;
    };
    const extra = mounted ? s.extraPOs : [];
    const pos = [...extra, ...db.pos].map((p) => ({ ...p, status: poStatus(p) }));
    const newlyApproved = pos.filter((p) => p.status === "approved" && (extra.some((e) => e.id === p.id) || db.pos.find((b) => b.id === p.id)?.status === "pending_approval"));
    const incoming = new Map<string, number>();
    for (const p of newlyApproved) for (const l of p.lines) incoming.set(`${l.productId}|${p.warehouseId}`, (incoming.get(`${l.productId}|${p.warehouseId}`) ?? 0) + l.qty);
    const payments = mounted ? s.extraPayments : [];
    const paidBy = new Map<string, number>();
    for (const p of payments) for (const a of p.allocations) paidBy.set(a.invoiceId, (paidBy.get(a.invoiceId) ?? 0) + a.amount);
    const orders: SalesOrder[] = [...(mounted ? s.extraOrders : []), ...db.orders];
    const invoice = (i: Invoice): Invoice => {
      const add = paidBy.get(i.id) ?? 0;
      if (!add) return i;
      const paid = i.paid + add;
      return { ...i, paid, paymentStatus: paid >= i.total - 0.5 ? "paid" : "partially_paid" };
    };
    const paidTotal = payments.reduce((a, p) => a + p.amount, 0);
    const cashIn = payments.filter((p) => p.method === "bank_transfer" || p.method === "cash").reduce((a, p) => a + p.amount, 0);
    return { pos, newlyApproved, incoming, payments, paidBy, invoice, orders, paidTotal, cashIn, approvals, decisions, mounted, idx: idx() };
  }, [s.extraPOs, s.extraApprovals, s.decisions, s.extraPayments, s.extraOrders, mounted]);
}
