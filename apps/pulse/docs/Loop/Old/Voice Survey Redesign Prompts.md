# Voice Events Workspace Redesign Prompts

## Loop Execution

Read and follow:

1. `GENERIC_PROMPT_LOOP_CONTROLLER.md`
2. `docs/VOICE_EVENTS_WORKSPACE_REDESIGN_PLAN.md`
3. this prompt document

Execute the prompts in order. Do not skip, merge, or invent phases. Stop only on hard stops defined by the loop controller or plan.

## Required Inputs

```txt
Plan document:
docs/VOICE_EVENTS_WORKSPACE_REDESIGN_PLAN.md

Prompt document:
docs/VOICE_EVENTS_WORKSPACE_REDESIGN_PROMPTS.md

Expected branch:
feat/voice-events-workspace-redesign

Schema mode:
OPEN

Allowed scope:
Events-only Voice event workspace, Surveys index, New Survey, Survey detail, Event Overview, Event Areas, Operations, Events-only navigation, and Events-only wrappers/components required by these surfaces.

Out of scope:
SMB/retail UI behavior, speculative or unrelated schema work, unsafe migrations, kiosk capture, response processing, transcription/analysis pipeline, auth redesign, analytics contract redesign, and unrelated modules.

Canonical models/services:
Event
EventStructureItem
SurveyTarget
Survey
Question
PublicSurveyLink
Response
Answer
lib/event-voice-surveys.ts
lib/event-survey-builder-payload.ts
existing event survey lifecycle routes
existing QR/kiosk primitives

Max files per prompt:
14
```

---

# Prompt 1 — Surveys Index and Dedicated New Survey Flow

**Recommended model: Fable**

## Task

Separate the Events-only Surveys index from survey creation, convert existing survey cards into compact rows, and create a dedicated New Survey flow that reflects the current object model intentionally.

## Current Problem

The Surveys view currently renders:

- the complete Create Survey form
- Event Area creation
- question authoring
- AI generation
- voice configuration
- all existing surveys
- QR/public URLs
- launch controls
- lifecycle controls
- destructive controls

The creation form also exposes `Survey` and `EventStructureItem` descriptions together even though they belong to different objects and are not both relevant in the default path.

## Required Changes

### 1. Default Surveys index

- Rename the visible tab and page heading from `Surveys & Areas` to `Surveys`.
- Do not render the survey creator on the index.
- Add one clear `New Survey` action.
- Render existing surveys as compact management rows.

Each row shows only:

- one survey lifecycle status
- survey name
- attached Event Area
- question count
- response count
- one `Open` action
- an optional compact overflow menu only when necessary

Remove from index rows:

- QR bitmap
- public kiosk URL
- question text previews
- voice configuration
- event status
- separate launchable badge
- Launch Kiosk
- full edit/archive/delete stack
- deployment controls
- destructive controls

### 2. Dedicated Events-only New Survey route

Add a dedicated route for creating a survey.

It must provide:

- Back to Surveys
- Cancel
- browser-safe navigation
- mobile layout
- selected Event Area handoff when opened from Event Areas

Use the current creation API, service, and builder payload. Do not create a parallel creation path.

### 3. Existing versus new Event Area

Default to `Use existing Event Area`.

The two modes must be mutually exclusive.

#### Existing Event Area

- send only `eventStructureItemId`
- show selected Event Area name and type as read-only context
- hide Event Area type/name/description inputs
- do not edit the selected Event Area through this form

#### Create new Event Area

Reveal only after explicit selection:

- Event Area type
- Event Area name
- optional Event Area description under `Add Event Area details`

Keep the customer-facing term `Event Area`. Do not rename it to `feedback point`.

### 4. Survey fields and progressive disclosure

Default visible fields:

- Survey name
- Event Area choice
- Questions
- Add Question
- Generate with AI
- compact selected/default voice summary

Progressive disclosure:

- Survey description under `Advanced details`, or defer it to Survey detail
- voice picker, gender, and preview under `Change voice`
- Event Area description under `Add Event Area details`, new Event Area mode only
- AI generation context remains inside the AI modal

Remove from create:

- fixed voice-only response mode control
- public URL
- QR
- deployment controls
- lifecycle controls
- delete

Never show Survey description and Event Area description together by default.

### 5. Completion and navigation

- Create the survey through the current backend.
- Preserve draft/lifecycle semantics.
- After creation, navigate to the existing survey edit/detail destination.
- Preserve current `?survey=` deep links.
- Preserve selected Event Area Attach Survey handoff.
- Do not assume one survey per Event Area.

## Acceptance Checks

- Surveys opens as an index only.
- Creator is absent from the index.
- Existing surveys render as compact rows.
- QR, URLs, question previews, deployment, and destructive controls are absent from rows.
- New Survey opens on a dedicated Events-only route.
- Existing/new Event Area modes are mutually exclusive.
- Existing Event Area mode hides all area-editing fields.
- New Event Area mode conditionally reveals type/name and collapsed description.
- Two descriptions are not visible by default.
- Voice configuration is collapsed behind Change voice.
- Current creation service and API remain canonical.
- Creation succeeds and navigates to the current survey destination.
- Attach Survey preserves the selected Event Area.
- Existing deep links remain valid.
- SMB surfaces are unchanged.
- Verify desktop 1440px and mobile 375px.
- Run focused tests and typecheck.

