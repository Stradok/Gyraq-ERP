# 05: Business Engines (the correctness core)

Every engine below is **pure domain code** in a module's `domain/` folder: no IO, fully unit-tested, and reused by the production commands *and* the seed simulation. That reuse is how the demo data ends up reconciled by construction.

---

## 1. Chart of accounts (Meridian template)

Codes are configurable data. This is the seed template.

| Code | Account | Type | Notes |
|---|---|---|---|
| 1010 | Cash in Hand – Head Office | asset | |
| 1015 | Cash with Salesmen (in transit) | asset | route collections before deposit |
| 1100–1130 | Bank – Meezan Current, HBL Current, MCB Collection, Bank Alfalah Payroll | asset | linked to `bank_accounts` |
| 1200 | Trade Debtors (AR) | asset | **control** |
| 1210 | Cheques / PDCs in Hand | asset | |
| 1250 | Allowance for Doubtful Debts | asset (contra) | |
| 1300 | Stock in Trade | asset | **control** (stock ledger) |
| 1320 | Stock in Transit (inter-warehouse) | asset | |
| 1400 | Input Sales Tax | asset | |
| 1410 | Advance Income Tax u/s 236G (adjustable) | asset | paid to principals |
| 1500 | Claims Receivable – Principals | asset | schemes, expiry, damage |
| 1600–1690 | Vehicles, Warehouse Equipment, Accumulated Depreciation | asset | opening balances only (no FA module) |
| 2010 | Trade Creditors (AP) | liability | **control** |
| 2020 | Goods Received Not Invoiced (GRNI) | liability | |
| 2100 | Output Sales Tax Payable | liability | |
| 2105 | Further Tax Payable | liability | |
| 2120 | Advance Tax u/s 236H Collected | liability | |
| 2130 | Income Tax Withheld – Salaries | liability | |
| 2140 | EOBI / Social Security Payable | liability | |
| 2210 | Employee Reimbursements Payable | liability | |
| 2300 | Salaries Payable | liability | |
| 2400 | Accrued Expenses | liability | |
| 3010 | Owner's Capital | equity | |
| 3100 | Retained Earnings | equity | |
| 4010 | Sales – Gross | income | |
| 4020 | Sales Returns | income (contra) | |
| 4030 | Trade Discounts & Scheme Discounts | income (contra) | |
| 5010 | Cost of Goods Sold | expense | |
| 5020 | Stock Shrinkage, Damage & Expiry | expense | |
| 5030 | Purchase Price Variance | expense | |
| 5040 | Scheme Free-Goods Cost | expense | offset by claims |
| 6010–6990 | Salaries, EOBI, Rent, Electricity, Fuel & Vehicle Running, Freight Outward, Repairs, Bank Charges, Communication, Printing, Entertainment, Bad Debts, Depreciation, Misc | expense | |

Each account carries `cash_flow_category` (operating / investing / financing / cash) for the indirect cash-flow statement.

## 2. Journal engine

```ts
// packages/modules/finance/src/domain/journal.ts
type PostingLine = { account: AccountRef; debit?: Money; credit?: Money; dims?: Dimensions; memo?: string };
type PostingRequest = { entryDate: LocalDate; type: 'auto'|'manual'|'reversal'|'closing'|'opening';
                        source: { docType: string; docId: string }; memo: string; lines: PostingLine[] };
function buildJournal(req: PostingRequest, ctx: { accounts: AccountIndex; period: FiscalPeriod }): Result<Journal, DomainError>
```

Guards are enforced in code *and* by DB triggers (doc 04 §3):
- The entry balances to the paisa.
- It has at least 2 lines.
- No line has both a debit and a credit.
- Accounts are postable and active.
- Control accounts are only reached from subledger postings.
- The period is open.
- The currency is the org base currency.

Other rules:
- **Reversal** creates a mirror entry dated in an open period, linked both ways. The original is never changed.
- **Posting rules registry:** `postingRules[docType](doc) → PostingRequest`. Every posting is therefore explainable ("this JE came from rule `sales_invoice.v1`").

### Posting rules (v1)

