# Advanced Event Survey Builder — Product Brief + Implementation Prompt

## Product Brief

### Scope

This redesign applies **only to ADVANCED Events** in SignalThread Pulse.

Do not change the survey creation or editing experience for:

- Basic/simple events
- Blank/simple survey flows
- SMB survey creation
- Legacy standalone survey creation
- Any non-Advanced Event experience

The Advanced Event builder should become a creation workspace rather than a settings form or multi-step wizard.

The core product model is:

### Layer 1 — Content
**What are we asking?**

Question type describes the shape of the data only.

Supported types:

- Open response
- 1–5 rating
- 0–10 recommendation
- Yes / No
- Single choice
- Speaker feedback

**Voice is not a question type.**

A question can be read aloud without changing its data type. A structured question such as a 1–5 rating remains a structured tap-based response even if Pulse reads the prompt aloud.

### Layer 2 — Experience
**How is the survey delivered?**

These are survey-level settings, not per-question settings.

Presentation:

- Read on screen
- Read aloud
- Attendee chooses

Open-response answer method:

- Speak
- Type
- Attendee chooses

Pulse voice appears only when read-aloud behavior is relevant.

### Layer 3 — Availability
**When is the survey open?**

Supported models:

- Always open
- Fixed date/time window in the event timezone
- Relative to an assigned session using offsets from the actual agenda time

Availability should drive the survey's state/status presentation where appropriate.

---

## Key Product Principles

### One canvas, no wizard

The builder should feel like one continuous creation workspace.

The attendee preview remains visible in a sticky rail while the organizer works.

### Assignment is optional

A survey may exist before the organizer decides where it will be used.

`Not assigned` is a valid neutral state, not an error.

Do not:

- block save
- show a warning just because assignment is missing
- create a fake target
- default to “Overall Event”
- create placeholder sessions

Assignment can happen later.

### Never retype what Pulse already knows

When a survey is assigned to existing event context, use the canonical Pulse data for:

- Session names
- Speaker names
- Speaker rosters
- Event areas
- Agenda times
- Event timezone

Do not copy these values into freeform survey configuration if the relationship already exists.

### Context unlocks features

Session/speaker-specific functionality should only appear when compatible assignment exists.

Examples:

- Speaker feedback
- Session-relative availability
- Session/speaker contextual preview

If the required context is absent, hide unavailable context-specific question types instead of displaying disabled clutter.

### New model stays canonical

For normalized Advanced Event surveys, the canonical architecture is reusable:

```text
Event
  -> Survey
      -> Questions
      -> many target assignments
          -> SurveyTarget
          -> target-scoped PublicSurveyLink
```

`Survey.surveyTargetId` is a nullable legacy/primary authoring pointer, not
assignment truth. A survey may be unassigned or may have many simultaneous
session, speaker, event-area, event-wide, or custom target assignments. Replacing
an assignment changes only the selected target. It never moves the survey away
from other targets and never clones the survey or its questions.

Public launch tokens resolve both the reusable Survey and the specific target
assignment. Responses retain `surveyId`, `surveyTargetId`, and
`publicSurveyLinkId`. Session titles and speaker rosters are resolved at launch
from the current canonical agenda for that assignment, so agenda edits flow
through without rewriting survey content.

Do not introduce a parallel survey system.

Existing legacy/backwards-compatibility behavior is separate and must not be broken by this redesign.

---

## Builder UX

### Survey identity and assignment

Near the top:

- Survey name
- Draft state
- Assignment chips or `Not assigned`
- Assign action

Assignment is a separate action from survey creation.

A survey can be created and saved without assignment.

### Question type chooser

Replace a bare dropdown with a visual palette.

Each question type should show the control the attendee will actually use.

Examples:

- 1–5 rating shows five rating cells
- 0–10 recommendation shows the scale
- Yes / No shows two choices
- Single choice shows radio-style options
- Open response shows its response control
- Speaker feedback shows speaker-rating behavior

Question types describe data only. Nothing in this chooser should use “Voice response” as a type.

Keyboard behavior:

- Search focused when opened
- Arrow keys navigate
- Enter selects
- After selection, focus moves to the new question text field

### Question cards

Collapsed by default.

Collapsed cards should be compact and show:

- Drag handle
- Number
- Type
- Question text
- Required/optional state
- Relevant context badge

Only one card should be expanded at a time.

Expanded cards expose editing controls.

Question cards may echo survey-level experience, but may not independently configure it.

Example:

`Attendee speaks or types`

can appear read-only on an Open Response card if that is the current survey-level experience.

Actions:

- Drag reorder
- Keyboard reorder
- Duplicate
- Delete from overflow
- Undo after delete

