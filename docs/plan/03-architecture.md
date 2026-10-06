# 03: Architecture

## 1. Shape: a modular monolith with two processes

```
                ┌──────────────────────── apps/web (Next.js 16) ────────────────────────┐
 Browser ──────▶│ RSC pages (read via query services) │ /api/v1/* REST │ /api/sse/* SSE │
                └───────────────┬───────────────────────────────┬───────────────────────┘
                                │ in-process calls only via module public APIs
                ┌───────────────▼───────────────────────────────▼───────────────────────┐
                │ packages/modules/*  (application services → domain → repositories)    │
                │ packages/ai  packages/analytics  packages/integrations                 │
                └───────────────┬───────────────────────────────┬───────────────────────┘
                                │ Drizzle (tenant tx, RLS)       │ outbox rows + pg-boss jobs
                         ┌──────▼──────┐                 ┌──────▼──────────────┐
                         │ PostgreSQL  │◀────────────────│ apps/worker (Node)   │──▶ OpenRouter / FBR /
                         │ 18 + RLS    │  same DB         │ outbox relay, jobs,  │    SMTP / S3
                         └─────────────┘                 │ schedulers           │
                                                         └──────────────────────┘
```

- **One codebase, two deployables:** `web` and `worker`. Both import the same module packages. The worker exists because AI, OCR, forecasting, FBR submission, exports, and email must never block HTTP requests (plan §29). It also keeps Next.js free of long-lived loops.
- Nothing else is needed for the demo. Redis is introduced only when the queue or rate limiter needs it (§7). Kubernetes is out.

## 2. Repository layout

```
/apps
  /web                    Next.js app: routes, layouts, page components, route handlers (thin)
  /worker                 job runners, outbox relay, cron schedules, health endpoint
/packages
  /core                   shared kernel: Money, Quantity, Decimal, Result, DomainError, ids, Clock,
                          RequestContext (AsyncLocalStorage), Permission type, pagination types
  /db                     Drizzle schema (per-module files), migrations, RLS policies, roles,
                          withTenant()/withSystem() tx helpers, integrity check SQL functions
  /contracts              Zod DTOs + route contracts (shared FE/BE), OpenAPI generator, typed API client
  /modules
    /identity             users, memberships, roles, permissions, sessions glue (Better Auth adapter)
    /catalog              products, uoms, categories, brands, price lists, schemes
    /inventory            stock ledger, balances, reservations, transfers, adjustments, counts, valuation
    /sales                leads, quotes, orders, fulfillment, invoices, returns, credit notes
    /procurement          requests, RFQs, POs, receipts, bills, 3-way match, claims
    /finance              CoA, journal engine, posting rules, periods, banking, reconciliation, statements
    /tax                  tax codes/rules, computation, withholding
    /expenses             claims, receipts, policies
    /hr                   employees, departments, leave, attendance, payroll overview
    /approvals            policies, requests, steps, executors registry
    /workflow             automation rules, triggers, action catalogue, runs
    /notifications        rules, digests, channels, preferences, SSE fan-out
    /audit                audit writer, hash chain, query
    /reporting            report registry, materialized views, exports, saved views
    /search               search index projection, entity search, NL query compiler
  /analytics              deterministic engines: forecasting, risk, anomalies, cashflow, variance
  /ai                     provider interface + adapters, router, prompt registry, tool registry,
                          agent loop, grounding, budgets, cache, traces, evals
  /jobs                   JobQueue interface + pg-boss adapter, job definitions registry
  /storage                ObjectStorage interface + local / S3 adapters, signed URLs
  /integrations           connector interface + FBR DI, email, WhatsApp(sim), bank CSV, webhooks
  /ui                     design system: tokens, primitives (shadcn-based), DataTable, CommandPalette,
                          AI components, charts, form kit
  /seed                   simulation engine, master data catalogues, scenario injectors, verifier
  /config                 tsconfig bases, eslint config (incl. boundary rules), tailwind preset
/tests
  /e2e                    Playwright
/docs
  /plan                   this pack
  /adr                    decision records after this pack
```

### Module internal structure (the same for every module)

```
packages/modules/sales/
  src/
    domain/          pure: entities, value objects, state machines, policies, calculations (no IO)
    application/     commands (mutations) + queries (reads) — the ONLY public entry points
    infrastructure/  repositories (Drizzle), mappers row↔domain
    events/          event type definitions (versioned payload schemas) + subscribers
    index.ts         public API: commands, queries, event types, DTO mappers. Nothing else.
  test/
```

**Boundary enforcement:** an ESLint `no-restricted-imports` rule (or `dependency-cruiser`) runs in CI and enforces three things:
- `apps/*` may import only `@erp/modules/*` index files, `@erp/contracts`, `@erp/ui`, and `@erp/core`.
- A module may not import another module's `domain/` or `infrastructure/`.
- `@erp/ui` may not import `@erp/db`, so components can never call the database.

