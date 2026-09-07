# Advanced Event Defect Fix Prompts

Use these prompts one at a time, in order.

The prompts are grouped by **shared root cause or tightly coupled code path**, not mechanically one prompt per audit number.

D2 is intentionally omitted because the assignment-lifecycle blocker is already being fixed separately.

Rules for the entire pack:
- finish, test, and commit each prompt before starting the next prompt that touches the same area
- preserve response isolation
- preserve Survey → SurveyTarget → PublicSurveyLink architecture
- preserve existing QR/link generation
- preserve the kiosk response pipeline
- preserve existing signage templates and rendering behavior
- schema mode is `ADDITIVE_ALLOWED`; do not add schema/migration work unless genuinely required by the active defect
- fix the canonical control point rather than patching only the visible symptom
- add targeted regression coverage for the defect being fixed
- use `.env.local` explicitly for local/dev database commands when live DB verification is required
- do not modify `.env` or `.env.local` as part of these product fixes
- if live-service verification is blocked by the local environment, report it as BLOCKED rather than fabricating success

---

# Prompt 1 — Published Survey State
## Fixes D1 + D10

Model: Terra  
Strength: Medium

```text
Pulse Events — Make the Advanced survey builder respect published state

Fix D1 and D10 from the Advanced Event validation.

These defects share the same root cause: the builder knows the persisted survey is Active, but still exposes draft-only actions.

Observed:
- Published survey header correctly shows Active.
- Lower section still says “Review and publish”.
- “Ready to publish” still appears.
- “Publish survey” remains enabled and receives the correct backend 409.
- “Generate with AI” is still offered and later receives the correct draft-only rejection.

Goal:
The builder UI must derive draft-only actions from the authoritative persisted survey status.

Required:
- Inspect `app/app/events/[eventId]/surveys/new/page.tsx` and the existing survey snapshot/state source.
- When persisted status is not DRAFT:
  - do not offer Publish
  - do not show “Ready to publish”
  - replace draft-only review/publish wording with an appropriate published-state presentation
  - hide or disable Generate with AI
- Keep backend publish and AI guards unchanged.
- Preserve normal draft publishing and AI generation.
- Surface action errors near the action that caused them rather than in an unrelated corner of the page.
- Do not change lifecycle rules.

Regression coverage:
- DRAFT survey still shows Publish and AI generation.
- ACTIVE/published survey shows neither draft-only action.
- Published survey does not show “Ready to publish”.
- Existing editable fields still follow current published-survey rules.
- Relevant builder tests pass.
- `npm run typecheck` passes.

Return:
- root cause
- files changed
- tests added/updated
- verification results
```

---

# Prompt 2 — Builder Loading and Hydration
## Fixes D5 + D6

Model: Terra  
Strength: High

```text
Pulse Events — Fix Advanced survey builder loading and hydration races

Fix D5 and D6 from the Advanced Event validation.

These are the same initialization problem:
- an existing survey temporarily renders as a fake blank draft
- a late hydration snapshot can overwrite text the organizer already typed

Observed:
- Deep-linked existing surveys can show “Untitled survey · Draft · Not assigned · 0 questions” for several seconds.
- That blank state is fully interactive.
- Typing survey name/intro during initial load can be overwritten when the real snapshot arrives.
- A parameterless advanced-survey-builder GET also returns 400 during load.

Goal:
Initial survey loading must have one deterministic state transition and must never overwrite user input.

Required:
1. Audit the initial-load effect, existing-survey query flow, `applySurveySnapshot`, dirty/autosave state, and the parameterless GET.
2. For an existing survey ID:
   - show a real loading/skeleton state until authoritative data resolves
   - do not instantiate/render an editable blank draft first
3. Prevent initial hydration from overwriting dirty user-entered values.
   - Prefer a clean initialization boundary.
   - If dirty-field tracking is already the correct architecture, reuse it.
   - Do not solve this with arbitrary delays/timeouts.
4. Confirm and remove the unnecessary parameterless builder request if current code is generating it.
5. Preserve:
   - true new-survey initialization
   - autosave after initialization
   - assignments/questions/status hydration

Regression coverage:
- Existing survey displays loading state before data resolves.
- Fake editable blank draft never appears for an existing survey.
- Delayed load cannot overwrite typed name/intro.
- Loaded questions/status/assignments are correct.
- New-survey route still initializes normally.
- Autosave still works after initialization.
- No parameterless 400 request if that path is confirmed unnecessary.
- Relevant builder tests pass.
- `npm run typecheck` passes.

Return:
- confirmed race/root cause
- initialization strategy chosen
- files changed
- tests
- verification results
```

