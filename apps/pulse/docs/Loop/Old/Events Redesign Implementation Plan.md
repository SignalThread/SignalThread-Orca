# SignalThread Events Redesign Implementation Plan

## Purpose

This plan defines how Claude Opus should implement the redesigned SignalThread Voice for Events experience across the three connected product tiers:

1. **Events Home** — account/event command hub.
2. **Event Workspace** — setup, event structure, survey deployment, QR/kiosk launch, and operations.
3. **Command Center / Live Dashboard** — live attendee intelligence, action briefs, evidence review, sponsor value, and operational triage.

The work should be implemented as a phased product redesign, not as one giant rewrite.

The design references should be treated as **visual and workflow direction**, not pixel-perfect specs. Preserve existing backend behavior unless a specific bug is found.

---

## Product Framing

This is the **SignalThread Voice for Events** use case.

The product promise is:

> Live attendee voice → event signals → action while the event is still happening.

This is not generic surveys, storefront reviews, Google reviews, SMB reputation management, or monthly feedback reporting.

Use this event language consistently:

- Event Workspace
- Command Center
- Live Intelligence
- Event Areas
- Sessions
- Sponsor Activations
- Custom Touchpoints
- Surveys
- Listening points
- Kiosk
- QR
- Action Briefs
- Evidence
- Sponsor value

---

## Design References

Place the renamed design images in the repo before implementation.

Recommended folder:

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

These images represent the target workflow and design quality. Claude should not treat them as strict pixel-perfect specs.

---

## Non-Negotiable Constraints

- Do not touch unrelated retail, SMB, or storefront review behavior.
- Do not create a second event system.
- Do not create a second survey system.
- Do not create fake analytics, fake issues, fake trends, fake scores, fake responses, or fake events.
- Use real existing data only.
- Preserve existing create/open/edit/archive/dashboard/QR/kiosk flows unless intentionally changing a bug.
- Critical rows/cards that represent real objects should be clickable.
- Critical actions should have clear labels, not only icon buttons.
- Destructive actions must be visually separated from normal operational actions.
- Backend rules must remain server-enforced; UI should reflect truth, not create truth.
- Keep route handlers thin and business logic centralized in existing service/helper layers.
- Add targeted tests for changed behavior.

---

## Expected Implementation Areas

Claude must audit and confirm the exact files before editing.

Likely areas include:

```text
app/app/page.tsx
app/app/events/page.tsx
app/app/events/[eventId]/page.tsx
app/app/events/[eventId]/dashboard/page.tsx
components/app/**
lib/event-voice-surveys.ts
lib/event-dashboard/**
lib/analytics/**
```

Do not assume these are complete or exact. The first implementation pass must map the actual current route/component structure.

---

# Phase 1 — Audit Current Event Routes and Data Flow

## Goal

Before editing, identify how the current event admin surfaces are wired.

## Tasks

Claude should inspect:

- Events home route.
- Event create flow.
- Event detail/workspace route.
- Event dashboard/command center route.
- Event area/session/touchpoint components.
- Survey creation and survey listing components.
- QR/kiosk launch actions.
- Dashboard filters, evidence, action briefs, and refresh behavior.
- Existing tests covering these surfaces.

## Return

Claude should return:

1. Exact files involved.
2. Current route structure.
3. Current data-fetching/API calls.
4. Current reusable components.
5. Existing tests.
6. Recommended implementation sequence based on real files.
7. Risks or areas where backend behavior may be tied to UI assumptions.

## Acceptance

- No files changed.
- Exact implementation targets identified.
- Risks called out before any redesign work begins.

---

# Phase 2 — Shared Event UI Primitives

## Goal

Build a shared event UI layer so the three pages feel like one connected product instead of three unrelated redesigns.

## Components / Patterns to Create or Consolidate

Use existing components where possible, but create shared components when they reduce duplication.

Suggested primitives:

```text
EventPageShell
EventHeroHeader
EventMetricStrip
EventStatusPill
EventPrimaryActions
EventTabs
EventObjectRow
EventReadinessList
EventEmptyState
EventFilterBar
EventQRCodeActions
```

