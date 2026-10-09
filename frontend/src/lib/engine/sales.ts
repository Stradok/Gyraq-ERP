import { addDays } from "../data/dates";
import { customerStats, invalidate } from "../data/queries";
import type { CreditNote, Customer, CustomerPayment, DocLine, Invoice, SalesOrder, Shipment } from "../data/types";
import { creditCheck, docTotals, priceLine } from "../engines";
import { runAutomations } from "./automations";
import { assertPostable, audit, cell, fail, money, newId, nextNo, notify, ok, pad, postJE, queue, r2, unitCost, type Ctx, type Result } from "./core";

export interface OrderLineIn { productId: string; cartons: number; discPct: number }
const BANKS = ["1100", "1110", "1120"];

function reserve(ctx: Ctx, so: SalesOrder): { partial: boolean } {
  let partial = false;
  const keep: DocLine[] = [];
  for (const l of so.lines) {
    const c = cell(ctx.db, l.productId, so.warehouseId);
    const p = ctx.db.products.find((x) => x.id === l.productId)!;
    const free = Math.floor((c.on - c.res) / p.cartonSize) * p.cartonSize;
    const q = Math.min(l.qty, free);
    if (q < l.qty) partial = true;
    if (q <= 0) continue;
    const ratio = q / l.qty;
    keep.push(ratio === 1 ? l : { ...l, qty: q, value: r2(l.value * ratio), discount: r2(l.discount * ratio), salesTax: r2(l.salesTax * ratio) });
    c.res += q;
  }
  so.lines = keep;
  return { partial };
}
function release(ctx: Ctx, so: SalesOrder) { for (const l of so.lines) { const c = cell(ctx.db, l.productId, so.warehouseId); c.res = Math.max(0, c.res - l.qty); } }

export function createOrder(ctx: Ctx, p: { customerId: string; lines: OrderLineIn[]; mode: "confirm" | "draft"; source?: "user" | "ai_proposal" }): Result<{ id: string; status: string }> {
  const db = ctx.db;
  const c = db.customers.find((x) => x.id === p.customerId);
  if (!c) return fail("CUS_NOT_FOUND", "Pick a customer", "An order needs a customer.", "Select one first.");
  if (!p.lines.length) return fail("SO_EMPTY", "Add at least one product", "An empty order can't be saved.", "Add lines first.");
  const priced = p.lines.flatMap((l) => priceLine(db.products.find((x) => x.id === l.productId)!, c, l.cartons, l.discPct));
  const lines: DocLine[] = priced.map(({ cartons: _c, trace: _t, ...d }) => d);
  const t = docTotals(lines, c);
  const check = creditCheck(c, customerStats(c.id), t.total, db.settings.maxOverdueDays);
  const so: SalesOrder = { id: newId("so"), number: nextNo("SO-", db.orders, 20000), customerId: c.id, repId: c.repId, warehouseId: c.warehouseId, date: ctx.date, status: "draft", lines, subtotal: t.gross, discount: t.discount, tax: t.tax, total: t.total, invoiceId: null, creditCheck: check, source: p.source ?? "user" };
  let note = "";
  if (p.mode === "confirm" && check.decision !== "block") {
    const r = reserve(ctx, so);
    if (!so.lines.length) return fail("STK_NONE", "Nothing is available to reserve", `${db.warehouses.find((w) => w.id === c.warehouseId)!.code} has no free stock for these products.`, "Reduce the quantity, or transfer stock into the warehouse first.");
    const t2 = docTotals(so.lines, c);
    so.subtotal = t2.gross; so.discount = t2.discount; so.tax = t2.tax; so.total = t2.total;
    so.status = "reserved"; note = r.partial ? " Some lines were only partly reserved." : "";
  }
  db.orders.unshift(so);
  audit(ctx, so.status === "reserved" ? "sales_order.confirmed" : "sales_order.drafted", "Sales order", so.number, so.status === "reserved" ? `Stock reserved · credit ${check.decision}` : check.decision === "block" ? `Draft: credit blocked (${check.reasons[0]})` : "Saved as draft");
  if (so.status === "reserved") runAutomations(ctx, "order.confirmed", { amount: so.total, ref: so.id, label: `${so.number} (${c.name})`, href: `/sales/orders/${so.id}` });
  return ok({ id: so.id, status: so.status }, so.status === "reserved" ? `${so.number} confirmed and stock reserved.${note}` : `${so.number} saved as draft.${check.decision === "block" ? " Credit check blocked confirmation." : ""}`);
}

