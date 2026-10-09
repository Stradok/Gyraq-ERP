// Document extraction: schema the model must fill, arithmetic validators, and matching to ERP records.
import { z } from "zod";
import type { DB } from "../data/sim";

export const InvoiceExtraction = z.object({
  supplierName: z.string().describe("Name of the company that issued the invoice"),
  supplierNtn: z.string().nullable().describe("Supplier NTN like 1234567-8, or null if not printed"),
  invoiceNo: z.string().describe("The supplier's invoice number exactly as printed"),
  invoiceDate: z.string().describe("Invoice date as YYYY-MM-DD"),
  poReference: z.string().nullable().describe("Purchase order number the invoice refers to, or null"),
  lines: z.array(z.object({ description: z.string(), qty: z.number(), unitPrice: z.number(), amount: z.number() })).min(1),
  subtotal: z.number().describe("Total value excluding tax"),
  salesTax: z.number().describe("Sales tax amount, 0 if none"),
  total: z.number().describe("Grand total payable"),
});
export type InvoiceExtractionT = z.infer<typeof InvoiceExtraction>;

export interface Check { ok: boolean; label: string }
export function validateExtraction(x: InvoiceExtractionT): Check[] {
  const near = (a: number, b: number, tol = 1.5) => Math.abs(a - b) <= Math.max(tol, Math.abs(b) * 0.002);
  const lineSum = x.lines.reduce((s, l) => s + l.amount, 0);
  return [
    { ok: x.lines.every((l) => near(l.qty * l.unitPrice, l.amount, 2)), label: "Each line: quantity × price = amount" },
    { ok: near(lineSum, x.subtotal), label: `Lines add up to the subtotal (${lineSum.toFixed(2)} vs ${x.subtotal.toFixed(2)})` },
    { ok: near(x.subtotal + x.salesTax, x.total) || near(x.subtotal + x.salesTax + x.subtotal * 0.0011, x.total, x.total * 0.005), label: "Subtotal + taxes = total" },
    { ok: /^\d{4}-\d{2}-\d{2}$/.test(x.invoiceDate), label: "Invoice date is valid" },
    { ok: !x.supplierNtn || /^\d{7}-\d$/.test(x.supplierNtn), label: "Supplier NTN has a valid format" },
  ];
}

const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length > 1);
const overlap = (a: string, b: string) => { const A = new Set(tokens(a)), B = tokens(b); if (!A.size || !B.length) return 0; return B.filter((t) => A.has(t)).length / Math.max(A.size, B.length); };

export function matchSupplier(db: DB, x: InvoiceExtractionT) {
  const byNtn = x.supplierNtn ? db.suppliers.find((s) => s.ntn === x.supplierNtn) : undefined;
  if (byNtn) return { supplier: byNtn, how: "NTN" as const };
  const best = db.suppliers.map((s) => ({ s, sc: overlap(s.name, x.supplierName) })).sort((a, b) => b.sc - a.sc)[0];
  return best && best.sc >= 0.5 ? { supplier: best.s, how: "name" as const } : null;
}
export function matchProduct(db: DB, supplierId: string, description: string) {
  const mine = db.products.filter((p) => p.supplierId === supplierId);
  const pool = mine.length ? mine : db.products;
  const best = pool.map((p) => ({ p, sc: overlap(p.name, description) })).sort((a, b) => b.sc - a.sc)[0];
  return best && best.sc >= 0.5 ? { product: best.p, score: best.sc } : null;
}
export function matchPO(db: DB, supplierId: string, ref: string | null) {
  const open = db.pos.filter((p) => p.supplierId === supplierId && ["approved", "partially_received", "received"].includes(p.status));
  if (ref) { const norm = ref.replace(/\D/g, ""); const hit = open.find((p) => p.number.replace(/\D/g, "") === norm); if (hit) return hit; }
  return null;
}
