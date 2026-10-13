// End-to-end test of the real backend: Postgres, auth, role guard, commands, durability, ledger constraints.
// Uses its own database (meridian_test). Run: pnpm test   (needs Postgres from `docker compose up -d db`)
import assert from "node:assert/strict";
import pg from "pg";

const base = process.env.DATABASE_URL ?? "postgres://meridian:meridian@localhost:5433/meridian";
const admin = new pg.Client({ connectionString: base }); await admin.connect();
if (!(await admin.query("select 1 from pg_database where datname='meridian_test'")).rowCount) await admin.query("create database meridian_test");
await admin.end();
process.env.DATABASE_URL = base.replace(/\/[^/]*$/, "/meridian_test"); process.env.PORT = "4101"; process.env.DEMO_PASSWORD = "test-pass-123";

const { pool } = await import("../src/db");
await pool.query("drop schema public cascade; create schema public;");
const { start } = await import("../src/server");
const W = await import("../src/world");
const srv = await start();
const A = "http://localhost:4101";
const call = async (path: string, init: RequestInit & { token?: string } = {}) => {
  const send = () => fetch(A + path, { ...init, headers: { "content-type": "application/json", ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) } });
  const r = await send().catch(() => send()); // a connection the server closed on purpose (413) may be reused once
  return { status: r.status, body: (await r.json()) as any };
};
const login = async (email: string) => (await call("/auth/login", { method: "POST", body: JSON.stringify({ email, password: "test-pass-123" }) })).body.token as string;
const cmd = (token: string, type: string, payload: unknown) => call("/api/commands", { method: "POST", token, body: JSON.stringify({ type, payload }) });

console.log("Auth");
assert.equal((await call("/auth/login", { method: "POST", body: JSON.stringify({ email: "owner@meridian.demo", password: "nope" }) })).status, 401);
assert.equal((await call("/api/bootstrap")).status, 401, "no token → 401");
const owner = await login("owner@meridian.demo"), rep = await login("rep.karachi@meridian.demo"), fin = await login("finance@meridian.demo");
console.log("  ✓ login, bad password, missing token");

console.log("Commands");
const boot0 = (await call("/api/bootstrap", { token: owner })).body;
assert.equal(boot0.commands.length, 0);
const newCust = { name: "API Test Mart", channel: "retail", city: "Karachi", province: "Sindh", area: "Saddar", registered: false, atl: false, creditLimit: 200000, termsDays: 15, contact: "Ali", phone: "0300-1111111", email: "", repId: "" };
const cust = await cmd(owner, "CreateCustomer", newCust);
assert.equal(cust.status, 200, JSON.stringify(cust.body)); assert.ok(cust.body.ok);
const custId = cust.body.value.id as string;
assert.equal((await cmd(owner, "CreateCustomer", newCust)).body.error.code, "CUS_DUPLICATE", "engine validation reaches the client");
assert.equal((await cmd(rep, "CreatePO", {})).status, 403, "rep can't create a PO");
assert.equal((await cmd(fin, "CreateEmployee", {})).status, 422, "finance may try; the engine validates");
assert.equal((await cmd(rep, "CreateEmployee", {})).status, 403, "rep can't manage employees");
assert.equal((await call("/api/commands", { method: "POST", token: owner, body: JSON.stringify({ type: "Nope" }) })).status, 400);
const prod = (await pool.query("select id from records where kind='products' order by id limit 1")).rows[0].id as string;
const t0 = Date.now();
const ord = await cmd(owner, "CreateOrder", { customerId: custId, lines: [{ productId: prod, cartons: 2, discPct: 0 }], mode: "confirm" });
assert.ok(ord.body.ok, JSON.stringify(ord.body));
console.log(`  command latency (execute + project + commit): ${Date.now() - t0} ms`);
console.log("  ✓ create customer, duplicate, role guard, order");

