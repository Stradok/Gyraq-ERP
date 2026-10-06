# Build an AI-Native, Production-Grade ERP for a Pakistani Wholesale & Distribution Company

You are acting as a **Principal Full-Stack Engineer, Staff Product Designer, Solutions Architect, and AI Systems Architect**.

Your job is to design and implement a **serious, production-quality ERP platform**, not a mock dashboard, CRUD application, or collection of disconnected pages.

The product is a **demo ERP for our agency/product website**, so it must look and behave like a genuinely deployable enterprise SaaS product that could eventually be sold to real businesses.

The demo company should be a fictional Pakistani wholesale and distribution business:

## Demo Business

**Company:** Meridian Distribution Co.

**Industry:** FMCG / consumer-goods wholesale & distribution

**Location:** Pakistan

**Business model:**

* Purchases products from manufacturers/importers
* Stores inventory across warehouses
* Sells to retailers, supermarkets and smaller distributors
* Has sales representatives
* Creates quotations and sales orders
* Dispatches goods from warehouses
* Invoices customers
* Collects payments
* Purchases stock from suppliers
* Manages supplier credit
* Tracks inventory movement
* Handles returns and damaged goods
* Has multiple branches/warehouses
* Needs management reporting and forecasting

The company should feel like a realistic **50–200 employee Pakistani SME**, rather than an imaginary Silicon Valley startup.

The architecture must, however, be capable of scaling far beyond this demo company.

---

# 1. PRODUCT VISION

Build an **AI-native ERP**, where AI is not a chatbot bolted onto the sidebar.

AI should actively remove repetitive operational work.

The central philosophy is:

> **Humans make decisions. The ERP prepares the decisions. AI handles the repetitive work.**

Examples:

* An invoice arrives → AI extracts the supplier, invoice number, line items, quantities, prices and tax → proposes the accounting entries → human approves.
* Inventory drops below predicted demand → AI recommends a purchase order.
* A customer consistently pays late → AI flags the account and predicts cash-flow impact.
* A sales representative enters an order → ERP checks stock, customer credit, pricing rules and outstanding balance automatically.
* Management asks “Why did profit fall this month?” → AI analyzes actual ERP data and produces an explainable answer.
* A manager says “Show me customers who owe us more than PKR 500,000 and are overdue by 30+ days” → AI translates the request into a safe structured query and returns results.
* A purchase order is unusually expensive compared with historical supplier pricing → AI flags the anomaly.
* A warehouse repeatedly has stock discrepancies → AI identifies patterns and highlights likely causes.

AI must **never silently mutate financial or operational records**.

Use an approval model:

**AI proposes → user reviews → user approves → system executes → immutable audit event is recorded.**

---

# 2. DESIGN PRINCIPLES

The application must feel like a premium modern ERP inspired by the usability of products such as:

* Linear
* Stripe Dashboard
* Vercel
* Ramp
* Brex
* modern Microsoft/Oracle/SAP enterprise software

But do NOT copy their interfaces.

Design principles:

* Minimal
* Dense but readable
* Extremely fast
* Information hierarchy over decoration
* Keyboard-friendly
* Excellent tables
* Excellent filtering
* Excellent search
* Clear statuses
* Consistent spacing
* Subtle borders
* Restrained use of color
* No unnecessary gradients
* No giant marketing-style cards inside operational screens
* No excessive rounded rectangles
* No dashboard full of useless charts

The interface should communicate:

**“This is serious business software.”**

---

# 3. CORE APPLICATION STRUCTURE

Use a persistent application shell:

### Left navigation

* Overview
* Sales
* Customers
* Inventory
* Warehouses
* Purchasing
* Suppliers
* Finance
* Expenses
* Employees
* Reports
* AI Command Center
* Automations
* Integrations
* Settings

Navigation should support:

* Collapsed mode
* Search
* Keyboard shortcuts
* Role-based visibility
* Favorites
* Recently visited pages

### Top bar

Include:

* Global search / command palette
* AI assistant entry point
* Notifications
* Tasks / approvals
* Current organization
* User profile
* Help

---

# 4. GLOBAL SEARCH

Build a universal command/search system.

Users should be able to search:

* Customers
* Suppliers
* Products
* Invoices
* Sales orders
* Purchase orders
* Employees
* Warehouses
* Payments
* Journal entries
* Reports

