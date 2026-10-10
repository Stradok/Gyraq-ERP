# Price plan and AI tiers

Working draft for selling Meridian ERP (FMCG distributor edition). Prices are proposals to test with the first customers, not market-proven. All cost figures use **1 USD ≈ PKR 280** (check the current rate) and vendor prices from secondary sources dated mid-2026. **Confirm every vendor price on the vendor's own page before quoting a customer** (links at the bottom).

## 1. What each tier includes

Status = what exists in this repo today. Sell only what is built; list the rest as "on the roadmap".

| | **Basic** | **Standard** | **Professional** | **Voice add-on** | **Enterprise** |
|---|---|---|---|---|---|
| Full ERP (sales, purchasing, stock, finance, FBR invoicing, HR, approvals, role guides) | yes | yes | yes | (on Pro) | yes |
| Users included | 10 | 10 | 25 | | custom |
| **Chat assistant** (answers, navigates, proposes actions with confirmation, role-aware) | Computed mode (no AI model), optional free model for non-sensitive demos | Gemini Flash | Claude Sonnet, Haiku for quick lookups | | customer's choice |
| **Vision** (read supplier bill photos into a draft bill) | free model, best effort | Gemini Flash | Gemini Flash | | any |
| **Autonomous agents** (collections follow-ups, replenishment drafts run on a schedule) | rules only (no AI) | rules only | AI agents (Claude) | | custom |
| **Voice agents** (LiveKit: talk to the ERP, phone order-taking) | no | no | no | yes | yes |
| Hosting | us or customer | us or customer | us or customer | | customer VPS/AWS, we manage |
| Support | email | email + call | priority + monthly review | | SLA |
| **Built today?** | Chat computed: **built**. Vision: **built**. | **built** (set `AI_EDITION=standard`) | Chat: **built**. Vision: **built**. AI agents: **not built** (today only rule-based automations). | **Not built.** | n/a |

Honest gaps before the higher tiers can be sold as described:
- **AI agents (Professional):** automations today are IF/THEN rules. A scheduled agent that reasons over data and drafts actions needs building.
- **Voice (add-on):** nothing exists yet. Needs a LiveKit Agents service, speech-to-text, text-to-speech, and the same role checks and confirmation step the chat uses. Estimate 2 to 3 weeks for a first working version.
- **WhatsApp sending** is simulated. Real sending needs the WhatsApp Business API (extra monthly and per-message cost, passed through).

**Do not put real customer financial data through the free tier.** Free OpenRouter models can log prompts and have no uptime guarantee (we already saw models removed and rate limits of about 50 requests a day). Basic is for evaluation and low-stakes use; real data goes on Standard or above, or on the customer's own keys.

## 2. What it costs us to run (per unit)

Assumptions: one assistant question uses about 15,000 input tokens and 1,000 output tokens across its tool steps; one bill scan about 1,500 in and 600 out; one agent run about 30,000 in and 3,000 out.

| Unit | Model | Cost (USD) | Cost (PKR) |
|---|---|---|---|
| Assistant question | Gemini 2.5 Flash ($0.30 in / $2.50 out per M tokens) | 0.007 | 2 |
| Assistant question | Claude Haiku 4.5 ($1 / $5) | 0.020 | 6 |
| Assistant question | Claude Sonnet ($3 / $15), with prompt caching (about 40% saved) | 0.036 | 10 |
| Bill scan | Gemini 2.5 Flash | 0.002 | 0.6 |
| Agent run | Claude Sonnet | 0.135 | 38 |
| Voice minute, all in (LiveKit session + speech-to-text + model + text-to-speech + phone) | LiveKit estimate about $0.07, rounded up to $0.10 for safety | 0.10 | 28 |

