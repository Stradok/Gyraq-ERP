# 08: UX & Design System

> Target feeling: **"This is serious business software."** Dense but calm. Fast. Keyboard-first. Color means something.

## 1. Foundations (`packages/ui/tokens`, Tailwind v4 `@theme`)

**Typography**
- UI font: **Inter** (variable), using `font-feature-settings: "cv11", "ss01"` and **`tabular-nums` on every numeric cell, KPI, and amount**. Mono: **JetBrains Mono** for document numbers, IDs, NTN/IBAN, and JSON.
- Scale (px / line height): 11/16 (micro labels), 12/16 (table meta), **13/20 (default UI and table body)**, 14/20 (form inputs, body), 16/24 (section titles), 20/28 (page titles), 28/34 (KPI values).
- Weights: 400 / 500 for labels and active nav / 600 for titles. No 700+ in operational screens.

**Spacing:** 4-px base. Use the steps 0.5/1/1.5/2/3/4/5/6/8/10/12, i.e. 2–48 px. Page gutter is 24 px on desktop and 16 px on mobile.

**Color** (semantic tokens; light and dark both first-class)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#FFFFFF` | `#0B0C0E` | app canvas |
| `--bg-subtle` | `#F7F7F8` | `#121316` | sidebar, table header, panels |
| `--bg-muted` | `#EFEFF1` | `#1A1B1F` | hover, selected row |
| `--border` | `#E4E4E7` | `#26272B` | 1-px hairlines everywhere |
| `--border-strong` | `#D4D4D8` | `#34353A` | inputs, focused containers |
| `--fg` | `#0A0A0B` | `#EDEDEF` | primary text |
| `--fg-muted` | `#5F6168` | `#9A9CA3` | secondary text |
| `--fg-subtle` | `#8B8D94` | `#6E7077` | placeholders, meta |
| `--accent` | `#2B4ACB` (ink blue) | `#7B93FF` | primary actions, focus ring, links. **Use sparingly** |
| `--success` | `#1F7A4D` | `#4CC38A` | paid, received, matched |
| `--warning` | `#A15C00` | `#F0A43B` | due soon, needs review, low confidence |
| `--danger` | `#B42318` | `#F97066` | overdue, exception, blocked |
| `--info` | `#2563A8` | `#6CA6E8` | informational statuses |
| `--ai` | `#6B4FBB` (muted violet) | `#A895F0` | **tiny** marker for AI-generated content only: a 2-px left rule and an "AI" chip. No gradients, no glow |

**Charts:** a single-hue sequential scale derived from `--accent` plus neutral greys. Status colors appear in charts only when they mean status (e.g. AR aging buckets from neutral to danger).

**Borders, radius, shadow:** 1-px borders do most of the structural work. Radius is 4 px for badges, **6 px for inputs and buttons**, and 8 px for popovers, dialogs, and drawers. **No 16 px+ rounded cards.** Shadows appear only on floating layers (popover, dialog, toast, command palette): `0 8px 24px -8px rgb(0 0 0 / .18)`. Surfaces are flat.

**Motion:** 120–160 ms ease-out on overlays and drawers. No decorative animation. `prefers-reduced-motion` is respected.

**Density:** a user setting with compact rows (32 px, the default for tables) or comfortable rows (40 px).

## 2. Component inventory (`packages/ui`)

Built on shadcn/ui (Radix) primitives and restyled to the tokens above:

| Group | Components |
|---|---|
| Primitives | Button (primary/secondary/ghost/danger; sizes sm 28/md 32/lg 36), IconButton, Input, MoneyInput (PKR, lakh-aware paste parsing), QuantityInput (UoM selector), Select, Combobox (async, server search), DatePicker/RangePicker (FY presets: "This FY", "Q1 FY26-27"), Checkbox, Radio, Switch, Textarea, Tooltip, Kbd |
| Layout | AppShell, Sidebar, TopBar, PageHeader (title, meta, actions, tabs), Section, SplitView, Drawer (right, 560/720/960 px), Dialog, Sheet (mobile) |
| Data display | **DataTable** (see §4), DescriptionList, StatusBadge (state-machine aware), MoneyCell, DeltaBadge (+8.4% ▲), KPI tile (value, delta, sparkline, drill link), Timeline (audit/activity), EmptyState (explains + primary action), Skeletons per layout |
| Feedback | Toast (with "Undo" where safe; with "Reference" for errors), InlineAlert, ProblemAlert (renders problem+json: explanation, recovery action, copyable reference), ConfirmDialog (typed confirmation for destructive/financial actions) |
| Navigation | CommandPalette, GlobalSearch, Breadcrumbs, Tabs, KeyboardShortcutHelp (`?`) |
| Forms | Form kit around React Hook Form + Zod resolver: field, label, help text, error, async validation, dirty-state guard, **line-item editor** (keyboard grid for document lines: add row with ↵, product combobox, UoM, qty, price, discount, live tax/total) |
| Charts | Recharts wrappers: TrendLine, BarCompare, StackedAging, CashProjection (line + min-cash threshold band + event markers), Waterfall (profit variance), Sparkline. All read tokens and support tabular tooltips |
| AI | InsightCard, InsightDrawer (why / sources / confidence / generator / actions), ProposalCard (preview + diff + Confirm/Reject), AnswerView (Answer · Evidence · Metrics · Records · Actions), ToolTrace (collapsible steps), ConfidenceBadge (High/Medium/Low + basis tooltip), AIChip, ExtractionReview (doc + fields), InterpretedQueryChips |
| Domain widgets | CreditCheckPanel, StockAvailabilityPopover (per warehouse, incoming, reserved), FBRStatus (IRN, QR, 72-h timer, Simulated badge), ApprovalTimeline, MatchExceptionsTable, PricingTracePopover, TaxBreakdownPopover |

