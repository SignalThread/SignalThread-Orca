# Orca Clean Database Baseline

- **Date:** 2026-08-21
- **Repository:** `SignalThread/SignalThread-Orca` (`~/Documents/orca-clean`), branch `platform-core-phase-2`, from `main` @ `0c0e034`
- **Legacy reference:** the working legacy Orca database, accessed **read-only**. No DDL, DML, migration, seed, or `_prisma_migrations` change was made to it.

---

## 1. Executive summary

### CLEAN BASELINE VERIFIED

One clean baseline migration reproduces the complete current Orca operational schema in a brand-new empty PostgreSQL database, and it was proven against a disposable database with four independent checks.

| Check | Result |
|---|---|
| Candidate DB vs legacy PostgreSQL truth (2,948 catalog facts) | **3 differences, all intentional additions, 0 regressions** |
| Candidate DB vs reconciled Prisma schema (`prisma migrate diff`) | **empty — exit code 0** |
| Fresh `prisma db pull` of the candidate vs reconciled schema | **0 meaningful differences**; 124 models / 112 enums both ways |
| Runtime + native-integrity tests | **2,593 pass / 12 fail**, the 12 identical to the `main` baseline |

The single intentional divergence from the legacy live schema is `User.platformUserId` and its two indexes, which the already-merged Platform Core Phase 1/2 identity resolution requires and the legacy database predates.

The legacy 84-migration chain was **not** replayed and is not the reconstruction mechanism.

---

## 2. Source-of-truth hierarchy

| Source | Role | Authority |
|---|---|---|
| **Live PostgreSQL `public` schema** | Recaptured fresh via `pg_dump --schema-only --no-owner --no-privileges --schema=public` (client 18.1 against server 17.6) immediately before generation | **Authoritative** for tables, columns, types, precision, nullability, defaults, enum values *and ordinal order*, PKs, FKs and their referential actions, indexes and partial predicates, check constraints, functions, triggers |
| **Canonical Orca runtime contracts** | The merged Phase 1/2 code in this repository | **Authoritative** where the runtime requires something the legacy database predates — the sole instance being `User.platformUserId` |
| **Reconciled Prisma schema** | Canonical schema + live-only families + drift fixes | **Authoritative** for the client API: model and field naming, relation names, which relations are exposed |
| **Legacy migration history** | 84 directories in `prisma/migrations` | **Consulted for intent only.** Never executed. Retained as historical evidence and as fixtures for 20 schema regression tests |

Prisma-generated SQL was deliberately **not** used as the baseline source: its `CREATE UNIQUE INDEX` output omits partial predicates, and it emits no check constraints, functions, or triggers.

---

## 3. Canonical Prisma tree

**`web/prisma/` is authoritative.** Evidence in the current repository:

- `web/package.json` runs `prisma generate --config prisma.config.ts --schema ./prisma/schema.prisma` from `web/`, and `predev`/`postinstall` invoke it.
- `web/prisma.config.ts` selects `./prisma/schema.prisma` and `./prisma/migrations`, and loads `.env.local`.
- The Next.js runtime resolves `@prisma/client` from the `web` dependency tree.

The root `prisma/` tree is a **byte-identical mirror** (schema and all 84 migration directories verified recursively identical). It is not dead: `prisma/seed.ts` lives there, and tests read *both* trees — 25 read `prisma/schema.prisma` (web) and 10 read `../prisma/schema.prisma` (root); 24 read migration files from the web tree and 9 from the root tree.

**Decision: keep both trees and mirror every change**, exactly as Phase 1 did. Deleting either would break tooling or tests for no baseline benefit. Consolidation is listed as deferred cleanup.

---

## 4. Reconciliation decisions

### 4.1 The live schema moved since the schema-truth audit

The audit (2026-08-21) recorded 123 tables / 110 enums. The fresh recapture found **124 tables / 112 enums**:

| New live object | Nature |
|---|---|
| `SignageSignSession` | sign ↔ session join table |
| `SignageBrandingDecision`, `SignageInstallProofStatus` | enums |

This is **additive growth in the same Signage family the audit already flagged as critical live-only**, so it confirms rather than contradicts the audit's conclusion. Baseline analysis uses the fresh counts (124/112), not the audit's stale ones. Nothing present at audit time disappeared.

### 4.2 The one intentional divergence

