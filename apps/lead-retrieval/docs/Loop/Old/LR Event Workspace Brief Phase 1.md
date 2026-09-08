# Lead Retrieval Admin — Event Workspace Replacement Brief (Phase 1)

## 1. Purpose

This brief defines the Phase 1 replacement of the current event-level Command Center in the Lead Retrieval Admin web application.

The product decision is:

> Replace the low-value generic Event Command Center with one canonical, lifecycle-aware Event Workspace that changes meaningfully when an event is upcoming, live, or completed.

The lifecycle states are:

```text
Upcoming event
→ Event Readiness

Live event
→ Live Event Workspace

Completed event
→ Post-Event Workspace
```

The account-level Command Center at `/app/events` remains the portfolio operating surface.

Opening a selected event should no longer land on a generic summary page that merely repeats leads, follow-ups, charts, recent activity, and navigation. It should land directly in the workspace appropriate to that event’s real lifecycle.

This brief is the product and architecture authority for the accompanying prompt pack.

---

## 2. Phase 1 Product Boundary

Phase 1 builds **one complete event workspace**, not a suite of separate intelligence dashboards.

The Event Workspace itself is the destination.

```text
Account Command Center
→ Selected Event Workspace
   ├── Upcoming state
   ├── Live state
   └── Completed state
```

Phase 1 does **not** create or integrate separate dashboards for:

- Real-Time Intelligence
- Executive Intelligence
- Coaching Intelligence
- Product & Market Intelligence
- cross-dashboard intelligence filters
- an intelligence tab bar
- intermediate intelligence landing pages

The approved Live and Post-Event mockups include controls that point toward these future products. Those controls express a possible long-term roadmap, but they are **not Phase 1 implementation requirements**.

The following mockup controls must not be copied into Phase 1:

- `Real-Time Intelligence`
- `Open Real-Time Intelligence`
- `Executive Intelligence`
- `Open Executive Intelligence`
- `Coaching`
- `View Coaching Dashboard`
- `Product & Market`
- a `Real-Time / Executive / Coaching / Product & Market` tab bar
- any button whose only purpose is to open another intelligence dashboard

Phase 1 should expose depth through evidence and existing operational workflows, not through more dashboards.

Valid Phase 1 drill-downs include:

- inline evidence
- an evidence drawer or side panel
- an existing filtered Leads Intelligence view
- existing lead detail
- an existing conversation, recording, transcript, survey, or response detail route
- an existing campaign workflow
- existing event settings
- existing users, invitations, seats, or license management

Dedicated intelligence dashboards remain a future phase. Phase 1 must not add placeholder routes, disabled tabs, dead links, or “coming soon” navigation for them.

---

## 3. Repository and Product Context

Primary repository:

```bash
cd ~/Documents/lead\ retrieval\ app
```

Product surface:

```text
Lead Retrieval Admin
```

Current account-level route:

```text
/app/events
```

Current canonical event-level route to audit:

```text
/exhibitor/dashboard?eventId={id}
```

The account-level Command Center has already become a meaningful portfolio surface. It may show:

- what matters across accessible events
- account-level KPIs
- lifecycle-grouped event cards
- team and seat context
- cross-event patterns
- recent activity
- recommended next steps
- entry points into individual events

That account page should remain.

The event-level destination is the surface being replaced.

---

## 4. Current Event Dashboard — Product Verdict

The current event dashboard does not earn its existence as a separate layer.

It currently contains variations of:

- total leads
- hot leads
- due follow-ups
- scheduled follow-ups
- unrated leads
- leads over time
- priority distribution
- next follow-ups
- recent activity
- management links
- a button to open Leads Intelligence

Most of this content is either:

1. already available in Leads Intelligence or follow-up workflows,
2. navigation disguised as dashboard content,
3. too shallow to help someone operate the event,
4. duplicated elsewhere,
5. or semantically inconsistent.

A visible example of the trust problem is:

```text
Top KPI: 0 Hot
Priority distribution: 6 Hot / 100%
```

The replacement must find and correct the underlying semantic mismatch. It must not simply restyle contradictory calculations.

The current page also creates an unnecessary path:

```text
Account Command Center
→ Generic Event Command Center
→ Useful lead or intelligence workflow
```

The new path should be:

```text
Account Command Center
→ Lifecycle-aware Event Workspace
```

Useful data loaders, scoping logic, components, and derivation helpers may be preserved after audit. The generic event-summary page should not remain as a required destination.

---

## 5. Core Product Architecture

