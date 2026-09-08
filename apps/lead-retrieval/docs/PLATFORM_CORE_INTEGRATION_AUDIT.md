# Platform Core Integration Audit

- **Product:** SignalThread **Lead Retrieval** — web/admin/backend (`lead-intel-admin`, prod `https://lr.signalthread.ai`)
- **Audit result:** **READY WITH CHANGES**
- **Central-auth difficulty:** **MEDIUM**
- **Global-ID difficulty:** **MEDIUM**
- **RLS difficulty:** **MEDIUM**
- **Estimated implementation effort for this repo:** ~4–6 focused engineering weeks (1 engineer), assuming full test-data reseed and coordinated changes in the separate mobile repo
- **Biggest risk:** The companion mobile app (`lead-intel-scan`, separate repo, **same Supabase project**) talks to Postgres directly and is authorized *only* by `auth.uid()`-based RLS (migrations `0064`/`0065`/`0069`). If Platform Core becomes the token issuer without this product's Supabase project being configured to accept those tokens, **mobile lead capture breaks silently at the database layer**, not at the app layer.

---

## Product

This repository is **SignalThread Lead Retrieval (LR)** — the Next.js web application, admin console, and server/API backend.

| Surface | Location | Notes |
|---|---|---|
| Web + backend + schema | this repo | Next.js App Router, 130 API route handlers, canonical services, all migrations |
| Mobile capture app | `/Users/ali/Documents/lead-intel-scan` (**separate repo**) | Expo; signs in against the **same** Supabase Auth; reads/writes `public.leads` directly under RLS; also calls `/api/mobile/*` with Bearer tokens |
| Production | `https://lr.signalthread.ai` (Vercel) | `vercel.json` defines a 1-minute cron |

Both surfaces share **one Supabase project** (Auth + Postgres). There is no second SignalThread product in scope here.

---

## Executive Summary

LR is a single-tenant-per-company Next.js app on one Supabase project. Its authorization model is **already almost entirely server-side and service-role based** — 181 files import `createAdminClient()` (service role), while only 7 files touch the browser Supabase client and only 2 of those read a table. That is the single most favorable fact in this audit: for the **web** product, RLS is not the load-bearing security layer, so re-pointing identity at Platform Core does not require redesigning most policies.

The complications are concentrated in five places:

1. **`public.users.id` is `auth.users.id`.** Every user-scoped FK in the schema (`leads.owner_user_id`, `event_users.user_id`, `google_workspace_connections.user_id`, `signals.created_by`, …) transitively points at the local Supabase Auth user. `public.companies.organizer_id` references `auth.users(id)` *directly*.
2. **A user belongs to exactly one company.** `users.company_id` is a single nullable column, and `app/api/invites/claim/route.ts` explicitly rejects redemption when a user is already linked to a different exhibitor company. This is a direct conflict with Platform Core multi-organization membership.
3. **Invite state lives in Supabase `auth.user_metadata`** (`invite_event_id`, `invite_company_id`, `invite_exhibitor_company_id`, `invite_role`, `invite_event_access_mode`, `invite_assigned_event_ids`). When Platform Core owns auth, this side-channel disappears and the whole invite/activation pipeline must move to product tables.
4. **`public.events` is overloaded.** It holds both real dated events (`container_kind = 'event'`) and per-company "always-on" lead buckets (`container_kind = 'continuous_capture'`). Only the former can map to a canonical Platform Core `event_id`.
5. **Mobile depends on `auth.uid()` RLS.** Unlike the web app, mobile is authorized by policy, not by server code.

No cross-product coupling to Orca, Voice, or any other SignalThread product exists in this repository today. Supabase Realtime is **not used**. Supabase Storage is effectively **not used** — object storage is Cloudflare R2.

---

## Current Architecture

### Framework / runtime
- **Next.js 16.1.x App Router**, React 19, TypeScript, Tailwind (`next.config.mjs`, `package.json`).
- Node.js runtime on Vercel. Several routes pin `export const runtime = "nodejs"` and `dynamic = "force-dynamic"`.
- `next.config.mjs` raises `proxyClientMaxBodySize` to 30 MB for audio multipart uploads.

### Supabase project usage
One project, three client factories:

| Factory | File | Auth context | Usage |
|---|---|---|---|
| Browser client | [lib/supabase/client.ts](lib/supabase/client.ts) | anon key + user cookie session | 7 files; only `login-form.tsx`, `auth/callback/page.tsx`, `signal-library-client.tsx` read tables (all `users.role` lookups) |
| SSR cookie client | [lib/supabase/server.ts](lib/supabase/server.ts) | anon key + user cookie session | 49 files (server components, some routes) |
| **Service-role client** | [lib/supabase/admin.ts](lib/supabase/admin.ts) | `SUPABASE_SERVICE_ROLE_KEY`, **bypasses RLS** | **181 files** — the de-facto data path |