| Event | Debit | Credit |
|---|---|---|
| **Goods receipt (GRN)** | 1300 Stock (qty × PO unit cost excl. recoverable tax) | 2020 GRNI |
| **Supplier bill (matched)** | 2020 GRNI (received value) · 1400 Input tax · 1410 Advance tax 236G · 5030 PPV (if bill > PO) | 2010 AP (gross payable) · 5030 PPV (if bill < PO) |
| **Non-stock bill** (utilities, rent) | 6xxx expense · 1400 (if claimable) | 2010 AP |
| **Supplier payment** | 2010 AP | 11xx Bank |
| **Shipment dispatched** | 5010 COGS (paid lines) · 5040 Scheme cost (free-goods lines), at moving-average cost | 1300 Stock |
| **Sales invoice** | 1200 AR (grand total) · 4030 Discounts/schemes | 4010 Sales gross · 2100 Output ST · 2105 Further tax · 2120 236H collected |
| **Receipt: bank transfer** | 11xx Bank | 1200 AR |
| **Receipt: cash on route** | 1015 Cash with salesmen | 1200 AR |
| **Salesman deposit** | 11xx Bank / 1010 Cash | 1015 |
| **Receipt: cheque/PDC** | 1210 Cheques in hand | 1200 AR |
| **Cheque cleared** | 11xx Bank | 1210 |
| **Cheque bounced** | 1200 AR (+ 6xxx bank charges if any) | 1210 (+ Bank for charges); allocations re-opened, `ChequeBounced` event |
| **Credit note / sales return** | 4020 Returns · 2100 · 2105 · 2120 | 1200 AR |
| **Return to stock (resellable)** | 1300 Stock (at original line COGS) | 5010 COGS |
| **Return damaged/expired** | 5020 Shrinkage/expiry **or** 1500 Claims (if claimable from principal) | 5010 COGS (reversal path) |
| **Principal claim accepted** | 1500 Claims receivable | 5040 / 5020 (recovery) |
| **Claim settled by offset** | 2010 AP | 1500 |
| **Stock adjustment / count loss** | 5020 | 1300 |
| **Count gain** | 1300 | 5020 |
| **Transfer out / in** | 1320 Transit → 1300 (destination dims) | 1300 (source dims) → 1320 |
| **Expense approved** | 6xxx (+1400 if claimable) | 2210 Employee payable |
| **Expense reimbursed** | 2210 | 1010 / 11xx |
| **Payroll posted** | 6010 Salaries · 6015 Employer EOBI | 2300 Net payable · 2130 WHT · 2140 EOBI |
| **Payroll paid** | 2300 | 1130 Payroll bank |
| **Year-end close** | income accounts (zeroed) | expense accounts (zeroed), difference → 3100 Retained earnings |

Every line carries dimensions (`customer_id`, `supplier_id`, `product_id`, `warehouse_id`, `branch_id`, `employee_id`) wherever they apply. AR/AP aging and "profit by customer/product/branch" are therefore **ledger queries**, not separate calculations.

Policy choices, documented as org settings for later: PPV goes to expense rather than being capitalized; PDCs are recognized as an asset on receipt; tax on free goods is off by default (configurable rule).

## 3. Fiscal periods & close

- Each FY runs July–June with 12 periods. Statuses: `open → soft_closed` (only Finance can post, with a reason) → `closed` (no posting; corrections go into the current period as adjusting entries).
- **Close checklist (computed, not a static list):**
  - Unbilled GRNs (GRNI aging)
  - Unreconciled bank lines
  - Draft documents dated in the period
  - Invoices with FBR status `failed`
  - Negative-margin invoices
  - Integrity checks green
- **Reopening** a period requires Owner approval and creates an audit event.
- **Seed:** FY 2025-26 is fully closed with a year-end closing entry. P01–P03 of FY 2026-27 are soft-closed, and P04 (Oct 2026) is open. This lets the demo show the guard "can't post into a closed period".

## 4. Inventory engine

**Stock ledger:** every movement is an `inventory_transactions` row: signed base-unit qty, unit cost, value, and source document. `inventory_balances` is a projection updated in the same transaction. A nightly check recomputes it from the ledger.

