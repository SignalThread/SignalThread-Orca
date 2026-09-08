# Lead Retrieval — new canonical Supabase project (Step 3)

- **Date:** 2026-09-08
- **Project:** `signalthread-lead-retrieval`, ref **`wsbdyemyzixkyvuiyesm`**, SignalThread org `yldwjhbvgtqoimcqerlp`, region East US (Ohio) `us-east-2`, PostgreSQL 17.6. Same org and region as `signalthread-platform-core` (`wtbnpeluwhjjqccdofxd`), `signalthread-orca` (`qgxvtgnzptepimuawnku`) and `signalthread-pulse` (`konpdhvxooxsbjaisqih`).
- **Not** the previous production project `imkrdrscrikxqywdcmzy` ("LR_App"), which was not touched. `lr.signalthread.ai`, the shipped mobile app, OAuth callback registrations and every production environment still point at the previous project.
- **Credentials:** database password and API keys live only in `<repo>/.local-secrets/lead-retrieval-db.env` on the machine that created the project (gitignored). Nothing was committed.

## What was applied

Exactly one migration: `supabase/migrations/20260907120000_lead_retrieval_clean_baseline.sql`, pushed with `supabase db push --linked` and recorded in `supabase_migrations.schema_migrations` as version `20260907120000`. No legacy migration was replayed. No data was loaded; `pg_stat_user_tables` reports 0 live rows and `auth.users` is empty.

Resulting catalog (identical to the locally proven baseline on every public-schema fact: columns, relations, constraints, indexes, functions, policies, triggers, view):

| Object | Count |
|---|---|
| Tables | 57, RLS enabled on all 57 |
| Views | 1 (`google_email_activities`) |
| Columns | 748 (730 production-parity + 7 Admin-required + 3 Platform identity + `badge_templates`) |
| Constraints | 329 |
| Indexes | 199 |
| Functions | 18 (14 RPCs, 2 SECURITY DEFINER helpers, 4 trigger functions) |
| Triggers | 34 |
| Policies | 78 on 27 tables |
| Extensions | pgcrypto, pg_stat_statements, uuid-ossp, supabase_vault (Supabase defaults) |

Privileges verified on the project: `anon`/`authenticated` hold no privilege on the 16 integration/OAuth/secret tables that the history revoked; `service_role` retains full access; `persist_integration_oauth_refresh` is executable by `service_role` only. Supabase's default grants remain on every other table, as in production, with RLS as the gate. `scripts/schema/lr-schema-contracts.sql` passes against the project.

## Auth