Example:

> “Acme Traders”

Should return:

* Customer
* Recent invoices
* Outstanding balance
* Recent orders
* Contacts
* Credit status

Also support natural-language search:

> “Show overdue customers in Karachi with balances over 1 million.”

The system should translate this into a structured query.

Never allow LLM-generated SQL to execute directly.

Use a controlled query/intent layer.

---

# 5. COMMAND PALETTE

Implement a global command palette similar to a professional developer/productivity application.

Examples:

* Create customer
* Create quotation
* Create sales order
* Create invoice
* Create purchase order
* Record payment
* Transfer inventory
* Open AI assistant
* Run cash-flow report
* View overdue invoices
* Switch warehouse
* Switch branch

Keyboard shortcut:

`⌘/Ctrl + K`

---

# 6. EXECUTIVE OVERVIEW

The home dashboard should be useful to a business owner.

Show:

### Financial health

* Revenue
* Gross profit
* Net profit
* Accounts receivable
* Accounts payable
* Cash position
* Outstanding invoices

### Operations

* Orders today
* Orders awaiting fulfillment
* Low-stock products
* Purchase orders pending
* Warehouse alerts
* Returns
* Inventory value

### AI insights

Create a dedicated section:

**AI Business Brief**

Example:

> Revenue is up 8.4% this month, but gross margin has fallen 2.1 percentage points. The primary cause is lower margins on the Beverages category.

Then:

**Recommended actions**

1. Review pricing for 14 SKUs
2. Renegotiate supplier pricing with 2 suppliers
3. Follow up on PKR 3.2M in overdue receivables

Every AI insight must provide:

* Why it was generated
* Data sources
* Confidence
* Timestamp
* Recommended action
* Approve / dismiss / investigate controls

---

# 7. SALES MODULE

Build a complete sales workflow:

## Lead

* Company
* Contact
* Source
* Sales representative
* Estimated value
* Probability
* Notes
* Activities

## Customer

Fields:

* Customer ID
* Legal name
* Trading name
* CNIC/NTN where applicable
* Phone
* Email
* Addresses
* Region
* Sales representative
* Credit limit
* Payment terms
* Current balance
* Outstanding balance
* Customer status

## Quotation

Workflow:

Draft → Sent → Accepted → Expired / Rejected

## Sales Order

Workflow:

Draft → Confirmed → Reserved → Partially Fulfilled → Fulfilled → Cancelled

When a sales order is confirmed:

* Check inventory
* Reserve stock
* Check credit
* Calculate taxes
* Apply pricing rules
* Generate fulfillment task
* Update expected revenue

## Invoice

Workflow:

Draft → Approved → Sent → Partially Paid → Paid → Overdue

## Payments

Support:

* Cash
* Bank transfer
* Cheque
* Other configurable methods

---

# 8. INVENTORY

Inventory is a first-class subsystem.

Support:

* Products
* SKUs
* Categories
* Brands
* Units
* Batch numbers
* Expiry dates
* Serial numbers where required
* Warehouses
* Storage locations
* Stock transfers
* Stock adjustments
* Stock counts
* Damaged inventory
* Returns

Each product should have:

* SKU
* Name
* Description
* Category
* Brand
* Unit
* Purchase cost
* Selling price
* Tax category
* Reorder point
* Safety stock
* Preferred supplier
* Current stock
* Reserved stock
* Available stock
* Incoming stock
* Historical demand

Inventory should use a proper **stock ledger**, not simply mutate a quantity field.

Every movement should be traceable:

`Purchase → Receipt → Warehouse → Transfer → Sale → Dispatch → Return → Adjustment`

---

# 9. AI INVENTORY INTELLIGENCE

This should be one of the showcase features.

AI should analyze:

* Historical sales
* Seasonal patterns
* Lead times
* Supplier reliability
* Current inventory
* Reserved inventory
* Open purchase orders
* Expected demand

Then produce:

### Replenishment recommendations

Example:

> **SKU: NestFresh 1L**
>
> Current available: 184 units
> Forecast 30-day demand: 740 units
> Supplier lead time: 8 days
> Recommended purchase: 620 units
> Expected stockout: 11 days
>
> **Reason:** Demand has increased 17% over the previous 30 days.

Buttons:

**Create Purchase Order**

