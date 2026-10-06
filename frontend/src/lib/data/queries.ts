// Derived business metrics: every KPI comes from the ledger / subledgers, never a "dashboard numbers" table.
// Analytics here are deterministic (forecast, risk, anomalies, cash). The LLM only explains them (docs/plan/06).
import { ORG } from "./catalog";
import { addDays, diffDays, monthKey, weekday } from "./dates";
import { buildDB, getDB, type Cell, type DB } from "./sim";
import type { Customer, ISODate, Invoice, Product, PurchaseOrder, SupplierBill } from "./types";

export { getDB };
export type { DB };

export interface Idx {
  db: DB;
  cus: Map<string, Customer>;
  prod: Map<string, Product>;
  sup: Map<string, DB["suppliers"][number]>;
  wh: Map<string, DB["warehouses"][number]>;
  emp: Map<string, DB["employees"][number]>;
  inv: Map<string, Invoice>;
  acct: Map<string, DB["accounts"][number]>;
}

let idxCache: Idx | null = null;
export function idx(): Idx {
  const db = getDB();
  if (idxCache && idxCache.db === db) return idxCache;
  const m = <T extends { id: string }>(a: T[]) => new Map(a.map((x) => [x.id, x]));
  idxCache = { db, cus: m(db.customers), prod: m(db.products), sup: m(db.suppliers), wh: m(db.warehouses), emp: m(db.employees), inv: m(db.invoices), acct: new Map(db.accounts.map((a) => [a.code, a])) };
  return idxCache;
}

const memo = new Map<string, unknown>();
function cached<T>(k: string, f: () => T): T {
  const full = `${getDB().today}:${k}`;
  if (!memo.has(full)) memo.set(full, f());
  return memo.get(full) as T;
}

// ───────── ledger ─────────
export function glNet(codes: string[], from: ISODate, to: ISODate, opts: { includeClosing?: boolean } = {}): number {
  const { db } = idx();
  let s = 0;
  for (const j of db.journal) {
    if (j.date < from || j.date > to) continue;
    if (j.type === "closing" && !opts.includeClosing) continue;
    for (const l of j.lines) if (codes.includes(l.account)) s += l.debit - l.credit;
  }
  return s;
}
export function glBalance(code: string, asOf: ISODate): number {
  const { db } = idx();
  let s = 0;
  for (const j of db.journal) { if (j.date > asOf) break; for (const l of j.lines) if (l.account === code) s += l.debit - l.credit; }
  return s;
}
export const codesOf = (pred: (a: DB["accounts"][number]) => boolean) => idx().db.accounts.filter(pred).map((a) => a.code);
const INCOME = () => codesOf((a) => a.type === "income");
const COGS = ["5010", "5020", "5030", "5040"];
const OPEX = () => codesOf((a) => a.group === "Operating Expenses");

export interface PL { revenue: number; cogs: number; grossProfit: number; opex: number; netProfit: number; gm: number }
export function pl(from: ISODate, to: ISODate): PL {
  const revenue = -glNet(INCOME(), from, to);
  const cogs = glNet(COGS, from, to);
  const opex = glNet(OPEX(), from, to);
  return { revenue, cogs, grossProfit: revenue - cogs, opex, netProfit: revenue - cogs - opex, gm: revenue ? ((revenue - cogs) / revenue) * 100 : 0 };
}

export interface Trial { code: string; name: string; type: string; debit: number; credit: number }
export function trialBalance(asOf: ISODate, from?: ISODate): Trial[] {
  const { db } = idx();
  const m = new Map<string, number>();
  for (const j of db.journal) { if (j.date > asOf || (from && j.date < from)) continue; for (const l of j.lines) m.set(l.account, (m.get(l.account) ?? 0) + l.debit - l.credit); }
  return db.accounts.map((a) => { const v = m.get(a.code) ?? 0; return { code: a.code, name: a.name, type: a.type, debit: v > 0 ? v : 0, credit: v < 0 ? -v : 0 }; }).filter((t) => t.debit || t.credit);
}

export function balanceSheet(asOf: ISODate) {
  const tb = trialBalance(asOf);
  const sum = (types: string[]) => tb.filter((t) => types.includes(t.type));
  const profit = tb.filter((t) => t.type === "income" || t.type === "expense").reduce((s, t) => s + t.credit - t.debit, 0);
  const assets = sum(["asset"]).map((t) => ({ ...t, amount: t.debit - t.credit }));
  const liab = sum(["liability"]).map((t) => ({ ...t, amount: t.credit - t.debit }));
  const eq = sum(["equity"]).map((t) => ({ ...t, amount: t.credit - t.debit }));
  const totalAssets = assets.reduce((s, t) => s + t.amount, 0), totalLiab = liab.reduce((s, t) => s + t.amount, 0), totalEq = eq.reduce((s, t) => s + t.amount, 0) + profit;
  return { assets, liab, eq, profit, totalAssets, totalLiab, totalEq };
}

export function cashFlowStatement(from: ISODate, to: ISODate) {
  const p = pl(from, to);
  const delta = (code: string) => glBalance(code, to) - glBalance(code, addDays(from, -1));
  const wc = [
    { label: "Trade debtors", amount: -delta("1200") - delta("1210") },
    { label: "Stock in trade", amount: -delta("1300") },
    { label: "Input tax & advance tax", amount: -(delta("1400") + delta("1410")) },
    { label: "Trade creditors & GRNI", amount: -(delta("2010") + delta("2020")) },
    { label: "Taxes payable", amount: -(delta("2100") + delta("2105") + delta("2120") + delta("2130") + delta("2140")) },
    { label: "Payroll & reimbursements", amount: -(delta("2300") + delta("2210")) },
  ];
  const ops = p.netProfit + wc.reduce((s, x) => s + x.amount, 0);
  const investing = -delta("1600");
  const financing = -(delta("3010") + delta("3020"));
  const opening = ["1010", "1015", "1100", "1110", "1120", "1130"].reduce((s, c) => s + glBalance(c, addDays(from, -1)), 0);
  const closing = ["1010", "1015", "1100", "1110", "1120", "1130"].reduce((s, c) => s + glBalance(c, to), 0);
  return { netProfit: p.netProfit, wc, ops, investing, financing, net: ops + investing + financing, opening, closing };
}

export function cashBalance(asOf: ISODate = getDB().today) {
  return ["1010", "1015", "1100", "1110", "1120", "1130"].reduce((s, c) => s + glBalance(c, asOf), 0);
}

