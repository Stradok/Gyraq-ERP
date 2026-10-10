"use client";
// UI preferences + the command log. The log is the demo's database: every action is a command (lib/engine) that is
// replayed onto the seeded data on load. A real backend replaces the log with API calls (docs/MIGRATION.md).
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Role } from "./rbac";
import type { CommandRecord } from "./engine/commands";

export interface RecentItem { href: string; title: string }

export interface SavedView { label: string; filters: Record<string, string>; search: string }

interface State {
  user: { id: string; email: string; name: string; title: string; role: Role; emp: string } | null;
  role: Role;
  collapsed: boolean;
  favorites: RecentItem[];
  recents: RecentItem[];
  dismissed: string[];
  dismissReasons: Record<string, string>;
  readNotifs: string[];
  actedRecs: Record<string, "accepted" | "dismissed">;
  mutedTypes: string[];
  savedViews: Record<string, SavedView[]>;
  history: { id: string; q: string; at: string }[];
  commands: CommandRecord[];
  cmdSeq: number;
  anchor: string; // business date the log was recorded against; the seed shifts daily, so the log expires with it
  setRole: (r: Role) => void;
  toggleCollapsed: () => void;
  toggleFavorite: (i: RecentItem) => void;
  visit: (i: RecentItem) => void;
  dismiss: (id: string, reason?: string) => void;
  markRead: (ids: string[]) => void;
  actRec: (id: string, v: "accepted" | "dismissed") => void;
  toggleMuted: (k: string) => void;
  saveView: (table: string, v: SavedView) => void;
  deleteView: (table: string, label: string) => void;
  addHistory: (q: string) => void;
  reset: () => void;
}

const initial = { user: null as State["user"], role: "owner" as Role, collapsed: false, favorites: [], recents: [], dismissed: [], dismissReasons: {} as Record<string, string>, readNotifs: [], actedRecs: {}, mutedTypes: [] as string[], savedViews: {} as Record<string, SavedView[]>, history: [] as { id: string; q: string; at: string }[], commands: [] as CommandRecord[], cmdSeq: 0, anchor: "" };

export const useERP = create<State>()(
  persist(
    (set) => ({
      ...initial,
      setRole: (role) => set({ role }),
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
      toggleFavorite: (i) => set((s) => ({ favorites: s.favorites.some((f) => f.href === i.href) ? s.favorites.filter((f) => f.href !== i.href) : [...s.favorites, i].slice(-8) })),
      visit: (i) => set((s) => ({ recents: [i, ...s.recents.filter((r) => r.href !== i.href)].slice(0, 8) })),
      dismiss: (id, reason) => set((s) => ({ dismissed: [...s.dismissed, id], dismissReasons: reason ? { ...s.dismissReasons, [id]: reason } : s.dismissReasons })),
      markRead: (ids) => set((s) => ({ readNotifs: [...new Set([...s.readNotifs, ...ids])] })),
      actRec: (id, v) => set((s) => ({ actedRecs: { ...s.actedRecs, [id]: v } })),
      toggleMuted: (k) => set((s) => ({ mutedTypes: s.mutedTypes.includes(k) ? s.mutedTypes.filter((x) => x !== k) : [...s.mutedTypes, k] })),
      saveView: (t, v) => set((s) => ({ savedViews: { ...s.savedViews, [t]: [...(s.savedViews[t] ?? []).filter((x) => x.label !== v.label), v] } })),
      deleteView: (t, label) => set((s) => ({ savedViews: { ...s.savedViews, [t]: (s.savedViews[t] ?? []).filter((x) => x.label !== label) } })),
      addHistory: (q) => set((s) => ({ history: [{ id: String(Date.now()), q, at: new Date().toISOString() }, ...s.history.filter((h) => h.q !== q)].slice(0, 12) })),
      reset: () => set({ ...initial }),
    }),
    { name: "meridian-demo-v2", storage: createJSONStorage(() => localStorage), skipHydration: true },
  ),
);

/** Bumped after every command so pages re-read the mutated data. Not persisted. */
export const useWorld = create<{ version: number; ready: boolean; bump: () => void; setReady: () => void }>((set) => ({ version: 0, ready: false, bump: () => set((s) => ({ version: s.version + 1 })), setReady: () => set({ ready: true }) }));
