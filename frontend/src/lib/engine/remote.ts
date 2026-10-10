"use client";
// Remote mode: the browser keeps a copy of the business state (seed + command log) and the server is the authority.
// A command runs locally first, so the screen updates instantly, then is sent with the same id/time so both copies derive
// identical ids. If the server says we were behind or rejects it, we rebuild from the server's log.
import { toast } from "sonner";
import { getDB, setAnchor } from "../data/sim";
import { useERP, useWorld } from "../store";
import type { Role } from "../rbac";
import { execute, replay, type CommandRecord } from "./commands";

export const API = process.env.NEXT_PUBLIC_API_URL ?? "";
export const remote = !!API;
export interface SessionUser { id: string; email: string; name: string; title: string; role: Role }

const TOKEN = "meridian-token", USER = "meridian-user";
const safe = <T,>(fn: () => T, d: T): T => { try { return fn(); } catch { return d; } };
export const getToken = () => safe(() => localStorage.getItem(TOKEN), null);
export const getUser = (): SessionUser | null => safe(() => JSON.parse(localStorage.getItem(USER) ?? "null"), null);
export function signOut() { safe(() => { localStorage.removeItem(TOKEN); localStorage.removeItem(USER); }, undefined); window.location.href = `${basePath()}/login`; }
const basePath = () => process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export async function login(email: string, password: string): Promise<string | null> {
  const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) }).catch(() => null);
  if (!r) return "Can't reach the server. Is it running?";
  const b = await r.json().catch(() => ({}));
  if (!r.ok) return b.error ?? "Sign-in failed.";
  safe(() => { localStorage.setItem(TOKEN, b.token); localStorage.setItem(USER, JSON.stringify(b.user)); }, undefined);
  return null;
}

const state = { lastSeq: 0, applied: new Set<string>(), inflight: 0, timer: 0 as unknown as ReturnType<typeof setInterval> | 0 };
type Stored = CommandRecord & { seq: number };
const auth = () => ({ "content-type": "application/json", authorization: `Bearer ${getToken() ?? ""}` });

/** Fetch the log and rebuild the local state from it. Returns false if the session is no longer valid. */
export async function loadRemoteWorld(): Promise<boolean> {
  const r = await fetch(`${API}/api/bootstrap`, { headers: auth() }).catch(() => null);
  if (!r) { toast.error("Can't reach the server"); return true; }
  if (r.status === 401) return false;
  const b = (await r.json()) as { anchor: string; commands: Stored[]; session: { role: Role } };
  setAnchor(b.anchor);
  const db = getDB();
  state.applied = new Set(); state.lastSeq = 0;
  replay(db, b.commands);
  for (const c of b.commands) { state.applied.add(c.id); state.lastSeq = Math.max(state.lastSeq, c.seq); }
  useERP.setState({ role: b.session.role });
  useWorld.getState().setReady(); useWorld.getState().bump();
  return true;
}

async function resync(reason?: string) {
  state.inflight = 0;
  await loadRemoteWorld();
  if (reason) toast.warning(reason);
}

/** Send a command that already ran locally. */
export function pushCommand(rec: CommandRecord) {
  state.applied.add(rec.id); state.inflight++;
  void fetch(`${API}/api/commands`, { method: "POST", headers: auth(), body: JSON.stringify({ ...rec, baseSeq: state.lastSeq }) })
    .then(async (r) => {
      const b = await r.json().catch(() => ({}));
      if (r.ok && b.ok) { state.lastSeq = Math.max(state.lastSeq, b.rec.seq); return; }
      if (r.status === 401) { signOut(); return; }
      await resync(r.status === 409 ? "Someone else changed the data. Your screen was refreshed; please repeat your action." : `The server didn't accept that: ${b.error?.title ?? r.status}. Your screen was refreshed.`);
    })
    .catch(() => resync("Lost contact with the server. Your screen was refreshed."))
    .finally(() => { state.inflight = Math.max(0, state.inflight - 1); });
}

/** Pick up what other people did. Paused while our own commands are in flight so the order stays the server's order. */
export function startPolling() {
  if (state.timer) return;
  state.timer = setInterval(async () => {
    if (state.inflight || document.hidden) return;
    const r = await fetch(`${API}/api/commands?since=${state.lastSeq}`, { headers: auth() }).catch(() => null);
    if (!r?.ok) return;
    const { commands } = (await r.json()) as { commands: Stored[] };
    const fresh = commands.filter((c) => !state.applied.has(c.id));
    if (state.inflight) return;
    const db = getDB();
    for (const c of fresh) { execute(db, c); state.applied.add(c.id); }
    for (const c of commands) state.lastSeq = Math.max(state.lastSeq, c.seq);
    if (fresh.length) useWorld.getState().bump();
  }, 4000);
}
