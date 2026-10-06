# 04: Data Model (PostgreSQL 18)

## 1. Conventions (apply to every table)

| Concern | Rule |
|---|---|
| IDs | `id uuid primary key default uuidv7()`: time-ordered, so it indexes well and never leaks counts |
| Human numbers | Separate `number text` (e.g. `INV-10482`) from `document_sequences`, unique per `(organization_id, number)` |
| Tenancy | `organization_id uuid not null references organizations` on every tenant-owned table; **first column of every composite index**; RLS policy on every such table |
| Money | `numeric(18,2)` for amounts; `numeric(18,6)` for unit prices/costs; currency `char(3) default 'PKR'` on documents. Domain math uses `Decimal` (decimal.js-light) wrapped in `Money`, **never JS floats** |
| Quantity | `numeric(16,3)` always stored in the product's **base UoM**; documents also keep `uom_id` + `uom_qty` as entered |
| Rates | `numeric(9,6)` (e.g. 0.180000) |
| Timestamps | `timestamptz`; business dates as `date` (`issue_date`, `posting_date`, `due_date`), interpreted in org time zone `Asia/Karachi` |
| Audit columns | `created_at, created_by, updated_at, updated_by`, plus `version int not null default 1` on mutable documents |
| Deletion | Master data: `archived_at` (soft). **Financial and stock documents are never deleted**: they're voided or reversed. App role has no `DELETE` grant on ledger and audit tables |
| Status | Postgres `text` + `CHECK (status IN (...))`. Transitions are owned by domain state machines, never free-form updates |
| Provenance | `source text check (source in ('user','system','ai_proposal','import','integration'))` + `ai_proposal_id uuid null` on documents that AI can propose |
| JSON | `jsonb` only for genuinely schemaless data: payload snapshots, AI traces, rule ASTs. Never for queryable business fields |

## 2. Entity map by module

Key columns only. Every tenant table also has `id`, `organization_id`, and the audit columns.

### Identity & organization

```
organizations(name, legal_name, ntn, strn, province, address, base_currency, timezone,
              fiscal_year_start_month=7, settings jsonb, is_demo, demo_template_id, time_anchor date null)
branches(code, name, city, province, address)                          -- KHI-HO, LHE, ISB
users(email unique, name, phone, image, status)                         -- Better Auth tables alongside: session, account, verification
memberships(user_id, organization_id, role_id, branch_scope uuid[] null, employee_id null, status)  unique(user_id, organization_id)
roles(key, name, is_system, description)                                -- owner, admin, finance_manager, ...
permissions(key primary key, module, description)                       -- global catalogue, synced from code
role_permissions(role_id, permission_key, scope check in ('all','branch','own'))
api_keys(name, hashed_key, permissions text[], last_used_at)            -- future integrations
```

### Masters: parties

```
customers(code, legal_name, trading_name, channel check in ('modern_trade','wholesale','retail','horeca','sub_distributor'),
          ntn, strn, cnic, registration_type check in ('registered','unregistered'), atl_status, atl_verified_at,
          province, city, region_id, route_id, sales_rep_id, credit_limit, payment_terms_id, price_list_id,
          status check in ('active','on_hold','blocked','archived'), risk_score numeric(5,2), risk_band)
customer_contacts(customer_id, name, role, phone, whatsapp, email, is_primary)
customer_addresses(customer_id, type check in ('billing','shipping'), line1, line2, area, city, province, postal_code, geo point null)
regions(name, province)   routes(code, name, branch_id, sales_rep_id, visit_days smallint[])
payment_terms(code, name, days, type check in ('net','eom','cod'))
suppliers(code, legal_name, ntn, strn, is_principal, province, city, payment_terms_id, lead_time_days_default,
          currency, status, reliability_score)          -- bank details live in supplier_bank_accounts
supplier_contacts(...)  supplier_bank_accounts(supplier_id, bank_name, iban, title)
supplier_product_codes(supplier_id, product_id, supplier_sku, supplier_description)   -- OCR line matching
leads(company, contact_name, phone, source, sales_rep_id, estimated_value, probability, stage, notes)
activities(subject_type, subject_id, type check in ('call','visit','note','email','whatsapp'), body, occurred_at, user_id)
```

