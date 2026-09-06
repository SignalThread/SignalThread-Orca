# Pulse Access Boundaries (Platform integration phase 1)

Established 2026-09-05 while hardening Pulse before Platform Core identity
mapping. Scope: Pulse only. Nothing here imports from, or depends on, Orca or
the Platform app. The `platform*` mapping columns and the `/platform-entry`
handoff were added in later phases (see `docs/PLATFORM_IDENTITY_MAPPING.md` and
`docs/PLATFORM_PULSE_HANDOFF.md`); entitlement handling stays on Platform.

## 1. Two layers, both required

| Layer | Control | Where |
|---|---|---|
| Database | Supabase Data API roles (`anon`, `authenticated`) hold **no** privilege on any Pulse table, sequence, function, or the `public` schema; default privileges for future tables are revoked; row level security is **enabled with no policies** on every Prisma model table. Prisma connects as the table owner and is unaffected (RLS is not `FORCE`d). `service_role` is untouched (server-only, used for Supabase Auth admin calls, never for table reads). | `prisma/migrations/20260905180000_lock_down_data_api_access/migration.sql` |
| Application | Every route is classified below. Organizer routes call a `require*` guard from `lib/auth/`; attendee routes never do; provider callbacks verify signatures. | `app/api/**/route.ts`, source-guarded by `app/api/access-boundaries.guard.test.ts` |

Why not RLS policies keyed on `auth.uid()`? Pulse's browser never queries tables
through PostgREST — the publishable key is used for Supabase Auth (OTP) only —
and Pulse's authorization model (account membership, super admin allowlist,
event scoping) lives in `lib/auth/*` on the server. Policies would have no
legitimate consumer and would duplicate that logic in SQL. Revoking the grants
is the smallest correct control; RLS-with-no-policies is the independent
backstop so that re-granting by accident still denies every row.

## 2. Route classification

Classes: **1 organizer-authenticated** · **2 intentionally public attendee capability** ·
**3 webhook / provider callback** · **4 internal / dev-only**.

### Hardened in this phase

| Route | Class | Guard / boundary |
|---|---|---|
| `POST /api/app/account/logo-presign` | 1 | `requireAccountMembership(slug, { allowSuperAdmin })`; key minted for the authorized account only |
| `POST /api/app/account/logo-upload` | 1 | same |
| `GET /api/app/logo?key=` | 2 | public branding proxy, but only `branding/{accountId}/…` image keys (`isServableBrandingLogoKey`); other bucket objects (answer audio, TTS cache, exports) are refused |
| `GET /api/app/insights/[insightId]/drilldown` | 1 | `requireAccountMembership(slug, { allowSuperAdmin })` — returns transcript text |
| `POST /api/ai/generate-questions` | 1 | `requireAuthenticatedPulseUser()` — active Pulse user or super admin; a bare Supabase Auth identity is refused |
| `POST /api/tts` | 2 | attendee fallback playback; requires `responseId` + `questionKey`, and `text` must equal that question's label/TTS text (`spokenTexts`). Free text is refused before any provider or storage call. Organizer previews use the authenticated `/api/app/question-audio/preview` |
| `GET /api/events/[eventId]/questions` | 1 | `requireLegacyEventReportingAccess(eventId)` |
| `GET /api/events/[eventId]/responses` | 1 | same |
| `GET /api/events/[eventId]/answers` | 1 | same (no known callers) |
| `GET /api/events/[eventId]/analysis` | 1 | same |
| `POST /api/events/[eventId]/analysis/recompute` | 1 | same |
| `GET /api/events/[eventId]/responses/[responseId]` | 1 + 2 | organizer guard passes → full payload; otherwise attendee summary only (`lib/legacy-response-summary.ts`: status, `hasTranscript`, synopsis; no transcript text / object keys / anonymous id) while in progress or ≤24h after completion; URL unchanged |
| `GET /api/health/db` | 4 | public liveness probe; DB error code/message only outside production |

### Added by the Platform → Pulse handoff

| Route | Class | Guard / boundary |
|---|---|---|
| `GET /platform-entry` | 1 (entry) | requires browser-bound launch state (HttpOnly cookie set by `/platform-entry/start`) AND a one-time Platform token verified server-to-server at Platform's `/api/launch/pulse/claim`; canonical ids resolved through the mapping columns only; `canUserAccessAccount` decides; a live session for a different user is never replaced; a Pulse session is opened for the mapped `User.id` last. Rejections emit no auth cookie. See `docs/PLATFORM_PULSE_HANDOFF.md`. Never reachable by attendee flows. |
| `GET /platform-entry/start` | 1 (entry) | sets the launch-state cookie for a canonical event id, verifies the browser stored it, then redirects to the configured Platform launch. No token, no session, no data. |

