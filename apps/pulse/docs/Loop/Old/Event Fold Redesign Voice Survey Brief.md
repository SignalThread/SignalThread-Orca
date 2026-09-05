# SignalThread Event Survey Phase 1 Product Brief

## Purpose

This brief defines the first major product-expansion phase for SignalThread Voice Events.

The goal is not to turn SignalThread into a generic survey builder.

The goal is to strengthen the existing event-intelligence product so event teams can:

1. launch structured and voice feedback quickly
2. detect problems while the event is still happening
3. review the supporting attendee evidence
4. assign and track lightweight operational action
5. produce a useful post-event record of what happened and what should change

The existing in-event Command Center remains the center of the product.

New survey capabilities must feed the Command Center rather than pull the product toward a traditional post-event survey workflow.

---

## Product Positioning

SignalThread should not be positioned as:

> A form builder for events.

It should be positioned as:

> An event-intelligence system that listens across the attendee journey, detects emerging problems, helps the team act while the event is live, and preserves the operational learning afterward.

The core lifecycle is:

```txt
Before the event
Launch listening points quickly

During the event
Detect, understand, notify, and act

After the event
Explain what happened and improve the next event
```

---

## Initial Customer Profile

Phase 1 is designed primarily for smaller events and early customers.

Likely characteristics:

- one-day or two-day events
- a limited number of sessions and Event Areas
- small onsite teams
- no dedicated survey specialist
- limited implementation time
- QR-led attendee collection
- tens or low hundreds of responses rather than thousands
- strong need for simple setup and clear live operational value

The product must therefore prioritize:

- fast setup
- understandable controls
- reliable collection
- live signal clarity
- actionable evidence
- low administrative burden

It should not require enterprise-level integrations or complex research expertise to produce value.

---

## Existing Product Foundation

SignalThread already has the core foundation:

- event-scoped Voice workspace
- Event Areas
- Surveys and questions
- public survey links
- QR and kiosk launch
- voice recording
- upload and processing
- transcription
- AI analysis
- event dashboards
- live Command Center
- evidence drill-down
- event signals and attention states
- survey lifecycle controls
- post-event review potential

Phase 1 should extend this system rather than create parallel survey, response, analytics, or alert systems.

---

## Phase 1 Product Promise

> Launch event feedback in minutes, combine structured ratings with real attendee voices, detect meaningful issues as they emerge, and help the event team act before the experience is over.

The post-event brief is important, but it is not the primary product center.

The Command Center is the operating surface that connects:

```txt
Structured scores
+
Voice evidence
+
Live signal detection
+
Operational response
+
Post-event learning
```

---

## Phase 1 Scope

Phase 1 introduces five connected product capabilities.

### 1. Mixed-question surveys

Support a focused initial set of question types:

```txt
VOICE
RATING_1_TO_5
RECOMMENDATION_0_TO_10
```

This creates the core SignalThread survey pattern:

```txt
Quantitative signal
+
Qualitative explanation
```

Example:

```txt
How would you rate registration?              1–5
How likely are you to attend again?           0–10
What should the event team know right now?    Voice
```

Structured questions help detect movement.

Voice questions explain why the movement is happening.

### 2. Mixed-response kiosk experience

The attendee experience must support rating, recommendation, and voice questions in one survey without creating separate response flows.

The kiosk must remain:

- simple
- mobile-friendly
- accessible
- fast
- resilient
- voice-first without being voice-only

### 3. Live Command Center intelligence

Mixed responses must feed the existing Command Center.

The Command Center should detect and explain:

- low ratings
- meaningful rating declines
- recurring negative voice themes
- issues appearing across multiple Event Areas
- sudden increases in negative feedback
- improving or worsening conditions after action

Structured scores should not replace voice analysis.

They should strengthen confidence in the live signal.

Example:

```txt
Registration needs attention

Average registration rating declined from 4.2 to 2.8
across the past 30 minutes.

Six recent voice responses mention long wait times.
```

### 4. Fast event launch tools

Small event teams should be able to launch useful feedback without building everything manually.

Phase 1 should include:

- guided event survey templates
- simple availability scheduling
- Event Area and session timing support
- QR/signage deployment kit
- bulk download where useful

### 5. Post-event intelligence brief

The post-event output should summarize the same operational story that occurred during the event.

It should include:

- overall scores
- recommendation intent
- strongest positive signals
- major friction points
- alerts raised
- actions taken
- whether conditions improved
- unresolved issues
- sample-size warnings
- recommendations for the next event

---

## Product Principles

### The Command Center remains central

Every new feature should answer:

> How does this improve live event awareness, evidence, or action?

Do not add survey features that exist only because traditional survey tools have them.

### Voice-first, not voice-only

