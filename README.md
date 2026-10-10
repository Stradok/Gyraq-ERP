# Gyraq-ERP

Meridian ERP: AI-native ERP demo for a Pakistani FMCG distributor.

- `frontend/` Next.js 16 app (seeded simulation data, no backend yet). `pnpm install && pnpm dev`
- `docs/plan/` implementation plan pack
- Deploy on Vercel with root dir `frontend`; set `NEXT_PUBLIC_BASE_PATH` per `how-to-crm-website-add.md`.
- AI: set `OPENROUTER_API_KEY` (optional); without it the app uses its computed answer engine.

## Development

```bash
cd frontend
pnpm install
pnpm dev            # http://localhost:3000
pnpm test:engine    # integrity tests for the command engine (ledger, stock, replay)
pnpm test:e2e       # browser flows (needs dev server running and: pnpm exec playwright install chromium)
```

See `docs/MIGRATION.md` for how the demo engine maps to a real backend and how to switch the AI provider.

## Self-hosted stack (Postgres + API + web)
`docker compose up -d --build`, then open http://localhost:3000. See [docs/SELF-HOSTING.md](docs/SELF-HOSTING.md).
