# 01 — Platform Architecture

How the monorepo is organised, why, and the constraints that follow.

---

## 1. The failure-domain rule

This is the founding architectural constraint. Everything else derives from it:

> **A failure of one product application's deployment or operational database must not require another product application to fail.**

Concretely:

- Each application is its **own Vercel project**, built and deployed independently.
- Each application owns its **own runtime environment variables**. There is no shared product-secret namespace.
- Each application owns its **own operational database**. No application reads another application's operational tables.
- Sharing happens through **published contracts** — Platform Core auth claims, versioned HTTP APIs — never direct imports or shared runtime state.
- Living in one repository is a **source-control convenience**. It must never become a runtime dependency.

Canonical source: `docs/DEPLOYMENT_BOUNDARIES.md`.

---

## 2. Repository layout

```
signalthread/
├── apps/
│   ├── orca/              Next.js · Prisma · Postgres (signalthread-orca)
│   ├── platform/          Next.js · Supabase JS · Platform Core
│   ├── pulse/             Next.js · Prisma · own Postgres + own Supabase Auth
│   ├── lead-retrieval/    Next.js · Supabase JS · own Supabase project
│   └── housing/           ← you will create this
├── packages/
│   └── signalthread-ui/   @signalthread/ui — shared design system
├── docs/                  architecture, handoffs, audits, this pack
├── scripts/
│   ├── check-import-boundaries.mjs
│   └── demo-seeding/      cross-product deterministic demo data
└── package.json           npm workspaces root
```

npm workspaces: `apps/*` and `packages/*`. Dependencies hoist to the repo root unless an app pins an exact conflicting version (Lead Retrieval pins `next@16.1.6` / `react@19.2.4`, which npm nests under `apps/lead-retrieval/node_modules`).

---

## 3. Import boundaries — enforced, not advisory

```
apps/*     MAY import packages/*
apps/*     MUST NOT import another apps/*
packages/* MUST NOT import apps/*
```

Enforced by `scripts/check-import-boundaries.mjs`, run with:

```bash
npm run boundaries
```

It walks every `.ts/.tsx/.js/.jsx/.mjs/.cjs/.mts/.cts` file in every workspace member and checks both relative imports (must stay inside the member) and bare specifiers (must not name another app's package). It is deliberately dependency-free so it runs in a bare CI container.

**Why it matters:** if Housing could import Lead Retrieval, a build failure or a runtime exception in Lead Retrieval would become a failure in Housing — exactly the coupling the failure-domain rule forbids.

**If you need to share something with another product:** put it in `packages/*` (if it is pure/presentational) or expose it as an HTTP contract (if it is data or behaviour). Ask before adding a new package — a shared package is a shared failure domain for *build time*, so it should hold things that genuinely do not change per product.

---

## 4. Deployment model

One Vercel project per application, all pointed at the same GitHub monorepo with different Root Directories.

| Application | Root Directory | Production domain | Status |
|---|---|---|---|
| Orca | `apps/orca` | `orca.signalthread.ai` | active |
| Platform | `apps/platform` | `app.signalthread.ai` | project not yet created |
| Pulse | `apps/pulse` | `voice.signalthread.ai` | workspace ready, Vercel project not created |
| Lead Retrieval | `apps/lead-retrieval` | `lr.signalthread.ai` | pre-cutover |
| **Housing** | `apps/housing` | `housing.signalthread.ai` *(proposed — confirm with Ali)* | **to create** |

Settings that matter for a monorepo app on Vercel:

| Setting | Value | Why |
|---|---|---|
| Root Directory | `apps/housing` | |
| **Include files outside Root Directory** | **Enabled** | Required — the lockfile and hoisted `node_modules` live at the repo root |
| Framework Preset | Next.js | |
| Install Command | *leave default* | Vercel installs from the repo root and resolves the workspace. Do **not** set `npm ci` — run inside `apps/housing` it fails, there is no lockfile there |
| Build Command | *leave default* (`next build`) | |
| Node version | 20.x or later | |

`apps/orca/vercel.json` and `apps/lead-retrieval/vercel.json` are the two existing examples (Orca pins framework/build/output; Lead Retrieval declares cron jobs).

**There is no CI in this repository today** (no `.github/workflows`). Validation is run locally before merge — see file 08. If you want CI for Housing, that is a reasonable thing to propose.

---

## 5. Failure-domain reality check (audited, not aspirational)

| Scenario | Actual effect |
|---|---|
| Platform frontend outage | Products keep serving. Only the launcher is unavailable; a user with a product URL and a live session keeps working |
| A product outage | Platform and every other product unaffected. The launcher renders a link; a dead link degrades one card |
| Platform Core **Postgres** outage | Products keep serving existing sessions — authorization rides in the JWT claim, not a live query |
| Platform Core **Auth** outage | **Shared blast radius.** New sign-ins fail everywhere |

That last row is an **intentional, currently-unmitigated shared dependency**. Do not claim Housing has full offline-auth resilience. Making that true needs local JWT verification with JWKS caching and deliberate token lifetimes — a separate hardening phase that has not been done, and which was deliberately *not* attempted because a hand-rolled auth verifier that fails open is worse than the shared dependency.

---

## 6. Where the shared design system lives

`packages/signalthread-ui`, published internally as `@signalthread/ui`:

```json
"exports": {
  ".":                    "./src/index.ts",
  "./styles/tokens.css":  "./src/styles/tokens.css",
  "./styles/theme.css":   "./src/styles/theme.css"
}
```

Source-exported TypeScript (no build step) — consuming apps compile it themselves. Use it for Housing's chrome so the product looks like the rest of the suite. Product-specific colour is expressed through the `--product-housing*` custom properties already defined in Platform's `globals.css`; mirror those values in Housing.

---

## 7. Products are lifecycle-ordered

The connected-event dashboard arranges products along a before → during → after lifecycle. Housing's slot is already defined:

| Product | Capability | Span | Order |
|---|---|---|---|
| OrcaOS | Plan | before → after | 10 |
| Registration | Register | before → during | 20 |
| **Housing** | **House** | **before → during** | **30** |
| Lead Retrieval | Engage | during → after | 40 |
| Pulse | Understand | during → after | 50 |

Housing's declared contribution to the shared event object is **"Rooms held"**, with headline metrics **"Rooms held"** and **"Committed"**. That is a product commitment already encoded in `apps/platform/lib/event-overview/product-catalog.ts` — if Housing's domain model makes different metrics more honest, change that file deliberately and say why, rather than bending the data to fit.
