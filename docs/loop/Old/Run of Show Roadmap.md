# Roadmap / Timeline Performance Prompt Pack

## Context

We are moving into the Roadmap / Timeline performance track after completing the earlier production-readiness, ops rollup, Budget performance, Dashboard / Docs / Action Center / Speakers performance, and Run of Show / Matrix performance work.

The Roadmap / Timeline audit found that the event route is thin and most client work happens in the shared Timeline client page. Data is fetched once per event and reshaped in memory for the different views, which is good. The main performance problems are concentrated in the List/Roadmap rendering path, Gantt rendering path, dashboard double-fetch behavior, and full refetches after mutations.

The full implementation track is five prompts:

1. Memoize Timeline List rows and stabilize row handlers.
2. Virtualize List rows, then Gantt rows.
3. De-duplicate Timeline Dashboard fetches and stop remount refetches.
4. Replace full refetch-on-mutation with targeted state updates.
5. Optional payload/read-only/server polish.

Use the prompts in order unless a prompt report identifies a blocker.

Global constraints for every prompt:

- Work in the current repo state. Do not create or switch branches unless explicitly instructed.
- Keep schema locked.
- Do not change Prisma schema unless a prompt explicitly says to stop and write a schema proposal.
- Do not create migrations.
- Do not change generated client files.
- Do not remove or break task APIs.
- Preserve EVENT_VIEWER/read-only behavior.
- Preserve Roadmap tab order: Dashboard, List, Roadmap, Board.
- Preserve existing Roadmap/Timeline routes, APIs, and service contracts unless the prompt explicitly says otherwise.
- Keep changes low-blast-radius.
- Add focused regression tests. Do not add broad brittle screenshot tests.
- Do not commit unless explicitly asked.

---

## Prompt 1 — Memoize Timeline List rows and stabilize row handlers

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

---

## Prompt 2 — Virtualize Timeline List rows, then Gantt rows

```text
You are working in the Planner Dash repo.

Work in the current repo state. Do not create or switch branches unless explicitly instructed.

Goal:
Add safe row virtualization/windowing for Roadmap/Timeline large views, starting with the List view and then the Gantt/Roadmap view if the List implementation is stable.

Context:
Prompt 1 memoized Timeline List rows and stabilized row handlers. The audit’s next major issue is that TimelineListView and TimelineGanttView render every item inline. Large events create too many DOM nodes. Gantt is worse because it draws gridlines per row across timeline ticks.

Hard constraints:
- Keep schema locked.
- Do not change Prisma schema.
- Do not create migrations.
- Do not change generated client files.
- Do not change API routes.
- Do not change server services.
- Do not change Timeline/Roadmap data flow.
- Preserve selection, inline edit, filtering, sorting, bulk actions, delete behavior, and canEdit/read-only behavior.
- Preserve Roadmap tab order: Dashboard, List, Roadmap, Board.
- Preserve Prompt 1 row memoization.
- Do not proceed to dashboard fetch cleanup, mutation refetch cleanup, payload bounds, or server work in this prompt.

Primary files to inspect:
- web/app/(shell)/timeline/_components/TimelineListView.tsx
- web/app/(shell)/timeline/_components/TimelineGanttView.tsx
- web/app/(shell)/timeline/page.tsx
- existing Timeline/Roadmap tests

Required work:

1. Audit existing dependency options

Before implementing, inspect package.json to see whether a virtualization library already exists.

Preferred order:
- Use an existing virtualization/windowing package already in the repo if present.
- If none exists, implement a small local virtualization helper only if it can be done safely and simply.
- Do not add a new dependency unless absolutely necessary. If a new dependency seems necessary, stop and report the recommendation first.

2. Virtualize Timeline List rows first

Implement virtualization/windowing for the Timeline List view.

Requirements:
- Keep small events simple. Use static rendering under a safe threshold if that is less risky, for example under 100 rows.
- For large item counts, render only visible rows plus overscan.
- Preserve table/list layout, sticky header if present, selected-state bar, inline edit, row selection, keyboard behavior, and delete behavior.
- Row height must be stable enough for virtualization. If row height is variable, use the safest supported strategy and document tradeoffs.
- Selection state must work for rows outside the visible window.
- Bulk actions must apply to all selected rows, not only visible rows.
- Filters/search/sort must update the virtualized item list correctly.
- Empty state must still render correctly.

3. Virtualize Gantt/Roadmap rows if safe

After List virtualization is stable, apply the same concept to TimelineGanttView.

Requirements:
- Avoid rendering all Gantt rows for large item counts.
- Avoid O(rows × columns) gridline DOM explosion where possible.
- Preserve horizontal timeline scrolling/zoom behavior.
- Preserve dependency/progress visual behavior.
- Preserve expanded/collapsed grouping state if present.
- Preserve empty state.

If Gantt virtualization is too risky for this prompt, do not force it. Implement List virtualization only and document the Gantt follow-up.

4. Tests

Add or update focused tests.

Recommended:
- source regression that TimelineListView uses virtualization/windowing for large lists
- source regression that small lists can still render normally if using a threshold
- regression that selection/bulk action state is not scoped only to visible rows
- if Gantt is changed, source regression that Gantt rows are virtualized and gridlines are not rendered per every offscreen row

Do not add broad brittle screenshot tests.

5. Verification

Run targeted Timeline/Roadmap tests.

Then run:

npm --prefix web run test:summary
npm --prefix web run typecheck
cd web && npx next build --webpack
git diff --check

Final report required:
Return:
1. Files changed
2. Whether a virtualization library already existed or what local helper was used
3. List virtualization behavior and threshold, if any
4. Gantt virtualization behavior or why it was deferred
5. Confirmation that selection, inline edit, filters/sort, bulk actions, delete, and canEdit/read-only behavior are unchanged
6. Tests added/updated
7. Exact commands run and pass/fail counts
8. Confirmation that schema/migrations/generated client/API/server services were not changed
9. Any known limitations or follow-up notes

Do not commit unless explicitly asked.
```

