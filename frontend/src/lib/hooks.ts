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
  return getDB().notifications.map((n) => ({ ...n, read: n.read || (mounted && readNotifs.includes(n.id)) }));
}

export const useIdx = () => idx();
