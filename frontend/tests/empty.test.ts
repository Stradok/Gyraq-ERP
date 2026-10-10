// A company that starts empty must be able to run the whole order-to-cash and purchase cycle with balanced books.
// Run: pnpm test:empty
import assert from "node:assert/strict";
import { buildEmptyDB, runOn, type DB } from "../src/lib/data/sim";
import { execute, type CommandInput, type CommandRecord, type CommandType } from "../src/lib/engine/commands";
import type { Role } from "../src/lib/rbac";

const db: DB = buildEmptyDB("2026-10-10");
let n = 0;
function run<T extends CommandType>(type: T, payload: CommandInput<T>, role: Role = "owner") {
  const rec: CommandRecord = { id: `e${++n}`, type, payload, at: "2026-10-10T10:00:00+05:00", date: db.today, actor: "Owner", role, source: "user" };
  return execute(db, rec);
}
const ok = <T,>(r: ReturnType<typeof run>, label: string) => { if (!r.ok) throw new Error(`${label}: ${r.error.title} – ${r.error.detail}`); return r.value as T; };
const bad = (r: ReturnType<typeof run>, code: string, label: string) => { assert.equal(r.ok, false, label); if (!r.ok) assert.equal(r.error.code, code, label); };
const tb = () => db.journal.reduce((s, j) => s + j.lines.reduce((x, l) => x + l.debit - l.credit, 0), 0);
const bal = (code: string) => db.journal.reduce((s, j) => s + j.lines.filter((l) => l.account === code).reduce((x, l) => x + l.debit - l.credit, 0), 0);

console.log("Empty company");
assert.equal(db.company.setupDone, false); assert.equal(db.customers.length + db.products.length + db.journal.length, 0);
bad(run("SetupCompany", { name: "X", legalName: "", ntn: "", strn: "", address: "", city: "", province: "" }, "rep"), "SETUP_FORBIDDEN", "rep can't set up");
bad(run("SetupCompany", { name: "Acme Traders", legalName: "", ntn: "123", strn: "", address: "", city: "", province: "" }), "CO_NTN", "bad NTN");
ok(run("SetupCompany", { name: "Acme Traders", legalName: "Acme Traders (Pvt.) Ltd.", ntn: "1234567-8", strn: "", address: "Plot 1, SITE", city: "Karachi", province: "Sindh", minCash: 1_000_000 }), "setup");
assert.equal(db.company.setupDone, true); assert.equal(db.settings.minCash, 1_000_000);
const wh = ok<{ id: string }>(run("CreateWarehouse", { code: "khi-dc", name: "Karachi DC", city: "Karachi" }), "warehouse");
bad(run("CreateWarehouse", { code: "KHI-DC", name: "Again", city: "Karachi" }), "WH_DUP", "duplicate warehouse");
const sup = ok<{ id: string }>(run("CreateSupplier", { name: "Unilever Pakistan", city: "Karachi", province: "Sindh", ntn: "1234567-1", isPrincipal: true, leadTimeDays: 5, termsDays: 30, contact: "A", phone: "", email: "", kind: "goods" }), "supplier");
const prod = ok<{ id: string }>(run("CreateProduct", { name: "Test Soap 100g", brand: "Test", category: "personal_care", supplierId: sup.id, cartonSize: 24, price: 100, cost: 80, mrp: 120, taxCategory: "standard", hsCode: "3401.1100", shelfLifeDays: 365 }), "product");
const cust = ok<{ id: string }>(run("CreateCustomer", { name: "Corner Mart", channel: "retail", city: "Karachi", province: "Sindh", area: "Saddar", registered: false, atl: false, creditLimit: 500_000, termsDays: 15, contact: "Ali", phone: "", email: "", repId: "" }), "customer");

bad(run("PostOpeningStock", { lines: [{ productId: prod.id, warehouseId: wh.id, qty: 480, unitCost: 0 }] }), "OPN_COST", "cost required");
ok(run("PostOpeningStock", { lines: [{ productId: prod.id, warehouseId: wh.id, qty: 480, unitCost: 80 }] }), "opening stock");
ok(run("PostOpeningCash", { lines: [{ account: "1100", amount: 750_000 }] }), "opening cash");
assert.ok(Math.abs(tb()) < 0.01, "opening entries balance"); assert.equal(bal("1300"), 38_400); assert.equal(bal("1100"), 750_000);
assert.equal(db.stock.get(`${prod.id}|${wh.id}`)!.on, 480);

const order = ok<{ id: string }>(run("CreateOrder", { customerId: cust.id, lines: [{ productId: prod.id, cartons: 2, discPct: 0 }], mode: "confirm" }), "order");
ok(run("PickOrder", { orderId: order.id }), "pick");
const d = ok<{ invoiceId: string }>(run("DispatchOrder", { orderId: order.id, vehicle: "KHI-1234", driver: "Sajid" }), "dispatch");
const inv = db.invoices.find((i) => i.id === d.invoiceId)!;
assert.ok(inv.total > 0 && inv.status !== undefined);
ok(run("RecordPayment", { customerId: cust.id, amount: inv.total, method: "bank_transfer" } as never), "payment");
assert.ok(Math.abs(tb()) < 0.01, "trial balance after trading");
assert.ok(Math.abs(db.invoices.reduce((s, i) => s + i.total - i.paid, 0) - bal("1200")) < 1, "AR subledger = GL");
const stockVal = [...db.stock.values()].reduce((s, c) => s + c.val, 0); assert.ok(Math.abs(stockVal - bal("1300")) < 1, "stock value = GL inventory");
runOn(db, () => undefined);
console.log("  ✓ setup → opening balances → order → dispatch → invoice → payment, books balanced");
console.log("\nEmpty-company checks passed.");
