"use client";
import { useEffect, useState } from "react";
import { getDB, idx } from "./data/queries";
import type { Approval } from "./data/types";
import { useERP, useWorld } from "./store";

/** True after first client render – use to avoid hydration mismatches on persisted state. */
export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

export function useApprovals(): (Approval & { decided?: "approved" | "rejected" })[] {
  useWorld((s) => s.version);
  return getDB().approvals.map((a) => (a.status !== "pending" && a.decidedAt ? { ...a, decided: a.status as "approved" | "rejected" } : a));
}

export function useNotifications() {
  useWorld((s) => s.version);
  const { readNotifs } = useERP();
  const mounted = useMounted();
  const muted = useERP((s) => s.mutedTypes);
  const kind = (n: { href: string; title: string }) => /approvals/.test(n.href) ? "approvals" : /replenishment|inventory|warehouses/.test(n.href) ? "stock" : /customers|payments/.test(n.href) ? "payments" : /purchasing|suppliers/.test(n.href) ? "purchasing" : /finance/.test(n.href) ? "finance" : "ai";
  return getDB().notifications.filter((n) => !(mounted && muted.includes(kind(n)))).map((n) => ({ ...n, read: n.read || (mounted && readNotifs.includes(n.id)) }));
}

export const useIdx = () => idx();
