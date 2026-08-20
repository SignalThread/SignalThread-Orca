# Event Builder Additional Docs / Contract Intake Loop Prompts

## Working Context

This feature adds an optional **Additional Docs** path to Event Builder for contracts and supporting event documents.

This is **not** a replacement for the existing spreadsheet uploader/mapping flow.

The existing spreadsheet uploader remains the structured import path. Additional Docs is only for unstructured event documents such as:

- Contracts
- Hotel agreements
- Venue agreements
- BEOs
- AV proposals
- Addendums
- Decorator contracts
- Transportation agreements
- Insurance/compliance documents
- Speaker agreements

Only the Additional Docs / contract path needs AI extraction later.

Spreadsheet mapping should stay intact and should not be rebuilt, renamed, or forced through AI.

## Audit Findings To Preserve

Event Builder is centered in:

- `web/app/(shell)/events/_components/new-event-builder.tsx`
- mounted by `web/app/(shell)/events/new/page.tsx`

Current Event Builder steps:

- basics
- source
- mapping
- preview

The existing spreadsheet uploader/mapping path lives in:

- `web/app/(shell)/events/_components/new-event-builder.tsx`
- `web/lib/import/workbook.ts`
- `web/lib/event-import-builder.ts`
- `web/src/server/services/event-import-builder.ts`

Event creation currently happens at final submit through:

- `POST /api/events/import/create`
- `web/src/server/services/event-import-builder.ts`

The server creates Event plus structured spreadsheet imports atomically.

Docs Hub upload/versioning already exists and should be reused:

- `web/app/(shell)/events/[eventId]/docs/_components/event-docs-page.tsx`
- `web/app/api/events/[eventId]/documents/route.ts`
- `web/app/api/events/[eventId]/documents/presign/route.ts`
- `web/app/api/events/[eventId]/documents/[documentId]/finalize-upload/route.ts`
- `web/src/server/services/documents.ts`
- `web/src/server/storage/documents.ts`

Document storage is event-scoped and uses existing `Document` / `DocumentVersion` / category / tags / links models.

Pass 1 can avoid schema changes.

Additional Docs cannot truly save into Docs Hub before the event exists, because document routes, document records, categories, and object keys require `eventId`.

The safe flow is:

1. User configures event in Event Builder.
2. User optionally selects Additional Docs.
3. Final submit creates the event through the existing event import create path.
4. After `eventId` is returned, selected docs upload into Docs Hub using existing document draft / presign / finalize APIs.
5. If doc upload fails, keep the event and show a clear partial-failure/retry path.

## Global Rules For Every Prompt

- Keep the existing spreadsheet uploader/mapping flow intact.
- Do not rename the spreadsheet import flow to “Source Materials.”
- Use “Additional Docs” or equivalent clear copy for the contract/document path.
- Do not add AI to spreadsheet mapping.
- Do not automatically apply AI-extracted values to event modules.
- Do not silently overwrite event data.
- Do not create a second document repository outside Docs Hub.
- Do not duplicate document storage outside the existing document/version model.
- Do not add schema changes without an explicit schema proposal and migration review.
- Do not use JSON blobs for durable core extraction/review/source-attribution state unless explicitly reviewed and approved.
- Routes should stay thin: authenticate, authorize, validate, call canonical service, return structured response.
- All event-scoped document writes must enforce event write access server-side.
- All event-scoped reads must enforce event read access server-side.
- Preserve product-grade UX: clean hierarchy, obvious actions, useful empty/failure states, no database-shaped screens.

---

# Prompt 1 — Harden Docs Hub Upload Access Before Event Builder Uses It