export function requestCreditOverride(ctx: Ctx, p: { orderId: string }): Result {
  const so = ctx.db.orders.find((o) => o.id === p.orderId);
  if (!so || so.status !== "draft") return fail("SO_STATE", "Order can't be sent for override", "Only draft orders blocked by credit need an override.", "Open the draft order and try again.");
  if (ctx.db.approvals.some((a) => a.type === "credit_override" && a.ref === so.id && a.status === "pending")) return fail("SO_DUP_REQ", "Already requested", "An override is already waiting for approval.", "Ask the Sales Manager to approve it.");
  const c = ctx.db.customers.find((x) => x.id === so.customerId)!;
  ctx.db.approvals.unshift({ id: newId("apr"), type: "credit_override", title: `Credit override – ${c.name}`, subtitle: `${so.number} · ${so.creditCheck?.reasons[0] ?? "over limit"}`, amount: so.total, requestedBy: ctx.actor, requestedAt: ctx.date, status: "pending", ref: so.id, source: "user", step: "Sales Manager" });
  audit(ctx, "customer.credit_override_requested", "Sales order", so.number, so.creditCheck?.reasons.join("; "));
  notify(ctx, "Credit override requested", `${so.number} for ${c.name}`, "warning", "/approvals");
  return ok(undefined, "Sent to the Sales Manager");
}

export function confirmOrder(ctx: Ctx, p: { orderId: string; override?: boolean }): Result {
  const so = ctx.db.orders.find((o) => o.id === p.orderId);
  if (!so || so.status !== "draft") return fail("SO_STATE", "Order can't be confirmed", "Only draft orders can be confirmed.", "Open the order to see its status.");
  const c = ctx.db.customers.find((x) => x.id === so.customerId)!;
  const check = creditCheck(c, customerStats(c.id), so.total, ctx.db.settings.maxOverdueDays);
  if (check.decision === "block" && !p.override) return fail("CRD_BLOCK", "Credit check blocked this order", check.reasons.join(". "), "Request a credit override from the Sales Manager.");
  const r = reserve(ctx, so);
  if (!so.lines.length) return fail("STK_NONE", "Nothing is available to reserve", "No free stock for these products.", "Transfer stock in or reduce the quantity.");
  const t = docTotals(so.lines, c);
  Object.assign(so, { subtotal: t.gross, discount: t.discount, tax: t.tax, total: t.total, status: "reserved", creditCheck: { ...check, reasons: p.override ? [...check.reasons, "Override approved"] : check.reasons } });
  audit(ctx, "sales_order.confirmed", "Sales order", so.number, p.override ? "Confirmed after credit override" : "Stock reserved");
  return ok(undefined, `${so.number} confirmed.${r.partial ? " Some lines were partly reserved." : ""}`);
}

export function cancelOrder(ctx: Ctx, p: { orderId: string; reason: string }): Result {
  const so = ctx.db.orders.find((o) => o.id === p.orderId);
  if (!so || !["draft", "confirmed", "reserved"].includes(so.status)) return fail("SO_STATE", "Order can't be cancelled", "Dispatched orders need a return or credit note instead.", "Create a return against the invoice.");
  if (so.status !== "draft") release(ctx, so);
  so.status = "cancelled";
  audit(ctx, "sales_order.cancelled", "Sales order", so.number, p.reason);
  return ok(undefined, `${so.number} cancelled and reservations released`);
}

