# 01: Research Findings (as of 2026-10-05)

Each finding comes with a **design implication**. Tax facts are used as *seed defaults* for the demo. They live in effective-dated configuration tables and must be validated by a Pakistani tax advisor before any production use.

---

## 1. FBR Digital Invoicing (e-invoicing) is now mandatory

**Findings**
- Every sales-tax-registered person must send invoices to FBR **in real time** through the Digital Invoicing API run by PRAL. There is no turnover threshold and no sector carve-out. The rollout was phased under SRO 1852(I)/2025, and all active sales-tax filers had to integrate by **31 Jul 2026**. Enforcement is active.
- Each invoice must carry an **FBR invoice number (IRN)** obtained before the sale completes, plus a **QR code** of at least 2×2 cm.
- **Sales Tax General Order 01 of 2026** lets a registered person use one or more licensed integrators, or integrate directly with PRAL. Invoices can be cancelled or edited **within 72 hours** without Commissioner approval. After 72 hours, Commissioner approval is required.
- **Finance Act 2026** added power to blacklist or suspend registration for anyone who fails to integrate. It requires invoices for exempt supplies and *advance receipt invoices*. Debit and credit notes now go through an electronic mechanism tied to digital invoicing.
- API shape (PRAL, per integrator write-ups):
  - Endpoints: `validateinvoicedata`, `postinvoicedata` (production: `https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata`; sandbox uses the `_sb` suffix), plus cancel.
  - Auth: a Bearer token from IRIS, tied to the NTN.
  - Payload header: seller NTN/CNIC, name, province, address; buyer NTN/CNIC, name, province, address, `buyerRegistrationType`; `invoiceType`, `invoiceDate`, `invoiceRefNo`.
  - Payload lines: `hsCode`, `productDescription`, `quantity`, `uoM`, `saleType` (e.g. "Goods at Standard Rate", "3rd Schedule Goods"), `rate`, `valueSalesExcludingST`, `salesTaxApplicable`, `salesTaxWithheldAtSource`, `furtherTax`, `extraTax`, `fedPayable`, `discount`, `fixedNotifiedValueOrRetailPrice`, `sroScheduleNo`, `sroItemSerialNo`.
  - Response: `invoiceNumber` (the IRN) and a QR code.
  - 400 errors must not be retried. 5xx errors and timeouts are retried with backoff. There are 28 sandbox scenarios to pass, covering standard, 3rd Schedule, reduced, exempt, further tax, and debit/credit notes.

**Design implications**
- `integrations/fbr-digital-invoicing` is a **Tier-1 connector**, not a Tier-3 add-on. It runs in three modes:
  - `simulated`: the default for the demo. It generates a clearly marked `SIM-` IRN and a QR code that says "Simulated – not transmitted".
  - `sandbox`: real PRAL sandbox.
  - `live`.
- Invoice lifecycle: `Approved → FBR pending → FBR accepted (IRN) → Sent`. When live, an invoice cannot be printed as final without an IRN. If FBR is down, the submission queues with retries and the user sees the status.
- Every product needs an **HS code** and a **sale type**. Every customer needs **registration type, NTN/CNIC, STRN, province, and ATL status**.
- The UI shows a 72-hour edit window ("Editable for 41h more"). After the window closes, corrections go only through credit or debit notes linked to the original IRN.
- Outbound payloads are persisted, idempotent on `invoiceRefNo`, and fully audited. A daily reconciliation job compares invoices sent against invoices accepted.

## 2. Sales tax and advance income tax for an FMCG distributor

