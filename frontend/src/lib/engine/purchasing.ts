import { addDays, diffDays } from "../data/dates";
import type { DB } from "../data/sim";
import type { GoodsReceipt, MatchException, PurchaseOrder, SupplierBill, SupplierPayment } from "../data/types";
import { can } from "../rbac";
import { assertPostable, audit, cell, fail, levenshtein, money, newId, nextNo, normInvNo, notify, ok, pad, postJE, r2, type Ctx, type Result } from "./core";
import { runAutomations } from "./automations";

const BANKS = ["1100", "1110", "1120", "1130"];

export interface POLineIn { productId: string; cartons: number; price: number }
export function createPO(ctx: Ctx, p: { supplierId: string; warehouseId: string; lines: POLineIn[]; source?: PurchaseOrder["source"]; note?: string }): Result<{ id: string; status: PurchaseOrder["status"] }> {
  const db = ctx.db;
  const sup = db.suppliers.find((s) => s.id === p.supplierId);
  if (!sup || sup.kind !== "goods") return fail("PO_SUPPLIER", "Pick a goods supplier", "Purchase orders are raised against suppliers of goods.", "Choose a supplier from the list.");
  if (!p.lines.length) return fail("PO_EMPTY", "Add at least one product", "An empty purchase order can't be saved.", "Add lines first.");
  for (const l of p.lines) if (!(l.cartons >= 1) || !(l.price > 0)) return fail("PO_LINE", "Check quantities and prices", "Every line needs at least 1 carton and a price above zero.", "Fix the highlighted line.");
  const lines = p.lines.map((l) => { const pr = db.products.find((x) => x.id === l.productId)!; return { productId: l.productId, qty: l.cartons * pr.cartonSize, price: r2(l.price), received: 0 }; });
  const sub = r2(lines.reduce((s, l) => s + l.qty * l.price, 0));
  const po: PurchaseOrder = { id: newId("po"), number: nextNo("PO-", db.pos, 5000), supplierId: sup.id, warehouseId: p.warehouseId, date: ctx.date, expectedDate: addDays(ctx.date, sup.leadTimeDays), status: "pending_approval", lines, subtotal: sub, tax: r2(sub * 0.17), total: r2(sub * 1.17), source: p.source ?? "user" };
  const needsOwner = po.total > db.settings.poOwnerLimit;
  const autoApprove = !needsOwner && can(ctx.role, "approve.po");
  if (autoApprove) { po.status = "approved"; for (const l of lines) cell(db, l.productId, po.warehouseId).incoming += l.qty; }
  else db.approvals.unshift({ id: newId("apr"), type: "purchase_order", title: `Purchase order ${po.number} – ${sup.name}`, subtitle: `${lines.length} line${lines.length === 1 ? "" : "s"}${po.source === "ai_proposal" ? " · from AI recommendation" : ""}${p.note ? ` · ${p.note}` : ""}`, amount: po.total, requestedBy: ctx.actor, requestedAt: ctx.date, status: "pending", ref: po.id, source: po.source === "ai_proposal" ? "ai" : "user", step: needsOwner ? "Owner" : "Procurement Manager" });
  db.pos.unshift(po);
  audit(ctx, po.source === "ai_proposal" ? "ai_proposal.confirmed" : "purchase_order.created", "Purchase order", po.number, `${money(po.total)} · ${sup.name}${autoApprove ? " · approved within limit" : " · sent for approval"}`);
  return ok({ id: po.id, status: po.status }, autoApprove ? `${po.number} approved within your limit. Incoming stock and the cash forecast are updated.` : `${po.number} sent for ${needsOwner ? "Owner" : "Procurement Manager"} approval (${money(po.total)}).`);
}

export function approvePOEffects(db: DB, po: PurchaseOrder) { po.status = "approved"; for (const l of po.lines) cell(db, l.productId, po.warehouseId).incoming += l.qty - l.received; }