### Catalog & pricing

```
product_categories(parent_id, name, path ltree)    brands(name, principal_supplier_id)
units(code, name)                                   -- PCS, PACK, CTN, KG, LTR
products(sku unique-per-org, name, description, category_id, brand_id, base_unit_id, hs_code,
         tax_category_id, track_batches bool, track_expiry bool, track_serials bool,
         reorder_point, safety_stock_days, min_order_qty, order_multiple, preferred_supplier_id,
         shelf_life_days, status, barcode)
product_uoms(product_id, unit_id, factor_to_base numeric(16,6), is_purchase_default, is_sales_default, barcode)  -- CTN = 24 PCS
product_retail_prices(product_id, retail_price, effective_from, effective_to)       -- MRP for Third Schedule
product_costs(product_id, warehouse_id, avg_unit_cost numeric(18,6), updated_at)    -- moving average (projection)
price_lists(code, name, channel, currency, is_default, valid_from, valid_to)
price_list_items(price_list_id, product_id, unit_id, unit_price, min_qty)
customer_prices(customer_id, product_id, unit_price, valid_from, valid_to)          -- overrides
trade_schemes(code, name, principal_supplier_id, type check in ('free_goods','pct_discount','slab_discount','value_discount'),
              rules jsonb /* validated by Zod: buy X get Y, slabs */, channels text[], valid_from, valid_to, claimable bool, budget numeric)
```

### Tax

```
tax_categories(code, name)                                  -- STANDARD, THIRD_SCHEDULE, EXEMPT, REDUCED_*, ZERO
tax_codes(code, name, kind check in ('sales_tax','further_tax','extra_tax','fed','wht_236g','wht_236h','provincial_services'),
          rate, basis check in ('value','retail_price'), fbr_sale_type, sro_schedule_no, sro_item_serial_no,
          effective_from, effective_to, gl_account_id)
tax_rules(priority, tax_code_id, conditions jsonb /* {productTaxCategory, buyerRegistration, buyerAtl, channel, province, direction:'sale'|'purchase'} */,
          effective_from, effective_to, is_active)
```

### Inventory

```
warehouses(code, name, branch_id, address, city, province, type check in ('dc','depot'), is_active)
warehouse_locations(warehouse_id, code, zone, aisle, bin, type check in ('storage','receiving','dispatch','quarantine','damaged'))
inventory_batches(product_id, batch_no, mfg_date, expiry_date, supplier_id)  unique(org, product_id, batch_no)
inventory_transactions(                                           -- THE STOCK LEDGER, append-only
   product_id, warehouse_id, location_id, batch_id null,
   txn_type check in ('receipt','issue_sale','return_in','return_out','transfer_out','transfer_in',
                      'adjustment_gain','adjustment_loss','count_variance','damage','scrap','opening'),
   qty_delta numeric(16,3) /* base UoM, signed */, unit_cost numeric(18,6), value_delta numeric(18,2),
   source_doc_type, source_doc_id, source_line_id, occurred_at, posted_at, journal_entry_id null, reason_code null)
inventory_balances(product_id, warehouse_id, location_id, batch_id null,  -- projection, updated in same tx
   on_hand numeric(16,3), reserved numeric(16,3), value numeric(18,2), last_txn_id)
   unique(org, product_id, warehouse_id, location_id, coalesce(batch_id, zero-uuid))
   check (on_hand >= 0 or org allows negative)   -- enforced via trigger reading org setting
stock_reservations(product_id, warehouse_id, batch_id null, qty, source_doc_type, source_line_id,
   status check in ('active','consumed','released'), expires_at null)
stock_transfers(number, from_warehouse_id, to_warehouse_id, status ('draft','approved','in_transit','received','cancelled'), lines…)
stock_adjustments(number, warehouse_id, reason_code, status ('draft','pending_approval','posted'), lines(product, batch, location, qty_delta, unit_cost))
stock_counts(number, warehouse_id, scope ('full','cycle','category','location'), status ('planned','counting','review','posted'),
   counted_by, lines(product, location, batch, expected_qty /* snapshot */, counted_qty, variance_qty, variance_value, recount_of))
```

