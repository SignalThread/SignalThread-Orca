# Planner Dash — Dashboard / Docs / Action Center / Speakers Performance Prompt Pack

_Last updated: 2026-07-07_

## Purpose

This prompt pack implements the next non-Budget performance batch for Planner Dash after Budget performance work.

The focus is:

1. **C1 — Account Dashboard / Command Center bounded nested fetch**
2. **D1 — Docs Hub link-target N+1**
3. **D2 — Docs Hub bounded list / pagination-safe loading**
4. **C3 — Action Center bounded queue reads**
5. **S1 — Speaker list lean select / detail split**

This is not a redesign pack. It is a targeted performance cleanup pack.

---

## Expected Branch

```text
chore/performance-dashboard-docs-action-speakers
```

Create it from latest `main` after Budget performance is merged and pushed.

---

## Schema Mode

```text
LOCKED
```

No schema changes. No migrations. No Prisma schema edits. No generated client changes.

If any optimization requires a schema change, stop and document it as a deferred follow-up.

---

## Allowed Scope

```text
- Account Dashboard / Command Center data loading
- Action Center queue loading
- Docs Hub list service and link-target resolution
- Speaker list service select shape
- Focused tests/regressions for those paths
- Small UI changes only where required to preserve existing list behavior under bounded/paged loading
```

---

## Out of Scope

```text
- Budget performance
- Run of Show / Matrix performance or UX cleanup
- Roadmap / Timeline UX cleanup
- Platform-wide performance/polish
- schema changes
- migrations
- generated Prisma client changes
- task API deletion
- assignment-flow rewrites
- Matrix staffing reconciliation
- broad UI redesign
- unrelated lint cleanup
- unrelated production-readiness work
- PR creation
```

---

## Canonical Files / Areas To Inspect

Likely files:

```text
web/src/server/services/command-center-dashboard.ts
web/app/(shell)/dashboard/page.tsx
web/app/(shell)/dashboard/action-center/page.tsx

web/src/server/services/documents.ts
web/app/(shell)/events/[eventId]/docs/**
web/app/api/events/[eventId]/documents/**

web/src/server/services/speakers.ts
web/app/(shell)/events/[eventId]/speakers/**
web/app/api/events/[eventId]/speakers/**
```

Likely tests:

```text
web/lib/dashboard-command-center-regression.test.ts
web/lib/test-journeys/*dashboard*.test.ts
web/lib/test-journeys/*documents*.test.ts
web/lib/test-journeys/*speaker*.test.ts
web/lib/*docs*.test.ts
web/lib/*speaker*.test.ts
```

Do not assume these are complete. Grep source before editing.

---

## Global Rules

1. Keep response shapes stable unless the active prompt explicitly changes a route and updates all callers/tests.
2. Preserve authorization, org scope, event scope, and read-only behavior.
3. Do not fake counts. If a list is capped, the UI must not represent the capped count as the true total unless a true total is also queried.
4. Prefer bounded server reads over loading everything and slicing in JS.
5. Batch N+1 resolution by collecting IDs and querying once per target type.
6. Split list payloads from detail payloads.
7. Do not hide items silently. If a bounded list needs load-more/pagination semantics, implement that or document a blocker.
8. Commit after each code-changing prompt using a non-interactive commit command.
9. Use targeted tests after each prompt. Run full verify at the end.

---

# Prompt 1 — Baseline / Scope Confirmation

## Goal

Confirm the current data paths and establish a source-backed baseline before changing code.

## Tasks

1. Confirm current branch and dirty state.
2. Read the loop controller, the performance brief, and this prompt pack.
3. Trace the Account Dashboard data load path:
   - page/component entry
   - service functions
   - route usage if any
   - nested event/timeline/deadline/dependency reads
   - UI caps/slices
4. Trace the Action Center queue load path:
   - queue reads
   - filters/views
   - visible item limits
   - total/count display behavior
5. Trace the Docs Hub list path:
   - list service
   - document includes
   - link target resolution
   - UI filters/search/status/review behavior
6. Trace the Speaker list/detail path:
   - list route/service select
   - detail route/service select
   - fields rendered in list
   - fields required only by detail
7. Identify existing tests and missing regression coverage.
8. Confirm no schema changes are needed.

## Constraints

- Audit/baseline only unless tiny test fixture cleanup is necessary.
- No schema changes.
- No implementation yet.
- Do not touch Budget, Run of Show, Roadmap, task APIs, or Matrix staffing.

## Deliverable

Stop with:

