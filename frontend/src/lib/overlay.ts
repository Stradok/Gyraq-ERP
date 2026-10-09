"use client";
// Compatibility shim. State now lives in the DB itself (commands mutate it), so there is no overlay to merge.
// Kept so pages written against useOverlay() keep working; new code should read getDB() / queries directly.
import { getDB, idx } from "./data/queries";
import type { Invoice } from "./data/types";
import { useWorld } from "./store";

export function useOverlay() {
  useWorld((s) => s.version);
  const db = getDB();
  const decisions: Record<string, { decision: "approved" | "rejected"; by: string; at: string; comment?: string }> = {};
  for (const a of db.approvals) if (a.status !== "pending" && a.decidedAt) decisions[a.id] = { decision: a.status as "approved" | "rejected", by: a.decidedBy ?? "", at: a.decidedAt, comment: a.comment };
  return { pos: db.pos, newlyApproved: [] as typeof db.pos, incoming: new Map<string, number>(), payments: [] as typeof db.payments, paidBy: new Map<string, number>(), invoice: (i: Invoice) => i, orders: db.orders, paidTotal: 0, cashIn: 0, approvals: db.approvals, decisions, mounted: true, idx: idx() };
}
