# Voice Events Workspace Redesign Plan

## Purpose

Redesign the Events-only Voice workspace so it behaves like an event-intelligence product rather than a configuration page, survey builder, deployment console, and lifecycle manager all at once.

This plan is designed to run with:

- `GENERIC_PROMPT_LOOP_CONTROLLER.md`
- `VOICE_EVENTS_WORKSPACE_REDESIGN_PROMPTS.md`

The loop controller governs execution order, scope control, verification, and stop conditions. This document is the product and architecture source of truth.

---

## Required Loop Inputs

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
Events-only Voice workspace: event Overview, Event Areas, Surveys index, New Survey flow, Survey detail, Operations, Events-only navigation, and Events-only wrappers/components required to support them.

Out-of-scope areas:
SMB/retail surfaces, shared SMB defaults, kiosk capture behavior, transcription/analysis pipeline, response processing, account provisioning, auth redesign, analytics contract redesign, speculative or unrelated schema work, unsafe migrations, and unrelated event modules.

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
existing event survey lifecycle APIs
existing QR/kiosk primitives
```

Default file-count guardrail:

```txt
Max files per prompt: 14
```

---

## Recommended Model

**Fable**

Use the same Fable session for all four prompts so it can preserve visual intent, page hierarchy, terminology, and responsive behavior across the loop.

Do not begin the next prompt until the active prompt passes its acceptance checks. The loop controller may continue automatically only after the active phase is complete and no hard stop is triggered.

---

## Product Outcome

The first event workspace viewport should answer:

1. What is happening at this event?
2. What needs attention?
3. Where is feedback being collected?
4. What should the operator do next?

It should not primarily answer:

- How many setup objects have been created?
- Where are every QR code and public URL?
- How do I edit, publish, archive, and delete every survey at once?
- Which of several duplicate buttons opens the Command Center?

The final experience should separate browsing, creation, content editing, deployment, lifecycle management, and event intelligence into clear task-specific surfaces.

---

## Blunt Assessment of the Current Experience

The current event workspace asks individual screens to perform too many jobs.

### Overview currently over-prioritizes setup

The first viewport is consumed by:

- oversized event metadata
- database-style counters
- a completed five-step setup checklist
- duplicate Command Center or dashboard promotions
- navigation that competes with the actual product value

A completed setup checklist should not remain the dominant content after the event is ready.

### Surveys currently combines unrelated tasks

The Surveys area is simultaneously:

- a survey index
- a complete survey creator
- an Event Area creator
- a question-authoring tool
- an AI-generation workflow
- a voice picker
- a deployment console
- a lifecycle-control surface
- a destructive-admin surface

Existing surveys remain visible under the creation form, making the page feel like one endless control panel rather than a collection of listening points.

### Survey cards expose deployment artifacts as list metadata

Each survey card repeats combinations of:

- event status
- survey status
- launchable state
- QR code
- public URL
- launch action
- edit
- publish/unpublish
- archive/restore
- delete
- question previews
- voice configuration

QR codes and public URLs are deployment tools. They do not belong fully rendered in every survey-index item.

### The creation form exposes multiple domain objects at once

The user is effectively creating or linking several related objects:

```txt
EventStructureItem
  = Event Area identity, name, type, and description

SurveyTarget
  = the survey's scoped target/snapshot linked to the event and Event Area

Survey
  = survey name, description, questions, voice, lifecycle, and responses

PublicSurveyLink
  = generated deployment link associated with the Survey
