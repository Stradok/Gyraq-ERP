-- GENERATED from backend/src/state-schema.ts (pnpm gen:schema). Do not edit by hand.
-- Lets the server rebuild the company state exactly from the tables (docs/architecture/r2-persistence-design.md, R2.3).

alter table warehouses add column ord bigint generated always as identity;
alter table suppliers add column ord bigint generated always as identity;
alter table products add column ord bigint generated always as identity;
alter table customers add column ord bigint generated always as identity;
alter table employees add column ord bigint generated always as identity;
alter table quotes add column ord bigint generated always as identity;
alter table sales_orders add column ord bigint generated always as identity;
alter table shipments add column ord bigint generated always as identity;
alter table invoices add column ord bigint generated always as identity;
alter table credit_notes add column ord bigint generated always as identity;
alter table customer_payments add column ord bigint generated always as identity;
alter table purchase_orders add column ord bigint generated always as identity;
alter table goods_receipts add column ord bigint generated always as identity;
alter table supplier_bills add column ord bigint generated always as identity;
alter table supplier_payments add column ord bigint generated always as identity;
alter table principal_claims add column ord bigint generated always as identity;
alter table stock_counts add column ord bigint generated always as identity;
alter table stock_transfers add column ord bigint generated always as identity;
alter table expenses add column ord bigint generated always as identity;
alter table leave_requests add column ord bigint generated always as identity;
alter table payroll_runs add column ord bigint generated always as identity;
alter table bank_txns add column ord bigint generated always as identity;
alter table approvals add column ord bigint generated always as identity;
alter table notifications add column ord bigint generated always as identity;
alter table leads add column ord bigint generated always as identity;
alter table automation_rules add column ord bigint generated always as identity;
alter table outbox_messages add column ord bigint generated always as identity;

alter table stock_levels add column ema numeric not null default 0, add column incoming numeric not null default 0;
alter table journal_entries add column id text, add column ord bigint generated always as identity;
alter table audit_log add column data jsonb, add column ord bigint generated always as identity;