const stale = await call("/api/commands", { method: "POST", token: owner, body: JSON.stringify({ type: "CreateLead", payload: {}, id: "c-stale-1", baseSeq: 0 }) });
assert.equal(stale.status, 409, "client behind the log must resync"); assert.equal(stale.body.error.code, "STALE");
const lead = { company: "Stamp Traders", contact: "X", city: "Karachi", source: "web", repId: "", value: 1000, probability: 10 };
const head = Math.max(...(await call("/api/commands?since=0", { token: owner })).body.commands.map((x: { seq: number }) => x.seq));
const first = await call("/api/commands", { method: "POST", token: owner, body: JSON.stringify({ type: "CreateLead", payload: lead, id: "c-lead-12345", baseSeq: head, at: new Date().toISOString() }) });
assert.equal(first.status, 200, JSON.stringify(first.body)); assert.equal(first.body.rec.id, "c-lead-12345", "client id kept so both copies derive identical ids");
assert.equal((await call("/api/commands", { method: "POST", token: owner, body: JSON.stringify({ type: "CreateLead", payload: lead, id: "c-lead-12345", baseSeq: head + 5 }) })).status, 409, "same command id is not applied twice");
console.log("  ✓ stale clients rejected, client ids kept, no double-apply");

const emp = (await pool.query("select data->>'name' as n from records where kind='employees' order by id limit 1")).rows[0].n as string;
assert.equal((await call("/api/users", { token: rep })).status, 403, "rep can't list users");
const mk = (b: object) => call("/api/users", { method: "POST", token: owner, body: JSON.stringify(b) });
assert.equal((await mk({ email: "new@x.com", name: "New Person", role: "rep", password: "short", emp })).status, 400, "weak password");
const made = await mk({ email: "new@x.com", name: "New Person", title: "Order Booker", role: "rep", password: "long-enough-1", emp });
assert.equal(made.status, 200, JSON.stringify(made.body)); assert.equal((await mk({ email: "NEW@x.com", name: "New Person", role: "rep", password: "long-enough-1", emp })).status, 409, "duplicate email");
const newTok = (await call("/auth/login", { method: "POST", body: JSON.stringify({ email: "new@x.com", password: "long-enough-1" }) })).body.token as string; assert.ok(newTok, "new user can sign in");
assert.equal((await call("/api/me", { token: newTok })).body.role, "rep");
assert.equal((await call("/api/me", { token: newTok })).body.title, "Order Booker", "/api/me gives the title the AI routes need");
await call(`/api/users/${made.body.id}`, { method: "PATCH", token: owner, body: JSON.stringify({ role: "warehouse" }) });
assert.equal((await cmd(newTok, "CreateOrder", {})).status, 403, "role change applies on the existing token immediately");
await call(`/api/users/${made.body.id}`, { method: "PATCH", token: owner, body: JSON.stringify({ active: false }) });
assert.equal((await call("/api/me", { token: newTok })).status, 401, "disabled user is locked out at once");
const ownerId = (await call("/api/me", { token: owner })).body.sub;
assert.equal((await call(`/api/users/${ownerId}`, { method: "PATCH", token: owner, body: JSON.stringify({ active: false }) })).status, 400, "can't disable yourself");
console.log("  ✓ user management: create, validation, role change, disable, self-protection");

