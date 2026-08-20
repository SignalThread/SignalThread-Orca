# Planner Dash Performance Brief — Budget Deep Performance Addendum

## Purpose

This addendum updates the existing Planner Dash Performance Brief for the next Budget performance phase.

The original performance brief remains valid as the overall performance workstream plan. It correctly identifies Budget as the first performance target and documents the broader audit findings across Budget, Command Center, Docs Hub, Speakers, Matrix 2, and Timeline.

This addendum narrows the next implementation phase to the two remaining high-impact Budget grid optimizations:

1. Full Budget row extraction / memoization.
2. True server-side pagination / filter / sort for Budget line items.

Use this addendum together with the existing performance brief and the Budget Deep Performance prompt pack.

---

## Current State After Completed Budget Performance Work

The initial Budget performance waves have already landed on `main`.

Completed Budget performance work includes:

- `B1` — parallelized independent `getBudgetSnapshot` reads.
- `B2` — removed Budget write/upsert-on-read behavior from GET/read paths.
- `B6` — removed duplicate Budget upserts from block summary reads.
- `B5` — simplified Budget dashboard read/write capability checks.
- `B7` — moved totals-only Budget paths to DB aggregates where safe.
- `B3` / `B8` — reduced full-grid recomputation while typing and memoized key derived collections.
- `B4` / `B10` / `B11` — smaller second-batch optimizations landed where scoped.
- Docs Hub N+1, Speaker list payload trimming, Account Dashboard bounded fetch, and Event Command Center query dedupe were addressed in the broader Performance Batch 2 where scoped.

The first Budget batches improved server-side read latency, removed read-path DB contention, and made typing noticeably better.

However, the two major Budget grid performance levers remain:

1. Row-level render isolation.
2. Reducing first-load row volume by not shipping every Budget line item to the client.

---

## Remaining High-Impact Budget Work

## 1. Full BudgetRow Extraction / Memoization

### Goal

Extract the large inline Budget grid row into a memoized row component so editing one row does not re-render every visible row.

### Why This Matters

The Budget grid currently renders line-item rows inline inside `full-budget-grid.tsx`. Even after reducing full-dataset recomputation, parent state changes can still cause all visible rows to re-render.

Client pagination bounds the number of visible rows, but if the page size is 25, 50, or 100, typing in one cell can still cause unnecessary render work across the full visible page.

### Required Direction

Create a memoized `BudgetRow` boundary.

The parent grid should continue to own canonical state:

- loaded line items
- amount drafts
- text drafts
- dirty line item IDs
- row save/error state
- selected IDs
- locked/submitted/approved state
- totals
- filters/search/sort/pagination state
- persistence/API calls

The row should receive only row-specific props:

- committed item
- row amount draft
- row text draft
- selected state
- locked/read-only state
- dirty/saving/error state
- row approval state
- stable option lists
- stable callbacks

### Important Constraints

Do not move durable draft/save/dirty state into the row component if that would cause edits to be lost when rows unmount.

Do not change accounting semantics.

Do not change save behavior.

Do not turn editable cells into navigation traps.

Do not redesign the grid.

### Expected Result

Editing one Budget row should only re-render that row and any intentionally affected summary/header components.

Other visible rows should remain stable when their props are unchanged.

---

## 2. True Server-Side Pagination / Filter / Sort

### Goal

Stop Budget first load from shipping every Budget line item to the client.

The Budget grid should load a light snapshot and a paged row set instead of loading the full line-item universe up front.

### Why This Matters

The prior performance work made the loaded data cheaper to process, but it did not fully solve first-load row volume.

If a large Budget has hundreds or thousands of line items, the current client-side model can still pay for:

- fetching all rows,
- hydrating all rows into client state,
- preparing client-side filter/search/pagination structures,
- and keeping the full dataset resident even when the UI only displays one page.

### Required Contract Direction

Split Budget loading into three paths.

#### Endpoint A — Light Budget Snapshot

`GET /api/events/[eventId]/budget`

Returns Budget metadata and global summaries without the full line-item array.

Should include:

- Budget metadata
- global totals
- submissions / recipients where needed
- lock/submission state where needed
- line item count
- other lightweight metadata required for the grid shell

Should not include every line item by default.

#### Endpoint B — Paged Budget Line Items

`GET /api/events/[eventId]/budget/line-items`

Returns only the current page of rows.

Query params should support:

- page
- page size
- search
- category
- subcategory
- status
- approval state
- session
- group
- sort column
- sort direction

Response should include:

- current page rows
- filtered count
- filtered footer totals / aggregates

The returned row shape should preserve the fields needed by the existing grid row UI.

#### Endpoint C — IDs-Only Bulk Selection

`GET /api/events/[eventId]/budget/line-items/ids`

Returns IDs matching the current filter/search state.

This supports bulk selection across pages without loading every row.

---

## Global Totals And Dirty Overlay

Server-side pagination must not accidentally make totals page-only.

### Required Rule

Header/global totals must remain global.

They should be based on server-authoritative full-budget totals, not a reduce over the current page.

### Dirty Overlay Design

The parent grid should maintain a dirty overlay keyed by line item ID.

The overlay stores unsaved edits for rows the user has touched, even if those rows are no longer on the current page.