```text
Model: GPT-5.5
Reasoning: High

Harden the existing Docs Hub document upload/versioning routes before exposing document upload from Event Builder.

Context:
The Event Builder Additional Docs feature will reuse the existing Docs Hub document repository and upload/versioning APIs. The audit found that the relevant Docs APIs already exist, but several Docs routes may not consistently call resolveRequestUser + assertEventAccessForUser before event-scoped reads/writes.

Do not implement Event Builder Additional Docs UI in this pass.
Do not add AI extraction.
Do not touch the spreadsheet uploader/mapping flow.
Do not change schema.
Do not create migrations.
Do not change document storage semantics.

Relevant files/routes from audit:
- web/app/api/events/[eventId]/documents/route.ts
- web/app/api/events/[eventId]/documents/presign/route.ts
- web/app/api/events/[eventId]/documents/[documentId]/finalize-upload/route.ts
- web/src/server/services/documents.ts
- web/src/server/storage/documents.ts
- web/lib/event-access.ts

Goal:
Ensure the existing event-scoped document create/presign/finalize upload path is safely authorized server-side and ready to be reused by Event Builder.

Requirements:
1. Audit and harden the existing Docs Hub upload-related routes.
2. Event document writes must require event write access.
3. Event document reads must require event read access where applicable.
4. Use the existing request-user and event-access helpers used elsewhere in the app.
5. Keep route handlers thin: authenticate, authorize, validate, call documents service, return structured response.
6. Do not move business logic into route handlers.
7. Preserve existing Docs Hub behavior and UI.
8. Preserve existing R2 object key and presign/finalize behavior.
9. Do not widen file types or storage constraints unless current code already supports them.
10. Do not introduce new document repository logic.

Tests:
Add focused regression coverage for:
- event document draft create requires write access
- document upload presign requires write access
- document finalize-upload requires write access
- read-only/viewer user cannot create/presign/finalize event docs
- authorized planner/admin can still upload through the existing Docs Hub path
- existing Docs Hub document versioning behavior still works

Validation:
Run targeted document route/service tests if available.
Run relevant docs regression tests.
Run npm typecheck from web.
Run git diff --check.

Output:
Return a concise summary of files changed, behavior changed, tests added, and validation results.
```

---

# Prompt 2 — Add Event Builder Additional Docs Upload To Docs Hub

```text
Model: GPT-5.5
Reasoning: High

Implement Event Builder Additional Docs upload as a sidecar to the existing Event Builder flow.

Context:
The Event Builder already has a spreadsheet uploader/mapping flow. Do not replace it, rename it, or rebuild it. Additional Docs is a separate optional area for contracts and supporting event documents.

Relevant files from audit:
- web/app/(shell)/events/_components/new-event-builder.tsx
- web/app/(shell)/events/new/page.tsx
- web/lib/import/workbook.ts
- web/lib/event-import-builder.ts
- web/src/server/services/event-import-builder.ts
- web/app/(shell)/events/[eventId]/docs/_components/event-docs-page.tsx
- web/app/api/events/[eventId]/documents/route.ts
- web/app/api/events/[eventId]/documents/presign/route.ts
- web/app/api/events/[eventId]/documents/[documentId]/finalize-upload/route.ts
- web/src/server/services/documents.ts
- web/src/server/storage/documents.ts

Do not add AI extraction in this pass.
Do not change schema.
Do not create migrations.
Do not touch spreadsheet parsing/mapping behavior.
Do not add new document storage systems.
Do not try to version-update existing docs in this pass.

Product behavior:
Add an optional section called “Additional Docs” to Event Builder.

Suggested placement:
Place it on the existing source step below the selected starting-point content, without disturbing the current spreadsheet upload/mapping path. Also summarize selected docs on the preview step.

Copy direction:
Use clear labels like:
- Additional Docs
- Contracts, BEOs, venue agreements, AV proposals, addendums
- Saved to Docs after event creation

Avoid renaming the whole step to “Source Materials.”

UX requirements:
- User can create an event without Additional Docs.
- User can select one or more Additional Docs.
- User can remove selected docs before create.
- User can optionally classify each file using existing document categories/tags where available.
- Preview step summarizes selected docs.
- After event creation succeeds, upload the selected docs into that event’s Docs Hub.
- If document upload succeeds, show a success notice.
- If document upload fails after event creation, keep the event valid and show a clear partial-failure message with a retry path through Docs Hub.
- Do not roll back the event if docs fail after creation.

Implementation requirements:
1. Reuse the existing event creation flow through /api/events/import/create.
2. After event creation returns eventId, upload selected docs using the existing Docs Hub sequence:
   - create document draft
   - request R2 presign
   - PUT file
   - finalize document upload
3. Avoid duplicating the Docs Hub upload sequence directly inside the builder if possible. Prefer a small reusable client helper such as web/lib/documents-upload-client.ts if that keeps the implementation cleaner.
4. Use existing document categories/tags. Do not add schema for custom document types in this pass.
5. Keep spreadsheet upload/mapping untouched and covered by regression tests.
6. Preserve the existing event import builder structured import behavior.
7. Do not block event creation on AI or post-create extraction.

Tests:
Add focused regression coverage for:
- create event without Additional Docs
- create event with one Additional Doc
- create event with multiple Additional Docs
- selected Additional Docs are summarized before create
- uploaded docs appear in the event Docs Hub after create
- Additional Docs use existing document/version upload path
- existing spreadsheet upload/mapping still works unchanged
- failed document upload does not break event creation and exposes retry/recovery copy
- viewer/read-only users cannot upload Additional Docs if they lack write access

Validation:
Run Event Builder regression tests.
Run Docs upload/versioning regression tests.
Run spreadsheet import regression tests.
Run npm typecheck from web.
Run git diff --check.

Output:
Return a concise summary of files changed, UI behavior, document upload flow, tests added, and validation results.
```

