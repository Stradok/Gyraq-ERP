// Projection: after each command, write what changed in the in-memory business state into Postgres tables,
// inside the same transaction as the command row. Journal and audit are append-only; documents are upserted.
import { createHash } from "node:crypto";
import type pg from "pg";
import type { DB } from "./engine";

type Doc = { id?: string; month?: string };
const COLLECTIONS = ["warehouses", "suppliers", "products", "customers", "employees", "quotes", "orders", "invoices", "creditNotes", "payments", "pos", "grns", "bills", "supplierPayments", "stockCounts", "expenses", "leaves", "payroll", "bank", "approvals", "notifications", "leads", "shipments", "transfers", "claims", "rules", "outbox"] as const;
const keyOf = (d: Doc) => d.id ?? d.month ?? "";
const digest = (v: unknown) => createHash("sha1").update(JSON.stringify(v)).digest("hex");

function docs(db: DB): Map<string, Map<string, { json: string; h: string }>> {
  const out = new Map<string, Map<string, { json: string; h: string }>>();
  const add = (kind: string, id: string, v: unknown) => { const json = JSON.stringify(v); (out.get(kind) ?? out.set(kind, new Map()).get(kind)!).set(id, { json, h: digest(json) }); };
  for (const k of COLLECTIONS) for (const d of db[k] as unknown as Doc[]) add(k, keyOf(d), d);
  add("settings", "main", db.settings); add("periodStatus", "main", db.periodStatus);
  return out;
}

export class Projector {
  private hashes = new Map<string, Map<string, string>>();
  private journal = new Set<string>();
  private audit = new Set<string>();
  private stock = new Map<string, string>();

  /** Remember what is already in the database, without writing (used after a restart). */
  adopt(db: DB) {
    this.hashes = new Map([...docs(db)].map(([k, m]) => [k, new Map([...m].map(([id, v]) => [id, v.h]))]));
    this.journal = new Set(db.journal.map((j) => j.number)); this.audit = new Set(db.audit.map((a) => a.id));
    this.stock = new Map([...db.stock].map(([k, c]) => [k, digest(c)]));
  }

  /** Write every row (first start, or repair). */
  async full(c: pg.PoolClient, db: DB) {
    await c.query("truncate records, stock_levels, journal_lines, journal_entries, accounts, audit_log cascade");
    this.hashes = new Map(); this.journal = new Set(); this.audit = new Set(); this.stock = new Map();
    await this.delta(c, db);
  }

  async delta(c: pg.PoolClient, db: DB) {
    // accounts rarely change; keep them in sync by upsert on first sight
    if (!this.hashes.has("__accounts")) {
      await c.query("insert into accounts(code,name,type,grp) select * from unnest($1::text[],$2::text[],$3::text[],$4::text[]) on conflict (code) do update set name=excluded.name", [db.accounts.map((a) => a.code), db.accounts.map((a) => a.name), db.accounts.map((a) => a.type), db.accounts.map((a) => a.group)]);
      this.hashes.set("__accounts", new Map());
    }
    // documents
    const now = docs(db);
    for (const [kind, m] of now) {
      const prev = this.hashes.get(kind) ?? new Map<string, string>();
      const up: [string, string][] = [];
      for (const [id, v] of m) if (prev.get(id) !== v.h) up.push([id, v.json]);
      for (let i = 0; i < up.length; i += 2000) {
        const part = up.slice(i, i + 2000);
        await c.query("insert into records(kind,id,data) select $1, * from unnest($2::text[], $3::jsonb[]) on conflict (kind,id) do update set data=excluded.data, updated_at=now()", [kind, part.map((x) => x[0]), part.map((x) => x[1])]);
      }
      const gone = [...prev.keys()].filter((id) => !m.has(id));
      if (gone.length) await c.query("delete from records where kind=$1 and id = any($2)", [kind, gone]);
      this.hashes.set(kind, new Map([...m].map(([id, v]) => [id, v.h])));
    }
    // ledger (append-only)
    const newJ = db.journal.filter((j) => !this.journal.has(j.number));
    for (let i = 0; i < newJ.length; i += 1000) {
      const part = newJ.slice(i, i + 1000);
      await c.query("insert into journal_entries(number,entry_date,memo,source,type,posted_by) select * from unnest($1::text[],$2::date[],$3::text[],$4::text[],$5::text[],$6::text[])", [part.map((j) => j.number), part.map((j) => j.date), part.map((j) => j.memo), part.map((j) => j.source), part.map((j) => j.type), part.map((j) => j.postedBy)]);
      const L = part.flatMap((j) => j.lines.map((l, n) => ({ e: j.number, n: n + 1, ...l })));
      for (let k = 0; k < L.length; k += 5000) {
        const lp = L.slice(k, k + 5000);
        await c.query("insert into journal_lines(entry_number,line_no,account,debit,credit) select * from unnest($1::text[],$2::int[],$3::text[],$4::numeric[],$5::numeric[])", [lp.map((l) => l.e), lp.map((l) => l.n), lp.map((l) => l.account), lp.map((l) => l.debit), lp.map((l) => l.credit)]);
      }
      part.forEach((j) => this.journal.add(j.number));
    }
    // audit (append-only)
    const newA = db.audit.filter((a) => !this.audit.has(a.id));
    for (let i = 0; i < newA.length; i += 2000) {
      const p = newA.slice(i, i + 2000);
      await c.query("insert into audit_log(id,at,actor,action,entity,ref,source,detail) select * from unnest($1::text[],$2::timestamptz[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[]) on conflict (id) do nothing", [p.map((a) => a.id), p.map((a) => a.at), p.map((a) => a.actor), p.map((a) => a.action), p.map((a) => a.entity), p.map((a) => a.ref), p.map((a) => a.source), p.map((a) => a.detail ?? null)]);
      p.forEach((a) => this.audit.add(a.id));
    }
    // stock
    const ch = [...db.stock].filter(([k, cell]) => this.stock.get(k) !== digest(cell));
    for (let i = 0; i < ch.length; i += 3000) {
      const p = ch.slice(i, i + 3000);
      await c.query("insert into stock_levels(product_id,warehouse_id,on_hand,reserved,value) select * from unnest($1::text[],$2::text[],$3::numeric[],$4::numeric[],$5::numeric[]) on conflict (product_id,warehouse_id) do update set on_hand=excluded.on_hand, reserved=excluded.reserved, value=excluded.value", [p.map(([k]) => k.split("|")[0]), p.map(([k]) => k.split("|")[1]), p.map(([, v]) => v.on), p.map(([, v]) => v.res), p.map(([, v]) => v.val)]);
      p.forEach(([k, v]) => this.stock.set(k, digest(v)));
    }
  }
}
