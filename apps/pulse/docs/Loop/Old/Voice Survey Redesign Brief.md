# Voice for Events — Total Redesign Implementation Brief

**Document status:** Canonical implementation plan  
**Prepared:** July 30, 2026  
**Repository:** Voice / Booth Audio (`/Users/ali/Documents/Booth Audio`)  
**Production reference:** `https://voice.signalthread.ai/app?account=events-demo`  
**Primary demo event:** Live Experience Summit 2026  
**Implementation mode:** Controlled multi-prompt build loop  
**Schema mode:** `OPEN`, but production-safe and non-destructive only

---

## 1. Purpose of This Document

This brief is the permanent product and architecture source of truth for the total redesign of the Voice for Events experience.

The redesign includes:

- the account-level Events experience
- the permanent event workspace shell
- Setup
- Agenda
- session and speaker management
- agenda upload/import
- Event Areas and listening-plan setup
- all five Signals tabs
- pre-event, in-event, and post-event lifecycle experiences
- evidence review
- operational tasking
- the Actions page
- assignment email
- mobile web My Actions
- action history and updates
- final cross-workspace hardening

This is not a single visual refresh. It is a connected product rebuild that must turn the existing Voice survey and evidence foundation into a coherent event-intelligence workflow.

The implementation must proceed through narrow, dependency-aware prompts. Do not attempt the entire redesign in one change.

---

## 2. Required Companion Materials

Every implementation agent must receive and read the following materials before editing code.

### 2.1 This brief

`VOICE_EVENTS_TOTAL_REDESIGN_IMPLEMENTATION_BRIEF.md`

This document defines:

- product intent
- target information architecture
- canonical architecture decisions
- locked terminology
- required user behavior
- implementation sequence
- acceptance expectations
- non-negotiable constraints

This brief is the primary authority for what the finished product must do.

### 2.2 The completed repository audit

Current file: `Pasted text.txt`  
Recommended repository name: `VOICE_EVENTS_CURRENT_STATE_AUDIT.md`

The audit defines:

- what currently exists in code
- exact current routes
- exact components and services
- canonical current models
- confirmed gaps
- security inconsistencies
- current test coverage
- likely files for each implementation area

The audit is the primary authority for current code reality.

### 2.3 The HTML prototype

`Event Workspace Redesign Voice Events (1).html`

**The implementation agent must receive this HTML file.**

The HTML is a required visual and interaction reference for:

- the permanent dark left navigation
- Signals page hierarchy
- lifecycle presentation
- Overview
- Intelligence
- Sessions
- Speakers
- Actions
- evidence interaction
- assignment interaction
- mobile action concepts
- post-event closing-brief direction

However, the HTML is **not** authoritative for:

- current backend behavior
- current data availability
- schema design
- production routes
- persistence
- authorization
- idempotency
- email delivery
- import processing
- whether a feature already exists

The HTML contains hard-coded and simulated client state. It demonstrates intended UX, not production implementation.

The agent must never treat a working interaction in the HTML as proof that the production app already has the required model, service, route, or persisted state.

The uploaded HTML is mainly a Signals/dashboard reference. The agenda upload/import flow is governed by this brief and the earlier handoff because the uploaded HTML does not contain the full importer implementation.

### 2.4 The earlier design handoff

`Voice Events Build Loop Handoff.md`

This file contains the full design history and product decisions behind:

- lifecycle-aware Signals
- post-event closing brief
- agenda importer
- Agenda, Sessions, and Speakers
- listening-plan connection
- assignment email
- mobile My Actions
- evidence traceability
- coverage rules

This brief supersedes that handoff where the audit revealed new architectural facts, but the handoff remains useful design context.

### 2.5 Engineering and loop standards

Recommended companion files:

- `ENGINEERING_STANDARDS.md`
- `GENERIC_PROMPT_LOOP_CONTROLLER.md`
- the future `VOICE_EVENTS_BUILD_PROMPTS.md`

The loop controller governs execution.  
This brief governs product and architecture.  
The prompt file governs the active implementation slice.

---

## 3. Source-of-Truth Hierarchy

When materials disagree, use this order:

1. **This implementation brief**
   - target product behavior
   - locked architecture decisions
   - implementation order

2. **Current-state repository audit**
   - what exists now
   - exact code paths
   - confirmed technical constraints

3. **Active implementation prompt**
   - scope of the current slice
   - exact acceptance checks

4. **HTML prototype**
   - visual hierarchy
   - interaction intent
   - layout reference

5. **Earlier handoff and screenshots**
   - design history
   - context
   - examples

A prompt may refine implementation details, but it may not contradict the product rules in this brief.

The HTML may guide visual execution, but it may not override canonical models, access control, persistence, or evidence rules.

---

## 4. Product Definition

Voice for Events is a voice survey and event-intelligence product.

Its core promise is:

> Planners choose where to listen, attendees and staff leave voice feedback, SignalThread turns those responses into evidence-backed findings, and the team can act during the event or carry learning into the next one.

The product is not:

- a generic survey-builder skin
- a live event telemetry platform
- an incident-monitoring system
- a second planner operations platform
- a session-registration platform
- a speaker-ranking system
- a fake real-time command center
- a dashboard made from hard-coded demo values

Voice only knows what people intentionally submit through surveys and what can be responsibly derived from those responses.

Valid operational findings may include:

- registration feels slow
- lunch flow is backing up
- attendees repeatedly praise workshops
- selected sessions are underrepresented
- a venue area is generating repeated navigation confusion
- staff consistently report one operational friction point

Invalid system-style findings include:

- a speaker microphone is cutting out without submitted feedback
- a room is over capacity based on nonexistent sensor data
- AV has failed unless people actually reported it
- queue length values that the product did not measure
- real-time technical alerts invented from no evidence

---

## 5. The Connected Product Workflow

The final product must support this end-to-end workflow:

```text
Account event
→ event setup
→ agenda structure
→ sessions and speakers
→ selected listening points
→ attached or reusable surveys
→ public links, QR, kiosk, and availability
→ attendee and staff responses
→ transcripts and analysis
→ normalized evidence
→ event, session, and speaker findings
→ informational learning, current-event action, after-event follow-up, or next-event learning
→ assigned task
→ email handoff
→ desktop and mobile updates
→ post-event closing brief
```

Every major screen must participate in this one workflow.

The redesign fails if it produces attractive but disconnected surfaces.

Examples of unacceptable disconnection:

- an imported session that never appears in Setup
- a session listed in Signals with no path back to its listening setup
- an action assigned in Signals that does not appear in My Actions
- an email deep link that opens a different or duplicated action record
- an evidence card that opens an old dashboard
- a speaker finding with no speaker-specific evidence
- a post-event brief that ignores unresolved actions
- Setup and Signals showing different counts for the same session or survey

---

## 6. Confirmed Current State

The repository audit confirmed the following current implementation.

### 6.1 Current account and event surfaces

Current routes include:

- `/app?account={slug}` — Events home
- `/app/events/[eventId]?account={slug}` — Setup workspace
- `/app/events/[eventId]/dashboard?account={slug}` — current Command Center / Signals equivalent
- `/app/events/[eventId]/surveys/new?account={slug}` — event survey creation
- `/app/events/[eventId]/edit?survey={surveyId}&account={slug}` — survey editing
- `/kiosk?token={token}` — canonical public event survey
- `/kiosk?eventId={eventId}` — legacy compatibility path
- `/print/event-signage` — printable signage

### 6.2 Current Setup workspace

Current Setup tabs are:

- Overview
- Survey Focus
- Surveys
- Operations

`Survey Focus` is currently a UI over `EventStructureItem`, including `SESSION` and other kinds.

Current tab state is partly local-only and does not consistently update the URL.

### 6.3 Current Command Center

The current Command Center already has useful reusable behavior:

- event-level summary
- analysis and timeline loading
- normalized intelligence
- Needs Attention queue
- selected issue detail
- evidence
- owner assignment
- notes
- status workflow
- sponsor activation summary
- intelligence cards
- responsive stacking

Current issue workflow is based on `EventIssueCluster`.

Current statuses include:

- `NEW`
- `ACKNOWLEDGED`
- `ACTING`
- `RESOLVED`
- `DISMISSED`

The current product does not yet have:

- a permanent Signals shell
- a separate Intelligence tab
- a Sessions Signals tab
- a Speakers Signals tab
- a canonical Actions tab
- a mobile My Actions experience
- assignment email delivery
- action update history
- pre-event Signals
- a distinct post-event closing brief

### 6.4 Current upload/import state

There is no agenda upload/import implementation.

The repository currently has no production flow for:

- CSV upload
- XLSX upload
- worksheet selection
- column mapping
- import preview
- row validation
- duplicate resolution
- conflict decisions
- import confirmation
- import jobs
- import rows
- import completion results

Manual event structure creation exists through `EventStructureItem`.

### 6.5 Current canonical data foundation

Confirmed reusable models and systems include:

- `Account`
- `Location`
- `Event`
- `EventStructureItem`
- `SurveyTarget`
- `Survey`
- `PublicSurveyLink`
- `Question`
- `Response`
- `Answer`
- `AnswerTranscript`
- `AnswerAnalysis`
- normalized event intelligence models
- `EventIssueCluster`
- `EventIssueEvidence`
- `EventAlertNote`
- existing QR and signage systems
- existing token and legacy kiosk compatibility
- existing transcription and analysis pipeline

### 6.6 Confirmed missing domain models

The audit confirmed no canonical current model for:

- speaker/profile
- session-speaker assignment
- speaker role and ordering
- optional session segments
- import job
- import row
- upload metadata
- import conflict/decision
- canonical action assignment history
- immutable action update history
- notification/email delivery and retry
- post-event closing brief persistence

### 6.7 Confirmed security inconsistency

Some Events routes use a strong account membership and event access guard.

Other existing event routes currently authenticate or scope less consistently.

Before adding new agenda, speaker, import, action, or notification routes, Events authorization must be normalized.

---

## 7. Locked Canonical Architecture

### 7.1 Existing Event remains the event

Do not create a second event system.

`Event` remains the top-level event container.

### 7.2 EventStructureItem remains the event-structure authority

`EventStructureItem` is the canonical model for event structure and already supports `SESSION`.

The agenda implementation must use `EventStructureItem` for session structure rather than introducing an unrelated second agenda/session model.

The legacy recording model named `Session` must never be repurposed as an agenda session.

### 7.3 SurveyTarget remains the explicit listening-point layer

Agenda structure and listening points are not the same thing.

A session may exist in the agenda without being selected for Voice collection.

The relationship must remain:

```text
EventStructureItem
→ optional SurveyTarget
→ Survey
→ PublicSurveyLink
→ Response
→ Answer
```

An imported agenda with 48 sessions must not automatically create:

- 48 SurveyTargets
- 48 surveys
- 48 QR codes
- 48 coverage gaps
- 48 session findings

### 7.4 Existing survey and kiosk systems remain canonical

Reuse:

- `Survey`
- `PublicSurveyLink`
- `Question`
- `Response`
- `Answer`
- `AnswerTranscript`
- `AnswerAnalysis`
- token-based kiosk launch
- legacy eventId compatibility
- QR
- signage
- TTS
- answer upload
- transcription
- analysis

Do not create a second survey, kiosk, answer, transcript, evidence, or QR flow.

### 7.5 Existing evidence system must be extended, not duplicated

Reuse normalized evidence and existing evidence-detail interaction.

Session, speaker, and action detail must link to evidence through canonical provenance.

Do not create an unrelated evidence table or a second evidence drawer for the redesign.

### 7.6 Current issue workflow is the starting point for tasking

`EventIssueCluster` currently carries operational status, ownership, evidence, and notes.

`AnswerEventAction` is extracted intelligence output and is not the final operational task system.

Before the action backend prompt, the implementation must explicitly choose one of these safe directions:

1. extend/promote `EventIssueCluster` into the canonical actionable record, or
2. create one canonical `EventAction` model that is linked cleanly to findings and replaces operational duplication

The implementation must not create a third uncoordinated action family.

The final chosen action record must support:

- ownership
- due date
- status
- action classification
- linked evidence
- updates
- immutable history
- notification delivery
- desktop and mobile access

### 7.7 Speaker records must be canonical

Do not store the final speaker domain only inside `EventStructureItem.metadata`.

Do not use extracted named entities as agenda speaker profiles.

Add a canonical event/account-scoped speaker profile and canonical session-speaker join.

### 7.8 Import state must be durable

Do not make the browser the authority for import state.

The final importer requires durable server-side concepts for:

- import job/batch
- uploaded file identity or metadata
- worksheet selection
- source-row identity
- normalized row payload
- validation result
- duplicate/conflict classification
- user decision
- confirmation result
- imported record links
- failure summary
- retry/idempotency state

