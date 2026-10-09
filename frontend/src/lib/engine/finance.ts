import { periodOf, assertPostable, audit, fail, money, newId, ok, postJE, r2, type Ctx, type Result } from "./core";
import { can } from "../rbac";
import type { JournalLine } from "../data/types";

export const JE_APPROVAL_LIMIT = 500_000;
export function postManualJE(ctx: Ctx, p: { date: string; memo: string; lines: JournalLine[] }): Result<{ pending: boolean }> {
  const db = ctx.db;
  const ls = p.lines.filter((l) => l.debit || l.credit);
  const dr = r2(ls.reduce((s, l) => s + l.debit, 0)), cr = r2(ls.reduce((s, l) => s + l.credit, 0));
  if (!p.memo.trim()) return fail("JE_MEMO", "Add a memo", "A journal entry needs a description so it can be audited.", "Describe the reason for the entry.");
  if (ls.length < 2) return fail("JE_LINES", "Add at least two lines", "A balanced entry needs a debit and a credit.", "Add the offsetting line.");
  if (Math.abs(dr - cr) > 0.009) return fail("JE_UNBALANCED", "Entry is not balanced", `Debits ${money(dr)} and credits ${money(cr)} differ by ${money(Math.abs(dr - cr))}.`, "Adjust a line so debits equal credits.");
  const ctl = ls.find((l) => db.accounts.find((a) => a.code === l.account)?.control);
  if (ctl) return fail("JE_CONTROL", "Control account can't be posted manually", `${ctl.account} ${db.accounts.find((a) => a.code === ctl.account)!.name} is fed only by subledgers.`, "Post through an invoice, bill, payment or stock document.");
  const per = periodOf(db, p.date);
  if (per.status === "closed") return fail("FIN_PERIOD_CLOSED", "We couldn't post this entry because the period is closed", `${per.name} is closed. Posting into a closed period is not allowed.`, "Change the posting date to an open period, or ask the Owner to reopen it.");
  if (per.status === "soft_closed" && !can(ctx.role, "period.close")) return fail("FIN_PERIOD_SOFT_CLOSED", "Period is soft-closed", `${per.name} only accepts entries from the Finance Manager.`, "Use an open period or ask Finance to post it.");
  if (per.status === "future") return fail("FIN_DATE_FUTURE", "Posting date is in the future", "Entries can't be dated after today.", "Use today's date.");
  if (dr > JE_APPROVAL_LIMIT) {
    db.approvals.unshift({ id: newId("apr"), type: "journal", title: `Manual journal – ${p.memo}`, subtitle: `${money(dr)} · prepared by ${ctx.actor}`, amount: dr, requestedBy: ctx.actor, requestedAt: ctx.date, status: "pending", ref: newId("je"), source: "user", step: "Finance Manager", payload: { date: p.date, memo: p.memo, lines: JSON.stringify(ls) } });
    audit(ctx, "journal_entry.submitted", "Journal entry", p.memo, `${money(dr)} needs a second approver`);
    return ok({ pending: true }, `Entries above ${money(JE_APPROVAL_LIMIT)} need a second approver. Sent to the Finance Manager.`);
  }
  postJE(ctx, p.memo, "Manual journal", ls, "manual", p.date);
  audit(ctx, "journal_entry.posted", "Journal entry", p.memo, `${money(dr)} · ${ls.map((l) => l.account).join("/")}`);
  return ok({ pending: false }, `Journal entry posted: ${money(dr)} balanced.`);
}

export function closePeriod(ctx: Ctx, p: { periodId: string }): Result {
  const db = ctx.db;
  if (!can(ctx.role, "period.close")) return fail("PERM", "You can't close periods", "Only the Owner and Finance Manager can.", "Ask Finance.");
  const open = { drafts: db.orders.filter((o) => o.status === "draft").length, bank: db.bank.filter((b) => b.status !== "matched").length, exc: db.bills.filter((b) => b.status === "exception").length };
  if (open.drafts + open.bank + open.exc > 0) return fail("PERIOD_OPEN_ITEMS", "The close checklist isn't clear", `${open.drafts} draft orders, ${open.bank} unreconciled bank lines and ${open.exc} bills in exception are still open.`, "Resolve those items, then close.");
  db.periodStatus[p.periodId] = "closed";
  audit(ctx, "period.closed", "Fiscal period", p.periodId, "No further posting allowed");
  return ok(undefined, `${p.periodId} closed`);
}
export function reopenPeriod(ctx: Ctx, p: { periodId: string }): Result {
  if (ctx.role !== "owner") return fail("PERM", "Only the Owner can reopen a period", "Reopening changes reported numbers.", "Ask the Owner.");
  db_open(ctx, p.periodId);
  audit(ctx, "period.reopened", "Fiscal period", p.periodId, "Reopened by Owner");
  return ok(undefined, `${p.periodId} reopened`);
}
function db_open(ctx: Ctx, id: string) { ctx.db.periodStatus[id] = "open"; }
void assertPostable;
