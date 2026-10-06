# Gyraq-ERP

Meridian ERP: AI-native ERP demo for a Pakistani FMCG distributor.

- `frontend/` Next.js 16 app (seeded simulation data, no backend yet). `pnpm install && pnpm dev`
- `docs/plan/` implementation plan pack
- Deploy on Vercel with root dir `frontend`; set `NEXT_PUBLIC_BASE_PATH` per `how-to-crm-website-add.md`.
- AI: set `OPENROUTER_API_KEY` (optional); without it the app uses its computed answer engine.
