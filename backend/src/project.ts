// Ledger, audit and stock tables: after each command, write what changed inside the same transaction as the command row.
// Journal and audit are append-only. (Documents live in the typed state tables, see state.ts.)
import { createHash } from "node:crypto";
import type pg from "pg";
import type { DB } from "./engine";

const digest = (v: unknown) => createHash("sha1").update(JSON.stringify(v)).digest("hex");

export class Projector {
  private accountsSynced = false;
  private journal = new Set<string>();
  private audit = new Set<string>();
  private stock = new Map<string, string>();

  /** Remember what is already in the database, without writing (used after a restart). */
  adopt(db: DB) {
    this.journal = new Set(db.journal.map((j) => j.number)); this.audit = new Set(db.audit.map((a) => a.id));
    this.stock = new Map([...db.stock].map(([k, c]) => [k, digest(c)]));
  }

  /** Write every row (first start, or repair). */
  async full(c: pg.PoolClient, db: DB) {
    await c.query("truncate stock_levels, journal_lines, journal_entries, accounts, audit_log cascade");
    this.accountsSynced = false; this.journal = new Set(); this.audit = new Set(); this.stock = new Map();
    await this.delta(c, db);
  }

  async delta(c: pg.PoolClient, db: DB, only?: ReadonlySet<string>) {
    // accounts rarely change; keep them in sync by upsert on first sight
    if (!this.accountsSynced) {
      await c.query("insert into accounts(code,name,type,grp) select * from unnest($1::text[],$2::text[],$3::text[],$4::text[]) on conflict (code) do update set name=excluded.name", [db.accounts.map((a) => a.code), db.accounts.map((a) => a.name), db.accounts.map((a) => a.type), db.accounts.map((a) => a.group)]);
      this.accountsSynced = true;
    }
    // ledger (append-only)
    const newJ = only && !only.has("journal") ? [] : db.journal.filter((j) => !this.journal.has(j.number));
    for (let i = 0; i < newJ.length; i += 1000) {
      const part = newJ.slice(i, i + 1000);
      await c.query("insert into journal_entries(number,entry_date,memo,source,type,posted_by,id) select * from unnest($1::text[],$2::date[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[])", [part.map((j) => j.number), part.map((j) => j.date), part.map((j) => j.memo), part.map((j) => j.source), part.map((j) => j.type), part.map((j) => j.postedBy), part.map((j) => j.id)]);
      const L = part.flatMap((j) => j.lines.map((l, n) => ({ e: j.number, n: n + 1, ...l })));
      for (let k = 0; k < L.length; k += 5000) {
        const lp = L.slice(k, k + 5000);
        await c.query("insert into journal_lines(entry_number,line_no,account,debit,credit) select * from unnest($1::text[],$2::int[],$3::text[],$4::numeric[],$5::numeric[])", [lp.map((l) => l.e), lp.map((l) => l.n), lp.map((l) => l.account), lp.map((l) => l.debit), lp.map((l) => l.credit)]);
      }
      part.forEach((j) => this.journal.add(j.number));
    }
    // audit (append-only)
    const newA = only && !only.has("audit") ? [] : db.audit.filter((a) => !this.audit.has(a.id)).reverse(); // oldest first: audit is newest-first in memory, and `ord` rebuilds that order
    for (let i = 0; i < newA.length; i += 2000) {
      const p = newA.slice(i, i + 2000);
      await c.query("insert into audit_log(id,at,actor,action,entity,ref,source,detail,data) select * from unnest($1::text[],$2::timestamptz[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],$9::jsonb[]) on conflict (id) do nothing", [p.map((a) => a.id), p.map((a) => a.at), p.map((a) => a.actor), p.map((a) => a.action), p.map((a) => a.entity), p.map((a) => a.ref), p.map((a) => a.source), p.map((a) => a.detail ?? null), p.map((a) => JSON.stringify(a))]);
      p.forEach((a) => this.audit.add(a.id));
    }
    // stock
    const ch = only && !only.has("stock") ? [] : [...db.stock].filter(([k, cell]) => this.stock.get(k) !== digest(cell));
    for (let i = 0; i < ch.length; i += 3000) {
      const p = ch.slice(i, i + 3000);
      await c.query("insert into stock_levels(product_id,warehouse_id,on_hand,reserved,value,ema,incoming) select * from unnest($1::text[],$2::text[],$3::numeric[],$4::numeric[],$5::numeric[],$6::numeric[],$7::numeric[]) on conflict (product_id,warehouse_id) do update set on_hand=excluded.on_hand, reserved=excluded.reserved, value=excluded.value, ema=excluded.ema, incoming=excluded.incoming", [p.map(([k]) => k.split("|")[0]), p.map(([k]) => k.split("|")[1]), p.map(([, v]) => v.on), p.map(([, v]) => v.res), p.map(([, v]) => v.val), p.map(([, v]) => v.ema), p.map(([, v]) => v.incoming)]);
      p.forEach(([k, v]) => this.stock.set(k, digest(v)));
    }
  }
}