**Storybook** (or Ladle) documents every component in both themes, with interaction tests for DataTable, CommandPalette, and the line-item editor.

## 3. Application shell

```
┌──────────────┬───────────────────────────────────────────────────────────────────────────┐
│ ◆ Meridian ▾ │ [⌘K Search or run a command…]        ✦ Ask   ⚑ Approvals 5   🔔 3   ?   (TM)│
│ ───────────  ├───────────────────────────────────────────────────────────────────────────┤
│ ☆ Favorites  │ Sales / Invoices                                         [Export] [+ New]  │
│ ◷ Recent     │ ─────────────────────────────────────────────────────────────────────────  │
│ Overview     │ (Saved views ▾) All · Overdue · Awaiting FBR · My customers   [Filter +]   │
│ OPERATIONS   │ ┌──────────────────────────────────────────────────────────────────────┐   │
│  Sales       │ │ ☐ Invoice    Customer         Date     Due     Amount        Status   │   │
│  Customers   │ │ ☐ INV-10482  Metro Mart       02 Oct   30 Oct  Rs 482,000.00 Overdue  │   │
│  Inventory   │ │ …                                                                    │   │
│  Warehouses  │ └──────────────────────────────────────────────────────────────────────┘   │
│  Purchasing  │                                                                            │
│  Suppliers   │                                                                            │
│ FINANCE      │                                                                            │
│  Finance     │                                                                            │
│  Expenses    │                                                                            │
│ PEOPLE       │                                                                            │
│  Employees   │                                                                            │
│ INSIGHTS     │                                                                            │
│  Reports     │                                                                            │
│  AI Command  │                                                                            │
│ SYSTEM       │                                                                            │
│  Automations │                                                                            │
│  Integrations│                                                                            │
│  Settings    │                                                                            │
│ [«] KHI DC ▾ │                                                                            │
└──────────────┴───────────────────────────────────────────────────────────────────────────┘
```

**Sidebar:**
- Width 232 px, collapsing to 56 px with icons and tooltips (`[`).
- Sections are shown according to permissions.
- Favorites can be pinned from any page with ☆.
- Recents keeps the last 8 visited entities or pages.
- A nav filter starts typing on `/` while the sidebar is focused.
- A branch/warehouse context switcher at the bottom scopes default filters.

**Top bar:**
- Command/search trigger.
- **Ask** opens the AI side panel with the current page as context.
- Approvals count opens the inbox drawer.
- Notifications open a popover with tabs: All, Mentions, System.
- Org switcher, help (docs, shortcuts, "What's simulated?"), and the profile menu (theme, density, sessions, sign out).

**Keyboard map** (shown with `?`):

| Keys | Action |
|---|---|
| `⌘/Ctrl K` | Command palette |
| `/` | Focus search on the current list |
| `g o` `g s` `g c` `g i` `g p` `g f` `g a` | Go to Overview, Sales, Customers, Inventory, Purchasing, Finance, AI |
| `c o` `c i` `c p` `c q` | Create order, invoice, purchase order, quotation |
| `j / k`, `↵`, `esc` | Move row, open drawer, close |
| `x`, `⇧x` | Select row, select range |
| `e` | Edit current record (if allowed) |
| `a` / `r` | Approve / reject in the approval inbox |
| `⌘↵` | Submit form |
| `[` | Collapse sidebar |

## 4. DataTable (the most important component)