export function monthSeries(n = 15) {
  return cached(`months${n}`, () => {
    const t = getDB().today;
    const out: { month: string; revenue: number; cogs: number; gp: number; opex: number; net: number; gm: number }[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1 - i, 1));
      const from = d.toISOString().slice(0, 10), to = addDays(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10), -1);
      const p = pl(from, to > t ? t : to);
      out.push({ month: from.slice(0, 7), revenue: p.revenue, cogs: p.cogs, gp: p.grossProfit, opex: p.opex, net: p.netProfit, gm: p.gm });
    }
    return out;
  });
}

// ───────── receivables / payables ─────────
export interface OpenInv { inv: Invoice; customer: Customer; balance: number; daysOverdue: number; bucket: "current" | "1-30" | "31-60" | "61-90" | "90+" }
export function openInvoices(): OpenInv[] {
  return cached("openInv", () => {
    const { db, cus } = idx();
    return db.invoices.filter((i) => i.total - i.paid > 0.5).map((inv) => {
      const daysOverdue = diffDays(db.today, inv.dueDate);
      const bucket = daysOverdue <= 0 ? "current" : daysOverdue <= 30 ? "1-30" : daysOverdue <= 60 ? "31-60" : daysOverdue <= 90 ? "61-90" : "90+";
      return { inv, customer: cus.get(inv.customerId)!, balance: inv.total - inv.paid, daysOverdue, bucket } as OpenInv;
    });
  });
}
export const BUCKETS = ["current", "1-30", "31-60", "61-90", "90+"] as const;
export function arAging() {
  const open = openInvoices();
  return BUCKETS.map((b) => ({ bucket: b, amount: open.filter((o) => o.bucket === b).reduce((s, o) => s + o.balance, 0), count: open.filter((o) => o.bucket === b).length }));
}
export const isOverdue = (i: Invoice, today: ISODate) => i.total - i.paid > 0.5 && i.dueDate < today;
export const invoiceStatusLabel = (i: Invoice, today: ISODate) => (isOverdue(i, today) ? "overdue" : i.paymentStatus === "paid" ? "paid" : i.paymentStatus === "partially_paid" ? "partially_paid" : i.status);

export function postedBills() { return getDB().bills.filter((b) => b.status === "posted" || b.status === "paid"); }
export function apOpen() { return postedBills().filter((b) => b.total - b.paid > 0.5); }
export function apAging() {
  const t = getDB().today;
  const b = [0, 0, 0, 0, 0];
  for (const x of apOpen()) { const d = diffDays(t, x.dueDate); b[d <= 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : d <= 90 ? 3 : 4]! += x.total - x.paid; }
  return BUCKETS.map((k, i) => ({ bucket: k, amount: b[i]! }));
}

// ───────── customers ─────────
export interface CustomerStats {
  outstanding: number; overdue: number; maxDaysOverdue: number; openCount: number;
  avgDaysToPay90: number; avgDaysToPayPrev90: number; bounces180: number; utilization: number;
  revenue12m: number; lastOrder: ISODate | null; risk: number; band: "low" | "medium" | "high";
  factors: { label: string; points: number; detail: string }[];
}
export function customerStats(id: string): CustomerStats {
  return cached(`cs:${id}`, () => {
    const { db, cus, inv } = idx();
    const c = cus.get(id)!;
    const open = openInvoices().filter((o) => o.customer.id === id);
    const outstanding = open.reduce((s, o) => s + o.balance, 0);
    const overdueItems = open.filter((o) => o.daysOverdue > 0);
    const overdue = overdueItems.reduce((s, o) => s + o.balance, 0);
    const maxDaysOverdue = Math.max(0, ...overdueItems.map((o) => o.daysOverdue));
    const pays = db.payments.filter((p) => p.customerId === id && p.status !== "bounced" && p.allocations.length);
    const dtp = (from: number, to: number) => {
      const xs = pays.filter((p) => diffDays(db.today, p.date) >= from && diffDays(db.today, p.date) < to).map((p) => diffDays(p.date, inv.get(p.allocations[0]!.invoiceId)!.date));
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
    };
    const a90 = dtp(0, 90), p90 = dtp(90, 180);
    const bounces180 = db.payments.filter((p) => p.customerId === id && p.status === "bounced" && diffDays(db.today, p.date) <= 180).length;
    const utilization = c.creditLimit ? outstanding / c.creditLimit : 0;
    const invs = db.invoices.filter((i) => i.customerId === id);
    const revenue12m = invs.filter((i) => diffDays(db.today, i.date) <= 365).reduce((s, i) => s + i.subtotal - i.discount, 0);
    const lastOrder = invs[0]?.date ?? null;
    const f = [
      { label: "Overdue exposure", points: Math.min(30, (overdue / Math.max(c.creditLimit, 1)) * 60), detail: `Rs ${Math.round(overdue).toLocaleString("en-US")} overdue` },
      { label: "Oldest overdue invoice", points: Math.min(25, maxDaysOverdue * 0.45), detail: `${maxDaysOverdue} days past due` },
      { label: "Payment slowdown", points: a90 && p90 ? Math.max(0, Math.min(20, (a90 - p90) * 0.8)) : 0, detail: p90 ? `Avg days to pay ${p90.toFixed(0)} → ${a90.toFixed(0)}` : "Not enough history" },
      { label: "Bounced cheques", points: Math.min(15, bounces180 * 7.5), detail: `${bounces180} in last 180 days` },
      { label: "Credit utilization", points: Math.max(0, Math.min(10, (utilization - 0.6) * 25)), detail: `${(utilization * 100).toFixed(0)}% of limit used` },
    ];
    const risk = Math.round(f.reduce((s, x) => s + x.points, 0));
    return { outstanding, overdue, maxDaysOverdue, openCount: open.length, avgDaysToPay90: a90, avgDaysToPayPrev90: p90, bounces180, utilization, revenue12m, lastOrder, risk, band: risk >= 55 ? "high" : risk >= 30 ? "medium" : "low", factors: f };
  });
}

