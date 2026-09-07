# SignalThread Event Survey Phase 1 — Stage 1 Prompt Pack

## Purpose

This prompt pack executes **Stage 1: Mixed-Question Foundation and Survey Builder** from the SignalThread Event Survey Phase 1 brief.

Stage 1 is one implementation stage containing four sequential prompts:

1. Audit and canonical contract
2. Canonical data foundation
3. Events survey create/edit experience
4. Stage 1 integration and hardening

Use this file with the existing generic loop controller and the Phase 1 product brief.

---

## Required Inputs

```txt
Loop controller:
docs/Loop/GENERIC_PROMPT_LOOP_CONTROLLER.md

Plan document:
docs/Loop/SIGNALTHREAD_EVENT_SURVEY_PHASE_1_BRIEF.md

Prompt document:
docs/Loop/SIGNALTHREAD_EVENT_SURVEY_PHASE_1_STAGE_1_PROMPTS.md

Expected branch:
feat/voice-events-phase1-stage1-mixed-questions

Schema mode:
OPEN

Allowed scope:
Stage 1 only: canonical mixed-question and mixed-answer foundation, production-safe schema/migration work, Events-only survey create/edit behavior, question ordering and validation, type-aware survey authoring, compatibility with existing voice-only surveys, and targeted shared-component changes required to support this stage safely.

Out of scope:
Kiosk rendering and collection for rating/recommendation questions, live Command Center metrics or alerts, action tracking, templates, scheduling, deployment kit, post-event brief, attendee identity, advanced survey logic, integrations, unrelated SMB redesign, and unrelated event workspace changes.

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
lib/event-voice-surveys.ts
lib/event-survey-builder-payload.ts
existing survey create/edit APIs
existing survey lifecycle APIs

Maximum files per prompt:
14 unless the active prompt proves more are required and the loop controller permits human review.
```

---

## Global Product Rules

- The Command Center remains the center of the product, but Stage 1 does not implement Command Center changes.
- This stage adds a structured signal foundation that later stages will use.
- Voice remains the differentiator.
- Structured questions strengthen detection and comparison; they do not replace voice evidence.
- Do not create a second survey, response, answer, or analytics system.
- Existing voice-only surveys must remain compatible.
- Existing kiosk behavior must remain functional.
- Existing public survey links and lifecycle behavior must remain functional.
- Events-only behavior must not silently change SMB defaults.
- Use Events-only wrappers or additive type-aware shared behavior when shared components cannot be changed safely.
- Schema mode is `OPEN`.
- Make schema changes only when required by the approved canonical design.
- All migrations must be production-safe and preserve existing data.
- Do not reset the database or use destructive migration commands.
- Keep route handlers thin.
- Put reusable validation and business rules in canonical services/helpers.
- Do not store important mixed-question state only in client UI state.
- Do not begin Stage 2.

---

# Prompt 1 — Audit and Canonical Mixed-Question Contract

**Recommended model: Fable**

## Task

Audit the current voice-only survey, question, answer, create/edit, TTS, and shared Events/SMB implementation. Define the canonical production contract required to support:

```txt
VOICE
RATING_1_TO_5
RECOMMENDATION_0_TO_10
```

This prompt is **audit and implementation-plan only**.

Do not edit files.

## Audit Goals

Determine exactly how the current system represents:

- survey questions
- question ordering
- required versus optional behavior
- voice selection
- TTS generation
- response creation
- answer creation
- answer completion
- transcript/analysis linkage
- survey create payloads
- survey edit payloads
- Events-only versus SMB survey behavior
- legacy `questionsJson` assumptions, if still present
- normalized `Question` model assumptions
- existing tests that define compatibility

## Required Investigation

### 1. Current schema

Inspect the current Prisma schema and migrations for:

- `Survey`
- `Question`
- `Response`
- `Answer`
- `AnswerTranscript`
- `AnswerAnalysis`
- any question-type or answer-value fields
- any legacy event-level question storage
- uniqueness, ordering, and ownership constraints

Identify whether the current schema can safely support mixed question types without migration.

### 2. Voice-only assumptions

Find every important place where the product assumes:

- every question requires audio recording
- every answer has an audio object
- every question receives TTS
- every answer is transcribed
- every answer is analyzed as voice text
- every question is displayed with voice-specific controls
- every saved question has only prompt text and order

