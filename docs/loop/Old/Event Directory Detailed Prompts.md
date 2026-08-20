# Event Directory MVP — Detailed Implementation Prompts

This document contains the six implementation prompts for the Event Directory MVP. Use them in order. Do not combine them into one giant pass.

## How To Use This Doc

Start with Prompt 1 and review each pass before moving to the next. The Directory work touches schema, service rules, API routes, UI, CSV import, and existing module bridges, so each prompt intentionally limits scope.

### Required Setup Before Prompt 1

Run these before the first prompt so Opus starts from the right state and does not accidentally mix this with unrelated local work:

```bash
cd "/Users/ali/Documents/God Emperor of Dune /planner-os"
git status --short
```

If the working tree is clean, create a feature branch:

```bash
git switch -c feat/event-directory-mvp
```

If there are existing local changes, do not overwrite them. Stop and summarize what is dirty first.

## Global Rules For Every Prompt

- Event Directory is the canonical event-level people/contact layer.
- A person should exist once per event and have many roles.
- Do not build a separate attendee universe.
- Do not call imported marketing contacts “attendees” unless they have an ATTENDEE or REGISTRANT role.
- Do not break existing Speaker, Seating, or Staffing flows.
- Do not remove Speaker, SeatingAttendee, EventPerson, SessionSpeakerAssignment, SeatingAssignment, or SessionStaffAssignment in the MVP.
- Server-side services must enforce business rules and event access. UI checks are not enough.
- Route handlers should stay thin: auth, event access, validation, service call, structured response.
- Do not use JSON blobs for core relational entities.
- Do not auto-merge ambiguous duplicates.
- Do not delete historical send-recipient history.
- Do not pretend local edits/deletes affected an external registration platform unless an integration capability explicitly supports it.
- No attendee portal, session registration UX, automatic scheduled sending, full registration integration writeback, badge/check-in, or advanced segmentation in this MVP.
- Add targeted tests in each pass where practical.
- Every final response from Opus should include changed files, test coverage, and anything intentionally deferred.

---

# Prompt 1 — Schema Proposal And Migration

Model: Claude Opus
Reasoning: High

We need to add an Event Directory MVP to Planner OS / Planner Dash.

Schema changes are allowed for this feature, but they must be deliberate, migration-safe, and reviewed. Do not implement API routes or UI in this pass.

## Goal

Create the schema foundation for Event Directory as the canonical event-level people/contact layer. A person should exist once per event and have many roles. This will later support attendees, registration integrations, speakers, seating guests, staff, sponsors, exhibitors, VIPs, press, marketing contacts, and attendee portal users.

## Current Context

The app is a Next.js App Router application backed by Prisma/PostgreSQL.

Schema copies exist at:

- `prisma/schema.prisma`
- `web/prisma/schema.prisma`

Current people-like models include:

- `Speaker`
- `SeatingAttendee`
- `EventPerson`
- `SessionSpeakerAssignment`
- `SessionStaffAssignment`
- `SeatingAssignment`

Do not remove or break those models. The Directory MVP should bridge to them later.

## Inspect First

Before editing schema, inspect:

- current Prisma model naming conventions
- current enum naming conventions
- current UUID/default conventions
- current org/client/event relation conventions
- current soft-delete/status patterns
- current indexes/unique constraints on event-scoped models
- current migration naming style

## Add Normalized Models / Enums

Add the following concepts. Exact field names can follow repo conventions, but responsibilities should remain intact.

### 1. EventDirectoryPerson

Canonical event-scoped person/contact record.

Suggested fields:

- `id`
- `orgId`
- `clientId` nullable if event/client relationship is optional in current schema
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
- `createdByUserId` nullable if current patterns support it
- `updatedByUserId` nullable if current patterns support it

Suggested status enum:

- `ACTIVE`
- `NEEDS_REVIEW`
- `DUPLICATE_REVIEW`
- `REMOVED`
- `MERGED`

Notes:

- Email must be nullable because some seating guests/staff may not have email.
- `normalizedEmail` should be nullable and derived by service logic.
- Do not make email the only identity mechanism.

### 2. EventDirectoryRole

Many roles per person.

Suggested fields:

- `id`
- `eventId`
- `personId`
- `role`
- `sourceId` nullable
- `createdAt`
- `createdByUserId` nullable if project pattern supports it

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

Rules:

