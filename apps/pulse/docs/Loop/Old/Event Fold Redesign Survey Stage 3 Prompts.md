# SignalThread Event Survey Phase 1 — Stage 3 Prompt Pack

## Purpose

This prompt pack executes **Stage 3: Command Center Intelligence, Live Alerts, and Lightweight Action Tracking** from the SignalThread Event Survey Phase 1 brief.

Stage 3 is one implementation stage containing four sequential prompts:

1. Audit the current Command Center, signals, evidence, and persistence model
2. Implement canonical structured metrics and mixed-signal intelligence
3. Implement live alerts and lightweight operational action tracking
4. Complete Stage 3 integration, evidence drill-through, intervention monitoring, and regression hardening

Use this file with the existing generic loop controller and the Phase 1 product brief.

---

## Required Inputs

```txt
Loop controller:
docs/Loop/GENERIC_PROMPT_LOOP_CONTROLLER.md

Plan document:
docs/Loop/Event Fold Redesign Voice Survey Brief.md

Prompt document:
docs/Loop/Event Fold Redesign Survey Stage 3 Prompts.md

Expected branch:
feat/voice-events-phase1-stage3-command-center-intelligence

Schema mode:
OPEN

Allowed scope:
Stage 3 only: canonical structured metrics for RATING_1_TO_5 and RECOMMENDATION_0_TO_10; mixed structured-and-voice event signals; live Command Center alert generation and persistence; evidence correlation; sample-strength labeling; alert deduplication; acknowledge/assign/acting/resolved/dismissed workflows; internal notes; intervention timing and directional before/after movement; Events-only Command Center UI and targeted shared changes required to support it safely.

Out of scope:
Templates, survey scheduling, deployment kits, post-event briefs, attendee identity, registration-platform integrations, advanced survey logic, cross-event benchmarking, portfolio analytics, unrelated event workspace redesign, unrelated SMB redesign, external Slack/Teams/email/SMS notifications, and all Stage 4 work.

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
existing Command Center signal and evidence services
existing event analytics routes
existing Dashboard2 / Command Center surface
lib/mixed-survey-contract.ts
lib/answer-question-context.ts
existing event/account authorization helpers
existing response and answer models

Maximum files per prompt:
14 unless the active prompt proves more are required and the loop controller requires human review.
```

---

## Global Product Rules

- The Command Center is the center of the product.
- Stage 3 must strengthen live event awareness and action, not create a generic analytics dashboard.
- Structured ratings and recommendation scores provide measurable movement.
- Voice evidence provides context, nuance, and attendee language.
- Alerts must be explainable, deterministic, event-scoped, and grounded in real persisted responses.
- Do not create dashboard-only copies of canonical data.
- Do not create a second signal, alert, evidence, or action system if one already exists and can be extended safely.
- Existing voice-only signals and evidence drill-down must continue working.
- Existing mixed kiosk collection from Stage 2 must remain unchanged.
- Existing SMB behavior must remain unchanged.
- Schema mode is `OPEN`.
- Required additive schema and migration work is allowed when genuinely needed by Stage 3.
- Do not reset the database or use destructive migration commands.
- Keep route handlers thin.
- Put metrics, signal rules, deduplication, and action-state rules in canonical services/helpers.
- UI state is not authoritative for alert or action status.
- Do not begin Stage 4.

---

# Prompt 1 — Audit the Current Command Center, Signals, Evidence, and Persistence Model

**Recommended model: Sol Medium**

## Task

Audit the current Events Command Center, event signals, evidence drill-down, filters, persistence, authorization, and voice-only assumptions.

This prompt is **audit-only**.

Do not edit files.

## Audit Goals

Determine exactly how the current system:

- calculates event signals
- decides what needs attention
- ranks positive and negative findings
- groups evidence by Event Area, question, theme, and response
- links evidence to transcripts and audio
- handles event/account authorization
- renders the Command Center
- handles filters and selected evidence
- distinguishes persistent state from derived state
- stores or derives alert-like objects
- stores or derives action-like objects
- handles resolved/dismissed issues, if any
- handles mobile evidence detail
- handles legacy voice-only events
- could consume structured numeric answers from Stages 1 and 2

