# Planner Dash Performance Batch 2 — Initial Load + Remaining Confirmed Optimizations Prompt Pack

_Last updated: 2026-07-06_

## Purpose

This prompt pack continues the Planner Dash performance work after the Budget Performance Wave 1–3 merge to `main`.

The prior Budget batch improved the read hot path and grid typing performance, but manual testing still found that **initial Budget page load feels slow**. This batch focuses on making first render and page load feel faster, then continues through the remaining confirmed performance findings from the audit.

This is not a product redesign pass. It is a source-backed performance implementation pass.

## Expected Branch

```txt
chore/performance-batch-2-initial-load
```

Create from current `main` after pulling latest.

## Schema Mode

```txt
LOCKED
```

No Prisma schema changes. No migrations. No generated client changes.

If a finding appears to require schema work, stop and report the schema proposal separately.

## Primary Goals

1. Make Budget initial load faster.
2. Avoid loading expensive/non-critical Budget data before the first usable render.
3. Reduce remaining Budget render and row costs where safe.
4. Finish smaller Budget performance cleanups left from the audit.
5. Fix the next confirmed non-Budget performance issues from the audit:
   - account dashboard unbounded nested fetches
   - Docs Hub link-target N+1
   - Action Center unbounded reads
   - Speakers list heavy select
   - Event Command Center duplicated table hits where worthwhile

## Key Audit Findings This Pack Addresses

### Budget

- **B4** — Budget files snapshot performs non-indexable `LIKE '%…%'` activity scan and document/version join on every load.
- **B9** — Full Budget grid rows are rendered inline with many fresh closures; row memoization was deferred from the prior batch.
- **B10** — Budget import has serial resolvers and per-group create loop.
- **B11** — Budget submission create runs independent reads serially before the transaction.
- Initial load still feels slow after read-path and typing improvements, so this pack also audits and implements a lean first-render strategy.

### Account Dashboard / Command Center

- **C1** — Account dashboard has unbounded nested event/timeline/deadline/dependency fetches even though the UI renders capped lists.
- **C3** — Action Center uses multiple unbounded `findMany` calls.
- **C2/C4** — Event Command Center repeats some table reads and fetches distinct rows only for `.length`.

### Docs Hub

- **D1** — Docs Hub calls `resolveLinkTargets` per document, up to five queries per document.
- **D2** — Docs list uses an unbounded rich `findMany`; safe improvements should avoid silently hiding data.

### Speakers

- **S1** — Speaker list pulls heavy fields for a directory grid that only needs a smaller list shape.

## Global Constraints

- Do not change schema.
- Do not add migrations.
- Do not change generated Prisma client output.
- Do not delete or break task APIs.
- Do not alter assignment flows.
- Do not start Matrix staffing reconciliation.
- Do not perform broad UI redesign.
- Do not silently hide rows/docs/speakers as a performance shortcut.
- Do not replace correctness with cached/stale derived state.
- Preserve permissions and server-side authorization.
- Preserve response shapes unless the active prompt explicitly introduces a backward-compatible addition.
- Use targeted tests for each performance fix.
- Run `cd web && npm run verify` before final stop.

## Performance Principles For This Batch

Use these rules when deciding implementation shape:

1. First render should not wait on data that is not visible above the fold or not needed for immediate editing.
2. Pure reads should not write.
3. Expensive secondary panels should lazy-load on demand.
4. List pages should avoid N+1 queries.
5. Dashboard cards should use bounded queries and aggregates, not full unbounded object graphs.
6. Client render work should scale with visible rows and changed rows, not total dataset size.
7. Optimizations must preserve accounting correctness, editability, permissions, exports, and review flows.

---

# Prompt 1 — Preflight, Current-State Baseline, And Initial Load Trace

## Goal

Establish the current branch state and capture a source-backed baseline for Budget initial load before making changes.

## Scope

- Verify current branch and dirty state.
- Confirm `main` includes the prior Budget performance batch.
- Inspect the current Budget page load path after the prior batch.
- Identify what data the first Budget render still waits on.
- Capture current timing/logging hooks and gaps.

## Instructions

1. Confirm branch:
   - expected branch: `chore/performance-batch-2-initial-load`
   - if not on this branch, stop and report.
2. Confirm dirty state before editing.
3. Read:
   - `docs/loop/Planner Dash Performance Brief.md`
   - this prompt pack
   - relevant prior Budget service/client files.
