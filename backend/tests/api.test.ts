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
  const r = await fetch(A + path, { ...init, headers: { "content-type": "application/json", ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) } });
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
await call(`/api/users/${made.body.id}`, { method: "PATCH", token: owner, body: JSON.stringify({ role: "warehouse" }) });
assert.equal((await cmd(newTok, "CreateOrder", {})).status, 403, "role change applies on the existing token immediately");
await call(`/api/users/${made.body.id}`, { method: "PATCH", token: owner, body: JSON.stringify({ active: false }) });
assert.equal((await call("/api/me", { token: newTok })).status, 401, "disabled user is locked out at once");
const ownerId = (await call("/api/me", { token: owner })).body.sub;
assert.equal((await call(`/api/users/${ownerId}`, { method: "PATCH", token: owner, body: JSON.stringify({ active: false }) })).status, 400, "can't disable yourself");
console.log("  ✓ user management: create, validation, role change, disable, self-protection");

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

console.log("\nAll backend checks passed.");
srv.close(); await pool.end(); process.exit(0);