## Required Investigation

### 1. Current signal architecture

Inspect all current canonical signal and analytics paths.

Identify:

- signal service/helper files
- route handlers
- event-scoped queries
- response/answer/analysis dependencies
- time-window behavior
- severity or priority logic
- theme and sentiment logic
- evidence payload construction
- sorting/ranking rules
- any hard-coded demo or fallback data
- any duplicate signal logic in UI and server code

### 2. Current Command Center UI

Inspect the Events-only Command Center surface and identify:

- summary/pulse modules
- Needs Attention
- positive signals
- evidence panel or inline detail
- filtering by Event Area, question, theme, rep, or topic
- selected issue state
- mobile behavior
- loading, empty, and error states
- duplicate navigation or dashboard surfaces
- current data contracts

Determine which UI components are Events-only and which are shared.

### 3. Current evidence model

Document how the system reaches:

```txt
Signal
→ supporting Answer
→ transcript
→ audio
→ question
→ Survey
→ SurveyTarget
→ EventStructureItem / Event Area
→ Event
```

Identify gaps in stable identifiers, scoping, or evidence provenance.

### 4. Current persistence

Determine whether signals are:

- fully derived on read
- cached
- persisted
- partially persisted
- mixed between UI state and database records

Determine whether any current action/acknowledgement state exists.

If not, recommend whether Stage 3 requires new persisted models for:

- alert instance
- alert evidence linkage
- action owner
- action status
- internal notes
- timestamps
- dismissal/resolution reason

Do not recommend persistence merely for convenience. Explain why each persisted field is required.

### 5. Structured metrics contract

Using the Stage 1 and Stage 2 canonical fields, recommend the exact metrics contract for:

#### RATING_1_TO_5

- average
- count
- distribution
- recent-period average
- preceding-period average
- change
- Event Area grouping
- question grouping

#### RECOMMENDATION_0_TO_10

- average and/or distribution
- promoter/passive/detractor grouping only if product-approved
- response count
- recent-period movement
- Event Area grouping
- question grouping

Do not invent NPS as the only meaning of a 0–10 question unless the question/configuration explicitly represents recommendation intent.

### 6. Sample-strength contract

Recommend a canonical initial approach for:

```txt
Strong signal
Directional signal
Limited evidence
```

The recommendation must cover:

- minimum response count
- consistency requirements
- recency
- whether structured and voice agreement increases confidence
- how low-volume signals are worded
- where thresholds live
- how thresholds can be tuned later without rewriting every route

Do not present arbitrary thresholds as statistically rigorous if they are product heuristics.

### 7. Initial alert rules

Recommend exact, deterministic first-version rules for:

- low score
- meaningful decline
- repeated negative theme
- structured-score plus voice agreement
- cross-area issue

For each rule define:

- required inputs
- minimum evidence
- time window
- severity
- title/summary generation
- evidence set
- deduplication key
- reopen/update behavior
- when not to fire

### 8. Action tracking contract

Recommend the smallest useful operational model.

Initial statuses:

```txt
NEW
ACKNOWLEDGED
ACTING
RESOLVED
DISMISSED
```

Define:

- allowed transitions
- owner representation
- note behavior
- actor/timestamp audit
- reopen behavior
- resolution/dismissal reason
- whether actions belong to an alert or signal
- event/account authorization
- what remains derived versus persisted

Do not build Jira inside SignalThread.

### 9. Intervention monitoring

Recommend how to compare signal movement before and after:

- acknowledgement
- acting start
- resolution

The contract must be honest for small samples and must not imply causation.

### 10. Events versus SMB boundary

Identify:

- shared analytics services
- shared dashboard components
- shared Answer/Analysis reads
- SMB assumptions
- whether Stage 3 must remain fully Events-only
- where wrappers or event-specific services are required

## Required Output

Return:

1. Current Command Center architecture.
2. Exact files and functions involved.
3. Current signal and evidence data flow.
4. Current persistence versus derived-state map.
5. Voice-only assumptions.
6. Proposed structured metrics contract.
7. Proposed sample-strength contract.
8. Proposed alert-rule contract.
9. Proposed deduplication and update behavior.
10. Proposed alert/action persistence model.
11. Proposed action transition rules.
12. Proposed intervention-monitoring method.
13. Events versus SMB boundary.
14. Authorization and scoping requirements.
15. Production-safe migration plan, if needed.
16. Tests required for Prompts 2–4.
17. Exact implementation sequence for Prompt 2.
18. Risks and unresolved product decisions.

## Hard Stops

Stop for human review if:

- current signal logic has multiple conflicting canonical sources
- stable evidence provenance cannot be established safely
- action tracking requires a product decision not covered by the brief
- existing signal records cannot be migrated safely
- event/account authorization boundaries are unclear
- a destructive migration appears necessary
- Events and SMB cannot be separated safely

## Acceptance Checks

- No files changed.
- Current Command Center and signal architecture is documented.
- One canonical structured-metrics path is recommended.
- One canonical alert/action model is recommended.
- Sample-strength and deduplication rules are explicit.
- Prompt 2 can proceed without inventing architecture.

## Loop Rule

Use the loop controller’s stop format.

Do not begin Prompt 2 until this audit is complete and no hard stop is triggered.

---

# Prompt 2 — Canonical Structured Metrics and Mixed-Signal Intelligence

**Recommended model: Sol Medium**

## Task

Implement the canonical structured metrics and mixed structured-plus-voice intelligence path approved by Prompt 1.

This prompt covers server-side metrics, sample-strength labeling, event/question/Event Area rollups, evidence correlation, route payloads, and focused tests.

Do not implement persistent alert/action workflow yet.

## Required Outcomes

The canonical system must calculate real event-scoped metrics for:

```txt
RATING_1_TO_5
RECOMMENDATION_0_TO_10
```

and correlate them with supporting voice evidence.

## Required Changes

### 1. Canonical metrics service

Add or extend one canonical server-side service/helper that:

- reads from authoritative `Response`, `Answer`, `Question`, `Survey`, `SurveyTarget`, and Event Area relationships
- validates event/account scope
- excludes invalid, abandoned, or non-completed data according to the approved contract
- groups by event, Survey, Question, SurveyTarget, and Event Area
- computes only approved structured metrics
- supports approved time windows
- returns stable structured payloads
- avoids query loops and broad unscoped reads

### 2. Rating metrics

For `RATING_1_TO_5`, implement the approved metrics:

- count
- average
- distribution
- recent-period average
- preceding-period average
- change/direction
- question-level grouping
- Event Area grouping
- sample-strength label

Use canonical rounding rules.

Do not hide small sample sizes.

### 3. Recommendation metrics

For `RECOMMENDATION_0_TO_10`, implement the approved metrics:

- count
- average and/or distribution
- recent-period movement
- question-level grouping
- Event Area grouping
- sample-strength label

Only calculate promoter/passive/detractor or NPS-style values if the audit confirms the question configuration and product semantics support it.

### 4. Voice correlation

For each structured metric or structured issue candidate, make it possible to retrieve related voice evidence by:

- same Event Area
- same SurveyTarget
- same Survey
- same question group or approved semantic relationship
- approved time window
- negative/positive theme or sentiment where relevant

Do not falsely claim a voice answer explains a score unless the relationship is supported by the approved matching rule.

### 5. Sample-strength service

Implement the approved canonical sample-strength rules in one place.

Return:

```txt
STRONG
DIRECTIONAL
LIMITED
```

with customer-facing labels:

```txt
Strong signal
Directional signal
Limited evidence
```

The payload should include the reason or evidence basis needed for explainability.

### 6. Mixed-signal candidates

Implement deterministic server-side candidate generation for the approved rule inputs, without yet creating persistent operational alerts.

Candidates may include:

- low score
- meaningful decline
- repeated negative theme
- structured-score plus voice agreement
- cross-area issue

Each candidate must include:

- deterministic candidate key
- rule type
- Event Area
- severity
- structured metric
- time window
- supporting response count
- sample-strength label
- supporting evidence identifiers
- clear explanation of why it exists