{
// lockout and security events
await mk({ email: "lock@x.com", name: "Lock Test", role: "rep", password: "right-password-1", emp });
const bad = (pw: string) => call("/auth/login", { method: "POST", body: JSON.stringify({ email: "lock@x.com", password: pw }) });
for (let i = 0; i < 5; i++) assert.equal((await bad("wrong")).status, 401);
assert.equal((await bad("right-password-1")).status, 429, "correct password is refused while the account is locked");
const ev = (await pool.query("select event, ok, count(*)::int n from auth_events group by 1,2")).rows;
const n = (e: string, ok: boolean) => ev.find((r) => r.event === e && r.ok === ok)?.n ?? 0;
assert.ok(n("login", false) >= 5 && n("login_locked", false) >= 1 && n("user_created", true) >= 2 && n("login", true) >= 3, "security events recorded: " + JSON.stringify(ev));
await assert.rejects(pool.query("delete from auth_events"), /append-only/, "security events can't be erased");
const { execFileSync } = await import("node:child_process");
const prod = (env: Record<string, string>) => { try { execFileSync("pnpm", ["exec", "tsx", "-e", "import('./src/config.ts')"], { env: { ...process.env, NODE_ENV: "production", ...env }, stdio: "pipe" }); return "started"; } catch { return "refused"; } };
assert.equal(prod({ JWT_SECRET: "short", CORS_ORIGIN: "https://a.com" }), "refused", "weak JWT secret refused in production");
assert.equal(prod({ JWT_SECRET: "x".repeat(40), CORS_ORIGIN: "*" }), "refused", "wildcard CORS refused in production");
assert.equal(prod({ JWT_SECRET: "x".repeat(40), CORS_ORIGIN: "https://a.com", DEMO_PASSWORD: "meridian-demo" }), "refused", "public demo password refused in production");
assert.equal(prod({ JWT_SECRET: "x".repeat(40), CORS_ORIGIN: "https://a.com", DEMO_PASSWORD: "a-private-demo-password" }), "started");
}
{ // parallel guessing cannot exceed the limit
  await mk({ email: "race@x.com", name: "Race Test", role: "rep", password: "right-password-1", emp });
  const rs = await Promise.all(Array.from({ length: 12 }, () => call("/auth/login", { method: "POST", body: JSON.stringify({ email: "race@x.com", password: "wrong" }) })));
  const fails = (await pool.query("select count(*)::int n from auth_events where event='login' and not ok and email='race@x.com'")).rows[0].n;
  assert.ok(fails <= 5, "never more than 5 guesses are evaluated: " + rs.map((r) => r.status).join(","));
  assert.equal(rs.filter((r) => r.status === 401).length, fails, "every evaluated guess was refused"); assert.equal(rs.filter((r) => r.status === 429).length, 12 - fails, "the rest were turned away at once");
}
{ const r = await fetch(A + "/health", { headers: { "x-request-id": "bad id \"forged\" {json}" } }); assert.notEqual(r.headers.get("x-request-id"), "bad id \"forged\" {json}", "junk request id replaced"); }
{ // a password change ends older sessions; input sizes are bounded
  const oldTok = await login("finance@meridian.demo");
  assert.equal((await call("/api/me", { token: oldTok })).status, 200);
  const fid = (await call("/api/me", { token: oldTok })).body.sub;
  assert.equal((await call(`/api/users/${fid}`, { method: "PATCH", token: owner, body: JSON.stringify({ password: "a-brand-new-password" }) })).status, 200);
  assert.equal((await call("/api/me", { token: oldTok })).status, 401, "old token dies when the password is reset");
  assert.equal((await mk({ email: "long@x.com", name: "Long Pw", role: "rep", password: "p".repeat(129), emp })).status, 400, "huge passwords refused");
  assert.equal((await call("/auth/login", { method: "POST", body: JSON.stringify({ email: "a@b.com", password: "x".repeat(300) }) })).status, 401);
  const big = await call("/api/commands", { method: "POST", token: owner, body: JSON.stringify({ type: "CreateLead", payload: { pad: "x".repeat(1_200_000) } }) }).then((r) => r.status, () => 413); // the server may close the connection while we are still sending
  assert.equal(big, 413, "oversized body refused");
}
console.log("  ✓ lockout, security events, production config guards");

console.log("Postgres state");
const row = (await pool.query("select data from records where kind='customers' and id=$1", [custId])).rows[0];
assert.equal(row.data.name, "API Test Mart", "projected into records");
const n = (await pool.query("select count(*)::int as n from commands")).rows[0].n; assert.equal(n, 3, "only successful commands are stored");
const tot = (await pool.query("select sum(debit) d, sum(credit) c from journal_lines")).rows[0]; assert.ok(Math.abs(tot.d - tot.c) < 0.01, "ledger balances in SQL");
await assert.rejects(pool.query("update journal_lines set debit = debit + 1 where line_no = 1"), /append-only/, "ledger is append-only");
await assert.rejects(pool.query("delete from commands"), /append-only/, "command log is append-only");
const bad = await pool.connect();
await bad.query("begin"); await bad.query("insert into journal_entries values ('JE-BAD', '2026-01-01', 'x', 'x', 'manual', 'test')"); await bad.query("insert into journal_lines values ('JE-BAD', 1, '1100', 100, 0)");
await assert.rejects(bad.query("commit"), /not balanced/, "database refuses an unbalanced entry"); bad.release();
const ordRow = (await pool.query("select data from records where kind='orders' and data->>'customerId'=$1", [custId])).rows[0];
assert.ok(ordRow && ordRow.data.status !== "draft", "order projected and reserved");
console.log("  ✓ projection, append-only ledger, balanced-entry constraint");

console.log("Durability");
const before = W.world.customers.length;
await W.boot(); // as after a restart: seed + stored commands
const w2 = W.world;
assert.equal(w2.customers.length, before); assert.ok(w2.customers.some((c) => c.id === custId), "customer survives restart");
assert.equal(w2.orders.find((o) => o.customerId === custId)?.id, ordRow.data.id, "same ids after replay");
const since = (await call("/api/commands?since=1", { token: rep })).body.commands; assert.equal(since.length, 2, "sync since cursor");
console.log("  ✓ restart rebuilds identical state; sync cursor");

