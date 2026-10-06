# 02: Product Scope, Personas & Demo Story

## 1. Personas (seeded demo users)

| Persona | Role | What they need in the first 60 seconds |
|---|---|---|
| **Tariq Mehmood**, CEO | Owner | "Are we making money, are we going to run out of cash, what needs my decision?" Shows the Overview, AI Business Brief, and Approvals |
| **Ayesha Siddiqui**, Finance Manager | Finance Manager | Receivables risk, supplier bill variances, cash projection, period close. Shows Finance, 3-way match, and reconciliation |
| **Bilal Ahmed**, Head of Sales | Sales Manager | Rep performance, overdue customers, credit overrides |
| **Usman Ghani**, Order Booker (Karachi South route) | Sales Representative | His own customers, quick order entry, stock availability, credit status. Mobile-friendly |
| **Imran Qureshi**, Warehouse Manager (Karachi DC) | Warehouse Manager | Pick lists, dispatch, receipts, cycle counts, discrepancies. Mobile-friendly |
| **Hina Rauf**, Procurement Lead | Procurement Manager | Replenishment recommendations, POs, supplier price changes |
| **Zainab Hussain**, IT/Admin | Admin | Users, roles, integrations, audit log, system health |
| **Kashif Raza**, Accounts Officer | Employee | Expense claims, leave, own tasks |

## 2. Scope by tier (depth over breadth)

### Tier 1: must be excellent (built end to end, fully tested)

| Area | In scope | Explicitly not in v1 |
|---|---|---|
| **Overview** | Financial health from the **GL**, operations KPIs, AI Business Brief, recommended actions, cash runway chart | Customizable widget grid |
| **Sales** | Leads (light), quotations, sales orders, credit check, reservations, pick → challan → dispatch → delivery, invoices, credit notes, sales returns, payments with allocation, PDC lifecycle, routes | CPQ, commission engine |
| **Customers** | Full master, contacts, addresses, tax identity (NTN/STRN/CNIC/ATL), credit limit/terms, health score, statement of account (PDF) | Customer portal |
| **Inventory** | Products, UoM conversions, categories/brands, batches/expiry (FEFO), stock ledger, balances, reservations, transfers, adjustments, cycle counts, damaged/quarantine, valuation (moving average) | Serial numbers (modeled as a column only), landed cost allocation (v2) |
| **Warehouses** | 5 warehouses, locations (zone/aisle/bin), warehouse-scoped views, mobile receive/pick/count | Wave picking, slotting optimization |
| **Purchasing** | Purchase requests, RFQ → supplier quotes (comparison), POs, goods receipts (GRN), supplier bills, 3-way match, supplier payments, principal claims | Import/LC workflows |
| **Finance** | CoA, journals (manual + automatic), GL, AR/AP subledgers, bank accounts, bank statement import + reconciliation, tax, fiscal periods + close, P&L, Balance Sheet, Cash Flow (indirect), Trial Balance | Multi-currency revaluation (currency column exists, PKR only), fixed asset register, budgeting |
| **AI Command Center** | Conversations, tools, evidence panel, proposals, NL query | Voice |
| **Approvals** | Unified inbox, policies, multi-step, mobile | Delegation/out-of-office (v2) |
| **Audit log** | Append-only, hash-chained, filterable, entity timeline | SIEM export |
| **Auth/RBAC** | Email+password, sessions, 8 system roles, scoped permissions (all/branch/own), custom roles editor | SSO/SAML |

### Tier 2: solid and functional

Reports (15 standard reports with drill-down, saved views, export) · Expenses with OCR and policy checks · Suppliers (scorecard) · Employees (records, leave, attendance summary, payroll overview with GL posting) · Workflow automations (WHEN/IF/THEN with a limited, typed action catalogue).

### Tier 3: thin but real (no fake buttons)

Integrations:
- FBR DI: simulated, sandbox, or live
- Email: SMTP, or simulated with an in-app mail outbox
- WhatsApp: simulated outbox
- Bank statement import (CSV)
- Outgoing webhooks: real and signed
- ATL check: simulated

Anything not built is **not shown**. No "Coming soon" tiles anywhere.

### Global capabilities

Command palette (⌘K), global search (entities plus natural language), notifications (digested), tasks, favorites/recents, keyboard shortcuts, light/dark themes, responsive layout, problem+json errors with reference IDs.

