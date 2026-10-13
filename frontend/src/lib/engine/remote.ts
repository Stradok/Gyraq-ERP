"use client";
// Remote mode: the browser keeps a copy of the business state (seed + command log) and the server is the authority.
// A command runs locally first, so the screen updates instantly, then is sent with the same id/time so both copies derive
// identical ids. If the server says we were behind or rejects it, we rebuild from the server's log.
import { toast } from "sonner";
import { create } from "zustand";
import { adoptSnapshot, getDB, resetWorld, setAnchor } from "../data/sim";
import { useERP, useWorld } from "../store";
import type { Role } from "../rbac";
import { execute, replay, type CommandRecord } from "./commands";

export const API = process.env.NEXT_PUBLIC_API_URL ?? "";
export const remote = !!API;
export interface SessionUser { id: string; email: string; name: string; title: string; role: Role; emp: string }

const TOKEN = "meridian-token", USER = "meridian-user", OUTBOX = "meridian-outbox", WORLD = "meridian-world";
const safe = <T,>(fn: () => T, d: T): T => { try { return fn(); } catch { return d; } };
export const getToken = () => safe(() => localStorage.getItem(TOKEN), null);
export const getUser = (): SessionUser | null => safe(() => JSON.parse(localStorage.getItem(USER) ?? "null"), null);
export function signOut() { safe(() => { for (const k of [TOKEN, USER, OUTBOX, WORLD]) localStorage.removeItem(k); }, undefined); window.location.href = `${basePath()}/login`; }
const basePath = () => process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export async function login(email: string, password: string): Promise<string | null> {
  const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) }).catch(() => null);
  if (!r) return "Can't reach the server. Is it running?";
  const b = await r.json().catch(() => ({}));
  if (!r.ok) return b.error ?? "Sign-in failed.";
  safe(() => { localStorage.removeItem(OUTBOX); localStorage.removeItem(WORLD); localStorage.setItem(TOKEN, b.token); localStorage.setItem(USER, JSON.stringify(b.user)); }, undefined);
  return null;
}

/** Connection and unsent-change counters shown in the header. */
export const useSync = create<{ online: boolean; pending: number }>(() => ({ online: true, pending: 0 }));
const setOnline = (online: boolean) => { if (useSync.getState().online !== online) useSync.setState({ online }); };

const state = { lastSeq: 0, applied: new Set<string>(), flushing: false, timer: 0 as unknown as ReturnType<typeof setInterval> | 0, queue: [] as CommandRecord[] };
type Stored = CommandRecord & { seq: number };
type World = { anchor: string; today?: string; mode?: "demo" | "empty"; seq?: number; state?: Record<string, unknown>; commands: Stored[]; session: { role: Role } };
const auth = () => ({ "content-type": "application/json", authorization: `Bearer ${getToken() ?? ""}` });
const saveQueue = () => { safe(() => localStorage.setItem(OUTBOX, JSON.stringify(state.queue)), undefined); useSync.setState({ pending: state.queue.length }); };
const readQueue = (): CommandRecord[] => safe(() => JSON.parse(localStorage.getItem(OUTBOX) ?? "[]"), []);

/**
 * Rebuild the local state from the server's log (or, when the server can't be reached, from the copy saved on this device),
 * then re-apply changes that haven't reached the server yet so the screen still shows them.
 */
export async function loadRemoteWorld(): Promise<"ok" | "auth" | "offline"> {
  const r = await fetch(`${API}/api/bootstrap`, { headers: auth() }).catch(() => null);
  let b: World | null = null, live = false;
  if (r) {
    if (r.status === 401) return "auth";
    b = (await r.json()) as World; live = true; setOnline(true);
    safe(() => localStorage.setItem(WORLD, JSON.stringify(b)), undefined); // may exceed storage on very large logs; then we simply have no offline copy
  } else {
    setOnline(false);
    b = safe(() => JSON.parse(localStorage.getItem(WORLD) ?? "null") as World | null, null);
    if (!b) { toast.error("Can't reach the server, and nothing is saved on this device yet. Connect once to use the app offline."); return "offline"; }
  }
  resetWorld();
  if (b.state) adoptSnapshot(b.state, b.anchor, b.mode ?? "demo"); else setAnchor(b.anchor, b.mode ?? "demo");
  const db = getDB();
  if (b.today) db.today = b.today; // the real date; the seed anchor above only decides which sample data to build
  state.applied = new Set(); state.lastSeq = b.seq ?? 0;
  if (!b.state) replay(db, b.commands);
  for (const c of b.commands) { state.applied.add(c.id); state.lastSeq = Math.max(state.lastSeq, c.seq); }
  // changes made here that the server hasn't confirmed: run them again on top; drop any that no longer make sense
  state.queue = state.queue.length ? state.queue : readQueue();
  const keep: CommandRecord[] = [];
  for (const rec of state.queue) { if (state.applied.has(rec.id)) continue; const res = execute(db, rec); if (res.ok) { keep.push(rec); state.applied.add(rec.id); } else toast.warning(`A change made earlier could not be re-applied: ${res.error.title}`); }
  state.queue = keep; saveQueue();
  const u = getUser(); useERP.setState({ role: b.session.role, user: u ? { ...u, role: b.session.role } : null });
  useWorld.getState().setReady(); useWorld.getState().bump();
  return live ? "ok" : "offline";
}