console.log("Permissions (R1)");
{
  const { issue, pwVersion } = await import("../src/auth");
  const { COMMAND_PERMISSIONS, can } = await import("../src/engine");
  const tokenFor = async (email: string) => { const u = (await pool.query("select * from users where email=$1", [email])).rows[0]; return issue({ sub: u.id, email: u.email, name: u.name, role: u.role, emp: u.emp_name, pv: pwVersion(u.pw_hash) }); };
  const ROLE_EMAIL: Record<string, string> = { owner: "owner@meridian.demo", admin: "admin@meridian.demo", finance: "finance@meridian.demo", sales_manager: "sales.manager@meridian.demo", rep: "rep.karachi@meridian.demo", warehouse: "warehouse.khi@meridian.demo", procurement: "procurement@meridian.demo", employee: "employee@meridian.demo" };
  const toks: Record<string, string> = {}; for (const [r, e] of Object.entries(ROLE_EMAIL)) toks[r] = await tokenFor(e);
  // 1. every command against every role: allowed exactly when the registry says so
  let checked = 0;
  for (const [type, rule] of Object.entries(COMMAND_PERMISSIONS)) for (const role of Object.keys(ROLE_EMAIL)) {
    const res = await cmd(toks[role]!, type, {});
    const allowed = can(role as never, rule.permission);
    if (allowed) assert.notEqual(res.body?.error?.code, "FORBIDDEN", `${role} should be allowed ${type}: ${JSON.stringify(res.body?.error)}`); // record-level refusals (SCOPE) are tested separately
    else { assert.equal(res.status, 403, `${role} must not run ${type}`); assert.equal(res.body.error.code, "FORBIDDEN"); }
    checked++;
  }
  assert.equal(checked, Object.keys(COMMAND_PERMISSIONS).length * 8);
  console.log(`  ✓ ${checked} command × role combinations match the permission table`);

  // 2. scope: a rep only works their own customers and leads
  const w = W.world, usman = w.employees.find((e) => e.name === "Usman Ghani")!;
  const mine = w.customers.find((c) => c.repId === usman.id)!, theirs = w.customers.find((c) => c.repId !== usman.id)!;
  const order = (customerId: string) => ({ customerId, lines: [{ productId: w.products[0]!.id, cartons: 1, discPct: 0 }], mode: "draft" });
  const bad = await cmd(toks.rep!, "CreateOrder", order(theirs.id)); assert.equal(bad.status, 403); assert.equal(bad.body.error.code, "SCOPE");
  assert.notEqual((await cmd(toks.rep!, "CreateOrder", order(mine.id))).status, 403, "own customer allowed");
  assert.equal((await cmd(toks.rep!, "RecordPayment", { customerId: theirs.id, amount: 1000, method: "cash" })).body.error.code, "SCOPE", "payments too");
  const lead = await cmd(toks.rep!, "CreateLead", { company: "Scope Traders", contact: "x", city: "Karachi", source: "web", repId: "someone-else", value: 1, probability: 10 });
  assert.equal(lead.status, 200, JSON.stringify(lead.body)); assert.equal(W.world.leads.find((l) => l.id === lead.body.value.id)!.repId, usman.id, "a rep's lead is always assigned to them");
  // fail-closed: a harmless customerId cannot disguise someone else's order, and unknown records are refused
  const theirOrder = w.orders.find((o) => w.customers.find((c) => c.id === o.customerId)?.repId !== usman.id)!;
  for (const type of ["ConfirmOrder", "CancelOrder", "RequestCreditOverride"]) {
    const sneaky = await cmd(toks.rep!, type, { orderId: theirOrder.id, customerId: mine.id, reason: "x" });
    assert.equal(sneaky.body.error.code, "SCOPE", `${type}: another rep's order refused even with an own customerId`);
    assert.equal((await cmd(toks.rep!, type, { orderId: "no-such-order" })).body.error.code, "SCOPE", `${type}: unknown order refused`);
  }
  const own = w.orders.find((o) => w.customers.find((c) => c.id === o.customerId)?.repId === usman.id);
  if (own) assert.equal((await cmd(toks.rep!, "ConfirmOrder", { orderId: own.id, customerId: theirs.id })).body.error.code, "SCOPE", "a foreign customer named in any field is refused");
  assert.equal((await cmd(toks.rep!, "SetQuoteStatus", { id: "no-such-quote", status: "sent" })).body.error.code, "SCOPE");
  assert.equal((await cmd(toks.rep!, "MoveLead", { id: "no-such-lead", stage: "won" })).body.error.code, "SCOPE");
  assert.equal((await cmd(toks.rep!, "CreateOrder", {})).body.error.code, "SCOPE", "no customer named: refused");
  console.log("  ✓ rep scope: own customers and leads only, fail-closed");

  // 3. self: leave and expenses are always filed for the signed-in user
  const kashif = w.employees.find((e) => e.name === "Kashif Raza")!, other = w.employees.find((e) => e.name !== "Kashif Raza")!;
  const lv = await cmd(toks.employee!, "SubmitLeave", { employeeId: other.id, type: "Annual", from: w.today, to: w.today, reason: "scope test" });
  assert.equal(lv.status, 200, JSON.stringify(lv.body));
  assert.equal(W.world.leaves.find((l) => l.id === lv.body.value.id)!.employeeId, kashif.id, "filed for the caller, not for the employee named in the request");
  const hrLv = await cmd(toks.finance!, "SubmitLeave", { employeeId: other.id, type: "Annual", from: w.today, to: w.today, reason: "hr files for someone" });
  assert.equal(W.world.leaves.find((l) => l.id === hrLv.body.value.id)!.employeeId, other.id, "HR roles may file for others");
  console.log("  ✓ leave and expenses are filed for the signed-in user");

  // 4. nobody approves their own request
  const ayesha = w.employees.find((e) => e.name === "Ayesha Siddiqui")!;
  const ex = await cmd(toks.finance!, "SubmitExpense", { employeeId: ayesha.id, category: "Fuel", merchant: "Petro Plus", amount: 90_000, purpose: "route visit test", date: w.today, hasReceipt: true });
  assert.equal(ex.status, 200, JSON.stringify(ex.body));
  const apr = W.world.approvals.find((a) => a.ref === ex.body.value.id && a.status === "pending")!;
  const self = await cmd(toks.finance!, "DecideApproval", { id: apr.id, decision: "approved" });
  assert.equal(self.body.error?.code, "APR_SOD", "own request can't be approved by its requester");
  console.log("  ✓ no self-approval");
}

