# Platform Core Integration Audit

- **Product:** SignalThread Voice (repo `booth-audio` / GitHub `voxsignal`, Vercel project `voxsignal`, prod host `https://voice.signalthread.ai`)
- **Audit result:** READY WITH CHANGES
- **Central-auth difficulty:** MEDIUM
- **Global-ID difficulty:** MEDIUM
- **RLS difficulty:** LOW (there is no RLS to adapt — see the security caveat below)
- **Estimated implementation effort for this repo:** ~3–5 engineer-weeks, assuming full reseed and no legacy-data migration
- **Biggest risk:** The product hard-codes **one user = one account** in both schema (`User.accountId` singular) and code (invite returns `email_other_account`). Platform Core multi-org membership cannot be represented at all today. Second: `Supabase anon key + zero RLS` — must be verified before a second Supabase project joins the estate.

> Audit date: 2026-08-07, branch `main` at `2353836` with a dirty working tree. Discovery only — no code, schema, migration, or Supabase change was made.

---

## Product

**SignalThread Voice.** A multi-tenant, voice-first feedback and event-intelligence product. A public kiosk collects spoken/text/rating answers from attendees or customers, OpenAI transcribes and analyses them, and authenticated operators get evidence-backed signals, issue clusters, and action workflows.

It serves two experiences on one codebase, split solely by `Account.accountType`:

- **SMB/retail** — location-based ongoing feedback, surveys, review conversion (`app/app/page.tsx`, `components/admin/Dashboard2.tsx`).
- **Voice Events** — event setup, agenda/speakers, targeted listening points, live intelligence, actions, closeout (`app/app/events/[eventId]/**`, `components/events/**`).

The product-mode boundary is `getAccountProductMode()` in [lib/account-product-mode.ts](lib/account-product-mode.ts) — `events` only when `accountType === 'EVENTS'`. The presence of an `Event` row does **not** imply Events mode; retail uses the same `Event` table as a feedback-campaign container.

---

## Executive Summary

Voice is architecturally well-positioned for Platform Core, for one dominant reason: **Supabase is used only for authentication.** All product data flows through Prisma over a direct Postgres connection. There is not a single `supabase.from(...)` data call, no Supabase Storage, and no Supabase Realtime. That means swapping the identity provider touches the auth seam and nothing else in the data path.

Four things make this a "with changes" rather than "ready":

