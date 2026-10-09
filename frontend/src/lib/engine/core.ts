// Domain engine core. Commands validate first, then mutate the DB atomically, post balanced journal entries,
// write an audit event and emit notifications. The same code runs in the browser (demo) and in the server
// (assistant) so a real backend can replace it behind the same command shapes. See docs/MIGRATION.md.
import { addDays, diffDays } from "../data/dates";
import type { Cell, DB } from "../data/sim";
import type { AuditEvent, ISODate, JournalLine, Notification, Product } from "../data/types";
import type { Role } from "../rbac";

export interface Ctx { db: DB; actor: string; role: Role; date: ISODate; now: string; source: AuditEvent["source"] }
export interface Problem { code: string; title: string; detail: string; recovery: string }
export type Result<T = undefined> = { ok: true; value: T; message?: string } | { ok: false; error: Problem };
export const ok = <T = undefined>(value?: T, message?: string): Result<T> => ({ ok: true, value: value as T, message });
export const fail = (code: string, title: string, detail: string, recovery: string): Result<never> => ({ ok: false, error: { code, title, detail, recovery } });

export const r2 = (n: number) => Math.round(n * 100) / 100;
export const pad = (n: number, w: number) => String(n).padStart(w, "0");

/** Next document number: highest numeric suffix among existing numbers + 1. */
export function nextNo(prefix: string, existing: { number: string }[], floor = 0): string {
  let max = floor;
  for (const e of existing) { const m = e.number.match(/(\d+)$/); if (m && e.number.startsWith(prefix)) max = Math.max(max, +m[1]!); }
  return `${prefix}${max + 1}`;
}
// Ids are derived from the command id, so replaying the same log reproduces identical ids (later commands reference them).
let scope = "x", k = 0;
export function setIdScope(commandId: string) { scope = commandId; k = 0; }
export const newId = (p: string) => `${p}_${scope}_${++k}`;

export function cell(db: DB, productId: string, warehouseId: string): Cell {
  const k = `${productId}|${warehouseId}`;
  let c = db.stock.get(k);
  if (!c) { c = { on: 0, res: 0, val: 0, ema: 0, incoming: 0 }; db.stock.set(k, c); }
  return c;
}
export const unitCost = (c: Cell, fallback: number) => (c.on > 0 ? c.val / c.on : fallback);

export function periodOf(db: DB, date: ISODate): { id: string; status: "closed" | "soft_closed" | "open" | "future"; name: string } {
  const [y, m] = [+date.slice(0, 4), +date.slice(5, 7)];
  const fyStart = m >= 7 ? y : y - 1;
  const no = ((m + 5) % 12) + 1;
  const id = `P${pad(no, 2)} FY${String(fyStart).slice(2)}-${String(fyStart + 1).slice(2)}`;
  const name = `${id} (${new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" })} ${y})`;
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const base: "closed" | "soft_closed" | "open" | "future" = date > db.today ? "future" : monthEnd < "2026-07-01" ? "closed" : monthEnd < `${db.today.slice(0, 7)}-01` ? "soft_closed" : "open";
  return { id, name, status: db.periodStatus[id] ?? base };
}

/** Guard used before any posting: closed periods are immutable. */
export function assertPostable(db: DB, date: ISODate, allowSoft = false): Result | null {
  const p = periodOf(db, date);
  if (p.status === "closed") return fail("FIN_PERIOD_CLOSED", "We couldn't post this because the period is closed", `${p.name} is closed, and posting into a closed period is not allowed.`, "Use a date in an open period, or ask the Owner to reopen the period.");
  if (p.status === "soft_closed" && !allowSoft) return fail("FIN_PERIOD_SOFT_CLOSED", "The period is soft-closed", `${p.name} only accepts entries from the Finance Manager.`, "Use today's date, or ask Finance to post it.");
  if (p.status === "future") return fail("FIN_DATE_FUTURE", "Posting date is in the future", "Documents can't be dated after today.", "Use today's date.");
  return null;
}

/** Post a balanced journal entry. Throws only on programmer error (unbalanced), never on user input. */
export function postJE(ctx: Ctx, memo: string, source: string, lines: JournalLine[], type: "auto" | "manual" | "opening" | "closing" = "auto", date = ctx.date) {
  const ls = lines.filter((l) => l.debit || l.credit).map((l) => ({ account: l.account, debit: r2(l.debit), credit: r2(l.credit) }));
  if (!ls.length) return null;
  const d = r2(ls.reduce((s, l) => s + l.debit, 0)), c = r2(ls.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(d - c) > 0.011) throw new Error(`Unbalanced journal "${memo}": debit ${d} credit ${c}`);
  const db = ctx.db;
  const last = db.journal.length ? +db.journal[db.journal.length - 1]!.number.slice(3) : 0;
  const je = { id: newId("je"), number: `JE-${pad(last + 1, 6)}`, date, memo, source, type, lines: ls, postedBy: ctx.actor };
  db.journal.push(je);
  return je;
}

export function audit(ctx: Ctx, action: string, entity: string, ref: string, detail?: string) {
  ctx.db.audit.unshift({ id: newId("au"), at: ctx.now, actor: ctx.actor, action, entity, ref, source: ctx.source, detail });
}
export function notify(ctx: Ctx, title: string, body: string, severity: Notification["severity"], href: string) {
  ctx.db.notifications.unshift({ id: newId("n"), at: ctx.now, title, body, severity, href, read: false });
}

export const money = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length]![b.length]!;
}
export const normInvNo = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const productOf = (db: DB, id: string): Product | undefined => db.products.find((p) => p.id === id);
void addDays; void diffDays;

/** Simulated outbound message. Demo orgs never send anything externally; the outbox shows what would have gone out. */
export function queue(ctx: Ctx, channel: "WhatsApp" | "Email" | "FBR", to: string, subject: string, body: string) {
  ctx.db.outbox.unshift({ id: newId("out"), at: ctx.now, channel, to, subject, body, status: "simulated" });
}