---

## Prompt 3 — De-duplicate Timeline Dashboard fetches and stop remount refetches

```text
You are working in the Planner Dash repo.

Work in the current repo state. Do not create or switch branches unless explicitly instructed.

Goal:
Reduce Roadmap/Timeline Dashboard fetch overhead by removing the double-fetch / remount-refetch behavior while preserving dashboard semantics.

Context:
The audit found that Dashboard is the default viewMode. On initial load, the page fetches /timeline-items and TimelineDashboardView independently fetches /timeline-dashboard. Switching away from Dashboard and back remounts the Dashboard component and refetches again. The server dashboard builder also recomputes many full-array passes.

Hard constraints:
- Keep schema locked.
- Do not change Prisma schema.
- Do not create migrations.
- Do not change generated client files.
- Preserve Timeline/Roadmap route contracts unless a strictly backwards-compatible additive response is needed.
- Preserve Roadmap tab order: Dashboard, List, Roadmap, Board.
- Preserve selection, inline edit, filters/sort, bulk actions, delete behavior, and canEdit/read-only behavior.
- Preserve virtualization/memoization work from previous prompts.
- Do not proceed to mutation refetch cleanup, payload bounds, or server index work in this prompt.

Files to inspect:
- web/app/(shell)/timeline/page.tsx
- web/app/(shell)/timeline/_components/TimelineDashboardView.tsx
- web/src/server/services/timeline-dashboard.ts
- web/app/api/events/[eventId]/timeline-dashboard/route.ts
- existing Timeline Dashboard tests

Required work:

1. Audit the current dashboard fetch contract

Before changing code, confirm:
- what data /timeline-items returns
- what data /timeline-dashboard returns
- which dashboard fields can be derived from the already-loaded items
- which dashboard fields require server-only data or additional service logic

2. Remove avoidable duplicate fetches

Preferred approach:
- Reuse already-loaded timeline items to derive dashboard data client-side where semantics match the server dashboard output.
- Keep /timeline-dashboard only for data that cannot safely be derived from the loaded item list.

Alternative approach if full derivation is too risky:
- Cache/lift TimelineDashboardView payload in page.tsx so switching away and back does not refetch unnecessarily.
- Keep the dashboard mounted or persist its data across view changes.
- Add a refresh token only when a mutation actually requires dashboard refresh.

Do not change dashboard metrics semantics silently. If a server dashboard field cannot be derived exactly from the client items, preserve the server route for that field and document why.

3. Stop remount refetch churn

Ensure Dashboard does not refetch simply because the user switches List → Dashboard → Roadmap → Dashboard.

Acceptable solutions:
- Keep dashboard payload in parent state.
- Keep dashboard mounted but hidden.
- Add a cache keyed by eventId and refreshToken.

Choose the lowest-risk implementation consistent with the existing component architecture.

4. Server/service polish if safe

If buildTimelineDashboard does redundant full-array passes that can be trivially consolidated without changing semantics, simplify it.

Do not do broad server rewrites.
Do not add schema indexes.
Do not add caching infrastructure unless already present and simple.

5. Tests

Add or update focused tests.

Recommended:
- Dashboard does not fetch /timeline-dashboard on every remount/view switch.
- Dashboard uses already-loaded timeline items where safe.
- Dashboard metrics remain equivalent to existing expectations.
- Mutations still refresh dashboard when needed.
- No change to Roadmap tab order.

Do not add broad brittle screenshot tests.

6. Verification

Run targeted Timeline Dashboard tests.

Then run:

npm --prefix web run test:summary
npm --prefix web run typecheck
cd web && npx next build --webpack
git diff --check

Final report required:
Return:
1. Files changed
2. Current dashboard data/fetch contract found
3. What duplicate fetch or remount refetch was removed
4. Whether dashboard metrics are now client-derived, cached/lifted, or still server-fetched and why
5. Tests added/updated
6. Exact commands run and pass/fail counts
7. Confirmation that schema/migrations/generated client were not changed
8. Confirmation that Timeline API contracts/server services were either unchanged or changed only in the documented safe way
9. Any known limitations or follow-up notes

Do not commit unless explicitly asked.
```

