# 05 — Housing Integration Checklist

The build order. Each step is independently verifiable — do not move on until the previous one is proved.

Legend: 🔧 code · 🗄 database · ☁️ infrastructure (needs Ali) · ✅ proof required

---

## Phase 0 — Orientation

- [ ] ✅ Run the existing stack locally and **launch Lead Retrieval from Platform in a real browser** (file 07). Watch all 7 hops in devtools.
- [ ] Read `apps/lead-retrieval/lib/platform/` end to end (~8 files) with `apps/lead-retrieval/docs/PLATFORM_LEAD_RETRIEVAL_HANDOFF.md` open alongside.
- [ ] Read `apps/platform/lib/server/{product-registry,product-launch,launch-decision,handoff,handoff-claim}.ts`.

**Proof:** you can draw the 7-hop chain from memory and say what each hop protects against.

---

## Phase 1 — Infrastructure

- [ ] ☁️ **Create the Housing Supabase project.** Ali provisions. Naming follows `signalthread-lead-retrieval`; propose `signalthread-housing`. Record the project ref.
- [ ] ☁️ Store credentials in `.local-secrets/housing-db.env` (gitignored, mode 600), matching the shape of `.local-secrets/lead-retrieval-db.env`: DB password, project ref, Supabase URL, anon key, service-role key, pooler URL.
- [ ] ☁️ **Create the Housing Vercel project** — Root Directory `apps/housing`, *Include files outside Root Directory* **enabled**, install/build commands left at default, Node 20+.
- [ ] ☁️ Decide and register the production domain (proposed `housing.signalthread.ai`).

> ⚠️ Never commit a `.env*.local` or anything under `.local-secrets/`. Both are gitignored; keep it that way.

**Proof:** `psql "$HOUSING_DB_URL" -c "select version();"` succeeds; an empty Vercel project exists.

---

## Phase 2 — App skeleton

- [ ] 🔧 `apps/housing/package.json` — name `housing`, `private: true`, Next.js. Dev script binds the port:
      `"dev": "next dev --port 3004"`
- [ ] 🔧 Root `package.json` — add the workspace scripts alongside the existing ones:
      `dev:housing`, `build:housing`, `test:housing`, `lint:housing`, `typecheck:housing`
      (pattern: `"dev:housing": "npm --workspace apps/housing run dev"`)
- [ ] 🔧 `apps/housing/.gitignore` including `.env*` ; `apps/housing/.env.example` with **names only, no values**
- [ ] 🔧 Wire `@signalthread/ui` and mirror the `--product-housing*` custom properties from `apps/platform/app/globals.css`
- [ ] ✅ `npm run boundaries` passes
- [ ] ✅ `npm run dev:housing` serves `http://localhost:3004`

---

## Phase 3 — Mapping columns (before any domain modelling)

Housing's own database. These three columns are the **entire** identity contract — see file 06 §2 for the exact DDL and the ambiguity rule.

- [ ] 🗄 `housing_users.platform_user_id uuid` — **UNIQUE where not null**
- [ ] 🗄 `<org-equivalent>.platform_organization_id uuid` — **deliberately NOT unique** (one Platform org may map to several Housing orgs)
- [ ] 🗄 `housing_events.platform_event_id uuid` — **UNIQUE where not null**
- [ ] 🗄 RLS enabled and **forced** on every table, deny-by-default, `anon` revoked (copy the Platform Core posture, file 02 §4)
- [ ] 🔧 Migrations live in `apps/housing/supabase/migrations/`, applied with `supabase db push --linked`
- [ ] 🔧 Generate `apps/housing/types/database.ts` from the project

**Proof:** migration applies cleanly to an empty project; the constraint catalog matches your intent.

---

## Phase 4 — Platform registry entry

Three small edits in `apps/platform/lib/server/product-registry.ts` — exact code in file 04 §2.

- [ ] 🔧 `PRODUCT_APP_URL_ENV.housing = ["HOUSING_APP_URL", "NEXT_PUBLIC_HOUSING_APP_URL"]`
- [ ] 🔧 `PRODUCT_AUTH_AUTHORITY.housing = "own"`
- [ ] 🔧 `buildProductReturnPath` — add `housing` to the `/platform-entry` branch
- [ ] 🔧 Add Housing cases to `apps/platform/lib/server/handoff.test.ts` mirroring the Lead Retrieval ones
- [ ] 🔧 Set `HOUSING_APP_URL=http://localhost:3004` in `apps/platform/.env.local`
- [ ] ✅ Platform test suite passes (`npm run test --workspace apps/platform`) — including the test asserting `authorizeProductLaunch` stays product-agnostic

**Proof:** with an entitled org, Platform's event page renders a launchable Housing card.

---

## Phase 5 — `/platform-entry` (the contract)

Port the Lead Retrieval module structure (file 04 §7). Build it in this order, proving each:

- [ ] 🔧 `lib/platform/platform-ids.ts` — canonical UUID validation/normalisation
- [ ] 🔧 `lib/platform/paths.ts` — path constants
- [ ] 🔧 `lib/platform/launch-state.ts` — nonce/correlator, cookie, 120s TTL, `timingSafeEqual`
- [ ] 🔧 `app/platform-entry/start/route.ts` — arm the browser, redirect to Platform with `state`
- [ ] 🔧 `lib/platform/platform-claim-client.ts` — POST the claim; **validate `product === "housing"` and that `platform_user_id` is a UUID**
- [ ] 🔧 `lib/platform/identity-mapping.ts` — pure mapping rules (file 06 §3)
- [ ] 🔧 `lib/platform/identity-mapping-supabase.ts` — real service-role loaders
- [ ] 🔧 `lib/platform/housing-authorization.ts` — Housing's own access decision
- [ ] 🔧 `lib/platform/establish-session.ts` — `getUserById` → `generateLink` → `verifyOtp`, id-checked at every step
- [ ] 🔧 `lib/platform/existing-session.ts` — `SESSION_CONFLICT` guard
- [ ] 🔧 `lib/platform/platform-entry-core.ts` — the decision order, **deps injected, no I/O**
- [ ] 🔧 `lib/platform/platform-entry-server.ts` — wiring
- [ ] 🔧 `app/platform-entry/route.ts` — thin handler + exception boundary → `500 INTERNAL_ERROR`
- [ ] 🔧 Middleware: exempt `/platform-entry*` from the auth redirect (Lead Retrieval uses an `isPlatformEntryPath` helper)

**Interim proof:** before mapping exists, have `/platform-entry` return a deliberate `501` *after* the claim succeeds. That proves hops 1–6 work before any domain code exists.

---

## Phase 6 — Live proof

Reproduce the Lead Retrieval validation. Do the **happy path first**, then the negative matrix.

Happy path:
- [ ] ✅ All 7 hops, final route `200`
- [ ] ✅ Housing session JWT `iss` = Housing's own project; `sub` = the mapped Housing user
- [ ] ✅ A row exists in Housing's `auth.sessions`
- [ ] ✅ No Platform Core session cookie is present in Housing's origin

Negative matrix — each must fail closed with the right code:
- [ ] ✅ `USER_MAPPING_NOT_FOUND` — **with a same-email user present** (proves you did not fall back to email)
- [ ] ✅ `EVENT_MAPPING_NOT_FOUND` — with a same-name event present
- [ ] ✅ `EVENT_ORGANIZATION_MISMATCH`
- [ ] ✅ `AMBIGUOUS_ORGANIZATION_MAPPING` — and **order-independent** (shuffle the candidate rows)
- [ ] ✅ Housing-side access denial (mapped, but no permission)
- [ ] ✅ Replay: reusing a spent handoff → `401 HANDOFF_INVALID`, both at `/platform-entry` and direct to the claim endpoint
- [ ] ✅ Launch-state sub-cases (missing / expired / mismatched / not-a-navigation) leave the handoff **unclaimed**
- [ ] ✅ `SESSION_CONFLICT` when another Housing user holds a live session in that browser

> 🐛 **Known gotcha:** Platform Core's GoTrue enforces a verify rate limit of roughly **30 verifications per 5 minutes per IP**. During a heavy proof run, claims start returning `401 HANDOFF_INVALID`. That is the rate limit, not a bug — wait five minutes. This cost a previous engineer real debugging time.

---

## Phase 7 — Domain build

Only now. File 06 has the proposal; file 09 has the questions to settle first.

- [ ] Room blocks, hotels, rate plans, reservations, rooming lists
- [ ] Housing's own RBAC
- [ ] The workspace UI
- [ ] Decide whether to publish a `ProductFeed` to Platform's event dashboard (file 06 §5)

---

## Phase 8 — Production readiness

- [ ] ☁️ Vercel env vars set in the Housing project (never in a committed file)
- [ ] ☁️ `HOUSING_APP_URL` set in the **Platform** Vercel project
- [ ] ☁️ Supabase auth config as code in `apps/housing/supabase/config.toml` (site URL, redirect allow-list) — Lead Retrieval does this
- [ ] ☁️ Grant the `housing` entitlement to pilot organizations (service-role provisioning; Ali)
- [ ] 🔧 Confirm `next.config.ts` headers do not override `/platform-entry` security headers (file 03 §7)
- [ ] ✅ Full suite, typecheck, lint, `npm run boundaries`, production build

---

## The definition of done for the integration

> A user signs in at `app.signalthread.ai`, opens an event whose organization holds an ACTIVE `housing` entitlement, clicks Housing, and lands in the Housing workspace for that event — authenticated in Housing's own auth project, scoped to the mapped Housing organization, with no Platform Core credential anywhere in Housing, and with every denial path proved to fail closed.