```

These distinctions are valid technically, but the operator should not be forced to understand all of them during basic survey creation.

### Coverage is presented like insight

The current Targets/Questions breakdown mostly communicates:

- answer volume by target
- answer volume by question
- highlighted or priority evidence counts
- current filter selection

It does not inherently communicate sentiment, meaning, urgency, or recommended action. It should be labeled and designed as **Feedback Coverage**, then used to filter the actual insights/evidence.

---

## Approved Product Decisions

### 1. Keep the term “Event Area”

Customer-facing language remains:

- Event Areas
- Create Event Area
- Attach to Event Area

Do not rename the object to “feedback point” in primary UI labels. “Feedback point” may be used as explanatory copy where helpful, but not as a replacement domain term.

### 2. Use one Command Center destination

Local event navigation should be:

```txt
Overview | Event Areas | Surveys | Operations
```

Keep one prominent **Open Command Center** action in the compact event header.

Do not add a duplicate local `Insights` tab that routes to the same Command Center destination. Avoid simultaneous labels such as:

- Insights
- View Dashboard
- Open Command Center
- Command Center card

### 3. Completed setup leaves the main Overview

When setup is incomplete:

- show the current incomplete stages
- show the actual blocker or next configuration action
- keep the guidance compact and actionable

When setup is complete:

- do not show the expanded five-step checklist on Overview
- optionally show one compact status row:
  `Event setup complete · 5 surveys · 15 Event Areas · Manage in Operations`
- the full checklist remains available in Operations

### 4. Navigation is not a “Next Best Action”

Do not render `Next Best Action` when the only recommendation is:

- open the Command Center
- view the dashboard
- navigate to another page

A real next-best action must be derived from an actual condition, such as:

- launch surveys for uncovered areas
- review a negative signal
- resolve an inactive public link
- address recurring registration complaints

### 5. Surveys default to a compact management index

The default Surveys view shows:

- survey lifecycle status
- survey name
- attached Event Area
- question count
- response count
- Open action
- optional compact overflow menu

It does not show:

- QR bitmap
- public URL
- question text
- voice configuration
- event status
- a second launchable badge
- launch controls
- full lifecycle controls
- destructive controls

### 6. Survey creation uses a dedicated Events-only route

Do not use an inline creator underneath or above the survey list.

Use a dedicated route with browser navigation, a clear cancel path, and mobile space.

Recommended flow:

```txt
Step 1 — Event Area
Use existing Event Area | Create new Event Area

Step 2 — Survey Content
Survey name
Optional advanced description
Questions
Add question
Generate with AI

Step 3 — Voice and Review
Current/default voice summary
Change voice
Preview
Create survey
```

Creation should produce a draft and land on Survey detail. Publishing and deployment remain deliberate post-create actions.

### 7. Existing and new Event Area paths are mutually exclusive

#### Existing Event Area

- send only `eventStructureItemId` for the target association
- show selected Event Area name and type as read-only context
- hide all Event Area editing fields
- do not allow survey creation to edit the selected Event Area

#### New Event Area

Reveal only after explicit selection:

- Event Area type
- Event Area name
- optional Event Area description under `Add Event Area details`

Do not show existing-area selection and new-area fields simultaneously.

### 8. Do not show two descriptions by default

#### Survey description

- owning object: `Survey`
- optional
- hide under Advanced details during creation, or move to Survey detail
- not part of the default first-pass flow

#### Event Area description

- owning object: `EventStructureItem`
- only visible when creating a new Event Area
- optional
- collapsed under `Add Event Area details`

The two descriptions are not technically duplicates, but they are duplicates from the operator’s perspective when both are exposed in one task.

### 9. Voice uses progressive disclosure

During creation:

- show the selected/default voice as a compact summary
- show `Change voice`
- reveal gender, voice options, and preview only when requested

Do not render a large permanent voice-configuration panel in the default creation state.

### 10. Survey detail owns deployment and lifecycle

Survey detail should own:

- content/questions
- voice
- deployment
- lifecycle
- danger zone

Recommended structure:

```txt
Survey Header
Name
Attached Event Area
One lifecycle status
Question and response counts
State-specific primary action

Content
Questions
Add/edit/reorder
Generate with AI

Voice
Selected voice
Change
Preview

Deployment
QR
Copy link
Download PNG
Launch kiosk

Lifecycle
Publish
Unpublish
Archive
Restore

Danger Zone
Delete when server-side rules permit
```

Do not mix event-name editing into Survey detail.

### 11. Feedback Coverage is a filter, not the insight itself

Rename/reframe the Targets/Questions component as:

```txt
Feedback Coverage
```

Use clear columns or labels such as:

```txt
Source / Question
Answers
Priority signals
```

Bars must have a meaningful label, scale, or direct count. Clicking an item should filter or focus the actual insights/evidence surface.

Do not imply that answer volume alone is sentiment or performance.

---

## Target Information Architecture

```txt
Event Workspace
├── Compact event header
│   ├── event identity
│   ├── status
│   ├── date/location
│   └── Open Command Center
│
├── Overview
│   ├── Event Pulse
│   ├── Needs Attention
│   ├── real next-best action, only when one exists
│   ├── compact setup status
│   ├── Feedback Coverage summary
│   ├── response activity
│   └── recent evidence/actions
│
├── Event Areas
│   ├── Event Area index
│   ├── create/edit/archive Event Area
│   └── Attach Survey action
│
├── Surveys
│   ├── compact Survey index
│   └── New Survey route
│
├── Operations
│   ├── full setup checklist
│   ├── launch readiness
│   └── event-level deployment readiness
│
└── Survey Detail
    ├── Content
    ├── Voice
    ├── Deployment
    ├── Lifecycle
    └── Danger Zone