Do not over-abstract every card. Focus on the repeated product patterns that appear across the home page, workspace, and command center.

## Acceptance

- Shared components are reusable but not bloated.
- Visual language supports all three tiers.
- Existing behavior still works.
- Retail/SMB surfaces are untouched.
- No backend behavior changes unless required.

---

# Phase 3 — Events Home / Account Command Hub

## Goal

Replace the prototype admin menu with a polished event operations home base.

## Page Role

The Events Home is the account-level command hub. It should help users quickly find the active event, open the Event Workspace, view the Command Center, or create/manage event containers.

## Current Problems to Fix

- The page feels like a prototype admin menu.
- Top cards are too generic.
- The active event is not treated as the main object.
- Critical actions are hidden behind icon-only buttons.
- The event list does not clearly guide the next action.

## Required Behavior

- Show account/admin context clearly.
- Feature the active/live event as the hero object when one exists.
- Make `Open Workspace` and `View Command Center` obvious primary actions.
- Keep `Create Event` available, but do not let it dominate when an active event exists.
- Make event rows/cards clickable.
- Replace critical icon-only actions with labeled actions.
- Visually separate destructive actions like delete.
- Support both one-event and many-event states.
- Include polished empty states for:
  - no events yet
  - no responses yet
  - no active event
  - missing workspace/venue data

## Acceptance

- The page feels like a polished event operations home.
- The active event is easy to find and open.
- Workspace and Command Center entry points are obvious.
- Event rows/cards are clickable.
- Critical actions are labeled.
- Destructive actions are separated.
- Stats use real data only.
- Existing create/open/edit/dashboard/QR/delete flows still work.
- Retail/SMB pages are untouched.

---

# Phase 4 — Create Event Flow / Template Selection

## Goal

Implement the polished event creation flow shown in the design references.

## Page Role

The create flow should help the user create an Event container and optionally prebuild the event structure based on a starting template.

## Required Behavior

User can enter:

- Event name.
- Optional venue.
- Optional dates.

User can choose a starting point:

- Conference
- Expo / Trade Show
- Workshop
- Brand Activation
- Blank Event

The selected starting point should preview what the event starts with.

Examples:

```text
Conference starts with: Registration · Keynotes · Sessions · Expo Floor · Networking
Expo / Trade Show starts with: Expo Floor · Exhibitor Booths · Sponsor Activations · Registration
Workshop starts with: Sessions · Breakout Rooms · Overall Experience
Brand Activation starts with: Sponsor Zones · Brand Experiences · Custom Touchpoints
Blank Event starts with: No areas yet — you'll add your own
```

## Important Product Rule

Templates create **event structure only**.

They must not create:

- fake survey responses
- fake dashboard analytics
- fake action briefs
- fake sponsor value
- fake evidence

## Implementation Notes

Claude must first check whether event templates/seeding already exist.

If they exist:

- Reuse the existing implementation.
- Update the UI and wiring only as needed.

If they do not exist:

- Add the smallest safe backend/service support for creating starter event structure.
- Keep it deterministic.
- Keep route handlers thin.
- Add targeted tests.

## Acceptance

- Create button enables only when required fields are valid.
- Template selection is clear.
- Structure preview updates when selection changes.
- Blank event creates no areas.
- Other templates create real event structure only.
- Created event opens the Event Workspace.
- Existing event creation still works.
- No fake analytics/data is created.

---

# Phase 5 — Event Workspace Shell and Overview

## Goal

Implement the redesigned Event Workspace shell and Overview tab.

## Page Role

The Event Workspace is setup and deployment. It is where organizers manage event structure, attach surveys, and launch listening points.

It is not the live intelligence dashboard.

## Required Top-Level Structure

The workspace should include:

- Breadcrumbs back to dashboard/home.
- Event hero header.
- Status, dates, venue/workspace context.
- Primary actions:
  - View Live Dashboard / Command Center
  - Create Survey
  - Event Settings
- Metric strip:
  - Surveys
  - Responses
  - Answers Captured
  - Feedback Points
- Tabs:
  - Overview
  - Event Areas
  - Surveys
  - Operations