## Execution Loop

Follow the loop controller exactly. Complete, test, visually verify, and correct Prompt 1 before starting Prompt 2.

---

# Prompt 2 — Survey Detail, Deployment, and Lifecycle

**Recommended model: Fable**

## Task

Repurpose the existing Events-only survey edit destination into a clear Survey detail workspace that owns content, voice, deployment, lifecycle, and destructive management.

## Current Problem

The current destination behaves like a mixed editor and event settings page. Survey content, event editing, public URL, voice, launch state, and lifecycle controls lack clear ownership and hierarchy.

## Required Changes

### 1. Survey detail header

Show:

- survey name
- attached Event Area
- one lifecycle status
- question count
- response count
- one state-specific primary action

Primary action by state:

- Draft: `Publish Survey`
- Active: `Launch Kiosk`
- Archived: `Restore to Draft`

Do not show event-name editing in Survey detail.

### 2. Detail sections

Use clear sections or tabs:

```txt
Content | Voice | Deployment | Lifecycle
```

#### Content

- survey name
- optional survey description
- questions
- add/edit/reorder
- AI generation
- preserve active-survey editing restrictions

#### Voice

- selected voice
- change voice
- preview
- preserve existing audio regeneration rules

#### Deployment

- QR
- public link
- copy link
- download PNG
- launch kiosk
- only show actions valid for the current lifecycle state

Reuse existing QR and public-link primitives. Do not rebuild QR behavior.

#### Lifecycle

- publish
- unpublish
- archive
- restore

Keep the current canonical server-side lifecycle behavior.

#### Danger Zone

- delete only when server-side rules permit
- retain explicit confirmation
- do not fake success before server confirmation

### 3. Lifecycle truth

Preserve exactly:

- publishing activates the existing public link
- unpublishing returns the survey to draft
- archiving disables launch
- restore returns to draft
- deletion remains server-authoritative and guarded

Do not split lifecycle rules across new UI-only logic.

### 4. Navigation and compatibility

- `Open` from the Surveys index lands here.
- Preserve `?survey=` deep links until a separate redirect plan is approved.
- Preserve links from Event Areas.
- A second survey must open and edit independently.
- Do not alter SMB survey detail behavior; use Events-only wrappers when needed.

## Acceptance Checks

- Draft, Active, and Archived detail states render correctly.
- Each state has one primary action.
- Content, Voice, Deployment, Lifecycle, and Danger Zone have clear ownership.
- Event-name editing is absent.
- Active survey deployment supports QR, copy, PNG download, and launch.
- Draft/Archived states do not expose invalid launch controls.
- Publish activates the current token link.
- Unpublish, archive, and restore preserve current semantics.
- Delete remains guarded by the server.
- Existing QR/kiosk behavior remains intact.
- Existing deep links remain valid.
- Second survey opens independently.
- SMB behavior remains unchanged.
- Verify desktop 1440px and mobile 375px.
- Run focused lifecycle, route, component tests, and typecheck.

## Execution Loop

Follow the loop controller exactly. Complete, test, visually verify, and correct Prompt 2 before starting Prompt 3.

---

# Prompt 3 — Event Overview and Workspace Cleanup

**Recommended model: Fable**

## Task

Redesign the Events-only event workspace above the fold so it emphasizes live event intelligence, removes completed setup clutter, and eliminates duplicate Command Center navigation.

## Current Problem

The event Overview currently spends most of the first viewport on:

- oversized event identity
- disconnected counters
- a completed setup checklist
- duplicate Command Center/dashboard cards
- navigation that competes with actual insights

The Targets/Questions panel communicates coverage but is visually presented like an insight.

## Required Changes

### 1. Compact event header

Keep:

- breadcrumb
- event name
- event status
- dates
- venue/location

Use:

- one prominent `Open Command Center` action
- compact secondary actions or overflow

Remove:

- oversized metadata card
- unnecessary empty space
- duplicate `View Dashboard` or Command Center promotions

### 2. Local navigation

Use:

```txt
Overview | Event Areas | Surveys | Operations
```

Do not add a duplicate local `Insights` tab that routes to the Command Center.

Keep `Open Command Center` in the header as the event-intelligence destination.

### 3. Event Pulse and Needs Attention

Above the fold, use real data already available to the page.

Event Pulse may include:

- synthesized event summary when analysis exists
- response and answer context
- sentiment/trend when available
- updated timestamp
- clear path to Command Center

Needs Attention should show:

- the highest-priority two or three real conditions
- a truthful empty state when nothing needs attention

Do not invent metrics, insight copy, or placeholder problems.

### 4. Setup behavior

#### Incomplete setup