Voice remains the differentiator.

Structured ratings provide:

- measurable movement
- comparison
- alert thresholds
- trend detection
- supporting confidence

Voice provides:

- context
- nuance
- explanation
- evidence
- attendee language

### Small-event simplicity

Phase 1 should not require:

- complex survey research configuration
- enterprise integrations
- advanced logic builders
- hundreds of setup decisions
- large onsite teams

### Real signals, not false certainty

Low-volume event data must be labeled honestly.

Recommended signal-strength language:

```txt
Strong signal
Directional signal
Limited evidence
```

The system should never make a small number of responses look statistically conclusive.

### One canonical system

Do not create separate systems for:

- structured responses
- voice responses
- survey lifecycle
- Command Center alerts
- evidence
- action tracking
- post-event reports

The product should derive all of them from the existing canonical event, survey, response, answer, analysis, and signal architecture.

---

# Five-Stage Implementation Plan

Phase 1 should be executed as five controlled loop stages.

Each stage should complete implementation, targeted testing, browser verification, plan review, and correction before the next stage begins.

Recommended implementation model:

```txt
Fable
```

Recommended schema mode:

```txt
OPEN
```

Schema changes are allowed when genuinely required by the active stage and must follow production-safe migration rules.

---

## Stage 1 — Mixed-Question Foundation and Survey Builder

### Objective

Add canonical support for voice, 1–5 rating, and 0–10 recommendation questions and answers.

### Required product behavior

Survey creators can:

- add any supported question type
- reorder mixed question types
- edit prompts
- mark questions required or optional where supported
- preview the survey structure
- save and edit existing mixed-question surveys

Initial supported types:

```txt
VOICE
RATING_1_TO_5
RECOMMENDATION_0_TO_10
```

### Data requirements

The canonical data model must support:

- question type
- type-specific configuration
- structured numeric answer values
- existing voice answer linkage
- mixed answers within one Response
- safe migration of existing voice-only questions and answers

### Important rules

- Existing voice surveys must continue working.
- Do not create a separate structured-survey system.
- Do not store important answers only inside generic client state.
- Existing SMB behavior must be preserved or isolated through Events-only paths.
- Question-type validation belongs in canonical server-side logic.

### Stage acceptance checks

- Existing voice-only surveys still load and save.
- A mixed survey can be created.
- Question types persist correctly.
- Reordering preserves type and configuration.
- Numeric answer storage is canonical and queryable.
- Invalid question configuration is rejected server-side.
- Migration is production-safe.
- Focused tests and typecheck pass.

---

## Stage 2 — Mixed-Response Kiosk and Collection Flow

### Objective

Allow attendees to complete rating, recommendation, and voice questions inside the existing kiosk journey.

### Required kiosk behavior

#### Rating question

- render large, touch-friendly 1–5 controls
- clearly show the selected value
- allow correction before continuing
- support required and optional behavior

#### Recommendation question

- render touch-friendly 0–10 controls
- clearly show endpoints where useful
- allow correction before continuing

#### Voice question

- preserve the existing voice recording flow
- preserve upload, retry, processing, and completion behavior

### Mixed-response requirements

One response may contain all three question types.

The kiosk must:

- maintain question order
- save each answer against the correct question
- advance reliably
- handle refresh or retry safely where current architecture permits
- prevent invalid completion
- preserve the existing thank-you experience

### Accessibility and mobile requirements

- touch targets must work on phones and tablets
- keyboard support where applicable
- visible focus states
- screen-reader labels
- no horizontal overflow
- clear error and retry behavior
- no unnecessary audio playback for non-voice questions

### Stage acceptance checks

- Voice-only surveys remain functional.
- Mixed surveys complete successfully.
- Structured values save correctly.
- Voice answers still upload and process.
- Required-question validation works.
- Mobile browser verification passes.
- Existing kiosk links and token behavior remain intact.
- Focused kiosk and API tests pass.

---

## Stage 3 — Command Center Intelligence, Alerts, and Lightweight Action Tracking

### Objective

Use structured ratings and voice evidence together to strengthen the existing in-event Command Center.

This is the core differentiating stage.

### Live metrics

The canonical intelligence path should calculate:

- average rating
- recommendation average or distribution
- response count
- recent-period average
- direction of travel
- Event Area comparison
- question-level trend
- sample-size strength
- associated voice evidence

### Initial live alert conditions

Start with a small, understandable rule set:

#### Low score

A rating remains below an approved threshold with enough responses.

#### Meaningful decline

A recent rating window declines meaningfully against the preceding window or event baseline.

#### Repeated negative theme

Multiple recent voice responses reference the same operational issue.

#### Structured and voice agreement

A low or declining score is supported by related negative voice evidence.

#### Cross-area issue