### 3. Create/edit contracts

Inspect:

- Events survey creation
- Events survey editing
- shared survey builder components
- SMB survey creation/editing
- payload builders
- route validation
- service validation
- question ordering logic
- AI-generated question insertion

Determine the smallest safe contract change that supports mixed types without breaking current consumers.

### 4. Canonical type design

Recommend the exact canonical representation for:

```txt
VOICE
RATING_1_TO_5
RECOMMENDATION_0_TO_10
```

The recommendation must cover:

- enum or equivalent question-type contract
- type-specific configuration
- required/optional state
- stable ordering
- numeric answer storage
- voice answer storage
- whether one `Answer` model can safely represent all three types
- how non-voice answers avoid transcript/analysis processing
- how existing voice-only data is backfilled or interpreted
- server-side validation by type
- API response compatibility

### 5. Migration design

Recommend a production-safe migration path.

It must answer:

- which fields/models change
- whether fields are nullable
- how existing questions become `VOICE`
- how existing answers remain valid
- how old API clients remain compatible during rollout
- which indexes or constraints are required
- whether a staged migration is safer than one migration
- any generated Prisma client work
- any manual deployment steps

### 6. Events versus SMB boundary

Identify:

- which builder components are shared
- which APIs are shared
- which current SMB assumptions must be preserved
- whether mixed question types should be Events-only initially
- whether the safest implementation is:
  - Events-only wrappers,
  - additive shared support with SMB defaults unchanged,
  - or a canonical shared data model with Events-only UI exposure

Do not recommend duplicating the underlying data system.

## Required Output

Return:

1. Current voice-only architecture.
2. Exact files and functions involved.
3. Every material voice-only assumption.
4. Proposed canonical question contract.
5. Proposed canonical answer contract.
6. Proposed API request/response changes.
7. Proposed server-side validation rules.
8. Production-safe migration plan.
9. Backward-compatibility plan for existing voice surveys.
10. Events versus SMB boundary recommendation.
11. TTS/transcription/analysis implications.
12. Tests required for Prompt 2 and Prompt 3.
13. Risks and unresolved product decisions.
14. Exact implementation sequence for Prompt 2.

## Hard Stops

Stop for human review if:

- the current schema has conflicting sources of truth for questions or answers
- existing production data cannot be migrated safely
- a destructive migration appears necessary
- the correct canonical answer model requires a product decision not covered by the Phase 1 brief
- Events and SMB cannot share the canonical model without changing SMB product behavior and no safe wrapper boundary exists

## Acceptance Checks

- No files changed.
- Exact current contracts are documented.
- A single canonical mixed-question and answer design is recommended.
- Existing voice-only compatibility is explicit.
- Migration safety is explicit.
- Prompt 2 can be implemented without inventing the architecture.

## Loop Rule

Use the loop controller’s stop format for an audit prompt.

Do not begin Prompt 2 until this audit is complete and no hard stop is triggered.

---

# Prompt 2 — Canonical Data Foundation and Server-Side Validation

**Recommended model: Fable**

## Task

Implement the canonical mixed-question and mixed-answer foundation approved by Prompt 1.

This prompt covers schema, migration, canonical types, services/helpers, API validation, compatibility, and focused backend tests.

Do not redesign the survey builder yet.

## Required Outcomes

The canonical system must support:

```txt
VOICE
RATING_1_TO_5
RECOMMENDATION_0_TO_10
```

Existing voice-only surveys and answers must remain valid.

## Required Changes

### 1. Canonical question type

Add the approved question-type contract to the canonical data model.

The implementation must support:

- stable question type
- stable question order
- required/optional state if approved by the audit
- type-specific configuration only where genuinely necessary
- existing prompt text and ownership
- Event/Survey scoping
- safe defaults for existing data

Do not use arbitrary JSON for values that require server-side invariants unless the audit proves JSON is the safest existing architecture.

### 2. Canonical answer representation

Use the existing `Answer` system unless the audit proves it cannot safely support mixed answers.

The canonical representation must support:

#### Voice answers

- existing audio metadata
- existing processing status
- existing transcript linkage
- existing analysis linkage

#### Structured answers