```

---

## Desktop Wireframes

### Event Overview

```txt
[All Events / Event Name]

Event Name                                    [ACTIVE] [Open Command Center]
Sep 17–18, 2026 · Venue                       [More]

Overview | Event Areas | Surveys | Operations

┌────────────────────────────────────┬───────────────────────────┐
│ EVENT PULSE                        │ NEEDS ATTENTION           │
│ Synthesized event summary          │ 2–3 real issues           │
│ response/answer trend and context   │ or truthful empty state   │
└────────────────────────────────────┴───────────────────────────┘

✓ Event setup complete · 5 surveys · 15 Event Areas    [Manage in Operations]

┌────────────────────────────────────┬───────────────────────────┐
│ RESPONSE ACTIVITY                  │ FEEDBACK COVERAGE         │
│ trend                              │ source / answers / flags  │
└────────────────────────────────────┴───────────────────────────┘

[Recommended Actions] [Recent Evidence]
```

### Surveys Index

```txt
SURVEYS                                                [New Survey]
5 surveys · 4 live · 1 draft

[Search] [All] [Live] [Draft] [Archived]

[Live]  Overall Event Pulse    Event-wide       3 questions  24 responses  Open >
[Draft] Registration Arrival   Registration     2 questions   0 responses  Open >
[Live]  Opening Keynote        Opening Keynote  2 questions  11 responses  Open >
```

### New Survey

```txt
[Back to Surveys]  New Survey

1 Event Area  ──  2 Content  ──  3 Voice & Review

Use existing Event Area | Create new Event Area

[step-specific fields]

[Cancel]                                              [Continue/Create]
```

### Survey Detail

```txt
[Back to Surveys]

Opening Keynote Feedback                     [LIVE] [Launch Kiosk]
Opening Keynote · 3 questions · 11 responses

Content | Voice | Deployment | Lifecycle

[active section]

Danger Zone appears only in the appropriate management section.
```

---

## Mobile Wireframes

### Surveys Index

```txt
[Back] Surveys                              [+ New]

[Search]
[All] [Live] [Draft] [Archived]

[Live] Overall Event Pulse
Event-wide · 3 questions · 24 responses
Open >

[Draft] Registration Arrival
Registration · 2 questions · 0 responses
Open >
```

### New Survey

```txt
[Back]
New Survey
Step 1 of 3

Use existing Event Area
Create new Event Area

[step fields]

[Continue]
```

### Survey Detail

```txt
[Back]
Opening Keynote Feedback
[LIVE]

Opening Keynote
3 questions · 11 responses

[Primary action]

