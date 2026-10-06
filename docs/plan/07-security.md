# 07: Security, Tenancy, RBAC & Audit

## 1. Authentication (Better Auth, authN only)

- **Sign-in:** email and password. Better Auth hashes with scrypt by default. The password policy is at least 10 characters plus a breached-password check (k-anonymity HIBP API, off in demo).
- **Sessions:** DB-backed and revocable, with a rolling 7-day expiry and a 12-hour idle timeout for finance roles. The cookie is `__Secure-` prefixed, `HttpOnly`, `Secure`, and `SameSite=Lax`.
- **2FA:** TOTP is available, and required for Owner and Finance Manager in non-demo orgs (org setting).
- **Account protection:** login rate limit (5 per 15 min per IP+email), lockout with backoff, and email verification and password reset via the Email connector.
- **Better Auth's organization plugin is *not* used for authorization.** We keep `memberships`, `roles`, and `role_permissions` ourselves, because we need scoped permissions (all/branch/own) and audit integration. Better Auth only gives us `user` and `session`.
- **Org switching:** the active org is stored in the session. A switch re-validates membership and writes an audit event.
- **Demo persona login:** `/demo` → choose a persona → a server provisions or assigns a sandbox and creates a session for that persona's user. No password is involved. This is only available when `DEMO_MODE=true`, the target org is `is_demo`, and the route is rate-limited and Turnstile-protected (optional).

## 2. Multi-tenancy & Row Level Security

**Layer 1: application.** Every repository function takes a `TenantTx`, which can only be obtained from `withTenant(orgId, fn)`. There is no un-scoped query API in module code; lint rules block importing the raw `db`.

**Layer 2: Postgres RLS** (fail-closed):

```sql
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invoices
  USING (organization_id = current_setting('app.org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.org_id', true)::uuid);
```

