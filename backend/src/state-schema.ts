// The state tables: one per business collection of the engine's `DB`. Typed columns hold what is queried, filtered or constrained;
// `data` holds the complete document, so a row converts back to the engine's object without loss (fromRow = row.data).
// migrations/003_state_tables.sql is generated from this file (`pnpm gen:schema`) and a test checks the two agree.
import type { DB } from "./engine";

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export interface Column { name: string; type: string; get: (d: Doc) => unknown; references?: string }
export interface TableSpec { collection: keyof DB; table: string; id: (d: Doc) => string; columns: Column[] }

const c = (name: string, type: string, get?: (d: Doc) => unknown, references?: string): Column => ({ name, type, get: get ?? ((d) => d[camel(name)]), references });
const camel = (s: string) => s.replace(/_([a-z])/g, (_, x) => x.toUpperCase());
const D = "date", M = "numeric(18,2)", T = "text", I = "integer", B = "boolean";
const num = (v: unknown) => (typeof v === "number" ? v : null);

export const TABLES: TableSpec[] = [
  { collection: "warehouses", table: "warehouses", id: (d) => d.id, columns: [c("code", T), c("name", T), c("city", T), c("branch", T)] },
  { collection: "suppliers", table: "suppliers", id: (d) => d.id, columns: [c("code", T), c("name", T), c("kind", T), c("city", T), c("terms_days", I)] },
  { collection: "products", table: "products", id: (d) => d.id, columns: [c("sku", T), c("name", T), c("category", T), c("supplier_id", T), c("cost", M), c("price", M), c("mrp", M), c("tax_category", T)] },
  { collection: "customers", table: "customers", id: (d) => d.id, columns: [c("code", T), c("name", T), c("city", T), c("rep_id", T), c("status", T), c("credit_limit", M), c("warehouse_id", T)] },
  { collection: "employees", table: "employees", id: (d) => d.id, columns: [c("code", T), c("name", T), c("department", T), c("manager_id", T), c("status", T)] },
  { collection: "quotes", table: "quotes", id: (d) => d.id, columns: [c("number", T), c("customer_id", T, undefined, "customers"), c("status", T), c("doc_date", D, (d) => d.date), c("total", M)] },
  { collection: "orders", table: "sales_orders", id: (d) => d.id, columns: [c("number", T), c("customer_id", T, undefined, "customers"), c("status", T), c("doc_date", D, (d) => d.date), c("total", M)] },
  { collection: "shipments", table: "shipments", id: (d) => d.id, columns: [c("number", T), c("customer_id", T, undefined, "customers"), c("status", T), c("doc_date", D, (d) => d.date)] },
  { collection: "invoices", table: "invoices", id: (d) => d.id, columns: [c("number", T), c("customer_id", T, undefined, "customers"), c("doc_date", D, (d) => d.date), c("due_date", D), c("total", M), c("paid", M), c("status", T), c("payment_status", T)] },
  { collection: "creditNotes", table: "credit_notes", id: (d) => d.id, columns: [c("number", T), c("customer_id", T, undefined, "customers"), c("invoice_id", T), c("doc_date", D, (d) => d.date), c("total", M)] },
  { collection: "payments", table: "customer_payments", id: (d) => d.id, columns: [c("number", T), c("customer_id", T, undefined, "customers"), c("method", T), c("pay_date", D, (d) => d.date), c("amount", M), c("status", T)] },
  { collection: "pos", table: "purchase_orders", id: (d) => d.id, columns: [c("number", T), c("supplier_id", T, undefined, "suppliers"), c("status", T), c("doc_date", D, (d) => d.date), c("total", M)] },
  { collection: "grns", table: "goods_receipts", id: (d) => d.id, columns: [c("number", T), c("supplier_id", T, undefined, "suppliers"), c("po_id", T), c("doc_date", D, (d) => d.date)] },
  { collection: "bills", table: "supplier_bills", id: (d) => d.id, columns: [c("number", T), c("supplier_id", T, undefined, "suppliers"), c("status", T), c("doc_date", D, (d) => d.date), c("due_date", D), c("total", M), c("paid", M)] },
  { collection: "supplierPayments", table: "supplier_payments", id: (d) => d.id, columns: [c("number", T), c("supplier_id", T, undefined, "suppliers"), c("pay_date", D, (d) => d.date), c("amount", M)] },
  { collection: "claims", table: "principal_claims", id: (d) => d.id, columns: [c("number", T), c("supplier_id", T, undefined, "suppliers"), c("status", T), c("amount", M)] },
  { collection: "stockCounts", table: "stock_counts", id: (d) => d.id, columns: [c("number", T), c("warehouse_id", T), c("status", T), c("doc_date", D, (d) => d.date)] },
  { collection: "transfers", table: "stock_transfers", id: (d) => d.id, columns: [c("number", T), c("from_id", T), c("to_id", T), c("product_id", T), c("qty", I), c("doc_date", D, (d) => d.date)] },
  { collection: "expenses", table: "expenses", id: (d) => d.id, columns: [c("number", T), c("employee_id", T), c("status", T), c("doc_date", D, (d) => d.date), c("amount", M)] },
  { collection: "leaves", table: "leave_requests", id: (d) => d.id, columns: [c("employee_id", T), c("status", T), c("from_date", D, (d) => d.from), c("to_date", D, (d) => d.to), c("days", I)] },
  { collection: "payroll", table: "payroll_runs", id: (d) => d.month, columns: [c("month", T), c("gross", M), c("net", M), c("headcount", I), c("status", T)] },
  { collection: "bank", table: "bank_txns", id: (d) => d.id, columns: [c("txn_date", D, (d) => d.date), c("amount", M), c("status", T)] },
  { collection: "approvals", table: "approvals", id: (d) => d.id, columns: [c("type", T), c("status", T), c("ref", T), c("requested_by", T), c("amount", M, (d) => num(d.amount))] },
  { collection: "notifications", table: "notifications", id: (d) => d.id, columns: [c("severity", T), c("is_read", B, (d) => !!d.read)] },
  { collection: "leads", table: "leads", id: (d) => d.id, columns: [c("company", T), c("stage", T), c("rep_id", T), c("value", M)] },
  { collection: "rules", table: "automation_rules", id: (d) => d.id, columns: [c("name", T), c("event", T), c("enabled", B), c("runs", I)] },
  { collection: "outbox", table: "outbox_messages", id: (d) => d.id, columns: [c("channel", T), c("status", T)] },
];