- numeric value
- question linkage
- response linkage
- no fake audio metadata
- no transcription requirement
- no voice-analysis requirement
- deterministic validation against question type and allowed range

Allowed ranges:

```txt
RATING_1_TO_5
1 through 5 inclusive

RECOMMENDATION_0_TO_10
0 through 10 inclusive
```

### 3. Compatibility behavior

Preserve existing behavior for current voice-only records.

Implement the approved compatibility approach, such as:

- explicit backfill to `VOICE`
- safe default interpretation during rollout
- nullable transition fields
- staged service compatibility

Do not break current survey reads while migration and deployment are rolling out.

### 4. Canonical validation

Add one canonical server-side validation path for:

- valid question type
- allowed configuration
- valid required state
- numeric range
- answer value matching question type
- voice answer requirements
- non-voice answer restrictions
- question ownership and survey scope
- stable ordering
- unsupported combinations

Route handlers should call canonical helpers/services rather than duplicating the rules.

### 5. Create/edit API compatibility

Update the existing Events survey create/edit contracts only as required to persist mixed question definitions.

Requirements:

- old voice-only payloads remain accepted where safe
- new typed payloads are validated
- response shapes remain compatible where possible
- unsupported types return explicit errors
- type-specific invalid configurations return explicit errors
- account/event/survey scope remains enforced

Do not expose mixed question types in the UI yet unless a small test harness is required.

### 6. Processing safety

Update canonical processing decisions so:

- voice answers continue through upload, transcription, and analysis
- structured answers do not enter the audio/transcription pipeline
- non-voice answers cannot be falsely marked as failed because audio is absent
- current voice processing logs remain valid
- future mixed kiosk collection has a clear canonical write path

Do not implement the Stage 2 kiosk UI.

### 7. Migration

Create and document the approved production-safe migration.

Requirements:

- no database reset
- no destructive data loss
- existing questions remain readable
- existing answers remain readable
- backfill only from provable existing state
- indexes and constraints are added safely
- Prisma client is regenerated where required
- migration steps are included in the stop report

## Tests

Add focused tests for:

- existing voice-only question compatibility
- mixed question type persistence
- numeric answer validation
- invalid rating below 1
- invalid rating above 5
- invalid recommendation below 0
- invalid recommendation above 10
- structured answer rejected for voice question
- voice/audio answer rejected for structured question where appropriate
- non-voice answer bypasses transcription processing
- question ordering
- required/optional persistence
- event/survey scoping
- old payload compatibility
- unsupported type error behavior

## Out of Scope

Do not implement:

- mixed-question builder UI
- rating/recommendation kiosk UI
- live metrics
- alerts
- templates
- scheduling
- post-event brief

## Acceptance Checks

- Prisma schema validates.
- Migration is production-safe.
- Prisma client generation passes.
- Existing voice-only survey tests remain green.
- Canonical typed question persistence works.
- Canonical numeric answer persistence works.
- Type-specific validation is server-side.
- Structured answers do not enter the voice-processing pipeline.
- No duplicate survey/answer system is created.
- Events and SMB compatibility matches the approved audit.
- Focused tests and typecheck pass.

## Loop Rule

Complete, test, review against the Phase 1 brief, and correct Prompt 2 before starting Prompt 3.

Use the loop controller’s stop format.

---

# Prompt 3 — Events Mixed-Question Survey Create and Edit Experience

**Recommended model: Fable**

## Task

Implement the Events survey create/edit experience for:

```txt
VOICE
RATING_1_TO_5
RECOMMENDATION_0_TO_10
```

Use the canonical data and validation foundation from Prompt 2.

Do not implement kiosk collection or Command Center metrics in this prompt.

## Product Goal

An event operator should be able to create and edit a simple mixed survey without needing survey-research expertise.

The experience should remain compact, clear, and event-native.

## Required Changes

### 1. Add-question interaction

Allow the operator to add a question by type.

Use clear customer-facing labels:

```txt
Voice response
1–5 rating
0–10 recommendation
```

Do not expose internal enum names.

The add interaction should not permanently consume large vertical space.

Use a compact menu, chooser, or other clear progressive-disclosure pattern.

### 2. Type-aware question cards/rows

Each question editor must clearly show:

- question order
- customer-facing question type
- prompt text
- required/optional state if supported
- reorder control
- duplicate only if already supported and safe
- delete
- type-specific controls only when needed

