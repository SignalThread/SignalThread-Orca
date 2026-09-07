# SignalThread Event Survey Phase 1 — Stage 2 Prompt Pack

## Purpose

This prompt pack executes **Stage 2: Mixed-Response Kiosk and Collection Flow** from the SignalThread Event Survey Phase 1 brief.

Stage 2 is one loop stage containing four sequential prompts:

1. Audit the current kiosk and response flow
2. Implement the canonical structured-answer submission path
3. Implement the mixed-question kiosk experience
4. Complete Stage 2 integration, mobile, and regression hardening

Use this file with the existing generic loop controller and the Phase 1 product brief.

---

## Required Inputs

```txt
Loop controller:
docs/Loop/GENERIC_PROMPT_LOOP_CONTROLLER.md

Plan document:
docs/Loop/Event Fold Redesign Voice Survey Brief.md

Prompt document:
docs/Loop/Event Fold Redesign Survey Stage 2 Prompts.md

Expected branch:
feat/voice-events-phase1-stage2-mixed-kiosk

Schema mode:
OPEN

Allowed scope:
Stage 2 only: mixed-response kiosk collection for VOICE, RATING_1_TO_5, and RECOMMENDATION_0_TO_10; canonical structured-answer submission; mixed required/optional completion behavior; question ordering; mobile and accessibility behavior; retries and validation; compatibility with existing voice-only Event and SMB kiosk journeys; and targeted backend/shared-component changes required to support this safely.

Out of scope:
Command Center metrics, live alerts, action tracking, templates, scheduling, deployment kits, post-event briefs, attendee identity, advanced survey logic, unrelated event workspace redesign, unrelated SMB redesign, and all Stage 3 work.

Canonical models/services:
Event
EventStructureItem
SurveyTarget
Survey
Question
Response
Answer
AnswerTranscript
AnswerAnalysis
PublicSurveyLink
lib/mixed-survey-contract.ts
lib/answer-question-context.ts
lib/event-voice-surveys.ts
lib/event-survey-builder-payload.ts
existing response creation service
existing answer presign/complete/confirm routes
existing token and eventId kiosk resolution
existing voice upload/transcription/analysis pipeline

Maximum files per prompt:
14 unless the active prompt proves more are required and the loop controller requires human review.
```

---

## Global Product Rules

- The existing Command Center remains the product center, but Stage 2 does not implement metrics or alerts.
- Stage 2 collects the structured and voice data Stage 3 will use.
- Voice remains the differentiator; structured answers strengthen detection and comparison.
- Do not create a second kiosk, response, answer, upload, transcription, or analysis system.
- One `Response` may contain all three supported question types.
- Existing voice-only surveys, public tokens, legacy eventId links, uploads, transcription, analysis, and thank-you behavior must remain functional.
- Existing SMB kiosk behavior must remain unchanged unless additive shared behavior is required and fully regression-tested.
- Schema mode is `OPEN`; schema changes must be genuinely required and production-safe.
- Keep route handlers thin and place validation, idempotency, and completion rules in canonical services/helpers.
- Do not store authoritative answer state only in client state.
- Do not begin Stage 3.

---

# Prompt 1 — Audit the Current Kiosk and Mixed-Response Contract

**Recommended model: Sol Medium**

## Task

Audit the current kiosk, response, answer, upload, completion, token-resolution, required-question, retry, and SMB compatibility paths.

This prompt is **audit-only**. Do not edit files.

## Required Investigation

### 1. Kiosk launch and question loading

Inspect:

- token-based kiosk launch
- legacy `/kiosk?eventId=...` behavior
- survey-specific and legacy event-level question loading
- question ordering
- question type and required-state payloads
- public-link activation and validity checks

Confirm whether the kiosk client already receives everything required to render mixed question types.

### 2. Response and answer lifecycle

Document:

- when `Response` and `Answer` rows are created
- current answer statuses
- whether answers are pre-created or created per question
- what voice answers require
- how `numericValue` should be written
- what completion means for structured answers
- whether a new route is required
- retry/idempotency behavior
- how duplicate writes are prevented

### 3. Voice-only assumptions

Find every material place assuming:

- every question records audio
- every answer requires `objectKey`
- every answer uses presign/complete/confirm
- every answer enters transcription/analysis
- every question uses microphone UI
- response completion only recognizes audio-completed answers

### 4. Required and optional behavior

Determine:

- where `required` is enforced
- whether enforcement is server-authoritative
- how optional skips should be represented
- whether skipped questions need an `Answer` row
- how mixed response completion should validate required questions
- how abandoned responses behave

### 5. Canonical structured-answer contract

Recommend the smallest safe canonical write path for:

```txt
RATING_1_TO_5
RECOMMENDATION_0_TO_10
```

Cover:

- route/service shape
- request and response bodies
- question ownership/type/range validation
- response/survey/event/public-link scope
- required/optional behavior
- idempotency
- correction before finalization
- status fields
- audio-processing bypass
- mixed completion rules

### 6. Kiosk UI architecture

