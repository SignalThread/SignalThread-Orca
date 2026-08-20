# Event Activity Audit Log — Build Brief and Loop Plan

## What We Are Building

Planner OS needs a real event-level **Activity** module that acts as the canonical audit log for everything that happens inside an event.

The page should show:

- Date and timestamp
- Acting user or system actor
- Module where the action occurred
- Action type
- Affected item or record
- Human-readable description
- Old and new values for meaningful changes

The first version should support:

- 20 entries per page
- Newest-first ordering
- Date-range filter
- User filter
- Module filter
- Action-type filter
- Text search
- Event-scoped authorization
- Read-only activity history with no edit or delete controls

The schema is **controlled, not locked**. Schema changes are allowed when they are intentional, migration-safe, reviewed, backfilled where appropriate, and tested.

## Audit Conclusion

The audit determined that a schema change is required.

The existing `EventActivity` table is a reasonable foundation, but it is not capable of powering the requested Activity page in its current form. It currently stores only:

- `eventId`
- mandatory `actorUserId`
- a coarse combined activity enum
- a message
- a timestamp

It does not have dedicated fields for:

- Module
- Generic action type
- Affected entity type
- Affected entity ID
- Affected entity label
- System, integration, or portal actors
- Actor-name snapshots
- Old and new values
- Reliable source-record deduplication

The current activity enum also does not accurately represent Roadmap, Documents, Event Directory, Marketing, or Event Settings.

## Current Activity Coverage

Only two production paths currently write directly to `EventActivity`:

- Shared speaker activity logging
- Event Directory email sending

Other modules maintain separate or derived histories:

- Budget uses `BudgetActivity`, submissions, approvals, and versions
- Documents derive history from versions and approvals
- Tasks use `TaskActivity`
- Marketing approvals are represented through Tasks
- Marketing delivery telemetry uses provider event records
- Speaker history is assembled from multiple speaker-related tables
- Copilot has a separate mutable audit log
- F&B parser feedback stores parser-review changes
- Event Directory imports retain provenance and batch records

There is currently no single event-scoped feed that can support all required filters without unioning unrelated tables, parsing prose, or inventing missing fields.

## Important Audit Findings

### Logging gaps

The following areas currently lack complete canonical audit logging:

- Roadmap
- Run of Show
- Event Settings
- Most Budget mutations
- Most Document mutations
- Most Event Directory actions
- Most Marketing actions
- Seating mutations
- Room, staffing, speaker assignment, AV, F&B, and requirement changes

### Reliability problems

Some existing activity writers are best-effort and swallow logging failures. This means a business mutation may succeed while its activity record silently fails.

The new architecture must write the business mutation and audit entry in the same database transaction wherever possible.

### Schema drift

The two Prisma schema copies are already out of sync.

Notably:

- `TaskActivity` and related Task models exist only in `web/prisma/schema.prisma`
- Seating relationships also differ

This drift must be reconciled before the new Event Activity migration is finalized.

### Room Set limitation

Room Set layout data currently lives in browser `localStorage`, so layout changes cannot produce trustworthy server-side audit records yet.

Seating is server-backed and can be included in the audit log.

### Event deletion

The existing event deletion path explicitly removes `EventActivity` rows.

For V1:

- Individual audit entries should not be editable or deletable
- Full event deletion may continue removing the event and its activity history

Long-term compliance retention beyond event deletion would require a separate architecture decision.

## Recommended Architecture

Extend `EventActivity` and make it the single canonical event-level audit feed.

Existing domain-history tables should remain where they are needed for workflow behavior, approvals, versions, delivery telemetry, and operational history. They should not remain competing data sources for the Activity page.

### Canonical writer

Create one server-only service:

`web/src/server/services/event-activity.ts`

It should support:

- User actors
- System actors
- Integration actors
- Portal actors
- Module
- Generic action type
- Entity type, ID, and display label
- Human-readable message
- Whitelisted field-level changes
- Optional source-record identity
- One summary entry for bulk or import actions

Important rules:

- Use the same transaction as the business mutation
- Do not swallow activity-write failures
- Construct audit data on the server
- Do not trust actor IDs, event IDs, messages, or diffs supplied by clients
- Do not store secrets, tokens, email bodies, storage keys, internal notes, or entire record snapshots
- Preserve actor and entity labels so historical entries remain readable after renames or deletions

### Canonical read service and API

Add a read-only endpoint:

`GET /api/events/:eventId/activity`

It should support:

- Limit, default 20
- Opaque cursor based on `createdAt + id`
- Date range
- User
- Module
- Action type
- Text search
- Newest-first ordering

Every query must explicitly include the selected `eventId`.

The endpoint must:

- Authenticate the user
- Enforce event read access
- Prevent cross-event and cross-organization leakage
- Expose no Activity POST, PATCH, PUT, or DELETE endpoint
- Derive user filter options only from actors present in the selected event’s activity history

## Proposed EventActivity Extension

The additive schema change should include:

- Nullable `actorUserId`
- `actorKind`
- `actorLabel`
- `module`
- `actionType`
- `entityType`
- Nullable `entityId`
- `entityLabel`
- `message`
- Nullable `changes` JSON
- Nullable `sourceRecordType`
- Nullable `sourceRecordId`
- Nullable legacy `type` for compatibility
- `createdAt`

Required index coverage:

- Event + createdAt + ID
- Event + actor + createdAt + ID
- Event + module + createdAt + ID
- Event + action + createdAt + ID