```text
Prompt completed:
Files changed:
Tests run:
Baseline findings:
Dashboard path:
Action Center path:
Docs Hub path:
Speaker path:
Risks before Prompt 2:
Next prompt started or reason for stopping:
```

No commit is needed if no files changed.

---

# Prompt 2 — C1: Bound Account Dashboard Nested Fetches

## Goal

Reduce Account Dashboard payload size and nested row volume while preserving existing dashboard output.

## Finding

The performance audit found that the account dashboard fetches all organization events with nested timeline/deadline/dependency rows, then sorts and slices in JS even though the UI only displays capped dashboard content.

Likely location:

```text
web/src/server/services/command-center-dashboard.ts
```

## Required Behavior

1. Identify every nested event/timeline/deadline/dependency read used by the Account Dashboard.
2. Bound nested selects with `orderBy` and `take` where safe.
3. Prefer separate bounded/aggregate queries if they are cleaner and lower risk than broad nested includes.
4. Avoid loading successor/dependency rows for every candidate when only top items are rendered.
5. Preserve existing dashboard response shape unless all callers/tests are updated together.
6. Preserve ordering and prioritization semantics for dashboard deadline/risk cards.
7. Preserve org scoping and event visibility semantics.
8. Do not convert true totals into capped/page-only counts.

## Implementation Notes

Use the UI’s actual display limits to determine safe bounds. If a panel renders top 12, do not fetch hundreds of rows only to slice to 12. If a count is displayed as a true total, query a true count separately instead of relying on bounded rows.

## Testing Required

Add or update focused coverage for:

```text
- many events with many timeline/deadline rows
- dashboard still returns expected top deadline/risk items
- ordering matches previous behavior
- counts/rollups are accurate and not accidentally bounded
- org/event scoping is preserved
```

## Hard Stops

Stop if:

```text
- dashboard response semantics are ambiguous
- a count would become misleading after bounding
- access/event visibility would require a broad auth rewrite
- correct ordering cannot be preserved without loading the full set
```

## Commit

```bash
git add <touched files>
git commit -m "Bound account dashboard nested fetches"
```

## Stop Format

```text
Prompt completed:
Files changed:
Tests run:
Test results:
Behavior changed:
Rows/payload reduced:
Counts preserved:
Risks / follow-up needed:
Next prompt started or reason for stopping:
```

---

# Prompt 3 — C1 Regression / Payload Parity Tests

## Goal

Lock the Account Dashboard performance behavior with focused regression coverage before moving to Docs Hub.

## Tasks

1. Review the Prompt 2 implementation against the performance brief.
2. Add any missing tests needed to prove:
   - dashboard deadline/risk outputs are still correct
   - top-item ordering is stable
   - capped rows are not treated as true totals
   - organization/event scoping remains correct
   - no unrelated dashboard rollup behavior changed
3. Add a source-backed or spy-style regression where useful to prevent reintroducing unbounded nested fetches.
4. Run targeted dashboard/command-center tests.
5. Run typecheck if files are broad.

## Constraints

- Do not continue optimizing new surfaces in this prompt.
- Do not redesign dashboard cards.
- No schema changes.

## Commit

If files changed:

```bash
git add <touched files>
git commit -m "Add account dashboard performance regressions"
```

No empty commit if no files changed.

## Stop Format

```text
Prompt completed:
Files changed:
Tests run:
Test results:
Coverage added:
Remaining C1 risks:
Next prompt started or reason for stopping:
```

---

# Prompt 4 — D1: Batch Resolve Docs Hub Link Targets

## Goal

Remove Docs Hub link-target N+1 behavior by batch-resolving linked targets once per list request.

## Finding

The performance audit found that Docs Hub calls `resolveLinkTargets` per document. Each document can trigger several target queries. This scales as documents × target types.

Likely location:

```text
web/src/server/services/documents.ts
```

## Required Behavior

1. Locate the Docs Hub list service and current per-document link target resolution.
2. Collect all links from all documents in the list response.
3. Group linked target IDs by target type.
4. Fetch targets once per type.
5. Reattach resolved link targets by `documentId`.
6. Deduplicate repeated linked target IDs before querying.
7. Preserve current API response shape.
8. Preserve current behavior for:
   - documents with no links
   - documents with multiple links
   - missing/deleted linked targets
   - mixed target types
   - status/review/category/tag fields
9. Keep event scoping and access checks unchanged.

## Testing Required

Add or update tests for:

```text
- multiple documents linking to the same target
- multiple documents linking to different target types
- duplicate targets are deduped
- documents with no links still serialize correctly
- resolved target payloads match prior behavior
```

