// AI tool layer (docs/plan/06 §7). Tools read ERP data through query services and return a compact `summary` for the model
// plus a `ui` payload for rendering. Propose-tools never write: they return a proposal a human must confirm.
// Runs on the server (LLM mode) and in the browser (computed mode) with identical behaviour.
import { z } from "zod";
import { arAging, cashProjection, customerStats, getDB, idx, insights, pl, profitVariance, recommendations, salesBy, stockRows, supplierStats } from "../data/queries";
import { addDays } from "../data/dates";
import { filterCustomers, customerRows, type CustomerFilter } from "../nl";
import { ORG } from "../data/catalog";
import { resolvePeriod } from "../data/dates";
import { APP_MAP, findGuide } from "./guide";

export interface CustomerLite { id: string; name: string; city: string; outstanding: number; overdue: number; maxDays: number; risk: number; band: string; bounces: number }
export interface Proposal {
  id: string; command: "CreatePurchaseOrder" | "PlaceCreditHold" | "SendMessage" | "RecordPayment"; title: string; lines: [string, string][]; consequence: string;
  params: Record<string, string | number>;
}
export type ToolUI =
  | { kind: "customers"; rows: CustomerLite[]; note?: string }
  | { kind: "recs"; ids: string[] }
  | { kind: "waterfall"; steps: { label: string; value: number; total?: boolean }[]; bullets: string[] }
  | { kind: "bars"; title: string; data: { label: string; value: number }[]; money: boolean }
  | { kind: "metrics"; items: { label: string; value: string }[] }
  | { kind: "cash"; weeks: { label: string; closing: number }[]; min: number }
  | { kind: "proposal"; proposal: Proposal }
  | { kind: "draft"; customerId: string; customer: string; channel: "WhatsApp" | "Email"; text: string }
  | { kind: "navigate"; path: string; label: string }
  | { kind: "guide"; title: string; steps: string[]; path: string; notes?: string }
  | { kind: "none"; reason: string };
export interface ToolResult { summary: string; ui: ToolUI; records?: { type: string; id: string; label: string; href: string }[]; metrics?: { label: string; value: string }[] }

const M = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
const lite = (r: ReturnType<typeof customerRows>[number]): CustomerLite => ({ id: r.c.id, name: r.c.name, city: r.c.city, outstanding: Math.round(r.s.outstanding), overdue: Math.round(r.s.overdue), maxDays: r.s.maxDaysOverdue, risk: r.s.risk, band: r.s.band, bounces: r.s.bounces180 });