- `ATTENDEE` / `REGISTRANT` means the person is actually part of attendance or registration.
- `MARKETING_CONTACT` / `PROSPECT` means imported/targeted contact, not necessarily registered.
- One person can have multiple roles.
- Role add should be idempotent later, so add a uniqueness strategy if safe, likely `(eventId, personId, role)`.

### 3. EventDirectorySource

Tracks where the person/role/import came from.

Suggested fields:

- `id`
- `eventId`
- `type`
- `label`
- `provider` nullable
- `createdAt`
- `createdByUserId` nullable if project pattern supports it

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

Rules:

- Source is not the same as role.
- A CSV import may create attendees, speakers, VIPs, staff, prospects, etc.
- Source labels are user-facing, e.g. “Initial attendee upload”, “VIP list”, “Cvent registrants”.

### 4. EventDirectoryExternalIdentity

Supports future registration/external-system sync.

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

Rules:

- External identities should be unique by event/provider/external id when external id exists.
- Do not build real integration sync in this pass.
- This is an identity/capability foundation only.

### 5. EventDirectoryImportBatch

Tracks CSV import/re-import summary.

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

### 6. EventDirectoryImportRow

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

### 7. EventDirectoryModuleLink

Bridge current module-specific records to directory people without immediately deleting old models.

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

Rules:

- Module links should be unique by `(eventId, module, moduleRecordId)`.
- This model allows backfill/bridge without breaking existing flows.

## Indexes / Constraints

Add indexes for event-scoped access and list performance:

- `(eventId, normalizedEmail)`
- `(eventId, status)`
- `(eventId, company)` if practical
- role lookups by `(eventId, role)` or through the role table
- source lookups by `(eventId, type)` and/or `(eventId, label)`
- external identity lookup by `(eventId, provider, externalPersonId)`
- module link lookup by `(eventId, module, moduleRecordId)`

Do not add a hard unique normalized email constraint if it would break shared emails, missing emails, family contacts, assistant emails, or duplicate real-world records. Prefer service-level duplicate detection unless a safe partial unique constraint fits the repo and DB conventions.

## Migration Requirements

- Update both Prisma schema copies.
- Create a production-safe migration.
- Do not include destructive changes to existing people-like models.
- Do not backfill in this migration unless it is safe and intentionally reviewed.
- Include comments/notes in the final response explaining backfill strategy for later.
- Run Prisma generate if that is standard in this repo.

## Tests / Verification

Add or identify tests/verification that cover:

- migration applies cleanly
- Prisma client generation succeeds
- schema copies stay in sync
- indexes/constraints exist as intended

## Deliverables

- Prisma schema updates in both schema copies.
- New migration with models/enums/indexes/constraints.
- Generated Prisma client updates if applicable.
- Final response with:
  - changed files
  - rationale
  - migration approach
  - backfill considerations
  - rollback/remediation notes
  - test/verification results

Do not build API routes, services beyond generated types, or UI in this pass.

---

# Prompt 2 — Event Directory Service Layer

Model: Claude Opus
Reasoning: High

Build the canonical server/service layer for the Event Directory. Do not build UI in this pass.

## Goal

Create one authoritative service boundary that owns Event Directory business rules, identity matching, duplicate detection, role assignment, source tracking, delete semantics, module linking, and future integration-readiness.

## Expected Location

Use existing server service conventions. Prefer:

`web/src/server/services/event-directory.ts`

unless the repo clearly uses a different pattern for event-scoped services.

## Inspect First

Inspect existing service patterns for:

- `speakers`
- `seating`
- `budget`
- `timeline`
- `event-access`
- request user / auth helpers
- validation patterns
- error response conventions
- activity/audit patterns, if present

Do not duplicate business rules in routes later. This service should become the source of truth.

## Required Service Capabilities

### 1. List/Search/Filter People

Create a function similar to:

`listEventDirectoryPeople({ eventId, user, search, role, sourceId, sourceType, status, limit, cursor })`

It should:

- enforce event read access or be designed to be called only after access is enforced, matching repo convention
- scope every query by `eventId`
- search by display name, first/last name, email, and company
- filter by role
- filter by source/source type
- filter by status
- return list-ready data:
  - person id
  - display name
  - email
  - company
  - title
  - roles
  - source labels/types
  - status
  - last updated

### 2. Get Person Detail

Create a function similar to:

`getEventDirectoryPerson({ eventId, personId, user })`

It should return:

- profile fields
- roles
- sources
- external identities
- module links
- import/source references where relevant

Reject cross-event person IDs.

### 3. Create Person

Create a function similar to:

`createEventDirectoryPerson({ eventId, user, input })`

It should:

- enforce event write access
- normalize email by trimming/lowercasing
- derive display name if needed
- support initial roles
- support source type/label creation or reuse
- detect deterministic duplicate by same event + normalized email
- return a structured duplicate/match result instead of silently creating a duplicate when appropriate
- allow no-email people if they have enough name information
- validate that marketing contacts are not labeled as attendees unless ATTENDEE/REGISTRANT role is selected

Suggested return shape:

- `{ status: "created", person }`
- `{ status: "possible_duplicate", existingPerson, suggestedAction }`
- `{ status: "updated_existing", person }` if caller explicitly chooses that behavior later

### 4. Update Person

Create a function similar to:

`updateEventDirectoryPerson({ eventId, personId, user, input })`

It should:

- enforce event write access
- reject cross-event person IDs
- normalize email on update
- handle email conflict safely
- not silently merge people
- not silently mutate external source of truth
- update `updatedByUserId` if that pattern exists

If an integration-sourced person is later marked read-only, the service should be ready to block or return a structured read-only response. Do not implement real provider writeback now.

### 5. Delete / Remove Person

Create a function similar to:

`deleteEventDirectoryPerson({ eventId, personId, user })`

Delete semantics must be explicit:

- hard delete only if local-only and no downstream usage/module links/import history that should be preserved
- otherwise soft remove/mark `REMOVED`
- block delete with dependency info when necessary
- do not delete already-sent email recipient history
- do not cancel/delete in external registration systems

Suggested return shape:

- `{ status: "hard_deleted" }`
- `{ status: "soft_removed", person }`
- `{ status: "blocked", dependencies: [...] }`

### 6. Add / Remove Roles

Create functions similar to:

- `addEventDirectoryRole({ eventId, personId, role, sourceId, user })`
- `removeEventDirectoryRole({ eventId, personId, roleId, user })`

Rules:

- role add should be idempotent
- removing one role must not delete the person if other roles remain
- reject cross-event person/role IDs
- preserve source information where possible

### 7. Source Handling

Create function(s) to create/reuse source records by event/type/label.

Rules:

- source is separate from role
- source labels are user-facing
- do not create endless duplicate source rows for the same event/type/label unless intentional

### 8. Duplicate Detection

Create deterministic duplicate helper(s):

- same event + same provider + external id = same person
- same event + normalized email = likely same person
- same event + same normalized name/company = possible duplicate only
- no email = allowed but weaker identity

Do not auto-merge ambiguous duplicates.

### 9. Merge People

Create a function similar to:

`mergeEventDirectoryPeople({ eventId, sourcePersonId, targetPersonId, user })`

Rules:

- move roles where safe
- move external identities where safe
- move module links where safe
- preserve import row history
- mark source person as `MERGED` or `REMOVED` if hard delete is unsafe
- do not lose audit/history
- reject cross-event merges

### 10. Module Linking

Create a function similar to:

`linkDirectoryPersonToModuleRecord({ eventId, personId, module, moduleRecordId, user })`

Rules:

- enforce uniqueness by event/module/moduleRecordId
- idempotent if the same link already exists
- reject links to a person in another event

## Tests

Add targeted service tests following repo conventions. Cover:

- create person with role/source
- create no-email person with valid name
- duplicate email detection in same event
- duplicate email does not cross event boundaries
- add same role twice is idempotent
- remove role does not delete person
- update rejects cross-event person id
- delete is blocked or soft-handled when module links exist
- merge moves roles/module links safely
- source creation/reuse works

## Deliverables

- Event Directory service file(s)
- shared types/validation helpers if needed
- tests for critical service behavior
- final response with changed files, test results, and anything deferred

Do not build API routes or UI in this pass.

---

# Prompt 3 — Event Directory API Routes

Model: Claude Opus
Reasoning: Medium-High

Add API routes for the Event Directory MVP using the canonical service layer. Keep route handlers thin.

## Goal

Expose event-scoped Directory endpoints for list, detail, create, update, delete/remove, role management, import batch visibility, and merge operations.

## Route Structure

Use the project’s existing App Router API conventions. Suggested routes:

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