Prefer behavior tests. Source-string tests are acceptable only if DB query spying is impractical.

## Hard Stops

Stop if:

```text
- target resolution currently has side effects
- link target response shape would need a broad client contract change
- target type scoping is unclear
```

## Commit

```bash
git add <touched files>
git commit -m "Batch resolve document link targets"
```

## Stop Format

```text
Prompt completed:
Files changed:
Tests run:
Test results:
Behavior changed:
N+1 removed:
Response shape preserved:
Risks / follow-up needed:
Next prompt started or reason for stopping:
```

---

# Prompt 5 — D2: Bound Docs Hub List Loading / Pagination-Safe Path

## Goal

Make Docs Hub list loading bounded or pagination-ready without hiding documents or lying about totals.

## Finding

The audit found that the Docs Hub list fetches all documents with rich includes and no pagination/bounds.

Likely location:

```text
web/src/server/services/documents.ts
Docs Hub page/list components
Documents API routes
```

## Required Behavior

Pick the safest implementation based on current UI structure:

### Preferred if straightforward

Implement pagination or load-more semantics:

```text
- server supports page/pageSize or cursor/take
- response includes accurate total or hasMore
- UI can load more documents without losing filters/status/search behavior
```

### Acceptable if pagination is too broad for this pass

Implement safe partial optimization:

```text
- trim rich includes from the list if detail-only data is loaded but not rendered
- split list/detail fields where safe
- document exact blockers for full pagination/load-more
```

## Hard Rule

Do **not** cap the server query while leaving the UI pretending all documents are loaded.

If the UI displays a total, that total must be accurate. If only a capped/recent list is shown, the copy must make that clear or offer load-more.

## Preserve

```text
- filters/search/category/status/review behavior
- linked targets from Prompt 4
- document approval/review state
- upload/finalize/download behavior
- event access checks
- response compatibility where possible
```

## Testing Required

Add/update tests for:

```text
- empty list
- under-limit list
- over-limit list with accurate total/hasMore or pagination state
- filters/status/review behavior
- linked targets still work with bounded/paged loading
```

## Hard Stops

Stop if:

```text
- current UI has no safe pagination/load-more insertion point
- capping would hide documents without a visible affordance
- status/review counts depend on full list in a way that cannot be replaced by accurate counts
```

In that case, implement only safe include trimming and document the pagination plan.

## Commit

```bash
git add <touched files>
git commit -m "Bound docs hub list loading"
```

## Stop Format

```text
Prompt completed:
Files changed:
Tests run:
Test results:
Behavior changed:
Pagination/bounding approach:
Counts/hasMore behavior:
Deferred items:
Next prompt started or reason for stopping:
```

---

# Prompt 6 — C3: Bound Action Center Queue Reads

## Goal

Reduce Action Center unbounded queue reads while preserving queue meaning and count semantics.

## Finding

The audit found Action Center queues with unbounded reads for risk timeline items, budget line items, documents, and submissions.

Likely location:

```text
web/app/(shell)/dashboard/action-center/page.tsx
```

## Required Behavior

1. Identify every Action Center queue read.
2. For queues with a visible cap, add `orderBy` + `take` where correctness allows.
3. Preserve exact top-item ordering.
4. Preserve accurate count/total semantics:
   - if a true total is displayed, query the true count
   - if only recent/top items are displayed, label or structure accordingly
5. For row-level comparisons Prisma cannot express safely, keep correctness over premature optimization.
6. Do not hide items silently.
7. Preserve existing Action Center views/filters.

## Testing Required

Add/update tests for:

```text
- queue with more items than visible cap
- top visible items are correct
- true total/count is accurate if displayed
- filters/views still work
- org/event scoping remains correct
```

## Hard Stops

Stop if:

```text
- a queue exports or acts on the full list and bounding would break it
- total semantics cannot be preserved without a bigger UI change
- a required row-level comparison cannot be expressed safely
```

Document the blocker and implement safe partial improvements only.

## Commit

```bash
git add <touched files>
git commit -m "Bound action center queue reads"
```

## Stop Format

```text
Prompt completed:
Files changed:
Tests run:
Test results:
Queues bounded:
Queues intentionally left unbounded:
Count semantics:
Risks / follow-up needed:
Next prompt started or reason for stopping:
```

---

# Prompt 7 — S1: Split Speaker List Select From Detail Select

## Goal

Trim the Speaker directory/list payload by using a lean list select while keeping detail pages full-fidelity.

## Finding

The audit found that the speaker list pulls detail-heavy fields such as bios, notes, topics, AV needs, travel needs, or other long text/detail fields that are not needed for directory cards/rows.