### 5.1 One canonical event home

There should be one canonical event home route.

Opening a selected event should:

1. authenticate the user,
2. resolve company and event access,
3. load the selected accessible event,
4. resolve its lifecycle using canonical dates and timezone behavior,
5. render the correct Event Workspace state.

There should not be:

- a generic event dashboard before the lifecycle state,
- a separate event setup workspace,
- multiple competing event-home routes,
- a fake lifecycle selector,
- a second layer of intelligence dashboards in Phase 1.

### 5.2 One shared shell

All three states should share a stable event shell containing durable event context:

- Back to Events
- event name
- lifecycle badge
- canonical date range
- location when available
- booth or event context when real and useful
- event day or timing context when meaningful
- permission-aware primary actions
- compact optional context controls when justified

The shared shell must not contain a Phase 1 intelligence-suite tab bar.

It may contain direct actions such as:

- Event settings
- Set up capture
- Review hot leads
- Launch follow-up campaign
- Export recap, only where a real export exists

It may contain a compact `Strategy context` control during a live event when strategy data exists. This must be secondary, conditional, and must not consume permanent dashboard space.

### 5.3 Lifecycle resolution

The production state must be driven by real event data.

Expected default behavior:

```text
Before event start
→ Upcoming / Event Readiness

During event dates
→ Live Event Workspace

After event end
→ Completed / Post-Event Workspace
```

The repository audit must confirm:

- canonical start and end fields,
- canonical timezone handling,
- start-day and end-day behavior,
- missing-date behavior,
- whether an explicit lifecycle field exists,
- whether that field is authoritative or derived,
- how active-event resolution differs from lifecycle resolution.

Do not copy a prototype `Setup / Live Event / Post-Event` switch into production.

---

## 6. Visual References and Interpretation

Use the final selected-event mockups as the visual source of truth:

1. **Pre-Event / Upcoming selected-event workspace**
2. **Live selected-event workspace**
3. **Post-Event / Completed selected-event workspace**

Use them to guide:

- page width
- typography
- spacing
- hierarchy
- lifecycle color treatment
- hero composition
- KPI density
- card language
- right-rail behavior
- responsive structure
- action prominence
- overall quality bar

The current generic Event Command Center screenshot is an anti-reference. Its generic chart, priority, activity, and management-card composition should not be preserved merely because it already exists.

The final mockups are not data contracts.

Do not copy:

- mock event names or counts
- fake trends
- unsupported operational status
- unsupported coaching scores
- unsupported pipeline or revenue
- unsupported exports
- unsupported intelligence routes
- unsupported dashboard tabs
- prototype-only CTAs
- placeholder evidence

Every production section must be backed by a real canonical source or omitted.

---

## 7. Upcoming State — Event Readiness

### 7.1 Product purpose

The Upcoming state should answer:

- Is this event ready to operate?
- What is incomplete?
- What is the highest-priority blocker?
- Is the team prepared?
- Are access, invitations, seats, or licenses sufficient?
- Is lead capture ready where a real capture-readiness model exists?
- What should the user do next?

It should not become another configuration workspace.

The previously rejected standalone Event Setup workspace duplicated settings, users, invitations, seats, licenses, and event management. Do not recreate it.

### 7.2 Recommended hierarchy

#### A. Event header

- selected event identity
- Upcoming badge
- dates and location
- opens-in context when trustworthy
- direct settings or completion action

#### B. What Matters Now

One dominant blocker or priority.

Examples:

- capture is not configured
- required event details are missing
- assigned team access is incomplete
- invitations remain outstanding
- seats or licenses block staffing

The hero should identify one meaningful condition and one real action. It should not show a generic summary.

#### C. Readiness KPI row

Use only truthful, supportable state such as:

- event setup status
- team assigned
- seats used or available
- capture readiness

Do not invent a readiness percentage unless the repository already has a canonical, meaningful, deterministic definition. A count such as `9 of 11 required items complete` is preferable to an arbitrary score.

#### D. Event readiness checklist

Show concise summaries of real conditions:

- event details
- capture and recording
- team invitations
- seats and licenses
- strategy and playbook
- lead import and mapping
- brief readiness

Each item must have:

- a canonical source,
- an honest state,
- a direct action where needed,
- no duplicated inline settings form.

#### E. Team preparation

Show event-relevant team readiness only where the repository can distinguish:

- company user,
- invited user,
- accepted user,
- event assignment,
- booth or event role,
- seat or license state.

