# OrcaOS Database Review — Slice 1A Trust Audit Proposals

**Status:** Prompt 2 import-ledger and Directory-role decisions implemented; remaining proposals retain their recorded review status.
**Related audit:** `docs/implementation/orca-slice-1-trust-audit.md`

## 1. Durable idempotency for event import creation (TA-04)

**Decision implemented (Prompt 2):** the canonical contract is an additive `EventImportIntent` / `EventImportResult` ledger keyed uniquely by organization, requesting user, and client-generated UUID. It stores the exact approved plan, reviewed mappings, and `FINAL_REVIEW` evidence. Terminal success, failure, and cancellation are immutable replay outcomes for that key; successful creation and its result commit atomically. Historical events are not backfilled, and rollback must preserve existing events and ledger evidence. Migration `20260806120000_event_import_ledger` implements this contract.

- **Proposed change:** Add a durable idempotency key/result mechanism for `POST /api/events/import/create`, either a request/result model or an approved unique key on an existing persisted import record. The result must identify the created event and counts/warnings.
- **Why needed:** The current transaction is atomic but not retry-safe. A repeated request creates another Event, EventMember, MatrixRow, Budget, BudgetLineItem, TimelineItem, and related records.
- **Alternatives considered:** UI-only in-flight button disabling; request hash in process memory; client-only local storage. These do not protect browser refresh, network retries, multiple tabs, or multiple application instances.
- **Affected records/workflows:** Event Builder, blank/template/workbook/paste imports, downstream event routing, portfolio counts, speaker/session assignments, budget totals, timeline risks.
- **Authorization/isolation:** The key/result must be scoped to the authenticated user/org and must never allow a user to replay another organization’s result. The created event must remain under the authenticated organization.
- **Migration/compatibility:** Existing events have no import intent key. A nullable additive field or new ledger can be introduced without backfilling historical events, but API clients must tolerate legacy requests without a key during rollout.
- **Rollback:** Disable idempotency enforcement only with a clear compatibility plan; removing a unique constraint/ledger after duplicate results exist does not repair duplicates. Rollback should preserve existing created events.
- **Change type:** Additive schema/persisted-data change; possibly a new model/index.
- **Sarah’s decision:** Choose the canonical idempotency key and retention/result policy, and approve whether legacy clients may continue without a key.

## 2. Event-scoped uniqueness for speaker imports (TA-05)

- **Proposed change:** Establish the canonical normalized speaker business key, likely event + normalized email when email exists, with an approved application strategy for name-only records. Enforce it durably if concurrency safety is required.
- **Why needed:** Request-local `seenEmails`/`seenNames` checks race across concurrent imports and do not provide a database invariant.
- **Affected records/workflows:** Speaker CSV imports, manual speaker create/edit, event-import speaker extraction, speaker assignments, readiness, directory backfill/merge.
- **Authorization/isolation:** Uniqueness must include `eventId`; the same person may legitimately exist in different events. Any merge/backfill must preserve event isolation.
- **Migration/compatibility:** Historical duplicate speakers must be detected and intentionally merged or exempted before a constraint can be added. Existing null/blank emails and name casing/spacing require a defined normalization policy.
- **Rollback:** Removing enforcement after partial cleanup can reintroduce duplicates. A rollback plan must preserve the selected surviving speaker IDs and assignment/history links.
- **Change type:** Additive index/constraint and potentially destructive data cleanup; Sarah review required.
- **Sarah’s decision:** Approve the business key and historical duplicate disposition before any index or cleanup proposal becomes implementation work.

## 3. Durable post-create document outcome (TA-09)

- **Proposed change:** If cross-session recovery is required, add an approved persisted upload/import status or result ledger for Additional Docs, or extend an existing document/upload status contract without changing the F&B/session-menu model.
- **Why needed:** Event creation commits before document upload. A closed tab can leave the user unable to distinguish failed, pending, finalized, and review-submitted documents or safely retry without duplicate document records.
- **Affected records/workflows:** Event Builder, Docs Hub, object storage finalization, document links, categories, optional review submissions.
- **Authorization/isolation:** Results must be scoped by event and organization; retry must not accept a document ID from another event.
- **Migration/compatibility:** Existing documents lack an import-job relationship/status. New status must not reinterpret valid legacy documents; any backfill should be no-op or explicitly unknown.
- **Rollback:** Failed external object uploads and persisted document rows cannot be rolled back atomically. Rollback needs orphan reconciliation and a safe retry policy.
- **Change type:** Additive persisted data shape or new model; Sarah review required.
- **Sarah’s decision:** Decide whether optional Additional Docs require durable cross-session job state, or whether honest per-file UI retry using existing records is sufficient.

