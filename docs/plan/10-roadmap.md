# 10: Delivery Roadmap

**Strategy:** build the *correctness core* first (ledger, stock, tenancy, audit), then the business flows on top, then AI on top of real data. Every milestone ends with green tests **and** a demo-able flow. Sizes assume one senior full-stack engineer working with an AI coding assistant; two engineers can run M5/M6 in parallel with M7–M9.

| Milestone | Size | Cumulative |
|---|---|---|
| M0 Foundations | 1.5 wk | 1.5 |
| M1 Ledger, catalog & stock core | 2 wk | 3.5 |
| M2 Order-to-cash | 2.5 wk | 6 |
| M3 Procure-to-pay | 2 wk | 8 |
| M4 Simulation seed, dashboard & reports | 2 wk | 10 |
| M5 AI platform | 2 wk | 12 |
| M6 AI showcase features | 2.5 wk | 14.5 |
| M7 Approvals center, workflow, notifications | 1.5 wk | 16 |
| M8 Expenses & HR light | 1 wk | 17 |
| M9 Integrations (FBR, email, WhatsApp-sim, bank, webhooks) | 1 wk | 18 |
| M10 Demo mode, hardening, performance, launch | 2 wk | 20 |

---

## M0: Foundations

**Build**
- Monorepo: pnpm workspaces, Turborepo, TS strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), ESLint with boundary rules, Prettier, `.nvmrc`, Renovate, and the GitHub Actions CI pipeline: typecheck → lint → unit → integration (Postgres service) → build.
- `docker-compose.yml` (postgres:18 with pg_stat_statements, mailpit), a `Dockerfile` with web and worker targets, and `.env.example` validated by `core/env.ts`.
- `@erp/core`: Money/Decimal, Quantity, Result, DomainError hierarchy, RequestContext (ALS), Clock (with org time anchor), ids, formatters (PKR, dates, fiscal labels).
- `@erp/db`: Drizzle setup with the identity and organization tables, migration runner, **roles (owner/app/system), RLS helper and policies, `withTenant`**, audit table + hash-chain trigger, outbox, idempotency, and document sequences.
- Better Auth integration covering login, logout, sessions, and the org switch. Memberships and roles are our own, along with the permission catalogue, `authorize()`, and `scopeFilter()`.
- `defineRoute()` with contract validation, auth, permission, rate limit, idempotency, problem+json, and the request ID. OpenAPI generation.
- `@erp/jobs` (pg-boss adapter), the worker app skeleton, and the outbox relay.
- `@erp/ui`: tokens, theme, AppShell (sidebar, top bar), command palette shell, DataTable v1 (server mode, columns, sort, filter chips, pagination, drawer), form kit, ProblemAlert, toasts.
- Logging (pino), OTel bootstrap, `/api/health`.

**Exit criteria**
- `pnpm dev` boots web and worker against Compose. Login works with seeded minimal users.
- **The tenant isolation suite passes** (two orgs, cross-access denied), and the RLS enabled/forced test passes for all tables.
- The audit chain verifies. An outbox event produced in a tx is delivered once to a test subscriber, even when the worker is restarted mid-way.
- A sample `GET /api/v1/settings/users` list renders in DataTable with server sorting and filtering.

## M1: Ledger, catalog & stock core

**Build**
- Finance: accounts, fiscal years and periods, journal engine + posting rules registry, DB triggers (balanced, immutable, closed period, control accounts), reversal, manual JE UI with live balance indicator, GL explorer, trial balance.
- Tax module: tax codes and rules (effective-dated), `computeTaxes`, settings screens.
- Catalog: products, UoMs, categories, brands, price lists, customer prices, retail price history, trade schemes, pricing engine.
- Inventory: warehouses, locations, batches, **stock ledger + balances + moving-average costing**, adjustments (with JE), transfers (with transit), stock counts (blind count, variance review, post), stock position view, stock ledger explorer.
- Minimal fixture seed: 1 org, a handful of products, 2 warehouses (replaced in M4).

**Exit criteria**
- Unit: journal invariants (property-based with fast-check: random postings always balance or reject), costing sequences, UoM conversions, tax fixture table (all category × registration × ATL combos), pricing and scheme cases.
- Integration: adjustment → ledger rows + balances + JE in one tx. A failure mid-way rolls back everything. Concurrent reservations on the same SKU never oversell (parallel test).
- An attempt to post into a closed period is rejected with a friendly problem+json.

## M2: Order-to-cash (Definition of Done chain #1)

