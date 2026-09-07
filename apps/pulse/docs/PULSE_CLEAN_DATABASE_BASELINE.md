# Pulse Clean Database Baseline

- **Date:** 2026-09-06
- **Repository:** `SignalThread/SignalThread-Orca` (`~/Documents/orca-clean`), branch `platform-sso-hardening` @ `1a4e9c0` (uncommitted working tree)
- **New canonical Pulse database:** Supabase project **`signalthread-pulse`**, ref **`konpdhvxooxsbjaisqih`**, org SignalThread (`yldwjhbvgtqoimcqerlp`), region East US (Ohio) `us-east-2` — the same org and region as `signalthread-platform-core` (`wtbnpeluwhjjqccdofxd`) and `signalthread-orca` (`qgxvtgnzptepimuawnku`). PostgreSQL 17.6.
- **Migration source (left intact):** the previous Pulse production project `Voice_App_SMB`, ref `tsoquobpingfqezolvgp`, accessed **read-only** (`SET default_transaction_read_only = on` on every session, `pg_dump` for extraction). No DDL, DML, migration, seed or `_prisma_migrations` change was made to it. `voice.signalthread.ai` still points at it until a later production cutover.

---

## 1. Executive summary

### CLEAN BASELINE VERIFIED

One clean baseline migration, `prisma/migrations/20260906180000_pulse_clean_baseline/migration.sql`, reproduces the complete intended Pulse operational schema in a brand-new empty PostgreSQL database. It was proven on a disposable local PostgreSQL 15 cluster first and then applied to the new project with `prisma migrate deploy`.

| Check | Result |
|---|---|
| New project vs previous production catalog (2,266 catalog facts across 13 fact classes) | **6 differences, all deliberate and documented below, 0 regressions** |
| New project vs canonical `prisma/schema.prisma` (`prisma migrate diff --from-url … --to-schema-datamodel`) | **empty** |
| `prisma migrate status` on the new project | **1 migration found, database schema is up to date** |
| Row counts, all 43 model tables, old vs new | **identical** (30,859 rows); only `_prisma_migrations` differs by design (57 → 1) |
| Pilot Platform mappings (Ali / Acme Events / Acme Annual 2026) | **exact canonical ids preserved** |
| Auth identities | **32 `auth.users` + 32 `auth.identities` copied with ids and password hashes preserved; 23 link to a Prisma `User` by id** |
| Pulse typecheck / build / unit tests | pass / pass / **21 failed, 2200 passed, 47 skipped** — identical to the inherited baseline |
| Local Platform → Pulse launch, end to end | **succeeded** against the new project (see §9) |

The legacy 55-migration chain was **not** replayed and is not the reconstruction mechanism. The previous ledger was **not** copied.

---

## 2. Source-of-truth hierarchy

| Source | Role | Authority |
|---|---|---|
| **Live previous-production `public` schema** | Recaptured via `pg_dump --schema-only --no-owner --no-privileges --schema=public` (client 18.6 against server 17.6) immediately before generation | **Authoritative** for tables, columns, types, nullability, defaults, enum values and order, PKs, FKs and referential actions, indexes, the one function and trigger, and RLS state |
| **Canonical `apps/pulse` runtime + migrations** | `prisma/schema.prisma` and the (now legacy) migration chain | **Authoritative** where production had drifted from it — the three items in §4 |
| **Legacy migration history** | 55 directories, now at `test-fixtures/legacy-pulse-migrations/` | **Consulted for intent only.** Never executed. Retained as historical evidence and as fixtures for 8 regression test files |

Prisma-generated SQL was deliberately **not** used as the baseline source: it emits no functions or triggers. It was generated (`prisma migrate diff --from-empty`) only as a cross-check.

---

## 3. Canonical Prisma tree

`apps/pulse/prisma/` is the single active tree (Prisma 5.22, no `prisma.config.ts`). The active migrations directory `prisma/migrations/` now contains exactly the baseline plus `migration_lock.toml`; future migrations continue from it with the ordinary `prisma migrate dev` / `prisma migrate deploy` workflow. Tests that read historical migration SQL were repointed at `test-fixtures/legacy-pulse-migrations/`:

