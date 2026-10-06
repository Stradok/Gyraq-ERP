# Meridian ERP: Implementation Plan Pack

> The source brief is `../../plan.md`. That file says **what** to build. This pack says **how**, **in what order**, and **why**. Research was done on 2026-10-05.

## How to read this pack

| # | Document | Read it when |
|---|----------|--------------|
| 01 | [Research findings](01-research-findings.md) | Before any decision. Covers Pakistani tax and FBR, FMCG distribution practice, OpenRouter limits, stack versions |
| 02 | [Product scope & demo story](02-product-scope.md) | Deciding what to build and what to leave out |
| 03 | [Architecture](03-architecture.md) | Before writing code. Covers the repo layout, layers, events, jobs, API |
| 04 | [Data model](04-data-model.md) | Writing migrations |
| 05 | [Business engines](05-business-engines.md) | Ledger, inventory, pricing, tax, credit, 3-way match, approvals |
| 06 | [AI platform](06-ai-platform.md) | Providers, tools, the query layer, insights, safety, cost |
| 07 | [Security, tenancy, RBAC, audit](07-security.md) | Auth, RLS, permissions, audit chain |
| 08 | [UX & design system](08-ux-design-system.md) | Building any screen |
| 09 | [Seed data & demo mode](09-seed-and-demo.md) | The simulation, the scenarios, visitor sandboxes |
| 10 | [Roadmap](10-roadmap.md) | Milestones, exit criteria, sequencing |
| 11 | [Testing & quality](11-testing.md) | Test pyramid, invariants, AI evals |
| 12 | [Decisions, risks & open questions](12-decisions-risks.md) | ADR log, risk register, questions for the owner |

## The plan in one page

**What we're building:** a modular-monolith ERP built for Pakistani FMCG distribution. It runs order-to-cash and procure-to-pay on a real double-entry ledger and a real stock ledger. AI sits on top as an *untrusted reasoning service*: it reads ERP data through permissioned tools, explains things, drafts documents, and proposes actions. Every mutation goes through the same application services, approvals, and audit trail that humans use.

**Key decisions** (full rationale in doc 12):

1. **Stack.** pnpm + Turborepo monorepo. Next.js 16.3 (App Router) handles UI and REST. A separate **worker** process runs jobs. PostgreSQL 18 with RLS. Drizzle ORM. Better Auth handles authentication only, and RBAC is our own. pg-boss provides the queue behind an interface. Zod 4 contracts are shared between client and server, and OpenAPI is generated from them.
2. **Deterministic engines compute every number, and the LLM only interprets them.** Forecasts, risk scores, anomaly detection, cash projections, and profit-variance decomposition are plain TypeScript and SQL with unit tests. The LLM narrates the results, plans tool calls, extracts documents, and parses intent. AI answers reference metric IDs, and the server fills in the real values. This is how "never hallucinate data" is enforced in the architecture rather than just requested in a prompt.
3. **AI never writes to business tables.** Tools are `read` or `propose`. A proposal is stored as an `ai_proposed_action`. A human confirms it, and then the *same command a human would run* executes with `source = ai_proposal`. Approval policies still apply after that.
4. **Pakistan-first in substance, not just labels.** FBR Digital Invoicing is a first-class connector (simulated, sandbox, or live), because it has been mandatory for every sales-tax registrant since 31 Jul 2026. The effective-dated tax engine handles 18% standard rate, Third Schedule retail-price tax (greatly expanded for FMCG by Finance Act 2026), 4% further tax for unregistered buyers, and 236G/236H advance income tax with ATL vs non-ATL rates. Also modeled: post-dated cheques and bounces, carton/pack/piece units, trade schemes (e.g. 10+1 free goods), principal claims, delivery challans, Jul–Jun fiscal year, and Ramadan/Eid/summer seasonality.
5. **The seed is a simulation, not fixtures.** An 18-month deterministic day-by-day simulation, anchored to *today*, pushes documents through the same pure domain functions that production uses: pricing, tax, costing, posting. The ledger therefore reconciles by construction. The seven scenarios are injected into the last 30–60 days. One run per visitor gives each one a private sandbox.
6. **Free-tier AI is a hard constraint.** OpenRouter free models allow 20 req/min and 50/day, or 1,000/day once $10 of credits is bought. The model list changes monthly. The plan uses model tiers with fallback chains, a response cache keyed by data fingerprint, precomputed daily insights shared across identical sandboxes, per-session budgets, and an honest, labeled deterministic fallback.

**Definition of Done:** the three end-to-end chains in `plan.md` §61 work on fresh sandboxes. The integrity checks pass: trial balance balances, AR/AP subledgers equal their GL control accounts, and inventory valuation equals the GL inventory account. The 9-step demo story in §58 runs in under 4 minutes without a script.

## Build order (summary of doc 10)

```
M0 Foundations ─ M1 Ledger+Catalog+Stock ─ M2 Order-to-Cash ─ M3 Procure-to-Pay
      └─ M4 Simulation seed + Dashboard/Reports ─ M5 AI platform ─ M6 AI showcase
            └─ M7 Approvals/Workflow/Notifications ─ M8 Expenses+HR ─ M9 Integrations ─ M10 Demo mode + hardening
```

Depth beats breadth. A milestone is "done" only when its exit criteria (tests plus a demo-able flow) pass.
