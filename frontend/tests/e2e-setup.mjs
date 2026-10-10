// A brand-new empty company: first sign-in lands on Getting started; company, warehouse, opening stock and cash can be entered.
// Needs: empty-mode backend on :4100 (fresh database) and the frontend with NEXT_PUBLIC_API_URL=http://localhost:4100 on :3200.
import { chromium } from "playwright";
const B = process.env.BASE_URL ?? "http://localhost:3200", API = "http://localhost:4100", EMAIL = "owner@acme.test", PW = "acme-pass-123";
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const errs = []; p.on("pageerror", (e) => errs.push(e.message.slice(0, 150)));
const step = async (n, f) => { try { await f(); console.log("✓", n); } catch (e) { console.log("✗", n, "-", String(e.message).split("\n")[0].slice(0, 200)); } };
const call = (type, payload) => p.evaluate(async ([API, type, payload]) => { const r = await fetch(API + "/api/commands", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + localStorage.getItem("meridian-token") }, body: JSON.stringify({ type, payload, id: "t" + Math.random().toString(36).slice(2, 10) }) }); return (await r.json()); }, [API, type, payload]);
await step("first sign-in lands on Getting started", async () => { await p.goto(B + "/login", { waitUntil: "networkidle" }); await p.getByLabel("Email").fill(EMAIL); await p.getByLabel("Password").fill(PW); await p.getByRole("button", { name: "Sign in" }).click(); await p.waitForURL(/\/setup/, { timeout: 20000 }); });
await step("save company profile", async () => { await p.getByLabel("Company name").fill("Acme Traders"); await p.getByLabel("NTN").fill("1234567-8"); await p.getByLabel("City", { exact: true }).fill("Karachi"); await p.getByRole("button", { name: "Save company" }).click(); await p.getByText("Company profile saved").first().waitFor({ timeout: 8000 }); });
await step("bad NTN is explained", async () => { await p.getByLabel("NTN").fill("12"); await p.getByRole("button", { name: "Save company" }).click(); await p.getByText("NTN format looks wrong").waitFor({ timeout: 5000 }); await p.getByLabel("NTN").fill("1234567-8"); });
await step("add a warehouse", async () => { await p.getByLabel("Warehouse code").fill("KHI-DC"); await p.getByLabel("Warehouse name").fill("Karachi DC"); await p.getByLabel("Warehouse city").fill("Karachi"); await p.getByRole("button", { name: "Add warehouse" }).click(); await p.getByText("Warehouse added").first().waitFor({ timeout: 8000 }); });
await step("orders page says what's missing", async () => { await p.goto(B + "/sales/orders/new", { waitUntil: "networkidle" }); await p.getByText("Not ready yet").waitFor({ timeout: 8000 }); });
let prodSku;
await step("add supplier + product + customer (API)", async () => {
  await p.goto(B + "/setup", { waitUntil: "networkidle" }); await p.waitForTimeout(1500);
  const s = await call("CreateSupplier", { name: "Unilever Pakistan", city: "Karachi", province: "Sindh", ntn: "1234567-1", isPrincipal: true, leadTimeDays: 5, termsDays: 30, contact: "A", phone: "", email: "", kind: "goods" }); if (!s.ok) throw new Error(JSON.stringify(s.error));
  const r = await call("CreateProduct", { name: "Test Soap 100g", brand: "Test", category: "personal_care", supplierId: s.value.id, cartonSize: 24, price: 100, cost: 80, mrp: 120, taxCategory: "standard", hsCode: "3401.1100", shelfLifeDays: 365 }); if (!r.ok) throw new Error(JSON.stringify(r.error));
  const c = await call("CreateCustomer", { name: "Corner Mart", channel: "retail", city: "Karachi", province: "Sindh", area: "Saddar", registered: false, atl: false, creditLimit: 500000, termsDays: 15, contact: "Ali", phone: "", email: "", repId: "" }); if (!c.ok) throw new Error(JSON.stringify(c.error));
  await p.reload({ waitUntil: "networkidle" }); await p.waitForTimeout(2500);
});
await step("post opening stock in the UI", async () => { await p.getByLabel(/^Qty /).first().fill("480"); await p.getByRole("button", { name: "Post opening stock" }).click(); await p.getByText("Opening stock posted").first().waitFor({ timeout: 8000 }); });
await step("post opening cash in the UI", async () => { await p.getByLabel("Balance 1100").fill("750000"); await p.getByRole("button", { name: "Post opening balances" }).click(); await p.getByText("Opening balances posted").first().waitFor({ timeout: 8000 }); });
await step("first order can now be booked", async () => { await p.goto(B + "/sales/orders/new", { waitUntil: "networkidle" }); await p.getByRole("button", { name: /Add product/ }).click(); await p.getByRole("option").first().click(); await p.getByRole("button", { name: "Confirm order" }).click(); await p.waitForURL(/\/sales\/orders\/so_/, { timeout: 10000 }); });
await step("reports and finance open on the new books", async () => { for (const u of ["/finance/statements", "/overview", "/finance/journal"]) { await p.goto(B + u, { waitUntil: "networkidle" }); await p.waitForTimeout(800); } });
console.log("page errors:", errs.slice(0, 4)); await b.close();
