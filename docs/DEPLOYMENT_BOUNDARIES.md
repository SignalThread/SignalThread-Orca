# SignalThread — Deployment Boundaries

Established by SignalThread Monorepo Phase 1, LOOP 3. Repository/tooling only; no production
dashboard configuration was changed by this branch.

---

## 1. Failure-domain rule

> **A failure of one product application's deployment or operational database must not require
> another product application to fail.**

Concretely:

- Each application is its own Vercel project, built and deployed independently.
- Each application owns its own runtime environment variables. There is no shared
  product-secret namespace.
- Each application owns its own operational database. No application reads another
  application's operational tables directly.
- Sharing happens through **published contracts** — Platform Core auth claims, versioned
  APIs — not through direct imports or shared runtime state.
- Living in one repository is a *source-control* convenience. It must never become a runtime
  dependency.

## 2. Model

One Vercel project per application:

| Application | Root Directory | Status |
|---|---|---|
| Orca | `apps/orca` | active |
| Platform | `apps/platform` | future |
| Registration | `apps/registration` | future |
| Housing | `apps/housing` | future |

## 3. Orca — exact post-move Vercel configuration

Orca moved from `web/` to `apps/orca/`. **The Root Directory in the Vercel dashboard must be
updated manually after this branch merges**, or the build will fail — the old path no longer
exists.

| Setting | Value | Where |
|---|---|---|
| Root Directory | `apps/orca` | Dashboard → Settings → General. **Manual change required.** |
| Include files outside Root Directory | **Enabled** | Required: the lockfile and hoisted `node_modules` live at the repo root. **Verify manually.** |
| Framework Preset | Next.js | `apps/orca/vercel.json` (`framework`) |
| Install Command | *leave empty (Vercel default)* | Vercel detects the npm workspace and installs from the repo root. Do **not** override with `npm ci` — run inside `apps/orca` it would fail, as there is no lockfile there. |
| Build Command | `npm run build` | `apps/orca/vercel.json` (`buildCommand`) |
| Output Directory | `.next` | `apps/orca/vercel.json` (`outputDirectory`) |
| Node version | unchanged | Dashboard |

`apps/orca/package.json` runs `prisma generate` on `postinstall`, so the Prisma client is
produced during install without a custom build command.

### Verified locally

```bash
npm ci                              # from the repository root — exit 0, 682 packages
npm run build --workspace apps/orca # exit 0, 108/108 pages
```

This is the same sequence Vercel performs.

## 4. Environment ownership

Orca's runtime variables belong to the Orca project only:

```text
DATABASE_URL
NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL
NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY
NEXT_PUBLIC_PLATFORM_CORE_APP_URL
NEXT_PUBLIC_ORCA_APP_URL
PLATFORM_ENTITLEMENT_MODE
SPEAKER_INTAKE_TOKEN_SECRET
SUPABASE_SERVICE_ROLE_KEY
```

Adding a future application must not require editing Orca's environment, and vice versa.

### Where env actually loads from

| Consumer | Reads | Notes |
|---|---|---|
| Orca runtime (`next dev` / `next build` / Vercel) | `apps/orca/.env*` only | Next.js loads env from its own project root. The repository-root `.env.local` is **not** read at runtime, so it cannot become a shared runtime secret namespace. |
| Test harness (`loadPlannerTestEnv`) | repo-root `.env.local`, then `apps/orca/.env.local` | Convenience for local DB-backed tests. It never overwrites an already-set variable, so an explicitly exported `DATABASE_URL` always wins over either file. |

Both `.env.local` files are gitignored. On Vercel, environment variables come from that
project's own dashboard settings — never from a file in the repository.

### Must not be revived

| Variable | Status |
|---|---|
| `DIRECT_URL` | Not referenced by application code. Prisma resolves through `DATABASE_URL` only. |
| `DEFAULT_ORG_ID` | Retired in Platform Core Phase 2. Guardrail tests assert it stays out of identity and access resolution. |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Legacy Orca auth authority. Retained **only** as the documented lower-priority fallback in `src/lib/supabase/auth-authority.ts`, with regression coverage. Do not promote to primary; Platform Core is the authority. |

## 4b. Platform — exact Vercel configuration (Phase 1)

`apps/platform` is an **independent Vercel project** in the same GitHub monorepo. It is
never coupled to Orca's project: either app can be redeployed or rolled back alone.

| Setting | Value |
|---|---|
| Git repository | the same monorepo |
| Root Directory | `apps/platform` |
| Include files outside root | **enabled** (needed: npm workspaces hoist to the repo root, and `packages/signalthread-ui` is a workspace dependency) |
| Framework preset | Next.js |
| Install Command | leave as default (`npm install` from the repository root) |
| Build Command | leave as default (`next build`) |
| Output Directory | leave as default |
| Node version | 20.x or later |
| Production domain | `app.signalthread.ai` |

`apps/orca` keeps its own separate project with Root Directory `apps/orca`, later on
`orca.signalthread.ai`. Do not merge the two projects.

### Required environment variables — Platform

Set these in the Vercel project, not in any committed file.

**Client-exposed (inlined into the browser bundle — never put a secret here):**

```text
NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL     https://wtbnpeluwhjjqccdofxd.supabase.co
NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY  <Platform Core anon key>
NEXT_PUBLIC_PLATFORM_APP_URL               https://app.signalthread.ai
NEXT_PUBLIC_ORCA_APP_URL                   https://orca.signalthread.ai
```

**Server-only (must NOT carry a `NEXT_PUBLIC_` prefix):**

