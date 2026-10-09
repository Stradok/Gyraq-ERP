import type { StockCount } from "../data/types";
import { can } from "../rbac";
import { assertPostable, audit, cell, fail, money, newId, nextNo, ok, postJE, r2, unitCost, type Ctx, type Result } from "./core";

export const ADJUST_APPROVAL_LIMIT = 50_000;

export function transferStock(ctx: Ctx, p: { productId: string; fromId: string; toId: string; qty: number }): Result<{ id: string }> {
  const db = ctx.db;
  const pr = db.products.find((x) => x.id === p.productId);
  if (!pr) return fail("PRD_NOT_FOUND", "Pick a product", "A transfer needs a product.", "Select one.");
  if (p.fromId === p.toId) return fail("TR_SAME", "Choose two different warehouses", "Source and destination are the same.", "Pick another destination.");
  if (!(p.qty > 0) || !Number.isInteger(p.qty)) return fail("TR_QTY", "Enter a whole quantity", "Quantities must be whole units above zero.", "Type how many units to move.");
  const src = cell(db, p.productId, p.fromId);
  const free = src.on - src.res;
  if (p.qty > free) return fail("STK_SHORT", "Not enough free stock to transfer", `${db.warehouses.find((w) => w.id === p.fromId)!.code} has ${free} free (${src.res} reserved for orders).`, "Transfer less, or wait until reserved orders ship.");
  const v = r2((src.val * p.qty) / src.on);
  src.on -= p.qty; src.val = r2(src.val - v);
  const dst = cell(db, p.productId, p.toId);
  dst.on += p.qty; dst.val = r2(dst.val + v);
  const t = { id: newId("tr"), number: nextNo("TR-", db.transfers, 100), fromId: p.fromId, toId: p.toId, productId: p.productId, qty: p.qty, value: v, date: ctx.date, by: ctx.actor };
  db.transfers.unshift(t);
  audit(ctx, "stock_transfer.completed", "Stock transfer", t.number, `${p.qty} × ${pr.name} · ${db.warehouses.find((w) => w.id === p.fromId)!.code} → ${db.warehouses.find((w) => w.id === p.toId)!.code} · ${money(v)}`);
  return ok({ id: t.id }, `${t.number}: ${p.qty} × ${pr.name} moved at cost ${money(v)}`);
}

export function applyAdjustment(ctx: Ctx, a: { productId: string; warehouseId: string; qtyDelta: number; reason: string }): Result {
  const db = ctx.db;
  const c = cell(db, a.productId, a.warehouseId);
  const pr = db.products.find((x) => x.id === a.productId)!;
  if (a.qtyDelta < 0 && c.on + a.qtyDelta < c.res) return fail("STK_RESERVED", "That would drop below reserved stock", `${c.res} units are reserved for open orders.`, "Cancel or ship those orders first.");
  const blocked = assertPostable(db, ctx.date);
  if (blocked) return blocked as Result<never>;
  const cost = unitCost(c, pr.cost);
  const v = r2(Math.abs(a.qtyDelta) * cost);
  if (a.qtyDelta < 0) { const take = Math.min(v, c.val); c.on += a.qtyDelta; c.val = r2(c.val - take); postJE(ctx, `Stock adjustment: ${a.reason}`, `Adjustment ${pr.sku}`, [{ account: "5020", debit: take, credit: 0 }, { account: "1300", debit: 0, credit: take }]); }
  else { c.on += a.qtyDelta; c.val = r2(c.val + v); postJE(ctx, `Stock adjustment: ${a.reason}`, `Adjustment ${pr.sku}`, [{ account: "1300", debit: v, credit: 0 }, { account: "5020", debit: 0, credit: v }]); }
  audit(ctx, "stock_adjustment.posted", "Stock adjustment", pr.sku, `${a.qtyDelta > 0 ? "+" : ""}${a.qtyDelta} · ${a.reason} · ${money(v)}`);
  return ok(undefined, `${pr.name}: ${a.qtyDelta > 0 ? "+" : ""}${a.qtyDelta} units adjusted (${money(v)})`);
}

