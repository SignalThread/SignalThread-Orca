# Lead Retrieval Admin — Event Workspace Replacement Prompts (Phase 1)

## 1. Purpose

This prompt document is designed to run with:

```text
GENERIC_PROMPT_LOOP_CONTROLLER.md
LR Event Workspace Replacement Brief — Phase 1.md
LR Event Workspace Replacement Prompts — Phase 1.md
```

The agent must execute the four prompts in order without skipping, combining, or inventing additional phases.

The program replaces the generic Event Command Center with one canonical lifecycle-aware Event Workspace:

```text
Upcoming event
→ Event Readiness

Live event
→ Live Event Workspace

Completed event
→ Post-Event Workspace
```

The account-level Command Center at `/app/events` remains intact.

---

## 2. Required Loop Inputs

```text
Plan document:
LR Event Workspace Replacement Brief — Phase 1.md

Prompt document:
LR Event Workspace Replacement Prompts — Phase 1.md

Loop controller:
GENERIC_PROMPT_LOOP_CONTROLLER.md

Repository:
~/Documents/lead retrieval app

Expected branch:
feat/event-workspace-replacement

Schema mode:
ADDITIVE_ALLOWED

Allowed scope:
The canonical selected-event home route, shared Event Workspace shell, canonical lifecycle resolution, Upcoming Event Readiness, the Live state, the Completed/Post-Event state, directly related account-to-event entry links, evidence interaction on the Event Workspace, existing workflow drill-downs, directly related legacy event-dashboard cleanup, reusable event derivation helpers, and deterministic tests.

Out of scope:
The account Command Center redesign; mobile changes; an unrelated Leads Intelligence redesign; campaign-system redesign; signal-library redesign; organizer-wide dashboards; unrelated RBAC refactors; a standalone Event Setup workspace; a Real-Time Intelligence dashboard; an Executive Intelligence dashboard; a Coaching dashboard; a Product & Market dashboard; an intelligence tab bar; cross-dashboard filters; future-phase placeholder routes; fake device/scanner monitoring; unsupported exports; speculative integrations; broad schema cleanup; and unrelated repository modernization.

Canonical models/services:
Use existing canonical event, access, lifecycle, leads, follow-up, campaign, activity, evidence, conversation/recording, survey/response, user, invitation, seat, and license paths discovered in Prompt 1. Do not create route-specific copies or dashboard-only sources of truth. Existing Leads Intelligence remains the canonical detailed lead workflow unless the audit proves otherwise.
```

### Branch startup rule

Before Prompt 1:

1. Run `git status --short --branch`.
2. Do not discard, reset, stash, overwrite, or modify unrelated dirty work.
3. If the working tree is clean and the expected branch does not exist, create it from an up-to-date local `main` using non-interactive commands.
4. If unrelated dirty work exists, stop for human review.
5. Do not commit, push, merge, or open a pull request during this loop.

### Schema rule

Schema mode is `ADDITIVE_ALLOWED`, not an instruction to add schema.

- Prefer existing production data and services.
- Prompt 1 must prove a schema addition is required before a later prompt may create one.
- Any approved change must be additive, production-safe, scoped, backward-compatible, and tested.
- Do not create dashboard-only tables, duplicate lifecycle state, duplicate evidence stores, or speculative intelligence fields.
- Stop if a required change is destructive or the source relationship cannot be proven.

---

## 3. Phase 1 Boundary — Applies to Every Prompt

Phase 1 builds one Event Workspace, not a hierarchy of intelligence dashboards.

Do not create, expand, integrate, or link to new dedicated dashboards for:

- Real-Time Intelligence
- Executive Intelligence
- Coaching Intelligence
- Product & Market Intelligence

Do not add:

- `Real-Time / Executive / Coaching / Product & Market` tabs
- `Real-Time Intelligence`
- `Open Real-Time Intelligence`
- `Executive Intelligence`
- `Open Executive Intelligence`
- `Coaching`
- `View Coaching Dashboard`
- `Product & Market`
- an intermediate intelligence landing page
- “coming soon” intelligence navigation
- placeholder intelligence routes

The Live page itself is the Phase 1 live intelligence product.

The Completed page itself is the Phase 1 post-event and executive outcome product.