Do not imply that every company user is assigned to every event.

#### F. Strategy and playbook

The full strategy/playbook treatment belongs in the Upcoming state.

Potential content:

- event goal
- active playbook
- target audience
- messaging guidance
- tone
- trusted sources

This capability must remain optional.

Rules:

- absence of a playbook must not automatically block an event,
- a full strategy section should appear only when configured or being intentionally set up,
- a completed strategy section may collapse to a concise summary,
- an unused playbook should use a restrained optional setup state,
- the system must not assume every customer uses strategy/playbooks.

#### G. Final pre-event actions

Show a small number of direct destinations, such as:

- set up capture and recording
- invite or assign users
- review strategy and playbook
- open event settings

Do not turn this into a generic navigation grid.

### 7.3 Upcoming non-goals

Do not add:

- a standalone Event Setup route
- duplicate settings forms
- fake setup percentages
- fake scanner health
- fake device assignments
- placeholder readiness checks
- a required playbook dependency without a real business rule
- a fake lifecycle switch

---

## 8. Live State — Live Event Workspace

### 8.1 Product purpose

The Live state is the highest-priority Phase 1 experience.

It should answer:

- What is happening now?
- What needs attention immediately?
- Which leads should the team act on?
- Which attendee needs, topics, objections, or messages are emerging?
- What should the team change during the event?
- What evidence supports each claim?

The Live Event Workspace is the intelligence experience for Phase 1. It must not link to a second Real-Time Intelligence dashboard.

### 8.2 Recommended hierarchy

#### A. Event header

- selected event identity
- Live badge and day context
- dates, location, booth, staffing, and last-updated context when real
- direct primary action such as Review hot leads or Follow up now
- optional compact Strategy context only when configured

Do not place a large permanent playbook strip above the hero.

Do not add a `Real-Time Intelligence` button.

#### B. What Matters Now hero

The hero should identify the strongest current signal or action.

Possible categories, subject to repository support:

- high-priority leads needing follow-up
- urgent follow-up backlog
- a material emerging topic
- a common objection affecting conversion
- an operational issue backed by real capture data

It must be deterministic, concise, event-scoped, and action-oriented.

#### C. Live KPI row

Use only canonical, useful metrics such as:

- conversations or recordings today
- high-priority or hot leads
- briefs generated or approved, only if real
- average lead quality, only if canonically defined
- active reps, only if a real event participation model exists
- follow-up waiting, sent, or completed, only when status semantics are real

Unavailable data must not become `0`.

#### D. Live intelligence

Potential modules include:

- emerging attendee needs
- emerging topics
- conversation themes
- rising objections
- competitor mentions
- messaging that is resonating
- signal or topic movement only with a real baseline
- a concise “what to do differently” callout only when backed by evidence

All modules are conditional. An unsupported or unused source should disappear gracefully.

#### E. Leads requiring action

Show a capped list or grouped action state for:

- high-priority leads without first follow-up
- recent high-intent leads
- completed conversations without a next step
- overdue follow-ups

Actions should open existing filtered leads, lead detail, or follow-up workflows.

#### F. Embedded coaching insights

Phase 1 may show concise coaching callouts inside the Live page when supported, such as:

- reps needing live coaching
- a best-performing opener
- a repeated weak behavior
- a concrete evidence-backed suggestion

This is not a separate Coaching dashboard.

Do not add:

- `Coaching` navigation,
- `View Coaching Dashboard`,
- a leaderboard unless the data supports it,
- fabricated coaching scores.

#### G. Operational notices

Operational status may appear only if the repository has authoritative data for:

- scanner or capture availability
- recording failures
- pending processing
- active device health

Do not fabricate operational monitoring because it appears in the mockup.

#### H. Evidence interaction

Every material theme, objection, coaching statement, issue, or opportunity should be traceable where supporting records exist.

Preferred Phase 1 interaction:

- inline evidence, or
- drawer/side panel on the same Event Workspace.

Evidence may link onward to an existing lead, conversation, recording, transcript, survey response, or note.

Do not create a second intelligence dashboard for evidence.

### 8.3 Live non-goals

Do not add:

- a Real-Time Intelligence route
- a Real-Time Intelligence tab
- `Open Real-Time Intelligence`
- a Coaching route
- `View Coaching Dashboard`
- Product & Market navigation
- a cross-dashboard filter bar
- fake real-time polling claims
- fake movement percentages
- fake capture health
- generated recommendations without a real service
- placeholder intelligence modules

---