### Sales (order-to-cash)

```
sales_quotes(number, customer_id, sales_rep_id, issue_date, valid_until, status ('draft','sent','accepted','rejected','expired'),
             price_list_id, totals…, converted_order_id)  + sales_quote_lines
sales_orders(number, customer_id, branch_id, warehouse_id, sales_rep_id, route_id, order_date, requested_delivery_date,
             status ('draft','confirmed','cancelled','closed'),          -- stored document state
             fulfillment_status ('unreserved','reserved','partially_reserved','partially_fulfilled','fulfilled'), -- derived & cached
             credit_check jsonb /* snapshot of exposure/limit/decision at confirm */, credit_override_approval_id,
             subtotal, discount_total, scheme_total, tax_total, grand_total, quote_id, source, ai_proposal_id)
sales_order_lines(order_id, line_no, product_id, uom_id, uom_qty, base_qty, unit_price, discount_pct, scheme_id null,
             is_free_goods bool, tax_breakdown jsonb /* computed lines w/ rule ids */, line_total,
             reserved_qty, fulfilled_qty, invoiced_qty)
pick_lists(number, warehouse_id, status ('open','picking','picked'), assigned_to) + pick_list_lines(location_id, batch_id, qty)
shipments(number /* Delivery Challan DC-… */, order_id, warehouse_id, vehicle_no, driver_name, gate_pass_no,
          status ('ready','dispatched','delivered','returned'), dispatched_at, delivered_at, pod_file_id)  + shipment_lines
invoices(number, customer_id, order_id null, shipment_id null, issue_date, due_date, posting_date,
         status ('draft','approved','sent','void'),                     -- document state
         payment_status ('unpaid','partially_paid','paid'),             -- maintained by allocations
         -- "overdue" is DERIVED: due_date < today AND balance_due > 0 (never stored)
         subtotal, discount_total, tax_total, further_tax_total, wht_236h_total, grand_total, amount_paid, balance_due,
         fbr_status ('not_required','pending','accepted','failed','simulated'), fbr_irn, fbr_qr_file_id, fbr_submitted_at,
         journal_entry_id, ai_proposal_id)
invoice_lines(invoice_id, line_no, product_id, uom_id, uom_qty, base_qty, unit_price, retail_price null,
              discount_amount, value_excl_tax, tax_code_ids uuid[], sales_tax, further_tax, wht_236h, line_total, cogs_amount)
credit_notes(number, customer_id, invoice_id, reason, status, totals, fbr fields, journal_entry_id) + credit_note_lines
sales_returns(number, customer_id, invoice_id null, warehouse_id, status ('draft','received','inspected','posted'),
              lines(product, batch, qty, condition ('resellable','damaged','expired'), location_id))
customer_payments(number, customer_id, received_date, method ('cash','bank_transfer','cheque','pdc','online','other'),
              amount, bank_account_id null, collected_by null, status ('received','deposited','cleared','bounced','void'),
              instrument_id null, journal_entry_id, unallocated_amount)
payment_instruments(type ('cheque','pdc'), cheque_no, bank_name, cheque_date, amount, status ('in_hand','deposited','cleared','bounced','returned'),
              deposited_at, cleared_at, bounced_at, bounce_reason)
payment_allocations(payment_id, invoice_id, amount, allocated_at)  -- also used for supplier side with direction column
```