If the repo prefers a different route shape, match the repo convention while preserving these capabilities.

## Route Rules

Every route should:

1. Resolve the authenticated user using existing helpers.
2. Enforce event read/write access server-side.
3. Validate input using existing validation patterns.
4. Call the canonical Event Directory service.
5. Return structured JSON responses.
6. Avoid duplicating service rules in the route.

## Endpoint Behavior

### GET `/directory`

Query params should support:

- search
- role
- source/sourceType
- status
- pagination if project pattern exists

Return table-ready rows:

- person id
- name/display name
- email
- company
- title
- roles
- source labels/types
- status
- last updated

Also return summary counts if easy and efficient:

- total people
- attendees/registrants
- speakers
- sponsors/exhibitors
- VIP/press
- needs review

If counts would make the query too heavy, add a separate helper or defer with clear note.

### POST `/directory/people`

Creates a person or returns duplicate-match information.

Input should support:

- first name
- last name
- display name/full name if needed
- email
- phone
- company
- title
- initial roles
- source type/label

Response should support:

- created
- possible duplicate
- validation error

### GET/PATCH/DELETE `/directory/people/[personId]`

Rules:

- reject cross-event person IDs
- PATCH should normalize email through service
- DELETE should return hard deleted / soft removed / blocked with dependencies

### Role endpoints

Rules:

- add role idempotently where reasonable
- remove role without deleting the person
- reject cross-event role/person IDs

### Merge endpoint

Input:

- target person id

Rules:

- source person comes from URL
- target person comes from body
- service owns merge behavior
- reject cross-event merges

### Import visibility endpoints

These can return stored import batch and row results. Full CSV processing comes in Prompt 5.

## Error Semantics

Use stable error codes/messages the UI can handle, for example:

- `EVENT_ACCESS_DENIED`
- `DIRECTORY_PERSON_NOT_FOUND`
- `DIRECTORY_PERSON_EVENT_MISMATCH`
- `DIRECTORY_DUPLICATE_FOUND`
- `DIRECTORY_DELETE_BLOCKED`
- `DIRECTORY_ROLE_INVALID`
- `DIRECTORY_IMPORT_NOT_FOUND`

Match existing project style if it has one.

## Tests

Add route tests if route testing patterns exist. Cover:

- read access required for list/detail
- write access required for create/update/delete/role/merge
- cross-event person ID rejected
- duplicate create response surfaces correctly
- role add/remove endpoints work
- delete dependency behavior is returned correctly
- import batch/row visibility is event-scoped

## Deliverables

- API route files
- route validation schemas/types if needed
- tests for route contracts where practical
- final response listing endpoints, changed files, and test results

Do not build the UI in this pass.

---

# Prompt 4 — Directory UI MVP

Model: Claude Opus
Reasoning: Medium-High

Build the Event Directory MVP UI. Use the API routes and service behavior already created. Do not build CSV import processing in this pass; add the Import button/modal shell only if needed.

## Goal

Add a clickable Directory module inside the event workspace and build the core list/detail/manual CRUD experience.

## Inspect First

Inspect existing event workspace pages/components for:

- event nav pattern
- table/list styling
- drawer/modal conventions
- form components
- loading/empty/error states
- fetch/API client conventions
- role/status chip styling in other modules

Use existing product styling. Do not introduce a totally separate design system.

## Required UI

### 1. Event Navigation

Add Directory as an event workspace module.

Route should be:

`/events/:eventId/directory`

or the closest matching existing route convention.

### 2. Directory Page

The page should include:

- page title: Directory
- short description: canonical people/contact layer for this event
- summary cards:
  - Total people
  - Attendees/Registrants
  - Speakers
  - Sponsors/Exhibitors
  - VIP/Press
  - Needs Review
- search input
- role filter
- source filter
- status filter
- Add person button
- Import people button or disabled/coming-next shell if CSV import route is not ready

### 3. Directory Table/List

Columns:

- Name
- Email
- Company
- Title
- Roles
- Source
- Status
- Last Updated
- Actions

Rules:

- Role chips should be readable and visually distinct.
- Source labels should make origin clear.
- Needs review / duplicate review should be obvious.
- Empty state should explain what Directory is and offer Add person / Import people.
- Loading state should not jump or look broken.

### 4. Add Person Flow

Use modal or drawer, matching the app’s existing pattern.