export function pickOrder(ctx: Ctx, p: { orderId: string }): Result {
  const so = ctx.db.orders.find((o) => o.id === p.orderId);
  if (!so || !["reserved", "confirmed"].includes(so.status)) return fail("SO_STATE", "Order can't be picked", "Only confirmed orders with reserved stock can be picked.", "Confirm the order first.");
  so.picked = true;
  audit(ctx, "pick_list.completed", "Sales order", so.number, `${so.lines.length} lines picked (FEFO)`);
  return ok(undefined, `${so.number} picked and ready to dispatch`);
}

export function dispatchOrder(ctx: Ctx, p: { orderId: string; vehicle: string; driver: string }): Result<{ invoiceId: string; shipmentId: string }> {
  const db = ctx.db;
  const so = db.orders.find((o) => o.id === p.orderId);
  if (!so || !["reserved", "confirmed"].includes(so.status)) return fail("SO_STATE", "Order can't be dispatched", "Only confirmed orders with reserved stock can be dispatched.", "Open the order to see its status.");
  if (!so.picked) return fail("SO_NOT_PICKED", "Pick the order first", "Goods must be picked before a delivery challan is issued.", "Mark the pick list complete, then dispatch.");
  if (!p.vehicle.trim() || !p.driver.trim()) return fail("VAL_VEHICLE", "Add vehicle and driver", "The gate pass needs both.", "Enter the vehicle number and driver name.");
  const blocked = assertPostable(db, ctx.date);
  if (blocked) return blocked as Result<never>;
  const c = db.customers.find((x) => x.id === so.customerId)!;
  // issue stock at moving-average cost
  let cogs = 0, freeCogs = 0;
  for (const l of so.lines) {
    const k = cell(db, l.productId, so.warehouseId);
    if (k.on < l.qty) return fail("STK_SHORT", "Stock is short", `${db.products.find((x) => x.id === l.productId)!.name} has ${k.on} on hand but ${l.qty} is needed.`, "Count stock or transfer more into the warehouse.");
  }
  for (const l of so.lines) {
    const k = cell(db, l.productId, so.warehouseId);
    const v = r2((k.val * l.qty) / k.on);
    k.on -= l.qty; k.res = Math.max(0, k.res - l.qty); k.val = r2(k.val - v);
    if (l.free) freeCogs += v; else cogs += v;
  }
  cogs = r2(cogs); freeCogs = r2(freeCogs);
  const t = docTotals(so.lines, c);
  const invNo = nextNo("INV-", db.invoices, 10000);
  const inv: Invoice = {
    id: newId("inv"), number: invNo, customerId: c.id, orderId: so.id, warehouseId: so.warehouseId, date: ctx.date, dueDate: addDays(ctx.date, c.termsDays),
    lines: so.lines, subtotal: t.gross, discount: t.discount, salesTax: t.tax, furtherTax: t.further, wht236h: t.wht, total: t.total, paid: 0, cogs: r2(cogs + freeCogs), status: "sent", paymentStatus: "unpaid",
    fbr: { status: "simulated", irn: `SIM-${ctx.date.replace(/-/g, "")}-${pad(+invNo.replace(/\D/g, "") % 1_000_000, 6)}`, at: ctx.date },
  };
  const sh: Shipment = { id: newId("dc"), number: nextNo("DC-", db.shipments, 8000), orderId: so.id, invoiceId: inv.id, customerId: c.id, warehouseId: so.warehouseId, date: ctx.date, vehicle: p.vehicle.trim().toUpperCase(), driver: p.driver.trim(), gatePass: `GP-${pad(db.shipments.length + 1, 5)}`, status: "dispatched", lines: so.lines.map((l) => ({ productId: l.productId, qty: l.qty })) };
  inv.shipmentId = sh.id;
  db.invoices.unshift(inv); db.shipments.unshift(sh);
  so.invoiceId = inv.id; so.status = "fulfilled";
  postJE(ctx, `Sales invoice ${inv.number} – ${c.name}`, `Invoice ${inv.number}`, [
    { account: "1200", debit: inv.total, credit: 0 }, { account: "4030", debit: inv.discount, credit: 0 }, { account: "4010", debit: 0, credit: inv.subtotal },
    { account: "2100", debit: 0, credit: inv.salesTax }, { account: "2105", debit: 0, credit: inv.furtherTax }, { account: "2120", debit: 0, credit: inv.wht236h },
    { account: "5010", debit: cogs, credit: 0 }, { account: "5040", debit: freeCogs, credit: 0 }, { account: "1300", debit: 0, credit: inv.cogs },
  ]);
  audit(ctx, "shipment.dispatched", "Delivery challan", sh.number, `${so.number} · ${sh.vehicle} · ${sh.driver}`);
  audit(ctx, "invoice.approved", "Invoice", inv.number, `${money(inv.total)} · FBR ${inv.fbr.irn} (simulated)`);
  queue(ctx, "FBR", "FBR Digital Invoicing (PRAL)", `Invoice ${inv.number}`, `Simulated submission. IRN ${inv.fbr.irn}. Payload available on the invoice page.`);
  runAutomations(ctx, "invoice.posted", { amount: inv.total, ref: inv.id, label: `${inv.number} (${c.name})`, href: `/sales/invoices/${inv.id}` });
  for (const l of so.lines) { const k = cell(db, l.productId, so.warehouseId); const p2 = db.products.find((x) => x.id === l.productId)!; if (k.ema > 0.5 && (k.on - k.res) / k.ema < 7) { runAutomations(ctx, "stock.low", { ref: p2.id, label: `${p2.name} at ${db.warehouses.find((w) => w.id === so.warehouseId)!.code}`, href: "/inventory/replenishment" }); break; } }
  return ok({ invoiceId: inv.id, shipmentId: sh.id }, `${sh.number} issued and ${inv.number} approved. FBR reference ${inv.fbr.irn} (simulated).`);
}

