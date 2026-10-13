// The authoritative business state. Booted from the seed (pinned to a stored anchor date) plus every command in Postgres.
import { pool } from "./db";
import type pg from "pg";
import { hydrate } from "./hydrate";
import { reconcile, type Inconsistency } from "./integrity";
import { TABLES } from "./state-schema";
import { Projector } from "./project";
import { StateWriter } from "./state";
import { TOUCHES } from "../../frontend/src/lib/engine/touches";
import { config } from "./config";
import { log as logger } from "./log";
import { buildDB, buildEmptyDB, execute, replay, runOn, setWorldResolver, todayPK, type CommandRecord, type CommandType, type DB, type Role } from "./engine";
import type { Problem } from "../../frontend/src/lib/engine/core";

export let world: DB;
export let mode: "demo" | "empty" = "demo";
const projector = new Projector();
const state = new StateWriter();
const ENGINE_VERSION = process.env.ENGINE_VERSION ?? process.env.GIT_SHA ?? "dev";
setWorldResolver(() => world);

function rowToRecord(r: Record<string, unknown>): CommandRecord {
  return { id: r.id as string, type: r.type as CommandType, payload: r.payload, at: (r.at as Date).toISOString(), date: String(r.business_date instanceof Date ? (r.business_date as Date).toLocaleDateString("en-CA") : r.business_date), actor: r.actor as string, role: r.role as Role, source: r.source as "user" | "ai_proposal" };
}
export async function commandsSince(seq: number): Promise<(CommandRecord & { seq: number })[]> {
  const { rows } = await pool.query("select seq, id, type, payload, actor, role, business_date::text as business_date, at, source from commands where seq > $1 order by seq", [seq]);
  return rows.map((r) => ({ ...rowToRecord({ ...r, business_date: r.business_date }), date: r.business_date as string, seq: Number(r.seq) }));
}

export let readOnly: { problems: Inconsistency[] } | null = null; // set when the books fail their own checks; commands are refused

const meta = async (key: string) => (await pool.query("select value from meta where key=$1", [key])).rows[0]?.value as string | undefined;
const setMeta = (c: { query: typeof pool.query }, key: string, value: string) => c.query("insert into meta(key,value) values ($1,$2) on conflict (key) do update set value=excluded.value", [key, value]);

/** The state as the command log says it is: the seed (or an empty company) plus every stored command re-executed. */
async function buildByReplay(anchor: string): Promise<{ db: DB; commands: number }> {
  const db = mode === "empty" ? buildEmptyDB(anchor) : buildDB(anchor);
  const log = await commandsSince(0);
  const r = replay(db, log);
  if (r.skipped) logger.warn("replay_rejected_commands", { skipped: r.skipped, hint: "the engine rules changed since these commands ran" });
  return { db, commands: log.length };
}

/** Write the whole state to every table (legacy mirror, ledger, audit, stock and the typed state tables). */
async function persistAll(c: pg.PoolClient, db: DB) {
  await projector.full(c, db); await state.truncateAll(c); await state.write(c, db);
  projector.adopt(db); state.adopt(db);
}

export async function boot() {
  let anchor = await meta("anchor");
  const fresh = !anchor;
  if (!anchor) { anchor = todayPK(); await pool.query("insert into meta(key,value) values ('anchor',$1)", [anchor]); }
  const stored = await meta("mode");
  mode = stored === "empty" || stored === "demo" ? stored : config.companyMode;
  if (!stored) await pool.query("insert into meta(key,value) values ('mode',$1)", [mode]);
  const source = await meta("state_source");
  if (config.stateSource === "tables" && !fresh && source !== "tables") throw new Error("STATE_SOURCE=tables, but this database has not been moved to the state tables yet. Back it up, then run: pnpm migrate:state");

  const c = await pool.connect();
  let commands = 0;
  try {
    if (config.stateSource === "tables" && !fresh) {
      world = await hydrate(pool, anchor, (await meta("start")) ?? anchor);
      projector.adopt(world); state.adopt(world);
    } else {
      const built = await buildByReplay(anchor); world = built.db; commands = built.commands;
      const projected = await meta("projected");
      await c.query("begin");
      if (fresh || !projected) { await persistAll(c, world); await setMeta(c, "projected", "1"); await setMeta(c, "start", world.start); if (config.stateSource === "tables") await setMeta(c, "state_source", "tables"); logger.info("seed_written"); }
      else {
        projector.adopt(world);
        if (!(await state.hasData(c))) { await state.write(c, world); logger.info("state_tables_backfilled"); } else state.adopt(world);
        if (!(await meta("start"))) await setMeta(c, "start", world.start);
      }
      await c.query("commit");
    }
  } catch (e) { await c.query("rollback").catch(() => undefined); throw e; } finally { c.release(); }

  const problems = reconcile(world);
  readOnly = problems.length ? { problems } : null;
  if (problems.length) logger.error("integrity_failed", { problems }); else logger.info("integrity_ok");
  logger.info("world_ready", { anchor, mode, source: config.stateSource === "tables" && !fresh ? "tables" : "replay", commands });
}

