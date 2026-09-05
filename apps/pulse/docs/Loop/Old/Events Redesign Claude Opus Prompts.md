# SignalThread Voice for Events Redesign — Claude Opus Prompt Pack

Use this prompt pack with the implementation loop file. Run **one prompt at a time**, review the output, run verification, then move to the next prompt.

This work covers the three-tier Events admin experience:

1. **Events Home / Account Command Hub**
2. **Event Workspace / Event Detail**
3. **Command Center / Live Dashboard**

The design references should be added to the repo before implementation, ideally under:

```text
docs/design/events/
  01-events-home.png
  02-create-event-conference.png
  03-create-event-expo.png
  04-create-event-workshop.png
  05-create-event-brand-activation.png
  06-create-event-blank.png
  07-event-workspace-overview.png
  08-event-workspace-areas.png
  09-event-workspace-surveys.png
  10-event-command-center.png
```

Treat these images as **visual/product direction**, not pixel-perfect specs.

---

## Global Rules for Every Prompt

Paste these rules into Claude with every implementation prompt.

```text
Hard scope guardrail:
This work is for the EVENTS / Voice for Events admin experience only.

Do not touch the SMB product, SMB marketing site, SMB signup/Stripe flows, SMB dashboard behavior, retail voice survey flows, Google review/reputation flows, or any VITE_SITE_MODE=smb behavior.

Do not change shared components in a way that visually or behaviorally affects SMB/retail pages unless the change is fully isolated behind event-specific components or event-only routes.

If a shared component must be touched, first identify every non-event usage and preserve existing SMB/retail behavior exactly.

Product UX standard:
Do not build mechanical/database-shaped UI. Think like a strong product designer. The final UI should have clear hierarchy, obvious primary actions, polished spacing, responsive behavior, useful empty states, and workflows that feel intentionally designed.

Schema note:
The schema is not locked. If durable implementation requires schema changes, propose and implement production-safe schema/migration changes rather than hacking around the data model. Do not create duplicate event/survey/dashboard systems. Reuse the existing Event, SurveyTarget/EventStructureItem, Survey, PublicSurveyLink, Response, Answer, Transcript, and Analysis concepts where they already exist.

Implementation loop:
Follow the repo loop file. Complete the prompt, run the required verification, summarize what changed, then stop for review before moving to the next prompt.

Preserve:
- Existing anonymous kiosk voice flow.
- Existing QR/link launch behavior unless this prompt explicitly changes it.
- Existing survey creation/edit/archive/launch behavior.
- Existing dashboard/refresh/filter/status/copy/evidence behavior.
- Existing account/event scoping.
- Existing non-event product behavior.

Do not:
- Add fake analytics, fake counts, fake event data, fake trends, fake responses, or fake scores.
- Rebuild working flows from scratch unless the current implementation cannot support the requested behavior.
- Refactor unrelated auth, billing, SMB, retail, marketing, or kiosk code.
- Use icon-only controls for critical event actions when a text label is needed.
```

---

# Prompt 1 — Audit Current Events Surfaces and Implementation Map

```text
Model: Claude Opus
Reasoning: High

Admin / Voice App

Audit only. Do not change files.

Task:
Audit the current Events / Voice for Events admin implementation and map the exact files, routes, components, services, data models, tests, and design reference assets needed to implement the redesigned three-tier Events experience.

Design references:
Use the images under docs/design/events/ as visual/product direction:
- 01-events-home.png
- 02-create-event-conference.png
- 03-create-event-expo.png
- 04-create-event-workshop.png
- 05-create-event-brand-activation.png
- 06-create-event-blank.png
- 07-event-workspace-overview.png
- 08-event-workspace-areas.png
- 09-event-workspace-surveys.png
- 10-event-command-center.png

Product model:
The three-tier experience is:
1. Events Home / Account Command Hub
   - account-level entry point
   - active/live event hero
   - event list
   - create/open/manage event containers
2. Event Workspace / Event Detail
   - event setup
   - event structure
   - event areas/sessions/touchpoints
   - surveys attached to event targets
   - QR/kiosk launch
   - readiness and operations
3. Command Center / Live Dashboard
   - live attendee intelligence
   - action briefs
   - issue triage
   - evidence review
   - sponsor value
   - source patterns and positive signals

Current product baseline:
The existing app already has working event admin surfaces and a working anonymous kiosk voice flow:
QR/link -> kiosk -> response create -> answer upload -> transcription -> analysis -> dashboard insights.
Preserve this baseline.

Audit goals:
1. Identify the exact route files for:
   - Events Home
   - Create Event
   - Event Workspace/Event Detail
   - Command Center/Dashboard
2. Identify existing components used by these pages.
3. Identify any shared components that must not be changed because they affect SMB/retail.
4. Identify event-only UI primitives that can safely be added.
5. Identify existing data sources for:
   - events
   - event areas/sessions/touchpoints
   - surveys
   - public links/QR/kiosk
   - responses/answers
   - dashboard/action briefs/evidence
6. Identify whether event templates already exist.
7. Identify schema gaps, if any. The schema is not locked, but schema changes must be justified and production-safe.
8. Identify tests that already exist and what new tests should be added.
9. Identify likely implementation phases and risks.

Hard scope guardrail:
This audit is for EVENTS / Voice for Events only.
Do not inspect or modify SMB unless needed to prove an event change will not affect it.
Do not touch SMB product, SMB marketing site, SMB signup/Stripe, retail dashboard, or Google review/reputation flows.

Return:
1. Current route/component map.
2. Current data/service map.
3. Existing behavior to preserve.
4. Exact files likely to change in each later prompt.
5. Shared files/components that are risky to touch.
6. Schema changes recommended, if any, with justification.
7. Test plan.
8. Implementation risks.
9. Recommended order for the next prompts.
```

