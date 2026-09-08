# SignalThread LR — Exhaustive Automated Testing Master Plan v3

> **v3.2 production-testing scope (2026-08-12).** This master plan governs the **main 14-prompt production product-behavior program**. Production-safe user/API journeys run against the deployed production application using designated test accounts/data. Raw Postgres/RLS enforcement, destructive direct-DB tenant isolation, migration apply/rollback/schema-repair, deliberate-break predicate removal, heavy disposable tenant factories, and load/stress/concurrency-abuse testing are removed from this main program and handled separately. They must not block the 14 prompts.

> **v3.1 scope decisions (2026-08-10).** Descoped or shrunk after review, marked inline: §33 delete paths (only shipped operations), §40/§55 (25k/50k scale dropped — 5k supported, 10k spot check), §44 (only reachable scheduler states), §45 (Google release readiness → checklist), §53 (deps/headers → tooling), §54 (three automated tests, rest documentation), §56 (restore drills → ops calendar, out of CI), §59 (Chrome + Safari; Firefox only if traffic warrants), §60 (accessibility deferred), §61 (4–5 visual baselines, not 13), §62 (full temporal matrix on four field groups only), §63 (usage telemetry descoped — **note: the voice-synthesis intelligence dashboards are NOT this section**; they are §41, §69, §71 and remain core).
>
> **v3 changes (2026-08-10):** merges the v2 gap review. New sections 69–81 (conversation pipeline, AI output and drift, silent-fallback detection, local DB migration and device handover, shipped-client contracts, outbound webhooks and CRM, bypass-path assertions, provider test tiering, testability prerequisites, combinatorial reduction, baseline gap analysis, test effectiveness, ownership and sequencing). New journeys J23–J27. Corrections applied inline to §36 and §51. Additions merged into §§7, 15, 32, 35, 38, 49, 55, 66. Corrected or newly added text is marked **[v3]**.

## Governing Principle

**We are not testing journeys. We are testing the meaningful product state space inside every journey.**

**Mutation rule:** an important mutation is not covered when the write merely returns success. It is covered only when every applicable downstream surface agrees after reload/refetch: direct UI, list/detail, dashboard/counts, correct company/event scope, sibling web/mobile surface, and derived priority/hot/follow-up state.

A feature is not covered because one E2E path passes.

A critical feature is only considered covered when its meaningful state combinations, negative cases, retries, permission boundaries, degraded-data cases, persistence behavior, and scope-isolation rules are automated and passing.

---

## 1. Identity, Roles, and Permissions

For every meaningful action, test it as:

- `platform_admin`
- `organizer_admin`
- `exhibitor_admin`
- viewer/app user where applicable
- invited but not fully activated
- unauthenticated
- unauthorized role
- platform admin inside another account via account-context switching
- platform admin after exiting account context

Verify both:

- correct actions succeed
- prohibited actions fail **server-side**, not merely because a button is hidden

---

## 2. Tenant / Account Isolation

Every account-owned entity needs:

- Company A cannot see Company B data
- Company A cannot mutate Company B data
- direct URL/API access cannot bypass scope
- cached state cannot survive an account switch incorrectly
- platform-admin account switching scopes correctly
- leaving account context restores platform scope
- no identity/audit confusion while switched

---

## 3. Event Isolation

This is a mandatory matrix for **every event-owned entity**.

Create/import/update data in **Event A** and prove it does not appear in **Event B**, even when both belong to the same company.

Specifically include:

- leads
- lead counts
- lead search
- lead detail
- priority results
- enrichment
- workflows
- workflow runs
- campaigns/recipients
- drafts
- exports
- integrations or event-specific settings where applicable
- mobile data

Explicit regression:

> Import leads into Event A → Event B must remain completely unchanged.

At the same time, test intentionally company-level/cross-event data separately, such as **AI Briefing Strategy**, so the suite knows the difference between shared and event-owned data.

---

## 4. Lifecycle / State

Where applicable:

- zero events
- one event
- multiple events
- upcoming
- active/live
- completed
- archived/inactive
- no active event
- event changed while page is open
- event deleted/disabled while user has stale UI

---

## 5. Data Completeness

Every important flow gets fixtures with:

- complete data
- missing optional data
- missing required data
- partial data
- null
- empty string
- whitespace
- malformed data
- stale data
- legacy data
- unusually long data
- Unicode
- duplicates

Critical rule:

> Missing optional data must degrade capability, not kill unrelated workflows.

---

## 6. Workflow Execution

For every workflow:

- enabled
- disabled
- matching
- non-matching
- approval required
- no approval required
- pending approval
- approved
- rejected
- stale approval
- already executed
- changed after approval
- dependency missing
- optional context missing
- required context missing
- partial agent context
- multiple agents where one has no usable data

Specific regression:

> Conversation Brief Agent selected + no conversation summary → campaign draft still executes if conversation context is optional.

---

## 7. Retry / Idempotency

Every mutation with customer impact:

- double click
- repeated submission
- browser refresh after submit
- client timeout after server success
- retry after unknown result
- retry after explicit failure
- duplicate API request
- repeated webhook/provider callback
- back/forward navigation during mutation

Verify no duplicates:

- leads
- drafts
- emails
- meetings
- workflow executions
- activity records

**[v3] The mirror test.** Duplicate-prevention tests must be paired with false-deduplication tests, or you ship a system that silently swallows legitimate repeats:

- same user emails the same lead again three days later → **sends**, not deduped
- idempotency record lifetime/expiry is defined and tested
- key derivation is stable across app versions and across a local DB migration
- idempotency record growth and cleanup at event scale

---

## 8. Autosave and Partial-Update Safety

This must become a generic test pattern across LR.

For **every multi-field/autosave/settings form**:

1. start with all fields populated
2. edit exactly one field
3. save
4. reload

Verify:

- edited field changed
- every untouched field remains byte-for-byte unchanged
- intentionally clearing one field clears only that field
- omitted field ≠ empty field
- `undefined` ≠ `""`
- rapid edits to multiple fields do not overwrite each other
- out-of-order save responses do not revert data
- refresh during autosave is safe
- server failure during autosave does not destroy data
- stale UI state does not overwrite newer server state
- “All changes saved” only appears after persistence is actually confirmed

Specific regression: **AI Briefing Strategy**

Fields:

- Product Focus
- Event Goal
- Target Audience
- Tone/Voice

Editing Product Focus must never wipe the other three.

---

## 9. Import / Uploader Matrix

Every structured importer:

- Google Sheets
- CSV
- XLSX
- any future structured source

Must use the same canonical expectations.

Test:

- source detection
- mapping
- validation
- preview
- final persistence
- event assignment
- post-import display

Name mapping:

- Full Name
- First + Last
- First only
- Last only
- reordered columns
- alternate headings (`fname`, `surname`, etc.)
- manual mapping override
- ambiguous heading
- multi-part surnames
- hyphenated names
- Unicode names

Specific regression:

> `Sarah Meister` mapped as Full Name must persist/display as `Sarah Meister`, not `Meister`.

---

## 10. Import Readiness Validation

Canonical identity rules need testing across **all uploaders**.

Examples:

- valid email → valid
- valid LinkedIn → valid
- legitimate full name + company → valid
- first + last + company → valid
- surname only + company → **blocked**
- first only + company → blocked if product rule requires full identity
- malformed email → not counted
- blank LinkedIn → not counted
- mixed batch → exact valid/invalid counts

Critical rule:

> The UI readiness result and final server import validation must use the same rules.

No `220 ready / 0 issues` if those records do not actually satisfy identity requirements.

---

## 11. Navigation and Route Continuity

From every significant page:

- sidebar links
- header links
- event switcher
- account switcher
- browser back
- browser forward
- direct URL
- refresh
- deep link

Specific regression:

> While on **Create Event**, selecting an existing event from the event switcher must actually navigate to that event.

Creation/edit screens should not trap global navigation unless there is a deliberate unsaved-changes behavior.

---

## 12. Empty / Zero States

Test:

- no events
- no leads
- no workflows
- no campaigns
- no integrations
- no users where possible
- empty search/filter result
- newly invited company with nothing configured

Specific regression:

> New `exhibitor_admin` with zero events gets a proper **Create your first event** path, not a dead shell.

---

## 13. Event Creation

Test field parity between create and edit/settings.

Specific regression:

- **Location must be available during Create Event**
- location entered there persists into Event Settings
- optional blank location still works if allowed
- editing later touches the same canonical field

General rule:

> Anything fundamental to an entity that can be configured immediately after creation should be audited for whether it belongs in the creation flow too.

---

## 14. Filter Behavior

Every filter must test **actual rendered result changes**, not just state/helper output.

For example Platform Admin Users:

- All events
- Event A
- Event B
- back to All
- event + exhibitor
- event + role
- event + status
- event + search
- rapid switching

Verify:

- stale rows disappear
- counts agree with table
- URL/query state if applicable
- refresh preserves intended filter state where designed

---

## 15. Integration States

For every provider:

- connected
- disconnected
- connecting
- reconnect required
- expired access token
- invalid refresh token
- revoked permission
- partial permission
- provider outage
- timeout
- rate limit
- malformed provider response
- disconnect failure
- reconnect
- user changes provider permissions externally
- **[v3]** `INTEGRATION_SECRET_ACTIVE_KEY_ID` points at a missing or rotated-out key
- **[v3]** decryption fails for a subset of stored credentials, not all

Google and Microsoft should eventually run the same provider-contract suite.

---

## 16. Email / Calendar

Test:

- email send
- exact sender identity
- calendar availability
- create
- edit
- cancel
- Meet/Teams
- private follow-up reminder
- attendee handling
- timezone
- retries
- idempotency
- provider errors

No provider token/device leakage.

---

## 17. Authenticated-User Identity

Anything personalized must derive from the correct user.

Specific regression:

> Campaign drafts must sign as the initiating/logged-in user, not `Ali`, seed data, company owner, or whoever generated an old fixture.

Test:

- Sarah creates → Sarah signature
- User B → User B
- async workflow retains initiating user
- platform account-context switch does not accidentally change identity into the customer

---

