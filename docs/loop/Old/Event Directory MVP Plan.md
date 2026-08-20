# Event Directory MVP Plan

## Purpose

This document defines the MVP plan for adding an Event Directory to Planner OS / Planner Dash.

The Event Directory should become the canonical people/contact layer for an event. It should exist before the Attendee module because attendees are only one type of event person. Speakers, exhibitors, sponsors, staff, seating guests, VIPs, press, marketing contacts, and future portal users all need to resolve back to the same event-level person record.

The goal is not to build every attendee, registration, portal, or integration workflow now. The goal is to build the correct foundation so those modules can be layered on cleanly without duplicating people data across the product.

## Product Principle

A person should exist once in the Event Directory and have many roles.

Examples:

- A person can be both a speaker and an attendee.
- A person can be a sponsor contact and a VIP.
- A person can be imported as a marketing prospect and later become a registered attendee.
- A person can be used in seating without becoming a registered attendee.
- A person can be pulled from a registration platform and later connected to session registration or portal access.

The directory should not call imported marketing contacts "attendees" unless they are actually registered or intentionally assigned an attendee/registrant role.

## MVP Definition

The MVP Event Directory is a clickable event module where planners can:

1. View every person/contact connected to an event.
2. Search and filter by name, email, company, role, source, and status.
3. Add a person manually.
4. Edit a person.
5. Delete or remove a person where safe.
6. Assign one or more roles to a person.
7. Upload people by CSV.
8. Re-import and merge by identity rules.
9. See invalid and duplicate import rows clearly.
10. Track source information for manual, CSV, existing modules, and future integration-sourced people.
11. Support future registration integrations with external identity records and provider capability flags.
12. Backfill/link current speaker, seating, and staff/person records into the directory.

## Non-Goals For Directory MVP

Do not build these in the Directory MVP:

- Attendee portal.
- Session registration UX.
- Full registration integration writeback.
- Automatic scheduled sending.
- Advanced marketing segmentation builder.
- AI duplicate matching.
- Badge/check-in workflow.
- Sponsor/exhibitor CRM.
- Complex custom field builder.
- Full retirement of existing Speaker, SeatingAttendee, or EventPerson models.

The MVP should leave clean extension points for all of the above.

## Current Product Context To Respect

Planner OS is a Next.js App Router app backed by Prisma/PostgreSQL. Event-specific modules live under the event workspace. Current event modules include Run of Show, Budget, Docs, Speakers, F&B Catalog, Timeline, Room Set, and Seating.

Existing relevant people-like models include:

- `Speaker`
- `SessionSpeakerAssignment`
- `EventPerson`
- `SessionStaffAssignment`
- `SeatingAttendee`
- `SeatingAssignment`

The Event Directory should not immediately break those flows. Instead, it should become the canonical layer that can link/backfill those existing module-specific records and gradually become the source picker for them.

Schema changes are allowed for this feature, but they must be deliberate. Use a real schema proposal, migration plan, backfill review, rollback/remediation notes, and tests. Do not stuff core relational data into JSON blobs.

## Desired Event Navigation

Add Directory as an event workspace module.

Recommended event nav direction:

- Event Dashboard
- Run of Show
- Directory
- Attendees
- Speakers
- Budget
- Docs
- F&B Catalog
- Timeline
- Settings

For the Directory MVP, only the Directory module needs to be added. The Attendees module comes after Directory is in place.

## Data Model Direction

The exact names can be adjusted to match project conventions, but the model responsibilities should remain intact.

### EventDirectoryPerson

Canonical person/contact record for an event.

Suggested fields:

- `id`
- `orgId`
- `clientId` nullable
- `eventId`
- `firstName`
- `lastName`
- `displayName`
- `email`
- `normalizedEmail`
- `phone`
- `company`
- `title`
- `status`
- `createdAt`
- `updatedAt`
- `deletedAt` nullable
- `createdByUserId` nullable
- `updatedByUserId` nullable

Suggested status enum:

- `ACTIVE`
- `NEEDS_REVIEW`
- `DUPLICATE_REVIEW`
- `REMOVED`

Notes:

