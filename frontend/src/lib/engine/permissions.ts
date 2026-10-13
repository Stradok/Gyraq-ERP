// The one place that says who may run each command. The API refuses any command that is not listed (the Record type makes
// forgetting one a compile error), and its tests run every command against every role.
// Scope says which records a role may touch, enforced by the API against current data (backend/src/scope.ts):
//   all      any record
//   own-cust rep: only customers assigned to them (customer.repId = their employee record)
//   own-lead rep: only leads assigned to them
//   self     leave/expenses are always filed for the signed-in user's own employee record, unless the role has hr.manage
import type { Action } from "../rbac";
import type { CommandType } from "./commands";

export type Scope = "all" | "own-cust" | "own-lead" | "self";
export interface Rule { permission: Action; scope: Scope }
const r = (permission: Action, scope: Scope = "all"): Rule => ({ permission, scope });

export const COMMAND_PERMISSIONS: Record<CommandType, Rule> = {
  CreateCustomer: r("master.create"), CreateSupplier: r("master.create"), CreateProduct: r("master.create"),
  CreateLead: r("lead.manage", "own-lead"), MoveLead: r("lead.manage", "own-lead"),
  CreateQuote: r("order.create", "own-cust"), SetQuoteStatus: r("order.create", "own-cust"),
  RequestCreditLimit: r("order.create", "own-cust"), RequestCreditHold: r("order.create", "own-cust"), RequestCreditOverride: r("order.create", "own-cust"),
  ReleaseCreditHold: r("approve.credit"),
  CreateOrder: r("order.create", "own-cust"), ConfirmOrder: r("order.create", "own-cust"), CancelOrder: r("order.create", "own-cust"),
  PickOrder: r("warehouse.ops"), DispatchOrder: r("warehouse.ops"), MarkDelivered: r("warehouse.ops"),
  RecordPayment: r("payment.record", "own-cust"),
  DepositCheque: r("cash.manage"), ClearCheque: r("cash.manage"), BounceCheque: r("cash.manage"), DepositCash: r("cash.manage"), ConfirmBankMatch: r("cash.manage"),
  CreateReturn: r("return.create"),
  SetClaimStatus: r("bill.create"),
  CreatePO: r("po.create"), ReceiveGoods: r("po.receive"),
  CreateBill: r("bill.create"), ResolveBill: r("approve.finance"), PaySupplier: r("supplier.pay"),
  TransferStock: r("warehouse.ops"), AdjustStock: r("stock.adjust"), PostCount: r("warehouse.ops"),
  PostManualJE: r("journal.post"), ClosePeriod: r("period.close"), ReopenPeriod: r("period.reopen"),
  UpdateSettings: r("settings.manage"),
  DecideApproval: r("approvals.decide"),
  SubmitExpense: r("self.requests", "self"), SubmitLeave: r("self.requests", "self"),
  CreateEmployee: r("hr.manage"), UpdateEmployee: r("hr.manage"), RunPayroll: r("hr.manage"),
  SetupCompany: r("setup.manage"), CreateWarehouse: r("setup.manage"), PostOpeningStock: r("setup.manage"), PostOpeningCash: r("setup.manage"), PostOpeningReceivable: r("setup.manage"), PostOpeningPayable: r("setup.manage"),
  SetRule: r("setup.manage"), CreateRule: r("setup.manage"),
  QueueMessage: r("message.send"),
};
