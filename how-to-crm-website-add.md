# How the HVAC CRM demo was added to gyraq.com

Result: the CRM demo is live at **https://www.gyraq.com/products/crm/hvac**, while
living in its **own repo and its own Vercel project**. The website repo only
holds one small piece of config that forwards that URL to the demo.

Use this as the recipe for every future demo (medical CRM, ERP, ...).

---

## 1. How it fits together

```
Visitor ──> www.gyraq.com/products/crm/hvac
              │   (website project: gyraq-website-deployment,
              │    repo Stradok/Gyraq.com, static HTML)
              │
              │  vercel.json "rewrites"  (a reverse proxy, not a redirect)
              ▼
            gyraq-crm-hs-fawn.vercel.app/products/crm/hvac
                (CRM project: gyraq-crm-hs,
                 repo Stradok/Gyraq-CRM-hs, root dir Front-End)
```

- The address bar stays on `gyraq.com`. The visitor never sees the `*.vercel.app` URL.
- Two repos, two Vercel projects, two independent deploy pipelines.
- The only link between them is the rewrite in the website's `vercel.json`.
- No DNS change is needed because `gyraq.com` is already on the website project.
- Works on the free Hobby plan.

### Demos vs real products

| Kind | Examples | How it appears on gyraq.com |
|---|---|---|
| Demo (mock data, no logins) | HVAC CRM, future medical CRM, ERP | Proxied under `gyraq.com/products/...` with a rewrite (this guide) |
| Real product (real users/data) | Reach, Flamingo | Own subdomain (e.g. `reach.gyraq.com`), plus a marketing page on gyraq.com that links out |

Real products stay on their own subdomain so they keep a separate security
boundary, cookies, and deploys. They also cannot be shown in an iframe.

---

## 2. The CRM side (repo `Gyraq-CRM-hs`)

The CRM is a Next.js 15 app in `Front-End/`. To serve it under a sub-path it
needs a `basePath`.

### 2.1 `next.config.ts`

```ts
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['maplibre-gl'],
  ...(basePath ? { basePath } : {}),
}
```

- Locally the variable is unset, so the app runs at `localhost:3000/` as before.
- In production it is `/products/crm/hvac`, so every page and every `/_next/...`
  asset is served under that prefix. This is what makes the proxy work.

### 2.2 Code that bypassed the router

`next/link`, `router.push` and `usePathname` handle `basePath` automatically.
Raw `window.history.pushState` / `window.location.pathname` do not. The guided
tour (`src/lib/tour.ts`) used those, so it prefixes the path itself:

```ts
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || ''
window.history.pushState({}, '', BASE_PATH + '/dashboard')
```

When adding a demo, grep for `window.location`, `history.pushState`, plain
`<a href="/...">`, `fetch('/...')` and `src="/..."` and make sure each one is
`basePath`-aware.

### 2.3 `Front-End/vercel.json`

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "pnpm seed && pnpm build:rag && pnpm build"
}
```

The build regenerates the seed data and the RAG index before `next build`.
(An early version put env vars in this file and ran the seed from
`next.config.ts`. Both were wrong, so env vars live in the Vercel dashboard and
the seed runs in the build command.)

### 2.4 Vercel project for the CRM

1. Vercel → **Add New → Project** → import `Stradok/Gyraq-CRM-hs`.
2. **Root Directory:** `Front-End`.
3. **Environment Variables**, for Production (and Preview):
   - `NEXT_PUBLIC_BASE_PATH` = `/products/crm/hvac`
   - `NEXT_PUBLIC_DATA_SOURCE` = `mock`
   - `NEXT_PUBLIC_DEMO_MODE` = `true`
4. Deploy. Every push to `main` now deploys automatically (Git integration).

Important details:

- Choose type **Config**, not **Secret**. `NEXT_PUBLIC_*` values are baked into
  the browser bundle and are not secret. A Secret value also cannot be read back.
- **Changing an env var does not change existing builds.** After editing
  `NEXT_PUBLIC_BASE_PATH`, go to Deployments → latest → ⋯ → **Redeploy** and
  untick **Use existing Build Cache**.
- With the basePath set, the bare root (`<project>.vercel.app/`) returns 404.
  That is expected. Test `<project>.vercel.app/products/crm/hvac`.
- Per-deployment URLs (the long hash ones) sit behind Vercel Deployment
  Protection and redirect to a login. The project's public alias
  (`gyraq-crm-hs-fawn.vercel.app`) is not protected.

---

## 3. The website side (repo `Gyraq.com`)

The site is static HTML on Vercel. Only `vercel.json` changes:

```json
{
  "cleanUrls": true,
  "trailingSlash": false,
  "redirects": [
    { "source": "/Products/crm/hvac", "destination": "/products/crm/hvac", "permanent": true },
    { "source": "/products/CRM/HVAC", "destination": "/products/crm/hvac", "permanent": true },
    { "source": "/products/CRM/hvac", "destination": "/products/crm/hvac", "permanent": true }
  ],
  "rewrites": [
    { "source": "/products/crm/hvac", "destination": "https://gyraq-crm-hs-fawn.vercel.app/products/crm/hvac" },
    { "source": "/products/crm/hvac/:path*", "destination": "https://gyraq-crm-hs-fawn.vercel.app/products/crm/hvac/:path*" }
  ]
}
```

- Two rewrite rules are needed: one for the exact path and one for everything
  under it (pages and `/_next/static/...` assets).
- The destination path **must include the same prefix**, because the CRM was
  built with that basePath.
- URLs are lowercase only. Vercel paths are case-sensitive and Google can treat
  capitalised variants as duplicates, so the capitalised versions get a permanent
  redirect to the lowercase one.
- Do **not** create a static page at `/products/crm/hvac` in the website repo.
  The proxy owns that path.
- Existing entries (like the `/reach` redirects) stay in the same file.

### How it was rolled out safely

1. Made the change on a **branch** (`crm-hvac-rewrite`), not on `main`.
2. Vercel built a **Preview** deployment of the website for that branch.
3. Opened `<preview-url>/products/crm/hvac` and checked the CRM loaded and worked.
4. Opened a pull request into `main`, merged it, and Vercel deployed production.
5. Checked `https://www.gyraq.com/products/crm/hvac`.