---

# Prompt 2 — Build Shared Event UI Primitives

```text
Model: Claude Opus
Reasoning: High

Admin / Voice App

Build shared event-only UI primitives for the redesigned Voice for Events admin experience.

Design references:
Use docs/design/events/ as visual/product direction, especially:
- 01-events-home.png
- 07-event-workspace-overview.png
- 08-event-workspace-areas.png
- 09-event-workspace-surveys.png
- 10-event-command-center.png

Task:
Create a small event-only UI layer that the Events Home, Event Workspace, and Command Center can share without affecting SMB/retail pages.

Purpose:
Avoid each page inventing its own event header, card, tab, status, metric, row, and empty state styles. The three pages should feel like one connected product.

Expected primitives may include:
- EventPageShell
- EventHeroHeader
- EventMetricStrip
- EventStatusPill
- EventPrimaryActions
- EventTabs
- EventObjectRow
- EventReadinessList
- EventEmptyState
- EventFilterBar
- EventQRCodeActions
- EventActionButton / event-specific button variants if needed

Before editing:
1. Identify the exact files/components you plan to add or change.
2. Confirm whether these will be new event-only components or changes to shared components.
3. If any shared component must be touched, identify every non-event usage and preserve SMB/retail behavior exactly.

Scope:
- Prefer adding event-only components under an event-specific component path.
- Do not redesign full pages in this prompt.
- Do not change data fetching behavior.
- Do not change schema unless the audit found a small required supporting type/contract change.
- Do not touch SMB/retail.

UX requirements:
- Components should support polished, product-grade hierarchy.
- Components should work across desktop and responsive layouts.
- Cards/rows should support clickable object behavior.
- Status pills should support event language like:
  - Live now
  - Active
  - Ready
  - Needs survey
  - Launchable
  - Immediate
  - Soon
  - Watch
  - Positive
  - Negative
- Empty states should be reusable and helpful, not blank boxes.
- Avoid icon-only critical actions.

Engineering requirements:
- Keep components typed and focused.
- Avoid over-abstraction.
- Keep event-only styles isolated.
- Preserve existing behavior.
- Do not introduce fake data.

Hard scope guardrail:
This work is for EVENTS / Voice for Events admin experience only.
Do not touch SMB product, SMB marketing site, SMB signup/Stripe, retail voice survey flows, or VITE_SITE_MODE=smb behavior.

Acceptance checks:
- Event-only primitives compile.
- No page behavior changes unless a page imports a new primitive safely.
- SMB/retail pages are untouched.
- Components are ready for the next prompts.
- `npm run typecheck` passes.
- Run the relevant tests if there are component tests, or explain why none apply.

Return:
- Files added/changed.
- Components added and what each does.
- Any shared component touched and why.
- Confirmation that SMB/retail surfaces were not affected.
- Verification results.
- Assumptions or risks.
```

---

# Prompt 3 — Redesign Events Home / Account Command Hub

