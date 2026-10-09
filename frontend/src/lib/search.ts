import { idx, openInvoices } from "./data/queries";

export interface Hit { type: string; id: string; title: string; subtitle: string; href: string }
import type { DB } from "./data/sim";
import { getDB } from "./data/sim";
const indexes = new WeakMap<DB, Hit[]>();
export function resetSearch(db: DB) { indexes.delete(db); }
function build(): Hit[] {
  const { db, cus, sup } = idx();
  const h: Hit[] = [];
  for (const c of db.customers) h.push({ type: "Customer", id: c.id, title: c.name, subtitle: `${c.code} · ${c.city} · ${c.channel.replace("_", " ")}`, href: `/customers/${c.id}` });
  for (const s of db.suppliers) h.push({ type: "Supplier", id: s.id, title: s.name, subtitle: `${s.code} · ${s.city}`, href: `/suppliers/${s.id}` });
  for (const p of db.products) h.push({ type: "Product", id: p.id, title: p.name, subtitle: `${p.sku} · ${p.brand}`, href: `/inventory/${p.id}` });
  for (const i of db.invoices.slice(0, 600)) h.push({ type: "Invoice", id: i.id, title: i.number, subtitle: `${cus.get(i.customerId)!.name} · Rs ${Math.round(i.total).toLocaleString("en-US")}`, href: `/sales/invoices/${i.id}` });
  for (const o of db.orders.slice(0, 300)) h.push({ type: "Sales order", id: o.id, title: o.number, subtitle: `${cus.get(o.customerId)!.name} · ${o.status}`, href: `/sales/orders/${o.id}` });
  for (const p of db.pos.slice(0, 200)) h.push({ type: "Purchase order", id: p.id, title: p.number, subtitle: `${sup.get(p.supplierId)!.name} · ${p.status.replace("_", " ")}`, href: `/purchasing/orders/${p.id}` });
  for (const e of db.employees) h.push({ type: "Employee", id: e.id, title: e.name, subtitle: `${e.code} · ${e.position}`, href: `/employees?q=${encodeURIComponent(e.name)}` });
  for (const w of db.warehouses) h.push({ type: "Warehouse", id: w.id, title: w.name, subtitle: w.code, href: `/warehouses?wh=${w.id}` });
  void openInvoices;
  return h;
}
export function search(q: string, limit = 8): Hit[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const db = getDB();
  let index = indexes.get(db);
  if (!index) { index = build(); indexes.set(db, index); }
  const out: { h: Hit; score: number }[] = [];
  for (const h of index) {
    const t = h.title.toLowerCase(), sub = h.subtitle.toLowerCase();
    const score = t === s ? 100 : t.startsWith(s) ? 80 : t.includes(s) ? 60 : sub.includes(s) ? 30 : 0;
    if (score) out.push({ h, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.h);
}