Identify the current component boundaries and recommend the safest rendering structure for:

- Voice response
- 1–5 rating
- 0–10 recommendation

Do not recommend a second kiosk route.

### 7. Events versus SMB boundary

Identify shared components/APIs and the safest way to preserve SMB voice-only behavior.

## Required Output

Return:

1. Current kiosk architecture.
2. Exact files/functions involved.
3. Current response/answer lifecycle.
4. Every material voice-only assumption.
5. Canonical structured-answer submission contract.
6. Idempotency and correction behavior.
7. Required/optional completion rules.
8. Mixed-question renderer structure.
9. Events/SMB boundary.
10. Token and eventId compatibility plan.
11. Retry, refresh, and error-state plan.
12. Accessibility/mobile requirements.
13. Tests required for Prompts 2–4.
14. Exact implementation sequence for Prompt 2.
15. Risks and unresolved decisions.

## Hard Stops

Stop for human review if:

- structured answers cannot safely use `Answer`
- mixed completion needs an uncovered product decision
- token and eventId modes have incompatible ownership
- SMB cannot be preserved through additive/wrapped behavior
- a destructive schema change appears necessary

## Acceptance Checks

- No files changed.
- One canonical write path is recommended.
- Mixed completion rules are explicit.
- Voice-only compatibility is explicit.
- Prompt 2 can proceed without inventing architecture.

Use the loop controller’s stop format and continue only if no hard stop is triggered.

---

# Prompt 2 — Canonical Structured-Answer Submission and Completion Rules

**Recommended model: Sol Medium**

## Task

Implement the canonical structured-answer submission path approved by Prompt 1.

This prompt covers backend services/helpers, route/API behavior, idempotency, answer status, response completion, compatibility, and focused tests.

Do not implement mixed-question kiosk UI yet.

## Required Changes

### 1. Canonical structured-answer service

Add or extend one canonical service that:

- resolves the authoritative Question
- validates Response ownership and survey/event/public-link scope
- validates question type and numeric range
- persists the value
- marks the structured answer complete using approved semantics
- bypasses audio, transcription, and analysis
- supports correction before finalization
- is idempotent for retries
- returns a stable result

Do not duplicate validation across routes.

### 2. Thin API route

The route must:

- validate kiosk/public context
- validate request shape
- call the canonical service
- return explicit errors

Differentiate at least:

- response not found
- question not found
- wrong scope
- unsupported type
- invalid numeric value
- response already finalized
- inactive/invalid public link when applicable

### 3. Numeric validation

Enforce server-side:

```txt
RATING_1_TO_5: integers 1–5 inclusive
RECOMMENDATION_0_TO_10: integers 0–10 inclusive
```

Reject out-of-range values, decimals when integer-only, invalid strings, structured values for VOICE, and audio submission through the structured route.

### 4. Idempotency and correction

Implement approved behavior for:

- same-value retries
- network retries
- changing selection before finalization
- duplicate requests
- mutation attempts after finalization

Do not create duplicate authoritative answers for one response/question pair.

### 5. Required and optional completion

Update the canonical completion path so:

- each required question is satisfied by its type-specific completed state
- optional unanswered questions do not block completion
- VOICE requires the approved completed voice state
- structured questions require valid persisted numeric answers
- mixed surveys complete deterministically
- voice-only completion remains compatible

### 6. Processing guards

Ensure:

- structured answers never require presign or object storage
- structured answers never enter transcription or voice analysis
- voice answers still follow the existing pipeline
- structured answers do not fail for missing audio

### 7. Compatibility

Preserve token links, eventId links, voice-only Events, SMB collection, public-link behavior, and existing reads.

## Tests

Add focused coverage for:

- valid boundary submissions
- out-of-range and decimal rejection
- wrong question type and scope
- duplicate retry
- correction before finalization
- mutation rejection after finalization
- required mixed completion
- optional unanswered completion
- processing bypass
- voice path unchanged
- token/eventId compatibility
- SMB regression

## Acceptance Checks

- Structured numeric answers persist canonically.
- Validation is server-side.
- One response/question has one authoritative answer.
- Retries are safe.
- Completion is server-authoritative.
- Structured answers bypass voice processing.
- Voice, token, eventId, and SMB behavior remain intact.
- Focused tests and typecheck pass.

Complete and correct Prompt 2 before starting Prompt 3.

---

# Prompt 3 — Mixed-Question Kiosk Experience

**Recommended model: Sol Medium**

## Task

Implement one mixed-question kiosk flow for:

```txt
VOICE
RATING_1_TO_5
RECOMMENDATION_0_TO_10
```

Use the canonical submission and completion paths from Prompt 2.

Do not implement Command Center work.

## Required Changes

### 1. Type-aware rendering

Use one canonical renderer/component boundary.

#### VOICE

Preserve current spoken playback, microphone, recording, upload, retry, processing, and mobile audio behavior.

#### RATING_1_TO_5

Render five large touch-friendly choices with clear selected state, accessible labels, and correction before continuing.

#### RECOMMENDATION_0_TO_10

