"use client";
// UI preferences + the command log. The log is the demo's database: every action is a command (lib/engine) that is
// replayed onto the seeded data on load. A real backend replaces the log with API calls (docs/MIGRATION.md).
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Role } from "./rbac";
import type { CommandRecord } from "./engine/commands";

export interface RecentItem { href: string; title: string }

interface State {
  role: Role;
  collapsed: boolean;
  favorites: RecentItem[];
  recents: RecentItem[];
  dismissed: string[];
  readNotifs: string[];
  actedRecs: Record<string, "accepted" | "dismissed">;
  mutedTypes: string[];
  history: { id: string; q: string; at: string }[];
  commands: CommandRecord[];
  cmdSeq: number;
  anchor: string; // business date the log was recorded against; the seed shifts daily, so the log expires with it
  setRole: (r: Role) => void;
  toggleCollapsed: () => void;
  toggleFavorite: (i: RecentItem) => void;
  visit: (i: RecentItem) => void;
  dismiss: (id: string) => void;
  markRead: (ids: string[]) => void;
  actRec: (id: string, v: "accepted" | "dismissed") => void;
  toggleMuted: (k: string) => void;
  addHistory: (q: string) => void;
  reset: () => void;
}

const initial = { role: "owner" as Role, collapsed: false, favorites: [], recents: [], dismissed: [], readNotifs: [], actedRecs: {}, mutedTypes: [] as string[], history: [] as { id: string; q: string; at: string }[], commands: [] as CommandRecord[], cmdSeq: 0, anchor: "" };

export const useERP = create<State>()(
  persist(
    (set) => ({
      ...initial,
      setRole: (role) => set({ role }),
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
      toggleFavorite: (i) => set((s) => ({ favorites: s.favorites.some((f) => f.href === i.href) ? s.favorites.filter((f) => f.href !== i.href) : [...s.favorites, i].slice(-8) })),
      visit: (i) => set((s) => ({ recents: [i, ...s.recents.filter((r) => r.href !== i.href)].slice(0, 8) })),
      dismiss: (id) => set((s) => ({ dismissed: [...s.dismissed, id] })),
      markRead: (ids) => set((s) => ({ readNotifs: [...new Set([...s.readNotifs, ...ids])] })),
      actRec: (id, v) => set((s) => ({ actedRecs: { ...s.actedRecs, [id]: v } })),
      toggleMuted: (k) => set((s) => ({ mutedTypes: s.mutedTypes.includes(k) ? s.mutedTypes.filter((x) => x !== k) : [...s.mutedTypes, k] })),
      addHistory: (q) => set((s) => ({ history: [{ id: String(Date.now()), q, at: new Date().toISOString() }, ...s.history.filter((h) => h.q !== q)].slice(0, 12) })),
      reset: () => set({ ...initial }),
    }),
    { name: "meridian-demo-v2", storage: createJSONStorage(() => localStorage), skipHydration: true },
  ),
);

/** Bumped after every command so pages re-read the mutated data. Not persisted. */
export const useWorld = create<{ version: number; ready: boolean; bump: () => void; setReady: () => void }>((set) => ({ version: 0, ready: false, bump: () => set((s) => ({ version: s.version + 1 })), setReady: () => set({ ready: true }) }));
