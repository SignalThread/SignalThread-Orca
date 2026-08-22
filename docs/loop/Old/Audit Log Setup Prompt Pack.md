# Event Activity Audit Log — Sequential Loop Prompt Pack

## Loop Instructions

Use this document as a **single sequential implementation loop**.

Run Prompt 1 through Prompt 6 in order on the same branch.

Rules for the loop:

- Do not run passes in parallel.
- Do not ask for approval or confirmation between passes.
- Do not pause merely because the implementation differs slightly from the audit.
- Inspect the repository, existing tests, migration history, and current architecture, then make the safest repository-grounded decision.
- When an ambiguity exists, choose the smallest correct implementation consistent with the product goal, document the assumption in the pass report, and continue.
- Do not perform unrelated refactors, redesigns, or cleanup.
- Each pass must review the actual output of the previous pass before editing.
- Each pass must run its focused tests and affected typecheck.
- Fix failures caused by the current work before moving to the next pass.
- Preserve existing behavior outside the defined scope.
- At the end of each pass, record changed files, tests run, results, and assumptions, then continue automatically to the next prompt.
- The schema is **controlled, not locked**. Intentional, migration-safe, reviewed, and tested schema changes are allowed.

---

# Prompt 1 — Schema and Canonical Infrastructure

**Recommended model: Terra High**