### Allowed module dependencies (acyclic)

```
core ◀── db ◀── {catalog, tax, audit, identity}
inventory → catalog
finance → tax
sales → catalog, inventory, finance(posting), tax, approvals
procurement → catalog, inventory, finance(posting), tax, approvals
expenses → finance(posting), approvals ;  hr → finance(posting), approvals
reporting/search → read-only views of everyone (via SQL views/materialized views, not other modules' tables in code)
analytics → read models only ;  ai → application services of all modules (through tool definitions)
workflow, notifications → subscribe to events only
```

## 3. Request lifecycle & layering

```
Route handler (apps/web/app/api/v1/...)            ← parse+validate with contract (Zod), no logic
  → defineRoute() middleware: requestId, session → RequestContext{user, org, roles, ip, ua, source}
     rate limit, CSRF/origin check, idempotency key, error → problem+json
  → Application service (command/query)            ← authorize(ctx, permission, resource?)
     → withTenant(ctx.orgId, tx => {               ← BEGIN; set_config('app.org_id', ..., true)
          load aggregates (SELECT … FOR UPDATE where needed)
          domain logic (pure)                       ← state machine guard, calculations
          inventory movements / ledger postings     ← in-tx calls to inventory/finance public APIs
          audit.record(tx, …)                       ← same tx
          outbox.append(tx, DomainEvent)            ← same tx
        })                                          ← COMMIT
  → DTO mapper → response (never a raw row)
```

This is the plan.md §48 sequence exactly: *validate → begin → domain → ledger → inventory → audit → commit → emit*. "Emit" means the outbox row becomes visible on commit and is picked up by the relay.

### Synchronous vs asynchronous rule

- **Synchronous, inside the transaction:** anything required for an invariant. Examples: JE posting, stock movement, reservation, credit-exposure update, audit, document number.
- **Asynchronous, via events:** reactions. Examples: notifications, AI insight refresh, search index update, materialized view refresh, FBR submission, emails, webhooks, workflow rules.

### Reads

- **Server Components** call module *query services* directly (same process). These return DTOs and run inside `withTenant`.
- **Client-side** interactive tables call the REST endpoints through TanStack Query. **All mutations go through REST**, so authorization, idempotency, audit, and rate limiting live in one place. There are no server actions for mutations; this keeps a single enforcement path and makes OpenAPI accurate.

## 4. API conventions

- Base path `/api/v1`, with resources grouped by module: `/sales/orders`, `/finance/journal-entries`.
- **Commands as sub-resources** for state transitions:
  - `POST /sales/orders/{id}/confirm`
  - `POST /sales/invoices/{id}/approve`
  - `POST /procurement/purchase-orders/{id}/receipts`
  - `POST /finance/journal-entries/{id}/reverse`
- List queries:
  - Filtering: `?filter[status][in]=confirmed,reserved&filter[total][gte]=500000`
  - Sorting and paging: `&sort=-issue_date&limit=50&cursor=…`. Keyset pagination is used for large tables, offset only for small masters.
  - All list queries are compiled through the same **query catalogue** that the NL search uses (doc 06 §5).
- `Idempotency-Key` header is required on all POSTs that create financial documents. It is stored in `idempotency_keys` with a request hash, and replays return the stored response.
- **Optimistic locking:** every mutable document has a `version` column. Clients send `If-Match: <version>`. A mismatch returns 409 with a friendly diff message.
- **Errors** follow RFC 9457 `application/problem+json`:
  ```json
  {"type":"https://erp.dev/errors/period-closed","title":"Period is closed",
   "detail":"We couldn't post this invoice because September 2026 (P03 FY26-27) is closed.",
   "recovery":"Change the posting date to an open period or ask Finance to reopen P03.",
   "code":"FIN_PERIOD_CLOSED","reference":"req_01J9Z…","fields":{"postingDate":"…"}}
  ```
  `DomainError` subclasses carry `code`, `userMessage`, and `recovery`. Unknown errors become a generic message plus a reference, and never leak stack traces or ORM messages.
- **OpenAPI 3.1** is generated from `@erp/contracts` using `z.toJSONSchema` and served at `/api/v1/openapi.json`, with a reference UI at `/developers` (Scalar).
- **SSE** endpoints: `/api/sse/notifications` and `/api/v1/ai/conversations/{id}/stream`.

## 5. Events & outbox

**Event envelope:**

```ts
type DomainEvent<T extends string, P> = {
  id: string /* uuidv7 */; type: T; version: number; organizationId: string;
  aggregateType: string; aggregateId: string; occurredAt: string;
  actor: { type: 'user'|'system'|'ai_proposal'|'integration'; id?: string };
  correlationId: string /* requestId */; causationId?: string; payload: P;
}
```