- show current blockers or incomplete stages
- keep guidance compact and actionable

#### Complete setup

- remove the expanded five-step checklist from Overview
- optionally show one compact row:
  `Event setup complete · counts · Manage in Operations`
- keep the full checklist in Operations

### 5. Remove duplicate action cards

- remove the standalone Command Center promotional card
- do not render Next Best Action when it only opens Command Center or Dashboard
- keep Next Best Action only for a real derived condition
- navigation is not a next-best action

### 6. Feedback Coverage

Reframe the Targets/Questions area as:

```txt
Feedback Coverage
```

Make clear that it communicates:

- source/question
- answer count
- priority signal count
- current filter selection

Use clear labels rather than truncated badges.

Bars must have a meaningful scale/label or be replaced by direct counts.

Clicking a source/question should filter or focus the actual evidence/insights when supported by the current implementation.

Do not imply that volume alone is sentiment, performance, or actionability.

### 7. Reclaim the page

Allow actual event-intelligence content to move upward:

- response activity
- top Event Areas
- recommended actions
- recent evidence
- other existing real insight modules

Do not replace removed setup cards with more setup copy.

## Acceptance Checks

- At 1440×1024, the first viewport shows compact event identity, Event Pulse, Needs Attention, compact setup status when complete, and navigation.
- Completed five-step setup no longer dominates Overview.
- Full checklist remains in Operations.
- Only one prominent Command Center CTA exists above the fold.
- Duplicate Command Center/Dashboard cards are gone.
- Next Best Action appears only for a real condition.
- Surveys navigation label is `Surveys`.
- Feedback Coverage is clearly labeled as coverage/filtering.
- No fake metrics or hard-coded insights are introduced.
- Existing actions and routes still work.
- SMB surfaces are unchanged.
- Verify complete and incomplete setup states.
- Verify desktop 1440px and mobile 375px.
- Run focused tests and typecheck.

## Execution Loop

Follow the loop controller exactly. Complete, test, visually verify, and correct Prompt 3 before starting Prompt 4.

---

# Prompt 4 — Final UX Consistency and Regression Pass

**Recommended model: Fable**

## Task

Perform a final Events-only consistency and regression pass across the redesigned event workspace. This is polish and correction only, not another redesign.

## Review Scope

- Event Overview
- Event Areas
- Surveys index
- New Survey
- Survey detail
- Operations
- Events-only event navigation
- Command Center entry
- desktop and mobile states

## Required Review

### 1. Terminology

Use consistently:

- Event Area
- Surveys
- Operations
- Open Command Center
- Feedback Coverage

Remove drift such as:

- Surveys & Areas
- feedback point as a primary object label
- View Dashboard when it means Command Center
- multiple lifecycle labels for the same state

### 2. Actions and hierarchy

- one primary action per state/screen
- no duplicate Command Center actions
- no duplicate lifecycle controls
- no deployment controls on the survey index
- no destructive actions outside Survey detail/Danger Zone
- no navigation-only Next Best Action

### 3. Status consistency

- one lifecycle status per survey
- event status is not repeated on every survey
- launchable state is represented through valid actions, not a second competing status badge
- draft, active, archived, complete/incomplete setup states are visually consistent

### 4. Navigation and state

- back/cancel behavior is predictable
- browser back works
- Event Area Attach Survey handoff works
- `?survey=` deep links work
- second survey opens independently
- filters/search retain sensible behavior
- no stale creation state leaks into index/detail

### 5. Responsive behavior

Verify:

- 1440px desktop
- 1024px desktop/tablet
- 375px mobile

Check:

- no horizontal overflow
- compact rows remain readable
- creator steps remain usable
- Survey detail actions do not crowd
- setup and pulse modules stack correctly
- QR modal remains usable

### 6. Empty/loading/error states

- no surveys
- no Event Areas
- no responses
- no insights
- nothing needs attention
- setup incomplete
- setup complete
- failed create/update/lifecycle request
- loading states do not shift the page destructively

### 7. Regression boundaries

- Events-only changes stay isolated
- SMB survey creation remains unchanged
- SMB QR behavior remains unchanged
- kiosk behavior remains unchanged
- lifecycle APIs remain canonical
- do not make speculative schema changes; when a schema change is genuinely required by the active prompt and plan, follow the OPEN schema and production-safe migration rules in the loop controller
- no unrelated refactor

## Acceptance Checks

- All four surfaces feel like one coherent product.
- No duplicate object descriptions appear by default.
- No duplicate navigation or Command Center promotion remains.
- Survey index, creation, detail, deployment, and lifecycle ownership are clear.
- Feedback Coverage is not presented as sentiment or recommendation.
- Desktop and mobile browser verification passes.
- Focused Events tests pass.
- Relevant SMB regressions pass.
- Typecheck passes.
- Any unrelated pre-existing failures are clearly reported and not hidden.
- Final report follows the loop controller’s Final Stop Format.

## Execution Loop

Follow the loop controller exactly. Do not introduce new product scope. Fix only issues found within this plan, then provide the final stop report.