4. Inspect current Budget load path:
   - Budget page route/component
   - Budget API route(s)
   - `getBudgetSnapshot`
   - Budget dashboard route/service if involved
   - `full-budget-grid.tsx`
5. Identify which pieces are required for first usable grid render and which can be lazy/deferred.
6. Check current debug logging around Budget timing.
7. Do not change behavior unless a tiny debug-only hook is already supported and safe.

## Deliverable

A short baseline report covering:

- exact Budget routes/services/components involved in initial load
- current first-load payload sections
- required-for-first-render data
- deferrable data
- existing timing logs and how to enable them
- recommended order for Prompts 2–7

## Allowed Files

Audit/report only. Avoid code changes unless needed for a harmless test/dev-only timing assertion.

## Tests

No tests required unless code changes are made.

## Hard Stops

Stop if the current branch is wrong, working tree has unrelated changes, or the current load path differs materially from the performance brief.

---

# Prompt 2 — Budget Initial Load: Lazy-Load Non-Critical Sections

## Goal

Make Budget initial page load faster by removing non-critical sections from the first grid payload and loading them only when needed.

## Confirmed Problem

Budget files were called out by the audit as expensive:

- `getBudgetFilesSnapshotForBudget`
- non-indexable `note: { contains: BUDGET_FILE_ACTIVITY_PREFIX }` activity scan
- document/version join
- executed as part of Budget snapshot when `includeBudgetFiles` is true

The first grid render should not wait on Budget files/activity/history-style data if the user is trying to view/edit line items.

## Scope

Implement the lowest-risk lazy-loading path for non-critical Budget data, especially:

- budget files
- file-related activity lookups
- activity/history if currently included in first load and not immediately visible
- recipients/submissions only if they are clearly not needed for initial visible state

Preserve existing UI behavior by loading these sections when the relevant panel/tab/card opens or becomes visible.

## Instructions

1. Inspect current Budget initial-load client behavior.
2. Identify which snapshot flags/options already exist, such as `includeBudgetFiles`.
3. Change first grid load to exclude expensive non-critical sections where safe.
4. Add or reuse a lazy endpoint/client fetch for excluded sections.
5. Preserve existing empty/loading/error states.
6. Preserve download/finalize/upload behavior for Budget files.
7. Do not remove any functionality.
8. Do not silently hide files/activity/submission data.
9. Add focused tests proving:
   - first grid snapshot does not fetch budget files by default
   - the lazy path still returns files when requested
   - existing Budget files route still works

## Expected Fix Shape

Prefer one of these low-breakage approaches:

- first grid load calls snapshot with `includeBudgetFiles: false`
- files panel uses existing `/budget/files` route
- if activity/history is separated, use an explicit lazy route or existing snapshot option

Do not introduce a new large API surface unless necessary.

## Files Likely Touched

- `web/src/server/services/budget.ts`
- Budget API route(s) under `web/app/api/events/[eventId]/budget/**`
- `web/app/(shell)/budgets/_components/full-budget-grid.tsx`
- Budget tests under `web/lib/**`

## Tests

Run targeted Budget tests and any new regression test.

## Hard Stops

Stop if excluding a section would break visible initial UI state or if the lazy path requires broad UI rewiring beyond the file/panel behavior.

---

# Prompt 3 — Budget Initial Load: Lean First-Render Payload Strategy

## Goal

Reduce the amount of data Budget must fetch/hydrate before the first usable render.

## Problem

Even after removing write-on-read and improving client recomputation, initial load can still feel slow if the first payload contains the full Budget dataset and all derived supporting data.

The target is to make the first render fast without sacrificing full-grid functionality.

## Scope

Inspect and implement a low-breakage lean first-render strategy for the Budget grid.

Potential safe strategies:

1. Keep full data behavior but make non-visible/heavy sections lazy.
2. Add a lean snapshot mode for the initial grid shell and first page of rows.
3. Add progressive hydration for the rest of the rows after the first usable render.
4. Add server-side pagination/filter/sort only if it can be done without a broad rewrite and without losing correctness.

## Instructions

1. Inspect current grid pagination/filter/sort architecture.
2. Determine whether the grid can safely render from a first-page row payload.
3. Determine what global totals/locks/permissions are needed before edit controls can be trusted.
4. Prefer a backward-compatible addition over changing existing snapshot response shape.
5. If implementing a lean mode:
   - explicit query param or service option
   - full snapshot remains available
   - no hidden behavior changes for export/import/reporting
   - no fake totals from partial data