---

# Prompt 3 — Schema Proposal For Contract Extraction, Review, Dedupe, Version Updates, And Source Attribution

```text
Model: GPT-5.5
Reasoning: High

Create a schema proposal for the later Additional Docs AI extraction/review/dedupe/version-update feature.

This is a proposal-only pass.
Do not implement code.
Do not change schema.
Do not create migrations.
Do not modify Prisma files.
Do not add AI extraction.
Do not add routes.
Do not modify Event Builder.
Do not touch spreadsheet uploader/mapping.

Context:
Pass 1 saved Additional Docs into the existing Docs Hub. Later passes need AI extraction for unstructured contracts/docs, staged review, duplicate/conflict resolution, version comparisons, and source attribution back to document versions/pages.

Existing Docs Hub models already support document storage and versioning, but durable extraction/review/source-link state likely needs new normalized relational models.

Do not propose JSON blobs as the core durable model for extracted facts, review decisions, duplicate decisions, or source attribution unless you explicitly justify why a reviewed JSON shape is unavoidable.

Required proposal coverage:

1. DocumentExtractionRun
Purpose:
Track one extraction run for one event-scoped document version.

Include proposed fields for:
- id
- eventId
- documentId
- documentVersionId
- status
- startedAt
- completedAt
- createdByUserId
- provider/model metadata if needed
- error state
- retry support

2. DocumentExtractedFact
Purpose:
Store each structured fact extracted from a document version.

Include proposed fields for:
- id
- extractionRunId
- eventId
- documentId
- documentVersionId
- category
- targetModule
- normalizedKey
- displayLabel
- extracted value strategy
- confidence
- source page
- source text/snippet/page span if possible
- status

Address whether extracted values need typed columns, separate fact-type tables, or a reviewed structured value field.

3. ImportReviewItem
Purpose:
Represent a planner-reviewable proposed action before event data changes.

Include proposed fields for:
- id
- eventId
- sourceType
- sourceDocumentId
- sourceDocumentVersionId
- extractedFactId
- targetModule
- targetAction
- proposed label/value strategy
- matchedRecordType
- matchedRecordId
- duplicateStatus
- conflictStatus
- reviewStatus
- reviewedByUserId
- reviewedAt

4. AppliedSourceLink
Purpose:
Link applied event records back to the source document/version/fact.

Include proposed fields for:
- id
- eventId
- sourceDocumentId
- sourceDocumentVersionId
- extractedFactId
- targetRecordType
- targetRecordId
- appliedByUserId
- appliedAt

5. Version comparison support
Explain how a new DocumentVersion re-extraction compares against:
- prior version extracted facts
- current applied event data
- pending review items
- source links

6. Duplicate/conflict support
Explain how review items can store duplicate/conflict state for:
- rooms
- MatrixRow / Run of Show sessions
- budget commitments/line items
- timeline deadlines
- EventPerson/EventDirectoryPerson contacts
- document links

7. Migration plan
Include:
- migration order
- foreign keys
- indexes
- uniqueness constraints
- backfill considerations
- existing environments
- rollback/remediation notes

8. Access and tenancy
Explain event-scoped ownership and access enforcement expectations.

9. Tests
List required tests for:
- extraction run creation
- extracted fact creation
- review item lifecycle
- applied source links
- duplicate/conflict states
- document version re-extraction
- event scoping
- migration safety

10. Implementation split
Recommend how to split implementation after schema approval.

Output format:
Return a schema proposal document with sections:
- Summary
- Proposed Models
- Relationships
- State Machines
- Indexes/Constraints
- Migration Plan
- Rollback/Remediation
- Access/Tenancy
- Tests
- Open Questions
- Recommended Implementation Passes

Do not implement anything. Return the proposal only.
```