**Findings**
- Standard sales tax rate is **18%**.
- **Third Schedule** goods are taxed at 18% of the **printed retail price**. **Finance Act 2026 greatly expanded the Third Schedule for FMCG** when sold in retail packing. New items include vegetable and animal fats and oils, sugar confectionery, pasta and noodles, sauces and ketchup, fermented beverages, milk and infant preparations, hair preparations, cosmetics and toiletries, tissue paper, jams, insecticides and disinfectants, and plastic household articles. Most of Meridian's catalogue is therefore retail-price-taxed.
- **Further tax of 4%** applies to taxable supplies to persons who are unregistered or not on the active taxpayer list. A proposal to abolish it in Budget 2025-26 was blocked by the IMF, so it is still in force as of our sources. Treat it as a configurable rule.
- **Section 236G (income tax):** manufacturers and commercial importers collect advance tax from distributors and wholesalers when selling to them. The rate is 0.1% for ATL buyers and 2% for non-ATL buyers (non-fertilizer goods). This is **adjustable**. Meridian *pays* this on purchases.
- **Section 236H:** manufacturers, distributors, and wholesalers collect advance tax on sales to retailers (0.5% ATL / 2.5% non-ATL) and to wholesalers (0.5% / 1%). Meridian *collects* this on sales and pays it over to FBR.
- **Finance Act 2026, minimum tax (s.113):** the term "FMCG" was removed from the reduced-rate list. FMCG and pharma distributors move to the **standard 1.25%** minimum tax. Wholesaler-cum-retailers with turnover above PKR 200M are now **Tier-1 retailers**.
- Section 8B: the Board can now raise or lower the adjustable input-tax limit depending on a registrant's e-invoicing and POS compliance.
- Services are taxed provincially (SRB, PRA, KPRA, BRA). This matters for freight and warehousing expenses.

**Design implications**
- Tax is a **rules engine with effective dating**:
  - `tax_codes` (rate, basis = `value` | `retail_price`, sale type for FBR)
  - `tax_rules` (conditions: buyer registration, ATL status, buyer channel, product tax category, province, date range)
  - `withholding_rules` (236G and 236H as separate rule types)
- The pure function `computeDocumentTaxes(doc, parties, date, ruleset)` returns per-line breakdowns *with the IDs of the rules that fired*. That makes tax explainable in the UI and in AI answers.
- `products.retail_price` (MRP) is versioned (`product_retail_prices` with effective dates), because Third Schedule tax depends on it.
- `customers.atl_status` stores a `verified_at` date. The ERP warns when the status is older than 30 days. In demo mode, ATL verification is a simulated integration.
- Purchase bills record 236G paid as an **asset** (advance income tax, adjustable). Sales invoices record 236H collected as a **liability**.
- The UI shows the disclaimer "Tax rules configured for demo – verify with your tax advisor" on the tax settings screen. No rate is ever hard-coded outside seed data.

## 3. How Pakistani FMCG distribution actually works

These are the practices that make the demo feel local. Each one is either implemented or explicitly deferred in doc 02.

| Practice | What it means | Where it lands |
|---|---|---|
| **Principals** | Distributors buy from manufacturers and importers ("principal companies") and often hold exclusive territories | Suppliers carry a `is_principal` flag, territory, and scheme agreements |
| **Order booker → delivery** | Order bookers visit shops on **routes/beats** and book orders. Delivery happens the next day from the warehouse | Sales reps and routes; SO status; pick list → **Delivery Challan** → **Gate Pass** |
| **Trade schemes** | e.g. "10+1" free goods, slab discounts, period-bound trade offers funded by the principal | Pricing engine `trade_schemes`. Free-goods cost posts to *Scheme expense* and creates a **claim receivable from the principal** |
| **Principal claims** | Distributors claim back scheme costs, expired and damaged stock, and price differentials | `principal_claims` document. AI flags claims that were never filed |
| **Units** | Ordering in **cartons**, retail in **packs** and **pieces** | `product_uoms` with conversion factors. The ledger always uses the base unit |
| **Cheques & PDCs** | Retailers pay with post-dated cheques. Bounces are common and signal risk | `payment_instruments` lifecycle: received → deposited → cleared / bounced. Bounces feed the risk score |
| **Cash with salesmen** | Delivery staff collect cash on route and deposit it later | GL account "Cash with salesmen (in transit)" plus a deposit workflow |
| **Credit days** | 7/15/30/45-day terms by channel. Modern trade gets longer terms | Payment terms master; credit check on SO confirm |
| **Market returns / expiry** | Expired and damaged returns from shops | Sales returns with condition (`resellable` / `damaged` / `expired`) → quarantine location → claim |
| **Seasonality** | Ramadan (syrups, dates, beverages, cooking oil), Eid, summer beverage peak, school season (snacks) | Event calendar feeds the simulation *and* the forecast engine |
| **Fiscal year** | July–June (FY 2026-27 started 1 Jul 2026) | `fiscal_years` default Jul–Jun; period labels like "P04 FY26-27" |
| **Formatting** | `PKR`/`Rs`; Western grouping in ERPs, lakh/crore in conversation | Default `Rs 12,345,679.00`; optional compact format `Rs 1.23 Cr` / `Rs 12.3 L` on KPI tiles |

