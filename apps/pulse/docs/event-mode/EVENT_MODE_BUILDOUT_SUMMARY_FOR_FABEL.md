# Event Mode Product Buildout — Summary for Fabel

## Purpose

We are mid-build on the EVENTS product mode for Voice / Booth Audio.

This document is the working handoff for Fabel. It explains what the event product is supposed to become, what is already built, what is missing, what is risky, and how to execute the next buildout without breaking retail.

## Critical Rule

**Leave retail the fuck alone.**

Retail is already a working product surface.

Retail surveys are internally backed by `Event` records, so these names do **not** automatically mean EVENTS product mode:

- `Event`
- `eventId`
- `/app/events`
- `/api/app/events`
- `/kiosk?eventId=...`

The only valid EVENTS product boundary is:

```ts
Account.accountType === "EVENTS"
```

Everything else must default retail-safe:

- `RETAIL`
- `HOSPITALITY`
- missing account type
- unknown account type
- `null`
- `undefined`

If there is any doubt, the behavior must stay retail-safe.

## Current Product Baseline

The existing app already has a working anonymous kiosk voice flow:

```text
QR/link -> /kiosk?eventId=... -> response create -> answer upload -> transcription -> analysis -> dashboard insights
```

That baseline is shared infrastructure. It is not exclusively EVENTS.

Existing working behavior to preserve:

- retail dashboard
- retail survey create/edit
- retail kiosk links
- retail QR codes
- consent/branding
- question voice/TTS
- response capture
- answer upload
- transcription
- analysis
- retail-safe insights
- Google review helper only when configured by URL

## EVENTS Product Goal

This is not generic surveys.

This is event intelligence:

```text
live attendee voice -> event signals -> action while the event is still happening
```

The event product should let an EVENTS account:

1. create an event
2. define event structure
3. attach voice surveys to event targets
4. generate QR/token links per survey/target
5. collect attendee voice through the shared kiosk pipeline
6. slice insights by structure, survey, target, session, area, and sponsor activation
7. surface evidence-backed operational issues
8. produce action briefs and shareable summaries
9. show sponsor/exhibitor value when structure data supports it

## Canonical Event Hierarchy

Use the existing `Event` model as the top-level event container.

Do not create a second event system.

Current event voice hierarchy:

```text
Event
  -> SurveyTarget
      -> Survey
          -> Questions
          -> PublicSurveyLink
          -> Responses
              -> Answers
                  -> Transcript
                  -> Analysis
```

Important model rules:

- `Event` stays the top-level container.
- `SurveyTarget` sits below `Event`.
- `SurveyTarget.category` should stay small and organized:
  - `EVENT`
  - `SESSION`
  - `LOCATION`
  - `CUSTOM`
- Do not hard-code future target types like booth, meal_area, lounge, registration, or sponsor_activation as enum values unless a schema decision is explicitly approved.
- Existing `/kiosk?eventId=...` behavior must remain working.
- New token links resolve:

```text
PublicSurveyLink -> Survey -> SurveyTarget -> Event
```

- Existing `Response`, `Answer`, `AnswerTranscript`, and `AnswerAnalysis` must be reused.
- Do not create duplicate response, answer, transcription, or analysis systems.

## What Is Already Built

### Product boundary guardrails

Status: **stronger after Prompt 1**

Built:

- canonical account product mode helper
- EVENTS-only route guards
- retail-safe fallback behavior
- product-boundary regression tests
- tests proving non-EVENTS accounts reject event-only APIs
- tests proving retail-safe `/analysis`, `/signals`, and `/timeline` remain usable
- tests proving unknown/null/undefined account types default retail-safe

### Schema foundation

Status: **partially built**

Built:

- `Account.accountType`
- `Event`
- `SurveyTarget`
- `Survey`
- `PublicSurveyLink`
- `EventStructureItem`
- nullable linkage fields on `Response` / `Answer`
- normalized event intelligence tables

Still unresolved:

- attendee identity/follow-up model
- event schedule semantics
- persisted action brief/export model
- sponsor/exhibitor reporting model

### Event structure

Status: **mostly built**

Built:

- structure CRUD service
- event-wide/session/area/sponsor/custom structure support
- structure filters on dashboard
- route gates for EVENTS-only structure APIs

Needs review during UI work:

- whether structure labels/categories feel right in the admin workflow
- whether sponsor activation belongs as structure kind/category long-term
- whether scheduling semantics are sufficient

### Event voice survey creation