Content
Voice
Deployment
Lifecycle
```

---

## Field-Disposition Rules

| Current field/control | Owning object | Default creation behavior |
|---|---|---|
| Survey name | Survey | Visible |
| Survey description | Survey | Advanced details or Survey detail |
| Attach to Event Area | Association / SurveyTarget | Visible |
| Create new Event Area choice | Creation mode | Visible |
| Event Area type | EventStructureItem | Reveal only for new Event Area |
| Event Area name | EventStructureItem | Reveal only for new Event Area |
| Event Area description | EventStructureItem | Optional, collapsed, new Event Area only |
| Selected Event Area summary | EventStructureItem | Read-only after existing selection |
| Questions | Survey / Question | Visible |
| Add Question | Question interaction | Visible |
| Generate with AI | Authoring aid | Visible; details remain in modal |
| AI context/goal/tone/count | Generation request | AI modal only |
| Voice summary | Survey | Visible compactly |
| Voice picker/gender | Voice helper | Reveal on Change voice |
| Preview voice | Voice interaction | Reveal on Change voice |
| Response mode | Survey | Remove from creation while fixed voice-only |
| Public kiosk URL | PublicSurveyLink | Survey detail / Deployment |
| QR/copy/download | PublicSurveyLink | Survey detail / Deployment |
| Publish/unpublish/archive/restore | Survey lifecycle | Survey detail |
| Delete | Survey lifecycle | Survey detail / Danger Zone |

---

## Canonical Data and Behavior Rules

- `Event` remains the top-level event container.
- `EventStructureItem` remains the source of truth for Event Area identity and details.
- `SurveyTarget` remains the scoped survey target linked to the event and Event Area.
- `Survey` remains the source of truth for survey content, voice, status, and responses.
- `PublicSurveyLink` remains the source of truth for public deployment.
- Reuse the current creation service and builder payload.
- Reuse the current lifecycle APIs.
- Reuse the current QR/link/kiosk primitives.
- Preserve current token links and public kiosk behavior.
- Preserve `?survey=` deep links until a deliberate redirect strategy is approved.
- Preserve Event Area Attach Survey handoff.
- Do not assume one survey per Event Area.
- Do not create duplicate event, target, survey, QR, kiosk, response, answer, or analytics systems.
- Do not add UI-only persisted state to avoid using canonical records.

---

## Phased Implementation Strategy

### Prompt 1 — Surveys Index and New Survey

Highest-impact structural fix:

- remove inline creator from index
- use compact survey rows
- add dedicated Events-only New Survey route
- implement existing/new Event Area branching
- apply field ownership and progressive disclosure
- preserve creation service, selected-area handoff, and deep links

### Prompt 2 — Survey Detail, Deployment, and Lifecycle

Repurpose the existing destination into a true Survey detail workspace:

- Content
- Voice
- Deployment
- Lifecycle
- Danger Zone
- state-specific primary action
- remove event-editing concerns
- preserve lifecycle side effects and server authority

### Prompt 3 — Event Overview and Workspace Cleanup

Fix the broader event workspace:

- compact header
- one Command Center CTA
- remove completed setup checklist from Overview
- remove duplicate navigation/promotional cards
- move full checklist to Operations
- improve above-the-fold Event Pulse and Needs Attention
- reframe Targets/Questions as Feedback Coverage

### Prompt 4 — UX Consistency and Regression Pass

No new product direction:

- terminology consistency
- status consistency
- responsive behavior
- empty/loading/error states
- back/cancel navigation
- deep links
- duplicate controls
- Events-only/SMB regression verification
- final browser review

---

## Testing and Browser States

### Prompt 1

- Surveys index renders rows only
- creator is absent from index
- QR/URL/destructive controls absent from rows
- dedicated New Survey route loads
- existing-area path works
- new-area path works
- both paths are mutually exclusive
- two descriptions are not visible by default
- selected Event Area handoff works
- creation lands on current survey destination
- desktop 1440px
- mobile 375px
- SMB survey surfaces unchanged

### Prompt 2

- draft detail
- active detail
- archived detail
- publish activates existing public link
- unpublish returns to draft
- archive disables launch
- restore returns to draft
- QR/copy/download/launch work for active survey
- delete remains guarded by server rules
- second survey opens independently
- `?survey=` deep link still resolves
- desktop and mobile

### Prompt 3

- complete event setup state
- incomplete event setup state
- Overview no longer dominated by completed checklist
- only one prominent Command Center CTA
- duplicate bottom cards removed
- real next-best action retained only when condition exists
- Feedback Coverage labels/counts are clear
- clicking coverage filters/focuses actual evidence where supported
- Operations retains full setup checklist
- desktop and mobile

### Prompt 4

- all navigation paths
- all empty states
- loading/error states
- narrow viewport behavior
- status badge consistency
- no Event Area terminology drift
- no duplicate deployment controls
- no unrelated SMB changes
- focused tests, typecheck, and relevant build checks pass

---

## Hard Product Stops

Stop for human review if implementation discovers that:

- the current APIs cannot preserve the existing/new Event Area branch without a backend contract change
- lifecycle actions do not consistently control `PublicSurveyLink`
- `?survey=` deep links cannot be preserved safely
- Survey detail requires changing canonical ownership
- Event Area selection is not event-scoped
- a required schema change depends on an unresolved product decision, cannot be migrated safely, or would require destructive data handling
- shared SMB components cannot be changed safely without an Events-only wrapper
- the requested redesign would remove currently accessible functionality without a replacement destination

---

## Definition of Done

The redesign is complete when:

- the event first viewport emphasizes intelligence and action
- completed setup no longer dominates Overview
- the Surveys index is compact and browsable
- survey creation is isolated on a dedicated route
- Event Area ownership is clear
- two descriptions are not shown by default
- Survey detail owns editing, deployment, lifecycle, and deletion
- Feedback Coverage is clearly distinguished from actual insight
- one Command Center destination remains
- all existing lifecycle, QR, kiosk, deep-link, and Event Area handoff behavior remains intact
- Events-only changes do not alter SMB behavior
- desktop and mobile states pass browser verification