Fields:

- first name
- last name
- email
- phone
- company
- title
- roles
- source label/type if needed

Behavior:

- Save only after server confirms.
- Show validation errors clearly.
- If API returns possible duplicate, show clear choices:
  - use existing person / add selected role to existing
  - cancel
  - create separate person only if service/API explicitly allows it

### 5. Edit Person Flow

Use modal/drawer.

Must support:

- profile field edits
- role management
- showing source/sync info as read-only where appropriate
- conflict/validation handling from API

### 6. Person Detail Drawer

MVP sections:

- Profile summary
- Roles
- Source/sync
- Linked module records

Future sections may be shown as muted placeholders only if helpful:

- Sessions
- Seating
- Portal
- Email history

Do not build future portal/session registration behavior.

### 7. Delete / Remove Flow

Use clear confirmation.

Copy must distinguish:

- delete person
- remove role
- soft removed because linked records exist
- blocked because dependencies exist

Handle API responses:

- hard deleted
- soft removed
- blocked with dependencies

## UX Rules

- Do not call imported marketing contacts attendees unless ATTENDEE or REGISTRANT role exists.
- Do not overload the page with attendee portal or registration features.
- Do not fake success before server confirmation.
- Do not hide server errors.
- Keep the MVP clean, fast, and easy to scan.

## Tests

Add component/UI tests if established. Cover:

- Directory page renders
- filters/search produce expected API params
- empty state renders
- add person success
- duplicate response UI renders
- edit person success
- delete/remove response handling
- role chips render correctly
- source labels render correctly

## Deliverables

- Directory route/page/components
- event nav update
- UI API client hooks/helpers if needed
- tests where practical
- final response with changed files, UX summary, and test results

Do not build full CSV import processing in this pass.

---

# Prompt 5 — CSV Import And Merge Results

Model: Claude Opus
Reasoning: High

Build the CSV import experience for Event Directory.

## Goal

Allow planners to upload people into the Event Directory, choose what kind of people they are importing, merge deterministic matches, and clearly show created/updated/duplicate/invalid rows.

## Required UX

### 1. Import Entry

From the Directory page, `Import people` opens a modal or drawer.

### 2. Import Setup

Required fields:

- Source label
- Target role

Target role options:

- ATTENDEE
- REGISTRANT
- SPEAKER
- EXHIBITOR_CONTACT
- SPONSOR_CONTACT
- STAFF
- VIP
- PRESS
- PROSPECT
- MARKETING_CONTACT
- SEATING_GUEST

Source type defaults to `CSV_IMPORT`.

Important copy rule:

- If the user selects MARKETING_CONTACT or PROSPECT, call them contacts/prospects, not attendees.
- Only ATTENDEE or REGISTRANT should use attendee/registrant language.

### 3. CSV Upload

Support CSV file upload and parsing.

Common columns to support:

- first name
- last name
- full name
- email
- phone
- company
- title

Require at least:

- email, or
- usable full name, or
- first name + last name

### 4. Field Mapping

- Auto-map obvious headers.
- Allow user adjustment.
- Show unmapped columns clearly.
- Do not require perfect header names.

### 5. Preview

Before import:

- show sample rows
- show mapped columns
- highlight missing identity fields
- show estimated invalid rows if possible

### 6. Import / Merge Rules

Service/import logic should:

- normalize email
- match same event + normalized email as update/merge candidate
- create new person when no match exists
- same name/company without email should become duplicate review, not auto-merge
- add selected role idempotently
- create/reuse source record
- create import batch
- create import row results
- not delete anyone during import
- not create duplicate roles on re-import

### 7. Results Screen

After import, show:

- Created count
- Updated count
- Duplicate review count
- Invalid count
- Skipped count

Row-level table should show:

- row number
- name
- email
- company
- result
- error/reason

Users must be able to understand what failed and why.

### 8. Re-import Behavior

Re-importing a corrected CSV should:

- update existing people by normalized email
- add missing roles idempotently
- not force creation of a new audience/list/source unless the user intentionally changes the source label
- allow wrong imported emails to be fixed later through edit and/or corrected re-import behavior

## API / Service Requirements

Add endpoints needed for CSV upload/process if not already present.

Suggested additions:

- `POST /api/events/[eventId]/directory/imports`
- maybe `POST /api/events/[eventId]/directory/imports/preview` if preview is server-backed

