import type { Expense, LeaveRequest } from "../data/types";
import { diffDays } from "../data/dates";
import { audit, fail, money, newId, nextNo, notify, ok, type Ctx, type Result } from "./core";

export function submitExpense(ctx: Ctx, p: { employeeId: string; category: string; merchant: string; amount: number; purpose: string; date: string; hasReceipt: boolean }): Result<{ id: string }> {
  const db = ctx.db;
  if (!(p.amount > 0)) return fail("EXP_AMOUNT", "Enter an amount", "Expenses must be above zero.", "Type the total on the receipt.");
  if (p.merchant.trim().length < 2 || p.purpose.trim().length < 4) return fail("EXP_FIELDS", "Add merchant and purpose", "Finance needs both to approve.", "For example: Petro Plus, route visit.");
  if (p.date > ctx.date) return fail("EXP_DATE", "Date is in the future", "Expenses can't be dated after today.", "Use the receipt date.");
  const flags: string[] = [];
  const limits: Record<string, number> = { Fuel: 15_000, Meals: 5_000, Travel: 20_000, Office: 10_000, Telephone: 5_000, Entertainment: 15_000, Repairs: 25_000 };
  if (p.amount > (limits[p.category] ?? 20_000)) flags.push("Above category limit");
  if (!p.hasReceipt) flags.push("No receipt attached");
  const dup = db.expenses.find((e) => e.employeeId === p.employeeId && e.merchant.toLowerCase() === p.merchant.trim().toLowerCase() && e.amount === p.amount && Math.abs(diffDays(e.date, p.date)) <= 2);
  if (dup) flags.push(`Possible duplicate of ${dup.number}`);
  const e: Expense = { id: newId("ex"), number: nextNo("EXP-", db.expenses, 1000), employeeId: p.employeeId, category: p.category, merchant: p.merchant.trim(), date: p.date, amount: p.amount, purpose: p.purpose.trim(), status: "submitted", flags };
  db.expenses.unshift(e);
  const emp = db.employees.find((x) => x.id === p.employeeId)!;
  db.approvals.unshift({ id: newId("apr"), type: "expense", title: `Expense ${e.number} – ${p.category.toLowerCase()}`, subtitle: `${emp.name} · ${p.merchant}${flags.length ? ` · ${flags[0]}` : ""}`, amount: p.amount, requestedBy: emp.name, requestedAt: ctx.date, status: "pending", ref: e.id, source: "user", step: "Line manager" });
  audit(ctx, "expense.submitted", "Expense", e.number, `${money(p.amount)} · ${p.category}${flags.length ? ` · ${flags.join(", ")}` : ""}`);
  return ok({ id: e.id }, `${e.number} submitted${flags.length ? ` with ${flags.length} flag${flags.length > 1 ? "s" : ""}` : ""}. Routed to the line manager.`);
}

export function submitLeave(ctx: Ctx, p: { employeeId: string; type: LeaveRequest["type"]; from: string; to: string; reason: string }): Result<{ id: string }> {
  if (p.to < p.from) return fail("LV_DATES", "End date is before start", "Check the dates.", "Pick a start date and a later end date.");
  const days = diffDays(p.to, p.from) + 1;
  const l: LeaveRequest = { id: newId("lv"), employeeId: p.employeeId, type: p.type, from: p.from, to: p.to, days, status: "pending", reason: p.reason || "Personal" };
  ctx.db.leaves.unshift(l);
  const emp = ctx.db.employees.find((x) => x.id === p.employeeId)!;
  ctx.db.approvals.unshift({ id: newId("apr"), type: "leave", title: `Leave request – ${emp.name}`, subtitle: `${p.type} · ${days} day${days > 1 ? "s" : ""}`, amount: null, requestedBy: emp.name, requestedAt: ctx.date, status: "pending", ref: l.id, source: "user", step: "Line manager" });
  audit(ctx, "leave.requested", "Leave", emp.name, `${p.type} ${days}d`);
  return ok({ id: l.id }, "Leave request sent to your manager");
}

export function confirmBankMatch(ctx: Ctx, p: { txnId: string; accept: boolean }): Result {
  const t = ctx.db.bank.find((x) => x.id === p.txnId);
  if (!t) return fail("BANK_NOT_FOUND", "Bank line not found", "It may have been removed.", "Refresh the page.");
  if (p.accept) { t.status = "matched"; audit(ctx, "bank_reconciliation.matched", "Bank transaction", t.description, `Confirmed ${t.suggestion?.method ?? "manual"} match: ${t.suggestion?.label ?? ""}`); return ok(undefined, "Match confirmed"); }
  t.status = "unmatched"; t.suggestion = undefined;
  return ok(undefined, "Suggestion rejected");
}

export function setRule(ctx: Ctx, p: { id: string; enabled?: boolean; value?: number }): Result {
  const r = ctx.db.rules.find((x) => x.id === p.id);
  if (!r) return fail("RULE_NOT_FOUND", "Rule not found", "It may have been removed.", "Refresh the page.");
  if (p.enabled !== undefined) r.enabled = p.enabled;
  if (p.value !== undefined) r.value = p.value;
  audit(ctx, "workflow.updated", "Workflow", r.id, `${r.enabled ? "enabled" : "disabled"}${p.value !== undefined ? `, threshold ${p.value}` : ""}`);
  return ok(undefined, `${r.name} ${r.enabled ? "on" : "off"}`);
}
export function createRule(ctx: Ctx, p: Omit<import("../data/types").AutomationRule, "id" | "runs">): Result<{ id: string }> {
  if (p.name.trim().length < 3) return fail("RULE_NAME", "Name the rule", "Give it a name you will recognise.", "For example: Big invoice alert.");
  const r = { ...p, id: nextNo("WF-", ctx.db.rules.map((x) => ({ number: x.id })), 0).replace(/(\d+)$/, (m) => String(+m).padStart(3, "0")), runs: 0 };
  ctx.db.rules.push(r);
  audit(ctx, "workflow.created", "Workflow", r.id, r.name);
  notify(ctx, `Rule created: ${r.name}`, `${r.event} → ${r.action}`, "info", "/automations");
  return ok({ id: r.id }, `${r.name} created`);
}

export function queueMessage(ctx: Ctx, p: { customerId: string; channel: "WhatsApp" | "Email"; text: string }): Result {
  const c = ctx.db.customers.find((x) => x.id === p.customerId);
  if (!c) return fail("CUS_NOT_FOUND", "Customer not found", "It may have been removed.", "Refresh the page.");
  if (p.text.trim().length < 10) return fail("MSG_EMPTY", "Message is empty", "There is nothing to send.", "Write the message first.");
  audit(ctx, "message.queued", "Customer", c.name, `${p.channel} follow-up queued (simulated, not sent)`);
  return ok(undefined, "Queued in the outbox (simulated). Nothing was sent; connect WhatsApp in Integrations to deliver for real.");
}
