// Integrity test for the command engine: after every kind of command the books must still reconcile.
// Run: pnpm test:engine
import assert from "node:assert/strict";
import { buildDB, type DB } from "../src/lib/data/sim";
import { execute, replay, type CommandInput, type CommandRecord, type CommandType } from "../src/lib/engine/commands";
import { apOpen } from "../src/lib/data/queries";
import { runOn } from "../src/lib/data/sim";
import type { Role } from "../src/lib/rbac";

const db: DB = buildDB();
const LOG: CommandRecord[] = [];
let n = 0;
function run<T extends CommandType>(type: T, payload: CommandInput<T>, role: Role = "owner", actor = "Tariq Mehmood") {
  const rec: CommandRecord = { id: `t${++n}`, type, payload, at: `${db.today}T10:00:00+05:00`, date: db.today, actor, role, source: "user" };
  const res = execute(db, rec);
  if (res.ok) LOG.push(rec);
  return res;
}
function expectOk<T>(r: ReturnType<typeof run>, label: string): Extract<typeof r, { ok: true }> { if (!r.ok) throw new Error(`${label} failed: ${r.error.title} – ${r.error.detail}`); return r as never; }
function expectFail(r: ReturnType<typeof run>, code: string, label: string) { assert.equal(r.ok, false, `${label} should fail`); if (!r.ok) assert.equal(r.error.code, code, `${label}: ${r.error.code}`); }

function integrity(label: string) {
  const bal = (code: string) => db.journal.reduce((s, j) => s + j.lines.filter((l) => l.account === code).reduce((x, l) => x + l.debit - l.credit, 0), 0);
  const tb = db.journal.reduce((s, j) => s + j.lines.reduce((x, l) => x + l.debit - l.credit, 0), 0);
  assert.ok(Math.abs(tb) < 0.5, `${label}: trial balance off by ${tb}`);
  const ar = db.invoices.reduce((s, i) => s + i.total - i.paid, 0);
  assert.ok(Math.abs(ar - bal("1200")) < 1, `${label}: AR sub ${ar} vs GL ${bal("1200")}`);
  const ap = runOn(db, () => apOpen().reduce((s, b) => s + b.total - b.paid, 0));
  assert.ok(Math.abs(ap + bal("2010")) < 1, `${label}: AP sub ${ap} vs GL ${-bal("2010")}`);
  const stock = [...db.stock.values()].reduce((s, c) => s + c.val, 0);
  assert.ok(Math.abs(stock - bal("1300")) < 1, `${label}: stock ${stock} vs GL ${bal("1300")}`);
  assert.ok([...db.stock.values()].every((c) => c.on >= 0 && c.res >= 0 && c.res <= c.on + 0.001), `${label}: negative or over-reserved stock`);
  console.log(`  ✓ ${label}`);
}

console.log("Baseline"); integrity("seed reconciles");

console.log("Masters");
const cust = expectOk(run("CreateCustomer", { name: "Test Mart Hyderabad", channel: "retail", city: "Hyderabad", province: "Sindh", area: "Qasimabad", registered: true, ntn: "1234567-8", atl: true, creditLimit: 800_000, termsDays: 15, contact: "Ali", phone: "0300-1234567", email: "a@b.pk", repId: db.employees.find((e) => e.position.startsWith("Order Booker"))!.id }), "customer");
expectFail(run("CreateCustomer", { name: "Test Mart Hyderabad", channel: "retail", city: "Hyderabad", province: "Sindh", area: "x", registered: false, atl: false, creditLimit: 1, termsDays: 7, contact: "", phone: "", email: "", repId: "" }), "CUS_DUPLICATE", "duplicate customer");
expectFail(run("CreateProduct", { name: "Loss Maker 1L", brand: "X", category: "beverages", supplierId: db.suppliers[0]!.id, cartonSize: 12, price: 10, cost: 20, mrp: 0, taxCategory: "standard", hsCode: "2202.1010", shelfLifeDays: 100 }), "PRD_NEGATIVE_MARGIN", "negative margin product");
integrity("masters");