```text
Implement Pass 1 of the event Activity audit-log architecture.

This pass is infrastructure only. Do not build the Activity UI and do not instrument every product module yet.

Goals:
1. Reconcile the two Prisma schema copies where required for this feature.
2. Extend EventActivity into the canonical event-scoped audit model.
3. Add the canonical server-side write and read service.
4. Add a read-only paginated Activity API.
5. Add focused schema, service, authorization, pagination, deduplication, and atomicity tests.

Completed audit findings:

- The current EventActivity model is insufficient.
- It stores eventId, mandatory actorUserId, a coarse combined enum, a message, and a timestamp.
- It has no explicit module, generic action type, affected entity, actor snapshot, system actor support, or old/new values.
- Only shared speaker logging and Event Directory email sending currently write EventActivity.
- Budget, Documents, Tasks, Marketing, Speakers, Copilot, and F&B parser feedback maintain separate or derived histories.
- Some activity writers swallow failures, allowing successful mutations without a corresponding audit entry.
- The two Prisma schema copies currently drift:
  - TaskActivity and related Task models exist only in web/prisma/schema.prisma.
  - Seating relationships also differ.
- The schema is controlled, not locked.

SCHEMA REVIEW

Compare:

- prisma/schema.prisma
- web/prisma/schema.prisma
- the canonical Prisma configuration
- existing migration directories
- existing generated-client workflow

Reconcile Task/TaskActivity and seating-related schema drift carefully.

Do not delete valid models merely to make the schema files match.

Where the files represent different intentional targets, preserve the intended architecture and make only the synchronization changes required by the repository’s actual Prisma setup.

Document any assumptions and continue.

EVENTACTIVITY EXTENSION

Extend EventActivity additively to support:

- actorUserId nullable
- actorKind
- actorLabel snapshot
- module
- actionType
- entityType
- entityId nullable
- entityLabel snapshot
- message
- changes JSON nullable
- sourceRecordType nullable
- sourceRecordId nullable
- legacy type nullable for compatibility
- createdAt

Add actor-kind values covering:

- USER
- SYSTEM
- INTEGRATION
- PORTAL

Add module values covering at least:

- ROADMAP
- BUDGET
- RUN_OF_SHOW
- DOCUMENTS
- EVENT_DIRECTORY
- MARKETING
- EVENT_SETTINGS
- SPEAKERS
- INTEGRATIONS
- REPORTS

Add reusable action values covering at least:

- CREATED
- UPDATED
- DELETED
- ASSIGNED
- UNASSIGNED
- IMPORTED
- SUBMITTED
- APPROVED
- REJECTED
- REOPENED
- STATUS_CHANGED
- LINKED
- UNLINKED
- MERGED
- UPLOADED
- SENT
- SCHEDULED
- RESCHEDULED
- CANCELED
- RETRIED
- SYNCED
- GENERATED

Add indexes supporting:

- eventId + createdAt + id
- eventId + actorUserId + createdAt + id
- eventId + module + createdAt + id
- eventId + actionType + createdAt + id

Use event-scoped source deduplication:

@@unique([eventId, sourceRecordType, sourceRecordId])

Use an additive expand migration:

- preserve all existing EventActivity rows
- add new fields nullable where writer cutover is not complete
- retain the legacy type field
- do not apply final contract/non-null constraints yet
- use the repository’s canonical migration location
- run Prisma format, validation, and generation
- do not commit node_modules or generated dependency artifacts

CANONICAL SERVICE

Create:

web/src/server/services/event-activity.ts

Implement a canonical server-only writer that accepts a Prisma transaction client and structured server-generated input.

It must support:

- user actors
- system actors
- integration actors
- portal actors
- module
- action type
- entity type
- entity ID
- entity display label
- human-readable message
- whitelisted field-level changes
- optional source-record identity

Rules:

- support writing the business mutation and activity entry in the same transaction
- do not swallow audit failures
- construct trusted audit data on the server
- do not trust event IDs, actor IDs, messages, or diffs supplied by clients
- exclude secrets, tokens, email bodies, storage keys, internal notes, and complete record dumps
- preserve actor and entity labels as historical snapshots
- create one summary entry for bulk/import operations by default
- sanitize or reject unsupported change values
- support idempotent source-record deduplication

Implement an event-scoped read service supporting:

- default limit 20
- safe maximum limit
- opaque createdAt + id cursor
- from timestamp
- to timestamp
- actor user
- module
- action type
- text search
- newest-first ordering by createdAt DESC, id DESC

Every query must explicitly include eventId.

Text search should cover user-facing fields such as:

- message
- entityLabel
- actorLabel

Do not implement broad JSON-diff search in V1.

API

Add:

GET /api/events/[eventId]/activity

Requirements:

- authenticate the user
- enforce assertEventAccessForUser(eventId, user, "read")
- validate all query parameters
- return entries and nextCursor
- return actor-filter metadata where appropriate
- derive actor options only from activity within the current event
- never expose another event’s or organization’s activity
- expose no POST, PATCH, PUT, or DELETE Activity endpoint
- use stable error semantics

TESTS

Add focused tests proving:

1. Cross-event activity is never returned.
2. Users without event access cannot read activity.
3. Event viewers with read access can read activity.
4. Pagination remains stable when entries share the same timestamp.
5. Date, actor, module, action, and text filters work independently.
6. Filters work in combination.
7. System actors work without actorUserId.
8. Integration and portal actors are supported.
9. Actor and entity labels are stored as snapshots.
10. Sensitive fields are excluded from changes.
11. Business and audit writes can roll back together.
12. Existing legacy EventActivity rows remain valid.
13. No Activity mutation API exists.
14. Source-record deduplication is event-scoped and idempotent.
15. Every activity read remains event-scoped.
16. Malformed cursors are rejected safely.

Do not yet:

- build the Activity page
- instrument Roadmap
- instrument Budget
- instrument Documents
- instrument Run of Show
- instrument Event Directory beyond current direct writers
- instrument Marketing
- instrument Event Settings
- instrument Seating
- backfill domain histories
- remove BudgetActivity
- remove legacy EventActivity types
- change event deletion retention behavior

Run focused schema, service, API, authorization, and typecheck verification.

Return:

A. Schema drift found  
B. Reconciliation performed  
C. Migration summary  
D. Canonical service design  
E. Files changed  
F. Tests and commands run  
G. Verification results  
H. Assumptions made  

Then continue directly to Prompt 2.
```

---

# Prompt 2 — Activity Page, Filters, and Pagination

**Recommended model: Terra High**