Likely location:

```text
web/src/server/services/speakers.ts
Speaker list/detail routes and pages
```

## Required Behavior

1. Identify fields actually rendered by the Speaker list/directory.
2. Identify fields needed only by Speaker detail/preview/edit surfaces.
3. Create or use a lean speaker list select.
4. Keep the full speaker detail select for detail surfaces.
5. Update list route/service to use the lean select.
6. Preserve list behavior:
   - name/title/company/status/headshot or other visible summary fields
   - readiness/status indicators if rendered
   - search/filter/sort behavior
   - event scoping and access checks
7. Preserve detail behavior:
   - full bio/notes/topics/AV/travel/detail fields remain available
   - speaker preview/detail pages do not regress

## Testing Required

Add/update tests for:

```text
- speaker list returns required summary fields
- speaker list does not select known heavy detail-only fields
- speaker detail still returns full detail fields
- readiness/status behavior remains correct
- event scoping remains correct
```

## Hard Stops

Stop if:

```text
- list UI actually renders a field thought to be detail-only
- detail and list currently share a response contract that cannot be split safely in this prompt
- access checks are coupled to selected fields in an unclear way
```

## Commit

```bash
git add <touched files>
git commit -m "Trim speaker list payload"
```

## Stop Format

```text
Prompt completed:
Files changed:
Tests run:
Test results:
List fields preserved:
Detail fields preserved:
Payload trimmed:
Risks / follow-up needed:
Next prompt started or reason for stopping:
```

---

# Prompt 8 — Cross-Module Performance Regression Checks

## Goal

Run focused cross-module regression checks and add missing coverage before final verify.

## Tasks

1. Review all changes from Prompts 2–7 against the performance brief.
2. Confirm no schema/migration/client diffs.
3. Confirm task APIs untouched.
4. Confirm Budget, Run of Show, Roadmap, Matrix staffing untouched except incidental import/type effects if any.
5. Add missing regression coverage for:
   - Account Dashboard response shape/counts
   - Action Center queue count/top-item semantics
   - Docs Hub linked targets and list behavior
   - Speaker list/detail split
   - org/event scoping
6. Run targeted test suites across dashboard/docs/speakers/action center.
7. Run typecheck.

## Constraints

- Do not start new optimizations.
- Do not broaden scope.
- No schema changes.
- No broad UI redesign.

## Commit

If files changed:

```bash
git add <touched files>
git commit -m "Add dashboard docs speaker performance regressions"
```

No empty commit if no files changed.

## Stop Format

```text
Prompt completed:
Files changed:
Tests run:
Test results:
Coverage added:
Scope confirmation:
Risks / follow-up needed:
Next prompt started or reason for stopping:
```

---

# Prompt 9 — Final Verify + Manual QA Checklist

## Goal

Close the performance pack and prove the branch is ready for human review.

## Required Final Checks

1. Confirm clean branch state or only intentional files changed.
2. Confirm no schema changes:
   - no `.prisma` diffs
   - no migration files
   - no generated client changes
3. Confirm task APIs untouched.
4. Confirm no unrelated Budget, Run of Show, Roadmap, or Matrix staffing changes.
5. Run final verification:

```bash
cd web
rm -rf .next/types
npm run verify
```

If full verify fails from known environment/DB-pool issues, run targeted suites and clearly separate environment failure from code failure. Do not claim green unless the relevant command actually passes.

## Final Report Must Include

```text
Overall implementation summary:
Findings fixed:
Files changed:
Schema/client generation:
Migration files created:
Tests run:
Passing/failing status:
Typecheck/build status:
Manual QA checklist:
Known risks:
Deferred items:
Out-of-scope items not touched:
Branch ready for human review: yes/no
```

## Manual QA Checklist

```text
[ ] Account dashboard loads and shows expected deadline/risk/rollup cards.
[ ] Account dashboard does not appear to drop expected items.
[ ] Action Center queues show expected top items and do not appear truncated incorrectly.
[ ] Docs Hub list loads with linked targets intact.
[ ] Docs Hub filters/status/review flows still work.
[ ] Docs upload/finalize/download still work.
[ ] Speaker directory list loads and shows required summary fields.
[ ] Speaker detail still shows full detail fields.
[ ] EVENT_VIEWER/read-only behavior remains correct where applicable.
[ ] No unrelated Budget, Run of Show, Roadmap, or task behavior changed.
```

## Commit

If Prompt 9 makes no code/doc/test changes, do not create an empty commit.

## Final Stop Format

Use the required final report format exactly.