### Procurement (procure-to-pay)

```
purchase_requests(number, requested_by, warehouse_id, status, lines…, source ('manual','ai_proposal','reorder_rule'))
rfqs(number, status ('draft','sent','closed'), lines…) ; rfq_suppliers(rfq_id, supplier_id, status)
supplier_quotes(rfq_id, supplier_id, valid_until, lines(product, qty, unit_price, lead_time_days))
purchase_orders(number, supplier_id, warehouse_id, order_date, expected_date, status
                ('draft','pending_approval','approved','partially_received','received','closed','cancelled'),
                subtotal, tax_total, wht_236g_total, grand_total, approval_id, source, ai_proposal_id, version)
purchase_order_lines(po_id, line_no, product_id, uom_id, uom_qty, base_qty, unit_price, tax breakdown, received_qty, billed_qty)
goods_receipts(number /* GRN-… */, po_id, warehouse_id, received_date, received_by, status ('draft','posted'), journal_entry_id)
goods_receipt_lines(grn_id, po_line_id, product_id, batch_id, location_id, base_qty, accepted_qty, rejected_qty, rejection_reason)
supplier_bills(number /* internal */, supplier_id, supplier_invoice_no, supplier_invoice_no_normalized, bill_date, due_date,
               status ('draft','pending_match','exception','approved','posted','paid','void'), payment_status,
               subtotal, tax_total, wht_236g, grand_total, file_id null, extraction_id null, journal_entry_id)
               unique(org, supplier_id, supplier_invoice_no_normalized)   -- hard duplicate guard (fuzzy handled by detector)
supplier_bill_lines(bill_id, po_line_id null, grn_line_id null, product_id null, gl_account_id null, description, qty, unit_price, tax, total)
three_way_matches(bill_id, status ('matched','exceptions','approved_with_variance'), tolerance_snapshot jsonb, evaluated_at)
match_exceptions(match_id, bill_line_id null, type ('QTY_MISMATCH','PRICE_VARIANCE','MISSING_RECEIPT','DUPLICATE_BILL',
                 'UNEXPECTED_TAX','PRICE_INCREASE_VS_HISTORY','UNMATCHED_LINE'), expected, actual, variance_amount, variance_pct, resolution)
supplier_payments(number, supplier_id, paid_date, method, amount, bank_account_id, cheque_no, status, journal_entry_id)
principal_claims(number, supplier_id, type ('scheme','expiry','damage','price_differential'), period, amount, status ('draft','submitted','accepted','settled','rejected'), lines…)
```

### Finance

```
accounts(code, name, type check in ('asset','liability','equity','income','expense'), subtype, parent_id, is_postable,
         is_control bool /* AR, AP, Inventory: only subledger postings */, normal_balance ('debit','credit'), is_active, currency)
fiscal_years(name /* FY 2026-27 */, start_date, end_date, status ('open','closed'))
fiscal_periods(fiscal_year_id, period_no, name /* P04 FY26-27 (Oct-2026) */, start_date, end_date, status ('open','soft_closed','closed'))
journal_entries(number /* JE-… */, entry_date /* posting date */, period_id, type ('auto','manual','reversal','closing','opening'),
               source_doc_type, source_doc_id, memo, status ('draft','posted'), posted_at, posted_by,
               reversal_of_id null, reversed_by_id null, approval_id null, ai_proposal_id null)
journal_entry_lines(entry_id, line_no, account_id, debit numeric(18,2) default 0, credit numeric(18,2) default 0, memo,
               customer_id null, supplier_id null, product_id null, warehouse_id null, branch_id null, employee_id null,
               check (debit >= 0 and credit >= 0 and (debit = 0) <> (credit = 0)))
bank_accounts(name, bank_name, account_title, iban, gl_account_id, currency, is_active)
bank_statement_imports(bank_account_id, file_id, period_from, period_to, status, row_count)
bank_transactions(bank_account_id, import_id, txn_date, value_date, description, reference, amount /* signed */, balance,
               status ('unmatched','suggested','matched','excluded'), fingerprint unique per account)
reconciliation_matches(bank_transaction_id, target_type ('customer_payment','supplier_payment','expense','journal_line','transfer'),
               target_id, amount, confidence, method ('rule','score','ai_assisted','manual'), status ('suggested','confirmed','rejected'), confirmed_by)
```