export interface ReceiptLineIn { productId: string; qty: number; rejected: number; batch?: string; expiry?: string }
export function receiveGoods(ctx: Ctx, p: { poId: string; lines: ReceiptLineIn[] }): Result<{ id: string }> {
  const db = ctx.db;
  const po = db.pos.find((x) => x.id === p.poId);
  if (!po || !["approved", "partially_received"].includes(po.status)) return fail("PO_STATE", "This order can't be received", po ? `${po.number} is ${po.status.replace("_", " ")}. Only approved orders can be received.` : "The order was not found.", "Approve the purchase order first.");
  const blocked = assertPostable(db, ctx.date);
  if (blocked) return blocked as Result<never>;
  const lines = p.lines.filter((l) => l.qty > 0 || l.rejected > 0);
  if (!lines.length) return fail("GRN_EMPTY", "Enter what arrived", "At least one line needs a received quantity.", "Count the delivery and enter quantities.");
  for (const l of lines) {
    const pl = po.lines.find((x) => x.productId === l.productId);
    const name = db.products.find((x) => x.id === l.productId)?.name ?? l.productId;
    if (!pl) return fail("GRN_NOT_ON_PO", "That product isn't on the order", `${name} isn't on ${po.number}.`, "Remove the line.");
    if (l.qty + l.rejected > pl.qty - pl.received + 0.001) return fail("GRN_OVER", "More arrived than was ordered", `${name}: ${pl.qty - pl.received} still expected, but ${l.qty + l.rejected} entered.`, "Check the delivery note, or raise a new purchase order for the extra.");
  }
  const g: GoodsReceipt = { id: newId("grn"), number: nextNo("GRN-", db.grns, 9000), poId: po.id, supplierId: po.supplierId, warehouseId: po.warehouseId, date: ctx.date, lines: [], value: 0 };
  let value = 0;
  for (const l of lines) {
    const pl = po.lines.find((x) => x.productId === l.productId)!;
    const pr = db.products.find((x) => x.id === l.productId)!;
    const c = cell(db, l.productId, po.warehouseId);
    const v = r2(l.qty * pl.price);
    c.on += l.qty; c.val = r2(c.val + v); c.incoming = Math.max(0, c.incoming - l.qty);
    pl.received += l.qty + l.rejected; // rejected goods go back to the supplier and close the line quantity
    value += v;
    g.lines.push({ productId: l.productId, qty: l.qty, rejected: l.rejected || undefined, batch: l.batch?.trim() || `B${ctx.date.slice(2, 4)}${ctx.date.slice(5, 7)}${ctx.date.slice(8, 10)}-${pr.sku.slice(-3)}`, expiry: l.expiry || addDays(ctx.date, Math.round(pr.shelfLifeDays * 0.8)) });
  }
  g.value = r2(value);
  db.grns.unshift(g);
  po.status = po.lines.every((l) => l.received >= l.qty - 0.001) ? "received" : "partially_received";
  postJE(ctx, `Goods receipt ${g.number} – ${po.number}`, `GRN ${g.number}`, [{ account: "1300", debit: g.value, credit: 0 }, { account: "2020", debit: 0, credit: g.value }]);
  audit(ctx, "goods_receipt.posted", "Goods receipt", g.number, `${po.number} · ${money(g.value)} to stock${lines.some((l) => l.rejected) ? " · rejects recorded" : ""}`);
  runAutomations(ctx, "po.received", { amount: g.value, ref: g.id, label: `${g.number} (${po.number})`, href: `/purchasing/orders/${po.id}` });
  return ok({ id: g.id }, `${g.number} posted: ${money(g.value)} added to stock${po.status === "received" ? ". Order complete." : ". Order partly received."}`);
}

// ───── bills and three-way match ─────
export interface BillLineIn { productId?: string; description: string; qty: number; price: number }
function taxOf(db: DB, productId: string | undefined, value: number, qty: number): number {
  const p = productId ? db.products.find((x) => x.id === productId) : undefined;
  if (!p || p.taxCategory === "exempt") return 0;
  return p.taxCategory === "standard" ? value * 0.18 : 0.18 * p.mrp * qty * 0.96;
}
function median(xs: number[]) { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length ? (s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2) : 0; }

