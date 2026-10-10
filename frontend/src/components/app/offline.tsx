"use client";
// Registers the service worker (production only), saves every page for offline use, and shows connection state.
import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { remote, useSync } from "@/lib/engine/remote";
import { NAV, TABS } from "@/lib/nav";
import { getDB } from "@/lib/data/sim";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const EXTRA = ["/learn", "/settings/policies", "/settings/notifications", "/settings/roles", "/warehouses/receive", "/warehouses/pick", "/warehouses/count", "/sales/orders/new", "/sales/quotes/new", "/purchasing/orders/new", "/purchasing/bills/new", "/setup"];

/** Saving ~50 pages is a lot of traffic: only on a fast, unmetered connection, and well after the app has loaded. */
function goodConnection() {
  const c = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !c || (!c.saveData && (!c.effectiveType || c.effectiveType === "4g"));
}

/** Fetch every page and the script/style files it names, so a hard navigation works with no connection. */
async function saveForOffline() {
  const day = new Date().toISOString().slice(0, 10), key = "meridian-saved-" + day;
  try { if (localStorage.getItem(key)) return; } catch { /* storage blocked: just run */ }
  const routes = [...new Set([...NAV.map((n) => n.href), ...Object.values(TABS).flatMap((t) => (t ?? []).map((x) => x.href)), ...EXTRA])];
  for (const r of routes) {
    try {
      const html = await (await fetch(BASE + r)).text();
      for (const m of new Set(html.match(/\/[^"'\\\s()]*_next\/static\/[^"'\\\s()]+/g) ?? [])) await fetch(m).catch(() => undefined);
    } catch { return; } // went offline part-way; try again next load
  }
  try { localStorage.setItem(key, "1"); } catch { /* ignore */ }
}

/** Save one record page of each kind under a fixed key. The offline shell for any other record of that kind is a copy of it. */
async function saveExamples() {
  const db = getDB(), cache = await caches.open("meridian-v1");
  const pages = [["customers", db.customers[0]?.id], ["suppliers", db.suppliers[0]?.id], ["inventory", db.products[0]?.id], ["sales/orders", db.orders[0]?.id], ["sales/invoices", db.invoices[0]?.id], ["sales/shipments", db.shipments[0]?.id], ["purchasing/orders", db.pos[0]?.id], ["purchasing/bills", db.bills[0]?.id], ["reports", "sales-by-customer"]] as const;
  for (const [kind, id] of pages) {
    const key = `${location.origin}${BASE}/__example__/${kind}`;
    if (!id || (await cache.match(key))) continue;
    try {
      const res = await fetch(`${BASE}/${kind}/${id}`); if (!res.ok) continue;
      const html = await res.clone().text(); await cache.put(key, res);
      for (const m of new Set(html.match(/\/[^"'\\\s()]*_next\/static\/[^"'\\\s()]+/g) ?? [])) await fetch(m).catch(() => undefined);
    } catch { return; }
  }
}

export function OfflineSupport() {
  const { online, pending } = useSync();
  const [browserOnline, setBrowserOnline] = useState(true);
  useEffect(() => {
    setBrowserOnline(navigator.onLine);
    const on = () => setBrowserOnline(true), off = () => setBrowserOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register(`${BASE}/sw.js`).then(() => navigator.serviceWorker.ready).then(() => { if (navigator.onLine && goodConnection()) setTimeout(() => void saveForOffline().then(() => new Promise((r) => setTimeout(r, 3000))).then(saveExamples), 20_000); }).catch(() => undefined);
    }
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  const offline = remote ? !online : !browserOnline;
  if (!offline && !pending) return null;
  return offline
    ? <span className="flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-[11px] text-warning" title="Changes are saved on this device and sent when the connection returns."><CloudOff className="size-3.5" />Offline{pending ? ` · ${pending} waiting to sync` : remote ? " · using saved data" : " · demo runs on this device"}</span>
    : <span className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground"><RefreshCw className="size-3.5 animate-spin" />Syncing {pending}</span>;
}