---

## 8. Permanent Information Architecture

### 8.1 Left product navigation

The permanent dark left rail contains:

- **Events**
- **Setup**
- **Signals**
- **Settings** at the bottom

Rules:

- Events returns to the account-level event browser.
- Setup owns event configuration and collection planning.
- Signals owns intelligence, evidence, findings, actions, and lifecycle views.
- Settings remains account/product settings.
- selected account and event context must be preserved
- the rail must work at desktop and mobile widths
- do not duplicate event headers inside each route
- do not turn Setup and Signals into separate disconnected applications

### 8.2 Setup navigation

Setup tabs become:

- **Overview**
- **Event Areas**
- **Agenda**
- **Surveys**
- **Operations**

Inside Agenda:

- **Sessions**
- **Speakers**

`Agenda` is the top-level label.

`Sessions` remains available as an Event Area/target category where appropriate, but agenda sessions are managed inside Agenda.

### 8.3 Signals navigation

Signals tabs remain:

- **Overview**
- **Intelligence**
- **Sessions**
- **Speakers**
- **Actions**

The selected tab must be represented in navigable URL state.

Refresh, deep linking, browser history, and email links must not lose the selected event or account.

---

## 9. Shared Event Workspace Shell

The shared event workspace shell is the first visible implementation slice.

It must provide:

- one event identity header
- one lifecycle/status presentation
- one selected account
- one selected event
- left navigation
- shared responsive behavior
- preserved eventId and account query/context
- Setup and Signals route integration
- active state
- loading/error behavior
- safe return to Events

It must not:

- duplicate the event name at multiple levels
- add a second header inside every tab
- replace working Setup content before the later prompts
- replace working Command Center content before the later prompts
- change SMB pages
- create fake lifecycle behavior

---

## 10. Lifecycle Model

Signals supports three product phases:

- pre-event
- in-event
- post-event

These are views of one event, not separate products.

Lifecycle derivation must use a canonical server-side rule based on:

- Event status
- start/end dates
- event timezone once supported
- explicit completion/archive rules
- survey collection state where relevant

Do not scatter lifecycle checks across components.

### 10.1 Pre-event

Pre-event Signals answers:

- Are we ready to listen?
- Where have we chosen to collect feedback?
- What is not configured?
- Which surveys are ready?
- Which selected agenda sessions still need a survey or public link?
- Is the event ready to launch?

Pre-event does not invent findings before responses exist.

Expected pre-event content may include:

- listening-plan coverage
- survey readiness
- public link availability
- QR/signage readiness
- agenda completeness
- selected sessions needing setup
- speaker-specific collection readiness
- no-response empty states
- operational setup warnings

### 10.2 In-event

In-event Signals answers:

- What is happening now?
- What needs review?
- What is working?
- What should the team act on?
- Where is evidence still weak?
- What should be kept, improved now, or revisited next time?

Expected information architecture:

- event overview
- what needs review
- what is working
- coverage and confidence
- open follow-up
- Keep
- Improve during this event
- Revisit next event

The experience should remain scannable and evidence-led.

### 10.3 Post-event

Post-event must look and behave like a closing brief, not a renamed live dashboard.

Required structure:

1. **Closing summary**
   - overall outcome
   - sentiment
   - response volume
   - listening-point coverage
   - concise synthesized assessment

2. **Event verdict**
   - What worked
   - What created friction
   - What should change next time

3. **Key findings**
   - curated conclusions
   - evidence strength
   - mentions/sources
   - evidence drill-down

4. **Decisions and follow-through**
   - unresolved actions
   - owners
   - status
   - due dates
   - after-event follow-up
   - awaiting ownership

5. **Supporting evidence**
   - coverage
   - confidence
   - quotes
   - sessions
   - speakers
   - listening-point detail

6. **Generate/share closing brief**
   - package the page for leadership
   - preserve linked evidence and unresolved work
   - do not present it as a disconnected marketing card

---

## 11. Setup Overview

Setup Overview is the readiness hub for the event.

It must show connected readiness stages, including:

- event details
- Event Areas/listening plan
- Agenda & sessions
- Surveys
- public links/QR/signage
- Operations
- collection readiness

### 11.1 Agenda readiness row

The Agenda & sessions row supports states such as:

- Not started
- Import in progress
- Needs review
- Ready

Action changes by state:

- Import agenda
- Review import
- Manage agenda

Readiness totals must be derived.

Do not leave a hard-coded value such as `5 / 5 ready` after adding a new stage.

### 11.2 Cross-navigation

A readiness problem must open the relevant workspace.

Examples:

- missing agenda → Agenda import
- unresolved import rows → import review
- selected listening point without survey → Event Areas/listening setup
- inactive survey → Surveys
- unavailable public link → Operations/deployment

---

## 12. Agenda Workspace

### 12.1 Agenda landing summary

Expected concise summaries include:

- total sessions
- event days
- room count
- track count
- linked speakers
- sessions needing review

Reference demo values:

- 48 sessions
- 2 event days

Counts must derive from canonical records.

### 12.2 Sessions list

Required behavior:

- search
- day filter
- room filter
- track filter
- format filter
- completeness/review filter
- chronological sorting
- bulk selection where needed

Session rows include:

- title
- date
- time
- room
- track
- format
- assigned speakers
- completeness/review state
- compact listening state once the listening-plan prompt is complete

### 12.3 Session detail

Required fields:

- title
- description
- start date/time
- end date/time
- room
- track
- format
- external/source ID
- capacity
- tags
- assigned speakers
- speaker roles
- listening setup summary
- related survey
- link to Signals when represented

Validation includes:

- missing required details
- invalid date/time
- end before start
- room overlap
- duplicate external ID
- possible duplicate session

### 12.4 Session deletion

Delete behavior must be explicit and safe.

Deleting or archiving a session must account for:

- linked speaker assignments
- linked SurveyTarget
- linked survey history
- existing responses
- evidence
- actions

A session with historical collection cannot be silently hard-deleted.

Removing a session from the listening plan is not the same as deleting the session.

### 12.5 Live-event editing

The event may already be active.

Legitimate schedule corrections must remain possible.

Meaningful live-event changes should receive a lightweight confirmation and preserve historical evidence context.

---

## 13. Speaker Architecture and Workspace

### 13.1 Canonical speaker profile

The speaker model must support:

- account or event scope according to the final identity decision
- name
- title
- organization
- email
- phone
- biography
- headshot/asset state
- normalized matching fields
- active/archive state
- timestamps

The schema prompt must decide whether a speaker can be reused across events inside one account.

Recommended direction:

- account-scoped canonical speaker profile
- event-specific assignment through session joins
- event-specific data may be stored in assignment metadata only when truly event-specific

### 13.2 Session-speaker assignment

The canonical join must support:

- session structure item
- speaker
- role
- display/order position
- optional segment association later
- timestamps
- uniqueness rules preventing accidental duplicate assignments

Speaker roles include:

- Speaker
- Moderator
- Host
- Panelist

A session may have:

- one speaker
- multiple speakers
- moderator and panelists
- host
- no speaker

Breaks, meals, and networking do not require a speaker.

### 13.3 Speakers list

Rows include:

- name
- title
- organization
- email where available
- assigned-session count
- profile completeness
- possible-duplicate state

Filters include:

- All
- Complete
- Missing details
- Unassigned
- Possible duplicates

### 13.4 Speaker detail

Required behavior:

- edit profile fields
- view assigned sessions
- view role by session
- add assignment
- remove assignment
- merge/reconcile duplicate when allowed
- delete/archive safely

Deleting a speaker must not delete sessions.

### 13.5 Speaker reconciliation

Imported values may be resolved by:

- Link to existing speaker
- Create new speaker
- Keep separate
- Merge duplicate profiles
- Ignore imported value

Never silently merge speaker records.

---

## 14. Agenda Importer

### 14.1 Entry points

Setup supports:

- Import agenda
- Add sessions manually

### 14.2 Supported files

- CSV
- XLSX

The implementation may add a parsing dependency, but it must be actively maintained and appropriate for server-side validation.

### 14.3 Full flow

1. Choose upload or manual entry.
2. Upload a file.
3. Inspect workbook/file metadata.
4. Select worksheet when needed.
5. Map source columns.
6. Normalize rows.
7. Validate rows.
8. Classify duplicates/conflicts.
9. Review and resolve decisions.
10. Confirm import.
11. Execute an atomic or explicitly resumable import.
12. Display completion results.
13. Open imported sessions.
14. Preserve import history for traceability.

### 14.4 Mapping fields

Required:

- Session title
- Start date
- Start time
- End time

Optional:

- End date
- External/session ID
- Description
- Room
- Track
- Format
- Speaker names
- Speaker emails
- Capacity
- Tags

The mapper should support:

- auto-detected likely mappings
- explicit user override
- unmapped optional columns
- preview of normalized values
- date/time format recognition
- per-column errors

### 14.5 Row states

Required row states:

- Ready
- Needs review
- Duplicate
- Missing required information
- Invalid date/time
- End time before start time
- Possible overlap
- Existing-session match

Additional useful server states may include:

- Invalid capacity
- Unknown format
- Ambiguous speaker match
- Invalid email
- Unsupported date format
- Empty row ignored

### 14.6 Duplicate/conflict decisions

Per-row decisions include:

- Skip uploaded row
- Replace existing session
- Keep both
- Review details

Speaker decisions include:

- Link existing
- Create new
- Keep separate
- Merge
- Ignore

No current event data may be silently overwritten.

### 14.7 Idempotency

The importer must be safe to retry.

At minimum, it must use:

- import job identity
- source file identity/checksum
- worksheet identity
- source row number or stable row key
- external session ID when supplied
- server-side confirmation token or idempotency key
- transaction or resumable result tracking

Refreshing the confirmation screen must not create duplicate sessions.

### 14.8 Partial failure

The product must choose and expose one of these explicit behaviors:

- atomic all-or-nothing confirmation, or
- resumable import with durable per-row success/failure

Do not silently return success after partial writes.

### 14.9 Post-import result

Results must show:

- imported count
- skipped count
- updated count
- duplicate count
- failed count
- speaker matches/created
- sessions still needing review
- link to imported Sessions list
- link to unresolved rows

---

## 15. Event Areas and Listening Plan

### 15.1 Core distinction

- **Agenda session:** every scheduled session
- **Session listening point:** a deliberately selected session target
- **Survey:** questions attached to one or more targets
- **Session intelligence:** only produced when evidence is sufficient

### 15.2 Listening states

Session rows/details gain compact Voice listening states:

- Not selected for listening
- Needs survey
- Survey attached
- Ready to collect
- Collecting
- Low response
- Represented
- Closed

### 15.3 Session listening actions

- Add as listening point
- Attach existing survey
- Create survey
- Manage listening setup
- Remove from listening plan
- View in Signals

Removing a session from the listening plan must not delete:

- the agenda session
- survey history
- responses
- evidence
- historical findings

### 15.4 Bulk setup

Selected sessions may be used to:

- create listening points
- attach one reusable survey
- create a new survey
- schedule availability
- remove from the listening plan

One survey may serve multiple session targets while every response preserves the correct target context.

### 15.5 Coverage definitions

#### Listening-plan coverage

How much of the agenda did the planner choose to listen to?

Example:

```text
4 of 48 sessions selected for listening
```

The other 44 are not failures.

#### Evidence coverage

Of the selected listening points, how many produced enough evidence?

Example:

```text
3 of 4 selected sessions represented
```

Do not use all 48 agenda sessions as the evidence denominator.

### 15.6 Existing demo counts

Reference values:

- 48 agenda sessions
- 14 total feedback points
- 4 session listening points
- 5 surveys

These values are a demo consistency target, not permission to hard-code production UI.

---

## 16. Signals Overview Tab

The Overview tab is the lifecycle-aware top-level event dashboard.

### 16.1 In-event Overview

Expected sections:

- event overview
- what needs review
- what is working
- coverage and confidence
- open follow-up
- Keep
- Improve during this event
- Revisit next event

The current Command Center functionality should be preserved and reorganized, not discarded.

Reusable current behavior includes:

- Needs Attention
- selected issue detail
- evidence
- owner
- notes
- status changes
- sponsor value
- intelligence cards
- filters

### 16.2 Filters

Filters should not stack redundantly.

Use one clear filter model for:

- survey
- Event Area/listening point
- evidence coverage
- lifecycle or status where relevant

Rules:

- active filter state must be visible
- filters can be cleared
- changing one filter must not unexpectedly reset unrelated filters
- selected evidence/detail must clear if it no longer belongs to the filtered result
- do not show duplicate sets of filters in the header and content