```text
Model: Claude Opus
Reasoning: High

Admin / Voice App

Implement the redesigned Events Home / Account Command Hub.

Design references:
Use:
- docs/design/events/01-events-home.png
- docs/design/events/02-create-event-conference.png through 06-create-event-blank.png only as context for where Create Event leads.

Task:
Replace the prototype-style Events Home with a polished event operations home base.

This page is the entry point before a user opens a specific event workspace or command center.

Product relationship:
- Home page = account/event command hub.
- Event Workspace = setup, structure, survey deployment, QR/kiosk launch.
- Command Center = live attendee intelligence, action briefs, evidence, and operational triage.

Current problem:
The existing home page feels like a prototype admin menu. The large cards are generic, hierarchy is weak, and the event workspace list does not guide the user into the next best action.

Needed behavior:
1. Show account/admin context clearly.
2. Feature the active/live event as the main object when one exists.
3. Make Open Workspace and View Command Center obvious primary actions.
4. Keep Create Event available, but not dominant when an active event exists.
5. Make event rows/cards clickable.
6. Replace critical icon-only actions with labeled actions.
7. Separate destructive actions like delete from normal event operations.
8. Show useful real stats only.
9. Scale cleanly from one active event to multiple events.
10. Include polished empty states for:
   - no events yet
   - no responses yet
   - no active event
   - no workspace/venue data

Before editing:
1. Identify the exact home route/component files.
2. Identify current event data shape available to the page.
3. Identify existing action routes/handlers for open, create, dashboard, edit, QR/kiosk, delete.
4. Identify whether any shared component usage could affect SMB/retail.

Scope:
- Redesign the Events Home/account command hub only.
- Use shared event-only primitives from Prompt 2 where useful.
- Do not implement the Create Event redesign here unless the home page currently contains it inline. If it does, keep changes focused to the home shell and leave full create-flow polish for Prompt 4.
- Do not change backend behavior unless a small fix is required to preserve existing actions.
- Do not touch SMB/retail.

UX requirements:
- The active event should be easy to find and open.
- The page should clearly communicate what account/workspace the user is in.
- Event rows/cards should show:
  - event name
  - status
  - venue/workspace if available
  - dates if available
  - survey count if available
  - response count if available
  - primary actions
- Normal actions should be visually grouped.
- Destructive actions should be separated.
- Use consistent terminology:
  - Event Workspace
  - Command Center
  - Live Intelligence
  - Event Container
  - Surveys
  - Kiosk
  - QR

Data rules:
- Use real data only.
- Do not invent fake attention counts, fake sentiment, fake trends, or fake stats.
- If a metric is unavailable, omit it or show a truthful empty/loading state.

Hard scope guardrail:
This work is for EVENTS / Voice for Events admin experience only.
Do not touch SMB product, SMB marketing site, SMB signup/Stripe, retail voice survey flows, Google review/reputation flows, or VITE_SITE_MODE=smb behavior.

Acceptance checks:
- Page feels like a polished event operations home, not a prototype menu.
- Active event is obvious and clickable.
- Workspace and Command Center entry points are obvious.
- Create Event remains available.
- Critical actions have labels, not only icons.
- Destructive actions are visually separated.
- Empty states are intentional.
- Existing create/open/edit/dashboard/QR/delete flows still work.
- No fake data is introduced.
- SMB/retail pages are untouched.
- `npm run typecheck` passes.
- Run relevant tests or add/update targeted tests if existing coverage exists.

Return:
- Files changed.
- Behavior changed.
- How the page connects to Event Workspace and Command Center.
- Any backend changes and why.
- Verification results.
- Assumptions or risks.
```

---

# Prompt 4 — Implement Create Event Flow and Event Templates