`prisma/account-user-membership-migration.test.ts`, `prisma/collection-phase-migration.test.ts`, `prisma/advanced-event-creation-type-migration.test.ts`, `prisma/data-api-lockdown-migration.test.ts`, `prisma/platform-identity-mapping-migration.test.ts`, `lib/event-speaker-intelligence.test.ts`, `lib/event-agenda-schema.test.ts`. The lockdown test now accepts the schema-qualified `public."Table"` form the native dump uses, and scans the *active* chain for RLS coverage (the guard that future models ship with RLS).

---

## 4. Reconciliation decisions — the deliberate differences

Loop 1 identified one ledger gap; the reconciliation pass (`prisma migrate diff --from-url <old> --to-schema-datamodel`) found two more production-only drifts. Canonical wins in all three, matching the canonical test `prisma/platform-identity-mapping-migration.test.ts`, which already documents the first two as "known production-only differences".

| Object | Previous production | New baseline | Why |
|---|---|---|---|
| `Event.conversationMode` (boolean NOT NULL DEFAULT false) | present | **not created** | Absent from every canonical migration and from all runtime code. All 66 production rows held the default (`false`), so no data is lost. |
| `Event.ttsVoice` default | `'en-US-Standard-C'` | **`'en-US-Neural2-F'`** | Canonical migration `20260504234500_add_event_tts_settings` and `schema.prisma`. Existing row values (7 distinct voices) copied unchanged; only the default for new rows differs. |
| `EventClosingBriefSnapshot.lifecyclePhase` (text NOT NULL) + unique index `("eventId","lifecyclePhase")` replacing `("eventId")` | absent (migration `20260905160000_scope_event_briefs_by_lifecycle` never reached production) | **present** | Canonical source is one migration ahead of production. The 6 copied rows are backfilled with `'POST_EVENT'`, exactly as that migration does. |
| `hypopg 1.4.1`, `index_advisor 0.2.0` extensions | installed | not installed | Supabase dashboard index-advisor add-ons; nothing in Pulse references them. Installable from the dashboard at any time. |
| `_prisma_migrations` | 54 applied + 3 rolled-back rows | 1 row (`20260906180000_pulse_clean_baseline`) | Fresh ledger by design. |

Column ordinal positions in `Event` shift by one after `conversationMode` (a consequence of the first row, not a separate difference).

---

## 5. PostgreSQL-native objects preserved

- Function `prevent_response_collection_phase_change()` and trigger `Response_collectionPhase_immutable` (`BEFORE UPDATE OF "collectionPhase" ON "Response"`), compared by MD5 of `pg_get_functiondef()` and by `pg_get_triggerdef()` — identical.
- Row level security **enabled, no policies** on all 43 model tables (from the dump), plus the Data API privilege revocation block (`REVOKE … FROM anon, authenticated`, default privileges included) appended verbatim from canonical `20260905180000_lock_down_data_api_access`. Verified on the new project: `anon` / `authenticated` hold **no** table, sequence or schema privilege on `public`; `service_role` untouched; default ACLs identical to production (24 entries).
- 35 enums / 155 values in identical order; 114 foreign keys with identical referential actions; 295 indexes (47 unique); 44 primary keys (43 model tables + the ledger); 0 check constraints, 0 partial indexes, 0 sequences, 0 policies — all exactly as in production.
- Scope is the Pulse `public` schema plus the two Supabase Auth tables below. No cross-schema reference exists in the dump.

---

## 6. Data migration

`pg_dump --data-only --schema=public` (COPY format) from the previous production project, loaded into the new project in **one transaction with foreign keys enforced** (no `session_replication_role = replica`, no trigger disabling), so referential integrity of the copied data was checked by PostgreSQL itself. Two tables were handled explicitly:

- `Event`: re-exported with an explicit column list that omits `conversationMode`.
- `EventClosingBriefSnapshot`: re-exported with `'POST_EVENT'` appended as `lifecyclePhase`.

| Table | Old | New |
|---|---|---|
| Answer | 3,674 | 3,674 |
| AnswerTranscript | 3,577 | 3,577 |
| AnswerEventTheme | 3,469 | 3,469 |
| AnswerAnalysis | 3,443 | 3,443 |
| AnswerEventEntity | 3,215 | 3,215 |
| AnswerEventIntelligence | 2,901 | 2,901 |
| Response | 1,919 | 1,919 |
| Question | 1,301 | 1,301 |
| AnswerProcessingLog | 1,145 | 1,145 |
| AnswerEventAction | 756 | 756 |
| EventSessionSpeakerAssignment | 738 | 738 |
| InsightSourceAnswer | 641 | 641 |
| EventIssueEvidence | 635 | 635 |
| EventStructureItem | 509 | 509 |
| Survey | 472 | 472 |
| SurveyTarget | 434 | 434 |
| EventAgendaImportRow | 395 | 395 |
| EventSpeakerProfile | 366 | 366 |
| EventIntelligenceAggregate | 341 | 341 |
| EventIssueCluster | 142 | 142 |
| QuestionAudioAsset | 142 | 142 |
| PublicSurveyLink | 132 | 132 |
| Insight | 110 | 110 |
| EventActionHistory | 67 | 67 |
| Event | 66 | 66 |
| EventActionUpdate | 60 | 60 |
| Location | 50 | 50 |
| Account | 46 | 46 |
| User | 29 | 29 |
| PendingProvision | 26 | 26 |
| AccountUserMembership | 21 | 21 |
| TestSignupToken | 17 | 17 |
| EventAgendaImportJob | 14 | 14 |
| EventClosingBriefSnapshot | 6 | 6 |
| 9 empty tables (Admin, Analysis, EventActionAssignmentDelivery, EventActionDeliveryAttempt, EventAlertNote, ProcessingLog, PlatformUserActionAudit, Session, Transcript) | 0 | 0 |
| **All 43 model tables** | **30,859** | **30,859** |
| `_prisma_migrations` (deliberately not copied) | 57 | 1 |

Nothing was identified as disposable; every product row was copied.

---

## 7. Auth migration

Pulse uses Supabase Auth and `establishPulseSessionForUser` looks the user up **by id** (`auth.admin.getUserById(User.id)`), so `auth.users.id` must equal the Prisma `User.id`. `auth.admin.createUser()` would have assigned new ids and broken that linkage, so `auth.users` and `auth.identities` were copied with `pg_dump --data-only` and restored verbatim — ids, emails, `encrypted_password` hashes, confirmation timestamps and metadata preserved. Both projects run the same GoTrue schema version (`20260625000000`) with identical column sets.

| | Old | New |
|---|---|---|
| `auth.users` | 32 | 32 |
| `auth.identities` (all `email`) | 32 | 32 |
| Prisma `User` rows linked to an auth user by id | 23 | 23 |
| Prisma `User` rows with no auth user (seeded demo accounts `@example.invalid` / `@signalthread.example`) | 6 | 6 |
| auth users with no Prisma `User` | 9 | 9 |

Loop 1 proposed copying only the 23 linked identities. All 32 were copied instead because 7 of the 9 unlinked auth users have in-flight `PendingProvision` rows (signup provisioning that completes on next sign-in); copying them is an exact preservation, not an invented identity, and no email matching was used anywhere. Ephemeral auth state was **not** copied: `sessions` (58), `refresh_tokens` (268), `flow_state` (186), `one_time_tokens` (9), `mfa_amr_claims` (58); users simply sign in again. `mfa_factors` was 0.

---

## 8. Platform mappings and storage