Lunar dates for seeding and forecasting: Ramadan 2026 ≈ 18 Feb–19 Mar; Eid ul-Fitr ≈ 20 Mar 2026; Eid ul-Adha ≈ 27 May 2026; Ramadan 2027 ≈ 8 Feb 2027. These are stored as data (`calendar_events`), never hard-coded.

Note: `Intl.NumberFormat('en-PK', {style:'currency', currency:'PKR'})` drops decimals (`Rs 12,345,679`). Always set `minimumFractionDigits` explicitly. `en-IN` gives lakh grouping (`1,23,45,678`) if that's ever wanted.

## 4. Competitive landscape (positioning)

- **Odoo / ERPNext** dominate Pakistani SMEs through local partners. FBR integration is the main selling point. ERPNext implementations start at about PKR 500k.
- **SAP Business One** costs about PKR 420k per user and has no native FBR digital invoicing.
- **Local cloud ERPs** (AmalERP, Logic Layer, and others) cost PKR 2.5k–10k per month and lead with FBR, POS, and SRB compliance.

**Implication:** FBR compliance is table stakes. Our differentiation is (a) AI that prepares decisions with evidence and an approval trail, (b) Linear-grade UX, and (c) distribution-specific depth: schemes, claims, PDCs, routes. The demo has to show all three in the first two minutes.

## 5. AI provider constraints (OpenRouter free tier)

**Findings**
- About 20 free models are available (IDs end in `:free`), plus an `openrouter/free` router. Most support tool calling. Current examples include `nvidia/nemotron-3-super-120b-a12b:free`, `google/gemma-4-31b-it:free`, `qwen/qwen3.8-27b:free`, `thinkingmachines/inkling:free`, and `poolside/laguna-xs-2.1:free`. **The list changes month to month.**
- Free limits: **20 req/min**, **50 req/day** with no credits, **1,000/day** once $10 of credits has been bought. Failed requests count toward the cap.
- Free providers may log prompts. That's acceptable for synthetic demo data, but never for real customer data. This needs to be in the production configuration notes.
- AI SDK 6 (Vercel) folds structured output into `generateText(... output: Output.object())` and deprecates `generateObject`. The `@openrouter/ai-sdk-provider` package supports tools, JSON schema, and a response-healing plugin.

**Design implications**
- Model tiers (`fast`, `reasoning`, `vision`) each take an **ordered fallback list** from env. A boot-time check against `/api/v1/models` warns when a configured model has disappeared.
- **Budgeting is a core feature:**
  - Daily insights are precomputed and shared across identical sandboxes through a cache keyed on a data fingerprint.
  - Each session gets a per-session question budget.
  - A global daily counter switches to the deterministic analysis when exhausted. That output is labeled "AI quota reached – showing computed analysis", never disguised as LLM output.
- Free models are weaker at multi-step tool use. Keep agent loops short (≤6 steps), constrain them with intent schemas, validate everything, and allow one repair retry.
- **Recommendation:** buy the $10 of credits. It raises the cap 20× for a negligible cost.

## 6. Stack versions (verified on npm on 2026-10-05)

