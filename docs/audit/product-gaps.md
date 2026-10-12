# Product gaps (what stops this being sold to real clients)

Legend: ✅ exists · 🟡 partial · ❌ missing.

| Area | Status | Evidence / gap |
|---|---|---|
| Company onboarding | 🟡 | `app/(app)/setup/page.tsx` covers company profile, warehouses, opening stock/cash. Missing: chart-of-accounts customisation, tax setup, branches as entities, opening receivables/payables, guided import |
| Users, roles, branches | 🟡 | Users admin (`components/app/users-admin.tsx`), 8 fixed roles in `rbac.ts`. Missing: custom roles, per-branch data scoping, permission editor, password self-service, MFA, invitations by email |
| Multi-tenancy / client admin | ❌ | No tenant model; one deployment per client. No admin console for clients, modules, flags |
| Invoicing | 🟡 | Invoices, credit notes, FBR payload (`lib/integrations/fbr.ts`, simulated). Missing: PDF/print templates, configurable numbering (`nextNo("INV-")` literal), document templates, e-mail delivery, real FBR submission |
| Payments | 🟡 | Receipts, cheques lifecycle, supplier payments. Missing: payment gateways, bank file import (reconciliation uses seeded bank lines), multi-account allocation UI |
| Inventory | 🟡 | Stock cells, transfers, counts, adjustments, expiry. Missing: batch/serial/lot tracking beyond expiry display, multiple valuation methods, reorder rules per client, barcode label printing |
| Purchasing | ✅/🟡 | PO → GRN → bill → 3-way match → payment. Missing: RFQ, supplier portal |
| Accounting | 🟡 | Journal, periods, trial balance/P&L/BS/cash flow derived in `queries.ts`. Missing: multi-currency, fixed assets, budgeting, VAT/GST returns, consolidated entities |
| Tax | 🟡 | Pakistan rules, hard-coded 18% in `purchasing.ts:72`/`engines.ts:16`; some rates in `settings`. Other countries ❌ |
| HR / payroll | 🟡 | Employees, leave, payroll run with flat 4.5% tax and EOBI constants (`people.ts runPayroll`); no attendance, slabs, payslips, EOBI/SESSI rules per client |
| Manufacturing | ❌ | Not in scope today |
| Reporting | 🟡 | Statements, 9 report pages, CSV export (`data-table.tsx`). Missing: saved/custom reports, scheduled reports, PDF/Excel with formatting, SQL read models |
| Import / export | 🟡 | CSV export only. **No import** for customers, suppliers, products, stock, balances (the biggest onboarding blocker) |
| Notifications | 🟡 | In-app, mute settings. Email/WhatsApp simulated (`outbox`); no real sender, templates or preferences per user |
| Approvals / workflow | 🟡 | Approval types with limits in `settings`; rule builder (`/automations`) with 3 actions. No multi-step configurable workflow designer |
| Audit trail | 🟡 | Engine audit + append-only tables; no UI filter by user/entity beyond `/settings/audit`; no security events |
| Localisation | ❌ | Rs/Pakistani number format hard-coded (`lib/format.ts`), English only (Urdu deferred), fiscal year July–June fixed (`lib/data/dates.ts`), Asia/Karachi |
| Currency | ❌ | PKR only |
| Mobile | 🟡 | Responsive layouts and mobile warehouse screens; installable PWA with offline queue (`public/sw.js`). No native apps |
| API for integrations | ❌ | Only the internal command API; no public REST contract, API keys, webhooks, or OpenAPI document |
| Customisation without forking | ❌ | Edition/env flags only; no feature-flag store, no plugin hooks, no per-client settings schema |
| Deployment | 🟡 | `docker-compose.yml`, `docs/SELF-HOSTING.md`. Missing: TLS/reverse proxy config, zero-downtime strategy, migration runner as a deploy step, backup automation, monitoring, upgrade path for existing data (A-1 makes upgrades risky) |
| Support tooling | ❌ | No client health dashboard, impersonation, data export per tenant, usage metering |
| AI | 🟡 | Assistant, bill reader, agents page; scheduled agents and voice not built; no per-tenant usage metering |

## Top blockers for a first paying client (ordered)
1. Persistence integrity (A-1) and exact money (A-4): the books must be right and stable across upgrades.
2. Authorization completeness (S-1..S-3).
3. Import for customers/suppliers/products/opening balances.
4. Configurable document numbering, tax rates and print/PDF invoice.
5. Real clock (A-9) and real notification sending.
6. Backups, TLS, monitoring, a documented upgrade procedure.