```text
Model: Claude Opus
Reasoning: High

Admin / Voice App

Implement the redesigned Create Event flow and starting-point templates for Voice for Events.

Design references:
Use:
- docs/design/events/02-create-event-conference.png
- docs/design/events/03-create-event-expo.png
- docs/design/events/04-create-event-workshop.png
- docs/design/events/05-create-event-brand-activation.png
- docs/design/events/06-create-event-blank.png

Task:
Create or redesign the event creation screen so it feels like the polished “Create a new event” flow in the references.

Product purpose:
An event is the top-level container for event intelligence. The user creates an event, optionally chooses a starting template, then lands in the Event Workspace where they can manage event areas, surveys, QR/kiosk links, and live intelligence.

Needed behavior:
1. User enters event name.
2. User can optionally enter/select venue.
3. User can optionally enter event dates.
4. User chooses a starting point:
   - Conference
   - Expo / Trade Show
   - Workshop
   - Brand Activation
   - Blank Event
5. Selection previews what the event starts with.
6. Blank Event starts with no areas.
7. Non-blank templates should create sensible initial event structure/touchpoints if the current data model supports it, or add production-safe schema/service support if needed.
8. After creation, the user should land in the Event Workspace for the created event.

Important schema note:
The schema is not locked. If the current model cannot correctly support event templates or event structure creation, implement the right production-safe schema/migration/service changes. Do not hack template data into unrelated fields. Do not create a second event system.

Before editing:
1. Identify the current create event route/component/API.
2. Identify existing event structure models/services.
3. Identify whether templates already exist.
4. Identify whether structure items are EventStructureItem, SurveyTarget, or another current model.
5. Identify whether a schema change is needed.
6. Identify tests that cover event creation.

Scope:
- Create Event flow and template creation only.
- Do not redesign the full Events Home beyond navigation needed to reach this flow.
- Do not redesign Event Workspace tabs in this prompt.
- Do not touch Command Center.
- Do not touch SMB/retail.

Template rules:
- Templates create event structure only.
- Templates must not create fake responses, fake answers, fake analytics, fake sentiment, fake dashboard issues, or fake sponsor value.
- Template structure should be editable after creation.
- Template selection should be explicit and reversible before submit.
- Blank event must remain supported.

Suggested template previews:
- Conference: Registration, Keynotes, Sessions, Expo Floor, Networking
- Expo / Trade Show: Expo Floor, Exhibitor Booths, Sponsor Activations, Registration
- Workshop: Sessions, Breakout Rooms, Overall Experience
- Brand Activation: Sponsor Zones, Brand Experiences, Custom Touchpoints
- Blank Event: No areas yet — user will add their own

UX requirements:
- Create button is disabled until required fields are valid.
- Starting-point cards are clickable and visually selected.
- Preview line updates based on selected template.
- Footer explains the event can be renamed, rescheduled, and restructured later.
- Existing events list remains visible if the current page includes it.
- Responsive behavior is clean.

Engineering requirements:
- Put template business logic in a service/helper, not only in UI.
- Route handlers should stay thin.
- If Prisma/schema is touched:
  - create a production-safe migration
  - validate existing data handling
  - keep naming clear
- Preserve existing event creation behavior where possible.
- Preserve account/event scoping.

Hard scope guardrail:
This work is for EVENTS / Voice for Events admin experience only.
Do not touch SMB product, SMB marketing site, SMB signup/Stripe, retail voice survey flows, Google review/reputation flows, or VITE_SITE_MODE=smb behavior.

Acceptance checks:
- User can create an event from each starting point.
- Blank creates no initial areas.
- Non-blank templates create only real structure/touchpoints, not fake activity data.
- Created event opens the Event Workspace.
- Existing event creation tests pass or are updated.
- `npx prisma validate` passes if Prisma is touched.
- `npx prisma generate` passes if Prisma is touched.
- `npm run typecheck` passes.
- Relevant tests pass.

Return:
- Files changed.
- Template data/service added.
- Schema changes/migration if any.
- Behavior changed.
- Verification results.
- Assumptions or risks.
```

---

# Prompt 5 — Implement Event Workspace Shell and Overview Tab

