# R2 design: Postgres tables become the source of truth

Status: **proposal, needs your approval before any schema change.** Implements ADR 0001 and 0007. Fixes audit findings A-1 (history recomputed on boot), A-2 (in-memory object graph), A-9 (frozen date), P-1 (full-state diff per command), P-2 (boot and bootstrap grow with history).

## 1. The problem in one paragraph
Today `backend/src/world.ts boot()` rebuilds state with `buildDB(anchor)` plus `replay()` of every stored command, and `project.ts` writes a JSON copy of what changed. Postgres is a mirror of the in-memory world, not its source. A rule change in `frontend/src/lib/engine/*` silently changes what old commands produce at the next restart, while the stored ledger rows say something else. Each command also hashes every record in the company (~0.2 s).

## 2. Recommended approach: tables first, engine unchanged
The engine (50 commands, ~1,400 lines) keeps operating on the in-memory `DB` object. What changes is where that object comes from and how changes are saved:

| | Today | R2 |
|---|---|---|
| Boot | seed + replay of all commands | **read the tables** (hydrate `DB`) |
| After a command | hash all records, upsert JSON copies | **write only the collections that command touches**, in the same transaction |
| Command log | source of truth | immutable audit/outbox log, stamped with `engine_version` |
| Client bootstrap | whole command log | **state snapshot** + `seq`; later changes by `commands?since` |
| Business date | frozen anchor | real server clock (Asia/Karachi) |

Why not rewrite every handler against repositories now: that is the right end state (milestone R5, module by module) but it is a rewrite of the domain core and would block everything else for weeks. This route removes the integrity risk and the performance problem first, and every later module split can replace "hydrate everything" with "load the aggregate" one module at a time.

## 3. Schema (new migration `003_state_tables.sql`, additive)
Typed columns for what is queried, filtered or constrained; the document body (lines, allocations, nested arrays) stays as `jsonb` inside its aggregate. Every table has `id text primary key`, `version int not null default 1`, `updated_at timestamptz`. (`tenant_id` is added in R4 in one migration across all of them.)

| Table | Typed columns (besides id/version) | Notes |
|---|---|---|
| `warehouses` | code unique, name, city, branch | |
| `suppliers` | code, name, kind, city, terms_days | |
| `products` | sku unique, name, category, supplier_id → suppliers, cost, price, mrp, tax_category | money columns `numeric(18,2)` until R3 |
| `customers` | code unique, name, city, rep_id, status, credit_limit, warehouse_id → warehouses | |
| `employees` | code unique, name, department, manager_id, status | |
| `quotes`, `orders`, `shipments` | number unique, customer_id → customers, status, doc_date, total | lines in `data` |
| `invoices`, `credit_notes` | number unique, customer_id, doc_date, due_date, total, paid, status | indexed on (customer_id, status) |
| `payments` | number, customer_id, method, pay_date, amount, status | allocations in `data` |
| `purchase_orders`, `goods_receipts`, `supplier_bills`, `supplier_payments`, `claims` | number unique, supplier_id, status, doc_date, total | |
| `stock_counts`, `transfers` | number, warehouse_id, status | |
| `expenses`, `leaves`, `payroll_runs` | employee_id / month, status | |
| `bank_txns` | txn_date, amount, status | |
| `approvals` | type, status, ref, requested_by | index (status, type) |
| `notifications`, `leads`, `rules`, `outbox` | status/kind columns | |
| `stock_levels` (exists) | add `version` | |
| `settings`, `company`, `period_status` | one row each (`key`, jsonb) | |
| `doc_sequences` | kind, next_value | replaces `nextNo()` scans; transactional |
| `journal_*`, `accounts`, `audit_log`, `commands`, `users`, `auth_events` | **exist, unchanged** | `commands` gains `engine_version text` |

Foreign keys are real, so the database refuses orphans. Existing generic `records` becomes a deprecated mirror and is dropped after verification (R2.6).

