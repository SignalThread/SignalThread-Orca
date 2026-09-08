# Lead Retrieval — Canonical Schema Reconciliation (Step 2)

- **Date:** 2026-09-07
- **Repository:** `~/Documents/orca-clean-lr` (branch `platform/lead-retrieval-consolidation`), app `apps/lead-retrieval`
- **Canonical baseline:** [`supabase/migrations/20260907120000_lead_retrieval_clean_baseline.sql`](../supabase/migrations/20260907120000_lead_retrieval_clean_baseline.sql)
- **Legacy evidence:** [`test-fixtures/legacy-lr-migrations/`](../test-fixtures/legacy-lr-migrations/) (Admin 0001–0107 + `_archive`), [`test-fixtures/legacy-lr-mobile-migrations/`](../test-fixtures/legacy-lr-mobile-migrations/) (mobile 0002–0014, copied from `lead-intel-scan` @ `891dabf`)
- **Live evidence:** [`docs/schema-evidence/production-postgrest-catalog-2026-09-07.json`](./schema-evidence/production-postgrest-catalog-2026-09-07.json)
- **Contract check:** [`scripts/schema/lr-schema-contracts.sql`](../scripts/schema/lr-schema-contracts.sql)
- **Production project:** `imkrdrscrikxqywdcmzy` ("LR_App") — **read only, not modified**. No new Supabase project was created. No data was migrated.

---

## 1. Executive summary

One clean baseline file creates the complete Lead Retrieval `public` schema in an empty Supabase project: 57 tables, 1 view, 18 functions (16 exposed as RPCs), 34 triggers, 78 RLS policies with RLS enabled on every table, 199 indexes, 329 constraints, explicit privileges, and the additive SignalThread Platform identity mapping. It was proven by applying it alone to a fresh local PostgreSQL 15 database: it applies without error, its catalog is identical (1,471 catalog facts, 0 differences) to the reconciled replay it was derived from, and it satisfies the Admin, mobile, auth and Platform schema contracts.

Neither migration history can rebuild production. The Admin chain fails at file 10 of 107 (`exhibitors` never created); four tables and 24 columns exist only in the live database. The baseline reconstructs them from the live catalog.

### Important limitation — how production was observed

The Supabase CLI account on this machine does not include the LR_App organization, and no database password or Management API token for it exists locally (searched: all `.env*` files in both repos, `~/.pgpass`, shell history, CLI project list). Production was therefore observed through **PostgREST's OpenAPI catalog with the service-role key**, plus the GoTrue settings and Storage bucket endpoints. That interface is authoritative for relations, columns, types, nullability, defaults, primary and foreign keys and RPC signatures (57 relations, 730 columns, 16 RPCs). It **cannot show** policies, triggers, indexes, check constraints, function bodies, grants or RLS flags. For those the baseline follows the reconciled migration history and this document says so explicitly (§6, §9). **Step 3 should take a `pg_dump --schema-only` of production once a database password is available and diff its policies/triggers/indexes against the new project before cutover.**

---

## 2. Method

1. **Inventory.** Parsed all 107 Admin and 13 mobile migration files (object provenance index, appendix A); swept `.from()` / `.rpc()` usage in `apps/lead-retrieval` (56 tables, 8 RPCs, 1 legacy storage call) and in `lead-intel-scan` (10 tables, 1 RPC, explicit column lists); fetched the live PostgREST catalog.
2. **Replay.** Applied the Admin chain to a disposable local PostgreSQL 15 database behind a Supabase stand-in (roles `anon`/`authenticated`/`service_role`, schema `auth` with `auth.users` and `auth.uid()`, `pgcrypto` in `extensions`, Supabase default privileges). Each failure exposed production-only schema; the missing objects were reconstructed from the live catalog as evidence shims (§4.1, §4.2). Mobile migrations were interleaved where their content places them (§5).
3. **Compare.** Diffed the replayed catalog against the live catalog: all 730 production columns matched on name, type and nullability after the shims; the remaining 46 differences were adjudicated one by one (§4.3–4.6).
4. **Canonicalize.** Applied the corrections in §4.6 / §9 to the replay, then `pg_dump --schema-only` produced the body of the baseline; header, explicit privileges and the Platform identity section were added.
5. **Prove.** Applied the baseline alone to a second empty database; compared catalogs (identical); ran the contract check and a rolled-back multi-role RLS smoke test (§10, §11).

---

## 3. Live production schema summary (PostgREST catalog, 2026-09-07)

| Object class | Count | Notes |
|---|---|---|
| Relations exposed | 57 | 56 tables + `google_email_activities` (compatibility view over `email_activities`, per 0104) |
| Columns | 730 | all reproduced with identical names, types and nullability |
| RPC functions | 16 | 14 reproduced; `consume_license_seat` and `uid` excluded (§4.5) |
| Storage buckets | 0 | Admin's one `storage.from("conversations")` call is a dead legacy path; audio lives in R2 |
| Auth providers | email only; `mailer_autoconfirm = true`, signups enabled | GoTrue `/settings` |
| Realtime | not used by either app | code sweep |
| pg_cron / database jobs | none referenced by any migration | cross-schema sweep found only `auth.uid` and `auth.users` |
| Policies / triggers / indexes / grants | **not observable** through this interface | see §1 limitation |

Tables in production with **no CREATE TABLE in either history**: `license_plans`, `exhibitors`, `event_users`, `lead_conversations`.
Columns in production with **no DDL in the Admin history** (added by hand or lost): `campaigns.{selected_signals, subject_line, draft_subject, draft_body_text, draft_body_html, draft_updated_at}`, `events.{company_id, location, is_active}`, `leads.{event_id, is_hot, company_text, rating, email}`, `licenses.{event_id, exhibitor_company_id, license_plan_id, term_months, price_cents, currency, starts_at}`, `signals.tones`. Several of these are referenced by Admin migrations that predate any DDL for them (e.g. 0043 uses `leads.email`; 0011 uses `licenses.exhibitor_company_id`), which is direct evidence they were created outside the migration path.

---

## 4. Drift findings and canonical decisions

Classification vocabulary: **CANONICAL**, **LEGACY**, **PRODUCTION DRIFT**, **MOBILE-ONLY REQUIRED**, **ADMIN-ONLY REQUIRED**, **DEPRECATED**, **UNKNOWN — NEEDS EVIDENCE**.

### 4.1 Tables present only in production → CANONICAL (reconstructed)

| Table | Evidence | Decision |
|---|---|---|
| `license_plans` (5 cols) | live catalog; `licenses.license_plan_id → license_plans.id` (0059) | recreated from catalog; RLS enabled, no policies (service role only) |
| `exhibitors` (6 cols) | live catalog; 0010 adds unique `(event_id, company_id)`; Admin `.from("exhibitors")` ×24 | recreated; unique index from 0010 |
| `event_users` (7 cols) | live catalog; 0065 enables RLS + select policy; 0067/0068 unique `(user_id,event_id)`; Admin ×88, mobile bootstrap | recreated; `permissions jsonb not null` as in production |
| `lead_conversations` (33 cols) | live catalog; 0013/0089/0090 alter it; Admin ×40 | recreated; later migrations' columns and readiness table apply on top |

Check constraints and indexes native to these four tables are unknown from the catalog; only what later migrations add is present. Flagged **UNKNOWN — NEEDS EVIDENCE** for Step 3's production dump diff.

### 4.2 Columns present only in production → CANONICAL (PRODUCTION DRIFT accepted)

The 24 columns listed in §3, reconstructed with the live type, nullability, default and foreign key. `leads.is_hot` is the interesting one: mobile 0004 adds `quick_tags` + `is_hot`, but production has only `is_hot` — so 0004 was never applied and `is_hot` arrived another way.

### 4.3 Nullability / default / type differences → follow production

| Column | Migration intent | Production | Decision |
|---|---|---|---|
| `campaigns.company_id` | not null (0005) | nullable | nullable (data-migration safe) |
| `email_events.metadata` | not null default `{}` | nullable | nullable, default kept |
| `events.created_at` | not null | nullable, default now() | nullable |
| `registration_provider_configs.environment/created_at/updated_at` | not null | nullable | nullable |
| `signals.created_by` | not null | nullable | nullable |
| `signals.available_in_pattern_mode` default | true | false | false |
| `signals.visibility` | enum `signal_visibility` (0008) | `text` | `text` + `signals_visibility_check in ('global','role','template')`; enum type dropped; the four signals policies recreated with text literals |

### 4.4 Columns in migrations but absent from production