```text
Implement Pass 2 of the event Activity audit-log architecture.

Review the actual Pass 1 implementation before editing.

This pass is UI and read-path integration only.

Do not instrument additional product mutations in this pass.

GOAL

Replace the current event Activity placeholder page with a production-quality, event-scoped audit log.

Expected route:

web/app/(shell)/events/[eventId]/activity/page.tsx

Create route-local components as needed.

PAGE CONTENT

Display:

- date and timestamp
- actor
- module
- action
- affected item/entity
- human-readable message
- expandable field-level changes when changes exist

Use approximately 20 entries per page.

Default ordering:

- createdAt descending
- id descending as the stable tiebreaker

FILTERS

Add:

- date range
- user
- module
- action type
- text search

Use the label “Module,” not “Function.”

Requirements:

- filters are server-backed
- filters survive pagination
- changing a filter resets the cursor
- user options come only from actors in the selected event
- date boundaries are converted consistently to UTC
- empty filters do not create noisy query parameters
- filter state is shareable through the URL where consistent with the existing app pattern

PAGINATION

Use the opaque cursor from Pass 1.

Required behavior:

- approximately 20 entries per page
- next-page control
- previous-page behavior using a safe cursor stack or equivalent stable pattern
- no offset pagination
- no duplicate or skipped rows when timestamps match
- clear loading state
- filters remain applied while paging

ENTRY PRESENTATION

Each entry should show:

- actor label
- actor kind when not a normal user
- module
- action label
- entity label
- message
- timestamp
- expand/collapse control when changes exist

Change details should show readable old → new values.

Do not expose:

- raw tokens
- storage keys
- email bodies
- complete JSON records
- internal secrets
- provider payloads

Use concise human-readable labels such as:

- Roadmap · Status changed
- Budget · Line item updated
- Run of Show · Speaker assigned
- Documents · Review approved
- Event Directory · Person imported
- Marketing · Campaign scheduled
- Event Settings · Event dates updated

EMPTY, LOADING, AND ERROR STATES

Support:

- no activity exists yet
- no results match filters
- loading
- API error
- unauthorized access
- malformed/expired cursor recovery

The empty state should explain that activity will appear as event changes are recorded.

Do not imply that all historical product activity is complete before later passes instrument every module.

ACCESSIBILITY

- semantic table or accessible list
- keyboard-accessible expand/collapse
- visible focus states
- screen-reader labels for filters and pagination
- do not rely on color alone
- use machine-readable datetime values where appropriate

RESPONSIVE BEHAVIOR

The page must remain usable on narrower screens.

Avoid a wide table requiring excessive horizontal scrolling.

Prefer:

- responsive row layout
- compact metadata stacking
- expandable details
- wrapping filter controls

DESIGN

Follow the current Planner OS design system and typography.

Do not redesign the event shell, navigation, or unrelated page structure.

The page should feel like an operational audit log, not a social feed.

TESTS

Add focused coverage proving:

1. The placeholder is removed.
2. The page renders event-scoped activity.
3. Twenty-entry pagination works.
4. Filters produce the correct API query state.
5. Changing a filter resets the cursor.
6. Filters persist while paging.
7. User options are event-scoped.
8. Module and action labels are readable.
9. System actors render without a user relation.
10. Change rows expand and collapse.
11. Entries without changes have no meaningless expander.
12. Empty-event state works.
13. Filtered-empty state works.
14. API-error state works.
15. Keyboard interaction works.
16. Cross-event content is never rendered.
17. No Activity edit or delete controls exist.

Run focused component, route, browser, and typecheck verification.

Do not yet:

- instrument module mutations
- backfill histories
- remove legacy activity paths
- change event deletion behavior

Return:

A. UI structure implemented  
B. Filter and pagination behavior  
C. Files changed  
D. Tests and commands run  
E. Verification results  
F. Assumptions made  

Then continue directly to Prompt 3.
```

---

# Prompt 3 — Existing Writers, Budget, and Documents

**Recommended model: Terra High**