### 16.3 Counts

No repeated stale number should appear across unrelated cards.

All totals must derive from one payload or one consistent canonical aggregation layer.

---

## 17. Signals Intelligence Tab

The Intelligence tab owns evidence-backed findings beyond the operational Overview.

Expected sections may include:

- themes
- emerging signals
- opportunities
- cross-response patterns
- positive intelligence
- risks/friction
- learning classifications
- evidence strength
- supporting quotes

Do not duplicate the Needs Attention queue here.

Every intelligence card must:

- identify its evidence strength
- show source count/response count
- support evidence drill-down
- avoid conclusions from insufficient evidence
- classify whether it is:
  - informational
  - current-event action
  - after-event follow-up
  - next-event learning

The existing evidence drawer/detail interaction should be reused.

---

## 18. Signals Sessions Tab

The Sessions tab connects agenda structure to Voice evidence.

### 18.1 Required views/states

Distinguish:

- all agenda sessions
- selected for listening
- represented
- underrepresented
- needs review
- not selected

Examples:

- `47 responses · Strong evidence`
- `6 responses · Not enough evidence yet`
- `Not selected for listening`

Do not show invented sentiment for insufficient evidence.

### 18.2 Session intelligence detail

Detail connects:

- agenda context
- room/time/track
- assigned speakers
- listening setup
- attached survey
- collection status
- findings
- evidence
- actions
- next-event learning
- Setup link
- survey link

### 18.3 Attribution

Session findings must be linked through canonical target and response provenance.

Do not rely on title-string matching as the authority.

---

## 19. Signals Speakers Tab

The Speakers tab uses real agenda speaker profiles and real session assignments.

It may show:

- name
- title/organization
- sessions
- speaker-specific response volume
- supported finding
- confidence
- whether speaker-specific feedback was collected

Valid examples:

- Practical examples were praised across two sessions.
- Strong delivery feedback from 31 speaker-specific responses.
- Speaker-specific feedback was not collected.

Do not create:

- speaker leaderboard
- rank ordering
- comparison of non-comparable response sets
- speaker findings from generic logistics feedback
- speaker findings from session feedback that did not explicitly concern the speaker

Speaker intelligence requires properly scoped evidence, such as:

- speaker-specific questions
- named-speaker questions
- response context explicitly tied to speaker and session

---

## 20. Evidence Traceability

Every finding must trace to the correct:

- account
- event
- EventStructureItem
- SurveyTarget
- Survey
- PublicSurveyLink where relevant
- Question
- Response
- Answer
- transcript or written answer
- session
- speaker when explicitly supported
- event phase
- quote
- action when created

Evidence links must remain valid across:

- Overview
- Intelligence
- Sessions
- Speakers
- Actions
- mobile action detail
- post-event brief

Do not copy evidence text into disconnected records without provenance.

---

## 21. Tasking and Actions

Tasking is a first-class product area, not a label on an issue card.

### 21.1 Canonical action capabilities

The final action/task record must support:

- event
- account
- source finding/cluster
- linked evidence
- title
- summary
- classification
- priority
- status
- owner
- assigned by
- assigned at
- due date
- blocked reason
- completion state
- resolution
- created/updated timestamps
- immutable history
- written updates
- voice updates
- notification delivery state

### 21.2 Action classifications

Keep these outcomes distinct:

- During this event
- After-event follow-up
- Next-event learning
- Informational, no action required

Informational findings do not automatically become tasks.

Positive intelligence does not automatically become a task.

### 21.3 Status workflow

The final product should use one clear action workflow.

Recommended action statuses:

- Unassigned
- Open
- Working
- Blocked
- Complete
- Dismissed or Cancelled where needed

Reopen behavior must be explicit.

The final prompt may map existing cluster statuses into this model, but desktop and mobile must show the same canonical status.

### 21.4 Actions tab

The desktop Actions tab should support:

- My actions
- All actions
- Unassigned
- Working
- Blocked
- Complete
- after-event follow-up
- next-event learning
- search/filter/sort
- owner
- priority
- due date
- linked finding
- action detail
- assignment/reassignment
- updates
- history
- evidence
- status changes

### 21.5 Action detail

Required detail:

- action identity
- status
- owner
- due date
- priority
- source intelligence
- linked evidence
- update composer
- voice update
- update history
- assignment history
- notification state
- reopen/complete/block controls
- return to Actions/My Actions

---

## 22. Assignment Email and Notification Delivery

Assignment is a real handoff.

Required flow:

1. Assign or reassign an action.
2. Persist through one canonical server-side assignment mutation.
3. Record assignment history.
4. Create a durable notification delivery record.
5. Send the new owner one email.
6. Deep-link to responsive action detail.
7. Show the action in My Actions.
8. Keep desktop and mobile synchronized.

### 22.1 Required behavior

- initial assignment sends one email
- reassignment sends one email to the new owner
- saving the same owner again sends no duplicate
- retried requests are idempotent
- email failure does not roll back assignment
- failed delivery shows `Email not sent`
- failed delivery supports Retry
- cross-account assignees are rejected
- inactive users are rejected according to account rules
- delivery state is visible in action history/detail

### 22.2 Notification record

The final schema should support:

- action
- recipient user/email
- notification type
- idempotency key
- provider
- attempt count
- status
- provider message ID where available
- last attempted at
- delivered/sent at
- failure code/message
- retry relationship or history

Do not infer email delivery from the action’s `updatedAt`.

---

## 23. Mobile Web My Actions

This is responsive web, not a native app.

The mobile experience must use:

- the same action records
- the same assignment mutation
- the same status mutation
- the same updates
- the same history
- the same evidence

### 23.1 My Actions list

Mobile list supports:

- assigned to me
- due/overdue
- working
- blocked
- complete
- event context
- priority
- quick status
- deep link from email

### 23.2 Mobile action detail

Required:

- mark complete
- mark blocked
- return to working
- reopen when allowed
- written update
- voice update
- update history
- linked evidence
- assignment and due date
- return to My Actions

### 23.3 Voice updates

Voice updates must use a deliberate product path.

Do not casually overload attendee `Answer` records if that would mix internal team updates with attendee survey evidence.

The action schema prompt must decide whether voice updates use:

- a dedicated action update audio model with existing object storage/transcription helpers, or
- a safely scoped reusable media/transcription abstraction

Internal updates must never appear as attendee feedback.

---