| Column(s) | Code use | Decision |
|---|---|---|
| `companies.zapier_payload_type`, `zapier_trigger_events`, `zapier_payload_fields` (0018/0019) | selected by `app/admin/integrations/zapier/page.tsx`, written by `app/api/admin/integrations/zapier/setup` | **ADMIN-ONLY REQUIRED — kept.** Their absence means the Zapier admin page cannot work against production today; the baseline restores the schema the code expects. |
| `events.registration_provider`, `registration_base_url`, `registration_api_token`, `registration_event_id` (0015) | `app/admin/events/[eventId]/page.tsx` | **ADMIN-ONLY REQUIRED — kept**, with a flag: `registration_api_token` is a plaintext token column on `events` (REQUIRES SEPARATE PRODUCT DECISION; the provider-config table 0017 is the intended home). |
| `registration_provider_configs.base_url` (0017) | none — code and production use `api_base_url` | **LEGACY — dropped** |
| `import_wizard_field_mapping_state` table (0031) | dropped by 0032 | LEGACY (never in baseline) |

### 4.5 Functions

| Function | Status |
|---|---|
| `consume_license_seat(p_license_id uuid)` | in production only; no migration, no Admin/mobile/script reference → **PRODUCTION DRIFT, excluded** (UNKNOWN origin; re-add in Step 3 if the production dump shows a dependency) |
| `uid()` | in production only; no reference anywhere → excluded, same reasoning |
| `current_license_id()` (0002) | not in production; no policy, function or code reference → **LEGACY, dropped** |
| `claim_exhibitor_admin_for_app_capture()` (mobile 0010) | dropped by Admin 0069; not in production → LEGACY |
| All 14 other production RPCs | CANONICAL; signatures match the live catalog exactly |
| Trigger/helper functions `set_updated_at`, `validate_event_timezone`, `seed_default_email_templates_on_company_insert`, `queue_lead_insight_regeneration_on_voice_note_delete` | CANONICAL (not RPCs; PostgREST does not list trigger functions) |

### 4.6 Objects added beyond production

| Object | Why |
|---|---|
| `badge_templates` (mobile 0011) | MOBILE-ONLY REQUIRED — read and written by shipped mobile code (`lib/capture/badgeTemplateLearner/badgeTemplateSupabase.ts`) but never applied to production |
| `users.platform_user_id`, `companies.platform_organization_id`, `events.platform_event_id` | Platform identity mapping (§7) |
| RLS enabled on `campaign_messages`, `campaign_recipients`, `email_events` | safe correction (§9) |

---

## 5. Mobile migration reconciliation (real `lead-intel-scan` repo, not the abandoned `mobile/` prototype)

| Mobile file | In baseline | Canonical object(s) | Admin also uses | In production |
|---|---|---|---|---|
| 0002_platform_admin_rls | YES (superseded form) | `users_role_check` (final form from Admin 0064); `companies_platform_admin_all`, `leads_platform_admin_all` policies; users policies re-expressed via helpers (§9) | yes (users/companies/leads) | policies unverifiable; role check text differs (0064) |
| 0003_role_expansion | YES (superseded form) | `companies_tenant_admin_exhibitor_all`, `leads_tenant_admin_exhibitor_all`, `users_tenant_admin_exhibitor_all` (helper form) | yes | unverifiable |
| 0004_leads_quick_tags_is_hot | NO (`quick_tags`); `is_hot` YES via drift shim | `leads.is_hot` | Admin uses `is_hot` | `is_hot` yes, `quick_tags` **no** |
| 0005_leads_image_urls | NO | — (`photo_url`, `avatar_url` not selected by mobile, absent from production) | no | no |
| 0006_rpc_delete_lead | superseded by 0007 | `delete_lead(uuid)` | Admin does not call it | yes (signature) |
| 0007_lead_briefings_rls_exhibitor_admin | YES | final `delete_lead` body (platform_admin, company_admin, exhibitor, exhibitor_admin); tenant policies incl. `exhibitor_admin`; `lead_briefings_platform_admin_select`, `lead_briefings_tenant_select` | yes | unverifiable |
| 0008_dedupe_event_users_lead_briefings | YES (via identical Admin 0068) | `event_users_user_id_event_id_uk`, `lead_briefings_lead_id_company_id_uk` | yes | unverifiable (indexes) |
| 0009_leads_exhibitor_viewer_app_rls | YES (via Admin 0069) | `event_app_permission_enabled(jsonb)`, `leads_exhibitor_viewer_app_{select,insert,update}`, `lead_briefings_exhibitor_viewer_app_select`, `companies_exhibitor_viewer_select`, `users_exhibitor_viewer_select_self` | yes | RPC yes; policies unverifiable |
| 0010_claim_exhibitor_admin_for_app_capture | NO | dropped by Admin 0069 | no | no |
| 0011_badge_templates | YES | `badge_templates` + 3 policies + index | no | **no** |
| 0012_leads_email | YES | `leads.email` (production drift; Admin 0043 already relied on it) | yes | yes |
| 0013_lead_voice_notes | YES (identical Admin 0072) | `lead_voice_notes`, `lead_cumulative_insights`, trigger, 4 policies | yes | yes (tables) |
| 0014_lead_voice_notes_lifecycle | YES (identical Admin 0073) | lifecycle columns, `adopt_voice_note_from_upload`, `complete_voice_note_transcription`, `sync_voice_notes_from_conversation`, `queue_lead_cumulative_insight_regeneration` | yes | yes (RPCs) |

Mobile's `EVENT_SELECTOR_COLUMNS` also names `title, event_name, starts_at, ends_at, venue, country`. Those columns do not exist in production, the resolver treats the resulting error as a soft fallback, and they were **not** invented in the baseline.

---

## 6. What the baseline creates

Path: `apps/lead-retrieval/supabase/migrations/20260907120000_lead_retrieval_clean_baseline.sql` (4,473 lines).

- `pgcrypto` in `extensions`; `check_function_bodies` deferred for dump ordering.
- 57 tables, 1 view (`google_email_activities`), 329 constraints (57 PK, FKs with referential actions, unique and check constraints), 199 indexes (including partial unique indexes such as `lead_voice_notes_lead_client_local_unique`).
- 18 functions: helpers `current_role()`, `current_company_id()` (SECURITY DEFINER), the 14 RPCs, and 4 trigger functions. 34 triggers (`set_updated_at` family, `events_validate_timezone`, `companies_seed_default_email_templates`, voice-note soft-delete regeneration).
- RLS enabled on all 57 tables; 78 policies on 27 tables; the other 30 tables are service-role-only by design (integration secrets, OAuth state, workflow internals, sync ledgers).
- Explicit privileges section: 16 `REVOKE ALL … FROM anon, authenticated` (integration/OAuth/secret tables and the compatibility view), 4 service-role grants, function EXECUTE grants/revocations exactly as the history declared them.
- Platform identity section (§7).
- No data of any kind (`pg_stat_user_tables` live tuples = 0 after apply). The only "seed" behaviour is the pre-existing `companies_seed_default_email_templates` trigger, which runs per company at insert time.

---

## 7. Platform identity additions

| Column | Type | Constraint / index | Rationale |
|---|---|---|---|
| `users.platform_user_id` | `uuid null` | `users_platform_user_id_key` unique partial index (`where platform_user_id is not null`) | one Platform Core user ↔ at most one LR user; nullable because LR users exist before mapping; never inferred from email |
| `companies.platform_organization_id` | `uuid null` | `companies_platform_organization_id_idx` **non-unique** partial index | a Platform organization can own several LR companies (organizer company + exhibitor companies), matching the Pulse `Account.platformOrganizationId` model |
| `events.platform_event_id` | `uuid null` | `events_platform_event_id_key` unique partial index; `events_platform_event_id_container_kind_check` (`platform_event_id is null or container_kind = 'event'`) | one Platform event ↔ at most one LR event; `continuous_capture` buckets can never become Platform events |

LR primary keys are untouched (`users.id`, `companies.id`, `events.id` remain the PKs; `users.id` still references `auth.users.id`). Mobile selects explicit column lists or `*`; additive nullable columns do not change any existing read or write.

---

## 8. Auth model preserved

```
auth.users (LR's own Supabase Auth authority — same as Pulse's own-authority pattern)
   └─ users.id  ──FK──> auth.users.id   (on delete cascade)
        users.role      text, users_role_check ∈ {platform_admin, event_organizer, exhibitor_admin, exhibitor_viewer}   (Admin 0064)
        users.company_id ──> companies.id
        users.license_id ──> licenses.id
        users.event_access_mode ∈ {all_company_events, assigned_events_only}   (0062)
        users.platform_user_id  (new, nullable)
companies.organizer_id (uuid, historically auth user id; no FK in production — kept as-is)
companies.platform_organization_id  (new, nullable)
events.company_id ──> companies.id ; events.container_kind ∈ {event, continuous_capture} ; events.platform_event_id (new)
event_users(event_id ──> events, user_id ──> users, exhibitor_company_id ──> companies, status, permissions jsonb)
exhibitors(event_id ──> events, company_id ──> companies) unique (event_id, company_id)
licenses(company_id, event_id, exhibitor_company_id ──> companies, license_plan_id ──> license_plans, scope, seats…)
```

