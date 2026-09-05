# Fable Audit Brief — SignalThread Voice Events

## Purpose

Perform a product-excellence audit of the SignalThread Voice Events experience.

This is **not** just a bug hunt. The goal is to answer:

> How should a state-of-the-art voice survey and live event intelligence tool work before, during, and after an event — and what should SignalThread improve to become the best version of that product?

Use the provided screenshots and current-state product brief as the baseline for what exists today.

If new or materially improved workflows are needed, it is acceptable to recommend using Claude design to generate new product directions, screens, or interaction patterns before implementation.

---

## Product Positioning

SignalThread Events is an event intelligence product built around live attendee voice.

The product promise is:

> Live attendee voice → event signals → operational attention items → action while the event is still happening.

This should not feel like:
- a generic survey builder
- a retail/SMB reviews product
- a database admin surface
- a passive post-event reporting tool only

It should feel like:
- an event operations command product
- a live attendee intelligence layer
- a fast way to know what attendees are experiencing
- a way to create sponsor/session/area feedback value
- a system that helps event teams act before the event ends

---

## Current Built Surfaces to Audit

Use the screenshots as current built state.

### 1. Events Home — “Your events”

Purpose:
- Show live, upcoming, and past events.
- Highlight live events, response volume, satisfaction, and attention items.
- Route users into workspace, live dashboard, kiosk, and event creation.

Audit focus:
- Does this behave like a premium event command home?
- Is the live event card actionable enough?
- Are upcoming and past events valuable or too static?
- Are the metrics the right top-level indicators?
- Is “need action” connected clearly to the command center?

---

### 2. Create New Event

Purpose:
- Create the top-level event container.
- Capture event name, venue, dates, description, and event workspace.
- Let the user choose a starting template such as Conference, Expo/Trade Show, Workshop, Brand Activation, or Blank Event.

Audit focus:
- Can an event team set up quickly?
- Are templates valuable enough?
- Should templates generate better recommended event areas, surveys, questions, and QR launch kits?
- Does the flow feel like event setup or just form entry?
- Is there a better wizard/onboarding pattern?

---

### 3. Event Workspace Overview

Purpose:
- Central workspace for one event.
- Show live status, dates, venue, description, key metrics.
- Route to live dashboard, create survey, event settings.
- Show setup readiness, next best action, event structure summary.

Audit focus:
- Is this the right “home base” for an event operator?
- Does it clearly explain what is ready and what still needs work?
- Is the “next best action” strong enough?
- Should this page include a launch/preflight checklist?
- Should it recommend missing surveys/listening points?
- Does it bridge setup and live operations well?

---

### 4. Event Areas Tab

Purpose:
- Define where and when feedback can be collected.
- Includes event-wide, sessions, areas, sponsor activations, and custom touchpoints.
- Shows which areas have surveys attached and which need surveys.

Audit focus:
- Is “Event Areas” the right label?
- Is the concept understandable to an event team?
- Should these be called touchpoints, listening points, feedback points, or something else?
- Is attach-survey behavior clear?
- Are area categories right for real events?
- Is search/filtering useful enough?
- Should agenda import/session import exist?
- Should there be bulk creation from schedule or template?

---

### 5. Surveys Tab

Purpose:
- Show event surveys/listening points.
- Each survey has questions, QR, tokenized public URL, launch kiosk, edit, and archive.
- Each survey maps to an event target/area.

Audit focus:
- Is “Survey” the right user-facing term in Events mode?
- Should this be “Listening Points,” “Voice Checkpoints,” or “Event Pulses”?
- Is QR/link management strong enough for live events?
- Does the page help operators deploy QR codes in the venue?
- Should it generate signage kits?
- Should it show response health per survey?
- Should it show which surveys are underperforming or need placement changes?

---

### 6. Create Survey Flow

Purpose:
- Create a survey/listening point under an event.
- Attach it to an existing or new collection target.
- Capture survey name, description, target category/name/description.
- Add or generate questions.
- Choose survey voice and preview it.
- Create a tokenized kiosk link.

Current concern:
- This flow works but feels admin/form-builder-ish.
- It exposes internal model language like “survey target,” “collection target,” and “This creates a survey target, survey, questions...”

Audit focus:
- What would a state-of-the-art event voice setup flow call this?
- Should the flow ask:
  - Where are you collecting feedback?
  - What do you want to learn?
  - Who will scan this?
  - What QR/signage do you need?
  - What should the AI watch for?
- Should AI generation be more central?
- Should the user preview attendee experience before launch?
- Should target creation and survey creation be separated or simplified?
- Should the flow support quick templates like session feedback, registration pulse, sponsor booth feedback, meal area feedback, VIP reception feedback?

---

### 7. Command Center / Live Event Intelligence

Purpose:
- Live dashboard for operational event intelligence.
- Shows AI summary, urgency, satisfaction, priority mix, active attention, affected areas, issue cards, evidence, recommended actions, sponsor activation value, and intelligence layer.
- Right pane shows selected issue details/evidence.

Audit focus:
- Does this feel operator-grade?
- Are issue clusters actionable enough?
- Is evidence convincing and fast to review?
- Should staff be able to mark issues resolved?
- Should actions be assignable?
- Should there be alert routing?
- Should the command center distinguish:
  - immediate operational issues
  - soon-to-watch issues
  - positive signals
  - sponsor/exhibitor value
  - post-event insights
- Are filters sufficient?
- Should the dashboard support time windows, sessions, areas, sponsor activations, and attendee segments?
- Are “satisfaction” and “sentiment” presented correctly?
- Is the “copy summary/brief” behavior strong enough?

---

## Core Product Audit Questions

Answer these with specific recommendations.

### Before the Event

How should the product help an organizer get ready?

