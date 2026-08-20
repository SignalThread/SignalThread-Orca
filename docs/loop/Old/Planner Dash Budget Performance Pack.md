# Planner Dash — Budget Performance Prompt Pack

_Last updated: 2026-07-06_

## Purpose

This prompt pack implements the **Budget-first performance fixes** from the Planner Dash Performance Audit.

The audit found that Budget is the first and most important performance target. The real Budget cost centers are:

```text
B1 — getBudgetSnapshot runs independent reads serially.
B2 — read paths perform Budget upserts/write-on-read.
B3 — every grid keystroke recomputes rollups over the full line-item set.
B5 — budget dashboard double-checks auth and loads a full snapshot for a totals-oriented view.
B6 — getBudgetBlocksSummary triggers duplicate concurrent Budget upserts.
B7 — totals-only endpoints fetch all rows and sum in JS where DB groupBy/_sum fits.
B8 — several derived grid collections rebuild in render without memoization.
B9 — the budget grid row rendering is monolithic and re-renders too broadly.
```

Deferred Budget items not included in this first pack:

```text
B4 — Budget files lazy-load / activity LIKE scan cleanup.
B10 — Budget import resolver/group-create N+1 cleanup.
B11 — Budget submission pre-transaction reads parallelization.
```

Those are real findings, but they are lower priority than the page-load and typing/render hot path.

---

## Expected Branch

```text
chore/performance-budget-hot-path
```

Create it from the latest `main` after the ops rollup consistency branch has been merged and pushed.

---

## Schema Mode

```text
LOCKED
```

No schema changes. No migrations. No Prisma schema edits. No generated client changes.

If a proposed optimization requires a schema change, stop and report it as a deferred follow-up.

---

## Allowed Scope

Budget performance only:

```text
- Budget snapshot read path
- Budget read/write accessor split
- Budget dashboard read path
- Budget block/category/group/reporting totals paths
- Budget grid client-side recomputation
- Budget grid row render behavior
- Focused Budget tests and source-backed regressions
```

---

## Out of Scope

```text
- schema changes
- migrations
- generated Prisma client changes
- task API deletion or tasking flow changes
- Matrix staffing reconciliation
- Docs Hub performance fixes
- Speaker list performance fixes
- Command Center performance fixes outside Budget calls
- broad UI redesign
- generic lint cleanup
- unrelated production-readiness/security work
- PR creation
```

---

## Canonical Files / Areas To Inspect

Likely Budget server files:

```text
web/src/server/services/budget.ts
web/src/server/services/budget-sessions-groups.ts
web/app/api/events/[eventId]/budget/**/route.ts
```

Likely Budget client files:

```text
web/app/(shell)/budgets/_components/full-budget-grid.tsx
web/app/(shell)/budgets/_components/budget-dashboard.tsx
web/app/(shell)/events/[eventId]/budget/page.tsx
web/app/(shell)/budgets/page.tsx
```

Likely tests:

```text
web/lib/*budget*.test.ts
web/lib/test-journeys/*budget*.test.ts
```

Do not assume exact file names are complete. Grep source before editing.

---

## Global Implementation Rules

1. Keep behavior identical unless a prompt explicitly changes performance behavior.
2. Keep route/API response shapes stable unless the active prompt explicitly approves an internal-only lean path.
3. Do not change accounting semantics.
4. Do not change approval/submission behavior.
5. Do not change import/export behavior unless the active prompt explicitly touches that path.
6. Do not remove Budget features to make performance better.
7. Server reads should not write unless the path intentionally creates or mutates data.
8. Prefer canonical service/helper changes over route-specific workarounds.
9. Add focused regression coverage for every server-side behavior change.
10. For client performance changes, preserve editing, save, validation, pagination, locked-line behavior, filters, and empty/loading/error states.
11. Commit after each code-changing prompt with a non-interactive commit command.

---

## Verification Baseline

Use targeted tests after each prompt. At the end run:

```bash
cd web
rm -rf .next/types
npm run verify
```

Expected gate:

```text
typecheck passes
test:summary passes
build passes
```

Do not run `verify:strict` unless explicitly starting the lint cleanup project.

---

# Prompt 1 — Budget Performance Baseline + Call Graph Confirmation

## Goal

Confirm the current Budget performance paths before changing code, and produce a concise source-backed baseline for the implementation prompts.

## Scope

