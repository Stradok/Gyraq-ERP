# Self-hosting Meridian ERP

One command runs the whole product on any machine with Docker: web app, API, Postgres.

```bash
cp .env.example .env        # set JWT_SECRET (openssl rand -hex 32), DB_PASSWORD, DEMO_PASSWORD, AI keys
docker compose up -d --build
```

| Service | URL | Notes |
|---|---|---|
| Web app | http://localhost:3000 | sign in with a demo account (see below) |
| API | http://localhost:4000 | `/health`, `/auth/login`, `/api/*` |
| Postgres | localhost:5433 | user `meridian`, db `meridian` |

Demo accounts (password = `DEMO_PASSWORD`): `owner@meridian.demo`, `finance@meridian.demo`, `sales.manager@meridian.demo`, `rep.karachi@meridian.demo`, `warehouse.khi@meridian.demo`, `procurement@meridian.demo`, `admin@meridian.demo`, `employee@meridian.demo`.

## Showing it on a call
1. `docker compose up -d` (data persists in the `pgdata` volume).
2. Open http://localhost:3000, sign in as the Owner, share your screen. Use a second browser profile as another role: changes appear there within about 4 seconds.
3. Reset to a clean demo between customers: `docker compose down -v && docker compose up -d` (wipes the database and re-seeds as of today).

## Shipping to a customer VPS
Build once here, move images, run there. No registry needed:

```bash
docker compose build
docker save meridian-api meridian-web postgres:17-alpine | gzip > meridian-images.tar.gz
scp meridian-images.tar.gz docker-compose.yml .env user@vps:~/meridian/
# on the VPS
docker load < meridian-images.tar.gz && docker compose up -d
```
Put a reverse proxy with HTTPS (Caddy is the least work) in front of ports 3000 and 4000, then rebuild the web image with `PUBLIC_API_URL=https://api.customer.com` because the API address is baked into the browser bundle. Set `CORS_ORIGIN` to the web address.

Backups: `docker compose exec db pg_dump -U meridian meridian > backup.sql`.

## AI by edition
Set `AI_EDITION` and the matching keys in `.env`. Each task goes to the cheapest vendor that does it well.

| Edition | Chat / reasoning | Quick tasks | Documents (bill extraction) | Agents |
|---|---|---|---|---|
| demo | free OpenRouter models | free | free | free |
| standard | Gemini Flash | Gemini Flash-Lite | Gemini Flash | Gemini Pro |
| premium | Claude Sonnet | Claude Haiku | Gemini Flash | Claude Sonnet |

Override one task: `AI_PROVIDER_VISION=anthropic`, `AI_MODEL_REASONING=...`. A task whose vendor has no key falls back to one that does. Model ids change; check the vendors' model lists when onboarding a customer. Voice is not built yet.

## How the data is stored
The command log is the source of truth and is append-only. Each command is also written into tables in the same transaction: `records` (documents as JSON), `stock_levels`, `accounts`, `journal_entries` + `journal_lines` (the database refuses an unbalanced entry and refuses edits or deletes), and `audit_log`. The server rebuilds its in-memory state from the seed plus the log on start.

## Limits to know about
- One API instance only (state lives in its memory). Fine for one company; scaling out needs a shared cache.
- Each command takes roughly 0.2 s because the whole state is diffed before writing. Fine for demos and small teams; optimise before large teams.
- The seed is data as of the day the database was created. Real customers start from an empty company setup, which is not built yet.
- Users are the eight demo roles. A user-management screen is not built yet.
