# Planner Dash — Budget Grid Deep Performance Prompt Pack

## Purpose

This pack implements the two remaining high-impact Budget performance fixes identified in the focused Budget Grid Deep Performance Plan:

1. **Budget row extraction / memoization** so editing one row does not re-render every visible row.
2. **Server-side Budget pagination / filter / sort** so initial load no longer ships the entire Budget line-item universe to the client.

This pack is implementation work, not another audit. Execute prompts in order.

---

## Expected Branch

```txt
chore/budget-grid-deep-performance
```

---

## Schema Mode

```txt
LOCKED
```

No schema changes. No migrations. No generated Prisma client changes.

---

## Product Decisions Locked For This Pack

### Export behavior

Support **both**:

- Export full Budget
- Export current filtered Budget view

Do not remove the existing full-budget export behavior.

### Bulk-select behavior

Support clear selection modes:

- Select current page
- Select all filtered results when filters/search are active
- Select all rows when no filters/search are active

Selection must remain ID-based and must not depend on all rows being loaded in the client.

### Page size

Default page size should be **10**.

Allowed page-size options can remain available if already present, but first/default load should be 10 rows.

### Sort behavior

Add user-facing sort controls now.

At minimum support server-side sort by practical Budget columns already represented in the row data, such as:

- sort order / default order
- category
- vendor
- item/name/description label if available
- forecast
- actual
- variance if safely supported
- created/updated date if already available

Do not add schema for sorting.

---

## Global Constraints

- No schema changes.
- No migrations.
- Do not touch task APIs.
- Do not break assignment flows.
- Do not change accounting semantics.
- Do not fake global totals from page-only data.
- Do not change export correctness.
- Do not lose unsaved drafts when rows unmount.
- Do not hide filtered rows incorrectly.
- Do not rewrite unrelated Budget surfaces.
- Do not touch Matrix staffing reconciliation.
- Do not do broad UI redesign.
- Keep route handlers thin.
- Keep business logic in services/helpers.
- Preserve existing permissions and read-only behavior.
- Use targeted git adds. Do not use `git add -A` when unrelated files are dirty.

---

## Canonical Files / Areas

Inspect and touch only where needed:

```txt
web/app/(shell)/budgets/_components/full-budget-grid.tsx
web/src/server/services/budget.ts
web/src/server/services/budget-sessions-groups.ts
web/app/api/events/[eventId]/budget/route.ts
web/app/api/events/[eventId]/budget/line-items/route.ts
web/app/api/events/[eventId]/budget/export/line-items.csv/route.ts
web/app/api/events/[eventId]/budget/export/summary.csv/route.ts
web/lib/*budget*.test.ts
web/lib/test-journeys/*budget*.test.ts
```

Add small helper files/components if they reduce risk and keep `full-budget-grid.tsx` reviewable.

---

## Pack Structure

This is one pack with two phases:

```txt
Prompts 1–3: BudgetRow extraction / memoization
Prompts 4–9: Server-side pagination / filter / sort
```

Do not skip Prompt 1–3. Row memoization comes first because it is contract-free, immediately improves typing/render jank, and creates the safe row boundary needed before server paging can unmount rows.

---

# Prompt 1 — Stabilize Budget Grid Row Handlers

## Goal

Prepare the Budget grid for row extraction by stabilizing row-level handlers and ref-registration callbacks without changing behavior.

## Scope

In `full-budget-grid.tsx`, identify row-level handlers currently recreated during parent renders. Convert them to stable callbacks where safe.

Examples to inspect:

- row selection toggle
- row click / focus behavior
- open approval drawer
- amount draft change
- amount blur/save
- text field change
- text field blur/save
- session assignment
- group assignment
- group delete
- dirty-row marking
- forecast input ref registration
- category select ref registration

## Requirements

- Use `useCallback` for row-level handlers where safe.
- Prefer ID-based arguments over closing over entire row objects where practical.
- Preserve functional state updaters so dependencies stay stable.
- Do not move state into rows yet.
- Do not extract the row component yet.
- Do not change payload shapes or APIs.
- Preserve existing edit/save/blur behavior.
- Preserve read-only and locked-row behavior.
- Preserve bulk selection behavior.

## Tests / Verification

Run targeted Budget grid tests and typecheck.

Suggested:

```bash
cd web
npx tsx --test web/lib/budget-grid-recompute-regression.test.ts web/lib/budget-dashboard-regression.test.ts
npm run typecheck
```

Use the correct actual test paths in the repo.

## Stop Report

Report:

- handlers stabilized
- files changed
- tests run
- behavior changed, if any
- risks found for row extraction

