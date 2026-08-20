# Session Workspace Nav Alignment — Prompt Pack

## Purpose

This prompt pack implements the session workspace navigation alignment work described in the session workspace nav audit/brief.

The current session workspace still feels like a separate product surface because it uses a custom dark `SessionCommandRail`, while the event-level workspace uses the light event sidebar/navigation language. The goal is to remove the custom dark session-nav presentation and replace it with the same event-level navigation vocabulary, without breaking the session workspace behavior.

## Loop setup

Use with the generic loop controller.

```text
Loop controller:
docs/loop/GENERIC_PROMPT_LOOP_CONTROLLER.md

Plan document:
docs/loop/Session Workspace Nav Alignment Brief.md

Prompt document:
docs/loop/Session Workspace Nav Alignment Prompt Pack.md

Expected branch:
chore/session-workspace-nav-alignment

Schema mode:
LOCKED

Allowed scope:
Session workspace navigation alignment only. Extract shared event nav primitive, restyle the session workspace nav/header to match the event-level workspace, and add regression coverage for navigation, gates, access assumptions, and deep links.

Out of scope:
Prisma schema changes, migrations, generated client changes, backend route/service/API changes, event-level navigation redesign, Roadmap/Budget/Docs/Event Directory behavior changes, task APIs, Matrix snapshot shape changes, Room Set/Seating route deletion, session registration route deletion, and broad app-shell rewrites.

Canonical files/models/services:
- web/app/(shell)/events/[eventId]/_components/event-workspace-shell.tsx
- web/app/(shell)/events/[eventId]/_components/event-module-header.tsx
- web/app/(shell)/events/[eventId]/_components/event-module-switcher.tsx
- web/app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx
- web/src/config/features.ts
- web/config/features.ts
- web/lib/planning/routes.ts
- web/lib/session-readiness.ts
- web/lib/event-access.ts
```

## Global constraints for all prompts

- Keep schema locked.
- Do not change Prisma schema.
- Do not create migrations.
- Do not change generated client files.
- Do not change backend routes, services, APIs, or route contracts.
- Do not remove Room Set, Seating, attendee/session registration, speaker, F&B, AV, staffing, or Matrix routes/services.
- Preserve EVENT_VIEWER/read-only behavior. The UI may guide/disable where already intended, but server-side enforcement remains canonical.
- Preserve production-only Coming soon gates for Room Set, Seating, and session registration.
- Preserve non-production/dev behavior for Room Set, Seating, and session registration unless a test explicitly simulates production gating.
- Preserve existing session workspace route behavior, deep links, hash/tab behavior, and Back to Run of Show behavior.
- Preserve Matrix 2 quick drawer behavior and Run of Show session workspace routes.
- Keep changes low-blast-radius and prompt-scoped.
- Do not proceed to the next prompt until the active prompt is complete and verified.
- Do not commit unless explicitly asked.

---

# Prompt 1 — Extract shared event nav primitive + tokens

## Goal

Extract the event-level left navigation item rendering/tokens into a shared primitive, then refactor the event workspace shell to consume it with no visual or behavioral change.

This is a pure refactor. Do not touch the session workspace yet.

## Scope

Primary files to inspect:

- `web/app/(shell)/events/[eventId]/_components/event-workspace-shell.tsx`
- `web/app/(shell)/events/[eventId]/_components/event-workspace-shell.module.css`
- existing tests around event nav/sidebar and route active state

Likely new file:

- `web/app/(shell)/events/[eventId]/_components/shell-nav-primitives.tsx`

## Requirements

1. Create a shared event-shell nav primitive file.

   Export at minimum:

   - `isPathActive(pathname, href)`
   - `SidebarNavItem`

2. `SidebarNavItem` must support the event nav’s existing behavior and styling:

   - `href` / Link mode
   - `onClick` / button mode if needed for future session rail use
   - icon
   - label
   - optional description/subtitle if useful for the future session nav
   - optional badge/pill
   - disabled state
   - collapsed and expanded sidebar display
   - active state
   - `aria-current` / accessible active state

3. Preserve current event nav visual language exactly:

   - `h-10`
   - rounded nav item treatment
   - active `border-[#0B1638] bg-[#0B1638] text-white shadow-sm`
   - inactive slate text + hover treatment
   - disabled muted state
   - existing “Coming soon” pill behavior
   - existing icon sizing
   - existing collapsed behavior

4. Refactor only the event shell to consume the primitive.

   Update:

   - `web/app/(shell)/events/[eventId]/_components/event-workspace-shell.tsx`

   Do not intentionally change:

   - event sidebar appearance
   - event sidebar behavior
   - collapse/expand behavior
   - event directory group behavior
   - active route matching
   - disabled/Coming soon behavior
   - session route bypass

5. Do not touch the session workspace in this prompt.

   Specifically do not edit:

   - `web/app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx`

## Tests

Add/update focused source/regression coverage proving:

- the event shell imports/uses the shared primitive
- `isPathActive` still supports exact/prefix active matching as before
- active nav token still includes `bg-[#0B1638]`
- disabled/Coming soon behavior remains present
- collapsed/expanded support remains present