- **Catalogue (initial):**
  - Sales: `SalesOrderConfirmed`, `InventoryReserved`, `ReservationReleased`, `ShipmentDispatched`, `InvoicePosted`, `InvoiceSubmittedToFbr`, `PaymentReceived`, `ChequeBounced`
  - Procurement: `PurchaseOrderApproved`, `GoodsReceived`, `SupplierBillPosted`, `ThreeWayMatchExceptionRaised`
  - Inventory and finance: `StockLevelChanged`, `StockCountVarianceRecorded`, `JournalPosted`, `PeriodClosed`
  - Expenses and approvals: `ExpenseSubmitted`, `ApprovalRequested`, `ApprovalDecided`
  - AI: `AIRecommendationCreated`, `AIProposalConfirmed`
- **Outbox:** `outbox_events` is written in the business transaction. The **relay** in the worker uses `LISTEN outbox_new` (a trigger runs `NOTIFY`) with polling as a fallback, and claims rows with `FOR UPDATE SKIP LOCKED`. For each registered subscriber it enqueues a pg-boss job with key `{eventId}:{subscriber}`, which gives exactly-once *effects* via `event_consumptions` (PK on event and subscriber).
- **Migration path:** to move to Kafka, RabbitMQ, or SQS later, swap the relay's publish target. Subscribers keep their `handle(event)` signature.
- **Payload schemas are versioned with Zod.** Subscribers declare which versions they accept.

## 6. Jobs

`JobQueue` interface (`enqueue(name, payload, opts{runAt, singletonKey, retry, priority})`, `work(name, handler)`, `schedule(name, cron)`). The pg-boss adapter lets `enqueue` take the **current transaction**, so a job only exists if the business change committed.

| Queue | Trigger | Notes |
|---|---|---|
| `outbox.dispatch` | relay | fan-out to subscribers |
| `ai.insights.generate` | nightly 06:00 PKT + data-change debounce | detectors → narrate → `ai_insights` |
| `ai.document.extract` | upload | OCR/extraction for bills, receipts |
| `ai.chat.turn` | user message | runs the agent loop, streams via SSE (LISTEN/NOTIFY bridge) |
| `forecast.run` | nightly + on demand | demand forecast per SKU×warehouse |
| `cashflow.project` | nightly + on PO approve / payment / invoice events (debounced 30s) | 13-week projection |
| `reports.export` | user | CSV/XLSX/PDF to storage, notify with signed URL |
| `fbr.invoice.submit` | `InvoicePosted` | retries 1s,5s,30s,2m,10m on 5xx; 4xx → mark failed + notify |
| `bank.reconcile.suggest` | statement import | scoring + optional LLM narration parsing |
| `notifications.dispatch` / `email.send` | events / digests | dedupe + digest windows |
| `webhooks.deliver` | events | HMAC-signed, exponential backoff, dead-letter |
| `search.index` | events | upsert `search_documents` |
| `reporting.refresh` | events (debounced) + nightly | `REFRESH MATERIALIZED VIEW CONCURRENTLY` |
| `integrity.verify` | nightly + on demand | TB balance, subledger=GL, stock=GL, audit chain |
| `demo.sandbox.provision` / `.cleanup` | pool low-water mark / TTL | see doc 09 |

Each job runs inside `withTenant(job.orgId)` with a `system` or `user` actor, logs with `jobId`, and gets retry with backoff plus a dead-letter queue visible at **Settings → System → Jobs**.

## 7. Infrastructure abstractions (swap without touching domain logic)

| Concern | Interface | Demo implementation | Production path |
|---|---|---|---|
| Queue | `JobQueue` | pg-boss | BullMQ/Redis or SQS |
| Events | `EventPublisher` (relay target) | in-process subscribers via pg-boss | Kafka / RabbitMQ |
| Storage | `ObjectStorage` (`put`, `getSignedUrl`, `delete`, `head`) | local disk + HMAC-signed URLs served by a route | S3 / R2 |
| AI | `AIProvider` | OpenRouter | Anthropic, Gemini, OpenAI-compatible |
| Email | `EmailTransport` | simulated outbox (or SMTP if configured) | Resend/SES |
| Rate limit | `RateLimiter` | Postgres token bucket (`rate_limits` table) | Redis |
| Cache | `Cache` | Postgres `kv_cache` + in-memory LRU | Redis |
| Clock | `Clock` | system clock; **demo uses org-level time anchor** | — |
| Search | `SearchIndex` | Postgres FTS + pg_trgm | OpenSearch/Typesense |

## 8. Observability