// ───────── inventory & forecasting ─────────
export interface StockRow {
  product: Product; warehouseId: string; on: number; reserved: number; available: number; incoming: number; value: number;
  avgDaily: number; daysCover: number; leadTime: number; reorderPoint: number; status: "out" | "critical" | "low" | "ok" | "excess";
}
const stockStatus = (available: number, avgDaily: number, lead: number, safety: number): StockRow["status"] => {
  if (available <= 0 && avgDaily > 0.5) return "out";
  if (avgDaily < 0.5) return "ok";
  const cover = available / avgDaily;
  return cover < lead ? "critical" : cover < lead + safety ? "low" : cover > 75 ? "excess" : "ok";
};
export function stockRows(): StockRow[] {
  return cached("stockRows", () => {
    const { db, prod, sup } = idx();
    const rows: StockRow[] = [];
    for (const [k, c] of db.stock) {
      const [pid, wid] = k.split("|") as [string, string];
      const p = prod.get(pid)!;
      const lead = sup.get(p.supplierId)?.leadTimeDays ?? 8;
      const available = c.on - c.res;
      rows.push({ product: p, warehouseId: wid, on: c.on, reserved: c.res, available, incoming: c.incoming, value: c.val, avgDaily: c.ema, daysCover: c.ema > 0.5 ? available / c.ema : 999, leadTime: lead, reorderPoint: Math.ceil(c.ema * (lead + p.safetyDays)), status: stockStatus(available, c.ema, lead, p.safetyDays) });
    }
    return rows;
  });
}
export function productStock(pid: string) {
  const rows = stockRows().filter((r) => r.product.id === pid);
  const sum = (f: (r: StockRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  return { rows, on: sum((r) => r.on), reserved: sum((r) => r.reserved), available: sum((r) => r.available), incoming: sum((r) => r.incoming), value: sum((r) => r.value), avgDaily: sum((r) => r.avgDaily) };
}
export const inventoryValue = () => stockRows().reduce((s, r) => s + r.value, 0);

export interface Recommendation {
  id: string; product: Product; warehouseId: string; available: number; incoming: number; avgDaily: number; forecast30: number; leadTime: number;
  safetyUnits: number; recommendedQty: number; recommendedCartons: number; stockoutDays: number; growthPct: number; severity: "critical" | "high" | "medium";
  supplierId: string; unitCost: number; value: number; why: string[]; confidence: "high" | "medium" | "low"; basis: string;
}
export function demandGrowth(pid: string, wid: string): number {
  const { db } = idx();
  let a = 0, b = 0;
  const t = db.today;
  for (const i of db.invoices) {
    const age = diffDays(t, i.date);
    if (age > 60 || i.warehouseId !== wid) continue;
    for (const l of i.lines) if (l.productId === pid && !l.free) { if (age < 30) a += l.qty; else b += l.qty; }
  }
  return b > 0 ? (a / b - 1) * 100 : 0;
}
export function recommendations(): Recommendation[] {
  return cached("recs", () => {
    const { db } = idx();
    const out: Recommendation[] = [];
    for (const r of stockRows()) {
      if (r.avgDaily < 3) continue;
      const p = r.product;
      const growth = demandGrowth(p.id, r.warehouseId);
      const gF = 1 + Math.max(-0.2, Math.min(0.4, growth / 100)) * 0.6;
      const daily = r.avgDaily * gF;
      const safety = Math.ceil(daily * p.safetyDays);
      const horizon = r.leadTime + 14;
      const need = daily * horizon + safety - r.available - r.incoming;
      const cover = (r.available + r.incoming) / daily;
      if (need <= 0 || r.available / daily >= r.leadTime + p.safetyDays) continue;
      const qty = Math.ceil(need / p.cartonSize) * p.cartonSize;
      const stockoutDays = Math.max(0, Math.floor(r.available / daily));
      const sev: Recommendation["severity"] = stockoutDays < r.leadTime ? "critical" : stockoutDays < r.leadTime + 4 ? "high" : "medium";
      const unitCost = r.value && r.on ? r.value / r.on : p.cost;
      const sName = idx().sup.get(p.supplierId)!.name;
      out.push({
        id: `rec_${p.id}_${r.warehouseId}`, product: p, warehouseId: r.warehouseId, available: r.available, incoming: r.incoming, avgDaily: daily, forecast30: Math.round(daily * 30), leadTime: r.leadTime, safetyUnits: safety,
        recommendedQty: qty, recommendedCartons: qty / p.cartonSize, stockoutDays, growthPct: growth, severity: sev, supplierId: p.supplierId, unitCost, value: qty * unitCost, confidence: db.invoices.length > 3000 ? "high" : "medium",
        basis: `15 months history · ${Math.round(r.avgDaily * 28)} units sold in last 28d at this warehouse`,
        why: [
          growth > 4 ? `Demand is ${growth.toFixed(0)}% higher over the last 30 days than the 30 before` : "Demand is steady versus the previous 30 days",
          `Available ${r.available.toLocaleString("en-US")} units cover about ${stockoutDays} days at current demand`,
          `${sName} takes ~${r.leadTime} days to deliver${r.incoming ? `; ${r.incoming.toLocaleString("en-US")} units already incoming` : "; nothing is on order"}`,
          `Safety stock target is ${p.safetyDays} days (${safety.toLocaleString("en-US")} units)`,
          `Order covers lead time + 14 days, rounded up to whole cartons of ${p.cartonSize}`,
        ],
      });
      void cover;
    }
    const rank = { critical: 0, high: 1, medium: 2 } as const;
    return out.sort((a, b) => (a.severity === b.severity ? b.avgDaily * b.product.price - a.avgDaily * a.product.price : rank[a.severity] - rank[b.severity])).slice(0, 40);
  });
}

export function batchesFor(pid: string, wid: string) {
  const { db } = idx();
  const on = db.stock.get(`${pid}|${wid}`)?.on ?? 0;
  let left = on;
  const out: { batch: string; qty: number; expiry: ISODate; received: ISODate }[] = [];
  for (const g of db.grns) {
    if (g.warehouseId !== wid || left <= 0) continue;
    const l = g.lines.find((x) => x.productId === pid);
    if (!l) continue;
    const q = Math.min(left, l.qty);
    out.push({ batch: l.batch, qty: q, expiry: l.expiry, received: g.date });
    left -= q;
  }
  return out;
}
export function expiryRisk(days = 90) {
  return cached(`exp${days}`, () => {
    const { db, prod } = idx();
    const out: { product: Product; warehouseId: string; batch: string; qty: number; expiry: ISODate; daysLeft: number; value: number }[] = [];
    for (const k of db.stock.keys()) {
      const [pid, wid] = k.split("|") as [string, string];
      for (const b of batchesFor(pid, wid)) {
        const daysLeft = diffDays(b.expiry, db.today);
        if (daysLeft <= days) { const p = prod.get(pid)!; out.push({ product: p, warehouseId: wid, ...b, daysLeft, value: b.qty * p.cost }); }
      }
    }
    return out.sort((a, b) => a.daysLeft - b.daysLeft);
  });
}

// ───────── sales analytics ─────────
export function salesBy<K extends string>(from: ISODate, to: ISODate, keyFn: (i: Invoice, l: Invoice["lines"][number]) => K | null) {
  const { db, prod } = idx();
  const m = new Map<K, { revenue: number; cost: number; qty: number }>();
  for (const i of db.invoices) {
    if (i.date < from || i.date > to) continue;
    const share = i.subtotal ? i.cogs / Math.max(1, i.lines.reduce((s, l) => s + l.qty * (prod.get(l.productId)?.cost ?? 0), 0)) : 1;
    for (const l of i.lines) {
      const k = keyFn(i, l);
      if (k == null) continue;
      const e = m.get(k) ?? { revenue: 0, cost: 0, qty: 0 };
      e.revenue += l.value; e.qty += l.qty; e.cost += l.qty * (prod.get(l.productId)?.cost ?? 0) * share;
      m.set(k, e);
    }
  }
  return m;
}
export function categoryTrend() {
  return cached("catTrend", () => {
    const t = getDB().today, { prod } = idx();
    const cur = salesBy(addDays(t, -55), t, (_, l) => prod.get(l.productId)!.category);
    const prev = salesBy(addDays(t, -111), addDays(t, -56), (_, l) => prod.get(l.productId)!.category);
    return [...cur.entries()].map(([k, v]) => ({ category: k, revenue: v.revenue, prev: prev.get(k)?.revenue ?? 0, growth: prev.get(k)?.revenue ? (v.revenue / prev.get(k)!.revenue - 1) * 100 : 0, margin: v.revenue ? ((v.revenue - v.cost) / v.revenue) * 100 : 0 })).sort((a, b) => b.growth - a.growth);
  });
}

export function overviewKpis() {
  return cached("kpis", () => {
    const { db } = idx();
    const t = db.today, mStart = `${t.slice(0, 7)}-01`;
    // rolling 30-day windows avoid month-edge noise (a month-to-date figure after 5 days compares very few trading days)
    const cur = pl(addDays(t, -29), t), prev = pl(addDays(t, -59), addDays(t, -30));
    const ytdStart = +t.slice(5, 7) >= 7 ? `${t.slice(0, 4)}-07-01` : `${+t.slice(0, 4) - 1}-07-01`;
    const open = openInvoices();
    const ar = open.reduce((s, o) => s + o.balance, 0), overdue = open.filter((o) => o.daysOverdue > 0).reduce((s, o) => s + o.balance, 0);
    const rows = stockRows();
    const lowSkus = new Set(rows.filter((r) => r.status === "critical" || r.status === "out").map((r) => r.product.id));
    return {
      today: t, cur, prev, ytd: pl(ytdStart, t), ar, overdue, overdueCount: open.filter((o) => o.daysOverdue > 0).length, ap: apOpen().reduce((s, b) => s + b.total - b.paid, 0), cash: cashBalance(t),
      openInvoiceCount: open.length, ordersToday: db.orders.filter((o) => o.date === t && o.status !== "draft").length,
      awaitingFulfilment: db.orders.filter((o) => o.status === "confirmed" || o.status === "reserved" || o.status === "partially_fulfilled").length,
      lowStockCount: lowSkus.size, posPending: db.pos.filter((p) => p.status === "pending_approval" || p.status === "approved" || p.status === "partially_received").length,
      returnsMtd: db.creditNotes.filter((c) => c.date >= mStart).length, returnsValueMtd: db.creditNotes.filter((c) => c.date >= mStart).reduce((s, c) => s + c.total, 0),
      inventoryValue: inventoryValue(), warehouseAlerts: rows.filter((r) => r.status === "out").length + expiryRisk(30).length,
    };
  });
}

// ───────── cash-flow projection (13 weeks) ─────────
export interface CashWeek { week: number; start: ISODate; end: ISODate; opening: number; collections: number; supplier: number; payroll: number; recurring: number; commitments: number; closing: number; drivers: { label: string; amount: number }[] }
export function cashProjection(extraPOs: PurchaseOrder[] = []): { weeks: CashWeek[]; assumptions: string[] } {
  const key = extraPOs.map((p) => p.id).join(",");
  return cached(`cash:${key}`, () => {
    const { db, sup, cus } = idx();
    const t = db.today;
    const weeks: CashWeek[] = [];
    const buckets = Array.from({ length: 13 }, () => ({ col: 0, sup: 0, pay: 0, rec: 0, com: 0, drivers: [] as { label: string; amount: number }[] }));
    const wk = (d: ISODate) => Math.max(0, Math.min(12, Math.floor(diffDays(d, t) / 7 - 0.0001)));
    // collections
    for (const o of openInvoices()) {
      const st = customerStats(o.customer.id);
      const hist = db.payments.filter((p) => p.customerId === o.customer.id && p.allocations.length).slice(0, 12).map((p) => diffDays(p.date, idx().inv.get(p.allocations[0]!.invoiceId)!.dueDate));
      let lag = hist.length ? Math.max(0, hist.reduce((a, b) => a + b, 0) / hist.length) : 5;
      let prob = 0.97;
      if (st.band === "high") { prob = 0.55; lag += 25; } else if (st.band === "medium") { prob = 0.9; lag += 8; }
      let when = addDays(o.inv.dueDate, Math.round(lag));
      if (when <= t) when = addDays(t, 2 + (o.daysOverdue > 30 ? 12 : 3));
      const w = wk(when);
      if (diffDays(when, t) <= 91) { buckets[w]!.col += o.balance * prob; }
    }
    // supplier bills
    for (const b of apOpen()) {
      let when = addDays(b.dueDate, 2);
      if (when <= t) when = addDays(t, 3);
      const w = wk(when);
      buckets[w]!.sup += b.total - b.paid;
      if (b.total - b.paid > 3_000_000) buckets[w]!.drivers.push({ label: `${sup.get(b.supplierId)!.name} bill ${b.supplierInvoiceNo}`, amount: b.total - b.paid });
    }
    // approved POs (not yet received) → bill after ETA + terms
    for (const p of [...db.pos.filter((x) => x.status === "approved" || x.status === "partially_received"), ...extraPOs]) {
      const s = sup.get(p.supplierId)!;
      const remaining = p.lines.reduce((a, l) => a + (l.qty - l.received) * l.price, 0) * 1.17;
      if (remaining < 1) continue;
      const when = addDays(p.expectedDate, 2 + s.termsDays);
      if (diffDays(when, t) <= 91 && diffDays(when, t) > 0) { const w = wk(when); buckets[w]!.com += remaining; if (remaining > 1_000_000) buckets[w]!.drivers.push({ label: `Open ${p.number} (${s.name})`, amount: remaining }); }
    }
    // payroll, rent, recurring
    const lastPay = db.payroll[0]!;
    const rec = (code: string[]) => { const m3 = glNet(code, addDays(t, -90), t) / 3; return m3; };
    const utilM = rec(["6030"]), fuelFr = rec(["6040", "6050"]), misc = rec(["6060", "6070", "6080", "6090", "6100", "6110", "6990", "6020"]);
    for (let d = addDays(t, 1); diffDays(d, t) <= 91; d = addDays(d, 1)) {
      const w = wk(d);
      if (d.endsWith("-01")) { buckets[w]!.pay += lastPay.net; buckets[w]!.drivers.push({ label: "Payroll", amount: lastPay.net }); }
      if (d.endsWith("-03")) buckets[w]!.rec += misc * 0.6;
      if (d.slice(8) === "15") buckets[w]!.rec += utilM;
      if (weekday(d) === 6) buckets[w]!.rec += fuelFr / 4.3;
    }
    // future sales / purchases (steady-state model; invoices not yet raised)
    const last56 = db.invoices.filter((i) => diffDays(t, i.date) <= 56);
    const dailySales = last56.reduce((s, i) => s + i.total, 0) / 56;
    const arNow = openInvoices().reduce((s, o) => s + o.balance, 0);
    const dso = Math.min(70, Math.max(20, arNow / dailySales));
    const dailyBuy = db.grns.filter((g) => diffDays(t, g.date) <= 56).reduce((s, g) => s + g.value * 1.17, 0) / 56;
    const apNow = apOpen().reduce((s, b) => s + b.total - b.paid, 0);
    const dpo = Math.min(60, Math.max(20, apNow / Math.max(1, dailyBuy)));
    for (let k = 0; k < 13; k++) {
      const wc = Math.floor((7 * k + 3.5 + dso) / 7);
      if (wc <= 12) buckets[wc]!.col += dailySales * 7 * 0.93;
      const wp = Math.floor((7 * k + 3.5 + dpo) / 7);
      if (k >= 2 && wp <= 12) buckets[wp]!.sup += dailyBuy * 7 * 1.05;
    }
    let bal = cashBalance(t);
    for (let i = 0; i < 13; i++) {
      const b = buckets[i]!;
      const open = bal;
      bal = open + b.col - b.sup - b.pay - b.rec - b.com;
      weeks.push({ week: i + 1, start: addDays(t, i * 7 + 1), end: addDays(t, i * 7 + 7), opening: open, collections: b.col, supplier: b.sup, payroll: b.pay, recurring: b.rec, commitments: b.com, closing: bal, drivers: b.drivers.sort((a, c) => c.amount - a.amount).slice(0, 4) });
    }
    void cus;
    return {
      weeks,
      assumptions: [
        "Collections: each open invoice is expected on its due date plus the customer's own average lateness (last 12 payments). Sales not yet invoiced are assumed to continue at the last 8 weeks' run-rate and are collected after today's average days-sales-outstanding.",
        "Customers rated high risk collect at 55% probability and 25 days later; medium risk at 90% and 8 days later.",
        "Supplier bills are paid 2 days after due date. Approved purchase orders become payable at ETA + 2 days + supplier terms.",
        `Payroll on the 1st at last month's net (${Math.round(lastPay.net).toLocaleString("en-US")}); rent, utilities, fuel and freight at their 3-month averages.`,
        `Minimum cash threshold: Rs ${ORG.minCash.toLocaleString("en-US")}.`,
      ],
    };
  });
}

// ───────── profit variance ─────────
export function profitVariance() {
  return cached("pvar", () => {
    const t = getDB().today, { prod } = idx();
    const monthStart = (back: number) => new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1 - back, 1)).toISOString().slice(0, 10);
    const curFrom = monthStart(1), curTo = addDays(monthStart(0), -1), prevFrom = monthStart(2), prevTo = addDays(monthStart(1), -1);
    const c = pl(curFrom, curTo), p = pl(prevFrom, prevTo);
    const cc = salesBy(curFrom, curTo, (_, l) => prod.get(l.productId)!.category), pc = salesBy(prevFrom, prevTo, (_, l) => prod.get(l.productId)!.category);
    const totC = [...cc.values()].reduce((s, v) => s + v.revenue, 0), totP = [...pc.values()].reduce((s, v) => s + v.revenue, 0);
    const cats = [...new Set([...cc.keys(), ...pc.keys()])].map((k) => {
      const a = cc.get(k) ?? { revenue: 0, cost: 0, qty: 0 }, b = pc.get(k) ?? { revenue: 0, cost: 0, qty: 0 };
      const gmC = a.revenue ? (a.revenue - a.cost) / a.revenue : 0, gmP = b.revenue ? (b.revenue - b.cost) / b.revenue : 0;
      const shC = a.revenue / totC, shP = b.revenue / totP;
      return { category: k, revenue: a.revenue, prevRevenue: b.revenue, gm: gmC * 100, prevGm: gmP * 100, mix: (shC - shP) * gmP * 100, rate: shC * (gmC - gmP) * 100 };
    });
    const opexAccts = OPEX().map((code) => ({ code, name: idx().acct.get(code)!.name, cur: glNet([code], curFrom, curTo), prev: glNet([code], prevFrom, prevTo) }));
    const ppv = { cur: glNet(["5030"], curFrom, curTo), prev: glNet(["5030"], prevFrom, prevTo) };
    return { curFrom, curTo, prevFrom, prevTo, cur: c, prev: p, cats, opex: opexAccts.map((o) => ({ ...o, delta: o.cur - o.prev })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)), ppv, shrink: { cur: glNet(["5020"], curFrom, curTo), prev: glNet(["5020"], prevFrom, prevTo) }, scheme: { cur: glNet(["5040"], curFrom, curTo), prev: glNet(["5040"], prevFrom, prevTo) } };
  });
}

