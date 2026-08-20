# Event Builder Additional Docs / Contract Intake Plan

## Product Goal

Add an optional **Additional Docs** upload flow to Event Builder so planners can upload contracts and supporting event documents during event creation.

These files should be saved into the event’s existing Docs Hub, versioned through the existing document/version system, and optionally processed by AI to extract operational event facts for review.

This is not a replacement for the existing spreadsheet uploader.

## Product Rule

Spreadsheets are structured imports.

Contracts and supporting PDFs are unstructured document intake.

The existing spreadsheet uploader/mapping flow remains the spreadsheet path.

The new Additional Docs flow handles files like:

- Hotel contracts
- Venue agreements
- BEOs
- AV proposals
- Addendums
- Decorator contracts
- Transportation agreements
- Insurance/compliance documents
- Speaker agreements

Only the unstructured document/contract path needs AI extraction.

Spreadsheet mapping should not be rebuilt or forced through AI in this pass. AI can later suggest spreadsheet mappings if useful, but it should not become the source of truth for spreadsheets.

## Desired Event Builder Experience

In Event Builder, add an optional section called:

**Additional Docs**

Helper copy:

“Upload contracts, BEOs, venue agreements, AV proposals, or addendums. We’ll save them to Docs and can extract event setup details for review.”

The existing spreadsheet uploader stays where it is today.

The Additional Docs area should support:

- Upload one or more files.
- Classify each file manually or automatically.
- Save each file into the event’s Docs Hub.
- After event creation, show extracted suggestions if AI extraction is enabled.
- Allow planner to review suggestions before anything updates event data.

Event creation should stay fast. The user should not be blocked by extraction.

## High-Level Flow

1. Planner creates event basics.
2. Planner optionally uploads additional docs.
3. Event is created.
4. Uploaded docs are saved to the event’s Docs Hub.
5. AI extraction runs for supported docs.
6. Extracted facts become staged suggestions.
7. Planner reviews suggestions.
8. Planner applies, edits, skips, merges, or flags items.
9. Applied items update event modules.
10. Source attribution links applied values back to the document/version/page.

## Docs Hub Relationship

Docs Hub is the permanent home for all uploaded files.

Event Builder is only the first entry point.

After event creation, the same document intake and extraction flow should be available from Docs Hub.

If a planner uploads a revised contract later, it should be added as a new version of the existing document, not as an unrelated file unless the planner chooses that.

## Version Update Flow

When a new version is uploaded:

1. Save the new file as a new DocumentVersion.
2. Re-run extraction.
3. Compare new extracted facts against:
   - prior version extracted facts
   - current applied event data
   - pending import review items
4. Show changed values to the planner.
5. Planner chooses:
   - Update event
   - Keep current value
   - Skip
   - Flag conflict

No event data should be silently overwritten.

## AI Extraction Scope

AI extraction should focus on event-operational facts, not legal interpretation.

Supported extracted fact categories:

### Event Setup

- Event name
- Venue name
- Venue address
- Event dates
- Group/client name
- Hotel/venue contacts
- Planner/agency contacts

### Rooms / Function Space

- Function room names
- Room setup
- Capacity / AGR
- Rental fee
- Meeting date
- Start/end time

### Run of Show Seeds

- Meeting/session name
- Date
- Start/end time
- Room
- Setup
- Expected attendance/capacity

### Budget Commitments

- Room revenue commitment
- F&B minimum / banquet commitment
- Rental fees
- Taxes
- Service charge
- Admin fee
- Gratuity
- Deposits
- Cancellation charges

### Timeline / Deadlines

- Reservation cutoff date
- Rooming list due date
- Deposit due dates
- Final prepayment due date
- Cancellation windows
- Insurance certificate due dates
- Other operational deadlines

### Housing / Room Block

- Room block dates
- Room counts by night
- Rates
- Room type
- Commission
- Attrition terms
- Pickup threshold

### Operational Notes / Risks

- Attrition clauses
- Cancellation terms
- Relocation/walk policy
- Renovation notices
- Staffing requirements
- AV inclusions
- Insurance requirements
- ADA/compliance obligations
- Non-compete/vendor restrictions
- Permits/licenses

## Review Queue

All AI-extracted facts should go into a review queue.

They should not automatically write to event modules.