```text
Implement Pass 3 of the event Activity audit-log architecture.

Review the actual Pass 1 and Pass 2 implementation before editing.

This pass must:

1. Replace existing best-effort EventActivity writers.
2. Instrument Budget mutations.
3. Instrument Document mutations.
4. Preserve domain history tables.
5. Make audit and business writes atomic wherever possible.

Do not instrument Roadmap, Event Settings, Run of Show, full Event Directory, Marketing, or Seating in this pass.

EXISTING EVENTACTIVITY WRITERS

Audit and replace the current writers used by:

- shared speaker activity logging
- Event Directory email sending

Required behavior:

- delegate to the canonical event-activity service
- remove swallowed audit failures
- use the same transaction as the business mutation when available
- preserve good user-facing messages
- provide actor snapshot
- provide entity type, ID, and label
- provide module and generic action
- use source-record identity where appropriate

Do not copy:

- speaker email bodies
- private notes
- document contents
- tokens
- provider payloads

BUDGET

Instrument canonical Budget mutation paths for meaningful actions including:

- budget created where applicable
- budget version created
- line item created
- line item updated
- line item deleted
- bulk line-item deletion
- import completed
- budget submitted
- submission pulled back
- revision requested
- budget approved
- budget rejected
- budget file uploaded
- budget file replaced
- session assigned or unassigned
- group assigned or unassigned
- group created
- group deleted
- category target changed
- meaningful amount, status, category, quantity, actual, or variance changes

Use one activity entry per logical operation.

For bulk and import operations:

- create a summary entry
- include counts
- do not create thousands of row-level entries by default

Keep existing domain history:

- BudgetActivity
- BudgetVersion
- BudgetApproval
- BudgetSubmission
- related workflow records

Where domain history and EventActivity are both written:

- write them in the same transaction where feasible
- use sourceRecordType/sourceRecordId for idempotency when a canonical domain record exists

Diff rules:

- include only meaningful changed fields
- preserve financial precision
- do not serialize entire line-item records
- use readable field labels
- omit unchanged values

DOCUMENTS

Instrument canonical Document mutation paths for meaningful actions including:

- draft created
- file uploaded
- file replaced
- new version created
- title updated
- category updated
- visibility updated
- tag linked
- tag unlinked
- document link created
- document link removed
- review submitted
- review pulled back
- approved
- rejected
- reopened
- category created
- archive/delete paths if currently implemented

Keep existing domain history:

- DocumentVersion
- DocumentApproval
- DocumentApprovalRecipient
- related workflow records

Do not store:

- file storage keys
- signed URLs
- file contents
- approval recipient secrets
- portal tokens
- full internal notes

TRANSACTION RULES

For every instrumented path:

- write audit in the same transaction as the business mutation where technically possible
- do not return success when an in-transaction audit write fails
- do not add a second non-transactional logging call after the mutation
- avoid nested transaction misuse
- pass the authenticated actor through canonical service boundaries
- do not trust actor IDs from request payloads

LEGACY COMPATIBILITY

- preserve legacy EventActivity rows
- preserve BudgetActivity consumers
- preserve Document detail histories
- do not union domain tables into the event Activity page
- route new actions into EventActivity

TESTS

Add focused tests proving:

1. Existing speaker activity uses the canonical writer.
2. Event Directory email activity uses the canonical writer.
3. Best-effort swallowed failures are removed.
4. Budget mutation and audit write roll back together.
5. Document mutation and audit write roll back together.
6. Budget line-item create/update/delete produce correct entries.
7. Budget bulk/import actions produce summary entries.
8. Budget approval and submission actions create EventActivity.
9. BudgetActivity remains intact.
10. Document upload/version/review actions create EventActivity.
11. Document metadata changes record meaningful diffs.
12. Document domain history remains intact.
13. Sensitive Budget and Document fields are excluded.
14. Entries remain event-scoped.
15. Actor, module, action, entity, message, and source identity are correct.
16. Idempotent retries do not duplicate sourced activity.

Run focused Budget, Document, speaker, Directory email, Activity service, and typecheck verification.

Return:

A. Existing writers migrated  
B. Budget actions covered  
C. Document actions covered  
D. Transaction strategy  
E. Domain histories preserved  
F. Files changed  
G. Tests and commands run  
H. Verification results  
I. Assumptions made  

Then continue directly to Prompt 4.
```

---

# Prompt 4 — Roadmap and Event Settings

**Recommended model: Terra High**

