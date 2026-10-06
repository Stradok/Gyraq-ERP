# 12: Decisions, Risks & Open Questions

## 1. Decision log (ADR summaries)

| # | Decision | Alternatives considered | Why |
|---|---|---|---|
| D1 | **Modular monolith**: one repo, `web` + `worker` processes | Microservices; single Next.js process doing jobs | plan §53. A worker is required for non-blocking AI, FBR, and exports, and module boundaries keep future extraction cheap |
| D2 | **pnpm + Turborepo** monorepo | Nx; single package | Lightweight, fast caching, clear package boundaries |
| D3 | **Next.js 16.3 App Router** for UI + REST route handlers | Separate NestJS/Fastify API | One deployable for the UI and API, with RSC reads. Keeping REST over server actions for mutations gives one enforcement path and accurate OpenAPI. A separate API server can be split out later because route handlers are thin |
| D4 | **Drizzle ORM** | Prisma 7, Kysely | First-class Postgres RLS policy modelling, SQL transparency for ledger and reporting queries, cheap transactions, `numeric` handling under control. Prisma has no built-in RLS support |
| D5 | **PostgreSQL 18**, RLS + app-layer tenancy, `uuidv7()` | Schema-per-tenant; DB-per-tenant | Row-level tenancy scales to many small tenants (demo sandboxes). RLS gives defense in depth. uuidv7 gives index locality |
| D6 | **Better Auth for authN only**; RBAC is our own | Auth.js; Clerk; Better Auth org plugin for RBAC | Self-hosted with no vendor lock or per-MAU cost. We need scoped permissions, audit integration, and approval roles that a generic plugin doesn't model |
| D7 | **pg-boss** queue behind `JobQueue`; outbox relay | BullMQ + Redis | No Redis needed for the demo, and jobs can be **enqueued transactionally** with business changes. BullMQ is the documented swap path |
| D8 | **Numeric money + Decimal library**; quantities in base UoM | bigint minor units; JS numbers | Exact arithmetic. Numeric is readable in SQL and reports. Supports 6-dp unit costs for moving average |
| D9 | **Moving weighted average** costing | FIFO; standard cost | Common in Pakistani SMEs, simple to explain, stable with no-negative-stock. Strategy interface leaves room for FIFO |
| D10 | **Deterministic analytics + LLM narration**, server-rendered metrics via placeholders | LLM computes everything | Makes "never hallucinate data" enforceable and testable, saves quota, and keeps working when the free model is down |
| D11 | **AI propose-only**; humans confirm, then the same commands run | Write tools with confirmation | One mutation path; approvals, audit, and RBAC are reused automatically |
| D12 | **Own `AIProvider` interface; Vercel AI SDK inside adapters** | Raw fetch per provider; AI SDK directly in business code | Business code stays provider-agnostic (plan §54) while reusing a mature streaming and tool-calling implementation |
| D13 | **Controlled query catalogue** shared by NL search, table filters, and AI tools | Text-to-SQL with a read-only role | Safety, permissions, and consistency. One definition of `days_overdue` everywhere |
| D14 | **Seed = deterministic simulation using domain functions**, time-anchored | Static fixtures; faker | Consistency by construction, an always-current demo, and testable scenarios |
| D15 | **Per-visitor sandboxes from a pre-warmed pool** | One shared demo org reset nightly | Visitors can't trash each other's demo, and persona handoffs work. Shared AI cache keeps LLM cost flat |
| D16 | **FBR Digital Invoicing as a Tier-1 connector** (simulated/sandbox/live) | Defer to Tier 3 | Legally mandatory since 31 Jul 2026, the main local purchase criterion, and the strongest local-credibility signal |
| D17 | **Effective-dated tax rules as data** | Constants per tax type | Rates change every Finance Act; historical invoices must stay reproducible |
| D18 | **Fictional brands, real geography and banks** | Real brands | Avoids trademark and impersonation issues while staying credible |
| D19 | Self-host on **VPS + Docker Compose + Caddy** for the demo | Vercel + Neon | A long-running worker and LISTEN/NOTIFY are needed. Single-box simplicity for a small team (plan §51) |