- **Logging:** `pino` structured JSON. Every line carries `requestId`, `orgId`, `userId`, `jobId`, and `aiRequestId` taken from the `RequestContext` in AsyncLocalStorage. PII redaction paths are configured: CNIC, phone, tokens.
- **Tracing:** OpenTelemetry via Next's `instrumentation.ts` and the worker bootstrap. It covers HTTP, pg, and fetch, with spans per command and per AI tool call. The OTLP exporter is optional through env.
- **Errors:** Sentry adapter, activated when `SENTRY_DSN` is set.
- **Database monitoring:** `pg_stat_statements` is enabled in Compose, and a slow-query log above 200 ms surfaces on the System page.
- **AI trace chain** in tables (doc 06 §9): request → prompt version → model → context hash → tool calls → validation → proposal → approval → resulting audit ID. All of it is viewable from any AI answer's "Details".
- **Health:** `/api/health` (DB, queue lag, outbox lag, last integrity run) and a worker heartbeat table.

## 9. Deployment

- **Docker:** a multi-stage `Dockerfile` with targets `web` and `worker`, using Next.js `output: 'standalone'` on `node:24-alpine`.
- **`docker-compose.yml`:** `postgres:18` with `pg_stat_statements`, plus `web`, `worker`, and `mailpit` (dev SMTP viewer). Object storage uses the local-disk driver on a mounted volume.
- **Demo hosting recommendation:** a single VPS (4 vCPU / 8 GB) running Compose, behind Caddy for automatic TLS. Use a managed Postgres if budget allows. Vercel alone is a poor fit because a long-running worker is required. If Vercel is required for `web`, run the worker on Fly.io or Railway against the same DB.
- **Scale-out path:** stateless web replicas; worker replicas (pg-boss is safe for concurrency); PgBouncer in transaction mode (works because tenant context uses `set_config(..., true)` scoped to the transaction); read replica for reporting; Redis when the rate limiter or queue needs it.
- **Future service extraction** (plan §53) follows module boundaries: the AI Platform and Integrations are the most likely first candidates, since they have their own scaling profile and external dependencies.

## 10. Configuration (`.env.example`)

```env
# Core
DATABASE_URL=postgres://erp_app:***@localhost:5432/erp        # app role: NO BYPASSRLS
DATABASE_OWNER_URL=postgres://erp_owner:***@localhost:5432/erp # migrations/seed only
AUTH_SECRET=                     # 32+ bytes
ENCRYPTION_KEY=                  # 32 bytes base64, AES-256-GCM for integration secrets
APP_URL=http://localhost:3000
DEMO_MODE=true                   # enables sandboxes, persona login, simulated integrations

# AI
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=
AI_MODEL=openrouter/free                         # default/fallback
AI_MODEL_FAST=qwen/qwen3.8-27b:free,google/gemma-4-26b-a4b-it:free
AI_MODEL_REASONING=nvidia/nemotron-3-super-120b-a12b:free,thinkingmachines/inkling:free
AI_MODEL_VISION=google/gemma-4-31b-it:free
AI_DAILY_REQUEST_BUDGET=900
AI_SESSION_QUESTION_BUDGET=25
AI_REQUEST_TIMEOUT_MS=45000

# Storage
STORAGE_DRIVER=local             # local | s3
STORAGE_LOCAL_DIR=./.data/storage
STORAGE_ENDPOINT=
STORAGE_BUCKET=
STORAGE_ACCESS_KEY_ID=
STORAGE_SECRET_ACCESS_KEY=

# Email / integrations
EMAIL_PROVIDER=simulated         # simulated | smtp
SMTP_URL=
FBR_DI_MODE=simulated            # simulated | sandbox | live
FBR_DI_TOKEN=                    # never in demo

# Observability
LOG_LEVEL=info
SENTRY_DSN=
OTEL_EXPORTER_OTLP_ENDPOINT=
```

Env is parsed and validated at boot by `packages/core/env.ts` with Zod. The process fails fast on a missing or invalid value. Server-only modules import `server-only`, and nothing in `NEXT_PUBLIC_*` is secret.

## 11. Root scripts

```
pnpm dev            # web + worker (turbo), docker compose up -d db
pnpm db:migrate     # drizzle-kit migrate (owner role) + RLS/policies + SQL functions
pnpm db:seed        # template org "Meridian Distribution Co." (simulation, ~20–40s)
pnpm demo:reset     # drop demo orgs + sandboxes, re-seed template, warm sandbox pool
pnpm test           # unit + integration (Testcontainers/compose DB)
pnpm test:e2e       # Playwright against seeded sandbox
pnpm verify         # integrity checks against current DB
pnpm ai:eval        # golden question set against recorded/mocked or live provider
```

`npm run db:seed` and `npm run demo:reset` (plan §49) are aliases in the root `package.json`.