## 18. Concurrency

Important state changes:

- two browser tabs
- two admins
- admin + mobile
- state changes between load and submit
- two approval attempts
- concurrent autosaves
- lead edited while workflow runs
- event switched while request is in flight

Expected outcome must be deterministic.

---

## 19. Persistence and Reload

For every saved setting/entity:

1. mutate
2. confirm
3. hard reload
4. query again
5. verify exact persisted result

A green toast is **never** proof.

---

## 20. Cached / Stale-State Protection

Test:

- switch Event A → B
- switch Company A → B
- leave/re-enter page
- background/foreground mobile
- refresh
- navigate back

Old data must not flash or remain actionable where it could leak scope or cause a bad mutation.

---

## 21. Failure / Recovery UX

For every important action:

- validation error
- auth failure
- permission failure
- network error
- provider error
- server exception
- partial success
- unknown result

Verify:

- useful product-styled error
- no native `alert()`
- no false success
- no data destruction
- retry path makes sense

---

## 22. Direct API / Security Tests

UI journeys alone are not enough.

Critical operations need **application/API-level** tests for:

- cross-company IDs
- cross-event IDs
- forged/stale account context
- missing auth
- malformed ID
- illegal field update
- partial payload
- duplicate request
- mass-assignment attempts

These tests go through shipped routes/APIs against designated test objects. Raw Postgres/RLS enforcement and destructive direct-database isolation are handled separately.

## 23. Responsive / Interaction Testing

For important product screens:

- desktop
- narrower laptop
- tablet-ish widths where supported
- overflow
- wrapping
- dropdown positioning
- modal bounds
- drawers
- sticky controls
- keyboard navigation
- focus
- Escape
- outside click
- scroll position

---

## 24. Data Integrity

After important flows, assert the DB end state:

- correct foreign keys
- correct company
- correct event
- no orphan rows
- no duplicate canonical rows
- no accidental nulling
- no cross-scope associations

---

## 25. Audit / History

For sensitive/admin actions:

- actual authenticated actor
- affected company
- affected event
- action
- timestamp
- switched account context if relevant

Never rewrite history as if platform admin literally became the customer.

---

## 26. Realistic Fixtures

No more single “golden” fixture where every field is conveniently populated.

Each major journey must intentionally include:

- pristine record
- sparse record
- ugly/legacy record
- malformed record
- cross-event record
- cross-company record
- partial integration record
- duplicate/retry scenario

---

## 27. Journey Coverage Must Prove Effects, Not Clicks

Bad test:

> click Approve and expect button to disappear.

Good test:

> click Approve → server executes exactly once → expected draft exists → correct event/company/user → correct content sources → refresh → still correct.

---

## 28. Coverage Inventory

We need an automated inventory that answers, for each major feature/action:

- which roles tested?
- which scopes tested?
- which lifecycle states?
- which data-completeness states?
- retry?
- errors?
- persistence?
- security?
- cross-event?
- cross-company?

Anything blank becomes a **known test gap** instead of us believing “journey covered” means done.

---

# Explicit Notes Carried Forward

## A. Cross-Event Data Isolation

Mandatory scope-isolation state test:

> Same company, multiple events. Create/import/mutate data in Event A and prove it cannot appear in Event B across every event-owned entity.

This was exposed by imported leads appearing in both events.

## B. Destructive Partial-Save / Autosave Protection

Mandatory generic partial-update test:

> Start with all fields populated, edit exactly one, save + reload, and verify every untouched field remains unchanged.

This was exposed by AI Briefing Strategy wiping untouched fields.

## C. Missing Optional Workflow Inputs

Missing optional data must not kill unrelated workflow execution.

This was exposed by Conversation Brief Agent treating a missing conversation summary as fatal.

## D. Importer Semantic Mapping

Import mapping must respect source semantics and preserve identity data.

This was exposed by Full Name imports resulting in last-name-only leads.

## E. Importer Validation Parity

Importer preview/readiness and final server mutation must use the same canonical validation rules.

This was exposed by rows with no email and no usable first/full name being marked ready.

## F. Global Navigation From Creation Screens

Creation screens must not trap global navigation.

This was exposed by the event switcher no-op on Create Event.

## G. Zero-Event Onboarding

A newly invited exhibitor admin with no events must get a clear Create Event path, not an empty shell.

## H. Logged-In User Identity in Generated Content

Generated campaign drafts must use the initiating authenticated user's name/signature.

## I. Real Filter Behavior

Filter tests must change the UI and verify actual rendered rows/counts, not just helper state.

This was exposed by event filters changing visually while the Users table stayed stale.

## J. Create/Edit Field Parity

Core fields available in settings/edit flows should be audited for whether they belong in create flows too.

This was exposed by Event Location being editable only after creation.

---

# 29. Test Portfolio, Layers, and Traceability

The plan must define **where** each behavior is proven. One giant E2E suite is not exhaustive; it is slow and brittle.

Required layers:

- static checks: lint, typecheck, dependency graph, forbidden imports, route collisions
- domain/unit tests: mapping, validation, scoring, permissions, state transitions
- component tests: forms, drawers, filters, error states, autosave, keyboard behavior
- service/API tests: authentication, authorization, scope, validation, transaction results
- provider contract tests: Google and Microsoft adapters against the same canonical contract
- web E2E: real browser, real routes, real persistence
- mobile E2E: real device/simulator, permissions, navigation, background/foreground
- cross-surface E2E: mobile mutation observed in web and web mutation observed in mobile
- production-safe performance checks without load/stress abuse
- production-safe product/API security checks against designated test objects
- production smoke/synthetic tests: safe read paths and controlled write/delete probes

For every requirement or expensive regression, store:

- requirement/invariant ID
- owning product surface
- canonical enforcement point
- test layer(s)
- test file(s)
- role/scope matrix
- severity if broken
- release-blocking status
- last passing environment/build

A journey is not considered covered if it exists only in a manual checklist or only in a mocked unit test.

---

# 30. Risk Classification and Release Priority

Classify every invariant:

- **P0 — catastrophic:** cross-tenant leak, cross-event mutation, unauthorized send, destructive data loss, secret/token leakage, corrupt migration
- **P1 — critical workflow:** cannot capture a lead, cannot load an event, cannot import, incorrect recipient send, duplicate email/meeting, wrong user identity
- **P2 — major:** filter lies, stale counts, degraded provider behavior, broken recovery, major responsive/accessibility failure
- **P3 — minor:** isolated visual/copy/polish defect with no workflow or truth impact

The test plan must state which classes run:

- on every commit
- on every pull request
- nightly
- before production promotion
- after production deploy
- on a scheduled security/performance cadence

No P0 or P1 test may be quarantined, skipped, retried until green, or converted into an expected failure to unblock release.

---

# 31. Authentication and Session Lifecycle

Test the complete session state machine on web and mobile:

- valid sign-in
- invalid password
- unknown user without account enumeration
- invited user before redemption
- invite redemption
- expired invite
- already-used invite
- invite for wrong email
- invite opened while already signed in as another user
- sign-out
- session expiry while idle
- access token expiry during active use
- refresh token success/failure
- revoked session
- password reset, if supported
- email change, if supported
- user disabled/deleted while active
- simultaneous sessions on multiple devices
- session from Company A followed by invite into Company B
- deep link into protected route before auth
- browser/device clock skew
- stale auth cookie versus current Supabase session
- mobile app killed and relaunched
- web hard refresh on protected route

Verify:

- no protected content flashes before redirect
- an expired session never turns into a generic data-not-found state
- an in-flight mutation after revocation fails safely
- server session, middleware, route handler, and UI agree on identity (**[v3.2]** asserted through the application; database-layer RLS verification is out of this program — §50)
- logout clears sensitive cached state and provider connection state

---

# 32. User, Invite, Membership, Role, License, and Seat Lifecycles

Cover every supported administrative lifecycle:

- create company/account
- create organizer relationship
- create event
- assign company/exhibitor to event
- issue invite
- resend invite
- revoke invite
- accept invite
- duplicate invite
- transfer/change role
- remove user from event
- remove user from company
- disable/reactivate user
- consume a seat/license
- release a seat/license
- seat limit reached
- concurrent final-seat claims
- license expired
- **[v3]** license expires *mid-session* while a user is actively working
- **[v3]** grace-period behavior, if any, and what it permits
- event/license mismatch
- organizer manages only events in scope
- platform admin support action in switched context
- viewer remains read-only at UI, API, and RLS layers

Validate canonical seat/license enforcement under concurrency. Counts shown in the UI must reconcile with authoritative access rows, but displayed counts must never be the authority for granting access.

Explicit contract test:

> The role vocabulary must be normalized or intentionally translated across app types, API authorization, and RLS. `exhibitor_admin` versus `exhibitor` must never silently broaden or remove access.

---

# 33. Entity Lifecycle and Destructive Operations

**[v3 scope decision]** Test only the delete and archive paths the product actually ships. Enumerating every entity type against every deletion scenario generates a large volume of tests for operations that may not exist. Confirm which entities support soft delete, hard delete, and archive before building.

For each entity that ships the operation, test:

- create
- read
- update
- archive/disable
- reactivate, where supported
- soft delete
- hard delete, where supported
- guarded delete with dependencies
- cascading behavior
- stale direct URL after deletion
- duplicate create
- recreate after delete
- delete while another actor is editing
- delete while a workflow/job is running
- delete when referenced by campaign recipients, audit history, or provider records

Each delete path must prove the exact DB end state. A successful toast is not sufficient.

Test retention of audit/history separately from active access. Historical records must not accidentally recreate access or appear as active objects.

---

# 34. Mobile Install, Upgrade, and Device Lifecycle

Test the Expo mobile app across realistic lifecycle states:

- clean install
- first launch
- upgrade from prior supported production version
- schema/API compatibility during phased rollout
- app update while session exists
- app killed during read
- app killed during mutation
- app killed during scan or recording
- background then foreground
- device locked/unlocked
- incoming call/audio interruption
- permission changed in OS Settings while app is open
- low-memory termination
- low-storage condition
- low-power mode
- device offline at launch
- captive portal
- slow/flapping network
- date/time changed manually
- timezone changed while app is installed
- orientation and supported font scaling

