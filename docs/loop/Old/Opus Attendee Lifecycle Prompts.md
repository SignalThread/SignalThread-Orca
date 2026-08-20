# Planner OS Attendee Lifecycle Build Prompts for Opus

## How To Use This Document

Use these prompts sequentially with Opus.

The goal is to build the Attendee lifecycle system on top of the completed Event Directory work.

This is not a single-page attendee list. Attendee is the event participant lifecycle layer that connects:

- Event Directory
- Registration
- Marketing
- Sessions / Run of Show
- Seating
- Speakers
- Exhibitors / Sponsors later
- Future attendee portal

The prompts are intentionally structured as a loop:

1. Run the prompt.
2. Review Opus output.
3. Make sure the browser/app behavior matches the goal.
4. Let Opus fix any issues it finds in that same pass when reasonable.
5. Commit after a clean milestone, not after every tiny edit.

Do not over-constrain the implementation. Opus should make smart engineering decisions as long as it preserves the core product model.

---

## Global Product Rules

These rules apply to every prompt.

### Directory is the canonical person layer

Event Directory owns who the person is.

Attendee should not create another disconnected person identity system.

Core split:

```txt
EventDirectoryPerson = the human/person
EventAttendee = this person is participating in the event
EventRegistrationRecord = this person has registration/badge/order/provider state
Marketing = acquisition, audience membership, segmentation, conversion
Portal = attendee self-service access
Speaker / Exhibitor / Sponsor / VIP / Press = role/designation or module-specific operational context
```

### Roles are separate from attendance

A person can be:

- Speaker + Attendee
- Exhibitor + Attendee
- Sponsor + Attendee
- VIP + Attendee
- Press + Attendee
- Staff + Attendee

A speaker or exhibitor should appear in Attendee if they are attending, need a badge, need registration state, need portal access, need session enrollment, need seating, or need attendee communications.

### Registration is separate from Attendee

A person can be an attendee without an external registration record.

Examples:

- Manual attendee
- CSV uploaded attendee
- Speaker expected to attend but not yet registered
- Sponsor/exhibitor rep added by planner

A registration record should exist only when there is real registration, badge, order, or provider/source data.

### Contact is pre-registration

Contact means an event-tied lead/person who has not registered yet.

Once someone registers or is managed as attending, they need attendee participation state.

### Do not hardcode one provider

The model must be provider-aware but not Bizzabo-specific or Aura-specific.

Registration integrations should eventually support different provider capabilities:

- pull attendees
- create attendees
- update attendees
- cancel attendees
- pull sessions
- push sessions
- pull session registrations
- push session registrations
- webhooks
- badge/ticket/pass/order data

---

# Prompt 1 — Attendee Foundation Architecture + Data Model

```text
Model: Claude Opus
Reasoning: High

We finished the Event Directory module. Now build the Attendee lifecycle system on top of it.

Start with an architecture/data model pass and then implement the foundation if the direction is straightforward.

Do not treat Attendee as a standalone people module. Attendee is the event participation layer over Event Directory.

Core model:
- EventDirectoryPerson = canonical human/person identity.
- EventAttendee = this Directory person is participating in this event as an attendee/expected attendee/registered participant/etc.
- EventRegistrationRecord = registration/badge/order/provider state if it exists.
- A person can have multiple roles: Attendee, Speaker, Exhibitor, Sponsor, Staff, VIP, Press, Contact.
- Speaker/exhibitor/sponsor people can also be attendees.
- Registration status is not the same thing as role.
- Source is not the same thing as usage.

Goal for this pass:
1. Inspect the existing Event Directory implementation, models, services, API routes, and UI patterns.
2. Decide the cleanest schema additions for Attendee foundation.
3. Add the initial schema/migration if needed.
4. Keep the model provider-aware, but not provider-specific.
5. Set up the foundation for later registration integrations, marketing lifecycle, session enrollment, and portal access without fully building those yet.

Expected foundation concepts:
- EventAttendee or equivalent participation model.
- EventRegistrationRecord or equivalent registration/source model.
- Status/source/sync enums or fields if useful.
- Relations to Event, EventDirectoryPerson, and user/audit fields where appropriate.
- Enough external/source fields to support CSV/manual now and registration integrations later.

Do not overbuild:
- Do not build attendee portal yet.
- Do not build Bizzabo/Aura integration yet.
- Do not build marketing campaigns yet.
- Do not build session enrollment yet unless a tiny placeholder is necessary.

Implementation guidance:
- Use existing project patterns.
- Keep route handlers thin.
- Put business logic in service/helper layers.
- Keep both Prisma schema copies in sync if this repo uses two.
- Create a migration with a clear name.
- Run Prisma generate if needed.
- Prefer normalized relational data over JSON blobs for core entities.
- Add basic tests for the core model/service behavior if practical in this pass.

Important behavior:
- Creating an attendee should link to an existing Directory person when possible.
- Existing speakers/staff/etc. in Directory should not be duplicated.
- Attendee participation should be unique per event/person unless there is a clear reason otherwise.
- Registration records should not be required for manually added attendees.

At the end, report:
- Proposed/implemented data model
- Files changed
- Migration name
- Any open product or technical decision
- Tests/checks run
- What the next prompt should do
```

