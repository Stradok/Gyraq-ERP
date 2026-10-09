"use client";
// Browser-side dispatcher: runs a command on the live DB, records it in the persisted log, tells the user what happened.
import { toast } from "sonner";
import { getDB } from "../data/sim";
import { PERSONAS } from "../rbac";
import { useERP, useWorld } from "../store";
import { execute, replay, type CommandInput, type CommandRecord, type CommandType } from "./commands";
import type { Problem, Result } from "./core";

export function showProblem(p: Problem) {
  toast.error(p.title, { description: `${p.detail} ${p.recovery}`, duration: 9000 });
}

/** Run a command. Returns the engine result; shows a toast either way unless `quiet`. */
export function run<T extends CommandType>(type: T, payload: CommandInput<T>, opts: { quiet?: boolean; source?: "user" | "ai_proposal" } = {}): Result<unknown> {
  const st = useERP.getState();
  const db = getDB();
  const actor = PERSONAS.find((p) => p.role === st.role)!.name;
  const seq = st.cmdSeq + 1;
  const rec: CommandRecord = { id: `c${seq}`, type, payload, at: new Date().toISOString(), date: db.today, actor, role: st.role, source: opts.source ?? "user" };
  const res = execute(db, rec);
  if (res.ok) {
    useERP.setState((s) => ({ commands: [...s.commands, rec].slice(-400), cmdSeq: seq, anchor: db.today }));
    useWorld.getState().bump();
    if (!opts.quiet && res.message) toast.success(res.message);
  } else if (!opts.quiet) showProblem(res.error);
  return res;
}

/** Re-apply the persisted log after a reload. A log recorded on another day is dropped: the seed moves with the calendar. */
const replayed = new WeakSet<object>();
export function replayAll() {
  const st = useERP.getState();
  const db = getDB();
  if (replayed.has(db)) return; // React strict mode runs effects twice; replay must be idempotent
  replayed.add(db);
  if (st.anchor && st.anchor !== db.today) { useERP.setState({ commands: [], cmdSeq: 0, anchor: "" }); toast.info("Demo data refreshed for today", { description: "Actions from earlier days were cleared." }); }
  else if (st.commands.length) replay(db, st.commands);
  useWorld.getState().setReady();
  useWorld.getState().bump();
}