The backend must tolerate old and new mobile versions during the supported rollout window. A backend deploy must not strand the currently published app version.

---

# 35. Camera, QR, and Lead Capture Matrix

The Capture flow requires its own exhaustive contract:

## Permissions

- camera permission not determined
- granted
- denied
- permanently denied
- revoked during use
- app returns from OS Settings
- microphone permission independent of camera permission

## QR payloads

- valid supported badge payload
- alternate supported badge formats
- plain text
- URL
- vCard-like data
- JSON
- malformed JSON
- empty payload
- whitespace
- extremely long payload
- Unicode
- control characters
- script/HTML content
- formula-like content
- duplicate scan
- repeated rapid scans
- same lead scanned by two devices
- same badge scanned into two events
- camera sees multiple codes

## Capture behavior

- active event exists
- no active event
- event switches between scan and insert
- event becomes inactive between scan and insert
- duplicate scan prevention or intentional duplicate behavior
- insert succeeds then navigation fails
- insert times out after DB success
- scan resumes after failure
- flash on/off and unavailable flash hardware
- app backgrounded with scanner active

## Badge template learning **[v3]**

v2 omitted this entirely despite a prior production incident where account/event badge mappings bled into unique card parsing.

- templates are account/event scoped
- a template learned in Event A is **not** applied in Event B
- badge templates never affect business-card, manual, or paste parsing
- badge mode is never inferred from account/event template availability
- a correction from a mis-mapped scan does not poison the stored template
- corrupt or conflicting template falls back to unassisted parsing

Prove the inserted lead has the correct `company_id`, `event_id`, `owner_user_id`, canonical identity fields, default status, and exactly one row when retried.

---

# 36. Audio Recording and Screen-Awake Behavior

The current mobile surface exposes local recording UX, so test the actual current contract rather than assuming backend persistence.

- microphone permission states
- start
- stop
- pause/resume if supported
- immediate stop
- maximum practical duration
- zero-byte/invalid recording
- incoming call interruption
- Bluetooth/headset route change
- lock screen
- app background
- navigation away
- component unmount
- OS interruption/error
- start recording twice
- stop without active recording
- scanner and recorder interaction
- cleanup after crash-like failure

Screen-awake invariant:

> Recording starts → keep screen awake. Recording stops, errors, or the user leaves the screen → release keep-awake exactly once.

Verify no screen-awake leak after unmount, navigation, permission denial, or recorder exception.

**[v3 correction]** v2 stated that audio is "currently local/UI-only." That is wrong and came from a stale mobile doc. The mobile context package documents durable chunked upload, `lead_conversations`, `lead_conversation_readiness`, `lead_voice_notes`, transcript/synthesis lifecycle, and migrations `0072`, `0073`, `0089`, `0090` — and its own contradiction ledger flags the UI-only claim as stale. Server-side persistence exists today.

This section therefore covers **device-side recording mechanics only**. Upload, processing, retention, access control, and intelligence assembly are covered in §69, which is the largest previously-unscoped subsystem in this plan.

---

# 37. Offline, Intermittent Network, and Mobile Sync

Even if fully offline capture is not promised, degraded-network behavior must be explicit.

Test:

- read while offline
- edit while offline
- capture while offline
- connection lost before submit
- connection lost after server commit but before response
- reconnect
- app killed with pending local state
- duplicate replay after reconnect
- stale cached lead edited after remote change
- queued operations applied to wrong active event after event switch
- web edit while mobile is offline
- mobile edit while web is offline

For each action, define one of:

- blocked before mutation with clear recovery
- queued locally and safely replayed
- optimistically applied with reconciliation
- discarded intentionally with explicit warning

Undefined offline behavior is a product bug, not merely an untested case.

---

# 38. Cross-Surface Web ↔ Mobile Contract and Conflict Testing

The mobile and admin app share the same lead records. Every shared field needs bidirectional tests:

- mobile capture appears in correct web event
- web-imported lead appears on mobile only in correct event/company
- mobile rating updates web rating and priority
- web rating/priority updates mobile consistently
- follow-up date from either surface matches after reload
- name/title/company changes remain canonical
- status/temperature semantics do not diverge
- owner identity remains correct
- enrichment written by backend appears read-only on mobile
- deletion/archive on web is handled safely on mobile
- account/event switch invalidates previous surface cache
- simultaneous edits resolve deterministically

Explicit schema drift guards:

- `company_text` versus historical `company`
- `rating` and the canonical `priority_score` mapping
- `follow_up_date` type/timezone/null semantics
- active versus deprecated hot-lead concepts
- `is_hot` and `quick_tags` must not silently re-enter active mobile behavior
- active routes must not depend on legacy `qr_value`/`raw_payload` helpers

Contract tests should run against a real test database and be consumed by both repositories.

**[v3] The mechanism.** Publish a **versioned shared contract artifact** from web (JSON Schema / OpenAPI / zod schemas) and consume it in mobile CI. A breaking backend change must fail mobile's build *before* it ships, not after a customer finds it. Without a published artifact, "consumed by both repositories" stays aspirational.

---

# 39. Lead Domain Lifecycle and Canonical Semantics

Test the full lead lifecycle, not only import and edit:

- capture
- import
- manual create, if supported
- view
- edit
- assign/transfer owner, if supported
- rate
- reprioritize
- change status
- set/clear follow-up
- enrich
- include/exclude from workflow
- include/exclude from campaign
- export
- archive/delete
- duplicate/merge, if supported

Canonical rules to prove:

- identity normalization without data loss
- empty versus unknown versus intentionally cleared values
- rating bounds and invalid decimals
- exact rating → priority mapping
- deterministic tie-breaking in Priority view
- status and temperature allowed transitions
- follow-up dates in past/today/future
- event/company/owner never changes from an unrelated partial update
- enrichment never overwrites user-authored canonical data unless explicitly designed
- fallback AI/insight copy is clearly a placeholder and is never presented as real lead-specific intelligence

Test duplicate definitions separately:

- same email
- case-variant email
- same LinkedIn URL with tracking params
- same name/company
- same badge payload
- same person across events
- same person across companies

The expected action—allow, warn, merge, or reject—must be defined and consistent across capture, import, and API calls.

---

# 40. Search, Sort, Pagination, Virtualization, and Large Collections

For every collection surface—leads, users, events, campaigns, signals, workflows, activity—test:

- default sort
- ascending/descending
- stable ordering for ties
- pagination boundaries
- page-size changes
- cursor/offset consistency under concurrent inserts/deletes
- search exact/partial/case-insensitive
- whitespace and Unicode search
- combined filters
- clearing one filter without clearing unrelated filters
- URL state and refresh behavior
- no-results state
- counts versus rendered rows
- bulk select across page boundaries
- select-all meaning: current page versus all matching
- mutation after selection with stale results

Scale profiles must treat **5,000 leads as a normal supported event size**, not as a reason to impose an arbitrary product cap. Include at least:

- 0
- 1
- 100
- 1,000
- 5,000 (supported scale — test hard here)
- 10,000 (spot check)

**[v3 descoped]** 25,000 stress and 50,000 ceiling characterization are removed. 5,000 is the supported event size; synthetic ceiling-finding above 10,000 is academic until a customer needs it. Existing load-testing process owns anything beyond this.

Verify API payload bounds, query counts, render time, memory, mobile scroll stability, and filter/search response.

---

# 41. Dashboard, Counts, Analytics, and Reconciliation

Every displayed number needs a canonical definition and reconciliation test:

- event counts
- lead counts
- hot/high-priority counts
- workflow counts
- campaign recipient counts
- sent/draft/ready counts
- integration status
- organizer/exhibitor/license counts
- mobile settings stats
- dashboard lifecycle lanes

Test:

- zero/one/many
- cross-event and cross-company
- same record qualifying for multiple visual categories
- stale cache
- concurrent insert/delete
- archived/inactive inclusion rules
- timezone boundary
- filter-scoped count versus global count
- server aggregate versus table rows

Pinned dashboard-truth cases:

- `events.timezone` is the event/business-day authority; missing timezone degrades instead of falling back to browser/server UTC
- event-local half-open day windows cover local midnight plus 23-hour and 25-hour DST days
- `events.location` wins over `city/state` everywhere an event identity is shown
- hot means canonical `temperature = hot`; conflicting priority scores never change that classification
- open/due-today/overdue/future/completed/cleared/hot-awaiting follow-up fixture IDs reconcile exactly with every linked Leads destination
- account event counts remain exact above the Supabase row-response limit and are company/event scoped
- a failed metric query produces an explicit unavailable state, never a reassuring zero/all-clear
- bounded intelligence exposes analyzed/total coverage, while displayed totals use independent authoritative counts
- mutations reconcile list, detail, event dashboard, account event card, sibling-event isolation, company isolation, and hard reload

No dashboard card may be tested only through snapshot text. Recompute the expected result from authoritative fixtures and compare.

---

# 42. Campaign End-to-End State Machine

Test each state and allowed transition:

- create campaign
- select event/company scope
- add/remove recipients
- recipient deduplication
- select/remove/reorder signals
- save draft
- generate draft
- regenerate
- manually edit generated content
- save after manual edit
- approval required/not required
- pending/approved/rejected
- ready
- send
- partial send
- retry failed recipients
- cancel/abort where supported
- archive/delete

Content correctness:

- correct logged-in initiating user signature
- correct event and company context
- only selected signals
- optional context omitted safely
- required context failure is explicit
- recipient personalization does not bleed across recipients
- HTML and plain-text variants remain equivalent in meaning
- no unresolved template variables
- no seeded/person-specific fallback such as `Ali`
- manual edits are not silently overwritten by regeneration/autosave

Send correctness:

- exact recipient set at execution time
- stale recipient selection handling
- no cross-event recipient
- no viewer send permission
- one provider message per intended recipient
- idempotency across timeout/retry
- activity/audit rows reconcile with provider result
- partial success can be resumed without re-sending successes

---

# 43. Signal Library Contract

Test:

- list/read
- category grouping
- create
- edit
- delete
- usage tracking
- global versus company/event scope, where supported
- inheritance/override rules, when introduced
- viewer read-only
- exhibitor read access
- exhibitor-admin write access
- platform-admin support behavior
- API/UI permission parity
- signal referenced by active campaign
- delete/modify while draft generation runs
- long/Unicode/HTML content
- empty or malformed content
- ordering
- search/filter

Visual regression is mandatory because prior routing/RBAC work replaced the richer card/accordion experience with a table. Authorization fixes must not be accepted if they silently overwrite the intended UI.

---

# 44. Workflow Scheduler, Time-Based Execution, and Approval Races

**[v3 scope decision]** Test only states your architecture can actually reach. If workflow execution is a single Vercel cron tick rather than a multi-worker pool, then "two workers claim same job," "worker restart," and dedicated dead-letter machinery are unreachable — assert the single-tick guarantees instead of simulating a pool you do not run. Confirm the deployed topology before building this section.

Beyond workflow matching states, test:

- immediate execution
- scheduled execution
- timezone and daylight-saving transition
- missed schedule after outage
- duplicate scheduler tick
- clock skew
- worker restart
- job lease expiry
- two workers claim same job
- cancellation before run
- edit after scheduling
- event archived before run
- approval arrives after expiry
- two approvers act concurrently
- rejection then later approval attempt
- downstream provider unavailable
- partial multi-lead execution
- poison record among valid records
- retry budget exhausted
- dead-letter/recovery path

Every run needs a durable state machine with explicit transitions and an immutable attempt history.

---

# 45. OAuth and Provider Connection Security Lifecycle

For Google and Microsoft/Outlook, run the same provider-neutral contract plus provider-specific cases:

- initial connect
- cancel consent
- denied scope
- partial scope
- wrong Google/Microsoft account selected
- account already connected to another LR user
- same provider connected by two LR users where allowed/not allowed
- reconnect
- disconnect
- provider-side revocation
- access-token expiry
- refresh-token expiry/revocation
- refresh race from concurrent requests
- single-owner refresh lease
- provider outage during callback
- callback replay
- state tampering
- PKCE mismatch
- nonce mismatch
- expired launch ticket
- launch ticket reuse
- callback cookie missing
- open-redirect attempt
- account-context switch during OAuth
- mobile browser/app return
- secrets encrypted at rest
- key rotation with old ciphertext still readable during rollout
- provider tokens absent from URL, client logs, analytics, and device storage

**[v3 descoped — checklist, not tests]** Google release readiness is a one-time review process with Google, not a repeatable suite. Track on a checklist with an owner:

- non-tester account
- Workspace account in another domain
- consumer Gmail account, if supported
- consent-screen production mode
- scope verification and least privilege
- app verification/restricted-scope failure handling

Connection status must be derived from a real usable connection, not merely the existence of a stale row.

---

# 46. Email Provider Contract

Test the end-to-end truth, not just a `2xx` response:

- correct From identity
- correct Reply-To
- correct initiating user signature
- To/CC/BCC behavior if supported
- subject/body Unicode
- HTML/plain text
- links
- threading headers
- attachments if supported
- mailbox receipt
- Sent mailbox behavior/cleanup where applicable
- provider message ID persistence
- provider accepts but later bounces
- spam/rejection classification where observable
- invalid recipient
- provider rate limit
- provider timeout before/after acceptance
- token refresh during send
- duplicate send request
- batch partial success
- webhook duplicates/out-of-order delivery
- delivered/opened/clicked/bounced transitions if implemented
- unsubscribe/suppression rules if campaign sending is implemented

A successful UI state must distinguish:

- accepted by LR
- accepted by provider
- delivered, when known
- failed/unknown

Do not tell the user “sent” solely because the local request returned before provider truth was reconciled.

---

# 47. Calendar and Availability Contract

Test:

- availability range and exact boundary inclusivity
- the required two-week scheduling horizon
- user timezone
- attendee timezone
- event timezone
- daylight-saving transitions
- all-day events
- recurring events and exceptions
- overlapping events
- tentative/free/busy/out-of-office status
- private event details hidden but busy time honored
- primary versus secondary calendars
- selected calendar deleted
- multiple calendars
- malformed calendar ID
- provider partial response
- rate limit/timeout
- token refresh
- create meeting
- edit/reschedule
- cancel
- duplicate create after timeout
- attendee add/remove
- Meet/Teams link creation
- conferencing permission missing
- provider creates event but LR times out
- LR writes activity then provider fails
- calendar event deleted externally
- availability changes while slot picker is open

Verify that product-styled date/time controls are used; native browser date/time controls are not acceptable. Test keyboard, Escape, outside click, focus, mobile width, and timezone labeling.

---

# 48. Background Jobs, Webhooks, and Asynchronous Reconciliation

For every asynchronous path:

- enqueue succeeds/fails
- duplicate enqueue
- worker starts/stops
- retry with exponential/backoff policy
- max attempts
- poison message
- dead-letter handling
- idempotency key uniqueness
- job visibility timeout/lease
- out-of-order completion
- callback before local transaction completes
- duplicate webhook
- forged webhook signature
- old timestamp/replay
- provider event for unknown message/object
- provider event for another tenant
- partial batch
- reconciliation job repairs missed callback

Persist enough state to answer:

- what was requested
- who requested it
- current state
- provider identifier
- every attempt
- last error category
- whether retry is safe

---

# 49. API Contract, Validation, and Compatibility

For every route:

- allowed methods
- authentication
- authorization
- company/event scope
- request schema
- unknown fields/mass assignment
- missing fields
- null versus omitted
- wrong types
- malformed JSON
- wrong content type
- body size limit
- path/query ID validation
- pagination limits
- sort/filter allow-list
- deterministic error shape
- correct status code
- no stack trace/secret leakage
- idempotency where needed
- rate limiting/abuse controls
- CORS/CSRF expectations
- cache headers
- request correlation ID

Compatibility tests must protect currently supported web and mobile versions. Additive response fields are safe; removals/type changes require an explicit rollout plan.

Create route inventory tests so a newly added mutation route cannot ship without auth, scope, validation, and direct-API coverage.

**[v3] Middleware policy parity harness.** Maintain a table of (path, method, auth state) → expected outcome, runnable against the current `middleware.ts` and against any replacement. Next.js 16 deprecates the middleware convention, and the one production OAuth outage in this system's history was caused by middleware policy intercepting a route that was designed to carry no cookie or bearer. Build the table before touching the convention, not during.

---

# 50. Database, RLS, Constraints, Transactions, and Query Correctness

Raw Postgres/RLS enforcement, direct database cross-tenant mutation, service-role bypass drills, destructive transaction tests, and invariant-destruction exercises are **outside this 14-prompt production product program**.

The main program still verifies company/event isolation through real UI and application APIs and validates persisted end state for controlled production-test records.

Track deeper database/RLS work separately. A missing isolated Supabase project does not block this plan.

# 51. Schema Migration, Drift, and Environment Parity

Migration apply/rollback, partially applied migrations, historical-schema upgrade drills, schema repair, and destructive constraint/backfill testing are outside this 14-prompt production product program.

The main program may still perform non-mutating compatibility checks:

- generated types versus deployed schema contract
- supported web/mobile client contract compatibility
- runtime behavior against the currently deployed schema
- documentation of intentional migration numbering such as the `0076` gap

Actual migration rehearsals belong to the separate engineering suite and do not block this run.

# 52. File Import, Export, and Download Security

In addition to mapping/validation, test:

- empty file
- header-only file
- duplicate headers
- missing headers
- hidden columns/sheets
- multiple sheets
- formulas
- CSV formula injection (`=`, `+`, `-`, `@` prefixes)
- macros in XLSX containers
- password-protected/corrupt file
- MIME/extension mismatch
- oversized file
- compressed/decompression bomb defenses
- encoding variants
- CRLF/LF
- quoted delimiters/newlines
- partial parse failure
- cancellation
- retry
- concurrent imports into different events
- export with no rows
- export with 5k/25k+ rows
- export scope and selected filters
- Unicode/CSV escaping
- temporary file cleanup
- signed URL expiration if object storage is used
- unauthorized export/download ID

Exports must never contain fields outside the requester’s authorized company/event scope or internal secrets/provider identifiers.

---

# 53. Security and Abuse Testing

Automate and manually review the high-risk classes:

- IDOR/BOLA on every object ID
- role escalation
- account-context forgery
- mass assignment of `company_id`, `event_id`, `owner_user_id`, role, status
- SQL/NoSQL-like injection inputs
- stored/reflected XSS in names, company, signals, campaign content, imported cells
- HTML/email injection
- CSV formula injection
- CSRF on cookie-authenticated mutations
- open redirects
- SSRF through URL/enrichment/provider fields
- OAuth state/PKCE/replay attacks
- brute-force and account enumeration
- rate-limit bypass
- webhook forgery/replay
- path traversal/file name attacks
- insecure direct storage access
- secret/token/PII leakage in logs, URLs, error messages, analytics, source maps
- insecure cookie flags
- CSP/security headers
- dependency vulnerabilities and compromised packages
- production debug endpoints
- privilege retained after role removal or logout

**[v3 split]** Keep as hand-written tests: IDOR/BOLA, role escalation, account-context forgery, mass assignment, injection, XSS, HTML/email injection, CSV formula injection, CSRF, open redirect, SSRF, OAuth state/PKCE/replay, webhook forgery, path traversal, secret/PII leakage, privilege retention.

**Move to tooling, not hand-written tests:** dependency vulnerabilities and compromised packages (Dependabot or equivalent), CSP and security headers (a header scanner in CI), source-map exposure (a build-time check), insecure cookie flags (a single global assertion).

Security failures that expose another tenant/event are P0 regardless of how obscure the UI path is.

---

# 54. Privacy, Data Lifecycle, and Compliance Controls **[v3 — shrunk]**

Most of this section is policy and legal documentation, not test code. **Automate only these three:**

1. account/customer deletion actually removes the data it claims to remove
2. data export is strictly scope-limited to the requester's company and event
3. logs, error messages, and analytics contain no PII, tokens, or provider payloads

