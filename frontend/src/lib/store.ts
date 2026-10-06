"use client";
// Client-side overlay on top of the deterministic dataset: user actions in the demo (approve, create PO, record payment…)
// persist in localStorage so the app behaves like a real system without a backend. Replaced by API calls later.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Role } from "./rbac";
import type { Approval, AuditEvent, CustomerPayment, PurchaseOrder, SalesOrder } from "./data/types";

export interface Decision { decision: "approved" | "rejected"; at: string; by: string; comment?: string }
export interface RecentItem { href: string; title: string }

interface State {
  role: Role;
  collapsed: boolean;
  favorites: RecentItem[];
  recents: RecentItem[];
  decisions: Record<string, Decision>;
  dismissed: string[];
  readNotifs: string[];
  extraPOs: PurchaseOrder[];
  extraOrders: SalesOrder[];
  extraPayments: CustomerPayment[];
  extraApprovals: Approval[];
  extraAudit: AuditEvent[];
  actedRecs: Record<string, "accepted" | "dismissed">;
  setRole: (r: Role) => void;
  toggleCollapsed: () => void;
  toggleFavorite: (i: RecentItem) => void;
  visit: (i: RecentItem) => void;
  decide: (id: string, d: Decision) => void;
  dismiss: (id: string) => void;
  markRead: (ids: string[]) => void;
  addPO: (po: PurchaseOrder, approval?: Approval) => void;
  addOrder: (o: SalesOrder) => void;
  addPayment: (p: CustomerPayment) => void;
  addAudit: (e: AuditEvent) => void;
  actRec: (id: string, v: "accepted" | "dismissed") => void;
  reset: () => void;
}

const initial = { role: "owner" as Role, collapsed: false, favorites: [], recents: [], decisions: {}, dismissed: [], readNotifs: [], extraPOs: [], extraOrders: [], extraPayments: [], extraApprovals: [], extraAudit: [], actedRecs: {} };

export const useERP = create<State>()(
  persist(
    (set) => ({
      ...initial,
      setRole: (role) => set({ role }),
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
      toggleFavorite: (i) => set((s) => ({ favorites: s.favorites.some((f) => f.href === i.href) ? s.favorites.filter((f) => f.href !== i.href) : [...s.favorites, i].slice(-8) })),
      visit: (i) => set((s) => ({ recents: [i, ...s.recents.filter((r) => r.href !== i.href)].slice(0, 8) })),
      decide: (id, d) => set((s) => ({ decisions: { ...s.decisions, [id]: d } })),
      dismiss: (id) => set((s) => ({ dismissed: [...s.dismissed, id] })),
      markRead: (ids) => set((s) => ({ readNotifs: [...new Set([...s.readNotifs, ...ids])] })),
      addPO: (po, approval) => set((s) => ({ extraPOs: [po, ...s.extraPOs], extraApprovals: approval ? [approval, ...s.extraApprovals] : s.extraApprovals })),
      addOrder: (o) => set((s) => ({ extraOrders: [o, ...s.extraOrders] })),
      addPayment: (p) => set((s) => ({ extraPayments: [p, ...s.extraPayments] })),
      addAudit: (e) => set((s) => ({ extraAudit: [e, ...s.extraAudit] })),
      actRec: (id, v) => set((s) => ({ actedRecs: { ...s.actedRecs, [id]: v } })),
      reset: () => set({ ...initial }),
    }),
    { name: "meridian-demo-v1", storage: createJSONStorage(() => localStorage), skipHydration: true },
  ),
);
