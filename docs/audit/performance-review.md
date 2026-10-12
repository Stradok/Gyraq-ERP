# Performance review

Measured on the dev machine unless stated. "Browser" numbers are from Playwright against a production build.

## Measurements
| Operation | Result | Where |
|---|---|---|
| Seed build (`buildDB`) | ~390 ms in Node (500 ms before date-cache fix), 5,574 invoices, 24,471 journal entries | `frontend/src/lib/data/sim.ts` |
| First insights computation | ~700 ms | `lib/data/queries.ts insights()` |
| Command on the backend (execute + diff + commit) | ~236 ms | `backend/tests/api.test.ts` latency line |
| App shell paint | ~120–170 ms (static skeleton) | `components/app/shell.tsx` |
| Overview content visible | ~1.2 s locally (2.25 s before the static-shell change) | `/tmp` perf script |

## Findings

### P-1 (High) Full-state diff on every command
`backend/src/project.ts` `docs(db)` JSON-stringifies and SHA-1 hashes **every record in every collection** (customers, invoices, journal not included, stock map…) after each command to find what changed. Cost grows linearly with company size; at 50k invoices this is seconds per command. *Fix:* handlers report the entities they touched (unit-of-work), or move to row-level writes in a repository.

### P-2 (High) Boot and bootstrap are O(commands) and unpaginated
`world.ts boot()` replays all commands; `/api/bootstrap` returns the full command list (`server.ts:86`); the browser rebuilds the seed and replays them all (`remote.ts loadRemoteWorld`) and also stores the whole payload in `localStorage` (≈5 MB limit, silently skipped when exceeded). A year of real activity (tens of thousands of commands) will make first load slow and break the offline cache.

### P-3 (High) All analytics are in-memory scans in the browser
`lib/data/queries.ts` filters/maps full arrays per call, memoised in a `WeakMap` cache invalidated by every command (`invalidate(db)`), so each command makes the next render recompute. List pages paginate client-side over the full array (`data-table.tsx`); there is no server-side pagination, filtering or search (design noted in the file header as future work).

### P-4 (Medium) Client builds the world on every visit
Seed build + replay happens on the main thread after first paint. ~1 s on a laptop, more on phones. A Web Worker, snapshots, or fetching state from the server (once state-based persistence exists) removes this.

### P-5 (Medium) Polling
Each open client calls `GET /api/commands?since=` every 4 s (`remote.ts startPolling`). Fine for tens of users; use server-sent events or WebSocket beyond that.

### P-6 (Medium) Database indexing and types
Only `records_kind_idx` and `journal_lines_account_idx` exist beyond primary keys (`backend/migrations/001_schema.sql`). `records.data` (jsonb) has no GIN or expression indexes, so SQL reporting on it would scan. Missing: `journal_entries(entry_date)`, `commands(type)`, `audit_log(at)`, `stock_levels` by warehouse. `journal_lines.entry_number` has no covering index for the balance trigger (it scans lines for the entry by PK prefix, which is covered by the composite PK).

### P-7 (Medium) Singleton process
`world` is one in-memory object (`world.ts`); commands are serialised through one promise chain (`serial`). Throughput is bounded by that chain and cannot scale out.

### P-8 (Low) Bundle
Build output shows static pages for the shell; no bundle analysis has been done. Recharts and the whole engine ship to every page. *(not measured)*

### P-9 (Low) AI latency
Free OpenRouter models: 20–30 s for vision, rate limits (≈50 requests/day on the free tier); handled by fallbacks and retries (`lib/ai/provider.ts`, `app/api/extract/route.ts`).

## Proposed budgets (to adopt in the target architecture)
| Operation | Budget (p95) |
|---|---|
| API read of a paginated list (≤50 rows) | 150 ms |
| Create/confirm a document (one transaction) | 300 ms |
| Dashboard load (cached read models) | 1.5 s |
| First app load on a cold device | 3 s on 4G |
| Boot of a backend instance | 10 s regardless of history size |