---

# Prompt 4 — Implement Approved Extraction Schema And Contract Extraction Service Foundation

```text
Model: GPT-5.5
Reasoning: High

Implement the approved extraction/review/source-attribution schema and the service foundation for AI extraction of Additional Docs.

Only run this prompt after the schema proposal has been reviewed and approved.

Do not touch the existing spreadsheet uploader/mapping flow.
Do not add AI to spreadsheets.
Do not automatically apply extracted values to event modules.
Do not silently overwrite event data.
Do not create a second document repository.
Do not bypass Docs Hub document/versioning.

Context:
Additional Docs are saved to Docs Hub. AI extraction should run only for unstructured docs/contracts, using document versions as the source.

Clean hook from audit:
AI extraction should hook after finalizeDocumentUpload creates a DocumentVersion in:
- web/src/server/services/documents.ts

The clean extraction input is:
- eventId
- documentId
- documentVersionId

Expected schema concepts from the approved proposal may include:
- DocumentExtractionRun
- DocumentExtractedFact
- ImportReviewItem
- AppliedSourceLink

Implementation goals:
1. Add approved Prisma schema/migration changes exactly as approved.
2. Keep both Prisma schema copies in sync if this repo requires it.
3. Run Prisma format/generate as required.
4. Add an extraction service boundary for unstructured Additional Docs.
5. Create extraction runs for document versions.
6. Store extracted facts as staged facts/review items.
7. Expose extraction status and failure state.
8. Do not apply facts to rooms, MatrixRow, budget, timeline, people, or documents yet.
9. Extraction failure must be recoverable and must not break Docs Hub.

Extraction behavior:
- Supported docs: contracts/PDFs/addendums/BEOs/AV proposals where current file text extraction supports it.
- Unsupported docs can remain saved in Docs Hub without extraction.
- Extraction result should include category, target module, proposed label/value, source page/snippet where possible, confidence, and warnings.
- Flag ambiguous multi-year/event-date docs for review instead of guessing.

AI boundaries:
- Put AI/provider logic behind a service boundary.
- Keep prompts and parsing deterministic where possible.
- Do not put provider-specific logic throughout routes/UI.
- Add clear error handling for failed extraction.

Routes:
If routes are needed, keep them thin:
- authenticate
- authorize event access
- validate input
- call extraction service
- return structured response

Tests:
Add focused regression coverage for:
- migration/model relationships
- extraction run can be created for a document version
- extracted facts are event-scoped
- extraction failure records error state
- unsupported docs do not break upload/docs flow
- extracted facts/review items do not directly mutate event modules
- viewer/read-only users cannot trigger write extraction actions if write access is required
- existing Docs Hub upload/versioning still works
- existing spreadsheet uploader/mapping still works unchanged

Validation:
Run Prisma format/generate if schema changed.
Run migration-related checks appropriate for this repo.
Run targeted extraction/docs tests.
Run Event Builder and Docs regression tests.
Run npm typecheck from web.
Run git diff --check.

Output:
Return a concise summary of schema files/migrations changed, services/routes changed, tests added, and validation results.
```

