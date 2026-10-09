// Renders sample supplier invoices (PNG) from the seeded suppliers/products for trying the document-extraction flow.
// Run: pnpm tsx scripts/make-samples.ts   (needs playwright chromium)
import { chromium } from "playwright";
import { buildDB } from "../src/lib/data/sim";

const db = buildDB();
const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function html(supCode: string, no: string, names: string[], cartons: number[], bump: number) {
  const s = db.suppliers.find((x) => x.code === supCode)!;
  const lines = names.map((n, i) => { const p = db.products.find((x) => x.name === n)!; const qty = cartons[i]! * p.cartonSize; const price = Math.round(p.cost * bump * 100) / 100; return { d: p.name, qty, price, amt: Math.round(qty * price * 100) / 100 }; });
  const sub = Math.round(lines.reduce((a, l) => a + l.amt, 0) * 100) / 100, tax = Math.round(sub * 0.17 * 100) / 100;
  return `<html><body style="font:14px Arial;margin:0;background:#fff;color:#111"><div style="width:820px;padding:36px">
<div style="display:flex;justify-content:space-between;border-bottom:2px solid #222;padding-bottom:12px"><div><div style="font:bold 22px Arial">${s.name.toUpperCase()}</div><div>${s.city}, ${s.province}</div><div>NTN: ${s.ntn} &nbsp; STRN: ${s.strn}</div></div><div style="text-align:right"><div style="font:bold 20px Arial">SALES TAX INVOICE</div><div>Invoice No: <b>${no}</b></div><div>Date: ${db.today}</div></div></div>
<div style="margin:18px 0"><div style="color:#666">Bill to</div><b>Meridian Distribution Co. (Pvt.) Ltd.</b><br>NTN 4271936-8</div>
<table style="width:100%;border-collapse:collapse"><tr style="background:#eee;text-align:left"><th style="padding:8px">Description</th><th style="text-align:right">Qty (pcs)</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr>
${lines.map((l) => `<tr style="border-bottom:1px solid #ddd"><td style="padding:8px">${l.d}</td><td style="text-align:right">${l.qty}</td><td style="text-align:right">${fmt(l.price)}</td><td style="text-align:right">${fmt(l.amt)}</td></tr>`).join("")}</table>
<div style="margin:18px 0 0 auto;width:300px"><div style="display:flex;justify-content:space-between"><span>Value excluding sales tax</span><span>${fmt(sub)}</span></div><div style="display:flex;justify-content:space-between"><span>Sales tax (17%)</span><span>${fmt(tax)}</span></div><div style="display:flex;justify-content:space-between;border-top:2px solid #222;margin-top:6px;padding-top:6px;font:bold 16px Arial"><span>Total</span><span>${fmt(sub + tax)}</span></div></div></div></body></html>`;
}
const samples = [
  { file: "sample-invoice-indus.png", h: html("SUP-001", "IB-48301", ["NestFresh Mineral Water 1L", "Fizzup Cola 345ml"], [40, 30], 1.0) },
  { file: "sample-invoice-lucky.png", h: html("SUP-008", "LF-24102", ["Lucky Crunch Zeera Biscuits Ticky Pack", "Lucky Crunch Cream Sandwich Ticky Pack"], [20, 16], 1.0) },
];
(async () => {
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 600 } });
for (const s of samples) { await p.setContent(s.h); await p.screenshot({ path: `public/samples/${s.file}`, fullPage: true }); console.log("wrote", s.file); }
await b.close();
})();
