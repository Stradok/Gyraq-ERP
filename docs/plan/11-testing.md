# 11: Testing & Quality Strategy

## 1. Pyramid

| Layer | Tooling | Scope | Runs |
|---|---|---|---|
| **Unit (domain/engines)** | Vitest + fast-check | Pure functions: journal, posting rules, costing, UoM, pricing, schemes, tax, credit, match, state machines, rule AST, detectors, formatters, grounding | every commit, < 30 s |
| **Integration** | Vitest + real Postgres (CI service container / Testcontainers locally) | Application services in `withTenant`: tx atomicity, triggers, RLS, outbox, approvals, idempotency, concurrency | every commit, < 4 min |
| **Contract** | Vitest | Route contracts ↔ OpenAPI snapshot; provider adapters vs recorded HTTP fixtures; FBR payload mapper fixtures | every commit |
| **E2E** | Playwright (Chromium + mobile viewport) | DoD flows on a seeded sandbox | every PR (smoke) / nightly (full) |
| **AI evals** | `pnpm ai:eval` (recorded / live) | NL-query intent, grounding, tool selection, extraction accuracy, injection | recorded on PR; live weekly + before model switch |
| **Data integrity** | SQL check functions | TB, subledgers, stock vs GL, balances vs ledger, audit chain | after seed, nightly, in E2E teardown |
| **Accessibility** | axe-core in Playwright | Key screens both themes | nightly |
| **Performance** | k6 or autocannon + `EXPLAIN` snapshots for top queries | Lists, overview, search | pre-release |

## 2. Required unit test suites (plan §46)

- **Accounting:** postings balance for every rule; reversal mirrors exactly; rounding (line-level half-up, document totals = Σ lines); closed period rejected; control-account guard.
  - *Property:* for any random sequence of valid business events, Σ debits = Σ credits and AR control = Σ open items.
- **Inventory:**
  - Moving average across receipt, issue, transfer, return, and count sequences, checked against a hand-computed table.
  - Reservation arithmetic and FEFO allocation with shelf-life constraints.
  - *Property:* on_hand never negative when disallowed; balance = Σ ledger.
- **Tax:** a fixture matrix of category (standard / Third Schedule / exempt / reduced) × buyer registered/unregistered × ATL/non-ATL × channel × date (before and after a rate change), with expected per-line amounts and fired rule IDs.
- **Permissions:** role × permission × scope matrix tests. Scope predicates (own/branch) generate the expected SQL filters.
- **Pricing:** price-source precedence, discount authority limits, free-goods calculation, slab boundaries, scheme stacking, budget exhaustion.
- **Credit:** exposure composition, each BLOCK/WARN/PASS path, override snapshot.
- **Three-way match:** every exception type, tolerance edges (exactly at tolerance passes), partial receipts, duplicate fuzzy edges.
- **Detectors:** synthetic series with known answers. Forecast on a seasonal series with a known event; risk score factor contributions; MAD anomaly thresholds; cash projection on a constructed ledger.

## 3. Required integration suites

| Flow | Assertions |
|---|---|
| Sales order → inventory reservation | Reserved qty, availability, events. **Concurrency:** 20 parallel confirms on a scarce SKU never oversell |
| Shipment → stock issue + COGS | Ledger rows, balances, JE at average cost, batch FEFO |
| Invoice → ledger | JE lines per tax type, gapless numbering under parallel approvals, FBR job enqueued in the same tx |
| Payment → receivable | Allocation, payment_status, PDC lifecycle, bounce reversal |
| Purchase receipt → inventory | GRNI JE, moving average update, batch creation |
| Supplier invoice → AP | Match, exception approval, PPV posting, duplicate guard |
| Approvals | SoD, stale on edit, executor atomicity, multi-step |
| Tenancy | Isolation suite for every repository and tool; RLS forced on all tables |
| Audit | Every command writes exactly one audit row with correct source and links; chain verifies |
| Outbox | Exactly-once effects under relay crash and restart |
| Idempotency | Same key + same body returns the stored response; same key + different body returns 422 |
| Period close | Posting blocked; reopen requires approval; audit |

## 4. E2E flows (plan §46, Playwright)

1. Login (and persona login in demo mode)
2. Create customer
3. Create order (keyboard-only line entry)
4. Reserve inventory (confirm; credit pass)
5. Generate invoice (dispatch → invoice approve → FBR simulated IRN visible)
6. Record payment (PDC → clear → Paid)
7. Purchase inventory (PO → approval)
8. Receive goods (mobile viewport GRN with batch/expiry)
9. AI recommendation (replenishment → adjust → propose PO → confirm). Runs against **recorded AI fixtures** so it's deterministic in CI
10. Approval (Owner approves on mobile viewport; ripple assertions: incoming qty, cash projection, notification)

Plus: the 3-way match exception approval, credit override handoff across personas, demo sandbox claim and reset, and the command palette ("#INV-…" jump, "Create purchase order").

## 5. AI quality gates

- **Recorded fixtures:** the `AIProvider` test double replays recorded responses keyed by prompt + version + input hash. Re-record with `pnpm ai:eval --record` against live models.
- **Scorers:**
  - Intent equality (NL query)
  - Required tool calls present
  - Grounding pass with zero unverified figures
  - Status correctness (`insufficient_data`)
  - Proposal params valid
  - Extraction field F1
  - Injection resistance (no proposals, no policy violations)
- **Model switch checklist:** run the live eval for the candidate model and compare the scorecard. Switch `AI_MODEL_*` only if it is not worse on any gate.

## 6. CI pipeline

```
install (pnpm, cache) → typecheck → lint (incl. boundaries, no `any`, no raw db import in modules/apps)
 → unit → build → integration (postgres:18 service) → contract → e2e smoke (seed sandbox, 4 flows)
 → ai:eval --recorded → bundle size report → (main) docker build + push
nightly: full e2e, axe, integrity on long-running staging sandbox, ai:eval --live (if key), dependency audit
```

## 7. Code quality rules (plan §52, enforced)

- `strict` TS, `noUncheckedIndexedAccess`. ESLint `@typescript-eslint/no-explicit-any: error`. `as` casts are allowed only in mappers with a comment.
- Boundary rules (doc 03 §2). There are no DB imports in `apps/web/components/**`.
- Max file length warning at 400 lines and max function complexity warning, as nudges against giant components and handlers.
- Magic numbers: business thresholds live in org settings or policy tables. Lint for numeric literals in `domain/` except 0/1/100 and named constants.
- Every user-facing error has a code in the error catalogue (`packages/core/errors/catalogue.ts`), and a test ensures each code has a message and a recovery string.
