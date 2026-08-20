# Roadmap / Timeline Performance Brief

## Purpose

This brief captures the next performance track for Planner Dash: **Roadmap / Timeline performance**.

The previous performance tracks are effectively complete or merged enough to move on:

- Production-readiness / code hardening
- Ops rollup consistency
- Budget performance
- Dashboard / Docs / Action Center / Speakers performance
- Run of Show / Matrix performance pass, including snapshot safety tests, quick-drawer fetch gating, board render memoization, and related regression coverage

The next performance target is the Roadmap / Timeline module. The goal is not to redesign the module or change data contracts. The goal is to make large Roadmap / Timeline events feel fast by reducing unnecessary renders, unnecessary fetches, heavy DOM output, and full reloads after mutations.

## Current Audit Summary

The event route `events/[eventId]/timeline/page.tsx` is thin. It resolves `canEdit` server-side and renders the shared client component at:

- `web/app/(shell)/timeline/page.tsx`

The shared client component is large, roughly 2,000 lines, and owns the core page state:

- item loading
- view mode
- filters/search/sort
- mutation handlers
- bulk edit state
- rendering the current view

One healthy pattern already exists: the page fetches Timeline/Roadmap item data once per event and reshapes it in memory for different views. Switching between Roadmap/List/Board does not currently refetch item data, which is good.

The main problems are concentrated in:

1. Heavy non-virtualized list rendering
2. Selection/edit state causing full table rerenders
3. Dashboard double-fetching the same event-level data
4. Full list refetches after mutations
5. Unbounded full-event payloads for large events
6. Gantt/list remount costs during view switches

## Important Product/Engineering Constraints

These constraints apply to the full Roadmap / Timeline performance pack:

- Keep schema locked.
- Do not change Prisma schema.
- Do not create migrations.
- Do not change generated client files.
- Do not change API routes unless a specific later prompt explicitly scopes that work.
- Do not change server services unless a specific later prompt explicitly scopes that work.
- Preserve EVENT_VIEWER / read-only behavior.
- Preserve existing Timeline/Roadmap dependency and cycle logic.
- Preserve Roadmap tab order: `Dashboard`, `List`, `Roadmap`, `Board`.
- Preserve existing filters, search, sort, bulk actions, delete behavior, inline edit behavior, and deep-link/view state behavior unless explicitly scoped.
- Keep changes low-blast-radius and prompt-sized.
- Do not mix this with Run of Show, Budget, Docs Hub, or design-system work unless explicitly requested.

## Performance Findings

### P1 — Non-virtualized lists of heavy, non-memoized rows

Severity: **High**

Files:

- `web/app/(shell)/timeline/_components/TimelineListView.tsx`
- `web/app/(shell)/timeline/_components/TimelineGanttView.tsx`

Current state:

- `TimelineListView` renders every filtered item inline through `filteredTaskItems.map(...)`.
- Each row includes many cells and controls.
- Rows are not extracted into memoized components.
- There is no virtualization/windowing.
- `TimelineGanttView` also renders every item inline.
- Gantt additionally draws gridlines per row using nested `tickPositions.map`, which creates O(rows × columns) DOM nodes.

Why it matters:

Large timelines will degrade quickly. A few hundred items can become sluggish because the browser is managing too many DOM nodes and React is recreating too much row structure on each render.

### P2 — Selection/edit state on the parent rerenders the whole table

Severity: **High**

Files:

- `web/app/(shell)/timeline/_components/TimelineListView.tsx`

Current state:

State like this lives at the top of `TimelineListView`:

- `selectedIds`
- `editingCell`
- `cellDraftValue`
- `savingCells`
- `cellErrors`

Because all rows are rendered inline, selecting one row or typing into one cell causes all rows to rerender.

Why it matters:

This is the “edit one row / rerender every row” problem. It is likely the highest-confidence first fix because it can be done without changing API contracts, server data flow, schema, or UI behavior.

### P3 — Dashboard double-fetches the event and refetches on every visit

Severity: **Medium-high**

Files:

- `web/app/(shell)/timeline/page.tsx`
- `web/app/(shell)/timeline/_components/TimelineDashboardView.tsx`
- `web/src/server/services/timeline-dashboard.ts`
- `web/app/api/events/[eventId]/timeline-dashboard/route.ts`

Current state:

- `DASHBOARD` is the default view mode.
- The main page fetches `/timeline-items`.
- `TimelineDashboardView` independently fetches `/timeline-dashboard`.
- Switching away from Dashboard and back remounts the dashboard component and refetches.
- The dashboard service recomputes rollups through many full-array passes.

Why it matters:

The default view performs two full-event reads when one should be enough or should at least be cached/lifted. This creates unnecessary latency and server load.

### P4 — Mutations trigger full list refetches

Severity: **Medium-high**

Files:

- `web/app/(shell)/timeline/page.tsx`
- Timeline item routes/services

Current state:

Inline single-cell save is already optimistic, which is good. But several operations still trigger `loadItems()` or `router.refresh()`:

