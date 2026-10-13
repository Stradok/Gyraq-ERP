// Rebuild the engine's in-memory company state from the tables (no command replay). The result must equal the state the engine
// had when it wrote them; backend/tests/api.test.ts checks that for the whole database.
import type pg from "pg";
import { buildEmptyDB, type DB } from "./engine";
import { SINGLETONS, TABLES } from "./state-schema";

export async function hydrate(db: pg.Pool | pg.PoolClient, anchor: string, start: string): Promise<DB> {
  const base = buildEmptyDB(anchor); // supplies the chart of accounts; everything else comes from the tables
  const world = base as unknown as Record<string, unknown>;
  world.today = anchor; world.start = start;
  for (const t of TABLES) {
    const rows = (await db.query(`select data from ${t.table} order by ord ${t.newestFirst ? "desc" : "asc"}`)).rows;
    world[t.collection as string] = rows.map((r) => r.data);
  }
  (world.payroll as { month: string }[]).sort((a, b) => b.month.localeCompare(a.month)); // the engine keeps payroll runs newest month first
  for (const r of (await db.query("select key, data from state_singletons")).rows) if ((SINGLETONS as readonly string[]).includes(r.key)) world[r.key] = r.data;
  world.journal = (await db.query("select number, id, entry_date::text as date, memo, source, type, posted_by from journal_entries order by ord")).rows.map((r) => ({ id: r.id, number: r.number, date: r.date, memo: r.memo, source: r.source, type: r.type, lines: [] as unknown[], postedBy: r.posted_by }));
  const byNumber = new Map((world.journal as { number: string; lines: unknown[] }[]).map((j) => [j.number, j]));
  for (const l of (await db.query("select entry_number, account, debit, credit from journal_lines order by entry_number, line_no")).rows) byNumber.get(l.entry_number)?.lines.push({ account: l.account, debit: l.debit, credit: l.credit });
  world.audit = (await db.query("select data from audit_log order by ord desc")).rows.map((r) => r.data);
  world.stock = new Map((await db.query("select product_id, warehouse_id, on_hand, reserved, value, ema, incoming from stock_levels")).rows.map((r) => [`${r.product_id}|${r.warehouse_id}`, { on: r.on_hand, res: r.reserved, val: r.value, ema: r.ema, incoming: r.incoming }]));
  return base;
}
