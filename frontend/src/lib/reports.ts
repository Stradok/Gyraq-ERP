import { addDays, diffDays } from "./data/dates";
import { expiryRisk, getDB, idx, salesBy, stockRows, supplierStats } from "./data/queries";
import type { ISODate } from "./data/types";

export interface ReportDef { id: string; name: string; group: "Sales" | "Inventory" | "Purchasing" | "Finance"; description: string; href?: string }
export const REPORTS: ReportDef[] = [
  { id: "sales-by-customer", name: "Sales by customer", group: "Sales", description: "Revenue, margin and volume per customer" },
  { id: "sales-by-product", name: "Sales by product", group: "Sales", description: "Revenue, units and margin per SKU" },
  { id: "sales-by-region", name: "Sales by region", group: "Sales", description: "Revenue by city and province" },
  { id: "sales-by-rep", name: "Sales by representative", group: "Sales", description: "Revenue and customer count per order booker" },
  { id: "gross-margin", name: "Gross margin", group: "Sales", description: "Margin by category and brand" },
  { id: "inventory-valuation", name: "Inventory valuation", group: "Inventory", description: "Stock value by warehouse and category (ties to GL 1300)" },
  { id: "inventory-aging", name: "Inventory aging", group: "Inventory", description: "Batches by remaining shelf life" },
  { id: "stock-movement", name: "Stock movement", group: "Inventory", description: "Units received and issued per product" },
  { id: "purchase-analysis", name: "Purchase analysis", group: "Purchasing", description: "Receipts by supplier and category" },
  { id: "supplier-performance", name: "Supplier performance", group: "Purchasing", description: "Lead time, on-time delivery and bill issues" },
  { id: "ar-aging", name: "AR aging", group: "Finance", description: "Receivables by days past due", href: "/finance/receivables" },
  { id: "ap-aging", name: "AP aging", group: "Finance", description: "Payables by due date", href: "/finance/payables" },
  { id: "cash-flow", name: "Cash flow", group: "Finance", description: "Indirect cash flow and 13-week forecast", href: "/finance/cashflow" },
  { id: "pnl", name: "Profit & Loss", group: "Finance", description: "Monthly income statement with drill-down", href: "/finance/statements" },
  { id: "balance-sheet", name: "Balance sheet", group: "Finance", description: "Assets, liabilities and equity", href: "/finance/statements" },
];

export interface ReportRow { key: string; label: string; sub?: string; a: number; b: number; c: number; d: number; href?: string }
export interface ReportOut { cols: [string, string, string, string]; kinds: ("money" | "num" | "pct" | "text")[]; rows: ReportRow[]; chartKey: "a" | "b" }

