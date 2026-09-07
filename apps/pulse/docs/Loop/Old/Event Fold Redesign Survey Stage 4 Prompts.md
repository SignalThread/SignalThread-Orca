# SignalThread Event Survey Phase 1 — Stage 4 Prompt Pack

## Purpose

This prompt pack executes **Stage 4: Fast Event Launch — Existing Templates, Survey Availability, and Deployment Kit** from the SignalThread Event Survey Phase 1 brief.

Stage 4 is one implementation stage containing four sequential prompts:

1. Audit the existing event-template, launch, scheduling, public-link, and QR infrastructure
2. Extend the existing event templates to optionally create recommended mixed-question surveys
3. Implement canonical survey availability scheduling and enforcement
4. Implement the event-level deployment kit and complete Stage 4 hardening

Use this file with the existing generic loop controller and the Phase 1 product brief.

---

## Required Inputs

```txt
Loop controller:
docs/Loop/GENERIC_PROMPT_LOOP_CONTROLLER.md

Plan document:
docs/Loop/Event Fold Redesign Voice Survey Brief.md

Prompt document:
docs/Loop/Event Fold Redesign Survey Stage 4 Prompts.md

Expected branch:
feat/voice-events-phase1-stage4-fast-launch

Schema mode:
OPEN

Allowed scope:
Stage 4 only: extending the existing Events template system; optional creation of recommended mixed-question surveys from existing templates; canonical survey availability scheduling; Event Area/session-relative timing; server-side open/close enforcement; survey launch readiness; event-level QR/link deployment workspace; bulk QR download; printable QR/signage output; and targeted Events-only shared changes required to support this safely.

Out of scope:
Post-event briefs, Stage 5 reporting, external Slack/Teams/email/SMS notifications, attendee identity, registration-platform integrations, cross-event benchmarking, portfolio analytics, advanced conditional logic, adaptive AI follow-up interviews, unrelated event workspace redesign, unrelated SMB redesign, and any new parallel template, survey, QR, kiosk, or scheduling system.

Canonical models/services:
Event
EventStructureItem
SurveyTarget
Survey
Question
PublicSurveyLink
Response
Answer
existing event-template definitions and creation services
lib/event-voice-surveys.ts
lib/event-survey-builder-payload.ts
existing event creation APIs
existing public-link resolution
existing QR generation/download primitives
existing kiosk token and eventId resolution
existing Event Areas and Survey creation flows
existing event/account authorization helpers

Maximum files per prompt:
14 unless the active prompt proves more are required and the loop controller requires human review.
```

---

## Global Product Rules

- Do not build a second event-template system.
- Extend the existing templates already used for Conference, Expo / Trade Show, Workshop, Brand Activation, and Blank Event.
- Templates currently create Event Areas. Stage 4 may optionally extend them to create recommended Surveys, Questions, and draft PublicSurveyLinks through existing canonical services.
- Event Area remains the customer-facing term.
- Templates must remain editable after creation.
- The Command Center remains the center of the product.
- Survey timing exists to collect feedback while the event team can still act.
- The server must enforce survey availability.
- QR codes and public links remain deployment artifacts owned by existing PublicSurveyLink behavior.
- Do not create duplicate QR, link, kiosk, or launch-state systems.
- Existing voice-only surveys, mixed-question surveys, kiosk collection, Command Center intelligence, alerts, and SMB behavior must remain functional.
- Schema mode is `OPEN`.
- Required additive schema and migration changes are allowed when genuinely needed by Stage 4.
- Do not reset the database or run destructive migration commands.
- Keep route handlers thin.
- Put template expansion, availability resolution, launch readiness, and bulk deployment logic in canonical services/helpers.
- Do not begin Stage 5.

---

# Prompt 1 — Audit Existing Templates, Launch Readiness, Scheduling, Public Links, and QR Infrastructure

**Recommended model: Sol Medium**

## Task

Audit the current Events template system, event creation flow, Event Area generation, Survey creation, PublicSurveyLink lifecycle, kiosk launch resolution, QR generation/download, and any existing scheduling or availability behavior.

This prompt is **audit-only**.

Do not edit files.

## Audit Goals

Determine exactly how the current system:

- defines event templates
- presents template choices
- creates Events
- creates Event Areas from templates
- represents template-specific structures
- handles Conference, Expo / Trade Show, Workshop, Brand Activation, and Blank Event
- creates Surveys
- creates SurveyTargets
- creates or activates PublicSurveyLinks
- publishes/unpublishes Surveys
- generates QR codes
- downloads QR PNGs
- launches kiosk links
- resolves token and eventId links
- handles event and session dates/times
- stores time zones
- handles any existing open/close timing
- determines launch readiness
- separates Events and SMB behavior

