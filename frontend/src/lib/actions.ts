"use client";
// Thin wrappers used by AI proposals and recommendation cards. All real work happens in the command engine.
import type { Recommendation } from "./data/queries";
import { run } from "./engine/client";
import type { CustomerPayment } from "./data/types";
import { useERP } from "./store";

export function createPOFromRecommendation(rec: Recommendation, qty: number, source: "ai_proposal" | "user" = "ai_proposal") {
  const cartons = Math.max(1, Math.round(qty / rec.product.cartonSize));
  const res = run("CreatePO", { supplierId: rec.supplierId, warehouseId: rec.warehouseId, lines: [{ productId: rec.product.id, cartons, price: Math.round(rec.unitCost * 100) / 100 }], source }, { source });
  if (res.ok) useERP.getState().actRec(rec.id, "accepted");
  return res as ReturnType<typeof run> & { ok: boolean; value?: { id: string; status: string } };
}

export function recordPayment(input: { customerId: string; amount: number; method: CustomerPayment["method"]; ref?: string }) {
  return run("RecordPayment", { customerId: input.customerId, amount: input.amount, method: input.method, chequeNo: input.ref });
}
