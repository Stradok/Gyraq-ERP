// Controlled query layer (docs/plan/06 §5): natural language → structured intent → typed filters.
// Never SQL, never executed by an LLM. Deterministic pre-parser first; an LLM parser can emit the same intent shape later.
import { customerStats, idx, type CustomerStats } from "./data/queries";
import type { Customer } from "./data/types";

export interface CustomerFilter { overdue?: boolean; city?: string; minBalance?: number; minDays?: number; band?: string; channel?: string; q?: string }
export interface Interpreted { entity: "customers" | "invoices" | "products"; chips: string[]; href: string; count: number }

export interface CustomerRow { c: Customer; s: CustomerStats }
export function customerRows(): CustomerRow[] {
  return idx().db.customers.map((c) => ({ c, s: customerStats(c.id) }));
}
export function filterCustomers(f: CustomerFilter): CustomerRow[] {
  return customerRows().filter(({ c, s }) => {
    if (f.overdue && s.overdue <= 0) return false;
    if (f.city && c.city.toLowerCase() !== f.city.toLowerCase()) return false;
    if (f.minBalance && s.outstanding < f.minBalance) return false;
    if (f.minDays && s.maxDaysOverdue < f.minDays) return false;
    if (f.band && s.band !== f.band) return false;
    if (f.channel && c.channel !== f.channel) return false;
    if (f.q && !`${c.name} ${c.code} ${c.city} ${c.area}`.toLowerCase().includes(f.q.toLowerCase())) return false;
    return true;
  });
}

const UNITS: Record<string, number> = { k: 1e3, thousand: 1e3, lakh: 1e5, lac: 1e5, m: 1e6, million: 1e6, mn: 1e6, crore: 1e7, cr: 1e7 };
export function parseAmount(s: string): number | null {
  const m = s.match(/(?:over|above|more than|greater than|exceeding|>)\s*(?:pkr|rs\.?)?\s*([\d,.]+)\s*(k|thousand|lakh|lac|million|mn|m|crore|cr)?\b/i);
  if (!m) return null;
  const n = parseFloat(m[1]!.replace(/,/g, ""));
  return Number.isFinite(n) ? n * (UNITS[(m[2] ?? "").toLowerCase()] ?? 1) : null;
}

export function interpret(q: string): Interpreted | null {
  const s = q.toLowerCase();
  if (s.length < 6) return null;
  const cities = [...new Set(idx().db.customers.map((c) => c.city))];
  const city = cities.find((c) => s.includes(c.toLowerCase()));
  const days = s.match(/(\d{2,3})\s*\+?\s*days/) ?? s.match(/(?:more than|over|beyond)\s*(\d{2,3})\s*days/);
  const amount = /\bdays\b/.test(s) ? parseAmount(s.replace(/(?:more than|over|beyond)\s*\d{2,3}\s*days/, "")) : parseAmount(s);
  const isCustomers = /customer|owe|debtor|retailer|receivable|overdue/.test(s) && !/invoice/.test(s);
  if (isCustomers) {
    const f: CustomerFilter = {};
    const chips: string[] = [];
    const p = new URLSearchParams();
    if (/overdue|late|past due|owe/.test(s)) { f.overdue = true; chips.push("Overdue"); p.set("overdue", "1"); }
    if (city) { f.city = city; chips.push(`City = ${city}`); p.set("city", city); }
    if (amount) { f.minBalance = amount; chips.push(`Balance > Rs ${amount.toLocaleString("en-US")}`); p.set("minBalance", String(amount)); }
    if (days) { f.minDays = +days[1]!; chips.push(`Overdue ≥ ${days[1]} days`); p.set("minDays", days[1]!); }
    if (/risky|high risk|risk/.test(s)) { f.band = "high"; chips.push("Risk = High"); p.set("band", "high"); }
    if (!chips.length) return null;
    return { entity: "customers", chips, href: `/customers?${p}`, count: filterCustomers(f).length };
  }
  return null;
}