Do not add broad screenshot tests.

## Verification

Run targeted tests for changed event shell/nav files.

Then run:

```bash
npm --prefix web run test:summary
npm --prefix web run typecheck
cd web && npx next build --webpack
git diff --check
```

## Stop report

Use the loop-controller stop format and include:

- files changed
- what was extracted
- confirmation event nav did not intentionally change visually/behaviorally
- tests added/updated
- exact commands and pass/fail counts
- confirmation session workspace was not touched
- confirmation schema/migrations/generated client/backend routes were not changed
- known limitations/follow-up

---

# Prompt 2 — Replace the dark SessionCommandRail presentation with the event light nav system

## Goal

Remove the custom dark left-nav presentation from the session workspace and restyle/replace `SessionCommandRail` with the shared event-nav primitive from Prompt 1.

Important: this does **not** delete session module navigation behavior. It replaces the dark local rail visual language with the event-level light nav pattern while preserving the tab/hash interaction model.

## Scope

Primary files to inspect/edit:

- `web/app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx`
- `web/app/(shell)/events/[eventId]/_components/shell-nav-primitives.tsx`
- tests covering session command center/nav/linkage/gates

## Requirements

1. Replace the dark `SessionCommandRail` visual treatment.

   Remove/replace the dark local nav styling such as:

   - dark navy full-bleed rail presentation
   - white-alpha active states
   - teal Back to Run of Show block styling
   - dark disabled pills
   - bespoke `railItemClasses` if it conflicts with the shared primitive

   Use the shared event nav primitive/tokens instead.

2. Preserve the session workspace navigation behavior.

   Keep:

   - `WORKSPACE_FOCUS_ITEMS`
   - module labels: Overview, Speakers, AV, F&B, Staffing, Conflicts, Notes / Activity
   - `activeTab` state
   - `focusWorkspaceTab`
   - URL hash behavior
   - `?tab=` initialization/deep-link behavior
   - Back to Run of Show behavior
   - Room Set / Seating route-link behavior where enabled
   - production-only gates where disabled

3. Keep the session route shell bypass intact.

   Do not change the event shell bypass for session command center routes unless the plan explicitly says so. The session route should keep its full-height workspace behavior for now.

4. Module mapping must remain stable.

   Current session modules should map as:

   | Current | Recommended label | Behavior |
   |---|---|---|
   | Overview | Overview | tab/hash target |
   | Speakers | Speakers | tab/hash target |
   | AV | AV | tab/hash target |
   | F&B | F&B | tab/hash target |
   | Staffing | Staffing | tab/hash target |
   | Conflicts | Conflicts | tab/hash target |
   | Notes / Activity | Notes / Activity | tab/hash target |
   | Room Set | Room Set or combined Room Set & Seating depending current product gate work | production-gated route link-out |
   | Seating | Seating or combined Room Set & Seating depending current product gate work | production-gated route link-out |

5. Preserve production gates.

   In production:

   - Room Set and Seating must remain Coming soon / disabled according to the current gate behavior.
   - Session registration / Attendee Roster must remain Coming soon / disabled according to the current gate behavior.

   In non-production/dev/test:

   - existing active behavior must remain unless a test explicitly simulates production mode.

6. Preserve route/link behavior.

   Do not delete direct routes.
   Do not delete Room Set/Seating routes.
   Do not remove route files.
   Do not remove backend APIs/services.

7. Keep the new nav visually aligned to the event-level nav.

   Use:

   - light background/surface language
   - event nav active state
   - event nav disabled state
   - event nav typography/spacing/icon sizes
   - design-system-aligned muted text and badges

## Tests

Add/update focused coverage proving:

- the session workspace no longer uses the dark local nav styling as the primary visible nav
- session nav consumes/imports the shared nav primitive
- active tab state still works
- `?tab=` and hash behavior remain intact
- Back to Run of Show still renders and routes correctly
- Room Set/Seating production gates remain intact
- session registration production gate remains intact
- direct route files/services are not deleted

Update existing source-regression tests that intentionally asserted old dark classes to assert the new event-light nav style instead.

Do not add broad screenshot tests.

## Verification

Run targeted session workspace/nav tests.

Then run:

```bash
npm --prefix web run test:summary
npm --prefix web run typecheck
cd web && npx next build --webpack
git diff --check
```

## Stop report

Use the loop-controller stop format and include:

- files changed
- how the dark session nav was removed/replaced visually
- what behavior was preserved
- tests added/updated
- exact commands and pass/fail counts
- confirmation gates/deep links/back link were preserved
- confirmation schema/migrations/generated client/backend routes were not changed
- known limitations/follow-up

---

# Prompt 3 — Restyle the session header to the Command Center/event module system

## Goal

Restyle the session workspace header so it matches the event-level Command Center/module styling instead of feeling like a separate custom workspace header.

The session header should retain its useful context and actions, but use the same visual language as event-level Roadmap/Budget/Run of Show Command Center surfaces.

## Scope

Primary files to inspect/edit:

- `web/app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx`
- `web/app/(shell)/events/[eventId]/_components/event-module-header.tsx`
- `web/app/(shell)/events/[eventId]/_components/event-module-switcher.tsx`
- `web/lib/session-readiness.ts`
- relevant session command center/header tests