---

# Prompt 5 — Build Import Review UI And Apply/Edit/Skip Flow For Extracted Contract Facts

```text
Model: GPT-5.5
Reasoning: High

Build the Import Review UI and apply flow for AI-extracted Additional Docs facts.

Do not touch the existing spreadsheet uploader/mapping flow except where absolutely necessary to keep review state consistent.
Do not add AI to spreadsheets.
Do not automatically apply extracted values.
Do not silently overwrite event data.
Do not build full duplicate/conflict resolution yet beyond basic exact-match safety.
Do not build document version re-extraction/update comparisons yet.

Context:
Additional Docs are saved to Docs Hub. Extraction runs create staged extracted facts/review items. Planners now need a product-grade review screen to apply, edit/apply, skip, or flag extracted facts.

Product goal:
A planner should understand:
- what file produced the suggestion
- what the system found
- what event module would change
- whether anything already exists
- what will happen if they apply it
- where the value came from

UX language:
Use plain labels like:
- Extracted setup
- Needs review
- Source document
- Apply
- Edit and apply
- Skip
- Flag conflict

Avoid raw AI/model language in the planner-facing UI.

Initial target modules:
- Rooms / venue-related room records where current model supports it
- Run of Show MatrixRow seeds
- Budget commitments/line items where current services support it
- Timeline deadlines
- Document/risk note/link behavior only where current model supports it safely

Implementation requirements:
1. Add an Import Review surface reachable from the Event Builder post-create flow and/or event Docs Hub.
2. Show pending review items for Additional Docs extraction.
3. Show source document/version/page/snippet where available.
4. Add actions:
   - Apply
   - Edit and apply
   - Skip
   - Flag conflict
5. Applying must call canonical services for the target module where available.
6. Applying must require event write access server-side.
7. Applying must create AppliedSourceLink/source attribution.
8. Applying the same item twice must be idempotent or safely rejected.
9. Skipping/flagging must update review state without mutating event modules.
10. UI must refresh review state after actions.
11. Do not create database-shaped screens; this should feel like a planner review workflow.

Source attribution:
Applied event records should be traceable back to:
- documentId
- documentVersionId
- extractedFactId/reviewItemId
- page/snippet where available
- appliedByUserId
- appliedAt

Tests:
Add focused regression coverage for:
- review items render as pending suggestions
- apply creates/updates target record through canonical path
- edit and apply uses edited value
- skip updates review state without event mutation
- flag conflict updates review state without event mutation
- event write access is required for apply/edit/skip/flag where appropriate
- applied item records source attribution
- applying the same item twice is safe
- existing spreadsheet uploader/mapping still works unchanged
- Docs Hub upload/versioning still works

Validation:
Run targeted extraction/review tests.
Run target module service tests for any modules touched.
Run Event Builder and Docs regression tests.
Run npm typecheck from web.
Run git diff --check.

Output:
Return a concise summary of UI/files/routes/services changed, target modules supported, tests added, and validation results.
```

---

# Prompt 6 — Add Duplicate/Conflict Resolution And Document Version Re-Extraction Updates