## Required Investigation

### 1. Existing template architecture

Inspect:

- template definition files
- template identifiers
- template metadata
- event creation UI
- event creation APIs/services
- Event Area generation
- any template-specific defaults
- tests that define template behavior

Document the exact canonical path:

```txt
Template selection
→ Event creation
→ EventStructureItems / Event Areas
```

Identify whether templates are code-defined, persisted, or hybrid.

### 2. Template behavior and current limits

For each existing template, document:

#### Conference

- Event Areas created
- session placeholders
- event-wide touchpoints
- default descriptions or timing

#### Expo / Trade Show

- expo-floor areas
- sponsor/exhibitor areas
- registration or networking touchpoints

#### Workshop

- workshop/breakout areas
- event-wide areas
- session timing assumptions

#### Brand Activation

- activation touchpoints
- sponsor/experience areas
- any custom-area behavior

#### Blank Event

- what is omitted
- what the user must create manually

Confirm the current product behavior that templates create Event Areas only and do not currently create Surveys or response data.

### 3. Survey creation contract

Inspect the canonical path for:

```txt
EventStructureItem
→ SurveyTarget
→ Survey
→ Questions
→ PublicSurveyLink
```

Determine:

- how a Survey is attached to an existing Event Area
- how draft versus active state is created
- whether a PublicSurveyLink is created in draft
- whether creation can be invoked safely in bulk
- whether services are idempotent
- how duplicate recommended Surveys could be prevented
- whether one Event Area may have multiple Surveys
- how mixed question types from Stages 1–2 are represented

### 4. Existing public-link and QR behavior

Inspect:

- PublicSurveyLink fields
- token generation
- active/inactive state
- expiry behavior
- publish/unpublish side effects
- QR rendering
- QR download
- copy link
- kiosk launch
- existing QR modal/card primitives
- existing bulk or printable behavior, if any

Identify which parts can be reused unchanged.

### 5. Existing scheduling and timing

Inspect:

- Event date/time fields
- EventStructureItem/session start/end fields
- timezone ownership
- Survey timing fields, if any
- PublicSurveyLink expiry fields, if any
- kiosk launch validation
- server and client date handling
- tests around timezone or date ranges

Determine whether Stage 4 requires:

- new Survey availability fields
- new PublicSurveyLink fields
- a separate canonical availability model
- derived availability from Event Area timing
- a safe hybrid

Do not recommend duplicating timing across multiple models without a single source of truth.

### 6. Availability contract

Recommend the exact canonical contract for:

```txt
OPEN_IMMEDIATELY
CUSTOM_WINDOW
RELATIVE_TO_EVENT_AREA
```

The recommendation must cover:

- source-of-truth model
- timezone
- opensAt
- closesAt
- relative anchor
- relative offset
- behavior when Event Area timing changes
- behavior when timing is missing
- behavior when the Survey is draft
- behavior when the PublicSurveyLink is inactive
- response creation enforcement
- kiosk unavailable states
- existing responses after closure
- manual override
- validation and error semantics

### 7. Recommended template expansion

Recommend how the existing templates should optionally create Surveys.

Approved operator choice:

```txt
Create Event Areas only
Create Event Areas with recommended Surveys
```

For each template, recommend:

- which Event Areas receive Surveys
- Survey names
- mixed question types
- default draft status
- default availability suggestion
- whether all recommended Surveys should be selected by default
- how the operator reviews and edits before creation
- how duplicate creation is prevented

Initial recommended Survey patterns:

#### Overall Event Experience

- RATING_1_TO_5
- RECOMMENDATION_0_TO_10
- VOICE

#### Session / Speaker Feedback

- RATING_1_TO_5 for content value
- RATING_1_TO_5 for speaker effectiveness
- VOICE

#### Sponsor / Exhibitor Feedback

- RATING_1_TO_5 for experience/value
- optional RECOMMENDATION_0_TO_10 where semantically appropriate
- VOICE

Do not treat every 0–10 question as NPS automatically.

### 8. Deployment-readiness contract

Recommend the canonical checks for:

- Event Areas without Surveys
- Surveys without Event Areas
- draft Surveys
- inactive PublicSurveyLinks
- missing tokens
- unavailable/invalid schedules
- timing conflicts
- closed Surveys
- QR readiness
- link readiness
- no questions
- unsupported mixed question configuration