Audit only for this prompt unless a tiny test-only baseline fixture is already required by the repo pattern. Prefer no code changes.

## Tasks

1. Confirm the branch and dirty state.
2. Read the performance brief and this prompt pack.
3. Inspect Budget read paths and identify exact callers of:

```text
getBudgetSnapshot
getBudgetDashboard
getOrCreateBudgetForEvent
getBudgetBlocksSummary
category/group/reporting totals helpers
full-budget-grid.tsx draft/totals/render code
```

4. Classify each `getOrCreateBudgetForEvent` caller as one of:

```text
read path
write/mutation path
ambiguous path needing caution
```

5. Confirm whether Budget debug measurement already exists around `getBudgetSnapshot`, especially section durations and wall-clock logging.
6. Confirm the current client-side Budget grid behavior:

```text
amountDrafts / draft state shape
optimisticLineItems computation
totals computation
filteredLineItems computation
pagination and page size behavior
lockedLineItemIds / submitted/approved line behavior
row render location
```

7. Run the most relevant existing Budget tests to establish a baseline.

## Constraints

- Do not implement optimizations yet.
- Do not change schema.
- Do not change API behavior.
- Do not touch non-Budget modules.

## Deliverable

Stop with:

```text
Prompt completed:
Files changed:
Tests run:
Baseline findings:
Read/write path classification:
Client grid recomputation map:
Risks before Prompt 2:
Next prompt started or reason for stopping:
```

No commit is needed if no files changed.

---

# Prompt 2 — B1: Parallelize `getBudgetSnapshot` Independent Reads

## Goal

Reduce Budget snapshot latency by parallelizing independent reads in `getBudgetSnapshot` while preserving the exact response shape and logging/measurement behavior.

## Finding

The performance audit confirmed:

```text
B1 — getBudgetSnapshot runs 5–7 independent queries serially.
Location: web/src/server/services/budget.ts around getBudgetSnapshot.
```

The current flow is effectively:

```text
budget lookup
→ lineItems.read
→ activity.read
→ recipients.read
→ submissions.read
→ documentLinks.read
→ budgetFiles.read
```

Only `documentLinks.read` depends on line item IDs. Most other reads only depend on `budget.id` and can run in parallel.

## Required Behavior

1. Keep the Budget row lookup/access check behavior unchanged in this prompt.
2. After the Budget row is known, run independent snapshot reads concurrently using `Promise.all`.
3. Keep `documentLinks.read` dependent on the line item IDs. It may run after line items are loaded.
4. Preserve all existing snapshot fields, sorting, filtering, normalization, and response shape.
5. Preserve existing debug/measurement semantics as much as possible.
6. Do not change read/write semantics yet. Prompt 3 handles write-on-read.

## Likely Files

```text
web/src/server/services/budget.ts
Budget snapshot tests under web/lib or web/lib/test-journeys
```

## Testing Required

Add or update a focused regression test that proves the snapshot payload remains equivalent for a fixture with:

```text
- line items
- activity
- recipients/submissions if supported by existing fixtures
- document links if supported by existing fixtures
- budget files only if existing tests already cover them safely
```

Also run targeted existing Budget tests.

## Hard Stops

Stop if:

```text
- parallelization would require changing response shape
- code relies on side effects from the old serial order
- a query actually depends on data from an earlier query and cannot be safely parallelized
```

## Commit

If code changes are made:

```bash
git add -A
git commit -m "Parallelize budget snapshot reads"
```

## Stop Format

```text
Prompt completed:
Files changed:
Tests run:
Test results:
Behavior changed:
Performance expectation:
Risks / follow-up needed:
Next prompt started or reason for stopping:
```

---

# Prompt 3 — B2 + B6: Stop Budget Write-On-Read And Duplicate Upserts

## Goal

Remove Budget row upserts from pure read paths and eliminate duplicate concurrent upserts in Budget block/category/group summary reads.

## Findings

The audit confirmed:

```text
B2 — getOrCreateBudgetForEvent performs budget.upsert even on read paths.
B6 — getBudgetBlocksSummary can run category and group totals in parallel, each independently upserting the same Budget row.
```

This causes:

```text
- row lock contention
- write amplification
- WAL churn
- redundant concurrent writes from a single page load
```

## Required Behavior

1. Introduce or reuse a read-only Budget accessor for GET/read paths.

Suggested shape:

```text
getBudgetForEventReadOnly(eventId, user/access context)
```

or an equivalent helper that:

```text
- performs the required access/tenant validation
- uses findUnique/findFirst instead of upsert
- returns null/empty state if no Budget row exists
```

2. Keep `getOrCreateBudgetForEvent` or equivalent create-on-demand behavior only for true mutation/write paths.
3. Update Budget read paths to avoid upsert where no mutation is intended.
4. For empty/no-budget state, preserve existing UI/API behavior by returning a synthetic empty snapshot or empty totals where appropriate.
5. In `getBudgetBlocksSummary`, resolve the Budget row once and pass the `budgetId` into category/group total helpers instead of letting each helper upsert independently.
6. Do not change accounting, approval, submission, import, export, or line-item mutation semantics.

## Read Paths To Inspect

At minimum inspect callers in:

```text
web/src/server/services/budget.ts
web/src/server/services/budget-sessions-groups.ts
web/app/api/events/[eventId]/budget/**/route.ts
```

Use grep to classify all callers before editing.

## Write Paths That Should Still Create Budget Rows

Keep create/upsert behavior for mutation paths such as:

```text
- creating/updating/deleting line items
- imports
- approvals/submissions/revisions
- category/group/session mutations when they require persisted Budget ownership
- file upload/finalize paths when they intentionally attach to a Budget
```

Do not rely on this list blindly. Confirm from source.

## Testing Required

Add focused tests proving:

```text
- GET/snapshot/dashboard read path does not call Budget upsert or does not create a Budget row when none exists
- read path still returns a valid empty state when no Budget row exists
- write/mutation path still creates Budget when needed
- getBudgetBlocksSummary does not perform duplicate budget creation/upsert work
```

Use the repo's existing test style. Source-string tests are acceptable only where DB-spy testing is impractical, but prefer behavior tests.

## Hard Stops

Stop if:

```text
- a read route currently relies on Budget row creation as a product behavior
- removing upsert would break an existing persisted workflow
- the correct empty-state response is unclear
```

## Commit

```bash
git add -A
git commit -m "Stop budget write-on-read"
```

## Stop Format

```text
Prompt completed:
Files changed:
Tests run:
Test results:
Read paths converted:
Write paths preserved:
Behavior changed:
Risks / follow-up needed:
Next prompt started or reason for stopping:
```

---

# Prompt 4 — B5: Budget Dashboard Single-Auth + Lean Read Path

## Goal

Make the Budget dashboard route/service cheaper by avoiding duplicate authorization work and avoiding a full snapshot when the dashboard only needs a smaller data set.

## Finding

The audit confirmed:

```text
B5 — getBudgetDashboard performs read auth, then write auth by catching a thrown failure, then loads a full Budget snapshot for a totals-oriented dashboard view.
Location: web/src/server/services/budget.ts around getBudgetDashboard.
```

## Required Behavior

1. Replace duplicate read/write authorization checks with a single access/membership resolution when safely possible.
2. Compute `canWriteBudget` without intentionally throwing/catching a second access failure if the existing access helper design allows it.
3. Avoid calling the full `getBudgetSnapshot` for dashboard-only data if a leaner query can preserve the existing response contract.
4. Keep the dashboard API/UI response shape stable unless the route and client are updated together with tests.
5. Preserve all permissions exactly:

```text
- users who could read before can still read
- users who could write before still see/write correctly
- users who could not write must not gain write access
- EVENT_VIEWER/read-only behavior remains correct
```

## Likely Files

```text
web/src/server/services/budget.ts
web/app/api/events/[eventId]/budget/dashboard/route.ts
web/app/(shell)/budgets/_components/budget-dashboard.tsx
Budget access/regression tests
```

## Testing Required

Add/update tests for:

```text
- dashboard read access
- read-only / canWrite false behavior
- write-capable / canWrite true behavior
- dashboard totals match the previous snapshot-derived totals for a representative fixture
```

Also run targeted Budget dashboard tests.

## Hard Stops

Stop if:

```text
- a lean dashboard path would require broad client contract changes
- access helper behavior is unclear and a rewrite would risk permissions
- route/service scoping is ambiguous
```

In that case, keep the single-auth improvement only and report the lean path as deferred.

## Commit

```bash
git add -A
git commit -m "Lean budget dashboard reads"
```

## Stop Format

```text
Prompt completed:
Files changed:
Tests run:
Test results:
Access behavior preserved:
Dashboard response behavior:
Deferred items:
Next prompt started or reason for stopping:
```

