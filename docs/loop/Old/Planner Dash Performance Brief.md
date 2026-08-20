# Planner Dash Performance Brief

## Purpose

This brief defines the performance workstream for Planner Dash after the Ops Rollup Consistency + Performance fixes were merged to `main`.

The goal is not to randomly optimize screens. The goal is to trace the slow surfaces, identify the exact server/client bottlenecks, fix the highest-impact paths first, and keep every change measurable, low-risk, and regression-tested.

The first target is **Budget**, because the audit found Budget has the clearest high-impact performance problems across both server reads and client editing/rendering.

---

## Current Starting Point

The previous ops rollup consistency batch is complete and pushed to `main`.

Current known state before starting this performance work:

```text
main includes ops rollup consistency fixes through 94bdab11.
verify passed after merge:
- typecheck passed
- test:summary passed
- build passed
schema unchanged
migrations none
```

The new performance work should start from `main` on a new branch.

Recommended branch:

```text
chore/performance-budget-command-center
```

---

## Performance Audit Summary

The performance audit focused on **Budget and Command Center first**, then looked briefly at Docs Hub, Speakers, Matrix 2, and Timeline.

Important audit reframe:

```text
The Event Command Center is not the main problem.
It is already structured as 1 access/query setup plus a broad Promise.all batch.

The Account Dashboard is not doing per-event command-center amplification.
It is already doing org-scoped queries in a parallel wave and now uses DB aggregates for budget rollups.
```

The real cost centers identified were:

```text
1. Budget read path
   - serial snapshot queries
   - write/upsert on read paths
   - duplicate upserts across concurrent budget endpoints

2. Budget grid editing/rendering
   - every keystroke recomputes rollups across the whole dataset
   - derived collections rebuilt too often
   - row rendering is too monolithic

3. Unbounded portfolio/list reads
   - account dashboard nested event/timeline/deadline/dependency fetch
   - action center unbounded queue reads
   - docs and speaker lists with heavy unbounded selects

4. Docs Hub N+1
   - resolveLinkTargets runs per document and can issue up to 5 queries per document

5. Secondary performance risks
   - budget files snapshot uses non-indexable text search
   - import/submission paths have serial reads and some N+1 behavior
```

---

## Performance Principles For This Workstream

Use these rules across all performance fixes:

### 1. Measure before and after where possible

Every meaningful fix should either:

- reduce query count,
- reduce round trips,
- reduce write operations on read paths,
- reduce returned row volume,
- reduce client render work,
- reduce repeated full-dataset recomputation,
- or make the slow path lazy/bounded.

Budget already has debug timing hooks around snapshot sections. Use those before Wave 1 if available.

### 2. Reads must not write unless explicitly required

A GET/read path should not upsert or mutate core records just to display a page.

Current Budget problem:

```text
getOrCreateBudgetForEvent uses budget.upsert, and read paths call it.
```

This creates lock contention, write amplification, and redundant writes when multiple budget endpoints load together.

### 3. Independent reads should run concurrently

If queries only depend on `eventId` or `budgetId`, they should not stack serial round-trip latency.

Budget snapshot currently has multiple independent sections that can run in parallel.

### 4. Do not fetch unbounded data when the UI only shows a capped list

If the UI shows 12, 50, or 100 items, server reads should be bounded unless the full set is explicitly needed.

### 5. Use DB aggregation for totals-only endpoints

If the endpoint only needs totals by category/group/status, prefer `groupBy`, `_sum`, `_count`, or equivalent DB aggregation instead of fetching all rows and reducing in JS.

Exception: if the grid already needs all currently displayed rows, computing derived totals from the loaded rows may be acceptable.

### 6. Client edits should not invalidate the whole grid

Typing one character in one Budget cell should not:

- clone a draft object containing every row,
- remap every line item,
- rebuild every Map/Set,
- recompute full totals,
- or rerender every row.

The grid should move toward row-local draft state, memoized derived collections, and memoized row rendering.

### 7. Keep schema locked unless explicitly approved

This performance work is intended to be **schema-locked**.