## 2. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Free OpenRouter models disappear or degrade (monthly churn) | High | Medium | Tiered fallback chains; boot and hourly health check; recorded evals; deterministic fallbacks; one env change to switch |
| Free-tier quota exhausted by demo traffic (50 or 1,000/day) | High | High | Buy $10 credits; precompute insights per day; shared cache; per-session budgets; pre-parser for NL queries; labeled deterministic mode |
| Weak tool-calling on free models (wrong tools, malformed JSON) | Medium | High | Small tool allowlists per mode; ≤6 steps; JSON schema; repair round; grounding pass; evals per model |
| Scope explosion (60-section brief) | High | High | Tiered scope (doc 02), milestone exit criteria, no placeholder pages, depth first |
| Accounting or tax correctness errors undermine credibility | Medium | High | DB-level invariants, property tests, integrity page, accountant review in M10, tax disclaimer and configurable rules |
| Third Schedule / distributor tax treatment is more nuanced than modelled | Medium | Medium | Rules engine with per-code "charge at our stage" basis; validate with a tax advisor before any real customer; demo disclaimer |
| RLS misconfiguration leaks data | Low | Critical | Forced RLS, fail-closed setting, composite FKs, isolation suite, CI table enumeration test |
| Seed too slow for on-demand sandboxes | Medium | Medium | COPY bulk loads, pre-warmed pool, measure in M4 (target ≤ 30 s) |
| Next.js security advisories | Medium | Medium | Pin patch, Renovate, track the security release feed |
| Prompt injection via OCR or notes | Medium | Medium | Propose-only tools, data delimiting, eval cases |
| Visitor abuse of the public demo (spam uploads, AI abuse) | Medium | Medium | Rate limits, upload caps, sandbox TTL, Turnstile, simulated outbound only |
| Burnout from too many surfaces for 1 engineer | Medium | High | Roadmap sized at ~20 weeks; Tier-3 trimmed first if behind |

## 3. Open questions for the owner

These have recommended defaults, and work can proceed on them unless you say otherwise.

1. **Hosting for the public demo:** VPS (Hetzner/DigitalOcean) with Compose? *Default: yes, 4 vCPU / 8 GB, about $20–40/month.*
2. **OpenRouter credits:** OK to buy the one-time $10 to lift the cap from 50 to 1,000 requests/day? *Default: yes, strongly recommended.*
3. **Sandbox per visitor vs shared demo org?** *Default: per-visitor sandboxes (D15).*
4. **Branding:** use "Meridian" product branding with the ink-blue accent, or your agency's brand colors and logo in the shell? *Default: neutral Meridian branding plus a small "Built by <agency>" link.*
5. **Language:** English-only UI for v1 with i18n scaffolding (Urdu later)? *Default: yes.*
6. **Team and timeline:** one engineer for about 20 weeks, or two engineers for about 12? This changes M5–M9 parallelism.
7. **Customer name "Metro Mart"** (from the brief) closely resembles METRO Cash & Carry Pakistan. Keep it, or rename to avoid confusion? *Default: rename to "Madina Mart" and update the plan.md examples to match.*
8. **Real FBR sandbox:** do you have, or want to obtain, an IRIS sandbox token for an agency NTN to demonstrate `sandbox` mode? *Default: simulated only.*

## 4. Immediate next steps

1. Answer or confirm the open questions above.
2. `git init`, then create the monorepo skeleton per doc 03 §2 and the M0 task list. Commit this plan pack under `docs/plan/`.
3. Write `CLAUDE.md` with the conventions from docs 03, 07, and 11 (boundaries, `withTenant`, money rules, error codes, testing commands), so every coding session follows them.
4. Start M0. The first PR is tooling + Compose + `core` + `db` with RLS and the tenant isolation test. Merge nothing else until that test exists.
