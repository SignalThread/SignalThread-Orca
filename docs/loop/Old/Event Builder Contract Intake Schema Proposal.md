# Schema Proposal — Additional Docs Contract Extraction, Review, Dedupe, Version Updates, Source Attribution

Status: **Proposal only.** No schema, Prisma, or migration changes are made by this document. Implementation (Prompt 4) must not begin until this proposal is reviewed and approved.

Scope grounding: model names, id types (`String @db.Uuid`), and relations below follow the existing repo conventions in `web/prisma/schema.prisma` (mirrored in `prisma/schema.prisma`). Target modules referenced for apply/dedupe are the real canonical models: `Room`, `MatrixRow`, `BudgetLineItem` (scoped via `Budget` → `eventId`), `Deadline`, `EventPerson` / `EventDirectoryPerson`, and `DocumentLink`.

---

## 1. Summary

Pass 1 (Prompts 1–2) saves Additional Docs into the existing Docs Hub (`Document` / `DocumentVersion`). The next loop needs durable, normalized state for:

- **Extraction runs** — one AI extraction attempt against one event-scoped `DocumentVersion`.
- **Extracted facts** — structured operational facts produced by a run, each targeting a module.
- **Review items** — planner-reviewable proposed actions (apply / edit / use-existing / merge / skip / flag), carrying duplicate/conflict state.
- **Applied source links** — provenance from an applied event record back to the document/version/page/fact and the user who applied it.

Four new relational models are proposed: `DocumentExtractionRun`, `DocumentExtractedFact`, `ImportReviewItem`, `AppliedSourceLink`, plus supporting enums. All are event-scoped (`eventId @db.Uuid`) and hang off the existing `Document` / `DocumentVersion` lineage. No existing model is altered destructively; only additive back-relations are added to `Event`, `Document`, `DocumentVersion`, and `User`.

**Extracted-value strategy (decision):** use **typed scalar columns** for the canonical, comparable value (`valueText`, `valueNumericCents`, `valueDate`, `valueTime`) plus a **constrained, non-authoritative `payload Json`** for composite, module-shaped proposals (e.g., a room-block night-by-night breakdown) that have no single scalar. The scalar columns — not JSON — are the dedupe/comparison source of truth. JSON is justified only as a render/apply convenience payload, never as the field that deterministic matching reads. This satisfies the plan's "no JSON blobs for core relational state" rule while avoiding an explosion of fact-type tables in V1. See Open Questions for the alternative (per-fact-type tables).

---

## 2. Proposed Models

> Field lists are the proposal. Exact `@db` attributes follow repo conventions (`@id @default(uuid()) @db.Uuid`, `DateTime @default(now())`, `@updatedAt`).

### 2.1 DocumentExtractionRun

One AI extraction attempt for one document version. Re-running (including version re-extraction) creates a new row.

| Field | Type | Notes |
|---|---|---|
| id | String @db.Uuid PK | |
| eventId | String @db.Uuid | FK → Event |
| documentId | String @db.Uuid | FK → Document |
| documentVersionId | String @db.Uuid | FK → DocumentVersion (the extraction input) |
| status | ExtractionRunStatus | PENDING / RUNNING / SUCCEEDED / FAILED / SKIPPED_UNSUPPORTED |
| trigger | ExtractionTrigger | EVENT_BUILDER / DOCS_HUB / VERSION_REEXTRACTION |
| provider | String? | e.g. "anthropic" (nullable; provider-agnostic) |
| model | String? | e.g. model id used |
| promptVersion | String? | internal prompt/parser version for reproducibility |
| factCount | Int @default(0) | denormalized convenience count |
| error | String? @db.Text | failure reason when status=FAILED |
| attempt | Int @default(1) | retry counter for the (documentVersionId) lineage |
| startedAt | DateTime? | |
| completedAt | DateTime? | |
| createdByUserId | String? @db.Uuid | FK → User (nullable for system/automated runs) |
| createdAt / updatedAt | DateTime | |