---

# Prompt 3 — Question Validation
## Fixes D9

Model: Terra  
Strength: Medium

```text
Pulse Events — Make Advanced question validation field-specific and visible

Fix D9 from the Advanced Event validation.

Observed:
- Review may only say “Complete question 2”.
- It does not identify whether question text, choices, or another required field is missing.
- Collapsed incomplete questions show no visible error state.

Goal:
The organizer should know exactly what is missing without hunting.

Required:
- Inspect the builder validation generation and collapsed question row rendering.
- Generate field-specific review issues, for example:
  - “Question 2 needs question text”
  - “Question 2 needs at least one choice”
- Show a visible error indicator/state on the collapsed offending question.
- Where practical, clicking the review issue should expand/focus the offending question.
- Preserve the current server/client publish guard.
- Do not loosen validation requirements.

Regression coverage:
- missing text
- missing choice/options
- collapsed row visibly flagged
- fixing the field clears the error
- valid survey still publishes
- `npm run typecheck`

Return files changed, tests, and results.
```

---

# Prompt 4 — Speaker Rating Attribution
## Fixes D3

Model: Sol  
Strength: High

```text
Pulse Events — Fix speaker analytics attribution for session-survey speaker ratings

Fix D3 from the Advanced Event validation.

Observed:
- `SPEAKER_FEEDBACK` answers inside a SESSION-targeted survey persist `Answer.speakerId`.
- Speaker analytics currently aggregates mainly through SPEAKER-category targets.
- The UI reports “0 with speaker-specific feedback” and “NO SPEAKER QUESTION” despite persisted speaker ratings.

Goal:
Speaker intelligence must use the authoritative per-answer speaker attribution already stored in `Answer.speakerId`.

Required:
- Inspect:
  - `lib/event-speaker-intelligence.ts`
  - `lib/mixed-survey-contract.ts`
  - relevant Answer relations
  - speaker-intelligence UI/tests
- Extend aggregation so answers carrying `speakerId` contribute to the correct speaker even when the survey target is SESSION.
- Preserve existing SPEAKER-target behavior.
- Prevent double counting when data can be reached through more than one path.
- Correct misleading “NO SPEAKER QUESTION” state when a speaker question actually existed/was answered.
- Keep response capture unchanged unless persisted data proves capture itself is wrong.
- Maintain event/survey/session scoping.

Regression coverage:
- one session with two speakers
- one speaker-feedback question
- separate ratings for each speaker
- each speaker receives only their own rating
- no cross-speaker leakage
- no double counting
- existing speaker-target behavior still works
- `npm run typecheck`

Return:
- root cause
- aggregation change
- files changed
- tests
- results
```

---

# Prompt 5 — Structured Answer Reporting
## Fixes D4

Model: Sol  
Strength: High

```text
Pulse Events — Add organizer reporting for structured survey answers

Fix D4 from the Advanced Event validation.

Observed:
The platform persists:
- 1–5 ratings
- 0–10 recommendation ratings
- Yes/No answers
- speaker-star ratings

But organizer-facing response/review surfaces expose almost exclusively free-text/transcript evidence.

Goal:
If the platform collects a structured answer, the organizer must be able to see and interpret it.

Before editing:
- Audit the current raw-response route/component and aggregate analytics paths.
- Confirm which existing Answer fields are authoritative for each structured type.
- Reuse existing Answer data. Do not create a parallel analytics datastore.

Required:
1. Raw Responses:
   - show structured values with the correct question/prompt context
   - preserve text/voice responses
2. Aggregates:
   - rating/numeric: count and useful average/distribution where appropriate
   - Yes/No: counts/split
   - speaker ratings: continue into the speaker path fixed by D3
3. Maintain event/survey/target scoping and response isolation.
4. Do not mix event-wide aggregate counts into individual survey counts.
5. Avoid inventing unsupported “NPS” semantics unless the existing question type/business rules explicitly define them.

Regression coverage:
- 1–5
- 0–10
- Yes/No
- speaker rating
- free text
- multiple surveys under one event proving no leakage
- raw response values correct
- aggregate values correct
- `npm run typecheck`

Return:
- current reporting gap
- files changed
- API/response-shape changes if any
- tests
- results
```

---

# Prompt 6 — Sessions Intelligence Correctness
## Fixes D8 + D20

Model: Sol  
Strength: Medium