---

## Prompt 4 — Replace full refetch-on-mutation with targeted state updates

```text
You are working in the Planner Dash repo.

Work in the current repo state. Do not create or switch branches unless explicitly instructed.

Goal:
Reduce Roadmap/Timeline mutation cost by replacing unnecessary full event refetches with targeted state updates where safe.

Context:
The audit found that several Roadmap/Timeline mutations call loadItems() and sometimes router.refresh() after the mutation. Inline single-cell save is already optimistic, but delete, bulk update/delete, inline create, and import perform full event reloads. This creates unnecessary latency and rerenders.

Hard constraints:
- Keep schema locked.
- Do not change Prisma schema.
- Do not create migrations.
- Do not change generated client files.
- Preserve Timeline/Roadmap route contracts unless a strictly backwards-compatible additive response is needed.
- Preserve selection, inline edit, filtering, sorting, bulk actions, delete behavior, canEdit/read-only behavior, row memoization, virtualization, and dashboard fetch cleanup from previous prompts.
- Preserve Roadmap tab order: Dashboard, List, Roadmap, Board.
- Do not proceed to payload bounds or server index work in this prompt.

Files to inspect:
- web/app/(shell)/timeline/page.tsx
- web/app/(shell)/timeline/_components/TimelineListView.tsx
- Timeline/Roadmap create, update, bulk, delete, import handlers
- web/app/api/events/[eventId]/timeline-items/* routes
- web/src/server/services/timeline.ts
- existing Timeline mutation tests

Required work:

1. Audit mutation handlers

Identify each client handler that currently calls loadItems() or router.refresh(), including but not limited to:
- delete item
- bulk update
- bulk delete
- inline create
- import
- any create/edit modal save path

For each, determine whether the server response includes enough data to update React state directly.

2. Replace safe full refetches with targeted state updates

For each safe case:
- update local items state from the mutation response
- remove deleted items locally after server confirmation
- update bulk-edited items locally after server confirmation
- append/insert created items locally after server confirmation
- preserve sort/filter behavior by applying existing client sorting/filtering to the updated state
- clear selection where appropriate after bulk actions
- preserve error handling and rollback behavior

Do not fake success before server confirmation.
Do not silently hide failed mutations.
Do not remove loadItems() entirely if it is still needed for import or complex server-side side effects.

3. Keep full refetch where it is truly needed

Some flows may still need a full reload, especially import or operations that can create/update many dependent rows and server-derived fields.

If you keep a full refetch:
- document why
- ensure it happens only for that flow
- avoid router.refresh() unless it is actually needed

4. Dashboard refresh coordination

If Prompt 3 introduced dashboard cache/lifted state, update refresh invalidation so dashboard metrics remain correct after targeted mutations.

Do not create duplicate refresh paths.

5. Tests

Add or update focused tests.

Recommended:
- delete removes item from local state without calling full loadItems where safe
- bulk update updates selected rows locally
- bulk delete removes selected rows locally
- create inserts returned item locally
- import still refreshes if kept intentionally
- dashboard refresh invalidates only when needed
- canEdit/read-only behavior unchanged

Do not add broad brittle screenshot tests.

6. Verification

Run targeted Timeline mutation tests.

Then run:

npm --prefix web run test:summary
npm --prefix web run typecheck
cd web && npx next build --webpack
git diff --check

Final report required:
Return:
1. Files changed
2. Mutation paths audited
3. Which full refetches were removed
4. Which full refetches remain and why
5. How dashboard/cache invalidation works after mutations
6. Tests added/updated
7. Exact commands run and pass/fail counts
8. Confirmation that schema/migrations/generated client were not changed
9. Confirmation that API/server contracts were unchanged or changed only in documented backwards-compatible ways
10. Any known limitations or follow-up notes

Do not commit unless explicitly asked.
```