- delete
- bulk update
- bulk delete
- inline create
- import

Why it matters:

A user action that changes a small number of rows should not reload the entire event if the API already returns enough information to update local state safely.

### P5 — Unbounded payload and identical heavy tree for read-only viewers

Severity: **Medium / low-medium**

Files:

- `web/src/server/services/timeline.ts`
- `web/app/(shell)/timeline/_components/*`

Current state:

`listTimelineItems` appears to use a single select-scoped query, which is good, but it has no take/page/cap. The full event payload ships into client state. Also, `canEdit=false` users still pay for the same heavy editable render tree.

Why it matters:

This is less urgent than row memoization and virtualization, but it matters for large events and viewer-only users.

### P6 — View switching remounts heavy trees

Severity: **Medium**

Files:

- `web/app/(shell)/timeline/page.tsx`
- `web/app/(shell)/timeline/_components/TimelineGanttView.tsx`
- `web/app/(shell)/timeline/_components/TimelineDashboardView.tsx`

Current state:

`renderCurrentView` conditionally swaps components. Switching to Roadmap and back remounts Gantt and re-runs internal memo calculations, ResizeObserver setup, and local state initialization.

Why it matters:

This increases perceived sluggishness when moving between views, especially if Roadmap/Gantt has many rows.

## Recommended Prompt Sequence

The full Roadmap / Timeline performance pack should be broken into five prompts.

### Prompt 1 — Memoize Timeline List rows and stabilize handlers

Status: **Next prompt to run**

Targets:

- P2 directly
- P1 partially

Scope:

- Extract the inline list row render from `TimelineListView` into a memoized `TimelineListRow` component.
- Stabilize row handlers with `useCallback`.
- Avoid passing fresh inline objects/functions to every row.
- Keep selection/edit state inside `TimelineListView`.
- Add a source-regression test verifying the memoized row structure and stable handler pattern.

Why first:

This is the highest-confidence fix. It does not require server changes, API changes, schema changes, virtualization, or data-flow changes. It directly attacks the “edit/select one row rerenders all rows” issue.

### Prompt 2 — Virtualize List rows, then Gantt rows

Targets:

- P1

Scope:

- Add row virtualization/windowing to `TimelineListView` first.
- Then apply virtualization to `TimelineGanttView` if the List implementation is stable.
- Use a threshold so small timelines can stay simple/static if needed.
- Preserve keyboard, selection, inline edit, bulk edit, and scroll behavior.

Why second:

Memoized rows help rerender cost, but virtualization reduces total DOM cost. It is more complex than Prompt 1 because it can affect scrolling, sticky headers, row heights, and interaction details.

### Prompt 3 — Dashboard fetch cleanup

Targets:

- P3
- P6 partially

Scope:

- Remove or reduce the double-fetch between `/timeline-items` and `/timeline-dashboard`.
- Consider lifting/caching dashboard payload in the parent.
- Consider deriving some dashboard rollups from already-loaded items where safe.
- Prevent dashboard refetch on every view switch.
- Keep dashboard numbers semantically identical.

Why third:

This is a high-impact page-load improvement, especially because Dashboard is the default view. It should happen after the list render path is safer.

### Prompt 4 — Mutation refetch cleanup

Targets:

- P4

Scope:

- Replace full `loadItems()`/`router.refresh()` after delete, bulk update/delete, inline create, and import where safe.
- Use returned rows or targeted local state updates.
- Keep optimistic behavior deterministic and reversible where needed.
- Preserve server-authoritative writes.

Why fourth:

This improves responsiveness after actions, but it requires careful consistency handling. It should come after row rendering is stable.

### Prompt 5 — Payload/read-only/server polish

Targets:

- P5
- P6 remaining pieces

Scope:

- Optional bounded payload/page cap if needed.
- Optional lighter read-only render path for `canEdit=false`.
- Optional server-side filter wiring if product wants it.
- Optional indexes only if filters are actually server-wired and schema changes are intentionally approved later.

Why last:

This is the deepest and most likely to require product/server decisions. It should be treated as optional unless large-event testing proves it is necessary.

## Minimum Useful Pass vs Full Pass

Minimum useful pass:

1. Prompt 1 — memoize list rows and stabilize handlers
2. Prompt 2 — virtualize list rows
3. Prompt 3 — dashboard fetch cleanup

Full pass:

1. Prompt 1 — memoize list rows and stabilize handlers
2. Prompt 2 — virtualize list + Gantt rows
3. Prompt 3 — dashboard fetch cleanup
4. Prompt 4 — mutation refetch cleanup
5. Prompt 5 — payload/read-only/server polish

Recommended path:

- Do Prompts 1–3 as the core Roadmap performance pack.
- Do Prompt 4 if the module still feels sluggish after edits/bulk updates.
- Defer Prompt 5 unless large-event testing proves payload/read-only/server issues are still material.

## Immediate Next Prompt