Everything below is retained as a **documentation checklist** with a human owner, not as automated tests:

- what lead PII is stored
- collection purpose and consent assumptions
- data export for an account/customer
- data deletion/anonymization
- retention periods
- event/archive retention
- provider-token retention
- audit retention
- backups after deletion and documented recovery implications
- user/account deletion
- employee/support access
- platform-admin switched-context logging
- sensitive field masking in logs and support tools
- environment separation so production PII never enters test fixtures
- least-privilege provider scopes
- attachment/audio retention when introduced

Deletion tests must prove both active-product removal and the intended historical/audit behavior.

---

# 55. Performance, Load, Soak, and Resource Budgets

The main 14-prompt program measures **production-safe performance**, not load/stress abuse against production.

Measure representative page/API/query/render/import timings, bundle size, and mobile responsiveness where a device is available.

Do not run production load, soak, pool-exhaustion, event-floor burst, mass concurrent import, or synthetic high-concurrency abuse in this program.

Formal 5k/10k load/stress characterization is tracked separately.

# 56. Resilience, Fault Injection, Backup, and Disaster Recovery

The main program tests resilience through deterministic local/replay seams and safe production observations.

Keep provider timeout/error replay, unknown outcome handling, retry/idempotency, stale state, degraded UI, and reconciliation after controlled failures.

Move production DB/pool exhaustion, intentional dependency outages, destructive infrastructure fault injection, backup/restore drills, and regional failure simulation to separate engineering/ops exercises.

# 57. Observability, Alerting, and Supportability

Every critical journey must be diagnosable without reproducing it locally.

Verify:

- structured logs
- correlation/request IDs across UI → API → DB/provider/job
- actor/company/event/object identifiers where safe
- no secrets or unnecessary PII
- stable error categories
- provider HTTP status/reason captured safely
- metrics for success, failure, latency, retries, duplicates, queue depth, token refresh, webhook lag
- alerts for P0/P1 symptoms
- alert deduplication/noise control
- dashboard and runbook links
- audit trail for support actions
- user-visible error reference ID

Run an operational test:

> Cause a controlled failure, verify the alert fires, locate the exact request/job/provider attempt, follow the runbook, and confirm recovery.

---

# 58. Deployment, Configuration, Secrets, and Rollback

Test local, preview, pre-production, and production promotion behavior:

- required environment variables present
- malformed variable fails fast
- encryption key set/active key ID valid
- old and new key coexist during rotation
- preview cannot use production secrets/data unintentionally
- production cannot use test OAuth credentials
- migration ordering
- web/mobile backward compatibility
- feature flags default safely
- deploy with in-flight jobs
- rollback after schema change
- rollback after provider change
- stale CDN/server cache
- `.next` route/type artifacts after route deletion
- route collision detection
- production smoke after deploy

Maintain a machine-readable configuration contract and fail CI/deploy before runtime when required secrets or scopes are missing.

---

# 59. Browser, Device, OS, and Network Compatibility

Define a supported matrix and test it intentionally.

**[v3 scope decision]** Narrowed. Edge is Chromium, so Chrome coverage carries it; Chrome + Safari gives you two of the three rendering engines. Add Firefox only if traffic shows Gecko users.

Web:

- current and previous supported Chrome (covers Edge)
- Safari
- Firefox — **only if analytics show real usage**
- macOS and Windows behavior
- desktop and narrower laptop widths
- zoom 100–150% (the 80% and 200% extremes are descoped)
- slow network / high latency

**Descoped:** dedicated Edge runs, touch-capable laptop/tablet behavior.

Mobile:

- supported iOS versions and representative iPhones
- supported Android versions and representative hardware
- small/large screens
- notch/safe area
- camera and flash hardware variants
- system font scaling
- light/dark theme if supported
- low-end device performance

Do not call a feature supported because it works on the developer’s primary MacBook and iPhone.

---

# 60. Accessibility and Inclusive Interaction **[v3 — deferred]**

**Deferred for now.** When picked up: keep the automated checks (axe or equivalent), which are cheap and can run everywhere. The manual screen-reader journeys across every major flow are the expensive part and should be narrowed to capture and lead detail when this is revisited.

Retained for reference — for every major web and mobile flow:

- semantic names/roles
- logical heading structure
- keyboard-only operation
- visible focus
- focus trapping/restoration in modals/drawers
- Escape and outside-click behavior where appropriate
- screen-reader labels and announcements
- error association with fields
- color contrast
- information not conveyed by color alone
- touch target size
- reduced-motion behavior
- zoom/reflow
- dynamic text/font scaling
- loading and success announcements
- table/list accessibility
- QR/camera permission alternatives and clear instructions

Automated accessibility checks are necessary but insufficient; include manual keyboard and screen-reader smoke journeys.

---

# 61. Visual Regression and Design-System Compliance

**[v3 scope decision]** Narrowed from thirteen screens to **four or five**. Screenshot baselines are the highest-maintenance and flakiest test category you will own; every intentional design change requires re-approval. Keep them only where layout itself carries meaning.

**Keep baselines for:** importer mapping/preview/errors, lead detail, email/calendar composer and scheduler, event dashboard, and mobile Capture. **Descoped:** the remaining screens below — cover those with component and E2E assertions instead.

Original candidate list, retained for reference:

- account dashboard
- event dashboard
- create/edit event
- strategy settings
- importer mapping/preview/errors
- lead list/detail
- campaign builder
- signal library
- integrations
- email/calendar composer/scheduler
- platform/organizer admin
- mobile Capture/Leads/Detail/Priority/Settings

Test:

- canonical brand colors and typography
- correct shared components
- no one-off controls
- responsive reflow
- wrapping/overflow
- sticky controls
- dropdown/modal/drawer placement
- loading/empty/error/success states
- long content
- high zoom/font scaling
- no native browser date/time controls

Any UI-touching change requires live browser/device screenshots against the reference—not only unit tests or “it renders.”

---

# 62. Time, Timezone, Locale, and Calendar Boundaries

**[v3 scope decision]** Apply the **full** matrix below only to the fields where a one-day or one-hour error is a real product defect:

- calendar availability and meeting times
- lead follow-up dates (and the derived compatibility `follow_up_date`)
- event start/end dates
- workflow schedule times

For `created_at`, audit timestamps, and other record-keeping instants, assert ISO serialization and correct storage only. Running the full battery there costs the same and protects nothing.

Full matrix for the four field groups above:

- UTC
- America/New_York
- western/eastern timezones
- user timezone differs from event timezone
- DST spring-forward missing hour
- DST fall-back repeated hour
- midnight boundaries
- month/year boundaries
- leap day
- past/today/future
- ISO serialization
- date-only fields versus instants
- browser/device timezone change
- locale display variation

Date-only values must never shift one day because they were treated as UTC instants. The DB, API, web, and mobile must agree on null/clear semantics and displayed date.

---

# 63. Product Usage Telemetry **[v3 — descoped unless wired]**

**Read this before skipping.** This section is about *product usage telemetry* — Amplitude/Mixpanel-style "did the button-click event fire exactly once." It is **not** about the event and cross-event intelligence dashboards built from voice synthesis. Those are core and are covered by:

- **§41** — every displayed number reconciles against authoritative rows
- **§69** — the conversation/voice pipeline that produces the underlying intelligence
- **§71** — proving a dashboard is served by the canonical read model, not a legacy fallback

Descope this section entirely unless usage telemetry is actually instrumented. If it is, test:

- event fires exactly once
- correct actor/company/event context
- no sensitive lead content or provider token
- success versus attempt versus failure semantics
- retries do not double-count
- account/event switching updates context
- anonymous/pre-auth events are not attributed to another user
- web/mobile event naming parity
- dashboards reconcile with source events
- analytics failure never blocks core workflow

Operational metrics and product analytics must remain separate so customer behavior data is not mistaken for system truth.

---

# 64. Feature Flags, Kill Switches, and Configuration Variants

For every flag/configurable feature:

- default state
- enabled/disabled
- role/company/event targeting
- stale client flag
- server disagreement
- flag changed while page/app is open
- rollout percentage stability
- rollback/kill switch
- migration dependency
- hidden UI but still blocked server-side
- old mobile version behavior

No flag may create two independent implementations of the same critical business rule.

---

# 65. Test-Suite Integrity and Flake Governance

Test the tests.

Required controls:

- deterministic clocks/random IDs where needed
- per-test tenant/event/user ownership
- cleanup in `finally`
- no reliance on test order
- no shared mutable golden account for destructive suites
- isolated browser contexts and mobile state
- explicit network/provider stubs only when the provider itself is not under test
- **[v3.2]** authorization tests run against the **real deployed application and its APIs**, not mocks. Raw Postgres/RLS policy testing is out of this program (see §50) and belongs to the separate security suite.
- contract fixtures versioned and validated
- retry count reported; retries cannot hide first-attempt failures
- quarantine requires owner, reason, severity, and expiration
- flake rate tracked
- duration tracked
- test selection based on changed risk area, plus full pre-release suite
- failed cleanup detected as a failure
- artifact retention: screenshots, video, logs, traces, DB snapshot identifiers

A suite that passes only after reruns is failing.

---

# 66. Production Smoke, Synthetic Monitoring, and Safe Canaries

After every production deploy, automatically verify safe critical paths:

- sign-in/session check using a dedicated synthetic tenant
- account/event scoping
- read dashboard
- read lead list
- create and delete a synthetic lead in its dedicated event
- provider connection health without sending to customers
- controlled email/calendar canary to owned test accounts, where safe
- mobile API compatibility probe run against the **frozen contract of the currently shipped store binary**, not against `main` **[v3]**
- every bypass/seed/debug route positively asserted as rejecting (see §75) **[v3]**
- no production customer data in artifacts

Synthetic data must be unmistakably namespaced, isolated, and cleaned. Failed cleanup is an incident.

---

# 67. Architecture and Code-Quality Gates

CTO-level testing also verifies architectural invariants:

- one canonical authorization/service path
- no duplicate business-rule implementations
- no route duplication or shadow routes
- no circular dependency introduced
- no client import of server-only secret code
- no service-role use in browser/mobile bundles
- no broad unscoped database helper
- no new deprecated schema field usage
- no duplicate provider adapter behavior
- no uncontrolled query in a row loop
- no hidden fallback that turns failure into misleading success
- no mutation returning success without end-state verification

Automate what can be automated with import-boundary rules, route inventories, schema-contract tests, query instrumentation, and forbidden-pattern checks. Architecture review remains required for auth, RLS, migrations, provider tokens, jobs, and shared schema changes.

---

# 68. Documentation, Runbooks, and Support Handoff

Test completion must leave usable operational knowledge:

- feature invariant documented
- canonical source of truth named
- role/scope table current
- API contract current
- migration/remediation steps current
- alert and runbook current
- provider setup/verification current
- rollback steps current
- known limits documented
- support can locate audit/request IDs

Perform a cold handoff test: an engineer who did not build the feature should be able to diagnose a seeded failure using only the docs, logs, and runbook.

---

# 69. Conversation, Voice Note, and Intelligence Pipeline **[v3]**

The largest previously-unscoped subsystem. v2 referenced "conversation summary" only as optional workflow context, because §36 wrongly assumed audio was local-only. The real pipeline spans capture → chunked upload → object storage → transcription → synthesis → evidence/themes/objections/competitors/messaging → briefings → canonical scoped read model → lead detail and dashboards, and it has already produced two expensive production incidents.

## Recording-to-lead binding

- recording started on Lead A, user navigates to Lead B → audio saves to **Lead A**
- recording active when app is backgrounded, killed, or low-memory terminated
- duplicate stop / duplicate save / duplicate upload produce exactly one artifact
- 15 / 45 / 60-minute lifecycle boundaries
- zero-byte, truncated, and corrupt recordings
- interruption by call, Bluetooth route change, headset disconnect
- keep-awake released exactly once on stop, error, unmount, or permission denial

## Additive semantics

- a new voice note never replaces a prior recording or note
- creator attribution correct when two users add notes to one lead
- client-local idempotency key survives app restart mid-upload
- cumulative insight regeneration incorporates all notes, not only the newest
- note added to a lead deleted between record and upload

## Upload and storage

- chunked/multipart upload: resume, abort, out-of-order chunk, missing final part
- upload while offline → queued; upload during network flap
- signed URL expiry mid-upload
- storage path ownership: a URL for Company A's object is not readable by Company B
- orphan objects when the lead insert fails after upload succeeds
- temporary file cleanup on device

## Processing state machine

- pending → in-progress → succeeded / failed / stale, with every illegal transition rejected
- readiness **versioning**: a new note invalidates and regenerates readiness deterministically
- worker restart mid-processing; lease expiry; two workers claiming one job
- **failure classification before retry** — retry eligibility derives from error category, and a bulk reprocess is impossible without classification
- poison record among a valid batch
- reconciliation job repairs a lost completion callback

## Intelligence read model

- transcript, summary, evidence, themes, needs, objections, competitors, messaging, and briefing asserted as **distinct artifacts** with distinct scope predicates
- every aggregation preserves event/company/lead ownership
- user-authored corrections and approved briefing content survive regeneration
- a lead with rich data never renders the thin legacy summary — see §71

---

# 70. AI Output, Prompt Assembly, and Model Drift **[v3]**

Briefings, campaign drafts, summaries, and insights are model-generated. This is an external dependency whose behavior changes **without a deploy of your code**, which makes it the one failure class a commit-triggered suite structurally cannot catch.

## Prompt assembly as a scope-leak vector

The highest-severity AI test is not output quality. It is: **what data entered the prompt?**

- assert the exact context payload for a generated brief/draft contains only the target lead, its event, and its company
- no cross-event lead content, no cross-company content, no other recipient's personalization
- no provider tokens, internal IDs, or secrets in prompt text
- PII sent to the model provider is bounded and documented (§54 dependency)
- prompt assembly is deterministic given fixed inputs — snapshot the assembled prompt, not only the output

## Truncation and limits

- a 60-minute transcript exceeding the context window: deliberate summarization or explicit failure, never silent truncation
- long fields, Unicode, and control characters in prompt inputs
- token budget per operation and per event

## Failure and cost

- model timeout, rate limit, 5xx, malformed/non-JSON response, refusal
- retry does not double-charge or double-generate
- degraded mode states that intelligence is unavailable rather than presenting a placeholder as real
- cost ceiling per event with alerting

## Drift detection

- pin the model identifier; a change to `OPENAI_MODEL` is a release-gated event
- a scheduled (not per-commit) **golden-set eval**: fixed transcripts and lead fixtures scored against a rubric for grounding, required-field presence, absence of fabrication, tone, and length
- alert on rubric-score regression between runs — this is how you learn the provider changed the model under you

---

# 71. Silent Fallback and Degraded-Source Detection **[v3]**

Incident `e4f422c` was: counts stayed correct, intelligence panels emptied, and lead detail quietly served a thin legacy summary instead of the rich read model. Every ordinary assertion passed. This failure class — a fallback path that converts a defect into a plausible-looking success — defeats assertion-based testing by construction and needs its own pattern.

- for every read path with a fallback or compatibility source, assert **which source served the response**, not only that the response was non-empty
- expose source provenance in the API payload (or a test-only header) so tests can assert `source: canonical` versus `source: legacy_fallback`
- a fallback that fires in a fixture where rich data exists is a **failing test**, not a passing degraded one
- fallback firing rate is a production metric with an alert threshold (§57)
- apply the same pattern to: legacy `follow_up_date` compatibility derivation, historical role alias normalization, `company` versus `company_text`, and any "if null, use X" branch on a canonical read

§67 names "no hidden fallback that turns failure into misleading success" as an architecture gate. This section makes it a runtime-testable invariant rather than a code-review aspiration.

---

# 72. Mobile Local Database Migration and Device Handover **[v3]**

Mobile SQLite is at schema version 5 with its own independent versioned evolution. v2 §34 tests app upgrade but never the local database across that upgrade. This is a silent data-loss vector.

## Local schema migration

- upgrade from each supported prior local schema version **with pending outbox rows present** — queued leads and uploads must survive
- downgrade and reinstall behavior
- migration failure mid-way leaves no partial state that blocks capture
- corrupt local DB recovery without losing queued work
- disk full during local write

## Outbox correctness

- **ordering:** a lead's creation drains before its audio upload; assert dependency ordering, not merely eventual delivery
- concurrent drain prevention (the mutex) under rapid foreground/background cycling
- stale-running job reset after the bounded age threshold
- exponential backoff schedule asserted, not assumed
- a queued operation whose target event or company access was revoked before drain fails safely rather than writing cross-scope
- queued operations applied after an **event switch** land in the originally captured event

## Device handover — a P0 leak class v2 does not name

- User A signs out, User B signs in on the same device: A's `local_leads`, voice notes, outbox rows, drafts, and cached company/event snapshots are unreachable and purged
- sign-out with pending outbox work has defined behavior (retain-and-block, or discard with warning) and is never silently synced under B's identity
- OAuth/provider connection state cleared on sign-out
- backgrounded app holding A's session, resumed after B signs in elsewhere

---

# 73. Shipped-Client Compatibility and OTA Update Safety **[v3]**

§49 says compatibility tests "must protect currently supported web and mobile versions" but never defines how you know what is shipped. Store binaries are built from `9f3a347` while mobile `main` is `7ad37f1` — a gap containing capture, recording, auth, and OAuth work. Every backend deploy is currently a bet against an app version nobody tests.

- freeze an **API contract snapshot per released binary**, checked into the repo, tagged with its build commit and store version
- replay every frozen snapshot against each backend deploy in CI; a break fails the deploy, not the store review
- maintain an explicit supported-client window with a documented deprecation path
- test new backend + old client, and old backend + new client, during rollout ordering
- OTA/EAS update channel, if approved: bad-update rollback, JS bundle paired with mismatched native modules, update applied while the outbox has pending rows, update-check race at cold start
- assert that `app.json` build numbers are **not** treated as release evidence; EAS remote versioning is authoritative

---

# 74. Outbound Webhooks and CRM Synchronization **[v3]**

§48 covers inbound webhooks well. Outbound delivery and CRM sync — Salesforce, HubSpot, Zapier, Make, n8n — are untested, and they are the paths that push customer data off your infrastructure.

- payload scope: an outbound webhook carries only the subscribing company's and event's data
- no provider tokens, internal secrets, or other tenants' identifiers in payloads
- customer endpoint down, slow, or hanging must not block the originating request
- retry policy, max attempts, dead-letter, and manual replay
- endpoint auto-disable after sustained failure, with notification
- signing secret rotation
- CRM: field mapping, upstream duplicate detection, sync direction and conflict resolution, object deleted upstream, per-tenant OAuth, sandbox versus production instance, partial sync resume
- an integration card visible in settings but not operational must be provably disabled **server-side**, not merely hidden

---

# 75. Dangerous-Flag and Bypass-Path Production Assertions **[v3]**

The codebase ships deliberate bypasses: `E2E_AUTH_BYPASS_ENABLED`, `APPLE_REVIEW_LOGIN_ENABLED` and its allowlisted email, `ALLOW_DEMO_LEAD_INTELLIGENCE_SEED`, `ALLOW_DEV_LEAD_BRIEFING_SEED`, `ALLOW_PROD_WORKFLOW_SEED`, `DEMO_SEED_ALLOWED_COMPANY_IDS`, `ALLOW_LEAD_INSIGHTS_PLAYGROUND`, and various `*_DEBUG` flags. Cheap to test, catastrophic to miss.

- a post-deploy production suite that **positively asserts each bypass rejects**: E2E auth bypass denied, seed routes denied, insights playground unreachable, debug flags off
- Apple review login is its own security row: only the exact allowlisted email, only when the gate is on, never issuing elevated scope, and synchronized across Supabase Auth, server allowlist, and EAS production config
- CI fails if a new bypass-shaped flag is added without a corresponding production assertion
- the **reverse safety check**: excluded destructive/security-db/migration/load-stress categories cannot target production; explicitly `prod-safe` tests may target the designated production test tenant/accounts