// ───────── supplier analytics ─────────
export function supplierStats(id: string) {
  return cached(`ss:${id}`, () => {
    const { db, prod } = idx();
    const bills = db.bills.filter((b) => b.supplierId === id && (b.status === "posted" || b.status === "paid"));
    const spend12m = bills.filter((b) => diffDays(db.today, b.date) <= 365).reduce((s, b) => s + b.subtotal, 0);
    const payable = bills.reduce((s, b) => s + b.total - b.paid, 0);
    const pos = db.pos.filter((p) => p.supplierId === id && (p.status === "received" || p.status === "partially_received"));
    const leads: number[] = [];
    let onTime = 0, tot = 0;
    for (const g of db.grns.filter((x) => x.supplierId === id)) { const po = db.pos.find((p) => p.id === g.poId); if (po) { leads.push(diffDays(g.date, po.date)); tot++; if (g.date <= addDays(po.expectedDate, 1)) onTime++; } }
    const avgLead = leads.length ? leads.reduce((a, b) => a + b, 0) / leads.length : idx().sup.get(id)!.leadTimeDays;
    const priceHistory = new Map<string, { date: ISODate; price: number }[]>();
    for (const b of db.bills) if (b.supplierId === id) for (const l of b.lines) if (l.productId && l.qty > 0) { const a = priceHistory.get(l.productId) ?? []; a.push({ date: b.date, price: l.price }); priceHistory.set(l.productId, a); }
    const exceptions = db.bills.filter((b) => b.supplierId === id && b.exceptions.length).length;
    void prod; void pos;
    return { spend12m, payable, avgLead, reliability: tot ? (onTime / tot) * 100 : 90, billCount: bills.length, priceHistory, exceptions, poCount: db.pos.filter((p) => p.supplierId === id).length };
  });
}