Each review item should show:

- Extracted value
- Target module
- Confidence
- Source document
- Source version
- Page number if available
- Existing matching event record if found
- Duplicate/conflict warning if applicable

Actions:

- Apply
- Edit and apply
- Use existing
- Merge
- Skip
- Flag conflict

## Duplicate and Conflict Checking

Before applying extracted facts, compare against existing event data and pending spreadsheet imports.

Duplicate matching should be module-specific.

### Venue Matching

Compare:

- venue name
- address
- city/state
- normalized text similarity

Example:

Contract says “Riggs Washington DC.”

Existing event venue says “Riggs DC.”

Show as likely match.

### Room Matching

Compare:

- room name
- venue
- capacity
- setup

Example:

Contract says “Atrium Buyout.”

Spreadsheet or existing room says “Atrium.”

Show as possible match.

### Session / Run of Show Matching

Compare:

- title
- date
- start/end time
- room
- setup
- expected attendance

Example:

Contract says “Meeting, 9:00 AM–5:00 PM, Atrium Buyout.”

Spreadsheet says “Main Meeting, 9:00 AM–5:00 PM, Atrium.”

Show as possible duplicate.

### Budget Matching

Compare:

- category
- description
- amount
- vendor/source
- date/year

Example:

Contract says “Banquet Revenue Commitment: $17,000.”

Existing budget has “F&B Minimum: $17,000.”

Show as likely duplicate/update.

### Timeline Matching

Compare:

- deadline title
- due date
- category
- source document

Example:

Contract says “Cut-Off Date: April 14, 2025.”

Existing timeline item says “Hotel cutoff: April 14, 2025.”

Show as likely duplicate.

### Contact Matching

Compare:

- email first
- name
- company
- role

Email match should be treated as strong match.

## Contract vs Spreadsheet Conflicts

Spreadsheet imports and contract extractions should eventually feed the same review layer.

The existing spreadsheet mapper can stay as-is.

The contract extractor creates staged facts.

If both sources produce the same target data, the review layer should show the conflict.

Examples:

- Spreadsheet creates a room called “Atrium Buyout.”
- Contract extracts a room called “Atrium Buyout.”
- Planner chooses “Use existing room.”

Or:

- Spreadsheet creates a session called “Main Meeting.”
- Contract extracts “Meeting” at the same date/time/room.
- Planner chooses “Merge into existing session” or “Keep separate.”

The key is that AI is only used to extract unstructured contract facts. The duplicate resolver is deterministic product logic, not pure AI.

## Source Attribution

Applied event data should remember where it came from.

Examples:

- Budget line source: Hotel contract, version 1, page 1
- Timeline deadline source: Hotel contract, version 1, page 4
- Room block source: Hotel contract, version 1, page 2

This lets planners answer: “Where did this number/date/requirement come from?”

Source attribution should include:

- documentId
- documentVersionId
- page number if known
- extractedFactId or reviewItemId
- appliedByUserId
- appliedAt

## Required Data Model Review

The existing Docs Hub handles document storage and versioning.

This feature likely needs new schema for extraction and review state.

Do not hack extracted facts, review decisions, source links, or duplicate decisions into JSON blobs.

Likely new concepts:

### DocumentExtractionRun

Tracks one AI extraction run for one document version.

Fields may include:

- id
- eventId
- documentId
- documentVersionId
- status
- startedAt
- completedAt
- createdByUserId
- model/provider metadata
- error message if failed

### DocumentExtractedFact

Stores each structured fact extracted from a document version.

Fields may include:

- id
- extractionRunId
- eventId
- documentId
- documentVersionId
- category
- targetModule
- normalizedKey
- displayLabel
- extractedValue
- confidence
- sourcePage
- sourceTextSnippet
- status

If extractedValue requires structure, decide whether this needs typed columns per fact type or a reviewed JSON payload. Because this becomes core import state, schema review is required before choosing JSON.

### ImportReviewItem

Represents a planner-reviewable action.

Fields may include:

- id
- eventId
- sourceType
- sourceDocumentId
- sourceDocumentVersionId
- extractedFactId
- targetModule
- targetAction
- proposedLabel
- proposedValue
- matchedRecordType
- matchedRecordId
- duplicateStatus
- conflictStatus
- reviewStatus
- reviewedByUserId
- reviewedAt