- Use event scope as the primary boundary.
- Email can be nullable because not every seating guest or staff contact may have one.
- `normalizedEmail` should be lowercased/trimmed and used for deterministic matching where email exists.
- Do not use email as the only identity mechanism because integrations and no-email people must be supported.

### EventDirectoryRole

A normalized role assignment table. One person can have many roles.

Suggested fields:

- `id`
- `eventId`
- `personId`
- `role`
- `sourceId` nullable
- `createdAt`
- `createdByUserId` nullable

Suggested role enum:

- `ATTENDEE`
- `REGISTRANT`
- `SPEAKER`
- `EXHIBITOR_CONTACT`
- `SPONSOR_CONTACT`
- `STAFF`
- `VIP`
- `PRESS`
- `PROSPECT`
- `MARKETING_CONTACT`
- `SEATING_GUEST`

Role naming rules:

- `ATTENDEE` / `REGISTRANT` means the person is actually part of the event attendance/registration flow.
- `MARKETING_CONTACT` / `PROSPECT` means imported or targeted contact, not necessarily registered.
- A person can move from prospect to registrant later without creating a duplicate person.

### EventDirectorySource

Tracks where a person, role, or import came from.

Suggested fields:

- `id`
- `eventId`
- `type`
- `label`
- `provider` nullable
- `createdAt`
- `createdByUserId` nullable

Suggested source type enum:

- `MANUAL`
- `CSV_IMPORT`
- `REGISTRATION_INTEGRATION`
- `SPEAKER_INTAKE`
- `SPEAKER_MODULE`
- `SEATING_MODULE`
- `STAFFING_MODULE`
- `MARKETING_AUDIENCE`
- `EXHIBITOR_PORTAL`
- `SPONSOR_IMPORT`

Notes:

- Source labels are user-facing. Examples: "Initial attendee upload", "VIP list", "Cvent registrants", "Speaker intake".
- A source is not the same as a role. A CSV import may create speakers, VIPs, or prospects depending on user intent.

### EventDirectoryExternalIdentity

Supports future registration and external-system sync.

Suggested fields:

- `id`
- `eventId`
- `personId`
- `provider`
- `externalPersonId`
- `externalRegistrationId` nullable
- `externalAccountId` nullable
- `externalEventId` nullable
- `syncStatus`
- `lastPulledAt` nullable
- `lastPushedAt` nullable
- `externalUpdatedAt` nullable
- `syncError` nullable
- `createdAt`
- `updatedAt`

Suggested sync status enum:

- `LINKED`
- `PULLED`
- `PUSHED`
- `CONFLICT`
- `ERROR`
- `READ_ONLY`

Integration principle:

- If the registration API supports editing or adding, Planner can eventually push changes back.
- If the API is read-only, fields should either be read-only or explicitly local-only.
- Do not silently pretend a local edit updated the registration platform.

### EventDirectoryIntegrationCapability

This can be a table or a typed config depending on how current integrations are modeled. The goal is to keep provider behavior explicit.

Capabilities to represent:

- can pull registrants
- can create registrants
- can update registrants
- can cancel/delete registrants
- can pull sessions
- can create sessions
- can update sessions
- can pull session registrations
- can push session registrations

MVP can stub this capability layer without implementing real providers yet.

### EventDirectoryImportBatch

Tracks a CSV import/re-import.

Suggested fields:

- `id`
- `eventId`
- `sourceId`
- `fileName`
- `uploadedByUserId`
- `uploadedAt`
- `targetRole`
- `sourceLabel`
- `totalRows`
- `createdCount`
- `updatedCount`
- `duplicateCount`
- `invalidCount`
- `skippedCount`
- `status`

Suggested status enum:

- `PENDING`
- `PROCESSING`
- `COMPLETE`
- `FAILED`

### EventDirectoryImportRow

Tracks row-level results so users can see and fix bad rows.

Suggested fields:

- `id`
- `eventId`
- `batchId`
- `rowNumber`
- `rawName` nullable
- `rawEmail` nullable
- `rawCompany` nullable
- `parsedFirstName` nullable
- `parsedLastName` nullable
- `parsedEmail` nullable
- `result`
- `matchedPersonId` nullable
- `errorMessage` nullable
- `createdAt`

Suggested result enum:

- `CREATED`
- `UPDATED`
- `DUPLICATE_REVIEW`
- `INVALID`
- `SKIPPED`

