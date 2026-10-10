// Offline behaviour against the production build: pages open with no connection, changes queue on the device and sync later.
// Needs the full stack:  docker compose up -d   (web on :3000, API on :4000)
import { chromium } from "playwright";
const B = process.env.BASE_URL ?? "http://localhost:3000", PW = process.env.DEMO_PASSWORD ?? "meridian-demo";
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "allow" }); const p = await ctx.newPage();
const errs = []; p.on("pageerror", (e) => errs.push(e.message.slice(0, 160)));
const step = async (n, f) => { try { await f(); console.log("✓", n); } catch (e) { console.log("✗", n, "-", String(e.message).split("\n")[0].slice(0, 200)); } };
const name = "Offline Mart " + Date.now().toString(36);
await step("sign in and save pages for offline", async () => {
  await p.goto(B + "/login", { waitUntil: "networkidle" }); await p.getByLabel("Email").fill("owner@meridian.demo"); await p.getByLabel("Password").fill(PW); await p.getByRole("button", { name: "Sign in" }).click();
  await p.waitForURL(/overview/, { timeout: 15000 });
  await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith("meridian-saved-")), null, { timeout: 120000 });
  for (let t = 0; t < 90; t++) { if (await p.evaluate(async () => (await (await caches.open("meridian-v1")).keys()).some((k) => /__example__\/reports$/.test(new URL(k.url).pathname)))) break; if (t === 89) throw new Error("example pages were never saved"); await p.waitForTimeout(1000); } // example record pages saved
});
await step("service worker controls the page", async () => { await p.reload({ waitUntil: "networkidle" }); if (!(await p.evaluate(() => !!navigator.serviceWorker.controller))) throw new Error("no controller"); });
await step("offline: customers page opens from the saved copy", async () => { await ctx.setOffline(true); await p.goto(B + "/customers", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(2500); await p.getByRole("button", { name: /New customer/ }).waitFor({ timeout: 10000 }); await p.getByText(/Offline/).first().waitFor({ timeout: 8000 }); });
await step("offline: create a customer, it queues", async () => { await p.getByRole("button", { name: /New customer/ }).click(); await p.getByLabel("Trading name").fill(name); await p.getByLabel("Area").fill("Saddar"); await p.getByLabel("Contact").fill("Ali"); await p.getByRole("button", { name: "Create customer" }).click(); await p.waitForURL(/\/customers\/cus_/, { timeout: 10000 }); await p.getByText(name).first().waitFor({ timeout: 15000 }).catch(async () => { throw new Error("no customer; url=" + p.url() + " cache=" + JSON.stringify(await p.evaluate(async () => (await (await caches.open("meridian-v1")).keys()).map((k) => new URL(k.url).pathname).filter((x) => /(customers|suppliers)\/[^/]+$/.test(x)))) + " body=" + (await p.locator("body").innerText().catch(() => "?")).slice(0, 200).replace(/\n/g, " | ")); }); await p.waitForFunction(() => /1 waiting to sync/.test(document.body.innerText), null, { timeout: 15000 }); });
await step("offline: reload keeps the unsent change", async () => { await p.goto(B + "/customers", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(2500); await p.getByPlaceholder("Search customers").fill(name); await p.getByText(name).first().waitFor({ timeout: 10000 }); });
await step("back online: change reaches the server", async () => {
  await ctx.setOffline(false);
  await p.waitForFunction(() => !document.body.innerText.includes("waiting to sync"), null, { timeout: 30000 });
  const seen = await p.evaluate(async (n) => { const t = localStorage.getItem("meridian-token"); const r = await fetch("http://localhost:4000/api/commands?since=0", { headers: { authorization: "Bearer " + t } }); const j = await r.json(); return j.commands.some((c) => c.type === "CreateCustomer" && c.payload.name === n); }, name);
  if (!seen) throw new Error("server never received it");
});
await step("unvisited page offline shows a clear message", async () => { await ctx.setOffline(true); await p.goto(B + "/definitely-not-saved", { waitUntil: "domcontentloaded" }).catch(() => {}); await p.getByText(/offline|404/i).first().waitFor({ timeout: 8000 }); await ctx.setOffline(false); });
console.log("page errors:", errs.slice(0, 4)); await b.close();