- **Engine:** TanStack Table (headless) + TanStack Virtual. **Server-side** filtering, sorting, and pagination by default (keyset cursor for large tables). Client mode only for small, bounded datasets (< 500 rows).
- **Columns:** visibility, resize (persisted), reorder (drag + keyboard), and pinning (first column and actions). Money is right-aligned and tabular. Dates show as `02 Oct 2026` (relative on hover).
- **Filtering:** a filter bar built from the **Query Catalogue** field definitions (doc 06 §5). The same field registry is used everywhere: typed operators per field type, chips with removal, and an "Ask" box that turns NL into chips. Filter state lives in the URL, so it's shareable.
- **Saved views:** personal or shared (permission). A view stores filters, sort, columns, widths, grouping, and density. It ships with system views, e.g. *Overdue*, *Awaiting FBR*, *My customers*.
- **Grouping:** server-side group-by with aggregate rows (sum of amount, count).
- **Selection & bulk actions:** select page or select all matching (server-side via filter). Bulk actions are permission-aware (e.g. send reminders, export, assign rep) and confirm with a count.
- **Keyboard:** roving focus, `j/k`, `↵` opens the detail drawer, `space` previews, `x` selects.
- **Row actions:** a kebab menu built from `allowedActions` on the DTO, so there's never a dead action.
- **Detail drawer:** clicking a row opens a right drawer with the full detail and the main actions. "Open full page" (`⇧↵`) navigates. The drawer URL is deep-linkable (`?drawer=invoice:…`).
- **Export:** CSV/XLSX of the *current view*. Small exports run synchronously; large ones go through the export job with a notification.
- **States:** skeleton rows (matching the column layout), an empty state with guidance, an error state with ProblemAlert and retry, and a stale-while-revalidate indicator.

## 5. Detail pages (pattern used for every major entity)

```
┌ PageHeader ───────────────────────────────────────────────────────────────────────────┐
│ Metro Mart  [Active]  CUS-0012 · Modern trade · Karachi South · Rep: Usman Ghani     │
│ Credit limit Rs 6,000,000 · Outstanding Rs 4,212,500 · Overdue Rs 482,000 (1 inv.)    │
│ [Create order] [Create invoice] [Record payment] [Contact ▾] [⋯]                       │
├ Tabs: Overview · Orders · Invoices · Payments · Contacts · Activity · Notes ──────────┤
│ Main (2/3)                                     │ Side (1/3)                            │
│ - Balance trend (12m), aging bar               │ ▍AI customer health  [AI]              │
│ - Recent orders / invoices mini-tables         │ ▍Medium risk (54) · payment behaviour  │
│ - Top products (12m)                           │ ▍deteriorated over 90 days             │
│                                                │ ▍• Avg days to pay 18 → 31             │
│                                                │ ▍• 1 bounced cheque (Aug)              │
│                                                │ ▍Basis: 96 invoices · computed 06:00   │
│                                                │ ▍[Investigate] [Dismiss]               │
│                                                │ Tax identity: NTN, STRN, ATL ✓ (12 Sep)│
│                                                │ Addresses, contacts, terms             │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

Documents (orders, invoices, POs, bills) have:
- A status stepper.
- Lines with pricing and tax popovers.
- Linked documents (order ↔ shipments ↔ invoices ↔ payments ↔ JE).
- An **Accounting** tab showing the generated journal entries.
- An **Activity** tab (audit timeline).
- Print/PDF and the FBR panel for invoices.

## 6. Screen inventory (v1)

| Module | Screens |
|---|---|
| Overview | Executive overview (financial health, operations, AI Brief, recommended actions, cash projection mini-chart); role variants for Sales Mgr, Warehouse, Procurement |
| Sales | Leads (list/board), Quotations, Sales orders (list, editor, detail with credit/stock panel), Fulfillment (pick lists, shipments/challans), Invoices, Credit notes & returns, Payments (incl. cheque register: in hand / deposited / bounced), Routes |
| Customers | List, detail (as above), statement of account (PDF), credit requests |
| Inventory | Products (list, detail with stock by warehouse, ledger, forecast chart, price/MRP history), Stock position, Stock ledger explorer, Transfers, Adjustments, Counts, Batches & expiry, **Replenishment** (AI recommendations queue), Valuation |
| Warehouses | Warehouse list & detail (locations, KPIs, discrepancies), **mobile**: receive (GRN), pick, count, transfer receive, with barcode scanning (BarcodeDetector API, zxing fallback) |
| Purchasing | Requests, RFQs & quote comparison, Purchase orders, Receipts, **Supplier bills** (upload/extract/review), **Match exceptions** queue, Supplier payments, Principal claims |
| Suppliers | List, detail (spend, payable, lead time, reliability, price history chart, quality issues, PO history) |
| Finance | Chart of accounts, Journal entries (list, manual JE editor with balance indicator), General ledger explorer (account → lines → source doc), AR, AP, Bank accounts & reconciliation workspace, Tax (summary by tax code, FBR submissions log, sales-tax return worksheet), Fiscal periods & close checklist, Statements (P&L, BS, CF, TB), **Cash-flow forecast** (13-week with assumptions table) |
| Expenses | My expenses (mobile-friendly submit with camera), Team approvals, All expenses, Policies |
| Employees | Directory, employee detail, Leave (requests, calendar, balances), Attendance summary, Payroll overview (runs, posting) |
| Reports | Catalogue, report viewer (filters, grouping, drill-down, saved views, export), scheduled exports (v2) |
| AI Command Center | 3-column workspace: history · conversation · context panel; prompt starters per role; AI usage view |
| Approvals | Unified inbox (list + detail preview; mobile card layout), history |
| Automations | Rules list, rule builder (WHEN / IF / THEN), runs log, test rule |
| Integrations | Connector cards with **mode badges** (Simulated / Sandbox / Live), config, logs, simulated outbox viewer (emails, WhatsApp) |
| Settings | Organization (legal, NTN/STRN, fiscal year), Branches & warehouses, Users & roles (permission matrix editor), Tax codes & rules, Numbering, Approval policies, Notification preferences, AI (models, budgets, usage), **System health** (integrity checks, jobs, outbox lag, audit chain), Audit log, Demo (reset sandbox) |

## 7. Command palette & global search

- **cmdk-based.** One input with mixed result groups, ranked: **Actions** ("Create sales order", "Record payment", "Transfer inventory", "Run cash-flow report", "Switch warehouse → Lahore DC") · **Navigation** · **Records** (customers, suppliers, products, invoices, orders, POs, employees, warehouses, payments, JEs, reports) · **Ask AI** (always last: "Ask: <query>").
- **Prefixes:** `>` commands only, `#` documents by number (`#INV-10482`), `@` people, `?` ask AI.
- **Record preview pane:** e.g. "Acme Traders" shows the customer card with outstanding balance, credit status, recent invoices and orders, contacts, and quick actions.
- **NL queries** ("overdue customers in Karachi with balances over 1 million") route to the controlled query layer. The palette shows the **interpreted chips** with a count and opens the filtered list on ↵.
- **Backend:** `search_documents` (FTS + trigram, permission-filtered) for records. Actions come from a registry gated by permissions and context, e.g. "Approve" appears only on an approvable record page.