### EventDirectoryModuleLink

Needed to bridge current module-specific records without immediately deleting them.

Suggested fields:

- `id`
- `eventId`
- `personId`
- `module`
- `moduleRecordId`
- `createdAt`

Suggested module enum:

- `SPEAKER`
- `SEATING_ATTENDEE`
- `EVENT_PERSON`
- `MARKETING_RECIPIENT`
- `EXHIBITOR_CONTACT`
- `SPONSOR_CONTACT`

Purpose:

- Existing `Speaker` records can be linked to a directory person.
- Existing `SeatingAttendee` records can be linked to a directory person.
- Existing `EventPerson` records can be linked to a directory person.
- Future module migrations can gradually move toward direct `personId` references when safe.

## Constraints And Indexes

Recommended constraints:

- Unique event/person/module link on `(eventId, module, moduleRecordId)`.
- Unique event/provider/external identity on `(eventId, provider, externalPersonId)` where external id exists.
- Unique active normalized email per event should be considered, but be careful: some events may have shared emails, missing emails, assistant emails, or duplicate family/company contacts. If uniqueness is too strict, use duplicate detection instead of a hard unique constraint.

Recommended indexes:

- `(eventId, normalizedEmail)`
- `(eventId, displayName)` or search-friendly equivalent
- `(eventId, company)`
- `(eventId, status)`
- `(eventId, role)` through role table
- `(eventId, sourceId)`
- `(personId)` on role, source, external identity, and module link tables

## Identity And Dedupe Rules

MVP matching priority:

1. Same event + same provider + same external person id = same person.
2. Same event + same normalized email = likely same person.
3. Same event + same normalized name + same company = possible duplicate; do not auto-merge.
4. No email = create person but mark identity as weaker.
5. Ambiguous matches should be flagged as `DUPLICATE_REVIEW`, not auto-merged.

Merge behavior:

- Keep one canonical person.
- Move role assignments to the canonical person.
- Move external identities to the canonical person.
- Move module links where safe.
- Preserve import row history.
- Record activity/audit if the product has an event activity mechanism available.

## Delete / Remove Rules

Use explicit delete semantics.

Directory MVP should support:

1. Hard delete for local-only people with no downstream usage, if safe.
2. Soft remove for people used by other modules or historical records.
3. Remove role when the person should remain in directory but no longer belong to that category.
4. Do not delete already-sent email recipient history.
5. Do not delete/cancel a person in a registration platform unless the provider capability explicitly supports it and the user confirms.

User-facing language should distinguish:

- Delete person
- Remove from role
- Remove from audience/list
- Disconnect external identity
- Cancel/delete in registration platform, later only

## CSV Import MVP

### Import Entry Point

Directory page should have an `Import people` action.

### Import Flow

1. User chooses source label.
2. User chooses target role/type.
3. User uploads CSV.
4. System parses headers.
5. User maps fields.
6. User previews first rows.
7. System validates rows.
8. System imports and merges deterministic matches.
9. System shows import result summary.
10. User can inspect invalid/duplicate rows.

### Required CSV Fields

At least one of these should be required:

- Email
- Full name
- First name + last name

Recommended fields:

- first name
- last name
- full name
- email
- phone
- company
- title
- role/type

### Import Result UX

Show:

- Created count
- Updated count
- Duplicate review count
- Invalid count
- Skipped count

Rows should show:

- Row number
- Name
- Email
- Company
- Result
- Error/reason

This is required so users can fix wrong imported emails without creating a new audience or list.

## Directory UI MVP

### Directory List Page

Route suggestion:

`/events/:eventId/directory`

Top summary cards:

- Total people
- Attendees/registrants
- Speakers
- Sponsors/exhibitors
- VIP/press
- Needs review

Controls:

- Search
- Role filter
- Source filter
- Status filter
- Add person
- Import people
- Export, optional

Table columns:

- Name
- Email
- Company
- Title
- Roles
- Source
- Status
- Last updated
- Actions

Actions:

- View/edit
- Manage roles
- Delete/remove
- Merge duplicate, if flagged

### Add/Edit Person Modal Or Drawer

Fields:

- First name
- Last name
- Email
- Phone
- Company
- Title
- Roles
- Source label for manual/source tracking