---

# Prompt 2 — Attendee Service + API Layer

```text
Model: Claude Opus
Reasoning: High

Continue the Attendee lifecycle build.

The Attendee foundation/schema should now exist or be partially in place. Build the server-side service and API layer.

Goal:
Create the canonical Attendee service/API layer that the UI, imports, integrations, and future portal can all use.

Required capabilities:
1. List attendees for an event.
2. Get attendee detail.
3. Create attendee from manual input.
4. Update attendee participation fields.
5. Update linked Directory person profile fields where appropriate.
6. Remove/delete/cancel attendee using the cleanest project-consistent behavior.
7. Create/update registration record when registration/source data is provided.
8. Preserve distinction between:
   - Directory profile fields
   - attendee participation fields
   - registration/provider fields
   - role/designation fields
   - module usage fields

Important behavior:
- Do not duplicate Directory people.
- Match/link by existing Directory person ID when provided.
- If no Directory person ID is provided, find or create a Directory person using existing Directory normalization/dedupe patterns.
- If a person is already a Speaker/Staff/etc., adding them as an attendee should add participation, not create a duplicate person.
- A registration record is optional.
- Manual attendees can be local-only.
- CSV/import attendees can be local/import-owned.
- Integration-owned attendees should have source/sync fields that future integration code can use.

Access/security:
- Event-scoped read/write access should follow existing project patterns.
- API routes should be thin.
- Business rules should live in the service layer.

Suggested API routes:
- GET/POST /api/events/:eventId/attendees
- GET/PATCH/DELETE /api/events/:eventId/attendees/:attendeeId
- Additional nested route only if it fits existing project conventions.

Tests:
Add focused tests for:
- creating attendee with new Directory person
- creating attendee linked to existing Directory person
- adding attendee participation to an existing speaker/staff/directory person
- optional registration record
- update behavior separates profile vs attendee fields
- delete/remove/cancel behavior
- event scoping/access if test patterns exist

At the end, report:
- Files changed
- API routes added/updated
- Service functions added
- Tests/checks run
- Any known gaps
- What the next prompt should do
```

---

# Prompt 3 — Manual Add + CSV Import + Dedupe