Fixed costs: LiveKit Ship plan $50 a month (5,000 agent minutes included; overage about $0.01 a minute plus model costs). Apple Developer account $99 a year (only if a customer pays for iOS and macOS). Windows code-signing certificate roughly $200 to $400 a year (unverified). Google Play $25 once. Shared VPS about $10 to $20 a month per customer.

## 3. Proposed prices

Two price lists. **Local (Pakistan)** is billed in PKR to Pakistani companies. **International** is billed in USD to customers outside Pakistan. They differ on purpose: Pakistani buyers compare us with PKR 3,500 to 25,000 a month local tools, while international buyers compare with USD tools and pay by card or wire with fees.

### 3A. Local price list (PKR)

Hosted by us, billed monthly. Setup fee covers data import, FBR setup and training.

| Tier | Setup (once) | Monthly | Included AI | Our cost / month | Gross margin before support |
|---|---|---|---|---|---|
| **Basic** | 100,000 | 20,000 | none (computed mode) | about 4,000 (infra) | about 80% |
| **Standard** | 150,000 | 45,000 | 1,500 questions, 300 bill scans | about 5,000 infra + 3,100 AI = 8,100 | about 82% |
| **Professional** | 250,000 | 95,000 | 2,000 Claude questions, 300 agent runs, 1,000 bill scans | about 8,000 infra + 32,000 AI = 40,000 | about 58% |
| **Voice add-on** (on Standard or Pro) | 50,000 | 40,000 | 600 voice minutes | about 16,800 | about 58% |
| **Enterprise** | from 600,000 | from 250,000 | negotiated | negotiated | target 50% or more |

Extra users: PKR 2,500 per user per month. Overage, priced at roughly 2 to 4 times cost: Standard questions PKR 4 each, Claude questions PKR 25 each, agent runs PKR 90 each, voice minutes PKR 60 each.

**Self-hosted on the customer's VPS or AWS:** one-time licence of about 18 months of the hosted fee (Basic 360,000; Standard 810,000; Professional 1,710,000) plus 15% a year for updates and support. AI runs on the customer's own API keys (they pay the vendors directly) or we resell credits at 2x cost. **Offline installers** (Windows `.exe`, Linux `.deb`, Android `.apk`) are priced as self-hosted; macOS and iOS add the Apple account and signing work (quote at cost plus 30%).

### 3B. International price list (USD)

Hosted by us, billed monthly by card or wire. USD prices are not a straight conversion of the PKR list: they are about 25% higher than the PKR price at PKR 280 to the dollar, to cover card fees (about 3% plus a fixed fee), currency conversion, tax handling for the buyer's country, and support across time zones.

| Tier | Setup (once) | Monthly | Included AI | Our cost / month (USD) | Gross margin before support |
|---|---|---|---|---|---|
| **Basic** | 500 | 79 | none (computed mode) | about 14 (infra) | about 82% |
| **Standard** | 900 | 199 | 1,500 questions, 300 bill scans | about 18 infra + 11 AI = 29 | about 85% |
| **Professional** | 1,500 | 449 | 2,000 Claude questions, 300 agent runs, 1,000 bill scans | about 29 infra + 114 AI = 143 | about 68% |
| **Voice add-on** | 300 | 199 | 600 voice minutes | about 60 | about 70% |
| **Enterprise** | from 3,500 | from 1,200 | negotiated | negotiated | target 50% or more |

Extra users: USD 9 per user per month. Overage (about 3x cost): Standard questions USD 0.02 each, Claude questions USD 0.10, agent runs USD 0.35, voice minutes USD 0.22.

**Self-hosted licence (international):** about 18 months of the hosted fee (Basic 1,422; Standard 3,582; Professional 8,082) plus 15% a year. Customer brings their own AI keys, or we resell credits at 2x cost.