**Adjust quantity**

**Dismiss**

AI must never automatically purchase without approval.

---

# 10. PURCHASING

Workflow:

Supplier → Request → RFQ → Quote → Purchase Order → Receipt → Bill → Payment

Build:

* Suppliers
* Supplier contacts
* RFQs
* Purchase orders
* Goods receipts
* Supplier bills
* Supplier payments

Supplier profile:

* Total spend
* Outstanding payable
* Average lead time
* Reliability
* Historical prices
* Quality issues
* Purchase history

---

# 11. THREE-WAY MATCHING

Implement:

**Purchase Order ↔ Goods Receipt ↔ Supplier Invoice**

The system should automatically identify:

* Quantity mismatches
* Price mismatches
* Missing receipts
* Duplicate invoices
* Unexpected taxes
* Supplier price increases

Example:

> Invoice total: PKR 1,840,000
> PO total: PKR 1,720,000
> Difference: PKR 120,000
>
> **AI detected a 6.9% price variance on 3 products.**

Require approval before posting.

---

# 12. FINANCE

Build proper accounting architecture.

Do not fake accounting with dashboard numbers.

Implement:

* Chart of accounts
* General ledger
* Journal entries
* Accounts receivable
* Accounts payable
* Cash/bank accounts
* Expenses
* Taxes
* Profit & Loss
* Balance Sheet
* Cash Flow
* Trial Balance
* Fiscal periods

Use **double-entry accounting**.

Every financial transaction must generate balanced journal entries.

Example:

Sales invoice:

Debit:

Accounts Receivable

Credit:

Sales Revenue

Credit:

Tax Payable

When payment arrives:

Debit:

Bank

Credit:

Accounts Receivable

---

# 13. FINANCE AI

AI capabilities:

### Invoice coding

Read uploaded invoice → extract → classify → propose accounting.

### Reconciliation assistant

Compare bank transactions against:

* invoices
* payments
* expenses
* transfers

Suggest matches.

### Anomaly detection

Flag:

* unusual payments
* duplicate invoices
* unusual expense spikes
* unexpected supplier price changes
* suspicious journal entries

### Cash-flow forecasting

Forecast:

* expected collections
* expected supplier payments
* payroll
* recurring expenses
* projected cash balance

Show assumptions clearly.

---

# 14. EXPENSE MANAGEMENT

Employees can submit:

* Expense
* Receipt
* Category
* Amount
* Date
* Business purpose

AI:

* OCR receipt
* extracts amount
* identifies merchant
* categorizes expense
* detects duplicates
* checks policy
* proposes GL account

Approval:

Employee → Manager → Finance

---

# 15. HR / EMPLOYEE MANAGEMENT

Keep HR intentionally focused for the demo.

Employee records:

* Employee ID
* Name
* Department
* Position
* Manager
* Joining date
* Salary
* Status
* Contact information

Include:

* Leave requests
* Attendance summary
* Payroll overview
* Employee expenses
* Approval workflows

Do not build a gigantic HR system unless necessary.

---

# 16. REPORTING

Build a powerful reporting system.

Reports:

* Sales by customer
* Sales by product
* Sales by region
* Sales by representative
* Gross margin
* Inventory valuation
* Inventory aging
* Stock movement
* Purchase analysis
* Supplier performance
* AR aging
* AP aging
* Cash flow
* Profit & Loss
* Balance sheet

Reports need:

* Filters
* Date ranges
* Export
* Saved views
* Drill-down
* Sorting
* Grouping

---

# 17. AI REPORTING

This is a major demo feature.

Users can ask:

> “Why is profit down this month?”

> “Which customers are becoming risky?”

> “What products should we reorder?”

> “Which sales reps are underperforming?”

> “What are our biggest expenses?”

> “Compare this quarter to the same quarter last year.”

The AI should answer using actual ERP data.

It should show:

**Answer**

**Evidence**

**Metrics used**

**Relevant records**

**Suggested actions**

Never hallucinate data.

If the required data is unavailable:

> “I don't have enough data to answer this reliably.”

---

# 18. AI COMMAND CENTER

Create a dedicated AI workspace.

Layout:

### Left

Conversation history.

### Center

AI conversation.

### Right

Context panel.

When the user asks:

> “Find customers overdue by more than 60 days and draft follow-up messages.”