console.log("State tables (R2.2)");
{
  const { TABLES, SINGLETONS } = await import("../src/state-schema");
  const world = W.world as unknown as Record<string, any>;
  let rowsChecked = 0;
  for (const t of TABLES) {
    const rows = (await pool.query(`select id, data from ${t.table}`)).rows;
    const docs: any[] = world[t.collection as string];
    assert.equal(rows.length, docs.length, `${t.table}: row count ${rows.length} vs ${docs.length}`);
    const byId = new Map(rows.map((r) => [r.id, r.data]));
    for (const d of docs) { assert.deepEqual(byId.get(t.id(d)), JSON.parse(JSON.stringify(d)), `${t.table} ${t.id(d)} differs from the engine's document`); rowsChecked++; }
  }
  for (const k of SINGLETONS) assert.deepEqual((await pool.query("select data from state_singletons where key=$1", [k])).rows[0].data, JSON.parse(JSON.stringify(world[k])), `${k} differs`);
  console.log(`  ✓ ${rowsChecked} documents in ${TABLES.length} tables equal the engine's state exactly`);
  const cust = (await pool.query("select name, credit_limit, status from customers where name='API Test Mart'")).rows[0];
  assert.equal(cust.credit_limit, 200000); assert.equal(cust.status, "active"); console.log("  ✓ typed columns filled");
  assert.ok((await pool.query("select count(*)::int n from commands where engine_version is not null")).rows[0].n > 0, "commands record the engine version");
  const fk = await pool.connect(); await fk.query("begin");
  await fk.query("insert into invoices(id, number, customer_id, data) values ('inv-orphan','X-1','no-such-customer','{}')");
  await assert.rejects(fk.query("commit"), /foreign key/, "database refuses an invoice for a customer that does not exist"); fk.release();
  console.log("  ✓ foreign keys enforced");
}