## 4. Server-backed command-center layout persistence

- **Proposed change:** Only if cross-device persistence is a product requirement, add an approved layout record keyed by organization/user/event/phase (or an equivalent existing model).
- **Why needed:** The live component stores layout in browser storage, while `PUT /api/events/:eventId/command-center/layout` returns sanitized data without persisting it. The current route is not a server persistence contract.
- **Affected records/workflows:** Event command center customization, account/device switching, role/phase defaults.
- **Authorization/isolation:** Layout records must be scoped to the current user and event organization; never trust a body-supplied role or event owner as authorization.
- **Migration/compatibility:** Existing browser layouts have no server record. Rollout needs precedence rules between local and server layouts and a safe fallback to phase defaults.
- **Rollback:** Remove server reads/writes and retain browser storage/default behavior; do not delete user layouts during rollback unless explicitly approved.
- **Change type:** Additive persisted data shape; Sarah review required.
- **Sarah’s decision:** Confirm whether server-backed/cross-device layout persistence is required. Slice 1A treats the current browser-local behavior as the live implementation and records the API mismatch only.

## 5. Durable idempotency for existing event-scoped imports

- **Proposed change:** Define a durable, event-scoped import identity/result policy for Matrix, Budget, Timeline, Directory, Attendee/registration, Speaker, and Marketing audience imports; use an approved ledger/key rather than request-local dedupe.
- **Why needed:** Matrix, Budget, and Timeline replay successful requests as new rows. Directory creates a new batch per retry; attendee and speaker outcomes are response-local. UI disabling cannot protect refreshes, network retries, concurrent tabs, or multiple instances.
- **Affected records/workflows:** MatrixRow, BudgetLineItem/Group, TimelineItem, EventDirectoryImportBatch/Row/Person/Role, EventAttendee/Registration, Speaker, MarketingAudienceRecipient, and EventActivity summaries.
- **Authorization implications:** Any result/key must be bound to the actor and target event; it must not expose a prior result to another member or organization.
- **Event-isolation implications:** Every key, lookup, and result must include the event (and organization through the event); never infer scope from a client-supplied record id alone.
- **Compatibility, migration, rollback:** Historical imports lack identity and cannot be safely backfilled. Additive rollout must tolerate legacy clients until retired; rollback must retain already-created records and ledger evidence rather than silently replay them.
- **Alternatives:** In-flight UI lock, local storage, request hash in memory, or heuristic content dedupe. None are durable or unambiguous.
- **Change type:** additive schema/persisted data and product policy; may require a ledger/index. **Sarah review required.**
- **Sarah’s decision:** Choose the canonical key scope, retention/result contract, retry UX, and whether exact-content replay is a no-op or a recoverable prior result.

## 6. Directory and attendee import failure/recovery semantics

**Directory aggregation decision implemented (Prompt 2):** module aggregation is an explicit, write-authorized, additive operation. Existing Directory people are reused only through an exact canonical module link; normalized email or name similarity never auto-merges identities. Ambiguous records remain distinct and `NEEDS_REVIEW` with a reported issue. Speaker, staff, and vendor roles remain exact, and migration `20260806120000_event_import_ledger` adds directory role `VENDOR`. The backfill is idempotent, never changes EventPerson IDs or source records, and leaves unmatched records unmatched. Attendee import recovery and any normalized-email uniqueness constraint remain undecided and are not changed by this decision.

