import { execFileSync } from "node:child_process";
// Pure-logic checks: period resolution, natural-language query parsing, FBR mapping, local assistant grounding.
import assert from "node:assert/strict";
import { resolvePeriod } from "../src/lib/data/dates";
import { buildDB, runOn } from "../src/lib/data/sim";
import { fbrPayload, validateFbr } from "../src/lib/integrations/fbr";
import { interpret, parseAmount } from "../src/lib/nl";
import { answerLocal, INSUFFICIENT } from "../src/lib/ai/local";
import { findGuide } from "../src/lib/ai/guide";
import { validateExtraction } from "../src/lib/ai/extract";
import { route, edition } from "../src/lib/ai/provider";
import { bearer, verifyCaller } from "../src/lib/ai/session";
import { r2 } from "../src/lib/money";
import { csvCell } from "../src/lib/csv";
import { checkFigures } from "../src/lib/ai/grounding";
import { runTool } from "../src/lib/ai/tools";

const T = "2026-10-09"; // a Friday
const eq = (p: string, from: string, to: string) => { const r = resolvePeriod(p, T)!; assert.ok(r, p); assert.equal(`${r.from}..${r.to}`, `${from}..${to}`, p); };
console.log("Periods");
eq("last week", "2026-09-28", "2026-10-04");
eq("this week", "2026-10-05", "2026-10-09");
eq("yesterday", "2026-10-08", "2026-10-08");
eq("last month", "2026-09-01", "2026-09-30");
eq("this month", "2026-10-01", "2026-10-09");
eq("last quarter", "2026-07-01", "2026-09-30");
eq("fiscal year to date", "2026-07-01", "2026-10-09");
eq("last 30 days", "2026-09-10", "2026-10-09");
eq("september", "2026-09-01", "2026-09-30");
assert.equal(resolvePeriod("sometime", T), null);
console.log("  ✓ 10 period phrases");