```text
Model: Claude Opus
Reasoning: High

Admin / Voice App

Implement the redesigned Event Workspace shell and Overview tab.

Design references:
Use:
- docs/design/events/07-event-workspace-overview.png
- Also reference 08-event-workspace-areas.png and 09-event-workspace-surveys.png for tab continuity.

Task:
Redesign the event detail page into a polished Event Workspace with a strong event hero, metrics, tabs, setup/readiness overview, next best action, structure summary, and Command Center entry.

Product purpose:
The Event Workspace is where organizers configure the event, manage event structure, attach surveys, launch QR/kiosk links, and prepare live attendee intelligence.

It is not the live intelligence dashboard. The Command Center handles live action/evidence triage.

Needed layout:
1. Breadcrumb back to dashboard/home and venue/workspace context.
2. Event hero header:
   - status
   - dates
   - venue/location
   - event name
   - description
   - primary actions:
     - View Live Dashboard / View Command Center
     - Create Survey
     - Event Settings
3. Metric strip:
   - surveys
   - responses
   - answers captured
   - feedback points / event areas
4. Tabs:
   - Overview
   - Event Areas
   - Surveys
   - Operations
5. Overview tab:
   - Setup & Operations / Launch Readiness list
   - Next Best Action card
   - Event Structure summary
   - Command Center card
   - Event Settings card if useful

Before editing:
1. Identify the exact event detail route/component.
2. Identify current data available for event metrics, surveys, responses, answers, event areas.
3. Identify existing actions for dashboard, create survey, settings.
4. Identify current event area model and survey attachment state.
5. Identify whether schema changes are needed for any missing real count. The schema is not locked, but do not add fake derived data.

Scope:
- Redesign shell and Overview tab only.
- Stub/placeholder tab containers are acceptable only if they route to existing content or the later prompts will fill them.
- Do not fully redesign Event Areas tab in this prompt.
- Do not fully redesign Surveys tab in this prompt.
- Do not redesign Command Center in this prompt.
- Do not touch SMB/retail.

UX requirements:
- The event should feel like the hero object.
- Primary actions should be obvious.
- Readiness should show useful live state:
  - Event details
  - Event Areas
  - Surveys
  - Links & QR
  - Command Center
- Next Best Action should use real data:
  - e.g. touchpoints without surveys
  - surveys not launchable
  - no responses yet
  - command center ready
- If data is unavailable, show truthful empty states, not fake counts.
- Tabs should be visually consistent and support counts when real counts are available.
- Rows/cards should be clickable where they represent real objects.

Engineering requirements:
- Use shared event-only primitives.
- Keep data derivation in helpers where appropriate.
- Preserve existing event detail behaviors.
- Do not break create survey, settings, dashboard navigation.
- Keep account/event scoping intact.

Hard scope guardrail:
This work is for EVENTS / Voice for Events admin experience only.
Do not touch SMB product, SMB marketing site, SMB signup/Stripe, retail voice survey flows, Google review/reputation flows, or VITE_SITE_MODE=smb behavior.

Acceptance checks:
- Event hero renders real event info.
- Metric strip uses real counts or truthful missing states.
- Tabs render and navigation/state works.
- Overview readiness uses real event/survey/area/link data.
- Primary actions still work.
- No fake data is introduced.
- SMB/retail pages are untouched.
- `npm run typecheck` passes.
- Relevant tests pass or targeted tests are added/updated.

Return:
- Files changed.
- Behavior changed.
- Data derivations added.
- Any schema changes/migration if needed.
- Verification results.
- Assumptions or risks.
```

---

# Prompt 6 — Implement Event Areas Tab

```text
Model: Claude Opus
Reasoning: High

Admin / Voice App

Implement the redesigned Event Areas tab for the Event Workspace.

Design reference:
Use:
- docs/design/events/08-event-workspace-areas.png

Task:
Redesign the Event Areas tab so event structure is easy to scan, filter, manage, and connect to surveys.

Product purpose:
Event Areas are where attendee feedback is collected or categorized. They include event-wide feedback points, sessions, physical areas, sponsor activations, and custom touchpoints. This tab is where the organizer manages that structure and sees which touchpoints still need listening surveys.

Needed behavior:
1. Show Event Areas tab with count.
2. Show page title/subtitle:
   - Event Areas
   - Where and when attendee feedback is collected.
3. Add area/session button.
4. Search event areas/sessions/touchpoints.
5. Filter chips:
   - All
   - Event-wide
   - Sessions
   - Areas
   - Sponsor Activations
   - Custom Touchpoints
   - Needs survey
6. Group rows by category:
   - Event-wide
   - Sessions
   - Areas
   - Sponsor Activations
   - Custom Touchpoints
7. Each row should show:
   - name
   - description
   - category/status
   - date/time/timezone if available
   - survey attached or no survey yet
   - attach survey action when missing
   - edit action
   - archive action
8. Rows should be clickable.
9. Empty states should be polished.

Before editing:
1. Identify current Event Areas/EventStructureItem/SurveyTarget model and route usage.
2. Identify current create/edit/archive routes and UI.
3. Identify how surveys attach to areas/targets today.
4. Identify whether “needs survey” can be derived from current data.
5. Identify whether schema changes are required. The schema is not locked, but avoid unnecessary schema work.

Scope:
- Event Areas tab only.
- Do not redesign Surveys tab in this prompt.
- Do not redesign Command Center.
- Do not touch SMB/retail.

UX requirements:
- Event Areas should be manageable with many rows.
- Filters should be useful and not ornamental.
- “Attach survey” should be prominent when an area lacks a survey.
- Normal actions should be clearly separated from archive.
- Use consistent event terminology.
- Avoid icon-only critical actions.
- If there are no event areas, show a helpful state with Add Area / Session.

Engineering requirements:
- Preserve existing create/edit/archive APIs unless there is a clear bug.
- Keep business logic for “needs survey” in a helper if reused.
- Keep account/event scoping.
- Use real data only.
- Use shared event UI primitives where useful.

Hard scope guardrail:
This work is for EVENTS / Voice for Events admin experience only.
Do not touch SMB product, SMB marketing site, SMB signup/Stripe, retail voice survey flows, Google review/reputation flows, or VITE_SITE_MODE=smb behavior.

Acceptance checks:
- Event Areas tab renders grouped real areas.
- Search works.
- Filter chips work.
- Needs survey filter works using real survey attachment state.
- Attach survey action is visible for uncovered touchpoints.
- Edit/archive actions still work.
- Rows are clickable.
- Empty states are intentional.
- No fake data is introduced.
- `npm run typecheck` passes.
- Relevant tests pass or targeted tests are added/updated.

Return:
- Files changed.
- Behavior changed.
- Helper functions added.
- Any schema changes/migration if needed.
- Verification results.
- Assumptions or risks.
```

