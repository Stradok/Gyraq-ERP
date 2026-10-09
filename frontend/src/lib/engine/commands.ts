import { invalidate, } from "../data/queries";
import { runOn, type DB } from "../data/sim";
import { resetSearch } from "../search";
import type { Role } from "../rbac";
import { decideApproval } from "./approvals";
import { fail, setIdScope, type Ctx, type Result } from "./core";
import { closePeriod, postManualJE, reopenPeriod } from "./finance";
import { adjustStock, postCount, transferStock } from "./inventory";
import { createCustomer, createLead, createProduct, createQuote, createSupplier, moveLead, releaseCreditHold, requestCreditHold, requestCreditLimit, setQuoteStatus } from "./masters";
import { confirmBankMatch, createRule, queueMessage, setRule, submitExpense, submitLeave } from "./people";
import { createBill, createPO, paySupplier, receiveGoods, resolveBill } from "./purchasing";
import { bounceCheque, cancelOrder, clearCheque, confirmOrder, createOrder, createReturn, depositCash, depositCheque, dispatchOrder, markDelivered, pickOrder, recordPayment, requestCreditOverride, setClaimStatus } from "./sales";

/** Every user action in the app is one of these commands. A backend replaces this table with HTTP endpoints. */
export const HANDLERS = {
  CreateCustomer: createCustomer, CreateSupplier: createSupplier, CreateProduct: createProduct, CreateLead: createLead, MoveLead: moveLead,
  CreateQuote: createQuote, SetQuoteStatus: setQuoteStatus, RequestCreditLimit: requestCreditLimit, RequestCreditHold: requestCreditHold, ReleaseCreditHold: releaseCreditHold,
  CreateOrder: createOrder, RequestCreditOverride: requestCreditOverride, ConfirmOrder: confirmOrder, CancelOrder: cancelOrder, PickOrder: pickOrder, DispatchOrder: dispatchOrder, MarkDelivered: markDelivered,
  RecordPayment: recordPayment, DepositCheque: depositCheque, ClearCheque: clearCheque, BounceCheque: bounceCheque, DepositCash: depositCash, CreateReturn: createReturn, SetClaimStatus: setClaimStatus,
  CreatePO: createPO, ReceiveGoods: receiveGoods, CreateBill: createBill, ResolveBill: resolveBill, PaySupplier: paySupplier,
  TransferStock: transferStock, AdjustStock: adjustStock, PostCount: postCount,
  PostManualJE: postManualJE, ClosePeriod: closePeriod, ReopenPeriod: reopenPeriod,
  DecideApproval: decideApproval, SubmitExpense: submitExpense, SubmitLeave: submitLeave, ConfirmBankMatch: confirmBankMatch, SetRule: setRule, QueueMessage: queueMessage, CreateRule: createRule,
} as const;

export type CommandType = keyof typeof HANDLERS;
export type CommandInput<T extends CommandType> = Parameters<(typeof HANDLERS)[T]>[1];
export interface CommandRecord { id: string; type: CommandType; payload: unknown; at: string; date: string; actor: string; role: Role; source: "user" | "ai_proposal" }

export function execute(db: DB, rec: CommandRecord): Result<unknown> {
  const h = HANDLERS[rec.type] as unknown as ((ctx: Ctx, p: unknown) => Result<unknown>) | undefined;
  if (!h) return fail("CMD_UNKNOWN", "Unknown action", `No handler for ${rec.type}.`, "Refresh the page.");
  setIdScope(rec.id);
  const ctx: Ctx = { db, actor: rec.actor, role: rec.role, date: rec.date, now: rec.at, source: rec.source };
  const res = runOn(db, () => { try { return h(ctx, rec.payload); } catch (e) { return fail("ENGINE_ERROR", "Something went wrong on our side", e instanceof Error ? e.message : String(e), "Nothing was saved. Try again, and share the reference with support."); } });
  invalidate(db); resetSearch(db);
  return res;
}

/** Replay a stored command log onto a fresh DB (used on page load and by the server for the assistant). */
export function replay(db: DB, log: CommandRecord[]): { applied: number; skipped: number } {
  let applied = 0, skipped = 0;
  for (const rec of log) { const r = execute(db, rec); if (r.ok) applied++; else skipped++; }
  return { applied, skipped };
}