```text
Model: Claude Opus
Reasoning: High

Continue the Attendee lifecycle build.

Build the manual add and CSV attendee import flow on top of the Attendee service/API layer.

Goal:
Attendees can be added manually or imported by CSV without duplicating existing Event Directory people.

Manual add requirements:
- Add attendee from name/email/company/title/basic fields.
- Link to existing Directory person if selected/found.
- Create Directory person if needed.
- Create EventAttendee participation.
- Create EventRegistrationRecord only if registration-specific data exists.
- Assign or preserve roles correctly.
- Do not turn every attendee into Contact.
- Do not erase existing Speaker/Staff/VIP/Press/etc. roles.

CSV import requirements:
- Upload/parse CSV using existing project import patterns if available.
- Support reasonable column mapping for common attendee fields:
  - first name
  - last name
  - full name
  - email
  - company
  - title
  - phone
  - registration status
  - registration type/category
  - badge type
  - ticket/pass type
  - external registration ID
  - external person ID
  - source/provider if present
- Normalize names/emails.
- Match existing Event Directory people by email first, then safe fallback patterns.
- If a matching person exists, add/update attendee participation instead of duplicating.
- If a matching speaker exists, keep Speaker role and add Attendee participation.
- If a matching staff/sponsor/exhibitor/VIP/press person exists, preserve that role and add Attendee participation.
- Create registration records only when registration/provider data exists.
- Flag ambiguous duplicates/conflicts for review if the project already has a review pattern.
- Return useful import results: created, updated, skipped, conflicts, invalid rows.

Do not overbuild:
- No provider sync yet.
- No marketing campaign system yet.
- No attendee portal yet.

Tests:
Add focused tests for:
- CSV import creates attendees
- CSV import updates/link existing Directory people
- CSV import does not duplicate existing speakers
- CSV import creates registration records only when registration data exists
- invalid/missing email or name behavior
- duplicate rows behavior
- idempotency where reasonable

At the end, report:
- Files changed
- Import behavior implemented
- How duplicates are handled
- Tests/checks run
- Any known gaps
- What the next prompt should do
```

---

# Prompt 4 — Attendee List UI

```text
Model: Claude Opus
Reasoning: Medium

Continue the Attendee lifecycle build.

Build the operational Attendee list UI.

Route:
- /events/:eventId/attendees

Goal:
Create the main attendee command center page. It should be usable, clean, and integrated with the event workspace navigation.

This is not just a dumb table. It should communicate attendance/registration/source/sync state clearly.

Required UI:
1. Event nav entry for Attendees.
2. Attendees page route.
3. Page header with primary actions:
   - Add attendee
   - Import CSV
   - Future/disabled or secondary integration sync action only if it makes sense
4. Summary cards / quick filters:
   - Total attendees
   - Registered
   - Pending / waitlisted
   - Cancelled
   - VIP / Press
   - Missing email / needs review if supported
   - Sync conflicts if supported
5. Search and filters:
   - Search by name/email/company
   - Registration status
   - Registration type/category
   - Role/designation
   - Source
6. Table columns:
   - Name
   - Email
   - Company
   - Title
   - Role(s)
   - Registration status
   - Registration type/category
   - Source
   - Sync status if available
   - Used in modules if available
   - Last updated
   - Actions

Actions:
- View/detail
- Edit
- Remove/delete/cancel depending service behavior
- Import CSV
- Add attendee

Important behavior:
- Existing speakers who are attendees should show both Speaker role and attendee participation.
- Contact should not be shown as the main state for someone who is registered/attending.
- Source and usage should not be confused.
- Registration status should not be shown as role.
- The page must scroll correctly.
- Summary cards should be clickable filters if consistent with existing UI.
- Empty states should explain manual add and CSV import.

Do not overbuild:
- No attendee portal UI yet.
- No provider integration setup UI yet.
- No session enrollment UI yet.
- No marketing campaign UI yet.

Tests/checks:
- Add UI/component tests if the repo has patterns.
- Run TypeScript.
- Browser-check the route at a normal laptop viewport.
- Verify nav works.

At the end, report:
- Files changed
- Route added
- UI behavior
- Tests/checks run
- Any known gaps
- What the next prompt should do
```

---

# Prompt 5 — Attendee Detail + Edit Experience

