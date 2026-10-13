# Target architecture

Status of each part is marked **built**, **partly**, or **planned**. Decisions are in `docs/adr/`.

## 1. Layers
| Layer | Responsibility | Where |
|---|---|---|
| UI | Presentation only; asks the engine, shows results | `frontend/src/app`, `components` (**built**; a few pages still compute prices via `lib/engines.ts`, **partly**) |
| API | Authentication, role table, record-level scope, input checks, request ids, rate limits | `backend/src/server.ts`, `scope.ts`, `auth.ts` (**built**) |
| Application | One command per use case, validates, mutates, posts balanced journals, audits, notifies | `frontend/src/lib/engine/*` (**built**, 52 commands, one registry) |
| Domain | Pricing, tax, credit, valuation, three-way match, money rounding | `lib/engines.ts`, `lib/money.ts`, parts of `engine/*` (**partly**: still takes the whole `DB`) |
| Persistence | Typed tables, ledger/audit append-only, unit of work per command, integrity checks | `backend/src/state*.ts`, `hydrate.ts`, `integrity.ts`, `migrations/` (**built**) |

The same engine runs in the browser (instant answers, offline) and on the server (authority).

## 2. Modules (**planned**, milestone R5)
`auth · tenancy · users · rbac · sales · purchasing · inventory · accounting · invoicing · payments · tax · hr · payroll · reporting · notifications · integrations · audit · settings`. Today these are files in `lib/engine` (`sales.ts`, `purchasing.ts`, `inventory.ts`, `finance.ts`, `people.ts`, `masters.ts`, `setup.ts`, `approvals.ts`, `automations.ts`). Rules for the split: a module touches only its own tables and talks to others through a service function or a domain event; no cycles (enforced in CI with a dependency rule); shared code lives in named libraries (`money`, `dates`, `permissions`). The `TOUCHES` map (`engine/touches.ts`) is the first machine-checked statement of what each command may change.

## 3. Tenancy (**planned**, R4, ADR 0003)
Shared schema, `tenant_id` on every table, Postgres row-level security as defence in depth, an explicit tenant context on every repository call, per-tenant document sequences. Until then one deployment = one company, which is also the strongest isolation and what `deploy/install.sh` sets up.

## 4. Customisation without forks (**partly**)
- Configuration: policy limits and tax rates are data (`settings`, **built**); numbering prefixes, currency, fiscal year and document templates are still literals (**planned**).
- Feature flags and AI edition: `AI_EDITION` and per-task provider overrides (**built**); a per-tenant flag store (**planned**).
- Hooks: automation rules (**built**, three actions); before/after-command hooks and custom fields (**planned**).
- Country rules in a tax module with a Pakistan pack (ADR 0005, **planned**).

## 5. Sync and real time (**built**)
Local-first clients: run the command locally, queue it, send it, rebuild on conflict; one HTTP event stream per screen announces new commits; slow timer as safety net. Details in `docs/DEPLOY.md`.

## 6. Performance budgets and where we are
| Operation | Budget (p95) | Now |
|---|---|---|
| Create/confirm a document | 300 ms | about 130 ms end to end; the screen answers instantly |
| App shell on a cold device | 3 s on 4G | shell about 150 ms, data ready about 1 s |
| Backend boot | 10 s | about 1 s at the demo company's size |
| Paginated server read | 150 ms | **not built**: lists are filtered in the browser |
Known ceilings: whole company held in one process's memory (about 50 MB at 5,500 invoices); full snapshot of the demo company is 30 MB, so large companies need server-side pagination and aggregate loading (R9).

## 7. Deployment and operations (**built** except where noted)
Docker Compose with limits per container, HTTPS through Caddy, one-command installer, installers built in CI, structured JSON logs with request ids, health and integrity endpoints, documented backup and restore. **Planned:** monitoring/alerts, automated backups with restore tests, blue/green deploys.