## 8. AI UX rules (plan §44)

- **Vocabulary:** Recommended · Detected · Forecast · Suggested · Needs review · Explain · Investigate. **Never** "magic" or "AI-powered!".
- **Visual marker:** a 2-px `--ai` left rule plus a small "AI" chip on generated content. **No robot icons, sparkles, or gradients.**
- **Every AI output** shows provenance on demand (Details: model, prompt version, time, sources, tool calls).
- **Deterministic fallbacks** are labeled "Computed summary", and the "AI" chip is removed.
- AI never interrupts. Insights appear in their places (overview brief, entity side panels, queues). The Command Center is opt-in.
- **Proposals look like documents, not chat bubbles:** a preview table, totals, and Confirm/Reject with consequences spelled out ("Creates draft PO-… for Rs 1,812,400; requires Owner approval").

## 9. Error UX (plan §45)

- `ProblemAlert` maps `code` to a friendly title and detail, gives a **recovery action button** where possible (e.g. "Change posting date", "Request credit override", "Open period settings"), and adds a copyable reference (`req_…`).
- Form errors map field paths from problem+json to inputs.
- Optimistic UI only where it's safe and reversible: marking notifications read, favorites, saved views, comments. **Never** for financial postings, which show a pending state until the server confirms.

## 10. Responsive & mobile

- Breakpoints: `sm 640`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1536`. Desktop (≥1280) is primary.
- **Tablet:** the sidebar becomes an overlay and drawers go full-height at 80% width.
- **Mobile (<768):**
  - Bottom tab bar with Home, Approvals, Tasks, Scan, More.
  - Tables become card lists with the top three fields and status.
  - Line-item editors become stepper forms.
- **Mobile-first flows:** approvals (swipe-free; big approve/reject with comment), warehouse receive/pick/count (scan, big tap targets ≥44 px, works with gloves), expense submission (camera capture), and sales-rep quick order (customer → recent products → qty).
- **PWA:** installable, with an offline banner. Offline counting is v2.

## 11. Accessibility & i18n

- WCAG 2.2 AA: contrast verified for both themes, focus rings (`--accent`, 2 px offset), full keyboard paths, ARIA via Radix, and `aria-live` for toasts and streaming AI.
- **i18n-ready** from day one (`next-intl`) with English UI. Urdu (RTL) is v2. Logical CSS properties are used so RTL will work.
- Formatting comes from `@erp/core/format`:
  - Money is always `Rs 1,234,567.00` with explicit fraction digits.
  - Compact KPIs show `Rs 1.23 Cr` or `Rs 12.3 L`, with an org setting to use `M`/`K` instead.
  - Dates are `05 Oct 2026` in the `Asia/Karachi` time zone.
  - Fiscal labels look like `Q2 FY26-27`.