## 24. Post-Event Closing Brief

The closing brief is the final event-level leadership view.

It must:

- summarize the event
- preserve evidence links
- show what worked
- show friction
- show next-event learning
- include unresolved follow-up
- include owners and deadlines
- distinguish evidence confidence
- connect to Sessions and Speakers
- support share/generate behavior

It must not:

- be a static marketing card
- ignore tasking
- flatten all findings into one list
- repeat the live dashboard with different copy
- invent certainty
- lose evidence provenance

---

## 25. Authorization and Tenancy

Authorization hardening is Prompt 0 and a prerequisite for all new routes.

Every Events read/write route must enforce:

- authenticated user
- active account membership
- correct Events product mode
- event belonging to the account
- role/permission appropriate to the operation
- session/speaker/import/action record belonging to the event/account

Do not rely on:

- account slug alone
- eventId alone
- hidden UI
- client-selected account
- generic authentication without membership validation

Routes should reuse or extend the existing strong Events access helper.

New import and action mutations must not copy weaker legacy route patterns.

---

## 26. Engineering Standards

Every prompt must follow these standards.

### 26.1 Single source of truth

Critical state belongs in one canonical server-side path.

### 26.2 Thin routes

Routes should:

- authenticate
- authorize
- validate
- call service/helper
- return structured result

### 26.3 Idempotent writes

Required especially for:

- imports
- assignment
- notification retry
- bulk listening setup
- action updates
- speaker reconciliation

### 26.4 Production-safe migrations

Allowed:

- additive models
- nullable fields
- safe indexes
- foreign keys
- explicit backfills from provable data
- staged compatibility

Not allowed:

- database reset
- destructive drop
- invented backfill
- hidden cleanup
- repurposing legacy recording Session
- silent data loss

### 26.5 Derived state

Readiness, coverage, and counts may be derived, but derived values may not become write authority.

### 26.6 Low-breakage implementation

Each prompt must:

- stay within the active slice
- preserve kiosk and survey behavior
- preserve SMB
- update targeted tests
- avoid unrelated refactors
- report exact changed files

---

## 27. Testing Strategy

### 27.1 Per-prompt testing

Every implementation prompt requires:

- targeted service tests
- targeted route tests
- targeted component/page tests
- affected Playwright journey
- typecheck
- Prisma validate/generate when schema touched

### 27.2 Behavioral tests over source-string tests

The current repo contains source-string assertions.

New critical behavior should be tested through rendered behavior or service/API contracts where practical.

### 27.3 Real data consistency

Later integration coverage must prove:

- imported session appears in Agenda
- selected session appears in Event Areas
- attached survey links correctly
- response target context is preserved
- session finding uses the correct evidence
- speaker finding requires speaker-specific evidence
- action appears on desktop and mobile
- assignment sends one notification record
- retry does not duplicate assignment
- post-event brief includes unresolved action

### 27.4 SMB protection

Run SMB regression coverage when shared files are touched.

Do not assume Events-only UI changes cannot affect shared kiosk or account code.

---

## 28. Visual and Interaction Rules

- Use the HTML prototype as the main visual reference for Signals.
- Preserve the established Event product design language.
- Avoid excessive helper text.
- Avoid stacked filter bars.
- Avoid oversized headers and unused whitespace.
- Avoid duplicated event identity.
- Keep layouts scannable.
- Keep cards compact enough to support real data volume.
- Ensure all tabs are clickable and routed.
- Ensure Review Evidence opens the correct evidence.
- Ensure status summary boxes are interactive when they visually imply interaction.
- Ensure responsive layouts do not clip controls.
- Keep desktop and mobile action behavior connected.
- Do not show fake hard-coded values.
- Do not create decorative UI before the underlying route/state exists.

---

## 29. Demo Data Consistency

The demo should use one internally consistent Live Experience Summit 2026 dataset.

Known reference values:

- 48 agenda sessions
- 2 event days
- 14 feedback points
- 4 session listening points
- 5 surveys

Rules:

- session titles match everywhere
- speaker assignment matches everywhere
- survey attachment matches everywhere
- target counts match everywhere
- action state matches everywhere
- owner matches everywhere
- evidence source matches everywhere
- lifecycle totals come from one canonical payload

Do not scatter constants across components.

If demo seeding must change, use one deterministic seed path and update tests.

---

## 30. Non-Negotiable Product Rules

1. Do not create a second event system.
2. Do not create a second agenda/session model.
3. Do not repurpose the legacy recording `Session`.
4. Do not create a second survey flow.
5. Do not create a second kiosk flow.
6. Do not create a second response/answer/transcription pipeline.
7. Do not create a separate evidence system.
8. Do not create separate desktop and mobile action models.
9. Do not turn every agenda session into a listening point.
10. Do not turn every listening point into a unique survey.
11. Do not treat unselected sessions as coverage failures.
12. Do not attribute generic feedback to speakers.
13. Do not generate findings from insufficient evidence.
14. Do not force every finding into an action.
15. Do not automatically turn positive intelligence into a task.
16. Do not invent real-time telemetry.
17. Do not silently overwrite imported event data.
18. Do not silently merge speaker profiles.
19. Do not report import success after hidden partial failure.
20. Do not send duplicate assignment emails.
21. Do not roll back assignment because email failed.
22. Do not allow cross-account assignment.
23. Do not duplicate event headers.
24. Do not leave major prototype interactions disconnected.
25. Do not hard-code readiness and coverage totals.
26. Do not change SMB behavior unless a shared dependency requires a tested compatibility change.
27. Do not replace current evidence and issue functionality without preserving its working behavior.
28. Do not ship a post-event page that is only a renamed live dashboard.

---

## 31. Detailed 19-Prompt Implementation Sequence

The build prompt file will contain 19 implementation prompts, numbered 0 through 18.

Each prompt must be completed, reviewed, tested, and visually verified before the next begins.

### Prompt 0 — Authorization and event/account scoping

**Goal:** Normalize server-side access enforcement before adding new Events routes.

**Scope:**

- event collection/detail
- analysis
- timeline
- signals
- reusable Events access helper
- route tests

**Must prove:**

- valid member succeeds
- cross-account user fails
- unauthenticated user fails
- non-Events account fails where required
- event/account mismatch fails
- existing valid UI behavior remains

**Schema impact:** None expected.

**Dependency:** None.

---

### Prompt 1 — Permanent Events / Setup / Signals / Settings shell