Status: **partially built**

Built:

- `createEventVoiceSurvey`
- `POST /api/app/events/[eventId]/voice-surveys?account=<accountSlug>`
- `SurveyTarget`
- `Survey`
- `PublicSurveyLink`
- token-aware kiosk/response baseline

Missing:

- all-survey management
- edit selected survey
- archive/deactivate selected survey
- copy/view QR per survey
- public link lifecycle beyond create/edit

### Kiosk/runtime

Status: **complete shared baseline**

Built:

- eventId launch
- token launch
- response creation
- survey/public-link scoping
- branding/consent
- question loading
- answer upload
- transcription
- analysis

Must remain shared:

- Do not create a second kiosk flow.
- Do not fork transcription or analysis.
- Do not break retail `/kiosk?eventId=...`.

### Response/answer linkage

Status: **built baseline**

Built:

- responses can carry:
  - `surveyId`
  - `surveyTargetId`
  - `publicSurveyLinkId`
- answers link to `Question`
- normalized intelligence only writes for EVENTS
- retail/non-EVENTS normalized intelligence writes no-op safely

### Dashboard/intelligence

Status: **partially built**

Built:

- EVENTS command center shell
- attention queue
- evidence drilldowns
- source filters
- structure filters
- intelligence extraction/read/write gates

Missing:

- live refresh/polling contract
- polished action briefs
- export/share workflow
- sponsor/exhibitor value layer
- clearer operator workflow

## Main Gaps Left

### Gap 1 — Event survey management

Need:

- list all surveys under an Event
- show survey name, target, status, question count, and link/QR state
- edit a selected survey
- archive/deactivate a selected survey
- avoid only editing the first survey

### Gap 2 — Public link / QR lifecycle

Need:

- view/copy launch URL per survey
- view/download QR per survey
- deactivate/reactivate link if current data model supports it
- regenerate link only if safe and approved by existing contract
- show whether a survey is launchable

### Gap 3 — Event settings

Need EVENTS-only settings surface for:

- event name
- description
- status/lifecycle
- start/end dates
- timezone
- default question voice if current model supports it
- event-wide response mode only if existing model supports it

Schema work is allowed only if the prompt explicitly puts schema/migration in scope.

### Gap 4 — Event operations page workflow

Need a clearer admin workflow:

- setup structure
- attach surveys
- share QR/link
- monitor dashboard
- review action briefs

Avoid bolting everything into one confusing page.

### Gap 5 — Live refresh

Need:

- manual refresh
- lightweight polling for EVENTS dashboard only
- visible “last updated” state
- no extra retail dashboard fetches
- no changes to shared analytics semantics

### Gap 6 — Action briefs

Need MVP using existing intelligence/evidence data first:

- issue/opportunity summary
- where it happened
- related structure item/session/area/sponsor activation if available
- evidence snippets
- suggested action
- status if current cluster/status model supports it

Prefer no-schema first pass, but schema is allowed if the prompt explicitly puts persistence/schema in scope after audit.

### Gap 7 — Export/share workflow

Need:

- copy action brief
- copy event summary
- maybe download markdown/text first
- no schema first pass unless the prompt explicitly approves persistence/schema

### Gap 8 — Sponsor/exhibitor value reporting

Need MVP using existing structure and intelligence data first:

- sponsor activation performance
- attendee mentions/sentiment
- evidence-backed value summary
- issues/opportunities by activation

If schema/migration is needed, pause and propose the schema path as an explicit follow-up prompt.

### Gap 9 — Legacy route hardening

Risky areas:

- `/api/events/[eventId]/*`
- `/admin/events/*`

These are legacy/public/eventId-based. They are not the current source of truth for new EVENTS product work.

Do not build new EVENTS features on these routes unless explicitly approved.

## Risk Map

### Highest risk

- touching kiosk recording/upload/processing unexpectedly
- touching response/answer pipeline unexpectedly
- destructive or unplanned Prisma schema/migration work
- changing auth/account/product boundary rules
- using legacy `/api/events/*` for new EVENTS features
- broad dashboard changes that affect retail
- shared analytics changes used by retail

### Medium risk

- `/api/app/events` and `/api/app/events/[eventId]` because they are shared retail-safe Event-backed routes
- templates/registry fallback behavior
- location/team semantics vs event workspace semantics
- event detail page because it can accidentally render event-only copy for non-EVENTS

### Lower risk

- tests
- comments/docs
- EVENTS-only UI sections behind confirmed product boundary
- derived/no-schema action brief views from existing data