```text
Pulse Events — Fix Sessions intelligence semantics and row layout

Fix D8 and D20 from the Advanced Event validation.

These defects live in the same Sessions intelligence path.

Observed:
- Summary can say “0 session surveys have responses” / “Represented 0”.
- A session row directly below can show “1 RESPONSE”.
- In the same panel, response/evidence text can overlap the “Set up survey” button and clip at desktop width.

Goal:
The Sessions panel must be factually consistent and visually readable.

Required:
1. Semantics:
   - inspect `lib/event-listening-plan.ts`, `resolveState`, response counts, and evidence/representation thresholds
   - separate factual response counts from thresholded evidence sufficiency
   - summary language must reflect actual response data
   - if a threshold metric remains, label it as evidence sufficiency/representation rather than saying there are no responses
2. Layout:
   - inspect `components/events/EventSessionsIntelligence.tsx`
   - prevent action buttons and response/evidence text from overlapping
   - preserve responsive behavior and existing actions

Regression coverage:
- 0 responses
- 1 response below any evidence threshold
- response count above threshold
- summary and row remain semantically consistent
- desktop layout at audited width
- narrower responsive width
- `npm run typecheck`

Return root cause(s), files changed, tests, results.
```

---

# Prompt 7 — Kiosk Survey Context
## Fixes D12 + D13

Model: Terra  
Strength: Medium

```text
Pulse Events — Show survey intro and target context in the attendee flow

Fix D12 and D13 from the Advanced Event validation.

These share the same respondent-context problem.

Observed:
- Session surveys show useful session/speaker context.
- Area-targeted surveys show no Event Area context.
- The builder field labelled as an intro shown to attendees persists, but the kiosk never displays it.

Goal:
The attendee should know what they are responding to and see the survey-specific intro configured by the organizer.

Required:
1. Trace authoritative survey intro/description and target context through the existing kiosk event-details/context path.
2. Area surveys:
   - display the correct Event Area name/context
   - use a presentation consistent with existing session context where practical
3. Survey intro:
   - display the configured survey-specific intro once at an appropriate point before or at the start of the survey
   - keep account consent copy intact
   - do not repeat intro on every question unless current product behavior explicitly calls for that
4. Do not change:
   - public-link resolution
   - target assignment
   - response scoping
   - question isolation

Regression coverage:
- session survey still shows correct session context
- area survey shows correct area context
- intro present
- intro absent
- multiple surveys under same event receive only their own intro/context
- kiosk tests
- `npm run typecheck`

Return files changed and verification.
```

---

# Prompt 8 — AI Summary Honesty
## Fixes D19

Model: Terra  
Strength: Low

```text
Pulse Events — Stop presenting AI summaries as attendee quotations

Fix D19 from the Advanced Event validation.

Observed:
The thank-you experience can put an AI-generated paraphrase in quotation marks under “Your Feedback Summary”, making generated language appear to be the attendee’s exact words.

Goal:
Generated text must never masquerade as a verbatim attendee quote.

Required:
- Inspect the completion/thank-you summary rendering.
- If the content is AI-generated:
  - remove quotation marks
  - label it clearly as a generated summary
- If the UI explicitly presents a quotation, show only actual verbatim submitted text.
- Preserve the underlying response/analysis data and completion flow.
- Do not change analysis generation itself.

Regression coverage:
- AI summary rendered as summary, not quote
- verbatim attendee text only quoted when truly verbatim
- `npm run typecheck`

Return files changed and results.
```

---

# Prompt 9 — QR Pack Dropdown
## Fixes D7

Model: Terra  
Strength: Low

```text
Pulse Events — Fix Get QR pack dropdown dismissal

Fix D7 from the Advanced Event validation.

Observed:
The Get QR pack dropdown only closes from the chevron. Escape and outside click do not dismiss it, and the open menu blocks filters underneath.

Goal:
Make the existing split-button dropdown behave like a normal accessible menu.

Required:
- close on Escape
- close on outside click
- preserve split-button primary action
- preserve current menu options and selection-aware enable/disable behavior
- restore focus appropriately after keyboard dismissal
- do not change QR pack generation/export logic

Regression coverage:
- chevron open/close
- Escape dismissal
- outside-click dismissal
- selection state/menu options unchanged
- `npm run typecheck`

Return files changed and results.
```

---

# Prompt 10 — Deploy Roster and Assets Presentation
## Fixes D14 + D15

Model: Terra  
Strength: Medium