Determine where readiness is computed and how it is exposed to the Events UI.

### 9. Deployment kit architecture

Recommend the safest way to support:

- list of all deployable Surveys
- Event Area labels
- QR preview
- copy link
- individual PNG download
- bulk PNG package
- printable QR/signage sheet
- readiness warnings

Identify whether server-side ZIP/PDF generation is required or whether a browser-generated package is safe and maintainable.

### 10. Events versus SMB boundary

Identify:

- shared QR primitives
- shared link services
- shared template code, if any
- SMB survey assumptions
- changes that must remain Events-only
- wrapper boundaries required to avoid SMB regressions

## Required Output

Return:

1. Current template architecture.
2. Exact files and functions involved.
3. Current behavior for each existing template.
4. Canonical Event Area creation path.
5. Canonical Survey creation path.
6. Current PublicSurveyLink and QR behavior.
7. Existing timing and timezone model.
8. Proposed availability contract.
9. Proposed production-safe migration plan, if needed.
10. Proposed existing-template expansion behavior.
11. Recommended Surveys/questions for each template.
12. Duplicate-prevention and idempotency rules.
13. Deployment-readiness contract.
14. Deployment-kit architecture.
15. Events versus SMB boundary.
16. Tests required for Prompts 2–4.
17. Exact implementation sequence for Prompt 2.
18. Risks and unresolved product decisions.

## Hard Stops

Stop for human review if:

- the current template system has multiple conflicting canonical sources
- existing Event Area creation cannot be extended safely
- Survey creation cannot be called idempotently from templates
- event/session timing ownership is unclear
- availability would require conflicting sources of truth
- token or PublicSurveyLink behavior cannot support scheduling safely
- a destructive migration appears necessary
- Events and SMB cannot be separated safely

## Acceptance Checks

- No files changed.
- Existing template and launch architecture is documented.
- One canonical availability model is recommended.
- Existing template expansion is defined without creating a second template system.
- Deployment readiness and deployment-kit architecture are explicit.
- Prompt 2 can proceed without inventing architecture.

## Loop Rule

Use the loop controller’s stop format.

Do not begin Prompt 2 until this audit is complete and no hard stop is triggered.

---

# Prompt 2 — Extend Existing Templates with Recommended Mixed-Question Surveys

**Recommended model: Sol Medium**

## Task

Extend the existing Events template system so organizers can choose between:

```txt
Create Event Areas only
Create Event Areas with recommended Surveys
```

Use the existing template definitions and canonical Event Area and Survey creation services.

Do not create a second template system.

## Product Goal

A small-event organizer should be able to create a useful event feedback structure in minutes without manually building every Survey.

## Required Changes

### 1. Existing template chooser

Preserve the current template choices:

- Conference
- Expo / Trade Show
- Workshop
- Brand Activation
- Blank Event

Add a clear launch option after template selection:

```txt
Event Areas only
Event Areas + recommended Surveys
```

Do not imply that templates create real response data.

### 2. Recommended Survey review

Before creation, show the recommended Surveys generated by the selected template.

The operator must be able to:

- review Survey names
- see the attached Event Area
- see question count/types
- deselect unwanted recommended Surveys
- edit Survey names where safe
- continue with Event Areas only
- continue with selected recommended Surveys

Do not expose internal `SurveyTarget` language.

### 3. Canonical creation path

Template expansion must use:

```txt
existing Event creation
existing EventStructureItem creation
existing createEventVoiceSurvey or approved canonical Survey service
existing Question persistence
existing PublicSurveyLink creation
```

Requirements:

- no direct route-specific copies of business logic
- event/account scope enforced
- Survey/Event Area association correct
- mixed question types persist
- recommended Surveys created as draft unless the plan explicitly approves otherwise
- PublicSurveyLinks created according to existing lifecycle semantics
- duplicate recommendations prevented
- retry-safe/idempotent creation where practical
- partial failure reported clearly

### 4. Template-specific recommended Surveys

Implement the approved set from Prompt 1.

At minimum:

#### Conference

- Overall Event Experience
- Session / Speaker Feedback for approved session Event Areas
- optional Registration / Arrival Feedback where the current template includes registration

#### Expo / Trade Show

- Overall Event Experience
- Expo Floor Feedback
- Sponsor / Exhibitor Feedback for approved activation/booth areas

#### Workshop