Do not add migrations or schema changes unless the user explicitly starts a schema proposal.

A few deeper optimizations, such as typed BudgetActivity event kinds, may need schema later. Those should be documented as deferred, not implemented inside this pass.

---

## Primary Target: Budget

Budget is the first and highest-value performance target.

### Why Budget first

The audit found Budget is slow in both the server path and the client UI path:

```text
Server side:
- getBudgetSnapshot runs several independent queries serially.
- read paths perform Budget upserts.
- concurrent budget endpoints can upsert the same Budget row at the same time.
- some totals-only endpoints fetch rows and sum in JS.

Client side:
- typing in one cell recomputes full-grid rollups.
- several derived sets/arrays are rebuilt in render.
- row rendering is monolithic and causes unnecessary rerenders.
```

Budget performance should be handled in two phases:

```text
Wave 1: Budget read hot path
Wave 2: Budget grid typing/rendering
```

---

## Budget Findings To Fix

## B1 — `getBudgetSnapshot` runs independent reads serially

Severity: High

Surface:

```text
every budget screen that loads the snapshot
```

Location:

```text
web/src/server/services/budget.ts
getBudgetSnapshot
approximately lines 1778-1953 in the audit
```

Problem:

The snapshot path awaits several independent sections in sequence:

```text
budget.lookup
lineItems.read
activity.read
recipients.read
submissions.read
documentLinks.read
budgetFiles.read
```

Most of these only depend on the budget/event context and can run concurrently. Only document link hydration depends on line item IDs.

Impact:

```text
Page latency stacks across independent database round trips.
The Budget grid pays the summed latency of multiple reads.
```

Fix shape:

```text
- Fetch independent snapshot sections with Promise.all.
- Keep true dependencies ordered only where required.
- Preserve section timing/debug logging.
- Preserve existing response shape.
```

Tests:

```text
- Snapshot response equivalence test.
- Query ordering/dependency test where practical.
- Existing budget snapshot tests must continue passing.
```

Schema change:

```text
No.
```

---

## B2 — Budget read paths perform write/upsert on read

Severity: High

Surface:

```text
budget snapshot, dashboard, blocks, groups, category targets, sessions, export, reporting
```

Location:

```text
web/src/server/services/budget.ts
getOrCreateBudgetForEvent
approximately line 979 in the audit

web/src/server/services/budget-sessions-groups.ts
multiple read paths call budget access helpers that upsert
```

Problem:

`getOrCreateBudgetForEvent` uses `budget.upsert`. This means pure read paths can write to the database.

Impact:

```text
- GET requests can take row locks.
- Multiple concurrent budget endpoints can contend on the same Budget row.
- Page load produces unnecessary WAL/write activity.
- The app pays write-path cost just to render a screen.
```

Fix shape:

```text
- Add a read-only budget accessor for GET/read paths.
- Keep upsert/create behavior only for mutation/first-write paths.
- If no Budget row exists on a read path, return a safe empty/synthetic read model instead of writing.
- Preserve the existing UI behavior for empty budgets.
```

Deeper optional future:

```text
Create Budget rows at Event creation time so all reads can use findUnique.
```

That deeper path may be product/architecture work and is not required for this pass.

Tests:

```text
- Read-path test proves no budget.upsert/create occurs on GET/snapshot/dashboard.
- Mutation path test proves budget creation still works when needed.
- Empty event budget view still renders safely.
```

Schema change:

```text
No.
```

---

## B6 — Budget blocks summary performs duplicate concurrent upserts

Severity: Medium

Surface:

```text
budget block/category/group summary paths
```

Location:

```text
web/src/server/services/budget-sessions-groups.ts
getBudgetBlocksSummary
approximately lines 521-531 in the audit
```

Problem:

Category and group summary reads can independently resolve/upsert the same Budget row in parallel.

Impact:

```text
Self-contention on the same Budget row during a read summary.
```

Fix shape:

```text
- Resolve the budget once using the new read-only accessor.
- Pass budgetId/context into category/group summary helpers.
- Do not upsert from summary read paths.
```

Tests:

```text
- Blocks summary returns same values.
- Test/spy confirms only one read-only budget lookup and no duplicate upsert.
```

Schema change:

```text
No.
```

---

## B5 — Budget dashboard double auth + full snapshot for totals-only view

Severity: Medium

Surface:

```text
budget dashboard
```

Location:

```text
web/src/server/services/budget.ts
getBudgetDashboard
approximately lines 938-971 in the audit
```

Problem:

The dashboard path performs a read access check and then a write access check, where the write capability is inferred by catching an authorization error. It then loads a full budget snapshot for a view that mostly needs dashboard totals.

Impact:

```text
- Duplicate auth/event-member lookups.
- Over-fetching for dashboard views.
```

Fix shape:

```text
- Compute read/write capability from one access/membership resolution where feasible.
- Avoid using thrown errors for normal capability detection.
- Consider a lean dashboard snapshot if the full grid data is not required.
- Preserve permission behavior exactly.
```

Tests:

```text
- Admin/write user sees write controls.
- Read-only user sees read-only behavior.
- Dashboard totals match current behavior.
```

Schema change:

```text
No.
```

---

## B7 — Totals-only endpoints fetch all rows and reduce in JS

Severity: Medium

Surface:

```text
category totals
group totals
reporting totals
other totals-only budget summaries
```

Locations:

```text
web/src/server/services/budget-sessions-groups.ts
approximately line 533 in the audit

web/src/server/services/budget.ts
approximately line 1429 in the audit
```

Problem:

Some endpoints fetch all matching line items and reduce in JS even though the database can aggregate by category/group/status.

Impact:

```text
More rows transferred than needed.
More JS work on the app server.
Slower responses as budgets grow.
```

Fix shape:

```text
- Use Prisma groupBy / aggregate / _sum where endpoint only needs totals.
- Keep row-level reads only where rows are actually rendered.
- Preserve rounding/number semantics.
```

Tests:

```text
- Aggregate-equivalence fixtures compare old expected hand-computed totals to DB aggregate result.
- Null category/group behavior is preserved.
- Forecast/actual/revised totals match existing semantics.
```

Schema change:

```text
No.
```

---

## B3 — Every keystroke recomputes rollups over the full line-item set

Severity: High

Surface:

```text
full budget grid editing
```

Location:

```text
web/app/(shell)/budgets/_components/full-budget-grid.tsx
approximately lines 1595-1619 and 3521-3528 in the audit
```

Problem:

Typing one character updates a shared `amountDrafts` object. That invalidates full-grid memoized structures and causes repeated O(n) work across the entire line item set.

Current behavior described by the audit:

```text
setAmountDrafts(prev => ({ ...prev, [id]: ... }))
→ remap all optimistic line items
→ rebuild optimisticLineItemsById
→ recompute budget totals
→ recompute/filter related collections
```

Impact:

```text
Typing latency scales with total budget size.
Large imported budgets feel slow even when only one visible cell is being edited.
```

Fix shape:

Preferred direction:

```text
- Move draft state closer to each row/cell where possible.
- Avoid invalidating whole-dataset totals on every keypress.
- Update parent totals on blur/commit or with a small debounced path.
- Preserve optimistic editing behavior and validation.
```

Acceptable lower-risk first step:

```text
- Debounce expensive totals recomputation from draft edits.
- Keep explicit committed totals authoritative after save/refetch.
```

Tests:

```text
- Editing one amount still displays the draft immediately.
- Save/blur still persists the correct value.
- Totals update at the intended time.
- Existing inline edit regression tests still pass.
```

Schema change:

```text
No.
```

---

## B8 — Derived collections rebuilt in render body

Severity: Medium

Surface:

```text
full budget grid render path
```

Location:

```text
web/app/(shell)/budgets/_components/full-budget-grid.tsx
approximately lines 1752-1768 in the audit
```

Problem:

Several derived arrays/sets/maps are rebuilt during render without enough memoization.

Impact:

```text
More work per render than necessary.
This compounds the keystroke problem from B3.
```

Fix shape:

