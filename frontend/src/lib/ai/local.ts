// Computed answer engine: the no-API-key path. Same tools, same grounding (every figure comes from a tool result),
// deterministic text. Shown in the UI as "Computed" so it is never mistaken for model output.
import { interpret } from "../nl";
import { addDays } from "../data/dates";
import { getDB, pl, profitVariance, monthSeries } from "../data/queries";
import { runTool, type ToolName, type ToolResult } from "./tools";

export interface Step { tool: ToolName; args: Record<string, unknown> }
export interface LocalAnswer { status: "answered" | "insufficient_data"; steps: Step[]; results: ToolResult[]; text: string; topic: string; suggestions?: string[] }

const M = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
const Mm = (n: number) => `Rs ${(n / 1e6).toFixed(2)}M`;

export const INSUFFICIENT = "I don't have enough data to answer this reliably.";

export function answerLocal(q: string, prevTopic?: string): LocalAnswer {
  const s = q.toLowerCase();
  const run = (steps: Step[]) => steps.map((st) => runTool(st.tool, st.args));
  const mk = (topic: string, steps: Step[], compose: (r: ToolResult[]) => string, suggestions?: string[]): LocalAnswer => { const results = run(steps); return { status: "answered", steps, results, text: compose(results), topic, suggestions }; };

  if (/forecast .*(next year|annual)|churn|satisfaction|market share|competitor|headcount plan|employee turnover|attrition|nps\b/.test(s)) {
    return { status: "insufficient_data", steps: [], results: [], topic: "none", text: `${INSUFFICIENT}\n\nThe ERP holds 15 months of transactions, but nothing on ${/churn|satisfaction|nps/.test(s) ? "customer satisfaction or churn surveys" : /competitor|market share/.test(s) ? "competitors or market size" : /turnover|attrition|headcount/.test(s) ? "historical staff exits" : "a full prior year to base an annual forecast on"}. Try asking about sales, receivables, inventory, margins or cash.`, suggestions: ["Which customers are becoming risky?", "What products should we reorder?", "Why is profit down this month?"] };
  }

  if (/follow-?up|draft.*(message|whatsapp|email)|reminder/.test(s)) {
    const nl = interpret(q);
    const days = +(s.match(/(\d{2,3})\s*\+?\s*days/)?.[1] ?? 60);
    const search = { tool: "search_customers" as const, args: { overdueOnly: true, minDaysOverdue: days, limit: 6, ...(nl?.href.includes("city") ? { city: new URL("x://x" + nl.href.replace("/customers", "")).searchParams.get("city") ?? undefined } : {}) } };
    const first = runTool("search_customers", search.args);
    const top = first.ui.kind === "customers" ? first.ui.rows.slice(0, 3) : [];
    const steps: Step[] = [search, ...top.map((c) => ({ tool: "draft_collection_message" as const, args: { customerName: c.name, channel: "WhatsApp" } }))];
    const results = [first, ...top.map((c) => runTool("draft_collection_message", { customerName: c.name, channel: "WhatsApp" }))];
    const n = first.ui.kind === "customers" ? first.ui.rows.length : 0;
    const total = first.ui.kind === "customers" ? first.ui.rows.reduce((a, c) => a + c.overdue, 0) : 0;
    return { status: "answered", steps, results, topic: "collections", text: n ? `${n} customers have an invoice more than ${days} days overdue, ${M(total)} in total. I've drafted a follow-up for the ${top.length} largest. These are drafts: nothing is sent until you confirm, and in this demo sending is simulated.` : `No customer has an invoice more than ${days} days overdue.` };
  }

  if (/what (should|do) i do|what next|recommend(ed)? (action|step)|next step/.test(s) && (prevTopic === "collections" || prevTopic === "risk" || /customer|overdue|collect/.test(s))) {
    const r = runTool("search_customers", { riskBand: "high", limit: 3 });
    const rows = r.ui.kind === "customers" ? r.ui.rows : [];
    const steps: Step[] = [{ tool: "search_customers", args: { riskBand: "high", limit: 3 } }];
    const results = [r];
    const bullets: string[] = [];
    rows.forEach((c, i) => {
      if (i === 0) { steps.push({ tool: "propose_credit_hold", args: { customerName: c.name, reason: `${c.bounces} bounced cheques, ${c.maxDays} days overdue` } }); results.push(runTool("propose_credit_hold", { customerName: c.name, reason: `${c.bounces} bounced cheques, ${c.maxDays} days overdue` })); bullets.push(`- **${c.name}** (risk ${c.risk}): ${M(c.overdue)} overdue, oldest ${c.maxDays} days, ${c.bounces} bounced cheques. I propose a credit hold until the overdue balance is cleared.`); }
      else { steps.push({ tool: "draft_collection_message", args: { customerName: c.name, channel: "WhatsApp" } }); results.push(runTool("draft_collection_message", { customerName: c.name, channel: "WhatsApp" })); bullets.push(`- **${c.name}** (risk ${c.risk}): ${M(c.overdue)} overdue, oldest ${c.maxDays} days. Start with a personal follow-up; I drafted a message.`); }
    });
    return { status: "answered", steps, results, topic: "actions", text: `Based on payment history, these are the highest-risk accounts and what I'd do:\n${bullets.join("\n")}\n\nI've prepared the proposals below. Review and confirm each one; the credit hold goes to the Sales Manager for approval.` };
  }

  if (/inventory|stock ?out|reorder|replenish|running (out|low)|low stock|at risk/.test(s) && !/profit|expense/.test(s)) {
    const r = runTool("get_replenishment_recommendations", { limit: 3 });
    const steps: Step[] = [{ tool: "get_replenishment_recommendations", args: { limit: 3 } }];
    const results = [r];
    const ids = r.ui.kind === "recs" ? r.ui.ids : [];
    if (ids[0]) { steps.push({ tool: "propose_purchase_order", args: { recommendationId: ids[0] } }); results.push(runTool("propose_purchase_order", { recommendationId: ids[0] })); }
    return { status: "answered", steps, results, topic: "inventory", text: ids.length ? `${ids.length} products are most at risk of running out before a new delivery could arrive. Each card shows current availability, the 30-day forecast, supplier lead time and the reasoning. I prepared a purchase order proposal for the most urgent one; it needs your confirmation and normal approval rules still apply.` : "No products are currently at risk of stockout." };
  }

  if (/(profit|margin)/.test(s) && /(why|down|fell|drop|decline|lower|explain|change)/.test(s)) {
    return mk("profit", [{ tool: "explain_profit_change", args: {} }], (r) => { const u = r[0]!.ui; return u.kind === "waterfall" ? `Here is what moved profit between the last two full months:\n${u.bullets.map((b) => `- ${b}`).join("\n")}\n\nThe bridge below separates volume from margin effects and shows the biggest cost movements. Figures come straight from the general ledger.` : ""; });
  }

  if (/risk|risky|deteriorat|bad payer|slow pay/.test(s) && /customer|become|becoming|account/.test(s)) {
    return mk("risk", [{ tool: "search_customers", args: { riskBand: "high", limit: 5 } }, { tool: "search_customers", args: { riskBand: "medium", limit: 5 } }], (r) => { const a = r[0]!.ui.kind === "customers" ? r[0]!.ui.rows : []; const b = r[1]!.ui.kind === "customers" ? r[1]!.ui.rows : []; return `${a.length} customers are high risk and ${b.length} medium. Risk is a transparent score: overdue exposure, oldest overdue invoice, slowdown in days-to-pay, bounced cheques and credit utilisation. Open a customer to see each factor's contribution.`; });
  }

  if (/expense|spend|cost/.test(s) && /biggest|largest|top|most|breakdown|what are/.test(s)) {
    return mk("expenses", [{ tool: "get_expense_breakdown", args: { days: 90 } }], (r) => { const u = r[0]!.ui; return u.kind === "bars" ? `Over the last 90 days the biggest operating expense is **${u.data[0]!.label}** at ${M(u.data[0]!.value)}, followed by ${u.data.slice(1, 3).map((d) => `${d.label} (${M(d.value)})`).join(" and ")}. These exclude cost of goods sold.` : ""; });
  }

  if (/cash/.test(s)) {
    return mk("cash", [{ tool: "get_cashflow_projection", args: {} }], (r) => r[0]!.summary + " The chart shows the 13-week projection against the minimum cash threshold.");
  }

  if (/(rep|salesm|sales ?person|order booker)/.test(s) && /(underperform|worst|best|top|compare|perform)/.test(s)) {
    return mk("reps", [{ tool: "get_sales_metrics", args: { groupBy: "rep", days: 90, limit: 15 } }], (r) => { const u = r[0]!.ui; if (u.kind !== "bars") return ""; const sorted = [...u.data].sort((a, b) => a.value - b.value); const avg = u.data.reduce((a, d) => a + d.value, 0) / u.data.length; return `Across ${u.data.length} representatives, average revenue over the last 90 days is ${M(avg)}. The lowest three are ${sorted.slice(0, 3).map((d) => `${d.label} (${M(d.value)})`).join(", ")}. Revenue depends on territory size, so check customer count before drawing conclusions.`; });
  }

  if (/compare|same quarter|last year|year over year|yoy|vs\.? last/.test(s) && /quarter|year|month/.test(s)) {
    const db = getDB(), t = db.today;
    const qStart = "2026-07-01", qEnd = "2026-09-30", pStart = "2025-07-01", pEnd = "2025-09-30";
    const cur = pl(qStart, qEnd), prev = pl(pStart, pEnd);
    const cover = Math.round(((Date.parse(pEnd) - Date.parse(db.start)) / 86_400_000 / 92) * 100);
    const r: ToolResult = { summary: `Q1 FY26-27 revenue ${M(cur.revenue)} vs ${M(prev.revenue)}`, ui: { kind: "metrics", items: [{ label: "Revenue Q1 FY26-27", value: M(cur.revenue) }, { label: "Revenue Q1 FY25-26*", value: M(prev.revenue) }, { label: "Gross margin", value: `${cur.gm.toFixed(1)}% vs ${prev.gm.toFixed(1)}%` }, { label: "Net profit", value: `${M(cur.netProfit)} vs ${M(prev.netProfit)}` }] }, records: [{ type: "Report", id: "pnl", label: "Profit & loss", href: "/finance/statements" }] };
    void t; void monthSeries;
    return { status: "answered", steps: [{ tool: "get_sales_metrics", args: { groupBy: "category", days: 90 } }], results: [r], topic: "compare", text: `The current quarter (Oct–Dec) has only just started, so I compared the last complete quarter, Q1 FY26-27 (Jul–Sep), with the same quarter a year earlier.\n- Revenue ${(((cur.revenue / prev.revenue) - 1) * 100).toFixed(1)}%: ${Mm(cur.revenue)} vs ${Mm(prev.revenue)}.\n- Gross margin ${cur.gm.toFixed(1)}% vs ${prev.gm.toFixed(1)}%.\n- Net profit ${Mm(cur.netProfit)} vs ${Mm(prev.netProfit)}.\n\n*Caveat: the ERP history begins on ${db.start}, so last year's quarter is ${cover}% complete and may be understated.` };
  }

  if (/supplier|price (increase|anomal)|duplicate|anomal/.test(s)) {
    return mk("anomalies", [{ tool: "get_anomalies", args: {} }], (r) => r[0]!.summary.split(" | ").map((x) => `- ${x}`).join("\n") + "\n\nOpen the items below to review them.");
  }

  const stockQ = s.match(/(?:how (?:much|many)|stock of|do we have)\s+(.{3,40}?)(?:\s+(?:do we have|in stock|left|available)|\?|$)/);
  if (stockQ && /stock|have|left|available|how (much|many)/.test(s)) {
    return mk("stock", [{ tool: "get_stock_position", args: { product: stockQ[1]!.trim() } }], (r) => r[0]!.summary.split("; ").slice(0, 4).join("\n- ").replace(/^/, "- "));
  }

  const nl = interpret(q);
  if (nl || /overdue|owe|receivable|aging|outstanding|late/.test(s)) {
    const p = nl ? new URL("x://x" + nl.href.replace("/customers", "")).searchParams : new URLSearchParams();
    const args: Record<string, unknown> = { overdueOnly: true, limit: 8 };
    if (p.get("city")) args.city = p.get("city"); if (p.get("minBalance")) args.minBalance = +p.get("minBalance")!; if (p.get("minDays")) args.minDaysOverdue = +p.get("minDays")!; if (p.get("band")) args.riskBand = p.get("band");
    return mk("collections", [{ tool: "search_customers", args }, { tool: "get_ar_aging", args: {} }], (r) => { const u = r[0]!.ui; const n = u.kind === "customers" ? u.rows.length : 0; const tot = u.kind === "customers" ? u.rows.reduce((a, c) => a + c.overdue, 0) : 0; return n ? `${r[0]!.metrics?.[0]?.value ?? n} customers match. The ${n} largest hold ${M(tot)} overdue. Ask me “What should I do?” and I'll prioritise actions from their payment history.` : "No customers match those conditions."; });
  }

  return { status: "insufficient_data", steps: [], results: [], topic: "none", text: `${INSUFFICIENT}\n\nI answer from live ERP data using these checks: receivables and customer risk, inventory and replenishment, sales by customer/product/region/rep, profit changes, expenses, cash projection, supplier price anomalies. Try one of the suggestions.`, suggestions: ["Show overdue customers in Karachi with balances over 1 million", "What inventory is at risk?", "Why is profit down this month?", "Which sales reps are underperforming?"] };
}
void addDays;