- Overall Workshop Experience
- Workshop / Facilitator Feedback for approved workshop areas

#### Brand Activation

- Overall Activation Experience
- Activation / Touchpoint Feedback
- Sponsor Value Feedback only where semantically appropriate

#### Blank Event

- no automatic Survey recommendations
- preserve fully manual behavior
- optionally provide a separate post-create action to add a Survey, but do not turn Blank into a hidden template

### 5. Mixed question definitions

Use only approved canonical types:

```txt
VOICE
RATING_1_TO_5
RECOMMENDATION_0_TO_10
```

Templates must create editable questions.

Do not hard-code NPS semantics unless the prompt/question explicitly represents recommendation intent.

### 6. Default lifecycle

Recommended Surveys should be:

- created as draft
- editable
- not silently launched
- not automatically exposed publicly unless existing product rules explicitly require an inactive PublicSurveyLink record

The operator should review and publish deliberately.

### 7. Result and recovery

After creation:

- show the Event and Event Areas
- summarize Surveys created
- identify any skipped or failed recommendations
- provide direct paths to Surveys and deployment readiness
- avoid duplicate creation when retrying after a network failure

### 8. Existing behavior

Preserve:

- Event Areas-only template creation
- existing Event creation
- manual Event Area creation
- manual Survey creation
- selected-area handoff
- mixed-question builder
- kiosk
- Command Center
- SMB behavior

## Tests

Add focused tests for:

- each existing template still creates its current Event Areas
- Event Areas-only option
- Event Areas + Surveys option
- deselecting one recommended Survey
- Conference recommendations
- Expo recommendations
- Workshop recommendations
- Brand Activation recommendations
- Blank Event creates no recommended Surveys
- mixed question types persist
- draft lifecycle
- correct Event Area association
- no duplicate recommended Surveys on retry
- partial failure behavior
- event/account scope
- current manual flows remain functional
- SMB regression

## Out of Scope

Do not implement:

- availability scheduling
- bulk QR package
- printable signage
- post-event brief
- external notifications
- Stage 5

## Acceptance Checks

- Existing templates remain the source of truth.
- Organizers can choose Event Areas only or Event Areas + recommended Surveys.
- Recommended Surveys are reviewable and deselectable.
- Mixed questions use canonical types.
- Surveys are created through canonical services.
- Surveys are draft and editable.
- Duplicate creation is prevented.
- Blank Event remains manual.
- Existing manual flows remain functional.
- SMB behavior remains unchanged.
- Focused tests and typecheck pass.
- Desktop and mobile browser verification passes.

## Loop Rule

Complete, test, review against the Phase 1 brief, and correct Prompt 2 before starting Prompt 3.

Use the loop controller’s stop format.

---

# Prompt 3 — Canonical Survey Availability Scheduling and Server Enforcement

**Recommended model: Sol Medium**

## Task

Implement canonical Survey availability scheduling for Events.

Support:

```txt
Open immediately
Custom open and close times
Open relative to Event Area/session timing
```

The server must enforce availability.

## Product Goal

Feedback should arrive while the event team can still act, without requiring organizers to manually publish and close every Survey at the exact moment.

## Required Changes

### 1. Canonical availability model

Implement the availability contract approved by Prompt 1.

It must support:

- mode
- timezone
- opensAt
- closesAt
- relative anchor
- relative open offset
- relative close offset or duration
- manual override where approved
- validation
- stable resolution to an effective open/close window

Do not duplicate the same authoritative timing across Survey and PublicSurveyLink unless one is explicitly derived.

### 2. Availability modes

#### Open immediately

- available when Survey lifecycle and PublicSurveyLink state permit
- no custom timing required

#### Custom window

- explicit opensAt
- explicit closesAt
- timezone-safe input and display
- opensAt must precede closesAt
- clear behavior if only one boundary is allowed by the approved contract

#### Relative to Event Area/session

Support approved anchors such as:

- Event Area start
- Event Area end

Support approved offsets such as:

- open at start
- open 10 minutes before end
- open at end
- close 30 minutes after end
- close 2 hours after end

Use bounded, understandable controls rather than a generic scheduling engine.

### 3. Timing ownership and updates

Implement the approved rule for when Event Area timing changes.

Requirements:

- derived relative windows remain explainable
- invalid/missing Event Area timing produces a clear readiness error
- no silent fallback to an unintended time
- timezone remains deterministic
- changes do not corrupt existing responses

### 4. Server enforcement

Enforce availability in the canonical kiosk launch/response creation path.