**Read this before quoting anyone abroad.** The product is localised for Pakistan: FBR digital invoicing, Pakistani sales tax and withholding rules, the Pakistani chart of accounts and fiscal year, PKR formatting, Karachi-style addresses. An international customer needs their own tax rules (VAT, GST, e-invoicing), currency and language. That localisation is **not built**. Until it is, sell internationally only to (a) Pakistani-run businesses abroad that still report under Pakistani rules, or (b) as a custom project priced at the Enterprise rate with the localisation scoped separately. Selling the USD list to a generic overseas distributor today would over-promise.

### Which list applies
Use the PKR list when the customer is a Pakistani company paying in PKR. Use the USD list when the customer is outside Pakistan or insists on paying in dollars (including Pakistani exporters who invoice and budget in USD, who can choose either). Do not let a customer pick the cheaper list; it follows where the company is registered. Review both lists every quarter against the exchange rate and vendor prices.

## 4. How this compares to what customers can already buy in Pakistan

| Option | Price signal |
|---|---|
| HysabOne (cloud accounting and inventory) | from PKR 3,499 a month, unlimited users |
| Precise ERP (practice-management) | PKR 9,900 (3 users) to 24,900 (15 users) a month |
| Local custom build (Softvirtue) | PKR 80,000 to 150,000 for an inventory module; PKR 400,000 to 600,000+ for a full ERP, one-off |
| Odoo / SAP | priced in USD with separate implementation partners; no local per-user price found |

For Pakistan, our Basic at PKR 20,000 a month sits above commodity accounting tools. That is only defensible if the pitch is clear: built for FMCG distribution (schemes, credit control, route and warehouse operations), FBR digital invoicing built in, role guides for staff, and an assistant that knows the business. Expect price pushback. Standard and Professional are justified by the AI, which cheap competitors do not offer.

## 5. Recommended way to sell

1. **First 3 customers: pilot pricing.** 50% off the monthly fee for 6 months in return for a case study and feedback. Waive setup if they pay 3 months up front.
2. **Lead with Standard**, not Basic. Basic is the demo-to-trial step; Standard is the product.
3. **Offer annual prepay** at 10 months for 12.
4. **Meter AI from day one** (the backend should count questions, scans, agent runs and voice minutes per company per month) so overages can be billed and so one heavy customer cannot sink the margin. Not built yet.
5. **Break-even example:** one Standard customer pays 45,000 a month and costs about 8,100 to run, so about 37,000 a month of margin goes to support, sales and your time. Ten Standard customers is about 370,000 a month before your own costs.

## 6. What to build to back this plan

In order of value per effort: usage metering per company and monthly caps; Professional AI agents (collections and replenishment); empty-company onboarding so a customer starts clean instead of from the demo seed; installers; voice agents on LiveKit; WhatsApp Business API sending.

## Sources (verify before quoting)

- LiveKit pricing, third-party summaries: [trtc.io](https://trtc.io/blog/details/livekit-pricing-2026) (published by a competitor), [forasoft.com](https://www.forasoft.com/blog/article/livekit-vs-agora-cost-analysis), [usagepricing.com](https://usagepricing.com/blueprint/livekit). Official page: livekit.io/pricing.
- Gemini 2.5 Flash and Pro prices: [anotherwrapper.com](https://anotherwrapper.com/llm-pricing/gemini-2.5-flash), [pricepertoken.com](https://pricepertoken.com/pricing-page/model/google-gemini-2.5-flash). Official page: ai.google.dev/gemini-api/docs/pricing.
- Claude prices: [finout.io](https://finout.io/blog/anthropic-api-pricing), [morphllm.com](https://www.morphllm.com/anthropic-claude-api-pricing). One source claimed a different Sonnet 5 price ($2 / $10); sources disagree, so check anthropic.com/pricing for the Sonnet 5.5 and Haiku 5.5 models this project uses.
- Pakistan price points (vendor marketing pages): [HysabOne](https://hysabone.com/erp-software-pakistan/), [Precise ERP](https://precisegroup-pk.lovable.app/site/pricing), [Softvirtue](https://www.softvirtue.com/pricing).