**Costing: moving weighted average per product × warehouse**
```
on receipt:  newAvg = (onHand × avg + inQty × inCost) / (onHand + inQty)
on issue:    cost = qty × avg            (avg unchanged)
on transfer: destination receives at source avg; destination avg re-blends
on return:   in at the original invoice line's recorded unit COGS
on count gain: at current avg
```
The engine sits behind a `CostingStrategy` interface, so FIFO can be added later. Weighted average is common in Pakistani SMEs and is stable when negative stock is disallowed.

**Batches & FEFO:**
- Reservations are made at product × warehouse level.
- Batches are allocated at **pick time** by FEFO, skipping batches that would violate the customer's `min_remaining_shelf_life_pct`. Modern trade typically demands ≥60%.
- Batches within 30 days of expiry raise an "expiry risk" signal. That signal feeds the claims and markdown recommendations.

**Reservations & availability:**
```
available = on_hand − reserved            (per warehouse)
incoming  = Σ open PO lines (base qty − received)
projected(t) = available + incoming arriving ≤ t − forecast demand ≤ t
```
- **Concurrency:** lock balance rows with `SELECT … FOR UPDATE` in a deterministic order (sorted product_id) to avoid deadlocks. Reservation and release go through `InventoryService.reserve(tx, …)` and `release(tx, …)`.
- **Partial availability:** the line is reserved for what's available, and the order's `fulfillment_status = partially_reserved`. The user chooses between a backorder, splitting across warehouses (with a suggestion), or reducing the quantity.

**Units of measure:** documents store `uom_id + uom_qty` as entered (e.g. 5 CTN). The engine converts to base (`× factor` → 120 PCS). Rounding rules come from the product's `order_multiple`.

**Stock counts:**
1. Plan, which snapshots `expected_qty`.
2. Count. The mobile UI shows blind counts, without the expected quantity.
3. Variance review. Recounts are required above a threshold, e.g. |variance| > 2% or Rs 10,000.
4. Approval for large variances.
5. Post, which writes `count_variance` transactions and the JE.

Variance history feeds the warehouse discrepancy detector.

## 5. Pricing engine

`priceDocument(lines, customer, date, catalogs) → { lines: PricedLine[], trace: PricingStep[] }`

1. **Base price:** a customer-specific price, else the channel price list, else the default list, in the line's UoM.
2. **Manual line discount**, limited by permission:
   - `sales.discount.up_to_2pct` for reps
   - `up_to_5pct` for the sales manager
   - anything higher → approval
3. **Trade schemes** eligible by date, channel, product, and min qty:
   - `free_goods` (buy 10 CTN get 1): adds a free line (`is_free_goods`, price 0, `scheme_id`)
   - `slab_discount` (e.g. 1–49 CTN 0%, 50–99 2%, 100+ 3.5%)
   - `pct_discount` / `value_discount`

   Stacking is controlled by `scheme.stackable`, and there's a budget check against `trade_schemes.budget`.
4. **Rounding:** 2 dp half-up per line.

The `trace` is stored on the line (`pricing_trace jsonb`) and shown in a popover ("Price Rs 1,840/CTN from *Modern Trade list*; scheme *Summer 10+1* added 2 CTN free"). AI tools return it as evidence.

## 6. Tax engine

`computeTaxes({ direction, lines, seller, buyer, date }, ruleset) → { lines: TaxedLine[], totals, firedRules[] }`

- The ruleset holds effective-dated `tax_codes` and `tax_rules`, loaded per document date.
- **Sales tax:** the basis is either `value` (value excl. tax after discounts) or `retail_price` (MRP × qty in base units, for Third Schedule).
- **Further tax:** applied when the buyer's `registration_type = unregistered` or they're not active on the ATL. The rate comes from config (seed 4%).
- **236H:** collected on sales to retailers and wholesalers at the rate set by the buyer's ATL status (seed 0.5% ATL / 2.5% non-ATL for retailers). It's shown as a separate invoice line.
- **236G:** on purchase bills, 0.1% / 2% depending on Meridian's own ATL status.
- **Output:**
  - Per-line `TaxBreakdown[]` with `tax_code_id`, base, rate, amount, and `fbr_sale_type`
  - Doc totals
  - The rules that fired, for explanations and the FBR payload mapping