## Overview Tab Should Show

- Setup & Operations readiness list.
- Next best action card.
- Event Structure summary.
- Command Center entry card.
- Event Settings card.

## Acceptance

- Workspace has a clear setup/deployment role.
- Event hero and primary actions are obvious.
- Tabs are wired and preserve navigation/state as appropriate.
- Readiness list uses real data only.
- Next best action uses real gaps only, such as touchpoints with no surveys.
- Command Center entry links to the dashboard.
- Settings link still works.

---

# Phase 6 — Event Areas Tab

## Goal

Make Event Areas manageable at scale.

## Required Behavior

Show event structure grouped by:

- Event-wide
- Sessions
- Areas
- Sponsor Activations
- Custom Touchpoints

Include:

- Search.
- Filters/chips by area type.
- `Needs survey` filter.
- Add Area / Session action.
- Row status showing whether a survey is attached.
- Attach survey action where missing.
- Edit action.
- Archive action.
- Clickable rows.

## Acceptance

- User can quickly see which touchpoints still need surveys.
- Filters and search are useful with many items.
- Rows/cards are clickable.
- Attach survey, edit, and archive actions still work.
- Existing data model is reused.
- No fake areas are introduced outside template-created real data.

---

# Phase 7 — Surveys Tab

## Goal

Make each survey feel like a launchable event listening point.

## Required Behavior

Each survey row/card should show:

- Survey status.
- Target type/category.
- Attached Event Area/Session/Touchpoint.
- Survey name.
- Description.
- Question count.
- Response count.
- Voice-only or voice setting indicator if available.
- Question preview.
- QR code.
- Public launch URL.
- View QR.
- Download PNG.
- Copy link.
- Launch Kiosk.
- Edit.
- Archive.

## Acceptance

- Surveys clearly show what they belong to.
- QR/kiosk actions remain wired.
- Public URL copy still works.
- Survey cards/rows are clickable where appropriate.
- Edit/archive actions still work.
- Empty state is polished when no surveys exist.
- No fake surveys or responses are introduced.

---

# Phase 8 — Operations Tab

## Goal

Create a useful operational tab if the product needs a dedicated place for launch readiness, QR sharing, settings, and command-center handoff.

## Guidance

Do not invent an unnecessary tab if the existing Overview already handles this cleanly. If kept, Operations should focus on operational readiness and launch tasks, not duplicate Event Areas or Surveys.

Possible content:

- Readiness checklist.
- QR/link deployment summary.
- Command Center live status.
- Settings shortcuts.
- Uncovered touchpoints.

## Acceptance

- The tab has a clear purpose.
- It does not duplicate other tabs without reason.
- It uses real data only.
- Empty states are useful.

---

# Phase 9 — Command Center / Live Dashboard

## Goal

Turn the dashboard into a live event command center for action, evidence, and triage.

## Page Role

The Command Center answers:

1. What needs action right now?
2. Why does it matter?
3. Where is it happening?
4. What evidence supports it?
5. What should the team do next?

## Required Layout

Include:

- Compact command-center header.
- Back to Workspace action.
- Event context.
- Survey filter.
- Event Area filter.
- Updated time.
- Refresh / auto-refresh controls.
- Top summary with:
  - urgent issue summary
  - satisfaction / inferred satisfaction
  - priority mix
  - responses
  - answers analyzed
  - active attention
  - affected areas
  - event status
- `Needs Attention Now` issue list.
- Selected issue detail / evidence panel.
- Sponsor Activation Value module.
- Intelligence Layer.
- Secondary share/QR/kiosk footer.

## Important Behavior

- Issue cards/rows are clickable.
- Selecting an issue updates the selected issue detail panel.
- Action Briefs, Recommended Actions, and Attention Queue should not remain three disconnected duplicate-feeling sections.
- Sponsor value is visually separated from operational triage.
- Evidence is easy to access and understand.
- QR/kiosk sharing remains available but secondary.

## Acceptance