---

# 76. Provider Test Strategy — Replay, Sandbox, Canary **[v3]**

§§45–47 specify roughly 120 provider cases and implicitly assume they run live. Against real Google that is slow, rate-limited, quota-bound, and flaky, and it will be the first thing the team disables. Each case needs a declared tier.

- **Tier 1 — recorded replay:** most provider states (expired token, partial scope, rate limit, malformed response, outage) run against recorded HTTP fixtures. Fast, deterministic, every commit.
- **Tier 2 — live sandbox:** a dedicated Google Workspace test domain with owned accounts, running the provider contract suite nightly. Covers real consent, real MIME, real Calendar payloads, real deep-link return.
- **Tier 3 — production canary:** minimal, to owned mailboxes only, post-deploy.
- **Fixture drift job:** re-record Tier 1 fixtures on a schedule and diff against the committed set. Otherwise recorded fixtures test your 2026 assumptions forever and a silent Google API change is invisible until a customer finds it.

State the tier for every case, so the suite has a runtime budget that survives contact with CI.

---

# 77. Testability Prerequisites in Production Code **[v3]**

Several sections of this plan are not implementable against the current code without seams. These are engineering tasks that block test work and are currently unscheduled.

- **injectable clock** — §62's DST, midnight, leap-day, expiry, and lease-timeout cases are untestable without one
- **deterministic ID and idempotency-key generation** under test
- **fault-injection seams** at each dependency boundary — §56 requires forcing Supabase unavailable, pool exhausted, provider DNS failure
- **a way to force "unknown provider outcome"** — central to the architecture and not reliably producible against a real provider
- **source provenance in read payloads** — required by §71
- **request correlation ID** threaded UI → API → DB → provider → job (§57 assumes it exists)
- **a test-only hook to drain the outbox and job queue** deterministically rather than by sleeping
- **a controllable AI response layer** so §70 can assert prompt assembly and simulate refusals

---

# 78. Combinatorial Reduction and Executable Scope **[v3]**

This plan says journeys "should be parameterized by the relevant role, scope, lifecycle, data-completeness, network, and retry states." Taken literally that is roughly 9 roles × 4 scopes × 8 lifecycle states × 13 data states × 12 network states × 9 retry states — hundreds of thousands of cases per journey. Without a stated reduction strategy, "exhaustive" is not executable and the team will improvise the cut silently.

- adopt **risk-based pairwise (all-pairs) generation** as the default: cover every pair of parameter values rather than every combination, typically reducing case count by two to three orders of magnitude while catching most interaction defects
- reserve **full cross-product** for P0 invariants only: tenant isolation, event isolation, authorization denial, duplicate side effects
- treat every historical escaped defect as a **pinned case**, exempt from reduction
- state the target wall-clock for each cadence: every commit, every PR, nightly, pre-promotion
- publish the reduction, so a blank matrix cell reads "excluded by pairwise, covered nightly" rather than "forgotten"

---

# 79. Baseline Gap Analysis Against the Existing Suite **[v3]**

This plan specifies a destination with no starting point. Today there are roughly 95 mobile Vitest files, 267 top-level web Node test files, 15 Playwright specs, Maestro flows, journey harnesses, health routes, and canary scripts.

- map every existing suite to the section(s) it partially satisfies
- classify each as: covers the invariant / covers a weaker claim / does not cover it
- flag the known-weak category explicitly — some existing suites **assert source strings or use fake databases and fake providers**, so they can pass while the real behavior is broken. Those are worse than absent coverage, because they read as green.
- produce the delta, and only then sequence the work

---

# 80. Test Effectiveness and the Escaped-Defect Loop **[v3]**

The main product program must prove behavior, not decorative source text.

Keep:

- regression tests for every escaped production defect
- matrix review asking whether each escaped defect represents a broader class gap
- safe local mutation testing where isolated from production
- tracking escaped defects per release and whether claimed coverage would have caught them

The deliberate tenant-predicate removal drill is removed from this 14-prompt program and belongs to the separate engineering/security suite.

# 81. Ownership, Runtime Budget, and Sequencing **[v3]**

Not a test domain, but the reason exhaustive plans usually die.

- name an owner per section; unowned sections do not get built or maintained
- budget the suite's own cost: CI minutes, provider quota, AI eval spend, fixture maintenance hours
- define what "v1 of this plan is done" means, so the effort has an end state rather than an open-ended backlog

Suggested build order, given the incident history:

1. **§71** silent-fallback provenance and **§69** conversation pipeline — the largest untested subsystem and the source of the most expensive incident
2. **§75** bypass assertions and **§78** reduction strategy — both cheap, and they unblock everything else
3. **§72** local DB migration and device handover — a P0 leak class with zero current coverage
4. **§73** shipped-client contracts — a store release is pending
5. **§77** seams — these gate large parts of §§56, 62, and 65
6. **§70** AI drift and **§76** provider tiering

---

# Current Pinned Production Regressions

These are mandatory in the remaining prompts and exempt from pairwise reduction:

1. Lead created/imported for Event A must never appear in Event B.
2. Dashboard "Leads today" must not use server UTC as the business day.
3. Lead Metadata must not render UTC as if it were local/event time.
4. Event/business metrics must not use a browser timezone cookie as their canonical definition.
5. First request must be correct without a timezone bootstrap refresh.
6. Two viewers in different browser timezones must see identical event-level metrics.
7. AI Briefing Strategy editing one field must not wipe untouched fields.
8. Campaign draft signature must come from the initiating authenticated user.
9. Importer full-name semantics and missing-identity validation must be correct.
10. Platform-admin company context must survive navigation/refresh and exit cleanly.
11. Company-scoped invite/resend/seat behavior must reconcile downstream.
12. Every important lead mutation must be verified across list/detail/dashboard/event counts/scope/reload and sibling surfaces where applicable.
13. `events.location = Toronto` with null `city/state` must render Toronto on event, account-card, readiness, and identity surfaces.
14. Follow-up dashboard counts and linked Leads destinations must return the same exact IDs for none/future/today/overdue/completed/cleared/hot+cold/closed fixtures.
15. Hot classification is `temperature = hot` across dashboard, organizer, campaigns, lead list/detail, and mobile, including conflicting priority fixtures.
16. Account event-card totals must stay exact above provider row limits without fetching all lead rows.
17. Metric-query failure must render unavailable/degraded and must never render “nothing is waiting.”
18. Bounded intelligence must disclose analyzed/total coverage or use an authoritative full count; newest-300/newest-500/newest-1,000 samples cannot imply full-event truth.

---

# Full End-to-End Journey Inventory

The following journeys must exist as executable suites. Each journey should be parameterized by the relevant role, scope, lifecycle, data-completeness, network, and retry states from the sections above.

## J1. Platform provisioning to first exhibitor access

1. Platform admin creates/configures account/company/organizer/event/license.
2. Invites exhibitor admin.
3. Invite is redeemed by the intended email.
4. Seat/license is consumed exactly once.
5. Exhibitor sees only assigned company/event.
6. Audit shows platform actor and customer context separately.

## J2. Zero-event exhibitor onboarding

1. Invite new exhibitor admin with no event.
2. Sign in on direct link and normal entry.
3. See actionable Create your first event state.
4. Create event with all canonical creation fields, including location where required.
5. Reload and verify persistence.
6. Event switcher and navigation work from creation screens.

## J3. Multi-event isolation

1. Create Event A and Event B under same company.
2. Import/create/capture data in A.
3. Verify every list/count/detail/search/workflow/campaign/export/mobile view in B is unchanged.
4. Repeat mutation attempts using B UI with A IDs and direct APIs.

## J4. Cross-company isolation and platform support context

1. Create Company A and B with similar-looking objects.
2. Prove normal users cannot discover or mutate across companies.
3. Enter Company A as platform admin, perform support action, exit context.
4. Verify caches, identity, audit, and subsequent platform scope.

## J5. Import-to-action journey

1. Upload CSV/XLSX/Google Sheet with clean, sparse, malformed, duplicate, Unicode, and formula-like rows.
2. Map fields manually and automatically.
3. Reconcile preview/readiness with final server validation.
4. Import into selected event.
5. Verify exact rows, scope, counts, identity preservation, duplicates, and export.
6. Retry after timeout without duplicate rows.

## J6. Mobile capture-to-web journey

1. Sign in on supported device.
2. Grant/deny/recover camera and microphone permissions.
3. Select/resolve active event.
4. Scan badge and optionally record audio.
5. Simulate timeout after server insert.
6. Verify exactly one lead in DB, mobile detail, web event list, priority, counts, and audit.
7. Verify no other event/company changes.

## J7. Web-to-mobile shared-edit journey

1. Edit name/title/company/rating/follow-up/status on web as supported.
2. Resume/focus mobile.
3. Verify canonical values and ranking.
4. Edit on mobile and verify web after reload.
5. Repeat with simultaneous edits and defined conflict outcome.

## J8. Lead triage journey

1. Search/filter/sort large lead set.
2. Change rating and follow-up from list.
3. Open detail and verify sync.
4. Edit sparse and enriched lead variants.
5. Verify Priority ordering, ties, counts, reload persistence, and event scope.

## J9. AI Briefing Strategy partial-update journey

1. Populate all four fields.
2. Edit each field individually in separate tests.
3. Clear each field intentionally.
4. Race rapid/out-of-order autosaves.
5. Inject server failure and refresh.
6. Verify untouched fields never change and success copy reflects real persistence.

## J10. Workflow generation journey

1. Configure enabled/disabled workflow variants.
2. Use matching/non-matching leads.
3. Include optional missing conversation summary and required missing inputs.
4. Exercise approvals, stale edits, retries, duplicate scheduler ticks, and partial failures.
5. Prove exactly one correct output with correct actor/event/company.

## J11. Campaign authoring journey

1. Create campaign in correct event/company.
2. Select and deduplicate recipients.
3. Select signals/context.
4. Generate draft.
5. Verify logged-in user signature and no cross-recipient/context bleed.
6. Manually edit and reload.
7. Approve/reject/regenerate according to state rules.

