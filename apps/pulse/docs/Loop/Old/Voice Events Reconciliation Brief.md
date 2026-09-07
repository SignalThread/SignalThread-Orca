# Voice Events Visual Reconciliation Brief

## Objective

Bring the lifecycle-aware Voice Events workspace into close visual and structural parity with the approved HTML prototype while preserving the real application, real seeded data, and all working behavior.

This is no longer a broad redesign or incremental styling exercise. The approved HTML is the visual and interaction source of truth. The live app remains the source of truth for data, APIs, permissions, navigation, loading states, and mutations.

## Current Test Target

```text
http://localhost:3001/app/events/event_events_demo_summit_2026?account=events-demo
```

Use lifecycle overrides as needed:

```text
&lifecycle=pre-event
&lifecycle=in-event
&lifecycle=post-event
```

## What Has Already Been Completed

### Workspace freeze fixed

The prior page freeze was caused by a browser main-thread loop in `EventWorkspaceShell`, not Prisma or Supabase.

A `MutationObserver` watched the `<html>` class while repeatedly removing `dark`, causing Chromium to recursively emit mutations and starve React state commits. The fix removed the self-observing loop and replaced it with a bounded theme override and cleanup.

Verified after the fix:

- no Page Unresponsive warning
- repeated authenticated production-mode reloads succeed
- focused component and Playwright coverage passes
- full test suite, typecheck, and production build pass

Do not reintroduce a `MutationObserver` or unbounded theme enforcement.

### Database-loading improvements preserved

The Events Home intelligence bootstrap previously hydrated hundreds of response relations. That query was narrowed to grouped aggregates, and Setup now loads an agenda summary instead of the full agenda payload.

These improvements were useful but were not the root cause of the browser freeze. Preserve them.

### Lifecycle preview implemented

The shared workspace now supports:

- date-derived lifecycle as the default
- `lifecycle=pre-event|in-event|post-event` URL overrides
- persistence across refresh and tab navigation
- removal of the parameter when the selected lifecycle equals the date-derived default
- safe fallback for invalid values
- view-only behavior with no event date, status, or database mutation

The seeded event is future-dated, so it naturally defaults to Pre-event. Use `lifecycle=in-event` and `lifecycle=post-event` to access the other approved states.

### Shared shell received an initial pass

The shared event header, lifecycle selector, navigation, tabs, width, and shared visual primitives are closer to the approved design, but the individual pages are still structurally wrong.

## Why the Earlier Visual Passes Fell Short

The live pages still use legacy page compositions that do not match the approved HTML. Styling the existing modules only creates incremental improvement.

The prior prompt incorrectly prevented page-specific structural and information-architecture changes. That forced the agent to polish the wrong component tree instead of replacing it.

From this point forward:

- structural replacement is allowed
- legacy modules may be removed when absent from the approved HTML
- real data must be mapped into the approved composition
- do not stop at “closer”

## Approved References

Use the approved HTML as the primary visual reference:

```text
docs/Loop/Event Workspace Redesign Voice Events (1).html
```

Prompt pack:

```text
docs/Loop/Voice Events Visual Reconciliation Prompts.md
```

Generic loop controller:

```text
docs/Loop/GENERIC_PROMPT_LOOP_CONTROLLER.md
```

Plan/brief document location when copied into the repo:

```text
docs/Loop/Voice Survey Redesign Brief.md
```

The screenshots are useful for quick comparison, but the approved HTML is authoritative.

## Execution Plan

Run the visual reconciliation one focused prompt at a time, using the generic loop controller:

1. In-event Overview
2. In-event Intelligence
3. In-event Sessions
4. In-event Speakers
5. In-event Actions
6. Complete Pre-event experience
7. Complete Post-event experience
8. Final cross-page and cross-lifecycle QA

For each prompt, complete the page before moving on:

1. Open the exact approved HTML state.
2. Open the live page at the same lifecycle and desktop viewport.
3. Inspect the real component tree and data sources.
4. Replace the page-specific structure where needed.
5. Map real seeded data into the approved layout.
6. Browser-compare the two versions.
7. Correct visible mismatches.
8. Repeat until structure, hierarchy, density, spacing, typography, and interactions closely match.
9. Run targeted tests, the relevant browser journey, and typecheck.

## Required Behavior to Preserve

Do not break or replace:

- real account and event scoping
- persisted event, survey, response, session, speaker, evidence, and action data
- lifecycle URL behavior
- Setup and Signals navigation
- Overview, Intelligence, Sessions, Speakers, and Actions tab navigation
- loading, error, Retry, empty, and selected states
- filters and URL context
- evidence drilldowns
- action assignment, notes, status transitions, and canonical mutations
- existing database query optimizations
- responsiveness and browser stability

## Hard Constraints

Do not:

- change Prisma schema or add migrations
- add a second event, intelligence, evidence, or action system
- hard-code sample values from the HTML
- replace real API data with demo-only client data
- modify kiosk, authentication, or unrelated setup flows
- perform broad architecture refactors during a page visual pass
- preserve legacy modules merely because they already exist
- claim visual parity while obvious differences remain

If the approved structure requires broader architecture or more than the prompt’s safe file limit, stop and report the exact blocker rather than improvising a large refactor.

## Visual Standard

Each completed page should match the approved HTML in:

- information architecture
- section order
- content hierarchy
- grid and column structure
- content width
- card composition
- typography scale and weight
- spacing and density
- borders, radius, shadows, pills, and controls
- responsive behavior
- visible interactions and selected states

The goal is not pixel-perfect imitation at the cost of maintainability, but it must be visibly recognizable as the same approved product—not a restyled legacy page.

## Current Starting Point

Start with Prompt 1: **In-event Overview**.

Use:

```text
http://localhost:3001/app/events/event_events_demo_summit_2026?account=events-demo&lifecycle=in-event
```

The Overview must be treated as a page-specific structural reconciliation, not a CSS cleanup. Remove legacy Overview modules that are not present in the approved HTML and map real data into the approved review, working-signal, coverage/confidence, follow-up, and leadership-brief composition.

## Completion Reporting

At the end of each prompt, report:

- exact files changed
- legacy structure removed or replaced
- real-data mapping used
- interactions verified
- visual comparison result
- targeted tests and typecheck results
- any visible difference that could not be closed

Do not move to the next prompt until the active page is complete and verified.