console.log("Order → pick → dispatch → invoice");
const wh = db.customers.find((c) => c.id === (cust.value as { id: string }).id)!.warehouseId;
const prod = [...db.stock].filter(([k, c]) => k.endsWith(wh) && c.on - c.res > 500).map(([k]) => k.split("|")[0]!)[0]!;
const ord = expectOk(run("CreateOrder", { customerId: (cust.value as { id: string }).id, lines: [{ productId: prod, cartons: 2, discPct: 0 }], mode: "confirm" }), "order");
const oid = (ord.value as { id: string }).id;
expectFail(run("DispatchOrder", { orderId: oid, vehicle: "KHI-1234", driver: "Sajid" }), "SO_NOT_PICKED", "dispatch before pick");
expectOk(run("PickOrder", { orderId: oid }), "pick");
integrity("reserved order (no ledger effect)");
const disp = expectOk(run("DispatchOrder", { orderId: oid, vehicle: "KHI-1234", driver: "Sajid" }), "dispatch");
const invId = (disp.value as { invoiceId: string }).invoiceId;
integrity("dispatch posts invoice + COGS");

console.log("Payments and cheques");
const inv = db.invoices.find((i) => i.id === invId)!;
expectFail(run("RecordPayment", { customerId: inv.customerId, amount: inv.total * 2, method: "cash" }), "PAY_OVER", "overpay");
expectOk(run("RecordPayment", { customerId: inv.customerId, amount: Math.round(inv.total * 0.4), method: "cash" }), "cash part payment");
integrity("cash payment");
const chq = expectOk(run("RecordPayment", { customerId: inv.customerId, amount: Math.round(inv.total * 0.3), method: "cheque", chequeNo: "445566", bankName: "HBL" }), "cheque");
const cid = (chq.value as { id: string }).id;
expectOk(run("DepositCheque", { paymentId: cid }), "deposit");
const before = inv.paid;
expectOk(run("BounceCheque", { paymentId: cid, reason: "Insufficient funds" }), "bounce");
assert.ok(inv.paid < before, "bounce re-opens invoice");
integrity("bounced cheque");

console.log("Returns");
const line = inv.lines.find((l) => !l.free)!;
expectFail(run("CreateReturn", { invoiceId: invId, lines: [{ productId: line.productId, qty: line.qty + 5, condition: "resellable" }], reason: "damaged" }), "RET_TOO_MANY", "over-return");
const stockBefore = db.stock.get(`${line.productId}|${wh}`)!.on;
expectOk(run("CreateReturn", { invoiceId: invId, lines: [{ productId: line.productId, qty: 6, condition: "resellable" }], reason: "short_delivery" }), "resellable return");
assert.equal(db.stock.get(`${line.productId}|${wh}`)!.on, stockBefore + 6, "resellable goes back to stock");
expectOk(run("CreateReturn", { invoiceId: invId, lines: [{ productId: line.productId, qty: 6, condition: "damaged" }], reason: "damaged" }), "damaged return");
assert.ok(db.claims.length > 0, "damaged return drafts a principal claim");
integrity("returns");

