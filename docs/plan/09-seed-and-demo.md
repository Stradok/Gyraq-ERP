# 09: Seed Data, Simulation & Demo Mode

## 1. Philosophy

The seed is a **deterministic business simulation**, not a fixture dump.

- It is **deterministic:** a fixed PRNG seed (mulberry32) + template version + anchor date always produce the same data.
- It is **time-anchored:** `anchor = provisioning date`. History covers **18 months back** from the anchor, which gives full FY 2025-26 plus Q1 FY 2026-27 plus a same-quarter-last-year comparison, and the demo always feels current.
- It is **consistent by construction:** documents are produced by the *same pure domain functions* as production: pricing, tax, credit, costing, posting rules, and state machines. They are then bulk-inserted (COPY / multi-row inserts). The ledger, subledgers, and stock all reconcile.
- It is **verified:** after seeding, `erp_check_*` integrity functions must all pass, or the seed fails.
- It is **fast:** target ≤ 30 s per org on the demo VPS. That enables per-visitor sandboxes.

`pnpm db:seed` creates the template org. `pnpm demo:reset` purges demo orgs, re-seeds, and warms the sandbox pool.

## 2. Master data catalogue (`packages/seed/catalog/*.ts`, hand-curated)

All company and brand names are **fictional**, to avoid trademark issues and impersonation. Cities, areas, and banks are real, for local credibility.

**Organization:** Meridian Distribution Co. (Pvt.) Ltd. · NTN 4XXXXXX-X (fictional format-valid) · STRN · Head office: Shahrah-e-Faisal, Karachi · FY July–June.

**Branches & warehouses (5):**

| Code | Warehouse | Branch | Notes |
|---|---|---|---|
| KHI-DC1 | Karachi DC – SITE Area | Karachi HO | main DC, ~45% volume |
| KHI-DC2 | Karachi Depot – Korangi | Karachi HO | overflow, modern trade |
| LHE-DC | Lahore DC – Sundar Industrial Estate | Lahore | ~28% volume; **discrepancy scenario** |
| ISB-DC | Islamabad DC – I-9 Industrial Area | Islamabad | ~15% |
| FSD-DP | Faisalabad Depot | Lahore | ~7%, smaller |

Each warehouse has zones (Receiving, Storage A–E, Dispatch, Quarantine, Damaged) and 40–120 bin locations.

**Principals / suppliers (24):** e.g. *Indus Beverages Ltd.* (water, juices, carbonates; **price anomaly scenario**), *Shahi Foods (Pvt.) Ltd.* (spices, sauces, noodles), *Crescent Dairy* (UHT milk, tea whitener), *Lucky Foods* (biscuits, snacks; **duplicate bill scenario**), *Gulnar Beverages* (sharbat/syrups; Ramadan peak), *Pak Home Care* (detergents, dishwash), *Zara Personal Care* (shampoo, soap, lotions), *Al-Barkat Rice & Pulses*, *Sunridge Edible Oils* (ghee, cooking oil), *Tazeen Tissues*, *Mehran Confectionery*, *Kohinoor Snacks*, plus importers and service suppliers: electricity utility (generic name), fuel card provider, transport contractors, landlords.

**Products (~130 SKUs)** across categories:
- Beverages ~28
- Packaged Foods ~30
- Dairy ~12
- Snacks & Confectionery ~22
- Household ~18
- Personal Care ~20

Each SKU has:
- A realistic pack-size name (e.g. *NestFresh Mineral Water 1L*, *Crunchos Masala Chips 50g*, *Shahi Chicken Karahi Masala 50g*, *Sunridge Banaspati Ghee 1kg*, *Gulnar Rose Sharbat 800ml*, *Zara Herbal Shampoo 375ml*)
- Base unit PCS with CTN (6/12/24/48) and sometimes PACK
- HS code (real chapter headings)
- Tax category (most are Third Schedule since Finance Act 2026; a few standard; a few exempt, e.g. some pulses)
- MRP history (one price increase mid-history for most SKUs, reflecting inflation)
- Cost about 72–88% of trade price
- Shelf life
- Batches with expiry dates

