import { addDays } from "../data/dates";
import type { Channel, Customer, DocLine, Lead, Product, Quote, Supplier, TaxCategory } from "../data/types";
import { priceLine } from "../engines";
import { audit, cell, fail, money, newId, nextNo, notify, ok, pad, r2, type Ctx, type Result } from "./core";
import { customerStats } from "../data/queries";

const WH_BY_CITY: Record<string, string> = { Karachi: "KHI-DC1", Hyderabad: "KHI-DC1", Sukkur: "KHI-DC1", Nawabshah: "KHI-DC1", Lahore: "LHE-DC", Sialkot: "LHE-DC", Multan: "LHE-DC", Bahawalpur: "LHE-DC", Islamabad: "ISB-DC", Rawalpindi: "ISB-DC", Jhelum: "ISB-DC", Abbottabad: "ISB-DC", Faisalabad: "FSD-DP" };
const NTN = /^\d{7}-\d$/;
const CNIC = /^\d{5}-\d{7}-\d$/;

export interface CreateCustomer { name: string; channel: Channel; city: string; province: string; area: string; registered: boolean; ntn?: string; strn?: string; cnic?: string; atl: boolean; creditLimit: number; termsDays: number; contact: string; phone: string; email: string; repId: string }
export function createCustomer(ctx: Ctx, p: CreateCustomer): Result<{ id: string }> {
  const db = ctx.db;
  if (p.name.trim().length < 3) return fail("VAL_NAME", "Enter the customer's name", "Names need at least 3 characters.", "Type the trading name.");
  if (db.customers.some((c) => c.name.toLowerCase() === p.name.trim().toLowerCase())) return fail("CUS_DUPLICATE", "This customer already exists", `“${p.name}” is already in the customer list.`, "Open the existing customer instead.");
  if (p.registered && !NTN.test(p.ntn ?? "")) return fail("VAL_NTN", "NTN format looks wrong", "A registered business needs an NTN like 1234567-8.", "Check the NTN on the registration certificate.");
  if (!p.registered && p.cnic && !CNIC.test(p.cnic)) return fail("VAL_CNIC", "CNIC format looks wrong", "Use the format 42101-1234567-1.", "Check the CNIC and try again.");
  if (!(p.creditLimit >= 0) || p.creditLimit > 50_000_000) return fail("VAL_LIMIT", "Credit limit is out of range", "Enter an amount between 0 and Rs 50,000,000.", "New customers usually start under Rs 1,000,000.");
  const id = newId("cus");
  const c: Customer = {
    id, code: nextNo("CUS-", db.customers.map((x) => ({ number: x.code })), 0).replace(/(\d+)$/, (m) => pad(+m, 4)), name: p.name.trim(), channel: p.channel, city: p.city, province: p.province, area: p.area,
    ntn: p.registered ? p.ntn ?? null : null, strn: p.registered ? p.strn || null : null, cnic: p.registered ? null : p.cnic || null, registered: p.registered, atl: p.atl, creditLimit: p.creditLimit, termsDays: p.termsDays,
    repId: p.repId, warehouseId: `wh_${WH_BY_CITY[p.city] ?? "KHI-DC1"}`, status: "active", profile: "normal", contact: p.contact, phone: p.phone, email: p.email, since: ctx.date, size: 0.3,
  };
  db.customers.push(c);
  audit(ctx, "customer.created", "Customer", c.code, `${c.name} · limit ${money(c.creditLimit)}`);
  return ok({ id }, `${c.name} added as ${c.code}`);
}