Behavior:

- On email conflict, show possible existing person before creating duplicate.
- Let user add a new role to an existing person instead of creating a duplicate.
- Validate on server, not just UI.

### Person Detail Drawer

MVP sections:

- Profile
- Roles
- Source/sync
- Linked module records
- Activity/history, if available

Future sections:

- Sessions
- Seating
- Attendee portal
- Session registration
- Email history
- Documents/forms

## API Surface Direction

Suggested routes:

- `GET /api/events/:eventId/directory`
- `POST /api/events/:eventId/directory/people`
- `GET /api/events/:eventId/directory/people/:personId`
- `PATCH /api/events/:eventId/directory/people/:personId`
- `DELETE /api/events/:eventId/directory/people/:personId`
- `POST /api/events/:eventId/directory/people/:personId/roles`
- `DELETE /api/events/:eventId/directory/people/:personId/roles/:roleId`
- `POST /api/events/:eventId/directory/imports`
- `GET /api/events/:eventId/directory/imports/:batchId`
- `GET /api/events/:eventId/directory/imports/:batchId/rows`
- `POST /api/events/:eventId/directory/people/:personId/merge`

Route handlers should be thin:

1. Resolve user.
2. Enforce event access.
3. Validate input.
4. Call canonical directory service.
5. Return structured response.

## Service Layer Direction

Create a canonical service boundary for directory logic.

Suggested service file:

`web/src/server/services/event-directory.ts`

Possible service functions:

- `listEventDirectoryPeople`
- `getEventDirectoryPerson`
- `createEventDirectoryPerson`
- `updateEventDirectoryPerson`
- `deleteEventDirectoryPerson`
- `addEventDirectoryRole`
- `removeEventDirectoryRole`
- `createEventDirectorySource`
- `detectDirectoryDuplicates`
- `mergeEventDirectoryPeople`
- `createImportBatch`
- `processDirectoryCsvImport`
- `listImportRows`
- `linkDirectoryPersonToModuleRecord`
- `backfillDirectoryFromSpeakers`
- `backfillDirectoryFromSeatingAttendees`
- `backfillDirectoryFromEventPeople`

The service layer owns identity rules, dedupe rules, write safety, access-sensitive behavior, and delete semantics.

## Backfill Plan

Backfill should be explicit and safe.

### Speakers

For each existing `Speaker` in an event:

1. Create or match an EventDirectoryPerson using email first, then name/company fallback.
2. Add `SPEAKER` role.
3. Create source `SPEAKER_MODULE` if needed.
4. Create module link to the Speaker record.

Do not remove or rewrite current speaker assignment behavior in the MVP.

### SeatingAttendees

For each existing `SeatingAttendee`:

1. Create or match EventDirectoryPerson.
2. Add `SEATING_GUEST` role.
3. Create source `SEATING_MODULE` if needed.
4. Create module link to SeatingAttendee.

Do not break current seating assignment behavior.

### EventPerson / Staff

For each existing `EventPerson` used for staffing:

1. Create or match EventDirectoryPerson.
2. Add `STAFF` role.
3. Create source `STAFFING_MODULE` if needed.
4. Create module link to EventPerson.

Do not break current staffing assignment behavior.

## Future Attendee Module Relationship

The Attendee module should not create a separate person universe.

Attendees should be represented by EventDirectoryPerson records with role:

- `ATTENDEE`
- `REGISTRANT`

The Attendee module can add attendee-specific records later, for example:

- registration status
- ticket/pass type
- check-in status
- session registration status
- portal invitation status
- registration source
- dietary/accessibility data if needed

But the person identity should remain in Event Directory.

## Future Audience / Marketing Relationship

Marketing audiences should eventually source from Event Directory.

Audience source options should become:

- CSV import
- manual contacts
- Event Directory selected people
- Event Directory filtered segment
- integration-sourced registrants

Examples:

- all registered attendees
- speakers
- VIPs
- sponsors
- press
- prospects
- attendees missing session registration
- speakers missing headshot

Already-sent email recipient history must remain frozen and must not be deleted by audience or directory cleanup.

## Implementation Prompt Sequence

Use six prompts. Do not try to do this in one giant implementation pass.

---