/** Send queued commands in order. Stops quietly when the server can't be reached; they stay queued and are sent later. */
export async function flush() {
  if (state.flushing) return;
  state.flushing = true;
  try {
    while (state.queue.length) {
      const rec = state.queue[0]!;
      const r = await fetch(`${API}/api/commands`, { method: "POST", headers: auth(), body: JSON.stringify({ ...rec, baseSeq: state.lastSeq }) }).catch(() => null);
      if (!r) { setOnline(false); return; }
      setOnline(true);
      const b = await r.json().catch(() => ({}));
      if (r.ok && b.ok) { state.lastSeq = Math.max(state.lastSeq, b.rec.seq); state.queue.shift(); saveQueue(); continue; }
      if (r.status === 401) { signOut(); return; }
      if (r.status === 409 && b.error?.code === "DUPLICATE_COMMAND") { state.queue.shift(); saveQueue(); continue; }
      if (r.status === 409) { if ((await loadRemoteWorld()) !== "ok") return; continue; } // others wrote first: rebuild, then try again
      state.queue.shift(); saveQueue(); // the server refused it: drop it and show the server's version
      toast.error(`The server didn't accept a change: ${b.error?.title ?? r.status}`, { description: b.error?.detail });
      if ((await loadRemoteWorld()) !== "ok") return;
    }
  } finally { state.flushing = false; useSync.setState({ pending: state.queue.length }); }
}

/** A command that already ran on this screen: remember it and send it as soon as the server is reachable. */
export function pushCommand(rec: CommandRecord) {
  state.applied.add(rec.id); state.queue.push(rec); saveQueue(); void flush();
}

/** Fetch what other people did since our last position. */
async function pull() {
  if (state.queue.length) { void flush(); return; }
  if (state.flushing) return;
  const r = await fetch(`${API}/api/commands?since=${state.lastSeq}`, { headers: auth() }).catch(() => null);
  if (!r) { setOnline(false); return; }
  setOnline(true);
  if (!r.ok || state.queue.length) return;
  const { commands } = (await r.json()) as { commands: Stored[] };
  const fresh = commands.filter((c) => !state.applied.has(c.id));
  const db = getDB();
  for (const c of fresh) { execute(db, c); state.applied.add(c.id); }
  for (const c of commands) state.lastSeq = Math.max(state.lastSeq, c.seq);
  if (fresh.length) useWorld.getState().bump();
}

/** Live updates: the server keeps one stream open and says "the log is at N"; we then pull what we are missing. */
async function listen() {
  let wait = 1000;
  for (;;) {
    try {
      const r = await fetch(`${API}/api/stream`, { headers: auth() });
      if (r.status === 401) { signOut(); return; }
      if (!r.ok || !r.body) throw new Error("stream");
      wait = 1000; setOnline(true); void pull();
      const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) { const { value, done } = await reader.read(); if (done) break; buf += value; let i; while ((i = buf.indexOf("\n\n")) >= 0) { const msg = buf.slice(0, i); buf = buf.slice(i + 2); if (msg.includes("event: seq")) void pull(); } }
    } catch { setOnline(false); }
    await new Promise((res) => setTimeout(res, wait)); wait = Math.min(wait * 2, 30_000);
  }
}

/** Start syncing: live stream for instant updates, plus a slow timer that also retries queued changes and covers a stream that is down. */
export function startPolling() {
  if (state.timer) return;
  window.addEventListener("online", () => void flush());
  window.addEventListener("offline", () => setOnline(false));
  state.queue = readQueue(); useSync.setState({ pending: state.queue.length }); void flush();
  void listen();
  state.timer = setInterval(() => { if (!document.hidden) void pull(); }, 20_000);
}

/** Authenticated call to the API for non-command endpoints (user management). */
export async function apiJson<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const r = await fetch(`${API}${path}`, { method: init.method ?? "GET", headers: auth(), body: init.body === undefined ? undefined : JSON.stringify(init.body) }).catch(() => null);
  if (!r) return { ok: false, status: 0, data: { error: "Can't reach the server." } as T & { error?: string } };
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
}