---

## Prompt 5 — Optional payload/read-only/server polish

```text
You are working in the Planner Dash repo.

Work in the current repo state. Do not create or switch branches unless explicitly instructed.

Goal:
Perform the optional final Roadmap/Timeline performance polish pass around payload bounds, read-only viewer rendering, and server-side query polish.

Context:
Earlier prompts handled list row memoization, virtualization, dashboard fetch cleanup, and mutation refetch cleanup. The remaining audit findings are lower-risk/lower-priority:
- listTimelineItems returns the full event timeline in one response
- read-only viewers render the same heavy editor trees
- server filters/indexes are mostly fine, but future filtering could need more attention

Hard constraints:
- Keep schema locked.
- Do not change Prisma schema or add indexes in this prompt unless you stop and produce a schema-change proposal first.
- Do not create migrations.
- Do not change generated client files.
- Preserve existing Timeline/Roadmap API behavior unless adding backwards-compatible optional params.
- Preserve row memoization, virtualization, dashboard fetch cleanup, and mutation refetch cleanup.
- Preserve Roadmap tab order: Dashboard, List, Roadmap, Board.
- Preserve EVENT_VIEWER/read-only behavior.

Files to inspect:
- web/src/server/services/timeline.ts
- web/app/api/events/[eventId]/timeline-items/route.ts
- web/app/(shell)/timeline/page.tsx
- Timeline/List/Gantt/Board components
- existing Timeline tests

Required work:

1. Audit payload size and server query shape

Confirm:
- fields selected by listTimelineItems
- whether any selected fields are unused by the client
- whether the client sends filters that the server does not use
- whether server-side filtering/pagination would be backwards-compatible
- approximate row-count risk for realistic events

2. Add safe optional bounds only if low risk

If safe, add optional query params such as take/skip or lightweight mode without changing default behavior.

Rules:
- Default behavior must remain backwards-compatible.
- Do not make current views incomplete unless the client is updated to support loading more.
- Do not add server pagination unless the UI can correctly handle it.
- If pagination/load-more is larger than this prompt, document it and do not implement half of it.

3. Add a lighter read-only render path if safe

For canEdit=false / EVENT_VIEWER:
- avoid rendering edit-only controls where practical
- avoid expensive editor-specific state/components where practical
- preserve ability to view timeline data
- do not change server-side write denial behavior
- do not introduce UI-only security assumptions

This should be a performance/UX simplification, not the source of truth for permissions.

4. Server/service micro-polish

If there are trivial repeated calculations or unused data transformations, clean them up.

Do not do broad server rewrites.
Do not add schema indexes.
Do not change dependency/cycle behavior.

5. Tests

Add/update focused tests.

Recommended:
- optional bounds/lightweight params are backwards-compatible
- read-only viewer path omits edit-heavy controls but still shows data
- server list select remains narrow
- no API contract break for existing callers

Do not add broad brittle screenshot tests.

6. Verification

Run targeted Timeline tests.

Then run:

npm --prefix web run test:summary
npm --prefix web run typecheck
cd web && npx next build --webpack
git diff --check

Final report required:
Return:
1. Files changed
2. Payload/server audit findings
3. Any optional bounds or lightweight mode added
4. Read-only render-path changes, if any
5. Tests added/updated
6. Exact commands run and pass/fail counts
7. Confirmation that schema/migrations/generated client were not changed
8. Confirmation that EVENT_VIEWER server-side write denial is unchanged
9. Any known limitations or follow-up notes

Do not commit unless explicitly asked.
```

---

## Recommended commit checkpoints

Commit after each successful prompt so the branch stays easy to recover:

```bash
git status --short
git add -A
git commit -m "Memoize Timeline list render path"
git status --short
```

Suggested commit messages:

- Prompt 1: `Memoize Timeline list render path`
- Prompt 2: `Virtualize Timeline large views`
- Prompt 3: `Reduce Timeline dashboard refetches`
- Prompt 4: `Avoid unnecessary Timeline mutation refetches`
- Prompt 5: `Polish Timeline payload and viewer performance`

## Recommended stopping points

Minimum useful pass:

- Prompt 1
- Prompt 2
- Prompt 3

Full performance pass:

- Prompts 1 through 5

If time is tight, do Prompts 1–3, verify, merge, and defer Prompts 4–5.