console.log("Purchasing");
const sup = db.suppliers.find((s) => s.id === db.products.find((p) => p.id === prod)!.supplierId)!;
const pr = db.products.find((p) => p.id === prod)!;
const po = expectOk(run("CreatePO", { supplierId: sup.id, warehouseId: wh, lines: [{ productId: prod, cartons: 10, price: pr.cost }] }), "po");
const poId = (po.value as { id: string }).id;
assert.equal(db.pos.find((p) => p.id === poId)!.status, "approved", "owner approves within limit");
expectFail(run("ReceiveGoods", { poId, lines: [{ productId: prod, qty: pr.cartonSize * 11, rejected: 0 }] }), "GRN_OVER", "over-receive");
expectOk(run("ReceiveGoods", { poId, lines: [{ productId: prod, qty: pr.cartonSize * 6, rejected: 0 }] }), "partial receipt");
integrity("goods receipt");
const cs = pr.cartonSize;
const b1 = expectOk(run("CreateBill", { supplierId: sup.id, poId, supplierInvoiceNo: "TB-1001", date: db.today, lines: [{ productId: prod, description: pr.name, qty: cs * 9, price: pr.cost * 1.08 }] }), "bill with exceptions");
assert.equal((b1.value as { status: string }).status, "exception");
integrity("exception bill posts nothing");
expectFail(run("CreateBill", { supplierId: sup.id, poId, supplierInvoiceNo: "tb-1001", date: db.today, lines: [{ productId: prod, description: pr.name, qty: cs, price: pr.cost }] }), "BILL_DUPLICATE", "duplicate invoice number");
const b2 = expectOk(run("CreateBill", { supplierId: sup.id, poId, supplierInvoiceNo: "TB-1002", date: db.today, lines: [{ productId: prod, description: pr.name, qty: cs * 6, price: pr.cost }] }), "clean bill");
assert.equal((b2.value as { status: string }).status, "posted");
integrity("clean bill posts GRNI / tax / AP");
expectOk(run("ResolveBill", { billId: (b1.value as { id: string }).id, decision: "approve", comment: "Supplier confirmed new price" }), "approve variance");
integrity("variance bill approved");
expectOk(run("PaySupplier", { billIds: [(b2.value as { id: string }).id], method: "bank_transfer", bankAccount: "1100" }), "pay supplier");
integrity("supplier payment");

console.log("Inventory");
const other = db.warehouses.find((w) => w.id !== wh)!.id;
expectFail(run("TransferStock", { productId: prod, fromId: wh, toId: wh, qty: 5 }), "TR_SAME", "same warehouse");
expectOk(run("TransferStock", { productId: prod, fromId: wh, toId: other, qty: 12 }), "transfer");
integrity("transfer moves value between warehouses");
expectOk(run("AdjustStock", { productId: prod, warehouseId: wh, qtyDelta: -3, reason: "Damaged in handling" }), "adjust");
integrity("stock adjustment");
const cnt = expectOk(run("PostCount", { warehouseId: wh, counter: "Test Counter", lines: [{ productId: prod, counted: db.stock.get(`${prod}|${wh}`)!.on - 2, location: "A-1-01" }] }), "count");
void cnt; integrity("count variance");

console.log("Finance guards");
expectFail(run("PostManualJE", { date: "2026-03-10", memo: "Backdated", lines: [{ account: "6990", debit: 100, credit: 0 }, { account: "1100", debit: 0, credit: 100 }] }), "FIN_PERIOD_CLOSED", "closed period");
expectFail(run("PostManualJE", { date: db.today, memo: "Control", lines: [{ account: "1200", debit: 100, credit: 0 }, { account: "1100", debit: 0, credit: 100 }] }), "JE_CONTROL", "control account");
expectFail(run("PostManualJE", { date: db.today, memo: "Unbalanced", lines: [{ account: "6990", debit: 100, credit: 0 }, { account: "1100", debit: 0, credit: 90 }] }), "JE_UNBALANCED", "unbalanced");
const big = expectOk(run("PostManualJE", { date: db.today, memo: "Large accrual", lines: [{ account: "6990", debit: 750_000, credit: 0 }, { account: "1100", debit: 0, credit: 750_000 }] }, "finance", "Ayesha Siddiqui"), "large JE");
assert.equal((big.value as { pending: boolean }).pending, true, "large JE waits for second approver");
integrity("manual journals");

