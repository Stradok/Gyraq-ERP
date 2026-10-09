# Migration guide: from the demo engine to a real backend and a paid AI provider

## 1. How the demo works today

```
UI (Next.js pages)
  └─ run("DispatchOrder", payload)            frontend/src/lib/engine/client.ts
       └─ execute(db, command)                frontend/src/lib/engine/commands.ts
            └─ handler(ctx, payload)          engine/{masters,sales,purchasing,inventory,finance,approvals,people}.ts
                 ├─ validates → returns a friendly Problem (title, detail, recovery) on failure
                 ├─ mutates the in-memory DB atomically (stock, documents)
                 ├─ posts balanced journal entries (engine/core.ts postJE; closed periods and control accounts guarded)
                 └─ writes audit + notifications + workflow automations
```

* The "database" is the seeded simulation (`lib/data/sim.ts`) plus a **command log** stored in the browser. On load the
  log is replayed onto a fresh seed. The log is dropped when the calendar day changes, because the seed is anchored to today.
* Entity ids are derived from the command id (`engine/core.ts newId`), so replaying a log is deterministic.
* The assistant's server route replays the caller's log per request (`engine/server-world.ts`), so AI answers reflect
  what the user did in this session.
* `pnpm test:engine` replays a full scenario and checks the books after every step: trial balance, AR and AP
  subledgers vs the ledger, stock value vs ledger, no negative stock, and that replay is identical.

## 2. Moving to a real backend (suggested order)

1. Create `backend/` (Node + TypeScript). Move `frontend/src/lib/engine/*` and `lib/engines.ts` there unchanged.
   They have no React or browser dependencies.
2. Replace the in-memory `DB` with repositories over PostgreSQL (schema in `docs/plan/04-data-model.md`).
   Each command handler already works on a single unit of work: wrap `execute` in one database transaction,
   keep `postJE`'s invariants as deferred constraint triggers, and add tenant RLS.
3. Expose one endpoint per command: `POST /api/v1/commands/:type` with `Idempotency-Key` and the same JSON payload.
   The response is the existing `Result` (`ok` + `message` or a `Problem`). Add authentication and take `actor`/`role`
   from the session instead of the request body.
4. In `frontend/src/lib/engine/client.ts` replace the local `execute(...)` call with `fetch`. Nothing else in the UI changes.
5. Replace `lib/data/queries.ts` (derived data) with SQL views or read endpoints. The signatures are already what the pages use.
6. Replace the browser command log with the server as the source of truth and delete `replayAll`.
7. Move `Notification`, `AuditEvent` and `Approval` writes behind the outbox/queue described in the plan pack.

## 3. AI provider

All model access goes through `frontend/src/lib/ai/provider.ts`. Pages never import a vendor SDK.

| Variable | Meaning |
|---|---|
| `AI_PROVIDER` | `openrouter` (default), `anthropic` or `gemini` |
| `OPENROUTER_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` | Server-side key for the chosen provider |
| `AI_MODEL_REASONING` | Comma-separated model chain for the assistant and Command Center |
| `AI_MODEL_FAST` | Cheap model for classification-style tasks |
| `AI_MODEL_VISION` | Model for document extraction (`/api/extract`) |

Switching to Claude or Gemini is an environment change only:

```
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
AI_MODEL_REASONING=claude-sonnet-5-5
AI_MODEL_VISION=claude-sonnet-5-5
```

Notes:
* Free OpenRouter models change often and are rate limited (about 50 requests a day without credits). Qwen 3.8 27B was
  removed from the free list in October 2026. Keep the chain in env, and run the demo with a funded key for real use.
* Document extraction asks for JSON, validates with Zod and repairs once, so it works on models without JSON-schema output.
* Free providers may log prompts. Do not send real customer data to them. Use a paid provider with a data-processing agreement.
* The assistant can only read data and call `propose_*` tools. Confirming a proposal runs the same command a person would.