export function matchBill(db: DB, b: { supplierId: string; poId: string | null; invoiceNo: string; date: string; lines: BillLineIn[]; total: number }, today: string, ignoreBillId?: string): MatchException[] {
  const ex: MatchException[] = [];
  const po = b.poId ? db.pos.find((p) => p.id === b.poId) : null;
  const grns = po ? db.grns.filter((g) => g.poId === po.id) : [];
  const prior = db.bills.filter((x) => x.poId === b.poId && x.id !== ignoreBillId && (x.status === "posted" || x.status === "paid"));
  for (const l of b.lines) {
    if (!l.productId) continue;
    const pr = db.products.find((x) => x.id === l.productId)!;
    if (po) {
      const pl = po.lines.find((x) => x.productId === l.productId);
      const received = grns.reduce((s, g) => s + g.lines.filter((x) => x.productId === l.productId).reduce((a, x) => a + x.qty, 0), 0);
      const billed = prior.reduce((s, x) => s + x.lines.filter((y) => y.productId === l.productId).reduce((a, y) => a + y.qty, 0), 0);
      if (!pl) ex.push({ type: "QTY_MISMATCH", productId: l.productId, expected: 0, actual: l.qty, variance: l.qty * l.price, note: `${pr.name} is not on ${po.number}` });
      else {
        if (received === 0) ex.push({ type: "MISSING_RECEIPT", productId: l.productId, expected: 0, actual: l.qty, variance: l.qty * l.price, note: `${pr.name} has not been received yet` });
        else if (l.qty > received - billed + 0.001) ex.push({ type: "QTY_MISMATCH", productId: l.productId, expected: received - billed, actual: l.qty, variance: (l.qty - (received - billed)) * l.price, note: `Billed ${l.qty}, only ${received - billed} received and not yet billed` });
        if (Math.abs(l.price - pl.price) > Math.max(pl.price * 0.01, 0.5)) ex.push({ type: "PRICE_VARIANCE", productId: l.productId, expected: pl.price, actual: l.price, variance: r2((l.price - pl.price) * l.qty), note: `Billed ${(((l.price / pl.price) - 1) * 100).toFixed(1)}% ${l.price > pl.price ? "above" : "below"} PO price` });
      }
    }
    const hist = db.bills.filter((x) => x.supplierId === b.supplierId && x.id !== ignoreBillId && (x.status === "posted" || x.status === "paid") && diffDays(today, x.date) <= 90).flatMap((x) => x.lines.filter((y) => y.productId === l.productId).map((y) => y.price));
    if (hist.length >= 3 && l.price > median(hist) * 1.05 && !ex.some((e) => e.type === "PRICE_INCREASE_VS_HISTORY")) ex.push({ type: "PRICE_INCREASE_VS_HISTORY", productId: l.productId, expected: median(hist), actual: l.price, variance: 0, note: `${pr.name} is ${(((l.price / median(hist)) - 1) * 100).toFixed(1)}% above the supplier's 90-day median` });
  }
  const norm = normInvNo(b.invoiceNo);
  for (const x of db.bills) {
    if (x.supplierId !== b.supplierId || x.id === ignoreBillId || x.status === "rejected") continue;
    const same = normInvNo(x.supplierInvoiceNo);
    if (same !== norm && levenshtein(same, norm) <= 1 && Math.abs(x.total - b.total) <= b.total * 0.005 && Math.abs(diffDays(x.date, b.date)) <= 10) ex.push({ type: "DUPLICATE_BILL", expected: x.total, actual: b.total, variance: b.total, note: `${b.invoiceNo} is within one character of ${x.supplierInvoiceNo}; same total, ${Math.abs(diffDays(x.date, b.date))} days apart` });
  }
  return ex;
}

function postBillJE(ctx: Ctx, bill: SupplierBill) {
  const db = ctx.db;
  const po = bill.poId ? db.pos.find((p) => p.id === bill.poId) : null;
  const sup = db.suppliers.find((s) => s.id === bill.supplierId)!;
  if (po) {
    const received = db.grns.filter((g) => g.poId === po.id).reduce((s, g) => s + g.value, 0);
    const alreadyBilled = db.bills.filter((x) => x.poId === po.id && x.id !== bill.id && x.status !== "rejected" && x.status !== "exception").reduce((s, x) => s + x.subtotal, 0);
    const grni = r2(Math.max(0, Math.min(received - alreadyBilled, bill.subtotal)));
    const ppv = r2(bill.subtotal - grni);
    postJE(ctx, `Supplier bill ${bill.supplierInvoiceNo}`, `Bill ${bill.number}`, [{ account: "2020", debit: grni, credit: 0 }, { account: "5030", debit: Math.max(ppv, 0), credit: Math.max(-ppv, 0) }, { account: "1400", debit: bill.tax, credit: 0 }, { account: "1410", debit: bill.wht236g, credit: 0 }, { account: "2010", debit: 0, credit: bill.total }]);
  } else {
    const acct = sup.kind === "services" ? (/rent|propert/i.test(sup.name) ? "6020" : /power|electric|utility/i.test(sup.name) ? "6030" : /fuel/i.test(sup.name) ? "6040" : /logist|transport/i.test(sup.name) ? "6050" : /security/i.test(sup.name) ? "6080" : /it |tech/i.test(sup.name) ? "6070" : "6990") : "1300";
    postJE(ctx, `Supplier bill ${bill.supplierInvoiceNo} (no PO)`, `Bill ${bill.number}`, [{ account: acct, debit: bill.subtotal, credit: 0 }, { account: "1400", debit: bill.tax, credit: 0 }, { account: "1410", debit: bill.wht236g, credit: 0 }, { account: "2010", debit: 0, credit: bill.total }]);
    if (acct === "1300") for (const l of bill.lines) if (l.productId) { const k = cell(db, l.productId, db.warehouses[0]!.id); k.on += l.qty; k.val = r2(k.val + l.total); }
  }
}