## 9. Completed State — Post-Event Workspace

### 9.1 Product purpose

The Completed state should answer:

- What happened?
- What were the strongest outcomes?
- Which leads, themes, objections, and messages mattered?
- What follow-up remains incomplete?
- What should sales, marketing, or leadership do next?
- What evidence supports the conclusions?

The Post-Event Workspace is the completed-event intelligence experience for Phase 1. It must not link to a second Executive Intelligence dashboard.

### 9.2 Recommended hierarchy

#### A. Event header

- selected event identity
- Completed badge
- dates, location, and wrapped context
- compact goal context when real
- direct actions such as Launch follow-up campaign or Export recap where supported

Do not add an `Executive Intelligence` button.

#### B. What Matters Now hero

Lead with the strongest final outcome and next commercial action.

Potential categories:

- high-priority leads still uncontacted
- follow-up drafts waiting for review
- strongest final theme
- campaign-ready cohort
- unfinished follow-up coverage

The hero must use consistent metrics. Do not casually use the same count as both conversations and leads.

#### C. Outcome KPI row

Use only supported final metrics such as:

- total leads
- high-priority leads
- meetings booked, only if canonical
- briefs approved, only if real
- follow-up completion
- lead quality, only with a canonical definition

#### D. Final intelligence recap

Potential modules:

- final conversation themes
- buying signals
- top objections
- competitor mentions
- audience or market patterns
- best-performing messaging

All claims must be deterministic or backed by a real synthesis pipeline.

#### E. Follow-up readiness

Show:

- untouched high-priority leads
- open follow-ups
- overdue follow-ups
- drafts ready for review
- contacted versus uncontacted counts
- campaign-ready cohorts where the existing workflow supports them

#### F. Embedded executive snapshot

Phase 1 may include a concise executive snapshot inside the page when supported:

- pipeline influenced, only with authoritative attribution
- top account, only with a canonical account relationship
- comparison with prior events, only with a real comparable baseline
- strongest event finding
- commercial next step

This is not a separate Executive Intelligence dashboard.

Do not add:

- `Executive Intelligence`,
- `Open Executive Intelligence`,
- a separate executive route,
- fake pipeline or revenue,
- fake comparisons.

#### G. Embedded team and rep coaching

The Post-Event page may include evidence-backed coaching patterns, best practices, and improvement opportunities.

This is not a separate Coaching dashboard.

#### H. Take it further

Use real destinations only:

- launch follow-up campaign
- route leads to sales where the workflow exists
- open filtered lead follow-up
- open existing campaign tools
- export a recap only where a real export exists

### 9.3 Post-Event non-goals

Do not add:

- a separate Executive Intelligence route
- a separate Coaching route
- Product & Market navigation
- intelligence suite tabs
- fake ROI
- fake revenue attribution
- unsupported benchmark comparisons
- unsupported exports
- generated executive prose without evidence
- placeholder campaign actions

---

## 10. Phase 1 Interaction Model

Phase 1 should deepen the lifecycle page without navigating to another dashboard.

### Evidence-first interactions

A theme, issue, objection, opportunity, or coaching statement may open:

- an inline evidence area,
- a right-side evidence drawer,
- a modal only if consistent with repository patterns,
- an existing record-detail route.

Evidence should show:

- human-readable record identity,
- why it supports the insight,
- useful context,
- a real timestamp format,
- no raw IDs,
- no raw JSON,
- no cross-event data.

### Workflow interactions

Operational CTAs may open:

- filtered Leads Intelligence
- lead detail
- follow-up queue
- campaign creation or review
- event settings
- users and licenses
- existing capture setup

### Forbidden interactions

Do not create:

- an intelligence-dashboard tab bar,
- a dashboard-to-dashboard navigation graph,
- a generic “Open intelligence” button,
- a future-phase placeholder route,
- a dead control copied from a mockup.

---

## 11. Relationship to the Account Command Center

The account-level Command Center remains the portfolio layer.

It should answer:

- what matters across accessible events,
- which event needs attention,
- how team and seats are doing,
- which broad patterns are emerging,
- which selected event to enter.

The Event Workspace should answer:

- what matters inside one selected event,
- what action is appropriate for the current lifecycle,
- what evidence supports the event-level conclusion.

The account page may show concise previews, but it should not duplicate the full selected-event workspace.

---

## 12. Route and Navigation Direction

The audit must choose the safest architecture, but the product requirements are fixed:

```text
Open event
→ canonical event route
→ lifecycle resolution
→ correct body on the same Event Workspace
```