Do not persist action status in this prompt.

### 7. Route/API payload

Add or update the thin Events Command Center route to expose the canonical metrics and signal candidates.

Requirements:

- event/account authorization
- narrow event-scoped queries
- explicit loading/empty/error semantics
- backward-compatible voice-only payloads where possible
- no UI-generated metrics
- no hard-coded demo data

### 8. Existing voice signals

Preserve current voice-only:

- themes
- sentiment
- positive signals
- negative signals
- evidence drill-down
- filters

Remove duplicate or parallel logic only where the new canonical path safely replaces it.

## Tests

Add focused tests for:

- 1–5 average and distribution
- 0–10 average and distribution
- time-window comparison
- no preceding-window data
- low sample count
- sample-strength labels
- Event Area grouping
- Question grouping
- event/account scope
- abandoned/incomplete response exclusion
- voice evidence correlation
- candidate deterministic key
- low-score candidate
- decline candidate
- repeated-theme candidate
- structured-plus-voice candidate
- cross-area candidate
- no candidate below minimum evidence
- voice-only compatibility
- query-count or loop protection where practical

## Out of Scope

Do not implement:

- persisted alert status
- acknowledge/assign/acting/resolved/dismissed
- internal notes
- external notifications
- templates
- scheduling
- deployment kit
- post-event brief

## Acceptance Checks

- Structured metrics derive from canonical answers.
- Metrics are event/account scoped.
- Sample strength is canonical and explainable.
- Mixed-signal candidates are deterministic.
- Supporting voice evidence is traceable.
- Low-volume data is labeled honestly.
- Existing voice-only signals remain functional.
- No dashboard-only metrics state is created.
- Focused tests and typecheck pass.

## Loop Rule

Complete, test, review against the Phase 1 brief, and correct Prompt 2 before starting Prompt 3.

Use the loop controller’s stop format.

---

# Prompt 3 — Persistent Live Alerts and Lightweight Action Tracking

**Recommended model: Sol Medium**

## Task

Implement persistent live alert instances and lightweight operational action tracking using the canonical metrics and signal candidates from Prompt 2.

Do not build external notifications or a project-management system.

## Product Goal

The Command Center should let an event team:

```txt
Detect
→ Review evidence
→ Acknowledge
→ Assign
→ Act
→ Resolve or dismiss
→ Monitor directional movement
```

## Required Changes

### 1. Canonical alert persistence

Implement the approved alert model and production-safe migration.

An alert instance should persist only the state that must survive recomputation, such as:

- event/account ownership
- deterministic candidate/deduplication key
- rule type
- Event Area / SurveyTarget relationship
- current severity
- first detected time
- last detected time
- status
- owner
- acknowledgement/acting/resolution/dismissal timestamps
- actor identifiers where approved
- resolution/dismissal reason
- current summary snapshot where needed
- canonical evidence linkage or reproducible evidence references

Do not persist derived metrics redundantly unless the audit established a snapshot is required for history.

### 2. Reconciliation and deduplication

Add one canonical reconciliation service that:

- receives current signal candidates
- creates new alerts only when no active matching alert exists
- updates existing matching alerts
- does not duplicate repeated candidates
- reopens or creates a new occurrence according to the approved rule
- preserves user action state
- handles disappeared signals honestly
- is idempotent and safe to retry

### 3. Action statuses

Implement:

```txt
NEW
ACKNOWLEDGED
ACTING
RESOLVED
DISMISSED
```

Enforce approved transitions server-side.

Example rules:

- NEW → ACKNOWLEDGED
- ACKNOWLEDGED → ACTING
- ACTING → RESOLVED
- NEW/ACKNOWLEDGED/ACTING → DISMISSED
- RESOLVED/DISMISSED → reopened only through the approved explicit or reconciliation rule

Do not rely on disabled UI buttons as enforcement.

### 4. Ownership and notes

Support:

- assigning an owner
- changing an owner
- adding internal notes
- actor and timestamp audit
- event/account authorization
- notes scoped to one alert

Keep the first version lightweight.

Do not add task dependencies, subtasks, due-date engines, or broad workflow automation.