export function createBill(ctx: Ctx, p: { supplierId: string; poId: string | null; supplierInvoiceNo: string; date: string; lines: BillLineIn[]; source?: "manual" | "ai_extraction" }): Result<{ id: string; status: string }> {
  const db = ctx.db;
  const sup = db.suppliers.find((s) => s.id === p.supplierId);
  if (!sup) return fail("SUP_NOT_FOUND", "Pick a supplier", "A bill needs a supplier.", "Select one from the list.");
  if (!p.supplierInvoiceNo.trim()) return fail("BILL_NO", "Enter the supplier's invoice number", "It is how duplicates are caught.", "Copy it from the invoice.");
  const norm = normInvNo(p.supplierInvoiceNo);
  const dup = db.bills.find((b) => b.supplierId === sup.id && normInvNo(b.supplierInvoiceNo) === norm && b.status !== "rejected");
  if (dup) return fail("BILL_DUPLICATE", "This invoice was already entered", `${sup.name} invoice ${p.supplierInvoiceNo} exists as ${dup.number} (${money(dup.total)}).`, "Open the existing bill, or check the number.");
  if (p.date > ctx.date) return fail("BILL_DATE", "Bill date is in the future", "Bills can't be dated after today.", "Use the date printed on the invoice.");
  const blocked = assertPostable(db, ctx.date);
  if (blocked) return blocked as Result<never>;
  const lines = p.lines.filter((l) => l.qty > 0 && l.price > 0);
  if (!lines.length) return fail("BILL_EMPTY", "Add at least one line", "A bill needs quantities and prices.", "Enter the invoice lines.");
  const out = lines.map((l) => ({ productId: l.productId ?? null, description: l.description || db.products.find((x) => x.id === l.productId)?.name || "Item", qty: l.qty, price: r2(l.price), total: r2(l.qty * l.price) }));
  const sub = r2(out.reduce((s, l) => s + l.total, 0));
  const tax = r2(out.reduce((s, l) => s + taxOf(db, l.productId ?? undefined, l.total, l.qty), 0));
  const wht = r2((sub + tax) * 0.001);
  const bill: SupplierBill = { id: newId("bill"), number: nextNo("SB-", db.bills, 7000), supplierInvoiceNo: p.supplierInvoiceNo.trim(), supplierId: sup.id, poId: p.poId, date: p.date, dueDate: addDays(p.date, sup.termsDays), lines: out, subtotal: sub, tax, wht236g: wht, total: r2(sub + tax + wht), paid: 0, status: "posted", exceptions: [], source: p.source ?? "manual" };
  bill.exceptions = matchBill(db, { supplierId: sup.id, poId: p.poId, invoiceNo: bill.supplierInvoiceNo, date: bill.date, lines, total: bill.total }, ctx.date);
  if (bill.exceptions.length) {
    bill.status = "exception";
    db.approvals.unshift({ id: newId("apr"), type: "bill_variance", title: `Supplier bill ${bill.supplierInvoiceNo} – ${bill.exceptions[0]!.type === "DUPLICATE_BILL" ? "possible duplicate" : "match exceptions"}`, subtitle: `${sup.name} · ${bill.exceptions.length} exception${bill.exceptions.length > 1 ? "s" : ""}`, amount: bill.total, requestedBy: "Three-way match", requestedAt: ctx.date, status: "pending", ref: bill.id, source: "ai", step: "Finance Manager" });
    notify(ctx, `Supplier bill needs review: ${bill.supplierInvoiceNo}`, bill.exceptions.map((e) => e.type.replace(/_/g, " ").toLowerCase()).join(", "), "warning", `/purchasing/bills/${bill.id}`);
    runAutomations(ctx, "bill.exception", { amount: bill.total, ref: bill.id, label: `${bill.supplierInvoiceNo} (${sup.name})`, href: `/purchasing/bills/${bill.id}` });
  } else postBillJE(ctx, bill);
  db.bills.unshift(bill);
  audit(ctx, bill.status === "posted" ? "supplier_bill.posted" : "supplier_bill.exception", "Supplier bill", bill.supplierInvoiceNo, `${money(bill.total)} · ${bill.exceptions.length} exceptions${bill.source === "ai_extraction" ? " · extracted by AI" : ""}`);
  return ok({ id: bill.id, status: bill.status }, bill.status === "posted" ? `${bill.number} matched cleanly and posted (${money(bill.total)}).` : `${bill.number} has ${bill.exceptions.length} exception${bill.exceptions.length > 1 ? "s" : ""}. It will not post until approved.`);
}