**Goal:** Create one shared event workspace shell.

**Scope:**

- event-level layout
- dark left rail
- selected state
- account/event context preservation
- shared event identity
- responsive navigation
- current Setup content embedded unchanged
- current Command Center embedded unchanged

**Must prove:**

- Events link works
- Setup link works
- Signals link works
- Settings works
- refresh preserves context
- mobile navigation works
- no duplicate event header
- no SMB impact

**Schema impact:** None.

**Dependency:** Prompt 0.

---

### Prompt 2 — Setup Overview and connected Setup navigation

**Goal:** Establish final Setup information architecture and readiness hub.

**Scope:**

- Overview
- Event Areas
- Agenda
- Surveys
- Operations
- URL-backed tabs
- readiness rows
- dynamic readiness totals
- Agenda & sessions row
- linked actions

**Must prove:**

- tab route state persists
- readiness actions open correct location
- no hard-coded `5 / 5`
- current Surveys and Operations behavior remains
- current EventStructureItem content remains accessible

**Schema impact:** None expected.

**Dependency:** Prompt 1.

---

### Prompt 3 — Canonical agenda, speaker, assignment, and import schema

**Goal:** Add the missing production-safe domain foundation.

**Scope:**

- session metadata contract on EventStructureItem
- canonical speaker model
- session-speaker join
- speaker role/order
- import job
- import row
- import decision/result
- indexes and foreign keys
- safe migration
- service contracts/tests

**Must decide:**

- account-scoped versus event-scoped speaker identity
- archive/delete semantics
- stable import row key
- import lifecycle/status enum
- duplicate resolution representation

**Must not:**

- create a second agenda session table
- repurpose legacy Session
- store final speaker domain only in metadata

**Dependency:** Prompt 2.

---

### Prompt 4 — Manual Agenda workspace: Sessions and Speakers

**Goal:** Build production CRUD and review flows over canonical records.

**Scope:**

- Agenda landing page
- Sessions list/detail
- manual add/edit
- validation
- Speakers list/detail
- assignment roles
- delete/archive guards
- responsive UI
- tests

**Must prove:**

- session CRUD
- speaker CRUD
- assignment add/remove
- deletion does not remove unrelated records
- live-event editing confirmation
- filters/search/sort
- empty/loading/error states

**Dependency:** Prompt 3.

---

### Prompt 5 — Import backend

**Goal:** Build the staged parser and validation service.

**Scope:**

- CSV
- XLSX
- workbook/worksheet inspection
- mapping contract
- normalization
- row validation
- duplicate detection
- speaker matching candidates
- durable import job/rows
- idempotent confirm service
- route/service tests

**Must prove:**

- same confirmation cannot duplicate records
- invalid rows remain reviewable
- event/account scope enforced
- file type rejected clearly
- no silent overwrite
- partial failure behavior explicit

**Dependency:** Prompt 3 and usable session/speaker services from Prompt 4.

---

### Prompt 6 — Import UI

**Goal:** Build the complete planner-facing import experience.

**Scope:**

- upload entry
- worksheet selection
- mapping
- preview
- row review
- conflicts
- speaker reconciliation
- confirmation
- progress
- results
- open imported sessions
- Setup readiness integration

**Must prove:**

- refresh/resume behavior
- clear validation
- per-row decisions
- completion counts
- unresolved rows accessible
- mobile/narrow support where practical

**Dependency:** Prompt 5.

---

### Prompt 7 — Event Areas and listening-plan connection

**Goal:** Connect agenda sessions to explicit Voice listening points and surveys.

**Scope:**

- add/remove listening point
- attach existing survey
- create survey
- bulk setup
- availability
- compact listening states
- listening-plan coverage
- evidence coverage
- links between Agenda, Event Areas, Surveys, Signals

**Must prove:**

- unselected sessions remain agenda-only
- one survey may serve multiple targets
- responses preserve target context
- removing target does not delete history
- coverage denominators are correct

**Dependency:** Prompts 4 and 6; existing survey system.

---

### Prompt 8 — Signals Overview in-event redesign

**Goal:** Move current Command Center behavior into final Overview hierarchy.

**Scope:**

- event overview
- needs review
- working well
- coverage/confidence
- open follow-up
- Keep
- Improve during this event
- Revisit next event
- clean filters
- issue detail
- evidence
- current workflow preservation

**Must prove:**

- every card is connected
- no fake telemetry
- filters do not conflict
- counts are consistent
- responsive detail works
- current evidence/status/notes remain

**Dependency:** Prompt 1; can use existing data before later tabs.

---

### Prompt 9 — Signals Intelligence tab

**Goal:** Separate broader evidence-backed intelligence from operational review.

**Scope:**

- themes
- signals
- opportunities
- positive intelligence
- learning classification
- evidence strength
- inline evidence/detail
- filters
- no duplicate Needs Attention

**Must prove:**

- findings trace to evidence
- weak evidence is labeled
- no unsupported conclusions
- informational findings remain informational

**Dependency:** Prompt 8.

---

### Prompt 10 — Signals Sessions tab

**Goal:** Build agenda-backed session intelligence.

**Scope:**

- all/selected/represented/underrepresented/not-selected
- session list
- evidence state
- session intelligence detail
- links to Setup and Surveys
- action/learning connection
- related speakers

**Must prove:**

- no title-match authority
- no findings for insufficient evidence
- correct coverage denominator
- data matches Agenda

**Dependency:** Prompt 7 and normalized evidence integration.

---

### Prompt 11 — Signals Speakers tab

**Goal:** Build supported speaker-specific intelligence.

**Scope:**

- real speaker profiles
- session assignments
- speaker-specific response volume
- supported findings
- confidence
- evidence detail
- no-feedback state

**Must prove:**

- no generic logistics attribution
- no leaderboard
- no unsupported comparison
- evidence ties to speaker-specific question/context

**Dependency:** Prompts 4, 7, and 10.

---

### Prompt 12 — Canonical action/tasking backend

**Goal:** Establish one trustworthy action record and history model.

**Scope:**

- choose cluster extension or EventAction model
- action fields
- owner
- status
- due date
- priority
- classification
- linked finding/evidence
- immutable history
- written update
- voice-update architecture
- canonical mutations
- route/service tests

**Must prove:**

- no third action family
- account/event scope
- valid transitions
- history written once
- retries safe
- evidence preserved

**Dependency:** Intelligence foundation; can map current clusters.

---

### Prompt 13 — Desktop Actions tab