Relations: `event`, `document`, `documentVersion`, `createdByUser?`, `facts DocumentExtractedFact[]`.

### 2.2 DocumentExtractedFact

One structured fact from a run. Immutable record of what extraction produced (planner edits live on the review item, not here).

| Field | Type | Notes |
|---|---|---|
| id | String @db.Uuid PK | |
| extractionRunId | String @db.Uuid | FK → DocumentExtractionRun |
| eventId | String @db.Uuid | FK → Event (denormalized for event-scoped queries/indexes) |
| documentId | String @db.Uuid | FK → Document |
| documentVersionId | String @db.Uuid | FK → DocumentVersion |
| category | ExtractedFactCategory | EVENT_SETUP / ROOMS / RUN_OF_SHOW / BUDGET / TIMELINE / HOUSING / OPERATIONAL_NOTE |
| targetModule | ExtractTargetModule | VENUE_ROOM / MATRIX_ROW / BUDGET_LINE / TIMELINE_DEADLINE / CONTACT / DOCUMENT_NOTE |
| normalizedKey | String @db.Text | stable comparison key, e.g. `budget:fnb_minimum`, `timeline:cutoff_date` |
| displayLabel | String @db.Text | planner-facing label, e.g. "F&B Minimum" |
| valueText | String? @db.Text | canonical text value (names, addresses, notes) |
| valueNumericCents | Int? | money normalized to cents (matches BudgetLineItem `*Cents`) |
| valueNumeric | Int? | non-money integers (capacity, room counts) |
| valueDate | DateTime? @db.Date | dates (cutoff, deposit due) |
| valueTime | DateTime? @db.Time(6) | start/end times (matches MatrixRow time cols) |
| payload | Json? | composite proposals only (e.g. room-block nights). Non-authoritative. |
| confidence | ExtractionConfidence | HIGH / MEDIUM / LOW (planner-facing as "Needs review" etc.) |
| sourcePage | Int? | 1-based page if known |
| sourceSnippet | String? @db.Text | short quoted span for provenance display |
| ambiguityFlag | Boolean @default(false) | true for multi-year / event-date ambiguity → force review |
| status | ExtractedFactStatus | PENDING / REVIEWED / SUPERSEDED (by a newer version's fact) |
| createdAt / updatedAt | DateTime | |

Relations: `extractionRun`, `event`, `document`, `documentVersion`, `reviewItem ImportReviewItem?` (1:0..1).

### 2.3 ImportReviewItem

A planner-reviewable proposed action. This is where edits, duplicate/conflict status, and the review lifecycle live. Source-agnostic so spreadsheet imports can feed the same layer later (`sourceType`).

| Field | Type | Notes |
|---|---|---|
| id | String @db.Uuid PK | |
| eventId | String @db.Uuid | FK → Event |
| sourceType | ImportSourceType | CONTRACT_EXTRACTION / SPREADSHEET_IMPORT (future) |
| sourceDocumentId | String? @db.Uuid | FK → Document (null for non-doc sources) |
| sourceDocumentVersionId | String? @db.Uuid | FK → DocumentVersion |
| extractedFactId | String? @db.Uuid | FK → DocumentExtractedFact (unique; null for non-extraction sources) |
| targetModule | ExtractTargetModule | same enum as fact |
| targetAction | ReviewTargetAction | CREATE / UPDATE / LINK / NOTE |
| proposedLabel | String @db.Text | editable copy of fact displayLabel |
| proposedValueText / proposedValueNumericCents / proposedValueNumeric / proposedValueDate / proposedValueTime | mirror of fact value columns | planner-edited value used at apply time |
| proposedPayload | Json? | composite, mirrors fact.payload when edited |
| matchedRecordType | MatchedRecordType? | ROOM / MATRIX_ROW / BUDGET_LINE / DEADLINE / EVENT_PERSON / EVENT_DIRECTORY_PERSON / DOCUMENT |
| matchedRecordId | String? @db.Uuid | candidate existing record (not an enforced FK — see note) |
| duplicateStatus | DuplicateStatus | NONE / POSSIBLE / LIKELY / EXACT |
| conflictStatus | ConflictStatus | NONE / VALUE_CONFLICT / FLAGGED |
| reviewStatus | ReviewStatus | PENDING / APPLIED / SKIPPED / FLAGGED / USED_EXISTING / MERGED |
| reviewedByUserId | String? @db.Uuid | FK → User |
| reviewedAt | DateTime? | |
| appliedSourceLinkId | String? @db.Uuid | FK → AppliedSourceLink set when applied |
| createdAt / updatedAt | DateTime | |

`matchedRecordId` is intentionally a polymorphic id (resolved by `matchedRecordType`), not a hard FK, because it can point at six different tables. Existence is validated in the service at read/apply time. (See Open Questions for the typed-join-table alternative.)

### 2.4 AppliedSourceLink

Provenance from an applied event record back to the source document/version/fact.

| Field | Type | Notes |
|---|---|---|
| id | String @db.Uuid PK | |
| eventId | String @db.Uuid | FK → Event |
| sourceDocumentId | String @db.Uuid | FK → Document |
| sourceDocumentVersionId | String @db.Uuid | FK → DocumentVersion (the version that produced the applied value) |
| extractedFactId | String? @db.Uuid | FK → DocumentExtractedFact |
| reviewItemId | String? @db.Uuid | FK → ImportReviewItem |
| targetRecordType | AppliedTargetType | ROOM / MATRIX_ROW / BUDGET_LINE / DEADLINE / EVENT_PERSON / EVENT_DIRECTORY_PERSON / DOCUMENT |
| targetRecordId | String @db.Uuid | the created/updated canonical record |
| sourcePage | Int? | copied from fact for fast display |
| appliedByUserId | String @db.Uuid | FK → User |
| appliedAt | DateTime @default(now()) | |

Answers "where did this number/date/requirement come from?" via `(targetRecordType, targetRecordId)` → document/version/page.

### 2.5 Enums (new)

`ExtractionRunStatus`, `ExtractionTrigger`, `ExtractedFactCategory`, `ExtractTargetModule`, `ExtractionConfidence`, `ExtractedFactStatus`, `ImportSourceType`, `ReviewTargetAction`, `MatchedRecordType`, `DuplicateStatus`, `ConflictStatus`, `ReviewStatus`, `AppliedTargetType`. Values listed inline above.

---

## 3. Relationships

```
Event 1───* DocumentExtractionRun *───1 DocumentVersion
                     │ 1
                     │
                     * DocumentExtractedFact 1───0..1 ImportReviewItem 0..1───1 AppliedSourceLink
Document 1───* DocumentExtractionRun / DocumentExtractedFact / AppliedSourceLink
DocumentVersion 1───* (run, fact, appliedSourceLink)
User 1───* (run.createdBy, reviewItem.reviewedBy, appliedSourceLink.appliedBy)
```

- A `DocumentExtractionRun` has many `DocumentExtractedFact`.
- Each `DocumentExtractedFact` has at most one `ImportReviewItem` (created when the fact enters the queue).
- Applying a review item creates exactly one `AppliedSourceLink` and back-references it (`appliedSourceLinkId`).
- Additive back-relations on existing models: `Event.documentExtractionRuns[]`, `Document.extractionRuns[]`, `DocumentVersion.extractionRuns[]/extractedFacts[]`, `User.appliedSourceLinks[]`, etc. These are non-breaking.

---

## 4. State Machines

**ExtractionRun.status:** `PENDING → RUNNING → (SUCCEEDED | FAILED)`. `SKIPPED_UNSUPPORTED` is terminal for docs whose text cannot be extracted. `FAILED` is retryable → new run row with `attempt+1` (the failed row is preserved for audit).

**ExtractedFact.status:** `PENDING → REVIEWED`. When a newer version's fact supersedes it (same `normalizedKey`, newer `documentVersion`), prior fact → `SUPERSEDED` (never deleted).

**ImportReviewItem.reviewStatus:**
```
PENDING ──apply──────────► APPLIED        (creates AppliedSourceLink + canonical write)
PENDING ──edit+apply─────► APPLIED        (uses proposed* edited values)
PENDING ──use existing───► USED_EXISTING  (links to matchedRecordId, no new record)
PENDING ──merge──────────► MERGED         (updates matchedRecordId, AppliedSourceLink)
PENDING ──skip───────────► SKIPPED        (no event mutation)
PENDING ──flag───────────► FLAGGED        (no event mutation)
```
Terminal states are idempotent: re-applying an already-APPLIED/USED_EXISTING/MERGED item is a safe no-op (returns the existing `AppliedSourceLink`). Transitions from a terminal state are rejected with a 409-style service error.

---

## 5. Indexes / Constraints

- `DocumentExtractionRun`: `@@index([eventId])`, `@@index([documentVersionId, attempt])`, `@@index([documentId, status])`.
- `DocumentExtractedFact`: `@@index([eventId, targetModule])`, `@@index([documentVersionId])`, `@@index([extractionRunId])`, `@@index([eventId, normalizedKey])` (drives version comparison).
- `ImportReviewItem`: `@@unique([extractedFactId])` (one review item per fact), `@@index([eventId, reviewStatus])`, `@@index([eventId, targetModule, duplicateStatus])`, `@@index([matchedRecordType, matchedRecordId])`.
- `AppliedSourceLink`: `@@index([eventId])`, `@@index([targetRecordType, targetRecordId])` (provenance lookup), `@@index([sourceDocumentVersionId])`. Consider `@@unique([reviewItemId])` so an applied item maps to exactly one link.
- Foreign keys mirror existing `onDelete` conventions. Document/version FKs use the default (restrict) to preserve provenance; cascade is **not** proposed for facts/links because losing provenance on document delete is undesirable — handle document deletion explicitly (see Rollback/Remediation).

---

## 6. Migration Plan

1. **Single additive migration** introducing all four tables + enums + back-relation fields. No data backfill required (these are net-new; Pass 1 docs simply have no runs yet).
2. Migration order within the file: create enums → create `DocumentExtractionRun` → `DocumentExtractedFact` → `ImportReviewItem` → `AppliedSourceLink` (respects FK dependency order).
3. Update **both** schema copies (`web/prisma/schema.prisma` and `prisma/schema.prisma`) and run `prisma format` + `prisma generate` per repo workflow (`postinstall` runs generate).
4. Production-safe: all new tables, all new columns on existing tables are additive and nullable where they must be. No column drops, renames, or type changes on existing models.
5. Existing environments: deploy migration before code that reads/writes the new tables; the Pass 1–2 upload path is unaffected and continues to work with zero extraction rows.

---

## 7. Rollback / Remediation

- **Rollback:** because the migration is purely additive, rollback = drop the four tables + enums (down migration). No existing data is touched, so rollback is safe as long as no code references the tables (deploy code after migration; roll back code before migration).
- **Document/version deletion:** since FKs are restrict-by-default, deleting a `Document`/`DocumentVersion` that has extraction rows must first soft-handle dependents. Proposed remediation: a service routine that, on document delete, either blocks (if applied links exist) or marks runs/facts `SUPERSEDED` and nulls optional review links — never silently cascades away provenance. Decide policy at implementation (Open Question O3).
- **Bad extraction run:** a `FAILED`/erroneous run is corrected by a new run; old facts can be marked `SUPERSEDED`. No destructive cleanup needed.

---

## 8. Access / Tenancy

- Every new table carries `eventId`; all reads/writes go through the canonical `resolveRequestUser` + `assertEventAccessForUser` helpers (read for viewing the review queue, **write** for triggering extraction, applying, editing, skipping, flagging, merging).
- Apply actions additionally enforce write access on the **target module's** canonical service (e.g., creating a `MatrixRow`/`Deadline`/`BudgetLineItem` goes through that module's existing service, which already enforces event access).
- No cross-event reads: dedupe/version-compare queries are always filtered by `eventId`. `matchedRecordId` candidates are resolved only within the same event.
- Org scoping inherits from `Event.orgId` via the access helper; no separate org column is required on the new tables (consistent with `DocumentCategory`, which is event-scoped).