export const TOOLS = {
  search_customers: {
    description: "Find customers by overdue status, city, balance, days overdue or risk band. Use for questions about who owes money or is risky.",
    input: z.object({ overdueOnly: z.boolean().optional(), city: z.string().optional(), minBalance: z.number().optional(), minDaysOverdue: z.number().optional(), riskBand: z.enum(["low", "medium", "high"]).optional(), limit: z.number().int().min(1).max(15).default(8) }),
    run(a: { overdueOnly?: boolean; city?: string; minBalance?: number; minDaysOverdue?: number; riskBand?: "low" | "medium" | "high"; limit: number }): ToolResult {
      const f: CustomerFilter = { overdue: a.overdueOnly, city: a.city, minBalance: a.minBalance, minDays: a.minDaysOverdue, band: a.riskBand };
      const rows = filterCustomers(f).sort((x, y) => y.s.overdue - x.s.overdue || y.s.outstanding - x.s.outstanding);
      const top = rows.slice(0, a.limit).map(lite);
      const total = rows.reduce((s, r) => s + r.s.overdue, 0);
      return { summary: `${rows.length} customers match. Total overdue ${M(total)}. Top: ${top.map((c) => `${c.name} (outstanding ${M(c.outstanding)}, overdue ${M(c.overdue)}, oldest ${c.maxDays}d, risk ${c.risk} ${c.band}, ${c.bounces} bounced cheques)`).join("; ")}`, ui: { kind: "customers", rows: top }, records: top.map((c) => ({ type: "Customer", id: c.id, label: c.name, href: `/customers/${c.id}` })), metrics: [{ label: "Customers matched", value: String(rows.length) }, { label: "Total overdue", value: M(total) }] };
    },
  },
  get_customer: {
    description: "Get one customer's balance, credit limit, aging and risk factors by name.",
    input: z.object({ name: z.string().min(2) }),
    run(a: { name: string }): ToolResult {
      const c = idx().db.customers.find((x) => x.name.toLowerCase().includes(a.name.toLowerCase()));
      if (!c) return { summary: `No customer matches "${a.name}".`, ui: { kind: "none", reason: `No customer named “${a.name}”.` } };
      const s = customerStats(c.id);
      return { summary: `${c.name} (${c.city}): limit ${M(c.creditLimit)}, outstanding ${M(s.outstanding)}, overdue ${M(s.overdue)} (oldest ${s.maxDaysOverdue}d), risk ${s.risk} ${s.band}; avg days to pay ${s.avgDaysToPayPrev90.toFixed(0)} → ${s.avgDaysToPay90.toFixed(0)}; ${s.bounces180} bounced cheques/180d. Factors: ${s.factors.filter((f) => f.points > 0.5).map((f) => `${f.label} (${f.detail})`).join("; ")}`, ui: { kind: "customers", rows: [lite({ c, s })] }, records: [{ type: "Customer", id: c.id, label: c.name, href: `/customers/${c.id}` }] };
    },
  },
  get_ar_aging: {
    description: "Receivables aging buckets (current, 1-30, 31-60, 61-90, 90+ days past due).",
    input: z.object({}),
    run(): ToolResult { const a = arAging(); return { summary: a.map((x) => `${x.bucket}: ${M(x.amount)} (${x.count} invoices)`).join("; "), ui: { kind: "bars", title: "Receivables aging", money: true, data: a.map((x) => ({ label: x.bucket, value: Math.round(x.amount) })) }, metrics: [{ label: "Total receivable", value: M(a.reduce((s, x) => s + x.amount, 0)) }] }; },
  },
  get_replenishment_recommendations: {
    description: "Forecast-driven purchase recommendations for products at risk of stockout, with quantities and reasons.",
    input: z.object({ limit: z.number().int().min(1).max(8).default(3), warehouse: z.string().optional() }),
    run(a: { limit: number; warehouse?: string }): ToolResult {
      const recs = recommendations().filter((r) => !a.warehouse || idx().wh.get(r.warehouseId)!.code.toLowerCase().includes(a.warehouse.toLowerCase())).slice(0, a.limit);
      return { summary: recs.map((r) => `${r.product.name} @ ${idx().wh.get(r.warehouseId)!.code}: available ${r.available}, 30d forecast ${r.forecast30}, lead ${r.leadTime}d, stockout ~${r.stockoutDays}d, recommend ${r.recommendedQty} units (id ${r.id})`).join("; ") || "No products currently at risk.", ui: { kind: "recs", ids: recs.map((r) => r.id) }, records: recs.map((r) => ({ type: "Product", id: r.product.id, label: r.product.name, href: `/inventory/${r.product.id}` })), metrics: [{ label: "Positions at risk", value: String(recommendations().length) }] };
    },
  },
  get_stock_position: {
    description: "Stock on hand, reserved, available and days of cover for a product name.",
    input: z.object({ product: z.string().min(2) }),
    run(a: { product: string }): ToolResult {
      const rows = stockRows().filter((r) => r.product.name.toLowerCase().includes(a.product.toLowerCase())).sort((x, y) => y.on - x.on).slice(0, 8);
      if (!rows.length) return { summary: "No matching product.", ui: { kind: "none", reason: `No product matches “${a.product}”.` } };
      return { summary: rows.map((r) => `${r.product.name} @ ${idx().wh.get(r.warehouseId)!.code}: on hand ${r.on}, reserved ${r.reserved}, available ${r.available}, cover ${r.daysCover > 900 ? "n/a" : Math.round(r.daysCover) + "d"}, status ${r.status}`).join("; "), ui: { kind: "metrics", items: rows.slice(0, 6).map((r) => ({ label: `${r.product.name} · ${idx().wh.get(r.warehouseId)!.code}`, value: `${r.available.toLocaleString("en-US")} available` })) }, records: rows.slice(0, 3).map((r) => ({ type: "Product", id: r.product.id, label: r.product.name, href: `/inventory/${r.product.id}` })) };
    },
  },
  get_sales_metrics: {
    description: "Revenue and margin grouped by customer, product, category, region or rep over the last N days.",
    input: z.object({ groupBy: z.enum(["customer", "product", "category", "region", "rep"]), days: z.number().int().min(7).max(365).default(90), limit: z.number().int().min(1).max(15).default(8) }),
    run(a: { groupBy: "customer" | "product" | "category" | "region" | "rep"; days: number; limit: number }): ToolResult {
      const { cus, prod, emp } = idx(), t = getDB().today;
      const keyFn = { customer: (i: { customerId: string }) => cus.get(i.customerId)!.name, region: (i: { customerId: string }) => cus.get(i.customerId)!.city, rep: (i: { customerId: string }) => emp.get(cus.get(i.customerId)!.repId)?.name ?? "—", product: (_: unknown, l: { productId: string }) => prod.get(l.productId)!.name, category: (_: unknown, l: { productId: string }) => prod.get(l.productId)!.category.replace(/_/g, " ") };
      const m = salesBy(addDays(t, -(a.days - 1)), t, keyFn[a.groupBy] as never) as Map<string, { revenue: number; cost: number; qty: number }>;
      const rows = [...m].map(([k, v]) => ({ k, rev: v.revenue, gm: v.revenue ? ((v.revenue - v.cost) / v.revenue) * 100 : 0 })).sort((x, y) => y.rev - x.rev).slice(0, a.limit);
      return { summary: `Top ${a.groupBy} by revenue, last ${a.days} days: ${rows.map((r) => `${r.k} ${M(r.rev)} (margin ${r.gm.toFixed(1)}%)`).join("; ")}`, ui: { kind: "bars", title: `Revenue by ${a.groupBy}, last ${a.days} days`, money: true, data: rows.map((r) => ({ label: r.k, value: Math.round(r.rev) })) } };
    },
  },
  explain_profit_change: {
    description: "Explain why gross/net profit changed between the last full month and the month before, with drivers.",
    input: z.object({}),
    run(): ToolResult {
      const p = profitVariance();
      const steps: { label: string; value: number; total?: boolean }[] = [{ label: "Prev. net profit", value: p.prev.netProfit, total: true }];
      const gpDelta = p.cur.grossProfit - p.prev.grossProfit;
      const volume = (p.cur.revenue - p.prev.revenue) * (p.prev.gm / 100);
      const marginEff = gpDelta - volume;
      steps.push({ label: "Volume", value: volume }, { label: "Margin rate & mix", value: marginEff });
      const topOpex = p.opex.filter((o) => Math.abs(o.delta) > 1).slice(0, 3);
      for (const o of topOpex) steps.push({ label: o.name.split(" ")[0]!, value: -o.delta });
      const rest = (p.cur.netProfit - p.prev.netProfit) - gpDelta + p.opex.reduce((s, o) => s + o.delta, 0) - 0;
      if (Math.abs(rest) > 1) steps.push({ label: "Other", value: rest });
      steps.push({ label: "Net profit", value: p.cur.netProfit, total: true });
      const worst = [...p.cats].sort((a, b) => a.mix + a.rate - (b.mix + b.rate))[0]!;
      const bullets = [`Revenue ${M(p.cur.revenue)} vs ${M(p.prev.revenue)} (${(((p.cur.revenue / p.prev.revenue) - 1) * 100).toFixed(1)}%).`, `Gross margin ${p.cur.gm.toFixed(1)}% vs ${p.prev.gm.toFixed(1)}%.`, `Largest category drag: ${worst.category.replace(/_/g, " ")} (margin ${worst.prevGm.toFixed(1)}% → ${worst.gm.toFixed(1)}%).`, `Purchase price variance ${M(p.ppv.cur)} vs ${M(p.ppv.prev)}; scheme free-goods cost ${M(p.scheme.cur)} vs ${M(p.scheme.prev)}.`];
      return { summary: bullets.join(" ") + ` Net profit ${M(p.cur.netProfit)} vs ${M(p.prev.netProfit)}. Opex movers: ${topOpex.map((o) => `${o.name} ${M(o.delta)}`).join("; ")}.`, ui: { kind: "waterfall", steps, bullets }, metrics: [{ label: "Net profit", value: M(p.cur.netProfit) }, { label: "Gross margin", value: `${p.cur.gm.toFixed(1)}%` }], records: [{ type: "Report", id: "pnl", label: "Profit & loss", href: "/finance/statements" }] };
    },
  },
  get_cashflow_projection: {
    description: "13-week cash projection with the weeks below the minimum cash threshold and their drivers.",
    input: z.object({}),
    run(): ToolResult {
      const cp = cashProjection(); const breach = cp.weeks.find((w) => w.closing < ORG.minCash); const min = [...cp.weeks].sort((a, b) => a.closing - b.closing)[0]!;
      return { summary: `${breach ? `Cash falls below the ${M(ORG.minCash)} minimum in week ${breach.week} (${M(breach.closing)}). Drivers: ${breach.drivers.map((d) => `${d.label} ${M(d.amount)}`).join("; ")}.` : "Cash stays above the minimum."} Lowest balance ${M(min.closing)} in week ${min.week}.`, ui: { kind: "cash", weeks: cp.weeks.map((w) => ({ label: `W${w.week}`, closing: Math.round(w.closing) })), min: ORG.minCash }, records: [{ type: "Report", id: "cash", label: "13-week cash projection", href: "/finance/cashflow" }] };
    },
  },
  get_expense_breakdown: {
    description: "Operating expenses by ledger account for the last N days.",
    input: z.object({ days: z.number().int().min(30).max(365).default(90) }),
    run(a: { days: number }): ToolResult {
      const db = getDB(), from = addDays(db.today, -(a.days - 1));
      const m = new Map<string, number>();
      for (const j of db.journal) if (j.date >= from && j.type !== "closing") for (const l of j.lines) { const ac = idx().acct.get(l.account)!; if (ac.group === "Operating Expenses") m.set(ac.name, (m.get(ac.name) ?? 0) + l.debit - l.credit); }
      const rows = [...m].sort((x, y) => y[1] - x[1]).slice(0, 8);
      return { summary: `Operating expenses, last ${a.days} days: ${rows.map(([k, v]) => `${k} ${M(v)}`).join("; ")}`, ui: { kind: "bars", title: `Biggest expenses, last ${a.days} days`, money: true, data: rows.map(([label, v]) => ({ label, value: Math.round(v) })) }, records: [{ type: "Report", id: "journal", label: "General ledger", href: "/finance/journal" }] };
    },
  },
  get_anomalies: {
    description: "Detected anomalies: supplier price increases, duplicate bills, discrepancies, unusual journals.",
    input: z.object({}),
    run(): ToolResult {
      const k = ["supplier_price", "duplicate_bill", "discrepancy", "journal"];
      const list = insights().filter((i) => k.includes(i.kind));
      return { summary: list.map((i) => `${i.title}: ${i.statement}`).join(" | "), ui: { kind: "metrics", items: list.map((i) => ({ label: i.title, value: i.severity })) }, records: list.flatMap((i) => i.sources.slice(0, 1).map((s) => ({ type: s.type, id: i.id, label: s.label, href: s.href }))) };
    },
  },
  get_supplier_scorecard: {
    description: "Supplier lead time, reliability, payable and bill issues by name.",
    input: z.object({ name: z.string().min(2) }),
    run(a: { name: string }): ToolResult {
      const s = idx().db.suppliers.find((x) => x.name.toLowerCase().includes(a.name.toLowerCase()));
      if (!s) return { summary: "No supplier found.", ui: { kind: "none", reason: `No supplier named “${a.name}”.` } };
      const st = supplierStats(s.id);
      return { summary: `${s.name}: spend 12m ${M(st.spend12m)}, payable ${M(st.payable)}, avg lead ${st.avgLead.toFixed(1)}d (promised ${s.leadTimeDays}), on-time ${st.reliability.toFixed(0)}%, ${st.exceptions} bills with issues.`, ui: { kind: "metrics", items: [{ label: "Spend (12m)", value: M(st.spend12m) }, { label: "Payable", value: M(st.payable) }, { label: "Avg lead time", value: `${st.avgLead.toFixed(0)} days` }, { label: "On-time", value: `${st.reliability.toFixed(0)}%` }] }, records: [{ type: "Supplier", id: s.id, label: s.name, href: `/suppliers/${s.id}` }] };
    },
  },
  resolve_period: {
    description: "Convert a natural-language period (today, yesterday, this week, last week, this month, last month, last quarter, this quarter, fiscal year to date, last 30 days, a month name) into exact from/to dates. ALWAYS call this before get_revenue or open_page when the user uses a relative date.",
    input: z.object({ phrase: z.string().min(2) }),
    run(a: { phrase: string }): ToolResult {
      const r = resolvePeriod(a.phrase, getDB().today);
      return r ? { summary: `"${a.phrase}" = ${r.from} to ${r.to} (${r.label}). Today is ${getDB().today}; weeks run Monday to Sunday; fiscal year is July to June.`, ui: { kind: "none", reason: `${r.label}: ${r.from} → ${r.to}` } } : { summary: `Could not interpret "${a.phrase}" as a period. Ask the user for dates.`, ui: { kind: "none", reason: "I couldn't work out that period." } };
    },
  },
  how_to: {
    description: "Look up how to do something in Meridian ERP or what a screen is for (step-by-step guide with the page path). Use for any 'how do I', 'where is', 'what does' or 'teach me' question.",
    input: z.object({ topic: z.string().min(2) }),
    run(a: { topic: string }): ToolResult {
      const g = findGuide(a.topic, 2);
      if (!g.length) return { summary: `No guide matched. App map: ${APP_MAP}`, ui: { kind: "none", reason: "No step-by-step guide for that. Ask me about a specific screen or task." } };
      return { summary: g.map((x) => `${x.title} (page ${x.path}): ${x.steps.join(" ")} ${x.notes ?? ""}`).join(" || "), ui: { kind: "guide", title: g[0]!.title, steps: g[0]!.steps, path: g[0]!.path, notes: g[0]!.notes } };
    },
  },
  get_revenue: {
    description: "Revenue, gross profit and margin between two dates (YYYY-MM-DD), optionally grouped by month, customer, product, category, region or rep. Use for 'show revenue from X to Y'.",
    input: z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), groupBy: z.enum(["month", "customer", "product", "category", "region", "rep"]).optional() }),
    run(a: { from: string; to: string; groupBy?: "month" | "customer" | "product" | "category" | "region" | "rep" }): ToolResult {
      const db = getDB();
      if (a.from > a.to) return { summary: "from is after to.", ui: { kind: "none", reason: "The start date is after the end date." } };
      const from = a.from < db.start ? db.start : a.from, to = a.to > db.today ? db.today : a.to;
      const p = pl(from, to);
      const note = from !== a.from || to !== a.to ? ` (clamped to available data ${from} to ${to})` : "";
      const { cus, prod, emp } = idx();
      let ui: ToolUI = { kind: "metrics", items: [{ label: "Revenue", value: M(p.revenue) }, { label: "Gross profit", value: M(p.grossProfit) }, { label: "Gross margin", value: `${p.gm.toFixed(1)}%` }, { label: "Net profit", value: M(p.netProfit) }] };
      let extra = "";
      if (a.groupBy === "month") {
        const m = new Map<string, number>();
        for (const i of db.invoices) if (i.date >= from && i.date <= to) m.set(i.date.slice(0, 7), (m.get(i.date.slice(0, 7)) ?? 0) + i.subtotal - i.discount);
        const rows = [...m].sort((x, y) => x[0].localeCompare(y[0]));
        ui = { kind: "bars", title: `Revenue by month, ${from} to ${to}`, money: true, data: rows.map(([label, value]) => ({ label, value: Math.round(value) })) };
        extra = " By month: " + rows.map(([k, v]) => `${k} ${M(v)}`).join("; ");
      } else if (a.groupBy) {
        const key = { customer: (i: { customerId: string }) => cus.get(i.customerId)!.name, region: (i: { customerId: string }) => cus.get(i.customerId)!.city, rep: (i: { customerId: string }) => emp.get(cus.get(i.customerId)!.repId)?.name ?? "—", product: (_: unknown, l: { productId: string }) => prod.get(l.productId)!.name, category: (_: unknown, l: { productId: string }) => prod.get(l.productId)!.category.replace(/_/g, " ") }[a.groupBy];
        const rows = [...(salesBy(from, to, key as never) as Map<string, { revenue: number }>)].map(([k, v]) => [k, v.revenue] as const).sort((x, y) => y[1] - x[1]).slice(0, 10);
        ui = { kind: "bars", title: `Revenue by ${a.groupBy}, ${from} to ${to}`, money: true, data: rows.map(([label, value]) => ({ label, value: Math.round(value) })) };
        extra = ` Top ${a.groupBy}: ` + rows.slice(0, 5).map(([k, v]) => `${k} ${M(v)}`).join("; ");
      }
      return { summary: `${from} to ${to}${note}: revenue ${M(p.revenue)}, gross profit ${M(p.grossProfit)} (${p.gm.toFixed(1)}%), net profit ${M(p.netProfit)}.${extra}`, ui, metrics: [{ label: `Revenue ${from} → ${to}`, value: M(p.revenue) }], records: [{ type: "Report", id: "pnl", label: "Profit & loss", href: "/finance/statements" }] };
    },
  },
  open_page: {
    description: "Navigate the user's screen to an ERP page, optionally with filters or a date range. Allowed paths: /overview /sales/orders /sales/invoices /sales/payments /sales/quotes /customers /inventory /inventory/replenishment /inventory/stock /purchasing/orders /purchasing/bills /finance/statements /finance/cashflow /finance/receivables /finance/payables /finance/journal /approvals /expenses /warehouses /suppliers /reports/<id>. Report ids: sales-by-customer, sales-by-product, sales-by-region, sales-by-rep, gross-margin, inventory-valuation, stock-movement, purchase-analysis, supplier-performance. Params: reports accept from & to (YYYY-MM-DD); /customers accepts overdue=1, city, minBalance, minDays, band; /sales/orders and /sales/invoices accept status.",
    input: z.object({ path: z.string(), params: z.record(z.string(), z.string()).optional(), label: z.string().optional() }),
    run(a: { path: string; params?: Record<string, string>; label?: string }): ToolResult {
      const ok = /^\/(overview|sales\/(orders|invoices|payments|quotes|returns|leads)|customers|inventory(\/(replenishment|stock|expiry))?|purchasing\/(orders|bills|receipts|payments)|finance\/(statements|cashflow|receivables|payables|journal|reconciliation|tax)|approvals|expenses|warehouses|suppliers|employees|reports(\/[a-z-]+)?)$/.test(a.path);
      if (!ok) return { summary: `Path ${a.path} is not available.`, ui: { kind: "none", reason: `I can't open ${a.path}.` } };
      const q = new URLSearchParams(a.params ?? {}).toString();
      const path = q ? `${a.path}?${q}` : a.path;
      return { summary: `Opened ${path} on the user's screen.`, ui: { kind: "navigate", path, label: a.label ?? path } };
    },
  },
  propose_record_payment: {
    description: "Propose recording a customer payment (allocated to oldest invoices). A human must confirm.",
    input: z.object({ customerName: z.string().min(2), amount: z.number().positive(), method: z.enum(["bank_transfer", "cash", "cheque", "pdc"]).default("bank_transfer") }),
    run(a: { customerName: string; amount: number; method: "bank_transfer" | "cash" | "cheque" | "pdc" }): ToolResult {
      const c = idx().db.customers.find((x) => x.name.toLowerCase().includes(a.customerName.toLowerCase()));
      if (!c) return { summary: "No customer found.", ui: { kind: "none", reason: `No customer named “${a.customerName}”.` } };
      const s = customerStats(c.id);
      if (a.amount > s.outstanding + 0.5) return { summary: `Amount exceeds outstanding ${M(s.outstanding)}.`, ui: { kind: "none", reason: `${c.name} owes ${M(s.outstanding)}; ${M(a.amount)} is more than that.` } };
      const p: Proposal = { id: `prop_pay_${c.id}_${a.amount}`, command: "RecordPayment", title: `Record payment: ${c.name}`, lines: [["Customer", c.name], ["Amount", M(a.amount)], ["Method", a.method.replace("_", " ")], ["Outstanding before", M(s.outstanding)]], consequence: "Allocated to the oldest open invoices first. Posts Dr Bank / Cr Trade Debtors.", params: { customerId: c.id, amount: a.amount, method: a.method } };
      return { summary: `Proposal ready: record ${M(a.amount)} from ${c.name}. Awaiting confirmation.`, ui: { kind: "proposal", proposal: p } };
    },
  },
  propose_purchase_order: {
    description: "Propose (never create) a purchase order from a replenishment recommendation id. A human must confirm.",
    input: z.object({ recommendationId: z.string(), quantity: z.number().int().positive().optional() }),
    run(a: { recommendationId: string; quantity?: number }): ToolResult {
      const r = recommendations().find((x) => x.id === a.recommendationId);
      if (!r) return { summary: "Unknown recommendation id.", ui: { kind: "none", reason: "That recommendation no longer exists." } };
      const q = a.quantity ?? r.recommendedQty;
      const p: Proposal = { id: `prop_${r.id}`, command: "CreatePurchaseOrder", title: `Purchase order for ${r.product.name}`, lines: [["Supplier", idx().sup.get(r.supplierId)!.name], ["Deliver to", idx().wh.get(r.warehouseId)!.code], ["Quantity", `${q.toLocaleString("en-US")} units (${q / r.product.cartonSize} cartons)`], ["Estimated value", M(q * r.unitCost * 1.17)], ["Expected", `${r.leadTime} days`]], consequence: `Creates a draft PO${q * r.unitCost * 1.17 > 1_000_000 ? " that needs Owner approval (above Rs 1,000,000)" : ""}. Nothing is purchased until approved.`, params: { recId: r.id, qty: q } };
      return { summary: `Proposal ready: ${p.title}, ${q} units. Awaiting human confirmation.`, ui: { kind: "proposal", proposal: p } };
    },
  },
  propose_credit_hold: {
    description: "Propose placing a customer on credit hold. A human must confirm; this only creates an approval request.",
    input: z.object({ customerName: z.string().min(2), reason: z.string().min(3) }),
    run(a: { customerName: string; reason: string }): ToolResult {
      const c = idx().db.customers.find((x) => x.name.toLowerCase().includes(a.customerName.toLowerCase()));
      if (!c) return { summary: "No customer found.", ui: { kind: "none", reason: `No customer named “${a.customerName}”.` } };
      const s = customerStats(c.id);
      const p: Proposal = { id: `prop_hold_${c.id}`, command: "PlaceCreditHold", title: `Credit hold: ${c.name}`, lines: [["Customer", c.name], ["Outstanding", M(s.outstanding)], ["Overdue", M(s.overdue)], ["Reason", a.reason]], consequence: "New orders will need a credit override until the overdue balance is cleared. Sent to the Sales Manager for approval.", params: { customerId: c.id } };
      return { summary: `Proposal ready: credit hold for ${c.name}. Awaiting confirmation.`, ui: { kind: "proposal", proposal: p } };
    },
  },
  draft_collection_message: {
    description: "Draft a polite payment follow-up message for a customer using real balances. Sending requires human confirmation.",
    input: z.object({ customerName: z.string().min(2), channel: z.enum(["WhatsApp", "Email"]).default("WhatsApp") }),
    run(a: { customerName: string; channel: "WhatsApp" | "Email" }): ToolResult {
      const c = idx().db.customers.find((x) => x.name.toLowerCase().includes(a.customerName.toLowerCase()));
      if (!c) return { summary: "No customer found.", ui: { kind: "none", reason: `No customer named “${a.customerName}”.` } };
      const s = customerStats(c.id);
      const text = `Assalam o Alaikum ${c.contact},\n\nThis is a gentle reminder from Meridian Distribution Co. Our records show ${M(s.overdue)} past due on your account, the oldest invoice ${s.maxDaysOverdue} days overdue. Could you please arrange payment this week, or let us know a date that suits you? We're happy to share a statement of account.\n\nThank you for your continued business.\nAccounts Receivable, Meridian Distribution Co.`;
      return { summary: `Draft prepared for ${c.name} on ${a.channel}. Not sent.`, ui: { kind: "draft", customerId: c.id, customer: c.name, channel: a.channel, text }, records: [{ type: "Customer", id: c.id, label: c.name, href: `/customers/${c.id}` }] };
    },
  },
} as const;

export type ToolName = keyof typeof TOOLS;
export function runTool(name: ToolName, args: unknown): ToolResult {
  const t = TOOLS[name];
  const parsed = t.input.parse(args ?? {});
  return (t.run as (a: unknown) => ToolResult)(parsed);
}