### AppliedSourceLink

Links applied event records back to source document facts.

Fields may include:

- id
- eventId
- sourceDocumentId
- sourceDocumentVersionId
- extractedFactId
- targetRecordType
- targetRecordId
- appliedByUserId
- appliedAt

## Non-Goals

Do not rebuild the spreadsheet uploader.

Do not replace spreadsheet mapping with AI.

Do not automatically apply contract-extracted values to event modules.

Do not silently overwrite event data when a revised document is uploaded.

Do not create a second document repository outside Docs Hub.

Do not duplicate documents outside the existing document/version model.

Do not build full legal contract analysis.

Do not make event creation dependent on AI extraction completing.

Do not add schema casually. If schema is needed, write the schema proposal first.

## Implementation Passes

### Pass 0 — Discovery and Current Flow Audit

Goal:
Understand the current Event Builder, spreadsheet uploader, Docs Hub upload/versioning, and event-scoped document APIs.

Tasks:

- Locate Event Builder flow.
- Locate existing spreadsheet uploader/mapping flow.
- Locate Docs Hub document create/update/version upload flow.
- Confirm how documents are event-scoped.
- Confirm R2 presign/finalize path.
- Confirm document categories/tags.
- Confirm how event creation currently commits.
- Identify the cleanest place to add Additional Docs without disturbing spreadsheet mapping.

Exit criteria:

- Clear list of files/routes/services to touch.
- Confirm whether Pass 1 can avoid schema changes.
- Confirm whether document categories/tags are enough for “Contract / BEO / Addendum” classification in V1.

### Pass 1 — Event Builder Additional Docs Upload to Docs Hub

Goal:
Add Additional Docs upload to Event Builder and save uploaded files into Docs Hub.

Scope:

- UI only plus existing document upload APIs/services.
- No AI extraction yet.
- No schema changes unless current Docs APIs cannot support event-builder uploads.

Behavior:

- Event Builder shows optional Additional Docs section.
- Users can upload contract/PDF files.
- Users can assign a document type/category.
- On event creation, files are saved to the event Docs Hub.
- If event creation fails, docs should not be orphaned.
- If document upload fails, event creation should still allow recovery or clear retry state.
- Uploaded docs appear in Docs Hub after event creation.

Tests:

- Event can be created without docs.
- Event can be created with one additional doc.
- Event can be created with multiple additional docs.
- Uploaded docs are event-scoped.
- Existing spreadsheet uploader still works.
- Docs upload uses existing document/version path.
- Failed upload does not create broken event/document state.

### Pass 2 — Schema Proposal for Extraction and Review

Goal:
Design the normalized extraction/review/source attribution model.

Scope:

- Proposal only unless approved.
- No implementation before review.

Proposal must cover:

- DocumentExtractionRun
- DocumentExtractedFact
- ImportReviewItem
- AppliedSourceLink
- Duplicate/conflict state
- Version comparison support
- Data retention
- Migration/backfill
- Rollback/remediation
- Tests

Decision point:
If the current schema can support a limited V1 without new tables, document exactly how. If not, stop and get approval before schema changes.

### Pass 3 — AI Extraction Service for Additional Docs

Goal:
Run AI extraction for supported document types and create staged suggestions.

Scope:

- Contracts/PDFs only.
- No spreadsheet AI.
- No automatic event writes.

Behavior:

- User uploads/chooses a document.
- System runs extraction on the document version.
- Extraction creates structured facts.
- Facts become pending review items.
- Extraction status is visible.
- Extraction failure is recoverable and does not break Docs Hub.

Extraction should return:

- fact category
- target module
- proposed value
- source page/snippet
- confidence
- possible warnings
- detected year/event date ambiguity

Tests:

- Extraction run is created for a document version.
- Extracted facts are event-scoped.
- Failed extraction records error state.
- No extracted fact directly mutates event modules.
- Unsupported docs can be saved without extraction.

### Pass 4 — Import Review UI and Apply Flow

Goal:
Give planners a review screen for contract-extracted facts.

Scope:

- Review queue UI.
- Apply/edit/skip/flag actions.
- Apply only to selected supported modules.

Initial target modules:

- Venue / room
- Run of Show MatrixRow seed
- Budget line/commitment
- Timeline deadline
- Document/risk note link if current model supports it

Behavior:

- Planner sees extracted suggestions.
- Planner can apply, edit and apply, skip, or flag.
- Applying creates/updates event records through canonical services.
- Applying creates source attribution.
- Review state updates after action.
- Event write access is enforced server-side.

Tests:

- Review item can be applied.
- Review item can be skipped.
- Review item can be edited before apply.
- Event write access is required.
- Applying uses canonical service paths.
- Applied item records source attribution.
- Applying same item twice is idempotent or safely rejected.

### Pass 5 — Duplicate and Conflict Resolution

Goal:
Prevent duplicate rooms, sessions, deadlines, budget lines, and contacts when docs/spreadsheets overlap.

Scope:

- Deterministic duplicate checks.
- Review UI warnings.
- Merge/use-existing flows.

Behavior:

- Review item checks existing records.
- Review item checks pending spreadsheet import records if available.
- Possible duplicates are surfaced before apply.
- Planner can use existing, merge, create new, or skip.
- High-confidence exact matches should default to “use existing,” but require planner confirmation before updating.

Tests:

- Duplicate room is detected.
- Duplicate session is detected.
- Duplicate budget commitment is detected.
- Duplicate timeline deadline is detected.
- Contract vs spreadsheet duplicate is detected where pending spreadsheet import data is available.
- Merge/use-existing does not create duplicate records.

### Pass 6 — Document Version Re-Extraction and Event Update Suggestions

Goal:
When a revised contract is uploaded as a new document version, show what changed and let planner update the event.

Behavior:

- Upload new version in Docs Hub.
- Re-run extraction.
- Compare extracted facts against prior version and current event data.
- Show changed values.
- Planner chooses update, keep, skip, or flag.
- No silent overwrite.

Tests:

- New document version triggers a new extraction run.
- Changed facts are detected.
- Unchanged facts are not duplicated.
- Updated event values keep source attribution to the new version.
- Existing applied values are not overwritten without review.

## UX Requirements

The UI should feel like a planner workflow, not a database import tool.

Use plain labels:

- Additional Docs
- Contract
- BEO
- Addendum
- Extracted setup
- Needs review
- Possible duplicate
- Source document

Avoid scary AI language like:

- hallucination
- model confidence internals
- raw JSON
- vector extraction
- prompt output

The planner should always understand:

- what file was uploaded
- where it was saved
- what the system found
- what will change if they apply it
- where the value came from

## Engineering Requirements

Use existing Docs Hub services wherever possible.

Keep Event Builder light.

Keep spreadsheet uploader untouched unless necessary to expose pending import data to duplicate review.

AI extraction should be isolated behind a service boundary.

Routes should stay thin:

- authenticate
- authorize
- validate input
- call service
- return structured response

All event-scoped reads/writes must enforce event access.

No schema changes without proposal and migration review.

No JSON blobs for core relational import/review entities unless explicitly reviewed and approved.

All mutations must be idempotent or safely reject repeats.

Add targeted regression tests in each pass.

## Suggested Branch Strategy

Use one feature branch for the whole feature if actively developed by one person:

feat/event-builder-additional-docs-intake

Or split if schema/extraction needs review:

feat/event-builder-doc-upload
feat/contract-extraction-review
feat/contract-dedupe-versioning

## Suggested First Implementation Prompt Scope

Start with Pass 0 and Pass 1 only.

Do not start AI extraction yet.

Do not add schema yet.

First implementation should prove:

- Event Builder can accept additional docs.
- Uploaded docs land in Docs Hub.
- Existing spreadsheet mapping is untouched.
- Event creation still works with or without docs.
- Docs are event-scoped and version-compatible.

## Done Definition for V1

V1 is done when:

- Event Builder has optional Additional Docs upload.
- Uploaded contracts/PDFs are saved to Docs Hub.
- Existing spreadsheet uploader still works unchanged.
- User can create an event with docs attached.
- User can skip docs entirely.
- Basic document classification exists.
- No AI extraction is required for event creation.
- Tests cover create-with-docs, create-without-docs, event scoping, and spreadsheet uploader non-regression.

AI extraction/review/dedupe/version update belongs to the next implementation loop after the upload foundation is stable.