Commit with:

```bash
git commit -m "Stabilize Budget grid row handlers"
```

---

# Prompt 2 — Extract And Memoize BudgetRow

## Goal

Extract the inline Budget table row JSX into a memoized `BudgetRow` component so editing one row does not force every visible row to re-render.

## Scope

Work in `full-budget-grid.tsx` or a nearby component file if cleaner, for example:

```txt
web/app/(shell)/budgets/_components/BudgetRow.tsx
```

## Requirements

Create a `React.memo` row component with a clean boundary.

Parent-owned state must stay parent-owned:

- line items / budget data
- amount drafts
- text drafts
- dirty IDs
- saving IDs
- row errors
- saved IDs
- selected IDs
- filters/search/sort/page state
- totals
- submission/approval threads
- option lists
- all persistence/fetch logic

Row props should be narrow and stable:

- committed item for this row
- amount draft for this row
- text draft for this row
- primitive row booleans: selected, locked, read-only, dirty, new, saved
- row error
- pre-resolved approval state
- stable group/session/category options
- stable callbacks from Prompt 1

Move row-only calculations into the row where safe:

- optimistic row display values
- variance display
- row-level class names
- category option display, if already cheap/stable

Pre-resolve parent-wide derived values into maps/primitives before passing them to rows:

- approval state by line item ID
- locked/read-only state by line item ID
- selected state by line item ID
- dirty/saved/error state by line item ID

Do **not** pass large changing collections into every row if a primitive or per-row value will do.

## BudgetGroupSelectCell

Inspect `BudgetGroupSelectCell`. If fresh inline callbacks defeat row memoization, stabilize its props and wrap it in `React.memo` if safe.

## Hard Stops

Stop if extraction requires a broad rewrite of unrelated Budget behavior.

Do not move draft state into `BudgetRow`. Drafts must survive pagination/page changes later.

## Tests / Verification

Run targeted Budget grid tests and typecheck.

Also manually inspect that the table still supports:

- typing forecast/actual
- vendor/category/status edits
- session/group assignment
- row selection
- locked row behavior
- approval drawer open

## Stop Report

Report:

- new component boundary
- props passed to `BudgetRow`
- memoization strategy
- tests run
- any known remaining re-render risks

Commit with:

```bash
git commit -m "Extract memoized Budget row component"
```

---

# Prompt 3 — Add Render Isolation Coverage For Budget Rows

## Goal

Prove row memoization works and lock the behavior with focused regression coverage.

## Requirements

Add or update tests that prove:

- editing one row does not re-render unrelated visible rows
- changing selection for one row does not unnecessarily re-render every row
- locked/read-only row behavior remains correct
- dirty drafts remain parent-owned and survive page changes within current client pagination
- group assignment/create/delete still works with stabilized callbacks

Use the testing style that best fits the existing repo. A lightweight render-count harness is acceptable if existing tests support it. If a true render-count test is not practical, add source-backed regression coverage plus a manual QA note explaining the limitation.

## Verification

Run targeted Budget tests and typecheck.

## Stop Report

Report:

- tests added/updated
- what they prove
- any render-count limitations
- manual QA needed

Commit with:

```bash
git commit -m "Add Budget row render isolation coverage"
```

---

# Prompt 4 — Add Server-Paged Budget Line Items Endpoint

## Goal

Add the server-side read contract for paged Budget line items while keeping the client on the existing full-array path for now.

## Endpoint

Implement or extend:

```txt
GET /api/events/[eventId]/budget/line-items
```

Query params:

```txt
page
pageSize
search
category
subcategory
status
approval
sessionId
groupId
sort
dir
```

## Response Shape

Return:

```ts
{
  rows: BudgetLineItemWithDocs[];
  filteredCount: number;
  filteredFooterTotals: {
    forecastCents: number;
    actualCents: number;
    varianceCents: number;
  };
}
```

Use the same per-row shape the grid needs today, minus unnecessary heavy nested data already trimmed by previous performance work.

## Requirements

- Translate current client filtering/search logic into Prisma `where` clauses.
- Implement server-side `orderBy` for the supported sort columns.
- Default page size: 10.
- Ensure filtered footer totals honor the same filter/search query as the returned rows.
- Ensure global snapshot totals are not replaced by page totals.
- Preserve authorization and event scoping.
- Preserve read-only behavior.
- No schema changes.
- Client remains on existing path in this prompt.

## Parity Tests

Add tests comparing the new endpoint/service output against current client-equivalent filtering math using seeded line items.

Cover:

- no filter
- search
- category
- status
- session
- group
- approval/locked state if supported
- sort + direction
- empty results
- page beyond range

## Stop Report

Report:

- endpoint/service added
- supported filters/sorts
- parity tests run
- any filters that required intentional approximation

Commit with:

```bash
git commit -m "Add paged Budget line items endpoint"
```

---

# Prompt 5 — Add Budget Line Item IDs Endpoint For Bulk Selection

## Goal

Add an IDs-only endpoint to support bulk selection across pages without loading every row.

## Endpoint

Add:

```txt
GET /api/events/[eventId]/budget/line-items/ids
```

Use the same filter/search params as the paged line-items endpoint.

## Response Shape

```ts
{
  ids: string[];
  count: number;
}
```

## Requirements

- Same authorization/event scoping as Budget line-item reads.
- Same filter/search semantics as the paged endpoint.
- Exclude rows that are not selectable if the current UI excludes locked/temp rows from bulk selection.
- Support three eventual client modes:
  - select current page
  - select all filtered results
  - select all rows when no filter/search is active
- Client does not need to use this endpoint yet.

## Tests

Add tests for:

- unfiltered ID set
- filtered ID set
- search ID set
- locked/submitted exclusions if applicable
- org/event scoping

## Stop Report

Report:

- endpoint path
- selection semantics
- tests run

Commit with:

```bash
git commit -m "Add Budget line item IDs endpoint"
```

---

# Prompt 6 — Lighten Budget Snapshot For Initial Load

## Goal

Split the initial Budget snapshot away from the full line-item array so first load can render shell/metadata/totals without shipping every row.

## Requirements

Modify the Budget snapshot contract carefully:

- Existing full snapshot behavior must remain available where needed during transition.
- Add an explicit option/flag for whether line items are included.
- Default the grid initial load toward the light snapshot only when the client is ready to fetch rows separately.
- Snapshot must still return authoritative global totals computed over the full Budget.
- Add `lineItemCount` for UI count/empty-state chrome.
- Preserve submissions/recipients/activity/files behavior as currently optimized/lazy-loaded.
- Preserve response shapes for existing callers that still require full rows.
- No schema changes.

## Compatibility

Do not break:

- exports
- dashboard totals
- category/group/session total helpers
- approval/submission flows
- budget blocks
- tests expecting full snapshot where full snapshot is explicitly requested

## Tests

Add/update tests proving:

- light snapshot excludes full line items
- light snapshot still includes authoritative totals
- lineItemCount is correct
- full snapshot remains available where explicitly requested

## Stop Report

Report:

- snapshot option/flag added
- callers changed
- compatibility preserved
- tests run

Commit with:

```bash
git commit -m "Add light Budget snapshot mode"
```

---

# Prompt 7 — Introduce Dirty Overlay For Paged Budget Editing

## Goal

Refactor the client totals/draft model so global optimistic totals do not depend on the full line-item array being loaded.

This prompt should still allow the client to load all rows if needed. It prepares the model before the client flips to server-paged rows.

## Requirements

In `full-budget-grid.tsx`:

- Introduce a parent-owned dirty overlay keyed by line-item ID.
- Dirty overlay stores enough committed/original row info and draft values to compute deltas even if the row is not on the current page later.
- Global displayed totals = server authoritative committed totals + dirty overlay deltas.
- Do not compute global totals by reducing the currently loaded page.
- Existing amount/text draft maps may remain, but the source of optimistic totals must be compatible with partial row loading.
- Save-all must iterate dirty IDs/overlay independent of current page.
- Discard/reset behavior must clear overlay entries correctly.
- Editing, blur-save, save-all, and refetch must reconcile overlay state correctly.

## Hard Stops

Do not move draft state into `BudgetRow`.

Do not show page-only totals as global totals.

## Tests

Add/update tests for:

- global optimistic total updates after edit
- dirty total still applies after page change
- save-all persists off-page dirty rows once paging is enabled or simulated
- discard clears deltas
- refetch reconciles committed totals

## Stop Report

Report:

- overlay shape
- totals calculation path
- save/discard reconciliation
- tests run

Commit with:

```bash
git commit -m "Add Budget dirty overlay for paged editing"
```

---

# Prompt 8 — Flip Budget Grid To Server-Paged Rows, Filters, Search, And Sort

## Goal

Move the Budget grid from client-side full-array filtering/pagination to server-paged rows.

## Requirements

Client behavior:

- Initial grid load uses light snapshot + first page of line items.
- Default page size is 10.
- Filters/search/sort are reflected in query/state where current architecture supports it.
- Search is debounced.
- Page resets safely when filters/search/sort change.
- Pagination controls use `filteredCount` from the server.
- Footer totals use `filteredFooterTotals` from the server.
- Header/global totals use snapshot global totals + dirty overlay deltas.
- Current page rows come from Endpoint B.
- Client no longer requires all rows to compute filters, pagination, or footer totals.

Sort behavior:

- Add user-facing sort controls.
- Sort direction is explicit.
- Server owns ordering.
- Page boundaries must remain stable under sort.

UX requirements:

- Clear loading state for page/filter/search/sort changes.
- Do not blank the entire Budget shell unnecessarily while rows refresh.
- Keep row edits safe while page is loading.
- Preserve current empty states, but make filtered-empty vs no-budget-empty clear.

Do not break:

- row edit/save
- locked rows
- bulk selection
- approval drawer
- session/group assignment
- pagination
- export buttons
- read-only user behavior

## Dead Code

After the server-paged path is working, remove or isolate dead client-side full-array filtering/footer/pagination code. Do not remove helpers still needed by tests or fallback/full snapshot callers.

## Tests

Add/update tests for:

- first load fetches light snapshot + first page rows
- default page size 10
- filters/search call server and show filtered rows
- server footer totals render correctly
- sort controls call server and reorder rows
- global totals are not page totals
- editing a row still works
- dirty row survives page navigation

## Stop Report

Report:

- client data flow before/after
- server params wired
- dead client code removed
- tests run
- manual QA needed

Commit with:

```bash
git commit -m "Use server-paged Budget rows in grid"
```

---

# Prompt 9 — Bulk Select, Export Options, Cleanup, And Final Verification

## Goal

Finish server-paged Budget behavior by wiring bulk selection and export options correctly, then run full verification.

## Bulk Select Requirements

Support clear selection modes:

1. Select current page
2. Select all filtered results when filters/search are active
3. Select all rows when no filters/search are active

Use Endpoint C for all-results/all-filtered selection.

Selection state must be ID-based and must survive page changes.

Selected count must accurately represent the selected ID set.

Do not claim rows are selected if IDs were not actually loaded/selected.

## Export Requirements

Support both:

- Export full Budget
- Export current filtered view

Do not remove or change the existing full export route behavior unless adding an explicit option.

For filtered export:

- reuse the same filter/search/sort params as the paged rows endpoint
- keep server authoritative export
- do not export only the current page unless explicitly labeled that way
- make button/copy clear

## Cleanup

Remove dead client-side full-array assumptions from the grid after the server-paged model is fully working:

- full-array filtered ID enumeration
- client footer total reducers that are replaced by server aggregates
- stale pagination helpers no longer used
- any temporary compatibility code that is no longer needed

Do not delete reusable helpers needed by exports/tests/other callers.

## Verification

Run targeted Budget tests, typecheck, and full verify from `web/`.

Suggested:

```bash
cd web
rm -rf .next/types
npm run typecheck
npm run test:summary
npm run build
```

If full verify fails due to unrelated dirty work, stop and report clearly. Do not sweep unrelated files into the commit.

## Manual QA Checklist

Include this in final report:

```txt
[ ] Budget grid first load shows shell quickly
[ ] First page loads 10 rows by default
[ ] Pagination works
[ ] Search works and is debounced
[ ] Filters work
[ ] Sort controls work
[ ] Header totals remain global
[ ] Footer totals match filtered set, not only current page
[ ] Editing forecast/actual works
[ ] Dirty edits survive page changes
[ ] Save all persists dirty rows across pages
[ ] Select current page works
[ ] Select all filtered results works
[ ] Select all rows works when unfiltered
[ ] Full export works
[ ] Filtered export works
[ ] Locked/submitted/approved rows remain protected
[ ] EVENT_VIEWER remains read-only
[ ] Session/group assignment still works
[ ] No task APIs changed
```

## Final Stop Report

Report:

- all files changed
- all endpoints added/changed
- schema/migration status
- tests run
- full verify result
- manual QA checklist
- known risks
- deferred items
- whether branch is ready to merge

Commit with:

```bash
git commit -m "Complete server-paged Budget grid performance"
```

---

# Final Notes For Reviewer

The most important correctness rule in this pack:

```txt
Never present page-only data as global Budget truth.
```

Header totals must remain global. Filtered footer totals must be filter-scoped. Current page counts must be page-scoped. Bulk selection must clearly distinguish current page, all filtered, and all rows.

The second most important rule:

```txt
Draft state must stay parent-owned and keyed by line-item ID.
```

Rows may mount/unmount under server pagination. Unsaved edits cannot disappear when a row leaves the current page.