The AI should:

1. Query receivables
2. Identify customers
3. Explain results
4. Generate drafts
5. Ask for approval
6. Only then send through an approved integration

AI tools should be exposed through a controlled function/tool system.

Example tools:

* `get_customer`
* `search_customers`
* `get_invoice`
* `search_invoices`
* `get_inventory`
* `get_sales_metrics`
* `create_draft_invoice`
* `create_draft_purchase_order`
* `create_payment_match`
* `generate_report`

Sensitive write actions must require explicit confirmation.

---

# 19. AI ARCHITECTURE

For the demo, use:

**OpenRouter**

with a free model/API key supplied through environment variables.

Do NOT hard-code API keys.

Architecture must make the LLM provider replaceable.

Create an abstraction such as:

```text
AIProvider
 ├── OpenRouterProvider
 ├── AnthropicProvider
 └── GeminiProvider
```

The application should be able to switch providers without rewriting business logic.

Future production configuration should support:

* Anthropic SDK
* Gemini SDK
* OpenAI-compatible APIs
* OpenRouter

The demo uses OpenRouter only.

---

# 20. AI SAFETY / RELIABILITY

Never trust model output directly.

Use:

* Zod / JSON Schema validation
* Structured outputs
* Tool allowlists
* Permission checks
* Human approval for mutations
* Audit logging
* Rate limiting
* Prompt/version tracking
* Model/version tracking
* Token usage tracking
* Retry logic
* Timeouts
* Fallback handling

The AI layer should be treated as an **untrusted reasoning service**.

The database remains authoritative.

---

# 21. DATABASE ARCHITECTURE

Use PostgreSQL.

Design a normalized relational schema.

Major entities:

```text
organizations
users
roles
permissions
branches
warehouses
warehouse_locations

customers
customer_contacts

suppliers
supplier_contacts

products
product_categories
product_variants

sales_quotes
sales_orders
sales_order_lines
invoices
invoice_lines
payments

purchase_requests
purchase_orders
purchase_order_lines
goods_receipts
goods_receipt_lines
supplier_bills

inventory_transactions
inventory_balances
stock_reservations
stock_counts
stock_adjustments

chart_of_accounts
journal_entries
journal_entry_lines
bank_accounts
bank_transactions

expenses
expense_receipts

employees
departments
leave_requests

notifications
tasks
approvals

ai_conversations
ai_messages
ai_tool_calls
ai_insights
ai_recommendations

audit_logs

integrations
webhooks
```

Every business record should belong to an organization/tenant.

---

# 22. MULTI-TENANCY

Architect for SaaS from day one.

Use:

```text
organization_id
```

on tenant-owned data.

No tenant should ever be able to access another tenant's records.

Enforce tenant isolation at the application/data-access layer.

Prefer PostgreSQL Row Level Security where appropriate.

Never rely only on frontend filtering for authorization.

---

# 23. RBAC

Implement role-based permissions.

Example roles:

### Owner

Everything.

### Admin

Everything except sensitive organization ownership actions.

### Finance Manager

Finance + reporting + approvals.

### Sales Manager

Sales + customers + sales reporting.

### Sales Representative

Own customers/orders/tasks.

### Warehouse Manager

Inventory + warehouses + fulfillment.

### Procurement Manager

Purchasing + suppliers.

### Employee

Expenses + personal HR information + assigned tasks.

Permission examples:

```text
sales.orders.read
sales.orders.create
sales.orders.approve

inventory.read
inventory.adjust
inventory.transfer

finance.invoices.read
finance.invoices.create
finance.invoices.post
finance.payments.approve
```

---

# 24. AUDIT LOG

Every sensitive mutation must create an audit event.

Store:

* User
* Organization
* Action
* Entity
* Entity ID
* Before state
* After state
* Timestamp
* IP/device metadata where appropriate
* Source
* AI-generated / human-generated
* Approval reference

Example:

> Muhammad approved AI-generated supplier invoice coding.

This is essential for a serious ERP.

---

# 25. EVENT-DRIVEN ARCHITECTURE

Do not tightly couple every module.

Business events should exist conceptually and eventually physically.

Examples:

```text
SalesOrderConfirmed
InventoryReserved
GoodsReceived
InvoicePosted
PaymentReceived
PurchaseOrderApproved
StockLevelChanged
ExpenseSubmitted
AIRecommendationCreated
```