```text
- Wrap stable derived collections in useMemo.
- Use precise dependency arrays.
- Avoid creating new Sets/Maps/functions unless their inputs changed.
```

Tests:

```text
- Existing grid behavior remains unchanged.
- Inline edit, locked line items, category/group filters, and status filters still work.
```

Schema change:

```text
No.
```

---

## B9 — Budget grid rows are monolithic and rerender too much

Severity: Medium

Surface:

```text
full budget grid row rendering
```

Location:

```text
web/app/(shell)/budgets/_components/full-budget-grid.tsx
approximately line 3358 in the audit
```

Problem:

Rows are rendered inline with fresh closures and no row-level memoization. A parent state change can rerender every visible row.

Impact:

```text
Up to the full visible page size can rerender on small state changes.
The problem is bounded by pagination but still meaningful at 100-row pages.
```

Fix shape:

```text
- Extract Budget row into a memoized component.
- Pass stable props and stable callbacks.
- Keep row edit behavior identical.
- Do not turn editable cells into navigation traps.
- Preserve responsive behavior.
```

Tests:

```text
- Row edit tests still pass.
- Locked/submitted line item behavior still works.
- Selection/filter/sort/page behavior still works.
```

Schema change:

```text
No.
```

---

## B4 — Budget files snapshot uses non-indexable text search

Severity: Medium

Surface:

```text
budget files snapshot included in full budget loads
```

Location:

```text
web/src/server/services/budget.ts
getBudgetFilesSnapshotForBudget
approximately lines 1021-1078 in the audit
```

Problem:

Budget file events are detected with text search:

```text
note contains BUDGET_FILE_ACTIVITY_PREFIX
```

This creates a leading-wildcard text scan on activity notes, plus a document/version join.

Impact:

```text
Budget page load pays for file/activity lookup even when the user is not looking at files.
```

Fix shape for current schema-locked pass:

```text
- Default full grid load to exclude budget files if not needed immediately.
- Lazy-load budget files from the existing files endpoint when the files UI becomes visible.
- Preserve the existing files UI behavior.
```

Deeper future schema fix:

```text
Add a typed BudgetActivity kind/discriminator with an index.
```

Schema change:

```text
No for lazy-load.
Yes for typed activity kind; defer.
```

---

## B10 — Budget import has serial resolvers and per-group create loop

Severity: Low

Surface:

```text
budget import
```

Location:

```text
web/src/server/services/budget.ts
approximately lines 2320-2382 in the audit
```

Problem:

The import path resolves sessions/groups serially and can create groups one by one. Row inserts are already chunked/createMany, which is good.

Fix shape:

```text
- Parallelize independent resolvers.
- Batch group creation with createMany where safe.
- Preserve import validation and safety caps.
```

Schema change:

```text
No.
```

Priority:

```text
Second budget batch, not Wave 1.
```

---

## B11 — Budget submission create has serial independent reads

Severity: Low

Surface:

```text
budget submission/create review path
```

Location:

```text
web/src/server/services/budget.ts
approximately lines 2712-2752 in the audit
```

Problem:

Three independent reads run serially before a transaction.

Fix shape:

```text
- Use Promise.all for independent pre-transaction reads.
- Preserve transaction behavior and approval/audit records.
```

Schema change:

```text
No.
```

Priority:

```text
Second budget batch, not Wave 1.
```

---

## Budget Prompt Count Recommendation

For Budget-only performance, use 7 prompts:

```text
1. Baseline measurement / debug logging check
2. B1 — parallelize getBudgetSnapshot reads
3. B2 + B6 — stop upsert/write-on-read and duplicate budget upserts
4. B5 — single auth check + leaner budget dashboard path
5. B7 — move totals-only endpoints to DB groupBy/_sum
6. B3 + B8 — reduce full-grid recomputation while typing
7. B9 — memoize/extract Budget row rendering + final verify
```

Leave these for a later smaller Budget batch unless explicitly included:

```text
- B4 budget files lazy-load
- B10 import resolver/batch cleanup
- B11 submission pre-read parallelization
```

---

## Secondary Target: Command Center / Dashboard