// ───────── insights (detectors → narrated cards) ─────────
export type Severity = "critical" | "high" | "medium" | "info";
export interface Insight {
  id: string; kind: "collection_risk" | "replenishment" | "supplier_price" | "duplicate_bill" | "cashflow" | "sales_trend" | "discrepancy" | "profit" | "claims" | "journal";
  severity: Severity; title: string; statement: string; why: string[];
  sources: { type: string; label: string; href: string }[];
  confidence: "high" | "medium" | "low"; basis: string; generatedAt: string; generator: "computed";
  action: { label: string; href: string; propose?: { recId: string } };
}

export function insights(): Insight[] {
  return cached("insights", () => {
    const { db, cus, sup, prod, wh } = idx();
    const t = db.today, stamp = `${t}T06:00:00+05:00`;
    const out: Insight[] = [];
    const M = (n: number) => `Rs ${(n / 1e6).toFixed(2)}M`;

    // collection risk
    const open = openInvoices();
    const overdue = open.filter((o) => o.daysOverdue > 30);
    const overdue30 = overdue.reduce((s, o) => s + o.balance, 0);
    const prior = open.filter((o) => o.daysOverdue > 30 - 30);
    void prior;
    const byCus = new Map<string, number>();
    for (const o of overdue) byCus.set(o.customer.id, (byCus.get(o.customer.id) ?? 0) + o.balance);
    const top = [...byCus.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const topShare = top.reduce((s, [, v]) => s + v, 0) / Math.max(1, overdue30);
    out.push({
      id: "ins_collections", kind: "collection_risk", severity: "high", title: "Cash collection risk has increased",
      statement: `${M(overdue30)} is more than 30 days overdue across ${byCus.size} customers. ${top.length} customers account for ${(topShare * 100).toFixed(0)}% of it.`,
      why: top.map(([id, v]) => { const s = customerStats(id); return `${cus.get(id)!.name}: ${M(v)} overdue, oldest ${s.maxDaysOverdue} days, risk score ${s.risk}`; }),
      sources: top.map(([id]) => ({ type: "Customer", label: cus.get(id)!.name, href: `/customers/${id}` })),
      confidence: "high", basis: `${db.invoices.length.toLocaleString("en-US")} invoices · AR aging as of ${t}`, generatedAt: stamp, generator: "computed",
      action: { label: "Review overdue customers", href: "/customers?filter=overdue" },
    });

    // replenishment (top 3 critical)
    for (const r of recommendations().slice(0, 3)) {
      out.push({
        id: `ins_${r.id}`, kind: "replenishment", severity: r.severity === "critical" ? "critical" : "high", title: `Stockout expected: ${r.product.name} at ${wh.get(r.warehouseId)!.code}`,
        statement: `${r.available.toLocaleString("en-US")} units available against a 30-day forecast of ${r.forecast30.toLocaleString("en-US")}. Expected stockout in ~${r.stockoutDays} days; supplier lead time is ${r.leadTime} days.`,
        why: r.why, sources: [{ type: "Product", label: r.product.name, href: `/inventory/${r.product.id}` }, { type: "Supplier", label: sup.get(r.supplierId)!.name, href: `/suppliers/${r.supplierId}` }],
        confidence: r.confidence, basis: r.basis, generatedAt: stamp, generator: "computed", action: { label: "Create purchase order", href: "/inventory/replenishment", propose: { recId: r.id } },
      });
    }

    // supplier price anomaly
    const ib = db.bills.find((b) => b.id === db.scenario.indusBillId)!;
    const var3 = ib.exceptions.filter((e) => e.type === "PRICE_VARIANCE");
    const varTotal = var3.reduce((s, e) => s + e.variance, 0);
    const poOf = db.pos.find((p) => p.id === ib.poId)!;
    out.push({
      id: "ins_supplier_price", kind: "supplier_price", severity: "high", title: `${sup.get(ib.supplierId)!.name} billed above PO price`,
      statement: `Bill ${ib.supplierInvoiceNo} is ${M(ib.subtotal)} against PO ${poOf.number} at ${M(poOf.subtotal)}: Rs ${Math.round(varTotal).toLocaleString("en-US")} (${((varTotal / poOf.subtotal) * 100).toFixed(1)}%) higher on ${var3.length} products.`,
      why: var3.map((e) => `${prod.get(e.productId!)!.name}: expected Rs ${e.expected.toFixed(2)}, billed Rs ${e.actual.toFixed(2)}`), sources: [{ type: "Supplier bill", label: ib.supplierInvoiceNo, href: "/purchasing/bills" }, { type: "Purchase order", label: poOf.number, href: "/purchasing/orders" }],
      confidence: "high", basis: "Three-way match: PO · goods receipt · supplier bill; 90-day price history", generatedAt: stamp, generator: "computed", action: { label: "Review variance", href: "/purchasing/bills" },
    });

    // duplicate
    const dup = db.bills.find((b) => b.id === db.scenario.dupBillId)!;
    out.push({
      id: "ins_duplicate", kind: "duplicate_bill", severity: "high", title: "Possible duplicate supplier invoice",
      statement: `${dup.supplierInvoiceNo} (${M(dup.total)}) looks like the earlier LF-23817 from ${sup.get(dup.supplierId)!.name}: same total, dated 3 days apart.`,
      why: ["Invoice numbers differ by one character (LF-23817 vs LF-23B17)", "Totals are identical", "No matching purchase order or receipt for either"], sources: [{ type: "Supplier bill", label: dup.supplierInvoiceNo, href: "/purchasing/bills" }],
      confidence: "medium", basis: "Fuzzy invoice-number + amount + date-window detector", generatedAt: stamp, generator: "computed", action: { label: "Open bill", href: "/purchasing/bills" },
    });

    // cashflow
    const cp = cashProjection();
    const min = [...cp.weeks].sort((a, b) => a.closing - b.closing)[0]!;
    const breach = cp.weeks.find((w) => w.closing < ORG.minCash);
    out.push({
      id: "ins_cashflow", kind: "cashflow", severity: breach ? "critical" : "medium", title: breach ? `Cash is projected below minimum in week ${breach.week}` : "Cash position stays above minimum for 13 weeks",
      statement: breach ? `Projected balance reaches ${M(breach.closing)} in week ${breach.week} (${breach.start}); the minimum is ${M(ORG.minCash)}.` : `Lowest projected balance is ${M(min.closing)} in week ${min.week}.`,
      why: (breach ?? min).drivers.map((d) => `${d.label}: ${M(d.amount)}`).concat([`Opening cash today: ${M(cashBalance(t))}`]), sources: [{ type: "Report", label: "13-week cash projection", href: "/finance/cashflow" }],
      confidence: "medium", basis: "Open AR with customer-specific payment lag · open AP · payroll · approved POs", generatedAt: stamp, generator: "computed", action: { label: "Open cash forecast", href: "/finance/cashflow" },
    });

    // sales trend
    const ct = categoryTrend();
    const best = ct[0]!;
    const topSnack = [...salesBy(addDays(t, -55), t, (_, l) => (prod.get(l.productId)!.category === best.category ? l.productId : null)).entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5);
    out.push({
      id: "ins_trend", kind: "sales_trend", severity: "info", title: `${best.category.replace(/_/g, " ")} is growing fastest`,
      statement: `Revenue is ${best.growth.toFixed(0)}% higher over the last 8 weeks than the 8 before, at a stable margin of ${best.margin.toFixed(1)}%.`,
      why: topSnack.map(([id, v]) => `${prod.get(id)!.name}: ${M(v.revenue)}`), sources: topSnack.slice(0, 3).map(([id]) => ({ type: "Product", label: prod.get(id)!.name, href: `/inventory/${id}` })),
      confidence: "high", basis: "8-week vs prior 8-week revenue by category", generatedAt: stamp, generator: "computed", action: { label: "See sales by product", href: "/reports/sales-by-product" },
    });

    // discrepancy
    const lhe = db.stockCounts.filter((c) => c.warehouseId === "wh_LHE-DC" && c.lines.some((l) => l.location.startsWith("C-")));
    const neg = lhe.filter((c) => c.lines.some((l) => l.counted < l.expected));
    const loss = lhe.reduce((s, c) => s + c.lines.reduce((x, l) => x + (l.expected - l.counted) * (prod.get(l.productId)?.cost ?? 0), 0), 0);
    out.push({
      id: "ins_discrepancy", kind: "discrepancy", severity: "medium", title: "Repeated shortages at Lahore DC, Personal Care aisle C",
      statement: `${neg.length} of the last ${lhe.length} cycle counts found shortages, ${M(loss)} in total, concentrated in high-value small SKUs and the same counting shift.`,
      why: ["Variances are all negative (no gains offsetting)", "Same location group (aisle C) in every count", "Highest-value, smallest-pack products are affected"], sources: lhe.slice(0, 3).map((c) => ({ type: "Stock count", label: c.number, href: "/warehouses" })),
      confidence: "medium", basis: `${lhe.length} cycle counts · variance recurrence test`, generatedAt: stamp, generator: "computed", action: { label: "Review counts", href: "/warehouses" },
    });

    // profit
    const pv = profitVariance();
    const gmDelta = pv.cur.gm - pv.prev.gm;
    const worst = [...pv.cats].sort((a, b) => a.mix + a.rate - (b.mix + b.rate))[0]!;
    out.push({
      id: "ins_profit", kind: "profit", severity: gmDelta < -0.5 ? "high" : "info", title: `Gross margin ${gmDelta < 0 ? "fell" : "rose"} ${Math.abs(gmDelta).toFixed(1)} points last month`,
      statement: `Revenue moved ${(((pv.cur.revenue / pv.prev.revenue) - 1) * 100).toFixed(1)}% month on month; gross margin went from ${pv.prev.gm.toFixed(1)}% to ${pv.cur.gm.toFixed(1)}%. The largest drag is ${worst.category.replace(/_/g, " ")}.`,
      why: [`Purchase price variance: ${M(pv.ppv.cur)} vs ${M(pv.ppv.prev)} the month before`, `Scheme free-goods cost: ${M(pv.scheme.cur)} vs ${M(pv.scheme.prev)}`, `Net profit ${M(pv.cur.netProfit)} vs ${M(pv.prev.netProfit)}`], sources: [{ type: "Report", label: "Profit & loss", href: "/finance/statements" }],
      confidence: "high", basis: "General ledger, two full months; mix/rate decomposition by category", generatedAt: stamp, generator: "computed", action: { label: "Explain profit change", href: "/ai?q=Why is profit down this month?" },
    });

    // unfiled claims
    const free = db.invoices.filter((i) => diffDays(t, i.date) > 30 && diffDays(t, i.date) < 120).flatMap((i) => i.lines.filter((l) => l.free).map((l) => ({ l, i })));
    const claim = free.reduce((s, x) => s + x.l.qty * (prod.get(x.l.productId)?.cost ?? 0), 0);
    if (claim > 0) out.push({
      id: "ins_claims", kind: "claims", severity: "medium", title: "Scheme free-goods cost not yet claimed from principals", statement: `${M(claim)} of free goods shipped 30–120 days ago can be claimed back from the principal companies.`,
      why: ["Free goods are booked to Scheme Free-Goods Cost (5040)", "No principal claim has been filed against these shipments", "Claims are usually accepted within 60 days of the scheme period"], sources: [{ type: "Account", label: "5040 Scheme Free-Goods Cost", href: "/finance/ledger" }],
      confidence: "medium", basis: "Free-goods lines on invoices 30–120 days old", generatedAt: stamp, generator: "computed", action: { label: "Open purchasing", href: "/purchasing/orders" },
    });

    // journal anomaly
    const jj = db.journal.find((j) => j.type === "manual" && j.lines.some((l) => l.debit === 499_000));
    if (jj) out.push({
      id: "ins_journal", kind: "journal", severity: "medium", title: "Unusual manual journal entry", statement: `${jj.number} for Rs 499,000 was posted to Miscellaneous Expenses on a Sunday at 23:10, Rs 1,000 under the approval threshold.`,
      why: ["Posted outside business days and hours", "Amount sits just below the Rs 500,000 approval threshold", "Preparer rarely posts manual journals"], sources: [{ type: "Journal entry", label: jj.number, href: "/finance/journal" }],
      confidence: "medium", basis: "Manual-journal pattern detector (timing · round amount · threshold proximity)", generatedAt: stamp, generator: "computed", action: { label: "Open journal entry", href: "/finance/journal" },
    });

    const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, info: 3 };
    return out.sort((a, b) => order[a.severity] - order[b.severity]);
  });
}

