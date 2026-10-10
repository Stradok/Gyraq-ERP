// Offline support. Static files are served from the cache first; pages try the network (3 s) and fall back to the last
// copy saved on this device. API and AI calls are never cached. Bump V to drop everything saved by older versions.
const V = "meridian-v1";
const scope = self.registration.scope;

const DETAIL = ["customers", "suppliers", "inventory", "sales/orders", "sales/invoices", "sales/shipments", "purchasing/orders", "purchasing/bills", "reports"].map((k) => [new RegExp("^/" + k + "/[^/]+$"), k]);

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== V) await caches.delete(k);
  await self.clients.claim();
})()));

const OFFLINE_PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title>
<body style="font:16px system-ui;background:#0b0c0e;color:#e6e6e6;display:grid;place-items:center;min-height:100vh;margin:0"><div style="max-width:28rem;padding:2rem">
<h1 style="font-size:1.2rem">You're offline</h1><p style="color:#9a9a9a">This page hasn't been saved on this device yet. Open it once while connected and it will work offline next time.</p>
<p><a style="color:#8ab4ff" href="${scope}overview">Go to Overview</a></p></div>`;

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.includes("/api/")) return;
  const asset = url.pathname.includes("/_next/static/") || /\.(png|svg|ico|woff2?|webmanifest|jpg|jpeg|webp)$/.test(url.pathname);
  e.respondWith(asset ? cacheFirst(req) : networkFirst(req));
});

async function cacheFirst(req) {
  const c = await caches.open(V);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) c.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const c = await caches.open(V);
  const cached = (await c.match(req)) || (await c.match(req, { ignoreSearch: true }));
  const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; });
  net.catch(() => undefined); // a late failure after we already answered from the cache is not an error
  try {
    // Nothing saved yet: wait for the network however long it takes. Only fall back to a saved copy when the network is
    // slow (3 s) or down. Giving up on a slow but working connection would show "offline" to an online user.
    if (!cached) return await net;
    return await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error("slow")), 3000))]);
  } catch {
    if (cached) return cached;
    if (req.mode === "navigate") {
      // A record page that was never opened (for example one created offline): reuse the saved page of the same kind.
      // The page reads its id from the address bar, so the saved shell works for any id.
      const path = new URL(req.url).pathname.slice(new URL(scope).pathname.length - 1);
      const kind = DETAIL.find(([re]) => re.test(path));
      if (kind) { const ex = await c.match(scope + "__example__/" + kind[1]); if (ex) return ex; }
      return new Response(OFFLINE_PAGE, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
    }
    return Response.error();
  }
}