The server must distinguish:

```txt
Not yet open
Open
Closed
Inactive/unpublished
Invalid schedule
```

Do not rely only on UI-disabled buttons.

### 5. Kiosk states

Provide clear attendee-facing states:

#### Not yet open

- Survey name
- clear availability message
- optional opening time
- no response creation

#### Closed

- clear closed message
- no new response creation
- existing responses remain readable by admins

#### Inactive/unpublished

- preserve current unavailable behavior
- do not expose internal lifecycle terminology unnecessarily

#### Invalid schedule

- safe generic attendee message
- detailed admin readiness warning

### 6. Survey detail and creation UI

Add concise availability controls to the appropriate Events-only Survey surfaces.

Use progressive disclosure.

Default should remain simple.

Do not make every organizer configure a schedule.

Recommended default:

```txt
Open immediately
```

### 7. Template integration

Recommended Surveys created from templates may include suggested availability settings.

Suggestions must remain editable.

Examples:

- session feedback opens 10 minutes before end and closes 2 hours after
- registration opens at registration start and closes 30 minutes after end
- overall event opens near event end and remains open for an approved duration

Do not require templates to have complete timing if the Event Areas lack schedules.

### 8. Lifecycle interaction

Define and enforce:

- draft Survey is not launchable even if its time window is open
- inactive PublicSurveyLink is not launchable
- published Survey before opensAt shows Not yet open
- published Survey after closesAt shows Closed
- unpublish immediately disables collection
- archive disables collection
- restore follows current lifecycle semantics
- existing responses remain intact

### 9. Readiness payload

Expose canonical readiness issues for:

- missing opensAt/closesAt
- opensAt after closesAt
- missing Event Area timing for relative schedule
- closed Survey
- inactive link
- unpublished Survey
- missing questions

## Tests

Add focused tests for:

- Open immediately
- custom future opening
- custom active window
- custom closed window
- invalid custom range
- relative-to-start
- relative-to-end
- negative offset
- positive offset
- missing Event Area timing
- Event Area timing update
- timezone conversion
- draft lifecycle interaction
- inactive link interaction
- archive interaction
- token kiosk enforcement
- legacy eventId compatibility
- existing response preservation
- SMB regression

## Out of Scope

Do not implement:

- bulk QR package
- printable signage
- post-event brief
- external notifications
- recurring schedules
- complex campaign automation

## Acceptance Checks

- One canonical availability model exists.
- Availability is server-enforced.
- All three approved modes work.
- Relative timing is Event Area-aware and timezone-safe.
- Kiosk shows clear not-yet-open and closed states.
- Lifecycle and link state remain authoritative.
- Existing responses remain intact.
- Readiness errors are available to admins.
- Templates may provide editable suggestions.
- Voice-only and mixed kiosk flows remain functional.
- SMB behavior remains unchanged.
- Migration, focused tests, typecheck, and browser verification pass.

## Loop Rule

Complete, test, review against the Phase 1 brief, and correct Prompt 3 before starting Prompt 4.

Use the loop controller’s stop format.

---

# Prompt 4 — Event Deployment Kit, Readiness, Bulk QR/Signage, and Stage 4 Hardening

**Recommended model: Sol Medium**

## Task

Implement the Events-only deployment kit and complete Stage 4 integration and regression hardening.

This is the final Stage 4 prompt.

Do not begin Stage 5.

## Product Goal

An organizer should be able to review every Survey’s launch readiness and prepare all onsite QR/link materials without opening each Survey one at a time.

## Required Deployment Workspace

Create or extend an Events-only deployment surface that shows:

- Survey name
- attached Event Area
- lifecycle status
- effective availability
- PublicSurveyLink state
- QR readiness
- response eligibility
- readiness warnings
- copy link
- preview QR
- download PNG
- launch/open kiosk when valid

Do not duplicate full Survey editing or lifecycle controls unnecessarily.

### 1. Readiness summary

Show event-level counts such as:

- ready to deploy
- draft
- not yet open
- closed
- missing Event Area
- missing/invalid schedule
- inactive link
- Event Areas without Surveys

Use canonical readiness logic from Prompt 3.

Do not derive conflicting readiness in the UI.

### 2. Survey deployment rows/cards

Use a compact, scannable pattern.

Each item should clearly answer:

- What Survey is this?
- Which Event Area does it cover?
- Is it ready?
- When is it available?
- What deployment action is needed?

Avoid giant repeated QR cards.

### 3. Existing QR actions

