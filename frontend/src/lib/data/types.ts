// Domain types for the demo dataset. Shapes mirror docs/plan/04-data-model.md (simplified).
// When the backend lands, API DTOs replace these one-for-one.

export type ISODate = string; // YYYY-MM-DD (Asia/Karachi business date)

export type CategoryId = "beverages" | "packaged_foods" | "dairy" | "snacks" | "household" | "personal_care";
export type TaxCategory = "standard" | "third_schedule" | "exempt";
export type Channel = "modern_trade" | "wholesale" | "retail" | "sub_distributor" | "horeca";
export type PayProfile = "prompt" | "normal" | "slow" | "deteriorating" | "risky";

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  city: string;
  branch: string;
  share: number; // share of network volume
  managerId: string;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  city: string;
  province: string;
  ntn: string;
  strn: string;
  isPrincipal: boolean;
  leadTimeDays: number;
  termsDays: number;
  contact: string;
  phone: string;
  email: string;
  kind: "goods" | "services";
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: CategoryId;
  brand: string;
  supplierId: string;
  cartonSize: number;
  price: number; // trade price per piece (excl. tax)
  cost: number; // moving average cost per piece
  mrp: number; // printed retail price per piece (incl. tax)
  taxCategory: TaxCategory;
  hsCode: string;
  shelfLifeDays: number;
  dailyDemand: number; // network base demand, pieces/day
  safetyDays: number;
  barcode: string;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  channel: Channel;
  city: string;
  province: string;
  area: string;
  ntn: string | null;
  strn: string | null;
  cnic: string | null;
  registered: boolean;
  atl: boolean;
  creditLimit: number;
  termsDays: number;
  repId: string;
  warehouseId: string;
  status: "active" | "on_hold" | "blocked";
  holdReason?: string;
  profile: PayProfile;
  contact: string;
  phone: string;
  email: string;
  since: ISODate;
  size: number; // order-size multiplier
}

export interface Employee {
  id: string;
  code: string;
  name: string;
  department: string;
  position: string;
  managerId: string | null;
  branch: string;
  joinDate: ISODate;
  salary: number;
  status: "active" | "on_leave" | "probation";
  phone: string;
  email: string;
  cnic: string;
}

export interface DocLine {
  productId: string;
  qty: number; // pieces
  price: number; // per piece
  discount: number; // amount
  value: number; // qty*price - discount (excl. tax)
  salesTax: number;
  free?: boolean;
  schemeId?: string;
}

export type OrderStatus = "draft" | "confirmed" | "reserved" | "partially_fulfilled" | "fulfilled" | "cancelled";

export interface SalesOrder {
  id: string;
  number: string;
  customerId: string;
  repId: string;
  warehouseId: string;
  date: ISODate;
  status: OrderStatus;
  lines: DocLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  invoiceId: string | null;
  creditCheck?: CreditCheck;
  source: "user" | "ai_proposal";
  picked?: boolean;
}

export interface CreditCheck {
  decision: "pass" | "warn" | "block";
  exposure: number;
  limit: number;
  overdueDays: number;
  reasons: string[];
}

export type InvoiceStatus = "draft" | "approved" | "sent" | "void";
export type PaymentStatus = "unpaid" | "partially_paid" | "paid";

export interface Invoice {
  id: string;
  number: string;
  customerId: string;
  orderId: string;
  warehouseId: string;
  date: ISODate;
  dueDate: ISODate;
  lines: DocLine[];
  subtotal: number;
  discount: number;
  salesTax: number;
  furtherTax: number;
  wht236h: number;
  total: number;
  paid: number;
  cogs: number;
  status: InvoiceStatus;
  paymentStatus: PaymentStatus;
  fbr: { status: "simulated" | "pending" | "failed"; irn: string; at: string };
  shipmentId?: string;
}

export type PaymentMethod = "bank_transfer" | "cash" | "cheque" | "pdc";

export interface CustomerPayment {
  id: string;
  number: string;
  customerId: string;
  date: ISODate;
  method: PaymentMethod;
  amount: number;
  status: "cleared" | "in_hand" | "deposited" | "bounced";
  chequeNo?: string;
  bank?: string;
  allocations: { invoiceId: string; amount: number }[];
}

export interface Quote {
  id: string;
  number: string;
  customerId: string;
  repId: string;
  date: ISODate;
  validUntil: ISODate;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  lines: DocLine[];
  total: number;
}

export type POStatus = "draft" | "pending_approval" | "approved" | "partially_received" | "received" | "closed" | "cancelled";

export interface POLine {
  productId: string;
  qty: number;
  price: number;
  received: number;
}

export interface PurchaseOrder {
  id: string;
  number: string;
  supplierId: string;
  warehouseId: string;
  date: ISODate;
  expectedDate: ISODate;
  status: POStatus;
  lines: POLine[];
  subtotal: number;
  tax: number;
  total: number;
  source: "user" | "ai_proposal" | "reorder_rule";
}

export interface GoodsReceipt {
  id: string;
  number: string;
  poId: string;
  supplierId: string;
  warehouseId: string;
  date: ISODate;
  lines: { productId: string; qty: number; rejected?: number; batch: string; expiry: ISODate }[];
  value: number;
}

export type MatchExceptionType =
  | "PRICE_VARIANCE"
  | "QTY_MISMATCH"
  | "DUPLICATE_BILL"
  | "PRICE_INCREASE_VS_HISTORY"
  | "MISSING_RECEIPT"
  | "UNEXPECTED_TAX";

export interface MatchException {
  type: MatchExceptionType;
  productId?: string;
  expected: number;
  actual: number;
  variance: number;
  note: string;
}