| Package | Version | Note |
|---|---|---|
| next | 16.3.8 | 16.3 adds "Instant Navigations". Next 15 reaches EOL on 21 Oct 2026. Track security releases (there was one in Sep 2026) |
| react | 19.2.x | |
| drizzle-orm | 0.45.x | First-class Postgres RLS policy modeling (`pgPolicy`, roles) |
| better-auth | 1.7.x | Organizations, sessions, 2FA, rate limiting |
| pg-boss | 12.x | Postgres `SKIP LOCKED` queue. **Can enqueue inside the business transaction** |
| zod | 4.3.x | Native `z.toJSONSchema()` for tool schemas and OpenAPI |
| tailwindcss | 4.3.x | CSS-first config, `@theme` tokens |
| @tanstack/react-table | 9.x | Major bump from v8. Check the migration notes |
| @tanstack/react-query | 5.x | |
| ai (Vercel AI SDK) | 7.0.x | Used *inside* our provider adapters only |
| PostgreSQL | 18 | Native `uuidv7()` gives time-ordered IDs that index well |
| Node.js | 24 LTS (22 works locally) | Local machine has 22.22, pnpm 10.34, Docker 29.7 |

Local dev environment note: there's no `psql` on the host, so Postgres runs in Docker Compose. Avoid depending on MinIO community images, since their distribution changed in 2025. Use a local-disk storage driver in development and any S3 API (R2, S3, Backblaze) in production.

## Sources

- FBR STGO 01 of 2026: https://download1.fbr.gov.pk/Docs/2026331133557466STGO01of2026.pdf
- Profit: multiple integrators for e-invoicing: https://profit.pakistantoday.com.pk/2026/04/01/fbr-allows-multiple-integrators-for-e-invoicing-integration/
- ProPakistani: 72-hour correction window: https://propakistani.pk/2026/03/31/fbr-cracks-down-on-tax-errors-but-gives-businesses-72-hours-to-correct-invoices/
- Integrating with the FBR DI API (technical): https://dev.to/tallied/integrating-pakistani-businesses-with-the-fbr-digital-invoicing-api-1glk
- FBR Digital Invoicing 2026 guide: https://www.switchertechno.com/fbr-digital-invoicing-guide-pakistan
- KPMG, *A Brief of Finance Act 2026*: https://assets.kpmg.com/content/dam/kpmgsites/pk/pdf/2026/07/A%20Brief%20of%20Finance%20Act%202026.pdf.coredownload.inline.pdf
- Finance Act 2026 (Gazette): https://download1.fbr.gov.pk/Docs/20266291261044366FinanceAct2026.pdf
- FBR Withholding Tax Rate Card TY2027: https://download1.fbr.gov.pk/Docs/202681113864992WithholdingTaxRatesCard2027.pdf
- 236G/236H explainer: https://corptaxsolution.com/understanding-sections-236g-236h-what-they-mean-for-your-business/
- Business Recorder, 4% further tax / IMF: https://www.brecorder.com/news/40374481
- Business Recorder, minimum tax for traders: https://www.brecorder.com/news/40425441
- OpenRouter free models list: https://costgoat.com/pricing/openrouter-free-models
- OpenRouter rate limits: https://openrouter.zendesk.com/hc/en-us/articles/39501163636379-OpenRouter-Rate-Limits-What-You-Need-to-Know
- AI SDK 6: https://vercel.com/blog/ai-sdk-6 · OpenRouter AI SDK provider: https://github.com/OpenRouterTeam/ai-sdk-provider
- Drizzle RLS: https://orm.drizzle.team/docs/rls
- BullMQ vs pg-boss: https://www.pkgpulse.com/guides/bullmq-vs-bee-queue-vs-pg-boss-job-queues-nodejs-2026
- Next.js 16.3: https://nextjs.org/blog/next-16-3
- Pakistani ERP market: https://www.mantechit.com/blog/best-erp-software-in-pakistan/ · https://www.smart-nexus.com/blog/erpnext-vs-odoo-pakistan