```text
PLATFORM_CORE_SERVICE_ROLE_KEY             <Platform Core service-role key>
```

Optional:

```text
PLATFORM_CORE_PROJECT_REF                  wtbnpeluwhjjqccdofxd   (defaults to this)
```

`NEXT_PUBLIC_PLATFORM_APP_URL` is the **frontend**; `NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL`
is the **auth/API project**. They are different services. Setting the frontend variable to a
Supabase URL is rejected at runtime rather than used, because that mistake previously sent
users to `https://<ref>.supabase.co/signin`, which answers `{"error":"requested path is invalid"}`.

### Local development env boundary

Local development uses gitignored files that never reach Vercel:

| File | Purpose | Loaded in production build? |
|---|---|---|
| `apps/platform/.env.local` | Platform local config incl. the server-only service-role key | yes, locally — never uploaded |
| `apps/orca/.env.local` | Orca local config | yes, locally — never uploaded |
| `apps/orca/.env.development.local` | **Local verification only.** Points Orca at a disposable local Postgres seeded with canonical Platform ids, so the Platform → Orca handoff can be exercised without touching `signalthread-orca` | **no** — Next.js loads `.env.development.local` only when `NODE_ENV=development`; verified empirically with a marker value that did not appear in a production build |

None of these are tracked (`.env*` is gitignored in both apps), none are staged, and no
deployment reads them. Vercel environment variables are the only production source.

## 4c. Failure-domain review (Phase 1, audited)

What is true, verified by inspecting the code rather than asserted:

| Scenario | Effect | Evidence |
|---|---|---|
| Platform frontend outage | Orca keeps serving. Only the launcher is unavailable; users with an Orca URL and a live session continue working | Orca imports nothing from `apps/platform` and never queries the Platform Core registry |
| Orca outage | Platform and future products unaffected | Platform never opens Orca's database; the launcher renders a link, and a dead link degrades one card |
| Platform Core **Postgres** outage | Orca keeps serving existing sessions: authorization rides in the JWT claim, not a live query | Orca reads `app_metadata`, never `organization_memberships` / `organization_product_entitlements` |
| Platform Core **Auth** outage | **Shared blast radius.** New sign-ins fail everywhere, and Orca request resolution fails too | `apps/orca/lib/request-user.ts:646` calls `supabase.auth.getUser()`, a network verification, on canonical request resolution |

### What must NOT be claimed yet

Central Auth remains an intentional shared dependency, and Orca verifies each request
against it. **Do not claim full offline-auth resilience.** Making that claim true requires
local JWT verification with JWKS caching, deliberate token lifetimes, and graceful
degradation — a separate shared-auth hardening phase. Phase 1 deliberately did not add a
custom auth verifier, because getting that wrong fails open.

The claim contract limits the damage in one direction only: because authorization travels
in the token, an Auth *database* problem does not immediately revoke access for live
sessions. That is a different property from surviving an Auth *service* outage.

## 5. Database ownership

| Database | Owner | Purpose |
|---|---|---|
| `signalthread-platform-core` | Platform Core | canonical identity, orgs, events, entitlements |
| `signalthread-orca` | Orca | Orca operational data |
| legacy Orca database | — | historical reference only; never a deployment target |

Identity flow, unchanged by the monorepo move:

```text
Platform Core Auth
  → canonical Platform user/org/event context
    → Orca entitlement
      → Orca EventMemberRole
        → Orca operational data
```

## 6. Coupling audit (LOOP 3)

- Workspace members: `apps/orca`, `packages/signalthread-ui`.
- Orca's only workspace dependency is `@signalthread/ui` — a presentation package that
  references no application.
- No import in `apps/orca` resolves outside `apps/orca` except that package.
- No sibling-app import exists.

---

## 7. Repository rename — DEFERRED (assessed in LOOP 5)

Current: `SignalThread/SignalThread-Orca`. The repository is now a company monorepo, so the
Orca-specific name is misleading. **The rename is nevertheless deferred.**

### Impact inspected

| Surface | Finding |
|---|---|
| Git remotes | One (`origin`). GitHub redirects the old URL, but the remote should be updated explicitly. |
| SSH alias | `github-signalthread` maps to `github.com` at host level, **not** repo level — unaffected by a rename. |
| GitHub Actions | None exist. |
| Deployment hooks | None in the repository. |
| Vercel | No `.vercel` directory locally. The Vercel project is connected to the GitHub repo, so the Git integration must be re-verified after a rename. |
| Documentation | 6 occurrences across 4 files. |
| External references | None known beyond the above. |

### Why defer

Merging this branch **already requires** one manual Vercel change (Root Directory `web` →
`apps/orca`). Renaming the repository at the same time stacks a second dashboard change on the
same deploy and makes attribution ambiguous if the build fails — you would not know whether the
root directory or the Git connection was at fault. Nothing in the repository depends on its
name, so there is no technical pressure to combine them.

### Exact future rename step — run only after the monorepo deploy is verified green

1. GitHub → repository **Settings → General → Rename**, e.g. `SignalThread-Orca` → `SignalThread`.
2. Update the local remote:
   ```bash
   git remote set-url origin git@github-signalthread:SignalThread/SignalThread.git
   ```
   The `github-signalthread` SSH alias needs no change.
3. Vercel → the Orca project → **Settings → Git**: confirm the connected repository followed the
   rename; reconnect if it did not. Verify Root Directory is still `apps/orca`.
4. Trigger one deploy and confirm it is green **before** renaming anything else.
5. Update the 6 documentation references.
6. Re-check any external links (README badges, bookmarks, integrations) as they are found.