### Speaker feedback

When compatible session/speaker context exists:

- Speaker feedback becomes available
- Use the live speaker roster from Pulse
- Use plain-language labels such as `Uses session speakers`
- Never expose merge-tag syntax or technical placeholders

---

## Assignment Model

Use one assignment interface for:

- Event-wide
- Sessions
- Speakers
- Event Areas
- Custom

Do not create five separate assignment flows.

Where relevant, support:

- All
- Selected

Example:

`All sessions` should follow future agenda changes.

`Selected sessions` should remain an explicit list.

Multiple targets are allowed.

Removing one assignment chip removes only that assignment.

Assignment should be reachable from the survey builder and reusable elsewhere later, but this implementation should stay focused on the Advanced Event builder.

---

## Experience Section

Survey-level only.

### Questions

Choose how attendees receive prompts:

- Read on screen
- Read aloud
- Attendee chooses

### Open responses

Choose how attendees answer:

- Speak
- Type
- Attendee chooses

Explain the consequence of each choice directly below the control.

Pulse voice appears only when read-aloud behavior applies.

Structured questions stay structured regardless of voice configuration.

---

## Availability Section

Support three models.

### Always open

No additional window configuration.

### Fixed window

- Start date/time
- End date/time
- Event timezone displayed clearly

### Relative to session

Only available when compatible session assignment exists.

Support common presets plus editable offsets.

Always display the calculated real-world open/close window using the assigned session's actual agenda time and event timezone.

---

## AI Generation

AI survey generation should open as a panel over the builder, not as a separate product or wizard.

Inputs should stay simple:

- Goal
- Number/length of questions
- Tone

Use existing Pulse context automatically where available.

Show context as removable chips so the organizer can see exactly what is being used.

Generated results appear as temporary ordinary question cards.

Controls:

- Keep questions
- Regenerate
- Discard
- Remove individual suggestions

Existing questions are never modified.

Once kept, AI-generated questions become ordinary editable questions with no special permanent “AI question” type.

AI affordances use the purple treatment from the design; normal product/commit actions remain SignalThread blue.

---

## AI Rewrite

Rewrite is question-level and separate from survey generation.

Use an anchored popover on a question card.

Never silently replace the original.

Show:

- Original
- Suggested rewrite
- Useful change summary when feasible

Rewrite may change wording only.

It must not change:

- Question type
- Scale
- Required state
- Speaker configuration
- Experience settings

---

## Review and Publish

Provide one readable summary of:

### Content
Questions, types, required/optional state.

### Experience
Presentation, open-response method, voice if applicable.

### Availability
Open window.

### Audience / Assignment
Where the survey is assigned, or `Not assigned`.

Unresolved issues should be specific and actionable.

Avoid vague `Survey incomplete` warnings when the actual missing item is known.

Publish should be the primary action in the final review state.

---

## Attendee Preview

The builder's sticky preview should reflect the survey being created.

It may show:

- Survey name
- Session context when assigned
- Question text
- Rating controls
- Speaker roster
- Open-response behavior
- Read-aloud state
- Answer-method state

Do not invent missing context.

If the survey is unassigned, omit context rather than creating fake labels.

The PDF also defines the eventual public attendee experience, but **this implementation does not need to rebuild the kiosk/public survey flow yet**. The builder should persist the model needed to support that later.

---

# Implementation Prompt