---

## 9. Tests (required when implemented)

- Migration applies cleanly; both schema copies in sync; `prisma generate` succeeds.
- ExtractionRun: created for a document version; `FAILED` records error; retry creates a new attempt row.
- ExtractedFact: event-scoped; value columns populated by type; `payload` only for composite facts; ambiguity flag set for multi-year docs.
- ReviewItem lifecycle: PENDING→APPLIED creates AppliedSourceLink + canonical record; edit+apply uses `proposed*`; skip/flag mutate no event data; terminal transitions rejected; re-apply idempotent.
- AppliedSourceLink: created on apply; provenance lookup by `(targetRecordType, targetRecordId)` returns document/version/page.
- Duplicate/conflict: room/session/budget/deadline/contact matches set `duplicateStatus`; contract-vs-existing and contract-vs-pending-spreadsheet detection.
- Version re-extraction: new version → new run; changed facts detected via `normalizedKey`; unchanged not duplicated; prior facts `SUPERSEDED`; updated applied value re-links to new version; no silent overwrite.
- Access: viewer cannot trigger extraction/apply; all new routes thin + server-authorized; event scoping enforced.
- Non-regression: Pass 1–2 upload, Docs Hub versioning, and spreadsheet mapping unchanged.

---

## 10. Open Questions