- The page feels like a live event command center.
- The most urgent issues are obvious within seconds.
- Issue/source/evidence/recommended action are clear.
- Filters align with Event Workspace Event Areas and Surveys.
- Selected issue detail updates correctly.
- Existing refresh/filter/status/view-evidence/copy/launch flows still work.
- Sponsor value uses real sponsor-related signals only.
- No fake scores, trends, issues, or evidence are introduced.

---

# Phase 10 — Responsive and Product Polish Pass

## Goal

After the three tiers are implemented, run one focused polish pass across the full workflow.

## Check

- Desktop spacing.
- Tablet/mobile stacking.
- Long event names.
- Many event areas.
- Many surveys.
- No events.
- No active event.
- No surveys.
- No responses.
- No command-center issues.
- No sponsor signals.
- Loading states.
- Disabled states.
- Empty states.
- Button hierarchy.
- Clickable object rows.
- Destructive action separation.
- Consistent language across all three pages.

## Product-Grade UX Standard

Avoid mechanical, database-shaped UI.

Think like a strong product designer:

- clear hierarchy
- obvious primary actions
- useful empty states
- polished responsive workflows
- consistent terminology
- scannable information architecture
- no filler cards

## Acceptance

- The flow feels like one connected product.
- Users can move from Home → Workspace → Command Center naturally.
- The UI is polished and responsive.
- No unrelated surfaces changed.

---

# Phase 11 — Tests and Verification

## Minimum Test Coverage

Add or update targeted tests for:

- Home renders event list and active event actions.
- Home event row/card click opens workspace.
- Create event validates required fields.
- Template selection updates structure preview.
- Template-created event structure is correct.
- Event Workspace tabs render correct real counts.
- Event Areas search/filter works.
- Event Areas `Needs survey` filter works.
- Attach survey action remains wired.
- Survey QR/link/kiosk actions remain wired.
- Dashboard filters work.
- Issue selection updates selected issue detail.
- Empty states render without crashes.

## Verification Commands

Run:

```text
npm run typecheck
npm test
```

If Prisma/schema/event creation logic changes, also run:

```text
npx prisma validate
npx prisma generate
```

## Return Format for Each Claude Pass

Claude should return:

1. Files changed.
2. Behavior changed.
3. Screens/flows affected.
4. Tests added or updated.
5. Verification results.
6. Any assumptions or risks.
7. Anything intentionally left for a later phase.

---

# Recommended Claude Execution Order

Do not give Claude all pages at once.

Use this order:

1. Audit current events routes/components and map implementation files.
2. Shared event UI primitives.
3. Events Home redesign.
4. Create Event flow/template selection.
5. Event Workspace shell + Overview tab.
6. Event Areas tab.
7. Surveys tab.
8. Operations tab, if still useful.
9. Command Center dashboard.
10. Responsive/product polish pass.
11. Tests and verification pass.

This keeps each pass reviewable and prevents Claude from accidentally rewriting unrelated parts of the product.

---

# First Prompt to Give Claude

```text
Model: Claude Opus 4.1
Reasoning: High

Admin / Voice App — Events Redesign

Audit only. Do not change files.

We are implementing the redesigned SignalThread Voice for Events experience across three connected tiers:
1. Events Home / account command hub.
2. Event Workspace / setup, event areas, surveys, QR/kiosk deployment.
3. Command Center / live intelligence dashboard.

Design references are in:
docs/design/events/

Task:
Audit the current code paths for these event pages and map the implementation plan to actual files/components/routes.

Inspect:
- Events home route.
- Create event flow.
- Event detail/workspace route.
- Event dashboard/command center route.
- Event area/session/touchpoint components.
- Survey creation/listing components.
- QR/kiosk launch actions.
- Dashboard filters, action briefs, evidence, refresh, and status flows.
- Existing tests that cover these areas.

Return:
1. Exact files involved.
2. Current route structure.
3. Current data-fetching/API calls.
4. Current reusable components.
5. Existing tests.
6. Recommended implementation sequence based on the real codebase.
7. Risks or places where backend behavior may be tied to UI assumptions.

Constraints:
- Audit only.
- Do not edit files.
- Do not refactor.
- Do not touch retail/SMB behavior.
- Do not create a second event system.
- Do not create fake data.
```