export function markDelivered(ctx: Ctx, p: { shipmentId: string }): Result {
  const sh = ctx.db.shipments.find((s) => s.id === p.shipmentId);
  if (!sh || sh.status !== "dispatched") return fail("DC_STATE", "Shipment can't be marked delivered", "Only dispatched shipments can be delivered.", "Open the challan to see its status.");
  sh.status = "delivered";
  audit(ctx, "shipment.delivered", "Delivery challan", sh.number, "Proof of delivery recorded");
  return ok(undefined, `${sh.number} delivered`);
}

// ───── payments ─────
export interface RecordPaymentIn { customerId: string; amount: number; method: CustomerPayment["method"]; chequeNo?: string; bankName?: string; bankAccount?: string }
export function recordPayment(ctx: Ctx, p: RecordPaymentIn): Result<{ id: string }> {
  const db = ctx.db;
  const c = db.customers.find((x) => x.id === p.customerId);
  if (!c) return fail("CUS_NOT_FOUND", "Pick a customer", "A payment needs a customer.", "Select one first.");
  const blocked = assertPostable(db, ctx.date);
  if (blocked) return blocked as Result<never>;
  const open = db.invoices.filter((i) => i.customerId === c.id && i.total - i.paid > 0.5).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const outstanding = r2(open.reduce((s, i) => s + i.total - i.paid, 0));
  if (!(p.amount > 0)) return fail("PAY_AMOUNT", "Enter an amount", "Payments must be above zero.", "Type the amount received.");
  if (p.amount > outstanding + 0.5) return fail("PAY_OVER", "Amount is more than the customer owes", `${c.name} owes ${money(outstanding)}, but ${money(p.amount)} was entered.`, "Enter the correct amount, or record the extra as an advance once that feature is enabled.");
  if ((p.method === "cheque" || p.method === "pdc") && !/^\d{4,10}$/.test(p.chequeNo ?? "")) return fail("PAY_CHEQUE", "Cheque number needed", "Cheques need a 4 to 10 digit number.", "Type the number printed on the cheque.");
  let left = p.amount;
  const allocations: CustomerPayment["allocations"] = [];
  for (const i of open) { if (left <= 0.004) break; const a = r2(Math.min(i.total - i.paid, left)); allocations.push({ invoiceId: i.id, amount: a }); left = r2(left - a); i.paid = r2(i.paid + a); i.paymentStatus = i.paid >= i.total - 0.01 ? "paid" : "partially_paid"; }
  const bank = p.bankAccount && BANKS.includes(p.bankAccount) ? p.bankAccount : "1100";
  const status: CustomerPayment["status"] = p.method === "cheque" || p.method === "pdc" ? "in_hand" : "cleared";
  const pay: CustomerPayment = { id: newId("pay"), number: nextNo("RCP-", db.payments, 4000), customerId: c.id, date: ctx.date, method: p.method, amount: p.amount, status, chequeNo: p.chequeNo, bank: p.bankName, allocations };
  db.payments.unshift(pay);
  const debit = p.method === "cash" ? "1015" : p.method === "bank_transfer" ? bank : "1210";
  postJE(ctx, `${p.method === "cash" ? "Cash" : p.method === "bank_transfer" ? "Bank transfer" : `Cheque ${p.chequeNo}`} receipt ${pay.number} – ${c.name}`, `Receipt ${pay.number}`, [{ account: debit, debit: p.amount, credit: 0 }, { account: "1200", debit: 0, credit: p.amount }]);
  audit(ctx, "payment.recorded", "Payment", pay.number, `${money(p.amount)} from ${c.name}, ${allocations.length} invoice(s)`);
  invalidate(db);
  return ok({ id: pay.id }, `${pay.number}: ${money(p.amount)} recorded and allocated to ${allocations.length} invoice${allocations.length === 1 ? "" : "s"}`);
}