Use an event/outbox architecture where appropriate.

For the demo, keep infrastructure simple but structure the code so the system can later move to:

* Redis
* RabbitMQ
* Kafka
* managed queues

without rewriting domain logic.

---

# 26. API ARCHITECTURE

Use a clean API layer.

Prefer:

* REST for standard CRUD/business endpoints
* Server-sent events/WebSockets for real-time notifications where useful
* Typed contracts
* OpenAPI documentation

Never expose database models directly to the frontend.

Use service/domain layers.

Example:

```text
Controller
   ↓
Application Service
   ↓
Domain Logic
   ↓
Repository
   ↓
PostgreSQL
```

AI tools must call the application/service layer, not the database directly.

---

# 27. FRONTEND ARCHITECTURE

Use a modern TypeScript stack.

Preferred:

* Next.js
* TypeScript
* React
* Tailwind CSS
* shadcn/ui or similarly high-quality component primitives
* TanStack Query
* TanStack Table
* React Hook Form
* Zod

The UI must be responsive.

Desktop is primary, but tablet/mobile workflows should work.

Warehouse and approval workflows should be especially mobile-friendly.

---

# 28. PERFORMANCE

Design for:

* Fast initial load
* Server-side pagination
* Virtualized large tables
* Efficient queries
* Database indexes
* Query caching
* Optimistic UI where safe
* Background jobs
* Lazy-loaded modules
* Image/file optimization

Never fetch thousands of records to the browser simply to filter them.

All large datasets must support server-side filtering, sorting and pagination.

---

# 29. BACKGROUND JOBS

AI and expensive operations must not block HTTP requests.

Create a job architecture for:

* Invoice OCR
* AI analysis
* Forecast generation
* Report generation
* Email
* Notifications
* Scheduled reconciliations
* Data imports
* Webhook processing

Use a queue abstraction.

---

# 30. FILE STORAGE

Support documents:

* Supplier invoices
* Receipts
* Customer documents
* Employee documents
* Purchase documents

Use object storage abstraction.

Development can use local storage.

Production should support S3-compatible storage.

Never store large files directly inside PostgreSQL.

---

# 31. SECURITY

Treat this as production software.

Implement:

* Secure authentication
* Password hashing
* Session management
* CSRF protection where applicable
* Rate limiting
* Input validation
* Output encoding
* SQL injection protection
* RBAC
* Tenant isolation
* Audit logging
* Secure secrets
* File upload validation
* Signed file URLs
* Security headers
* Encryption in transit
* Encryption at rest where supported

Do not expose secrets to the frontend.

---

# 32. OBSERVABILITY

Build the foundations for:

* Structured logging
* Error tracking
* Request IDs
* Audit IDs
* AI request IDs
* Performance metrics
* Database query monitoring
* Job monitoring

Every AI operation should be traceable.

Example:

```text
AI Request
→ Prompt Version
→ Model
→ Input Context
→ Tool Calls
→ Validation
→ Approval
→ Result
```

---

# 33. AI COST CONTROL

Since the production system may eventually use expensive models:

Implement:

* Token tracking
* Model routing
* Context limits
* Prompt caching where supported
* Smaller models for simple tasks
* Larger models for complex reasoning
* Request deduplication
* AI usage budgets

Example:

Simple classification:

→ inexpensive model

Complex financial analysis:

→ stronger model

---

# 34. DEMO DATA

Create realistic seed data.

Do NOT use generic:

> John Doe
> Product 1
> Customer A

Use believable business data.

Example customers:

* Metro Mart
* Al-Noor Super Store
* City Cash & Carry
* Prime Retailers
* Khan Brothers Traders

Example product categories:

* Beverages
* Packaged Foods
* Household
* Personal Care
* Snacks

Generate:

* 100+ products
* 40+ customers
* 20+ suppliers
* 5 warehouses
* 12 months of sales
* Purchases
* Payments
* Expenses
* Inventory movements
* Some overdue invoices
* Some anomalies
* Some low-stock items

The demo must feel alive.

---

# 35. DEMO SCENARIOS

The application should be intentionally seeded with interesting scenarios.

### Scenario 1 — Low stock

AI detects an upcoming stockout.

### Scenario 2 — Supplier price anomaly