The same issue appears across multiple Event Areas.

### Alert presentation

Each alert should show:

- clear issue title
- Event Area
- severity
- structured metric
- direction or change
- supporting response count
- recency
- sample-strength label
- related voice evidence
- clear action path

Example:

```txt
Registration wait times need attention

Average rating: 2.8
Previous period: 4.2
Supporting voice responses: 6
Signal strength: Directional

Review evidence
Acknowledge
```

### Lightweight action tracking

Do not build a project-management system.

Support:

- Acknowledge
- Assign owner
- Mark Acting
- Mark Resolved
- Add internal note
- Reopen when necessary
- Preserve supporting evidence
- Record timestamps and actor

Recommended status model:

```txt
NEW
ACKNOWLEDGED
ACTING
RESOLVED
DISMISSED
```

### Intervention monitoring

Where sufficient data exists, show whether the signal improved after action.

Example:

```txt
Issue acknowledged at 9:05 AM
Registration process changed at 9:20 AM
Average rating improved from 2.8 to 3.9
```

This should be labeled directionally when sample size is limited.

### Notification scope

The first version may support in-product alerts only.

External delivery such as email, SMS, Slack, or Teams can follow after the canonical alert system is stable.

### Stage acceptance checks

- Structured metrics derive from canonical answers.
- Voice evidence remains connected.
- Alerts are deterministic and explainable.
- Low-volume signals are labeled appropriately.
- Duplicate alert creation is prevented or reconciled.
- Action status changes persist.
- Server-side authorization and event scoping are enforced.
- Command Center drill-down shows supporting evidence.
- Existing voice-only signals remain functional.
- Focused service, route, component, and browser tests pass.

---

## Stage 4 — Fast Event Launch: Templates, Scheduling, and Deployment Kit

### Objective

Reduce setup time for smaller events while ensuring feedback arrives at the right moment for live action.

### Guided templates

Initial templates:

#### Overall Event Experience

Recommended pattern:

- 1–5 overall rating
- 0–10 return/recommendation question
- voice improvement question

#### Session / Speaker Feedback

Recommended pattern:

- content value rating
- speaker effectiveness rating
- voice comment

#### Sponsor / Exhibitor Feedback

Recommended pattern:

- activation or experience rating
- value/relevance rating
- voice comment

Templates may create or configure:

- Event Area
- Survey
- recommended questions
- default voice
- draft deployment link
- suggested availability

Templates must remain editable.

### Availability scheduling

Scheduling controls when the survey link accepts responses.

Initial choices:

```txt
Open immediately
Custom open and close times
Open relative to Event Area/session timing
```

Useful relative options:

- open at session start
- open 10 minutes before session end
- open at session end
- close after a selected duration

Examples:

```txt
Opening Keynote
Open: 10 minutes before session end
Close: 2 hours after session end
```

```txt
Registration
Open: registration start
Close: 30 minutes after registration ends
```

Scheduling matters because the Command Center needs feedback while the event team can still act.

### Deployment kit

Provide an event-level deployment package with:

- survey names
- Event Area labels
- QR codes
- public links
- copy actions
- bulk PNG download
- printable QR sheet
- basic signage layouts

The operator should not need to open every survey record individually.

### Deployment readiness

Show:

- surveys without Event Areas
- surveys not published
- missing or inactive public links
- schedule conflicts
- Event Areas without surveys
- QR readiness

### Stage acceptance checks

- Templates create valid editable surveys.
- Existing manual creation remains available.
- Scheduling opens and closes collection correctly.
- Time-zone behavior is deterministic.
- Closed surveys do not accept new responses.
- Existing responses remain readable after closure.
- Deployment kit uses existing public links and QR behavior.
- Bulk exports use real survey-specific links.
- Command Center still receives eligible live feedback.
- Mobile and desktop browser verification passes.

---

## Stage 5 — Post-Event Intelligence Brief and Final Hardening

### Objective

Create a post-event brief that reflects the complete live operational history and harden the full Phase 1 journey.

### Post-event brief structure

#### Executive summary

- overall event rating
- recommendation intent
- response volume
- coverage
- strongest positive theme
- highest-priority friction point

#### Event Area performance

- strongest Event Areas
- weakest Event Areas
- session comparisons
- insufficient-evidence areas

#### Live alerts and actions

- alerts raised
- severity
- evidence
- owner
- action taken
- status
- resolution time
- before/after movement where available

#### Voice evidence

- representative quotes
- transcript links
- playable evidence where permitted
- theme grouping

#### Recommendations

- changes for the next event
- unresolved operational issues
- repeated problems
- suggested survey improvements
- collection gaps

### Sample-size language

Every summary should communicate evidence strength.

Example rules:

```txt
Strong signal
Sufficient volume and consistent evidence

Directional signal
Useful pattern but limited sample

Limited evidence
Too few responses for a firm conclusion
```

Exact thresholds should be canonical, documented, and configurable later if necessary.

### Export and sharing

The first version should support at least one useful shareable format, such as:

- printable web brief
- PDF export
- shareable read-only link

Do not build several export systems at once.

### Final hardening

Validate the complete journey:

```txt
Create event
Create or select Event Areas
Apply template or build mixed survey
Publish and schedule
Generate QR deployment kit
Complete mixed kiosk responses
Process voice answers
Update live metrics
Trigger alert
Review evidence
Acknowledge and resolve
Generate post-event brief
```

### Final acceptance checks

- Full journey works with persisted data.
- Existing voice-only event journeys remain green.
- SMB journeys remain green.
- Migrations are safe and documented.
- Authorization and event/account scoping are correct.
- Empty, loading, error, and low-volume states are clear.
- Desktop and mobile layouts are verified.
- Typecheck and relevant builds pass.
- Focused tests pass.
- Known out-of-scope items are reported clearly.

---

# Recommended Product Release Shape

## Phase 1 initial sellable experience

A small event organizer should be able to:

1. create an event
2. select a guided template
3. confirm Event Areas
4. edit a small mixed-question survey
5. publish and schedule it
6. download the QR/signage kit
7. collect ratings and voice responses
8. receive live Command Center alerts
9. review supporting attendee evidence
10. acknowledge and resolve issues
11. receive a post-event intelligence brief

---

# Explicitly Deferred Capabilities

Do not include these in Phase 1 unless a stage discovers a hard dependency.

- advanced conditional logic
- matrix questions
- ranking questions
- complex survey piping
- attendee identity and segmentation
- registration-platform integrations
- Cvent, Swoogo, Bizzabo, or RainFocus import
- SMS/email campaign management
- advanced offline synchronization
- adaptive AI follow-up interviews
- enterprise SSO
- data residency controls
- cross-event benchmarking
- complex workflow automation
- full Slack or Teams integration
- portfolio-level reporting

These may become later phases after real customer use validates demand.

---

# Risks

## Product drift

The largest risk is becoming a generic survey tool.

Mitigation:

- every feature must strengthen live event intelligence
- Command Center implications must be defined in every stage
- voice evidence remains central

## Low response volume

Small events may produce small samples.

Mitigation:

- sample-strength labels
- minimum alert thresholds
- directional language
- clear coverage reporting
- no false statistical precision

## Alert noise

Poorly tuned rules may overwhelm the event team.

Mitigation:

- start with a small deterministic rule set
- require minimum evidence
- deduplicate related alerts
- allow acknowledge and dismiss
- show why each alert fired

## Shared SMB regressions

Some survey and kiosk components are shared.

Mitigation:

- use Events-only wrappers or type-aware additive behavior
- preserve current SMB defaults
- add focused regression tests

## Schema migration risk

Mixed answer types may require schema changes.

Mitigation:

- schema mode remains OPEN
- use production-safe additive migrations
- preserve all current voice data
- avoid destructive conversions
- test migration compatibility

---

# Success Measures

Phase 1 should be considered successful when early event customers can demonstrate:

### Setup

- useful event feedback launched in under 15 minutes
- minimal manual setup
- no survey-specialist knowledge required

### Collection

- attendees complete mixed rating and voice surveys reliably
- QR deployment works across key Event Areas
- completion rates remain acceptable

### Live value

- Command Center identifies a real issue during the event
- the team can review evidence quickly
- the alert is understandable and not noisy
- the team records an action before the event ends

### Post-event value

- the organizer receives a clear brief
- the brief connects scores, voice evidence, alerts, and actions
- the organizer can identify changes for the next event

---

# Implementation Loop Structure

Use the existing generic loop controller.

Required execution order:

```txt
Stage 1
Mixed-question foundation and builder

Stage 2
Mixed-response kiosk and collection

Stage 3
Command Center intelligence and action tracking

Stage 4
Templates, scheduling, and deployment kit

Stage 5
Post-event brief and final hardening
```

For each stage:

1. restate scope
2. identify exact files
3. inspect branch and dirty state
4. implement only the active stage
5. review against this brief
6. correct drift
7. run targeted tests
8. run typecheck/build where reasonable
9. browser-verify desktop and mobile
10. provide the required loop stop report
11. continue only when the active stage passes

---

# Final North Star

SignalThread should help an event team answer:

```txt
What is happening?
Where is the experience breaking?
What are attendees actually saying?
How confident are we?
Who needs to act?
Did the intervention help?
What should change next time?
```

The product is not merely collecting feedback.

It is turning live attendee signals into event action.