- **Unit tests** use a table of fixtures covering every combination of category, registration, ATL status, and channel. When rates change (e.g. a new Finance Act), a new effective-dated row is added. Nothing is edited in place, so historical invoices stay reproducible.

## 7. Credit engine

```
exposure = AR open balance
         + confirmed-but-uninvoiced orders
         + uncleared cheques/PDCs (configurable: count as exposure until cleared)
         + this order
decision = BLOCK  if customer.status in (on_hold, blocked)
           BLOCK  if exposure > credit_limit
           BLOCK  if any invoice overdue > policy.max_overdue_days (default 30 beyond terms)
           WARN   if exposure > 90% of limit or risk_band = high
           PASS   otherwise
```
- The decision and its inputs are snapshotted into `sales_orders.credit_check` at confirmation.
- `BLOCK` leads to **Request credit override**, which creates an approval with the snapshot. The approval policy decides who approves: Sales Manager up to 20% over the limit, Owner above that.
- Separately, **Credit limit increase** is a first-class request type in the Approval Center (plan §36).

## 8. Order-to-cash state machines

```
Quote:   draft → sent → accepted → (converted to SO) | rejected | expired (job at valid_until)
SO:      draft → confirmed → closed | cancelled          (+ fulfillment_status derived from lines:
                                                          unreserved/partially_reserved/reserved/partially_fulfilled/fulfilled)
         confirm(): price → tax → credit check → reserve → number → JE? (none) → audit → SalesOrderConfirmed
Pick:    open → picking → picked     (FEFO batch allocation)
Shipment (Delivery Challan): ready → dispatched (stock issue + COGS JE; gate pass no.) → delivered (POD) | returned
Invoice: draft → approved (final number, JE, FBR submit queued) → sent → void (only via credit note)
         payment_status: unpaid → partially_paid → paid  (allocations)    overdue: derived
Payment: received → (cheque) deposited → cleared | bounced
```

- Invoice creation is either automatic as a draft on dispatch (`settings.sales.invoice_on = 'dispatch'`, the default) or manual from an order or shipment.
- Numbers are **gapless**. Drafts carry `DRAFT-…` IDs, and the final number is assigned on approve from `document_sequences` under a row lock.
- A tiny `defineStateMachine()` helper gives the UI `allowedActions` for each DTO, so a button is rendered only if the action is possible *and* the user is permitted. This is how "no buttons that do nothing" is enforced.

## 9. Procure-to-pay & three-way match

```
PR (draft→submitted→approved→converted) → RFQ (draft→sent→closed) → supplier quotes (compare grid) →
PO (draft→pending_approval→approved→partially_received→received→closed | cancelled) →
GRN (draft→posted; accepted/rejected qty per line; batches+expiry captured) →
Bill (draft→pending_match→exception|approved→posted→paid) → Supplier payment
```

**Match algorithm** (`matchBill(bill, po, grns, history, tolerances)`):

1. Map each bill line to a PO line. Try the explicit ref first, then the product, then `supplier_product_codes`, then a fuzzy description match (flagged).
2. **Qty:** billable = received accepted qty − already billed. If billed > billable, raise `QTY_MISMATCH`. If nothing has been received, raise `MISSING_RECEIPT`.
3. **Price:** if |bill price − PO price| > tolerance (default 1% or Rs 500 per line), raise `PRICE_VARIANCE` with variance amount and %.
4. **Tax:** recompute with the tax engine. If the billed tax differs by more than Rs 100, raise `UNEXPECTED_TAX`.
5. **History:** if the bill price is more than 5% above the trailing 90-day median for the supplier × product, raise `PRICE_INCREASE_VS_HISTORY`. This is informational and also feeds the anomaly insight.
6. **Duplicates:**
   - A hard unique index on the normalized supplier invoice number.
   - A fuzzy check raises `DUPLICATE_BILL` (suspected) when all of these hold: Levenshtein ≤ 1 on the number, amount within 0.5%, and date within 10 days.