### Expenses & HR

```
expense_categories(name, gl_account_id, policy jsonb /* limit, receipt_required_above, weekend_flag */)
expenses(number, employee_id, category_id, merchant, expense_date, amount, tax_amount, purpose, status
         ('draft','submitted','manager_approved','finance_approved','rejected','reimbursed'), file_id, extraction_id,
         policy_flags jsonb, duplicate_of null, journal_entry_id)
departments(name, head_employee_id, parent_id)
employees(code, user_id null, name, cnic, department_id, position, manager_id, branch_id, joining_date, employment_type,
          status, phone, email, emergency_contact, salary numeric(18,2) /* column-level: only hr/finance read */)
leave_types(name, annual_quota)  leave_balances(employee_id, leave_type_id, year, entitled, taken)
leave_requests(employee_id, leave_type_id, from_date, to_date, days, reason, status, approval_id)
attendance_summaries(employee_id, month, present_days, absent_days, late_days, leave_days)      -- imported/simulated
payroll_runs(month, status ('draft','approved','posted'), totals, journal_entry_id) + payroll_lines(employee_id, gross, wht, eobi, net)
```

### Platform: approvals, workflow, notifications, tasks

```
approval_policies(subject_type, name, condition jsonb /* rule AST */, steps jsonb /* [{role:'finance_manager'},{role:'owner'}] */, priority, is_active)
approvals(subject_type, subject_id, subject_version, subject_snapshot_hash, title, summary, amount null,
          requested_by, requested_source ('user','ai_proposal','workflow'), policy_id, current_step, status
          ('pending','approved','rejected','cancelled','stale'), decided_at)
approval_steps(approval_id, step_no, approver_role_id null, approver_user_id null, decision, decided_by, comment, decided_at)
workflow_rules(name, trigger_type ('event','schedule'), trigger_event, schedule_cron, condition jsonb, actions jsonb, is_active)
workflow_runs(rule_id, event_id, status, result jsonb, error)
tasks(title, description, assignee_id, subject_type, subject_id, due_at, status, source)
notifications(user_id, type, title, body, link, severity, dedupe_key, read_at, digest_id null)
notification_preferences(user_id, type, channels text[], digest ('instant','hourly','daily','off'))
```

### AI

```
ai_prompts(name, version, hash, purpose, tier, temperature, output_schema_name, created_at)  unique(name, version)  -- synced from code
ai_conversations(user_id, title, context jsonb /* pinned entity refs */, status)
ai_messages(conversation_id, role ('user','assistant','tool'), content, structured jsonb /* AnswerEnvelope */, ai_request_id)
ai_requests(conversation_id null, purpose, prompt_name, prompt_version, model_requested, model_used, provider,
            input_tokens, output_tokens, cost_usd numeric(12,6), latency_ms, status ('ok','validation_failed','timeout','error','budget_exceeded','cache_hit'),
            context_hash, cache_key, error_code, request_id)
ai_tool_calls(ai_request_id, tool_name, input jsonb, output_summary jsonb, row_count, permission_decision, duration_ms, status)
ai_insights(kind, title, statement, why jsonb, evidence jsonb /* [{type, id, label}] */, metrics jsonb, confidence ('high','medium','low'),
            confidence_basis text, data_fingerprint, generated_by ('llm','deterministic'), ai_request_id null,
            status ('active','dismissed','actioned','expired'), valid_until)
ai_recommendations(kind ('replenishment','credit_hold','price_review','collection','claim'), subject_type, subject_id,
            payload jsonb, explanation jsonb, insight_id null, status ('open','accepted','adjusted','dismissed'), decided_by)
ai_proposed_actions(conversation_id null, recommendation_id null, command ('CreatePurchaseOrder','PlaceCreditHold','SendCollectionMessage',…),
            params jsonb /* validated */, preview jsonb, status ('proposed','confirmed','executed','rejected','expired','failed'),
            confirmed_by, executed_entity_type, executed_entity_id, expires_at)
document_extractions(file_id, kind ('supplier_bill','receipt'), status, result jsonb /* schema-validated */, field_confidence jsonb, ai_request_id)
ai_usage_counters(scope ('global','org','session'), scope_id, day date, requests, tokens)
ai_response_cache(cache_key primary key, prompt_name, prompt_version, data_fingerprint, response jsonb, created_at, expires_at)
```