## Requirements

1. Preserve header content and actions.

   Keep:

   - breadcrumb / Run of Show context
   - session title
   - session type
   - date/time/room context
   - Speaker Directory action
   - readiness summary
   - Save button
   - dirty/saving behavior if present

2. Align visual styling to the event module/Command Center system.

   Prefer reusing:

   - `EventModuleHeader`
   - `EventModuleSurface`
   - `eventModuleClasses`
   - `EVENT_MODULE_PRIMARY_CLASS`
   - existing event module top-tab/button treatment where appropriate

   Do not invent a new visual language.

3. Back to Run of Show handling.

   Keep Back to Run of Show available.

   It may remain in the left nav/header area, but it should use event-level secondary/breadcrumb styling rather than the old dark/teal custom styling.

4. Readiness display.

   Keep readiness information.

   It can be restyled to match event module stats/pills, but must preserve the meaning:

   - ready count
   - needs work count
   - blocked count

5. Save behavior.

   Preserve:

   - Save button placement as a clear top-level action
   - disabled/loading behavior
   - API behavior
   - EVENT_VIEWER/server-side write denial behavior

6. Do not change session module panels.

   Do not redesign Speakers/AV/F&B/Staffing/Conflicts content in this prompt except for any spacing needed to align with the header changes.

## Tests

Add/update focused tests proving:

- session header uses event module/header primitives or matching classes
- breadcrumb/Back to Run of Show remains present
- Speaker Directory action remains present
- readiness summary remains present
- Save action remains present and wired
- no schema/API/service changes
- production gates from Prompt 2 remain intact

Do not add broad screenshot tests.

## Verification

Run targeted session header/command center tests.

Then run:

```bash
npm --prefix web run test:summary
npm --prefix web run typecheck
cd web && npx next build --webpack
git diff --check
```

## Stop report

Use the loop-controller stop format and include:

- files changed
- header styling changes
- behavior preserved
- tests added/updated
- exact commands and pass/fail counts
- confirmation gates/deep links/access assumptions were preserved
- confirmation schema/migrations/generated client/backend routes were not changed
- known limitations/follow-up

---

# Prompt 4 — Gate/access/deep-link regression pass and final cleanup

## Goal

Add the final regression coverage and cleanup needed to safely ship the session workspace nav alignment.

This prompt should not introduce new product behavior. It should verify and lock the behavior changed/preserved by Prompts 1–3.

## Scope

Files to inspect:

- session command center tests
- event nav tests
- production coming-soon gate tests
- route/linkage tests
- EVENT_VIEWER/access tests
- Playwright/e2e tests if useful and stable

Primary behavior to lock:

- event nav primitive extracted and reused
- session nav uses event-level nav visual language
- old dark local nav styling is gone from the session workspace
- session header matches event module/Command Center language
- deep links still work
- Back to Run of Show still works
- production gates remain correct
- EVENT_VIEWER/read-only behavior unchanged

## Requirements

1. Regression coverage for nav alignment.

   Add/update tests proving:

   - event shell still uses the shared primitive
   - session workspace nav uses the shared primitive or shared tokens
   - session workspace no longer renders the old dark rail styling as the primary nav
   - active session module state still works

2. Regression coverage for deep links.

   Ensure tests cover:

   - `?tab=` initializes the correct session module
   - hash/module focus behavior remains intact
   - invalid/unknown tab behavior still falls back safely
   - Room Set/Seating direct links are not deleted

3. Regression coverage for production gates.

   Ensure tests cover production mode and non-production mode for:

   - Room Set
   - Seating
   - session registration / Attendee Roster

   Production:

   - disabled / Coming soon
   - no active visible entry point

   Non-production:

   - existing active behavior remains where currently active

4. Regression coverage for access/read-only.

   Ensure EVENT_VIEWER behavior is unchanged:

   - no weakening of server-side write enforcement
   - no route/service access changes
   - UI changes do not imply authorization is now client-only

5. Manual QA checklist.

   At final stop, include a manual QA checklist for:

   - opening session workspace from Run of Show
   - Back to Run of Show
   - each session module nav item
   - deep-link to Speakers/AV/F&B/Staffing/Conflicts/Notes
   - Save behavior
   - production-gated Room Set/Seating/session registration
   - non-production active behavior
   - EVENT_VIEWER read-only behavior
   - narrow viewport behavior

6. Cleanup.

   Remove dead old nav class helpers only if they are no longer used.
   Do not remove route files, services, APIs, models, or tests that still matter.

## Tests

Run the targeted session/event nav/gate/access tests.

Then run:

```bash
npm --prefix web run test:summary
npm --prefix web run typecheck
cd web && npx next build --webpack
git diff --check
```

## Final report

Use the loop-controller final stop format and include:

- overall implementation summary
- all files changed
- all migration files created: should be none
- schema/client generation: should be none
- tests run
- passing/failing status
- typecheck/build status
- manual migration steps required: should be none
- manual QA checklist
- known risks
- out-of-scope items not touched
- branch ready for human review: yes/no
