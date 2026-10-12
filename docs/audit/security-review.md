# Security review

Method: code reading plus a programmatic comparison of the 50 command handlers against the API permission map. Nothing was exploited against a live system. Severity = impact if the backend were exposed to real customers.

| ID | Sev | Finding |
|---|---|---|
| S-1 | High | AI chat trusts a client-supplied role (fixed R0) |
| S-2 | High | 28 of 50 commands have no API-layer permission check (fixed R1) |
| S-3 | High | Payload identity is not bound to the signed-in user (IDOR) (fixed R1) |
| S-4 | High | History is recomputed by current code (integrity, see A-1) |
| S-5 | Medium | Tokens and full company data stored unencrypted in `localStorage` |
| S-6 | Medium | Login throttle is bypassable; weak credential policy |
| S-7 | Medium | Default CORS `*`, database port published with a default password |
| S-8 | Medium | CSV export does not neutralise formulas |
| S-9 | Medium | Client-supplied timestamp and command id accepted |
| S-10 | Low | No audit of security events; no structured logging |
| S-11 | Low | In-memory rate limits (AI, login) |
| S-12 | Info | No tenant isolation (by design today) |

## S-1 AI chat trusts a client-supplied role (High)
`frontend/src/app/api/chat/route.ts:26` reads `role`, `user` and `commands` from the request body; line 32 passes `body.role` to `runTool(name, args, body.role)` (the gate in `lib/ai/tools.ts` `TOOL_ROLES`), and line 38 puts it in the system prompt. In remote mode the world is built from the caller's token (`makeRemoteWorld`), which contains the whole company's data; the role gate is then the only thing keeping a Warehouse user away from finance figures, and the caller can simply send `"role":"owner"`. `/api/chat` and `/api/extract` also work without any session in demo mode (acceptable for the public demo, not for remote mode).
*Fix:* in remote mode, ignore body role, fetch `/api/me` with the token server-side and use that role; reject calls with no valid token.

## S-2 Missing API-layer authorization (High) — FIXED in R1
All 50 commands now have an entry in `frontend/src/lib/engine/permissions.ts` (a `Record<CommandType, …>`, so a new command without a permission does not compile); the API refuses anything not listed. `backend/tests/api.test.ts` runs every command against every role (400 combinations). Original finding:
`backend/src/server.ts` `NEEDS` maps 22 commands to a permission. These 28 commands have **no** API-level check: `BounceCheque, CancelOrder, ClearCheque, ConfirmBankMatch, ConfirmOrder, CreateQuote, CreateRule, CreateWarehouse, DecideApproval, DepositCash, DepositCheque, MarkDelivered, MoveLead, PostManualJE, PostOpeningCash, PostOpeningStock, QueueMessage, ReleaseCreditHold, RequestCreditHold, RequestCreditLimit, RequestCreditOverride, ResolveBill, SetClaimStatus, SetQuoteStatus, SetRule, SetupCompany, SubmitExpense, SubmitLeave`.
Some are protected inside the engine (`SetupCompany`, `CreateWarehouse`, opening balances via `setup.ts denied()`; `DecideApproval` via `approvals.ts canDecide`; `ClosePeriod` via `finance.ts`). Others are not: any signed-in user (including `employee` and `rep`) can call `PostManualJE` (finance.ts; only large entries route to approval), `ClearCheque`/`BounceCheque`/`DepositCash` (cash movements), `ConfirmBankMatch`, `CreateRule`/`SetRule` (automation rules), `ResolveBill`, `ReleaseCreditHold`, `QueueMessage`, `CancelOrder`.
*Fix:* default-deny. Every command declares its required permission in one registry; the API refuses any command without one. (Permission changes need your approval.)