export function adjustStock(ctx: Ctx, p: { productId: string; warehouseId: string; qtyDelta: number; reason: string }): Result<{ pending: boolean }> {
  const db = ctx.db;
  const pr = db.products.find((x) => x.id === p.productId);
  if (!pr) return fail("PRD_NOT_FOUND", "Pick a product", "An adjustment needs a product.", "Select one.");
  if (!Number.isInteger(p.qtyDelta) || p.qtyDelta === 0) return fail("ADJ_QTY", "Enter a non-zero whole number", "Use a negative number for a loss.", "Type the change in units.");
  if (p.reason.trim().length < 4) return fail("ADJ_REASON", "Give a reason", "Adjustments are audited and need an explanation.", "For example: damaged in handling.");
  const value = Math.abs(p.qtyDelta) * unitCost(cell(db, p.productId, p.warehouseId), pr.cost);
  if (value > ADJUST_APPROVAL_LIMIT && !can(ctx.role, "approve.finance")) {
    db.approvals.unshift({ id: newId("apr"), type: "stock_adjustment", title: `Stock adjustment – ${pr.name}`, subtitle: `${db.warehouses.find((w) => w.id === p.warehouseId)!.code} · ${p.qtyDelta > 0 ? "+" : ""}${p.qtyDelta} units · ${p.reason}`, amount: r2(value), requestedBy: ctx.actor, requestedAt: ctx.date, status: "pending", ref: p.productId, source: "user", step: "Finance Manager", payload: { productId: p.productId, warehouseId: p.warehouseId, qtyDelta: p.qtyDelta, reason: p.reason } });
    audit(ctx, "stock_adjustment.requested", "Stock adjustment", pr.sku, `${money(value)} needs Finance approval`);
    return ok({ pending: true }, `Adjustment of ${money(value)} sent to Finance for approval (limit ${money(ADJUST_APPROVAL_LIMIT)}).`);
  }
  const r = applyAdjustment(ctx, p);
  return r.ok ? ok({ pending: false }, r.message) : r;
}

export function postCount(ctx: Ctx, p: { warehouseId: string; counter: string; lines: { productId: string; counted: number; location: string }[] }): Result<{ id: string; variance: number }> {
  const db = ctx.db;
  const lines = p.lines.filter((l) => Number.isInteger(l.counted) && l.counted >= 0);
  if (!lines.length) return fail("CNT_EMPTY", "Enter at least one counted quantity", "Nothing was counted.", "Count the items and type the quantities.");
  const rows = lines.map((l) => { const c = cell(db, l.productId, p.warehouseId); const pr = db.products.find((x) => x.id === l.productId)!; return { ...l, expected: c.on, delta: l.counted - c.on, value: (l.counted - c.on) * unitCost(c, pr.cost) }; });
  const variance = r2(rows.reduce((s, r) => s + r.value, 0));
  const sc: StockCount = { id: newId("sc"), number: nextNo("SC-", db.stockCounts, 300), warehouseId: p.warehouseId, date: ctx.date, counter: p.counter, status: "review", lines: rows.map((r) => ({ productId: r.productId, location: r.location, expected: r.expected, counted: r.counted })) };
  db.stockCounts.unshift(sc);
  const big = Math.abs(variance) > ADJUST_APPROVAL_LIMIT;
  if (big && !can(ctx.role, "approve.finance")) {
    db.approvals.unshift({ id: newId("apr"), type: "stock_adjustment", title: `Stock count variance – ${db.warehouses.find((w) => w.id === p.warehouseId)!.code}`, subtitle: `${sc.number} · ${variance < 0 ? "−" : "+"}${money(Math.abs(variance))}`, amount: Math.abs(variance), requestedBy: p.counter, requestedAt: ctx.date, status: "pending", ref: sc.id, source: "user", step: "Finance Manager", payload: { countId: sc.id } });
    audit(ctx, "stock_count.submitted", "Stock count", sc.number, `Variance ${money(variance)} awaiting approval`);
    return ok({ id: sc.id, variance }, `${sc.number} submitted. Variance ${money(variance)} needs Finance approval.`);
  }
  const r = applyCount(ctx, sc.id);
  return r.ok ? ok({ id: sc.id, variance }, `${sc.number} posted. Net variance ${money(variance)}.`) : (r as Result<never>);
}
export function applyCount(ctx: Ctx, countId: string): Result {
  const sc = ctx.db.stockCounts.find((x) => x.id === countId);
  if (!sc || sc.status !== "review") return fail("CNT_STATE", "Count can't be posted", "Only counts under review can be posted.", "Open the count to see its status.");
  for (const l of sc.lines) { const d = l.counted - cell(ctx.db, l.productId, sc.warehouseId).on; if (d !== 0) { const r = applyAdjustment(ctx, { productId: l.productId, warehouseId: sc.warehouseId, qtyDelta: d, reason: `Count ${sc.number}` }); if (!r.ok) return r; } }
  sc.status = "posted";
  audit(ctx, "stock_count.posted", "Stock count", sc.number, "Variances posted to the ledger");
  return ok(undefined);
}
