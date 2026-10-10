// Opens every page as the Owner of an EMPTY company and reports crashes. Needs the empty-mode backend and frontend (see docs/SELF-HOSTING.md).
import { chromium } from "playwright";
const B = process.env.BASE_URL ?? "http://localhost:3200", EMAIL = process.env.OWNER_EMAIL ?? "owner@acme.test", PW = process.env.OWNER_PASSWORD ?? "acme-pass-123";
const PAGES = ["/overview","/ai","/approvals","/automations","/customers","/employees","/employees/leave","/employees/payroll","/expenses","/finance/cashflow","/finance/journal","/finance/payables","/finance/receivables","/finance/reconciliation","/finance/statements","/finance/tax","/integrations","/inventory","/inventory/expiry","/inventory/replenishment","/inventory/stock","/purchasing/bills","/purchasing/bills/new","/purchasing/claims","/purchasing/orders","/purchasing/orders/new","/purchasing/payments","/purchasing/receipts","/reports","/sales/invoices","/sales/leads","/sales/orders","/sales/orders/new","/sales/payments","/sales/quotes","/sales/quotes/new","/sales/returns","/sales/shipments","/settings","/settings/ai","/settings/audit","/settings/health","/settings/notifications","/settings/policies","/settings/roles","/suppliers","/warehouses","/warehouses/count","/warehouses/pick","/warehouses/receive","/learn"];
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
let errs = [];
p.on("pageerror", (e) => errs.push(e.message.slice(0, 140))); p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon/.test(m.text())) errs.push(m.text().slice(0, 140)); });
await p.goto(B + "/login", { waitUntil: "networkidle" });
await p.getByLabel("Email").fill(EMAIL); await p.getByLabel("Password").fill(PW); await p.getByRole("button", { name: "Sign in" }).click();
await p.waitForURL((u) => !/login/.test(u.pathname), { timeout: 15000 }); await p.waitForTimeout(2500);
let bad = 0;
for (const path of (process.env.PAGES ? process.env.PAGES.split(",") : PAGES)) {
  errs = [];
  await p.goto(B + path, { waitUntil: "networkidle" }).catch(() => {}); await p.waitForTimeout(1200);
  const txt = await p.locator("body").innerText().catch(() => "");
  const crashed = /Application error|Something went wrong|This page couldn.t load|Unhandled Runtime Error/i.test(txt) && !/Something went wrong on our side/.test(txt);
  if (errs.length || crashed) { bad++; console.log("✗", path, crashed ? "[crash screen]" : "", errs.slice(0, 2).join(" | ")); } else console.log("✓", path);
}
console.log(bad ? `${bad} page(s) failing` : "all pages render"); await b.close(); process.exit(bad ? 1 : 0);