There should be:

- one canonical event home,
- one shared lifecycle shell,
- no generic dashboard before the lifecycle state,
- no duplicate Event Setup route,
- no Phase 1 intelligence-suite routes,
- no lifecycle selector,
- no intermediate dashboard.

Existing detailed routes such as Leads Intelligence may remain and should be reused for operational drill-down.

If deeper intelligence routes already exist in the repository, Prompt 1 must document them. Phase 1 should not link to, expand, or duplicate them. Removal is only required when the audit proves they are dead and safe to remove within scope.

---

## 13. Data and Intelligence Guardrails

Every visible metric, insight, issue, theme, or action must have an authoritative source.

Potential current sources include:

- leads
- status
- temperature
- rating
- priority score
- follow-up fields and delivery state
- intent signals
- enrichment fields
- company text
- job title
- event activity
- campaign data
- conversations
- recordings
- transcripts
- surveys and responses
- evidence records
- assignment or action records
- users, invitations, seats, and licenses

Required behavior:

- event-scoped
- company-scoped
- permission-aware
- deterministic
- stable ranking
- stable tiebreaking
- narrow queries
- bounded row counts
- explicit empty states
- explicit unavailable states
- partial-failure tolerance where appropriate

Forbidden behavior:

- unavailable data shown as `0`
- conflicting definitions for the same KPI
- raw server errors
- raw database IDs
- trend claims without a baseline
- generated commentary from insufficient evidence
- a “real-time” claim without real freshness semantics
- dashboard-only persisted state
- duplicated derivation logic

---

## 14. RBAC and Tenant Requirements

Preserve existing behavior for:

- platform admin
- organizer admin where legitimately supported
- exhibitor admin
- viewer
- direct-customer company-wide event access
- assigned-event access

At minimum:

- all reads are company and event scoped,
- evidence cannot cross event or tenant boundaries,
- viewer behavior is read-only,
- write actions remain server-enforced,
- inaccessible events use existing secure behavior,
- platform-admin overrides remain explicit,
- client visibility is never the only authorization layer.

---

## 15. Engineering Standard

The implementation standard is:

- production-quality
- scalable
- performance-aware
- low-breakage
- tested before merge
- no shortcut fixes

Required principles:

- one canonical lifecycle resolver,
- one canonical event home,
- one derivation path per metric or issue type,
- thin route/page orchestration,
- reusable domain helpers,
- narrow selects,
- bounded queries,
- deterministic ranking,
- safe partial failure,
- no hidden mutable state,
- no brittle patches,
- no broad unrelated refactor,
- no duplicate event workspace,
- no speculative schema.

---

## 16. Four-Prompt Delivery Plan

### Prompt 1 — Repository audit and decisive Phase 1 plan

Audit:

- route and lifecycle architecture,
- current dashboard semantics,
- production data,
- evidence paths,
- RBAC,
- existing deeper intelligence routes,
- supportable modules for each lifecycle state,
- exact Phase 1 route and file plan.

The audit must explicitly identify deeper dashboard concepts as:

```text
EXISTING_AND_REUSED_AS_RECORD_DETAIL
EXISTING_BUT_NOT_INTEGRATED_IN_PHASE_1
DEAD_AND_SAFE_TO_REMOVE
FUTURE_ONLY
```

It must not recommend creating a Phase 1 intelligence suite.

### Prompt 2 — Shared Event Workspace and Upcoming state

Build:

- one canonical event home,
- lifecycle dispatch,
- shared event shell,
- Upcoming readiness,
- optional strategy/playbook treatment,
- direct management actions,
- temporary safe compatibility for Live and Completed until later prompts.

Do not build deeper intelligence navigation.

### Prompt 3 — Live state

Build the complete Live state on the canonical Event Workspace:

- What Matters Now,
- live KPIs,
- event intelligence modules,
- leads requiring action,
- embedded coaching callouts,
- operational notices only where real,
- evidence drawer or inline evidence,
- direct links to existing workflows.

Do not create Real-Time, Coaching, Executive, or Product & Market dashboards.

### Prompt 4 — Completed state and cleanup

Build the complete Post-Event state:

- outcome summary,
- final metrics,
- final intelligence recap,
- follow-up readiness,
- embedded executive snapshot,
- embedded coaching,
- direct next actions,
- legacy generic dashboard removal,
- full lifecycle regression.

Do not create Executive or Coaching dashboards.

---

## 17. Testing Expectations

### Lifecycle