```text
Pulse Events — Fix Deploy roster readability and Assets action presentation

Fix D14 and D15 from the Advanced Event validation.

These are both presentation defects in the current Deploy workspace.

Observed:
- Survey names can truncate to only a few characters while other columns have spare room.
- Assets popover repeats several actions twice.
- Copy link succeeds but gives no visible confirmation.

Goal:
Improve the existing Deploy presentation without changing underlying behavior.

Required:
1. Survey-name column:
   - use available row width intelligently
   - keep meaningful survey names readable
   - preserve responsive layout and other columns/actions
2. Assets:
   - keep the existing layover/popover interaction, not a drawer
   - show one clear instance of each existing required action
   - remove redundant duplicate action presentations
   - preserve existing handlers for:
     - Copy link
     - Open kiosk
     - View QR
     - Download QR PNG
     - Design signage
     - Print signage
     - existing required PDF/print actions
   - add immediate visible copy-success feedback
   - preserve accessible names/keyboard behavior
3. Do not change QR/link/export/print implementations.

Regression coverage:
- short/long survey names
- desktop and narrower widths
- each Assets action appears once
- existing handlers still fire
- copy feedback appears
- targeted Deploy tests
- `npm run typecheck`

Return files changed and results.
```

---

# Prompt 11 — Signage Apply and Entry Interaction
## Fixes D21

Model: Terra  
Strength: Medium

```text
Pulse Events — Improve Signage Designer apply feedback and diagnose first-click entry issue

Fix the confirmed portion of D21 and investigate the intermittent portion.

Observed:
- Apply design succeeds with weak/immediate feedback.
- After one full reload, the Signage designer entry button did nothing on the first click and worked on the second.

Required:
1. Apply design:
   - give immediate visible success feedback after successful persistence
   - preserve saved-design behavior
   - preserve existing template renderer
2. Entry button:
   - attempt to reproduce the first-click failure after reload
   - inspect loading state/event handlers if reproducible
   - fix only if a real root cause is identified
   - do not add speculative delays, duplicate click handlers, or retries

Regression coverage:
- successful Apply gives immediate confirmation
- design persists after reload
- Signage designer opens on first click in tested reload state
- existing template/print behavior unchanged
- `npm run typecheck`

Return:
- reproduction result
- root cause if found
- files changed
- tests
- results
```

---

# Prompt 12 — Signage Performance Investigation
## Fixes D22 only if reproduced

Model: Terra  
Strength: High

```text
Pulse Events — Diagnose intermittent Signage Designer renderer freeze

Investigate D22 from the Advanced Event validation.

Observed once:
- all eligible surveys
- landscape
- 4 per page
- change Applying to scope to one survey
- renderer became unresponsive for roughly 45 seconds

A second attempt did not reproduce it.

This is diagnose-first.

Required:
- Reproduce the exact state transition repeatedly.
- Inspect render/composition work for:
  - expensive synchronous recomputation
  - repeated QR regeneration
  - unnecessary nested loops
  - redundant template/layout regeneration
  - state-update loops
- Measure enough to identify a concrete hot path before editing.
- If a root cause is confirmed:
  - make the smallest focused performance fix
  - preserve template IDs, template visuals, QR output, and print/export behavior
- If it cannot be reproduced and there is no clear hot path:
  - make no speculative code change
  - report “not reproduced”

If fixed, verify:
- 1/2/4 per page
- portrait/landscape
- one/multiple/all eligible scopes
- existing templates render identically
- `npm run typecheck`

Return reproduction status, measurements/root cause, files changed if any, and results.
```

---

# Prompt 13 — Event Lifecycle Warning Copy
## Fixes D11

Model: Terra  
Strength: Low

```text
Pulse Events — Fix incorrect live-event warning on Upcoming events

Fix D11 from the Advanced Event validation.

Observed:
Adding a session to a brand-new UPCOMING event can show:
“This event is live. Saving updates the published schedule for attendees immediately.”

Goal:
Confirmation copy must match authoritative event lifecycle state.

Required:
- Inspect the confirmation logic used by EventAgendaWorkspace.
- Upcoming events must not be described as live.
- Preserve an appropriate warning for genuinely live/published schedule changes if current product rules require one.
- Do not alter session mutation behavior.

Regression coverage:
- Upcoming event copy
- live/published event copy
- `npm run typecheck`

Return files changed and results.
```

---

# Prompt 14 — Assignment UI Parity
## Fixes D16
## Depends on completed D2 fix

Model: Sol  
Strength: Medium