6. If server-side pagination/filter/sort is too broad, do not force it. Implement only safe progressive-loading pieces and report the remaining design.
7. Add tests for the selected strategy.

## Expected Behavior

- Budget page shows usable shell/grid faster.
- Global totals remain correct.
- Editing permissions remain server-backed.
- Filtering/search/sort behavior remains correct.
- Export still uses complete data.
- Existing endpoints remain compatible.

## Files Likely Touched

- `web/src/server/services/budget.ts`
- Budget API route(s)
- `web/app/(shell)/budgets/_components/full-budget-grid.tsx`
- Budget tests

## Tests

Targeted tests for:

- lean/initial mode returns required fields
- full mode still returns full data
- totals remain correct
- first-page/progressive behavior does not hide records from search/filter/export

## Hard Stops

Stop if this requires a broad rewrite of the grid architecture, silently changes sort/filter semantics, or would return partial data while pretending it is complete.

---

# Prompt 4 — B9 Focused Budget Row Memoization / Row Extraction

## Goal

Address the deferred B9 finding in a focused, controlled way: reduce unnecessary Budget row rerenders without rewriting the entire grid.

## Confirmed Problem

The Budget grid currently renders rows inline with many fresh closures and dependencies. The prior batch reduced full-dataset recomputation, but row rerenders remain bounded only by pagination size.

## Scope

Extract a memoized row component or a small row-rendering unit only if it can be done without broad rewrite.

## Instructions

1. Inspect `full-budget-grid.tsx` row rendering.
2. Identify the smallest stable row component boundary.
3. Pass per-row props instead of whole maps/objects where practical.
4. Use `React.memo` only where props can be stable enough to matter.
5. Use `useCallback`/`useMemo` at the parent only for handlers/values that otherwise defeat memoization.
6. Preserve all row behavior:
   - forecast/actual editing
   - blur/save
   - vendor/category/status edits
   - locked/submitted/approved protections
   - selection/bulk behavior
   - links/actions
   - keyboard and focus behavior
7. Do not turn editable cells into navigation traps.
8. Add a focused regression test or source-level test proving the memoized row boundary exists and key behavior remains intact.

## Expected Fix Shape

Prefer:

- `BudgetLineItemRow` component in the same file or nearby component file
- per-row props
- explicit stable handlers
- no UI redesign

## Files Likely Touched

- `web/app/(shell)/budgets/_components/full-budget-grid.tsx`
- optional new component under the same Budget components folder
- Budget grid tests

## Tests

Run grid/client tests available in the repo, plus typecheck for the touched package.

## Hard Stops

Stop if the extraction requires changing dozens of unrelated behaviors or more than the file-count guardrail. If broad, report a smaller row-memo plan instead of forcing it.

---

# Prompt 5 — B10 Budget Import Resolver Cleanup

## Goal

Reduce Budget import request time by removing avoidable serial resolver and per-group create patterns.

## Confirmed Problem

The audit found Budget import resolves sessions/groups serially and creates each new group one by one. Row inserts are already chunked/createMany, but the resolver/group setup path can still be improved.

## Scope

Optimize import setup only. Do not redesign import UX or parser behavior.

## Instructions

1. Inspect Budget import path in `budget.ts` around the resolver/group creation logic.
2. Identify independent reads that can run in parallel.
3. Batch group creation using `createMany({ skipDuplicates })` where safe.
4. Preserve existing normalization, dedupe, and error semantics.
5. Preserve row cap behavior from production-readiness work.
6. Preserve CSV formula-injection protections.
7. Add or update tests for:
   - groups are created once
   - duplicate groups do not error
   - import result shape unchanged
   - created line items still link to correct groups/sessions

## Files Likely Touched

- `web/src/server/services/budget.ts`
- Budget import tests

## Tests

Run targeted Budget import tests and relevant regression tests.

## Hard Stops

Stop if batching group creation would change duplicate handling or make import errors less precise.

---

# Prompt 6 — B11 Budget Submission Pre-Read Parallelization

## Goal

Reduce Budget submission creation latency by parallelizing independent pre-transaction reads.

## Confirmed Problem

The audit found the submission create path runs three independent reads serially before the transaction.

## Scope

Mechanical service-level optimization only.

## Instructions

1. Inspect Budget submission create path around the pre-transaction reads.
2. Confirm which reads are independent.
3. Move independent reads into `Promise.all`.
4. Preserve validation order where error semantics matter.
5. Preserve transaction boundaries and writes.
6. Preserve audit/activity behavior.
7. Add or update a targeted regression test if available.