## Build Sequence

### Phase 0 — Guardrails

Status: **done**

- product-boundary regression tests
- retail dashboard protection
- non-EVENTS rejects EVENTS-only APIs
- shared retail-safe analytics still works

### Phase 1 — Event setup/admin workflow

Goal:

Admins can configure a real event, attach multiple surveys, and launch QR/link collection.

Prompts:

1. Multi-survey management audit
2. Multi-survey management implementation
3. Public link/QR lifecycle audit
4. Public link/QR lifecycle implementation
5. Event settings audit
6. Event settings implementation
7. Event operations workflow cleanup

### Phase 2 — Live operations dashboard

Goal:

The dashboard becomes useful while the event is happening.

Prompts:

1. Dashboard live refresh audit
2. Dashboard live refresh implementation
3. Action briefs audit
4. Action briefs MVP implementation
5. Action brief status workflow if current model supports it

### Phase 3 — Event reporting/value

Goal:

The product can produce usable summaries and sponsor value narratives.

Prompts:

1. Export/share action brief MVP
2. Sponsor activation value audit
3. Sponsor activation value MVP, existing data first
4. Sponsor/exhibitor schema decision memo if needed

### Phase 4 — Hardening

Goal:

Lock down risky edges after core event workflow exists.

Prompts:

1. Kiosk regression suite for event token + retail Google helper
2. Legacy `/api/events/*` and `/admin/events/*` audit
3. Legacy route hardening plan, implementation only with approval
4. Event help/docs after UI is real

## Controlled-Change Gates

These are not all hard bans. They are control points.

The goal is to prevent accidental damage to retail/shared infrastructure while still allowing the EVENTS product to be built properly.

### Stop before implementation if a task unexpectedly touches:

- response/answer pipeline
- transcription/analysis pipeline
- auth/session/account/product boundary
- retail dashboard
- retail survey create/edit
- shared analytics used by retail
- breaking public API contract changes
- legacy `/api/events/*` behavior
- `/admin/events/*` behavior

### Prisma / schema rule

Prisma schema and migrations are allowed when the current prompt explicitly says schema work is in scope.

If schema work is in scope, Fabel may proceed, but must:

- explain the schema change before editing
- keep the migration production-safe
- avoid destructive changes unless explicitly approved
- preserve existing retail behavior
- run `npx prisma validate`
- run `npx prisma generate`
- run relevant migration/test checks
- summarize migration risk clearly

Stop before implementation if Prisma changes are unexpected, destructive, require backfill/data cleanup, change kiosk/runtime behavior, or alter shared retail data contracts.

### Kiosk / runtime rule

The kiosk is shared infrastructure, but EVENTS work may need to touch kiosk launch/runtime behavior.

Kiosk changes are allowed only when the current prompt explicitly includes kiosk launch/runtime work, such as token launch, QR/link launch behavior, event survey link resolution, or kiosk regression fixes.

Do not touch recording, upload, response finalization, answer processing, transcription, or analysis unless the prompt explicitly includes that pipeline work.

Stop before implementation if kiosk work would fork the kiosk, create a second kiosk flow, change retail `/kiosk?eventId=...`, or alter the response/answer/transcription/analysis pipeline unexpectedly.

### File-count rule

If a task appears to require more than 8 files, pause and summarize why before continuing unless the current prompt already approved a broader multi-file change.

## Verification Standards

After every implementation prompt:

```bash
npm run typecheck
```

Run targeted tests for changed files.

Run full tests when practical:

```bash
npm test
```

If Prisma is touched because the current prompt explicitly approved schema/migration work, also run:

```bash
npx prisma validate
npx prisma generate
```

If Prisma is touched unexpectedly, stop and return a decision memo before implementation.

## Commit Rules

After each prompt:

1. inspect worktree
2. stage only files changed for the current prompt
3. do not stage pre-existing changes
4. commit with a focused message
5. report files changed, tests, and risks

Useful commands:

```bash
git status --short
git diff --stat
```

Stage explicit files only. Do not use `git add .` unless the worktree is confirmed clean except for the current prompt.

## Current Known State

Prompt 1, product-boundary regression coverage, has been implemented:

- 11 test files changed
- no runtime files changed
- `npm run typecheck` passed
- targeted tests passed: 11 files, 97 tests
- `npm test` passed: 64 files, 330 tests

If that commit is already in the branch, do not rerun Prompt 1.