---

# Prompt 7 — Implement Surveys Tab

```text
Model: Claude Opus
Reasoning: High

Admin / Voice App

Implement the redesigned Surveys tab for the Event Workspace.

Design reference:
Use:
- docs/design/events/09-event-workspace-surveys.png

Task:
Redesign the Surveys tab so each live listening point is clear, launchable, and obviously connected to its event target.

Product purpose:
Surveys are voice listening points attached to event-wide feedback, sessions, areas, sponsor activations, or custom touchpoints. Each survey gets its own token-based kiosk link and QR code.

Needed behavior:
1. Show Surveys tab with count.
2. Show page title/subtitle:
   - Surveys
   - Active listening points — each gets its own token-based kiosk link.
3. Create Survey primary action.
4. Each survey card/row should show:
   - status
   - target/category
   - survey name
   - description
   - question count
   - response count
   - voice mode/voice-only if applicable
   - question preview/list
   - launchable status
   - QR code
   - View QR
   - Download PNG
   - Copy link
   - public launch URL
   - Launch Kiosk
   - Edit
   - Archive
5. Cards/rows should be clickable where appropriate.
6. Empty states should be polished.

Before editing:
1. Identify current survey model/routes/components for event voice surveys.
2. Identify how PublicSurveyLink/token URLs are generated and displayed.
3. Identify current QR code component/actions.
4. Identify current launch kiosk behavior.
5. Identify current edit/archive behavior.
6. Identify response count and question count data sources.
7. Identify schema gaps if any. The schema is not locked, but avoid fake data or duplicate systems.

Scope:
- Surveys tab only.
- Do not redesign Event Areas tab beyond linking/compatibility.
- Do not redesign Command Center.
- Do not touch SMB/retail.
- Preserve existing QR/kiosk behavior.

UX requirements:
- Survey must clearly show what it belongs to.
- QR/kiosk/link actions should be easy to find but not visually chaotic.
- Launch Kiosk should be the strongest action per survey.
- Edit and Archive should remain available.
- Archive should not be confused with destructive delete unless existing behavior is delete.
- Public URL should be copyable.
- QR code should use existing reliable QR behavior.
- No fake response counts or questions.

Engineering requirements:
- Reuse existing QR/link/kiosk flow.
- Keep account/event/survey scoping.
- Keep route handlers thin if backend changes are needed.
- Put repeated survey display derivations in helper functions.
- Do not create a second survey system.

Hard scope guardrail:
This work is for EVENTS / Voice for Events admin experience only.
Do not touch SMB product, SMB marketing site, SMB signup/Stripe, retail voice survey flows, Google review/reputation flows, or VITE_SITE_MODE=smb behavior.

Acceptance checks:
- Surveys tab renders all real surveys.
- Each survey clearly maps to an event target/category.
- Question count and response count are real.
- QR code actions still work.
- Public launch URL copies correctly.
- Launch Kiosk still works.
- Edit/archive still work.
- Empty state works when no surveys exist.
- No fake data is introduced.
- `npm run typecheck` passes.
- Relevant tests pass or targeted tests are added/updated.

Return:
- Files changed.
- Behavior changed.
- QR/link behavior confirmed.
- Any schema changes/migration if needed.
- Verification results.
- Assumptions or risks.
```

