// The state tables: one per business collection of the engine's `DB`. Typed columns hold what is queried, filtered or constrained;
// `data` holds the complete document, so a row converts back to the engine's object without loss (fromRow = row.data).
// migrations/003_state_tables.sql is generated from this file (`pnpm gen:schema`) and a test checks the two agree.
import type { DB } from "./engine";

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export interface Column { name: string; type: string; get: (d: Doc) => unknown; references?: string }
export interface TableSpec { collection: keyof DB; table: string; id: (d: Doc) => string; columns: Column[]; newestFirst?: boolean }

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
  { collection: "quotes", table: "quotes", id: (d) => d.id, columns: [c("number", T), c("customer_id", T, undefined, "customers"), c("status", T), c("doc_date", D, (d) => d.date), c("total", M)], newestFirst: true },
  { collection: "orders", table: "sales_orders", id: (d) => d.id, columns: [c("number", T), c("customer_id", T, undefined, "customers"), c("status", T), c("doc_date", D, (d) => d.date), c("total", M)], newestFirst: true },
  { collection: "shipments", table: "shipments", id: (d) => d.id, columns: [c("number", T), c("customer_id", T, undefined, "customers"), c("status", T), c("doc_date", D, (d) => d.date)], newestFirst: true },
  { collection: "invoices", table: "invoices", id: (d) => d.id, columns: [c("number", T), c("customer_id", T, undefined, "customers"), c("doc_date", D, (d) => d.date), c("due_date", D), c("total", M), c("paid", M), c("status", T), c("payment_status", T)], newestFirst: true },
  { collection: "creditNotes", table: "credit_notes", id: (d) => d.id, columns: [c("number", T), c("customer_id", T, undefined, "customers"), c("invoice_id", T), c("doc_date", D, (d) => d.date), c("total", M)], newestFirst: true },
  { collection: "payments", table: "customer_payments", id: (d) => d.id, columns: [c("number", T), c("customer_id", T, undefined, "customers"), c("method", T), c("pay_date", D, (d) => d.date), c("amount", M), c("status", T)], newestFirst: true },
  { collection: "pos", table: "purchase_orders", id: (d) => d.id, columns: [c("number", T), c("supplier_id", T, undefined, "suppliers"), c("status", T), c("doc_date", D, (d) => d.date), c("total", M)], newestFirst: true },
  { collection: "grns", table: "goods_receipts", id: (d) => d.id, columns: [c("number", T), c("supplier_id", T, undefined, "suppliers"), c("po_id", T), c("doc_date", D, (d) => d.date)], newestFirst: true },
  { collection: "bills", table: "supplier_bills", id: (d) => d.id, columns: [c("number", T), c("supplier_id", T, undefined, "suppliers"), c("status", T), c("doc_date", D, (d) => d.date), c("due_date", D), c("total", M), c("paid", M)], newestFirst: true },
  { collection: "supplierPayments", table: "supplier_payments", id: (d) => d.id, columns: [c("number", T), c("supplier_id", T, undefined, "suppliers"), c("pay_date", D, (d) => d.date), c("amount", M)], newestFirst: true },
  { collection: "claims", table: "principal_claims", id: (d) => d.id, columns: [c("number", T), c("supplier_id", T, undefined, "suppliers"), c("status", T), c("amount", M)], newestFirst: true },
  { collection: "stockCounts", table: "stock_counts", id: (d) => d.id, columns: [c("number", T), c("warehouse_id", T), c("status", T), c("doc_date", D, (d) => d.date)], newestFirst: true },
  { collection: "transfers", table: "stock_transfers", id: (d) => d.id, columns: [c("number", T), c("from_id", T), c("to_id", T), c("product_id", T), c("qty", I), c("doc_date", D, (d) => d.date)], newestFirst: true },
  { collection: "expenses", table: "expenses", id: (d) => d.id, columns: [c("number", T), c("employee_id", T), c("status", T), c("doc_date", D, (d) => d.date), c("amount", M)], newestFirst: true },
  { collection: "leaves", table: "leave_requests", id: (d) => d.id, columns: [c("employee_id", T), c("status", T), c("from_date", D, (d) => d.from), c("to_date", D, (d) => d.to), c("days", I)], newestFirst: true },
  { collection: "payroll", table: "payroll_runs", id: (d) => d.month, columns: [c("month", T), c("gross", M), c("net", M), c("headcount", I), c("status", T)] },
  { collection: "bank", table: "bank_txns", id: (d) => d.id, columns: [c("txn_date", D, (d) => d.date), c("amount", M), c("status", T)] },
  { collection: "approvals", table: "approvals", id: (d) => d.id, columns: [c("type", T), c("status", T), c("ref", T), c("requested_by", T), c("amount", M, (d) => num(d.amount))], newestFirst: true },
  { collection: "notifications", table: "notifications", id: (d) => d.id, columns: [c("severity", T), c("is_read", B, (d) => !!d.read)], newestFirst: true },
  { collection: "leads", table: "leads", id: (d) => d.id, columns: [c("company", T), c("stage", T), c("rep_id", T), c("value", M)], newestFirst: true },
  { collection: "rules", table: "automation_rules", id: (d) => d.id, columns: [c("name", T), c("event", T), c("enabled", B), c("runs", I)] },
  { collection: "outbox", table: "outbox_messages", id: (d) => d.id, columns: [c("channel", T), c("status", T)], newestFirst: true },
];

/** The three one-row objects of the DB. */
export const SINGLETONS = ["settings", "company", "periodStatus", "scenario", "calendar", "bankBalanceAccounts"] as const;

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

/** Migration 004: what hydrating from the tables needs. Adds an insertion-order column to every state table (arrays keep their order), and the fields the first ledger/stock/audit tables left out. */
export function toSql004(): string {
  const out = ["-- GENERATED from backend/src/state-schema.ts (pnpm gen:schema). Do not edit by hand.", "-- Lets the server rebuild the company state exactly from the tables (docs/architecture/r2-persistence-design.md, R2.3).", ""];
  for (const t of TABLES) out.push(`alter table ${t.table} add column ord bigint generated always as identity;`);
  out.push(`
alter table stock_levels add column ema numeric not null default 0, add column incoming numeric not null default 0;
alter table journal_entries add column id text, add column ord bigint generated always as identity;
alter table audit_log add column data jsonb, add column ord bigint generated always as identity;
`);
  return out.join("\n");
}
if (process.argv[1]?.endsWith("state-schema.ts") && process.argv[2] === "sql") console.log(toSql());
if (process.argv[1]?.endsWith("state-schema.ts") && process.argv[2] === "sql004") console.log(toSql004());