**Customers (52)** across channels, using the names from plan §34 plus more:
- Modern trade (8): *Metro Mart*, *City Cash & Carry*, *Prime Retailers*, *Al-Noor Super Store*, *Al-Madina Hypermart*, *Gulshan Mega Mart*, *Capital Fresh Stores*, *Ravi Superstore*
- Wholesale (14): *Khan Brothers Traders*, *Jodia Bazar Wholesale Co.*, *Shah Alam Market Traders*, …
- Retail chains and stores (22)
- Sub-distributors (5)
- HORECA (3)

They span cities: Karachi, Hyderabad, Lahore, Faisalabad, Islamabad, Rawalpindi, Multan, Sialkot. Each has a mix of registered/unregistered and ATL/non-ATL status, credit limits (Rs 300k–8M), terms (7/15/30/45), a route, and a rep. **Each customer has a behavioural profile** (§3) that drives payments.

> Implementation note: run a "real brand" lint in the seed tests. Keep a denylist of well-known Pakistani retail and FMCG brand names (e.g. Imtiaz, Naheed, Al-Fatah, Hyperstar, Nestlé, Shan, National, Olpers, Lays, Kurkure, Tapal), and fail if any catalogue name contains them.

**People (~85 employees):** departments are Management, Sales (by branch, about 22 order bookers and 4 supervisors), Warehouse & Logistics (about 25 including drivers), Finance & Accounts (6), Procurement (3), HR & Admin (4), and IT (2). They have Pakistani names, CNIC format-valid fictional numbers, and salaries realistic for 2026: drivers Rs 45–60k, order bookers Rs 55–90k plus incentives, managers Rs 250–600k.

**Banks:** Meezan Bank (main current), HBL (collections), MCB (collections), Bank Alfalah (payroll).

## 3. Simulation engine (`packages/seed/sim`)

Day-by-day loop from `anchor − 18 months` to `anchor`. Business days are Mon–Sat, Sundays are off, and public holidays come from `calendar_events`.

| Process | Model |
|---|---|
| **Demand** | Each customer × SKU basket has a base weekly rate × channel factor × weekday factor × **seasonality**: Ramadan (sharbat ×3.0, dates ×4, cooking oil ×1.5, beverages ×1.3), Eid ul-Adha week (spices ×2), summer May–Aug (beverages ×1.6, ice-cream-adjacent), winter (tea whitener ×1.3), school season (snacks ×1.2). Plus a growth trend per category (Snacks +2%/month in the last 4 months for scenario 6) and noise (negative binomial) |
| **Order booking** | Reps visit route customers on route days, so orders are booked on those days. Quantities are rounded to cartons, and trade schemes are applied by the pricing engine |
| **Fulfillment** | Next-day dispatch from the customer's home warehouse. Short stock is split to another warehouse or backordered. FEFO batch picking. Invoices are auto-created on dispatch and approved the same day. FBR status is `simulated` with a SIM IRN |
| **Payments** | Customer behaviour profiles: `prompt` (pays at 0.6–1.0 × terms), `normal` (1.0–1.4 × terms), `slow` (1.5–2.5 × terms), `deteriorating` (normal turning slow over the last 90 days), `risky` (bounces 8% of cheques). Payment method mix by channel: modern trade uses bank transfer; wholesale uses PDCs and cheques; retail uses cash with salesmen and deposits within 1–2 days |
| **Replenishment** | Simulated buyer logic: weekly review, reorder to target cover with supplier lead time (mean ± variability per supplier; *Indus Beverages* 8±2 days). POs go through approval policies. GRNs arrive at lead time with occasional short deliveries (3%) and rejects (1%). Bills arrive 0–10 days after GRN. Payments follow supplier terms, with occasional delays when cash is tight |
| **Prices** | MRP increases at historical-plausible points; supplier cost increases of 3–8% once or twice over 18 months per principal. Price lists are updated in response |
| **Returns** | 0.8% of volume as market returns (60% expired, 25% damaged, 15% resellable). Principal claims are filed monthly for 80% of claimable value (the rest feeds the "unfiled claims" insight) |
| **Stock counts** | Quarterly full counts, plus weekly cycle counts on A-class SKUs. Normal variance noise is ±0.3% |
| **Expenses** | Monthly rent (5 sites), electricity (seasonal: summer high), fuel and vehicle running (proportional to dispatch volume), freight, repairs, telecom, entertainment, bank charges. Employee expense claims with OCR receipts (about 60/month) |
| **Payroll** | Monthly on the 1st: salaries, WHT, EOBI, paid from the payroll bank |
| **Period close** | All FY 2025-26 periods closed plus a year-end closing entry. FY 2026-27 P01–P03 soft-closed, P04 open |
| **Leads & activities** | About 30 leads in various stages, plus visit, call, and WhatsApp activity logs |

