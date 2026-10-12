# Current state (audit, 2026-10-12)

Scope: whole repository at commit `80a0205`. Everything below was read from code or measured; items marked *(not verified)* were not tested.

## 1. What this is
An ERP for a Pakistani FMCG distributor ("Meridian Distribution Co."), built as a **public demo first** and then extended with a self-hostable backend. It is single-company and single-tenant. It runs in two modes from one codebase:

| Mode | Where state lives | Entry |
|---|---|---|
| **Demo** (default, what gyraq.com serves) | In the browser: a seeded in-memory world plus a replayed command log in `localStorage` (`frontend/src/lib/store.ts`, key `meridian-demo-v2`) | `frontend/src/lib/engine/client.ts` `run()` |
| **Remote** (`NEXT_PUBLIC_API_URL` set) | Postgres via the API; the browser keeps a copy and syncs (`frontend/src/lib/engine/remote.ts`) | `backend/src/server.ts` |

## 2. Stack
- Frontend: Next.js 16.3.8 (App Router), React 19.2.8, Tailwind 4, shadcn (radix-nova), Recharts 3, zustand 5, zod 4, Vercel AI SDK 7 (`ai`, `@ai-sdk/react`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@openrouter/ai-sdk-provider`), Playwright for browser tests, tsx for scripts.
- Backend: Node 22, Hono 4, `pg` 8, plain SQL migration (`backend/migrations/001_schema.sql`). No ORM, no query builder.
- Data: Postgres 17 (Docker). Supabase project exists (`supabase.md`, git-ignored) but is **not used** by the code.
- Hosting: frontend on Vercel behind a rewrite on gyraq.com (`NEXT_PUBLIC_BASE_PATH=/products/erp/distribution`); backend only runs locally via `docker-compose.yml` (db :5433, api :4000, web :3000).
- CI: `.github/workflows/frontend-ci.yml` (tsc, `pnpm test`, build), `backend-ci.yml` (tsc, `pnpm test` with a Postgres service).

## 3. Size
`frontend/src/lib/engine` 1,385 lines (domain commands) · `lib/data` 2,543 (seed simulation + analytics) · `lib/ai` 681 · `app/` 3,977 (55 pages) · `components/` 4,263 · `backend/src` 375 · tests 525. 168 frontend source files, 8 backend source files.

## 4. Entry points
- Browser: `frontend/src/app/(app)/layout.tsx` → `components/app/shell.tsx` (`AppShell` renders a skeleton, then `AppShellInner`).
- Commands: `frontend/src/lib/engine/commands.ts` `HANDLERS` (50 commands) → `execute(db, rec)`.
- API: `backend/src/server.ts` routes `/health`, `/auth/login`, `/api/me`, `/api/users` (GET/POST/PATCH), `/api/bootstrap`, `/api/commands` (GET/POST).
- AI: `frontend/src/app/api/chat/route.ts`, `/api/extract/route.ts`, `/api/ai/status/route.ts`.

## 5. Environment variables
Frontend: `NEXT_PUBLIC_BASE_PATH`, `NEXT_PUBLIC_API_URL`, `API_URL`, `AI_EDITION`, `AI_PROVIDER_<TIER>`, `AI_MODEL_<TIER>`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `BUILD_STANDALONE`, `NEXT_PUBLIC_BOOK_URL`. Backend: `DATABASE_URL`, `PORT`, `JWT_SECRET`, `DEMO_PASSWORD`, `CORS_ORIGIN`, `COMPANY_MODE`, `OWNER_EMAIL/NAME/PASSWORD`. Compose adds `DB_PASSWORD`.

## 6. ERP domains present
| Domain | Present | Where |
|---|---|---|
| Tenancy / companies / branches | **No.** One company (`db.company`), branches are free-text on warehouses/employees | `lib/data/types.ts` `Company`, `Warehouse.branch` |
| Users, auth | Yes, basic | `backend/src/auth.ts`, `users` table |
| Roles, permissions | 8 fixed roles, 17 actions, module visibility | `frontend/src/lib/rbac.ts` |
| Sales (quotes, orders, pick/dispatch, challans, invoices, returns, payments, cheques, leads) | Yes | `lib/engine/sales.ts`, `masters.ts` |
| Purchasing (PO, receipts, bills, 3-way match, supplier payments, claims) | Yes | `lib/engine/purchasing.ts` |
| Inventory / warehouse (stock, transfers, counts, adjustments, expiry) | Yes (single valuation method: moving average) | `lib/engine/inventory.ts`, `core.ts` `cell()` |
| Accounting (chart of accounts, journal, periods, bank reconciliation, statements) | Yes | `lib/engine/finance.ts`, `lib/data/queries.ts` |
| Tax (18% GST, Third Schedule, further tax, 236G/236H, FBR e-invoice payload) | Yes, Pakistan-only | `lib/engines.ts`, `lib/integrations/fbr.ts` |
| HR, payroll | Basic employees, leave, payroll run | `lib/engine/people.ts` |
| CRM | Leads + quotes | `masters.ts` |
| Manufacturing | **No** | – |
| Reporting | Statements, 9 report pages, CSV export | `app/(app)/reports`, `finance/statements` |
| Notifications | In-app; email/WhatsApp are simulated (`outbox`) | `core.ts` `notify`, `queue` |
| Audit log | In-memory + `audit_log` table (append-only) | `core.ts` `audit`, migration |
| Integrations | FBR payload builder (simulated), AI providers | `lib/integrations/fbr.ts` |
| Settings | Policy limits, tax rates, notification mutes | `finance.ts` `updateSettings`, `/settings/*` |

## 7. Request flow
Demo: UI → `run(type,payload)` → `execute(db, rec)` → handler mutates the in-memory `DB` object, posts balanced journals via `postJE`, audits, notifies → UI re-reads through `getDB()`/`queries.ts`.
Remote: same local execution first (instant UI), then `pushCommand` queues it in `localStorage` (`meridian-outbox`) and `flush()` POSTs `/api/commands`; the server re-executes the same command on its own in-memory world, and in one Postgres transaction inserts the command row and the changed rows (`backend/src/world.ts` `submit`, `project.ts` `Projector.delta`). Clients poll `/api/commands?since=` every 4 s.

## 8. Quality tooling
- Tests: `frontend/tests/unit.test.ts`, `engine.test.ts`, `empty.test.ts`; browser: `e2e.mjs`, `e2e-remote.mjs`, `e2e-offline.mjs`, `e2e-setup.mjs`, `sweep-empty.mjs`; backend `backend/tests/api.test.ts` (Postgres). E2E scripts are manual (not in CI).
- Typecheck: `tsc --noEmit` clean in both packages (frontend needs generated `LayoutProps` types, produced by `next build`).
- Lint: `pnpm lint` reports **54 problems (27 errors)**, pre-existing; CI does not run lint.
- Formatting: none configured.
- Logging: `console.log` only. No structured logs, request ids, metrics, tracing or alerting.
- Backups: documented `pg_dump` one-liner only (`docs/SELF-HOSTING.md`); nothing automated.
- Migrations: one forward-only file, applied by `backend/src/db.ts` `migrate()`; no down migrations.

## 9. What is valuable and should be preserved
1. The **command engine** (`frontend/src/lib/engine/*`): pure, deterministic, validated, auditable, with balanced-journal enforcement and 3 test suites. It is the product's real asset.
2. The **seed simulation** and analytics (`lib/data`) as the demo asset.
3. The **append-only ledger tables with a balanced-entry constraint** (`backend/migrations/001_schema.sql`).
4. The **AI layer's provider/edition routing** (`lib/ai/provider.ts`) and role-gated tools (`lib/ai/tools.ts` `TOOL_ROLES`).
5. Offline-first client sync (`remote.ts`, `public/sw.js`).