## Files Likely Touched

- `web/src/server/services/budget.ts`
- Budget submission tests

## Tests

Run targeted Budget submission/approval tests.

## Hard Stops

Stop if the reads are not actually independent or if parallelization changes which validation error users see first in a meaningful way.

---

# Prompt 7 — C1 Account Dashboard Bounded Nested Fetches

## Goal

Reduce account dashboard initial load cost by bounding nested event/timeline/deadline/dependency fetches to what the UI actually renders.

## Confirmed Problem

The audit found account dashboard uses an unbounded nested `event.findMany`, loading all org events and matching timeline/deadline/dependency rows, then flatMaps/sorts/slices in JS while the UI only renders capped lists.

## Scope

Account dashboard / Command Center data service only.

## Instructions

1. Inspect `web/src/server/services/command-center-dashboard.ts`.
2. Identify unbounded nested selects/includes used only to render capped lists.
3. Add appropriate `orderBy` + `take` where safe.
4. If nested caps would produce incorrect top-N across all events, split into separate bounded aggregate/list queries instead.
5. Preserve all rollup counts and KPI semantics.
6. Do not silently undercount global totals by applying `take` to data used for counts.
7. Add regression tests proving:
   - capped UI lists still show the most relevant items
   - global counts remain correct
   - org scoping remains correct

## Expected Fix Shape

Prefer separate queries for global counts vs display lists if needed:

- counts/rollups use aggregate/groupBy/count
- display lists use ordered/capped findMany

## Files Likely Touched

- `web/src/server/services/command-center-dashboard.ts`
- dashboard tests under `web/lib/**`

## Tests

Run account dashboard/command-center tests.

## Hard Stops

Stop if bounding a nested fetch would make a KPI false. Counts must stay correct even if display lists are capped.

---

# Prompt 8 — D1/D2 Docs Hub N+1 And Safe List Query Reduction

## Goal

Fix the Docs Hub link-target N+1 and reduce list-load cost without silently hiding documents.

## Confirmed Problems

- `resolveLinkTargets` is called per document, up to five queries per document.
- Docs list query is unbounded with rich includes.

## Scope

Docs Hub list/read path only.

## Instructions

1. Inspect `web/src/server/services/documents.ts` list path.
2. Replace per-document `resolveLinkTargets` calls with a batched resolver:
   - collect all links for listed documents
   - resolve each target type once
   - attach resolved targets back to each document
3. Preserve response shape.
4. Preserve permissions and event scoping.
5. For the unbounded list:
   - trim rich includes where not needed in the list
   - add explicit pagination/limit only if the UI/API can represent it honestly
   - do not silently omit documents without a pagination/load-more path
6. Add tests proving query behavior or batched resolver behavior.
7. Keep document detail/read behavior intact.

## Files Likely Touched

- `web/src/server/services/documents.ts`
- Docs API route if needed
- Docs tests

## Tests

Run Docs Hub service/API tests and relevant document lifecycle tests.

## Hard Stops

Stop before adding pagination if the UI has no way to access omitted documents. Do not trade correctness for speed.

---

# Prompt 9 — C3 Action Center Bounded Reads

## Goal

Reduce Action Center load cost by bounding unbounded queue reads and using aggregates where appropriate.

## Confirmed Problem

The audit found Action Center uses multiple unbounded `findMany` calls for risk timeline items, budget line items, documents, and budget submissions. Only one deadline query is capped.

## Scope

`web/app/(shell)/dashboard/action-center/page.tsx` and related helpers only.

## Instructions

1. Inspect Action Center queries and UI list limits.
2. Add `orderBy` and `take` to display-list queries where the UI renders a capped queue.
3. Use aggregate/count queries for total badges/counts if the UI needs full counts.
4. Preserve queue ordering and severity semantics.
5. Preserve org/event scoping.
6. Budget over/variance row-level logic may need JS comparison; keep correctness.
7. Add tests proving:
   - display lists are capped and ordered correctly
   - counts are not falsely capped
   - documents/budget submissions still appear in expected views

## Files Likely Touched

- `web/app/(shell)/dashboard/action-center/page.tsx`
- Action Center tests

## Tests

Run dashboard/action-center tests.

## Hard Stops

Stop if a cap would hide items without a clear count/load-more behavior and the UI implies the list is complete.

---

# Prompt 10 — S1 Speakers List Select Trimming