### 5. API routes

Add thin routes for:

- listing current event alerts
- reading one alert with evidence
- acknowledging
- assigning
- marking Acting
- resolving
- dismissing
- adding a note
- reopening only if approved

Routes must:

- authenticate
- authorize
- validate event/account scope
- call canonical services
- return explicit errors
- avoid duplicating transition rules

### 6. Evidence integrity

Each alert detail must expose:

- why it fired
- structured metrics
- sample-strength label
- supporting answer IDs
- transcripts/audio references where permitted
- Event Area
- Survey/question context
- first/last detection
- current action state

Do not allow an alert to point to evidence outside its event/account scope.

### 7. Intervention timing

Persist or derive the timestamps required to compare:

- before acknowledgement
- after Acting begins
- after resolution

Do not claim causation.

Use language such as:

```txt
Ratings improved after the action was recorded.
Directional only — limited evidence.
```

### 8. Events versus SMB

Keep alert/action behavior Events-only.

Do not change SMB dashboards or workflows.

## Tests

Add focused tests for:

- first candidate creates one alert
- repeated reconciliation does not duplicate
- candidate update refreshes one alert
- user status survives reconciliation
- allowed transitions
- rejected transitions
- assign owner
- change owner
- add note
- event/account authorization
- evidence scope
- resolve
- dismiss
- approved reopen behavior
- concurrent/idempotent reconciliation where practical
- migration safety
- voice-only alert candidate compatibility

## Out of Scope

Do not implement:

- Slack
- Teams
- email
- SMS
- full task/project management
- templates
- scheduling
- deployment kit
- post-event brief

## Acceptance Checks

- Alerts persist canonically.
- Reconciliation is deterministic and idempotent.
- Duplicate alerts are prevented.
- Status transitions are server-authoritative.
- Ownership and notes persist.
- Evidence remains event/account scoped.
- Existing metrics and voice evidence remain intact.
- No SMB behavior changes.
- Migration, focused tests, Prisma validation/generation, and typecheck pass.

## Loop Rule

Complete, test, review against the Phase 1 brief, and correct Prompt 3 before starting Prompt 4.

Use the loop controller’s stop format.

---

# Prompt 4 — Stage 3 Command Center Integration, Intervention Monitoring, and Hardening

**Recommended model: Sol Medium**

## Task

Integrate structured metrics, mixed-signal alerts, evidence, and lightweight action tracking into the Events Command Center and complete Stage 3 hardening.

This is the final Stage 3 prompt.

Do not begin Stage 4.

## Required Command Center Experience

### 1. Live Pulse

Show real event-level structured and voice intelligence, such as:

- current response volume
- current average rating where available
- recommendation score/distribution where available
- direction of travel
- strongest positive signal
- strongest negative signal
- sample-strength context

Do not show metrics that are unavailable or statistically misleading.

### 2. Needs Attention

Show ranked active alerts with:

- clear title
- Event Area
- severity
- metric/change
- supporting response count
- sample-strength label
- recency
- action status
- owner where assigned

The alert list must distinguish:

- NEW
- ACKNOWLEDGED
- ACTING
- RESOLVED
- DISMISSED

Default focus should prioritize active operational issues.

### 3. Evidence detail

Selecting an alert should show:

- why the alert fired
- structured trend
- rating/recommendation context
- supporting voice excerpts
- transcript access
- audio playback where current permissions allow
- Event Area
- Survey/question context
- evidence count
- first/last detection time

Preserve the current inline/mobile evidence behavior approved for the Command Center.

Do not reintroduce an overlay/drawer if the current Events design intentionally removed it.

### 4. Actions

From alert detail, allow:

- Acknowledge
- Assign owner
- Mark Acting
- Resolve
- Dismiss
- Add note

Use one clear primary action for the current state.

Do not display every lifecycle action simultaneously.

### 5. Intervention monitoring

When enough post-action data exists, show:

- metric before action
- metric after action
- response count in each window
- direction of movement
- sample-strength warning

Use honest wording:

```txt
Improved after action was recorded
Worsened after action was recorded
No clear movement yet
Not enough evidence
```