- **Proposed change:** Decide whether to add durable attendee import batches/outcomes and whether directory batches need resumable recovery; separately define an event-local normalized-email invariant for directory people.
- **Why needed:** Directory processing can leave a persisted batch in PROCESSING after unexpected failure. Attendee import can partially apply with no batch/history. Non-unique normalized directory emails permit concurrent duplicate identities.
- **Affected records/workflows:** EventDirectoryImportBatch/Row, EventDirectoryPerson/Role/Source, EventAttendee, EventRegistrationRecord, and registration imports.
- **Authorization implications:** Batch/outcome reads must remain event-read scoped; resume/retry must be restricted to authorized editors and retain actor attribution.
- **Event-isolation implications:** Identity matching and any unique constraint must be keyed by event; the same email can legitimately appear in another event.
- **Compatibility, migration, rollback:** Existing duplicate normalized emails require detection and a merge/exemption policy before a unique constraint. New attendee batch data cannot truthfully reconstruct historical outcomes. Rollback must preserve imported people/participations and no longer offer unsafe resume.
- **Alternatives:** Mark an existing directory batch FAILED using its present status model (safe only as a narrow no-schema fix); response-only attendee summaries; no automatic resume.
- **Change type:** existing-data/migration risk; durable attendee history is additive schema. **Sarah review required.**
- **Sarah’s decision:** Approve the normalized identity business key and historical duplicate disposition, and decide whether attendee imports require durable batch/history and resumability.

## 7. Import provenance and post-close outcomes

- **Proposed change:** If product requires audit/recovery beyond existing EventActivity summaries and directory batches, add an approved import provenance/outcome model for non-directory imports and document upload completion.
- **Why needed:** Matrix/Budget/Timeline/Speaker/Attendee outcomes are mostly response-local; a dialog close or partial server failure cannot be reconstructed as a workflow result. Existing EventActivity is a summary feed, not row-level import state.
- **Affected records/workflows:** all import surfaces, EventActivity, document upload/finalization, and user-facing retry/error views.
- **Authorization implications:** provenance may contain sensitive CSV-derived data; minimize fields and restrict all access by event/organization.
- **Event-isolation implications:** records must be event-scoped, including event-builder results that create a new event.
- **Compatibility, migration, rollback:** Legacy imports have no provenance to backfill. Rollback must retain non-sensitive evidence or clearly hide only new outcome views; do not delete business data.
- **Alternatives:** Existing EventActivity summary, clear UI warnings, and mounted-dialog retry (the Slice 2 no-schema scope).
- **Change type:** additive schema/product workflow decision. **Sarah review required.**
- **Sarah’s decision:** Specify which imports require durable, user-visible outcomes versus summary-only activity, row-level retention, and privacy policy.

## 8. Matrix 2 staff-assignment persistence authority (Slice 3A blocker)

**Decision (Slice 4):** `SessionStaffAssignment` is canonical. A backwards-compatible migration copies only valid same-event legacy rows into it; existing canonical rows win conflicts. Runtime readers/writers no longer use `MatrixRowStaffAssignment`, which remains physically intact only for rollback until a later removal decision.

- **Observed incompatibility:** Prisma and migration `20260313120000_matrix2_session_operations` define `SessionStaffAssignment(sessionId, personId, role)` as the event-session staff model. The live Matrix 2 snapshot and PATCH runtime instead query and mutate `MatrixRowStaffAssignment(matrixRowId, eventPersonId, assignmentrole)` through raw SQL. That legacy table is not represented in `prisma/schema.prisma` and is not created by the reviewed migration.
- **Why a decision is required:** On a database built from the checked-in schema/migrations, Matrix 2 staff reads and edits can fail because the runtime table is absent. Where the legacy table exists, records in the schema-defined `SessionStaffAssignment` table are invisible to the Matrix 2 workspace. Changing the code to either representation without reconciling existing rows would make one set of persisted staff assignments disappear from the workflow.
- **Full-save impact:** Matrix 2 Basics/status save payloads currently include `staffAssignments`, so an edit that appears unrelated to staffing can delete/reinsert legacy staff rows. Omitting the field as a client workaround would create a second, implicit partial-save contract and can mask rather than resolve the authority conflict.
- **Affected records/workflows:** `MatrixRow`, `EventPerson`, `SessionStaffAssignment`, and legacy `MatrixRowStaffAssignment`; Matrix 2 session drawer, board/list snapshot, staff assignment edits, readiness display, and any reload after an edit.
- **Authorization and event isolation:** Current routes require event write access and service reads scope MatrixRow/EventPerson by `eventId`. The chosen canonical table and every conversion/read must retain the MatrixRow-to-Event join; staff IDs or assignment IDs alone must never authorize or cross event boundaries.
- **Alternatives:** (A) make runtime reads/writes use the Prisma/migration-defined `SessionStaffAssignment` table, with a reviewed migration/backfill for legacy rows; (B) reconcile legacy `MatrixRowStaffAssignment` data into `SessionStaffAssignment`, then remove compatibility access after verified parity; (C) declare the legacy table canonical and add its Prisma schema/migration/constraints intentionally. A temporary dual-read/dual-write adapter still needs an authority, precedence, dedupe, and rollback policy.
- **Compatibility and rollback:** Inventory both tables first, choose per-row conflict precedence, and preserve session/event IDs. Rollback must not delete either source of staff assignments; it should restore the prior reader only after a reversible, audited copy strategy.
- **Change type:** persisted-data and migration compatibility risk. No schema, migration, seed, relation, index, or staff persistence change is authorized pending review.
- **Implemented decision:** option B: reconcile valid legacy rows into `SessionStaffAssignment`, with existing canonical rows winning; Matrix GET no longer initializes templates.