Coaching, executive, product, market, topic, objection, and messaging insights may appear as conditional modules inside the lifecycle page when supported. They must not create another dashboard layer.

Valid drill-downs are:

- inline evidence
- an evidence drawer or side panel
- existing filtered Leads Intelligence
- lead detail
- existing conversation/recording/transcript/survey/response detail
- existing campaign workflow
- existing event settings
- existing team, invitation, seat, or license workflow

If dedicated intelligence routes already exist, Prompt 1 must document them. Unless the audit proves they are dead and safely removable, leave them untouched—but do not link to or expand them in this Phase 1 work.

---

## 4. Visual Reference Rules

Use the attached final selected-event mockups as visual references:

1. Pre-Event / Upcoming selected-event workspace
2. Live selected-event workspace
3. Post-Event / Completed selected-event workspace

Use the current generic Event Command Center screenshot as an anti-reference.

The selected-event mockups define:

- hierarchy
- density
- page width
- spacing
- lifecycle color treatment
- hero composition
- KPI structure
- card language
- right-rail behavior
- responsive quality
- overall finish

The mockups do not define production data.

Mockup controls that open deeper intelligence dashboards are future-phase concepts. Remove or replace them with direct Phase 1 actions.

Do not copy:

- mock values
- fake trends
- unsupported device health
- unsupported coaching scores
- unsupported pipeline or revenue
- unsupported exports
- unsupported routes
- dead buttons
- prototype-only filters

The plan is authoritative when a mockup conflicts with the written Phase 1 boundary.

---

# Prompt 1 — Repository Audit and Decisive Phase 1 Replacement Plan

```text
Model: Terra
Strength: Medium
```

## Objective

Perform a bounded, repository-only audit that determines exactly how to replace the current generic Event Command Center with the one-route, lifecycle-aware Phase 1 Event Workspace.

This prompt is audit-only.

Do not edit production code, tests, schema, migrations, routes, configuration, package scripts, or generated files. Do not commit or push.

## Maximum files changed

```text
1 file
```

The only allowed changed file is:

```text
EVENT_WORKSPACE_REPLACEMENT_AUDIT.md
```

## Required audit work

### A. Establish the current route map

Identify:

1. the current canonical event home,
2. every route that behaves like an event home or redirects to one,
3. account Command Center links that open selected events,
4. the current Event Command Center page, components, loaders, helpers, styles, and tests,
5. the Leads Intelligence route and its relationship to the current event dashboard,
6. existing deep links for:
   - filtered leads,
   - lead detail,
   - follow-up,
   - campaigns,
   - event settings,
   - users, invitations, seats, and licenses,
   - evidence, conversations, recordings, transcripts, surveys, and responses,
7. any existing Real-Time, Executive, Coaching, Product & Market, analytics, or reporting routes,
8. any duplicate or ambiguous event-home routes.

Provide exact file paths and the real runtime path from an account event card to the selected event.

### B. Identify canonical lifecycle resolution

Determine:

- authoritative start and end fields,
- timezone behavior,
- lifecycle/status helpers,
- missing-date behavior,
- start-day and end-day boundaries,
- explicit lifecycle fields and whether they are authoritative,
- active-event resolution versus lifecycle resolution,
- contradictory lifecycle logic.

End with the exact helper/service that should be the single lifecycle source of truth.

Do not recommend a user-facing lifecycle switch.

### C. Audit the current generic dashboard

For every current visible section, identify:

- component and loader path,
- source table/service,
- calculation semantics,
- current interaction,
- duplication with another workflow,
- trustworthiness,
- remove/reuse/retain verdict.

Find the exact cause of contradictory `Hot` semantics rather than merely describing the screenshot.

### D. Inventory production-backed event data

Audit real active production paths for:

- leads,
- rating and priority score,
- status and temperature,
- follow-up state and sent/completed state,
- campaigns, recipients, drafts, and messages,
- intent signals,
- enrichment,
- job-title and role-family derivation,
- company/account text,
- conversations,
- recordings,
- transcripts,
- notes,
- surveys and responses,
- evidence,
- alerts/issues,
- action assignments,
- activity,
- users,
- invitations,
- event assignments,
- seats,
- licenses,
- capture readiness,
- processing health.

For each source document:

- exact table/model/service/helper,
- authoritative fields,
- event and company scoping,
- permissions,
- performance risks,
- whether it supports Upcoming, Live, Completed, or none,
- persisted/derived/generated/unavailable status,
- existing canonical derivation.

Do not infer production support from abandoned mocks, types, or migrations alone.

### E. Audit deeper intelligence concepts

For every existing or prototype concept related to:

- Real-Time Intelligence
- Executive Intelligence
- Coaching
- Product & Market

classify it as exactly one of:

```text
EXISTING_AND_REUSED_AS_RECORD_DETAIL
EXISTING_BUT_NOT_INTEGRATED_IN_PHASE_1
DEAD_AND_SAFE_TO_REMOVE
FUTURE_ONLY
```

Document:

- route/component path,
- whether it is active,
- whether any current user depends on it,
- whether the Phase 1 Event Workspace should link to it,
- whether it may be safely removed,
- whether it contains reusable derivation or evidence components.

The Phase 1 recommendation must not introduce an intelligence-dashboard suite.

### F. Audit access and tenancy

Document real behavior for:

- exhibitor admin,
- viewer,
- platform admin,
- organizer admin where legitimate,
- direct-customer company-wide event access,
- assigned-event access,
- inaccessible events.

Identify exact server-side checks for the Event Workspace and evidence loaders.

### G. Audit reusable architecture and UI

Identify reusable:

- event shell/header,
- cards and badges,
- drawers/side panels,
- evidence detail,
- chart primitives,
- activity formatting,
- event-aware links,
- partial-failure patterns,
- deterministic ranking helpers,
- optional module patterns,
- responsive layouts.

Explain whether each is safe to reuse.

### H. Build three module supportability matrices

Create separate matrices for:

1. Upcoming / Event Readiness
2. Live state
3. Completed / Post-Event state

For every proposed module classify:

```text
SUPPORTED_NOW
PARTIALLY_SUPPORTED
UNSUPPORTED
```

For each row include:

- source,
- semantic definition,
- direct workflow action,
- evidence interaction,
- empty state,
- unavailable state,
- permission behavior,
- implementation risk,
- conditional display rule.

Do not define a supportability matrix for separate intelligence dashboards. Those are out of scope.

### I. Choose the route and Phase 1 interaction strategy

Choose one decisive route strategy:

- upgrade the current canonical event route in place, or
- introduce one new canonical event route and redirect legacy event-home routes.

The chosen strategy must produce:

```text
Account event card
→ one canonical Event Workspace
→ lifecycle body on the same route
```

Also choose one primary evidence interaction:

- inline,
- drawer/side panel,
- existing detail route,
- or a deliberate combination.

Do not recommend dashboard-to-dashboard navigation.

### J. Produce the implementation map

For Prompts 2–4 identify:

- exact files to create,
- exact files to modify,
- legacy compatibility files,
- files to remove by Prompt 4,
- canonical helpers to reuse,
- new helpers genuinely required,
- focused tests,
- schema verdict,
- risks,
- file-count feasibility.

## Audit deliverable

Create `EVENT_WORKSPACE_REPLACEMENT_AUDIT.md` with:

1. Executive verdict
2. Current route map
3. Current dashboard audit
4. Contradictory KPI root cause
5. Canonical lifecycle and timezone
6. Event data inventory
7. Existing deeper intelligence route classification
8. RBAC and tenancy
9. Reusable architecture and components
10. Upcoming module supportability
11. Live module supportability
12. Completed module supportability
13. Mockup-to-production mapping
14. Future-phase controls to remove or replace
15. Chosen canonical route
16. Chosen evidence interaction
17. Exact Prompt 2 plan
18. Exact Prompt 3 plan
19. Exact Prompt 4 plan
20. Schema verdict
21. Risks and hard stops
22. Decisive recommendation

## Completion requirements

State exactly:

- canonical event route,
- canonical lifecycle resolver,
- account-to-event entry,
- Upcoming modules,
- Live modules,
- Completed modules,
- authoritative source behind each,
- evidence behavior,
- existing workflow destinations,
- legacy code retained temporarily,
- legacy code removed,
- deeper intelligence routes left untouched or removed,
- future-phase items intentionally deferred.

Run only read-only inspection commands plus:

```bash
git diff --check
git status --short
```

