// Do the books agree with themselves? Run at boot and on demand. A failure means something is wrong in the data and the
// server stops accepting changes until a person looks (nothing is recomputed or "fixed" automatically).
import type { DB } from "./engine";

export interface Inconsistency { check: string; detail: string }
const bal = (db: DB, code: string) => db.journal.reduce((s, j) => s + j.lines.filter((l) => l.account === code).reduce((x, l) => x + l.debit - l.credit, 0), 0);

export function reconcile(db: DB): Inconsistency[] {
  const out: Inconsistency[] = [];
  const tb = db.journal.reduce((s, j) => s + j.lines.reduce((x, l) => x + l.debit - l.credit, 0), 0);
  if (Math.abs(tb) > 0.5) out.push({ check: "trial_balance", detail: `debits and credits differ by ${tb.toFixed(2)}` });
  for (const j of db.journal) { const d = j.lines.reduce((x, l) => x + l.debit - l.credit, 0); if (Math.abs(d) > 0.011) { out.push({ check: "journal_entry", detail: `${j.number} is not balanced (${d.toFixed(2)})` }); break; } }
  const ar = db.invoices.reduce((s, i) => s + i.total - i.paid, 0);
  if (Math.abs(ar - bal(db, "1200")) > 1) out.push({ check: "receivables", detail: `invoices owe ${ar.toFixed(2)} but account 1200 holds ${bal(db, "1200").toFixed(2)}` });
  const stock = [...db.stock.values()].reduce((s, c) => s + c.val, 0);
  if (Math.abs(stock - bal(db, "1300")) > 1) out.push({ check: "inventory", detail: `stock is valued at ${stock.toFixed(2)} but account 1300 holds ${bal(db, "1300").toFixed(2)}` });
  const over = db.invoices.find((i) => i.paid > i.total + 0.01);
  if (over) out.push({ check: "overpaid_invoice", detail: `${over.number} is paid ${over.paid} against ${over.total}` });
  return out;
}