| Object | Decision | Why |
|---|---|---|
| `User.platformUserId` (uuid, nullable) + `User_platformUserId_key` (unique) + `User_platformUserId_idx` | **INTENTIONAL TARGET CHANGE** | Verified absent from the legacy database, and its Phase 1 migration is absent from the legacy ledger. The merged Platform Core Phase 1/2 identity resolver keys on it; omitting it would break authentication. Additive and non-destructive |

### 4.3 Preserved live truth over old Prisma belief

Each of these had the old Prisma schema disagreeing with the database. **Live won in every case.**

| Item | Old Prisma | Live (preserved) |
|---|---|---|
| Supplies family (7 tables, 4 enums) | absent | **modelled** |
| Signage family (8 tables, 16 enums) | absent | **modelled** |
| `MatrixRowSpeaker`, `MatrixRowStaffAssignment` | deliberately unmodelled | **modelled** (Step 5 default posture: PRESERVE) |
| `EventPerson.phone`, `EventPerson.notes` | absent | **added** |
| `TimelineItem.startDate/endDate` | `@db.Date` | `timestamp(3)` |
| Session-requirement family timestamps | implied `timestamp(3)` | `timestamptz(6)` |
| `EventPerson` timestamps | Prisma-managed | `timestamp(6)` + DB defaults |
| `SessionAVRequirement.createdAt`, `SessionFoodService.createdAt` | required | **nullable** |
| 16 tables' `id` default | `uuid()` (client-side) | `gen_random_uuid()` (database-side) |
| `EventPerson` unique `(eventId,name)` | declared | **not created** — the live database never enforced it, and the audit found zero duplicate groups. Not invented |
| `EventPerson` index `(eventId,email)` | declared | **not created**; live has `(eventId)` and `(eventId,role)` |
| `TimelineItem_eventId_parentId_sortOrder_idx` | declared | **not created** |
| 9 index names | Prisma-truncated names | **live names pinned** via `map:` |
| 11 FK referential actions | Prisma defaults | **live actions pinned** explicitly |
| 13 FKs on dashboard/parser/`UserDashboardLayout` | scalar-only, relations omitted | **relation fields added**, referential behaviour unchanged |

### 4.4 Deliberately retained despite being unused

`TimelineItemStatus` and `TimelineItemPriority` are used by **no column** and referenced by **no canonical code** (both verified). They are nonetheless preserved in the baseline and modelled in Prisma, because Step 3 requires preserving parity when uncertain and Step 6 forbids opportunistic cleanup. Retiring them is a one-line follow-up recorded under deferred cleanup.

### 4.5 Prisma representation choices

- `previewFeatures = ["partialIndexes"]` is now enabled. Without it Prisma models a partial unique index as a plain unique index and **silently drops the predicate** — which would have changed database semantics. All 6 partial predicates are now expressed in the schema.
- `String` vs `String @db.Text` and field-level `@unique` vs block-level `@@unique([f])` are Prisma-equivalent forms that produce identical DDL; both spellings appear and neither is drift. `prisma migrate diff` confirms this — it reports empty.

---

## 5. PostgreSQL-native objects preserved

All taken verbatim from the fresh native dump, never paraphrased.

### Six partial unique indexes (exact predicates)

| Index | Predicate |
|---|---|
| `EventAttendeeSessionEnrollment_external_registration_key` | `integrationConnectionId IS NOT NULL AND externalSessionRegistrationId IS NOT NULL` |
| `EventDashboardView_one_active_team_default_per_event` | `isTeamDefault = true AND archivedAt IS NULL` |
| `SeatingAssignment_event_attendee_event_level_key` | `seatingPlanId IS NULL` |
| `SeatingAssignment_event_attendee_plan_key` | `seatingPlanId IS NOT NULL` |
| `SessionSupplyAllocation_active_catalog_key` | `state = 'ACTIVE' AND supplyItemId IS NOT NULL` |
| `SupplyTemplate_system_key_key` | `isSystem` |

### 27 check constraints

All present and byte-identical to live: 4 `Event_*Term_approved_check`; 2 `EventFnbCatalogItem_*`; 2 `SessionAgendaPublication_*`; `SessionFnbAssignmentSafetyResolution_verified_modification_chec`; 2 `SessionFnbRequirement_*`; 4 `SessionShowFlowItem_*`; 2 `SessionShowFlowState_*`; 2 `SessionSupplyAllocation_*`; 2 `SessionSupplyState_*`; 2 `SignageSign_*`; `SupplyItem_nonnegative_committed`; `SupplyTemplate_system_scope`; `SupplyTemplateItem_valid_quantity`; `TimelineItem_not_needed_evidence_check`.