#### Voice response

Show only voice-relevant controls.

Preserve:

- spoken prompt behavior
- TTS generation rules
- selected/default survey voice
- existing voice preview behavior where it belongs

#### 1–5 rating

Show concise configuration.

Do not add unnecessary research settings.

The first version should use the canonical fixed range:

```txt
1 through 5
```

Optional endpoint labels may be supported only if the audit and data contract approved them.

#### 0–10 recommendation

Show concise configuration.

Use the canonical fixed range:

```txt
0 through 10
```

Use clear event-appropriate helper text, such as likelihood to recommend or attend again, without hard-coding every prompt.

### 3. Reordering

Mixed question types must reorder safely.

Reordering must preserve:

- question type
- prompt
- required state
- type configuration
- stable IDs when editing
- canonical order after save and reload

### 4. Existing survey compatibility

Existing voice-only surveys must:

- open correctly
- display as Voice response questions
- save without unintended changes
- preserve question order
- preserve TTS/audio behavior

### 5. Survey creation

A new Events survey can contain any supported combination.

Example:

```txt
1–5 rating
Voice response
0–10 recommendation
Voice response
```

Creation must use the existing canonical service/API.

Do not create a UI-only save path.

### 6. Survey editing

Allow typed questions to be edited safely according to existing lifecycle rules.

Preserve current restrictions for active surveys unless the plan explicitly approves broader editing.

If changing a question’s type after creation would create answer-integrity risk:

- prevent type changes after responses exist, or
- require explicit safe handling approved by the canonical service

Do not solve integrity risk with UI-only warnings.

### 7. Voice configuration

Do not show large voice controls for every question.

The survey-level voice remains the default for voice questions.

Use progressive disclosure:

- compact current voice summary
- Change voice
- Preview where applicable

Rating and recommendation questions should not imply that spoken audio is required.

If the kiosk currently reads every question aloud and the canonical product wants spoken prompts for all types, preserve that separately from answer type. Do not confuse spoken prompt playback with voice-answer collection.

### 8. AI generation

Preserve the current AI question generator.

For Stage 1:

- generated questions may continue defaulting to Voice response unless the existing generator can safely return approved types
- do not invent type selection from AI output without deterministic validation
- allow the operator to change newly generated unsaved questions to supported types only when safe
- keep generation request details inside the existing modal

### 9. Events versus SMB

Expose mixed question types in Events only for Stage 1 unless the audit approved shared exposure.

SMB behavior must remain unchanged.

Shared components may be extended additively, but Events-only wrappers are preferred when shared visual behavior would otherwise change.

### 10. Validation and errors

Show clear UI errors for:

- blank prompt
- unsupported type
- invalid type configuration
- invalid required state
- save conflict
- lifecycle restriction
- server validation failure

Do not show fake success before the server confirms persistence.

## Responsive Requirements

Verify:

- desktop 1440px
- tablet/narrow desktop 1024px
- mobile 375px

The builder must avoid:

- horizontal overflow
- oversized permanent panels
- repeated large configuration blocks
- hidden reorder/delete controls
- ambiguous type labels

## Tests

Add/update focused tests for:

- adding each supported type
- mixed ordering
- saving mixed survey
- reopening persisted mixed survey
- editing prompt without losing type
- required/optional persistence
- deleting one typed question
- existing voice-only survey compatibility
- lifecycle restrictions
- invalid server response
- AI-generated question default behavior
- Events-only exposure
- SMB regression

## Out of Scope

Do not implement:

- rating/recommendation kiosk answering
- numeric analytics
- Command Center alerts
- templates
- scheduling
- deployment kit
- post-event brief

## Acceptance Checks

- All three question types can be added in Events.
- Mixed surveys save through canonical APIs.
- Mixed surveys reopen correctly.
- Reordering preserves type/configuration.
- Existing voice-only surveys remain unchanged.
- Voice configuration appears only where relevant.
- Rating/recommendation controls remain compact.
- AI generation remains functional.
- SMB behavior remains unchanged.
- Desktop and mobile browser verification passes.
- Focused tests and typecheck pass.

## Loop Rule

Complete, test, review against the Phase 1 brief, and correct Prompt 3 before starting Prompt 4.

