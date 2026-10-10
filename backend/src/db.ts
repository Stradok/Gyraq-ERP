import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config } from "./config";

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 8 });
pg.types.setTypeParser(1700, (v) => parseFloat(v)); // numeric → number (money is stored to 2 dp)

export async function migrate() {
  await pool.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
  const done = new Set((await pool.query("select name from schema_migrations")).rows.map((r) => r.name as string));
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    if (done.has(f)) continue;
    const c = await pool.connect();
    try {
      await c.query("begin"); await c.query(readFileSync(join(dir, f), "utf8")); await c.query("insert into schema_migrations(name) values ($1)", [f]); await c.query("commit");
      console.log(`migration applied: ${f}`);
    } catch (e) { await c.query("rollback"); throw e; } finally { c.release(); }
  }
}