- **O1 — Extracted value strategy.** Recommended hybrid (typed scalar columns + non-authoritative `payload Json`). Alternative: per-fact-type child tables (e.g., `ExtractedRoomBlockNight`). Hybrid is leaner for V1 and keeps deterministic matching on scalar columns; per-type tables are more normalized but heavier. **Approve hybrid?**
- **O2 — `matchedRecordId` polymorphism.** Proposed as `(matchedRecordType, matchedRecordId)` resolved in-service vs. separate nullable typed FKs per target. Polymorphic is simpler given six targets; typed FKs give referential integrity. **Which?**
- **O3 — Document deletion policy** for documents with applied provenance (block vs. supersede-and-null). **Confirm policy.**
- **O4 — Spreadsheet source in the same review layer now or later.** `sourceType` is included so the layer is source-agnostic, but Prompt 5 builds contract review only. Confirm we keep `SPREADSHEET_IMPORT` as a reserved-but-unused value for V-next.
- **O5 — Provider/model metadata depth.** Minimal columns proposed (`provider`, `model`, `promptVersion`). Confirm no PII/raw-prompt storage is desired (plan says avoid raw prompt output in planner UI; we also avoid persisting full prompts).

---

## 11. Recommended Implementation Passes (after approval)

- **Pass 4a — Schema + generate.** Add the four models/enums to both schema copies, one additive migration, `prisma generate`, model-relationship tests. No behavior yet.
- **Pass 4b — Extraction service boundary.** `extraction` service: create run after `finalizeDocumentUpload`, parse document version text, write facts + PENDING review items. Provider logic isolated behind the service. Status/failure surfaced. No event writes. (Prompt 4.)
- **Pass 5 — Import Review UI + apply/edit/skip/flag.** Review surface; apply through canonical module services; create `AppliedSourceLink`; idempotency. (Prompt 5.)
- **Pass 6 — Dedupe + version re-extraction.** Deterministic matchers per module; `duplicateStatus`/`conflictStatus`; new-version comparison via `normalizedKey`; update-or-keep with no silent overwrite. (Prompt 6.)

---

*End of proposal. Awaiting review/approval before Prompt 4.*