export interface CreateSupplier { name: string; city: string; province: string; ntn: string; strn?: string; isPrincipal: boolean; leadTimeDays: number; termsDays: number; contact: string; phone: string; email: string; kind: "goods" | "services" }
export function createSupplier(ctx: Ctx, p: CreateSupplier): Result<{ id: string }> {
  const db = ctx.db;
  if (p.name.trim().length < 3) return fail("VAL_NAME", "Enter the supplier's name", "Names need at least 3 characters.", "Type the registered name.");
  if (db.suppliers.some((s) => s.name.toLowerCase() === p.name.trim().toLowerCase())) return fail("SUP_DUPLICATE", "This supplier already exists", `“${p.name}” is already a supplier.`, "Open the existing supplier instead.");
  if (!NTN.test(p.ntn)) return fail("VAL_NTN", "NTN format looks wrong", "Suppliers need an NTN like 1234567-8 so tax can be claimed.", "Check the NTN on their invoice.");
  const id = newId("sup");
  const s: Supplier = { id, code: nextNo("SUP-", db.suppliers.map((x) => ({ number: x.code }))).replace(/(\d+)$/, (m) => pad(+m, 3)), name: p.name.trim(), city: p.city, province: p.province, ntn: p.ntn, strn: p.strn ?? "", isPrincipal: p.isPrincipal, leadTimeDays: p.leadTimeDays, termsDays: p.termsDays, contact: p.contact, phone: p.phone, email: p.email, kind: p.kind };
  db.suppliers.push(s);
  audit(ctx, "supplier.created", "Supplier", s.code, s.name);
  return ok({ id }, `${s.name} added as ${s.code}`);
}

export interface CreateProduct { name: string; brand: string; category: Product["category"]; supplierId: string; cartonSize: number; price: number; cost: number; mrp: number; taxCategory: TaxCategory; hsCode: string; shelfLifeDays: number }
export function createProduct(ctx: Ctx, p: CreateProduct): Result<{ id: string }> {
  const db = ctx.db;
  if (p.name.trim().length < 3) return fail("VAL_NAME", "Enter the product name", "Include brand and pack size, e.g. “Brite Wash Detergent 1kg”.", "Type the full name.");
  if (!(p.cartonSize >= 1) || !(p.price > 0) || !(p.cost > 0)) return fail("VAL_PRICE", "Check carton size, price and cost", "All three must be above zero.", "Enter the per-piece trade price and cost.");
  if (p.cost > p.price) return fail("PRD_NEGATIVE_MARGIN", "Cost is above the selling price", `Cost ${money(p.cost)} is more than price ${money(p.price)}, so every sale would lose money.`, "Check both figures are per piece.");
  if (p.taxCategory === "third_schedule" && !(p.mrp > 0)) return fail("PRD_MRP", "Retail price (MRP) is needed", "Third Schedule goods are taxed on the printed retail price.", "Enter the MRP printed on the pack.");
  if (!/^\d{4}\.\d{4}$/.test(p.hsCode)) return fail("VAL_HS", "HS code format looks wrong", "FBR invoices need a code like 2202.1010.", "Look it up in the customs tariff.");
  const prefix = p.category === "beverages" ? "BEV" : p.category === "packaged_foods" ? "PKF" : p.category === "dairy" ? "DRY" : p.category === "snacks" ? "SNK" : p.category === "household" ? "HHD" : "PRC";
  const n = db.products.filter((x) => x.sku.startsWith(prefix)).length + 1;
  const id = newId("p");
  const prod: Product = { id, sku: `${prefix}-${pad(n, 3)}`, name: p.name.trim(), category: p.category, brand: p.brand, supplierId: p.supplierId, cartonSize: p.cartonSize, price: p.price, cost: p.cost, mrp: p.mrp || Math.ceil(p.price * 1.14), taxCategory: p.taxCategory, hsCode: p.hsCode, shelfLifeDays: p.shelfLifeDays, dailyDemand: 0, safetyDays: 9, barcode: `8964${Math.floor(Math.random() * 1e9).toString().padStart(9, "0")}` };
  db.products.push(prod);
  for (const w of db.warehouses) cell(db, id, w.id);
  audit(ctx, "product.created", "Product", prod.sku, prod.name);
  return ok({ id }, `${prod.name} added as ${prod.sku}`);
}