---

# Prompt 8 — Redesign Command Center / Live Dashboard

```text
Model: Claude Opus
Reasoning: High

Admin / Voice App

Implement the redesigned Command Center / Live Dashboard for Voice for Events.

Design reference:
Use:
- docs/design/events/10-event-command-center.png

Task:
Redesign the live dashboard into a real-time event command center focused on action, evidence, source context, sponsor value, and triage.

Product relationship:
- Event Workspace = setup, structure, survey deployment, QR/kiosk launch.
- Command Center = live attendee intelligence, action briefs, evidence review, operational triage, and sponsor value.

Needed behavior:
1. Header:
   - Back to Workspace
   - Command Center label
   - freshness/updated time
   - Refresh
   - Auto-refresh state
2. Event context:
   - event name
   - live intelligence title
   - description
   - survey filter
   - event area filter
3. Summary area:
   - analyzed answers/responses
   - high urgency count
   - inferred satisfaction or satisfaction score if real
   - priority mix
   - responses
   - answers analyzed
   - active attention
   - affected areas
   - event status
4. Needs Attention Now:
   - consolidated issue/action list
   - priority
   - sentiment
   - category/source
   - evidence count
   - last seen
   - recommended action
   - View evidence
   - Copy brief
   - status selector
5. Selected Issue Detail:
   - updates when an issue is selected
   - shows issue priority/sentiment
   - source/category
   - question asked
   - attendee evidence
   - recommended action
   - status
   - copy brief
6. Sponsor Activation Value:
   - clearly separated from operational triage
   - sponsor-related signal summary
   - evidence and follow-up clarity if real data exists
7. Intelligence Layer:
   - patterns/opportunities
   - feedback sources
   - question source breakdown
   - positive signals/what is working
8. Share/Kiosk/QR footer:
   - remains available
   - visually secondary to live intelligence

Before editing:
1. Identify current dashboard route/component.
2. Identify current action brief/issue/signal/evidence data shape.
3. Identify current filter behavior.
4. Identify current refresh/auto-refresh behavior.
5. Identify current status update behavior.
6. Identify current copy brief/view evidence behavior.
7. Identify whether issue selection state exists or must be added client-side.
8. Identify schema gaps if any. The schema is not locked, but do not add fake analytics.

Scope:
- Command Center/Dashboard page only.
- Do not redesign Event Workspace in this prompt.
- Do not touch underlying transcription/analysis pipeline unless a current dashboard bug requires it.
- Do not touch SMB/retail.

UX requirements:
- The most urgent issues should be obvious within seconds.
- Action Briefs, Recommended Actions, and Attention Queue should not feel like three disconnected duplicate sections.
- Issue cards/rows should be clickable.
- Selected issue detail should be useful even before clicking, with a clear empty state.
- Priority/sentiment/evidence/confidence should have clear hierarchy.
- Sponsor value should be its own section, not mixed into operational issue triage.
- Bottom intelligence layer should be useful but clearly secondary.
- QR/kiosk sharing should not dominate the dashboard.
- Empty states should exist for:
  - no responses
  - no urgent issues
  - no selected issue
  - no sponsor signals
  - no positive signals

Data rules:
- Use real data only.
- Do not invent fake satisfaction, fake priority mix, fake issues, fake sponsor value, fake evidence, or fake trends.
- If a metric is not available, omit it or present a truthful unavailable/empty state.

Engineering requirements:
- Preserve existing dashboard APIs where possible.
- Keep issue derivation in existing analytics/helpers or add a focused helper.
- Keep event/survey/area scoping tight.
- Preserve refresh/filter/status/view evidence/copy/launch behavior.
- Avoid broad refactors.

Hard scope guardrail:
This work is for EVENTS / Voice for Events admin experience only.
Do not touch SMB product, SMB marketing site, SMB signup/Stripe, retail voice survey flows, Google review/reputation flows, or VITE_SITE_MODE=smb behavior.

Acceptance checks:
- Dashboard feels like a live command center.
- Filters line up with Event Workspace surveys and event areas.
- Needs Attention Now uses real issue/action data.
- Issue selection updates Selected Issue Detail.
- Evidence review works.
- Status updates work.
- Copy brief works.
- Sponsor value uses real sponsor-related signals or shows empty state.
- Intelligence layer uses real data or truthful empty states.
- QR/kiosk footer actions still work.
- No fake data is introduced.
- `npm run typecheck` passes.
- Relevant tests pass or targeted tests are added/updated.

Return:
- Files changed.
- Behavior changed.
- Data derivations/helpers added.
- Any schema changes/migration if needed.
- Verification results.
- Assumptions or risks.
```