export interface SupplierBill {
  id: string;
  number: string;
  supplierInvoiceNo: string;
  supplierId: string;
  poId: string | null;
  date: ISODate;
  dueDate: ISODate;
  lines: { productId: string | null; description: string; qty: number; price: number; total: number }[];
  subtotal: number;
  tax: number;
  wht236g: number;
  total: number;
  paid: number;
  status: "pending_match" | "exception" | "posted" | "paid" | "rejected";
  exceptions: MatchException[];
  source: "manual" | "ai_extraction";
}

export interface SupplierPayment {
  id: string;
  number: string;
  supplierId: string;
  date: ISODate;
  amount: number;
  method: "bank_transfer" | "cheque";
  billIds: string[];
}

export interface StockCount {
  id: string;
  number: string;
  warehouseId: string;
  date: ISODate;
  counter: string;
  status: "posted" | "review";
  lines: { productId: string; location: string; expected: number; counted: number }[];
}

export interface Expense {
  id: string;
  number: string;
  employeeId: string;
  category: string;
  merchant: string;
  date: ISODate;
  amount: number;
  purpose: string;
  status: "submitted" | "manager_approved" | "finance_approved" | "reimbursed" | "rejected";
  flags: string[];
}

export interface Account {
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "income" | "expense";
  group: string;
  control?: boolean;
}

export interface JournalLine {
  account: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  number: string;
  date: ISODate;
  memo: string;
  source: string; // e.g. "Invoice INV-10482"
  type: "auto" | "manual" | "opening" | "closing";
  lines: JournalLine[];
  postedBy: string;
}

export interface BankTxn {
  id: string;
  date: ISODate;
  description: string;
  amount: number; // signed
  status: "matched" | "suggested" | "unmatched";
  suggestion?: { label: string; confidence: number; method: "rule" | "score" | "ai" };
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  type: "Annual" | "Sick" | "Casual";
  from: ISODate;
  to: ISODate;
  days: number;
  status: "pending" | "approved" | "rejected";
  reason: string;
}

export interface PayrollRun {
  month: string; // YYYY-MM
  gross: number;
  tax: number;
  eobi: number;
  net: number;
  headcount: number;
  status: "posted" | "draft";
}

export type ApprovalType =
  | "purchase_order"
  | "expense"
  | "ai_recommendation"
  | "bill_variance"
  | "credit_limit"
  | "credit_override"
  | "stock_adjustment"
  | "leave"
  | "journal";

export interface Shipment {
  id: string;
  number: string; // delivery challan DC-…
  orderId: string;
  invoiceId: string;
  customerId: string;
  warehouseId: string;
  date: ISODate;
  vehicle: string;
  driver: string;
  gatePass: string;
  status: "dispatched" | "delivered" | "returned";
  lines: { productId: string; qty: number }[];
}

export interface StockTransfer {
  id: string;
  number: string;
  fromId: string;
  toId: string;
  productId: string;
  qty: number;
  value: number;
  date: ISODate;
  by: string;
}

export interface PrincipalClaim {
  id: string;
  number: string;
  supplierId: string;
  type: "expiry" | "damage" | "scheme" | "price_differential";
  date: ISODate;
  amount: number;
  status: "draft" | "submitted" | "accepted" | "settled" | "rejected";
  ref: string;
  note: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  event: "invoice.posted" | "stock.low" | "payment.bounced" | "order.confirmed" | "po.received" | "bill.exception";
  fact: "invoice.total" | "order.total" | "available" | "payment.amount" | "po.total" | "bill.total" | "";
  op: "gt" | "gte" | "lt" | "lte" | "any";
  value: number;
  action: "notify" | "create_task" | "require_approval" | "create_recommendation";
  target: string; // role or text
  enabled: boolean;
  runs: number;
}

export interface Approval {
  id: string;
  type: ApprovalType;
  title: string;
  subtitle: string;
  amount: number | null;
  requestedBy: string;
  requestedAt: ISODate;
  status: "pending" | "approved" | "rejected";
  ref: string; // entity id
  source: "user" | "ai";
  step: string; // e.g. "Owner"
  payload?: Record<string, string | number>;
  decidedBy?: string;
  decidedAt?: string;
  comment?: string;
}

export interface AuditEvent {
  id: string;
  at: string; // ISO datetime
  actor: string;
  action: string;
  entity: string;
  ref: string;
  source: "user" | "ai_proposal" | "system" | "workflow";
  detail?: string;
}

export interface Notification {
  id: string;
  at: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "danger" | "success";
  href: string;
  read: boolean;
}

export interface Lead {
  id: string;
  company: string;
  contact: string;
  city: string;
  source: string;
  repId: string;
  value: number;
  probability: number;
  stage: "new" | "qualified" | "proposal" | "negotiation" | "won" | "lost";
}

export interface CreditNote {
  id: string;
  number: string;
  invoiceId: string;
  customerId: string;
  date: ISODate;
  reason: "expired" | "damaged" | "price_difference" | "short_delivery";
  lines?: { productId: string; qty: number; condition: "resellable" | "damaged" | "expired" }[];
  subtotal: number;
  tax: number;
  total: number;
}

export interface Settings {
  poOwnerLimit: number;
  adjustApprovalLimit: number;
  jeApprovalLimit: number;
  expenseFinanceLimit: number;
  maxOverdueDays: number;
  minCash: number;
  furtherTaxRate: number; // on supplies to unregistered / non-ATL buyers
  wht236hAtl: number; // advance tax collected from ATL retailers/wholesalers
  wht236hNonAtlRetail: number;
  wht236hNonAtlOther: number;
}

export interface OutboxMsg { id: string; at: string; channel: "WhatsApp" | "Email" | "FBR"; to: string; subject: string; body: string; status: "simulated" }

export interface Company { name: string; legalName: string; ntn: string; strn: string; address: string; city: string; province: string; setupDone: boolean }
