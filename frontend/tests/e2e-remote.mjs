// Browser test of remote mode: real login, commands saved by the backend, visible to a second user, survive reload.
// Needs: backend on :4000 (docker compose up -d) and the frontend started with NEXT_PUBLIC_API_URL=http://localhost:4000 on :3200.
import { chromium } from "playwright";
const B = process.env.BASE_URL ?? "http://localhost:3200", PW = process.env.DEMO_PASSWORD ?? "meridian-demo";
const b = await chromium.launch();
const errs = [];
const open = async (email) => {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message.slice(0, 160)));
  await p.goto(B + "/login", { waitUntil: "networkidle" });
  await p.getByLabel("Email").fill(email); await p.getByLabel("Password").fill(PW); await p.getByRole("button", { name: "Sign in" }).click();
  await p.waitForURL(/overview/, { timeout: 10000 }); await p.waitForTimeout(1500); return p;
};
const step = async (n, f) => { try { await f(); console.log("✓", n); } catch (e) { console.log("✗", n, "-", String(e.message).split("\n")[0].slice(0, 180)); } };
const name = "Remote Mart " + Date.now().toString(36);
let owner, rep;
await step("owner signs in", async () => { owner = await open("owner@meridian.demo"); await owner.getByText("Tariq Mehmood").first().waitFor(); });
await step("wrong password rejected", async () => { const p = await (await b.newContext()).newPage(); await p.goto(B + "/login", { waitUntil: "networkidle" }); await p.getByLabel("Email").fill("owner@meridian.demo"); await p.getByLabel("Password").fill("nope"); await p.getByRole("button", { name: "Sign in" }).click(); await p.getByText("Wrong email or password.").waitFor({ timeout: 5000 }); });
await step("owner creates a customer (saved by server)", async () => { await owner.goto(B + "/customers", { waitUntil: "networkidle" }); await owner.waitForTimeout(1500); await owner.getByRole("button", { name: /New customer/ }).click(); await owner.getByLabel("Trading name").fill(name); await owner.getByLabel("Area").fill("Saddar"); await owner.getByLabel("Contact").fill("Ali"); await owner.getByRole("button", { name: "Create customer" }).click(); await owner.waitForURL(/\/customers\/cus_/, { timeout: 10000 }); });
await step("customer survives a reload (from the server, not the browser)", async () => { await owner.evaluate(() => localStorage.removeItem("meridian-demo-v2")); await owner.goto(B + "/customers", { waitUntil: "networkidle" }); await owner.waitForTimeout(2000); await owner.getByPlaceholder("Search customers").fill(name); await owner.getByText(name).first().waitFor({ timeout: 8000 }); });
await step("a second user sees it without reloading (sync)", async () => { rep = await open("finance@meridian.demo"); await rep.goto(B + "/customers", { waitUntil: "networkidle" }); await rep.waitForTimeout(1500); await rep.getByPlaceholder("Search customers").fill(name); await rep.getByText(name).first().waitFor({ timeout: 8000 }); });
await step("role guard: rep can't create a PO via API", async () => { const r = await rep.evaluate(async () => { const t = localStorage.getItem("meridian-token"); const x = await fetch("http://localhost:4000/api/commands", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + t }, body: JSON.stringify({ type: "CreateBill", payload: {} }) }); return x.status; }); if (r !== 422) throw new Error("finance bill create should reach engine, got " + r); const rr = await rep.evaluate(async () => { const t = localStorage.getItem("meridian-token"); const x = await fetch("http://localhost:4000/api/commands", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + t }, body: JSON.stringify({ type: "CreatePO", payload: {} }) }); return x.status; }); if (rr !== 403) throw new Error("expected 403 got " + rr); });
await step("sign out returns to login", async () => { await owner.getByRole("button", { name: /Tariq/ }).click(); await owner.getByRole("menuitem", { name: /Sign out/ }).click(); await owner.waitForURL(/login/, { timeout: 5000 }); });
console.log("page errors:", errs.slice(0, 5));
await b.close();