# Prompt 1 — Schema Proposal And Migration

Model: Claude Opus
Reasoning: High

We need to add an Event Directory MVP to Planner OS / Planner Dash. Schema changes are allowed for this feature, but they must be deliberate, migration-safe, and reviewed. Do not implement UI in this pass.

Goal:
Create the schema foundation for Event Directory as the canonical event-level people/contact layer. A person should exist once per event and have many roles. This will later support attendees, registration integrations, speakers, seating guests, staff, sponsors, exhibitors, VIPs, press, marketing contacts, and attendee portal users.

Current context:
The app is Next.js App Router with Prisma/PostgreSQL. There are schema copies at `prisma/schema.prisma` and `web/prisma/schema.prisma`. Current people-like models include Speaker, SeatingAttendee, EventPerson, SessionSpeakerAssignment, SessionStaffAssignment, and SeatingAssignment. Do not remove or break those existing models.

Add normalized models/enums for:

1. `EventDirectoryPerson`
   - event-scoped canonical person/contact
   - include org/client/event scope as consistent with current project conventions
   - fields for firstName, lastName, displayName, email, normalizedEmail, phone, company, title, status, created/updated/deleted timestamps, createdBy/updatedBy if project pattern supports it

2. `EventDirectoryRole`
   - many roles per person
   - roles should include ATTENDEE, REGISTRANT, SPEAKER, EXHIBITOR_CONTACT, SPONSOR_CONTACT, STAFF, VIP, PRESS, PROSPECT, MARKETING_CONTACT, SEATING_GUEST

3. `EventDirectorySource`
   - source type and user-facing label
   - source types should support MANUAL, CSV_IMPORT, REGISTRATION_INTEGRATION, SPEAKER_INTAKE, SPEAKER_MODULE, SEATING_MODULE, STAFFING_MODULE, MARKETING_AUDIENCE, EXHIBITOR_PORTAL, SPONSOR_IMPORT

4. `EventDirectoryExternalIdentity`
   - provider/external ids for future registration integration sync
   - include sync status, last pulled/pushed timestamps, external updated timestamp, and sync error field

5. `EventDirectoryImportBatch`
   - file/source/import summary
   - counts for created, updated, duplicates, invalid, skipped
   - status enum

6. `EventDirectoryImportRow`
   - row-level result tracking for invalid/duplicate/created/updated/skipped rows
   - keep enough parsed/raw values to show users what happened

7. `EventDirectoryModuleLink`
   - bridge existing module-specific records to directory people
   - support links for Speaker, SeatingAttendee, EventPerson, marketing recipient/future contacts if appropriate

Important rules:

- Do not use JSON blobs for core relational entities.
- Keep schema copies in sync.
- Add proper indexes for event-scoped list/search/filter and relation lookup.
- Do not enforce a hard unique email constraint if it would break real-world duplicate/shared/no-email cases; prefer duplicate detection in services unless a partial safe constraint already fits project conventions.
- External identities should be unique by event/provider/external id where available.
- Module links should be unique by event/module/moduleRecordId.
- Migration must be production-safe.
- Include migration/backfill notes in the response.
- Run Prisma generate if that is standard in this repo after migration.

Deliverables:

- Prisma schema updates in both schema copies.
- A migration with the new models/enums/indexes/constraints.
- Generated Prisma client updates if applicable.
- A short schema proposal summary in the final response: rationale, migration approach, backfill considerations, rollback/remediation notes, and test recommendations.

Do not build API routes or UI yet.

---

# Prompt 2 — Event Directory Service Layer

Model: Claude Opus
Reasoning: High

Build the canonical server/service layer for the Event Directory. Do not build the UI in this pass.

Goal:
Create one authoritative service boundary that owns Event Directory business rules, identity matching, duplicate detection, role assignment, source tracking, delete semantics, and module linking.

Expected service location:
Use the existing server service conventions. Prefer something like:
`web/src/server/services/event-directory.ts`
unless the repo has a more appropriate service location.

Required service capabilities:

1. List/search/filter people
   - event-scoped
   - supports search by name/email/company
   - supports role filter
   - supports source filter
   - supports status filter
   - returns role chips/source labels/status/last updated for list UI