**Build**
- Customers (master, contacts, addresses, tax identity, credit, routes, reps), leads (light), activities.
- Quotes → sales order editor (line-item grid, pricing trace, tax breakdown, stock popover) → **confirm** (price, tax, credit check, reserve, number, audit, event) → credit override request (approval record created; inbox UI comes in M7, with a minimal approve endpoint now).
- Pick lists with FEFO → shipments (Delivery Challan, gate pass) → COGS JE → invoice auto-draft → approve (gapless number, AR JE) → FBR connector in `simulated` mode (SIM IRN + QR on the PDF).
- Payments: bank, cash-with-salesman + deposit, cheque/PDC lifecycle (deposit, clear, bounce), allocations, unallocated credit. Credit notes and sales returns (resellable, damaged, expired).
- Customer detail page (full pattern), customer statement PDF, invoice PDF (A4, with QR), AR aging.
- Role scoping: a sales rep sees only their own customers and orders.

**Exit criteria**
- **E2E (Playwright):** login → create customer → quotation → convert to order → confirm (reserves) → pick → dispatch → invoice approve → record PDC → clear → invoice Paid. The GL shows the expected entries and the AR subledger equals GL 1200.
- Bounce flow re-opens the invoice and emits `ChequeBounced`.
- Credit block flow: confirming over the limit returns a BLOCK with an override request created.

## M3: Procure-to-pay (Definition of Done chain #2)

**Build**
- Suppliers (master, contacts, bank accounts, product codes), purchase requests, RFQs + quote comparison, POs (approval policy: minimal approve endpoint), GRN (batches, expiry, rejects, location putaway) → stock + GRNI JE.
- Supplier bills (manual entry first), **3-way match engine** + exceptions UI, bill posting (GRNI, input tax, 236G, PPV), supplier payments, principal claims.
- Supplier detail (spend, payable, lead time, reliability, price history).
- AP aging.

**Exit criteria**
- **E2E:** PO → approve → GRN (partial) → GRN (rest) → bill with a price variance → exception → approve with PPV → pay. The GL is correct, and AP subledger equals GL 2010. Stock value equals GL 1300.
- Unit: the match engine fixture suite covering every exception type, duplicates (exact + fuzzy), and tolerances.

## M4: Simulation seed, dashboard & reports

**Build**
- `packages/seed`: catalogues (doc 09 §2), simulation engine (§3), COPY bulk loader, scenario injectors (§4), verifier, brand denylist test. Wire up `pnpm db:seed` and `pnpm demo:reset`.
- Materialized views (doc 04 §5) + refresh job.
- **Executive Overview** with GL-based KPIs and period compare, operations KPIs, AR aging chart, cash position. The AI Brief slot shows the deterministic summary until M6.
- Finance statements: P&L, Balance Sheet, Cash Flow (indirect), Trial Balance, with drill-down (statement line → accounts → JE lines → source doc).
- Report registry + 15 standard reports (plan §16) with filters, date ranges (FY presets), grouping, sorting, saved views, CSV/XLSX export (job for large), drill-down.
- Global search (search_documents projection + palette record results + preview card).
- Period close checklist screen. Seed closes FY 2025-26.

**Exit criteria**
- Seed ≤ 30 s locally. All integrity checks pass. Scenario acceptance tests pass (data-level; the detectors arrive in M6).
- Overview loads in under 1.5 s (p75, warm) on seeded data. Every KPI drills down to records.
- The headline KPI snapshot test for anchor `2026-10-05` is stable.

## M5: AI platform

**Build**
- `packages/ai`: provider interface + OpenRouter adapter (AI SDK inside), Anthropic and Gemini adapters (fixture-tested), router with tiers, fallback, and model health, budgets and counters, response cache, dedupe, tracing tables, prompt registry with hash check.
- Tool registry + executor (permission, tenant, validation, limits, logging) + ~20 read tools + propose tools + the proposal confirm endpoint.
- Controlled query layer: Query Catalogue (shared with DataTable filters), deterministic pre-parser, `nl_query_v1`, interpreted chips in the palette and lists.
- Agent loop with streaming (SSE), AnswerEnvelope + **grounding pass**, injection defences.
- **AI Command Center UI:** history, conversation with tool trace, context panel, proposal cards, prompt starters per role, and the "Details" provenance view.
- Settings → AI: models, health, budgets, usage.
- Eval harness with recorded fixtures.

**Exit criteria**
- Evals (recorded): NL-query intent accuracy ≥ 90% on the golden set; 100% of Command Center answers pass grounding (no unverified numbers); `insufficient_data` is returned for the designed cases; injection cases cause no proposal and no instruction following.
- With the provider disabled (no key), every AI surface degrades to a labeled deterministic or "unavailable" state, and nothing crashes.
- A sales rep asking about another rep's customer gets no data (permission-scoped tools).

## M6: AI showcase features

