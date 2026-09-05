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
| Pulse | `apps/pulse` | established in the workspace; Vercel project not yet created |
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

## 4d. Cross-subdomain SSO — implemented architecture

One login at `app.signalthread.ai` opens `orca.signalthread.ai` with no second
interactive sign-in, **without** a shared auth cookie.

```text
app.signalthread.ai
  host-scoped Platform Core session
  Platform verifies: ACTIVE org membership -> event belongs to that org
                     -> org holds ACTIVE product entitlement
  GET /api/launch/<product>?event_id=<canonical uuid>
        v  303, Referrer-Policy: no-referrer
orca.signalthread.ai/auth/callback?token_hash=...&type=magiclink&next=/platform-entry?event_id=...
  verifyOtp() with the ANON key -> Orca's OWN host-scoped session
        v  303 (relative Location)
/platform-entry -> Orca re-validates org-scoped claim, entitlement, event,
                   EventMember and EventMemberRole -> /events/<id>
```

**Handoff primitive.** `auth.admin.generateLink({type:"magiclink"})` returns a
`hashed_token`: single-use, short-lived, Supabase-native. Verified live — a replayed
or malformed token is rejected. The generated `action_link` is **discarded**; only
the token travels and Platform builds the destination itself, which is why the
Supabase redirect allowlist is *not* involved in the handoff.

**Invariants (each asserted by test):** no `Domain=.signalthread.ai` cookie · no
Platform service-role key in Orca · no Platform Core Postgres query from Orca · no
cross-database FK · no custom JWT or hand-rolled crypto · **no authorization carried
in the handoff** — the event id is a navigation hint the product re-validates.

### Cookie contract (both apps)

`Path=/` · `SameSite=Lax` · **no `Domain`** (host-only) · `Secure=true` when the
app's own URL is HTTPS · set and remove use identical scope, so sign-out clears
exactly what sign-in wrote. Lifetime is the `@supabase/ssr` default of **400 days**
(unchanged deliberately; shortening it needs its own reasoning and tests).

`HttpOnly` is **false**. That is required by the current architecture: the Supabase
browser client reads the session from `document.cookie` for refresh and client calls.
It is **deferred hardening**, not an oversight, and it is the main reason a
parent-domain cookie was rejected — a JS-readable credential shared across every
subdomain would turn one XSS anywhere under the apex into a session valid everywhere.

### A failure mode worth remembering

`next.config.ts` `headers()` entries are applied **after** route handlers, so a global
`Referrer-Policy` silently overrode the `no-referrer` set on the handoff responses
while a one-time token sat in the query string. Narrower per-path entries now exist
for `/api/launch/:path*` and `/auth/callback`, and regression tests pin both the
entries and their ordering.

### Adding a product (Registration, Housing, Pulse, Lead Retrieval)

1. `PRODUCT_APP_URL_ENV` entry in `apps/platform/lib/server/product-registry.ts`
2. a return-path case in `buildProductReturnPath`
3. a callback in the product that exchanges `token_hash` with its **anon** key
4. the product's own RBAC

`authorizeProductLaunch` is product-agnostic — asserted by a test that fails if
Orca-specific logic appears in it. No new authorization or handoff code is required.

## 4e. Environment contract (definitive, no secret values)

### `apps/platform`

| Variable | Exposure | Required |
|---|---|---|
| `NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL` | client | production |
| `NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY` | client | production |
| `NEXT_PUBLIC_PLATFORM_APP_URL` | client | production — drives `Secure` on cookies |
| `PLATFORM_CORE_SERVICE_ROLE_KEY` | **server-only** | production — never `NEXT_PUBLIC_` |
| `ORCA_APP_URL` | **server-only** | production — handoff destination |
| `NEXT_PUBLIC_ORCA_APP_URL` | client | optional fallback for the above |
| `PLATFORM_CORE_PROJECT_REF` | server-only | optional (scripts; defaults to the Platform ref) |
| `RLS_*` | server-only | local verification only |

`ORCA_APP_URL` is intentionally **not** `NEXT_PUBLIC_`: a product base URL is only
needed server-side, and `NEXT_PUBLIC_*` values are inlined at compile time.

### `apps/orca` — SSO-relevant only

| Variable | Exposure | Required |
|---|---|---|
| `NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL` | client | production |
| `NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY` | client | production |
| `NEXT_PUBLIC_ORCA_APP_URL` | client | production — drives `Secure` on cookies |
| `NEXT_PUBLIC_PLATFORM_CORE_APP_URL` | client | production — where sign-out returns |
| `NEXT_PUBLIC_PLATFORM_CORE_SIGN_IN_PATH` / `_SIGN_OUT_PATH` | client | optional |
| `PLATFORM_ENTITLEMENT_MODE` | server-only | production (`claims`) |
| `PLATFORM_PRODUCT_KEY` | server-only | optional (defaults `orca`) |
| `PLATFORM_CLAIM_MAX_AGE_SECONDS` | server-only | optional staleness bound |

**Orca requires no service-role key.** `src/lib/supabase/admin.ts` is the only
runtime reference, and its sole caller (`/api/admin/invite-user`) returns **410 Gone**
before constructing it whenever Platform Core is the authority. A second reference in
`product-token-secrets.ts` is Orca's *own legacy* key, accepted for **verification only**
of product tokens minted before the secret was split out — unrelated to authentication.

## 4f. Production configuration still required — NOT APPLIED

### Supabase (`wtbnpeluwhjjqccdofxd`)

**Required for Platform login:** Site URL `https://app.signalthread.ai`; Redirect URLs
`https://app.signalthread.ai/**` (email confirmation and password recovery land on
Platform's own `/auth/callback`).

**Required for the product handoff:** *nothing.* The handoff calls `verifyOtp`
directly and discards the generated link, so no Orca redirect entry is needed. Adding
one would be harmless but is not required by the implemented flow.

**Optional:** shorten OTP / magic-link lifetime to tighten the handoff window.

### Vercel — two independent projects

| | Platform | Orca |
|---|---|---|
| Repo | same monorepo | same monorepo |
| Root Directory | `apps/platform` | `apps/orca` |
| Include files outside root | **required** | **required** |
| Domain | `app.signalthread.ai` | `orca.signalthread.ai` |

"Include files outside Root Directory" is **required for both**: npm workspaces hoist
`node_modules` to the repository root, and `packages/signalthread-ui` is a workspace
dependency of both apps. Deployments, env scopes, runtimes, operational databases and
failure domains stay independent.

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