LR keeps its own Supabase Auth authority (the Pulse pattern, not Orca's Platform-Core-auth model). `public.users.id → auth.users.id ON DELETE CASCADE` is in place. Configuration is code in `supabase/config.toml` and was pushed with `supabase config push`:

- Email provider only (production parity), signups enabled, email confirmations off (production has `mailer_autoconfirm = true`), OTP length 6 (both the web login and the mobile sign-in accept codes of at least 6 digits), OTP send rate limit 1 minute.
- `site_url = http://localhost:3003`; redirect allow-list `http://localhost:3003/**`, `http://127.0.0.1:3003/**`, `http://localhost:3013/**`, `http://127.0.0.1:3013/**`. Production URLs are deliberately absent until cutover.
- SMTP is the Supabase default sender (development only).

## Types

`types/database.ts` is now generated from this project (`supabase gen types typescript --linked --schema public`, 4,052 lines, 70 table/view blocks, all 16 RPC signatures). It is the canonical LR type file from here on. Adopting it required three one-line application fixes (`null` → `undefined` for optional RPC arguments in `lib/conversations/context-voice-note-complete.ts` and `lib/conversations/process-upload.ts`) and removing an untyped workaround in `scripts/demo-seed-sarah-chen-intelligence.ts` that the stale hand-maintained file had forced. Typecheck: 0 errors. Node suite: 3,471 tests, the same 13 inherited failures as before Step 1's move, no new failures.

## Local development against the new project

`apps/lead-retrieval/.env.local` (gitignored, per machine) needs:

```
NEXT_PUBLIC_SUPABASE_URL=https://wsbdyemyzixkyvuiyesm.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key of wsbdyemyzixkyvuiyesm>
SUPABASE_SERVICE_ROLE_KEY=<service role key of wsbdyemyzixkyvuiyesm>
NEXT_PUBLIC_SITE_URL=http://localhost:3003
NEXT_PUBLIC_AUTH_CALLBACK_URL=http://localhost:3003/auth/callback
INTEGRATION_SECRET_ENCRYPTION_KEYS={"v1":"<base64 32 bytes>"}
INTEGRATION_SECRET_ACTIVE_KEY_ID=v1
WORKFLOW_TICK_SECRET=<random>
CRON_SECRET=<random>
GOOGLE_WORKSPACE_OAUTH_STATE_SECRET=<random>
```

Start with `npm run dev:lead-retrieval` from the repository root (port 3003). Provider credentials (Google, Microsoft, Pipedrive, HubSpot, Salesforce, ZoomInfo, Apollo, SendGrid, OpenAI, R2) are optional for boot and must never be the production values.

## Proofs run against the project (all fixtures deleted afterwards; 0 rows remain)

**Web / Admin** — with a temporary `platform_admin` user signed in through a magic link verified by the app's own `@supabase/ssr` 0.5 client: `/login` redirects to `/admin`; `/admin`, `/admin/events`, `/admin/exhibitors`, `/admin/licenses`, `/admin/users`, `/admin/signals`, `/admin/integrations` render 200; role-gated `/exhibitor/dashboard` and `/organizer/dashboard` redirect to `/admin`; scoped APIs answer with their documented 400s on an empty account (`Missing account scope.`, `Missing exhibitor scope.`, `No company assigned`) rather than 500; `/api/signals` → `{"signals":[]}`; mobile-facing `/api/mobile/events` with a bearer token → 200 `{"events":[],…}`; `/api/internal/workflow-tick` without the secret → 401. Unauthenticated `/` and `/admin` → 307 `/login`.

**Mobile (PostgREST, as an `exhibitor_viewer` with `event_users.permissions = {"app": true}`)** — bootstrap `users`/`event_users`/`companies` selects 200; `events` with the production-parity selector 200 (the mobile selector's six non-existent columns return 400 exactly as in production); `leads` insert 201, select with `LEADS_SELECT_COLUMNS` 200, update 200; `lead_briefings`, `lead_voice_notes`, `lead_cumulative_insights` 200 (empty); `badge_templates` insert 201 and select 200; `documents` 200 empty (service-role table); `email_templates` 200 (default templates seeded by the company trigger); `rpc/delete_lead` → `{"ok": false, "error": "forbidden"}` for a viewer. The shipped mobile binary was **not** pointed at this project.

**Platform identity** — in a rolled-back transaction: two LR companies mapped to one `platform_organization_id` (allowed), a user carrying `platform_user_id` with its LR id unchanged, a dated event mapped to `platform_event_id`; a second event with the same `platform_event_id` → `events_platform_event_id_key` violation; a `continuous_capture` bucket with a Platform id → `events_platform_event_id_container_kind_check` violation; a second user with the same `platform_user_id` → `users_platform_user_id_key` violation; unmapped rows with null Platform ids accepted.

## Still not done (later steps)

- Data migration from `imkrdrscrikxqywdcmzy` (ids preserved; see reconciliation §12 for the AES-GCM AAD requirement).
- `pg_dump --schema-only` of production, once a database password is available, to diff policies/triggers/indexes and the excluded `consume_license_seat` / `uid` functions.
- Platform → LR launch/claim routes and mapping population; production auth URLs, SMTP, OAuth callback registrations; pointing `lr.signalthread.ai` or the mobile app at the new project.