export function depositCheque(ctx: Ctx, p: { paymentId: string }): Result {
  const pay = ctx.db.payments.find((x) => x.id === p.paymentId);
  if (!pay || pay.status !== "in_hand") return fail("PAY_STATE", "Cheque can't be deposited", "Only cheques in hand can be deposited.", "Check the cheque register.");
  pay.status = "deposited";
  audit(ctx, "cheque.deposited", "Payment", pay.number, `Cheque ${pay.chequeNo} sent to bank`);
  return ok(undefined, `Cheque ${pay.chequeNo} deposited`);
}
export function clearCheque(ctx: Ctx, p: { paymentId: string; bankAccount?: string }): Result {
  const pay = ctx.db.payments.find((x) => x.id === p.paymentId);
  if (!pay || pay.status !== "deposited") return fail("PAY_STATE", "Cheque can't be cleared", "Deposit the cheque first.", "Use Deposit on the cheque register.");
  const blocked = assertPostable(ctx.db, ctx.date);
  if (blocked) return blocked as Result<never>;
  pay.status = "cleared";
  postJE(ctx, `Cheque ${pay.chequeNo} cleared`, `Receipt ${pay.number}`, [{ account: p.bankAccount && BANKS.includes(p.bankAccount) ? p.bankAccount : "1100", debit: pay.amount, credit: 0 }, { account: "1210", debit: 0, credit: pay.amount }]);
  audit(ctx, "cheque.cleared", "Payment", pay.number, money(pay.amount));
  return ok(undefined, `Cheque ${pay.chequeNo} cleared. ${money(pay.amount)} is in the bank.`);
}
export function bounceCheque(ctx: Ctx, p: { paymentId: string; reason: string }): Result {
  const db = ctx.db;
  const pay = db.payments.find((x) => x.id === p.paymentId);
  if (!pay || !["in_hand", "deposited"].includes(pay.status)) return fail("PAY_STATE", "Cheque can't be marked bounced", "Only cheques in hand or deposited can bounce. Cleared cheques are final.", "Check the cheque register.");
  const blocked = assertPostable(db, ctx.date);
  if (blocked) return blocked as Result<never>;
  const c = db.customers.find((x) => x.id === pay.customerId)!;
  for (const a of pay.allocations) { const i = db.invoices.find((x) => x.id === a.invoiceId); if (i) { i.paid = r2(i.paid - a.amount); i.paymentStatus = i.paid <= 0.5 ? "unpaid" : i.paid >= i.total - 0.01 ? "paid" : "partially_paid"; } }
  pay.allocations = []; pay.status = "bounced";
  postJE(ctx, `Cheque ${pay.chequeNo} bounced – ${c.name}`, `Receipt ${pay.number}`, [{ account: "1200", debit: pay.amount, credit: 0 }, { account: "1210", debit: 0, credit: pay.amount }, { account: "6090", debit: 2500, credit: 0 }, { account: "1100", debit: 0, credit: 2500 }]);
  audit(ctx, "cheque.bounced", "Payment", pay.number, `${money(pay.amount)} · ${p.reason}`);
  notify(ctx, `Cheque bounced: ${c.name}`, `${money(pay.amount)} returned unpaid. Invoices re-opened and risk recomputed.`, "danger", `/customers/${c.id}`);
  runAutomations(ctx, "payment.bounced", { amount: pay.amount, ref: pay.id, label: `${pay.number} (${c.name})`, href: `/customers/${c.id}` });
  return ok(undefined, `Cheque ${pay.chequeNo} marked bounced. ${c.name}'s invoices are open again.`);
}
export function depositCash(ctx: Ctx, p: { amount: number; bankAccount: string }): Result {
  const bal = ctx.db.journal.reduce((s, j) => s + j.lines.filter((l) => l.account === "1015").reduce((x, l) => x + l.debit - l.credit, 0), 0);
  if (!(p.amount > 0) || p.amount > bal + 0.5) return fail("CASH_DEP", "Amount is more than the salesmen are holding", `Cash with salesmen is ${money(bal)}.`, "Deposit up to that amount.");
  const blocked = assertPostable(ctx.db, ctx.date);
  if (blocked) return blocked as Result<never>;
  postJE(ctx, "Salesman cash deposit", "Cash deposit", [{ account: BANKS.includes(p.bankAccount) ? p.bankAccount : "1100", debit: p.amount, credit: 0 }, { account: "1015", debit: 0, credit: p.amount }]);
  audit(ctx, "cash.deposited", "Bank", "Salesman deposit", money(p.amount));
  return ok(undefined, `${money(p.amount)} deposited`);
}

