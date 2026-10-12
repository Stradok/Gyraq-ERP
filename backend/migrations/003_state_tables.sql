-- GENERATED from backend/src/state-schema.ts (pnpm gen:schema). Do not edit by hand.

create table warehouses (
  id text primary key,
  code text,
  name text,
  city text,
  branch text,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
create index warehouses_code_idx on warehouses (code);

create table suppliers (
  id text primary key,
  code text,
  name text,
  kind text,
  city text,
  terms_days integer,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
create index suppliers_code_idx on suppliers (code);

create table products (
  id text primary key,
  sku text,
  name text,
  category text,
  supplier_id text,
  cost numeric(18,2),
  price numeric(18,2),
  mrp numeric(18,2),
  tax_category text,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
create index products_sku_idx on products (sku);
create index products_supplier_id_idx on products (supplier_id);

create table customers (
  id text primary key,
  code text,
  name text,
  city text,
  rep_id text,
  status text,
  credit_limit numeric(18,2),
  warehouse_id text,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
create index customers_code_idx on customers (code);
create index customers_status_idx on customers (status);

create table employees (
  id text primary key,
  code text,
  name text,
  department text,
  manager_id text,
  status text,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
create index employees_code_idx on employees (code);
create index employees_status_idx on employees (status);

create table quotes (
  id text primary key,
  number text,
  customer_id text,
  status text,
  doc_date date,
  total numeric(18,2),
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table quotes add constraint quotes_customer_id_fk foreign key (customer_id) references customers(id) deferrable initially deferred;
create index quotes_number_idx on quotes (number);
create index quotes_customer_id_idx on quotes (customer_id);
create index quotes_status_idx on quotes (status);
create index quotes_doc_date_idx on quotes (doc_date);

create table sales_orders (
  id text primary key,
  number text,
  customer_id text,
  status text,
  doc_date date,
  total numeric(18,2),
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table sales_orders add constraint sales_orders_customer_id_fk foreign key (customer_id) references customers(id) deferrable initially deferred;
create index sales_orders_number_idx on sales_orders (number);
create index sales_orders_customer_id_idx on sales_orders (customer_id);
create index sales_orders_status_idx on sales_orders (status);
create index sales_orders_doc_date_idx on sales_orders (doc_date);

create table shipments (
  id text primary key,
  number text,
  customer_id text,
  status text,
  doc_date date,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table shipments add constraint shipments_customer_id_fk foreign key (customer_id) references customers(id) deferrable initially deferred;
create index shipments_number_idx on shipments (number);
create index shipments_customer_id_idx on shipments (customer_id);
create index shipments_status_idx on shipments (status);
create index shipments_doc_date_idx on shipments (doc_date);

create table invoices (
  id text primary key,
  number text,
  customer_id text,
  doc_date date,
  due_date date,
  total numeric(18,2),
  paid numeric(18,2),
  status text,
  payment_status text,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table invoices add constraint invoices_customer_id_fk foreign key (customer_id) references customers(id) deferrable initially deferred;
create index invoices_number_idx on invoices (number);
create index invoices_customer_id_idx on invoices (customer_id);
create index invoices_doc_date_idx on invoices (doc_date);
create index invoices_status_idx on invoices (status);

create table credit_notes (
  id text primary key,
  number text,
  customer_id text,
  invoice_id text,
  doc_date date,
  total numeric(18,2),
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table credit_notes add constraint credit_notes_customer_id_fk foreign key (customer_id) references customers(id) deferrable initially deferred;
create index credit_notes_number_idx on credit_notes (number);
create index credit_notes_customer_id_idx on credit_notes (customer_id);
create index credit_notes_doc_date_idx on credit_notes (doc_date);

create table customer_payments (
  id text primary key,
  number text,
  customer_id text,
  method text,
  pay_date date,
  amount numeric(18,2),
  status text,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table customer_payments add constraint customer_payments_customer_id_fk foreign key (customer_id) references customers(id) deferrable initially deferred;
create index customer_payments_number_idx on customer_payments (number);
create index customer_payments_customer_id_idx on customer_payments (customer_id);
create index customer_payments_status_idx on customer_payments (status);

create table purchase_orders (
  id text primary key,
  number text,
  supplier_id text,
  status text,
  doc_date date,
  total numeric(18,2),
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table purchase_orders add constraint purchase_orders_supplier_id_fk foreign key (supplier_id) references suppliers(id) deferrable initially deferred;
create index purchase_orders_number_idx on purchase_orders (number);
create index purchase_orders_supplier_id_idx on purchase_orders (supplier_id);
create index purchase_orders_status_idx on purchase_orders (status);
create index purchase_orders_doc_date_idx on purchase_orders (doc_date);

create table goods_receipts (
  id text primary key,
  number text,
  supplier_id text,
  po_id text,
  doc_date date,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table goods_receipts add constraint goods_receipts_supplier_id_fk foreign key (supplier_id) references suppliers(id) deferrable initially deferred;
create index goods_receipts_number_idx on goods_receipts (number);
create index goods_receipts_supplier_id_idx on goods_receipts (supplier_id);
create index goods_receipts_doc_date_idx on goods_receipts (doc_date);

create table supplier_bills (
  id text primary key,
  number text,
  supplier_id text,
  status text,
  doc_date date,
  due_date date,
  total numeric(18,2),
  paid numeric(18,2),
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table supplier_bills add constraint supplier_bills_supplier_id_fk foreign key (supplier_id) references suppliers(id) deferrable initially deferred;
create index supplier_bills_number_idx on supplier_bills (number);
create index supplier_bills_supplier_id_idx on supplier_bills (supplier_id);
create index supplier_bills_status_idx on supplier_bills (status);
create index supplier_bills_doc_date_idx on supplier_bills (doc_date);

create table supplier_payments (
  id text primary key,
  number text,
  supplier_id text,
  pay_date date,
  amount numeric(18,2),
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table supplier_payments add constraint supplier_payments_supplier_id_fk foreign key (supplier_id) references suppliers(id) deferrable initially deferred;
create index supplier_payments_number_idx on supplier_payments (number);
create index supplier_payments_supplier_id_idx on supplier_payments (supplier_id);

create table principal_claims (
  id text primary key,
  number text,
  supplier_id text,
  status text,
  amount numeric(18,2),
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table principal_claims add constraint principal_claims_supplier_id_fk foreign key (supplier_id) references suppliers(id) deferrable initially deferred;
create index principal_claims_number_idx on principal_claims (number);
create index principal_claims_supplier_id_idx on principal_claims (supplier_id);
create index principal_claims_status_idx on principal_claims (status);

create table stock_counts (
  id text primary key,
  number text,
  warehouse_id text,
  status text,
  doc_date date,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
create index stock_counts_number_idx on stock_counts (number);
create index stock_counts_status_idx on stock_counts (status);
create index stock_counts_doc_date_idx on stock_counts (doc_date);

create table stock_transfers (
  id text primary key,
  number text,
  from_id text,
  to_id text,
  product_id text,
  qty integer,
  doc_date date,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
create index stock_transfers_number_idx on stock_transfers (number);
create index stock_transfers_doc_date_idx on stock_transfers (doc_date);

create table expenses (
  id text primary key,
  number text,
  employee_id text,
  status text,
  doc_date date,
  amount numeric(18,2),
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
create index expenses_number_idx on expenses (number);
create index expenses_employee_id_idx on expenses (employee_id);
create index expenses_status_idx on expenses (status);
create index expenses_doc_date_idx on expenses (doc_date);

create table leave_requests (
  id text primary key,
  employee_id text,
  status text,
  from_date date,
  to_date date,
  days integer,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
create index leave_requests_employee_id_idx on leave_requests (employee_id);
create index leave_requests_status_idx on leave_requests (status);

create table payroll_runs (
  id text primary key,
  month text,
  gross numeric(18,2),
  net numeric(18,2),
  headcount integer,
  status text,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
create index payroll_runs_status_idx on payroll_runs (status);

create table bank_txns (
  id text primary key,
  txn_date date,
  amount numeric(18,2),
  status text,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
create index bank_txns_status_idx on bank_txns (status);

create table approvals (
  id text primary key,
  type text,
  status text,
  ref text,
  requested_by text,
  amount numeric(18,2),
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
create index approvals_status_idx on approvals (status);

create table notifications (
  id text primary key,
  severity text,
  is_read boolean,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table leads (
  id text primary key,
  company text,
  stage text,
  rep_id text,
  value numeric(18,2),
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table automation_rules (
  id text primary key,
  name text,
  event text,
  enabled boolean,
  runs integer,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table outbox_messages (
  id text primary key,
  channel text,
  status text,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
create index outbox_messages_status_idx on outbox_messages (status);

create table state_singletons (
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
alter table commands add column engine_version text;