### Intentionally public attendee capabilities (unchanged)

| Route | Why it stays public |
|---|---|
| `POST /api/response/create` | survey launch by `eventId` (kiosk/QR) or public survey `token` |
| `POST /api/response/[responseId]/complete` | response completion |
| `GET /api/kiosk/event-details` | consent/branding for the launch |
| `POST /api/answer/presign`, `POST /api/answer/complete`, `POST /api/answer/confirm` | voice answer upload pipeline |
| `POST /api/answer/text` | text answers |
| `POST /api/answer/structured` | structured answers (ratings, presenter ratings, speaker/session surveys) |
| `POST /api/tts` | see above — public but question-scoped |
| `GET /api/app/logo` | see above — public but branding-scoped |

Public survey token links, kiosk links, distributed QR codes, and
speaker/session survey links are all served by these routes; no URL or ID
format changed.

### Already guarded before this phase (verified, unchanged)

`/api/admin/*` (`requireSuperAdminForApi`), `/api/app/account`, `/settings`,
`/billing`, `/users*` (`requireAccountMembership` / `requireAccountAdmin`),
`/api/app/events/**` (`requireEventsEventAccess` / `requireAccountAdmin` /
`requireAccountMembership`), `/api/app/locations*`, `/api/app/question-audio/preview`,
`/api/app/accounts`, `/api/auth/link-user` (self, session-bound).

### Provider callbacks (class 3)

`POST /api/webhooks/stripe` — unauthenticated by design; every request must carry
a valid `stripe-signature` for `STRIPE_WEBHOOK_SECRET` (`stripe.webhooks.constructEvent`).

### Not changed, needs a product decision

| Route | Note |
|---|---|
| `POST /api/provision/start` | public retail onboarding; duplicates the super-admin `/api/admin/provision-retail`. May be called by the marketing site — confirm before gating |
| `POST /api/billing/checkout`, `/api/signup/test*` | public onboarding (Stripe / signup token) |

## 3. Tests

- Static: `prisma/data-api-lockdown-migration.test.ts`, `app/api/access-boundaries.guard.test.ts`, `app/api/events/legacy-routes.guard.test.ts`
- Guards: `lib/auth/require-legacy-event-reporting-access.test.ts`, `lib/auth/require-authenticated-user.test.ts`
- Routes: `app/api/events/[eventId]/legacy-reporting-routes.test.ts`, `…/responses/[responseId]/route.test.ts`, `app/api/app/logo/route.test.ts`, `app/api/app/account/logo-{presign,upload}/route.test.ts`, `app/api/app/insights/[insightId]/drilldown/route.test.ts`, `app/api/ai/generate-questions/route.auth.test.ts`, `app/api/tts/route.test.ts`, `app/api/health/db/route.test.ts`, `app/api/webhooks/stripe/route.test.ts`, `lib/legacy-response-summary.test.ts`, `lib/hooks/useSummaryPolling.test.ts`
- Real database (`REAL_DATABASE_TESTS=1`, run by `npm run test:preprod`): `tests/integration/data-api-lockdown-real-db.test.ts` — RLS on every table, `anon`/`authenticated` denied on read and write, owner connection unaffected.

## 4. Production rollout (not executed)

1. Read-only check of the live project first (see the SQL in the phase report): confirm the owner role Prisma uses, current grants for `anon`/`authenticated`, and that `postgres` is a member of those roles (needed only for the integration test's `SET LOCAL ROLE`).
2. Deploy the application build containing the route guards (safe on its own; it does not depend on the migration).
3. Apply `20260905180000_lock_down_data_api_access` with `prisma migrate deploy` against `DIRECT_URL` (the existing "Migrate Production Database" workflow or a manual run). It is idempotent and takes no locks beyond `ALTER TABLE … ENABLE ROW LEVEL SECURITY`.
4. Verify: `curl -H "apikey: <publishable key>" https://<ref>.supabase.co/rest/v1/Account?select=id&limit=1` must return 401/403 (`permission denied`); the app must still sign in, launch a kiosk survey, submit an answer, and show the thank-you synopsis.
5. Rollback of the migration, if ever needed, is `GRANT`s back to the API roles — deliberately not provided as a script.