## Goal

Reduce Speakers list load cost by trimming heavy fields from the directory/list query.

## Confirmed Problem

The audit found speaker list pulls heavy fields such as bios/notes/topics/AV/travel needs for a directory grid that only needs summary fields.

## Scope

Speaker list path only. Detail pages should continue to fetch full speaker data.

## Instructions

1. Inspect `web/src/server/services/speakers.ts` list and detail selects.
2. Split list select from detail select if needed.
3. Keep list fields needed for the current UI:
   - name
   - title/company
   - status/readiness summary if displayed
   - headshot/status metadata if displayed
   - any counts/badges currently visible
4. Move heavy fields to detail fetch only.
5. Preserve search/filter/sort behavior.
6. Preserve export/import behavior.
7. Add tests proving:
   - list payload omits heavy fields
   - detail payload still includes them
   - UI-visible list fields remain available

## Files Likely Touched

- `web/src/server/services/speakers.ts`
- speaker route/tests if needed

## Tests

Run Speakers service/API tests and any speaker page regression tests.

## Hard Stops

Stop if the list UI truly needs a heavy field. Do not remove a field from the response without checking all callers.

---

# Prompt 11 — C2/C4 Event Command Center Query Dedupe, Pool Check First

## Goal

Reduce avoidable Event Command Center query count only where it clearly preserves behavior and improves load cost.

## Confirmed Context

The performance audit found Event Command Center is already one serial query plus a wide `Promise.all`. It is not a serial fan-out bug. It does, however, query some same tables multiple times for counts/groupBy/distinct rows.

The audit also noted that the value of C2/C4 depends partly on DB connection pool behavior.

## Scope

Event Command Center service only.

## Instructions

1. Verify DB/Prisma adapter/pool behavior if possible from source/config.
2. Inspect `web/src/server/services/event-command-center.ts`.
3. Identify standalone `.count` calls that are fully derivable from already-fetched `groupBy` or distinct rows.
4. Remove redundant queries only when the derived value is exactly equivalent.
5. Replace `findMany distinct only for .length` with `groupBy` or count-style query where safe.
6. Preserve payload shape exactly.
7. Preserve all KPI semantics.
8. Add or update tests proving payload equivalence for affected sections.

## Files Likely Touched

- `web/src/server/services/event-command-center.ts`
- Event Command Center tests

## Tests

Run Event Command Center/dashboard tests.

## Hard Stops

Stop if equivalence is not exact, if query reduction would change a KPI, or if the change becomes broad/noisy relative to the win.

---

# Prompt 12 — Final Performance Batch 2 Verification And Closure

## Goal

Verify the entire batch, document results, and produce a clear merge-ready report.

## Instructions

1. Confirm branch and dirty state.
2. Confirm schema unchanged:
   - no Prisma schema diffs
   - no migration files
   - no generated client changes
3. Confirm task APIs still exist and were not touched unless tests only.
4. Confirm Matrix staffing reconciliation was not started.
5. Run targeted tests for each touched area if not already run after the final prompt.
6. Run full verification:

```bash
cd web
rm -rf .next/types
npm run verify
```

7. Produce final stop report.

## Final Report Must Include

- overall implementation summary
- all files changed
- tests run
- verify result
- behavior changed
- performance improvements landed by finding ID
- deferred findings and why
- manual QA checklist
- branch ready for human review: yes/no

## Manual QA Checklist

Include at least:

### Budget

- [ ] Budget initial page load feels faster.
- [ ] Budget files/activity/submissions still load when their panel/path is opened.
- [ ] Budget page loads for event with no Budget row.
- [ ] Budget page loads for event with existing Budget row.
- [ ] Forecast/actual typing stays responsive.
- [ ] Totals update and persist correctly after save/refetch.
- [ ] Filters/search/sort/pagination still work.
- [ ] Export still uses complete data.
- [ ] EVENT_VIEWER remains read-only.

### Dashboard / Action Center

- [ ] Account dashboard loads and counts remain correct.
- [ ] Deadline/risk/action lists are ordered and capped honestly.
- [ ] Action Center views show expected items and counts.

### Docs / Speakers / Event Command Center

- [ ] Docs Hub list loads with link targets intact.
- [ ] Speaker list loads and detail pages still show full detail.
- [ ] Event Command Center KPIs unchanged except faster/leaner data path.

## Hard Stops

Stop if full verify fails and the fix is not obvious, or if any performance improvement changed product correctness.