## J12. Email send journey

1. Connect provider with required scopes.
2. Send controlled message.
3. Verify From, Reply-To, signature, recipient, provider ID, Sent behavior, mailbox receipt, activity, and audit.
4. Inject timeout after provider acceptance and retry.
5. Prove no duplicate send.
6. Exercise bounce/partial/rate-limit/revocation recovery.

## J13. Calendar scheduling journey

1. Connect calendar provider.
2. Load exact two-week availability in correct timezone.
3. Verify busy/private/all-day/recurring/DST cases.
4. Create meeting with Meet/Teams.
5. Verify provider event and LR activity.
6. Reschedule/cancel/reconcile external changes.
7. Retry unknown outcome without duplicate event.

## J14. Integration disconnect/reconnect journey

1. Connect on web/mobile bridge as applicable.
2. Revoke externally.
3. Observe actionable reconnect-required state.
4. Disconnect with provider failure.
5. Verify local state is truthful.
6. Reconnect a different account and verify identity/scope.

## J15. Viewer/read-only journey

1. Sign in as viewer.
2. Read allowed leads/campaigns/signals.
3. Attempt every mutation through UI, direct URL, and application API where applicable.
4. Verify deterministic denial and zero DB/audit side effects except security logging.

## J16. Organizer journey

1. View only organizer-scoped events/exhibitors/licenses.
2. Manage allowed license/access operations.
3. Attempt platform/company actions outside scope.
4. Verify counts, direct API denial, and cross-event isolation.

## J17. Lifecycle completion/archive journey

1. Move event upcoming → active → completed/archived using supported mechanisms.
2. Verify capture, imports, edits, workflows, campaigns, mobile availability, and exports follow explicit lifecycle rules.
3. Handle users with stale pages/apps.
4. Reactivate where supported and verify data integrity.

## J18. User/role/offboarding journey

1. Change user role while logged in.
2. Remove event/company access.
3. Revoke provider connection and session as designed.
4. Verify immediate server-side denial, cache clearing, seat reconciliation, and audit.
5. Ensure historical authored records retain correct actor identity.

## J19. Migration and rollback journey

This journey is handled by the separate engineering suite in an isolated environment and is not part of the main 14-prompt production product program.

## J20. Failure and recovery journey

1. Use deterministic local/replay seams for provider/network/unknown-outcome failures.
2. Observe user-facing state, logs, metrics, activity/audit, and retry behavior.
3. Restore normal dependency behavior.
4. Reconcile unknown outcomes.
5. Prove no duplicate side effect and correct final state.
6. Do not intentionally break or exhaust production infrastructure.

## J21. Large-event journey

Use realistic controlled datasets to verify pagination, search, filtering, imports, dashboards, and mutations behave correctly at meaningful sizes without load/stress abuse against production.

Formal 5k/10k load/stress characterization is tracked separately.

## J22. Production deployment journey

1. Validate config/secrets and migration compatibility.
2. Deploy preview and run full P0/P1 plus visual review.
3. Promote production.
4. Run synthetic tenant smoke/canary.
5. Verify logs/alerts and mobile compatibility.
6. Confirm rollback/remediation documentation exists; destructive rollback rehearsal is handled separately.

## J23. Conversation capture to intelligence to action **[v3]**

1. Record on device under poor connectivity.
2. Navigate away mid-recording; confirm audio binds to the originating lead.
3. Reconnect; upload resumes and completes exactly once.
4. Transcription and synthesis complete; readiness versions correctly.
5. Evidence, themes, objections, and briefing appear on lead detail and roll up to the event dashboard.
6. Assert the rendered intelligence came from the canonical read model, not a fallback (§71).
7. Use the brief in a campaign draft; assert prompt contents are scoped to that lead/event/company (§70).
8. Add a second voice note; confirm additive regeneration preserves the first.

## J24. Shared-device handover **[v3]**

1. User A captures leads offline on a booth device.
2. A signs out with pending outbox work.
3. User B signs in on the same device.
4. Assert B sees none of A's local leads, notes, drafts, outbox rows, or cached event context.
5. A signs back in; assert pending work is intact and drains under A's identity.

## J25. App upgrade with pending offline work **[v3]**

1. Install the current **store** build, not `main`.
2. Capture leads offline and start an upload.
3. Upgrade to the new build.
4. Assert local schema migrates, queued work survives, ordering is preserved, and drain completes exactly once with no duplicates.
5. Repeat across each supported prior local schema version.

## J26. Model and provider drift detection **[v3]**

Scheduled, not per-commit.

1. Re-record provider fixtures and diff against the committed set.
2. Run the AI golden-set eval and compare rubric scores to baseline.
3. Run the live sandbox provider contract suite.
4. Alert on any behavioral delta not attributable to a code change.

## J27. Bypass and environment safety audit **[v3]**

Post-deploy, against production.

1. Assert every seed, debug, playground, and auth-bypass route rejects.
2. Assert Apple review login accepts only the allowlisted identity and grants no elevated scope.
3. Assert excluded destructive/security-db/migration/load-stress categories cannot target production; explicitly `prod-safe` tests may.
4. Assert synthetic tenant data is namespaced and fully cleaned; treat failed cleanup as an incident.

---

# Fixture Families

Maintain canonical fixture packs rather than ad hoc rows:

- **Tenant pack:** Company A/B, organizer scopes, platform-switch context
- **Event pack:** zero/one/multiple; upcoming/active/completed/archived
- **User pack:** each role; invited; disabled; role-changed; multiple memberships
- **Lead pack:** pristine, sparse, malformed, duplicate, Unicode, enriched, legacy, long-field, cross-event, cross-company
- **Import pack:** CSV/XLSX/Sheets semantic variants, corrupt/oversized/security payloads
- **Workflow pack:** optional/required context, approval states, scheduled/retry/dead-letter
- **Campaign pack:** recipient overlap, stale selection, manual edits, personalization variants
- **Provider pack:** connected, partial scope, expired, revoked, rate-limited, unknown outcome
- **Time pack:** DST, midnight, date-only, leap day, multiple timezones
- **Scale pack:** 100/1k/5k/10k/25k/50k leads
- **Conversation pack [v3]:** clean transcript, noisy transcript, zero-byte, truncated, 60-minute over-context, multi-note additive, failed-processing by category
- **AI pack [v3]:** golden transcripts with scored reference outputs, refusal/malformed-response cases, prompt-assembly snapshots
- **Client-version pack [v3]:** frozen API contract snapshots per released store binary
- **Local-schema pack [v3]:** SQLite databases at each supported prior version, populated with pending outbox rows

Each test owns or snapshots its mutable fixture state and restores/cleans it deterministically.

---

# CTO Release Gates

A production release is blocked unless all applicable gates pass:

## Correctness and security

- 100% P0 and P1 tests pass on first attempt
- zero cross-company or cross-event leakage
- zero unauthorized mutations through UI/API product boundaries
- zero duplicate customer-impacting side effects under retry tests
- all destructive writes verify DB end state
- all expensive/customer-facing bugs have regression coverage

## Data and architecture

- schema drift check passes across Supabase migrations, generated types, web, and mobile (**[v3]** Prisma removed pending confirmation it is in the stack — see §51)
- **[v3]** frozen contract snapshots for every supported shipped mobile binary pass against the deploying backend
- **[v3]** every bypass/seed/debug path asserted rejecting in production
- **[v3]** no canonical read path served a legacy fallback in a fixture containing rich data
- controlled test-record end-state checks show no duplicate/cross-scope associations
- canonical service/authorization paths are used
- no new deprecated-field or unscoped-query violations

## Product quality

- critical web/mobile E2E journeys pass
- required browser/device matrix passes (Chrome + Safari — §59)
- **[v3.2]** accessibility gate **suspended** while §60 is deferred. Reinstate when §60 is picked up.
- visual comparison approved for every changed UI surface (the 4–5 baseline screens — §61)
- no native date/time controls introduced
- no misleading success state or placeholder presented as real intelligence

## Performance and reliability

- production-safe performance budgets show no unacceptable regression
- no unacceptable regression versus baseline
- alerts and runbooks verified for critical failure classes

## Delivery

- config/secrets validation passes
- preview/pre-prod smoke passes
- production synthetic canary passes
- rollback/remediation is documented and rehearsable
- no skipped/quarantined P0/P1 test

---

# Coverage Matrix Template

For every feature/action, maintain a row with these columns:

| Feature / Action | Canonical rule owner | Roles | Company scope | Event scope | Lifecycle | Data states | Offline/network | Retry/idempotency | Concurrency | Persistence | API security | Web | Mobile | Cross-surface | Provider | Performance | Visual | Production synthetic | Deferred to security/DB suite | Severity | Test IDs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

**[v3.2] Column changes.** `RLS/API security` → `API security` (raw RLS is out of program). `Accessibility` removed while §60 is deferred. `Migration impact` → `Deferred to security/DB suite`, which records what this program consciously did not cover for that row — so an excluded cell reads as a routed decision, not a gap.

Any blank cell must be either:

- a test gap with an owner and due date, or
- explicitly not applicable with a reason.

“Covered by E2E” is not a valid cell value unless the exact state and assertion are named.

---

# Definition of Exhaustive for LR

LR is not exhaustively tested because every line has a test or because one happy path exists per screen.

LR is exhaustively tested when:

1. every business-critical invariant has one named canonical owner;
2. every meaningful role/scope/state/failure combination is represented using a risk-based matrix;
3. web, mobile, application API, provider, and asynchronous product paths agree on the same truth;
4. retries, supported concurrency, stale clients, and recoverable product failures cannot create duplicates, leaks, or destructive loss;
5. supported real-world functional scale is covered, while formal load/stress characterization is tracked separately;
6. production is observable, recoverable, and safely deployable;
7. the suite itself is deterministic enough that a green run is credible;
8. **[v3]** the reduction strategy is published, so the gap between "tested" and "excluded" is explicit rather than accidental;
9. **[v3.2]** escaped production defects are pinned with behavioral regression tests; deliberate-break security drills are handled separately.