Authorization stays LR-local: web routes resolve `public.users.role` + company/event scope server-side (mostly with the service role); mobile is authorized by RLS over `auth.uid()` → `users` → `event_users.permissions`. The Platform columns are lookups only; a Platform launch (Step 3+) resolves Platform ids → these columns → an LR-local session, and LR roles/licences/memberships decide what that session can do. The role check keeps Admin 0064's four values (Admin code writes only those; `organizer_admin`/`viewer` in code are normalized display roles, not stored values). Legacy literals `organizer`, `exhibitor`, `company_admin` remain accepted by policies for compatibility but are not insertable.

---

## 9. RLS / policy findings

**Preserved for compatibility**
- The full policy set that results from replaying Admin + mobile history, including legacy role literals (`organizer`, `exhibitor`, `company_admin`) inside policy predicates.
- Mobile-authored `*_all` policies for `companies` and `leads` (needed for `exhibitor_admin` capture on mobile; Admin 0001's original insert/update policies were removed by mobile 0002's policy reset).
- Tables with RLS enabled and **no** policies (service-role-only): `documents` and `email_templates` are among them, which is why mobile's direct `documents`/`email_templates` reads return empty and mobile relies on `/api/exhibitor/documents` first — unchanged.
- `delete_lead` semantics: viewers forbidden, tenant staff allowed within their company (verified in §11).