console.log("Boot from the state tables (R2.3)");
{
  const { config } = await import("../src/config");
  // Compare whole states by a fingerprint per part instead of keeping full copies: three copies of the company would not fit a 768 MB heap.
  const { createHash } = await import("node:crypto");
  // Canonical JSON: object keys sorted (Postgres jsonb reorders them), stock entries sorted.
  const canon = (v: any): string => Array.isArray(v) ? `[${v.map(canon).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",")}}` : JSON.stringify(v) ?? "null";
  const norm = (db: any) => Object.fromEntries(Object.entries(db).map(([k, v]) => { const x = v instanceof Map ? [...v] : v; if (k === "stock") (x as any[]).sort(([a]: any, [b]: any) => (a < b ? -1 : 1)); return [k, createHash("sha1").update(canon(x)).digest("hex")]; }));
  const before = norm(W.world);
  const dry = await W.migrateState(true);
  assert.equal(dry.moved, false); assert.deepEqual(dry.problems, [], "dry run: the books are consistent");
  const done = await W.migrateState(false); assert.equal(done.moved, true);
  config.stateSource = "tables";
  await W.boot();
  assert.deepEqual(norm(W.world), before, "state rebuilt from the tables equals the state the engine had, field for field");
  console.log(`  ✓ ${done.documents} documents + ledger + audit + stock rebuilt from tables, identical to the engine's state`);

  const o = (await pool.query("select * from users where email='owner@meridian.demo'")).rows[0];
  const { issue, pwVersion } = await import("../src/auth");
  const tok = issue({ sub: o.id, email: o.email, name: o.name, role: o.role, emp: o.emp_name, pv: pwVersion(o.pw_hash) });
  const mk2 = await cmd(tok, "CreateLead", { company: "Tables Mode Ltd", contact: "x", city: "Karachi", source: "web", repId: "", value: 5, probability: 10 });
  assert.equal(mk2.status, 200, JSON.stringify(mk2.body));
  const afterCmd = norm(W.world);
  await W.boot();
  assert.deepEqual(norm(W.world), afterCmd, "a command written in tables mode survives a restart with no replay");
  assert.ok(W.world.leads.some((l) => l.company === "Tables Mode Ltd"));
  console.log("  ✓ commands keep working in tables mode and survive a restart");

  // the books checking themselves
  await pool.query("update stock_levels set value = value + 5000 where ctid = (select ctid from stock_levels where value > 0 limit 1)");
  await W.boot();
  assert.ok(W.readOnly && W.readOnly.problems.some((p) => p.check === "inventory"), "tampered stock value is detected at boot");
  const paused = await cmd(tok, "CreateLead", { company: "Should Not Save", contact: "x", city: "Karachi", source: "web", repId: "", value: 1, probability: 1 });
  assert.equal(paused.status, 503); assert.equal(paused.body.error.code, "INTEGRITY", "commands are refused while the books disagree");
  const integ = await call("/api/health/integrity", { token: tok }); assert.equal(integ.body.ok, false); assert.ok(integ.body.problems.length >= 1);
  const ru = (await pool.query("select * from users where email='rep.karachi@meridian.demo'")).rows[0];
  assert.equal((await call("/api/health/integrity", { token: issue({ sub: ru.id, email: ru.email, name: ru.name, role: ru.role, emp: ru.emp_name, pv: pwVersion(ru.pw_hash) }) })).status, 403, "only owner/admin may read the report");
  await pool.query("update stock_levels set value = value - 5000 where ctid = (select ctid from stock_levels where value > 5000 limit 1)");
  await W.boot(); assert.equal(W.readOnly, null, "back to normal once the data is corrected");
  console.log("  ✓ integrity check pauses changes when the books disagree, and clears when fixed");
  // snapshot bootstrap
  const snapRes = await call("/api/bootstrap?snapshot=1", { token: tok });
  assert.equal(snapRes.status, 200); assert.deepEqual(snapRes.body.commands, []);
  const maxSeq = Number((await pool.query("select max(seq) n from commands")).rows[0].n);
  assert.equal(snapRes.body.seq, maxSeq, "snapshot carries the log position it matches");
  assert.deepEqual(norm(snapRes.body.state), norm(W.world), "snapshot equals the live state");
  console.log("  ✓ GET /api/bootstrap?snapshot=1 returns the exact state and its log position");
  config.stateSource = "replay";
}

console.log("\nAll backend checks passed.");
srv.close(); await pool.end(); process.exit(0);