A second inline service-role client exists at [lib/data/platform-admin.ts:644](lib/data/platform-admin.ts#L644).

### Database access patterns
- **No ORM.** All access is `@supabase/supabase-js` PostgREST query-builder calls. (`prisma-query-logger.js` at repo root is a vestigial load-test artifact, not a runtime dependency.)
- A handful of SQL RPCs: `delete_lead`, `match_leads_by_company_normalized_email`, `adopt_voice_note_from_upload`, `sync_voice_notes_from_conversation`, `complete_voice_note_transcription`, plus `current_role()` / `current_company_id()` / `current_license_id()` / `event_app_permission_enabled()` policy helpers.
- Tenant scoping is enforced **in application code** by resolvers, not by the database, on the web path.

### Client-side vs server-side
Effectively **server-only**. The browser never queries domain tables — it only resolves its own `users.role` to pick a redirect. All lead/event/campaign/import data is fetched in server components or through `app/api/*`.

### API / server routes
- **130 route handlers** under [app/api/](app/api/), grouped as `admin/`, `exhibitor/`, `mobile/`, `campaigns/`, `conversations/`, `integrations/`, `invites/`, `internal/`, `v1/`, `auth/`, `e2e/`.
- Server actions in [app/actions/](app/actions/), [app/admin/users/actions.ts](app/admin/users/actions.ts), [app/(app)/exhibitor/users/actions.ts](app/(app)/exhibitor/users/actions.ts).
- `app/api/v1/*` is a small platform-admin-only CRUD surface (events, exhibitors), not a public API.

### Background jobs / workers
- **Vercel Cron, every minute** → `GET /api/internal/workflow-tick` ([vercel.json](vercel.json), [app/api/internal/workflow-tick/route.ts](app/api/internal/workflow-tick/route.ts)). Authenticated by `Authorization: Bearer` matching `WORKFLOW_TICK_SECRET` or `CRON_SECRET`. Per tick it runs the lead-workflow reconciler, the stale-conversation reconciler, then claims **one** due `workflow_step_runs` row.
- In-process kick: `emitLeadCaptured` POSTs the same endpoint ([lib/workflows/emit/lead-captured-emit.ts](lib/workflows/emit/lead-captured-emit.ts)).
- Conversation transcription/synthesis runs inside request handlers and reconcilers ([lib/conversations/process-upload.ts](lib/conversations/process-upload.ts)), not a separate queue.
- Internal health endpoints under `/api/internal/health/lead-retrieval/*`, HMAC-signed ([lib/internal-health/internal-health-auth.ts](lib/internal-health/internal-health-auth.ts)).

### Storage
- **Cloudflare R2** via AWS S3 SDK ([lib/r2.ts](lib/r2.ts)) is the real object store: conversation audio, briefing knowledge files, documents.
- **Supabase Storage is not meaningfully used.** One call exists — `supabase.storage.from("conversations").getPublicUrl(path)` in [app/(app)/exhibitor/leads/[leadId]/page.tsx:217](app/(app)/exhibitor/leads/[leadId]/page.tsx#L217) — annotated in-code as "not used in UI until conversation audio is live."

### Realtime
**Not used.** No `.channel(`, `postgres_changes`, or `removeChannel` anywhere in `app/`, `lib/`, `components/`, `mobile/`.

### External integrations
OpenAI (transcription + `gpt-4.1-mini` synthesis), SendGrid, Google Workspace OAuth (Gmail send / Calendar), HubSpot, Salesforce, Streampoint (registration), Zapier / Make / n8n outbound webhooks, Apollo, ZoomInfo, People Data Labs, Cloudflare R2.

### Deployment / environment
Vercel. Env files: `.env.local`, `.env.production.local`, `.env.vercel.local`, template in `.env.example`. Notable vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_AUTH_CALLBACK_URL`, `WORKFLOW_TICK_SECRET`, `CRON_SECRET`, `INTERNAL_HEALTH_SIGNING_SECRET`, `INTEGRATION_SECRET_ENCRYPTION_KEYS`, `R2_*`, `OPENAI_API_KEY`, `SENDGRID_API_KEY`, provider OAuth triplets.

---

## Authentication

### Initialization
Supabase Auth is initialized in three places only: [lib/supabase/client.ts](lib/supabase/client.ts) (browser), [lib/supabase/server.ts](lib/supabase/server.ts) (SSR cookies), [lib/supabase/middleware.ts](lib/supabase/middleware.ts) (edge/middleware session refresh). Service-role client in [lib/supabase/admin.ts](lib/supabase/admin.ts) disables session persistence.

### Login flow
[app/(public)/login/login-form.tsx](app/(public)/login/login-form.tsx) — **email OTP code only**, no password login on the web:
1. `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: origin + "/auth/callback" } })`
2. User enters the 6-digit code → `verifyOtp`
3. Client calls `POST /api/invites/complete-session`, then reads `users.role` and redirects.

Password sign-in exists only for the **mobile/invite-claim** path (`app/api/invites/claim/route.ts` sets a password via `admin.createUser`/`updateUserById`).

### Signup / invite flow
There is no self-serve signup. Three invite paths, all service-role:
- **Platform admin** → [app/admin/users/actions.ts](app/admin/users/actions.ts): `auth.admin.inviteUserByEmail` / `generateLink`, writes invite scope into `user_metadata`.
- **Organizer** → [app/api/organizer/invite/route.ts](app/api/organizer/invite/route.ts).
- **Exhibitor company admin** → [app/api/exhibitor/invite/route.ts](app/api/exhibitor/invite/route.ts) and [lib/server/company-scoped-invite.ts](lib/server/company-scoped-invite.ts).
- **Code-based claim** (mobile-first) → [app/api/invites/claim/route.ts](app/api/invites/claim/route.ts): looks up `invite_codes` by hashed code + email, then **creates or password-updates the auth user**, then upserts `public.users` and `event_users`.

### Session creation / refresh / logout
- Creation: `verifyOtp`, `exchangeCodeForSession` ([app/auth/server-callback/route.ts](app/auth/server-callback/route.ts)), or `setSession` from URL hash ([app/auth/callback/page.tsx](app/auth/callback/page.tsx)).
- Refresh: `updateSession()` in [lib/supabase/middleware.ts](lib/supabase/middleware.ts) runs on **every** non-static request (matcher `/((?!_next/static|_next/image|favicon.ico).*)`), calls `supabase.auth.getUser()`, and rewrites cookies.
- Logout: `POST /auth/signout` → `supabase.auth.signOut()` ([app/auth/signout/route.ts](app/auth/signout/route.ts)).

### Password reset
[app/auth/reset/](app/auth/reset/) + [app/(public)/login/recovery-password-form.tsx](app/(public)/login/recovery-password-form.tsx) — Supabase `recovery` OTP type handled through `/auth/callback`.

### OAuth / social auth
**No social login.** All OAuth in this repo is *integration* OAuth (Google Workspace, HubSpot, Salesforce, ZoomInfo), never identity.

### Middleware / guards
[middleware.ts](middleware.ts) → [lib/supabase/middleware.ts](lib/supabase/middleware.ts) is the single guard. It:
- passes through OAuth browser handoffs, Bearer-auth API calls, the workflow-tick path, internal-health paths, E2E bypass, Apple-review login, and (in `development` only) `x-dev-bypass: true`;
- otherwise loads `auth.getUser()`, reads `users.role` + `users.company_id`, normalizes role, and enforces route-prefix RBAC (`/admin`, `/organizer`, `/exhibitor`) plus role-home redirects;
- performs an extra company-scoped license lookup to decide whether an `exhibitor_admin` may enter multi-event `/admin/*` surfaces.

Server-side guards: `requireAuth`, `requireRole`, `requireExhibitorScope` in [lib/auth/session.ts](lib/auth/session.ts); `resolveApiSession` in [lib/auth/resolveApiSession.ts](lib/auth/resolveApiSession.ts) (cookie **or** `Authorization: Bearer` for mobile, then a service-role `users` lookup, then an optional mobile-app-access check).

### JWT / cookies
Supabase-issued JWTs only; the app never mints or verifies its own identity JWT. `jose` appears only in [lib/integrations/google/oauth-client.ts](lib/integrations/google/oauth-client.ts) to verify Google ID tokens. Session cookies are `@supabase/ssr` cookies (`base64url` encoding, matched in the E2E bypass and Playwright seeds).

### Local user/profile tables
`public.users` — see [User Model](#user-model).

### Assumptions that `auth.users.id` is the permanent product user identity
Explicit and pervasive:
- `public.users.id uuid primary key references auth.users(id) on delete cascade` ([supabase/migrations/0001_phase1.sql](supabase/migrations/0001_phase1.sql))
- `public.companies.organizer_id uuid not null references auth.users(id) on delete cascade` — a **domain** table pointing straight at the auth schema
- Every RLS policy compares `auth.uid()` to `public.users.id` (26 migrations contain `auth.uid()`)
- `current_role()` / `current_company_id()` are `SECURITY DEFINER` functions selecting `from public.users where id = auth.uid()`
- Deleting a product user calls `auth.admin.deleteUser` ([lib/server/account-self-delete.ts](lib/server/account-self-delete.ts), [lib/server/company-team-management.ts](lib/server/company-team-management.ts))

### Service-role usage
181 files. It is the primary data path for all exhibitor/admin/mobile API work, all invite/user administration, all workflow execution, and all conversation processing.

### Custom auth logic (non-standard entry points)
| Path | Gate | Concern |
|---|---|---|
| `x-dev-bypass: true` header | `NODE_ENV === "development"` only; returns a hard-coded user + company in `resolveApiSession` | Fine, but the hard-coded UUIDs are real-looking |
| [app/api/e2e/auth-bypass/route.ts](app/api/e2e/auth-bypass/route.ts) | `E2E_AUTH_BYPASS_ENABLED` + email allowlist; mints cookies via `generateLink` + `verifyOtp` | Must stay off in prod |
| [app/api/auth/apple-review-login/route.ts](app/api/auth/apple-review-login/route.ts) | env-configured single review email | Same |
| [lib/server/emergency-login-code.ts](lib/server/emergency-login-code.ts) | admin-triggered; generates invite/magiclink action link, audited to `emergency_login_code_audit_events` | Bypasses normal OTP |

### Files most affected when this product stops owning identity
[middleware.ts](middleware.ts) · [lib/supabase/middleware.ts](lib/supabase/middleware.ts) · [lib/supabase/server.ts](lib/supabase/server.ts) · [lib/supabase/client.ts](lib/supabase/client.ts) · [lib/auth/session.ts](lib/auth/session.ts) · [lib/auth/resolveApiSession.ts](lib/auth/resolveApiSession.ts) · [app/auth/server-callback/route.ts](app/auth/server-callback/route.ts) · [app/auth/callback/page.tsx](app/auth/callback/page.tsx) · [app/auth/signout/route.ts](app/auth/signout/route.ts) · [app/(public)/login/](app/(public)/login/) (whole directory) · [app/auth/reset/](app/auth/reset/) · [app/api/invites/claim/route.ts](app/api/invites/claim/route.ts) · [app/api/invites/redeem/route.ts](app/api/invites/redeem/route.ts) · [app/api/invites/complete-session/route.ts](app/api/invites/complete-session/route.ts) · [app/api/exhibitor/invite/route.ts](app/api/exhibitor/invite/route.ts) · [app/api/organizer/invite/route.ts](app/api/organizer/invite/route.ts) · [app/admin/users/actions.ts](app/admin/users/actions.ts) · [app/admin/company-licenses/users/actions.ts](app/admin/company-licenses/users/actions.ts) · [lib/server/company-scoped-invite.ts](lib/server/company-scoped-invite.ts) · [lib/server/company-team-management.ts](lib/server/company-team-management.ts) · [lib/server/invites/](lib/server/invites/) (14 files) · [lib/server/account-self-delete.ts](lib/server/account-self-delete.ts) · [lib/server/emergency-login-code.ts](lib/server/emergency-login-code.ts) · [lib/data/platform-admin.ts](lib/data/platform-admin.ts) · [app/api/e2e/auth-bypass/route.ts](app/api/e2e/auth-bypass/route.ts) · [app/api/auth/apple-review-login/route.ts](app/api/auth/apple-review-login/route.ts) · [app/api/auth/exhibitor-web-entry/route.ts](app/api/auth/exhibitor-web-entry/route.ts)

---

## User Model

### Representation
`public.users` is the product profile, keyed **by the auth user id**:

```
id               uuid PK  → references auth.users(id) ON DELETE CASCADE
role             text     CHECK (platform_admin | event_organizer | exhibitor_admin | exhibitor_viewer)
company_id       uuid     → companies(id)          -- single, nullable
full_name        text
email            text     -- mirrored copy of the auth email
event_access_mode text    CHECK (all_company_events | assigned_events_only)
license_id       uuid     → licenses(id)           -- legacy, non-authoritative
created_at       timestamptz
```

Note: `types/app.ts`/session code also normalizes legacy `'organizer'`/`'exhibitor'`/`'viewer'` role strings ([lib/auth/session.ts](lib/auth/session.ts)), so live data may contain values outside the current CHECK constraint.

### Profile tables
`public.users` is the only profile table. There is no separate `profiles`.

### Email as identifier
Yes, in several places — this matters because Platform Core will own the email:
- `findAuthUserByEmailAdmin` + `auth.admin.listUsers` paging in [lib/server/company-scoped-invite.ts:188](lib/server/company-scoped-invite.ts#L188)
- `invite_codes` matched by `.ilike("email", email)` ([app/api/invites/claim/route.ts](app/api/invites/claim/route.ts))
- `emergency_login_code_audit_events.email`, `document_sends` recipient email
- `match_leads_by_company_normalized_email` RPC (lead dedupe — lead email, not user email)
- `users.email` is a denormalized mirror that can drift from `auth.users.email`

### `auth.users.id` used as a foreign key
- `public.users.id` (PK → `auth.users.id`)
- **`public.companies.organizer_id` → `auth.users(id)` directly** (bypasses `public.users` entirely)

### Tables referencing user IDs
`users.id` (→ `public.users`): `event_users.user_id`, `leads.owner_user_id`, `leads.follow_up_calendar_owner_user_id`, `google_workspace_connections.user_id`, `google_oauth_state_nonces.user_id`, `mobile_oauth_launch_tickets.user_id`, `invite_codes.used_by_user_id`, `signals.created_by` + `signals.owner_user_id`, `campaigns.created_by`, `workflow_templates.created_by`, `briefing_event_knowledge_items.created_by`, `lead_briefings.reviewed_by`, `import_batch_row_briefings.reviewed_by`, `emergency_login_code_audit_events.user_id`, `users.license_id`.

### Multi-organization membership
**No.** `users.company_id` is a single column. [app/api/invites/claim/route.ts](app/api/invites/claim/route.ts) hard-rejects redemption with *"This account is already linked to a different exhibitor company"*. `event_users.exhibitor_company_id` exists but is always the user's own company in practice. **This is the primary structural conflict with Platform Core.**

### Role scoping
Roles are **global per user** (`users.role`), with **event-scoped permissions layered on top**:
- `users.role` → capability class (`platform_admin`, `event_organizer`/`organizer_admin`, `exhibitor_admin`, `exhibitor_viewer`)
- `event_users.permissions` jsonb → `{ admin: bool, app: bool }` per event ([lib/exhibitor/event-app-permission-enabled.ts](lib/exhibitor/event-app-permission-enabled.ts), DB mirror `public.event_app_permission_enabled()`)
- `users.event_access_mode` + an eligible company-scoped license decide *which* events are reachable ([lib/access/event-access-mode.ts](lib/access/event-access-mode.ts))

So: role = global, permissions = event-specific, entitlement = organization-specific (license). Nothing is truly product-specific yet — which is convenient, because Platform Core can own the org/event layer while LR keeps `event_users.permissions`.

### Invitations creating user records
Yes. Both `auth.users` (via `inviteUserByEmail` / `createUser`) **and** `public.users` + `event_users` rows are created by the invite pipeline. Invite scope is carried in **`auth.user_metadata`** and replayed at callback time by [lib/server/invites/invite-auth-membership-activation.ts](lib/server/invites/invite-auth-membership-activation.ts) and [lib/server/event-user-access.ts](lib/server/event-user-access.ts) (`activateInvitedMembershipsWithSeatEnforcement`).

### Conflicts with a global SignalThread `user_id`
| # | Conflict | Location |
|---|---|---|
| 1 | One user → one company | `users.company_id`, invite-claim conflict check |
| 2 | `public.users.id` FK-bound to local `auth.users` | `0001_phase1.sql` |
| 3 | `companies.organizer_id` → `auth.users(id)` | `0001_phase1.sql` |
| 4 | Invite scope stored in `auth.user_metadata` | `lib/data/platform-admin.ts:677` and 12 call sites |
| 5 | User deletion = auth deletion | `account-self-delete.ts`, `company-team-management.ts` |
| 6 | `users.email` mirror + email-based auth-user lookup | `company-scoped-invite.ts`, `invites/claim` |
| 7 | Seat accounting keyed on local users | `licenses.seats_used`, `event-user-access.ts` |

---

## Organization Model

### Canonical table
**`public.companies`** is the only tenant/organization concept.

```
id                     uuid PK
name                   text
organizer_id           uuid NOT NULL → auth.users(id)     -- host/owner
default_enrichment_provider text
zapier_webhook_url     text
zapier_payload_type    text
created_at             timestamptz
```

`companies` is overloaded: it represents both the **organizer host account** and the **exhibitor company**, distinguished by how it is referenced (`events.company_id`, `licenses.exhibitor_company_id`, `event_users.exhibitor_company_id`).

### Primary key
`companies.id` (uuid, `gen_random_uuid()`).

### How users attach
`users.company_id` → `companies.id` (single). Per-event attachment via `event_users(user_id, event_id, exhibitor_company_id, status, permissions)`.

### How permissions attach
`event_users.permissions` jsonb `{admin, app}` — evaluated identically in app code and in the DB helper `public.event_app_permission_enabled(jsonb)` (migration `0069`). Aggregated by [lib/server/exhibitor-permission-aggregates.ts](lib/server/exhibitor-permission-aggregates.ts).

### How events attach
- `events.company_id` → owning company
- `exhibitors(event_id, company_id, status)` → exhibitor-at-event join, unique on `(event_id, company_id)` (migration `0010`)
- `licenses(company_id, exhibitor_company_id, event_id, scope)` → entitlement, `scope ∈ {event, company}`

### Multiple organizations per user
**No** (see User Model).

### Organization IDs embedded in URLs / JWTs / storage paths / integrations
| Surface | Contains org id? | Detail |
|---|---|---|
| URLs | **No** | Routes are role-prefixed (`/exhibitor/...`, `/admin/...`); company comes from the session |
| JWTs | **No** | Nothing custom is in the Supabase JWT |
| Storage paths | **No** | R2 keys are `conversations/<leadId>/<ts>.m4a` — lead-scoped only |
| Integrations | **Yes** | `integrations.account_id`, `integration_sync_configs.account_id`, `registration_provider_configs.account_id`, `email_templates.account_id`, `documents.account_id`, `zoominfo_company_connections.company_id`, `companies.zapier_webhook_url` |
| Cookies | Event only | `EXHIBITOR_APP_ACTIVE_EVENT_COOKIE`, `EXHIBITOR_ADMIN_ACTIVE_EVENT_COOKIE` — validated server-side against the accessible set every read |

### Duplicated concepts Platform Core should replace
- `companies` (identity/name/ownership) → becomes a **reference** to Platform Core `organization_id`
- `users` (identity/email/name) → becomes a **reference** to Platform Core `user_id`
- `event_users` **membership existence** → Platform Core event membership
- `licenses.scope` / `can_create_events` / `max_events` → Platform Core module entitlements

### Product-owned vs Platform Core reference
| Stays product-owned | Becomes a Platform Core reference |
|---|---|
| `event_users.permissions` (LR-specific `admin`/`app` flags) | membership existence and status |
| `users.event_access_mode` (LR resolver input) — *or* moves; see Open Decisions | user identity, email, display name |
| `companies.default_enrichment_provider`, `zapier_*` | company name, ownership, org identity |
| `licenses.seats_total/seats_used` seat mechanics | entitlement grant (does this org have LR at all) |
| `exhibitors` (exhibitor-at-event operational join) | canonical event record |

---

## Event Model

### Canonical representation
**`public.events`** (migration `0009`, extended by `0044`, `0070`, `0015`):

```
id                    uuid PK
company_id            uuid NOT NULL → companies(id)   -- owner
name                  text NOT NULL
city / state / location text
start_date / end_date date NULL                        -- nullable since 0070
status                text CHECK (ACTIVE | UPCOMING | COMPLETED)
container_kind        text CHECK (event | continuous_capture)  DEFAULT 'event'
is_active             boolean
briefing_strategy     jsonb
registration_provider / registration_base_url / registration_api_token / registration_event_id
created_at / updated_at
```

**Critical:** `container_kind = 'continuous_capture'` rows are *not events* — they are persistent per-company lead buckets that reuse the `events` table so `leads.event_id` stays a stable FK (see the migration comment in [supabase/migrations/0070_events_container_kind.sql](supabase/migrations/0070_events_container_kind.sql)). Their dates are constrained to be NULL.

### Primary key
`events.id` (uuid). Referenced by `leads.event_id`, `event_users.event_id`, `exhibitors.event_id`, `licenses.event_id`, `invite_codes.event_id`, `signals.event_id`, `documents.event_id`, `workflow_templates.event_id`, `workflow_runs.event_id`, `generated_drafts.event_id`, `lead_voice_notes.event_id`, `briefing_event_knowledge_items.event_id`, `google_email_activities.event_id`, `google_calendar_meeting_activities.event_id`.

### Creation flow
[lib/server/events/create-event-mutation.ts](lib/server/events/create-event-mutation.ts) → [lib/events/create-event-mutation-core.ts](lib/events/create-event-mutation-core.ts). Entitlement is checked for `exhibitor_admin` (company-scoped license + `can_create_events` + `max_events`); `platform_admin`/`organizer_admin` skip it. Insert is a single **service-role** insert, followed by `ensureEventScopedStarterSignals` which copies starter `signals` rows into the new event. UI entry points: `app/app/events/new`, `app/admin/events/new`.

### Deletion / archive
No archive concept. Hard delete exists at [app/admin/events/[eventId]/page.tsx:61](app/admin/events/[eventId]/page.tsx#L61) and `DELETE /api/v1/events/[eventId]` (platform-admin only). Cascades are aggressive — `leads`, `event_users`, `lead_voice_notes`, `licenses` all `ON DELETE CASCADE` from `events`.

### Ownership
`events.company_id`. For organizer-run shows this is the organizer's company; for direct exhibitor buyers it is the exhibitor's own company. There is **no separate organizer/exhibitor distinction on the row itself**.

### User/event membership
`event_users` — `(user_id, event_id, exhibitor_company_id, status ∈ {active, invited, …}, permissions jsonb)`. Deduped by migration `0067`/`0068`.

### Organization/event relationship
Two overlapping links: `events.company_id` (owner) and `exhibitors(event_id, company_id)` (participant). Platform Core will need both directions.

### Status / lifecycle
Derived, not stored, by [lib/events/event-lifecycle.ts](lib/events/event-lifecycle.ts): stored `COMPLETED` wins; otherwise dates on the **UTC calendar day** decide live/upcoming/completed; a stale `ACTIVE` never survives a past end date. Workspace states in `app/(app)/exhibitor/dashboard/{upcoming,live,completed}-state.tsx`.

### Timezone / date handling
**There is no `events.timezone` column.** All lifecycle comparisons use UTC calendar days, documented in [lib/events/event-lifecycle.ts:23](lib/events/event-lifecycle.ts#L23) as a ±1-day approximation for non-UTC venues. If Platform Core carries a real event timezone, LR should adopt it.

### Where event IDs appear
| Surface | Detail |
|---|---|
| **Routes (path)** | `app/app/events/[eventId]`, `.../[eventId]/settings`, `.../[eventId]/setup`, `app/admin/events/[eventId]`, `app/api/v1/events/[eventId]` |
| **Routes (query)** | `?eventId=` on exhibitor leads, admin leads export, Streampoint admin, workflow activity links |
| **Cookies** | `EXHIBITOR_APP_ACTIVE_EVENT_COOKIE`, `EXHIBITOR_ADMIN_ACTIVE_EVENT_COOKIE` — always re-validated against the server-resolved accessible set ([lib/server/exhibitor-app-active-event.ts](lib/server/exhibitor-app-active-event.ts)) |
| **Storage paths** | **None.** R2 keys are lead-scoped |
| **Integrations** | `events.registration_event_id` holds the **external** Streampoint event id; `google_email_activities.event_id`, `google_calendar_meeting_activities.event_id` |
| **Background jobs** | `workflow_runs.event_id`, `workflow_templates.event_id`, `generated_drafts.event_id` |
| **Invites** | `invite_codes.event_id`, and `auth.user_metadata.invite_event_id` / `invite_assigned_event_ids` |

### Where LR assumes its local event id is authoritative
`leads.event_id` and every FK above; the event-access resolver ([lib/server/company-event-access.ts](lib/server/company-event-access.ts)); the active-event cookie; the event-scoped signal copy mechanism ([lib/server/signals/event-scoped-signal-copies.ts](lib/server/signals/event-scoped-signal-copies.ts)); `events.briefing_strategy`.

### Safest way to adopt a canonical Platform Core `event_id`
**Reseed and make `events.id` the Platform Core id** — do not add a parallel mapping column for the long term. Rationale drawn from the code:

1. `events.id` is already a UUID with no external meaning, and `leads.event_id` and 13 other tables FK to it. A mapping column would force every one of those joins through an indirection.
2. There are no real customers, so a reseed is available and strictly simpler than a dual-key migration.
3. `container_kind = 'continuous_capture'` rows **must not** be given a Platform Core `event_id` — they aren't events. Either keep them as locally-generated ids in a separate table, or have Platform Core model "continuous capture container" as a first-class non-event container. This needs a decision (see Open Decisions).
4. Retain `events.registration_event_id` as the existing precedent for storing a foreign system's event id — the same pattern already works.

Interim safety valve: add a nullable `events.platform_event_id` **only** if a phased cutover is needed, and delete it once reseed completes.

---

## Product-Owned Data

### Should remain owned by this product
| Domain | Tables |
|---|---|
| Leads | `leads`, `lead_enrichments`, `lead_briefings`, `lead_cumulative_insights`, `lead_conversation_readiness`, `lead_voice_notes`, `lead_conversations` |
| Import wizard | `import_batches`, `import_batch_rows`, `import_batch_row_briefings`, `import_batch_field_mapping_state`, `import_wizard_field_mapping_state`, `import_wizard_enrichment_runs` |
| Briefings | `briefing_event_knowledge_items`, `events.briefing_strategy` |
| Campaigns / messaging | `campaigns`, `campaign_recipients`, `campaign_messages`, `email_events`, `email_templates`, `generated_drafts` |
| Documents | `documents`, `document_sends` |
| Signals | `signals` (incl. event-scoped copies) |
| Workflows | `workflow_templates`, `workflow_steps`, `workflow_runs`, `workflow_step_runs`, `workflow_lead_trigger_rules`, `workflow_trigger_decisions` |
| Integrations (LR's own connections) | `integrations`, `integration_sync_configs`, `registration_provider_configs`, `zoominfo_company_connections`, `google_workspace_connections`, `google_workspace_connection_secrets`, `google_oauth_state_nonces`, `mobile_oauth_launch_tickets` |
| LR-specific membership detail | `event_users.permissions`, `exhibitors` |

### Should move / become owned by Platform Core
| Concept | Today in LR |
|---|---|
| Global user identity | `auth.users` + `public.users` (id/email/full_name) |
| Organizations | `companies` (id/name/organizer_id) |
| Organization membership | `users.company_id` |
| Canonical events | `events` rows where `container_kind = 'event'` (id/name/dates/location/status) |
| Event membership / access | existence + status of `event_users` rows |
| Module entitlements | `licenses.scope`, `can_create_events`, `max_events`, `license_plans` |
| Product routing | role-home logic in `lib/auth/session.ts` / `lib/supabase/middleware.ts` |

### Needs discussion
| Item | Why ambiguous |
|---|---|
| `users.event_access_mode` | Reads like a platform access policy, but its only consumer is LR's event resolver and it interacts with LR seat rules |
| `licenses.seats_total` / `seats_used` | Entitlement (platform) vs seat consumption mechanics (product) — LR enforces seats at invite-activation time |
| `events` rows with `container_kind = 'continuous_capture'` | Not events; Platform Core may not want them |
| `exhibitors` (event × company join) | Could be Platform Core "org participates in event", or LR-operational |
| `companies.organizer_id` | Organizer ownership is arguably a Platform Core org relationship |
| `invite_codes` | Invitation is a platform concern, but the codes encode LR-specific `permissions` and `event_access_mode` |
| `signals` starter/library rows | Currently LR-owned; may become a shared module later |

**Explicitly product-owned despite referencing user/event:** leads, conversations, briefings, campaigns, imports, workflows, documents. None of these should move.

---

## RLS & Authorization

### Coverage
43 tables created in [supabase/migrations/](supabase/migrations/); **41 have `ENABLE ROW LEVEL SECURITY`**.

| Class | Tables | Assessment |
|---|---|---|
| **RLS on, policies defined** | `users`, `companies`, `leads`, `licenses`, `events`, `event_users`, `campaigns`, `signals`, `email_templates`, `lead_briefings`, `lead_enrichments`, `lead_voice_notes`, `lead_cumulative_insights`, `lead_conversation_readiness`, `briefing_event_knowledge_items`, `import_batches`, `import_batch_rows`, `import_batch_row_briefings`, `import_batch_field_mapping_state`, `import_wizard_field_mapping_state`, `import_wizard_enrichment_runs`, `generated_drafts`, `workflow_*` | 27 tables |
| **RLS on, no policies (deny-all → service-role only)** | `documents`, `document_sends`, `integrations`, `integration_sync_configs`, `registration_provider_configs`, `zoominfo_company_connections`, `invite_codes`, `emergency_login_code_audit_events`, `google_workspace_connections`, `google_workspace_connection_secrets`, `google_oauth_state_nonces`, `mobile_oauth_launch_tickets` | Deliberate; the Google/mobile-OAuth tables additionally `REVOKE ALL … FROM anon, authenticated` (migration `0091`, `0095`). Good pattern. |
| **No RLS statement in migrations** | **`campaign_messages`, `campaign_recipients`, `email_events`** | **Security concern** — see below |

Tables created outside this migration set (`campaign_messages`, `campaign_recipients`, `email_events`, `exhibitors`, `license_plans`, `lead_conversations`, `workflow_lead_trigger_rules`, `import_custom_field_definitions`) confirm that **`supabase/migrations/` is not a complete source of truth for the deployed schema**. `types/database.ts` is also partial (27 tables; missing `documents`, `workflow_*`, `lead_voice_notes`, `lead_conversations`, `integrations`, `invite_codes`).

### Policy shapes
- **`auth.uid()`-based:** present in 26 migrations. Two flavors:
  - Direct: `organizer_id = auth.uid()`, `id = auth.uid()`
  - Indirect via `SECURITY DEFINER` helpers `public.current_role()` / `public.current_company_id()` / `public.current_license_id()`, which all resolve `from public.users where id = auth.uid()`
- **Organization-based:** `company_id = public.current_company_id()`, `company_id in (select id from companies where organizer_id = auth.uid())`
- **Event-based:** migrations `0064`/`0065`/`0069` join `users → event_users` on `event_id` and require `public.event_app_permission_enabled(eu.permissions)`. These are the **mobile capture** policies.
- **Service-role bypass:** all 181 `createAdminClient()` call sites.
- **Server routes bypassing RLS:** effectively all of `app/api/exhibitor/*`, `app/api/mobile/*`, `app/api/admin/*`, `app/api/campaigns/*`, `app/api/internal/*`.
- **Admin-role logic:** `platform_admin` policies on `events`; route-prefix RBAC in middleware; `requirePlatformAdmin()` in `app/api/v1/*`.
- **Product-specific role logic:** `event_users.permissions.{admin,app}` — mirrored in SQL (`event_app_permission_enabled`) and TypeScript (`eventAppPermissionEnabled`). Keeping these two in sync is a standing maintenance cost.

### A material pre-existing finding
Migration `0064`'s own header states that `companies`, `public.users`, `public.leads`, and `public.lead_enrichments` policies *"still reference only the legacy `'exhibitor'` literal and even `exhibitor_admin` does not satisfy them under `current_role()` normalization (0052)."* In other words, **for web `exhibitor_admin` users the base RLS policies already evaluate to false**, and the product works only because every web read/write goes through the service-role client. This is why RLS difficulty is MEDIUM rather than HIGH: there is little working RLS to break. It is also why "just turn on RLS later" is not a safe fallback.

### Hard-coded assumptions about the current Supabase Auth project
- `auth.uid()` in ~26 migrations assumes the JWT was issued by **this project's** GoTrue instance
- `public.users.id → auth.users(id)` and `companies.organizer_id → auth.users(id)` are cross-schema FKs into the local auth schema
- `SECURITY DEFINER` helpers are grant-scoped to the `authenticated` role of this project

### Classification
| Policy group | Classification | Note |
|---|---|---|
| `google_*`, `mobile_oauth_launch_tickets`, `documents`, `integrations*`, `invite_codes`, `registration_provider_configs`, `zoominfo_company_connections` (deny-all + service role) | **Can remain unchanged** | Identity source is irrelevant; server code does the check |
| Mobile capture policies (`0064`/`0065`/`0069`) on `leads`, `lead_briefings`, `companies`, `users` | **Needs adaptation for central identity** | `auth.uid()` must resolve from a Platform-Core-issued token; `public.users` must still contain a row keyed by the global `user_id` |
| `current_role()` / `current_company_id()` / `current_license_id()` helpers | **Needs adaptation** | Keep the function signatures; change only what they read if org membership moves |
| Legacy `'exhibitor'`-literal policies on `companies`, `users`, `leads`, `lead_enrichments`, `licenses` | **Needs complete redesign** | Already effectively dead; rewrite against the new identity rather than patching |
| `campaign_messages`, `campaign_recipients`, `email_events` — **no RLS** | **Security concern** | With default `authenticated` grants these are readable across tenants by any signed-in user holding an anon-key session. Independent of Platform Core; fix regardless |
| `platform_admin` policies on `events` | **Needs adaptation** | `platform_admin` will be a Platform Core role claim, not a local `users.role` string |

### Can central Platform Auth coexist with this RLS model?
**Yes, with one hard requirement.** This product's Supabase project must be configured to **accept and validate Platform Core–issued JWTs** (Supabase third-party/custom auth), so that `auth.uid()` inside LR's Postgres returns the global `user_id`. Then:
- Web: unaffected (service role).
- Mobile: works unchanged *if* `public.users.id` is reseeded to hold global user ids and `event_users.user_id` follows.

If instead LR keeps issuing its own local Supabase session after Platform Core authenticates (a session-exchange model), RLS is unaffected but you get **duplicated identity** — the exact thing Platform Core is meant to eliminate. Choose deliberately; see Open Decisions.

---

## Storage

**Supabase Storage is not used in any meaningful way.** The only reference is `supabase.storage.from("conversations").getPublicUrl(path)` at [app/(app)/exhibitor/leads/[leadId]/page.tsx:217](app/(app)/exhibitor/leads/[leadId]/page.tsx#L217), inside a helper the code itself marks as not wired into the UI. There are no Storage buckets, Storage policies, or Storage uploads in this repository.

Object storage is **Cloudflare R2**:

| Aspect | Detail |
|---|---|
| Client | [lib/r2.ts](lib/r2.ts) — S3 SDK, `R2_ENDPOINT` / `R2_BUCKET` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` |
| Buckets | Single bucket (`R2_BUCKET`), private |
| Access control | **No bucket policies.** Every read/write is brokered by an authenticated Next.js route |
| Paths | `conversations/<leadId>/<timestamp>.m4a` ([lib/conversations/conversation-storage-path.ts](lib/conversations/conversation-storage-path.ts)); briefing-knowledge and document keys under their own prefixes. **No user, org, or event id in any path** |
| Signed URLs | `getSignedUrl` for multipart part uploads, TTL 15 min ([app/api/conversations/upload/chunked/chunk-urls/route.ts](app/api/conversations/upload/chunked/chunk-urls/route.ts)) |
| Upload flow | `session` → `chunk-urls` → direct client PUT to R2 → `complete` → `finalize`; guarded by `assertLeadUploadAccess` + `isValidConversationStoragePath` ([lib/conversations/upload-access.ts](lib/conversations/upload-access.ts)) — the path validator exists specifically to stop an upload targeting another lead's key |
| Download flow | Server routes stream/redirect (`documents/[documentId]/preview`, `documents/sends/[sendId]/click`) |
| Service-role ops | R2 credentials are server-only; Supabase service role is used for the accompanying DB writes |

**What must change under Platform Core identity:** essentially nothing in the storage layer. Authorization happens in `assertLeadUploadAccess`, which resolves lead → company → user through the product's own resolvers. Once those resolvers accept a Platform Core `user_id`, storage follows automatically. Because paths are lead-scoped rather than user/org/event-scoped, no key rewriting is required.

---

## Realtime

**Supabase Realtime is not used by this product.** No `.channel(`, `.on("postgres_changes")`, `removeChannel`, or realtime subscription setup exists in `app/`, `lib/`, `components/`, or `mobile/`. All UI freshness comes from server-component re-renders, `router.refresh()`, and polling routes such as `/api/exhibitor/workflows/[workflowId]/status`.

Central auth therefore has **no Realtime impact** in this repo. If the separate mobile repo adds Realtime later, its subscription authorization would inherit the same `auth.uid()` RLS dependency described above.

---

## Cross-Product Dependencies

**No coupling to any other SignalThread product exists in this repository.** Searches for Orca, Voice, and other product names return only unrelated substring matches (`safeErrorCategory`, `ExhibitorCampaignsPage`) and shared branding.

What *does* exist:

| Coupling | Nature | Concern? |
|---|---|---|
| **Mobile app (`lead-intel-scan`)** shares this Supabase project | Same Auth, same Postgres. Mobile writes `public.leads` **directly** under RLS and also calls `/api/mobile/*` with Bearer tokens | **This is a same-product, two-repo coupling, not cross-product.** But it is the reason RLS matters, and it means any auth change requires a coordinated mobile release |
| `NEXT_PUBLIC_AUTH_CALLBACK_URL` defaults to `https://lr.signalthread.ai/auth/callback` | Hard-coded in 5 files as a fallback | Low; needs to point at Platform Core after cutover |
| Streampoint registration provider | LR stores an **external** event id in `events.registration_event_id` | Not cross-product; a useful precedent |
| Outbound webhooks (Zapier / Make / n8n) | LR pushes lead payloads out to customer-owned endpoints | Not cross-product |

**Direct database-to-database dependencies: none found.** LR never writes another product's database, and no other product writes LR's. That is a clean starting point and should be preserved — Platform Core should read LR summary data through an LR-exposed API, not by connecting to LR's Postgres.

---

## Integrations

| Integration | Storage | Scope today | Risk when identity moves |
|---|---|---|---|
| **Google Workspace** (Gmail send, Calendar events/freebusy) | `google_workspace_connections` **UNIQUE(user_id)** + encrypted `google_workspace_connection_secrets` | **User-level**, tagged with `company_id` | **Highest.** The connection is keyed to `public.users.id`. Reseeding user ids without re-keying these rows orphans every Google connection, and `leads.follow_up_calendar_owner_user_id` points at the same identity. A wrong remap would send mail from the wrong person's mailbox |
| **Salesforce** (OAuth) | `integrations(account_id, provider)` UNIQUE + `integration_sync_configs(account_id)` | **Organization-level** | Medium — org id remap must be exact or a tenant inherits another's CRM connection |
| **HubSpot** (OAuth) | `integrations(account_id, provider)` | **Organization-level** | Medium, same as Salesforce |
| **ZoomInfo** | `zoominfo_company_connections(company_id)` + bearer token | **Organization-level** | Medium |
| **Apollo** | `integrations` per company; env `APOLLO_API_KEY` fallback | **Organization-level**, product-level fallback | Low |
| **People Data Labs** | `integrations` per company; env `PDL_API_KEY` fallback | **Organization-level**, product-level fallback | Low |
| **Streampoint** (registration) | `registration_provider_configs(account_id)` + `events.registration_*` | **Organization-level config, event-level binding** | Low |
| **Zapier** | `companies.zapier_webhook_url` / `zapier_payload_type` | **Organization-level** | Low |
| **Make / n8n** | `integrations` outbound webhook config ([lib/integrations/outbound-webhook-config.ts](lib/integrations/outbound-webhook-config.ts)) | **Organization-level** | Low |
| **SendGrid** | `SENDGRID_API_KEY` / `SENDGRID_FROM_EMAIL` | **Product-level** | None |
| **OpenAI** | `OPENAI_API_KEY` | **Product-level** | None |
| **Cloudflare R2** | `R2_*` | **Product-level** | None |
| **Mobile OAuth handoff** | `mobile_oauth_launch_tickets(user_id, company_id)`, single-use, expiring | **User-level** | Medium — same user-id remap issue, but rows are ephemeral so a reseed is trivially safe |

**Where central identity could accidentally change integration ownership:**
1. **Google Workspace** — user-level tokens; a `user_id` remap error transfers mailbox/calendar access between people. This is the single most sensitive remap in the repo.
2. **`integrations.account_id` / `integration_sync_configs.account_id`** — org-level CRM credentials; a `company_id` → `organization_id` remap error cross-wires tenants' CRMs.
3. **`INTEGRATION_SECRET_ENCRYPTION_KEYS`** — provider secrets are app-encrypted before storage. Any reseed must either preserve the key ring or force reconnection.

**Recommendation:** since there are no real customers, **force reconnection** for all user-level and org-level OAuth integrations rather than attempting credential remapping. Delete `google_workspace_connections`, `google_workspace_connection_secrets`, `google_oauth_state_nonces`, `mobile_oauth_launch_tickets`, `integrations`, `integration_sync_configs`, and `zoominfo_company_connections` at cutover.

---

## High-Volume Paths

| Path | Entry point | Tables | Sync / async | Notes |
|---|---|---|---|---|
| **Mobile lead capture** | Direct Supabase write from mobile + `/api/mobile/*` | `leads`, `event_users` (RLS check) | Sync | Highest-frequency write. Authorized purely by RLS on the direct path. **Platform Core must not be on this path** |
| **Conversation audio upload** | `/api/conversations/upload/chunked/{session,chunk-urls,complete}` → `finalize` | `lead_conversations`, `lead_voice_notes` | Presign sync, transfer direct-to-R2, processing async | Large payloads (30 MB body cap); connection-heavy; multipart part listing loops |
| **Transcription + synthesis** | [lib/conversations/process-upload.ts](lib/conversations/process-upload.ts) | `lead_conversations`, `lead_voice_notes`, `lead_cumulative_insights`, `lead_conversation_readiness` | Async | Two OpenAI calls per recording; buffers the whole object into memory |
| **Workflow tick** | Cron 1/min → `/api/internal/workflow-tick` | `workflow_step_runs`, `workflow_runs`, `leads`, `lead_conversations` | Async | Claims exactly **one** step per tick — a known throughput ceiling, flagged in-code for `FOR UPDATE SKIP LOCKED` later |
| **Import wizard** | `/api/exhibitor/import-wizard/*` | `import_batches`, `import_batch_rows`, `import_batch_row_briefings`, `import_wizard_enrichment_runs`, `leads` | Mixed | Bulk row inserts; per-row enrichment and AI briefing generation |
| **Lead list / search / export** | `/api/exhibitor/leads/{list,search}`, `/api/admin/leads/export` | `leads`, `lead_briefings` | Sync | Read-heavy; the route already instruments its own query count |
| **Campaign send** | `/api/campaigns/[campaignId]/send` | `campaigns`, `campaign_recipients`, `campaign_messages`, `email_events` | Sync fan-out | SendGrid per recipient |
| **Enrichment** | ZoomInfo / Apollo / PDL adapters | `lead_enrichments`, `leads` | Sync within request | External-provider latency in the request path |

### Where Platform Core must NOT be in the hot path
1. **Mobile capture write** — must remain a single Supabase round-trip authorized by a token the client already holds.
2. **Per-request middleware** — [lib/supabase/middleware.ts](lib/supabase/middleware.ts) runs on *every* non-static request and already performs 1–2 DB reads. Adding a Platform Core network call here would tax every page view. Resolve identity from JWT claims; cache org/event/entitlement locally.
3. **Chunked-upload presign** — called once per part; must stay local.
4. **Workflow tick** — runs every 60s regardless of traffic.
5. **Lead list/search** — the most-hit read surface.

**Design implication:** LR should treat Platform Core as an **authoritative source it syncs from**, not a service it calls per request. Verify the token signature locally (JWKS, cached), and keep a local read-model of organization, event, membership, and entitlement that Platform Core pushes or LR refreshes on a schedule. Normal product operation must survive Platform Core being unreachable.

---

## Required Platform Core Changes

### A. Central authentication changes
1. Configure this product's Supabase project to **trust Platform Core as a third-party JWT issuer**, so `auth.uid()` inside LR's Postgres resolves to the global `user_id`. Without this, the mobile RLS path cannot work.
2. Replace the LR login UI with a redirect to Platform Core: delete/retire [app/(public)/login/](app/(public)/login/) and [app/auth/reset/](app/auth/reset/); keep a thin callback that establishes the local session from the Platform Core token.
3. Rewrite [lib/supabase/middleware.ts](lib/supabase/middleware.ts) to validate the Platform Core token and read role/org/event from claims + local read-model instead of a `users` table query per request.
4. Rewrite [lib/auth/session.ts](lib/auth/session.ts) (`getCurrentSessionUser`, `requireAuth`, `requireRole`, `requireExhibitorScope`) and [lib/auth/resolveApiSession.ts](lib/auth/resolveApiSession.ts) to source identity from the verified token.
5. **Remove all `auth.admin.*` user-lifecycle calls** — 40+ call sites across [app/admin/users/actions.ts](app/admin/users/actions.ts), [app/admin/company-licenses/users/actions.ts](app/admin/company-licenses/users/actions.ts), [lib/server/company-scoped-invite.ts](lib/server/company-scoped-invite.ts), [lib/server/company-team-management.ts](lib/server/company-team-management.ts), [lib/server/account-self-delete.ts](lib/server/account-self-delete.ts), [app/api/invites/claim/route.ts](app/api/invites/claim/route.ts), [app/api/exhibitor/invite/route.ts](app/api/exhibitor/invite/route.ts), [app/api/organizer/invite/route.ts](app/api/organizer/invite/route.ts). Creating, inviting, and deleting users becomes a Platform Core operation.
6. **Eliminate the `auth.user_metadata` invite channel.** Move `invite_event_id` / `invite_company_id` / `invite_exhibitor_company_id` / `invite_role` / `invite_event_access_mode` / `invite_assigned_event_ids` into LR tables (extend `invite_codes`) or into a Platform Core invitation API. Affects [lib/data/platform-admin.ts](lib/data/platform-admin.ts), [lib/server/invites/invite-auth-membership-activation.ts](lib/server/invites/invite-auth-membership-activation.ts), [app/auth/server-callback/route.ts](app/auth/server-callback/route.ts), [app/api/invites/complete-session/route.ts](app/api/invites/complete-session/route.ts).
7. Retire or re-gate the alternate entry points: [app/api/e2e/auth-bypass/route.ts](app/api/e2e/auth-bypass/route.ts), [app/api/auth/apple-review-login/route.ts](app/api/auth/apple-review-login/route.ts), [lib/server/emergency-login-code.ts](lib/server/emergency-login-code.ts), and the `x-dev-bypass` branch in [lib/auth/resolveApiSession.ts](lib/auth/resolveApiSession.ts). All three mint local Supabase sessions.
8. Coordinate a **simultaneous mobile release** — mobile's Supabase sign-in must switch to Platform Core at the same moment.

### B. Global ID changes
- **`user_id`:** Reseed `public.users.id` with Platform Core user ids. Drop the `references auth.users(id)` FK; `public.users` becomes a local projection of the global user (id, cached email/full_name, LR role, org ref). Update `companies.organizer_id` to reference `public.users(id)` or a Platform Core org-owner reference rather than `auth.users(id)`.
- **`organization_id`:** Reseed `companies.id` with Platform Core organization ids, or replace `companies` with a thin `organizations` projection table. All `company_id` / `account_id` / `exhibitor_company_id` columns then carry the global id unchanged — no column renames strictly required, though renaming `account_id` → `organization_id` in `integrations`, `integration_sync_configs`, `registration_provider_configs`, `email_templates`, `documents` would remove a long-standing naming inconsistency.
- **`event_id`:** Reseed `events.id` with Platform Core event ids for `container_kind = 'event'`. Decide separately how `continuous_capture` containers are identified (see Open Decisions). All 14 FK'ing tables inherit the change.
- **Multi-org:** Introduce an `organization_members(user_id, organization_id, …)` projection and stop treating `users.company_id` as the single source. Remove the single-company conflict guard in [app/api/invites/claim/route.ts](app/api/invites/claim/route.ts). Update `current_company_id()` to resolve against the *active* organization rather than a fixed column.
- Regenerate [types/database.ts](types/database.ts) — it is currently partial (27 of 43+ tables).

### C. RLS/security changes
1. Rewrite the legacy `'exhibitor'`-literal policies on `companies`, `users`, `leads`, `lead_enrichments`, `licenses` — they are already dead under `current_role()` normalization (documented in migration `0064`).
2. **Enable RLS on `campaign_messages`, `campaign_recipients`, `email_events`** and add company-scoped policies. Do this regardless of Platform Core.
3. Update `current_role()` / `current_company_id()` / `current_license_id()` to work with the new identity and multi-org active-org concept, preserving their signatures so existing policies keep compiling.
4. Keep the mobile capture policies (`0064`/`0065`/`0069`) structurally intact; they only need `auth.uid()` to resolve to the global `user_id`.
5. Keep the deny-all + service-role pattern for integration/secret tables, and extend the `REVOKE ALL … FROM anon, authenticated` treatment (migration `0091`) to the other deny-all tables.
6. Replace `platform_admin` string checks with a Platform Core role/entitlement claim.

### D. Routing/context changes
- **Signed-in user:** from the verified Platform Core token; drop the per-request `users` lookup in middleware in favor of claims + a cached projection.
- **Selected organization:** currently implicit in `users.company_id`. Needs an explicit active-org concept — a claim in the Platform Core token, or an LR cookie validated against Platform Core memberships (mirroring how the active-event cookie is already validated in [lib/server/exhibitor-app-active-event.ts](lib/server/exhibitor-app-active-event.ts)).
- **Selected event:** the existing pattern is sound and should be kept — URL wins, then cookie, then first accessible, always re-validated server-side ([lib/exhibitor/exhibitor-app-active-event-logic.ts](lib/exhibitor/exhibitor-app-active-event-logic.ts), [lib/server/company-event-access.ts](lib/server/company-event-access.ts)).
- **Entry from Platform Core:** add a route that accepts `?organization_id=&event_id=` on inbound deep-links, validates both against entitlements, sets the active-org/active-event cookies, then redirects to the role home.
- **Role home:** `getRoleHomePath` and `EXHIBITOR_WEB_ENTRY_RESOLVER_PATH` ([lib/exhibitor/exhibitor-web-home.ts](lib/exhibitor/exhibitor-web-home.ts)) should consume Platform Core entitlements instead of local license lookups.

### E. Platform integration (what LR exposes back)
Keep this small and read-only from Platform Core's perspective:
1. **Entitlement check hook** — LR consumes, not exposes: "does org X have the LR module, with what limits (`max_events`, `can_create_events`, seats)".
2. **Summary read-model push** — per (organization, event): lead count, hot/warm/cold split, conversations captured, briefings generated, campaigns sent, last capture timestamp. Push on a schedule; never let Platform Core query LR's Postgres directly.
3. **Event lifecycle webhook consumer** — `event.created` / `event.updated` / `event.archived` from Platform Core, so LR's local `events` projection stays current.
4. **Membership webhook consumer** — `membership.granted` / `membership.revoked`, replacing today's invite-activation pipeline.
5. **Health/status endpoint** — reuse the existing signed internal-health pattern ([lib/internal-health/internal-health-auth.ts](lib/internal-health/internal-health-auth.ts)) rather than inventing a new auth scheme.

### F. Test-data/reset work
No real customers, so **reseed rather than migrate**:
1. Truncate all product data (`leads`, `lead_*`, `import_*`, `campaigns`, `campaign_*`, `email_events`, `documents`, `document_sends`, `workflow_*`, `signals`, `generated_drafts`, `briefing_event_knowledge_items`).
2. Delete all integration connections and secrets — force reconnection (`integrations`, `integration_sync_configs`, `google_workspace_*`, `google_oauth_state_nonces`, `mobile_oauth_launch_tickets`, `zoominfo_company_connections`, `registration_provider_configs`).
3. Delete `auth.users`, `public.users`, `companies`, `events`, `event_users`, `exhibitors`, `licenses`, `invite_codes`.
4. Reseed `companies`/`users`/`events` from Platform Core ids.
5. Purge the R2 bucket of orphaned `conversations/<leadId>/…` objects — existing scripts [scripts/cleanup-e2e-artifacts.ts](scripts/cleanup-e2e-artifacts.ts), [scripts/audit-r2-voice-uploads.ts](scripts/audit-r2-voice-uploads.ts), and [scripts/cleanup-r2-multipart.ts](scripts/cleanup-r2-multipart.ts) already cover most of this.
6. Rebuild the E2E/Playwright seed path — [scripts/ensure-maestro-e2e-user.ts](scripts/ensure-maestro-e2e-user.ts) and [app/api/e2e/auth-bypass/route.ts](app/api/e2e/auth-bypass/route.ts) both mint local Supabase sessions and will need a Platform Core equivalent.
7. Re-run the existing suites: `npm run test:node:all`, `npm run typecheck`, `npm run test:playwright`.

---

## Risks

### BLOCKER
| Risk | Evidence |
|---|---|
| **Mobile capture depends entirely on `auth.uid()` RLS.** If Platform Core issues tokens this Supabase project does not trust, mobile lead writes fail at the database with no application-level signal. | Migrations `0064`, `0065`, `0069`; the separate `lead-intel-scan` repo signs in against this project's Supabase Auth |
| **`public.users.id → auth.users(id)` and `companies.organizer_id → auth.users(id)`.** Central identity cannot be adopted without dropping these cross-schema FKs and reseeding. | [supabase/migrations/0001_phase1.sql](supabase/migrations/0001_phase1.sql) |

### HIGH
| Risk | Evidence |
|---|---|
| **One user → one organization**, enforced in code and schema; directly contradicts Platform Core multi-org membership. | `users.company_id`; conflict guard in [app/api/invites/claim/route.ts](app/api/invites/claim/route.ts) |
| **Invite scope lives in `auth.user_metadata`** — the entire invite → membership activation pipeline breaks when auth moves. | [lib/data/platform-admin.ts:677](lib/data/platform-admin.ts#L677) + 12 call sites |
| **`campaign_messages`, `campaign_recipients`, `email_events` have no RLS.** With default `authenticated` grants, any signed-in user with an anon-key session can read across tenants. | No `ENABLE ROW LEVEL SECURITY` in any migration for these three tables |
| **Google Workspace tokens are user-keyed** (`UNIQUE(user_id)`) and grant Gmail-send. A bad `user_id` remap sends mail from the wrong mailbox. | [supabase/migrations/0091_google_workspace_connections.sql](supabase/migrations/0091_google_workspace_connections.sql) |
| **Service role is the primary data path (181 files).** All tenant isolation is application logic; one missing scope check leaks across tenants with no database backstop. | `createAdminClient()` call-site count |
| **Migrations are not a complete schema source of truth.** `campaign_messages`, `campaign_recipients`, `email_events`, `exhibitors`, `license_plans`, `lead_conversations`, `workflow_lead_trigger_rules`, `import_custom_field_definitions` were created outside `supabase/migrations/`. Any reseed plan built only from migrations will miss tables. | Table-vs-migration diff |

### MEDIUM
| Risk | Evidence |
|---|---|
| **`events` is overloaded** — `continuous_capture` rows are not events and cannot take a canonical Platform Core `event_id`. | [supabase/migrations/0070_events_container_kind.sql](supabase/migrations/0070_events_container_kind.sql) |
| **Middleware runs on every request** and already does 1–2 DB reads. A Platform Core call here would become a global latency tax. | [lib/supabase/middleware.ts](lib/supabase/middleware.ts), matcher in [middleware.ts](middleware.ts) |
| **Three alternate session-minting routes** (E2E bypass, Apple review login, emergency login codes) each create local Supabase sessions and must be reworked or removed. | `app/api/e2e/auth-bypass`, `app/api/auth/apple-review-login`, `lib/server/emergency-login-code.ts` |
| **Permission logic is duplicated** in SQL (`event_app_permission_enabled`) and TypeScript (`eventAppPermissionEnabled`); they must stay in lockstep through the migration. | Migration `0069` vs [lib/exhibitor/event-app-permission-enabled.ts](lib/exhibitor/event-app-permission-enabled.ts) |
| **`types/database.ts` is stale/partial** (27 of 43+ tables) — a poor basis for planning schema changes. | Generated-types inspection |
| **Legacy `'exhibitor'` policies are already dead**, so there is no working RLS fallback if a server-side scope check is missed. | Migration `0064` header notes |
| **Seat accounting is keyed on local users** and enforced at invite activation; reseeding identity resets `licenses.seats_used` semantics. | [lib/server/event-user-access.ts](lib/server/event-user-access.ts) |

### LOW
| Risk | Evidence |
|---|---|
| Storage auth — R2 paths are lead-scoped with no user/org/event ids; nothing to rewrite. | [lib/conversations/conversation-storage-path.ts](lib/conversations/conversation-storage-path.ts) |
| Realtime auth — not used. | No realtime code anywhere |
| Browser-direct database access — only `users.role` reads from 3 client files. | Browser-client usage scan |
| Cross-product writes — none exist. | No other-product references |
| `NEXT_PUBLIC_AUTH_CALLBACK_URL` hard-coded fallback in 5 files. | grep for `lr.signalthread.ai` |
| Workflow tick claims one step per minute — a throughput ceiling, but unrelated to Platform Core and already flagged in-code. | [app/api/internal/workflow-tick/route.ts](app/api/internal/workflow-tick/route.ts) |

---

## Recommended Implementation Order

1. **Pre-work, independent of Platform Core (~3 days).** Enable RLS + policies on `campaign_messages`, `campaign_recipients`, `email_events`. Regenerate `types/database.ts`. Reconcile the deployed schema back into `supabase/migrations/` so the reseed plan is complete.
2. **Decide the identity contract (blocking).** Third-party JWT trust vs session exchange. Everything downstream depends on this — see Open Decisions.
3. **Introduce a Platform Core projection layer.** Local `organizations` / `organization_members` / `events` projection tables plus a sync client, running alongside the current model without behavior change.
4. **Move invite scope out of `auth.user_metadata`** into `invite_codes` columns. Self-contained and de-risks step 6.
5. **Add multi-org support.** Active-organization cookie + resolver, mirroring the existing active-event pattern; remove the single-company conflict guard.
6. **Cut over authentication.** Token verification in middleware and `resolveApiSession`; retire the login UI and all `auth.admin.*` lifecycle calls; ship the mobile client in lockstep.
7. **Reseed with global IDs.** Truncate, delete integration connections, reseed `companies`/`users`/`events` from Platform Core, purge R2.
8. **Rewrite RLS** against the new identity; rebuild the E2E seed path.
9. **Expose the summary read-model** back to Platform Core, and add the event/membership webhook consumers.
10. **Verify.** Full suite + a live mobile capture test against the reseeded project.

---

## Estimated Complexity

| Area | Complexity | Driver |
|---|---|---|
| Central auth | **MEDIUM** | ~28 files, but auth is already well-centralized in 6 modules. The cost is the 40+ `auth.admin.*` lifecycle call sites and the mobile coordination |
| Global IDs | **MEDIUM** | Reseed avoids data migration entirely; the real work is multi-org and the `continuous_capture` decision |
| RLS | **MEDIUM** | Little working RLS to preserve on the web path, but the mobile policies are load-bearing and must be exactly right |
| Storage | **LOW** | R2, lead-scoped paths, server-brokered |
| Realtime | **NONE** | Not used |
| Integrations | **MEDIUM** | Forced reconnection is cheap; the risk is doing a remap instead |
| High-volume paths | **LOW–MEDIUM** | Mostly a design constraint (keep Platform Core off the hot path) rather than a code change |
| Test/reseed | **MEDIUM** | E2E and Maestro seeding both mint local Supabase sessions |

**Overall: ~4–6 focused engineering weeks** for this repo, plus coordinated work in `lead-intel-scan`.

---

## Files Most Likely to Change

**Auth core (must change)**
[middleware.ts](middleware.ts) · [lib/supabase/middleware.ts](lib/supabase/middleware.ts) · [lib/supabase/server.ts](lib/supabase/server.ts) · [lib/supabase/client.ts](lib/supabase/client.ts) · [lib/supabase/admin.ts](lib/supabase/admin.ts) · [lib/auth/session.ts](lib/auth/session.ts) · [lib/auth/resolveApiSession.ts](lib/auth/resolveApiSession.ts) · [lib/auth/role-scope.ts](lib/auth/role-scope.ts)

**Login / callback / session (retire or rewrite)**
[app/(public)/login/](app/(public)/login/) (5 files) · [app/auth/callback/page.tsx](app/auth/callback/page.tsx) · [app/auth/server-callback/route.ts](app/auth/server-callback/route.ts) · [app/auth/signout/route.ts](app/auth/signout/route.ts) · [app/auth/reset/](app/auth/reset/) · [app/auth/error/page.tsx](app/auth/error/page.tsx) · [app/api/auth/exhibitor-web-entry/route.ts](app/api/auth/exhibitor-web-entry/route.ts)

**User lifecycle / invites (largest cluster)**
[app/admin/users/actions.ts](app/admin/users/actions.ts) · [app/admin/company-licenses/users/actions.ts](app/admin/company-licenses/users/actions.ts) · [app/(app)/exhibitor/users/actions.ts](app/(app)/exhibitor/users/actions.ts) · [app/api/exhibitor/invite/route.ts](app/api/exhibitor/invite/route.ts) · [app/api/organizer/invite/route.ts](app/api/organizer/invite/route.ts) · [app/api/exhibitor/users/[userId]/route.ts](app/api/exhibitor/users/[userId]/route.ts) · [app/api/invites/claim/route.ts](app/api/invites/claim/route.ts) · [app/api/invites/redeem/route.ts](app/api/invites/redeem/route.ts) · [app/api/invites/complete-session/route.ts](app/api/invites/complete-session/route.ts) · [app/api/account/delete/route.ts](app/api/account/delete/route.ts) · [lib/server/invites/](lib/server/invites/) (14 files) · [lib/server/company-scoped-invite.ts](lib/server/company-scoped-invite.ts) · [lib/server/company-team-management.ts](lib/server/company-team-management.ts) · [lib/server/account-self-delete.ts](lib/server/account-self-delete.ts) · [lib/server/user-invite-access-assignment.ts](lib/server/user-invite-access-assignment.ts) · [lib/access/user-invite-access-config.ts](lib/access/user-invite-access-config.ts)

**Org/event/entitlement resolution**
[lib/server/company-event-access.ts](lib/server/company-event-access.ts) · [lib/server/company-event-access-core.ts](lib/server/company-event-access-core.ts) · [lib/access/event-access-mode.ts](lib/access/event-access-mode.ts) · [lib/server/event-user-access.ts](lib/server/event-user-access.ts) · [lib/server/exhibitor-permission-aggregates.ts](lib/server/exhibitor-permission-aggregates.ts) · [lib/server/exhibitor-app-access.ts](lib/server/exhibitor-app-access.ts) · [lib/server/exhibitor-app-active-event.ts](lib/server/exhibitor-app-active-event.ts) · [lib/server/exhibitor-web-entry-redirect.ts](lib/server/exhibitor-web-entry-redirect.ts) · [lib/server/mobile-accessible-events.ts](lib/server/mobile-accessible-events.ts) · [lib/server/company-scoped-license-select.ts](lib/server/company-scoped-license-select.ts) · [lib/licenses/](lib/licenses/) · [lib/server/events/create-event-mutation.ts](lib/server/events/create-event-mutation.ts) · [lib/exhibitor/exhibitor-web-home.ts](lib/exhibitor/exhibitor-web-home.ts)

**Platform-admin surfaces**
[lib/data/platform-admin.ts](lib/data/platform-admin.ts) · [lib/data/organizer-scope.ts](lib/data/organizer-scope.ts) · [app/api/v1/](app/api/v1/) · [app/admin/](app/admin/) (layouts + pages)

**Integrations (identity-keyed)**
[lib/integrations/google/](lib/integrations/google/) · [app/api/integrations/google/callback/route.ts](app/api/integrations/google/callback/route.ts) · [app/api/exhibitor/integrations/google/](app/api/exhibitor/integrations/google/) · [lib/integrations/mobile-oauth/](lib/integrations/mobile-oauth/) · [app/api/mobile/integrations/](app/api/mobile/integrations/)

**Alternate auth entry points**
[app/api/e2e/auth-bypass/route.ts](app/api/e2e/auth-bypass/route.ts) · [app/api/auth/apple-review-login/route.ts](app/api/auth/apple-review-login/route.ts) · [lib/auth/apple-review-login-policy.ts](lib/auth/apple-review-login-policy.ts) · [lib/e2e/](lib/e2e/) · [lib/server/emergency-login-code.ts](lib/server/emergency-login-code.ts) · [scripts/ensure-maestro-e2e-user.ts](scripts/ensure-maestro-e2e-user.ts)

**Types / schema**
[types/database.ts](types/database.ts) (regenerate) · [types/app.ts](types/app.ts) · [supabase/migrations/](supabase/migrations/) (new migrations)

---

## Tables Most Likely to Change

| Table | Change |
|---|---|
| `public.users` | Drop FK to `auth.users`; `id` becomes the global `user_id`; `company_id` superseded by a memberships projection; `email`/`full_name` become cached mirrors |
| `public.companies` | `id` becomes the global `organization_id`; `organizer_id` FK to `auth.users` removed; may be replaced by an `organizations` projection |
| `public.events` | `id` becomes the global `event_id` for `container_kind = 'event'`; `continuous_capture` handling decided separately; consider adding `timezone` |
| `public.event_users` | `user_id` re-keyed; membership existence may become a Platform Core projection while `permissions` stays LR-owned |
| `public.licenses` | Entitlement fields (`scope`, `can_create_events`, `max_events`) become Platform Core references; seat mechanics may stay |
| `public.license_plans` | Likely replaced by Platform Core module/plan definitions |
| `public.invite_codes` | Gains the fields currently living in `auth.user_metadata`, or is retired in favor of a Platform Core invitation flow |
| `public.exhibitors` | Ownership decision pending (Platform Core org-participates-in-event vs LR operational join) |
| **NEW** `organization_members` | Multi-org membership projection — does not exist today |
| `campaign_messages`, `campaign_recipients`, `email_events` | **Enable RLS + add policies** (independent of Platform Core) |
| `google_workspace_connections`, `google_workspace_connection_secrets`, `google_oauth_state_nonces`, `mobile_oauth_launch_tickets` | `user_id` re-keyed; recommend **delete and force reconnect** |
| `integrations`, `integration_sync_configs`, `registration_provider_configs`, `email_templates`, `documents` | `account_id` re-keyed to the global `organization_id`; consider renaming to `organization_id` |
| `zoominfo_company_connections` | `company_id` re-keyed; recommend delete and force reconnect |
| `leads` (+ all `lead_*`, `import_*`, `workflow_*`, `campaigns`, `signals`, `documents`, `generated_drafts`, `briefing_event_knowledge_items`) | **No structural change** — they inherit new `company_id` / `event_id` / user-id values through reseed. This is the bulk of the schema and it stays put |
| DB functions `current_role()`, `current_company_id()`, `current_license_id()`, `event_app_permission_enabled()` | Adapted to the new identity + active-org model, signatures preserved |

---

## Open Decisions

1. **Identity mechanism — third-party JWT trust vs session exchange.** Configuring this Supabase project to accept Platform Core JWTs keeps `auth.uid()` working and preserves the mobile RLS path, but requires Supabase third-party auth. Exchanging a Platform Core token for a local Supabase session avoids that but reintroduces duplicated identity. **This decision gates everything else and should be made first.**
2. **`container_kind = 'continuous_capture'` containers.** Does Platform Core model non-event capture containers, or does LR keep locally-generated ids for them alongside Platform Core event ids? Affects whether `events.id` can be uniformly global.
3. **`users.event_access_mode` ownership.** Platform access policy (Platform Core) or LR resolver input (product)? It currently interacts with LR seat enforcement.
4. **Seat accounting.** Does Platform Core own seats as part of entitlement, or does LR keep `licenses.seats_total` / `seats_used` and enforce at membership activation?
5. **`exhibitors` table ownership.** Platform Core "organization participates in event", or an LR-operational join?
6. **Role vocabulary.** LR's `platform_admin` / `organizer_admin` / `exhibitor_admin` / `exhibitor_viewer` — do these become Platform Core global roles, LR-local product roles, or a mix (global identity class + LR-local `event_users.permissions`)?
7. **Organizer relationship.** `companies.organizer_id` encodes "this org is hosted by that organizer." Is that a Platform Core org-to-org relationship or an LR concept?
8. **Active-organization transport.** JWT claim from Platform Core, or an LR cookie validated against Platform Core memberships? The latter matches the existing active-event pattern and keeps Platform Core off the hot path.
9. **Event timezone.** LR has no `events.timezone` and approximates with UTC days. If Platform Core carries a timezone, LR should adopt it — a small but user-visible correctness improvement.
10. **Summary read-model contract.** What exactly does Platform Core need from LR (metrics, cadence, push vs pull), and on what auth scheme? Reusing the existing signed internal-health pattern is the low-cost option.
11. **E2E and store-review login.** Apple review login and the Maestro/Playwright seed paths both need a Platform Core equivalent before the mobile release can ship.
12. **Schema source of truth.** Several deployed tables were never captured in `supabase/migrations/`. Reconciling this is a prerequisite for a trustworthy reseed — decide whether to backfill migrations or re-baseline the migration history.