export interface CreateLead { company: string; contact: string; city: string; source: string; repId: string; value: number; probability: number }
export function createLead(ctx: Ctx, p: CreateLead): Result<{ id: string }> {
  if (p.company.trim().length < 2) return fail("VAL_NAME", "Enter the company name", "A lead needs at least a company name.", "Type the business name.");
  const l: Lead = { id: newId("lead"), company: p.company.trim(), contact: p.contact, city: p.city, source: p.source, repId: p.repId, value: p.value, probability: p.probability, stage: "new" };
  ctx.db.leads.unshift(l);
  audit(ctx, "lead.created", "Lead", l.company, `${money(l.value)} potential`);
  return ok({ id: l.id }, `Lead “${l.company}” added`);
}
export function moveLead(ctx: Ctx, p: { id: string; stage: Lead["stage"] }): Result {
  const l = ctx.db.leads.find((x) => x.id === p.id);
  if (!l) return fail("LEAD_NOT_FOUND", "Lead not found", "It may have been removed.", "Refresh the page.");
  l.stage = p.stage; l.probability = { new: 10, qualified: 25, proposal: 50, negotiation: 70, won: 100, lost: 0 }[p.stage];
  audit(ctx, "lead.stage_changed", "Lead", l.company, `Moved to ${p.stage}`);
  return ok(undefined, `${l.company} → ${p.stage}`);
}

export interface QuoteLine { productId: string; cartons: number; discPct: number }
export function createQuote(ctx: Ctx, p: { customerId: string; lines: QuoteLine[]; validDays: number }): Result<{ id: string }> {
  const db = ctx.db;
  const c = db.customers.find((x) => x.id === p.customerId);
  if (!c) return fail("CUS_NOT_FOUND", "Pick a customer", "A quotation needs a customer.", "Select one from the list.");
  if (!p.lines.length) return fail("QT_EMPTY", "Add at least one product", "An empty quotation can't be sent.", "Add lines first.");
  const lines: DocLine[] = p.lines.flatMap((l) => { const pr = db.products.find((x) => x.id === l.productId)!; return priceLine(pr, c, l.cartons, l.discPct).map(({ cartons: _c, trace: _t, ...d }) => d); });
  const q: Quote = { id: newId("q"), number: nextNo("QT-", db.quotes, 6000), customerId: c.id, repId: c.repId, date: ctx.date, validUntil: addDays(ctx.date, p.validDays), status: "draft", lines, total: r2(lines.reduce((s, l) => s + l.value, 0)) };
  db.quotes.unshift(q);
  audit(ctx, "quote.created", "Quotation", q.number, `${c.name} · ${money(q.total)}`);
  return ok({ id: q.id }, `${q.number} saved as draft`);
}
export function setQuoteStatus(ctx: Ctx, p: { id: string; status: Quote["status"] }): Result {
  const q = ctx.db.quotes.find((x) => x.id === p.id);
  if (!q) return fail("QT_NOT_FOUND", "Quotation not found", "It may have been removed.", "Refresh the page.");
  const allowed: Record<Quote["status"], Quote["status"][]> = { draft: ["sent", "rejected"], sent: ["accepted", "rejected", "expired"], accepted: [], rejected: [], expired: [] };
  if (!allowed[q.status].includes(p.status)) return fail("QT_TRANSITION", "That status change isn't allowed", `A ${q.status} quotation can't become ${p.status}.`, "Quotations go Draft → Sent → Accepted.");
  q.status = p.status;
  audit(ctx, `quote.${p.status}`, "Quotation", q.number);
  if (p.status === "sent") notify(ctx, `Quotation ${q.number} sent`, "Simulated: nothing was emailed.", "info", "/sales/quotes");
  return ok(undefined, `${q.number} marked ${p.status}`);
}