```text
Implement Pass 4 of the event Activity audit-log architecture.

Review the actual implementation from Passes 1 through 3 before editing.

This pass must instrument:

1. Roadmap
2. Event Settings and event lifecycle mutations

Do not instrument Run of Show, full Event Directory, Marketing, or Seating in this pass.

ROADMAP

Audit all canonical Roadmap mutation paths and instrument meaningful actions including:

- item created
- item updated
- item deleted
- status changed
- owner assigned
- owner unassigned
- start date changed
- due date changed
- progress changed
- priority changed
- critical-path state changed
- workstream changed
- stage changed
- parent/hierarchy changed
- bulk update
- bulk delete
- CSV import
- dependency created
- dependency deleted

Use one activity entry per logical operation.

For updates:

- calculate diffs from authoritative before/after records
- include only changed fields
- do not trust client-supplied old values
- use readable labels
- use related record labels where practical instead of only IDs

For bulk operations and imports:

- produce one summary entry by default
- include affected count
- include reliable success/failure counts
- avoid row-level activity explosions

For deletes:

- preserve the deleted item label
- include safe, meaningful context
- do not dump the complete record

For dependencies:

- clearly identify both Roadmap items
- use LINKED or UNLINKED where appropriate

EVENT SETTINGS AND EVENT LIFECYCLE

Instrument meaningful actions including:

- event created
- event name updated
- lifecycle status changed
- start date changed
- end date changed
- venue changed
- location changed
- client association changed
- timezone changed
- integration configured
- integration updated
- integration disconnected
- session requirement template created
- requirement section added
- requirement section updated
- requirement section removed
- requirement item added
- requirement item updated
- requirement item removed
- section reordered
- item reordered
- other meaningful event-level settings changes already supported by the product

Do not create noise for:

- reads
- page views
- unchanged saves
- derived display-only values
- autosave requests that produce no persisted change

EVENT CREATION

When an event is created:

- create the EventActivity entry transactionally with the event and creator membership where feasible
- actor should be the authenticated creator
- entity should be the event
- module should be EVENT_SETTINGS
- action should be CREATED

EVENT DELETION

Keep current V1 retention behavior:

- full event deletion may delete EventActivity rows
- do not redesign event retention
- do not add an individual Activity delete endpoint

If a deletion attempt can be logged before the event is removed without creating broken foreign-key behavior, use the existing architecture safely.

Do not create an orphaned pseudo-audit system in this pass.

TRANSACTIONS AND AUTHORIZATION

- use canonical server-side mutation services
- preserve current event authorization
- do not introduce UI-only logging
- keep business and audit writes atomic where possible
- pass authenticated actors from route/service boundaries
- avoid duplicate logging when multiple route adapters reach the same canonical mutation

TESTS

Add focused tests proving:

1. Roadmap create/update/delete produce activity.
2. Roadmap meaningful field diffs are correct.
3. Unchanged updates create no noisy activity.
4. Bulk update/delete produce summary entries.
5. CSV import produces one useful summary entry.
6. Dependency link/unlink entries identify both items.
7. Event creation produces activity.
8. Event name/date/status/venue/location changes produce correct diffs.
9. Integration configuration changes produce activity without secrets.
10. Requirement-template changes produce activity.
11. Cross-event relationships are not logged into the wrong event.
12. Mutation and audit rollback together.
13. Existing event access rules remain enforced.
14. No duplicate activity occurs through route/service layering.

Run focused Roadmap, event settings, integration, session-requirement, Activity service, and typecheck verification.

Return:

A. Roadmap actions covered  
B. Event Settings actions covered  
C. Diff strategy  
D. Transaction and deduplication strategy  
E. Files changed  
F. Tests and commands run  
G. Verification results  
H. Assumptions made  

Then continue directly to Prompt 5.
```

---

# Prompt 5 — Run of Show, Event Directory, Marketing, and Seating

**Recommended model: Terra High**