Keep parsing and validation in a service/helper, not scattered inside UI components.

Persist import batches and rows so users can revisit results.

## Safety Rules

- Do not call imported marketing contacts attendees unless selected role is ATTENDEE or REGISTRANT.
- Do not auto-merge ambiguous duplicates.
- Do not delete anyone during import.
- Do not create duplicate roles on re-import.
- Enforce event access server-side.

## Tests

Cover:

- header mapping
- create rows
- update existing by normalized email
- duplicate review for ambiguous no-email/name-company match
- invalid rows shown
- role idempotency on re-import
- import batch counts are correct
- event access enforced
- marketing contact copy/role behavior does not label contacts as attendees

## Deliverables

- Import modal/drawer
- CSV parser/mapping helpers
- API routes/service functions for import
- import results UI
- tests
- final response with changed files, behavior covered, and test results

---

# Prompt 6 — Backfill And Module Bridges

Model: Claude Opus
Reasoning: High

Backfill existing people-like module data into Event Directory and create safe bridges to current modules.

## Goal

Existing Speakers, SeatingAttendees, and EventPerson/staff records should be represented in Event Directory without breaking existing module behavior.

This is a bridge/backfill pass. Do not remove or rewrite the existing Speaker, Seating, or Staffing flows.

## Required Backfills

### 1. Speakers

For each existing event-scoped `Speaker`:

- create or match `EventDirectoryPerson`
- add `SPEAKER` role
- create/reuse source type `SPEAKER_MODULE`
- create `EventDirectoryModuleLink` to the Speaker record
- do not break `SessionSpeakerAssignment`

### 2. SeatingAttendees

For each existing event-scoped `SeatingAttendee`:

- create or match `EventDirectoryPerson`
- add `SEATING_GUEST` role
- create/reuse source type `SEATING_MODULE`
- create `EventDirectoryModuleLink` to the SeatingAttendee record
- do not break `SeatingAssignment` or `SeatingPlan` flows

### 3. EventPerson / Staffing

For each existing `EventPerson` used for staffing:

- create or match `EventDirectoryPerson`
- add `STAFF` role
- create/reuse source type `STAFFING_MODULE`
- create `EventDirectoryModuleLink` to the EventPerson record
- do not break `SessionStaffAssignment`

## Matching Rules

Use deterministic matching:

1. Same event + normalized email first.
2. Existing module link if already present.
3. If no email, same name/company can be possible match only when safe.
4. Ambiguous no-email/name matches should create review status or be skipped with a clear reason.
5. Do not auto-merge ambiguous people.
6. Do not create duplicate module links.
7. Role adds must be idempotent.

## Implementation Shape

Add explicit service functions, for example:

- `backfillDirectoryFromSpeakers`
- `backfillDirectoryFromSeatingAttendees`
- `backfillDirectoryFromEventPeople`
- `backfillEventDirectoryForEvent`

Add a backfill script if needed.

Script requirements:

- safe to run more than once
- scoped by event or supports all events safely
- logs summary counts:
  - created
  - matched
  - role added
  - links created
  - skipped
  - needs review
- does not delete or rewrite source module records

## Possible UI Bridge

Directory detail should show linked records if not already done.

If easy and safe, speaker/seating/staff picker surfaces can begin showing linked directory context, but do not force this if it creates too much blast radius.

Do not replace existing pickers yet unless it is clearly low-risk.

## Tests

Cover:

- speaker backfill creates person + SPEAKER role + module link
- seating backfill creates person + SEATING_GUEST role + module link
- EventPerson backfill creates person + STAFF role + module link
- running backfill twice does not duplicate people/roles/links
- existing module assignments still resolve after backfill
- cross-event records do not link incorrectly
- ambiguous no-email records are not auto-merged

## Deliverables

- Backfill service functions
- backfill script if needed
- module link creation
- idempotency tests
- final response with:
  - changed files
  - command to run backfill if needed
  - summary of protected existing flows
  - test results

---

# Recommended Execution Order

1. Prompt 1: Schema proposal/migration.
2. Review migration carefully before continuing.
3. Prompt 2: Service layer.
4. Prompt 3: API routes.
5. Prompt 4: UI MVP.
6. Prompt 5: CSV import.
7. Prompt 6: Backfill/module bridges.
8. Then start the Attendee module plan on top of Directory.

# Directory MVP Acceptance Criteria

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