Global optimistic totals should be calculated as:

```text
server committed global totals + unsaved dirty-row deltas
```

This preserves optimistic feedback without requiring every line item to remain loaded.

### Non-Negotiable

Do not lose drafts when a row pages away, filters away, or unmounts.

Do not show fake page-only totals as global totals.

---

## Product Decisions For This Phase

These decisions are now set and should be baked into the prompt pack.

### Export Behavior

Support both export modes:

1. Export full Budget.
2. Export current filtered view.

The existing full export behavior should remain available.

Filtered export should honor active search/filter/sort where feasible.

### Bulk Selection Behavior

Support three selection modes:

1. Select current page.
2. Select all filtered results.
3. Select all rows when no filter/search is active.

When filters are active, “select all filtered” should mean all matching rows, not just currently loaded rows.

### Page Size

Default page size should be:

```text
10
```

Page-size options can remain available if already present, but the default should be 10 for now.

### Sort Columns

Add user-facing sort controls now.

Sorting should be server-backed once server-side pagination is active, so page boundaries remain stable.

---

## Implementation Order

The recommended implementation order is:

```text
1. BudgetRow extraction / memoization
2. Server-side pagination / filter / sort
```

### Why Row Memoization Comes First

BudgetRow extraction is self-contained and does not require API contract changes.

It directly improves interaction jank.

It establishes the row boundary needed before server-side pagination causes rows to mount and unmount more frequently.

It lets the parent grid keep draft/dirty/save state keyed by ID while rows become disposable render units.

### Why Pagination Comes Second

Server-side pagination is higher contract risk.

It changes how rows load, how filters/search/sort work, how footer totals are calculated, and how bulk selection works across pages.

It should be implemented only after row state boundaries are stable.

---

## Prompt Pack Structure

Use one Budget Deep Performance prompt pack with nine prompts.

```text
Prompt 1 — Stabilize Budget grid row handlers and refs
Prompt 2 — Extract and memoize BudgetRow
Prompt 3 — Add render isolation tests and B9 verification
Prompt 4 — Add paged Budget line-items endpoint with server filters/sort/totals
Prompt 5 — Add ids-only Budget line-item selection endpoint
Prompt 6 — Lighten Budget snapshot and add lineItemCount/global totals contract
Prompt 7 — Add client dirty overlay and global optimistic totals model
Prompt 8 — Flip Budget grid to server-paged rows/filter/search/sort
Prompt 9 — Wire bulk selection/export modes, remove dead client full-array code, and run final verify
```

---

## Schema Mode

Schema mode remains:

```text
LOCKED
```

No schema changes.

No migrations.

No generated Prisma client changes.

If an optimization appears to require schema changes, stop and report it as a deferred proposal.

---

## Out Of Scope

Do not include:

- schema changes
- migrations
- generated Prisma client updates
- task API deletion
- assignment-flow rewrites
- Matrix staffing reconciliation
- broad Budget redesign
- unrelated Timeline/Roadmap work
- unrelated Docs/Speakers/Command Center work
- unrelated lint cleanup
- production-readiness work

---

## Success Criteria

This deep Budget performance phase is successful when:

- typing/editing one row no longer re-renders every visible row,
- Budget first load no longer ships all line items by default,
- global totals remain global and correct,
- filtered footer totals are server-backed and correct,
- search/filter/sort are server-backed for paged rows,
- dirty edits survive paging/filtering/unmounting,
- save-all still persists dirty rows even if they are not on the current page,
- bulk selection supports current page, all filtered, and all rows,
- export supports full Budget and filtered export,
- default page size is 10,
- read-only/locked/submitted/approved rows remain protected,
- no accounting semantics change,
- all targeted tests pass,
- `cd web && rm -rf .next/types && npm run verify` passes before merge.

---

## Manual QA Checklist

Budget grid load:

```text
[ ] Budget page loads faster for large budgets.
[ ] Initial page shows the first page of rows only.
[ ] Default page size is 10.
[ ] Global header totals are correct and not page-only.
[ ] Filtered footer totals are correct for active filters.
```

Budget editing:

```text
[ ] Typing in forecast/actual feels responsive.
[ ] Editing one row does not visibly lag the whole grid.
[ ] Draft values survive paging away and back.
[ ] Save all persists dirty rows even if they are off-page.
[ ] Row errors/saved state remain correct.
```

Filters/search/sort:

```text
[ ] Search uses server-backed results.
[ ] Category/status/session/group filters use server-backed results.
[ ] Sort controls work and preserve stable page boundaries.
[ ] Empty filtered state is clear.
[ ] Pagination works after filters/search/sort.
```

Bulk selection:

```text
[ ] Select current page works.
[ ] Select all filtered works across pages.
[ ] Select all rows works when unfiltered.
[ ] Bulk actions affect the intended IDs only.
[ ] Locked rows remain protected.
```

Export:

```text
[ ] Full Budget export still works.
[ ] Filtered export works when filters/search are active.
[ ] Exported totals/rows match the selected export mode.
```

Permissions / read-only:

```text
[ ] Write-capable user can edit/save.
[ ] EVENT_VIEWER/read-only user cannot edit.
[ ] Locked/submitted/approved rows remain read-only where required.
```