```ts
export async function withTenant<T>(orgId: string, fn: (tx: TenantTx) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`); // tx-local → safe with PgBouncer txn mode
    await tx.execute(sql`select set_config('app.user_id', ${ctx().userId ?? ''}, true)`);
    return fn(tx as TenantTx);
  });
}
```

- A missing setting gives `NULL`, which matches no rows. Queries outside `withTenant` return nothing, so they fail closed rather than leaking.
- Policies are generated for every table with `organization_id` by a migration helper, and a **CI test enumerates all tables** and asserts that RLS is enabled and forced.
- **Composite foreign keys** `(organization_id, x_id)` stop cross-tenant references even from bugged writes.
- **Tenant isolation test suite:** seed two orgs. For every list and get API and every AI tool, call as org A with IDs from org B and assert 404 or empty. This runs in CI.

## 3. RBAC

**Permission catalogue in code** (string-literal union, synced to `permissions`):

```
overview.read
sales.leads.{read,write}       sales.customers.{read,write,credit.request,credit.approve}
sales.quotes.{read,write}      sales.orders.{read,create,confirm,cancel,approve}
sales.discount.{up_to_2pct,up_to_5pct,unlimited}
sales.invoices.{read,create,approve,void}   sales.payments.{read,record,allocate}
inventory.{read,adjust,transfer,count,count.approve}   warehouses.{read,manage}
procurement.{requests,rfqs}.{read,write}   procurement.orders.{read,create,approve}
procurement.receipts.{read,post}           procurement.bills.{read,create,approve,post}
procurement.payments.{read,create,approve} suppliers.{read,write}
finance.accounts.{read,manage}  finance.journals.{read,create,post,reverse}
finance.periods.{close,reopen}  finance.bank.{read,reconcile}  finance.reports.read
finance.tax.manage              finance.payments.approve
expenses.{submit,read.own,read.all,approve.manager,approve.finance}
hr.employees.{read.own,read,write}  hr.salary.read  hr.leave.{request,approve}  hr.payroll.{read,run}
reports.{read,export}  ai.{use,command_center,proposals.confirm,settings}
automations.{read,manage}  integrations.{read,manage}  approvals.{read,decide}
settings.{org,users,roles}  audit.read  system.health
```

**Scopes:**
- `all`: the whole org.
- `branch`: records whose `branch_id` is in the membership's `branch_scope`, or the warehouse's branch.
- `own`: records where `sales_rep_id`, `created_by`, `employee_id`, or `assignee_id` = me.

Scopes are applied as query predicates by a `scopeFilter(ctx, resource)` helper and checked again on single-record access.

**System roles (seeded; custom roles editable in Settings → Roles):**

| Capability | Owner | Admin | Finance Mgr | Sales Mgr | Sales Rep | Warehouse Mgr | Procurement Mgr | Employee |
|---|---|---|---|---|---|---|---|---|
| Overview & AI Brief | ✓ | ✓ | ✓ | sales view | own KPIs | ops view | proc. view | — |
| Customers / Sales | all | all | read | all | **own** | read (orders) | read | — |
| Discount authority | unlimited | 5% | — | 5% | 2% | — | — | — |
| Invoices approve | ✓ | ✓ | ✓ | — | — | — | — | — |
| Inventory | all | all | read | read | read avail. | **branch**: adjust/transfer/count | read | — |
| Count/adjust approve | ✓ | ✓ | ✓ (value) | — | — | ✓ (≤50k) | — | — |
| Purchasing | all | all | read + bills | — | — | receipts | all | — |
| PO approve | ✓ | ✓ | — | — | — | — | ✓ (≤1M) | — |
| Finance (GL, journals, bank, close) | all | read | all | — | — | — | — | — |
| Period reopen | ✓ | — | request | — | — | — | — | — |
| Expenses | all | all | approve finance | approve team | submit own | approve team | approve team | submit own |
| Employees / salary | all / ✓ | all / — | read / ✓ | team / — | — | team / — | team / — | own |
| Reports | all | all | finance+all | sales | own | inventory | purchasing | — |
| AI Command Center | ✓ | ✓ | ✓ | ✓ | limited tools | ✓ | ✓ | — |
| Confirm AI proposals | ✓ | ✓ | ✓ (finance) | ✓ (sales) | own drafts | ✓ (inv.) | ✓ (proc.) | — |
| Automations, Integrations, Users/Roles | ✓ | ✓ | read | — | — | — | — | — |
| Audit log | ✓ | ✓ | ✓ | — | — | — | — | — |
| Org ownership / delete / billing | ✓ only | — | — | — | — | — | — | — |

**Enforcement points:**
1. The route contract declares `permission`, checked by `defineRoute`.
2. The application service calls `authorize(ctx, perm, resource?)`. This is the authoritative check, because services are also called by RSC pages, AI tools, and jobs.
3. Scope predicates apply to queries.
4. The UI hides what the user can't do, using permissions from the session DTO. This is UX only and never the security boundary.

**Field-level controls:** salary and CNIC are masked unless the user holds `hr.salary.read` or `hr.employees.read`. Supplier IBANs are masked unless `procurement.payments.create` is held. This is enforced in DTO mappers.

## 4. Audit log

- **What is audited:** every command that mutates, plus sensitive reads (salary view, export of customer lists, audit log export), auth events (login, failed login, 2FA change, session revoke), permission and role changes, integration config changes, and AI proposal confirm/reject.
- **Record contents** (plan §24): user, org, action (`sales.invoice.approved`), entity type/id, before/after (sanitised) plus a computed diff, timestamp, IP and user agent, source (`user`, `system`, `ai_proposal`, `workflow`, `integration`, `import`), `ai_request_id`, `ai_proposal_id`, `approval_id`, and `request_id`.
- **Human-readable rendering** uses message templates per action: *"Ayesha Siddiqui approved AI-extracted coding for supplier bill SB-2026-0183 (Indus Beverages, Rs 1,840,000) with 1 accepted price variance."*
- **Tamper evidence:**
  - Per-org hash chain (`hash = sha256(prev_hash ‖ canonical_json(row))`).
  - The app DB role has INSERT/SELECT only.
  - The nightly `erp_verify_audit_chain()` job reports results on System Health.
  - Optional: a daily anchor hash emailed or exported for external notarisation (v2).
- **UI:**
  - A global audit explorer with filters (actor, entity, action, source=AI, date) and export.
  - An **Activity** tab on every entity detail page showing that entity's timeline, merged with comments and notifications.

## 5. Web security

| Control | Implementation |
|---|---|
| CSRF | SameSite=Lax cookies, `Origin`/`Sec-Fetch-Site` check on all non-GET `/api/*`, JSON-only bodies (`Content-Type: application/json` required) |
| Input validation | Zod at the route boundary (contracts); domain re-validates invariants |
| Output encoding | React escaping. AI markdown is rendered with a sanitiser (rehype-sanitize allowlist) and links are restricted to app routes and https |
| SQL injection | Drizzle parameterised queries only. The `sql` template is used for hand-written SQL, and string concatenation is linted out |
| Security headers | CSP with nonce (`script-src 'self' 'nonce-…'`; `frame-ancestors 'none'`), HSTS, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera allowed only on warehouse scan routes) |
| Rate limiting | Auth, AI, search, export, upload, and demo provisioning, via a Postgres token bucket |
| File uploads | Size limit, magic-byte MIME check (`file-type`), extension allowlist (pdf, png, jpg, webp, csv), filename sanitising, random storage keys, served only via **signed URLs** (5-minute TTL, HMAC) with `Content-Disposition: attachment` for non-images. PDFs are rendered via pdf.js in a sandboxed viewer. Antivirus hook interface (ClamAV optional) |
| Secrets | Env only, validated at boot. Integration secrets are AES-256-GCM encrypted in the DB with a key ID for rotation. Never logged (pino redact). Never sent to the client |
| Encryption | TLS (Caddy/HSTS) in transit. Postgres volume/disk encryption at rest per host, and S3 SSE in production |
| Dependency hygiene | `pnpm audit` in CI, Renovate, pinned Next.js patch (track security releases) |
| Error disclosure | problem+json with a reference ID. Stack traces only in server logs |
| Demo abuse | Sandboxes are isolated per visitor and TTL-purged. Outbound integrations are simulated in demo orgs (enforced in the connector layer, not just the UI). Uploads in demo are capped at 5 per session |

## 6. Threat model highlights

| Threat | Mitigation |
|---|---|
| Cross-tenant read via IDOR | RLS + composite FKs + isolation test suite |
| AI exfiltrates data beyond the user's rights | Tools run as the user with scopes; no raw SQL; row caps |
| AI performs an unauthorised mutation | No write tools; proposals need human confirmation, and approval policies still apply |
| Prompt injection via customer notes or OCR text | Data delimiting; propose-only tools; eval cases |
| Insider posting a backdated entry | Closed-period trigger; manual JE approval; journal anomaly detector; audit chain |
| Approval of stale data | Snapshot hash → `stale` |
| Self-approval | Segregation-of-duties check in the engine |
| Replay or double submit | Idempotency keys; gapless numbering under lock |
| FBR token leakage | Encrypted at rest; only the worker decrypts; never in demo orgs |