export function runReport(id: string, from: ISODate, to: ISODate): ReportOut {
  const db = getDB();
  const { cus, prod, sup, wh, emp } = idx();
  const t = db.today;
  const margin = (r: number, c: number) => (r ? ((r - c) / r) * 100 : 0);
  switch (id) {
    case "sales-by-customer": {
      const m = salesBy(from, to, (i) => i.customerId);
      return { cols: ["Revenue", "Gross margin %", "Units", "Orders"], kinds: ["money", "pct", "num", "num"], chartKey: "a", rows: [...m].map(([k, v]) => ({ key: k, label: cus.get(k)!.name, sub: cus.get(k)!.city, a: v.revenue, b: margin(v.revenue, v.cost), c: v.qty, d: db.invoices.filter((i) => i.customerId === k && i.date >= from && i.date <= to).length, href: `/customers/${k}` })) };
    }
    case "sales-by-product": {
      const m = salesBy(from, to, (_, l) => (l.free ? null : l.productId));
      return { cols: ["Revenue", "Gross margin %", "Units", "Avg price"], kinds: ["money", "pct", "num", "money"], chartKey: "a", rows: [...m].map(([k, v]) => ({ key: k, label: prod.get(k)!.name, sub: prod.get(k)!.sku, a: v.revenue, b: margin(v.revenue, v.cost), c: v.qty, d: v.qty ? v.revenue / v.qty : 0, href: `/inventory/${k}` })) };
    }
    case "sales-by-region": {
      const m = salesBy(from, to, (i) => cus.get(i.customerId)!.city);
      return { cols: ["Revenue", "Gross margin %", "Units", "Customers"], kinds: ["money", "pct", "num", "num"], chartKey: "a", rows: [...m].map(([k, v]) => ({ key: k, label: k, sub: cus.get(db.customers.find((c) => c.city === k)!.id)!.province, a: v.revenue, b: margin(v.revenue, v.cost), c: v.qty, d: db.customers.filter((c) => c.city === k).length, href: `/customers?city=${k}` })) };
    }
    case "sales-by-rep": {
      const m = salesBy(from, to, (i) => cus.get(i.customerId)!.repId);
      return { cols: ["Revenue", "Gross margin %", "Units", "Customers"], kinds: ["money", "pct", "num", "num"], chartKey: "a", rows: [...m].map(([k, v]) => ({ key: k, label: emp.get(k)?.name ?? k, sub: emp.get(k)?.position, a: v.revenue, b: margin(v.revenue, v.cost), c: v.qty, d: db.customers.filter((c) => c.repId === k).length })) };
    }
    case "gross-margin": {
      const m = salesBy(from, to, (_, l) => `${prod.get(l.productId)!.category}`);
      return { cols: ["Revenue", "Cost", "Gross profit", "Margin %"], kinds: ["money", "money", "money", "pct"], chartKey: "a", rows: [...m].map(([k, v]) => ({ key: k, label: k.replace(/_/g, " "), a: v.revenue, b: v.cost, c: v.revenue - v.cost, d: margin(v.revenue, v.cost) })) };
    }
    case "inventory-valuation": {
      const m = new Map<string, { v: number; q: number; s: number }>();
      for (const r of stockRows()) { const k = r.warehouseId; const e = m.get(k) ?? { v: 0, q: 0, s: 0 }; e.v += r.value; e.q += r.on; if (r.on > 0) e.s++; m.set(k, e); }
      const tot = [...m.values()].reduce((s, x) => s + x.v, 0);
      return { cols: ["Stock value", "Units", "SKUs in stock", "Share of total %"], kinds: ["money", "num", "num", "pct"], chartKey: "a", rows: [...m].map(([k, v]) => ({ key: k, label: wh.get(k)!.name, sub: wh.get(k)!.code, a: v.v, b: v.q, c: v.s, d: (v.v / tot) * 100, href: `/warehouses?wh=${k}` })) };
    }
    case "inventory-aging": {
      const buckets = [["Expired / < 30 days", -9999, 30], ["30–60 days", 30, 60], ["60–120 days", 60, 120], ["120+ days", 120, 9999]] as const;
      const all = expiryRisk(9999);
      return { cols: ["Batches", "Units", "Value at cost", "Share %"], kinds: ["num", "num", "money", "pct"], chartKey: "b", rows: buckets.map(([l, lo, hi]) => { const xs = all.filter((x) => x.daysLeft >= lo && x.daysLeft < hi); const val = xs.reduce((s, x) => s + x.value, 0); return { key: l, label: l, a: xs.length, b: xs.reduce((s, x) => s + x.qty, 0), c: val, d: (val / Math.max(1, all.reduce((s, x) => s + x.value, 0))) * 100 }; }) };
    }
    case "stock-movement": {
      const m = new Map<string, { inn: number; out: number }>();
      for (const g of db.grns) if (g.date >= from && g.date <= to) for (const l of g.lines) { const e = m.get(l.productId) ?? { inn: 0, out: 0 }; e.inn += l.qty; m.set(l.productId, e); }
      for (const i of db.invoices) if (i.date >= from && i.date <= to) for (const l of i.lines) { const e = m.get(l.productId) ?? { inn: 0, out: 0 }; e.out += l.qty; m.set(l.productId, e); }
      return { cols: ["Received", "Issued", "Net change", "Turnover (x/yr)"], kinds: ["num", "num", "num", "num"], chartKey: "b", rows: [...m].map(([k, v]) => { const st = stockRows().filter((r) => r.product.id === k).reduce((s, r) => s + r.on, 0); return { key: k, label: prod.get(k)!.name, sub: prod.get(k)!.sku, a: v.inn, b: v.out, c: v.inn - v.out, d: st ? (v.out / Math.max(1, diffDays(to, from))) * 365 / st : 0, href: `/inventory/${k}` }; }) };
    }
    case "purchase-analysis": {
      const m = new Map<string, { v: number; n: number; q: number }>();
      for (const g of db.grns) if (g.date >= from && g.date <= to) { const e = m.get(g.supplierId) ?? { v: 0, n: 0, q: 0 }; e.v += g.value; e.n++; e.q += g.lines.reduce((s, l) => s + l.qty, 0); m.set(g.supplierId, e); }
      const tot = [...m.values()].reduce((s, x) => s + x.v, 0);
      return { cols: ["Received value", "Receipts", "Units", "Share %"], kinds: ["money", "num", "num", "pct"], chartKey: "a", rows: [...m].map(([k, v]) => ({ key: k, label: sup.get(k)!.name, sub: sup.get(k)!.code, a: v.v, b: v.n, c: v.q, d: (v.v / Math.max(1, tot)) * 100, href: `/suppliers/${k}` })) };
    }
    case "supplier-performance": {
      return { cols: ["Avg lead time (d)", "On-time %", "Bills with issues", "Payable"], kinds: ["num", "pct", "num", "money"], chartKey: "b", rows: db.suppliers.filter((s) => s.kind === "goods").map((s) => { const st = supplierStats(s.id); return { key: s.id, label: s.name, sub: `Promised ${s.leadTimeDays}d`, a: st.avgLead, b: st.reliability, c: st.exceptions, d: st.payable, href: `/suppliers/${s.id}` }; }) };
    }
  }
  return { cols: ["", "", "", ""], kinds: ["text", "text", "text", "text"], rows: [], chartKey: "a" };
}

export const PRESETS = (t: ISODate) => [
  { id: "30", label: "Last 30 days", from: addDays(t, -29), to: t },
  { id: "90", label: "Last 90 days", from: addDays(t, -89), to: t },
  { id: "365", label: "Last 12 months", from: addDays(t, -364), to: t },
  { id: "prev30", label: "Previous 30 days", from: addDays(t, -59), to: addDays(t, -30) },
];