```text
Implement Pass 5 of the event Activity audit-log architecture.

Review the actual implementation from Passes 1 through 4 before editing.

This pass must instrument:

1. Run of Show
2. Event Directory
3. Marketing
4. Seating

ROOM SET LIMITATION

Room Set layout persistence currently uses browser localStorage.

Do not fabricate server audit records for local-only layout changes.

Audit and log only server-backed Room Set or Seating actions.

RUN OF SHOW

Audit both current and compatibility mutation paths.

Instrument meaningful actions including:

- session created
- session updated
- session duplicated
- session deleted
- session imported
- schedule changed
- room assigned
- room unassigned
- session type changed
- session status changed
- speaker assigned
- speaker unassigned
- staff assigned
- staff unassigned
- AV requirement selected or removed
- F&B requirement selected or removed
- staffing requirement selected or removed
- requirement status changed
- F&B catalog item assigned or removed
- budget link created or removed
- room created
- room updated
- room deleted
- attendee roster added
- attendee roster canceled or removed where supported

Prevent duplicate entries when legacy Matrix routes and Matrix 2 routes converge on the same canonical mutation.

Use one activity entry per logical operation.

For schedule changes:

- include readable old and new date/time values
- include room labels where relevant
- do not log internal implementation fields

For assignments:

- identify both the session and assigned entity
- use ASSIGNED/UNASSIGNED or LINKED/UNLINKED consistently

EVENT DIRECTORY

Instrument meaningful actions including:

- person created
- person updated
- person deleted
- person restored
- role added
- role removed
- person linked to a module
- person unlinked from a module
- people merged
- CSV import completed
- source/external identity changed
- bulk email sent summary

For imports and bulk email:

- create summary entries
- include counts
- do not create recipient-level activity rows by default
- do not copy email bodies or sensitive delivery payloads

For merges:

- preserve readable labels for the retained and merged records
- do not expose private or sensitive fields

MARKETING

Instrument planner-facing lifecycle actions including:

- audience created
- audience updated
- audience deleted
- audience imported
- recipient added
- recipient removed
- campaign created
- campaign updated
- campaign status changed
- email draft created
- email draft updated
- submitted for approval
- approved
- changes requested
- rejected
- scheduled
- rescheduled
- canceled
- sent
- retry initiated
- suppression added
- suppression removed/resubscribed

Do not add recipient-level delivery telemetry such as:

- opens
- clicks
- provider webhook events
- per-recipient bounces
- raw provider payloads

Marketing activity should reflect planner actions and meaningful campaign lifecycle events.

Where Marketing approval uses Tasks:

- preserve Task and TaskActivity domain behavior
- also create canonical EventActivity entries
- use source identity to prevent duplicates

SEATING

Instrument server-backed actions including:

- seating plan created
- table created
- table updated
- table deleted
- attendee added
- attendee updated where supported
- attendee removed where supported
- attendee assigned to table/seat
- attendee unassigned
- exact seat changed
- bulk seating action where supported

Use session and seating-plan labels where available.

Do not log browser-only Room Set layout edits.

TRANSACTIONS AND SECURITY

- use canonical server-side services
- keep audit and business writes atomic where possible
- preserve event-access enforcement
- do not trust actor IDs or audit messages from clients
- do not log secrets, tokens, email bodies, private notes, or full record payloads
- do not produce duplicate entries through route adapters

TESTS

Add focused tests proving:

1. Run of Show session create/update/delete/duplicate create correct activity.
2. Schedule and room changes record readable diffs.
3. Speaker/staff/requirement/F&B assignments log correctly.
4. Compatibility routes do not duplicate entries.
5. Event Directory CRUD, role, merge, and import actions log correctly.
6. Directory bulk email creates one summary entry.
7. Marketing lifecycle actions log correctly.
8. Marketing recipient telemetry is not added to EventActivity.
9. Task-based Marketing approvals do not duplicate activity.
10. Seating plan/table/assignment actions log correctly.
11. Browser-only Room Set layout changes are not falsely audited.
12. Cross-event entities cannot be logged into the wrong event.
13. Business and audit writes roll back together.
14. Sensitive fields remain excluded.
15. Existing module behavior and authorization remain intact.

Run focused Run of Show, Directory, Marketing, Seating, Activity service, and typecheck verification.

Return:

A. Run of Show actions covered  
B. Event Directory actions covered  
C. Marketing actions covered  
D. Seating actions covered  
E. Duplicate prevention strategy  
F. Files changed  
G. Tests and commands run  
H. Verification results  
I. Assumptions made  

Then continue directly to Prompt 6.
```

---

# Prompt 6 — Backfill, Contract Migration, Cleanup, and Final Verification

**Recommended model: Terra High**