Run Prompt 1 with Opus / high reasoning, not Codex.

Reason:

This is a real component refactor. It needs to preserve UI behavior while changing render structure. Opus is better suited than Codex for threading together component state, handlers, memoization, and behavior constraints.

## Prompt 1 — Full Text

```text
You are working in the Planner Dash repo.

Work in the current repo state. Do not create or switch branches unless explicitly instructed.

Goal:
Memoize Timeline List rows and stabilize row handlers to reduce Roadmap/List render churn.

Context:
The Roadmap / Timeline performance audit found the first major issue:
TimelineListView renders every row inline from filteredTaskItems.map(...), and selection/edit state lives at the top of the component. Toggling one checkbox or typing into one cell can cause the whole list to rerender.

This prompt is the first implementation step after the audit.

Hard constraints:
- Do not change Prisma schema.
- Do not create migrations.
- Do not change generated client files.
- Do not change API routes.
- Do not change server services.
- Do not change Timeline/Roadmap data flow.
- Do not change selection semantics.
- Do not change inline edit semantics.
- Do not change filtering, sorting, bulk actions, delete behavior, or canEdit/read-only behavior.
- Keep changes isolated to the Timeline List render path and focused tests.
- Do not proceed to virtualization, dashboard fetch cleanup, mutation refetch cleanup, payload bounds, or server work in this prompt.

Scope:
Primary file:
web/app/(shell)/timeline/_components/TimelineListView.tsx

Add focused test:
web/lib/timeline-list-row-memoization-regression.test.ts

Required work:

1. Extract the inline row render

In TimelineListView.tsx, find the inline row body currently rendered from:

filteredTaskItems.map(...)

Extract that row into a dedicated memoized component:

const TimelineListRow = memo(function TimelineListRow(...) {
  ...
});

The row component should receive only the props needed for one row:
- item
- canEdit
- isSelected for that item
- current editing state for that item/cell
- saving/error state for that item/cell
- draft value if that row/cell is editing
- stable callbacks for row selection, edit begin, commit, keydown, delete, etc.
- any display helpers needed by that row

Do not lift selection/edit state to page.tsx.
Selection/edit state should remain inside TimelineListView.

2. Stabilize handlers passed into rows

Wrap row handlers in useCallback where appropriate, including:
- toggleRowSelection
- beginCellEdit
- commitCell
- handleTextKeyDown
- row delete handler
- any row-level change/edit handlers passed into TimelineListRow

Make memoization effective:
- Avoid creating new inline functions inside every row where possible.
- Avoid passing newly-created objects/arrays to every row unless memoized.
- If a callback currently needs latest editingCell/cellDraftValue but should remain stable, use a ref pattern to read the latest value without recreating the callback every render.

Do not over-refactor. Only stabilize the render path needed for this prompt.

3. Preserve behavior

The UI must behave the same:
- selecting rows still works
- select all / clear selection still works
- inline edit still works
- optimistic single-cell save still works
- validation/errors still show
- bulk action bar still works
- delete still works
- filters/search/sort still work
- canEdit=false/read-only behavior remains unchanged
- Roadmap tab order remains Dashboard, List, Roadmap, Board

4. Add focused regression test

Add:

web/lib/timeline-list-row-memoization-regression.test.ts

Use the repo’s existing source-regression style.

Assert:
- TimelineListRow exists and is wrapped in memo(...)
- filteredTaskItems.map renders <TimelineListRow ...>
- key row handlers are useCallback-wrapped
- selection/edit state remains inside TimelineListView, not lifted to page.tsx
- the change is a render-path refactor, not an API/server/service change

Do not add broad brittle screenshot tests.

5. Verification

Run targeted test:

cd web && npx tsx --test lib/timeline-list-row-memoization-regression.test.ts

Then run:

npm --prefix web run test:summary
npm --prefix web run typecheck
cd web && npx next build --webpack
git diff --check

Final report required:
Return:
1. Files changed
2. What was memoized/stabilized
3. Any render-path decisions intentionally deferred
4. Tests added/updated
5. Exact commands run and pass/fail counts
6. Confirmation that schema/migrations/generated client were not changed
7. Confirmation that no API routes or server services were changed
8. Confirmation that selection, inline edit, bulk actions, delete, filters/sort, and canEdit/read-only behavior are unchanged
9. Any known limitations or follow-up notes

Do not commit unless explicitly asked.
```

## Verification Standard For Each Prompt

Every Roadmap / Timeline performance prompt should run:

```bash
npm --prefix web run test:summary
npm --prefix web run typecheck
cd web && npx next build --webpack
git diff --check
```

Each prompt should also run its own targeted test first.

## Handoff Notes

Do not mix Roadmap performance with unrelated product polish. If a product issue appears during the performance work, park it separately unless it directly blocks the performance prompt.

Do not create schema changes. If performance work suggests indexes or new server-side paging, document the recommendation and stop before schema/migration work.

Prompt 1 is safe to start now once the working tree is clean and the correct branch is active.