```text
Model: Claude Opus
Reasoning: Medium

Continue the Attendee lifecycle build.

Build the attendee detail/edit experience.

Goal:
Create a 360 attendee detail experience that separates profile, attendee participation, registration/source, roles, and module usage.

It can be a drawer or page depending on existing project patterns, but it should be easy to access from the Attendee list.

Required sections:
1. Profile
   - Name
   - Email
   - Phone
   - Company
   - Title
   - Core Directory fields

2. Attendance
   - Attendance status
   - Registration status
   - Registration type/category
   - Badge/pass/ticket type if available
   - Local attendee notes if available or easy

3. Registration/source
   - Source
   - Provider if any
   - External registration ID if any
   - External person ID if any
   - Last synced/imported
   - Sync/writeback status if available

4. Roles/designations
   - Attendee
   - Speaker
   - Exhibitor
   - Sponsor
   - Staff
   - VIP
   - Press
   - Contact when relevant

5. Used in modules
   - Seating
   - Speaker sessions
   - Staffing
   - Marketing audience later
   - Sessions later

6. Activity/history if existing patterns make this easy. Do not invent a huge audit system if one does not exist.

Editing rules:
- Editing profile fields updates Event Directory person data.
- Editing attendance fields updates EventAttendee data.
- Editing registration/provider fields updates EventRegistrationRecord only where appropriate.
- Do not let read-only integration fields look editable unless the service supports it.
- Do not erase existing roles when editing attendee details.
- Delete/remove/cancel behavior must match the service behavior from Prompt 2.

UX:
- Make the split between Profile, Attendance, and Registration obvious.
- Avoid showing confusing duplicate fields.
- Make source/sync state readable for planners.
- Keep future portal/session/marketing sections as placeholders only if useful and not noisy.

Tests/checks:
- Add focused UI/service tests where patterns exist.
- Verify edit flows in browser.
- Run TypeScript.

At the end, report:
- Files changed
- Detail/edit behavior implemented
- Any fields intentionally deferred
- Tests/checks run
- Any known gaps
- What the next prompt should do
```

---

# Prompt 6 — Registration Integration Foundation Prep

```text
Model: Claude Opus
Reasoning: High

Continue the Attendee lifecycle build.

Now add the registration integration foundation, but do not implement a real provider yet.

Goal:
Prepare Attendee for future Aura/Bizzabo/other registration integrations without hardcoding a specific provider.

Build only the provider-agnostic foundation that makes sense now.

Possible concepts:
- EventIntegrationConnection or equivalent
- EventExternalIdentity or equivalent
- Provider capability model
- Sync status/writeback status fields
- Last synced/imported metadata
- Conflict/stale/read-only states if appropriate
- A service abstraction or interface for future providers
- UI display hooks for source/sync/capabilities if already useful

Capability concepts:
- canPullAttendees
- canCreateAttendees
- canUpdateAttendees
- canCancelAttendees
- canPullSessions
- canPushSessions
- canPullSessionRegistrations
- canPushSessionRegistrations
- supportsWebhooks
- supportsOrders
- supportsBadgeTypes

Important behavior:
- UI/service should know when an attendee is local-only vs imported vs integration-owned.
- Integration-owned does not always mean editable.
- Provider read-only data should not pretend to write back.
- Local edits that would require writeback should have a clear status/path later.
- External IDs should not be scattered randomly across core records if a generic identity mapping is cleaner.

Do not overbuild:
- No real Bizzabo API calls.
- No real Aura API calls.
- No OAuth or credential management unless the existing app already has a clear pattern and this is trivial.
- No background worker unless already available.
- No marketing campaign build.
- No portal build.

Tests:
- Test provider capability interpretation.
- Test attendee with external identity.
- Test read-only vs writeback status behavior where service logic exists.
- Test no provider-specific assumptions.

At the end, report:
- Files changed
- Foundation added
- How future providers should plug in
- Tests/checks run
- Any known gaps
- What the next prompt should do
```

---

# Prompt 7 — QA, Tests, Browser Stabilization, and Commit Readiness