1. **Identity is single-tenant by construction.** `User.accountId` is a single nullable FK. `inviteOrResendAccountUser` explicitly rejects a user who already belongs to another account ([lib/account-users.ts:157](lib/account-users.ts#L157)). There is no membership table, no account switcher, and no multi-org UI anywhere in the repo.
2. **Organization context travels as an untrusted URL query parameter.** Every authenticated page and API route reads `?account=<slug>` and re-resolves the account by slug, then checks membership. ~50 server call sites. This is the single largest mechanical change surface.
3. **Tenant isolation is 100% application-layer.** 39 migrations contain zero `ENABLE ROW LEVEL SECURITY`, zero `CREATE POLICY`, zero `auth.uid()`. Prisma connects as the Supabase `postgres` superuser, so RLS would be bypassed even if it existed. A missed guard is a direct cross-tenant read — and there are currently several missed guards (see RLS & Authorization).
4. **Event has no `accountId`.** Ownership is `Account → Location → Event`, so every authorization check joins through `Location`. Platform Core will hand this product an `(organization_id, event_id)` pair, and the product cannot verify that pair without a join today.

The good news on IDs: **every primary key in the schema is `String`.** `User.id` is already the Supabase auth UUID. `Account.id` and `Event.id` are cuids but the column type accepts a Platform Core UUID unchanged. Adopting canonical global IDs requires no column-type migration — only a reseed.

There is also already a working precedent for identity re-pointing: [lib/auth/link-user-identity.ts](lib/auth/link-user-identity.ts) reconciles a Prisma `User` row onto a new auth user ID and rewrites all 13 loose user-reference columns inside a transaction. That is the exact mechanism Platform Core adoption needs, already written and tested.

---

## Current Architecture

**Framework/runtime.** Next.js 14.1.0 App Router, React 18, TypeScript 5.3. All API routes declare `runtime = 'nodejs'` and `dynamic = 'force-dynamic'`. Deployed on Vercel (`.vercel/project.json` → project `voxsignal`, org `team_Cigyjg2gZgnsB9Px0q5ihgvg`). Local dev has `docker-compose.yml` for Postgres + MinIO.

**Supabase project usage.** Exactly one Supabase project, used **only for GoTrue auth**. `supabase/` contains no `config.toml` and no migrations — only CLI scratch metadata in `supabase/.temp/`. Prisma Migrate is the sole schema authority.

**Database access.** Prisma 5.22 against Supabase Postgres. Singleton proxy in [lib/prisma.ts](lib/prisma.ts) with lazy initialisation. `DATABASE_URL` points at the pgbouncer transaction pooler (port 6543); `DIRECT_URL` at the session pooler (5432) for migrations. The connection role is `postgres` — superuser, `BYPASSRLS`.

**Client vs server Supabase access.** Four clients in [lib/supabase/](lib/supabase/):
- `client.ts` — `createBrowserClient` + anon key. Used only by `app/login/page.tsx` and `components/admin/SettingsMenu.tsx` (sign-out).
- `server.ts` — `createServerClient` + anon key + cookies. Used by every `require*` guard.
- `middleware.ts` — cookie refresh, invoked only for `/admin*`.
- `admin.ts` — service-role client, `persistSession: false`. Documented for admin-only operations.

**No product data is ever read or written through supabase-js.** Grep for `.from(` across `app/`, `lib/`, `components/` returns zero non-JS-builtin hits.

**ORM/query layer.** Prisma only. No raw SQL in application paths; no query builder abstraction; no repository layer. Domain services live in `lib/**` (117 top-level modules plus `lib/event-intelligence/`, `lib/event-actions/`, `lib/insights/`, `lib/analytics/`).

**API/server routes.** 65 `app/api/**/route.ts` handlers, 26 `page.tsx` routes. **Zero Server Actions** (`"use server"` has no hits). All mutations are `fetch` → route handler.

**Background jobs/workers.** None. No cron, no queue, no `vercel.json`, no `waitUntil`. Audio processing is an **unawaited floating promise** inside the request handler ([app/api/answer/confirm/route.ts:131](app/api/answer/confirm/route.ts#L131)); the route returns 200 immediately and the client polls ([lib/hooks/useSummaryPolling.ts](lib/hooks/useSummaryPolling.ts)). The only GitHub workflows are `migrate-prod.yml` (manual `workflow_dispatch`) and a Codex PR-review bot.

**Storage.** S3-compatible via AWS SDK v3 — Cloudflare R2 in production, MinIO locally. [lib/objectStorage.ts](lib/objectStorage.ts) is canonical; [lib/s3.ts](lib/s3.ts) is a deprecated shim. **Supabase Storage is not used.**

**Realtime.** Not used. See the Realtime section.

**External integrations.** OpenAI (Whisper + chat), Google Cloud TTS, Stripe, Resend, S3/R2, Google Analytics. All via global product-level API keys.

**Deployment/environment.** Vercel + Supabase Postgres + R2. Env split across `.env`, `.env.local`, `env.example`, `.env.local.example`, with several disabled `.env.prod.*` variants. Cross-property URLs: `getAppUrl()` falls back to `https://voice.signalthread.ai` ([lib/app-url.ts:8](lib/app-url.ts#L8)); `MARKETING_SITE_URL` defaults to `https://www.signalthread.ai` in prod, `http://localhost:5173` in dev.

---

## Authentication

**Method: passwordless email OTP only.** No passwords, no OAuth providers, no social auth. `app/auth/reset/page.tsx` is a stub that redirects to `/login` with the comment *"Password reset flow removed (passwordless auth)."*

**Initialisation.** `lib/supabase/{client,server,admin,middleware}.ts`. Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

**Login flow.** [app/login/page.tsx](app/login/page.tsx):
1. On mount, `supabase.auth.getSession()`; if a session exists, `POST /api/auth/link-user` and redirect.
2. Email step → `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })` (line 56). Existing users only.
3. Code step → `completeEmailOtpSignIn(email, code)` ([lib/auth/complete-email-otp.ts](lib/auth/complete-email-otp.ts)) → `verifyOtp` → `POST /api/auth/link-user`.

**Signup/invite flow.** Three entry points, all creating a `PendingProvision` row rather than a `User`:
- Self-serve Stripe: `POST /api/billing/checkout` (unauthenticated) creates a pending `Account` + Location + Stripe Checkout session; the Stripe webhook activates it; `lib/provisioning.ts:103` sends the OTP.
- Platform admin: `app/admin/provision`, `POST /api/admin/provision-{retail,events,test-link}`.
- Account team invite: `POST /api/app/account/users` → `inviteOrResendAccountUser` ([lib/account-users.ts](lib/account-users.ts)) creates/updates `PendingProvision` and sends an OTP.

**Session creation.** `app/auth/callback/route.ts` handles both PKCE (`?code=` → `exchangeCodeForSession`) and OTP/invite (`?token_hash=&type=` → `verifyOtp`), then redirects to `/api/auth/link-user?next=...`.

**The identity seam.** [app/api/auth/link-user/route.ts](app/api/auth/link-user/route.ts) is the single most important file for Platform Core. It:
1. Reads the Supabase session user.
2. Computes `isSuperAdmin` from the `SUPER_ADMIN_EMAILS` env allowlist.
3. Calls `linkAuthenticatedUser(prisma, { authUserId, email, isSuperAdmin })`.
4. Chooses the landing route: `/admin` for super admins, otherwise **`/app?account=${dbUser.account.slug}`** — this is where organization context is assigned, once, at login.

**Identity reconciliation.** [lib/auth/link-user-identity.ts](lib/auth/link-user-identity.ts) is the mechanism to reuse for global IDs:
- Looks up `User` by auth ID and by normalized email; a mismatch throws `AuthIdentityConflictError` (409).
- If found by email only, it **rewrites `User.id` to the auth user ID** and re-points 13 loose user-reference columns via `updateUnconstrainedUserReferences` (lines 48–66), all inside a `$transaction`.
- If neither exists, `resolveNewUserAccess` consumes a `PendingProvision`, falls back to legacy `Admin`, then to a **hard-coded demo domain map** (`acmecoffee.com → acme-coffee`, `techconf.io → techconf-events`, lines 115–120). That fallback auto-joins any user with those email domains to a seeded account — remove it before production.

**Session refresh.** [middleware.ts](middleware.ts) matches **only** `/admin` and `/admin/:path*`. `/app/*` gets no middleware refresh; guards call `supabase.auth.getUser()` per request.

**Logout.** `components/admin/SettingsMenu.tsx:102` → `supabase.auth.signOut()`.

**Server-side verification helpers** (`lib/auth/`), all keyed on `?account=<slug>`:

| Helper | Behaviour |
|---|---|
| `requireAccountMembership(slug, {allowSuperAdmin})` | `getUser()` → account by slug → `User.accountId === account.id`; **or** session email matches `Account.email`. Denies cross-account. Super admin rejected unless opted in. |
| `requireAccountAdmin(slug)` | Super-admin passthrough, else membership + `isAccountAdminForAccount` ([lib/auth/account-admin-policy.ts](lib/auth/account-admin-policy.ts)). |
| `requireEventAccess(slug, eventId)` | Membership + `Event.location.accountId === account.id`. |
| `requireEventsEventAccess(slug, eventId)` | The above **plus** `accountType === 'EVENTS'`. |
| `requireSuperAdminForPage/ForApi()` | `User.role === 'SUPER_ADMIN'`. |
| `isSuperAdminActor(user, dbUser)` | `SUPER_ADMIN_EMAILS` env allowlist **OR** `role === SUPER_ADMIN`. |

**Client-side verification.** None that matters. `app/app/layout.tsx` is `'use client'` with **no auth at all** — every `/app/*` page renders publicly; protection comes entirely from the API calls it makes. Only `app/admin/layout.tsx` has a server-side page guard.

**JWT/cookies.** Standard `@supabase/ssr` cookie handling. No custom claims are read or written anywhere. The product never inspects the JWT directly — it always calls `auth.getUser()`.

**Service-role usage is tightly scoped — exactly two production call sites.** [lib/account-deletion.ts:53](lib/account-deletion.ts#L53) loops `auth.admin.deleteUser` over an account's users, and [lib/account-users.ts:102](lib/account-users.ts#L102) paginates `auth.admin.listUsers` (up to 20 pages × 1000) purely to produce a better error message on invite collision. Notably, **the service role is *not* used to create users**: despite the doc comment in `lib/supabase/admin.ts`, invites and provisioning create the Supabase auth user via the *anon-key* `signInWithOtp({ shouldCreateUser: true })` path ([lib/provisioning.ts:363](lib/provisioning.ts#L363), [lib/account-users.ts:44](lib/account-users.ts#L44)). Login itself uses `shouldCreateUser: false`, so login cannot self-register.

**Session-refresh gap.** Only two code paths actually persist a refreshed token: `lib/supabase/middleware.ts` (which runs on `/admin*` only) and `createRouteHandlerClient` inside `/api/auth/link-user`. Everywhere else uses `lib/supabase/server.ts::createClient`, whose cookie writes are wrapped in a `try/catch` that silently swallows the RSC write error — so `/app/*` sessions are refreshed only incidentally.

**Files affected when this product stops owning identity:**

| File | Why |
|---|---|
| [app/api/auth/link-user/route.ts](app/api/auth/link-user/route.ts) | The identity seam and the org-routing decision |
| [lib/auth/link-user-identity.ts](lib/auth/link-user-identity.ts) | ID reconciliation + `PendingProvision` consumption + demo-domain fallback |
| [lib/auth/require-account-membership.ts](lib/auth/require-account-membership.ts) | The membership predicate every other guard builds on |
| [lib/auth/require-events-event-access.ts](lib/auth/require-events-event-access.ts) | Event scoping via `location.accountId` |
| [lib/auth/require-account-admin.ts](lib/auth/require-account-admin.ts), [lib/auth/account-admin-policy.ts](lib/auth/account-admin-policy.ts) | Admin policy |
| [lib/auth/super-admin.ts](lib/auth/super-admin.ts), [lib/auth/require-super-admin.ts](lib/auth/require-super-admin.ts) | Platform role — should become a Platform Core role |
| [lib/supabase/server.ts](lib/supabase/server.ts), [client.ts](lib/supabase/client.ts), [middleware.ts](lib/supabase/middleware.ts), [admin.ts](lib/supabase/admin.ts) | Point at the Platform Core project |
| [app/login/page.tsx](app/login/page.tsx), [app/auth/callback/route.ts](app/auth/callback/route.ts), [lib/auth/complete-email-otp.ts](lib/auth/complete-email-otp.ts) | Login UI/flow likely moves to Platform Core entirely |
| [lib/account-users.ts](lib/account-users.ts), [lib/provisioning.ts](lib/provisioning.ts) | Invite/provision creates auth users — becomes a Platform Core responsibility |
| [lib/account-deletion.ts](lib/account-deletion.ts) | Deletes Supabase auth users; must stop deleting global identities |
| [middleware.ts](middleware.ts) | Matcher scope |
| [tests/mocks/auth.ts](tests/mocks/auth.ts) | Central mock for `auth.getUser()` — one file covers most route tests |

---

## User Model

**Canonical table: `User`** ([prisma/schema.prisma:1449](prisma/schema.prisma#L1449)).

```prisma
model User {
  id        String   @id            // Supabase user.id (uuid) — no default
  email     String   @unique
  firstName String?
  lastName  String?
  role      UserRole @default(ADMIN) // SUPER_ADMIN | ADMIN | MANAGER | VIEWER
  accountId String?                  // NULL = SUPER_ADMIN, set = account-scoped
  isActive  Boolean  @default(true)
}
```

**`auth.users.id` IS the product's user identity.** `User.id` has no `@default` — it is always the Supabase auth UUID, assigned in `linkAuthenticatedUser`. There is no separate profile table; `User` *is* the profile.

**Email is a first-class identifier**, in four independent places:
1. `User.email @unique` and lookup-by-email in reconciliation.
2. `requireAccountMembership` grants access when `session.email === Account.email` even with no `User` row ([lib/auth/require-account-membership.ts:122](lib/auth/require-account-membership.ts#L122)).
3. `PendingProvision.email @unique` and `Admin.email @unique` are the invite keys.
4. `SUPER_ADMIN_EMAILS` env allowlist grants platform-admin power by email string.

**Foreign keys to `User.id`:** only two — `EventAgendaImportJob.createdByUserId` / `confirmedByUserId`, and `TestSignupToken.createdByUserId`. Everything else is a **loose `String` column with no FK**, which is why `updateUnconstrainedUserReferences` exists:

`EventIssueCluster` (`ownerUserId`, `ownerAssignedByUserId`, `acknowledgedByUserId`, `actingByUserId`, `resolvedByUserId`, `dismissedByUserId`, `reopenedByUserId`, `actionConvertedByUserId`), `EventActionHistory.actorUserId`, `EventActionUpdate.authorUserId`, `EventActionAssignmentDelivery` (`recipientUserId`, `assignedByUserId`, plus a denormalized `recipientEmail`), `EventAlertNote.authorUserId`.

**Multi-org: not possible today.** `User.accountId` is singular. `inviteOrResendAccountUser` returns `email_other_account` (409) when the email belongs to a different account ([lib/account-users.ts:157](lib/account-users.ts#L157)). `requireAccountMembership` returns 403 for any cross-account attempt. There is no account switcher component anywhere in `components/`; `app/api/auth/link-user/route.ts` picks the one account at login.

**Roles are account-global.** `UserRole` lives on `User`, not on a membership. There are **no event-scoped roles and no per-location roles**. `MANAGER`/`VIEWER` exist in the enum but the only differentiation implemented is admin-vs-not via `account-admin-policy.ts`. `Admin`/`AdminRole` is a legacy deprecated table with a `password` column, still present but unused by the auth path.

**Invitations do not create `User` rows.** They create `PendingProvision`; the `User` row appears on first successful login, when `resolveNewUserAccess` consumes the provision.

**Conflicts with a global SignalThread `user_id`:**

| Conflict | Location |
|---|---|
| Single account per user | `User.accountId`, invite 409, no membership table |
| Email as access grant | `require-account-membership.ts:122` — a Platform Core user whose email happens to match `Account.email` gets in with no membership |
| Super admin by env email list | `lib/auth/super-admin.ts:11-15` |
| Hard-coded demo domain → account mapping | `link-user-identity.ts:115-120` |
| Product deletes global auth users | `lib/account-deletion.ts` |
| Product creates auth users | `lib/account-users.ts`, `lib/provisioning.ts` |

---

## Organization Model

**Canonical table: `Account`** ([prisma/schema.prisma:15](prisma/schema.prisma#L15)) — the tenant. PK `id String @id @default(cuid())`, plus `slug String @unique`, which is the identifier actually used everywhere in the app.

There is a **second level below it: `Location`** ([prisma/schema.prisma:72](prisma/schema.prisma#L72)) — `@@unique([accountId, slug])`, carries `timezone`, address, `googleReviewUrl`. The hierarchy is `Account → Location → Event`. In practice provisioning creates exactly one "primary" Location per account (`createPrimaryLocationForAccount`, [lib/provisioning.ts:25](lib/provisioning.ts#L25)); for Events accounts it functions as the account-level event workspace rather than a physical venue (`Event.venue` is the free-text physical place).

**How users are attached.** `User.accountId` (nullable, single) and legacy `Admin.accountId`. No join table.

**How permissions are attached.** `User.role` (account-global) + `isSuperAdminActor`. No per-org, per-location, or per-event permission rows.

**How events are attached.** Indirectly: `Event.locationId → Location.accountId`. `Event` has **no `accountId` column**. Every authorization check pays a join:

```ts
prisma.event.findFirst({ where: { id: eventId, location: { accountId } } })
```
([lib/auth/require-events-event-access.ts:23](lib/auth/require-events-event-access.ts#L23))

Twelve downstream tables *do* denormalize `accountId` (`AnswerEventIntelligence`, `EventIntelligenceAggregate`, `EventIssueCluster`, `EventIssueEvidence`, `EventAlertNote`, `EventActionHistory`, `EventActionUpdate`, `EventActionAssignmentDelivery`, `EventActionDeliveryAttempt`, `EventSpeakerProfile`, `EventSessionSpeakerAssignment`, `EventAgendaImportJob`) — so the pattern is established; `Event` is the gap.

**Multiple organizations per user:** no. See User Model.

**Where organization IDs are embedded:**

| Surface | Form | Detail |
|---|---|---|
| URLs | `?account=<slug>` | Every `/app/*` page and ~50 API routes. Never a path segment. Only `app/api/admin/accounts/[accountId]/route.ts` uses `accountId` in a path. |
| JWT | none | No org claim; no custom claims at all. |
| Cookies | none | Only Supabase auth cookies. Historical `mock_account_id` cookie was removed. |
| localStorage | none | Only `'theme'`. |
| Client cache | in-memory | [lib/account-context-client.ts](lib/account-context-client.ts) — 60s TTL `Map`, keyed by slug, fetches `/api/app/account?account=<slug>&scope=context`. |
| Storage paths | `Account.id` | `branding/{accountId}/logo-*`, and `eventActionVoiceObjectPrefix(accountId, eventId, actionId)`. |
| Stripe | `Account.id` | `metadata.accountId` on the Checkout session; `stripeCustomerId`/`stripeSubscriptionId` on `Account`. |

**Duplicated concepts Platform Core should replace:** `Account` identity and naming (`name`, `slug`, `email`, `isActive`), `Account.tier` + `trialEndsAt` (entitlement), and the `SUPER_ADMIN` role. Note that `tier` is currently stored but **not enforced anywhere** — grep shows it is only written at provisioning and read for display. The only real entitlement gate in the product is `accountType === 'EVENTS'`.

**Product-owned vs Platform Core reference:**

- **Becomes a reference to Platform Core:** organization identity (`id`, `name`, `slug`, contact email, active flag), membership, roles that are platform-level, module entitlement (`accountType`/`tier`), billing (`stripeCustomerId`, `stripeSubscriptionId`, `billingJson`, `trialEndsAt`).
- **Stays product-owned:** `Account.settingsJson` (Voice branding, TTS defaults, consent copy), the entire `Location` layer, and everything below it.

---

## Event Model

**Canonical table: `Event`** ([prisma/schema.prisma:124](prisma/schema.prisma#L124)). PK `id String @id @default(cuid())`. Owner: `locationId` (required). No `accountId`.

Key fields: `name`, `description`, `responseMode`, `eventType`, `status` (`EventStatus`: DRAFT/ACTIVE/PAUSED/COMPLETED/ARCHIVED), `isActive`, `startDate`/`endDate`, `listeningWindowOpensAt`/`ClosesAt`, `venue`, `templateKey`, `questionsJson` (legacy), `ttsProvider`/`ttsVoice`/`ttsLocale`.

**Creation.** `POST /api/app/events?account=<slug>` ([app/api/app/events/route.ts:71](app/api/app/events/route.ts#L71)) — `requireAccountMembership({allowSuperAdmin:true})`, requires `locationId`, optional template expansion that seeds `EventStructureItem` rows and recommended surveys. Also created during provisioning (`lib/provisioning.ts` seeds a retail kiosk event) and by the demo seeder (`scripts/seed-voice-events-demo.ts`).

**Deletion/archive.** `DELETE /api/app/events/[eventId]` ([app/api/app/events/[eventId]/route.ts:381](app/api/app/events/[eventId]/route.ts#L381)). Archive is `status = ARCHIVED`. Prisma cascades handle children. Whole-account purge is `deleteAccountAsSuperAdmin` ([lib/account-deletion.ts](lib/account-deletion.ts)) — cascades Prisma, best-effort deletes S3 objects, and deletes the linked Supabase auth users.

**Ownership / membership.** Ownership is `Event.location.accountId`. **There is no user↔event membership model.** Any active member of the owning account can access every event in that account. Lifecycle logic is spread across `lib/events-home-groups.ts`, `lib/event-workspace-lifecycle.ts`, `lib/event-lifecycle.ts`, `lib/survey-availability.ts`, `lib/event-listening-window.ts`.

**Timezone/date handling.** `Location.timezone` (default `America/New_York`) is the account-level default; `EventStructureItem.timezone` and `Survey.availabilityTimezone` can override per session/survey. Helpers: `lib/event-dates.ts`, `lib/event-day.ts`, `lib/event-agenda-time.ts`.

**Where the local event ID is assumed authoritative:**

| Surface | Detail |
|---|---|
| Authenticated routes | `/app/events/[eventId]`, `/dashboard`, `/edit`, `/surveys/new`; `/admin/events/[eventId]`, `/responses`, `/responses/[responseId]` |
| API paths | 23 routes under `/api/app/events/[eventId]/**`; 6 legacy routes under `/api/events/[eventId]/**` |
| **Public kiosk URLs** | `/kiosk?eventId=<id>` and `GET /api/kiosk/event-details?eventId=<id>` ([app/api/kiosk/event-details/route.ts:21](app/api/kiosk/event-details/route.ts#L21)). **Event IDs are printed on QR codes and signage** (`lib/event-signage.ts`, `lib/qr-download.ts`). |
| Storage paths | `eventActionVoiceObjectPrefix(accountId, eventId, actionId)` ([app/api/app/events/[eventId]/actions/[actionId]/voice/route.ts:88](app/api/app/events/[eventId]/actions/[actionId]/voice/route.ts#L88)) |
| Database | 22 tables carry `eventId`; `EventStructureItem` has `@@unique([eventId, id])` and `EventSessionSpeakerAssignment` uses a composite FK `(eventId, sessionId)` |
| Background work | None — no jobs carry event IDs (there are no jobs) |
| Dev instrumentation | `lib/development-route-timing.ts:30` keys on `route:account:eventId` |

**Safest way to adopt a canonical Platform Core `event_id`.**

`Event.id` is `String` with a `cuid()` default, not a native `uuid` column. A Platform Core UUID drops into that column with **no type change and no migration** — only a default change and reseed. Given "no real customers, reseed freely", the recommendation is:

1. **Make `Event.id` be the Platform Core `event_id`.** Do not add a parallel `platformEventId` column — a dual-ID model would require touching all 22 `eventId` FKs, every route, and every QR code already printed, and would leave two IDs to keep in sync forever.
2. **Platform Core mints the event; this product creates the local row with that ID.** Change `POST /api/app/events` to accept a caller-supplied `id`, and drop `@default(cuid())` (or keep it only for a local-only fallback path).
3. **Add `Event.accountId`** as a denormalized column alongside `locationId`, matching the 12 tables that already do this. This lets guards verify the `(organization_id, event_id)` pair Platform Core asserts without a join, and removes the `Location` layer from the hot authorization path.
4. **Reseed rather than migrate.** `scripts/seed-voice-events-demo.ts` and `prisma/seed-multi-tenant.ts` already exist; `deleteAccountAsSuperAdmin` already exists for teardown.

The one thing to check before flipping: any live QR code or printed signage carrying an old cuid becomes a dead link. That is acceptable pre-customer but must be a hard gate in the cutover checklist.

---

## Product-Owned Data

### Should remain owned by this product

| Domain | Tables |
|---|---|
| Workspace/venue structure | `Location` |
| Event configuration | `Event` (config columns), `EventStructureItem`, `Question`, `QuestionAudioAsset` |
| Speakers & agenda | `EventSpeakerProfile`, `EventSessionSpeakerAssignment`, `EventAgendaImportJob`, `EventAgendaImportRow` |
| Survey/listening plan | `SurveyTarget`, `Survey`, `PublicSurveyLink` |
| Capture | `Response`, `Answer`, `AnswerTranscript`, `AnswerAnalysis`, `AnswerProcessingLog` |
| Intelligence | `AnswerEventIntelligence`, `AnswerEventTheme`, `AnswerEventEntity`, `AnswerEventAction`, `EventIntelligenceAggregate`, `EventIssueCluster`, `EventIssueEvidence`, `Insight`, `InsightSourceAnswer` |
| Operator workflow | `EventActionHistory`, `EventActionUpdate`, `EventActionAssignmentDelivery`, `EventActionDeliveryAttempt`, `EventAlertNote` |
| Legacy capture (to delete) | `Session`, `Transcript`, `Analysis`, `ProcessingLog` |
| Product settings | `Account.settingsJson`, `Location.settingsJson` |

None of this should move to Platform Core. It is high-volume operational data that references an event but is not *about* the event.

### Should move / become owned by Platform Core

| Concept | Today |
|---|---|
| Global user identity | `User.id`, `User.email`, `User.firstName/lastName`, `User.isActive` |
| Organization identity | `Account.id`, `name`, `slug`, `email`, `phone`, `isActive` |
| Organization membership + role | `User.accountId`, `User.role`; legacy `Admin` |
| Invitations | `PendingProvision`, `TestSignupToken` |
| Canonical event record | `Event.id`, `name`, `startDate`, `endDate`, `status` (mirrored, not owned) |
| Module entitlements | `Account.accountType`, `Account.tier`, `Account.trialEndsAt` |
| Billing | `Account.stripeCustomerId`, `stripeSubscriptionId`, `billingJson` |
| Platform admin role | `UserRole.SUPER_ADMIN`, `SUPER_ADMIN_EMAILS` |

### Needs discussion

- **`Location`.** Sits between org and event and holds `timezone` + address. Is this a Voice-only workspace concept, or does Platform Core have a venue/site concept other products also need? Recommendation: keep product-owned for now, mirror nothing.
- **`Account.accountType` (`RETAIL` / `EVENTS` / `HOSPITALITY`).** It is simultaneously a *product mode* and an *entitlement*. Platform Core should own the entitlement; Voice still needs a local rendering mode. These may not be the same axis.
- **`EventSpeakerProfile`.** Account-scoped person records with name/email/headshot. If Orca or Lead Retrieval also model speakers, this is a candidate shared entity. If not, keep it in Voice.
- **`Event.name` / dates.** Owned by Platform Core but read constantly by Voice for display and lifecycle computation. Cache locally or query per request? See High-Volume Paths — the answer must be "cache locally".
- **`Account.settingsJson`.** Contains branding (logo, colours) that Platform Core may also want for a unified shell.

---

## RLS & Authorization

**There is no Row Level Security in this repository. None.**

Exhaustive search across all 39 migration directories and `supabase/` for `ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`, `auth.uid()`, `auth.jwt()`, `GRANT`, `REVOKE`, `SECURITY DEFINER`, and any `auth.` schema reference returns **zero matches**. Every migration is pure Prisma DDL. RLS appears only as unimplemented documentation (`docs/MULTI_TENANCY.md:222-238` shows an example policy using `current_setting('app.current_account_id')` that was never applied; `docs/IMPLEMENTATION_SUMMARY.md:276` has it as an unchecked TODO).

**Tables with RLS enabled:** none.
**Tables without RLS that should concern us:** all of them.
**Policies based on `auth.uid()` / org IDs / event IDs:** none exist.

**Prisma connects as the `postgres` superuser** (`DATABASE_URL` role is `postgres`, Supabase's `BYPASSRLS` superuser). Adding RLS policies today would have **zero effect** on the application's queries — the app is not the `authenticated` or `anon` role and carries no JWT, so `auth.uid()` would return NULL.

**Classification for Platform Core:** since there are no policies, there is nothing to *adapt*. RLS difficulty is **LOW** in the sense that no policy rewrite is needed. The real work is a **complete design** decision: whether Platform Core's arrival is the moment to introduce RLS at all. If yes, the app must first move off the superuser role — otherwise the policies are decorative.

**Can central Platform Auth safely coexist with this product's current model?** Yes, mechanically — because RLS is absent, there is no `auth.uid()`-based policy that would break when the issuing project changes. The database does not care who issued the JWT; it never sees one. This is simultaneously the reason integration is easy and the reason the current posture is weak.

**Security concerns found in the actual code:**

| Finding | Location | Severity |
|---|---|---|
| **Anon key + no RLS.** The anon key is published to browsers (`NEXT_PUBLIC_SUPABASE_ANON_KEY`). If PostgREST exposes the `public` schema (Supabase default) with RLS off, anyone can read/write every table at `https://<ref>.supabase.co/rest/v1/<Table>`, entirely bypassing the app. **Not verified against the live project** — this audit made no Supabase changes or queries. Must be verified. | Supabase project config | Security concern / potential BLOCKER |
| **`GET /api/app/insights/[insightId]/drilldown` has no authentication.** It reads `?account=<slug>`, resolves the account, and returns drill-down answers and transcript text. No `getUser()` call anywhere in the file. | [app/api/app/insights/[insightId]/drilldown/route.ts:19-38](app/api/app/insights/[insightId]/drilldown/route.ts#L19) | Security concern |
| **`POST /api/app/account/logo-presign` and `/logo-upload` have no authentication.** Both accept a caller-supplied account slug and issue an S3 presigned PUT to `branding/{accountId}/…`. | [app/api/app/account/logo-presign/route.ts:47](app/api/app/account/logo-presign/route.ts#L47) | Security concern |
| **`GET /api/app/logo?key=<any>` proxies arbitrary bucket objects** with no auth and no key validation. | [app/api/app/logo/route.ts](app/api/app/logo/route.ts) | Security concern |
| **Six legacy `/api/events/[eventId]/*` routes are public by design**, exposing responses, answers, transcripts, and an analysis-recompute POST to anyone holding an event ID — and event IDs are printed on public QR codes. **Important correction to the "just delete them" instinct: `/responses/[responseId]` is the live kiosk completion-polling endpoint**, hit once per second per in-flight response by `useSummaryPolling`. It must be replaced, not removed. | `app/api/events/[eventId]/{analysis,analysis/recompute,answers,questions,responses,responses/[responseId]}/route.ts` | Security concern |
| **`POST /api/provision/start` is a fully public account-creation endpoint** — self-documented as "Public endpoint". Anyone can create accounts with caller-supplied name/slug/owner-email and trigger OTP emails to arbitrary addresses. | [app/api/provision/start/route.ts:11](app/api/provision/start/route.ts#L11) | Security concern |
| **`/api/answer/*` accepts any well-formed `responseId`** with no token or session check. A leaked or guessed cuid lets an outsider write answers into someone else's response. | `app/api/answer/{presign,complete,confirm,text,structured}/route.ts` | Security concern |
| **Auth cookies lose their security flags.** `copyCookies` in the link-user route re-emits refreshed Supabase cookies as `{name, value, path:'/'}` only, discarding `httpOnly`, `secure`, `sameSite`, and `maxAge`. | [app/api/auth/link-user/route.ts:72-76](app/api/auth/link-user/route.ts#L72) | Security concern |
| **Sessions in `/app/*` are never refreshed.** `lib/supabase/server.ts` silently swallows cookie-write failures in Server Components, and `middleware.ts` matches only `/admin*` — so refreshed tokens are persisted only when a request happens to hit `/api/auth/link-user`. | [lib/supabase/server.ts:46-57](lib/supabase/server.ts#L46), [middleware.ts](middleware.ts) | Needs adaptation |
| **`SUPER_ADMIN_EMAILS` matching is inconsistent** — case-sensitive in `super-admin.ts:15`, lowercased in `link-user/route.ts:38`. The same env entry can grant platform admin in one code path and not the other. | [lib/auth/super-admin.ts:15](lib/auth/super-admin.ts#L15) | Needs adaptation |
| **The email-match membership path returns a `userId` with no `User` row.** Any downstream write that stores that ID creates a dangling reference. | [lib/auth/require-account-membership.ts:122](lib/auth/require-account-membership.ts#L122) | Security concern |
| **`/api/app/question-audio/preview` uses a weaker ad-hoc guard** than the shared helper: a user with `accountId === null` passes, and there is no `isActive` check. | [app/api/app/question-audio/preview/route.ts:24-53](app/api/app/question-audio/preview/route.ts#L24) | Needs adaptation |
| **Test-signup token flaws:** `/api/signup/test/resend` checks expiry but **not `usedAt`**, so a consumed token still drives OTP resends; `/api/signup/test` provisions *before* marking `usedAt` with no lock, so concurrent redemption double-provisions. | `app/api/signup/test/{route,resend/route}.ts` | Security concern |
| **`/api/ai/generate-questions` and `/api/tts` are unauthenticated and call billable APIs** (OpenAI, Google TTS; `/api/tts` also writes to S3, keyed only on caller-supplied text). | Both route files | Security concern |
| **`app/app/layout.tsx` has no server-side auth guard.** Tenant isolation rests entirely on each API call invoking its guard. | [app/app/layout.tsx](app/app/layout.tsx) | Needs adaptation |
| **Email-match membership bypass.** `requireAccountMembership` grants access when the session email equals `Account.email`, with no `User` row. Under central identity, a Platform Core user could gain access to an org they were never granted. | [lib/auth/require-account-membership.ts:122](lib/auth/require-account-membership.ts#L122) | Needs adaptation |
| **Hard-coded demo-domain → account auto-join.** | [lib/auth/link-user-identity.ts:115-120](lib/auth/link-user-identity.ts#L115) | Needs adaptation |
| **Plaintext DB passwords committed** for project ref `xcveazzoavnizefbcjfg`. | `SUPABASE_TROUBLESHOOTING.md` (multiple lines) | Security concern |

**Guards that can remain unchanged in shape** (only their inputs change): `requireAccountAdmin`, `requireEventAccess`, `requireEventsEventAccess` — they already take `(slug, eventId)` and return a typed result. Swapping `slug` for a Platform-Core-resolved `organization_id` is a signature change, not a redesign.

**No rate limiting exists anywhere in the repo.**

---

## Storage

**Supabase Storage is not used.** Zero hits for `supabase.storage`, `.storage.from`, `createSignedUrl`, `getPublicUrl`.

All object storage is S3-compatible via AWS SDK v3 — **Cloudflare R2 in production, MinIO locally**. Canonical module [lib/objectStorage.ts](lib/objectStorage.ts); [lib/s3.ts](lib/s3.ts) is an explicitly deprecated shim.

**Buckets:** a single bucket from `S3_BUCKET_NAME`. Region defaults to `auto` for R2, `us-east-1` otherwise; `forcePathStyle` auto-enables for localhost.

**Public/private:** private bucket; all access is via presigned URLs or server-side proxy routes. No public bucket policy in the repo.

**Storage policies:** none — R2/S3 IAM is outside this repo. There is no per-tenant credential scoping; one access key covers everything.

**Key layout — mostly *not* tenant-partitioned:**

| Prefix | Builder | Contains org/event/user ID? |
|---|---|---|
| `recordings/{timestamp}-{answerId}-{fileName}` | `generateObjectKey` ([lib/objectStorage.ts:242](lib/objectStorage.ts#L242)) | **No.** Flat namespace, no account or event. |
| `answers/text/{uuid}` | [app/api/answer/text/route.ts:63](app/api/answer/text/route.ts#L63) | No |
| `branding/{accountId}/logo-{ts}.{ext}` | logo-presign / logo-upload | **accountId** |
| `eventActionVoiceObjectPrefix(accountId, eventId, actionId)` | [.../voice/route.ts:88](app/api/app/events/[eventId]/actions/[actionId]/voice/route.ts#L88) | **accountId + eventId** |
| Question audio | `lib/question-audio.ts` (`QuestionAudioAsset.objectKey`) | No |
| Speaker headshots | `EventSpeakerProfile.headshotObjectKey` | No |

**Signed URLs.** `presignPut` for uploads (`S3_UPLOAD_EXPIRES_IN`, default 300s); `generatePresignedDownloadUrl` default 3600s.

**Upload flow.** Browser records → `POST /api/answer/presign` (validates `responseId` as cuid, `questionKey`, `fileSize` ≤ 50MB) → server returns presigned PUT → **browser uploads directly to R2/MinIO, never through Next** → `POST /api/answer/confirm` (verifies via `HeadObjectCommand`, then kicks off processing).

**Download flow.** Server-side proxy (`/api/app/logo`) or presigned GET.

**Service-role operations.** All S3 access is server-side with the single product credential. `lib/account-deletion.ts` issues `DeleteObjectCommand` on account purge.

**What must change under Platform Core identity:** very little, because storage authorization never touches Supabase Auth — it is fully mediated by Next routes. Two items:
1. `branding/{accountId}/…` and the event-action voice prefix embed `Account.id` and `Event.id`. If those IDs are reseeded to Platform Core UUIDs, existing objects orphan. Reseed storage alongside the database.
2. Fix the unauthenticated presign/proxy routes before central identity, since they currently trust a caller-supplied account slug — that flaw is independent of the identity provider but becomes more consequential in a shared-org estate.

---

## Realtime

**Supabase Realtime is not used at all.** Zero hits across `app/`, `lib/`, `components/` for `supabase.channel`, `.channel(`, `postgres_changes`, `removeChannel`, or `.subscribe(`. There are no WebSocket subscriptions and no Server-Sent Events (`EventSource` / `text/event-stream` have no hits either).

Freshness is achieved entirely with **client-side interval polling**:
- [lib/hooks/useSummaryPolling.ts](lib/hooks/useSummaryPolling.ts) — polls answer status until transcript/analysis lands, using `BUSY_STATUSES` and a `detectHardFailure` stop condition.
- [app/app/events/[eventId]/dashboard/page.tsx:40](app/app/events/[eventId]/dashboard/page.tsx#L40) — `DASHBOARD_REFRESH_INTERVAL_MS = 90_000`, driven by `setInterval` at line 1614.

**Consequence for Platform Core:** none. There is no subscription authorization to redesign. This also means live-event freshness is bounded by the poll interval, which is a product concern rather than an integration one.

---

## Cross-Product Dependencies

**There is no code-level coupling to any other SignalThread product.** No API client, no shared table, no database-to-database link, no imported IDs, no duplicated event or user records from another product. Zero hits for "Orca" anywhere in the repo.

What does exist:

| Coupling | Location | Nature |
|---|---|---|
| Marketing site URL | `MARKETING_SITE_URL` / `NEXT_PUBLIC_MARKETING_SITE_URL` → `https://www.signalthread.ai` (prod), `http://localhost:5173` (dev) | Stripe Checkout `cancel_url` only ([app/api/billing/checkout/route.ts:75-77](app/api/billing/checkout/route.ts#L75)). One-way link-out. The `success_url` deliberately stays on the Voice app and this is asserted in tests. |
| Product host constant | `getAppUrl()` → `https://voice.signalthread.ai` ([lib/app-url.ts:8](lib/app-url.ts#L8)) | Used for QR codes, kiosk links, email links. Establishes Voice as its own origin. |
| Shared engineering standards | `docs/ENGINEERING_STANDARDS.md:4` references the *Lead Retrieval Admin* bar | Documentation only |
| Prior-product test bar | `docs/Loop/Old/Voice Testing Prompt Pack.md:7` references *Planner Dash* and *Lead Retrieval* | Documentation only |

**Direct database-to-database dependency: none.** This is a clean starting point — Voice is a standalone property. No existing cross-product write to flag.

The one thing to preserve: the Stripe self-serve funnel currently starts on the marketing site and lands on `POST /api/billing/checkout` in *this* app, which creates the `Account`. Under Platform Core, organization creation should move to Platform Core and this route becomes either a thin proxy or is deleted.

---

## Integrations

Every integration uses a **single global product-level credential**. There are no per-user OAuth tokens, no per-organization API keys, and no integration-credential table anywhere in the schema. That is the most important fact for this section: **moving to central identity cannot accidentally change integration ownership, because no integration is owned by a user or an organization today.**

| Integration | Level | Purpose | Credential | Code |
|---|---|---|---|---|
| OpenAI (Whisper) | **Product** | Answer transcription | `OPENAI_API_KEY`, `TRANSCRIPTION_PROVIDER/MODEL` | [lib/transcription.ts](lib/transcription.ts) |
| OpenAI (chat) | **Product** | Answer analysis, event intelligence extraction, review synopsis, question generation | `OPENAI_API_KEY`, `ANALYSIS_MODEL`, `EVENT_INTELLIGENCE_MODEL`, `REVIEW_SYNOPSIS_MODEL` | [lib/analysis.ts](lib/analysis.ts), [lib/event-intelligence/extraction.ts](lib/event-intelligence/extraction.ts), [lib/analysis-review-synopsis.ts](lib/analysis-review-synopsis.ts), [lib/ai/question-generation.ts](lib/ai/question-generation.ts) |
| Google Cloud TTS | **Product** | Server-generated question audio | `GOOGLE_TTS_API_KEY` | [lib/question-audio.ts:244](lib/question-audio.ts#L244), `lib/tts.ts` |
| Cloudflare R2 / MinIO | **Product** | All object storage | `S3_*` | [lib/objectStorage.ts](lib/objectStorage.ts) |
| Stripe | **Organization** | Subscription checkout, billing portal, webhooks | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` | `app/api/billing/checkout`, `app/api/app/account/billing`, `app/api/webhooks/stripe` |
| Resend | **Product** (sends org/user-addressed mail) | Event action assignment emails | `RESEND_API_KEY`, `EVENT_ACTION_EMAIL_FROM` | [lib/event-actions/assignment-email.ts:66](lib/event-actions/assignment-email.ts#L66) |
| Supabase GoTrue | **Product** | Auth + invite email delivery | `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/*`, `lib/provisioning.ts`, `lib/account-users.ts` |
| Google Analytics | **Product** | Optional client analytics | `NEXT_PUBLIC_GA_ID` | `app/components/GoogleAnalytics.tsx` |
| Excel/CSV import | **Event** (data, not a connection) | Agenda + speaker roster import | `read-excel-file` | [lib/event-agenda-import-parser.ts](lib/event-agenda-import-parser.ts), [lib/event-speaker-roster-import.ts](lib/event-speaker-roster-import.ts) |

**No Google Workspace, Microsoft, calendar, or CRM integration exists.** Searches for HubSpot, Salesforce, Marketo, Microsoft Graph, Outlook, Zapier, Slack, Twilio, SendGrid, Mailgun, and Postmark return only false positives. No inbound webhooks besides Stripe, and no outbound webhooks at all.

**Email is split across two providers, which matters for the cutover.** Resend sends exactly **one** message type — *"You were assigned an Event action"* ([lib/event-actions/assignment-email.ts:40](lib/event-actions/assignment-email.ts#L40)), synchronously inside the HTTP request, between two transactions, with manual-only retry. **All identity email — invites, OTP codes, sign-in — goes through Supabase GoTrue**, not Resend. So moving auth to Platform Core moves the entire invite/OTP mail stream with it and leaves Resend untouched.

**Dead integration code to remove during the cutover:** `analyzeTranscript` in [lib/analysis.ts](lib/analysis.ts) (the `gpt-4-turbo-preview` path) has no call sites — only its `AnalysisResult` type is used. `syncEventInsights` in [lib/insights/sync-event-insights.ts](lib/insights/sync-event-insights.ts) also has no call sites; `Insight` rows are only ever read.

**The one ownership hazard is Stripe.** `Account.stripeCustomerId` is `@unique` and the webhook resolves the account from `checkout.session.metadata.accountId` ([app/api/webhooks/stripe/route.ts:73](app/api/webhooks/stripe/route.ts#L73)). If Platform Core takes over billing and organization creation, both the metadata key and the local `Account` columns must move in the same change, or webhooks will silently no-op (the handler warns and continues when the account is unknown).

**The second hazard is invite email.** Voice currently sends its own OTP/invite mail through Supabase GoTrue. Under Platform Core those emails must come from Platform Core, or users will receive two competing sign-in links.

---

## High-Volume Paths

Ranked by expected request volume and by how badly a synchronous Platform Core call would hurt.

**1. Attendee kiosk capture — the hot path. Platform Core must never be in it.**

Unauthenticated, attendee-facing, one request burst per answer per attendee:

| Route | Work | Tables |
|---|---|---|
| `GET /api/kiosk/event-details` | Resolve event or `PublicSurveyLink.token` | `Event`, `Location`, `Account`, `Survey`, `SurveyTarget`, `PublicSurveyLink` |
| `POST /api/response/create` | Create response. **Already the worst fan-out:** N+1 S3 `HeadObject` (one per question, `lib/question-audio.ts:375`) + N presign signatures, plus a Google TTS synthesize + S3 `PutObject` if any question audio is missing | `Response`, possibly `QuestionAudioAsset` |
| `POST /api/answer/presign` | S3 presign (local HMAC, no network) | none |
| `POST /api/answer/complete` | `HeadObject` verify | `Answer` |
| `POST /api/answer/confirm` | Verify, then **fire-and-forget** transcription | `Answer` ×3, `AnswerProcessingLog` ×2–3, `AnswerTranscript`, `AnswerAnalysis`, plus the full `AnswerEvent*` dual-write and `EventIssueCluster`/`EventIssueEvidence` |
| `POST /api/answer/text` | **Synchronous** — 1–2 OpenAI calls block the response ([app/api/answer/text/route.ts:113](app/api/answer/text/route.ts#L113)) | same set |
| `POST /api/answer/structured` | One DB write, zero external I/O | `Answer` |
| `POST /api/response/[responseId]/complete` | Finalise | `Response` |
| **`GET /api/events/[eventId]/responses/[responseId]`** | **The highest-QPS endpoint in the product.** `useSummaryPolling` hits it **once per second for up to 20 minutes per in-flight kiosk response** ([lib/hooks/useSummaryPolling.ts:86-90](lib/hooks/useSummaryPolling.ts#L86)). One Prisma read, zero external I/O — and it is one of the six unauthenticated legacy routes. | none (read) |

None of these routes calls `auth.getUser()` or touches Supabase. Adding a Platform Core lookup per request would insert a network hop into the highest-volume, least-tolerant path in the product, multiply it by (active kiosks × 60/min) on the polling endpoint, and couple attendee capture availability to Platform Core uptime. **Design rule: kiosk, answer, and response-polling routes must resolve everything from local tables only.**

**2. AI transcription/analysis.** `transcribeAudio` (Whisper) → synopsis → event extraction → `lib/event-intelligence/dual-write.ts`. `transcribeAudio` downloads the **entire object into a Node Buffer** ([lib/transcription.ts:23](lib/transcription.ts#L23)), so peak memory equals full audio size (up to 50MB) per concurrent answer. Launched as an unawaited promise from `/api/answer/confirm` with no queue and no `waitUntil` — on serverless the lambda can freeze mid-transcription, leaving the answer stuck in `PROCESSING_TRANSCRIPT` forever.

**There is no retry mechanism at all.** `MAX_PROCESSING_RETRIES` and `PROCESSING_TIMEOUT_MS` are documented in `env.example` but **appear nowhere in `app/`, `lib/`, or `components/`** — dead config. `AnswerProcessingLog.attempt` is hardcoded to `1` at every write site. No `AbortController` or timeout is set on any OpenAI, Resend, Google TTS, or S3 call. This is the product's most fragile path and it is entirely independent of Platform Core.

**3. Events dashboard reads.** `/api/app/events/[eventId]/{intelligence,signals,timeline,analysis,sessions/intelligence,speakers/intelligence}` plus `clusters` and `themes` evidence. `getEventIntelligenceSummary` issues **9+ parallel unbounded queries** — `answerEventIntelligence.findMany` with no `take`, plus every `surveyTarget`, `eventStructureItem`, `question`, `survey`, and `response` row for the event ([lib/event-intelligence/aggregation.ts](lib/event-intelligence/aggregation.ts)). `fetchEventDataLifetime` pulls **every Response, Answer, transcript ID, and analysis JSON for the event's entire lifetime** in one `$transaction` ([lib/analytics/signals.ts](lib/analytics/signals.ts)). The intelligence route measures and returns its own payload size in an `x-response-bytes` header — a sign this is already known to be large. Documented history includes Prisma **pool-exhaustion** incidents. The dashboard polls every 90s per open tab. Each of these already pays a `requireEventsEventAccess` round-trip to `auth.getUser()` plus two Prisma queries — that is exactly where a Platform Core membership check would land, and it must be cached rather than stacked on top.

**4. Bulk imports.** Agenda and speaker-roster imports parse Excel/CSV (5MB / 5,000-row caps) fully in memory, then confirm in an **all-or-nothing transaction with a 120-second timeout** ([lib/event-agenda-import-service.ts](lib/event-agenda-import-service.ts)). Any per-row external call added inside that transaction will exceed the timeout and roll back the entire import. Long transactions on a pgbouncer transaction pooler are a known pressure point.

**4b. Stripe webhook.** Already makes up to three outbound calls inside one handler (`subscriptions.retrieve`, plus a Supabase OTP send), and returns 500 on any failure — so Stripe redelivers. **There is no webhook-event dedupe table**, which makes redelivery unsafe. The billing panel also does a live `stripe.subscriptions.retrieve` on every page load.

**5. Exports/reports.** `jszip` bundles and `/print/event-signage`. Low frequency.

**Connection-pool posture.** `DATABASE_URL` targets the pgbouncer transaction pooler (6543) but **omits `pgbouncer=true` and `connection_limit`**, contradicting `.env.local.example` (which specifies `pgbouncer=true&connection_limit=5&pool_timeout=15`) and `.env` (whose comments say to avoid `pgbouncer=true` entirely). This is unresolved and worth settling before adding any new per-request work.

**Caching: there is none.** No `unstable_cache`, no `export const revalidate`, no `revalidateTag`/`revalidatePath`, no React `cache()`. **All 65+ API routes declare `dynamic = 'force-dynamic'` and `runtime = 'nodejs'`** — fully uncached and cold-start heavy. The only application caches are content-addressed S3 objects (TTS keyed by SHA-256 of the text; `QuestionAudioAsset` keyed by question + voice + text hash), and even a cache *hit* still costs an S3 `HeadObject`. The only client-side cache is the 60s in-memory account-context `Map` in [lib/account-context-client.ts](lib/account-context-client.ts), which is per-tab. **There is no server-side cache to hang a Platform Core read-through on today; one must be built as part of this work.**

**No rate limiting anywhere.** Several unauthenticated routes both write to the database and call billable third-party APIs: `POST /api/answer/text` (2 GPT calls, synchronous), `POST /api/tts` (Google TTS + S3 write, keyed only on caller-supplied text), `POST /api/ai/generate-questions`, and the entire legacy `/api/events/[eventId]/*` family.

**Structural amplifiers.** [lib/objectStorage.ts:67](lib/objectStorage.ts#L67) constructs a **new `S3Client` on every single operation** — no client reuse, no connection pooling across calls. [lib/prisma.ts:58-64](lib/prisma.ts#L58) wraps the client in a `Proxy` that does a property lookup plus `bind` on every Prisma access.

---

## Required Platform Core Changes

### A. Central authentication changes

1. **Repoint the Supabase clients** in `lib/supabase/{client,server,middleware,admin}.ts` at the Platform Core project. Because the product never inspects the JWT and never queries data through supabase-js, this is a config change plus a session-shape review.
2. **Move login out of this app.** Delete or redirect `app/login/page.tsx`, `app/auth/callback/route.ts`, `lib/auth/complete-email-otp.ts`. Platform Core authenticates and routes into Voice.
3. **Rewrite `/api/auth/link-user` as the trust boundary.** It should validate the Platform Core session, upsert a local `User` shadow row keyed by the global `user_id`, and resolve organization + event access from Platform Core rather than from `User.accountId`. This is the single hook point — everything else reads what it produces.
4. **Delete the email-match membership bypass** ([lib/auth/require-account-membership.ts:122](lib/auth/require-account-membership.ts#L122)) and the **hard-coded demo-domain auto-join** ([lib/auth/link-user-identity.ts:115-120](lib/auth/link-user-identity.ts#L115)). Both grant access without a membership record and are unsafe under shared identity.
5. **Retire `SUPER_ADMIN_EMAILS`** in favour of a Platform Core platform role.
6. **Stop creating and deleting global auth users.** Remove `auth.admin.listUsers` / invite sends from `lib/account-users.ts` and `lib/provisioning.ts`; remove Supabase user deletion from `lib/account-deletion.ts`. Invitations become a Platform Core flow; `PendingProvision` and `TestSignupToken` are retired.
7. **Extend middleware coverage** beyond `/admin*`, and add a server-side guard to `app/app/layout.tsx` so `/app/*` is not publicly renderable.

### B. Global ID changes

**No column-type migration is needed — every PK is already `String`.** This is the key enabler.

- **`user_id`:** `User.id` is already an auth UUID. Reuse the existing `linkAuthenticatedUser` reconciliation, including `updateUnconstrainedUserReferences`, to re-point the 13 loose user columns. Keep a **local shadow `User` row** (id, email, display name, product role) so the product never needs a Platform Core call to render "assigned by Ali".
- **`organization_id`:** Adopt the Platform Core UUID as `Account.id`. Keep `Account.slug` for display and legacy URLs only — it must stop being the authorization key. Keep the local `Account` row as a **product-owned settings/branding record keyed by the global org ID**, dropping the identity, billing, and entitlement columns to Platform Core.
- **`event_id`:** Adopt the Platform Core UUID as `Event.id` directly (see Event Model for why a parallel `platformEventId` is the wrong shape). Platform Core mints; Voice creates the local row with the supplied ID. **Add a denormalized `Event.accountId`** so `(organization_id, event_id)` can be verified without joining `Location`.
- **Reseed, do not migrate.** Use `deleteAccountAsSuperAdmin` to purge and `scripts/seed-voice-events-demo.ts` / `prisma/seed-multi-tenant.ts` to reseed with global IDs, including S3 objects under `branding/{accountId}/` and the event-action voice prefix.

### C. RLS/security changes

1. **Verify the live Supabase project's PostgREST exposed-schema setting before anything else.** With RLS off on every table and a published anon key, an exposed `public` schema means the database is readable and writable outside the application entirely. This is a prerequisite, not a follow-up.
2. **Fix the unauthenticated routes** that accept a caller-supplied account slug and act on it: `/api/app/insights/[insightId]/drilldown`, `/api/app/account/logo-presign`, `/api/app/account/logo-upload`, `/api/app/logo`.
3. **Replace, do not simply delete, the six legacy public `/api/events/[eventId]/*` routes.** They expose transcripts to anyone holding an event ID, and event IDs are printed on QR codes — but `/responses/[responseId]` is the kiosk's completion-polling endpoint. Move the polling case to a token-scoped kiosk route (`PublicSurveyLink.token` already exists as the bearer) and guard or delete the other five.
4. **Authenticate `POST /api/provision/start`** or move account creation to Platform Core entirely — it is currently a public account-creation and mass-mail endpoint.
5. **Scope `/api/answer/*` to the response's public link token** rather than accepting any `responseId`.
6. **Add authentication to `/api/ai/generate-questions` and `/api/tts`** — both are unauthenticated calls to billable third-party APIs.
7. **Fix cookie fidelity and session refresh:** restore `httpOnly`/`secure`/`sameSite` in `copyCookies`, and extend the middleware matcher so `/app*` sessions actually refresh.
8. **Decide on RLS as a defence-in-depth layer.** If yes, move Prisma off the `postgres` superuser first, or policies will be inert.
9. **Add rate limiting**, at minimum on the public kiosk and AI routes.

### D. Routing/context changes

Today the entire organization context is a query string. The change is mechanical but wide.

1. **Introduce a server-side context resolver** — e.g. `resolveProductContext(request)` returning `{ userId, organizationId, entitlements }` from the Platform Core session, with a short-lived server cache. This is the one new abstraction the product needs.
2. **Change guard signatures** from `(accountSlug, eventId)` to `(organizationId, eventId)`. `requireAccountMembership`, `requireAccountAdmin`, `requireEventAccess`, `requireEventsEventAccess` keep their shape and return types; only the resolution step changes. Roughly 50 route call sites read `searchParams.get('account')` and pass it straight to a guard, so the edit is repetitive rather than subtle.
3. **Preserve the selected event** as-is — `[eventId]` path segments are already correct and become Platform Core IDs.
4. **Handle organization switching for the first time.** Platform Core will grant multi-org membership; Voice has no switcher. Minimum viable: keep `?account=` in the URL as the *selected* org (so deep links work), but validate it against Platform Core membership instead of `User.accountId`, and add a switcher to the app shell.
5. **Preserve the signed-in user** via the Platform Core session cookie; extend the middleware matcher to `/app*`.

### E. Platform integration (what Voice exposes back)

Keep this small and asynchronous. Voice should push, not be polled, and Platform Core should never be a synchronous dependency of Voice's hot path.

1. **Event summary read-model push** — per event, periodically: response count, completion rate, answer count, open/resolved issue counts, top themes. Sourced from `EventIntelligenceAggregate` and `EventIssueCluster`, which already exist as read models.
2. **Module activity signal** — last capture timestamp and active-survey count per organization, so Platform Core can render "Voice is live on this event".
3. **Deep-link contract** — a documented URL shape (`/app/events/{event_id}?...`) so Platform Core can route into a specific Voice workspace.
4. **Event lifecycle acknowledgement** — Voice confirms it has provisioned local structure for a Platform Core event.
5. **No write-back to other products' databases**, and no Platform Core write from the kiosk path.

### F. Test-data/reset work

Assuming no real customers:

1. **Purge with existing tooling.** `deleteAccountAsSuperAdmin` ([lib/account-deletion.ts](lib/account-deletion.ts)) already cascades Prisma, best-effort deletes S3 objects, and removes Supabase auth users. Run it per seeded account, then drop residual `Session`/`Transcript`/`Analysis`/`ProcessingLog` legacy rows.
2. **Purge object storage** under `recordings/`, `answers/text/`, `branding/`, and the event-action voice prefix, since keys embed old IDs.
3. **Reseed with Platform Core IDs.** Update `prisma/seed-multi-tenant.ts` and `scripts/seed-voice-events-demo.ts` to accept externally supplied `user_id` / `organization_id` / `event_id` rather than generating cuids.
4. **Delete the demo-domain fallback** in `link-user-identity.ts` — it exists only to serve `acme-coffee` / `techconf-events` seed data.
5. **Update `tests/mocks/auth.ts`.** It is the single central mock for `auth.getUser()`; most of the 155 route tests flow through it. Expect a large but shallow test diff.
6. **Rerun both Playwright specs** (`e2e/events-voice-journeys.spec.ts`, `e2e/smb-voice-journeys.spec.ts`) — they are fully mocked, so they will need the new context shape.

---

## Risks

### BLOCKER

*(None are blocking the integration itself. The item below blocks safely operating a shared estate and must be resolved first.)*

- **Unverified PostgREST exposure with zero RLS and a published anon key.** If the live Supabase project exposes the `public` schema — the Supabase default — the anon key shipped to every browser grants direct read/write to all 50+ tables, bypassing every application guard. This audit did not query or modify Supabase, so it is **unverified**. If confirmed, it is a BLOCKER; if the schema is not exposed, it drops to MEDIUM as a latent misconfiguration risk.

### HIGH

- **One user = one organization is baked into schema and code.** `User.accountId` singular; invite returns `email_other_account`; no membership table; no account switcher. Platform Core multi-org membership cannot be represented without new structure and reworking every guard.
- **Tenant isolation has no database backstop.** Zero RLS + Prisma as `postgres` superuser means a single missed guard is a cross-tenant read. Three such routes already exist (`insights/drilldown`, `logo-presign`, `logo-upload`), plus `app/app/layout.tsx` having no server-side guard.
- **Six legacy `/api/events/[eventId]/*` routes are intentionally public** and return responses, answers, and transcripts to anyone holding an event ID — which is printed on public QR codes. One of them is load-bearing for the kiosk (see MEDIUM below).
- **Email is an authorization input.** `requireAccountMembership` grants access on `session.email === Account.email`; `SUPER_ADMIN_EMAILS` grants platform admin by email string. Under central identity, an email collision becomes a cross-tenant access grant. The email-match path also returns a `userId` with no backing `User` row.
- **`POST /api/provision/start` lets anyone create an account** and send OTP mail to any address, with no authentication.
- **`/api/answer/*` accepts any well-formed `responseId`** — a guessed or leaked cuid lets an outsider write answers into another tenant's response.
- **Plaintext database passwords committed** in `SUPABASE_TROUBLESHOOTING.md`.

### MEDIUM

- **`Event` has no `accountId`.** Every event authorization joins through `Location`. Verifying a Platform Core `(organization_id, event_id)` pair requires either that join on every request or a schema addition.
- **Organization context is an attacker-controlled query parameter** threaded through ~50 route handlers by hand. The mechanical change surface is large and a missed call site is a security bug, not a compile error.
- **Platform Core in the hot path.** Kiosk and answer routes currently do zero identity I/O. Any per-request Platform Core call there would couple attendee capture to Platform Core availability. This is a design risk, avoidable by rule.
- **The kiosk depends on one of the "legacy public" routes.** `GET /api/events/[eventId]/responses/[responseId]` is polled once per second per in-flight response by `useSummaryPolling`. Deleting the legacy family without replacing this endpoint breaks live capture.
- **Audio processing is an unawaited floating promise** with no queue, no retry, and no `waitUntil` on serverless. `MAX_PROCESSING_RETRIES` and `PROCESSING_TIMEOUT_MS` are documented but dead config; `AnswerProcessingLog.attempt` is hardcoded to `1`. A failure anywhere leaves the answer permanently in `PROCESSING_TRANSCRIPT`. Pre-existing, but any change to the confirm route risks disturbing it.
- **Auth cookies are re-emitted without `httpOnly`/`secure`/`sameSite`** in the link-user route, and `/app/*` sessions are effectively never refreshed. Both get more consequential when the session is a shared platform session.
- **Stripe webhooks have no event dedupe** and the handler returns 500 on any failure, so Stripe redelivers into a non-idempotent path that makes up to three outbound calls.
- **Unbounded dashboard queries.** `getEventIntelligenceSummary` and `fetchEventDataLifetime` issue `findMany` calls with no `take` over an event's full lifetime. Already a known pool-exhaustion source; adding platform lookups on top would compound it.
- **Connection-pool configuration is unresolved and self-contradictory** (`DATABASE_URL` on pgbouncer 6543 without `pgbouncer=true` or `connection_limit`; `.env.local.example` and `.env` give opposite advice). Documented pool-exhaustion incidents already exist.
- **Stripe ownership transfer.** `Account.stripeCustomerId` is `@unique` and the webhook resolves accounts from `metadata.accountId`; the handler silently no-ops on an unknown account. Moving billing to Platform Core without moving both sides together will lose subscription events quietly.
- **Two competing invite emails.** Voice sends its own GoTrue OTP/invite mail; Platform Core will too.
- **Unauthenticated billable endpoints** (`/api/ai/generate-questions`, `/api/tts`) with no rate limiting anywhere.

### LOW

- **Storage keys embed old IDs** (`branding/{accountId}/`, event-action voice prefix). Reseed handles it.
- **`recordings/` is a flat, non-partitioned namespace** with no tenant prefix. Not a leak today (access is fully mediated), but it prevents per-tenant storage policies later.
- **Legacy `Session`/`Transcript`/`Analysis`/`ProcessingLog` and the `Admin` table** are dead weight that will confuse the migration. Delete them.
- **`/app/locations/new` is referenced in `app/app/page.tsx` but no such page exists.**
- **No Realtime, no Storage-auth, no browser-direct-database risk.** Explicitly checked and absent — three whole risk categories do not apply to this product.

---

## Recommended Implementation Order

1. **Verify the Supabase PostgREST exposure and rotate the committed credentials.** Prerequisite to everything; do not connect a shared platform to an unverified surface.
2. **Close the unauthenticated tenant-data and account-creation routes** — `insights/drilldown`, `logo-presign`, `logo-upload`, `logo`, and `provision/start`. Independent of Platform Core, and all of them get worse in a shared estate.
3. **Design the replacement for the legacy public event routes**, keeping a token-scoped kiosk polling endpoint. This must land before the legacy family is removed.
4. **Introduce `resolveProductContext()`** and refactor the four `require*` guards to take `organizationId` instead of `accountSlug`, keeping `?account=` as a temporary fallback. Ship this before Platform Core exists — it is a pure refactor against the current identity provider and can be validated by the existing test suite.
5. **Add `Event.accountId`** and switch event guards off the `Location` join.
6. **Introduce a membership table** (`AccountMembership`: organization_id, user_id, role) and migrate `User.accountId` / `User.role` onto it. Still pre-Platform-Core; unblocks multi-org.
7. **Add the organization switcher** to the app shell.
8. **Repoint Supabase clients at Platform Core** and rewrite `/api/auth/link-user` as the trust boundary. Delete local login, OTP, invite, and provisioning flows; fix cookie fidelity and the `/app*` session-refresh gap in the same change.
9. **Purge and reseed** with Platform Core global IDs, including object storage.
10. **Delete the legacy and dead code** — tables `Session`, `Transcript`, `Analysis`, `ProcessingLog`, `Admin`, `PendingProvision`, `TestSignupToken`; functions `analyzeTranscript` and `syncEventInsights`.
11. **Build the read-model push to Platform Core** — event summary + module activity, asynchronous.
12. **Decide on RLS as defence-in-depth**; if adopted, move Prisma off the superuser role first.
13. **Add rate limiting** on public kiosk and AI routes.

Steps 2–7 deliver standalone value and carry no Platform Core dependency, so they can start immediately and in parallel with Platform Core's own build.

---

## Estimated Complexity

| Workstream | Complexity | Notes |
|---|---|---|
| Repoint Supabase clients | **LOW** | Config change; no data path touches supabase-js |
| Rewrite the identity seam (`/api/auth/link-user`) | **MEDIUM** | One file, but it is the trust boundary; reconciliation machinery already exists |
| Remove local login/invite/provisioning | **MEDIUM** | Touches `lib/provisioning.ts`, `lib/account-users.ts`, `lib/account-deletion.ts`, several routes and pages |
| Guard signature refactor (`slug` → `organization_id`) | **MEDIUM** | ~50 mechanical call sites; wide but shallow; a missed site is a security bug |
| Membership table + multi-org | **HIGH** | New structure, new UI, changes the core access predicate |
| Organization switcher UI | **MEDIUM** | Does not exist at all today |
| Adopt global `user_id` | **LOW–MEDIUM** | `User.id` is already an auth UUID; `updateUnconstrainedUserReferences` already handles re-pointing |
| Adopt global `organization_id` | **MEDIUM** | `String` PK needs no migration; `slug` must stop being the auth key |
| Adopt global `event_id` | **MEDIUM** | `String` PK needs no migration; public QR/kiosk URLs break on reseed |
| Add `Event.accountId` | **LOW** | Pattern already used by 12 tables |
| RLS | **LOW** to skip / **HIGH** to adopt properly | Nothing to adapt; adopting requires leaving the superuser role |
| Storage | **LOW** | Auth never touches Supabase; only key reseeding |
| Realtime | **NONE** | Not used |
| Fix unauthenticated routes | **LOW** | Add existing guards |
| Reseed | **LOW** | Purge and seed tooling already exists |
| Platform read-model push | **MEDIUM** | New outbound path; needs a scheduler, which the product does not have yet |
| Test updates | **MEDIUM** | 155 route tests + 2 Playwright specs; `tests/mocks/auth.ts` is a central choke point |

**Overall: ~3–5 engineer-weeks**, dominated by the multi-org membership model and the guard refactor — not by the auth swap itself.

---

## Files Most Likely to Change

**Auth core (highest impact):**
- [app/api/auth/link-user/route.ts](app/api/auth/link-user/route.ts) — the trust boundary
- [lib/auth/link-user-identity.ts](lib/auth/link-user-identity.ts) — identity reconciliation; delete demo-domain fallback
- [lib/auth/require-account-membership.ts](lib/auth/require-account-membership.ts) — the base predicate; delete email-match bypass
- [lib/auth/require-events-event-access.ts](lib/auth/require-events-event-access.ts) — event scoping
- [lib/auth/require-account-admin.ts](lib/auth/require-account-admin.ts), [lib/auth/account-admin-policy.ts](lib/auth/account-admin-policy.ts)
- [lib/auth/super-admin.ts](lib/auth/super-admin.ts), [lib/auth/require-super-admin.ts](lib/auth/require-super-admin.ts)
- [lib/supabase/server.ts](lib/supabase/server.ts), [lib/supabase/client.ts](lib/supabase/client.ts), [lib/supabase/middleware.ts](lib/supabase/middleware.ts), [lib/supabase/admin.ts](lib/supabase/admin.ts)
- [middleware.ts](middleware.ts) — matcher scope

**Login/provisioning (mostly deleted):**
- [app/login/page.tsx](app/login/page.tsx), [app/auth/callback/route.ts](app/auth/callback/route.ts), [app/auth/reset/page.tsx](app/auth/reset/page.tsx), [lib/auth/complete-email-otp.ts](lib/auth/complete-email-otp.ts)
- [lib/provisioning.ts](lib/provisioning.ts), [lib/account-users.ts](lib/account-users.ts), [lib/test-signup-tokens.ts](lib/test-signup-tokens.ts), [lib/account-deletion.ts](lib/account-deletion.ts)
- `app/signup/**`, `app/start/page.tsx`, `app/admin/provision/page.tsx`
- `app/api/provision/start/route.ts`, `app/api/signup/test/**`, `app/api/admin/provision-*/route.ts`

**Org-context threading (~50 mechanical sites):**
- Every `app/api/app/**/route.ts` reading `searchParams.get('account')`
- Every `/app/*` page reading `useSearchParams().get('account')`: [app/app/page.tsx:380](app/app/page.tsx#L380), `app/app/events/[eventId]/{page,dashboard/page,edit/page,surveys/new/page}.tsx`, `app/app/events/new/page.tsx`, `app/app/surveys/[surveyId]/edit/page.tsx`, `app/app/surveys/create/CreateSurveyClient.tsx`, `app/app/settings/profile/page.tsx`
- [lib/account-context-client.ts](lib/account-context-client.ts) — client-side org cache
- [app/app/layout.tsx](app/app/layout.tsx) — needs a server guard
- `app/api/app/account/route.ts` — the org-context endpoint

**Security fixes:**
- [app/api/app/insights/[insightId]/drilldown/route.ts](app/api/app/insights/[insightId]/drilldown/route.ts)
- [app/api/app/account/logo-presign/route.ts](app/api/app/account/logo-presign/route.ts), [app/api/app/account/logo-upload/route.ts](app/api/app/account/logo-upload/route.ts), [app/api/app/logo/route.ts](app/api/app/logo/route.ts)
- `app/api/events/[eventId]/**` (six legacy public routes)
- `app/api/ai/generate-questions/route.ts`, `app/api/tts/route.ts`

**Billing:**
- `app/api/billing/checkout/route.ts`, `app/api/app/account/billing/route.ts`, `app/api/webhooks/stripe/route.ts`, [lib/billing/checkout-success.ts](lib/billing/checkout-success.ts), [lib/app-url.ts](lib/app-url.ts)

**Schema/seed/test:**
- [prisma/schema.prisma](prisma/schema.prisma)
- [prisma/seed-multi-tenant.ts](prisma/seed-multi-tenant.ts), [scripts/seed-voice-events-demo.ts](scripts/seed-voice-events-demo.ts)
- [tests/mocks/auth.ts](tests/mocks/auth.ts), [tests/helpers/fixtures.ts](tests/helpers/fixtures.ts), `e2e/*.spec.ts`

**Deliberately unchanged:** the entire capture and intelligence pipeline — `app/api/answer/**`, `app/api/response/**`, `app/api/kiosk/**`, `lib/transcription.ts`, `lib/event-intelligence/**`, `lib/event-actions/**`, `lib/insights/**`, `lib/analytics/**`, `lib/objectStorage.ts`. Keeping Platform Core out of these is the design goal. The one exception inside this set is the **kiosk completion-polling endpoint** `app/api/events/[eventId]/responses/[responseId]/route.ts`, which must move to a token-scoped route before the legacy family is retired.

**Dead code to delete:** `analyzeTranscript` in [lib/analysis.ts](lib/analysis.ts) and [lib/insights/sync-event-insights.ts](lib/insights/sync-event-insights.ts) — neither has any call site.

---

## Tables Most Likely to Change

| Table | Change |
|---|---|
| `User` | `id` becomes the global `user_id`; becomes a **shadow/profile cache** of Platform Core. `accountId` and `role` move to a membership table. `email @unique` stops being an access grant. |
| `Account` | `id` becomes the global `organization_id`. Retains only product-owned settings/branding. Drops `name`/`slug`/`email`/`isActive` (Platform Core), `accountType`/`tier`/`trialEndsAt` (entitlements), `stripeCustomerId`/`stripeSubscriptionId`/`billingJson` (billing). |
| `Event` | `id` becomes the global `event_id`; **add `accountId`**; `@default(cuid())` removed so Platform Core mints IDs. |
| *(new)* `AccountMembership` | `organization_id` + `user_id` + product role — does not exist today and is required for multi-org. |
| `PendingProvision` | **Delete** — invitations become a Platform Core concern. |
| `TestSignupToken` | **Delete** — test-signup flow is superseded. |
| `Admin` / `AdminRole` | **Delete** — legacy, has a `password` column, unused by the auth path. |
| `Session`, `Transcript`, `Analysis`, `ProcessingLog` | **Delete** — legacy capture stack, superseded by `Response`/`Answer`. |
| `Location` | Unchanged structurally; `accountId` now points at a global org ID. |
| 12 tables with denormalized `accountId` | Values are reseeded to global org IDs; no structural change. |
| 13 loose user-reference columns (`EventIssueCluster.*UserId`, `EventActionHistory.actorUserId`, `EventActionUpdate.authorUserId`, `EventActionAssignmentDelivery.recipientUserId`/`assignedByUserId`, `EventAlertNote.authorUserId`) | Values re-pointed to global `user_id`; `updateUnconstrainedUserReferences` already does exactly this. |
| `EventAgendaImportJob`, `TestSignupToken` | The only real FKs to `User.id`; must survive the ID re-point. |
| `EventActionAssignmentDelivery.recipientEmail` | Denormalized email — review whether it should read from Platform Core instead. |
| Everything else (~35 tables) | **No change.** Operational product data, correctly product-owned. |

---

## Open Decisions

1. **Does Platform Core mint `event_id`, or does Voice create events and register them?** The audit assumes Platform Core mints. If Voice keeps creating events, `POST /api/app/events` needs a synchronous Platform Core write, which contradicts the "not in the hot path" rule for a low-frequency but user-blocking operation.
2. **Does `Location` survive?** It sits between org and event, holds `timezone`, and is created 1-per-account at provisioning. Voice-only concept, or a Platform Core "site/venue"?
3. **Is `accountType` (`RETAIL`/`EVENTS`/`HOSPITALITY`) an entitlement or a product mode?** Today it is both. Platform Core should own the entitlement, but Voice still needs a local render mode — confirm these are the same axis before collapsing them.
4. **Where does billing live?** `Account` currently holds Stripe customer/subscription IDs and the webhook resolves accounts from `metadata.accountId`. Moving billing to Platform Core requires moving both sides atomically.
5. **Who sends invite and sign-in email?** Voice sends its own via GoTrue today. Two senders means two competing links.
6. **What is the caching contract for organization and event metadata?** Voice must not call Platform Core per request. Decide TTL, invalidation, and what Voice is allowed to serve stale.
7. **Are per-event memberships coming?** Voice has none — any account member sees every event. If Platform Core introduces event-level access, Voice needs a new enforcement layer it does not have.
8. **Is RLS being adopted platform-wide?** If yes, Voice must move off the `postgres` superuser role, which is a separate and non-trivial piece of work.
9. **What replaces the legacy public `/api/events/[eventId]/*` routes?** They leak transcripts to anyone holding an event ID, but `/responses/[responseId]` is the kiosk's completion-polling endpoint (1 req/sec per in-flight response) and the others back the `/admin/events/*` pages. This needs a replacement design, not a deletion ticket.
10. **Should `EventSpeakerProfile` become a shared platform entity?** It is an account-scoped person record with name, email, and headshot. Depends on whether Orca or Lead Retrieval model the same people.
11. **What is the QR-code cutover plan?** Adopting Platform Core event IDs invalidates every printed QR code and signage sheet. Acceptable pre-customer; needs to be an explicit gate.
