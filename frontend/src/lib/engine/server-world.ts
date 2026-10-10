// Server-only: gives each request its own DB = fresh seed + the caller's replayed command log, so the assistant
// answers about what the user has actually done in this session. A real backend reads one shared database instead.
import { AsyncLocalStorage } from "node:async_hooks";
import { todayPK } from "../data/dates";
import { buildDB, buildEmptyDB, setWorldResolver, type DB } from "../data/sim";
import { replay, type CommandRecord } from "./commands";

const als = new AsyncLocalStorage<DB>();
setWorldResolver(() => als.getStore());

/** Build the caller's world once per request (undefined = use the shared seed). */
export function makeWorld(commands: CommandRecord[] | undefined, anchor: string | undefined): DB | undefined {
  if (!commands?.length || anchor !== todayPK()) return undefined;
  const db = buildDB();
  replay(db, commands.slice(-400));
  return db;
}
export function inWorld<T>(db: DB | undefined, fn: () => T): T { return db ? als.run(db, fn) : fn(); }

/** Remote mode: build the world from the backend's log (the caller's own session decides what they may read). */
export async function makeRemoteWorld(token: string | undefined): Promise<DB | undefined> {
  const api = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (!api || !token) return undefined;
  const r = await fetch(`${api}/api/bootstrap`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => null);
  if (!r?.ok) return undefined;
  const b = (await r.json()) as { anchor: string; mode?: string; commands: CommandRecord[] };
  const db = b.mode === "empty" ? buildEmptyDB(b.anchor) : buildDB(b.anchor);
  replay(db, b.commands);
  return db;
}
