// Pure pricing / tax / credit rules mirrored from docs/plan/05 (client-side preview; the backend owns the authoritative run).
import type { CreditCheck, Customer, DocLine, Product } from "./data/types";
import type { CustomerStats } from "./data/queries";
import { SCHEMES } from "./data/catalog";
import { getDB } from "./data/sim";

const CHANNEL_FACTOR: Record<Customer["channel"], number> = { modern_trade: 0.97, wholesale: 0.985, retail: 1, sub_distributor: 0.96, horeca: 1 };
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface PricedLine extends DocLine { cartons: number; trace: string[] }

export function priceLine(p: Product, c: Customer, cartons: number, discountPct = 0): PricedLine[] {
  const qty = cartons * p.cartonSize;
  const price = r2(p.price * CHANNEL_FACTOR[c.channel]);
  const gross = qty * price, disc = r2(gross * (discountPct / 100)), value = r2(gross - disc);
  const tax = p.taxCategory === "exempt" ? 0 : p.taxCategory === "standard" ? r2(value * 0.18) : r2(0.18 * p.mrp * qty);
  const trace = [`Price Rs ${price.toFixed(2)}/pc from ${c.channel.replace("_", " ")} price list (${p.price.toFixed(2)} × ${CHANNEL_FACTOR[c.channel]})`];
  if (discountPct) trace.push(`Line discount ${discountPct}%`);
  trace.push(p.taxCategory === "third_schedule" ? `Sales tax 18% on retail price Rs ${p.mrp} (Third Schedule)` : p.taxCategory === "exempt" ? "Exempt supply (Sixth Schedule)" : "Sales tax 18% on value");
  const out: PricedLine[] = [{ productId: p.id, qty, price, discount: disc, value, salesTax: tax, cartons, trace }];
  const sch = SCHEMES.find((s) => p.brand === s.productBrand && /Mineral Water|Masala Chips/.test(p.name));
  if (sch && cartons >= sch.buy) {
    const free = Math.floor(cartons / sch.buy) * sch.free;
    out.push({ productId: p.id, qty: free * p.cartonSize, price: 0, discount: 0, value: 0, salesTax: 0, free: true, schemeId: sch.id, cartons: free, trace: [`Scheme ${sch.name}: ${sch.buy}+${sch.free} free goods`] });
  }
  return out;
}

export function docTotals(lines: DocLine[], c: Customer) {
  const value = r2(lines.reduce((s, l) => s + l.value, 0));
  const discount = r2(lines.reduce((s, l) => s + l.discount, 0));
  const tax = r2(lines.reduce((s, l) => s + l.salesTax, 0));
  const st = getDB().settings;
  const further = !c.registered || !c.atl ? r2(value * st.furtherTaxRate) : 0;
  const wht = c.channel === "retail" || c.channel === "wholesale" || c.channel === "sub_distributor" ? r2((value + tax) * (c.atl ? st.wht236hAtl : c.channel === "retail" ? st.wht236hNonAtlRetail : st.wht236hNonAtlOther)) : 0;
  return { gross: r2(value + discount), discount, tax, further, wht, total: r2(value + tax + further + wht) };
}

export function creditCheck(c: Customer, s: CustomerStats, orderTotal: number, maxOverdue = getDB().settings.maxOverdueDays): CreditCheck {
  const exposure = s.outstanding + orderTotal;
  const reasons: string[] = [];
  let decision: CreditCheck["decision"] = "pass";
  if (c.status !== "active") { decision = "block"; reasons.push(`Customer is ${c.status.replace("_", " ")}`); }
  if (exposure > c.creditLimit) { decision = "block"; reasons.push(`Exposure Rs ${Math.round(exposure).toLocaleString("en-US")} exceeds limit Rs ${c.creditLimit.toLocaleString("en-US")}`); }
  if (s.maxDaysOverdue > maxOverdue) { decision = "block"; reasons.push(`Oldest invoice is ${s.maxDaysOverdue} days overdue (policy: ${maxOverdue})`); }
  if (s.bounces180 >= 2) reasons.push(`${s.bounces180} cheques bounced in the last 180 days`);
  if (decision === "pass" && (exposure > c.creditLimit * 0.9 || s.band === "high")) { decision = "warn"; reasons.push(s.band === "high" ? "Customer risk is high" : "Exposure above 90% of limit"); }
  if (!reasons.length) reasons.push("Within limit, no overdue invoices");
  return { decision, exposure, limit: c.creditLimit, overdueDays: s.maxDaysOverdue, reasons };
}
