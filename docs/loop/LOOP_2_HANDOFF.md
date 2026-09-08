# Loop 2 handoff — Orca event world and operational richness

Prompt completed: Loop 2. On 2026-09-08 the approved Orca schema was reconciled for required services, canonical Platform Core + Orca adapters were implemented, and persisted SMOKE/DEMO/rerun verification passed.

## Targets and schema reconciliation

- Platform Core: `wtbnpeluwhjjqccdofxd`; exact host and service-role JWT ref verified before adapter mutations.
- Orca: `qgxvtgnzptepimuawnku`; connection tenant ref verified before migration, seed, rerun, and readback.
- No Pulse, Lead Retrieval, legacy Orca, or other project was contacted.
- Only `apps/orca/prisma/schema.prisma` and `apps/orca/prisma/baseline/` were authoritative. Legacy fixtures were not used.

Before mutation the ledger contained only `20260821120000_orca_clean_baseline`. Eight active migrations were pending: supply-template seed; optional-session-module enum/tables/indexes/FKs; session operational records; security compliance records; `MatrixRow.includeInOfficialAgenda`; registration-agenda enums/table/indexes/FKs; registration import batches; and two nullable attendee housing columns. The live-to-canonical diff contained only creates/adds. The supply cleanup matched zero rows because the target had zero supply templates/items.

`prisma migrate deploy --config prisma.config.ts` applied all eight. The ledger now has nine finished, non-rolled-back rows and status is up to date. `MatrixRow.includeInOfficialAgenda` is live as non-null boolean default `false`: 79 pre-existing rows were safely defaulted to false, with zero nulls. A generated-client query selected it successfully as a boolean. Orca Prisma Client 7.9.1 was regenerated; typecheck passed; 13 targeted tests passed, including DB-backed official-agenda, ShowOps publication, registration-agenda, generated-client, security-compliance, and session-module coverage.

Post-deploy diff exposed three migration-authoring metadata mismatches: `RegistrationAgendaEntry.id` and `RegistrationAgendaImportBatch.id` have database `gen_random_uuid()` defaults while Prisma declares client-side `uuid()`, and PostgreSQL truncated the long agenda index name differently from Prisma's expected spelling. Removing defaults and renaming an index are outside `ADDITIVE_ALLOWED`; they were not applied. Runtime reads/writes and targeted tests pass, so required services are reconciled. A future separate approval can reconcile this harmless metadata-only residue.

## Implementation

Files changed in Loop 2:

1. `scripts/demo-seeding/world.ts`
2. `scripts/demo-seeding/adapters.ts`
3. `scripts/demo-seeding/platform.ts`
4. `scripts/demo-seeding/orca.ts`
5. `scripts/demo-seeding/cli.ts`
6. `scripts/demo-seeding/framework.test.ts`
7. `scripts/demo-seeding/README.md`
8. `docs/loop/LOOP_2_HANDOFF.md`

Migration files created: none; existing active migrations were deployed.

Implemented deterministic rooms/schedules/speakers/team, deadlines, roadmap/timeline dependencies, budget, documents, seating, activities, and 3/7/10 reusable narrative threads by richness. Platform provisions/reuses canonical Auth identity, organization, owner membership, event, event membership, Orca entitlement, and derived v1 claims. Orca adopts Platform organization/event UUIDs directly and links its local user through `User.platformUserId`. Optional Platform `venue/timezone` columns are detected and omitted when absent; Platform schema was not changed.

Immutable manifests and deterministic upserts support safe rerun without overwriting ownership. Reset remains deliberately fail-closed until every non-cascading Orca dependent can be transactionally proven owned; Loop 1's exact reset-planning tests remain green and no unsafe reset exists.

## Persisted evidence

SMOKE (`seed=20260907`): Platform 1 org, 1 organizer, 1 membership, 1 event, 1 entitlement. Orca 2 rooms, 3 sessions/3 official, 4 speakers, 3 team, 5 deadlines, 6 timeline items, 1 dependency, 5 budget items, 3 documents, 8 seated attendees, 3 narratives. Manifest: `/private/tmp/st-orca-smoke-20260908.json`.

DEMO (`seed=20260908`): Platform 1 org, 1 organizer, 1 membership, 1 event, 1 entitlement. Orca 5 rooms, 12 sessions/12 official, 16 speakers, 6 team, 18 deadlines, 24 timeline items, 5 dependencies, 16 budget items, 8 documents, 32 seated attendees, 7 narratives. Manifest: `/private/tmp/st-orca-demo-20260908.json`.

The DEMO rerun returned identical counts/ids. Platform event `a8913d62-aae3-514f-b995-af700d153ff7` equals Orca Event id and belongs to org `3bbf6fd7-8b4d-5768-a57f-614ffc6fd05c` in both products. Orca `User.platformUserId=97d39d25-b85f-4a65-a4e3-5529e6bb3474` equals the Platform Auth organizer id. Both framework orgs have active Orca entitlements. No duplicate scoped rows appeared.

The first same-seed DEMO attempt exposed a deterministic seating-plan richness-upgrade conflict and rolled back its entire Orca transaction. It created no new Platform identity/event because it reused the owned SMOKE scope. The upsert was corrected to use the deterministic plan primary key; the distinct-seed DEMO then passed.

Verification: demo framework tests 16/16; scoped TypeScript, ESLint, and whitespace pass; Orca typecheck pass; targeted Orca services 13/13; persisted SMOKE, DEMO, deterministic DEMO rerun, and final cross-database mapping/count readback pass.

Plan alignment: one event world feeds canonical Platform and Orca. No parallel identity/mapping table, legacy authority, fake entitlement, sibling schema mutation, email/invitation, AI call, or destructive reset was introduced.

Next prompt: Loop 3 may begin with a fresh audit of the real Lead Retrieval direct/organizer contracts. Do not invent unsupported LR mappings or weaken the reset boundary.