Evaluate whether SignalThread should support:
- event template selection that generates event structure
- AI-recommended listening map
- agenda/session import
- sponsor/exhibitor touchpoint setup
- QR/signage kit generation
- voice/question preview
- preflight readiness checklist
- “ready to launch” state
- team roles and who monitors feedback
- launch instructions for onsite staff

---

### During the Event

How should the product help an operator act live?

Evaluate whether SignalThread should support:
- live attention alerts
- issue assignment
- issue status: new, viewing, in progress, resolved, ignored
- action owner and notes
- Slack/email/SMS alerting later if appropriate
- event-area filtering
- evidence review
- real-time summaries
- positive signal detection
- sponsor activation signal tracking
- kiosk/QR health monitoring
- low-response warnings
- “what should I do next?” operator guidance

---

### After the Event

How should the product create value after wrap?

Evaluate whether SignalThread should support:
- post-event recap
- executive summary
- sponsor value report
- session feedback report
- exhibitor/sponsor activation insight
- quote/evidence library
- “what to improve next year”
- export/share reports
- compare events over time
- archive and learn from past events
- automatically generated client-ready PDFs or decks later

---

## Technical / Implementation Audit Questions

After product and UX opportunities, map them back to implementation.

Audit:
- Are Event, SurveyTarget, Survey, PublicSurveyLink, Response, Answer, Transcript, and Analysis wired consistently?
- Do tokenized survey links resolve the correct event/survey/target context?
- Do QR/kiosk flows preserve event/survey/target scope?
- Are dashboard metrics derived from the correct scoped data?
- Is demo data isolated from production behavior?
- Are there hardcoded demo values that should be clearly marked or replaced?
- Are route handlers thin enough?
- Is business logic centralized where it should be?
- Are old retail/SMB/Google review concepts leaking into event mode?
- Are there duplicate concepts that confuse the product?
- Are there security/account/event scoping risks?
- Are there stale or legacy paths that could break the event experience?

---

## UX / Content Audit Questions

Audit language and flow.

Look for:
- internal model language exposed to users
- “survey target” / “collection target” phrasing that should be simplified
- generic survey-builder language
- SMB/retail/reviews wording
- unclear event operator copy
- weak empty states
- hidden next actions
- confusing hierarchy
- duplicate actions
- destructive actions too prominent
- inconsistent typography/spacing
- screens that feel too admin-heavy instead of product-grade

Suggest better naming where appropriate, especially for:
- Survey
- Event Area
- Survey Target
- Collection Target
- Feedback Point
- Listening Point
- Command Center
- Live Event Intelligence

---

## Testing Audit Questions

Identify missing test coverage for:
- Events home actions
- create event flow
- event template selection
- workspace tabs
- event areas search/filter/attach survey
- create survey flow
- AI question generation trigger
- voice preview behavior
- QR/link/kiosk launch
- token-based response creation
- command center filtering
- issue selection/right pane behavior
- status changes
- responsive layout where practical
- protection against drawer/modal regressions
- old SMB/review language not appearing in Events mode

---

## Use of Claude Design

If the best recommendation requires a materially new or redesigned screen, explicitly say so.

For those cases, provide:
- why current UX is insufficient
- what new workflow/screen should exist
- what Claude should be asked to design
- what inputs Claude needs
- what acceptance criteria the design should meet

Example:
> Use Claude design to explore a new Create Listening Point flow that combines target selection, AI question generation, QR kit preview, and launch readiness into a simpler event-native setup experience.

Do not use Claude design as a substitute for identifying product requirements. Use it after clearly defining what the improved workflow must accomplish.

---

## Output Format Required

Return the audit in this structure.

### 1. Executive Summary

Include:
- what is already strong
- what is most risky
- what would most improve product quality
- what should be fixed before adding more features

### 2. Current Product Map

Summarize the existing surfaces:
- surface
- purpose
- core actions
- current maturity
- main improvement opportunity

### 3. State-of-the-Art Opportunity Map

Organize by:
- before event
- during event
- after event

For each:
- ideal capability
- current support level
- gap
- recommendation

### 4. Prioritized Gap Table

Columns:
- Priority: P0 / P1 / P2
- Area
- Gap
- Why it matters
- Product recommendation
- Technical implication
- Likely files involved
- Test coverage needed
- Whether Claude design is recommended

Priority definitions:
- P0: blocks product trust, live operation, data correctness, capture, QR/kiosk, or event-scoped intelligence
- P1: major product-quality or operator-value improvement
- P2: polish, nice-to-have, future enhancement

### 5. Recommended Implementation Prompt List

For each prompt:
- prompt name
- goal
- priority
- type: UI-only / backend-only / full-flow / test-only / design-first
- likely files touched
- dependencies
- acceptance checks

### 6. Do-Not-Touch List

List flows that should not be changed unless explicitly required:
- existing kiosk capture
- answer upload
- transcription
- analysis pipeline
- public QR/token links
- existing event/survey data model
- event dashboard calculations unless the audit identifies a real scoped-data issue
- auth/account scoping unless the prompt is specifically about that

### 7. Verification Plan

Provide:
- focused tests per area
- typecheck/build commands
- final regression command plan
- manual QA checklist for the screenshots and flows

---

## Audit Rules

- Audit only. Do not change files.
- Be specific and product-minded.
- Think like a world-class event product designer, onsite operator, and senior engineer.
- Do not recommend creating a second event system.
- Do not recommend creating a second kiosk pipeline.
- Preserve working capture/transcription/analysis behavior.
- Separate true bugs from product improvements.
- Tie recommendations back to actual files whenever possible.
- Do not invent features without explaining the user/operator value.
- Do not over-index on generic survey software. This is event voice intelligence.
