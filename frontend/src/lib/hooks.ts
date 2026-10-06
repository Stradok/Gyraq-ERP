"use client";
import { useEffect, useState } from "react";
import { getDB, idx } from "./data/queries";
import type { Approval } from "./data/types";
import { useERP } from "./store";

/** True after first client render – use to avoid hydration mismatches on persisted state. */
export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

export function useApprovals(): (Approval & { decided?: "approved" | "rejected" })[] {
  const { extraApprovals, decisions } = useERP();
  const mounted = useMounted();
  const base = getDB().approvals;
  const all = [...(mounted ? extraApprovals : []), ...base];
  return all.map((a) => {
    const d = mounted ? decisions[a.id] : undefined;
    return d ? { ...a, status: d.decision, decided: d.decision } : a;
  });
}

export function useNotifications() {
  const { readNotifs } = useERP();
  const mounted = useMounted();
  return getDB().notifications.map((n) => ({ ...n, read: n.read || (mounted && readNotifs.includes(n.id)) }));
}

export const useIdx = () => idx();