Supplier suddenly increases pricing.

### Scenario 3 — Overdue customer

Customer owes significant money and is past due.

### Scenario 4 — Duplicate invoice

Two invoices appear suspiciously similar.

### Scenario 5 — Cash-flow warning

Upcoming payments exceed expected collections.

### Scenario 6 — Strong sales trend

AI identifies a growing category.

### Scenario 7 — Warehouse discrepancy

Stock count differs from expected inventory.

These scenarios make the demo immediately impressive.

---

# 36. APPROVAL CENTER

Create one unified approval inbox.

Examples:

**5 approvals waiting**

* Purchase order — PKR 1.8M
* Expense — PKR 42,000
* AI inventory recommendation
* Supplier invoice variance
* Customer credit limit increase

Users should be able to approve/reject without navigating through multiple modules.

---

# 37. NOTIFICATION CENTER

Notifications should be meaningful.

Examples:

* Payment overdue
* Low stock
* Purchase order approved
* Invoice failed validation
* AI anomaly detected
* Approval requested
* Supplier delivery delayed

Avoid spam.

---

# 38. WORKFLOW ENGINE

Design a configurable workflow engine.

Eventually users should be able to define:

```text
WHEN
invoice.amount > 500000

THEN
require approval from Finance Manager
```

Or:

```text
WHEN
inventory.available < inventory.reorder_point

THEN
create AI replenishment recommendation
```

For the demo, implement a small but functional version.

---

# 39. INTEGRATION ARCHITECTURE

Create an integration framework.

Potential future integrations:

* Banks
* WhatsApp
* Email
* Shopify
* WooCommerce
* POS
* Payment gateways
* FBR
* Google Workspace
* Microsoft 365
* Slack

For the demo, mock integrations where external credentials aren't available.

Never fake that a real external action occurred.

Clearly distinguish:

**Demo / simulated**

from

**Live / connected**

---

# 40. PAKISTAN-FIRST DESIGN

The demo should feel appropriate for Pakistan.

Support:

* PKR
* Pakistani date/number formatting where appropriate
* Tax configuration
* NTN / STRN fields where relevant
* Local business addresses
* Bank accounts
* FBR integration abstraction

Do not hard-code tax rates throughout the application.

Use configurable tax rules.

The architecture should allow other countries/currencies later.

Current Pakistani ERP offerings commonly emphasize accounting, inventory, POS and FBR/local compliance, so this should feel locally credible rather than like a generic American ERP with PKR pasted on top.

---

# 41. DESIGN SYSTEM

Create a proper design system.

Define:

* Typography
* Spacing
* Colors
* Borders
* Shadows
* Radius
* Buttons
* Inputs
* Selects
* Tables
* Badges
* Dialogs
* Drawers
* Toasts
* Empty states
* Skeletons
* Charts
* Command palette
* AI components

Do not create every page independently.

Components must be reusable.

---

# 42. TABLE EXPERIENCE

ERP users spend enormous amounts of time in tables.

Make tables exceptional.

Features:

* Column visibility
* Resize
* Reordering
* Sorting
* Filtering
* Search
* Pagination
* Saved views
* Bulk actions
* Keyboard navigation
* Export
* Row actions
* Detail drawer

Example:

**Invoices**

| Invoice   | Customer   | Date  | Due    | Amount      | Status  |
| --------- | ---------- | ----- | ------ | ----------- | ------- |
| INV-10482 | Metro Mart | Oct 2 | Oct 30 | PKR 482,000 | Overdue |

Clicking a row should open a rich detail experience without forcing unnecessary navigation.

---

# 43. DETAIL PAGES

Every major entity needs a professional detail page.

Example Customer:

Header:

**Metro Mart**

Status · Credit limit · Outstanding balance

Tabs:

* Overview
* Orders
* Invoices
* Payments
* Contacts
* Activity
* Notes

Right-side actions:

* Create order
* Create invoice
* Record payment
* Contact customer

AI section:

**AI customer health**

> Medium risk — payment behavior has deteriorated over the last 90 days.

---

# 44. AI UX

Do not make AI feel gimmicky.

Avoid:

* giant glowing AI buttons
* excessive robot icons
* fake futuristic gradients
* random “AI magic” labels

AI should feel like an invisible intelligence layer.

Use language such as:

* Recommended
* Detected
* Forecast
* Suggested
* Needs review
* Explain
* Investigate

When AI takes an action, clearly identify it.

---

# 45. ERROR HANDLING

Never show raw errors.

Bad:

> PrismaClientKnownRequestError...

Good:

> We couldn't post this invoice because the selected account is inactive.

Provide:

* Explanation
* Recovery action
* Technical reference ID

---

# 46. TESTING

Implement serious tests.

### Unit tests

* Accounting calculations
* Inventory calculations
* Tax calculations
* Permissions
* Pricing
* Credit checks

### Integration tests

* Sales order → inventory reservation
* Invoice → ledger
* Payment → receivable
* Purchase receipt → inventory
* Supplier invoice → AP

### E2E tests

Critical user flows:

1. Login
2. Create customer
3. Create order
4. Reserve inventory
5. Generate invoice
6. Record payment
7. Purchase inventory
8. Receive goods
9. AI recommendation
10. Approval

---

# 47. ACCOUNTING INTEGRITY

This is extremely important.

Never allow:

* Unbalanced journal entries
* Negative inventory unless explicitly configured
* Posting into closed periods
* Unauthorized financial mutations
* Silent deletion of financial records

Financial records should be immutable after posting.

Corrections should happen through reversal/adjustment entries.

---

# 48. DATA INTEGRITY

Use:

* Database constraints
* Foreign keys
* Unique constraints
* Transactions
* Idempotency keys
* Optimistic locking where necessary

For critical operations:

```text
Validate
→ Begin transaction
→ Apply domain changes
→ Create ledger entries
→ Create inventory movements
→ Create audit event
→ Commit
→ Emit event
```

---

# 49. SEEDING AND DEMO MODE

Provide a simple command:

```bash
npm run db:seed
```

It should create the complete Meridian Distribution demo organization.

Also provide:

```bash
npm run demo:reset
```

to reset the demo environment.

Create demo users for each role.

Clearly document their credentials in development only.

---

# 50. ENVIRONMENT CONFIGURATION

Use environment variables.

Example:

```env
DATABASE_URL=

AUTH_SECRET=

OPENROUTER_API_KEY=

AI_MODEL=

STORAGE_ENDPOINT=

STORAGE_BUCKET=

EMAIL_PROVIDER=
```

Never commit secrets.

Provide `.env.example`.

---

# 51. DEPLOYMENT

The architecture should be deployable using common cloud infrastructure.

Target:

* Next.js application
* PostgreSQL
* Redis/queue when required
* S3-compatible storage

Keep deployment simple enough for a small team.

Docker support is preferred.

Provide:

```text
Dockerfile
docker-compose.yml
.env.example
README.md
```

---

# 52. CODE QUALITY

You are not allowed to produce a giant monolithic application file.

Use clear boundaries:

```text
/apps
/packages

or an equivalent scalable structure.
```

Separate:

* UI
* API
* Domain logic
* Database
* AI
* Jobs
* Integrations
* Shared types
* Design system

Use strict TypeScript.

Avoid:

* `any`
* duplicated business logic
* magic numbers
* hard-coded business rules
* database calls from random UI components
* giant React components
* giant API handlers

---

# 53. ARCHITECTURE GOAL

The first version should be a **modular monolith**, not premature microservices.

This is intentional.

Use strong domain boundaries inside one deployable application.

Potential future extraction:

```text
Core ERP
│
├── Identity
├── Sales
├── Inventory
├── Procurement
├── Finance
├── HR
├── Reporting
├── AI Platform
├── Notifications
└── Integrations
```

Only extract services when scale or organizational boundaries justify it.

Do not introduce Kubernetes or 15 microservices merely to appear “enterprise.”

---

# 54. AI PROVIDER ABSTRACTION

Create something conceptually similar to:

```ts
interface AIProvider {
  generateText(input: AIRequest): Promise<AIResponse>
  generateStructured<T>(
    input: AIRequest,
    schema: ZodSchema<T>
  ): Promise<T>
  stream(input: AIRequest): AsyncIterable<string>
}
```

Then:

```text
OpenRouterProvider
AnthropicProvider
GeminiProvider
```

Business logic must depend on the interface, never directly on OpenRouter.

---

# 55. AI TOOL ARCHITECTURE

Use explicit tool definitions.