export function resolveBill(ctx: Ctx, p: { billId: string; decision: "approve" | "reject"; comment?: string }): Result {
  const bill = ctx.db.bills.find((b) => b.id === p.billId);
  if (!bill || !["exception", "pending_match"].includes(bill.status)) return fail("BILL_STATE", "Bill can't be resolved", "Only bills in exception can be approved or rejected.", "Open the bill to see its status.");
  if (p.decision === "approve") {
    const blocked = assertPostable(ctx.db, ctx.date);
    if (blocked) return blocked as Result<never>;
    bill.status = "posted"; postBillJE(ctx, bill);
  } else bill.status = "rejected";
  const ap = ctx.db.approvals.find((a) => a.type === "bill_variance" && a.ref === bill.id && a.status === "pending");
  if (ap) Object.assign(ap, { status: p.decision === "approve" ? "approved" : "rejected", decidedBy: ctx.actor, decidedAt: ctx.now, comment: p.comment });
  audit(ctx, p.decision === "approve" ? "supplier_bill.variance_approved" : "supplier_bill.rejected", "Supplier bill", bill.supplierInvoiceNo, p.comment || undefined);
  return ok(undefined, p.decision === "approve" ? `${bill.number} approved and posted. Purchase price variance recorded.` : `${bill.number} rejected. Nothing was posted.`);
}

export function paySupplier(ctx: Ctx, p: { billIds: string[]; method: "bank_transfer" | "cheque"; bankAccount: string }): Result<{ id: string }> {
  const db = ctx.db;
  const bills = db.bills.filter((b) => p.billIds.includes(b.id));
  if (!bills.length) return fail("PAY_NONE", "Select bills to pay", "No bills were chosen.", "Tick at least one bill.");
  if (new Set(bills.map((b) => b.supplierId)).size > 1) return fail("PAY_MULTI", "Pay one supplier at a time", "A payment goes to a single supplier.", "Select bills from one supplier.");
  if (bills.some((b) => b.status !== "posted")) return fail("PAY_STATE", "Only posted bills can be paid", "Bills in exception or already paid can't be selected.", "Resolve the exception first.");
  const blocked = assertPostable(db, ctx.date);
  if (blocked) return blocked as Result<never>;
  const amount = r2(bills.reduce((s, b) => s + b.total - b.paid, 0));
  const acct = BANKS.includes(p.bankAccount) ? p.bankAccount : "1100";
  const bal = db.journal.reduce((s, j) => s + j.lines.filter((l) => l.account === acct).reduce((x, l) => x + l.debit - l.credit, 0), 0);
  if (bal < amount) return fail("PAY_FUNDS", "Not enough money in that bank account", `The account holds ${money(bal)} but the payment is ${money(amount)}.`, "Pick another account or pay fewer bills.");
  const sp: SupplierPayment = { id: newId("sp"), number: nextNo("SPY-", db.supplierPayments, 2000), supplierId: bills[0]!.supplierId, date: ctx.date, amount, method: p.method, billIds: bills.map((b) => b.id) };
  db.supplierPayments.unshift(sp);
  for (const b of bills) { b.paid = b.total; b.status = "paid"; }
  postJE(ctx, `Payment to ${db.suppliers.find((s) => s.id === sp.supplierId)!.name}`, `Supplier payment ${sp.number}`, [{ account: "2010", debit: amount, credit: 0 }, { account: acct, debit: 0, credit: amount }]);
  audit(ctx, "supplier_payment.posted", "Supplier payment", sp.number, `${money(amount)} · ${bills.length} bill(s)`);
  void pad;
  return ok({ id: sp.id }, `${sp.number}: ${money(amount)} paid`);
}