Continue to Prompt 2 unless a hard stop was found.

---

# Prompt 2 — Canonical Event Workspace, Lifecycle Foundation, and Upcoming Readiness

```text
Model: Terra
Strength: High
```

## Objective

Implement one canonical Event Workspace shell, canonical lifecycle dispatch, and the Upcoming / Event Readiness state using the plan and `EVENT_WORKSPACE_REPLACEMENT_AUDIT.md`.

## Maximum files changed

```text
18 files
```

Stop before exceeding 18 files.

## Required preflight

Before editing:

1. Re-read the plan, audit, and this prompt.
2. Confirm branch and dirty state.
3. List exact expected files.
4. Confirm canonical event route.
5. Confirm canonical lifecycle/timezone helper.
6. Confirm access guards.
7. Confirm the audit’s schema verdict.
8. Confirm no Phase 1 intelligence-suite navigation is planned.

Stop if route, lifecycle, access, or canonical data is unresolved.

## Required implementation

### A. Establish one canonical event home

Requirements:

- account event links open the canonical Event Workspace,
- valid deep links remain functional,
- legacy event-home URLs redirect or adapt safely,
- no alternate generic event home remains,
- inaccessible or missing events use secure existing behavior,
- explicit accessible event selection is not overridden by active-event resolution.

Do not redesign `/app/events` beyond required link changes.

### B. Create the shared shell

Include:

- Back to Events,
- event name,
- lifecycle badge,
- canonical date range,
- location when available,
- event day/timing context when meaningful,
- permission-aware direct actions.

Requirements:

- shared by all states,
- no lifecycle business content in the shell,
- no fake lifecycle selector,
- no duplicated event formatting,
- no Real-Time/Executive/Coaching/Product & Market tabs,
- no generic `Open intelligence` action,
- accessible and responsive.

### C. Implement canonical lifecycle dispatch

Render:

```text
Before start
→ Upcoming / Event Readiness

During event
→ Live state

After completion
→ Completed / Post-Event state
```

Prompt 2 fully implements Upcoming.

For Live and Completed, retain only the safe staged compatibility behavior specified by the audit until Prompts 3 and 4. Do not create fake placeholders or deeper-dashboard CTAs.

Cover:

- timezone boundaries,
- start day,
- end day,
- missing dates,
- malformed dates,
- explicit canonical lifecycle state where applicable.

### D. Implement Upcoming / Event Readiness

Use only `SUPPORTED_NOW` modules or an audit-approved reduced version.

Expected shape:

1. Event header
2. What Matters Now
3. Readiness KPIs
4. Event readiness checklist
5. Team preparation
6. Optional Strategy & playbook
7. Final pre-event actions

#### What Matters Now

- one real blocker or next priority,
- deterministic selection,
- one real action,
- neutral state when ready.

#### Readiness KPIs

- use real counts or states,
- avoid arbitrary percentages,
- distinguish unavailable from complete.

#### Readiness checklist

Potential real items:

- event details,
- capture and recording,
- invitations,
- seats and licenses,
- strategy/playbook,
- lead import/mapping,
- brief readiness.

Every item must use a canonical source and a real destination.

#### Team preparation

Do not conflate company users, accepted invitations, event assignment, seats, and licenses.

#### Optional strategy/playbook

Rules:

- full content belongs primarily in Upcoming,
- absence does not block launch unless a real business rule says so,
- hide or collapse when unused,
- no empty permanent card,
- no assumption that all customers use it.

#### Final actions

Use existing settings, capture, team, invitation, seat, and license routes.

Do not create `/app/events/{eventId}/setup`.

### E. Create one readiness derivation path

Readiness logic must:

- live in a server/domain helper,
- use scoped authoritative records,
- return structured deterministic output,
- distinguish unavailable from passing,
- use stable blocker ranking,
- avoid repeated or broad queries,
- remain non-authoritative for underlying writes.

### F. Preserve permissions

- viewer is read-only,
- restricted actions are hidden or read-only,
- server destinations enforce writes,
- platform admin and direct-customer access remain correct,
- no tenant leakage.

### G. Temporary compatibility

If a legacy body remains temporarily for Live or Completed:

- isolate it behind one adapter,
- do not expand it,
- do not add intelligence-suite navigation,
- do not duplicate its derivation,
- mark removal for Prompt 4,
- test that Upcoming never uses it.

## Explicit non-goals

Do not:

- build Live or Completed fully,
- create deeper intelligence routes,
- add intelligence tabs,
- create a setup workspace,
- add fake readiness metrics,
- add fake capture health,
- redesign Leads Intelligence,
- add schema unless proven,
- commit or push.

## Required tests

Add focused coverage for:

- canonical event route,
- account-to-event entry,
- legacy route compatibility,
- lifecycle boundaries and timezone,
- missing dates,
- inaccessible event,
- company/event scope,
- viewer mode,
- readiness states,
- blocker ranking,
- unavailable source,
- real action destinations,
- optional playbook absence,
- no `/setup` route,
- no intelligence tab bar,
- no deeper-dashboard CTA.

Run:

```bash
npm run test:account-command-center
npm run test:node:all
npm run typecheck
npm run build
git diff --check
```

Report exact substitutions if a script does not exist. Review against plan and audit, correct drift, then continue to Prompt 3 unless stopped.

---

# Prompt 3 — Live State on the Canonical Event Workspace

```text
Model: Terra
Strength: Extra High
```

## Objective

Replace the active-event compatibility body with the complete, production-backed Live state on the canonical Event Workspace.

The user must land directly in the Live state. Do not create an intermediate page or a second Real-Time Intelligence dashboard.

## Maximum files changed

```text
24 files
```

Stop before exceeding 24 files.

## Required preflight

1. Re-read plan, audit, and Prompt 2 report.
2. Confirm lifecycle routing and shell.
3. Confirm the Live supportability matrix.
4. List supported modules and sources.
5. List exact files.
6. Confirm evidence interaction.
7. Confirm no unproven schema work.
8. Confirm no deeper-dashboard route or tab is being introduced.

## Product outcome

The Live state must answer:

- What matters right now?
- Which leads or follow-ups require action?
- Which topics, objections, or messages are emerging?
- Which team behavior is helping or hurting?
- What evidence supports each statement?

The Live page itself is the Phase 1 live intelligence product.

## Required implementation

### A. Canonical Live data and derivation

Build or extend one server-side orchestration path.

Requirements:

- authenticate and authorize first,
- event/company scope,
- narrow selects,
- bounded rows,
- no per-card query loops,
- reuse canonical helpers,
- separate loading and derivation,
- structured availability/error state,
- partial non-critical failure support,
- no failure represented as `0`,
- no dashboard-only state.

### B. Event header and direct actions

Use the shared shell.

Live-specific context may include:

- Live badge,
- day of event,
- reps on floor where real,
- last-updated context where real,
- direct primary action.

Do not add:

- `Real-Time Intelligence`,
- `Coaching`,
- `Executive`,
- `Product & Market`,
- a dashboard tab bar,
- a separate button row whose purpose is dashboard navigation.

A compact `Strategy context` control is allowed only when configured and useful.

### C. What Matters Now

Implement one dominant deterministic summary chosen from audit-approved conditions.

Requirements:

- stable priority,
- stable tiebreaks,
- concise title/copy,
- one real action,
- evidence where relevant,
- neutral state,
- no generated filler,
- no fake trend.

### D. Live KPI row

Include only audit-approved metrics with one canonical definition.

Potential examples where supported:

- conversations/recordings today,
- high-priority or hot leads,
- active reps,
- briefs generated/approved,
- lead quality,
- follow-up waiting/sent/completed.

Requirements:

- clear timeframe and denominator,
- honest unavailable state,
- consistent semantics,
- real drill-down when interactive.

### E. Live intelligence modules

Use only supported conditional modules, such as:

- emerging attendee needs,
- emerging topics,
- conversation themes,
- rising objections,
- competitor mentions,
- best-performing messaging,
- supported signal movement,
- evidence-backed “what to do differently.”

Derivation requirements:

- deterministic normalization,
- junk exclusion,
- minimum sample,
- stable ranking,
- stable tiebreak,
- capped rows,
- honest counts,
- no fake percentages or confidence.

### F. Leads requiring action

Show a capped, actionable set or group for:

- high-priority leads without first follow-up,
- recent high-intent leads,
- completed conversations without next step,
- overdue follow-up.