```text
Model: GPT-5.5
Reasoning: High

Add deterministic duplicate/conflict resolution and document version re-extraction update suggestions for Additional Docs contract intake.

Do not rebuild spreadsheet uploader/mapping.
Do not add AI to spreadsheet mapping.
Do not silently overwrite event data.
Do not automatically merge or update records without planner review.
Do not create a second document repository.

Context:
Additional Docs upload to Docs Hub works. AI extraction creates staged review items. Import Review can apply/edit/skip/flag. Now add duplicate/conflict detection and new-document-version change review.

Product goal:
When a contract extraction overlaps with existing event data or spreadsheet-imported data, the planner should see possible duplicates before applying.

When a revised contract is uploaded as a new DocumentVersion, the planner should see what changed and choose whether to update the event.

Duplicate/conflict matching should be deterministic product logic, not pure AI.

Duplicate checks should compare extracted/review items against:
- existing event records
- pending review items
- applied source links
- pending spreadsheet import data if accessible without disrupting the spreadsheet flow
- prior extraction runs for the same document/document version lineage

Target duplicate areas:
1. Venue / room
Compare:
- normalized room name
- venue/name text similarity where available
- capacity
- setup

2. Run of Show / MatrixRow
Compare:
- title
- date
- start/end time
- room
- setup
- expected attendance/capacity

3. Budget
Compare:
- category
- description
- amount
- vendor/source
- date/year

4. Timeline
Compare:
- title
- due date
- category
- source document

5. Contacts/people
Compare:
- email as strongest match
- name
- company
- role
- EventPerson/EventDirectoryPerson model fit

Review actions:
For possible duplicates/conflicts, support:
- Use existing
- Merge/update existing
- Create new anyway
- Skip
- Flag conflict

High-confidence exact matches may be preselected as “use existing,” but planner must still confirm before updating or applying.

Document version re-extraction behavior:
1. User uploads a new version of an existing document in Docs Hub.
2. System creates a new DocumentVersion using existing versioning behavior.
3. Extraction runs for the new version.
4. Compare new facts against:
   - prior version extracted facts
   - current applied event values
   - pending review items
   - AppliedSourceLink records
5. Show changed values to the planner.
6. Planner chooses:
   - Update event
   - Keep current value
   - Skip
   - Flag conflict
7. No silent overwrites.

Examples:
- Old contract version says cutoff date Apr 14.
- New version says cutoff date Apr 10.
- Review shows changed cutoff date and lets planner update or keep existing.

Implementation requirements:
1. Add duplicate/conflict matching service boundaries.
2. Store duplicate/conflict status on review items using the approved schema.
3. Keep matching scoped to eventId.
4. Keep routes thin and server-authorized.
5. Make conflict resolution actions idempotent or safely reject repeats.
6. Keep spreadsheet uploader untouched; only read pending spreadsheet import state if already available and safe.
7. Keep UI compact and clear.

Tests:
Add focused regression coverage for:
- duplicate room detected
- duplicate MatrixRow/session detected
- duplicate budget commitment/line item detected
- duplicate timeline deadline detected
- contact/person duplicate detected where supported
- contract vs spreadsheet duplicate detected where pending spreadsheet data is available
- use-existing does not create duplicate records
- merge/update existing does not create duplicate records
- create-new intentionally creates a separate record
- upload new document version triggers new extraction run
- changed facts are detected across document versions
- unchanged facts are not duplicated
- updating event value from new version requires review
- updated applied value links to new document version/source attribution
- no silent overwrite occurs
- existing Event Builder spreadsheet mapping still works unchanged
- Docs Hub versioning still works

Validation:
Run duplicate/conflict service tests.
Run document versioning/extraction tests.
Run Import Review UI tests.
Run Event Builder spreadsheet non-regression tests.
Run Docs Hub regression tests.
Run npm typecheck from web.
Run git diff --check.

Output:
Return a concise summary of duplicate/version behavior, files changed, tests added, and validation results.
```

---

# Recommended Loop Order

Use the prompts in this order:

1. Prompt 1 — Harden Docs Hub upload access
2. Prompt 2 — Add Event Builder Additional Docs upload to Docs Hub
3. Prompt 3 — Schema proposal for extraction/review/source attribution
4. Prompt 4 — Implement approved extraction schema and extraction service foundation
5. Prompt 5 — Build Import Review UI and apply/edit/skip flow
6. Prompt 6 — Add duplicate/conflict resolution and document version re-extraction updates

Ship Prompts 1–2 as V1 before starting AI extraction.

Prompts 3–6 are the next loop after V1 is stable.