export interface RequestCreditLimit { customerId: string; newLimit: number; reason: string; requestedBy: string }
export function requestCreditLimit(ctx: Ctx, p: RequestCreditLimit): Result<{ approvalId: string }> {
  const c = ctx.db.customers.find((x) => x.id === p.customerId);
  if (!c) return fail("CUS_NOT_FOUND", "Customer not found", "It may have been removed.", "Refresh the page.");
  if (p.newLimit === c.creditLimit) return fail("CR_NO_CHANGE", "Limit is unchanged", "The new limit equals the current one.", "Enter a different amount.");
  const s = customerStats(c.id);
  const a = { id: newId("apr"), type: "credit_limit" as const, title: `Credit limit ${p.newLimit > c.creditLimit ? "increase" : "change"} – ${c.name}`, subtitle: `${money(c.creditLimit)} → ${money(p.newLimit)} · risk ${s.band}`, amount: p.newLimit, requestedBy: p.requestedBy, requestedAt: ctx.date, status: "pending" as const, ref: c.id, source: "user" as const, step: p.newLimit > 5_000_000 ? "Owner" : "Finance Manager", payload: { newLimit: p.newLimit, reason: p.reason } };
  ctx.db.approvals.unshift(a);
  audit(ctx, "customer.credit_limit_requested", "Customer", c.code, `${money(c.creditLimit)} → ${money(p.newLimit)}`);
  notify(ctx, "Approval requested", a.title, "info", "/approvals");
  return ok({ approvalId: a.id }, "Sent for approval");
}

export function requestCreditHold(ctx: Ctx, p: { customerId: string; reason: string }): Result<{ approvalId: string }> {
  const c = ctx.db.customers.find((x) => x.id === p.customerId);
  if (!c) return fail("CUS_NOT_FOUND", "Customer not found", "It may have been removed.", "Refresh the page.");
  if (c.status === "on_hold") return fail("CUS_ON_HOLD", "Already on credit hold", `${c.name} is already on hold.`, "Release the hold first if you want to change it.");
  if (ctx.db.approvals.some((a) => a.type === "credit_limit" && a.ref === c.id && a.status === "pending" && a.title.startsWith("Credit hold"))) return fail("CUS_HOLD_PENDING", "A hold request is already waiting", "The Sales Manager hasn't decided yet.", "Open Approvals.");
  const s = customerStats(c.id);
  const a = { id: newId("apr"), type: "credit_limit" as const, title: `Credit hold – ${c.name}`, subtitle: `${p.reason} · overdue ${money(s.overdue)}`, amount: null, requestedBy: ctx.actor, requestedAt: ctx.date, status: "pending" as const, ref: c.id, source: ctx.source === "ai_proposal" ? "ai" as const : "user" as const, step: "Sales Manager" };
  ctx.db.approvals.unshift(a);
  audit(ctx, ctx.source === "ai_proposal" ? "ai_proposal.confirmed" : "customer.credit_hold_requested", "Customer", c.code, p.reason);
  notify(ctx, "Credit hold requested", c.name, "warning", "/approvals");
  return ok({ approvalId: a.id }, "Credit hold sent for approval");
}

export function releaseCreditHold(ctx: Ctx, p: { customerId: string }): Result {
  const c = ctx.db.customers.find((x) => x.id === p.customerId);
  if (!c || c.status !== "on_hold") return fail("CUS_NOT_ON_HOLD", "Customer isn't on hold", "There is nothing to release.", "Open the customer to check its status.");
  const s = customerStats(c.id);
  if (s.overdue > 0) return fail("CUS_OVERDUE", "Overdue invoices are still open", `${c.name} still owes ${money(s.overdue)} past due.`, "Collect the overdue balance first, or ask the Owner to override.");
  c.status = "active"; c.holdReason = undefined;
  audit(ctx, "customer.hold_released", "Customer", c.code, c.name);
  return ok(undefined, `${c.name} released from credit hold`);
}