---

# Prompt 9 — Responsive Polish, Empty States, and Test Pass

```text
Model: Claude Opus
Reasoning: High

Admin / Voice App

Run a final product polish, responsive behavior, empty-state, and test pass across the redesigned Voice for Events admin experience.

Design references:
Use all docs/design/events/ images as the intended connected product experience:
- Events Home
- Create Event
- Event Workspace Overview
- Event Workspace Event Areas
- Event Workspace Surveys
- Command Center

Task:
Review and polish the completed three-tier Events experience so it feels cohesive, responsive, and production-ready.

Pages in scope:
1. Events Home / Account Command Hub
2. Create Event flow
3. Event Workspace shell and Overview tab
4. Event Areas tab
5. Surveys tab
6. Command Center / Live Dashboard

Polish goals:
1. Consistent spacing, hierarchy, typography, status pills, action buttons, and card styles.
2. Clean desktop layout.
3. Clean tablet/mobile stacking.
4. No mile-long chaotic sections when content grows.
5. Polished loading states.
6. Polished empty states.
7. Clear disabled states.
8. Clickable rows/cards where objects are represented.
9. Critical actions have labels.
10. Destructive actions are separated.
11. No accidental SMB/retail visual regressions.

Scenarios to verify:
- no events yet
- one active event
- multiple events
- event with no areas
- event with many areas
- event with no surveys
- event with surveys but no responses
- event with responses and issues
- event with no urgent issues
- event with no sponsor signals
- long event names
- long area/session names
- long survey names
- missing optional venue/date
- mobile/tablet viewport behavior

Schema note:
The schema is not locked, but this prompt should not introduce schema changes unless a real blocker or data integrity bug remains from previous prompts. If a schema issue is discovered, explain it before changing it.

Scope:
- Polish and tests across Events only.
- Do not redesign unrelated app surfaces.
- Do not touch SMB/retail.
- Do not add new product features outside the redesigned event experience.

Testing:
Add or update targeted tests where practical for:
- Events Home active event actions.
- Create Event validation/template selection.
- Event Workspace tab rendering and counts.
- Event Areas search/filter/needs survey behavior.
- Surveys tab QR/link/launch rendering.
- Command Center issue selection and selected issue detail.
- Empty states that previously could crash.

Verification commands:
- `npm run typecheck`
- `npm test`
- If Prisma was touched in prior prompts or this prompt:
  - `npx prisma validate`
  - `npx prisma generate`

Hard scope guardrail:
This work is for EVENTS / Voice for Events admin experience only.
Do not touch SMB product, SMB marketing site, SMB signup/Stripe, retail voice survey flows, Google review/reputation flows, or VITE_SITE_MODE=smb behavior.

Acceptance checks:
- The three-tier Events product feels visually connected.
- Events Home clearly leads to Workspace and Command Center.
- Event Workspace clearly manages setup, structure, surveys, QR/kiosk, and operations.
- Command Center clearly handles live action/evidence triage.
- Responsive behavior is acceptable.
- Empty/loading/disabled states are intentional.
- Existing flows still work.
- No fake data is introduced.
- SMB/retail pages are untouched.
- Typecheck passes.
- Tests pass, or any existing unrelated failures are clearly identified with evidence.

Return:
- Files changed.
- Polish improvements made.
- Tests added/updated.
- Verification results.
- Confirmation that SMB/retail were not touched.
- Remaining risks or follow-up recommendations.
```

---

## Suggested Execution Loop

Use this order exactly:

```text
1. Prompt 1 — Audit current Events routes/components
2. Prompt 2 — Shared event UI primitives
3. Prompt 3 — Events Home redesign
4. Prompt 4 — Create Event flow/template picker
5. Prompt 5 — Event Workspace shell + Overview tab
6. Prompt 6 — Event Areas tab
7. Prompt 7 — Surveys tab
8. Prompt 8 — Command Center dashboard
9. Prompt 9 — Responsive polish + test pass
```

After each prompt:
1. Review Claude’s file changes.
2. Confirm it did not touch SMB/retail.
3. Run the listed verification.
4. Fix any regressions before continuing.
5. Commit before moving to the next prompt if the loop file calls for commits.