| Pulse record | Canonical Platform id | Verified in new project |
|---|---|---|
| `User 88bbd88d-ca23-40d1-8d63-a7d3d312f783` (kamyab.ali@gmail.com, SUPER_ADMIN) | `platformUserId = bfccbd09-700c-4146-992f-8827f32aa6fd` | ✓ |
| `Account acct_events_demo` (events-demo, EVENTS) | `platformOrganizationId = 7437a82f-bdc9-425d-9f1c-5525930b43bd` | ✓ |
| `Event event_advanced_demo_20260903195512_42b377cc` (ACTIVE) | `platformEventId = ae9942ba-5759-486b-b591-f1b5ed223370` | ✓ |

Exactly one mapped row per table, as in production. Storage: `storage.buckets` and `storage.objects` were both 0 in production; Pulse stores media in Cloudflare R2 via `@aws-sdk/client-s3`, which is unaffected — nothing to migrate.

---

## 9. Monorepo wiring and end-to-end validation

`apps/pulse/.env.local` (gitignored) now carries `DATABASE_URL` and `DIRECT_URL` (session pooler `aws-0-us-east-2.pooler.supabase.com:5432`, no `pgbouncer` param), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` for `konpdhvxooxsbjaisqih` only, with `PLATFORM_APP_URL=http://localhost:3001` and `NEXT_PUBLIC_APP_URL=http://localhost:3002` kept. It references neither `tsoquobpingfqezolvgp` nor `xcveazzoavnizefbcjfg` except in the comment that forbids them. Platform's env references only `wtbnpeluwhjjqccdofxd`; Orca's references only `qgxvtgnzptepimuawnku` plus the Platform Core auth authority, by design. No app source references any project ref (only pre-existing one-off scripts do).

With `npx concurrently -k "npm run dev:platform" "npm run dev:orca" "npm run dev:pulse"` running, a browser-equivalent driver (two cookie jars, `Sec-Fetch-Dest: document`, manual redirects) performed:

1. Platform Core session for Ali (`bfccbd09…`), minted the way Platform itself does.
2. `GET http://localhost:3002/platform-entry/start?event_id=ae9942ba…` → 303, browser-bound launch state set → 303 to `http://localhost:3001/api/launch/pulse?event_id=…&state=<correlator>`.
3. Platform authorized the launch and minted the handoff → 303 to `http://localhost:3002/platform-entry?handoff=…&event_id=…&state=…`.
4. Pulse claimed it (`POST /api/launch/pulse/claim` → 200 on Platform), resolved the canonical mapping in the **new** database, passed Pulse's own authorization, and issued a Pulse session → 303 to `/app/events/event_advanced_demo_20260903195512_42b377cc?account=events-demo`.
5. The workspace rendered with HTTP 200. The Pulse auth cookie is `sb-konpdhvxooxsbjaisqih-auth-token`; its JWT is issued by `konpdhvxooxsbjaisqih.supabase.co` for user `88bbd88d…`.

Database-side evidence: the new project's `auth.sessions` went from 0 to 1 (Ali, created at the moment of the launch) and Ali's `last_sign_in_at` advanced there; the previous production project stayed at 58 sessions, 15 for Ali, `last_sign_in_at` unchanged. The pilot Platform session was revoked afterwards.

---

## 10. Known deferred cleanup

- `docs/context/*` and several historical notes still describe the pre-baseline migration chain; they are history, not instructions.
- `apps/pulse/scripts/clone-event-dev-to-prod-lib.ts` and `scripts/migrate-shared-hope-event-framework.ts` hardcode the old project refs; they are one-off scripts and were left untouched.
- Running `npm run dev:pulse` through the workspace prints a harmless `npm error code ENOWORKSPACES` line before Next reports ready (pre-existing).

## 11. Next phase (not done here)

Production cutover: set the new project's `DATABASE_URL` / `DIRECT_URL` / Supabase keys in the Pulse deployment, configure Auth Site URL / redirect URLs / SMTP on `konpdhvxooxsbjaisqih`, repoint `voice.signalthread.ai`, and only then retire `tsoquobpingfqezolvgp`. None of that was performed; nothing was deployed, committed or pushed.