Do not imply the action caused the change.

### 6. Coverage and low-volume states

Handle:

- no structured questions
- voice-only event
- no responses
- limited evidence
- no active alerts
- resolved-only event
- action recorded but no subsequent responses
- one Event Area with data
- multiple Event Areas
- cross-area issue

### 7. Filters and navigation

Preserve or improve current filters for:

- status
- severity
- Event Area
- topic/theme
- question
- active versus resolved

Avoid redundant filter controls.

Filtering must not break selected-alert state.

### 8. Responsive behavior

Verify:

```txt
1440×1024 desktop
1024×900 narrow desktop/tablet
375×812 mobile
```

Requirements:

- alert list remains scannable
- evidence detail is reachable
- actions are not clipped
- charts/metrics do not overflow
- audio controls remain usable
- notes and owner controls remain usable
- mobile selection scrolls detail into view
- no overlay regressions

### 9. Existing behavior

Preserve:

- voice-only Command Center
- positive signal review
- evidence playback
- event/account scope
- existing public kiosk and survey behavior
- SMB dashboards
- current event navigation

## Required End-to-End Journeys

### Journey 1 — Voice-only event

- open Command Center
- review existing voice signal
- inspect evidence
- confirm no structured-metric requirement
- confirm current behavior remains functional

### Journey 2 — Mixed event with low rating

- submit mixed responses
- compute rating metrics
- create one low-score alert
- open alert
- inspect structured and voice evidence
- acknowledge
- assign owner
- mark Acting
- add note

### Journey 3 — Meaningful decline

- establish preceding-period values
- add lower recent values
- reconcile
- confirm one decline alert
- confirm no duplicate on rerun
- confirm sample-strength wording

### Journey 4 — Resolution and movement

- mark alert resolved
- submit later responses
- compute before/after movement
- show honest directional result
- preserve resolved status

### Journey 5 — Authorization and SMB regression

- wrong event/account access rejected
- evidence cannot cross event scope
- SMB dashboard unchanged
- SMB voice journeys remain green

## Architecture Review

Confirm:

- one canonical metrics service
- one canonical sample-strength service
- one canonical candidate-generation path
- one canonical alert reconciliation service
- one server-authoritative transition path
- no dashboard-only alert state
- no duplicate voice/structured signal system
- thin routes
- scoped queries
- no Stage 4 code

Correct drift before completion.

## Migration Verification

Where schema changed:

```txt
npx prisma validate
npx prisma generate
```

Verify:

- migration is production-safe
- no destructive command is required
- existing data remains readable
- manual deployment steps are documented
- alert deduplication constraints are safe

## Required Test Coverage

Run the most targeted useful tests for:

- metrics
- sample strength
- candidate rules
- alert reconciliation
- transitions
- owner/notes
- authorization
- evidence scope
- Command Center components
- voice-only event journey
- mixed event journey
- Events Playwright
- SMB Playwright
- typecheck
- build

Do not claim tests passed unless they ran.

## Stage 3 Definition of Done

Stage 3 is complete only when:

- structured metrics appear from real mixed responses
- voice evidence remains connected
- alerts are deterministic and deduplicated
- active alerts are visible in the Command Center
- evidence explains why each alert fired
- acknowledge/assign/acting/resolved/dismissed persist
- internal notes persist
- intervention movement is shown honestly
- low-volume states are clear
- voice-only Events remain functional
- SMB remains unchanged
- desktop/tablet/mobile verification passes
- tests, typecheck, build, and migration checks pass
- Stage 4 has not been started

## Final Output

Use the loop controller’s final stop format for Stage 3.

Also include:

```txt
Stage 3 readiness for Stage 4: yes/no

Canonical metrics service:
Sample-strength rules:
Alert candidate rules:
Alert persistence model:
Deduplication behavior:
Action statuses:
Allowed transitions:
Evidence linkage:
Intervention monitoring:
Voice-only compatibility:
SMB regression status:
Migration steps:
Templates/scheduling/deployment intentionally deferred:
```

Stop after the Stage 3 report.

Do not begin Stage 4.