console.log("Approvals");
const seedPO = db.approvals.find((a) => a.type === "purchase_order" && a.status === "pending")!;
expectFail(run("DecideApproval", { id: seedPO.id, decision: "approved" }, "procurement", seedPO.requestedBy), "APR_SOD", "self-approval");
expectFail(run("DecideApproval", { id: seedPO.id, decision: "approved" }, "rep", "Usman Ghani"), "PERM", "wrong role");
const inc0 = [...db.stock.values()].reduce((s, c) => s + c.incoming, 0);
expectOk(run("DecideApproval", { id: seedPO.id, decision: "approved", comment: "OK" }), "owner approves PO");
assert.ok([...db.stock.values()].reduce((s, c) => s + c.incoming, 0) > inc0, "approval creates incoming stock");
const bigJ = db.approvals.find((a) => a.type === "journal" && a.payload?.lines)!;
expectOk(run("DecideApproval", { id: bigJ.id, decision: "approved" }, "owner", "Tariq Mehmood"), "second approver posts JE");
integrity("approvals");

console.log("Employees, leave, payroll");
const base = { name: "Test Person", department: "Sales", position: "Order Booker", managerId: null, branch: "Karachi", joinDate: db.today, salary: 60_000, phone: "", email: "t@x.com", cnic: "42101-1234567-1", status: "active" as const };
expectFail(run("CreateEmployee", base, "rep"), "HR_FORBIDDEN", "rep can't add staff");
expectFail(run("CreateEmployee", { ...base, cnic: "123" }, "finance"), "EMP_CNIC", "bad CNIC");
const emp = expectOk(run("CreateEmployee", base, "finance"), "create employee").value as { id: string };
expectFail(run("CreateEmployee", base, "finance"), "EMP_CNIC_DUP", "duplicate CNIC");
expectOk(run("UpdateEmployee", { id: emp.id, salary: 70_000 }, "finance"), "raise salary");
assert.equal(db.employees.find((e) => e.id === emp.id)!.salary, 70_000);
expectFail(run("UpdateEmployee", { id: emp.id, managerId: emp.id }, "finance"), "EMP_MANAGER", "self-manager");
const lv = expectOk(run("SubmitLeave", { employeeId: emp.id, type: "Annual", from: db.today, to: db.today, reason: "x" }, "owner"), "leave").value as { id: string };
const lva = db.approvals.find((a) => a.type === "leave" && a.ref === lv.id)!;
expectOk(run("DecideApproval", { id: lva.id, decision: "approved" }), "approve leave");
assert.equal(db.leaves.find((l) => l.id === lv.id)!.status, "approved");
expectFail(run("RunPayroll", { month: db.payroll[0]!.month }, "finance"), "PAY_DUP", "no double payroll");
expectFail(run("RunPayroll", { month: db.today.slice(0, 7) }, "finance"), "PAY_FUTURE", "current month not ended");
{ // a separate world: re-run the latest month as if unpaid; the ledger must stay balanced and the run must be recorded
  const w = buildDB(); const seeded = w.payroll.shift()!; const before = w.journal.length;
  const r = execute(w, { id: "pay1", type: "RunPayroll", payload: { month: seeded.month }, at: `${w.today}T10:00:00+05:00`, date: w.today, actor: "Ayesha Siddiqui", role: "finance", source: "user" });
  assert.ok(r.ok, "payroll run ok");
  assert.equal(w.payroll[0]!.month, seeded.month); assert.equal(w.journal.length, before + 2);
  assert.equal(w.journal.reduce((x, j) => x + j.lines.reduce((y, l) => y + l.debit - l.credit, 0), 0) < 0.5, true);
}
integrity("employees");

console.log("Replay determinism");
const fresh = buildDB();
const r = replay(fresh, LOG);
assert.equal(r.skipped, 0, `replay skipped ${r.skipped}`);
assert.equal(fresh.journal.length, db.journal.length, "same journal length after replay");
assert.equal(fresh.invoices.length, db.invoices.length);
console.log(`  ✓ replayed ${r.applied} commands identically`);
console.log("\nAll engine checks passed.");