**Goal:** Deliver the full desktop tasking workspace.

**Scope:**

- My actions
- All actions
- filters
- unassigned
- blocked
- working
- complete
- action detail
- assignment
- due date
- updates
- history
- evidence
- status transitions

**Must prove:**

- persisted records
- working deep links
- update history
- responsive desktop/tablet layout
- source finding connection

**Dependency:** Prompt 12.

---

### Prompt 14 — Assignment email and delivery tracking

**Goal:** Make assignment a reliable handoff.

**Scope:**

- notification model
- provider integration
- idempotency key
- assignment/reassignment trigger
- failure state
- retry
- delivery history
- email deep link
- tests with provider mocks

**Must prove:**

- one email on first assignment
- one email on reassignment
- no email for same owner save
- assignment survives email failure
- Retry sends once
- cross-account owner rejected

**Dependency:** Prompt 12 and Actions detail route from Prompt 13.

---

### Prompt 15 — Mobile web My Actions

**Goal:** Deliver the assignee-facing responsive workflow.

**Scope:**

- My Actions list
- deep-linked detail
- working/blocked/complete/reopen
- written update
- voice update
- evidence
- history
- return navigation
- auth return/deep-link behavior

**Must prove:**

- same record as desktop
- email link opens correct action
- mobile status updates appear on desktop
- no separate mobile business logic
- no attendee evidence contamination from internal voice update

**Dependency:** Prompts 12–14.

---

### Prompt 16 — Pre-event Signals

**Goal:** Deliver the readiness-focused pre-event lifecycle.

**Scope:**

- listening-plan readiness
- agenda completeness
- survey readiness
- public link/QR readiness
- selected sessions missing setup
- no-response states
- lifecycle derivation

**Must prove:**

- no findings before evidence
- direct links to Setup
- real readiness counts
- correct lifecycle selection

**Dependency:** Prompts 2, 7, and shell/lifecycle service.

---

### Prompt 17 — Post-event closing brief

**Goal:** Deliver a leadership-ready post-event experience.

**Scope:**

- closing summary
- verdict
- key findings
- decisions/follow-through
- unresolved actions
- supporting evidence
- sessions
- speakers
- generate/share brief
- post-event lifecycle derivation

**Must prove:**

- materially different from live dashboard
- unresolved tasks included
- evidence links work
- confidence shown
- next-event learning separated from follow-up

**Dependency:** Prompts 9–15.

---

### Prompt 18 — Cross-workspace integration and hardening

**Goal:** Make the full product coherent and production-ready.

**Scope:**

- every tab
- every link
- Setup/Signals consistency
- import/listening/session/speaker/action consistency
- lifecycle consistency
- accurate counts
- responsive review
- permission review
- final Playwright journeys
- demo seed consistency
- dead code/backup cleanup where safe
- performance review

**Must prove:**

- no disconnected controls
- no old-dashboard loops
- no stale repeated counts
- no hard-coded demo-only state
- no broken mobile actions
- no cross-account access
- kiosk/QR/transcription remain
- SMB remains
- all critical tests pass

**Dependency:** All prior prompts.

---

## 32. Prompt Sizing and Loop Rules

- Do not combine prompts unless this brief explicitly permits it.
- Default maximum files per prompt: 14.
- The schema prompt may exceed that only with explicit explanation.
- Each prompt must name exact likely files or require discovery before editing.
- Each prompt must include acceptance checks.
- Each prompt must run targeted tests.
- Each prompt must report changed files and risks.
- Do not advance with broken navigation, failing tests, fake states, or unresolved architecture conflicts.
- Visual review should compare to the HTML where relevant.
- The prompt file should initially include Prompts 0 and 1 in full.
- Later prompts should be finalized after reviewing the actual result of the prior slice.

---

## 33. Hard Stops

The implementation agent must stop and request review if:

- a prompt conflicts with this brief
- a proposed schema creates a second agenda/session system
- speaker identity scope cannot be resolved from the prompt
- action architecture would create a third action family
- a migration would destroy data
- production data cannot be migrated safely
- auth/event/account scope is unclear
- import partial-failure behavior is undefined
- voice action updates would contaminate attendee evidence
- email provider access is required but unavailable
- tests fail outside the active scope
- the implementation requires broad unrelated refactoring
- the HTML contradicts persisted product behavior and no safe interpretation exists

---

## 34. Initial Agent Starting Package

When the implementation loop begins, give the agent:

```text
Read these files before editing:

1. VOICE_EVENTS_TOTAL_REDESIGN_IMPLEMENTATION_BRIEF.md
2. VOICE_EVENTS_CURRENT_STATE_AUDIT.md
3. VOICE_EVENTS_BUILD_PROMPTS.md
4. GENERIC_PROMPT_LOOP_CONTROLLER.md
5. Event Workspace Redesign Voice Events (1).html
6. ENGINEERING_STANDARDS.md

The implementation brief is the target product and architecture authority.
The audit is the current-code authority.
The HTML is a visual and interaction reference only.
Execute the prompts in order.
Do not skip prompts.
Do not combine prompts.
Stop only on the hard stops defined by the loop controller or brief.
```

Recommended expected branch:

```text
feat/voice-events-total-redesign
```

Recommended schema mode:

```text
OPEN
```

Schema changes must remain production-safe and non-destructive.

---

## 35. Definition of Done

The redesign is complete only when:

- Events, Setup, Signals, and Settings are one connected product shell
- Setup has Overview, Event Areas, Agenda, Surveys, Operations
- Agenda supports Sessions and Speakers
- manual session/speaker management works
- CSV/XLSX import works end to end
- imports are durable and idempotent
- agenda sessions remain distinct from listening points
- listening-plan and evidence coverage are separate
- Signals has Overview, Intelligence, Sessions, Speakers, Actions
- all findings trace to evidence
- speaker findings require speaker-specific support
- tasking uses one canonical action model
- assignment creates a reliable email handoff
- email failure is visible and retryable
- mobile My Actions uses the same records
- written and voice updates work safely
- pre-event, in-event, and post-event are meaningfully different
- post-event provides a true closing brief
- Setup and Signals show one consistent dataset
- navigation and deep links preserve account and event context
- production authorization is consistent
- QR, kiosk, response, transcription, analysis, and evidence remain working
- SMB behavior remains protected
- responsive behavior is validated
- critical tests are behavioral and deterministic
- no major control is decorative, dead, or disconnected