### Functions and triggers

- `enforce_supply_event_scope()` → trigger `SessionSupplyAllocation_event_scope`
- `protect_system_supply_templates()` → trigger `SupplyTemplate_system_read_only`

Function bodies were compared by MD5 of `pg_get_functiondef()` and match exactly. Dependency order in the baseline is: enums → functions → tables (with inline checks) → indexes → constraints/FKs → triggers.

### Other native characteristics

- 34 columns default to `gen_random_uuid()`; the target must provide it (PostgreSQL 13+).
- Timestamp precision/timezone preserved per column: `timestamp(3)`, `timestamp(6)`, `timestamptz(6)`.
- 278 FKs with exact `ON DELETE` / `ON UPDATE`, including the `NO ACTION` cases Prisma defaults would have rewritten to `CASCADE`.
- Scope is the Orca `public` schema only. `auth`, `storage`, `realtime`, `vault`, `graphql`, `graphql_public`, `pgbouncer` and unrelated Supabase service extensions are excluded — the dump contains no cross-schema reference.

---

## 6. Baseline migration

```
web/prisma/baseline/20260821120000_orca_clean_baseline/migration.sql   (canonical)
prisma/baseline/20260821120000_orca_clean_baseline/migration.sql       (mirror)
```

8,867 lines. Applied with:

```bash
DATABASE_URL=<new-empty-db> npx prisma migrate deploy --config prisma.baseline.config.ts
```

`web/prisma.baseline.config.ts` points Prisma at `prisma/baseline` — a migrations root containing **only** the baseline — so a new database gets one coherent forward-only chain and a fresh ledger. `prisma.config.ts` still points at the legacy `prisma/migrations` chain, which is retained for history and test fixtures and must never be replayed.

Excluded from the baseline: legacy application data, the 91-row legacy `_prisma_migrations` ledger, `CREATE SCHEMA public`, session `SET`/psql meta-commands, Supabase auth tables, Platform Core tables, and sibling-product tables.

---

## 7. Validation database

A disposable local database `orca_baseline_validation` on `localhost:5432`. The legacy database is a **remote Supabase pooler host**, so the two are unambiguously distinguishable.

Every mutating step ran behind a guard that prints a non-secret fingerprint (`host / port / database`) and aborts unless the host is `localhost`/`127.0.0.1` **and** the database name is on an explicit allowlist. The guard was demonstrated refusing the legacy URL before use. No credential value was printed at any point.

The native-integrity test file carries the same guard independently: pointed at the legacy URL it skips all 11 tests with `Refusing to run destructive integrity tests against non-local host …`, and pointed at an unapproved local database it skips as well. Its writes additionally run inside transactions that are always rolled back.

---

## 8. Schema parity results

Catalog facts compared: columns (type, nullability, default), enum labels with ordinal order, every constraint definition, every index definition including predicates, function-body hashes, and trigger definitions.

| | Legacy live | Candidate |
|---|---:|---:|
| Catalog facts | 2,945 | 2,948 |
| Application tables | 124 | 124 |
| Enums | 112 | 112 |
| Primary keys | 124 | 124 |
| Foreign keys | 278 | 278 |
| Unique constraints | 13 | 13 |
| Check constraints | 27 | 27 |
| Indexes | 501 | 504 |
| Partial unique indexes | 6 | 6 |
| Functions / triggers | 2 / 2 | 2 / 2 |
| Views / sequences / RLS policies | 0 / 0 / 0 | 0 / 0 / 0 |

**Differences: 3. All categorised INTENTIONAL TARGET CHANGE; none is a parity failure.**

```
> COL|User|platformUserId|uuid|NULL|-
> IDX|User|User_platformUserId_idx  ...
> IDX|User|User_platformUserId_key  ...
```

Only-in-legacy: **0** — nothing from the live schema was lost.

Parity also holds across PostgreSQL versions: the source is 17.6 and the candidate was built on local 15.15, so the baseline is version-portable within that range.

---

## 9. Test results

All commands run from `web/` with `DATABASE_URL` pointing at `orca_baseline_validation`.