Another contributor had changed `vercel.json` on `main` at the same time, which
caused a merge conflict. It was resolved by keeping both sets of entries.

---

## 4. Problems we hit, and the fixes

| Symptom | Cause | Fix |
|---|---|---|
| Vercel build failed at the end with `ENOENT … (public)/page_client-reference-manifest.js` | `src/app/page.tsx` re-exported `(public)/page.tsx`, so two files claimed the `/` route. Local builds tolerated it, Vercel's tracer did not | Deleted the redundant `src/app/page.tsx`. `(public)/page.tsx` serves `/` by itself |
| Vercel banner: "Vulnerable version of Next.js" (React2Shell, CVE-2025-55182) | Next.js 15.3.4 | Merged Vercel's auto-fix PR (15.3.8), then bumped to 15.3.9 (next + eslint-config-next) |
| Deployment Ready but every URL returned 404 | `NEXT_PUBLIC_BASE_PATH` was missing or set as Secret when it built | Re-add as Config, redeploy without build cache |
| `<project>.vercel.app/` returns 404 | Expected. The app lives under the basePath | Test the full path |
| CI would fail at lint | 17 unused-import warnings and the CI rule is `--max-warnings 0` | Removed the unused imports and variables |
| Preview worked but `gyraq.com` did not | The rewrite was only on a branch. Production serves `main` | Merged the PR |

---

## 5. Checklist: add the next demo (e.g. ERP or medical CRM)

1. New repo (or new folder) with its own Next.js app. Add the `basePath`
   pattern from section 2.1 with the new path, e.g. `/products/crm/medical`.
2. Make sure nothing uses unprefixed raw paths (section 2.2).
3. New Vercel project, set the root directory and the three env vars with the
   **new** `NEXT_PUBLIC_BASE_PATH`. Deploy and test
   `<project>.vercel.app/<basePath>`.
4. In the website repo, on a branch, add two rewrites (exact and `:path*`) and
   the capitalisation redirects to `vercel.json`.
5. Check the Preview deployment, then merge.
6. Add the card and navigation entry on the website (Products hub, `/products/crm`).
7. Run `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` before pushing.

---

## 6. Keeping it healthy

- **Deploys:** push to `main` in each repo; Vercel handles the rest.
- **CI:** `.github/workflows/front-end-ci.yml` runs lint, typecheck, tests and
  build. Check the **Actions** tab after pushes.
- **Security updates:** Vercel opens PRs for vulnerable dependencies. Test them
  with `NEXT_PUBLIC_BASE_PATH=/products/crm/hvac pnpm build` before merging.
- **Rollback:** Vercel → Deployments → pick an earlier deployment →
  **Instant Rollback**. For the website you can also revert the merge commit.
- **Backend later:** the CRM currently runs on mock data. Real keys (Supabase,
  OpenRouter, LiveKit, vision model) go in Vercel environment variables and
  GitHub repository secrets, never in the repo.