**Build**
- `packages/analytics` detectors: forecast + replenishment (with backtest MAPE), customer risk, supplier price anomaly, duplicates, expense anomaly, journal anomaly, cash projection (13-week), discrepancy, sales trend, profit variance, unfiled claims.
- Insight pipeline + **AI Business Brief** + InsightCard and InsightDrawer (why, sources, confidence, timestamp, generator, approve/dismiss/investigate) + dismissal suppression.
- Replenishment queue → adjust quantity → `propose_purchase_order` → PO.
- Customer health panel, supplier price alerts, cash-flow forecast page (assumptions table, threshold band, event markers).
- **Supplier bill extraction:** upload → extract → review UI → bill → match. Sample PDFs generator. Receipt extraction (used in M8).
- Bank reconciliation workspace with rules, scoring, and AI-assisted suggestions.
- "Why is profit down?" profit variance waterfall answer.

**Exit criteria**
- All 7 scenarios (+ extras) are detected by the detectors on fresh seeds (acceptance tests).
- The **demo story (doc 02 §4) runs end to end**. Step 9's ripple is verified by an E2E test: approving the PO updates incoming qty, the cash projection, and supplier commitments.
- Extraction eval: ≥ 95% field accuracy on generated sample PDFs with the configured vision model (live eval). Arithmetic validators catch every seeded inconsistency.

## M7: Approvals center, workflow engine, notifications

**Build**
- Approval policies UI, multi-step approvals, segregation of duties, stale detection, executors for all subject types, the **unified inbox** (desktop + mobile), and bulk approve for low-value items.
- Workflow rules: rule builder (WHEN/IF/THEN over the typed fact registry), action catalogue, runs log, test rule, the 4 seeded rules.
- Notifications: rules, dedupe keys, digests, preferences, SSE live updates, in-app center. Tasks list.

**Exit criteria**
- E2E: the rep's order is blocked on credit → override request → Sales Manager approves on a mobile viewport → the order is confirmed. Every step is audited with the approval ID.
- No duplicate notifications for repeated low-stock events within a digest window (test).

## M8: Expenses & HR light

**Build**
- Expense submission (mobile camera), receipt extraction, policy checks, duplicate detection, Employee → Manager → Finance approvals, reimbursement JE + payment.
- Employees directory/detail with salary masking, departments, leave requests + approvals + balances, attendance summaries, payroll overview (run → approve → post JE → pay).

**Exit criteria**
- An expense flows end to end into the GL. An employee persona can see only their own data. A payroll run posts the balanced JE.

## M9: Integrations

**Build**
- Integration framework: connector interface, modes, encrypted config, logs, mode badges.
- **FBR Digital Invoicing:** `simulated` (default) and `sandbox` modes with the real payload mapper, retries, 72-hour window UI, credit/debit-note linkage, and a daily reconciliation report. `live` is behind config.
- Email (SMTP or simulated outbox), WhatsApp (simulated outbox, with templates for collection messages), bank CSV templates, outgoing webhooks (HMAC, retries, delivery log), ATL check (simulated).

**Exit criteria**
- The FBR payload mapper passes fixture tests for standard, Third Schedule, unregistered with further tax, exempt, and credit-note scenarios. The sandbox run is documented (if a token is available).
- Demo orgs cannot trigger real outbound sends. This is tested at the connector layer.

## M10: Demo mode, hardening, launch

**Build**
- Sandbox pool provisioning and cleanup, persona picker `/demo`, in-sandbox persona switcher, reset, guided tour, "What's simulated?" panel, abuse limits.
- **Performance pass:** query plans for top 20 endpoints, indexes, keyset pagination everywhere large, virtualized tables, RSC streaming with suspense, bundle analysis (lazy-load charts, AI, PDF viewer), image optimisation.
- **Security pass:** headers and CSP, upload hardening, rate limits, dependency audit, a `/security-review` of the codebase, a threat model walkthrough (doc 07 §6).
- **Accessibility pass:** axe in Playwright, keyboard-only walkthrough of the demo story.
- Docs: README (setup, scripts, architecture, demo credentials for dev), `/developers` API reference, ADRs.
- Deployment: VPS + Caddy + Compose, backups (nightly `pg_dump` to object storage), uptime monitor.

**Exit criteria (= product Definition of Done)**
- Both DoD chains and the AI chain (plan §61) pass in E2E on a fresh sandbox.
- System Health shows all green on a 7-day-old sandbox after mixed visitor activity (soak test script).
- Lighthouse ≥ 90 (performance and accessibility) on Overview and Invoices. p75 API latency < 300 ms for lists.
- The final quality-bar review (plan §62) with an actual distribution business owner or accountant, with feedback triaged.

---

## Work breakdown conventions

- **One PR = one vertical slice:** contract → domain → repo → service → route → UI → tests. Domain and engine code is test-first (TDD).
- **ADRs** for any deviation from this pack (`docs/adr/NNNN-title.md`).
- **Feature flags** (org settings) for anything half-built. No placeholder pages are ever routed.
- A **"definition of ready"** for a screen: its contract, permission, `allowedActions`, empty/error/loading states, and audit messages are defined before UI work starts.