Source-record deduplication should be event-scoped:

```prisma
@@unique([eventId, sourceRecordType, sourceRecordId])
```

The first migration should be additive. Final non-null constraints should wait until writers and backfill work are complete.

## Module Coverage Required

### Roadmap

Log:

- Item create, update, and delete
- Status changes
- Owner changes
- Date changes
- Hierarchy changes
- Progress changes
- Priority and critical-path changes
- Bulk changes
- CSV imports
- Dependency create and delete

### Budget

Log:

- Line-item create, update, and delete
- Bulk delete
- Imports
- Amount and status changes
- Approval workflow changes
- Session and group assignments
- Group create and delete
- Category-target changes
- Version creation
- Budget file upload and replacement

### Run of Show

Log:

- Session create, update, duplicate, delete, and import
- Schedule, room, type, and status changes
- Speaker and staff assignment
- Requirement selections
- Budget links
- F&B plan and assignment changes
- Room create, update, and delete
- Seating table, attendee, and assignment changes
- Roster add and cancel actions

### Documents

Log:

- Draft creation
- File upload and replacement
- Title and category changes
- Visibility changes
- Tag and link changes
- Review submission
- Approval, rejection, pullback, and reopen actions
- Category creation
- Future archive or delete actions

### Event Directory

Log:

- Person create, update, delete, and restore
- Role add and remove
- Module linking
- Merge
- CSV import
- Source and external identity changes
- Bulk email summaries

### Marketing

Log:

- Audience create, update, delete, and import
- Recipient changes
- Campaign create and update
- Draft changes
- Submit, approve, request changes, and reject
- Schedule, reschedule, cancel, send, and retry
- Suppression and resubscribe
- Send-level lifecycle summaries

Do not add recipient-level opens and clicks to the event activity feed.

### Event Settings

Log:

- Event creation and update
- Lifecycle status changes
- Date changes
- Venue and location changes
- Integration configuration
- Requirement-template changes
- Event deletion attempt and outcome where appropriate

### Seating

Log:

- Seating-plan creation
- Table changes
- Attendee changes
- Seat assignment and unassignment

Room Set layout changes cannot be included until Room Set persistence becomes server-backed.

## Six-Pass Sequential Loop

This should run as a gated sequential loop. Do not run passes in parallel.

Each pass must:

- Touch only its defined scope
- Run focused tests
- Run typecheck for affected code
- Fix failures before continuing
- Stop on unresolved schema or data ambiguity
- Report changed files and verification results
- Continue only when the current pass is clean

### Pass 1 — Schema and Canonical Infrastructure

- Reconcile Prisma schema drift
- Extend `EventActivity`
- Add migration and indexes
- Add canonical writer
- Add read service
- Add read-only API
- Add authorization, pagination, filtering, deduplication, and transaction tests

### Pass 2 — Activity Page

- Replace the placeholder Activity page
- Add 20-row pagination
- Add date, user, module, action, and search filters
- Add expandable change details
- Add actor, module, action, entity, message, and timestamp display
- Add responsive and empty states
- Add focused browser coverage

### Pass 3 — Existing Writers, Budget, and Documents

- Replace best-effort speaker and Directory email logging
- Instrument Budget workflows and mutations
- Instrument Document workflows and mutations
- Keep domain history tables intact
- Ensure mutation and audit writes are atomic

### Pass 4 — Roadmap and Event Settings

- Instrument Roadmap mutations
- Instrument dependencies, imports, and bulk actions
- Instrument event creation and settings changes
- Add exact field-level diffs for meaningful changes

### Pass 5 — Run of Show, Directory, Marketing, and Seating

- Instrument Run of Show sessions and assignments
- Cover compatibility and current mutation paths
- Instrument Event Directory
- Instrument Marketing lifecycle actions
- Instrument Seating
- Use summary entries for bulk and import operations

### Pass 6 — Backfill and Cleanup

- Backfill only reliable historical records
- Use idempotent source-record keys
- Do not invent missing actors or diffs
- Add a clear cutover timestamp
- Stop new parallel best-effort logging
- Keep approval, version, task, and telemetry tables that remain domain sources of truth
- Add final non-null constraints only after all writers are migrated
- Validate event deletion behavior
- Run full regression coverage

## Backfill Rules

Backfill only records with reliable:

- Event
- Timestamp
- Meaning
- Actor, when available
- Source identity

Good candidates include:

- Existing `EventActivity`
- `BudgetActivity`
- `DocumentVersion`
- `DocumentApproval`
- Selected Event Directory import batches

Do not:

- Invent old and new values
- Backfill recipient-level Marketing telemetry
- Copy sensitive message or email content
- Create thousands of row-level entries for bulk imports unless explicitly required

## Definition of Done

The Activity module is complete when:

- Every important event mutation writes through one canonical audit service
- Business writes and audit writes are atomic wherever possible
- All entries are event-scoped and access-controlled
- Pagination is stable
- Filters work independently and together
- System and integration actors are supported
- Actor and entity labels remain readable historically
- Sensitive values are excluded
- Bulk operations produce useful summary entries
- No Activity mutation API exists
- Legacy history is preserved without remaining a competing feed
- Focused and end-to-end regression tests pass

## Model Recommendation

Use **Terra High** for the six-pass sequential implementation loop.

Sol High completed the architecture audit. Terra High should now execute the implementation in controlled, test-gated passes.