Every action must open an existing filtered leads, lead detail, or follow-up route.

### G. Embedded coaching callouts

Show coaching only when supported.

Potential content:

- reps needing live coaching,
- a repeated weak behavior,
- a best-performing opener,
- a concrete next-shift suggestion.

Requirements:

- evidence-backed,
- event-scoped,
- viewer read-only,
- no fabricated score,
- no separate Coaching dashboard,
- no `View Coaching Dashboard`.

### H. Operational notices

Include only authoritative operational status.

Do not fabricate:

- scanner health,
- device health,
- recording status,
- processing failures,
- rep activity.

Omit unsupported modules entirely.

### I. Evidence on the same workspace

Implement the audit-selected pattern.

Requirements:

- every evidence-backed claim opens exact supporting records,
- server-side event/company scope,
- human-readable identity,
- no raw IDs/JSON/ISO timestamps,
- honest empty state,
- viewer read-only,
- links to existing record detail where available,
- no second intelligence dashboard.

### J. Direct workflows

Valid actions include:

- review filtered hot leads,
- follow up now,
- open lead detail,
- open conversations,
- launch or review an existing campaign flow,
- open event settings where relevant.

Do not add generic `Open intelligence` actions.

### K. Remove active-event dependence on the old dashboard

After Prompt 3:

- active events render the Live state directly,
- no active-event path requires the generic dashboard,
- no mockup-only intelligence navigation appears,
- any compatibility body remains only for Completed until Prompt 4.

## Explicit non-goals

Do not:

- build a Real-Time Intelligence dashboard,
- build Coaching, Executive, or Product & Market dashboards,
- add an intelligence tab bar,
- build Completed state,
- redesign Leads Intelligence,
- add fake polling,
- add fake operational health,
- add unsupported generated summaries,
- add speculative schema,
- refactor unrelated modules,
- commit or push.

## Required tests

Add focused deterministic coverage for:

- live lifecycle selection,
- event/company/access scope,
- viewer mode,
- pulse selection and tiebreaks,
- KPI semantics,
- no contradictory hot calculations,
- topic/theme/objection/message derivation,
- action-lead eligibility and ranking,
- coaching conditional behavior,
- evidence linkage and scope,
- empty and insufficient sample,
- partial failure without fake zeros,
- valid action filters/routes,
- optional module disappearance,
- no intelligence tab bar,
- no `Open Real-Time Intelligence`,
- no `View Coaching Dashboard`,
- no new deeper intelligence route,
- responsive contracts,
- shared shell regression.

Run:

```bash
npm run test:account-command-center
npm run test:node:all
npm run typecheck
npm run build
git diff --check
```

Run the new focused Live suite directly. Report Playwright limitations honestly. Review against plan, audit, and mockup hierarchy, then continue to Prompt 4 unless stopped.

---

# Prompt 4 — Completed/Post-Event State, Legacy Removal, and Final Regression

```text
Model: Terra
Strength: High
```

## Objective

Complete the lifecycle Event Workspace by replacing the completed-event compatibility body with the production-backed Completed/Post-Event state, removing obsolete generic dashboard code, and validating the entire lifecycle.

The Completed page itself is the Phase 1 executive and post-event intelligence product. Do not create a second Executive Intelligence dashboard.

## Maximum files changed

```text
22 files
```

Stop before exceeding 22 files.

## Required preflight

1. Re-read plan, audit, and prior reports.
2. Confirm Upcoming and Live on canonical route.
3. Confirm Completed supportability matrix.
4. List supported modules and sources.
5. Identify remaining generic dashboard code, links, tests, and helpers.
6. List exact files to change/delete.
7. Confirm lifecycle boundary behavior.
8. Confirm no Executive/Coaching/Product & Market route or tab will be introduced.

## Product outcome

A completed event should land directly in a Post-Event Workspace that explains:

- final outcomes,
- durable topics and signals,
- unfinished follow-up,
- embedded executive findings,
- embedded coaching lessons,
- next real commercial actions,
- supporting evidence.

It must not be the Live page with renamed headings.

## Required implementation

### A. Canonical Completed data and derivation

Requirements:

- event/company/access scope,
- narrow bounded queries,
- deterministic metrics and ranking,
- reuse shared logic only when semantics match,
- separate final-state rules from live urgency,
- partial non-critical failure,
- no failure represented as `0`,
- no dashboard-only state.

### B. Event header and direct actions

Use the shared shell.

Potential direct actions where real:

- launch follow-up campaign,
- review drafts,
- view filtered pipeline/leads,
- export recap.

Do not add:

- `Executive Intelligence`,
- `Open Executive Intelligence`,
- `Coaching`,
- `View Coaching Dashboard`,
- `Product & Market`,
- an intelligence tab bar.

### C. What Matters Now

Select one final outcome or unfinished action.

Requirements:

- deterministic selection,
- stable tiebreak,
- evidence-backed support,
- one real next action,
- consistent lead/conversation terminology,
- no fake executive narrative,
- no unsupported ROI.

### D. Outcome KPI row

Include only canonical final metrics approved by the audit.

Potential examples:

- total leads,
- high-priority leads,
- meetings booked,
- briefs approved,
- follow-up completed,
- lead quality.

Requirements:

- stable definition,
- denominator/timeframe,
- honest unavailable state,
- no contradictory reuse of the same count.

### E. Final intelligence recap

Potential conditional modules:

- final themes,
- buying signals,
- objections,
- competitor mentions,
- audience patterns,
- best-performing messaging,
- account or industry concentration.

Requirements:

- deterministic normalization,
- minimum sample,
- stable ranking,
- capped results,
- evidence,
- no fake movement/trend/confidence,
- no generated prose without a proven service.

### F. Follow-up readiness

Show real groups such as:

- untouched high-priority leads,
- open follow-ups,
- overdue follow-ups,
- contacted versus uncontacted,
- drafts ready,
- campaign-ready cohorts.

Every CTA must use a working existing workflow.

### G. Embedded executive snapshot

Include only supportable findings inside the Completed page.

Potential content:

- strongest event finding,
- top account,
- pipeline influenced,
- comparison with prior event,
- commercial next step.

Rules:

- every value needs an authoritative relationship,
- no inference from free text,
- no fake revenue,
- no fake benchmark,
- no second Executive dashboard.

### H. Embedded team and rep coaching

Include evidence-backed patterns, best practices, and improvement opportunities where supported.

Do not create a separate Coaching dashboard or leaderboard without data support.

### I. Take it further

Use real direct workflows:

- launch follow-up campaign,
- route leads to sales where supported,
- open filtered lead follow-up,
- open existing campaign tools,
- export only where a working export exists.

### J. Evidence

Reuse the shared evidence interaction.

Requirements:

- event/company scope,
- exact supporting records,
- human-readable context,
- viewer read-only,
- no raw IDs/JSON,
- no dashboard-to-dashboard navigation.

### K. Remove the generic Event Command Center

By the end:

- no generic event-summary body is a required destination,
- no legacy compatibility adapter remains,
- no duplicate event-home route remains,
- no stale account link points to the old destination,
- no `Open Leads Intelligence` escape button remains merely because the event home is low-value,
- no rejected setup route or CTA remains,
- no contradictory KPI helper remains active,
- no dead dashboard components/styles/tests/imports remain,
- useful canonical helpers are retained without duplication.

Use repository search to prove stale links and prohibited mockup labels are gone from the Phase 1 event workspace.

### L. Final lifecycle regression

Validate:

```text
Upcoming
→ Event Readiness

Live
→ Live state on Event Workspace

Completed
→ Post-Event state on Event Workspace
```

Verify:

- account cards enter the right state,
- direct links enter the right state,
- legacy routes resolve safely,
- timezone boundaries,
- missing dates,
- viewer/admin behavior,
- evidence scoping,
- no intermediate dashboard,
- no intelligence-suite navigation.

### M. Final visual cleanup

Review narrow, tablet, and desktop widths.

Remove:

- excessive helper copy,
- duplicate headings,
- generic navigation cards,
- dead whitespace,
- raw actor/data fallbacks,
- unsupported labels,
- inconsistent icon sizing,
- conflicting KPI terminology,
- mockup-only future-phase CTAs.

## Explicit non-goals

Do not:

- redesign account Command Center,
- redesign Leads Intelligence,
- create Executive, Coaching, Real-Time, or Product & Market dashboards,
- add intelligence tabs,
- add ROI/revenue attribution,
- add unsupported comparisons,
- add unsupported exports,
- add fake summaries,
- add lifecycle switching,
- perform unrelated cleanup,
- commit or push.

## Required tests

### Lifecycle and route

- Upcoming, Live, Completed
- start/end boundaries
- timezone
- missing dates
- account-to-event entry
- direct event entry
- legacy route compatibility
- one canonical event home
- no intermediate dashboard

### Access

- viewer
- exhibitor admin
- platform admin
- organizer where legitimate
- inaccessible event
- no cross-event or cross-company evidence

### Completed state

- outcome selection
- final KPI semantics
- final theme ranking
- follow-up readiness
- embedded executive snapshot conditional behavior
- embedded coaching conditional behavior
- evidence
- empty and partial states
- no fabricated zeros
- real action destinations

### Cleanup and Phase 1 boundary

- old generic dashboard not used
- stale route/link search
- no `/setup` route or CTA
- no intelligence tab bar
- no `Open Real-Time Intelligence`
- no `Open Executive Intelligence`
- no `View Coaching Dashboard`
- no new Real-Time, Executive, Coaching, or Product & Market route
- no dead CTA
- responsive states
- no contradictory terminology

Run:

```bash
npm run test:account-command-center
npm run test:node:all
npm run typecheck
npm run build
git diff --check
```

Run focused lifecycle and Completed suites directly. Report any browser-test limitation honestly.

## Final loop deliverable

Use the loop controller’s final stop format and include:

- overall implementation summary,
- all files changed/deleted,
- migrations and generation,
- tests and exact results,
- build/typecheck,
- manual migration steps,
- manual QA,
- known risks,
- deferred deeper intelligence dashboards,
- out-of-scope areas untouched,
- branch ready for review.

The manual QA checklist must include:

```text
[ ] Account Command Center still loads
[ ] Selected event opens one canonical route
[ ] Upcoming shows Event Readiness
[ ] Live shows the complete Live state
[ ] Completed shows the complete Post-Event state
[ ] No intelligence suite tab bar appears
[ ] No deeper intelligence CTA appears
[ ] Evidence opens on the workspace or a real record route
[ ] Existing Leads Intelligence drill-down works
[ ] Existing campaign/settings/team actions work
[ ] Optional playbook absence is handled cleanly
[ ] Viewer mode is read-only
[ ] Narrow/tablet/desktop layouts are acceptable
[ ] No unrelated module changed
```

---

# Starting Message for the Agent

```text
Read the loop controller first, then read the plan and prompt documents listed below.

Loop controller:
GENERIC_PROMPT_LOOP_CONTROLLER.md

Plan document:
LR Event Workspace Replacement Brief — Phase 1.md

Prompt document:
LR Event Workspace Replacement Prompts — Phase 1.md

Expected branch:
feat/event-workspace-replacement

Schema mode:
ADDITIVE_ALLOWED

Allowed scope:
Replace the generic selected-event dashboard with one canonical lifecycle-aware Event Workspace containing the Upcoming, Live, and Completed states. Include same-page evidence interaction and existing workflow drill-downs. Remove directly related legacy dashboard code by the final prompt.

Out of scope:
Separate Real-Time, Executive, Coaching, or Product & Market dashboards; an intelligence-suite tab bar; future-phase intelligence routes; account Command Center redesign; unrelated Leads Intelligence or campaign redesign; a standalone Event Setup workspace; unrelated RBAC/schema/refactor work.

Attached visual references:
1. Final Pre-Event selected-event mockup
2. Final Live selected-event mockup
3. Final Post-Event selected-event mockup
4. Current generic Event Command Center screenshot, which is the anti-reference being replaced

Important:
The final Live and Post mockups contain controls that point to future deeper dashboards. Do not implement those controls or routes in Phase 1. Replace them with evidence interaction or direct existing workflows as defined by the plan.

Canonical models/services:
Use the repository’s existing canonical event, lifecycle, access, lead, follow-up, campaign, evidence, conversation/recording, survey/response, user, invitation, seat, and license paths identified by Prompt 1. Do not create dashboard-only sources of truth.

Execute the prompts in order. Stop only on the hard stops in the loop controller.
```