---

# Prompt 5 — B7: Use DB Aggregates For Totals-Only Budget Endpoints

## Goal

Replace totals-only fetch-all-and-reduce-in-JS paths with DB `groupBy` / `_sum` aggregates where the endpoint does not need the full row list.

## Finding

The audit confirmed:

```text
B7 — category/group/report totals fetch all line-item rows and sum in JS even where DB groupBy/_sum fits.
Locations include budget-sessions-groups.ts and budget.ts reporting/category/group helpers.
```

Indexes already support common grouping keys such as:

```text
budgetId + category
budgetId + groupId
```

## Required Behavior

1. Identify endpoints/helpers that fetch rows solely to compute totals.
2. Replace those with Prisma aggregate/groupBy queries.
3. Do not change the main full-grid snapshot to DB-only totals if it already has line items in memory for rendering.
4. Preserve numeric semantics exactly:

```text
forecast totals
actual/spent totals
variance calculations
category totals
group totals
session/block totals
status filtering if any
```

5. Preserve null handling and decimal/number normalization exactly.
6. Keep response shapes stable.

## Likely Files

```text
web/src/server/services/budget.ts
web/src/server/services/budget-sessions-groups.ts
Budget aggregate tests
```

## Testing Required

Add aggregate-equivalence tests:

```text
- create fixture rows with multiple categories/groups/statuses
- compute expected totals by hand
- assert DB aggregate path returns the same numbers as previous JS reduce semantics
```

Include edge cases:

```text
- null category or group where supported
- zero actual / null actual
- forecast without actual
- actual greater than forecast
```

## Hard Stops

Stop if:

```text
- Prisma cannot express an existing row-level comparison safely
- a path needs individual row details, not just totals
- aggregate behavior would change null/category/group semantics
```

## Commit

```bash
git add -A
git commit -m "Use budget aggregates for totals"
```

## Stop Format

```text
Prompt completed:
Files changed:
Tests run:
Test results:
Endpoints/helpers converted:
Endpoints intentionally left row-based:
Behavior changed:
Risks / follow-up needed:
Next prompt started or reason for stopping:
```

---

# Prompt 6 — B3 + B8: Reduce Full-Grid Recalculation While Typing

## Goal

Make Budget grid editing responsive by preventing every keystroke from invalidating full-dataset rollups and derived collections.

## Findings

The audit confirmed:

```text
B3 — Every keystroke recomputes rollups over the entire line-item set.
B8 — Several derived collections rebuild in render body without useMemo.
Location: web/app/(shell)/budgets/_components/full-budget-grid.tsx.
```

Known hot spots:

```text
amountDrafts object spread on each keystroke
optimisticLineItems remaps all line items
optimisticLineItemsById rebuilds a full Map
totals = computeBudgetTotals(...) runs full reduces
filteredLineItems can rerun unnecessarily
lockedLineItemIds and other derived arrays/sets rebuild in render
```

## Required Behavior

1. Preserve all Budget grid editing behavior:

```text
cell typing
blur/save behavior
validation
optimistic display
dirty-row behavior
pagination
filters/search/sort if present
locked/submitted/approved line behavior
```

2. Reduce full-dataset recomputation during typing.

Preferred low-risk approach:

```text
- compute base totals from committed lineItems with useMemo
- derive visible/optimistic row values from committed lineItems plus draft maps
- apply draft deltas over changed draft entries rather than remapping/reducing the full line-item set on every keystroke
- keep explicit progress/status/category/filter semantics intact
```

Alternative acceptable approach if safer in current code:

```text
- debounce/defer expensive totals recomputation so input typing stays responsive
- still preserve correct totals after debounce/blur/save
```

3. Memoize derived collections currently rebuilt in render, such as:

```text
lockedLineItemIds
submitted/approved line lookup sets
category/group/session derived lists where applicable
filtered/paginated intermediates where dependencies are narrower than current render scope
```

4. Keep calculations exact after blur/save and after server refresh.
5. Do not change API calls in this prompt unless necessary for preserving behavior.

## Likely File

```text
web/app/(shell)/budgets/_components/full-budget-grid.tsx
```

Optionally extract helpers into a local file only if it reduces risk and improves testability.

## Testing Required

Run existing Budget grid/client tests if present.

Add unit tests for extracted calculation helpers if you create them. Useful cases:

```text
- one row draft amount changes and totals update correctly
- explicit committed totals remain unchanged when draft is cleared
- actual > forecast variance remains correct
- locked lines remain locked
```

If component-level tests are not practical, run typecheck plus targeted Budget regression tests and report manual QA requirements clearly.

## Manual QA Required

After this prompt, final report must include:

```text
- type into forecast/actual cells
- confirm input does not lag badly
- confirm totals update as intended
- confirm blur/save persists
- confirm pagination still works
- confirm locked/submitted rows still behave correctly
```

## Hard Stops

Stop if:

```text
- exact totals semantics become unclear
- draft state is shared with save/error handling in a way that makes local refactor risky
- preserving locked/submitted behavior requires a broader rewrite
```

## Commit

```bash
git add -A
git commit -m "Reduce budget grid recomputation"
```

## Stop Format

```text
Prompt completed:
Files changed:
Tests run:
Test results:
Client behavior preserved:
Performance expectation:
Manual QA needed:
Risks / follow-up needed:
Next prompt started or reason for stopping:
```

---

# Prompt 7 — B9: Memoize Budget Row Rendering + Final Verification

## Goal

Reduce broad Budget grid re-renders by extracting/memoizing row rendering and stabilizing callbacks/props where safe, then complete final verification for the Budget performance batch.

## Finding

The audit confirmed:

```text
B9 — Full Budget grid renders rows inline with fresh closures and no row-level memoization.
Location: full-budget-grid.tsx around the table row rendering area.
```

Even with client pagination, up to 100 rows can re-render on any parent state change.

## Required Behavior

1. Extract a focused Budget row component if it can be done without broad rewrite.
2. Wrap the row component in `React.memo` or equivalent memoization.
3. Pass only the row-specific props needed by each row.
4. Stabilize handlers with `useCallback` where it materially reduces row prop churn.
5. Avoid creating new object/array/function props per row unless necessary.
6. Preserve all row behavior:

```text
editing
saving
validation/error display
locked state
selection if present
expand/collapse if present
links/actions
keyboard/tab behavior where present
responsive behavior
```

7. Do not redesign the grid.
8. Do not add virtualization in this prompt unless the current code already has a simple supported hook for it. Pagination already limits rendered rows.

## Testing Required

Run:

```text
- targeted Budget tests
- typecheck
- any component tests covering full-budget-grid if present
```

Then run the full verification gate:

```bash
cd web
rm -rf .next/types
npm run verify
```

## Final Closure Review

Before committing/final report, confirm:

```text
- no schema files changed
- no migration files created
- no generated client changes
- Budget read paths no longer upsert on GET/read-only paths
- mutation paths still create/update Budget as needed
- getBudgetSnapshot response shape remains compatible
- Budget dashboard permissions remain correct
- totals-only endpoint responses remain compatible
- grid editing behavior remains intact
- task APIs untouched
- Matrix staffing untouched
```

## Commit

```bash
git add -A
git commit -m "Memoize budget grid rows"
```

If Prompt 7 only makes verification/report changes and no files changed, do not create an empty commit.

## Final Stop Format

```text
Overall implementation summary:
Budget findings fixed:
Files changed:
Migration files created:
Schema/client generation:
Tests run:
Passing/failing status:
Typecheck/build status:
Manual QA checklist:
Known risks:
Deferred Budget performance items:
Out-of-scope items not touched:
Branch ready for human review: yes/no
```

---

# Deferred Budget Follow-Up Pack Items

Do not implement these in this first Budget hot-path pack unless the human explicitly asks.

## B4 — Budget Files Lazy Load / Activity LIKE Scan

Finding:

```text
Budget-files snapshot uses non-indexable note contains LIKE scan and joins 100 documents/versions on every full load.
```

Likely quick fix:

```text
Default includeBudgetFiles=false for grid loads; fetch files lazily from existing files endpoint.
```

Possible deeper fix requires schema:

```text
BudgetActivity.kind / isFileEvent discriminator with index.
```

## B10 — Budget Import Resolver / Group Create N+1

Finding:

```text
Import resolves sessions/groups serially and creates each new group one-by-one.
```

Likely fix:

```text
Parallelize resolvers; batch group creation with createMany({ skipDuplicates }) where safe.
```

## B11 — Submission Create Pre-Transaction Reads

Finding:

```text
Submission create runs three independent reads serially before the transaction.
```

Likely fix:

```text
Promise.all independent pre-transaction reads.
```
