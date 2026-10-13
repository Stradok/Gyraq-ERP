# Architecture review

## Summary
The codebase has one strong core (a deterministic command engine) wrapped in a persistence and tenancy model that was designed for a demo. For a multi-tenant SaaS the core can be kept; the persistence model, identity binding, money type and module boundaries must change.

## A. Strengths
- **Single write path.** Every mutation is a command through `HANDLERS` (`frontend/src/lib/engine/commands.ts`). That gives one place for validation, audit and permission checks and made the demo-to-backend move cheap (`backend/src/engine.ts` re-exports the same engine).
- **Determinism.** Ids derive from the command id (`core.ts` `newId`/`setIdScope`), so the browser and server produce identical results; verified by the "replayed N commands identically" engine test.
- **Double entry enforced twice**: in code (`core.ts` `postJE` throws if unbalanced) and in Postgres (constraint trigger `assert_entry_balanced`, append-only triggers).
- **Honest structured errors** (`core.ts` `fail()` → code/title/detail/recovery) shown consistently in the UI.

## B. Findings

### A-1 (Critical) History is recomputed by current code, not stored as facts — FIXED in R2
`backend/src/world.ts` `boot()` rebuilds state with `buildDB(anchor)` + `replay(world, commands)` on every start. The `journal_entries`/`records` rows in Postgres are only a projection written at the time of each command. If tax, valuation, numbering or validation rules change in `lib/engine/*`, the next boot re-executes old commands under the new rules: invoice totals, document numbers and journal lines in memory can silently differ from what was stored and shown to the customer. `replay` merely `console.warn`s on rejected commands. There is no handler versioning, no snapshot, no check that replay equals the stored ledger.
*Impact:* unacceptable for an accounting system. *Fix direction:* make Postgres tables the source of truth (state-based persistence) or snapshot + versioned handlers with a reconciliation check at boot. **Needs your decision (see roadmap R2).**

### A-2 (Critical) The database is an in-memory object graph (`DB` in `lib/data/sim.ts`)
The engine reads and mutates arrays (`db.invoices`, `db.stock` Map…) directly. There is no repository layer; handlers, validation, queries and persistence knowledge are mixed. Consequences: one process only (state in memory, `world.ts`), O(total records) diff per command (`project.ts` `docs()` JSON-hashes every record: ~0.2 s/command measured), O(commands) boot, no row-level concurrency control, no horizontal scaling.

### A-3 (Critical for SaaS) No tenancy
No tenant id anywhere: `users` has no company, `records(kind,id)` is global, `world` is a singleton, `commands` has no tenant. Multi-tenant SaaS needs tenant-scoped keys on every table, a tenant context on every request, and per-tenant state loading. Today a "client" means a separate deployment (docker compose).

### A-4 (High) Money is floating point
`core.ts:15` `r2 = (n) => Math.round(n * 100) / 100`; all totals, tax, WHT, valuation use JS numbers (`engines.ts`, `purchasing.ts:72`). Postgres columns are `numeric(18,2)` but values enter as floats, and `pg.types.setTypeParser(1700, parseFloat)` (`backend/src/db.ts`) reads them back as floats. Rounding drift is possible on large sums; this violates the "exact decimal" requirement. Change affects financial calculations: **needs your approval**.

### A-5 (High) Business rules are scattered across layers
- Pricing/tax/credit logic lives in `lib/engines.ts` and is called by UI pages directly (`app/(app)/sales/orders/new/page.tsx` imports `creditCheck`, `docTotals`, `priceLine`).
- Tax rate literals: `0.18` hard-coded in `lib/engine/purchasing.ts:72` and `lib/engines.ts:16`, while `settings` holds only some rates. Document prefixes (`INV-`, `PO-`, `GRN-`, `DC-`…) are literals in `nextNo(...)` calls in `lib/engine/*`, not configurable.
- `lib/data/queries.ts` (≈650 lines) mixes analytics, forecasting, insights and AI-brief text; `insights()` contains demo-scripted narratives keyed to `db.scenario` (guarded with an early return for non-demo companies, but still demo code in the core path).

### A-6 (High) Module boundaries are file-level only
`sales.ts`, `purchasing.ts`, `inventory.ts`, `finance.ts`, `people.ts`, `masters.ts`, `setup.ts` all take the whole `DB` and touch each other's collections (e.g. `sales.ts` mutates `db.stock` cells and `db.journal`; `approvals.ts` calls `createPO` and `resolveBill`). There are no interfaces or events; a module cannot be removed or customised without editing others.

### A-7 (High) Identity is not bound to commands
Handlers accept actor-like ids from the payload (`people.ts` `submitLeave`/`submitExpense` take `employeeId`; `RecordPayment` takes `customerId` freely). The server derives `actor`/`role` from the token (`world.ts submit`) but never reconciles payload identity with the session. See security review S-3.

### A-8 (Medium) Client trusts itself for results
In remote mode the client runs the command, then the server independently runs it. If rules differ (different build versions) the server's result wins only via resync on error. There is no client/server version handshake; a stale cached app (service worker) can send commands built for an older engine. `public/sw.js` caches pages by URL with no version negotiation.

### A-9 (Medium) Frozen business date on the server
`backend/src/world.ts` stamps `date: world.today`, i.e. the anchor date the database was created on, forever. Aging, periods, due dates and "today" in queries never advance. Fine for a demo; wrong for production. Needs a real clock per command with the seed's date logic separated from live operation.

### A-10 (Medium) Two sources of truth for derived views
Analytics (`queries.ts`) recompute from in-memory arrays on every client; Postgres projection tables are write-only today (nothing reads them). Reporting at scale needs SQL read models or materialised views.

### A-11 (Low) Mixed rendering model
App pages are client components that read a global `getDB()` singleton; the shell now renders a static skeleton and builds data client-side (`shell.tsx`). Good for speed on the demo, but record pages still use Next route params via `useRouteId`, and there is no server data fetching layer for a real backend (no API client, no cache, no pagination).

## C. Target-fit assessment
| Requirement | Today | Gap |
|---|---|---|
| Multi-tenant SaaS | single company | tenant model, tenant-scoped storage and context |
| Per-client customisation | env `AI_EDITION`, `settings` row | feature flags, config-driven numbering/tax/currency, hook points |
| Module add/remove | none | module registry, interfaces, events |
| Horizontal scale | impossible (in-process state) | state-based persistence, stateless API |
| Auditability | good in design (immutable commands, ledger triggers) | A-1 recompute risk |
| Fast | demo fast; backend 0.2 s/command | diff-based projection, SQL reads |

## D. Recommended direction (detail in `refactor-roadmap.md`)
Keep the command engine as the application layer. Introduce a repository interface in front of `DB`, move to **state-based Postgres persistence with tenant-scoped tables**, make money exact (integer minor units or decimal library), then split modules behind interfaces and events. Do it in the strangler style: the demo keeps running on the in-memory repository while the Postgres repository is built behind the same interface.