## 4. Writing only what changed (no handler rewrite)
`frontend/src/lib/engine/permissions.ts` is joined by a **touch map**: for each command, the collections it may mutate (for example `RecordPayment: [payments, invoices, journal, audit, notifications, approvals, outbox]`). After executing, the projector fingerprints only those collections, not all 28. Safety net: a test runs every engine scenario with a full-state diff and fails if a command changes a collection missing from its touch map, so the map cannot drift.
Measured effect target: command p95 under 100 ms at today's seed size (currently ~210 ms), and independent of unrelated collections' size.

## 5. Boot and integrity
1. Hydrate `DB` from tables (target < 3 s at seed size, no replay).
2. **Reconciliation check at boot and on `GET /api/health/integrity` (owner/admin):** trial balance = 0; AR sub-ledger = control account 1200; AP = 2010; stock value = inventory GL 1300; payroll payable = 2300; every invoice's paid ≤ total. Failure marks the instance **read-only** and logs `integrity_failed`; nothing recomputes history.
3. `commands.engine_version` records which engine wrote each row. Old rows are never re-executed. If a rule must change, the new rule applies to new commands only.

## 6. Real clock
`world.today` becomes the server date and is refreshed before each command (cache invalidated on date change). The seed anchor remains only for `COMPANY_MODE=demo`'s sample data. Consequence to be aware of: aging and due dates in a demo database created earlier will start advancing from the day R2 is deployed.

## 7. Client
Remote mode bootstraps from `GET /api/state` (gzip, `seq`) instead of seed + all commands; `loadRemoteWorld` hydrates `DB` from that snapshot and keeps polling `commands?since=seq`. Offline cache stores the snapshot, not the log, which also removes the 5 MB `localStorage` ceiling risk for long histories (IndexedDB if the snapshot exceeds it). The public demo (no backend) is untouched.

## 8. Migrating existing databases
`pnpm migrate:state` (new CLI command, with `--dry-run`): replays the stored command log once using the engine version that wrote it (exactly what boot does today), writes all state into the new tables, compares the result with the old `records` mirror and the ledger tables, prints a report (row counts per table, ledger totals, any mismatch), and only then sets `meta.state_source='tables'`. Backup first (`pg_dump`). Databases created after R2 start in `tables` mode.

## 9. Rollout (each step deployable, tests green)
| Step | Content | Rollback |
|---|---|---|
| R2.1 | Migration `003` + `STATE_SOURCE=replay|tables` flag (default replay) + touch map + touch-map test | drop new tables |
| R2.2 | Tables writer alongside the current projector (dual write), equality test: tables vs replayed world after the whole engine suite | flag stays `replay` |
| R2.3 | Hydrate-from-tables boot + reconciliation + `migrate:state` | flag back to `replay` |
| R2.4 | `GET /api/state`, client snapshot bootstrap | old bootstrap kept one release |
| R2.5 | Real clock | env switch |
| R2.6 | Remove replay path, drop `records` | restore from backup |

## 10. Tests added
- Equivalence: same command stream through (a) replay world and (b) tables world gives identical `DB` (deep equality) and identical ledger.
- Touch-map completeness (above).
- Crash safety: kill between execute and commit leaves tables and commands consistent.
- Reconciliation detects a deliberately corrupted row.
- Performance budget: command p95 < 100 ms, boot < 3 s, snapshot < 5 MB gzip at seed size.
- `migrate:state --dry-run` on a database built by the old code reproduces its ledger exactly.

## 11. Risks
- Hydrating everything in memory still bounds one process (fine until R4/R5 moves to per-tenant, per-aggregate loading).
- The touch map is a new thing to maintain; the completeness test is what makes it safe.
- A typed-column + jsonb hybrid means two representations of a document; a single mapper per aggregate (`toRow`/`fromRow`) with a round-trip test keeps them aligned.
- Money stays `numeric(18,2)` and JS numbers until R3; R2 does not change any calculation.

## 12. What I need from you (schema and data change)
1. Approve the table design in section 3 (or send changes).
2. Approve `STATE_SOURCE` dual-run, then removal of the replay path in R2.6.
3. Approve running `migrate:state` against the local demo database (a backup is taken first). No customer data exists yet.
4. Confirm the consequence in section 6 (demo aging starts moving).
