// Writes company state into the typed tables defined in state-schema.ts. Only collections that changed are visited, and within a
// collection only documents whose content changed are written. Runs inside the same transaction as the command row.
import { createHash } from "node:crypto";
import type pg from "pg";
import type { DB } from "./engine";
import { SINGLETONS, TABLES, type TableSpec } from "./state-schema";

const sha = (s: string) => createHash("sha1").update(s).digest("hex");
const arrType = (t: string) => (t === "date" ? "date[]" : t.startsWith("numeric") ? "numeric[]" : t === "integer" ? "integer[]" : t === "boolean" ? "boolean[]" : "text[]");
const cell = (type: string, v: unknown) => {
  if (v === undefined || v === null || v === "") return type === "text" ? (v === "" ? "" : null) : null;
  if (type.startsWith("numeric") || type === "integer") return Number.isFinite(Number(v)) ? Number(v) : null;
  return v;
};

export class StateWriter {
  private seen = new Map<string, Map<string, string>>(); // table -> id -> hash of data last written
  private singles = new Map<string, string>();

  private ensure(table: string) { return this.seen.get(table) ?? this.seen.set(table, new Map()).get(table)!; }

  /** Remember what the tables already hold (after a restart that read them, or after a full write). */
  adopt(db: DB) {
    for (const t of TABLES) { const m = this.ensure(t.table); m.clear(); for (const d of db[t.collection] as unknown as Record<string, unknown>[]) m.set(t.id(d), sha(JSON.stringify(d))); }
    for (const k of SINGLETONS) this.singles.set(k, sha(JSON.stringify(db[k])));
  }

  async write(c: pg.PoolClient, db: DB, only?: ReadonlySet<string>) {
    for (const t of TABLES) if (!only || only.has(t.collection)) await this.writeTable(c, t, db[t.collection] as unknown as Record<string, unknown>[]);
    for (const k of SINGLETONS) if (!only || only.has(k)) {
      const json = JSON.stringify(db[k]), h = sha(json);
      if (this.singles.get(k) === h) continue;
      await c.query("insert into state_singletons(key,data) values ($1,$2) on conflict (key) do update set data=excluded.data, version=state_singletons.version+1, updated_at=now()", [k, json]);
      this.singles.set(k, h);
    }
  }

  private async writeTable(c: pg.PoolClient, t: TableSpec, docs: Record<string, unknown>[]) {
    const seen = this.ensure(t.table), ids = new Set<string>(), rows: { id: string; json: string; doc: Record<string, unknown>; h: string }[] = [];
    for (const doc of docs) {
      const id = t.id(doc); ids.add(id);
      const json = JSON.stringify(doc), h = sha(json);
      if (seen.get(id) !== h) rows.push({ id, json, doc, h });
    }
    for (let i = 0; i < rows.length; i += 1500) {
      const part = rows.slice(i, i + 1500);
      const cols = t.columns.map((x) => x.name);
      const params: unknown[] = [part.map((r) => r.id), ...t.columns.map((x) => part.map((r) => cell(x.type, x.get(r.doc)))), part.map((r) => r.json)];
      const select = ["$1::text[]", ...t.columns.map((x, k) => `$${k + 2}::${arrType(x.type)}`), `$${t.columns.length + 2}::jsonb[]`].join(", ");
      const names = ["id", ...cols, "data"];
      const set = [...cols, "data"].map((n) => `${n}=excluded.${n}`).join(", ");
      await c.query(`insert into ${t.table}(${names.join(",")}) select * from unnest(${select}) on conflict (id) do update set ${set}, version=${t.table}.version+1, updated_at=now()`, params);
      part.forEach((r) => seen.set(r.id, r.h));
    }
    const gone = [...seen.keys()].filter((id) => !ids.has(id));
    if (gone.length) { await c.query(`delete from ${t.table} where id = any($1)`, [gone]); gone.forEach((id) => seen.delete(id)); }
  }

  async hasData(c: pg.PoolClient): Promise<boolean> {
    return !!(await c.query("select 1 from state_singletons limit 1")).rowCount;
  }
  async truncateAll(c: pg.PoolClient) {
    await c.query(`truncate ${TABLES.map((t) => t.table).join(", ")}, state_singletons cascade`);
    this.seen.clear(); this.singles.clear();
  }
}