## 3. Showcase moments (what makes a visitor say "this is real")

1. **The Brief cites its sources.** Click any number in the AI Business Brief and it opens the ledger lines or invoices behind it.
2. **Confirming an order checks things.** Confirming a sales order shows a live checklist: stock ✓, credit ✗ (exposure PKR 2.9M of a 2.5M limit) → *Request credit override* → it appears in the Owner's approval inbox.
3. **Supplier bill upload.** Drop a supplier invoice PDF. It is extracted, matched to the PO and GRN, and shows "6.9% price variance on 3 products". Approve with a reason, and the PPV journal posts. The audit entry reads "Ayesha approved AI-extracted bill coding".
4. **Ask "Why is profit down this month?"** The answer is a variance waterfall (volume / price / mix / COGS / opex) built from GL data, with the records attached.
5. **Replenishment → PO → cash flow.** Approving a recommendation creates a draft PO. After PO approval, the cash projection *visibly* updates with the new commitment.
6. **FBR status on every invoice.** IRN, QR, a 72-hour edit timer, and a "Simulated" badge in the demo.
7. **System Health page.** Trial balance balanced ✓, AR subledger = GL ✓, Stock ledger = GL inventory ✓, Audit chain verified ✓. This is the "trust" screen.

## 4. The demo story (plan.md §58), made concrete

Pre-condition: a fresh sandbox, logged in as Tariq (Owner), with today's date anchoring all data.

| Step | Screen | What happens | Backed by |
|---|---|---|---|
| 1 | Overview | KPIs for MTD vs last month. AI Brief at top: *"Cash collection risk increased: overdue >30 days rose 38% to Rs 9.4M; 4 customers account for 71%."* | GL + AR aging materialized views; `collection_risk` detector; `executive_summary_v1` |
| 2 | Brief → Insight drawer | Why, data sources, confidence (High: 214 invoices, 18 months history), timestamp, model and prompt version | `ai_insights` row with evidence links |
| 3 | Investigate | Opens the Command Center with context. Overdue customers table: Khan Brothers Traders (Rs 2.84M, 67 days, 2 bounced cheques) and others | `search_receivables` tool → AR query service |
| 4 | "What should I do?" | Ranked actions: put Khan Brothers on credit hold (proposal), call Al-Noor with a draft WhatsApp message (proposal), offer settlement terms to City Cash & Carry. Each comes with its reasoning | `get_customer_payment_history`, `customer_risk` scores; proposals → `ai_proposed_actions` |
| 5 | "What inventory is at risk?" | Three SKUs: NestFresh Water 1L (KHI), Crunchos Masala Chips 50g (LHE), Crescent Tea Whitener 200g (ISB, winter uplift; the third SKU varies with the season, see doc 09 §4). All brand names are fictional; see doc 09 §2. Days of cover vs lead time | `get_replenishment_recommendations` (forecast engine) |
| 6 | Recommendation detail | Available 184, forecast 30d 740, lead time 8d, safety stock 9 days, recommended 624 units (26 CTN × 24, rounded up from 618 to the carton multiple). Why: demand +17% over 30 days, 3 large modern-trade orders | Forecast engine explanation object |
| 7 | "Create purchase order" | Draft PO for Indus Beverages (preferred supplier), price from the last agreed price list, ETA computed. Shown as a proposal card → Confirm | `propose_purchase_order` → `CreatePurchaseOrder` command |
| 8 | Approve | Policy: PO > Rs 1M needs Owner approval. Tariq approves from the inbox (or on mobile) | Approval policy engine; audit with `ai_proposal_id` |
| 9 | Ripple | PO list shows Approved. Product shows *Incoming 620*. Cash projection week 2 drops by the PO value. Supplier commitments increase. Notification to Hina | Domain events → projections; cash forecast recomputed via job; SSE notification |

**Target:** the full story in under 4 minutes, with no step depending on a free LLM being up. Steps 1–2 and 5–6 come from precomputed and deterministic data. Steps 3–4 and 7 call the LLM, and their deterministic paths are labeled when quota runs out.

## 5. Non-goals (to protect depth)

Manufacturing/MRP, POS, e-commerce sync, multi-currency accounting, consolidation across legal entities, a full payroll statutory engine, BI builder, mobile native apps, SSO, and a marketplace. The architecture leaves room for all of them (doc 03 §9), and none are built.