```text
Model: Claude Opus
Reasoning: High

Stabilize the Attendee lifecycle foundation.

Goal:
Make the Attendee foundation shippable before moving to marketing, portal, or real provider integrations.

Review all Attendee work from the prior prompts.

Required QA:
1. Browser route:
   - /events/:eventId/attendees loads.
   - Page scrolls correctly.
   - Nav works.
   - Add attendee works.
   - Import CSV works or gives a clean implemented flow.
   - Summary cards/filters work.
   - Detail/edit opens and saves.
   - Delete/remove/cancel works according to implemented behavior.

2. Product semantics:
   - Directory person is canonical.
   - Attendee is participation.
   - Registration record is source/provider state.
   - Source is not usage.
   - Role is not registration status.
   - Contact is pre-registration.
   - Speaker/exhibitor/sponsor people can be attendees without duplication.
   - Existing Directory people are reused.

3. Tests:
   - Run TypeScript.
   - Run Attendee service tests.
   - Run import/dedupe tests.
   - Run relevant UI tests.
   - Run adjacent Directory tests if they exist.
   - Add missing regression tests for anything broken during QA.

4. Code quality:
   - Route handlers are thin.
   - Business logic is in service/import layers.
   - No provider-specific assumptions in the core.
   - No duplicate person identity system.
   - No obvious N+1 table query issues.
   - No client/server import boundary issues.
   - No broken scroll/layout traps.

5. Data/migration:
   - Prisma schema copies are in sync if applicable.
   - Migration exists and is named clearly.
   - Prisma generate was run if needed.
   - Migration status is clean.

Fix issues found during this pass.

At the end, report:
- Final files changed
- Tests/checks passed
- Browser QA completed
- Known gaps/deferred items
- Recommended commit message
- Recommended next milestone
```

---

# Later Prompt 8 — Marketing Interlock

```text
Model: Claude Opus
Reasoning: High

Build the marketing interlock for the Attendee lifecycle.

Goal:
Connect Contact-to-Attendee lifecycle without making Marketing own attendee identity.

Marketing should manage:
- Audiences
- Segments
- Campaign membership
- Invite status
- Conversion tracking
- Suppression/re-engagement states

Core flow:
1. Person starts as Contact in Directory.
2. Person is added to a marketing audience.
3. Campaign/invite is sent.
4. Person registers or is imported as attendee.
5. EventAttendee is created/updated.
6. Marketing audience member is marked converted.
7. Planner can filter by invited, not registered, converted, cancelled, re-engagement, etc.

Do not build a full email platform unless existing marketing infrastructure already exists.

Start with the minimum useful marketing-attendee data model and UI hooks.
```

---

# Later Prompt 9 — Attendee Portal Foundation

```text
Model: Claude Opus
Reasoning: High

Build the attendee portal foundation.

Goal:
Create token-scoped attendee self-service access on top of EventAttendee and EventDirectoryPerson.

Portal should eventually support:
- View profile
- Update profile fields
- Dietary/accessibility fields
- View agenda
- Select sessions if enabled
- View registration status
- View announcements/messages

Important:
- Portal auth should be token-scoped or attendee-scoped.
- Do not rely on planner session auth.
- Portal edits must respect source/writeback ownership.
- If provider supports writeback, edits can sync back later.
- If provider is read-only, block edits or stage proposed changes.
- If attendee is local/manual/CSV, Planner OS can own edits.

Start with portal access records, invite/link generation, and basic profile view/edit.
```

---

# Suggested Commit Strategy

Recommended commits:

1. `Add attendee lifecycle schema foundation`
2. `Add attendee service and API layer`
3. `Add attendee import and dedupe flow`
4. `Add attendee list and detail UI`
5. `Prepare attendee registration integration foundation`
6. `Stabilize attendee lifecycle foundation`

If the implementation is smaller, combine commits logically.

Do not merge until Prompt 7 is clean.

---

# Final Target for This Milestone

This milestone is successful when Planner OS has:

- A real Attendees route.
- Attendee participation records linked to Directory people.
- Manual attendee add.
- CSV attendee import.
- Dedupe against existing Directory people.
- Speakers/staff/VIP/etc. can also be attendees without duplicate people.
- Registration/source data is separated from attendee participation.
- Provider-agnostic integration foundation exists or is clearly prepared.
- The UI clearly shows attendee status, registration status, source, roles, and usage.
- Tests and TypeScript pass.
- Browser QA is clean.