### Cross-cutting

```
audit_logs(seq bigserial, organization_id, occurred_at, actor_type, actor_id, actor_label, action, entity_type, entity_id,
           before jsonb, after jsonb, diff jsonb, source, ai_request_id, ai_proposal_id, approval_id, request_id, ip inet, user_agent,
           prev_hash bytea, hash bytea)          -- per-org hash chain; app role: INSERT/SELECT only
outbox_events(id, organization_id, type, version, aggregate_type, aggregate_id, payload, actor, correlation_id, occurred_at, published_at)
event_consumptions(event_id, subscriber, processed_at) primary key(event_id, subscriber)
idempotency_keys(organization_id, key, request_hash, response_status, response_body, created_at) primary key(organization_id, key)
document_sequences(organization_id, doc_type, prefix, fiscal_year_id null, next_value) -- row-locked, gapless
files(storage_key, filename, mime_type, size, sha256, uploaded_by, scan_status)  -- bytes live in object storage
attachments(file_id, subject_type, subject_id)
saved_views(user_id null /* null = shared */, resource, name, state jsonb /* filters, sort, columns, grouping */)
search_documents(entity_type, entity_id, title, subtitle, body, tsv tsvector, trigram text, permission_key, updated_at)
integrations(type, mode ('simulated','sandbox','live'), status, config jsonb, secrets_encrypted bytea, last_sync_at)
webhook_endpoints(url, secret_encrypted, events text[], is_active) ; webhook_deliveries(endpoint_id, event_id, status, attempts, last_response)
fbr_submissions(invoice_id | credit_note_id, mode, request_payload, response_payload, irn, status, attempts, http_status)
calendar_events(name, kind ('ramadan','eid','public_holiday','season'), start_date, end_date, demand_effects jsonb)
demo_sandboxes(organization_id, template_version, status ('provisioning','ready','assigned','expired'), assigned_at, expires_at, visitor_fingerprint)
kv_cache(key, value, expires_at) ; rate_limits(key, tokens, refilled_at)
```

## 3. Integrity enforced *in the database* (defense in depth)

| Invariant | Mechanism |
|---|---|
| JE balanced | `CONSTRAINT TRIGGER … DEFERRABLE INITIALLY DEFERRED` on `journal_entry_lines`: at commit, `sum(debit)=sum(credit)` and ≥2 lines for each touched posted entry |
| Posted JE immutable | Trigger rejects UPDATE/DELETE on lines of posted entries and on posted headers (except setting `reversed_by_id`) |
| No posting into closed periods | Trigger on `journal_entries` insert/post: period of `entry_date` must be `open` (or `soft_closed` with the `finance.periods.post_soft_closed` flag set via `set_config`) |
| Control accounts only from subledgers | Trigger: manual JEs (`type='manual'`) cannot hit `is_control` accounts |
| Stock ledger append-only | No UPDATE/DELETE grants; trigger guard |
| Non-negative stock | Trigger on `inventory_balances`: `on_hand >= 0 AND reserved >= 0 AND reserved <= on_hand` unless the org setting allows negatives |
| Audit append-only + chained | INSERT-only grant; `BEFORE INSERT` trigger computes `hash = sha256(prev_hash ‖ canonical_row)` under an advisory lock per org |
| Unique documents | `unique(organization_id, number)` per document table; supplier bill duplicate guard on normalized number |
| Tenant consistency | Composite FKs where cheap: `(organization_id, customer_id) → customers(organization_id, id)`. This prevents cross-tenant references even from buggy code |
| Allocation sanity | Trigger: total allocations for an invoice ≤ grand_total; for a payment ≤ amount |