Test:

- before event start,
- start-day boundary,
- during event,
- end-day boundary,
- after event end,
- timezone behavior,
- missing or malformed dates.

### Scope and access

Test:

- company scope,
- event scope,
- inaccessible event,
- viewer read-only behavior,
- exhibitor admin behavior,
- platform admin behavior,
- no cross-event evidence leakage.

### Upcoming

Test:

- ready state,
- blocker state,
- missing details,
- team/invitation/seat states where supported,
- optional playbook absence,
- real action destinations,
- no duplicate setup route.

### Live

Test:

- pulse selection,
- canonical KPI semantics,
- issue/theme/opportunity derivation,
- evidence linkage,
- empty event,
- insufficient sample,
- partial query failure,
- no fabricated zeros,
- no intelligence-suite tab bar,
- no deeper-dashboard CTA,
- no new Real-Time or Coaching route.

### Completed

Test:

- final metrics,
- follow-up readiness,
- final theme ranking,
- embedded executive snapshot behavior,
- embedded coaching behavior,
- evidence linkage,
- no fake trends,
- no Executive Intelligence CTA,
- no new Executive or Coaching route.

### Route and UI

Test:

- account event entry,
- canonical event route,
- legacy route behavior,
- responsive layout,
- no dead CTA,
- no raw error display,
- no contradictory KPI definitions,
- no intermediate dashboard,
- no mockup-only intelligence navigation.

Required validation commands:

```bash
npm run test:node:all
npm run typecheck
npm run build
git diff --check
```

Run focused suites for each prompt. Report any known Playwright auth-seeding limitation honestly.

---

## 18. Product Guardrails

### Preserve

- account Command Center
- existing Leads Intelligence
- lead detail and filters
- real campaign workflows
- event and company scoping
- RBAC and viewer behavior
- canonical lifecycle logic
- useful event derivation helpers
- working record-level deep links

### Remove or replace

- generic event-summary dashboard as a required destination
- contradictory KPI logic
- low-value charts
- navigation cards disguised as dashboard content
- noisy raw activity
- duplicate setup concepts
- mockup-only deeper-dashboard controls
- generic `Open intelligence` actions

### Do not add

- Real-Time Intelligence dashboard
- Executive Intelligence dashboard
- Coaching dashboard
- Product & Market dashboard
- intelligence-suite tab bar
- future-phase placeholder routes
- fake AI recommendations
- fake trend percentages
- fake scanner health
- unsupported conversation counts
- unsupported exports
- fake lifecycle switching
- speculative schema
- dead routes

---

## 19. Definition of Done

Phase 1 is complete when:

1. `/app/events` remains the account-level Command Center.
2. Opening an event enters one canonical Event Workspace.
3. The workspace resolves from the selected event’s real lifecycle.
4. Upcoming events show Event Readiness.
5. Live events show the complete Live state on that same workspace.
6. Completed events show the complete Post-Event state on that same workspace.
7. The generic Event Command Center is no longer a required destination.
8. No intelligence-suite tab bar is introduced.
9. No new Real-Time, Executive, Coaching, or Product & Market dashboard is introduced.
10. No Phase 1 CTA opens a second intelligence dashboard.
11. Evidence opens inline, in a drawer, or in an existing record-detail route.
12. Operational actions use existing leads, follow-up, campaign, settings, and team workflows.
13. Playbooks are optional and primarily presented in the Upcoming state.
14. Every metric and insight has a real authoritative source.
15. Every action has a real destination.
16. Viewer and admin behavior are correct.
17. No cross-event or cross-tenant leakage is possible.
18. Empty and unavailable states are honest.
19. No fake trends, metrics, recommendations, ROI, or operational health ships.
20. tests, typecheck, build, and diff validation pass.
21. dead legacy dashboard code is removed when safe.

---

## 20. Immediate Next Step

Use this brief with:

```text
LR Event Workspace Replacement Prompts — Phase 1.md
GENERIC_PROMPT_LOOP_CONTROLLER.md
```

Attach the final Pre, Live, and Post selected-event mockups, plus the current generic dashboard screenshot as an anti-reference.

Run the prompt loop in order.

---

## 21. One-Sentence Handoff

Replace the generic event dashboard with one canonical lifecycle-aware Event Workspace whose Upcoming, Live, and Completed bodies are complete Phase 1 destinations, deepen each page through evidence and existing workflows, and explicitly defer the separate Real-Time, Executive, Coaching, and Product & Market dashboard suite to future phases.