```text
Pulse Events — Bring Surveys-list assignment UI to canonical Advanced assignment parity

Fix D16 only after the D2 assignment-lifecycle blocker has been completed, tested, and committed.

Observed:
- Advanced builder supports Event-wide, Sessions, Speakers, Event Areas, and Custom.
- Surveys-list Assign UI exposes only a subset.

Goal:
The Surveys-list UI should expose the assignment kinds supported by the canonical Advanced survey assignment model without creating another mutation implementation.

Required:
- Inspect and reuse the canonical assignment service/path established by the D2 fix.
- Add the missing supported assignment kinds to the Surveys-list assignment UI.
- Do not create independent assignment semantics.
- Preserve all D2 response-history protections.
- Preserve PublicSurveyLink/SurveyTarget lifecycle rules.
- If a target type is not truly supported by the canonical model, do not invent it.

Regression coverage:
- event-wide
- session
- speaker
- event area
- custom, only if canonical model currently supports it
- D2 response-history guard still applies through this surface
- no duplicate targets
- no dead live links
- `npm run typecheck`

Return:
- canonical service reused
- files changed
- tests
- results
```

---

# Prompt 15 — Survey Count Pluralization
## Fixes D17

Model: Terra  
Strength: Low

```text
Pulse Events — Fix singular/plural counts in the Advanced Surveys workspace

Fix D17 from the Advanced Event validation.

Observed examples:
- 1 questions
- 1 sessions
- 1 areas
- 1 responses

Required:
- Correct singular/plural rendering in the affected Advanced Surveys workspace.
- Reuse an existing pluralization helper if one already exists.
- Keep the change focused; do not start a broad copy refactor.

Verify:
- 0
- 1
- multiple
- `npm run typecheck`

Return files changed and results.
```

---

# Prompt 16 — Speaker Missing-Details Messaging
## Fixes D18

Model: Terra  
Strength: Medium

```text
Pulse Events — Make speaker readiness messaging specific

Fix D18 from the Advanced Event validation.

Observed:
A speaker with name, title, and organization can still show “Missing details”, but the UI does not identify which requirement is incomplete.

Goal:
Tell the organizer exactly what is missing based on the actual readiness rule.

Required:
- Inspect the existing speaker readiness/completeness rule.
- Determine the exact fields/conditions that trigger incomplete state.
- Replace generic “Missing details” with specific missing items or a concise specific reason.
- Do not invent new required fields.
- Keep fully complete speakers unchanged.

Regression coverage:
- each actual missing condition represented by the rule
- fully complete speaker
- `npm run typecheck`

Return:
- actual readiness rule
- files changed
- tests
- results
```

---

# Final Validation Prompt
## Run only after D2 and Prompts 1–16 are complete

Model: Sol  
Strength: High

```text
Pulse Events — Advanced Event final end-to-end sign-off

Audit only. Do not proactively fix defects.

Rerun the complete Advanced Event organizer and respondent journey on disposable dev data.

Recheck:
- Advanced Event creation
- Overview / Operations / Surveys / Deploy navigation
- sessions
- speakers
- event areas
- survey creation
- unassigned / event / session / speaker / area assignment where supported
- question types
- voice/text presentation settings
- availability
- draft/publish lifecycle
- assignment lifecycle
- Deploy
- QR pack
- Assets
- Signage Designer
- kiosk/respondent journeys
- response isolation
- structured-answer reporting
- speaker analytics
- session analytics
- persistence after refresh/navigation

Explicitly verify D1 and D3–D22 are fixed or correctly closed, and that the separately fixed D2 blocker remains fixed.

Critical protections:
1. Response isolation remains clean.
2. No live QR is silently invalidated.
3. No duplicate SurveyTarget/Deploy rows are introduced.
4. Published surveys do not present draft-only actions.
5. Existing surveys never render as interactive fake blank drafts.
6. Hydration never loses typed user data.
7. Speaker ratings are visible and attributed correctly.
8. 1–5, 0–10, Yes/No, and speaker-star answers are visible to organizers.
9. Session summaries agree with actual response counts.
10. Area context and survey intro appear to attendees.
11. Generated summaries are not presented as verbatim quotes.
12. Deploy/Signage interactions remain intact.
13. Existing signage templates and rendered output remain unchanged unless an explicitly validated performance optimization required internal rendering work.

Run the full relevant automated suite locally using `.env.local` for DEV database access.

If the current local environment prevents a required live verification:
- mark that verification BLOCKED
- do not modify environment files
- do not claim the final E2E sign-off passed

Return:
- PASS/FAIL by major area
- commands and results
- remaining defects, if any
- final branch/commit tested
- confirmation response isolation remains clean
- confirmation existing QR/link behavior remains correct
- confirmation existing signage templates remain intact
- confirmation no unexpected schema/migration work occurred
```