7. **Result:**
   - No exceptions → `approved` (auto-post allowed by setting).
   - Otherwise → `exception`. An approval request is created with an exceptions table and a required resolution per exception: accept variance (PPV), short-pay, or request a credit note.

Plan §11's example (invoice Rs 1,840,000 vs PO 1,720,000 → Rs 120,000, "6.9% price variance on 3 products") is seeded exactly. See doc 09.

## 10. Approval engine

- **Policies** (`approval_policies`) carry a condition AST and ordered steps by role. These are seeded:

| Subject | Condition | Steps |
|---|---|---|
| Purchase order | `grand_total > 1,000,000` | Procurement Manager → Owner |
| Purchase order | `grand_total ≤ 1,000,000` | Procurement Manager |
| Supplier bill with exceptions | any exception | Finance Manager |
| Expense | always | Line manager → Finance (if > Rs 25,000 or policy flag) |
| Credit override | `over_limit_pct ≤ 20` | Sales Manager; else → Owner |
| Credit limit increase | always | Finance Manager → Owner (if new limit > Rs 5M) |
| Stock adjustment / count variance | `abs(value) > 50,000` | Warehouse Manager → Finance Manager |
| Manual journal entry | `total > 500,000` | Finance Manager (≠ preparer) |
| AI replenishment recommendation → PO | via PO policy | — |
| Period reopen | always | Owner |
| Leave request | always | Line manager |

- **Request flow:** the command evaluates policies. On a match, the subject moves to `pending_approval` and an `approvals` row is created with `subject_version` and `subject_snapshot_hash`.
- **Decision checks:**
  - The approver holds the step role, with branch scope respected.
  - **Segregation of duties:** the approver ≠ the requester. For AI proposals, the confirming user counts as the requester.
  - The snapshot hash is unchanged. Otherwise the approval becomes `stale` and the requester must resubmit.
- **Executor registry:** `registerApprovalExecutor(subjectType, { onApproved(tx, subject), onRejected(tx, subject) })`. Approval and the resulting transition happen in **one transaction**, with audit entries linking `approval_id`.
- **Inbox:** one query across all subject types, with an amount, a summary, an inline preview, and approve/reject with a comment. Bulk approve is allowed only for same-type, low-value items.

## 11. Rule AST (shared by approvals, workflow, notifications, expense policy)

```json
{ "all": [ { "fact": "invoice.grand_total", "op": "gt", "value": 500000 },
           { "any": [ { "fact": "customer.channel", "op": "eq", "value": "wholesale" },
                      { "fact": "customer.risk_band", "op": "in", "value": ["medium","high"] } ] } ] }
```
- Facts come from a **typed fact registry** per subject (`facts.invoice.grand_total: { type: 'money', resolve }`).
- Operators: `eq, ne, gt, gte, lt, lte, in, not_in, contains, between, is_null`.
- Evaluation is pure and never uses `eval`. Zod validates the AST, and the UI builder only offers registered facts and operators.

## 12. Workflow automation engine (demo-sized but real)

- `workflow_rules` define:
  - **Trigger:** an event type or a cron
  - **Condition:** a rule AST
  - **Actions:** from a typed catalogue
- **Action catalogue (v1):**
  - `notify` (role/user, template)
  - `create_task` (assignee, due in N days)
  - `create_ai_recommendation` (kind) → enqueues a detector run for the subject
  - `require_approval` (adds a dynamic policy step)
  - `send_webhook`
  - `set_customer_status` (*proposal only*: creates an approval, never a direct mutation)
- **Seeded rules:**
  1. `InvoicePosted` AND `grand_total > 500,000` → require Finance Manager approval before `sent`.
  2. `StockLevelChanged` AND `available < reorder_point` → create AI replenishment recommendation (debounced per SKU × warehouse per day).
  3. `ChequeBounced` → notify Sales Manager, create task "Contact customer", and recompute the risk score.
  4. Daily 09:00 → digest of invoices due in 3 days to each rep for their customers.
- **Safety:**
  - Runs are logged in `workflow_runs`.
  - A loop guard stops recursion: max causation depth 3, and a rule cannot trigger itself.
  - A dry-run "Test rule" shows which recent events would have matched.