Example:

```ts
const getCustomer = tool({
  name: "get_customer",
  description: "...",
  inputSchema: ...
})
```

Tools must:

* Validate permissions
* Validate tenant
* Validate inputs
* Execute through services
* Return structured results
* Log execution

Never expose unrestricted database access to an LLM.

---

# 56. PROMPT MANAGEMENT

Prompts must not be scattered throughout React components.

Create centralized AI prompt definitions.

Track:

```text
prompt_name
version
purpose
model
temperature
created_at
```

Example:

```text
inventory_replenishment_v1
invoice_coding_v1
cashflow_forecast_v1
customer_risk_v1
executive_summary_v1
```

---

# 57. AI EXPLAINABILITY

Every AI recommendation should be explainable.

Example:

### Recommended purchase

**Why?**

* Demand increased 18%
* Current stock covers 9 days
* Supplier lead time averages 12 days
* Safety stock target is 14 days
* 3 recent orders increased demand

This is far more credible than:

> “AI thinks you should buy 500 units.”

---

# 58. DEMO STORY

The entire application should support a compelling website demonstration.

A visitor should be able to see this story:

### Step 1

Management opens the dashboard.

### Step 2

AI highlights:

> “Cash collection risk has increased.”

### Step 3

Manager opens the insight.

AI identifies several overdue customers.

### Step 4

Manager asks:

> “What should I do?”

AI analyzes customer history and recommends actions.

### Step 5

Manager asks:

> “What inventory is at risk?”

AI identifies three products.

### Step 6

Manager reviews a replenishment recommendation.

### Step 7

AI generates a draft purchase order.

### Step 8

Manager approves it.

### Step 9

The ERP updates:

* Purchase orders
* Inventory forecast
* Expected cash flow
* Supplier commitments

This should feel like a **real intelligent operating system for a business**.

---

# 59. WHAT NOT TO BUILD

Do NOT build:

* A generic admin dashboard
* Fake analytics
* Decorative charts
* 50 empty modules
* Placeholder pages
* Fake AI responses
* Hardcoded financial calculations
* Hardcoded inventory numbers
* Direct LLM-to-database access
* Monolithic components
* Microservice complexity for no reason
* Authentication that exists only visually
* Buttons that do nothing
* “Coming soon” everywhere

Every major screen included in the demo should perform a meaningful operation.

---

# 60. PRIORITY ORDER

If time is constrained, prioritize depth over breadth.

### Tier 1 — Must be excellent

1. Dashboard
2. Sales
3. Customers
4. Inventory
5. Purchasing
6. Finance
7. AI Command Center
8. Approvals
9. Audit log
10. Authentication/RBAC

### Tier 2

11. Reporting
12. Expenses
13. Suppliers
14. Employees
15. Workflow automation

### Tier 3

16. Integrations
17. Advanced HR
18. Advanced manufacturing
19. Mobile-specific features
20. Advanced BI

---

# 61. DEFINITION OF DONE

The product is not complete when the pages exist.

It is complete when the following workflow works end-to-end:

```text
Customer
   ↓
Quotation
   ↓
Sales Order
   ↓
Inventory Reservation
   ↓
Fulfillment
   ↓
Invoice
   ↓
Accounts Receivable
   ↓
Payment
   ↓
General Ledger
   ↓
Dashboard / Reporting
```

And:

```text
Supplier
   ↓
Purchase Order
   ↓
Goods Receipt
   ↓
Inventory
   ↓
Supplier Invoice
   ↓
Accounts Payable
   ↓
Payment
   ↓
General Ledger
```

And AI can:

```text
Observe ERP data
      ↓
Analyze
      ↓
Generate recommendation
      ↓
Explain reasoning
      ↓
Request approval
      ↓
Execute through safe tools
      ↓
Record audit event
```

---

# 62. FINAL QUALITY BAR

Before considering the application complete, ask:

> If a real business owner logged into this application, would they believe this could actually run their company?

If the answer is no, keep improving it.

The final product should feel like:

**“A modern AI operating system for a growing business.”**

—not:

**“an AI chatbot sitting on top of an admin dashboard.”**

Build it with the mindset that this could eventually become a real SaaS ERP product.

Prioritize correctness, maintainability, security, data integrity, scalability, excellent UX, and believable business workflows over superficial feature count.

