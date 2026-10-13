# Refactor roadmap

## Status (updated)
| Milestone | State |
|---|---|
| R0 safety net and quick security fixes | done (lint clean, CI fixed, AI routes use verified identity, CSV injection, hardened compose, lockout and auth events, structured logs) |
| R1 command permission registry | done (50 commands x 8 roles tested; rep scope fails closed) |
| R2 Postgres tables as source of truth | done (R2.1 to R2.6) |
| R3 exact money | done (`lib/money.ts`; see `r3-money-report.md`) |
| R4 multi-tenancy | not started (ADR 0003) |
| R5 module boundaries and events | not started; `touches.ts` and `permissions.ts` are the first pieces |
| R6 configuration and customisation | partly (settings as data); numbering, currency, templates, flags not started |
| R7 data in/out and onboarding | CSV import and opening balances done; PDF templates and real email sending not started |
| R8 operations | installer, HTTPS, backup commands documented; monitoring and automated backups not started |
| R9 performance | stream and static shell done; server-side pagination and read models not started |

---


Principles: keep the demo and the current backend deployable after every milestone; strangler pattern (new implementation behind an interface, switch when tests match); each milestone ends with typecheck, lint, tests and a browser check. **Gates** marked ⛔ need your explicit approval before work starts, as agreed.

## Milestone R0: Safety net and quick security fixes (low risk, ~1 week)
No schema, auth-model or financial changes.
1. Fix lint (54 problems) and add lint + the browser suites (`e2e*.mjs`) to CI with a Postgres + Docker job. Add a formatter. Files: `frontend/eslint.config.mjs`, `.github/workflows/*`.
2. **S-1** `app/api/chat/route.ts`: in remote mode derive the role from the verified token (call `/api/me`) and ignore `body.role`; require a token.
3. **S-8** neutralise CSV formula cells in `data-table.tsx`.
4. **S-7** compose defaults: bind Postgres to `127.0.0.1`, require `JWT_SECRET`/`DB_PASSWORD` (fail to start if default), restrictive default `CORS_ORIGIN`, document TLS via Caddy.
5. **S-6** trust `x-forwarded-for` only behind a configured proxy; per-account lockout counter in Postgres.
6. Structured logging (pino) with request ids; log auth events.
7. Add `docs/` ADRs for decisions below.
Verification: `pnpm test`, backend test, `tsc`, `lint`, build, e2e.

## Milestone R1: Command permission registry (⛔ changes authorization)
Default-deny registry: each of the 50 commands declares `{permission, scope: all|branch|own}` in one file shared by engine and API; API refuses undeclared commands (**S-2**). Bind payload identity to the session (**S-3**): `SubmitLeave/SubmitExpense` ignore `employeeId` unless the caller has HR rights; `rep`-scope checks for customer/order commands. Tests per command × role matrix (generated from the registry).
Needs: your approval of the permission table (I will propose it from `rbac.ts` and current behaviour).

## Milestone R2: State-based persistence behind a repository interface (⛔ schema + data integrity)
Fixes A-1/A-2/P-1/P-2/P-7.
1. Introduce `Repository` interfaces per aggregate (customers, products, orders, invoices, stock, journal…) in front of the `DB` object; first implementation `InMemoryRepository` wraps the existing `DB` so the demo is untouched.
2. Implement `PostgresRepository` with real tables and foreign keys (replacing the generic `records` JSON table for core documents), unit-of-work per command (one transaction, row-level writes, optimistic version column).
3. Replace boot-time replay with reading state from Postgres; keep `commands` as an immutable audit/outbox log, not as the source of truth. Add handler schema versions and a boot-time reconciliation (ledger totals vs stored journal).
4. Migration for existing databases: one-time import from the current command log + projection with a verification report.
Decision needed: confirm "Postgres tables are the source of truth" (I recommend this) versus event-sourcing with snapshots.

## Milestone R3: Exact money (⛔ financial calculations)
Choose representation (integer minor units, or decimal.js / big.js; recommend integer paisa for storage and a small `Money` value object for arithmetic). Replace `r2` and float arithmetic in `lib/engines.ts`, `lib/engine/*`, `queries.ts`; read `numeric` as strings. Golden tests: the 300 seeded invoices and the full engine suite must reproduce identical totals (tolerance 0) before and after, with a differences report for any rounding change you must approve (e.g. rounding per line vs per document).

## Milestone R4: Multi-tenancy (⛔ boundaries + schema)
`tenants` table; `tenant_id` on every table with composite keys and Postgres row-level security as defence in depth; a `TenantContext` that every repository call requires (no default); per-tenant sequences for document numbers; per-tenant settings and feature flags; tenant resolution from the token. Cross-tenant tests: every endpoint × two tenants. Decision needed: **shared schema with RLS** (recommended) vs schema-per-tenant vs database-per-tenant.

## Milestone R5: Module boundaries and events
Package structure `modules/{auth,tenancy,users,rbac,sales,purchasing,inventory,accounting,tax,hr,payroll,reporting,notifications,integrations,audit,settings}` with public service interfaces and a typed domain-event bus (`InvoicePosted`, `StockReceived`, …). Move cross-module calls (`approvals.ts → createPO`, `sales.ts → db.stock`) to interfaces/events. Enforce with a dependency-cruiser rule in CI (no cross-module imports of internals, no cycles). Separate `queries.ts` analytics into the reporting module reading read models.

## Milestone R6: Configuration and customisation
Settings schema per tenant (numbering patterns, tax rate tables with effective dates, currency, fiscal year, document templates), feature-flag store, plugin/hook points (before/after command hooks, custom fields JSON with schema). Remove literals (`0.18`, `INV-`, `Rs`). Localisation layer (formatters from tenant locale; message catalogs; Urdu).

## Milestone R7: Data in/out and onboarding
CSV/XLSX import with validation preview and rollback for customers, suppliers, products, opening stock, opening AR/AP; PDF invoice templates; real email sending (needs a provider: ⛔ new third-party service); onboarding wizard completion.

## Milestone R8: Operations
Backups with restore test, migration runner in deploy, blue/green or rolling deploy notes, health/readiness probes, metrics and alerts, log shipping, `docs/ops/*` (deploy, env, backup/restore, client onboarding), API documentation (OpenAPI) and API keys/webhooks, admin console for tenants/modules/flags.

## Milestone R9: Performance
Pagination/filter/search on the server, SQL read models and indexes (P-6), worker for background jobs (reports, notifications), SSE for live updates, client web worker or server-provided state (P-4).

## Suggested order and sizing
R0 (small) → R1 (small-medium) → R2 (large, the critical path) → R3 (medium) → R4 (large) → R5 (large, incremental) → R6/R7/R8/R9 in parallel by value. Until R2 and R3 are done, **do not onboard a paying client onto the backend**; the public demo is unaffected.

## Decisions I need from you
1. Source of truth: Postgres state tables (recommended) vs event-sourcing with snapshots (A-1).
2. Money representation and rounding rule (R3).
3. Tenancy model (R4): shared schema + RLS (recommended).
4. Permission table approval (R1), including whether `rep` is restricted to own customers server-side.
5. Whether to keep Pakistan-only tax logic in core or move it into a `tax` module with a Pakistan pack (recommended: module with country packs).
6. Any new service you accept: a mail provider, error monitoring, object storage.
7. Whether the backend may start using the real clock for business dates (A-9), which changes how the demo seed and live data coexist.