**Performance approach:**
- Generate all rows in memory per entity type using domain functions (pure).
- Bulk insert in FK order with `COPY FROM STDIN` (via `pg-copy-streams`) as the `erp_owner` role, inside one transaction per org, with deferred constraints.
- Then refresh the materialized views and run the integrity checks.
- Expected volume per org: ~9k sales orders, ~9k invoices, ~110k invoice lines, ~1.1k POs, ~250k stock ledger rows, ~400k JE lines.

## 4. Injected scenarios (last 30–60 days, exact and testable)

Scenarios are applied **after** the base simulation as targeted adjustments, also through domain functions. Each has an **acceptance test** that asserts the corresponding detector fires.

| # | Scenario | Seeded facts | Detector / surface | Acceptance |
|---|---|---|---|---|
| 1 | **Low stock** | NestFresh Water 1L @ KHI-DC1: available ≈184, last-30-day demand up 17% (3 large Metro Mart / City C&C orders), open PO none, lead time 8±2 d. Also Crunchos Masala Chips 50g @ LHE-DC (snacks trend) and a **season-driven third SKU chosen by anchor month** from `calendar_events`: Crescent Tea Whitener 200g @ ISB-DC for Oct–Jan (winter uplift), Gulnar Rose Sharbat 800ml @ KHI-DC1 when Ramadan falls within 60 days, a summer beverage for Apr–Aug | Replenishment | 3 recommendations with stockout before lead time + safety; NestFresh reorder qty within ±10% of 620 |
| 2 | **Supplier price anomaly** | Indus Beverages' latest bill: 3 SKUs billed 6.9% above PO and above the 90-day median. PO total Rs 1,720,000, bill Rs 1,840,000 (Δ Rs 120,000). Bill status `exception`, approval pending with Ayesha | 3-way match + price anomaly insight | Match exceptions = 3 PRICE_VARIANCE + PRICE_INCREASE_VS_HISTORY; insight mentions Rs 120,000 |
| 3 | **Overdue customer** | Khan Brothers Traders (Hyderabad, wholesale): outstanding Rs 2.84M, oldest invoice 67 days overdue, 2 bounced cheques in 120 days, days-to-pay trend 21 → 49. Plus Al-Noor Super Store (Rs 1.1M, 38 days) and City Cash & Carry (Rs 2.3M, 44 days, but historically reliable) | Collection risk, customer health | Khan Brothers risk band High; overview brief headline is collection risk |
| 4 | **Duplicate invoice** | Lucky Foods bills `LF-23817` and `LF-23B17` (OCR-style confusion), same amount Rs 486,250, dates 3 days apart; the second is in `pending_match` | Duplicate detector + match | DUPLICATE_BILL exception raised on the second; anomaly insight |
| 5 | **Cash-flow warning** | Week 3 from the anchor: Sunridge Edible Oils payment Rs 7.8M due + payroll Rs 9.6M on the 1st + Indus bill. Expected collections are lower because of scenario 3 customers. Min cash threshold Rs 5M | Cash projection | Projected week-3 balance < threshold; insight lists drivers with amounts |
| 6 | **Strong sales trend** | Snacks category +23% (8 weeks vs prior 8), led by modern trade in Karachi and Lahore; margin stable | Sales trend | Insight "Snacks growing" with the top 5 SKUs |
| 7 | **Warehouse discrepancy** | LHE-DC Personal Care, aisle C: negative variances in 4 of the last 6 cycle counts (total −Rs 312k), concentrated on high-value small SKUs, same counting shift | Discrepancy detector | Insight names the location and category, with the count records as evidence |
| + | **Profit dip** | Current month gross margin −2.1 pp vs last month: Beverages mix shift + the Indus PPV + scheme cost. Net profit down despite revenue +8.4% | Profit variance | "Why is profit down?" waterfall attributes ≥80% to these drivers |
| + | **Unfiled claims** | Shahi Foods scheme free goods worth Rs 640k unclaimed for 45+ days | Claims detector | Recommendation present |
| + | **Journal anomaly** | Manual JE Rs 499,000 to Misc Expenses posted Sunday 23:10 by an accounts officer (just under the Rs 500k approval threshold) | Journal anomaly | Flagged in Finance anomalies |
| + | **Approval inbox** | 5 pending: PO Rs 1.8M (Owner), expense Rs 42,000 (Finance), AI replenishment recommendation, supplier bill variance (scenario 2), credit limit increase (Prime Retailers 4M → 6M) | Approvals | Inbox count 5 for Owner/Finance as per plan §36 |