| Command | Result |
|---|---|
| `npx prisma format --schema prisma/schema.prisma` | formatted |
| `npx prisma validate --schema prisma/schema.prisma` | valid |
| `npx prisma validate --schema ../prisma/schema.prisma` | valid |
| `npx prisma generate` | client regenerated |
| `npx prisma migrate deploy --config prisma.baseline.config.ts` | 1 migration applied; ledger has exactly 1 row, `applied_steps_count=1`, not rolled back |
| `npx prisma migrate status --config prisma.baseline.config.ts` | "Database schema is up to date!" |
| `npx prisma migrate diff --from-schema prisma/schema.prisma --to-config-datasource --exit-code` | **exit 0 = EMPTY** |
| `npx tsc --noEmit` | clean (pre-existing `../packages/signalthread-ui` errors excluded, untouched) |
| `npx eslint lib src app` | **0 errors, 74 warnings — identical to `main`** |
| `npm run build` | exit 0 |
| `npx tsx --test lib/orca-baseline-native-integrity.test.ts` | **11 / 11 pass** |
| `npm run test:journeys` | **18 / 18 pass** |
| `npm run test:harness` | **8 / 8 pass** |
| `npm run test:summary` (full suite) | **2,593 pass / 12 fail / 7 skipped** |

**Baseline comparison:** `main` with a database configured fails the same **12** tests. New failures: **0**. The 12 are pre-existing and unrelated (budget grid layout, command-center container, timeline render-path, docs upload, two matrix-2 DB tests).

Schema-heavy areas covered by the passing suites: request-user/auth resolution, organizations, events, memberships, run of show/sessions, speakers, attendees, seating, budget, documents, timeline, F&B, session requirements, tasks, marketing, dashboards, supplies, signage, and event activity/audit.

### Two tests updated (not suppressed)

| Test | Why it changed |
|---|---|
| `event-attendee-session-enrollment-regression` — "schema adds normalized attendee-session enrollment without JSON shortcuts" | Asserted `@@unique([eventId, attendeeId, matrixRowId])` as an exact string. The attribute now carries `map:` to pin the live index name. The assertion was widened to `[,)]` so it still verifies the uniqueness contract |
| `fnb-shared-foundations-migration` — "schema preserves explicit claims and separate price provenance" | Asserted `MatrixRowSpeaker`/`MatrixRowStaffAssignment` are **absent** from Prisma. Step 5 requires preserving them. Replaced with positive assertions that the canonical `SessionSpeakerAssignment`/`SessionStaffAssignment` models exist, with the reasoning recorded inline |

One source fix was required: `lib/test-harness/planner-fixtures.ts` constructs an `EventPerson` literal, which now needs the recovered `phone`/`notes` fields.

---

## 10. Known deferred cleanup

Only items genuinely deferred:

1. **`MatrixRowSpeaker` / `MatrixRowStaffAssignment`.** Preserved per Step 5. Live, populated (1 and 31 rows at audit time), and still referenced by the test harness, cleanup paths, and E2E fallback. Retirement needs its own data-retirement decision and evidence; this task did not take it.
2. **Duplicate Prisma trees.** `prisma/` and `web/prisma/` remain byte-identical mirrors that must be updated together. Consolidation is safe only once the seed and the 20 migration-reading test files are repointed.
3. **Legacy migration chain.** The 84 directories under `prisma/migrations` are retained as historical evidence and as fixtures for 20 schema regression tests. Archiving them (e.g. to `prisma/legacy-migrations/`) would let `prisma/migrations` become the single forward chain, but requires updating those test paths.
4. **`TimelineItemStatus` / `TimelineItemPriority`.** Confirmed unused by any column and any canonical code. Preserved for parity; safe to drop in a dedicated follow-up.
5. **`EventPerson` uniqueness.** The live database does not enforce `UNIQUE(eventId, name)` and the baseline does not invent it. Application code does a case-insensitive pre-insert lookup, which is not race-safe. Whether to add the constraint is an open product decision.
6. **`SessionAVRequirement.createdAt` / `SessionFoodService.createdAt` nullability.** Preserved as nullable per live. Tightening is a separately validated change.

---

## 11. Next phase

```
Create the permanent new Orca operational database
  → apply this verified baseline (prisma.baseline.config.ts)
  → introduce Platform canonical IDs
```

Not performed here. This task ends with the baseline proven against a disposable database. The permanent database was not created, no cutover was performed, and no production configuration was changed.