export function aiBrief() {
  const k = overviewKpis(), pv = profitVariance(), t = getDB().today;
  const revGrowth = k.prev.revenue ? (k.cur.revenue / k.prev.revenue - 1) * 100 : 0;
  const worst = [...pv.cats].sort((a, b) => a.mix + a.rate - (b.mix + b.rate))[0]!;
  const gm = pv.cur.gm - pv.prev.gm;
  const cp = cashProjection();
  const breach = cp.weeks.find((w) => w.closing < ORG.minCash);
  const recs = recommendations().filter((r) => r.severity === "critical" || r.severity === "high");
  const paragraph = `Revenue is ${revGrowth >= 0 ? "up" : "down"} ${Math.abs(revGrowth).toFixed(1)}% over the last 30 days versus the 30 before${gm < -0.3 ? `, but gross margin fell ${Math.abs(gm).toFixed(1)} points last month; the largest drag is ${worst.category.replace(/_/g, " ")}` : `, with gross margin steady at ${pv.cur.gm.toFixed(1)}%`}. Overdue receivables are ${(k.overdue / 1e6).toFixed(1)}M${breach ? ` and projected cash falls below the minimum in week ${breach.week}` : ""}.`;
  const actions = [
    { text: `Follow up on Rs ${(k.overdue / 1e6).toFixed(1)}M in overdue receivables`, href: "/customers?filter=overdue" },
    { text: `Review replenishment for ${recs.length} SKU-warehouse positions at risk`, href: "/inventory/replenishment" },
    { text: "Resolve the supplier price variance before posting the bill", href: "/purchasing/bills" },
  ];
  return { paragraph, actions, generatedAt: `${t}T06:00:00+05:00` };
}