2. Get person detail
   - profile fields
   - roles
   - sources
   - external identities
   - module links

3. Create person
   - event-scoped
   - supports initial roles
   - supports source label/type
   - normalizes email
   - checks for deterministic duplicate by normalized email in same event
   - returns possible existing match instead of silently creating duplicate when appropriate

4. Update person
   - validates event scope
   - normalizes email
   - prevents cross-event writes
   - handles potential email conflict safely

5. Delete/remove person
   - explicit safe delete semantics
   - hard delete only when safe and local-only with no downstream usage
   - otherwise mark removed or reject with dependency info
   - do not delete historical send recipient data
   - do not pretend to delete external registration records

6. Add/remove roles
   - idempotent role add
   - scoped to event/person
   - removing one role must not delete the person if other roles remain

7. Source handling
   - create/reuse source records by event/type/label
   - source is separate from role

8. Duplicate detection
   - same provider/external id = same person
   - same normalized email in event = likely same person
   - same name/company = possible duplicate, do not auto-merge

9. Merge people
   - move roles, external identities, module links where safe
   - keep import history
   - mark old person removed/merged if hard delete is not safe

10. Module linking
   - link a directory person to existing Speaker, SeatingAttendee, EventPerson records
   - enforce uniqueness by event/module/moduleRecordId

Access/security:

- Follow existing event access patterns.
- Server must enforce event read/write access.
- Route handlers later should stay thin and call this service.
- Do not rely on UI-only checks.

Tests:

Add targeted service/API-level tests if this repo has an established pattern. At minimum cover:

- create person with role/source
- prevent cross-event access/mutation
- duplicate email detection
- add same role twice is idempotent
- remove role does not delete person
- delete blocked or soft-handled when linked to module records
- merge moves roles/module links safely

Deliverables:

- Event Directory service file(s)
- shared validation/types if needed
- tests for critical service behavior
- final response listing changed files and behavior covered

Do not build UI yet.

---

# Prompt 3 — Event Directory API Routes

Model: Claude Opus
Reasoning: Medium-High

Add API routes for the Event Directory MVP using the canonical service layer. Keep route handlers thin.

Goal:
Expose event-scoped Directory endpoints for list, detail, create, update, delete/remove, role management, import batch visibility, and merge operations.

Suggested routes:

- `GET /api/events/[eventId]/directory`
- `POST /api/events/[eventId]/directory/people`
- `GET /api/events/[eventId]/directory/people/[personId]`
- `PATCH /api/events/[eventId]/directory/people/[personId]`
- `DELETE /api/events/[eventId]/directory/people/[personId]`
- `POST /api/events/[eventId]/directory/people/[personId]/roles`
- `DELETE /api/events/[eventId]/directory/people/[personId]/roles/[roleId]`
- `POST /api/events/[eventId]/directory/people/[personId]/merge`
- `GET /api/events/[eventId]/directory/imports/[batchId]`
- `GET /api/events/[eventId]/directory/imports/[batchId]/rows`

If the repo prefers a different route structure, match existing conventions while preserving the same API capabilities.

Route rules:

- Resolve authenticated user using existing project helpers.
- Enforce event read/write access server-side.
- Validate inputs with existing validation patterns.
- Call the event-directory service for business logic.
- Return structured errors that the UI can handle.
- Do not duplicate service rules in routes.

Expected response behavior:

- List endpoint returns enough for the table: name, email, company, title, roles, source labels, status, last updated.
- Detail endpoint returns full profile, roles, sources, external identities, and module links.
- Create endpoint can return duplicate-match/conflict information when the service detects an existing person.
- Delete endpoint should return whether the person was hard deleted, soft removed, or blocked due to dependencies.
- Role endpoints should be idempotent where reasonable.

Tests:

Add route tests if the repo has API route testing patterns. Cover:

- event read access required for list/detail
- event write access required for create/update/delete/role/merge
- cross-event person id rejected
- duplicate create response
- role add/remove
- delete dependency behavior

Deliverables:

- API route files
- any route validation schemas/types
- tests for route contracts where practical
- final response listing endpoints and changed files

Do not build the UI in this pass.

---

# Prompt 4 — Directory UI MVP

Model: Claude Opus
Reasoning: Medium-High