/** The three one-row objects of the DB. */
export const SINGLETONS = ["settings", "company", "periodStatus"] as const;

export function toSql(): string {
  const out: string[] = ["-- GENERATED from backend/src/state-schema.ts (pnpm gen:schema). Do not edit by hand.", ""];
  for (const t of TABLES) {
    const cols = t.columns.map((x) => `  ${x.name} ${x.type}`).join(",\n");
    out.push(`create table ${t.table} (\n  id text primary key,\n${cols},\n  data jsonb not null,\n  version integer not null default 1,\n  updated_at timestamptz not null default now()\n);`);
    for (const x of t.columns) if (x.references) out.push(`alter table ${t.table} add constraint ${t.table}_${x.name}_fk foreign key (${x.name}) references ${x.references}(id) deferrable initially deferred;`);
    const idx = t.columns.filter((x) => ["customer_id", "supplier_id", "status", "doc_date", "employee_id", "number", "sku", "code"].includes(x.name)).map((x) => x.name);
    for (const i of idx) out.push(`create index ${t.table}_${i}_idx on ${t.table} (${i});`);
    out.push("");
  }
  out.push(`create table state_singletons (
  key text primary key,            -- settings | company | periodStatus
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

-- Document numbers (INV-10482, PO-5017 ...) come from here, transactionally, instead of scanning existing documents.
create table doc_sequences (
  kind text primary key,
  next_value bigint not null
);

-- Which engine build wrote each command. Old commands are never re-executed (docs/architecture/r2-persistence-design.md).
alter table commands add column engine_version text;`);
  return out.join("\n");
}
if (process.argv[1]?.endsWith("state-schema.ts") && process.argv[2] === "sql") console.log(toSql());