Use the loop controller’s stop format.

---

# Prompt 4 — Stage 1 Integration, Compatibility, and Hardening

**Recommended model: Fable**

## Task

Perform the final Stage 1 integration and hardening pass for the mixed-question foundation and Events survey builder.

This is a correction, verification, and regression prompt.

Do not begin Stage 2 or add kiosk support for structured answers.

## Required End-to-End Stage 1 Journeys

### Journey 1 — Existing voice survey

- open an existing voice-only survey
- verify all questions resolve as Voice response
- edit allowed content
- save
- reload
- confirm no type, order, voice, TTS, or lifecycle regression

### Journey 2 — New mixed survey

Create:

```txt
1–5 rating
Voice response
0–10 recommendation
Voice response
```

Then:

- save
- reopen
- verify order
- verify type
- verify required/optional state
- verify type-specific configuration
- edit prompts
- reorder
- save again
- reload again

### Journey 3 — Validation

Verify clear handling for:

- blank prompts
- unsupported type
- invalid rating configuration
- invalid recommendation configuration
- numeric answer outside allowed range through direct API test
- type/answer mismatch
- unauthorized or wrong-event access
- active-survey lifecycle restrictions
- invalid type change after responses where applicable

### Journey 4 — Processing compatibility

Verify:

- current voice answer upload path remains unchanged
- voice answers still enter transcription/analysis
- structured answers have a canonical future write path
- structured answers do not enter voice processing
- TTS generation occurs according to the approved spoken-prompt policy
- non-voice question types do not create invalid audio requirements

### Journey 5 — Events/SMB separation

Verify:

- Events survey builder exposes mixed types
- SMB survey builder retains approved current behavior
- shared QuestionBuilder behavior is not unintentionally changed
- shared QR, lifecycle, kiosk, and dashboard behavior remains unchanged
- no Events terminology leaks into SMB

## Architecture Review

Review all Prompt 2 and Prompt 3 changes against the Phase 1 brief and engineering standards.

Confirm:

- one canonical question-type contract
- one canonical answer contract
- one validation path
- thin route handlers
- server-side invariants
- safe account/event/survey scoping
- no duplicated data model
- no UI-only authoritative state
- no speculative Stage 2 code
- no dead parallel logic left behind

Make corrections where implementation drifted.

## Migration Verification

Run the repository’s correct migration checks.

At minimum, where applicable:

```txt
npx prisma validate
npx prisma generate
```

Also verify:

- migration file exists
- migration is additive/production-safe
- existing data backfill is deterministic
- no reset command is required
- manual migration steps are documented
- rollback/remediation risk is reported honestly

Do not apply destructive commands.

## Required Test Coverage

Run the most targeted useful tests for:

- schema/model compatibility
- service validation
- create route
- edit route
- answer-type validation
- processing bypass
- Events builder
- existing voice survey
- SMB regressions
- typecheck
- relevant build where reasonable

If full-suite failures are unrelated, report them explicitly and do not hide them.

## Browser Verification

Verify real pages at:

```txt
1440px desktop
1024px narrow desktop/tablet
375px mobile
```

Review:

- add-question interaction
- type labels
- mixed ordering
- question density
- voice progressive disclosure
- validation states
- save/reload
- lifecycle restrictions
- no horizontal overflow
- no duplicate or confusing controls

Correct visible issues caused by Stage 1.

## Stage 1 Definition of Done

Stage 1 is complete only when:

- canonical mixed question types exist
- canonical numeric answer storage exists
- existing voice questions/answers remain valid
- Events mixed survey creation works
- Events mixed survey editing works
- mixed reorder persists
- server validation is authoritative
- voice processing remains intact
- structured answers avoid voice processing
- SMB behavior is preserved
- migration checks pass
- focused tests pass
- typecheck passes
- desktop/mobile browser verification passes
- Stage 2 has not been started

## Final Output

Use the loop controller’s final stop format for Stage 1.

Also include:

```txt
Stage 1 readiness for Stage 2: yes/no

Canonical question types:
Canonical answer fields:
Migration path:
Existing voice compatibility:
Events builder status:
SMB regression status:
Kiosk work intentionally deferred:
Command Center work intentionally deferred:
```

Stop after the Stage 1 report.

Do not begin Stage 2.