Build the Event Directory MVP UI. Use the API routes and service behavior already created. Do not build CSV import in this pass unless the endpoint already exists; add the button/modal shell only if needed.

Goal:
Add a clickable Directory module inside the event workspace and build the core list/detail/manual CRUD experience.

Required UI:

1. Event navigation
   - Add Directory as an event workspace module.
   - Route: `/events/:eventId/directory` or match existing route conventions.

2. Directory page
   - Summary cards: Total people, Attendees/Registrants, Speakers, Sponsors/Exhibitors, VIP/Press, Needs Review.
   - Search input.
   - Role filter.
   - Source filter.
   - Status filter.
   - Add person button.
   - Import people button or placeholder if CSV import is next prompt.

3. Directory table/list
   - Columns: Name, Email, Company, Title, Roles, Source, Status, Last Updated, Actions.
   - Role chips should be visually distinct and readable.
   - Source labels should make it clear where the person came from.
   - Needs review / duplicate review status should be obvious.

4. Add person flow
   - Modal or drawer.
   - Fields: first name, last name, email, phone, company, title, roles, source label/type if needed.
   - If API returns possible duplicate, show a clear choice: use existing person/add role vs create new if allowed.

5. Edit person flow
   - Modal or drawer.
   - Update profile fields.
   - Manage roles.
   - Show source/sync info as read-only if not editable.

6. Person detail drawer
   - Profile summary.
   - Roles.
   - Source/sync.
   - Linked records/modules.
   - Placeholder for future Sessions/Seating/Portal sections only if helpful.

7. Delete/remove flow
   - Clear confirmation.
   - Copy must distinguish delete person vs remove role when relevant.
   - Handle service response: hard deleted, soft removed, blocked due to dependencies.

UX rules:

- Do not call imported marketing contacts attendees unless they have ATTENDEE or REGISTRANT role.
- Do not overload the page with future attendee portal or registration features.
- Keep the MVP clean but robust.
- No fake success before server confirms.
- Show useful empty states.

Tests:

Add component/UI tests if established. Cover:

- page renders
- filters/search call expected API params
- add person success
- duplicate response UI
- edit person success
- delete/remove response handling
- role chips render correctly

Deliverables:

- Directory route/page/components
- event nav update
- UI API client hooks/helpers if needed
- tests where practical
- final response with changed files and UX summary

Do not build full CSV import processing in this pass.

---

# Prompt 5 — CSV Import And Merge Results

Model: Claude Opus
Reasoning: High

Build the CSV import experience for Event Directory.

Goal:
Allow planners to upload people into the Event Directory, choose what kind of people they are importing, merge deterministic matches, and clearly show created/updated/duplicate/invalid rows.

Required UX:

1. Import entry
   - From Directory page, `Import people` opens modal/drawer.

2. Import setup
   - Source label, required.
   - Target role, required. Options should include ATTENDEE, REGISTRANT, SPEAKER, EXHIBITOR_CONTACT, SPONSOR_CONTACT, STAFF, VIP, PRESS, PROSPECT, MARKETING_CONTACT, SEATING_GUEST.
   - Source type defaults to CSV_IMPORT.

3. CSV upload
   - Parse headers.
   - Support common columns: first name, last name, full name, email, phone, company, title.
   - Require at least email or a usable name.

4. Field mapping
   - Auto-map obvious headers.
   - Allow user adjustment.

5. Preview
   - Show sample rows before import.
   - Highlight missing required identity fields.

6. Import/merge
   - Normalize email.
   - Match same event + normalized email as update/merge candidate.
   - Create new person when no match.
   - Same name/company without email should become possible duplicate/review, not auto-merged.
   - Add selected role idempotently.
   - Create/reuse source record.
   - Track import batch and row results.

7. Results screen
   - Created count.
   - Updated count.
   - Duplicate review count.
   - Invalid count.
   - Skipped count.
   - Row-level table with row number, name, email, company, result, error/reason.

8. Re-import behavior
   - Re-importing corrected CSV should update existing people by normalized email instead of forcing a new audience/list.
   - Wrong imported emails should be fixable by editing the person later and/or re-importing.

API/service:

- Add endpoints needed for CSV upload/process if not already present.
- Keep parsing/validation in a service or helper, not scattered in UI.
- Keep import rows persisted so users can revisit results.

