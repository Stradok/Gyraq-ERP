# Deploying Meridian ERP: server, desktop app, phones, and how sync works

## 1. The shape of the system
```
 Browser / PWA / Desktop app (Electron)  ──HTTPS──▶  Caddy (TLS) ──▶  web (Next.js)   static app, 1 file set per version
        │  local copy + offline queue                       └────────▶  api (Hono)  ──▶  Postgres (source of truth)
        └──────── one live HTTP stream (server → client) ◀──────────────┘
```
- **The server holds the truth** (Postgres). Every screen also keeps a local copy of the company and runs each action locally first, so the screen answers instantly and works with no internet.
- **Sync = a queue plus a live stream.** Actions go to the server as small `POST /api/commands` requests. If the server can't be reached they wait in the device's outbox and are sent, in order, when the connection returns. The server keeps one idle HTTP stream open per screen (`GET /api/stream`, Server-Sent Events) and announces "the log is now at N" after every commit; the screen then fetches what it missed. A slow 20-second timer is the safety net when the stream is down.
- **If someone else changed things first,** the server answers "stale", the screen rebuilds from the server and re-applies the user's unsent changes, and drops (with a message) any that no longer make sense.
- **Why not WebSocket or WebRTC?** Updates only flow server-to-client, which a plain HTTP stream does with no extra library, passes through every proxy, reconnects by itself, and costs a few KB per screen. WebRTC peer-to-peer would need a signalling server and a conflict-resolution scheme between PCs; a central server that every PC syncs through is simpler, cheaper and auditable. Add WebSocket only if screens ever need to send frequent messages upstream (chat, cursors).
- **PCs "syncing" with each other** therefore means: every PC syncs with the server. Two PCs offline at the same time both queue their changes; whoever reconnects first is applied first, the other rebuilds and replays on top.

## 2. Set up a server (about 10 minutes, any small VPS)
Needs a Linux VPS with Docker, a domain whose DNS points at it, ports 80 and 443 open.
```bash
git clone https://github.com/Stradok/Gyraq-ERP.git && cd Gyraq-ERP
DOMAIN=erp.customer.com OWNER_EMAIL=owner@customer.com OWNER_NAME="Customer Owner" bash deploy/install.sh
```
It writes `.env` with random secrets, starts Postgres, API, web app and HTTPS (Caddy), and prints the Owner's one-time password. The Owner then lands on **Getting started** (company, warehouses, products, customers, opening balances, team).
- **Update:** `git pull && docker compose --profile https up -d --build` (a few seconds of downtime while containers restart; data is in the `pgdata` volume).
- **Backup:** `docker compose exec db pg_dump -U meridian meridian | gzip > backup-$(date +%F).sql.gz` daily from cron; copy it off the machine. **Restore:** `gunzip -c backup.sql.gz | docker compose exec -T db psql -U meridian meridian`. Test a restore before you rely on it.
- **Health:** `https://DOMAIN/health`; the books check is `GET /api/health/integrity` (Owner/Admin).

## 3. Apps for people's devices
| Device | How |
|---|---|
| Any PC, Mac, Linux, Chromebook | Open the address in Chrome or Edge → **Install app**. Works offline. No download needed. |
| **Windows `.exe`, macOS `.dmg`, Linux `.AppImage`/`.deb`** (two flavours) | GitHub → **Actions → Desktop installers → Run workflow** (or push a `v*` tag). Files appear under the run's *Artifacts*: `meridian-demo-*` opens the public demo with fake seeded data; `meridian-real-*` asks for the server address once, then you sign in. |
| **Android `.apk` (two flavours)** | GitHub → **Actions → Android APK → Run workflow** (or push a `v*` tag), then download from *Artifacts*. **`meridian-demo.apk`** opens the public demo: a fake seeded company, editable, works offline after the first open, nothing to set up. **`meridian-real.apk`** starts on a setup screen: type your company's server address (https), then sign in with your own account ("Change server" is on the sign-in page). Debug-signed, so Android asks to allow installs from unknown sources; a Play Store release needs your own signing key. |
| iPhone | Open the address in Safari → **Share → Add to Home screen**. A native iOS app needs an Apple Developer account (USD 99 a year) plus a Mac and is not built. |

The desktop app is a locked-down window: it can only show the setup page or the server you entered, opens other links in your browser, and has no access to the PC's files. Installers are **unsigned** until you buy a code-signing certificate, so Windows SmartScreen shows a warning on first run ("More info → Run anyway"); macOS needs right-click → Open. Signing is a paid, per-vendor purchase; add it to the workflow when a customer needs it.
*Status:* the installer workflow has built the Windows, macOS and Linux packages successfully on GitHub (tag `v0.1.0-rc2`). The packages have not been run on real Windows, Mac or Linux machines yet.

## 4. Security summary
HTTPS everywhere (Caddy, HSTS); passwords hashed with scrypt; short-lived signed sessions that end when a password changes; accounts lock after repeated failures; every command checked against a role table on the server, with record-level limits for sales reps; secrets only in `.env` (git-ignored); database reachable from the server only; browser security headers; append-only audit trail and ledger; the books are checked against themselves at start and on demand. Remaining gaps: no two-factor sign-in, no self-service password reset, session token stored in the browser (shorter sessions or httpOnly cookies are the next step), no independent penetration test.

## 5. Cost and scale
- **Cost:** one 2 vCPU / 2 GB VPS (roughly USD 6 to 12 a month) runs everything for a single company: the API uses about 0.2 GB at the demo company's size and each open screen costs a few KB for its stream. AI is optional and billed by the vendor per use.
- **Speed:** a command takes about 130 ms end to end (the screen updates immediately, before that); the app shell paints in about 150 ms.
- **Ceiling:** one API process holds the company in memory (about 50 MB at 5,500 invoices) and serialises commands, which comfortably serves tens to low hundreds of active users. Beyond that: bigger VM first; then split read traffic and add a shared bus (Postgres LISTEN/NOTIFY) so several API processes can push updates. Tenancy (one server for many companies, milestone R4) is not built: today it is one deployment per company, which is also the strongest isolation.
