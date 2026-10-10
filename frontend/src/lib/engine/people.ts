import type { Employee, Expense, LeaveRequest, PayrollRun } from "../data/types";
import { monthKey, addMonths } from "../data/dates";
import { can } from "../rbac";
import { diffDays } from "../data/dates";
import { assertPostable, audit, fail, money, newId, nextNo, notify, ok, postJE, queue, r2, type Ctx, type Result } from "./core";

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
  queue(ctx, p.channel, `${c.contact} (${c.name})`, "Payment follow-up", p.text);
  audit(ctx, "message.queued", "Customer", c.name, `${p.channel} follow-up queued (simulated, not sent)`);
  return ok(undefined, "Queued in the outbox (simulated). Nothing was sent; connect WhatsApp in Integrations to deliver for real.");
}

const denyHr = (ctx: Ctx) => (can(ctx.role, "hr.manage") ? null : fail("HR_FORBIDDEN", "Your role can't manage employees", "Only Owner, Admin and Finance can add or change employee records.", "Switch persona or ask HR."));

export interface EmployeeInput { name: string; department: string; position: string; managerId: string | null; branch: string; joinDate: string; salary: number; phone: string; email: string; cnic: string; status: Employee["status"] }
export function createEmployee(ctx: Ctx, p: EmployeeInput): Result<{ id: string }> {
  const denied = denyHr(ctx); if (denied) return denied;
  const db = ctx.db;
  if (p.name.trim().length < 3) return fail("EMP_NAME", "Enter the full name", "An employee needs a name of at least 3 letters.", "Type first and last name.");
  if (!p.department.trim() || !p.position.trim()) return fail("EMP_ROLE", "Add department and position", "Both are needed for the org chart and payroll.", "For example: Sales, Order Booker.");
  if (!(p.salary >= 10_000)) return fail("EMP_SALARY", "Check the salary", "Monthly salary must be at least Rs 10,000.", "Enter the gross monthly salary in rupees.");
  if (p.cnic && !/^\d{5}-\d{7}-\d$/.test(p.cnic)) return fail("EMP_CNIC", "CNIC format is wrong", "Use 12345-1234567-1.", "Retype the CNIC with dashes.");
  if (p.cnic && db.employees.some((e) => e.cnic === p.cnic)) return fail("EMP_CNIC_DUP", "This CNIC is already registered", "Another employee has the same CNIC.", "Open that record instead.");
  if (p.email && !/^\S+@\S+\.\S+$/.test(p.email)) return fail("EMP_EMAIL", "Email looks wrong", "Expected name@company.com.", "Check the address.");
  if (p.joinDate > ctx.date) return fail("EMP_JOIN", "Join date is in the future", "Employees are added on or after their first day.", "Use today's date or earlier.");
  const n = db.employees.reduce((m, e) => Math.max(m, +e.code.slice(4)), 0) + 1;
  const e: Employee = { id: newId("emp"), code: `EMP-${String(n).padStart(4, "0")}`, name: p.name.trim(), department: p.department.trim(), position: p.position.trim(), managerId: p.managerId, branch: p.branch, joinDate: p.joinDate, salary: Math.round(p.salary), status: p.status, phone: p.phone, email: p.email, cnic: p.cnic };
  db.employees.push(e);
  audit(ctx, "employee.created", "Employee", e.code, `${e.name} · ${e.position}`);
  return ok({ id: e.id }, `${e.name} added as ${e.code}`);
}