The performance audit found that Command Center is not the largest issue, but still has worthwhile cleanup items.

## C1 — Account dashboard unbounded nested event fetch

Severity: High

Surface:

```text
account dashboard / command center landing page
```

Location:

```text
web/src/server/services/command-center-dashboard.ts
approximately line 116 in the audit
```

Problem:

The account dashboard fetches all org events with nested timeline/deadline/dependency rows, then sorts and slices in JS.

Impact:

```text
Row volume grows with events × timeline items × dependencies.
The UI only shows a capped number of items, but the server may load far more.
```

Fix shape:

```text
- Bound nested selects with orderBy/take where possible.
- Prefer separate bounded/aggregate queries for deadline/risk views.
- Preserve account dashboard output shape.
```

Schema change:

```text
No.
```

Priority:

```text
After Budget Wave 1/Wave 2, unless dashboard is observed as worse than Budget in real use.
```

---

## C2 / C4 — Event Command Center duplicate table hits

Severity: Medium/Low

Surface:

```text
event command center
```

Location:

```text
web/src/server/services/event-command-center.ts
approximately lines 685-741 in the audit
```

Problem:

The Event Command Center queries the same tables multiple times for count/groupBy/distinct variants.

Examples:

```text
sessionStaffAssignment queried multiple ways
sessionFnbCatalogAssignment queried multiple ways
sessionFoodService queried multiple ways
sessionAVRequirement queried multiple ways
speaker queried multiple ways
matrixRow queried multiple ways
```

Impact:

```text
More total DB queries than necessary.
Value depends on DB pool behavior and query latency.
```

Fix shape:

```text
- Remove standalone counts when groupBy/distinct result can provide the same answer.
- Keep IDs where set-difference math needs actual IDs.
- Preserve payload exactly.
```

Open question:

```text
Confirm DB connection pool size before prioritizing heavily.
If pool is narrow/single-connection, reducing query count matters more.
```

Schema change:

```text
No.
```

---

## C3 — Action Center unbounded queue reads

Severity: Medium

Surface:

```text
account dashboard action center
```

Location:

```text
web/app/(shell)/dashboard/action-center/page.tsx
approximately line 264 in the audit
```

Problem:

Several action-center queues use unbounded `findMany`, then the UI only renders a bounded list.

Affected read groups:

```text
risk timeline items
budget line items
documents
budget submissions
```

Fix shape:

```text
- Add orderBy + take sized to the queue view.
- Keep exact existing queue semantics.
- Be careful with budget variance rows because Prisma cannot directly express actual > forecast as a column comparison in the current query shape.
```

Schema change:

```text
No.
```

---

## Secondary Target: Docs Hub

## D1 — Docs list has N+1 link-target resolution

Severity: High

Surface:

```text
event docs hub list
```

Location:

```text
web/src/server/services/documents.ts
approximately lines 883-899 and resolveLinkTargets around 637 in the audit
```

Problem:

`resolveLinkTargets` is called per document. It can issue up to 5 queries per document.

Impact:

```text
Docs list load scales as documents × linked-target queries.
```

Fix shape:

```text
- Collect all document links in one pass.
- Batch-resolve link targets once per target type.
- Reattach resolved targets by documentId.
- Preserve current API response shape.
```

Schema change:

```text
No.
```

Priority:

```text
High after Budget Wave 1/Wave 2.
```

---

## D2 — Docs list is unbounded with rich include

Severity: Medium

Surface:

```text
event docs hub list
```

Location:

```text
web/src/server/services/documents.ts
approximately line 827 in the audit
```

Problem:

The Docs list fetches all documents with rich includes and no pagination.

Fix shape:

```text
- Add pagination or bounded loads.
- Keep filters/search behavior correct.
- Avoid breaking review/status counts if they rely on full list data.
```

Schema change:

```text
No.
```

---

## Secondary Target: Speakers

## S1 — Speaker list is unbounded and over-selects detail fields

Severity: Medium

Surface:

```text
event speaker directory/list
```

Location:

```text
web/src/server/services/speakers.ts
approximately line 311 in the audit
```

Problem:

The speaker directory list pulls a heavy speaker select, including fields like bios, notes, topics, AV needs, and travel needs. The directory grid generally needs lighter card/list fields.

Fix shape:

```text
- Split list select from detail select.
- Keep detail route/page full-fidelity.
- Consider pagination or virtualization later for very large speaker directories.
```

Schema change:

```text
No.
```

---

## Matrix 2 And Timeline Notes

## Matrix 2

The audit did not find critical Matrix 2 performance problems.

Positive findings:

```text
- request coalescing exists
- snapshot path uses batched joins
- no obvious N+1 in the checked path
```

Minor note:

```text
A few read lists run serially inside an interactive transaction, but Promise.all may not help inside one DB connection. Low priority.
```

## Timeline

The audit did not find obvious Timeline performance issues.

Positive findings:

```text
- timeline dashboard reads are parallelized
- selects are lean
- JS aggregation is appropriate for per-item stage/workstream bucketing
```

Generic future note:

```text
Very large timeline lists may eventually need pagination/virtualization, but this is not the current top problem.
```

---

## Recommended Overall Implementation Order

## Wave 1 — Budget read hot path

Highest value, safest backend wins:

```text
1. B1 parallelize getBudgetSnapshot reads.
2. B2 add read-only budget accessor and stop upsert/write-on-read.
3. B6 remove duplicate concurrent budget upserts in block summaries.
```

Why first:

```text
These affect every Budget screen and reduce page-load latency/DB contention without changing UI behavior.
```

---

## Wave 2 — Budget grid typing/rendering

Client-side responsiveness:

```text
4. B3 reduce full-grid recomputation on every keystroke.
5. B8 memoize derived grid collections.
6. B9 extract/memoize Budget row rendering.
```

Why second:

```text
These directly attack the "Budget feels slow" editing experience.
```

---

## Wave 3 — Budget totals/dashboard cleanup

Additional server cleanup:

```text
7. B5 avoid double auth + avoid full snapshot where lean dashboard data is enough.
8. B7 use DB aggregates for totals-only endpoints.
```

Why third:

```text
Useful, but slightly less critical than read-path locking and typing latency.
```

---

## Wave 4 — Other high-impact modules

After Budget:

```text
9. C1 bound account dashboard nested event/timeline/deadline reads.
10. D1 fix Docs Hub N+1 link target resolution.
11. D2 add pagination/bounds to Docs list.
12. C3 cap Action Center reads.
13. S1 trim Speaker list select.
```

---

## Wave 5 — Smaller/deferred items

```text
14. B4 lazy-load budget files snapshot.
15. B10 optimize budget import resolvers/group creation.
16. B11 parallelize submission pre-reads.
17. C2/C4 reduce duplicate Event Command Center table hits after DB pool behavior is confirmed.
```

---

## Measurement Plan

Before implementing Budget Wave 1, capture a baseline if possible.

## Server-side Budget baseline

Check whether `shouldLogBudgetDebug()` can be enabled locally.

Capture:

```text
- getBudgetSnapshot wall-clock time
- sectionDurationsMs
- number of budget queries
- whether Budget upsert/write occurs during GETs
- page load with multiple concurrent budget endpoints
```

Use at least one realistic seed/event:

```text
small budget: 20-50 rows
medium budget: 200-500 rows
large budget: 1000+ rows if practical
```

## Client-side Budget baseline

Use React DevTools Profiler or browser performance tools if practical.

Capture:

```text
- typing latency in forecast/actual amount fields
- components rerendering per keystroke
- parent grid rerenders
- visible row rerenders
- time spent in computeBudgetTotals / derived collections
```

Manual observation is acceptable if profiling setup is too heavy, but the implementation should still reduce obvious O(n) recomputation.

## Post-fix verification

After each wave:

```text
- run targeted budget tests
- run affected component/service tests
- run typecheck
- run full web npm run verify before merging
```

---

## Constraints And Out-of-Scope

Hard constraints:

```text
- No schema changes.
- No migrations.
- No Prisma client generation changes.
- Do not delete or break task APIs.
- Do not break assignment flows.
- Do not start Matrix staffing reconciliation.
- Do not do broad UI redesign unless explicitly requested.
- Do not do unrelated lint cleanup.
- Do not change budget accounting semantics without an explicit product/accounting decision.
```

Performance-specific constraints:

```text
- Preserve response shapes unless the prompt explicitly changes a contract and updates callers/tests.
- Preserve authorization and event/org scoping.
- Preserve approval/audit behavior.
- Preserve import safety caps.
- Do not trade correctness for speed.
- Do not hide stale/fake data to make a screen appear faster.
```

---

## Suggested Branches

Overall performance branch:

```text
chore/performance-budget-command-center
```

If splitting into smaller branches:

```text
chore/budget-read-path-performance
chore/budget-grid-render-performance
chore/dashboard-docs-performance
```

For now, one branch is acceptable if prompts are kept sequential and focused.

---

## Success Criteria

This performance work is successful when:

```text
- Budget GET/read paths no longer write/upsert Budget rows.
- Budget snapshot independent reads are parallelized.
- Budget block summary does not duplicate budget upserts.
- Budget grid typing does not recompute the full line-item dataset on every keypress.
- Derived grid collections are memoized.
- Visible rows do not all rerender unnecessarily on small state changes.
- Totals-only budget endpoints use DB aggregation where appropriate.
- Account dashboard and Action Center heavy list reads are bounded where implemented.
- Docs Hub N+1 is removed when that wave runs.
- Speaker list over-selecting is reduced when that wave runs.
- All targeted tests pass.
- `cd web && npm run verify` passes before merge.
```

---

## Manual QA Checklist

Budget read/load:

```text
[ ] Budget page loads for event with no existing Budget row.
[ ] Budget page loads for event with existing Budget row.
[ ] Budget dashboard totals match previous behavior.
[ ] Budget blocks/category/group summaries match previous behavior.
[ ] Budget files area still works if lazy-loaded.
[ ] Budget export still works.
```

Budget editing:

```text
[ ] Forecast amount edit displays immediately.
[ ] Actual amount edit displays immediately.
[ ] Vendor/category/status edits still work.
[ ] Inline save persists correctly.
[ ] Blur/commit behavior is correct.
[ ] Totals update at the intended time.
[ ] Locked/approved/submitted line items remain protected.
[ ] Pagination still works.
[ ] Filters/search/sort still work.
```

Budget approval/submission:

```text
[ ] Submit for review still works.
[ ] Pull back still works.
[ ] Approve/reject still works.
[ ] Activity/audit entries still write correctly.
```

Dashboard/Command Center later waves:

```text
[ ] Account dashboard still shows deadlines/approvals/speaker rollups correctly.
[ ] Action Center queues still show the right items.
[ ] Event Command Center still loads and matches prior payload semantics.
```

Docs/Speakers later waves:

```text
[ ] Docs list loads with linked targets intact.
[ ] Docs filters/status/review states still work.
[ ] Speaker directory list loads with required list fields.
[ ] Speaker detail still has full detail fields.
```

---

## Notes For Future Prompt Pack

When writing implementation prompts, keep them clean and direct.

Do not frame prompts as corrections or meta-conversation cleanup. State the requirements as normal engineering work.

Each prompt should include:

```text
- goal
- exact finding IDs
- files likely involved
- constraints
- expected behavior
- implementation shape
- required tests
- verification command
- stop report format
```

Recommended Budget prompt pack sequence:

```text
Prompt 1 — Budget performance baseline and instrumentation review
Prompt 2 — Parallelize getBudgetSnapshot reads
Prompt 3 — Remove write/upsert-on-read from Budget GET paths
Prompt 4 — Budget dashboard auth/read path cleanup
Prompt 5 — DB aggregation for totals-only Budget endpoints
Prompt 6 — Budget grid draft/recompute optimization
Prompt 7 — Budget row memoization and final Budget verify
```

The first performance batch should stay Budget-only unless the user explicitly expands the scope.