export function warm() { return buildDB; }
export type { Cell, SupplierBill };

// ───────── product analytics ─────────
export function productWeekly(pid: string, weeks = 26) {
  return cached(`pw:${pid}:${weeks}`, () => {
    const { db } = idx();
    const out = Array.from({ length: weeks }, (_, i) => ({ week: weeks - 1 - i, label: addDays(db.today, -(weeks - 1 - i) * 7).slice(5), units: 0, revenue: 0, forecast: null as number | null }));
    for (const i of db.invoices) {
      const w = Math.floor(diffDays(db.today, i.date) / 7);
      if (w >= weeks) continue;
      for (const l of i.lines) if (l.productId === pid && !l.free) { const cell = out[weeks - 1 - w]!; cell.units += l.qty; cell.revenue += l.value; }
    }
    const recent = out.slice(-6).reduce((s, x) => s + x.units, 0) / 6;
    const growth = 1 + Math.max(-0.1, Math.min(0.2, demandGrowth(pid, "wh_KHI-DC1") / 100)) * 0.4;
    const fc = Array.from({ length: 6 }, (_, i) => ({ week: -(i + 1), label: addDays(db.today, (i + 1) * 7).slice(5), units: 0, revenue: 0, forecast: Math.round(recent * growth) }));
    return [...out.map((x) => ({ ...x })), ...fc];
  });
}