export function updateEmployee(ctx: Ctx, p: { id: string } & Partial<Pick<EmployeeInput, "position" | "department" | "managerId" | "branch" | "salary" | "phone" | "email" | "status">>): Result {
  const denied = denyHr(ctx); if (denied) return denied;
  const e = ctx.db.employees.find((x) => x.id === p.id);
  if (!e) return fail("EMP_NOT_FOUND", "Employee not found", "The record may have been removed.", "Refresh the page.");
  if (p.salary !== undefined && !(p.salary >= 10_000)) return fail("EMP_SALARY", "Check the salary", "Monthly salary must be at least Rs 10,000.", "Enter the gross monthly salary in rupees.");
  if (p.managerId === e.id) return fail("EMP_MANAGER", "Can't report to themselves", "Pick a different manager.", "Choose another person.");
  const changes: string[] = [];
  for (const k of ["position", "department", "managerId", "branch", "salary", "phone", "email", "status"] as const) {
    const v = p[k]; if (v === undefined || v === e[k]) continue;
    changes.push(k === "salary" ? `salary ${e.salary.toLocaleString("en-US")} → ${Number(v).toLocaleString("en-US")}` : `${k} → ${String(v)}`);
    (e as unknown as Record<string, unknown>)[k] = k === "salary" ? Math.round(Number(v)) : v;
  }
  if (!changes.length) return ok(undefined, "No changes");
  audit(ctx, "employee.updated", "Employee", e.code, changes.join("; "));
  return ok(undefined, `${e.name} updated`);
}

/** Post payroll for a month, same shape as the seeded runs: expense, employer EOBI, net payable, withholding tax, EOBI payable; then pay out of the payroll bank. */
export function runPayroll(ctx: Ctx, p: { month: string }): Result<{ month: string }> {
  const denied = denyHr(ctx); if (denied) return denied;
  const db = ctx.db;
  if (!/^\d{4}-\d{2}$/.test(p.month)) return fail("PAY_MONTH", "Pick a month", "Payroll runs by calendar month.", "Choose a month.");
  if (p.month >= monthKey(ctx.date)) return fail("PAY_FUTURE", "That month hasn't ended", "Payroll runs after the month closes.", `Run ${monthKey(addMonths(`${ctx.date.slice(0, 7)}-01`, -1))} or earlier.`);
  if (db.payroll.some((r) => r.month === p.month)) return fail("PAY_DUP", `${p.month} is already paid`, "A payroll run for this month exists. Running it twice would pay everyone twice.", "Pick the next unpaid month.");
  const blocked = assertPostable(db, ctx.date, true); if (blocked) return blocked as Result<never>;
  const active = db.employees.filter((e) => e.joinDate <= `${p.month}-31`);
  if (!active.length) return fail("PAY_EMPTY", "No employees to pay", "Nobody had joined by that month.", "Add employees first.");
  const gross = r2(active.reduce((s, e) => s + e.salary * (1 + (e.department === "Sales" && e.position.startsWith("Order") ? 0.12 : 0)), 0));
  const tax = r2(gross * 0.045), employee = r2(active.length * 370), eobi = r2(active.length * 370 * 2), net = r2(gross - tax - employee);
  postJE(ctx, `Payroll ${p.month}`, `Payroll ${p.month}`, [{ account: "6010", debit: gross, credit: 0 }, { account: "6015", debit: employee, credit: 0 }, { account: "2300", debit: 0, credit: net }, { account: "2130", debit: 0, credit: tax }, { account: "2140", debit: 0, credit: eobi }]);
  postJE(ctx, `Salaries paid ${p.month}`, `Payroll ${p.month}`, [{ account: "2300", debit: net, credit: 0 }, { account: "1130", debit: 0, credit: net }]);
  const run: PayrollRun = { month: p.month, gross, tax, eobi, net, headcount: active.length, status: "posted" };
  db.payroll.push(run); db.payroll.sort((a, b) => b.month.localeCompare(a.month));
  audit(ctx, "payroll.posted", "Payroll", p.month, `${active.length} people · net ${money(net)}`);
  notify(ctx, `Payroll ${p.month} posted`, `${active.length} employees, net ${money(net)}`, "info", "/employees/payroll");
  return ok({ month: p.month }, `Payroll ${p.month} posted: net ${money(net)} to ${active.length} employees`);
}