console.log("Amounts and NL queries");
assert.equal(parseAmount("balances over 1 million"), 1_000_000);
assert.equal(parseAmount("more than 5 lakh"), 500_000);
assert.equal(parseAmount("above 2.5 crore"), 25_000_000);
const db = buildDB();
runOn(db, () => {
  const q = interpret("Show overdue customers in Karachi with balances over 1 million")!;
  assert.ok(q && q.chips.includes("Overdue") && q.chips.includes("City = Karachi"), "NL chips");
  assert.ok(q.href.includes("minBalance=1000000"));
  console.log("  ✓ amounts, intent chips");

  console.log("Local assistant");
  const a = answerLocal("What is our revenue last week?");
  assert.equal(a.status, "answered"); assert.ok(!a.steps.some((s) => s.tool === "open_page"), "message-only does not navigate");
  const b = answerLocal("Show me revenue for last week on the webapp");
  assert.ok(b.steps.some((s) => s.tool === "open_page"), "show-on-screen navigates");
  assert.equal(answerLocal("What will customer satisfaction be next year?").status, "insufficient_data");
  assert.ok(answerLocal("zzz qqq").text.startsWith(INSUFFICIENT));
  assert.equal(findGuide("how do I record a cheque payment")[0]!.id, "record-payment");
  console.log("  ✓ answer vs navigate, insufficient data, guide lookup");

  const rev = runTool("get_revenue", { from: "2026-09-01", to: "2026-09-30" });
  const m = rev.summary.match(/revenue Rs ([\d,]+)/)!;
  assert.equal(checkFigures(`Revenue was Rs ${m[1]} in September.`, [rev]).unverified.length, 0, "true figure passes");
  assert.deepEqual(checkFigures("Revenue was Rs 999,999,999 in September.", [rev]).unverified, ["Rs 999,999,999"], "invented figure flagged");
  console.log("  ✓ grounding check passes true figures and flags invented ones");

  assert.match(answerLocal("how do I create a sales order", undefined, "finance").text, /can.t do this[\s\S]*owner/, "finance told they can't create orders");
  assert.doesNotMatch(answerLocal("how do I create a sales order", undefined, "owner").text, /can't do this/, "owner allowed");
  const denied = runTool("get_revenue", { from: "2026-09-01", to: "2026-09-30" }, "warehouse");
  assert.match(denied.summary, /ACCESS DENIED/, "warehouse can't read revenue");
  assert.doesNotMatch(runTool("get_revenue", { from: "2026-09-01", to: "2026-09-30" }, "owner").summary, /ACCESS DENIED/, "owner can");
  assert.match(runTool("open_page", { path: "/finance/statements" }, "warehouse").summary, /ACCESS DENIED/, "warehouse can't open finance");
  assert.doesNotMatch(runTool("open_page", { path: "/warehouses" }, "warehouse").summary, /ACCESS DENIED/, "warehouse can open warehouses");
  console.log("  ✓ assistant respects role access");

  const keep = { ...process.env };
  const env = (e: Record<string, string>) => { for (const k of Object.keys(process.env)) if (/^(AI_|OPENROUTER|ANTHROPIC|GOOGLE)/.test(k)) delete process.env[k]; Object.assign(process.env, e); };
  env({ OPENROUTER_API_KEY: "x" }); assert.equal(edition(), "demo"); assert.equal(route("reasoning")!.provider, "openrouter");
  env({ AI_EDITION: "premium", ANTHROPIC_API_KEY: "a", GOOGLE_GENERATIVE_AI_API_KEY: "g" });
  assert.deepEqual([route("reasoning")!.provider, route("fast")!.provider, route("vision")!.provider, route("agent")!.provider], ["anthropic", "anthropic", "gemini", "anthropic"], "premium routing per task");
  env({ AI_EDITION: "premium", GOOGLE_GENERATIVE_AI_API_KEY: "g" }); assert.equal(route("reasoning")!.provider, "gemini", "falls back to a provider that has a key");
  env({ AI_EDITION: "standard", GOOGLE_GENERATIVE_AI_API_KEY: "g", AI_MODEL_FAST: "gemini-x" }); assert.deepEqual(route("fast")!.models, ["gemini-x"], "model override");
  env({ AI_EDITION: "premium", ANTHROPIC_API_KEY: "a", AI_PROVIDER_VISION: "anthropic" }); assert.equal(route("vision")!.provider, "anthropic", "per-task provider override");
  env({}); assert.equal(route("reasoning"), null, "no key → computed mode");
  Object.assign(process.env, keep);
  console.log("  ✓ AI edition routing (demo / standard / premium, fallbacks, overrides)");

  execFileSync(process.execPath, ["--check", new URL("../public/sw.js", import.meta.url).pathname]); // a broken worker silently disables offline mode
  console.log("  ✓ service worker parses");

  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`, "formula neutralised");
  assert.equal(csvCell("@SUM(A1)"), `"'@SUM(A1)"`); assert.equal(csvCell(-1250.5), '"-1250.5"', "numbers untouched"); assert.equal(csvCell("Metro Mart"), '"Metro Mart"');
  console.log("  ✓ CSV export neutralises formula injection");

  // Money: rounding agrees with exact decimal arithmetic (BigInt reference) and sums never drift.
  let seed = 7; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const ref = (digits: string): number => { const neg = digits.startsWith("-"), d = digits.replace("-", ""), [i, f = ""] = d.split("."); const frac = (f + "000").slice(0, 3); let c = BigInt(i + frac.slice(0, 2)); if (Number(frac[2]) >= 5) c += BigInt(1); return (neg ? -1 : 1) * Number(c) / 100; };
  for (let k = 0; k < 20000; k++) { const s3 = `${rnd() < 0.5 ? "-" : ""}${Math.floor(rnd() * 90000)}.${String(Math.floor(rnd() * 1000)).padStart(3, "0")}`; assert.equal(r2(Number(s3)), ref(s3), `r2(${s3})`); }
  assert.equal(r2(1.005), 1.01, "half cents round up (the old formula gave 1)"); assert.equal(r2(-1.005), -1.01); assert.equal(r2(0.1 + 0.2), 0.3); assert.equal(r2(2.675), 2.68);
  let acc = 0, exact = BigInt(0); for (let k = 0; k < 200000; k++) { const c = Math.floor(rnd() * 5_000_000); exact += BigInt(c); acc = r2(acc + c / 100); }
  assert.equal(acc, Number(exact) / 100, "200,000 additions on the cent grid drift by exactly zero");
  console.log("  ✓ money: rounding matches exact decimal arithmetic; sums do not drift");

  console.log("FBR mapper on seeded invoices");
  let bad = 0;
  for (const inv of db.invoices.slice(0, 300)) { const p = fbrPayload(db, inv); const failed = validateFbr(p, inv).filter((c) => !c.ok); if (failed.length) { bad++; if (bad < 3) console.log("   ", inv.number, failed.map((f) => f.label).join(" | ")); } }
  assert.equal(bad, 0, `${bad} invoices fail FBR pre-flight`);
  console.log("  ✓ 300 invoices pass pre-flight");
});

console.log("Extraction validators");
const good = { supplierName: "X", supplierNtn: "1234567-8", invoiceNo: "A1", invoiceDate: "2026-10-01", poReference: null, lines: [{ description: "a", qty: 10, unitPrice: 5, amount: 50 }], subtotal: 50, salesTax: 8.5, total: 58.5 };
assert.ok(validateExtraction(good).every((c) => c.ok));
assert.ok(validateExtraction({ ...good, total: 70 }).some((c) => !c.ok));
console.log("  ✓ catches inconsistent totals");
console.log("\nAll unit checks passed.");

(async () => { // AI routes: identity comes from the backend, never from the request body
    const realFetch = globalThis.fetch, keepApi = { a: process.env.API_URL, b: process.env.NEXT_PUBLIC_API_URL };
    delete process.env.API_URL; delete process.env.NEXT_PUBLIC_API_URL;
    assert.equal(await verifyCaller("anything"), undefined, "no backend configured = public demo");
    process.env.API_URL = "http://api.test";
    globalThis.fetch = (async (_u: string, init: RequestInit) => (String((init.headers as Record<string, string>).authorization).endsWith("good") ? new Response(JSON.stringify({ name: "Imran", role: "warehouse", title: "Warehouse Manager" })) : new Response("{}", { status: 401 }))) as never;
    assert.equal((await verifyCaller("good"))?.role, "warehouse", "role comes from the backend");
    assert.equal(await verifyCaller("bad"), null, "invalid token rejected"); assert.equal(await verifyCaller(undefined), null, "missing token rejected");
    assert.equal(bearer(new Request("http://x", { headers: { authorization: "Bearer abc" } })), "abc");
    globalThis.fetch = realFetch; process.env.API_URL = keepApi.a; if (keepApi.b) process.env.NEXT_PUBLIC_API_URL = keepApi.b; if (!keepApi.a) delete process.env.API_URL;
    console.log("  ✓ AI routes take identity from the verified token");
  })().catch((e) => { console.error(e); process.exit(1); });