/** The whole company state as plain JSON plus the log position it corresponds to, taken between commands so the two always match. */
export function snapshot(): Promise<{ seq: number; state: Record<string, unknown> }> {
  return serial(async () => {
    const seq = Number((await pool.query("select coalesce(max(seq),0) n from commands")).rows[0].n);
    const state = Object.fromEntries(Object.entries(world).map(([k, v]) => [k, v instanceof Map ? [...v] : v]));
    return { seq, state };
  });
}

/** One-time move of a database from replay to the state tables. Writes nothing when `dryRun`. */
export async function migrateState(dryRun: boolean): Promise<{ commands: number; documents: number; problems: Inconsistency[]; moved: boolean }> {
  const anchor = await meta("anchor"); if (!anchor) throw new Error("This database has no company yet; nothing to move.");
  const stored = await meta("mode"); mode = stored === "empty" ? "empty" : "demo";
  const { db, commands } = await buildByReplay(anchor);
  const documents = TABLES.reduce((n, t) => n + (db[t.collection] as unknown[]).length, 0);
  const problems = reconcile(db);
  if (dryRun || problems.length) return { commands, documents, problems, moved: false };
  const c = await pool.connect();
  try {
    await c.query("begin"); await persistAll(c, db);
    await setMeta(c, "start", db.start); await setMeta(c, "projected", "1"); await setMeta(c, "state_source", "tables"); await setMeta(c, "state_migrated_at", new Date().toISOString());
    await c.query("commit");
  } catch (e) { await c.query("rollback").catch(() => undefined); throw e; } finally { c.release(); }
  return { commands, documents, problems, moved: true };
}

let chain: Promise<unknown> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => { const p = chain.then(fn, fn); chain = p.catch(() => undefined); return p; };

export type Outcome = { ok: true; rec: CommandRecord & { seq: number }; value: unknown; message?: string } | { ok: false; error: Problem; status?: number };
export interface ClientStamp { id?: string; at?: string; baseSeq?: number }

/** Run one command: execute on the live state, then persist it and its effects atomically. */
export function submit(actor: { name: string; role: Role }, type: CommandType, payload: unknown, source: "user" | "ai_proposal", stamp: ClientStamp = {}): Promise<Outcome> {
  return serial(async () => {
    if (readOnly) return { ok: false, status: 503, error: { code: "INTEGRITY", title: "Changes are paused", detail: "The books failed an automatic consistency check, so no new changes are accepted until it is looked at.", recovery: "Tell the system administrator. Details are in GET /api/health/integrity." } } as Outcome;
    // The browser already ran this command on its own copy using the same engine; it sends its command id and time so both
    // copies produce identical ids. It also says how much of the log it had seen: if others wrote since, it must resync first.
    const head = Number((await pool.query("select coalesce(max(seq),0) as n from commands")).rows[0].n);
    if (stamp.baseSeq !== undefined && stamp.baseSeq < head) return { ok: false, status: 409, error: { code: "STALE", title: "Someone else changed the data", detail: "Your screen was behind the latest changes.", recovery: "Your view has been refreshed. Please try again." } } as Outcome;
    if (stamp.id && (await pool.query("select 1 from commands where id=$1", [stamp.id])).rowCount) return { ok: false, status: 409, error: { code: "DUPLICATE_COMMAND", title: "Already applied", detail: "This action was already saved.", recovery: "Nothing to do." } } as Outcome;
    const seq = Number((await pool.query("select nextval('command_seq') as n")).rows[0].n);
    const at = stamp.at && Math.abs(Date.parse(stamp.at) - Date.now()) < 86_400_000 ? new Date(stamp.at).toISOString() : new Date().toISOString();
    const rec = { id: stamp.id ?? `s${seq}`, type, payload, at, date: world.today, actor: actor.name, role: actor.role, source } satisfies CommandRecord;
    const res = execute(world, rec);
    if (!res.ok) return { ok: false, error: res.error } as Outcome;
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("insert into commands(seq,id,type,payload,actor,role,business_date,at,source,message,engine_version) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [seq, rec.id, type, JSON.stringify(payload), rec.actor, rec.role, rec.date, rec.at, source, res.message ?? null, ENGINE_VERSION]);
      const only = new Set<string>(TOUCHES[type]);
      await projector.delta(c, world, only);
      await state.write(c, world, only);
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