## S-3 Identity not bound to payload (High, IDOR) — FIXED in R1
`backend/src/scope.ts` rewrites `employeeId` to the signed-in user's employee for leave and expenses (HR roles may file for others), forces `requestedBy` for credit requests, and limits reps to their own customers and leads. Original finding:
`people.ts`: `submitLeave(ctx, {employeeId,…})` and `submitExpense(ctx, {employeeId,…})` use the payload's `employeeId`; nothing checks that it is the caller's employee (`users.emp_name`) unless the caller has an HR role. Any user can file leave or expenses for anyone, which then generates approvals "requested by" that person. Similar data-scoping gaps: reps are restricted to their customers only in the UI (`sales/orders/new/page.tsx`, `customers/page.tsx` filter by `repId`); the server does not enforce "own records" for `rep`. `rbac.ts` itself says: "UI hiding is UX only; the real boundary will be server-side" — that boundary is only partly built.

## S-4 Recompute-on-boot integrity risk (High)
See A-1. Security angle: anyone with deploy rights can change engine code and alter the apparent history without a trace in stored data; the audit trail cannot prove past results.

## S-5 Sensitive data in `localStorage` (Medium)
`frontend/src/lib/engine/remote.ts` stores `meridian-token` (a bearer JWT valid 8 h), `meridian-outbox` (unsent command payloads) and `meridian-world` (the **entire** bootstrap: all commands, therefore all customers, prices, payments) as plain JSON. Any XSS or shared-computer access exposes the whole company. React escapes output and the codebase has 0 `dangerouslySetInnerHTML`, which lowers XSS risk, but a single dependency compromise would be enough. `signOut()` clears them; token expiry does not.
*Fix options:* shorter tokens + refresh in an httpOnly cookie, encrypt the offline cache with a key derived from the session, or limit cached data to what the role may see.

## S-6 Login hardening (Medium)
`backend/src/server.ts` login throttle is keyed on `x-forwarded-for` (client-controlled unless a trusted proxy sets it) plus email, in process memory (`auth.ts throttled`); rotate the header to defeat it. No lockout, no MFA, minimum password length 8, no self-service password change or reset (admin reset only), no breach/complexity checks. scrypt with random salt and timing-safe compare are correct (`auth.ts`).

## S-7 Deployment defaults (Medium)
`backend/src/config.ts`: `CORS_ORIGIN` defaults to `*`; `docker-compose.yml` passes `${CORS_ORIGIN:-*}`, publishes Postgres on `0.0.0.0:5433` with password `${DB_PASSWORD:-meridian}`, and runs the API on plain HTTP. The JWT secret has a dev default and is only refused when `NODE_ENV=production` (set in `backend/Dockerfile`, not for `pnpm start`). The `.env` created locally for compose contains a generated secret (git-ignored; verified no secret in git history for `sk-or-v1` or JWT strings).

## S-8 CSV formula injection (Medium)
`frontend/src/components/app/data-table.tsx:111` escapes quotes only. Cells starting with `=`, `+`, `-`, `@` (for example a customer named `=HYPERLINK(...)`) execute in Excel. *Fix:* prefix such cells with `'`.

## S-9 Client-controlled timestamp and id (Medium)
`backend/src/server.ts` `/api/commands` accepts `at` (±24 h) and `id` from the client (`world.ts submit`). Audit and document timestamps can be shifted by a day; ids are validated by regex and uniqueness only. Server time should be authoritative; the client id is needed only for deterministic ids and can be namespaced by tenant and user.

## S-10 Logging and audit (Low)
No record of logins, failures, role changes or user creation in `audit_log` (only engine events are audited). Logs are `console.log`. `commands` is append-only (trigger), which is good evidence for business actions.

## S-11 Rate limiting (Low)
`/api/chat` limits per IP in a process-local map (`route.ts limited()`); behind serverless it resets per instance.

## S-12 Tenant isolation (Info)
There is nothing to isolate yet. Treat as the top item of the SaaS roadmap.

## Positive controls observed
Parameterised SQL everywhere (`pg` `$n` placeholders, no string-built SQL); scrypt password hashing; role and active flag re-read from the database on every API request (`server.ts guard`) so role changes and disabling apply immediately; users cannot demote/disable themselves or the last Owner; append-only ledger/command/audit tables; stale-client detection (`baseSeq`) and idempotent command ids; AI tools are read-only except `propose_*`, which require a human Confirm; secrets are git-ignored.

## Not verified
No dependency vulnerability scan (`pnpm audit`) was run; no penetration test; file uploads exist only for bill images sent to `/api/extract` (size/type limits not reviewed).
