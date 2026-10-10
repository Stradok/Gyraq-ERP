// Getting a real company started: profile, warehouses and opening balances. Opening entries post as "opening" journals
// against Owner's Capital, so the books balance from day one.
import type { Warehouse } from "../data/types";
import { can } from "../rbac";
import { assertPostable, audit, cell, fail, money, newId, ok, postJE, r2, type Ctx, type Result } from "./core";

const denied = (ctx: Ctx) => (can(ctx.role, "setup.manage") ? null : fail("SETUP_FORBIDDEN", "Only the Owner or Admin can do company setup", "Setup changes the books.", "Ask the Owner."));

export interface SetupCompany { name: string; legalName: string; ntn: string; strn: string; address: string; city: string; province: string; minCash?: number }
export function setupCompany(ctx: Ctx, p: SetupCompany): Result {
  const d = denied(ctx); if (d) return d;
  if (p.name.trim().length < 2) return fail("CO_NAME", "Enter the company name", "It appears on invoices and screens.", "Type the trading name.");
  if (p.ntn && !/^\d{7}-\d$/.test(p.ntn)) return fail("CO_NTN", "NTN format looks wrong", "Use 7 digits, a dash and 1 digit, like 1234567-8.", "Check the registration certificate.");
  const c = ctx.db.company;
  Object.assign(c, { name: p.name.trim(), legalName: p.legalName.trim() || p.name.trim(), ntn: p.ntn.trim(), strn: p.strn.trim(), address: p.address.trim(), city: p.city.trim(), province: p.province.trim(), setupDone: true });
  if (p.minCash !== undefined && p.minCash >= 0) ctx.db.settings.minCash = p.minCash;
  audit(ctx, "company.updated", "Company", c.name, `NTN ${c.ntn || "not set"}`);
  return ok(undefined, "Company profile saved");
}

export function createWarehouse(ctx: Ctx, p: { code: string; name: string; city: string; branch?: string }): Result<{ id: string }> {
  const d = denied(ctx) as Result<never> | null; if (d) return d;
  const code = p.code.trim().toUpperCase();
  if (!/^[A-Z0-9-]{2,12}$/.test(code)) return fail("WH_CODE", "Warehouse code looks wrong", "Use 2 to 12 letters, digits or dashes, like KHI-DC1.", "Pick a short code.");
  if (p.name.trim().length < 3) return fail("WH_NAME", "Enter the warehouse name", "Names need at least 3 characters.", "For example: Karachi DC.");
  if (ctx.db.warehouses.some((w) => w.code === code)) return fail("WH_DUP", "That code is already used", `${code} is another warehouse.`, "Pick a different code.");
  const w: Warehouse = { id: `wh_${code}`, code, name: p.name.trim(), city: p.city.trim(), branch: (p.branch ?? p.city).trim(), share: 0, managerId: "" };
  ctx.db.warehouses.push(w);
  const n = ctx.db.warehouses.length; ctx.db.warehouses.forEach((x) => { x.share = r2(1 / n); });
  audit(ctx, "warehouse.created", "Warehouse", code, w.name);
  return ok({ id: w.id }, `Warehouse ${code} created`);
}

export function postOpeningStock(ctx: Ctx, p: { lines: { productId: string; warehouseId: string; qty: number; unitCost: number }[] }): Result<{ value: number }> {
  const d = denied(ctx) as Result<never> | null; if (d) return d;
  const db = ctx.db;
  const lines = p.lines.filter((l) => l.qty);
  if (!lines.length) return fail("OPN_EMPTY", "Enter at least one quantity", "Nothing to post.", "Type opening quantities and costs.");
  for (const l of lines) {
    if (!db.products.some((x) => x.id === l.productId)) return fail("PRD_NOT_FOUND", "Unknown product", "A line refers to a product that doesn't exist.", "Refresh and try again.");
    if (!db.warehouses.some((x) => x.id === l.warehouseId)) return fail("WH_NOT_FOUND", "Unknown warehouse", "A line refers to a warehouse that doesn't exist.", "Create the warehouse first.");
    if (!Number.isInteger(l.qty) || l.qty < 0) return fail("OPN_QTY", "Quantities must be whole numbers", "Opening stock can't be negative.", "Fix the quantity.");
    if (!(l.unitCost > 0)) return fail("OPN_COST", "Enter a cost for each item", "Opening stock needs a unit cost so the books can value it.", "Type the cost per piece.");
  }
  const blocked = assertPostable(db, ctx.date); if (blocked) return blocked as Result<never>;
  let total = 0;
  for (const l of lines) { const c = cell(db, l.productId, l.warehouseId); const v = r2(l.qty * l.unitCost); c.on += l.qty; c.val = r2(c.val + v); c.ema = c.ema || 0; total = r2(total + v); }
  postJE(ctx, "Opening stock", "Opening balances", [{ account: "1300", debit: total, credit: 0 }, { account: "3010", debit: 0, credit: total }], "opening");
  audit(ctx, "opening_stock.posted", "Opening balances", "stock", `${lines.length} lines · ${money(total)}`);
  return ok({ value: total }, `Opening stock posted: ${money(total)}`);
}

export function postOpeningCash(ctx: Ctx, p: { lines: { account: string; amount: number }[] }): Result<{ value: number }> {
  const d = denied(ctx) as Result<never> | null; if (d) return d;
  const lines = p.lines.filter((l) => l.amount);
  if (!lines.length) return fail("OPN_EMPTY", "Enter at least one balance", "Nothing to post.", "Type the cash or bank balance.");
  for (const l of lines) {
    if (!ctx.db.bankBalanceAccounts.includes(l.account)) return fail("OPN_ACCOUNT", "Pick a cash or bank account", "Opening balances here are for cash and bank accounts only.", "Choose from the list.");
    if (!(l.amount > 0)) return fail("OPN_AMOUNT", "Balances must be above zero", "Enter the balance as at your start date.", "Fix the amount.");
  }
  const blocked = assertPostable(ctx.db, ctx.date); if (blocked) return blocked as Result<never>;
  const total = r2(lines.reduce((s, l) => s + l.amount, 0));
  postJE(ctx, "Opening cash and bank balances", "Opening balances", [...lines.map((l) => ({ account: l.account, debit: l.amount, credit: 0 })), { account: "3010", debit: 0, credit: total }], "opening");
  audit(ctx, "opening_cash.posted", "Opening balances", "cash", money(total));
  return ok({ value: total }, `Opening balances posted: ${money(total)}`);
}