## 9. Matrix 2 AV source of truth (Slice 4 blocker)

**Decision (Slice 4):** `SessionAVRequirement` is canonical. A backwards-compatible migration imports parsed legacy Matrix AV text only where a session has no structured AV rows; structured rows win conflicts. `MatrixRow.avNeeds`/`avNotes` are retained for rollback but are no longer runtime AV authorities.

- **Observed incompatibility:** Prisma and migration `20260313120000_matrix2_session_operations` define `SessionAVRequirement(sessionId, avType, quantity)`. Matrix 2 snapshot does not read that model: it reconstructs transient `legacy:` entries from `MatrixRow.avNeeds` and `MatrixRow.avNotes`; Matrix 2 PATCH writes AV input back to `MatrixRow.avNeeds`. Event Command Center, however, reads `SessionAVRequirement`.
- **Why a decision is required:** Matrix 2 and Command Center can disagree about the AV requirements for one session. Switching a reader or writer without reconciling existing legacy text and structured rows can hide requirements, overwrite history, or cause two active authorities.
- **Affected records/workflows:** `MatrixRow.avNeeds`, `MatrixRow.avNotes`, `SessionAVRequirement`, Matrix 2 AV drawer/snapshot/save/reload, and Event Command Center AV reporting.
- **Authorization and event isolation:** Current Matrix 2 mutation scopes the session by `{ id, eventId }`, and any chosen structured read/write must preserve a MatrixRow-to-Event join. AV requirement IDs alone must never authorize access or attach to a different event.
- **Alternatives:** (A) explicitly retain `MatrixRow.avNeeds` as canonical and align every consumer to it without creating structured AV persistence; (B) make `SessionAVRequirement` canonical with an approved migration/reconciliation from legacy text; (C) establish a temporary compatibility reader only with an approved precedence, dedupe, write, and retirement plan.
- **Compatibility and rollback:** Inventory legacy text and structured rows first; define parsing/quantity handling, per-session conflict precedence, and malformed-text disposition. Rollback must retain both representations until a verified reconciliation can be reversed.
- **Change type:** persisted-data authority and product workflow decision. No AV persistence change is authorized pending review.
- **Implemented decision:** option B: reconcile legacy AV text only where a session has no structured requirement; `SessionAVRequirement` is the sole runtime authority.

## 10. GET-time session requirement-template persistence (Slice 4 blocker)

**Decision (Slice 4):** GET is pure read. Event creation remains the standard initializer, and an explicit event-write POST initializes or repairs a template for historical events. A read-authorized user cannot create template rows, default sections/items, or repair the Event pointer.

