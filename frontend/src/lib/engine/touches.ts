// Which parts of the company state each command may change. After a command the server saves only these collections
// (backend/src/project.ts) instead of comparing the whole company. The lists are deliberately generous (anything a command
// reads from or writes to, directly or through helpers), because a missing entry would mean a change is not saved.
// frontend/tests/engine.test.ts checks every command it runs against this map and fails if a command changes a collection
// that is not listed. When you add or change a command, run `pnpm test:engine`.
import type { DB } from "../data/sim";
import type { CommandType } from "./commands";

export type Collection = Exclude<keyof DB, "today" | "start" | "calendar" | "bankBalanceAccounts" | "scenario">;

export const TOUCHES: Record<CommandType, readonly Collection[]> = {
  CreateCustomer: ["audit", "customers", "warehouses"],
  CreateSupplier: ["audit", "suppliers"],
  CreateProduct: ["audit", "products", "stock", "warehouses"],
  CreateLead: ["audit", "leads"],
  MoveLead: ["audit", "leads"],
  CreateQuote: ["audit", "customers", "products", "quotes"],
  SetQuoteStatus: ["audit", "customers", "notifications", "outbox", "quotes"],
  RequestCreditLimit: ["approvals", "audit", "customers", "notifications"],
  RequestCreditHold: ["approvals", "audit", "customers", "notifications"],
  ReleaseCreditHold: ["audit", "customers"],
  CreateOrder: ["approvals", "audit", "customers", "notifications", "orders", "products", "rules", "settings", "stock", "warehouses"],
  RequestCreditOverride: ["approvals", "audit", "customers", "notifications", "orders"],
  ConfirmOrder: ["audit", "customers", "orders", "products", "settings", "stock"],
  CancelOrder: ["audit", "orders", "stock"],
  PickOrder: ["audit", "orders"],
  DispatchOrder: ["approvals", "audit", "customers", "invoices", "journal", "notifications", "orders", "outbox", "periodStatus", "products", "rules", "shipments", "stock", "warehouses"],
  MarkDelivered: ["audit", "shipments"],
  RecordPayment: ["audit", "customers", "invoices", "journal", "payments", "periodStatus"],
  DepositCheque: ["audit", "payments"],
  ClearCheque: ["audit", "journal", "payments", "periodStatus"],
  BounceCheque: ["approvals", "audit", "customers", "invoices", "journal", "notifications", "payments", "periodStatus", "rules"],
  DepositCash: ["audit", "journal", "periodStatus"],
  CreateReturn: ["audit", "claims", "creditNotes", "invoices", "journal", "periodStatus", "products", "stock"],
  SetClaimStatus: ["audit", "claims", "journal", "periodStatus"],
  CreatePO: ["approvals", "audit", "pos", "products", "settings", "stock", "suppliers"],
  ReceiveGoods: ["approvals", "audit", "grns", "journal", "notifications", "periodStatus", "pos", "products", "rules", "stock"],
  CreateBill: ["approvals", "audit", "bills", "grns", "journal", "notifications", "periodStatus", "pos", "products", "rules", "stock", "suppliers", "warehouses"],
  ResolveBill: ["approvals", "audit", "bills", "grns", "journal", "periodStatus", "pos", "stock", "suppliers", "warehouses"],
  PaySupplier: ["audit", "bills", "journal", "periodStatus", "supplierPayments", "suppliers"],
  TransferStock: ["audit", "products", "stock", "transfers", "warehouses"],
  AdjustStock: ["approvals", "audit", "journal", "periodStatus", "products", "settings", "stock", "warehouses"],
  PostCount: ["approvals", "audit", "journal", "periodStatus", "products", "settings", "stock", "stockCounts", "warehouses"],
  PostManualJE: ["accounts", "approvals", "audit", "journal", "periodStatus", "settings"],
  UpdateSettings: ["audit", "settings"],
  ClosePeriod: ["audit", "bank", "bills", "orders", "periodStatus"],
  ReopenPeriod: ["audit", "periodStatus"],
  DecideApproval: ["approvals", "audit", "bills", "customers", "expenses", "grns", "journal", "leaves", "notifications", "orders", "periodStatus", "pos", "products", "settings", "stock", "stockCounts", "suppliers", "warehouses"],
  SubmitExpense: ["approvals", "audit", "employees", "expenses"],
  SubmitLeave: ["approvals", "audit", "employees", "leaves"],
  CreateEmployee: ["audit", "employees"],
  UpdateEmployee: ["audit", "employees"],
  RunPayroll: ["audit", "employees", "journal", "notifications", "payroll", "periodStatus"],
  SetupCompany: ["audit", "company", "settings"],
  CreateWarehouse: ["audit", "warehouses"],
  PostOpeningStock: ["audit", "journal", "periodStatus", "products", "stock", "warehouses"],
  PostOpeningCash: ["audit", "journal", "periodStatus"],
  ConfirmBankMatch: ["audit", "bank"],
  SetRule: ["audit", "rules"],
  QueueMessage: ["audit", "customers", "outbox"],
  CreateRule: ["audit", "notifications", "rules"],
};
