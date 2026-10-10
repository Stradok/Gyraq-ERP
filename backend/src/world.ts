// The authoritative business state. Booted from the seed (pinned to a stored anchor date) plus every command in Postgres.
import { pool } from "./db";
import { Projector } from "./project";
import { buildDB, execute, replay, runOn, setWorldResolver, todayPK, type CommandRecord, type CommandType, type DB, type Role } from "./engine";
import type { Problem } from "../../frontend/src/lib/engine/core";

export let world: DB;
const projector = new Projector();
setWorldResolver(() => world);

function rowToRecord(r: Record<string, unknown>): CommandRecord {
  return { id: r.id as string, type: r.type as CommandType, payload: r.payload, at: (r.at as Date).toISOString(), date: String(r.business_date instanceof Date ? (r.business_date as Date).toLocaleDateString("en-CA") : r.business_date), actor: r.actor as string, role: r.role as Role, source: r.source as "user" | "ai_proposal" };
}
export async function commandsSince(seq: number): Promise<(CommandRecord & { seq: number })[]> {
  const { rows } = await pool.query("select seq, id, type, payload, actor, role, business_date::text as business_date, at, source from commands where seq > $1 order by seq", [seq]);
  return rows.map((r) => ({ ...rowToRecord({ ...r, business_date: r.business_date }), date: r.business_date as string, seq: Number(r.seq) }));
}

export async function boot() {
  let anchor = (await pool.query("select value from meta where key='anchor'")).rows[0]?.value as string | undefined;
  const fresh = !anchor;
  if (!anchor) { anchor = todayPK(); await pool.query("insert into meta(key,value) values ('anchor',$1)", [anchor]); }
  world = buildDB(anchor);
  const log = await commandsSince(0);
  const r = replay(world, log);
  if (r.skipped) console.warn(`replay: ${r.skipped} stored commands were rejected on replay (code changed since they ran?)`);
  const projected = (await pool.query("select value from meta where key='projected'")).rows[0];
  const c = await pool.connect();
  try {
    if (fresh || !projected) { await c.query("begin"); await projector.full(c, world); await c.query("insert into meta(key,value) values ('projected','1') on conflict (key) do update set value='1'"); await c.query("commit"); console.log("seed written to Postgres"); }
    else projector.adopt(world);
  } catch (e) { await c.query("rollback"); throw e; } finally { c.release(); }
  console.log(`world ready: anchor ${anchor}, ${log.length} stored commands`);
}

let chain: Promise<unknown> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => { const p = chain.then(fn, fn); chain = p.catch(() => undefined); return p; };

export type Outcome = { ok: true; rec: CommandRecord & { seq: number }; value: unknown; message?: string } | { ok: false; error: Problem };

/** Run one command: execute on the live state, then persist it and its effects atomically. */
export function submit(actor: { name: string; role: Role }, type: CommandType, payload: unknown, source: "user" | "ai_proposal"): Promise<Outcome> {
  return serial(async () => {
    const seq = Number((await pool.query("select nextval('command_seq') as n")).rows[0].n);
    const rec = { id: `s${seq}`, type, payload, at: new Date().toISOString(), date: world.today, actor: actor.name, role: actor.role, source } satisfies CommandRecord;
    const res = execute(world, rec);
    if (!res.ok) return { ok: false, error: res.error } as Outcome;
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("insert into commands(seq,id,type,payload,actor,role,business_date,at,source,message) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [seq, rec.id, type, JSON.stringify(payload), rec.actor, rec.role, rec.date, rec.at, source, res.message ?? null]);
      await projector.delta(c, world);
      await c.query("commit");
    } catch (e) {
      await c.query("rollback").catch(() => undefined);
      await boot(); // memory is ahead of the database: rebuild it from what was committed
      throw e;
    } finally { c.release(); }
    return { ok: true, rec: { ...rec, seq }, value: res.value, message: res.message } as Outcome;
  });
}

export async function resetWorld() {
  await pool.query("drop schema public cascade; create schema public;");
}
export { runOn };