// ───── returns & credit notes ─────
export function createReturn(ctx: Ctx, p: { invoiceId: string; lines: { productId: string; qty: number; condition: "resellable" | "damaged" | "expired" }[]; reason: CreditNote["reason"] }): Result<{ id: string }> {
  const db = ctx.db;
  const inv = db.invoices.find((i) => i.id === p.invoiceId);
  if (!inv) return fail("INV_NOT_FOUND", "Invoice not found", "It may have been removed.", "Refresh the page.");
  const blocked = assertPostable(db, ctx.date);
  if (blocked) return blocked as Result<never>;
  const lines = p.lines.filter((l) => l.qty > 0);
  if (!lines.length) return fail("RET_EMPTY", "Enter a quantity to return", "At least one line needs a quantity.", "Type how many units came back.");
  const already = new Map<string, number>();
  for (const cn of db.creditNotes.filter((x) => x.invoiceId === inv.id)) for (const l of cn.lines ?? []) already.set(l.productId, (already.get(l.productId) ?? 0) + l.qty);
  let sub = 0, tax = 0;
  const stockLines: { productId: string; qty: number; condition: string; cost: number }[] = [];
  for (const l of lines) {
    const il = inv.lines.find((x) => x.productId === l.productId && !x.free);
    if (!il) return fail("RET_NOT_ON_INVOICE", "That product isn't on this invoice", "You can only return what was invoiced.", "Remove the line.");
    const max = il.qty - (already.get(l.productId) ?? 0);
    if (l.qty > max) return fail("RET_TOO_MANY", "Return is more than was invoiced", `${db.products.find((x) => x.id === l.productId)!.name}: ${il.qty} invoiced, ${max} still returnable.`, "Reduce the quantity.");
    const frac = l.qty / il.qty;
    sub += il.value * frac; tax += il.salesTax * frac;
    const pr = db.products.find((x) => x.id === l.productId)!;
    stockLines.push({ productId: l.productId, qty: l.qty, condition: l.condition, cost: unitCost(cell(db, l.productId, inv.warehouseId), pr.cost) });
  }
  sub = r2(sub); tax = r2(tax);
  const cn: CreditNote = { id: newId("cn"), number: nextNo("CN-", db.creditNotes, 300), invoiceId: inv.id, customerId: inv.customerId, date: ctx.date, reason: p.reason, lines, subtotal: sub, tax, total: r2(sub + tax) };
  db.creditNotes.unshift(cn);
  inv.paid = r2(inv.paid + cn.total);
  inv.paymentStatus = inv.paid >= inv.total - 0.01 ? "paid" : inv.paid > 0 ? "partially_paid" : "unpaid";
  postJE(ctx, `Credit note ${cn.number} against ${inv.number}`, `Credit note ${cn.number}`, [{ account: "4020", debit: sub, credit: 0 }, { account: "2100", debit: tax, credit: 0 }, { account: "1200", debit: 0, credit: cn.total }]);
  const claimBySup = new Map<string, number>();
  for (const s of stockLines) {
    const v = r2(s.qty * s.cost);
    if (s.condition === "resellable") { const k = cell(db, s.productId, inv.warehouseId); k.on += s.qty; k.val = r2(k.val + v); postJE(ctx, `Return to stock ${cn.number}`, `Credit note ${cn.number}`, [{ account: "1300", debit: v, credit: 0 }, { account: "5010", debit: 0, credit: v }]); }
    else { const sup = db.products.find((x) => x.id === s.productId)!.supplierId; claimBySup.set(sup, r2((claimBySup.get(sup) ?? 0) + v)); postJE(ctx, `${s.condition} return ${cn.number}: claimable from principal`, `Credit note ${cn.number}`, [{ account: "1500", debit: v, credit: 0 }, { account: "5010", debit: 0, credit: v }]); }
  }
  for (const [supplierId, amount] of claimBySup) db.claims.unshift({ id: newId("clm"), number: nextNo("CLM-", db.claims, 100), supplierId, type: p.lines.some((l) => l.condition === "expired") ? "expiry" : "damage", date: ctx.date, amount, status: "draft", ref: cn.number, note: `From ${cn.number} (${inv.number})` });
  audit(ctx, "credit_note.created", "Credit note", cn.number, `${money(cn.total)} against ${inv.number}`);
  return ok({ id: cn.id }, `${cn.number} issued for ${money(cn.total)}${claimBySup.size ? ` · ${claimBySup.size} principal claim(s) drafted` : ""}`);
}
export function setClaimStatus(ctx: Ctx, p: { id: string; status: "submitted" | "accepted" | "settled" | "rejected" }): Result {
  const c = ctx.db.claims.find((x) => x.id === p.id);
  if (!c) return fail("CLM_NOT_FOUND", "Claim not found", "It may have been removed.", "Refresh the page.");
  const order = ["draft", "submitted", "accepted", "settled"];
  if (p.status !== "rejected" && order.indexOf(p.status) !== order.indexOf(c.status) + 1) return fail("CLM_STATE", "That step isn't next", `A ${c.status} claim goes to ${order[order.indexOf(c.status) + 1] ?? "no further status"}.`, "Follow Draft → Submitted → Accepted → Settled.");
  if (p.status === "settled") { const blocked = assertPostable(ctx.db, ctx.date); if (blocked) return blocked as Result<never>; postJE(ctx, `Principal claim ${c.number} settled by offset`, `Claim ${c.number}`, [{ account: "2010", debit: c.amount, credit: 0 }, { account: "1500", debit: 0, credit: c.amount }]); }
  c.status = p.status;
  audit(ctx, `claim.${p.status}`, "Principal claim", c.number, money(c.amount));
  return ok(undefined, `${c.number} ${p.status}`);
}
void BANKS;