Render eleven touch-friendly choices with clear selected state, accessible labels, usable narrow-screen behavior, endpoint labels where appropriate, and correction before continuing.

### 2. Spoken prompt versus answer type

Keep spoken prompt playback separate from answer collection. Structured questions must never display or require microphone controls.

### 3. Navigation and progress

Preserve ordered questions, progress, current navigation behavior, correction before final completion, and clear required/optional behavior.

### 4. Required and optional questions

- Required questions block progress/completion with clear guidance.
- Optional questions provide a clear Skip action where appropriate.
- Skips do not create false errors.

### 5. Submission behavior

Structured selections must:

- use the canonical API
- show saving state
- support safe retry
- avoid duplicates
- allow correction according to lifecycle
- wait for server confirmation before showing success

### 6. Error states

Handle network failure, validation errors, inactive/expired links, missing questions, finalized responses, structured retries, voice upload retries, and completion failure using attendee-friendly copy.

### 7. Responsive/accessibility

Verify:

```txt
375×812 mobile
768×1024 tablet
1440×1024 desktop
```

Require no horizontal overflow, large touch targets, visible focus, screen-reader labels, non-color-only selection states, usable 0–10 controls, and understandable progress.

### 8. SMB boundary

Preserve SMB voice-only behavior and styling. Do not leak Events terminology.

## Tests

Cover:

- rendering and selection for both structured types
- changing selection
- required validation
- optional skip
- mixed ordering
- submission success/retry/error
- voice question unchanged
- mixed completion
- token and eventId launch
- mobile accessibility
- SMB regression

## Acceptance Checks

- One kiosk flow renders all three types.
- Structured controls are touch-friendly/accessibile.
- Numeric answers save canonically.
- Mixed ordering and required/optional behavior work.
- Voice recording remains intact.
- Voice-only Event and SMB journeys remain green.
- Mobile/tablet/desktop verification passes.
- Focused tests and typecheck pass.

Complete and correct Prompt 3 before starting Prompt 4.

---

# Prompt 4 — Stage 2 Integration, Mobile, and Regression Hardening

**Recommended model: Sol Medium**

## Task

Perform final Stage 2 integration, architecture review, mobile verification, and regression hardening.

Do not begin Stage 3.

## Required End-to-End Journeys

### Journey 1 — Existing voice-only Event survey

Launch by public token, hear playback, record, upload, process, complete, and reach thank-you with no regression.

### Journey 2 — Legacy eventId kiosk

Launch through `/kiosk?eventId=...`, complete the voice flow, confirm no survey-owned question leakage, and preserve completion.

### Journey 3 — Mixed Event survey

Complete in order:

```txt
RATING_1_TO_5
VOICE
RECOMMENDATION_0_TO_10
VOICE
```

Verify ordering, numeric persistence, voice processing, progress, required validation, optional skip, correction before finalization, completion, and thank-you.

### Journey 4 — Retry and failure

Verify idempotent structured retries, allowed corrections, no duplicates, voice upload retry, missing-required completion errors, inactive/expired links, finalized-response protection, and approved refresh behavior.

### Journey 5 — SMB regression

Verify SMB remains voice-only with correct playback, upload, transcription, analysis, styling, and browser journeys.

## Architecture Review

Confirm:

- one kiosk flow
- one structured-answer service
- one authoritative completion rule
- no duplicate answer models
- no UI-only completion authority
- thin routes
- correct event/account/survey/public-link scoping
- no Stage 3 code
- no unrelated workspace changes

Correct implementation drift.

## Data and Processing Verification

Confirm persisted structured answers contain approved numeric values without fabricated audio/transcript/analysis; voice answers retain normal processing; mixed Responses have correctly scoped Answers; optional skips and required completion are deterministic.

## Browser Verification

Verify real browser journeys at 375×812, 768×1024, and 1440×1024. Review touch targets, 0–10 usability, focus, labels, prompt playback, microphone behavior, progress, retries, errors, overflow, clipping, and thank-you state.

## Required Checks

Run targeted tests for services, routes, completion, range/type validation, idempotency, token kiosk, eventId kiosk, mixed UI, voice-only Events, SMB, typecheck, relevant build, and Playwright/browser suites.

## Stage 2 Definition of Done

Stage 2 is complete only when:

- all three question types complete in one kiosk response
- structured answers persist canonically
- voice answers preserve the existing pipeline
- mixed completion is server-authoritative
- retries do not create duplicates
- corrections follow lifecycle rules
- token/eventId/SMB behavior remains functional
- mobile/tablet/desktop verification passes
- focused tests, typecheck, and relevant build pass
- Stage 3 has not started

## Final Output

Use the loop controller’s final stop format and include:

```txt
Stage 2 readiness for Stage 3: yes/no
Structured submission route/service:
Mixed completion rule:
Idempotency behavior:
Correction behavior:
Voice compatibility:
Token compatibility:
Legacy eventId compatibility:
SMB regression status:
Mobile verification:
Command Center work intentionally deferred:
```

Stop after the Stage 2 report. Do not begin Stage 3.