- **Observed behavior:** Matrix snapshot GET and the direct session-requirement-template GET both call `ensureEventSessionRequirementTemplateTx`. When an event lacks a usable template, that helper can create a default template, add platform default sections/items, and update `Event.sessionRequirementTemplateId` inside a transaction.
- **Why a decision is required:** A read-authorized request has write side effects. Changing it to a pure read, preserving it as an implicit initializer, or moving initialization to an explicit command materially changes first-open behavior, retry/concurrency semantics, missing-template errors, and what a viewer can cause to persist.
- **Affected records/workflows:** `Event.sessionRequirementTemplateId`, `SessionRequirementTemplate`, `SessionRequirementSection`, `SessionRequirementItem`, Matrix 2 snapshot load, requirement-template GET, session readiness, and requirement-selection UI.
- **Authorization and event isolation:** Reads are event-read guarded today; all template lookup/create/update paths must remain event-scoped. If initialization becomes explicit, write authorization must be required and event IDs must be derived from the route rather than template/item IDs supplied by a client.
- **Alternatives:** (A) retain the current GET-time ensure contract and document/cover idempotency and concurrent first loads; (B) make GET pure-read and require an explicit event-write initialization flow; (C) provision templates at an approved event lifecycle point with a migration/repair policy for existing events.
- **Compatibility and rollback:** Inventory events with null, stale, or missing template pointers and templates missing platform defaults. Define which historical records are repaired, first-load errors/retries, concurrency behavior, and how rollback avoids removing templates created under the new policy.
- **Change type:** product workflow and persisted-data behavior decision. No GET-side-effect change, new durable template storage, or implicit workaround is authorized pending review.
- **Implemented decision:** option B: GET is pure read; an event-write POST initializes or repairs defaults explicitly and idempotently.

## 11. Development database repair for the canonical staff table (live Matrix blocker)

**Decision implemented:** Treat `web/prisma.config.ts` and `web/prisma/migrations` as the active application migration workflow. Restore the already-schema-defined `SessionStaffAssignment` table with the additive, idempotent `20260729140000_restore_session_staff_assignment` migration before the existing Slice 4 reconciliation migration.

- **Observed state:** `_prisma_migrations` recorded `20260313120000_matrix2_session_operations` as applied, but `public."SessionStaffAssignment"` did not exist. `SessionAVRequirement` and the legacy staff table did exist. The canonical Matrix reader consequently failed with Prisma P2021.
- **Affected records/workflows:** `SessionStaffAssignment`, `MatrixRow`, and `EventPerson`; Matrix/Run of Show snapshot, session editing, Command Center staffing, and post-room/post-session reload confirmation.
- **Safe migration path:** the repair creates the existing table only if absent, keeps its existing composite primary key, person index, and MatrixRow/EventPerson foreign keys, then lets `20260729150000_slice4_session_authorities` copy only valid same-event legacy rows without overwriting canonical rows. It does not use `db push`, reset, manual DDL outside Prisma, or a legacy runtime fallback.
- **Authorization/isolation:** no authorization contract changes. Runtime reads and writes retain event scope through the session’s `eventId`; the migration rejects legacy rows whose session and person are absent or belong to different events.
- **Deployment/rollback:** both migrations were applied successfully with `prisma migrate deploy` in the active workflow. Rollback is a runtime rollback only after review; do not drop the restored canonical table or the retained legacy data.
- **Sarah decision:** none required for this incident repair. It restores the checked-in model/migration contract. A separate future governance task should consolidate the duplicated root/web migration directories, but that is not a new product or persisted-data decision and is outside this bounded fix.

## 12. Development database repair for EventPersonRole (live Matrix P2023)

**Decision implemented:** restore the already-schema-defined `EventPersonRole` enum and normalize valid lower-case legacy role text into its canonical existing values.

- **Observed state:** `EventPerson.role` was physical `text` with valid `speaker` and `staff` values, and the `EventPersonRole` type was absent even though the base migration was recorded applied. Prisma relation decoding therefore failed with P2023 when `SessionStaffAssignment` included an EventPerson.
- **Affected records/workflows:** all `EventPerson` records and session staff assignments, Matrix/Run of Show snapshots, and Matrix event-person inserts. Valid staffing assignments are retained; no row is deleted.
- **Safe migration path:** `20260730120000_repair_event_person_role_enum` creates the existing enum only if absent, rejects an unexpected legacy role before changing data, drops the superseded text-only check, and converts `speaker`/`staff`/`vendor` to `SPEAKER`/`STAFF`/`VENDOR`. Raw Matrix writers now explicitly map supported roles and cast them to the canonical enum. No lowercase duplicate enum value is introduced.
- **P2028 relation:** the same incident found nested snapshot transactions. Snapshot reads now use non-transactional, event-scoped bounded parallel queries; write transactions remain in mutation services where atomicity is needed.
- **Sarah decision:** none required. This is repair of the intended schema contract. A future product decision would be required before persisting moderator or VIP as EventPerson roles because they are not schema-backed enum values.