**Safe corrections made (evidence in this repo's replay)**
- `users_platform_admin_all` and `users_tenant_admin_exhibitor_all` queried `public.users` inside their own predicates. PostgreSQL raised `infinite recursion detected in policy for relation "users"` on the first read in the replay, so they could not have been live as written (the shipped mobile app reads `users` successfully). Re-expressed through the existing SECURITY DEFINER helpers `current_role()` / `current_company_id()` with identical grants.
- RLS enabled (no policies) on `campaign_messages`, `campaign_recipients`, `email_events`, which 0005 created without RLS. The only browser-client table access in Admin is `users`; mobile never touches them.
- `current_license_id()` removed (unused).

**Intentionally deferred (REQUIRES SEPARATE PRODUCT DECISION / NEEDS EVIDENCE)**
- Whether production actually holds the mobile-authored policy set or only the Admin set — unverifiable here; diff against a production dump in Step 3.
- `events.registration_api_token` plaintext column (§4.4).
- `zoominfo_company_connections.zoominfo_bearer_token` is stored as-is (not through the AES-GCM envelope).
- Heavy service-role usage in Admin (181 files) is architectural and out of scope for a schema step.
- The `permissions` JSON gate accepts many spellings (`app`, `all_events`, `app_access`, `can_use_app`, `scope`, `event_scope`) — preserved verbatim in `event_app_permission_enabled`.

---

## 10. Contracts

Run `psql <db> -f scripts/schema/lr-schema-contracts.sql` (raises on the first violation). Result on the baseline database: **LR SCHEMA CONTRACTS: PASS**.

- **Admin:** 56 tables and 8 RPCs referenced by `apps/lead-retrieval` — all present.
- **Mobile:** 11 tables / 87 columns from the shipped app's explicit selects and writes, `delete_lead` RPC — all present.
- **Auth:** `users.id → auth.users(id) on delete cascade`, `users_role_check`, and the 11 role/company/event foreign keys — all present.
- **Platform:** three nullable uuid columns, unique indexes on user/event ids, non-unique index on organization id, `continuous_capture` guard, unchanged LR primary keys — all present.

---

## 11. Validation (disposable local PostgreSQL 15)

| Step | Result |
|---|---|
| Reconciled replay (121 files: stub, Admin 0001–0107 with 5 evidence shims, mobile 0002/0003/0006/0007/0009/0010/0011/0012, canonical corrections) | applied without error |
| Replay catalog vs live production catalog | 730/730 columns match on name, type, nullability; remaining differences are exactly the §4.4–4.6 items |
| Baseline applied alone to an empty database | success |
| Baseline catalog vs canonicalized replay (columns, relations, constraints, indexes, functions, policies, triggers, views, grants, extensions, types) | **0 differing facts out of 1,471** |
| Contract check | PASS (all four contracts) |
| Rolled-back RLS smoke test as `authenticated` | `exhibitor_viewer` with app permission: reads own company/users/event/event_users/leads/badge_templates, inserts and updates leads, `delete_lead` → forbidden; `exhibitor_admin`: tenant reads/inserts, `delete_lead` → ok; admin of another company: 0 foreign leads, only self in `users`, `permission denied` on `google_workspace_connections` (revoke effective) |
| Data present after apply | 0 rows |

---

## 12. Integration data requirements for Step 3 (data migration — not done here)

Encrypted credential rows use AES-GCM with a context string as additional authenticated data that **embeds the connection row id**. Rows must be migrated with their primary keys unchanged or they become undecryptable:

| Table | Key | AAD context |
|---|---|---|
| `google_workspace_connection_secrets` (PK `connection_id` → `google_workspace_connections.id`) | `INTEGRATION_SECRET_ENCRYPTION_KEYS` (`encryption_key_version`) | `google_workspace:<connection_id>:access_token` / `:refresh_token` |
| `microsoft_365_connection_secrets` (PK `connection_id` → `microsoft_365_connections.id`) | same keyring | `microsoft_365:<connection_id>:<kind>` |
| `integration_connection_secrets` (PK `connection_id` → `integrations.id`; Pipedrive) | same keyring; `persist_integration_oauth_refresh` uses `lease_token` + `credential_version` | `integration:pipedrive:<connection_id>:<kind>` |
| `zoominfo_company_connections.zoominfo_bearer_token` | none (plaintext) | — |

Also id-stable by design: `google_oauth_state_nonces`/`microsoft_oauth_state_nonces` (PK `jti_digest`), `integration_oauth_states` (PK `state_digest`), `mobile_oauth_launch_tickets` (PK `ticket_digest`), `calendar_meeting_provider_claims` (PK `idempotency_key`), `email_activities.idempotency_key`, workflow run/step ledgers, Pipedrive sync ledger, R2 object keys in `lead_conversations.storage_path` / `lead_voice_notes.audio_url` / `documents.storage_path`.

---

## 13. Legacy handling

- Historical Admin migrations: `test-fixtures/legacy-lr-migrations/` (107 files + `_archive/`), moved with `git mv`; never executed again.
- Historical mobile migrations: `test-fixtures/legacy-lr-mobile-migrations/` (13 files, verbatim copies; the mobile repo is untouched).
- 32 test files and `scripts/check-conversation-lifecycle-schema.ts` that read specific historical files were repointed to the fixtures directory. `tests/schema-contract.test.ts` still reads `supabase/migrations/` and therefore now asserts against the baseline.
- Appendix A maps every historical file to the canonical outcome.

## 14. Step 3 checklist

Items 1, 3 and 4 were completed on 2026-09-08 — see [`LR_NEW_PROJECT_SETUP.md`](./LR_NEW_PROJECT_SETUP.md). Items 2, 5 and 6 remain.

1. Create `signalthread-lead-retrieval` in the SignalThread Supabase org; apply the baseline (`supabase db push` or `psql`).
2. Obtain production database credentials; `pg_dump --schema-only` production; diff policies/triggers/indexes/check constraints against the new project; decide on `consume_license_seat` / `uid` and the four reconstructed tables' native constraints.
3. Run `scripts/schema/lr-schema-contracts.sql` against the new project.
4. Regenerate `types/database.ts` from the new project (`supabase gen types`), which will include the Platform columns.
5. Migrate `auth.users`/`auth.identities` with ids preserved, then `public` data with ids preserved (§12), inside FK-enforced transactions.
6. Configure Auth (email/OTP, redirect URLs), then implement the Platform → LR handoff claim and mapping population.

---

## Appendix A — migration → canonical provenance
| # | Migration | Source | Objects (created / altered) | Canonical outcome |
|---|---|---|---|---|
| 1 | `0001_phase1.sql` | admin | create_table: companies, leads, licenses, users; function: current_company_id, current_role, set_updated_at; trigger: leads_set_updated_at; policy: companies:companies_delete_organizer, companies:companies_insert_organizer, companies:companies_select_scope, companies:companies_update_organizer, leads:leads_delete_organizer, leads:leads_insert_scope, leads:leads_select_scope, leads:leads_update_scope, licenses:licenses_mutate_organizer, licenses:licenses_select_scope, users:users_delete_organizer, users:users_insert_self_or_organizer, users:users_select_self_or_scope, users:users_update_self_or … | CANONICAL (replayed; final state in baseline) |
| 2 | `0002_exhibitor_pages.sql` | admin | create_table: campaigns; function: current_license_id; policy: campaigns:campaigns_delete_organizer, campaigns:campaigns_insert_organizer, campaigns:campaigns_select_scope, campaigns:campaigns_update_organizer, users:users_select_visibility_v2; index: idx_campaigns_company_id, idx_campaigns_created_at, idx_users_license_id; add_column: users.email, users.license_id; drop_policy: campaigns:campaigns_delete_organizer, campaigns:campaigns_insert_organizer, campaigns:campaigns_select_scope, campaigns:campaigns_update_organizer, users:users_select_self_or_scope, users:users_select_visibility_v2 | CANONICAL except current_license_id() (dropped: unreferenced, not in production) |
| 3 | `0003_lead_enrichments.sql` | admin | create_table: lead_enrichments; policy: lead_enrichments:lead_enrichments_insert_scope, lead_enrichments:lead_enrichments_select_scope; index: idx_lead_enrichments_created_at, idx_lead_enrichments_lead_id; add_column: leads.enriched_company_size, leads.enriched_industry, leads.enriched_job_title, leads.enriched_linkedin_url, leads.enriched_score, leads.enriched_seniority; drop_policy: lead_enrichments:lead_enrichments_insert_scope, lead_enrichments:lead_enrichments_select_scope | CANONICAL (replayed; final state in baseline) |
| 4 | `0004_leads_enriched_company_domain.sql` | admin | add_column: leads.enriched_company_domain | CANONICAL (replayed; final state in baseline) |
| 5 | `0005_campaign_messaging.sql` | admin | create_table: campaign_messages, campaign_recipients, campaigns, email_events; index: idx_campaign_messages_recipient_id, idx_campaign_recipients_campaign_id, idx_email_events_campaign_message_id; add_column: campaigns.created_by, campaigns.mode, campaigns.scheduled_at | CANONICAL + correction B (RLS enabled on campaign_messages, campaign_recipients, email_events) |
| 6 | `0006_campaign_recipients_unique.sql` | admin | index: idx_campaign_recipients_campaign_lead_unique | CANONICAL (replayed; final state in baseline) |
| 7 | `0007_campaign_messages_unique.sql` | admin | index: idx_campaign_messages_campaign_recipient_unique | CANONICAL (replayed; final state in baseline) |
| 8 | `0008_signal_library.sql` | admin | create_table: signals; type: signal_visibility; trigger: signals_set_updated_at; policy: signals:signals_delete_guard, signals:signals_insert_guard, signals:signals_select_scope, signals:signals_update_guard; index: idx_signals_category, idx_signals_created_by, idx_signals_is_active, idx_signals_updated_at, idx_signals_visibility; drop_policy: signals:signals_delete_guard, signals:signals_insert_guard, signals:signals_select_scope, signals:signals_update_guard | CANONICAL; signals.visibility converted enum→text to match production (correction D) |
| 9 | `0009_admin_events.sql` | admin | create_table: events; trigger: events_set_updated_at; policy: events:events_delete_platform_admin, events:events_insert_platform_admin, events:events_select_platform_admin, events:events_update_platform_admin; index: idx_events_start_date, idx_events_status; drop_policy: events:events_delete_platform_admin, events:events_insert_platform_admin, events:events_select_platform_admin, events:events_update_platform_admin | CANONICAL (replayed; final state in baseline) |
| 10 | `0010_exhibitors_event_company_unique.sql` | admin | index: exhibitors_event_company_unique_idx | CANONICAL (replayed; final state in baseline) |
| 11 | `0011_licenses_exhibitor_company_not_null.sql` | admin | (no DDL: data or comments only) | CANONICAL (replayed; final state in baseline) |
| 12 | `0012_invite_codes.sql` | admin | create_table: invite_codes; index: invite_codes_lookup_idx, invite_codes_unused_idx | CANONICAL (replayed; final state in baseline) |
| 13 | `0013_lead_conversations_transcription.sql` | admin | add_column: lead_conversations.transcribed_at, lead_conversations.transcript, lead_conversations.transcription_error, lead_conversations.transcription_status | CANONICAL (replayed; final state in baseline) |
| 14 | `0014_integrations.sql` | admin | create_table: integrations; trigger: integrations_set_updated_at; index: integrations_account_id_idx | CANONICAL (replayed; final state in baseline) |
| 15 | `0015_events_registration_integration.sql` | admin | add_column: events.registration_api_token, events.registration_base_url, events.registration_event_id, events.registration_provider | ADMIN-ONLY REQUIRED — events.registration_* columns absent from production but read/written by app/admin/events/[eventId]; kept |
| 16 | `0016_salesforce_sync_configs.sql` | admin | create_table: integration_sync_configs; trigger: integration_sync_configs_set_updated_at; index: integration_sync_configs_account_id_idx | CANONICAL (replayed; final state in baseline) |
| 17 | `0017_registration_provider_configs.sql` | admin | create_table: registration_provider_configs; trigger: registration_provider_configs_set_updated_at; index: registration_provider_configs_account_id_idx | CANONICAL except base_url (dropped: production and code use api_base_url) |
| 18 | `0018_companies_zapier_config.sql` | admin | add_column: companies.zapier_payload_type, companies.zapier_webhook_url | ADMIN-ONLY REQUIRED — companies.zapier_* columns (zapier_payload_type/trigger_events/payload_fields) absent from production but selected by app/admin/integrations/zapier; kept |
| 19 | `0019_companies_zapier_payload_fields.sql` | admin | add_column: companies.zapier_payload_fields, companies.zapier_trigger_events | ADMIN-ONLY REQUIRED — companies.zapier_* columns (zapier_payload_type/trigger_events/payload_fields) absent from production but selected by app/admin/integrations/zapier; kept |
| 20 | `0020_registration_provider_configs_environment.sql` | admin | add_column: registration_provider_configs.api_base_url, registration_provider_configs.environment | CANONICAL (replayed; final state in baseline) |
| 21 | `0021_documents_hub.sql` | admin | create_table: document_sends, documents; trigger: documents_set_updated_at; index: document_sends_document_id_idx, document_sends_lead_id_idx, document_sends_recipient_email_idx, documents_account_id_idx, documents_event_id_idx, documents_rep_sendable_idx | CANONICAL (replayed; final state in baseline) |
| 22 | `0022_campaign_messages_send_error.sql` | admin | add_column: campaign_messages.send_error | CANONICAL (replayed; final state in baseline) |
| 23 | `0023_email_templates_defaults_and_autoseed.sql` | admin | create_table: email_templates; function: seed_default_email_templates, seed_default_email_templates_on_company_insert; trigger: companies_seed_default_email_templates, email_templates_set_updated_at; policy: email_templates:email_templates_delete_exhibitor_admin, email_templates:email_templates_insert_exhibitor_admin, email_templates:email_templates_select_scope, email_templates:email_templates_update_exhibitor_admin; index: email_templates_account_id_idx, email_templates_account_name_idx, email_templates_one_default_per_account_idx, email_templates_updated_at_idx; drop_policy: email_templates … | CANONICAL (replayed; final state in baseline) |
| 24 | `0024_drop_licenses_unique_event_exhibitor.sql` | admin | index: licenses_unique_key; add_column: licenses.license_key | CANONICAL (replayed; final state in baseline) |
| 25 | `0025_users_email_license.sql` | admin | add_column: users.email, users.license_id | CANONICAL (replayed; final state in baseline) |
| 26 | `0026_fix_license_visibility_and_uniqueness.sql` | admin | policy: licenses:licenses_select_scope; index: licenses_unique_event_exhibitor; drop_policy: licenses:licenses_select_scope | CANONICAL (replayed; final state in baseline) |
| 27 | `0027_delete_lead_rpc.sql` | admin | function: delete_lead | CANONICAL (replayed; final state in baseline) |
| 28 | `0028_companies_default_enrichment_provider.sql` | admin | add_column: companies.default_enrichment_provider | CANONICAL (replayed; final state in baseline) |
| 29 | `0029_import_wizard_enrichment_runs.sql` | admin | create_table: import_wizard_enrichment_runs; policy: import_wizard_enrichment_runs:import_wizard_enrichment_runs_insert_exhibitor, import_wizard_enrichment_runs:import_wizard_enrichment_runs_select_exhibitor; index: idx_import_wizard_enrichment_runs_company_created; drop_policy: import_wizard_enrichment_runs:import_wizard_enrichment_runs_insert_exhibitor, import_wizard_enrichment_runs:import_wizard_enrichment_runs_select_exhibitor | CANONICAL (replayed; final state in baseline) |
| 30 | `0030_lead_briefings.sql` | admin | create_table: lead_briefings; trigger: lead_briefings_set_updated_at; policy: lead_briefings:lead_briefings_delete_organizer, lead_briefings:lead_briefings_insert_scope, lead_briefings:lead_briefings_select_scope, lead_briefings:lead_briefings_update_scope; index: idx_lead_briefings_company_updated; drop_policy: lead_briefings:lead_briefings_delete_organizer, lead_briefings:lead_briefings_insert_scope, lead_briefings:lead_briefings_select_scope, lead_briefings:lead_briefings_update_scope | CANONICAL (replayed; final state in baseline) |
| 31 | `0031_import_wizard_field_mapping_state.sql` | admin | create_table: import_wizard_field_mapping_state; trigger: import_wizard_field_mapping_state_set_updated_at; policy: import_wizard_field_mapping_state:import_wizard_field_mapping_state_delete_organizer, import_wizard_field_mapping_state:import_wizard_field_mapping_state_select_exhibitor, import_wizard_field_mapping_state:import_wizard_field_mapping_state_update_exhibitor, import_wizard_field_mapping_state:import_wizard_field_mapping_state_upsert_exhibitor; drop_policy: import_wizard_field_mapping_state:import_wizard_field_mapping_state_delete_organizer, import_wizard_field_mapping_state:import_ … | LEGACY — table dropped by 0032 |
| 32 | `0032_import_batches_and_batch_field_mapping.sql` | admin | create_table: import_batch_field_mapping_state, import_batches; trigger: import_batch_field_mapping_state_set_updated_at, import_batches_set_updated_at; policy: import_batch_field_mapping_state:import_batch_field_mapping_state_delete_organizer, import_batch_field_mapping_state:import_batch_field_mapping_state_select_exhibitor, import_batch_field_mapping_state:import_batch_field_mapping_state_update_exhibitor, import_batch_field_mapping_state:import_batch_field_mapping_state_upsert_exhibitor, import_batches:import_batches_delete_organizer, import_batches:import_batches_insert_exhibitor, import_ … | CANONICAL (replayed; final state in baseline) |
| 33 | `0033_import_batch_staged_rows.sql` | admin | add_column: import_batch_field_mapping_state.staged_rows | CANONICAL (replayed; final state in baseline) |
| 34 | `0034_import_batch_rows.sql` | admin | create_table: import_batch_rows; policy: import_batch_rows:import_batch_rows_delete_exhibitor, import_batch_rows:import_batch_rows_delete_organizer, import_batch_rows:import_batch_rows_insert_exhibitor, import_batch_rows:import_batch_rows_select_exhibitor; index: idx_import_batch_rows_batch_id; drop_column: import_batch_field_mapping_state.staged_rows; drop_policy: import_batch_rows:import_batch_rows_delete_exhibitor, import_batch_rows:import_batch_rows_delete_organizer, import_batch_rows:import_batch_rows_insert_exhibitor, import_batch_rows:import_batch_rows_select_exhibitor | CANONICAL (replayed; final state in baseline) |
| 35 | `0035_import_batch_row_briefings.sql` | admin | create_table: import_batch_row_briefings; trigger: import_batch_row_briefings_set_updated_at; policy: import_batch_row_briefings:import_batch_row_briefings_delete_exhibitor, import_batch_row_briefings:import_batch_row_briefings_delete_organizer, import_batch_row_briefings:import_batch_row_briefings_insert_exhibitor, import_batch_row_briefings:import_batch_row_briefings_select_exhibitor, import_batch_row_briefings:import_batch_row_briefings_update_exhibitor; index: idx_import_batch_row_briefings_batch_id; drop_policy: import_batch_row_briefings:import_batch_row_briefings_delete_exhibitor, impor … | CANONICAL (replayed; final state in baseline) |
| 36 | `0036_import_batches_exhibitor_admin_rls.sql` | admin | policy: import_batches:import_batches_insert_exhibitor, import_batches:import_batches_select_exhibitor, import_batches:import_batches_update_exhibitor; drop_policy: import_batches:import_batches_insert_exhibitor, import_batches:import_batches_select_exhibitor, import_batches:import_batches_update_exhibitor | CANONICAL (replayed; final state in baseline) |
| 37 | `0037_import_custom_field_definitions.sql` | admin | add_column: import_batch_field_mapping_state.custom_field_definitions | CANONICAL (replayed; final state in baseline) |
| 38 | `0038_import_field_mapping_exhibitor_admin_rls.sql` | admin | policy: import_batch_field_mapping_state:import_batch_field_mapping_state_select_exhibitor, import_batch_field_mapping_state:import_batch_field_mapping_state_update_exhibitor, import_batch_field_mapping_state:import_batch_field_mapping_state_upsert_exhibitor, import_batch_rows:import_batch_rows_delete_exhibitor, import_batch_rows:import_batch_rows_insert_exhibitor, import_batch_rows:import_batch_rows_select_exhibitor; drop_policy: import_batch_field_mapping_state:import_batch_field_mapping_state_select_exhibitor, import_batch_field_mapping_state:import_batch_field_mapping_state_update_exhibito … | CANONICAL (replayed; final state in baseline) |
| 39 | `0039_import_wizard_enrichment_runs_batch_id.sql` | admin | policy: import_wizard_enrichment_runs:import_wizard_enrichment_runs_insert_exhibitor, import_wizard_enrichment_runs:import_wizard_enrichment_runs_select_exhibitor; index: idx_import_wizard_enrichment_runs_batch_created; add_column: import_wizard_enrichment_runs.batch_id; drop_policy: import_wizard_enrichment_runs:import_wizard_enrichment_runs_insert_exhibitor, import_wizard_enrichment_runs:import_wizard_enrichment_runs_select_exhibitor | CANONICAL (replayed; final state in baseline) |
| 40 | `0040_import_batch_row_briefings_exhibitor_admin_rls.sql` | admin | policy: import_batch_row_briefings:import_batch_row_briefings_delete_exhibitor, import_batch_row_briefings:import_batch_row_briefings_insert_exhibitor, import_batch_row_briefings:import_batch_row_briefings_select_exhibitor, import_batch_row_briefings:import_batch_row_briefings_update_exhibitor; drop_policy: import_batch_row_briefings:import_batch_row_briefings_delete_exhibitor, import_batch_row_briefings:import_batch_row_briefings_insert_exhibitor, import_batch_row_briefings:import_batch_row_briefings_select_exhibitor, import_batch_row_briefings:import_batch_row_briefings_update_exhibitor | CANONICAL (replayed; final state in baseline) |
| 41 | `0041_import_batches_briefing_context.sql` | admin | add_column: import_batches.briefing_context | CANONICAL (replayed; final state in baseline) |
| 42 | `0042_briefing_event_knowledge.sql` | admin | create_table: briefing_event_knowledge_items; trigger: briefing_event_knowledge_set_updated_at; policy: briefing_event_knowledge_items:briefing_event_knowledge_delete_exhibitor, briefing_event_knowledge_items:briefing_event_knowledge_insert_exhibitor, briefing_event_knowledge_items:briefing_event_knowledge_select_exhibitor, briefing_event_knowledge_items:briefing_event_knowledge_update_exhibitor; index: briefing_event_knowledge_company_event_idx, briefing_event_knowledge_event_idx; drop_policy: briefing_event_knowledge_items:briefing_event_knowledge_delete_exhibitor, briefing_event_knowledge_i … | CANONICAL (replayed; final state in baseline) |
| 43 | `0043_match_leads_by_company_normalized_email.sql` | admin | function: match_leads_by_company_normalized_email | CANONICAL (replayed; final state in baseline) |
| 44 | `0044_events_briefing_strategy.sql` | admin | add_column: events.briefing_strategy | CANONICAL (replayed; final state in baseline) |
| 45 | `0045_events_exhibitor_rls_briefing_strategy.sql` | admin | policy: events:events_select_exhibitor_company, events:events_update_exhibitor_company; drop_policy: events:events_select_exhibitor_company, events:events_update_exhibitor_company | CANONICAL (replayed; final state in baseline) |
| 46 | `0046_events_briefing_strategy_foundations_comment.sql` | admin | (no DDL: data or comments only) | CANONICAL (replayed; final state in baseline) |
| 47 | `0047_events_briefing_strategy_guardrails_comment.sql` | admin | (no DDL: data or comments only) | CANONICAL (replayed; final state in baseline) |
| 48 | `0048_lead_briefings_exhibitor_admin_rls.sql` | admin | policy: lead_briefings:lead_briefings_insert_scope, lead_briefings:lead_briefings_select_scope, lead_briefings:lead_briefings_update_scope; drop_policy: lead_briefings:lead_briefings_insert_scope, lead_briefings:lead_briefings_select_scope, lead_briefings:lead_briefings_update_scope | CANONICAL (replayed; final state in baseline) |
| 49 | `0049_import_batch_row_briefings_lead_linkage.sql` | admin | index: idx_import_batch_row_briefings_lead_id; add_column: import_batch_row_briefings.lead_id | CANONICAL (replayed; final state in baseline) |
| 50 | `0050_leads_temperature_canonical.sql` | admin | add_column: leads.temperature | CANONICAL (replayed; final state in baseline) |
| 51 | `0051_import_batch_row_briefings_published_review_rls.sql` | admin | policy: import_batch_row_briefings:import_batch_row_briefings_insert_exhibitor, import_batch_row_briefings:import_batch_row_briefings_update_exhibitor; drop_policy: import_batch_row_briefings:import_batch_row_briefings_insert_exhibitor, import_batch_row_briefings:import_batch_row_briefings_update_exhibitor | CANONICAL (replayed; final state in baseline) |
| 52 | `0052_current_role_normalize_lead_briefings_rls.sql` | admin | function: current_role; policy: lead_briefings:lead_briefings_insert_scope, lead_briefings:lead_briefings_select_scope, lead_briefings:lead_briefings_update_scope; drop_policy: lead_briefings:lead_briefings_insert_scope, lead_briefings:lead_briefings_select_scope, lead_briefings:lead_briefings_update_scope | CANONICAL (replayed; final state in baseline) |
| 53 | `0053_import_batch_rows_wizard_enrichment.sql` | admin | add_column: import_batch_rows.wizard_enrichment_normalized | CANONICAL (replayed; final state in baseline) |
| 54 | `0054_zoominfo_company_connections.sql` | admin | create_table: zoominfo_company_connections; trigger: zoominfo_company_connections_set_updated_at; index: zoominfo_company_connections_company_id_idx | CANONICAL (replayed; final state in baseline) |
| 55 | `0055_zoominfo_byo_fix.sql` | admin | add_column: zoominfo_company_connections.zoominfo_client_secret | CANONICAL (replayed; final state in baseline) |
| 56 | `0056_zoominfo_bearer_token.sql` | admin | add_column: zoominfo_company_connections.zoominfo_bearer_token, zoominfo_company_connections.zoominfo_connection_label | CANONICAL (replayed; final state in baseline) |
| 57 | `0057_zoominfo_bearer_schema_cleanup.sql` | admin | drop_column: zoominfo_company_connections.access_token, zoominfo_company_connections.expires_at, zoominfo_company_connections.last_sync_at, zoominfo_company_connections.refresh_token, zoominfo_company_connections.scope, zoominfo_company_connections.token_type, zoominfo_company_connections.zoominfo_client_id, zoominfo_company_connections.zoominfo_client_secret | CANONICAL (replayed; final state in baseline) |
| 58 | `0058_leads_canonical_profile_fields.sql` | admin | add_column: leads.company_domain, leads.company_size, leads.industry, leads.intent_signals, leads.linkedin_url, leads.metadata, leads.seniority | CANONICAL (replayed; final state in baseline) |
| 59 | `0059_licenses_entitlement_metadata.sql` | admin | index: licenses_scope_company_exhibitor_company_id_uidx; add_column: licenses.billing, licenses.billing_source, licenses.scope | CANONICAL (replayed; final state in baseline) |
| 60 | `0060_licenses_event_creation_entitlement.sql` | admin | index: licenses_company_event_creation_lookup_idx; add_column: licenses.can_create_events, licenses.max_events | CANONICAL (replayed; final state in baseline) |
| 61 | `0061_licenses_exhibitor_event_creation_index.sql` | admin | index: licenses_exhibitor_company_event_creation_lookup_idx | CANONICAL (replayed; final state in baseline) |
| 62 | `0062_users_event_access_mode.sql` | admin | add_column: users.event_access_mode | CANONICAL (replayed; final state in baseline) |
| 63 | `0063_invite_codes_event_access_mode.sql` | admin | add_column: invite_codes.event_access_mode | CANONICAL (replayed; final state in baseline) |
| 64 | `0064_users_role_exhibitor_viewer_and_read_rls.sql` | admin | policy: events:events_select_exhibitor_company, lead_briefings:lead_briefings_select_scope; drop_policy: events:events_select_exhibitor_company, lead_briefings:lead_briefings_select_scope | CANONICAL (replayed; final state in baseline) |
| 65 | `0065_exhibitor_viewer_mobile_bootstrap_rls.sql` | admin | policy: companies:companies_select_scope, event_users:event_users_select_exhibitor_scope, lead_enrichments:lead_enrichments_select_scope, leads:leads_select_scope, licenses:licenses_select_scope, users:users_select_visibility_v2; drop_policy: companies:companies_select_scope, event_users:event_users_select_exhibitor_scope, lead_enrichments:lead_enrichments_select_scope, leads:leads_select_scope, licenses:licenses_select_scope, users:users_select_visibility_v2 | CANONICAL (replayed; final state in baseline) |
| 66 | `0066_fix_users_select_visibility_recursion.sql` | admin | policy: users:users_select_visibility_v2; drop_policy: users:users_select_visibility_v2 | CANONICAL (replayed; final state in baseline) |
| 67 | `0067_dedupe_licenses_event_users_unique.sql` | admin | index: event_users_user_id_event_id_uidx, licenses_scope_company_exhibitor_company_id_uidx | CANONICAL (replayed; final state in baseline) |
| 68 | `0068_dedupe_event_users_lead_briefings.sql` | admin | index: event_users_user_id_event_id_uk, lead_briefings_lead_id_company_id_uk | CANONICAL (replayed; final state in baseline) |
| 69 | `0069_consolidate_mobile_app_viewer_capture_rls.sql` | admin | function: event_app_permission_enabled; policy: companies:companies_exhibitor_viewer_select, lead_briefings:lead_briefings_exhibitor_viewer_app_select, leads:leads_exhibitor_viewer_app_insert, leads:leads_exhibitor_viewer_app_select, leads:leads_exhibitor_viewer_app_update, users:users_exhibitor_viewer_select_self; drop_function: claim_exhibitor_admin_for_app_capture; drop_policy: companies:companies_exhibitor_viewer_select, lead_briefings:lead_briefings_exhibitor_viewer_app_select, leads:leads_exhibitor_viewer_app_insert, leads:leads_exhibitor_viewer_app_select, leads:leads_exhibitor_viewer_a … | CANONICAL (replayed; final state in baseline) |
| 70 | `0070_events_container_kind.sql` | admin | add_column: events.container_kind | CANONICAL (replayed; final state in baseline) |
| 71 | `0071_workflow_automation_foundation.sql` | admin | create_table: generated_drafts, workflow_runs, workflow_step_runs, workflow_steps, workflow_templates; trigger: generated_drafts_set_updated_at, workflow_runs_set_updated_at, workflow_step_runs_set_updated_at, workflow_steps_set_updated_at, workflow_templates_set_updated_at; policy: generated_drafts:generated_drafts_select_scope, workflow_runs:workflow_runs_select_scope, workflow_step_runs:workflow_step_runs_select_scope, workflow_steps:workflow_steps_select_scope, workflow_templates:workflow_templates_select_scope; index: idx_generated_drafts_company_lead_kind_status, idx_generated_drafts_run … | CANONICAL (replayed; final state in baseline) |
| 72 | `0072_lead_voice_notes.sql` | admin | create_table: lead_cumulative_insights, lead_voice_notes; function: queue_lead_insight_regeneration_on_voice_note_delete; trigger: lead_voice_notes_soft_delete_regen_insights; policy: lead_cumulative_insights:lead_cumulative_insights_event_app_members_select, lead_cumulative_insights:lead_cumulative_insights_tenant_staff_select, lead_voice_notes:lead_voice_notes_event_app_members_all, lead_voice_notes:lead_voice_notes_tenant_staff_all; index: lead_cumulative_insights_company_idx, lead_voice_notes_lead_active_idx, lead_voice_notes_lead_timeline_idx; drop_policy: lead_cumulative_insights:lead_cu … | CANONICAL (replayed; final state in baseline) |
| 73 | `0073_lead_voice_notes_lifecycle.sql` | admin | function: adopt_voice_note_from_upload, complete_voice_note_transcription, queue_lead_cumulative_insight_regeneration, queue_lead_insight_regeneration_on_voice_note_delete, sync_voice_notes_from_conversation; index: lead_voice_notes_created_by_idx, lead_voice_notes_lead_client_local_unique; add_column: lead_voice_notes.client_local_note_id, lead_voice_notes.created_by_user_id, lead_voice_notes.summary_generated_at, lead_voice_notes.transcription_completed_at | CANONICAL (replayed; final state in baseline) |
| 74 | `0074_event_scoped_signal_copies.sql` | admin | policy: signals:signals_delete_guard, signals:signals_select_scope, signals:signals_update_guard; index: idx_signals_event_id, idx_signals_source_signal_id, uniq_signals_event_name, uniq_signals_event_source_signal; add_column: signals.event_id, signals.source_signal_id; drop_policy: signals:signals_delete_guard, signals:signals_select_scope, signals:signals_update_guard | CANONICAL (replayed; final state in baseline) |
| 75 | `0075_signal_ownership_scope.sql` | admin | policy: signals:signals_delete_guard, signals:signals_insert_guard, signals:signals_select_scope, signals:signals_update_guard; index: idx_signals_company_id, idx_signals_company_name, idx_signals_default_name, idx_signals_owner_user_id, idx_signals_private_name, idx_signals_scope_company_updated, idx_signals_scope_event_updated, idx_signals_signal_scope; add_column: signals.company_id, signals.owner_user_id, signals.signal_scope; drop_policy: signals:signals_delete_guard, signals:signals_insert_guard, signals:signals_select_scope, signals:signals_update_guard | CANONICAL (replayed; final state in baseline) |
| 76 | `0077_import_batches_selected_lead_source.sql` | admin | index: import_batches_one_import_file_draft_per_company; add_column: import_batches.source_kind, import_batches.source_selected_lead_ids | CANONICAL (replayed; final state in baseline) |
| 77 | `0078_workflow_lead_trigger_rules.sql` | admin | index: workflow_runs_active_unique; add_column: workflow_runs.trigger_fingerprint, workflow_templates.trigger_conditions_jsonb | CANONICAL (replayed; final state in baseline) |
| 78 | `0079_workflow_trigger_conditions_schema_cache.sql` | admin | add_column: workflow_templates.trigger_conditions_jsonb | CANONICAL (replayed; final state in baseline) |
| 79 | `0080_leads_nullable_temperature.sql` | admin | (no DDL: data or comments only) | CANONICAL (replayed; final state in baseline) |
| 80 | `0081_workflow_templates_archive.sql` | admin | index: idx_workflow_templates_company_active; add_column: workflow_templates.archived_at, workflow_templates.archived_by | CANONICAL (replayed; final state in baseline) |
| 81 | `0082_documents_asset_kind.sql` | admin | index: documents_asset_kind_idx; add_column: documents.asset_kind | CANONICAL (replayed; final state in baseline) |
| 82 | `0083_rename_default_campaign_agents.sql` | admin | (no DDL: data or comments only) | CANONICAL (replayed; final state in baseline) |
| 83 | `0084_fix_signal_ownership_scope.sql` | admin | (no DDL: data or comments only) | CANONICAL (replayed; final state in baseline) |
| 84 | `0085_emergency_login_code_audit_events.sql` | admin | create_table: emergency_login_code_audit_events; index: emergency_login_code_audit_events_company_created_idx, emergency_login_code_audit_events_target_created_idx | CANONICAL (replayed; final state in baseline) |
| 85 | `0086_emergency_login_code_audit_method.sql` | admin | add_column: emergency_login_code_audit_events.method | CANONICAL (replayed; final state in baseline) |
| 86 | `0087_integrations_connection_health.sql` | admin | add_column: integrations.last_refresh_attempt_at, integrations.last_sync_error | CANONICAL (replayed; final state in baseline) |
| 87 | `0088_workflow_trigger_decisions.sql` | admin | create_table: workflow_trigger_decisions; policy: workflow_trigger_decisions:workflow_trigger_decisions_select_scope; index: idx_workflow_trigger_decisions_company_created, idx_workflow_trigger_decisions_lead_created, idx_workflow_trigger_decisions_template_created; drop_policy: workflow_trigger_decisions:workflow_trigger_decisions_select_scope | CANONICAL (replayed; final state in baseline) |
| 88 | `0089_workflow_conversation_readiness.sql` | admin | create_table: lead_conversation_readiness; trigger: lead_conversation_readiness_set_updated_at; policy: lead_conversation_readiness:lead_conversation_readiness_select_scope; index: idx_workflow_step_runs_waiting; add_column: lead_conversations.conversation_version, workflow_step_runs.current_insights_version, workflow_step_runs.current_transcript_version, workflow_step_runs.required_conversation_version, workflow_step_runs.wait_expires_at, workflow_step_runs.wait_started_at, workflow_step_runs.waiting_reason; drop_policy: lead_conversation_readiness:lead_conversation_readiness_select_scope | CANONICAL (replayed; final state in baseline) |
| 89 | `0090_conversation_processing_recovery.sql` | admin | create_table: lead_conversation_readiness; trigger: lead_conversation_readiness_set_updated_at; policy: lead_conversation_readiness:lead_conversation_readiness_select_scope; index: idx_workflow_step_runs_waiting; add_column: lead_conversations.adoption_risks, lead_conversations.business_process_concerns, lead_conversations.buying_intent, lead_conversations.buying_signals, lead_conversations.competitors_mentioned, lead_conversations.conversation_version, lead_conversations.desired_outcomes, lead_conversations.feature_requests, lead_conversations.management_visibility_needs, lead_conversations.n … | CANONICAL (replayed; final state in baseline) |
| 90 | `0091_google_workspace_connections.sql` | admin | create_table: google_oauth_state_nonces, google_workspace_connection_secrets, google_workspace_connections; trigger: google_workspace_connection_secrets_set_updated_at, google_workspace_connections_set_updated_at; index: google_oauth_state_nonces_expiry_idx, google_workspace_connections_company_id_idx, google_workspace_connections_refresh_lease_idx | CANONICAL (replayed; final state in baseline) |
| 91 | `0092_google_email_activities.sql` | admin | create_table: google_email_activities; trigger: google_email_activities_set_updated_at; index: google_email_activities_connection_idx, google_email_activities_lead_recent_idx | CANONICAL (replayed; final state in baseline) |
| 92 | `0093_google_calendar_meeting_activities.sql` | admin | create_table: google_calendar_meeting_activities; trigger: google_calendar_meeting_activities_set_updated_at; index: google_calendar_meeting_connection_idx, google_calendar_meeting_lead_recent_idx, google_email_activities_document_idx; add_column: document_sends.expires_at, google_email_activities.document_id | CANONICAL (replayed; final state in baseline) |
| 93 | `0094_lead_follow_up_details.sql` | admin | index: leads_follow_up_at_idx; add_column: leads.follow_up_at, leads.follow_up_calendar_event_id, leads.follow_up_completed_at, leads.follow_up_note | CANONICAL (replayed; final state in baseline) |
| 94 | `0095_mobile_oauth_launch_tickets.sql` | admin | create_table: mobile_oauth_launch_tickets; index: mobile_oauth_launch_tickets_expiry_idx | CANONICAL (replayed; final state in baseline) |
| 95 | `0096_lead_follow_up_idempotency.sql` | admin | index: leads_follow_up_calendar_owner_idx; add_column: leads.follow_up_calendar_owner_user_id, leads.follow_up_calendar_provider, leads.follow_up_last_operation_fingerprint, leads.follow_up_last_operation_key, leads.follow_up_last_operation_result | CANONICAL (replayed; final state in baseline) |
| 96 | `0097_patch_event_briefing_strategy.sql` | admin | function: patch_event_briefing_strategy | CANONICAL (replayed; final state in baseline) |
| 97 | `0098_dashboard_truth_event_timezone.sql` | admin | function: dashboard_event_lead_metrics, is_valid_iana_timezone, validate_event_timezone; trigger: events_validate_timezone; add_column: events.timezone | CANONICAL (replayed; final state in baseline) |
| 98 | `0099_emergency_login_code_audit_method_repair.sql` | admin | add_column: emergency_login_code_audit_events.method | CANONICAL (replayed; final state in baseline) |
| 99 | `0100_pipedrive_oauth_connection.sql` | admin | create_table: integration_connection_secrets, integration_oauth_states; function: persist_integration_oauth_refresh; trigger: integration_connection_secrets_set_updated_at; index: integration_oauth_states_expiry_idx, integrations_refresh_lease_idx; add_column: integrations.connected_at, integrations.connected_by_user_id, integrations.last_error_at, integrations.last_error_code, integrations.last_verified_at, integrations.provider_account_name, integrations.provider_api_domain, integrations.provider_user_id, integrations.refresh_lease_token, integrations.refresh_lease_until, integrations.status … | CANONICAL (replayed; final state in baseline) |
| 100 | `0101_pipedrive_integration_settings.sql` | admin | create_table: pipedrive_integration_settings; trigger: pipedrive_integration_settings_set_updated_at | CANONICAL (replayed; final state in baseline) |
| 101 | `0102_pipedrive_lead_sync.sql` | admin | create_table: pipedrive_lead_syncs; trigger: pipedrive_lead_syncs_set_updated_at; index: idx_pipedrive_lead_syncs_company_status, idx_pipedrive_lead_syncs_queue; add_column: pipedrive_integration_settings.send_conversation_synopsis, pipedrive_integration_settings.send_generated_email_draft | CANONICAL (replayed; final state in baseline) |
| 102 | `0103_microsoft_365_connections.sql` | admin | create_table: microsoft_365_connection_secrets, microsoft_365_connections, microsoft_oauth_state_nonces; trigger: microsoft_365_connection_secrets_set_updated_at, microsoft_365_connections_set_updated_at; index: microsoft_365_connections_company_id_idx, microsoft_365_connections_refresh_lease_idx, microsoft_oauth_state_nonces_expiry_idx | CANONICAL (replayed; final state in baseline) |
| 103 | `0104_provider_neutral_email_send.sql` | admin | create_table: integration_provider_preferences; view: google_email_activities; trigger: integration_provider_preferences_set_updated_at; index: email_activities_microsoft_connection_idx, integration_provider_preferences_company_idx; add_column: email_activities.microsoft_connection_id, email_activities.provider, email_activities.provider_http_status, email_activities.retry_after_seconds; rename: email_activities.connection_id->google_connection_id, email_activities.gmail_message_id->provider_message_id, email_activities.gmail_thread_id->provider_thread_id | CANONICAL (replayed; final state in baseline) |
| 104 | `0105_microsoft_calendar_meetings.sql` | admin | create_table: calendar_meeting_provider_claims, microsoft_calendar_meeting_activities; trigger: microsoft_calendar_meeting_activities_set_updated_at; index: calendar_meeting_provider_claim_scope_idx, microsoft_calendar_meeting_connection_idx, microsoft_calendar_meeting_lead_recent_idx | CANONICAL (replayed; final state in baseline) |
| 105 | `0106_shared_email_calendar_provider_default.sql` | admin | (no DDL: data or comments only) | CANONICAL (replayed; final state in baseline) |
| 106 | `0107_leads_phone.sql` | admin | add_column: leads.phone | CANONICAL (replayed; final state in baseline) |
| 107 | `0002_platform_admin_rls.sql` | mobile | policy: companies:companies_company_admin_all, companies:companies_exhibitor_all, companies:companies_platform_admin_all, leads:leads_company_admin_all, leads:leads_exhibitor_all, leads:leads_platform_admin_all, users:users_company_admin_all, users:users_exhibitor_all, users:users_platform_admin_all | SUPERSEDED — role check replaced by Admin 0064; users policies rewritten recursion-free (canonical corrections A); companies/leads *_all policies kept |
| 108 | `0003_role_expansion.sql` | mobile | policy: companies:companies_platform_admin_all, companies:companies_tenant_admin_exhibitor_all, leads:leads_platform_admin_all, leads:leads_tenant_admin_exhibitor_all, users:users_platform_admin_all, users:users_tenant_admin_exhibitor_all | SUPERSEDED — same as 0002 (final policy names come from this file + 0007) |
| 109 | `0004_leads_quick_tags_is_hot.sql` | mobile | add_column: leads.is_hot, leads.quick_tags | NOT IN PRODUCTION — quick_tags absent from live catalog; is_hot exists (production drift shim); not selected by mobile → LEGACY |
| 110 | `0005_leads_image_urls.sql` | mobile | add_column: leads.avatar_url, leads.photo_url | NOT IN PRODUCTION — photo_url/avatar_url absent; not selected by mobile → LEGACY |
| 111 | `0006_rpc_delete_lead.sql` | mobile | function: delete_lead | SUPERSEDED by mobile 0007 (same function, wider role set) |
| 112 | `0007_lead_briefings_rls_exhibitor_admin.sql` | mobile | create_table: first; function: delete_lead; policy: companies:companies_tenant_admin_exhibitor_all, lead_briefings:lead_briefings_platform_admin_select, lead_briefings:lead_briefings_tenant_select, leads:leads_tenant_admin_exhibitor_all, users:users_tenant_admin_exhibitor_all; drop_policy: companies:companies_tenant_admin_exhibitor_all, leads:leads_tenant_admin_exhibitor_all, users:users_tenant_admin_exhibitor_all | CANONICAL — delete_lead body (final), tenant policies incl. exhibitor_admin, lead_briefings select policies |
| 113 | `0008_dedupe_event_users_lead_briefings.sql` | mobile | index: event_users_user_id_event_id_uk, lead_briefings_lead_id_company_id_uk | DUPLICATE of Admin 0068 (byte-identical) — unique indexes canonical |
| 114 | `0009_leads_exhibitor_viewer_app_rls.sql` | mobile | function: event_app_permission_enabled; policy: companies:companies_exhibitor_viewer_select, lead_briefings:lead_briefings_exhibitor_viewer_app_select, leads:leads_exhibitor_viewer_app_insert, leads:leads_exhibitor_viewer_app_select, leads:leads_exhibitor_viewer_app_update, users:users_exhibitor_viewer_select_self; drop_policy: companies:companies_exhibitor_viewer_select, lead_briefings:lead_briefings_exhibitor_viewer_app_select, leads:leads_exhibitor_viewer_app_insert, leads:leads_exhibitor_viewer_app_select, leads:leads_exhibitor_viewer_app_update, users:users_exhibitor_viewer_select_self | FOLDED INTO Admin 0069 (Admin copy is canonical) |
| 115 | `0010_claim_exhibitor_admin_for_app_capture.sql` | mobile | function: claim_exhibitor_admin_for_app_capture | DROPPED by Admin 0069 (function not in production, no code reference) → LEGACY |
| 116 | `0011_badge_templates.sql` | mobile | create_table: badge_templates; policy: badge_templates:badge_templates_event_app_members_all, badge_templates:badge_templates_platform_admin_all, badge_templates:badge_templates_tenant_staff_all; index: badge_templates_company_event_lookup_idx; drop_policy: badge_templates:badge_templates_event_app_members_all, badge_templates:badge_templates_platform_admin_all, badge_templates:badge_templates_tenant_staff_all | MOBILE-ONLY REQUIRED — table absent from production but read/written by shipped mobile code → in baseline |
| 117 | `0012_leads_email.sql` | mobile | add_column: leads.email | PRODUCTION DRIFT confirmed — column existed before this file (Admin 0043 uses it); canonical |
| 118 | `0013_lead_voice_notes.sql` | mobile | create_table: lead_cumulative_insights, lead_voice_notes; function: queue_lead_insight_regeneration_on_voice_note_delete; trigger: lead_voice_notes_soft_delete_regen_insights; policy: lead_cumulative_insights:lead_cumulative_insights_event_app_members_select, lead_cumulative_insights:lead_cumulative_insights_tenant_staff_select, lead_voice_notes:lead_voice_notes_event_app_members_all, lead_voice_notes:lead_voice_notes_tenant_staff_all; index: lead_cumulative_insights_company_idx, lead_voice_notes_lead_active_idx, lead_voice_notes_lead_timeline_idx; drop_policy: lead_cumulative_insights:lead_cu … | DUPLICATE of Admin 0072 (byte-identical) — canonical via Admin copy |
| 119 | `0014_lead_voice_notes_lifecycle.sql` | mobile | function: adopt_voice_note_from_upload, complete_voice_note_transcription, queue_lead_cumulative_insight_regeneration, queue_lead_insight_regeneration_on_voice_note_delete, sync_voice_notes_from_conversation; index: lead_voice_notes_created_by_idx, lead_voice_notes_lead_client_local_unique; add_column: lead_voice_notes.client_local_note_id, lead_voice_notes.created_by_user_id, lead_voice_notes.summary_generated_at, lead_voice_notes.transcription_completed_at | DUPLICATE of Admin 0073 (byte-identical) — canonical via Admin copy |