## 5. Demo users (development credentials, documented only in README "Local development")

| Persona | Email | Role |
|---|---|---|
| Tariq Mehmood | owner@meridian.demo | Owner |
| Zainab Hussain | admin@meridian.demo | Admin |
| Ayesha Siddiqui | finance@meridian.demo | Finance Manager |
| Bilal Ahmed | sales.manager@meridian.demo | Sales Manager |
| Usman Ghani | rep.karachi@meridian.demo | Sales Representative |
| Imran Qureshi | warehouse.khi@meridian.demo | Warehouse Manager (branch: Karachi) |
| Hina Rauf | procurement@meridian.demo | Procurement Manager |
| Kashif Raza | employee@meridian.demo | Employee |

The dev password is `DEMO_USER_PASSWORD` from `.env` (no default in code). In a **public demo**, passwords aren't used; persona login goes through sandboxes.

## 6. Public demo mode (visitor sandboxes)

```
Visitor → /demo → pick persona → POST /api/demo/session
   → claim a READY sandbox from pool (status ready → assigned, expires_at = now + 24h)
   → create session for persona user in that org → redirect /overview
worker: demo.sandbox.provision keeps pool ≥ DEMO_POOL_MIN (e.g. 5), anchored to today
worker: demo.sandbox.cleanup hourly deletes expired sandboxes (system role, cascades per org)
```

- **Isolation:** each visitor gets their own org, so mutations never collide. The persona switcher, a top-bar "Demo" pill, lets a visitor switch role *within the same sandbox* to experience the approval handoff (Rep creates order → Owner approves).
- **Reset:** Settings → Demo → "Reset my sandbox" swaps in a fresh pool sandbox.
- **Daily rotation:** sandboxes are provisioned per day with today's anchor. Yesterday's unclaimed pool is recycled.
- **Shared AI cache:** sandboxes provisioned on the same day from the same template version share data fingerprints until a visitor mutates data. Precomputed insights for the pool are therefore generated **once per day** (one LLM call per insight, not per visitor).
- **Simulated integrations everywhere** in demo orgs, enforced in the connector layer: FBR shows "Simulated", and email and WhatsApp land in the in-app outbox.
- **Guided tour** (optional, dismissible): a 9-step overlay following the demo story (doc 02 §4), with "Next" buttons that deep-link. It never automates clicks.
- **"What's simulated?"** help panel: an honest list of simulated integrations and the AI model in use.
- **Abuse limits:** sandbox claims per IP per day (10), AI question budget per session, upload cap, optional Turnstile.

## 7. Seed verification (part of `pnpm db:seed` and CI)

1. `erp_check_trial_balance()`: Σ debit = Σ credit for every period.
2. `erp_check_ar_subledger()`: Σ open invoice balances − unallocated receipts = GL 1200 balance.
3. `erp_check_ap_subledger()`: the same for 2010.
4. `erp_check_stock_vs_gl()`: Σ `inventory_balances.value` = GL 1300 (+1320 transit).
5. `erp_check_balances_vs_ledger()`: balances = Σ ledger per product × warehouse × location × batch.
6. `erp_verify_audit_chain()` for the org.
7. Scenario acceptance assertions (§4).
8. Snapshot of headline KPIs for the fixed anchor date `2026-10-05`, as a regression guard on simulation changes.