export function stockMovements(pid: string, limit = 40) {
  const { db, cus } = idx();
  const mv: { date: ISODate; type: string; ref: string; warehouseId: string; qty: number; note: string; href: string }[] = [];
  for (const i of db.invoices) { if (diffDays(db.today, i.date) > 120) break; for (const l of i.lines) if (l.productId === pid) mv.push({ date: i.date, type: l.free ? "Issue (free goods)" : "Sale dispatch", ref: i.number, warehouseId: i.warehouseId, qty: -l.qty, note: cus.get(i.customerId)!.name, href: `/sales/invoices/${i.id}` }); }
  for (const g of db.grns) { if (diffDays(db.today, g.date) > 120) break; for (const l of g.lines) if (l.productId === pid) mv.push({ date: g.date, type: "Goods receipt", ref: g.number, warehouseId: g.warehouseId, qty: l.qty, note: `Batch ${l.batch}`, href: "/purchasing/receipts" }); }
  return mv.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

// ───────── fast GL aggregation ─────────
/** account → month → net (debit − credit). Closing entries excluded so P&L stays visible after year-end close. */
export function acctMonthly(includeClosing = false) {
  return cached(`acctM:${includeClosing}`, () => {
    const m = new Map<string, Map<string, number>>();
    for (const j of idx().db.journal) {
      if (j.type === "closing" && !includeClosing) continue;
      const mk = j.date.slice(0, 7);
      for (const l of j.lines) { let a = m.get(l.account); if (!a) { a = new Map(); m.set(l.account, a); } a.set(mk, (a.get(mk) ?? 0) + l.debit - l.credit); }
    }
    return m;
  });
}
export function fiscalPeriods() {
  const { db } = idx();
  const t = db.today;
  const out: { id: string; name: string; start: ISODate; end: ISODate; status: "closed" | "soft_closed" | "open" | "future" }[] = [];
  const fy = (start: number) => {
    for (let i = 0; i < 12; i++) {
      const d = new Date(Date.UTC(start, 6 + i, 1));
      const s = d.toISOString().slice(0, 10), e = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
      const label = `P${String(i + 1).padStart(2, "0")} FY${String(start).slice(2)}-${String(start + 1).slice(2)}`;
      const status = e < "2026-07-01" ? "closed" : e < `${t.slice(0, 7)}-01` ? "soft_closed" : s <= t ? "open" : "future";
      out.push({ id: label, name: `${label} (${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" })} ${d.getUTCFullYear()})`, start: s, end: e, status });
    }
  };
  fy(2025); fy(2026);
  return out;
}