Reuse current canonical primitives for:

- QR preview
- Copy Link
- Download PNG
- kiosk launch

Do not rebuild QR generation.

### 4. Bulk QR package

Provide a useful bulk export for all selected ready Surveys.

The implementation may use the approved architecture from Prompt 1, such as:

- ZIP of PNG files
- browser-generated download package
- server-generated package

Requirements:

- deterministic file names
- Event Area and Survey identification
- real PublicSurveyLink tokens
- exclude invalid/unready Surveys by default
- clear warnings for skipped Surveys
- no placeholder QR codes

Recommended filenames:

```txt
event-name__event-area__survey-name.png
```

Sanitize safely.

### 5. Printable QR/signage output

Provide one practical printable format.

Examples:

- printable HTML page
- print stylesheet
- PDF export if the existing architecture supports it safely

Each signage block should include:

- Event name
- Event Area
- Survey name
- QR code
- short attendee instruction
- optional availability message where helpful

Do not build a full design editor.

### 6. Selection and filtering

Allow useful filtering by:

- ready
- draft
- not yet open
- closed
- needs attention
- Event Area/category

Allow selecting which ready Surveys to include in bulk export.

Do not introduce a complex campaign manager.

### 7. Template-to-deployment journey

Verify the complete Stage 4 journey:

```txt
Create Event from existing template
Choose Event Areas + recommended Surveys
Review/deselect recommendations
Create draft Surveys
Edit/publish selected Surveys
Apply or confirm availability
Review deployment readiness
Download QR package
Print signage
Launch valid kiosk
```

### 8. Existing product behavior

Preserve:

- manual Event creation
- Event Areas-only templates
- manual Survey creation
- mixed Survey editing
- voice and structured kiosk collection
- Command Center metrics and alerts
- Survey lifecycle
- token and eventId links
- SMB behavior

## Responsive Requirements

Verify:

```txt
1440×1024 desktop
1024×900 narrow desktop/tablet
375×812 mobile
```

Requirements:

- readiness list remains scannable
- QR preview modal remains usable
- bulk selection works
- actions are not clipped
- no horizontal overflow
- print output is readable
- mobile may prioritize copy/share over bulk print where appropriate

## Architecture Review

Confirm:

- existing templates remain canonical
- recommended Survey creation uses canonical services
- one availability resolver exists
- one readiness service exists
- current PublicSurveyLink/QR primitives remain canonical
- no duplicate deployment system
- no UI-only launch authority
- routes remain thin
- event/account scope is enforced
- no Stage 5 code

Correct drift before completion.

## Migration Verification

Where schema changed:

```txt
npx prisma validate
npx prisma generate
```

Verify:

- migrations are production-safe
- no destructive command is required
- existing Surveys and links remain readable
- manual deployment steps are documented

## Required Test Coverage

Run the most targeted useful tests for:

- existing templates
- template + recommended Surveys
- Blank Event behavior
- duplicate prevention
- availability modes
- kiosk availability enforcement
- readiness computation
- bulk QR package
- printable signage
- token correctness
- lifecycle interaction
- Event/account authorization
- Events browser journeys
- mixed kiosk journeys
- Command Center regression
- SMB browser journeys
- typecheck
- build

Do not claim tests passed unless they ran.

## Stage 4 Definition of Done

Stage 4 is complete only when:

- existing templates can optionally create recommended mixed-question Surveys
- Event Areas-only behavior remains available
- recommended Surveys are draft and editable
- availability scheduling is canonical and server-enforced
- custom and Event Area-relative timing work
- not-yet-open and closed kiosk states work
- event-level readiness is visible
- QR/link actions remain canonical
- bulk QR export works
- one practical printable signage output works
- manual flows remain functional
- Command Center remains functional
- SMB remains unchanged
- desktop/tablet/mobile verification passes
- tests, typecheck, build, and migration checks pass
- Stage 5 has not been started

## Final Output

Use the loop controller’s final stop format for Stage 4.

Also include:

```txt
Stage 4 readiness for Stage 5: yes/no

Existing template system extended:
Template Survey recommendations:
Template duplicate-prevention:
Availability model:
Availability enforcement:
Relative schedule behavior:
Readiness service:
Bulk QR implementation:
Printable signage implementation:
PublicSurveyLink compatibility:
Mixed kiosk compatibility:
Command Center regression status:
SMB regression status:
Migration steps:
Post-event brief intentionally deferred:
```

Stop after the Stage 4 report.

Do not begin Stage 5.