Safety:

- Do not call imported marketing contacts attendees unless the selected role is ATTENDEE or REGISTRANT.
- Do not delete anyone during import.
- Do not auto-merge ambiguous duplicates.
- Do not create duplicate roles on re-import.

Tests:

Cover:

- header mapping
- create rows
- update existing by email
- duplicate review for ambiguous no-email/name-company match
- invalid rows shown
- role idempotency on re-import
- import batch counts are correct
- event access enforced

Deliverables:

- Import modal/drawer
- CSV parser/mapping helpers
- API routes/service functions for import
- import results UI
- tests
- final response with changed files and behavior covered

---

# Prompt 6 — Backfill And Module Bridges

Model: Claude Opus
Reasoning: High

Backfill existing people-like module data into Event Directory and create safe bridges to current modules.

Goal:
Existing Speakers, SeatingAttendees, and EventPerson/staff records should be represented in Event Directory without breaking existing module behavior.

Important:
Do not remove or rewrite the existing Speaker, Seating, or Staffing flows in this pass. This is a bridge/backfill pass.

Required backfills:

1. Speakers
   - For each existing event-scoped Speaker, create or match EventDirectoryPerson.
   - Add SPEAKER role.
   - Create/reuse source type SPEAKER_MODULE.
   - Create EventDirectoryModuleLink to the Speaker record.
   - Do not break SessionSpeakerAssignment.

2. SeatingAttendees
   - For each existing event-scoped SeatingAttendee, create or match EventDirectoryPerson.
   - Add SEATING_GUEST role.
   - Create/reuse source type SEATING_MODULE.
   - Create EventDirectoryModuleLink to the SeatingAttendee record.
   - Do not break SeatingAssignment or SeatingPlan flows.

3. EventPerson / Staffing
   - For each existing EventPerson used for staffing, create or match EventDirectoryPerson.
   - Add STAFF role.
   - Create/reuse source type STAFFING_MODULE.
   - Create EventDirectoryModuleLink to the EventPerson record.
   - Do not break SessionStaffAssignment.

Matching rules:

- Same event + normalized email first.
- If no email, same name/company can be used as possible match only when safe; otherwise create with review status.
- Do not auto-merge ambiguous people.
- Do not create duplicate module links.
- Role adds must be idempotent.

Implementation shape:

- Add explicit service functions for backfill.
- Add migration/backfill script if needed.
- Make the script safe to run more than once.
- Log summary counts: created, matched, role added, links created, skipped, needs review.

Possible UI bridge:

- Directory detail should show linked records.
- If easy and safe, speaker/seating/staff picker surfaces can begin showing linked directory context, but do not force this if it creates too much blast radius.

Tests:

Cover:

- speaker backfill creates person + SPEAKER role + module link
- seating backfill creates person + SEATING_GUEST role + module link
- EventPerson backfill creates person + STAFF role + module link
- running backfill twice does not duplicate people/roles/links
- existing module assignments still resolve after backfill
- cross-event records do not link incorrectly

Deliverables:

- Backfill service/script
- module link creation
- idempotency tests
- final response with changed files, command to run backfill if needed, and summary of protected existing flows

## Recommended Execution Order

1. Prompt 1: schema proposal/migration.
2. Review migration carefully.
3. Prompt 2: service layer.
4. Prompt 3: API routes.
5. Prompt 4: UI MVP.
6. Prompt 5: CSV import.
7. Prompt 6: backfill/module bridges.
8. Then start Attendee module plan on top of Directory.

## Acceptance Criteria For Directory MVP

Directory MVP is ready when:

- Directory appears in the event workspace nav.
- A planner can view all directory people for an event.
- A planner can manually add/edit/delete/remove people.
- A person can have multiple roles.
- CSV imports can create/update people and show invalid/duplicate results.
- Re-import does not create duplicate role assignments.
- Speakers, seating guests, and staff can be backfilled/linked to directory people.
- Directory list supports search and filters.
- Duplicate matching is deterministic and safe.
- Event access is enforced server-side.
- Tests cover create/update/delete, role assignment, import merge, duplicate handling, and backfill idempotency.
- Existing Speaker, Seating, and Staffing flows still work.