```text
Model: Sol
Strength: High

Pulse / Events App

Build the redesigned survey creation workspace from the attached Event Workspace Redesign PDF.

CRITICAL SCOPE:
This redesign is ONLY for ADVANCED Events.

Do not change the survey creation/editing UX for:
- Basic/simple events
- Blank/simple survey flows
- SMB survey creation
- legacy standalone survey creation
- any other non-Advanced flow

Routing/rendering behavior must remain:
- ADVANCED Event -> new Advanced Event Survey Builder
- non-ADVANCED Event -> existing survey flow unchanged

Shared backend models/services may be reused where appropriate, but do not force the Advanced Event UX or rules onto simpler event types.

The product model is:

CONTENT
What are we asking?
Question type describes data only:
- Open response
- 1–5 rating
- 0–10 recommendation
- Yes / No
- Single choice
- Speaker feedback

Voice is NOT a question type.

EXPERIENCE
How is it delivered?
Survey-level settings:
- Presentation: Read on screen / Read aloud / Attendee chooses
- Open-response answer method: Speak / Type / Attendee chooses
- Pulse voice when read-aloud is relevant

AVAILABILITY
When is it open?
- Always open
- Fixed window in event timezone
- Relative to assigned session time

Assignment is optional.
A survey may exist and autosave with no target.

Do not:
- create a fake Overall Event target
- create placeholder sessions
- block saving because assignment is missing
- make assignment a prerequisite for basic survey creation

Use one continuous builder canvas with a sticky attendee preview.
Do not create a stepper wizard.

Before editing:
Audit the existing Advanced Event survey implementation, including:
- Survey / Question schema
- SurveyTarget / assignment structure
- event survey creation services
- existing survey editor components
- question types
- voice configuration
- AI question generation
- session/speaker/area data sources
- availability/status fields
- publish state
- existing autosave/save behavior

Identify existing components/services/models to reuse.
Do not create parallel survey, question, assignment, AI, or response systems.

If a required PDF behavior cannot be cleanly represented by the existing schema, identify the smallest safe schema change and implement it according to ENGINEERING_STANDARDS.md.

Do the work in 5 controlled loops.
Finish and verify each loop before moving to the next.

==================================================
LOOP 1 — ADVANCED BUILDER FOUNDATION
==================================================

Implement the Advanced Event builder shell and product boundary.

Required:
- New builder renders only for ADVANCED Events.
- Non-Advanced flows remain unchanged.
- Single creation canvas, not a wizard.
- Sticky live attendee preview on desktop.
- Survey name/draft state.
- Optional assignment state near the top.
- `Not assigned` is a neutral valid state.
- Survey can be saved/autosaved without an assignment.
- Do not create a fake target.
- Preview omits contextual session/speaker lines when no assignment exists.

Add autosave using existing save infrastructure where possible.
Debounce writes appropriately.
Show a quiet Saved/Saving state rather than noisy notifications.

Verification before Loop 2:
- ADVANCED event gets new builder.
- Non-Advanced event still gets existing builder.
- Unassigned Advanced survey saves.
- No SurveyTarget/placeholder target is created merely to make the UI happy.
- Existing survey routes remain functional.
- Run relevant targeted tests + typecheck.

==================================================
LOOP 2 — QUESTION MODEL, CHOOSER, AND CARDS
==================================================

Implement the Content layer.

Question types describe DATA ONLY.

Base types:
- Open response
- 1–5 rating
- 0–10 recommendation
- Yes / No
- Single choice

Context-aware:
- Speaker feedback

Remove/retire `Voice response` as a question type from the new Advanced builder.
Do not globally delete legacy behavior if another flow still depends on it.

Build the visual type chooser from the PDF:
- richer palette rather than plain dropdown
- each type visually previews the attendee control
- context-specific types appear only when compatible context exists
- keyboard support: search focus, arrows, Enter, then focus new question text

Build compact question cards:
- collapsed by default
- drag handle
- number
- type
- text
- required/optional state
- context badges
- only one expanded card at a time

Actions:
- reorder
- keyboard reorder
- duplicate
- delete from overflow
- undo delete

For Speaker feedback:
- resolve the live session speaker roster from Pulse
- show plain-language context such as `Uses session speakers`
- do not copy/retype canonical speaker names into survey configuration if the relationship already exists

Do not put survey-level voice/delivery controls on individual question cards.

Verification before Loop 3:
- All base question types can be created without assignment.
- Speaker feedback appears only with compatible context.
- Structured question controls remain structured.
- Question CRUD/reorder works.
- Existing non-Advanced question editors are unchanged.
- Run targeted tests + typecheck.

==================================================
LOOP 3 — ASSIGNMENT, EXPERIENCE, AVAILABILITY
==================================================

Implement the remaining core survey configuration.

ASSIGNMENT

Use one reusable assignment panel for:
- Event-wide
- Sessions
- Speakers
- Event Areas
- Custom

Do not build separate flows for each target type.

Where relevant support:
- All
- Selected

`All sessions` should follow the agenda.
`Selected sessions` should remain an explicit selection.

Multiple targets are valid.
Show assignment chips in the survey header.
Removing one chip removes only that assignment.

Assignment should unlock context-dependent capabilities rather than rebuilding the survey.

EXPERIENCE

Survey-level settings only.

Presentation:
- Read on screen
- Read aloud
- Attendee chooses

Open-response answer method:
- Speak
- Type
- Attendee chooses

Pulse voice appears only when read-aloud is relevant.

Structured questions stay structured.
Example:
A 1–5 rating may be read aloud but is still answered with 1–5 controls.

Question cards may echo current experience in read-only text but may not independently configure it.

AVAILABILITY

Support:
1. Always open
2. Fixed date/time window
3. Relative to session

Fixed windows:
- use event timezone
- display timezone clearly

Relative-to-session:
- only available with compatible session assignment
- support useful presets and editable offsets
- calculate from canonical agenda/session time
- show the actual resulting open/close timestamps in the event timezone

Verification before Loop 4:
- assignment works across supported target types
- multiple assignments do not overwrite each other
- All vs Selected behaves correctly
- Experience settings are survey-level only
- Structured responses are unaffected by voice settings
- Session-relative availability calculates correctly
- Fixed window respects event timezone
- Non-Advanced flows remain unchanged
- Run targeted tests + typecheck.

==================================================
LOOP 4 — AI GENERATION, REWRITE, REVIEW/PUBLISH
==================================================

AI GENERATE SURVEY

Open as a panel over the existing builder.

Inputs:
- Goal
- Number/length
- Tone

Use existing Pulse context automatically when relevant.

Show removable context chips so the organizer knows what is being sent.

Generated questions:
- appear progressively if current infrastructure supports streaming
- never overwrite existing questions
- appear as temporary ordinary question cards

Controls:
- Keep
- Regenerate
- Discard
- Remove individual suggestions

On Keep:
they become normal editable questions.
Do not create a permanent AI-specific question type.

AI affordances use the purple treatment from the PDF.
Normal commit/product actions remain SignalThread blue.

AI REWRITE

Add a question-level Rewrite popover.

Never silently replace wording.

Show original + proposed wording until accepted.

Rewrite changes WORDING ONLY.
It must not change:
- type
- required state
- scale
- speaker configuration
- survey experience

REVIEW / PUBLISH

Create one readable summary:
- Content
- Experience
- Availability
- Assignment/audience

Show specific actionable unresolved items.

Do not use vague incomplete warnings when the actual issue is known.

Publish is the primary final action.

Do not rebuild the public kiosk in this loop.
Persist the configuration required for the later attendee-flow implementation.

Verification before Loop 5:
- AI generation preserves existing questions
- generated questions normalize into ordinary questions when kept
- rewrite changes wording only
- review accurately reflects persisted survey state
- publishing follows existing server-side rules
- non-Advanced flows remain unchanged
- run targeted tests + typecheck.

==================================================
LOOP 5 — DESIGN, REGRESSION, AND CONVERGENCE
==================================================

Now review the entire Advanced Event builder against the PDF.

Do not add new product concepts in this loop.

Focus on:
- visual hierarchy
- single-canvas feel
- sticky attendee preview
- compact collapsed cards
- section spacing/density
- type chooser quality
- assignment chips
- Experience clarity
- Availability clarity
- AI purple treatment
- SignalThread blue product actions
- responsive behavior

Desktop:
keep the builder + sticky preview where space allows.

Do not prematurely collapse into awkward oversized mobile/tablet layouts.

Regression checks:
- ADVANCED Event uses new builder.
- Non-Advanced survey creation remains unchanged.
- Legacy/backwards-compatible survey behavior remains intact.
- Existing kiosk/eventId flows remain intact.
- Existing response/answer/transcription pipeline remains intact.
- No duplicated survey system was introduced.
- No duplicated assignment logic was introduced.
- No per-question copy of survey-level experience was introduced.
- No fake assignments are created.
- Autosave does not create duplicate records.

Run:
- targeted Advanced Event survey tests
- relevant integration tests
- npm run typecheck
- npx prisma validate if Prisma/schema code was touched
- npx prisma generate if Prisma was touched
- broader test suite appropriate for this repo

Fix regressions before declaring completion.

==================================================
ENGINEERING RULES
==================================================

Follow ENGINEERING_STANDARDS.md.

Especially:
- one canonical source of truth
- server-side validation for important rules
- thin route handlers
- reuse existing models/services
- no second survey system
- no second kiosk/response pipeline
- no duplicated assignment business rules
- no dual-write workaround
- preserve account/event authorization
- use canonical event/session/speaker/area data
- keep scope restricted to the Advanced Event builder
- avoid unrelated refactors

==================================================
RETURN
==================================================

Return:
1. Architecture changes.
2. Schema changes, if any.
3. Exact files changed.
4. Components/services added or changed.
5. Question type model.
6. Assignment behavior.
7. Experience model.
8. Availability model.
9. Autosave behavior.
10. AI generation/rewrite behavior.
11. Review/publish behavior.
12. Tests added/updated.
13. Verification results.
14. Any PDF behavior intentionally deferred and why.
```

## Explicitly Deferred

The PDF includes the eventual attendee/mobile survey experience.

That should be implemented in a separate follow-up task after the Advanced Event builder and persisted configuration are proven stable.

The later attendee-flow task should consume the model created here rather than forcing the builder and kiosk to be rebuilt simultaneously.