Integrity check SQL functions (`erp_check_trial_balance()`, `erp_check_ar_subledger()`, `erp_check_ap_subledger()`, `erp_check_stock_vs_gl()`, `erp_check_balances_vs_ledger()`, `erp_verify_audit_chain(org)`) power the **System Health** page, the nightly job, and the seed verifier.

## 4. Indexing plan (initial)

- Every FK column is indexed, with `organization_id` leading.
- Lists:
  - `invoices(organization_id, status, due_date)`
  - `invoices(organization_id, customer_id, issue_date desc)`
  - a partial index `invoices(organization_id, due_date) WHERE payment_status <> 'paid' AND status IN ('approved','sent')` for AR aging and overdue lists
- Ledger:
  - `journal_entry_lines(organization_id, account_id, entry_date)`. Denormalize `entry_date` onto lines for range scans.
  - `journal_entry_lines(organization_id, customer_id) WHERE customer_id IS NOT NULL`
- Stock:
  - `inventory_transactions(organization_id, product_id, warehouse_id, occurred_at)`
  - `inventory_balances(organization_id, warehouse_id, product_id)`
- Search: GIN on `search_documents.tsv`; GIN trigram on `search_documents.trigram`; trigram on `customers.legal_name`, `products.name`, `suppliers.legal_name`.
- Outbox: `outbox_events(published_at) WHERE published_at IS NULL`.
- Audit: `audit_logs(organization_id, entity_type, entity_id, seq desc)`, `audit_logs(organization_id, occurred_at desc)`.

## 5. Reporting read models

Materialized views are refreshed concurrently by `reporting.refresh` (debounced on events, plus nightly):

| View | Grain | Feeds |
|---|---|---|
| `mv_sales_daily` | org × date × product × customer × warehouse × rep | sales reports, trends, forecast inputs, dashboard |
| `mv_ar_open_items` | open invoice with aging bucket, days overdue | AR aging, collection risk, cash forecast |
| `mv_ap_open_items` | open bill with due bucket | AP aging, cash forecast |
| `mv_gl_monthly` | org × period × account (× branch) | P&L, BS, TB, profit variance |
| `mv_stock_position` | product × warehouse: on_hand, reserved, available, incoming (open PO), value, days of cover | inventory screens, replenishment |
| `mv_supplier_price_history` | supplier × product × date: unit price | anomaly detector, supplier profile |
| `mv_customer_payment_behavior` | customer × month: avg days to pay, late %, bounces | risk scoring, AI tools |

The dashboard reads **only** from GL-based and subledger-based views. No KPI is computed from a separate "dashboard numbers" table.

## 6. Migrations

- Drizzle schema lives in TypeScript, one file per module under `packages/db/schema/`. `drizzle-kit generate` produces SQL migrations that are committed and reviewed.
- Hand-written SQL migrations hold RLS policies, triggers, check functions, materialized views, and grants. They sit in the same ordered folder.
- Two DB roles:
  - `erp_owner` owns objects and runs migrations and seed bulk loads.
  - `erp_app` (used by web and worker) has `NOBYPASSRLS` and narrowed grants.
  - An additional `erp_system` role with `BYPASSRLS` is used only by the cross-tenant maintenance jobs (sandbox cleanup, global AI budget counters), and only through a dedicated connection in the worker.