```text
Implement Pass 6 of the event Activity audit-log architecture.

Review the complete implementation from Passes 1 through 5 before editing.

This final pass must:

1. Backfill reliable historical activity.
2. Complete writer cutover.
3. Remove parallel best-effort EventActivity logging.
4. Apply final schema constraints where safe.
5. Preserve domain history models.
6. Run complete regression verification.
7. Confirm the Activity page works end to end.

BACKFILL

Backfill only records with reliable:

- event identity
- timestamp
- meaning
- actor where available
- source-record identity

Candidates include:

- legacy EventActivity rows
- BudgetActivity
- DocumentVersion
- DocumentApproval
- selected Event Directory import batches
- other domain records only when the mapping is deterministic and useful

Use sourceRecordType/sourceRecordId so the backfill is idempotent.

Use an explicit backfill/cutover strategy.

Do not:

- invent old/new values
- invent actors
- infer unreliable actions from vague prose
- backfill recipient-level Marketing telemetry
- copy email bodies
- copy internal notes
- copy tokens or storage keys
- generate thousands of low-value row-level entries for imports

Legacy entries without reliable diffs should use changes = null.

Map legacy activity types deterministically into:

- module
- actionType
- entity metadata
- actor snapshot where available

WRITER CUTOVER

Confirm every active writer now uses the canonical event-activity service.

Remove or replace:

- best-effort EventActivity calls
- swallowed logging failures
- duplicate direct EventActivity writes
- parallel event-feed logic that competes with the canonical service

Keep domain-specific records that remain necessary:

- BudgetActivity until all non-feed consumers are intentionally migrated
- BudgetVersion
- BudgetApproval
- BudgetSubmission
- DocumentVersion
- DocumentApproval
- DocumentApprovalRecipient
- TaskActivity
- SpeakerEmailLog
- MarketingEmailEvent
- CopilotAuditLog
- FnbParserFeedback
- import/provenance records

These can remain domain sources of truth but must not be unioned into the Activity page at read time.

CONTRACT MIGRATION

Review whether all current writers populate the new required EventActivity fields.

Where safe, apply final non-null constraints for fields that must exist on every post-cutover entry.

Preserve compatibility for intentionally incomplete legacy rows if required by the migration strategy.

Do not drop:

- legacy type
- BudgetActivity
- domain approval/version/history models

unless the repository has no remaining consumers and removal is explicitly safe.

Prefer leaving legacy compatibility fields in place over an unnecessary destructive migration.

INDEX AND QUERY REVIEW

Verify:

- newest-first cursor index is used
- actor/module/action filters remain event-scoped
- search remains acceptable at current expected volume
- no query scans unrelated events
- stable pagination works with identical timestamps
- actor-filter metadata is event-scoped

Do not add pg_trgm unless the repository and target database already support it or the migration can enable it safely.

If trigram search is unnecessary for current scale, keep the simpler indexed event-first query.

ACTIVITY PAGE FINAL REVIEW

Verify the final page supports:

- 20 entries per page
- newest-first order
- date filter
- user filter
- module filter
- action filter
- text search
- previous/next pagination
- expandable old/new values
- system/integration/portal actors
- empty states
- filtered-empty state
- error state
- responsive layout
- no edit/delete controls

Verify each implemented module produces visible entries with readable labels.

EVENT DELETION

Retain V1 behavior:

- individual activity entries are not editable or deletable
- full event deletion may remove EventActivity rows with the event
- do not introduce compliance-retention architecture in this pass

DOCUMENTATION

Update the project documentation to describe:

- EventActivity as the canonical event audit feed
- domain history models as separate workflow sources of truth
- actor kinds
- event scoping
- cursor pagination
- supported filters
- transaction expectations
- Room Set localStorage limitation
- current event-deletion retention behavior

Do not call the schema locked.

Describe it as controlled.

FINAL TEST COVERAGE

Run focused and broad verification covering:

1. Event, organization, membership, and viewer authorization.
2. Cross-event and cross-organization isolation.
3. Stable pagination with equal timestamps.
4. Every filter independently and in combination.
5. Old/new diff serialization.
6. Sensitive-field exclusion.
7. User, system, integration, and portal actors.
8. Audit/business mutation atomicity.
9. Bulk/import summary behavior.
10. Source-record idempotency.
11. Legacy backfill idempotency.
12. No Activity mutation endpoints.
13. Event deletion behavior.
14. Budget and Document domain histories remain functional.
15. Roadmap, Event Settings, Run of Show, Directory, Marketing, and Seating entries display correctly.
16. No recipient-level Marketing telemetry appears in the event feed.
17. Browser-only Room Set layout edits are not falsely represented.
18. Existing unrelated module regressions remain green.

Run:

- Prisma format
- Prisma validation
- Prisma generation
- migration validation using the repository’s supported workflow
- focused service tests
- API tests
- route/component tests
- Activity browser journey
- affected module tests
- full project typecheck
- the broadest practical regression suite supported by the repository

Fix failures caused by the Activity implementation.

FINAL RETURN

A. Final architecture implemented  
B. Schema and migrations applied  
C. Backfill strategy and counts where testable  
D. Modules instrumented  
E. Legacy/domain histories retained  
F. Cleanup completed  
G. Files changed across all passes  
H. Tests and commands run  
I. Verification results  
J. Assumptions and remaining non-blocking limitations  
K. Recommended commit message  

The six-pass Activity implementation loop is complete after this report.
```
