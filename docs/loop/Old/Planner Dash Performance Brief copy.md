# Planner Dash — Dashboard / Docs / Action Center / Speakers Performance Brief

## Purpose

This brief defines the next performance pack after the Budget performance work.

Budget performance is treated as its own completed track once the current Budget branch is merged and smoked. This next pack is focused on the remaining confirmed non-Budget performance findings from the audit:

1. **C1 — Account Dashboard / Command Center bounded nested fetch**
2. **D1 — Docs Hub link-target N+1**
3. **D2 — Docs Hub bounded list / pagination-safe loading**
4. **C3 — Action Center bounded queue reads**
5. **S1 — Speaker list lean select / detail split**

The goal is not to redesign these modules. The goal is to reduce unnecessary server work, prevent unbounded reads, preserve response shapes where possible, and keep every change low-risk and regression-tested.

---

## Recommended Branch

```text
chore/performance-dashboard-docs-action-speakers
```

Start from the latest `main` after Budget performance is merged and pushed.

---

## Schema Mode

```text
LOCKED
```

No Prisma schema changes, migrations, generated client changes, or relational model changes.

If any improvement appears to require schema support, stop and document it as a deferred follow-up.

---

## Current State / Why This Pack Exists

The performance audit found that Budget was the largest first target. Budget work addressed:

- Budget read-path latency
- write-on-read upserts
- duplicate upserts
- totals-only DB aggregates
- grid recomputation while typing
- BudgetRow memoization
- server-side Budget pagination/filter/sort

The next confirmed performance bottlenecks are outside Budget:

```text
C1 — Account Dashboard fetches too much nested event/timeline/dependency data.
D1 — Docs Hub resolves linked targets per document, creating N+1 query behavior.
D2 — Docs Hub list is unbounded and rich.
C3 — Action Center uses unbounded queue reads.
S1 — Speaker directory list over-selects detail-heavy fields.
```

This pack should keep scope tight: fix those paths and avoid drifting into Run of Show, Roadmap, Platform-wide polish, or new product behavior.

---

## Allowed Scope

```text
- Account Dashboard / Command Center data loading
- Action Center queue loading
- Docs Hub list service and link-target resolution
- Speaker list service select shape
- Tests/regressions for those exact behavior paths
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

Do not assume this list is complete. Grep before editing.

---

## Performance Principles For This Pack

### 1. Bound what the UI bounds

If a UI only shows a small list or top queue, the server should not load the entire organization or event history unless the full set is explicitly required.

### 2. Batch what is currently N+1

If a service resolves related objects per row, collect IDs first, batch-load by type, and reattach results.

### 3. Split list and detail payloads

A directory/list view should not fetch detail-heavy fields if the list only renders summary cards/rows. Detail pages can keep the full select.

### 4. Preserve response semantics

Avoid breaking existing UI contracts. If a response shape must change to support bounded loading, update callers and tests together.

### 5. Do not fake counts

Do not cap a query and still display the capped length as a true total. If the UI shows total counts, either compute accurate counts or label them as visible/recent items.

### 6. Keep authorization and tenancy untouched

All reads must remain org/event scoped and must preserve existing access checks.

---

## Prompt Pack Structure — 9 Prompts

## Prompt 1 — Baseline / Scope Confirmation

### Goal

Confirm the exact current data paths and establish a source-backed baseline before changing code.

### Tasks

- Confirm branch and dirty state.
- Read the loop controller, this brief, and the prompt pack.
- Trace current paths for:
  - Account Dashboard data load
  - Action Center queues
  - Docs Hub list + link target resolution
  - Speaker list + speaker detail
- Confirm response shapes used by UI.
- Identify existing tests.
- Confirm no schema changes are needed.

### Deliverable

A short baseline report with files/functions/routes, current unbounded/N+1 behavior, and exact tests to run.

No commit if no files change.

---

## Prompt 2 — C1 Account Dashboard Bounded Nested Fetch

### Finding

The account dashboard fetches all organization events with nested timeline/deadline/dependency rows, then sorts/slices in JS even though the UI only shows capped dashboard content.

### Goal

Reduce dashboard payload size and nested row volume while preserving the dashboard output.

### Expected Fix Shape

- Bound nested timeline/deadline/dependency reads with `orderBy` / `take` where safe.
- Prefer separate bounded queries for dashboard deadline/risk lists if that is cleaner.
- Avoid loading successor/dependency rows for every candidate if only top items are rendered.
- Preserve dashboard response shape and card behavior.

### Tests

- Dashboard fixture with many events and timeline/deadline rows.
- Assert rendered/top dashboard items are unchanged.
- Assert query shape/source no longer fetches unbounded nested rows where avoidable.

### Commit

```bash
git add <touched files>
git commit -m "Bound account dashboard nested fetches"
```

---

## Prompt 3 — C1 Regression / Payload Parity Tests

### Goal

Lock C1 behavior with focused regression coverage before moving to Docs Hub.

### Required Coverage

- Account dashboard still includes the right deadline/risk items.
- Ordering and slicing match prior UI expectations.
- Counts/rollups are accurate and not accidentally page-only.
- Org/event scoping remains intact.

### Commit

```bash
git add <touched files>
git commit -m "Add account dashboard performance regressions"
```

If Prompt 2 already added complete coverage, this prompt may be test-only review and no commit is needed.

---

## Prompt 4 — D1 Docs Hub Batch Link-Target Resolution

### Finding

Docs Hub calls `resolveLinkTargets` per document. Each document can trigger several target queries, creating N+1 behavior as document count grows.

### Goal

Batch-resolve document link targets once per list request.

### Expected Fix Shape

- Collect all document links from the list response.
- Group linked targets by type.
- Fetch targets once per type.
- Reattach resolved targets to documents by `documentId`.
- Preserve current document response shape.

### Tests

- Fixture with multiple documents linking to sessions/speakers/budget/timeline/etc.
- Assert resolved targets match previous behavior.
- Assert duplicate linked targets are deduped and fetched once.
- Assert documents with no links still behave correctly.

### Commit

```bash
git add <touched files>
git commit -m "Batch resolve document link targets"
```

---

## Prompt 5 — D2 Docs List Bounded Loading / Pagination-Safe Path

### Finding

Docs Hub list fetches all documents with rich includes and no pagination/bounds.

### Goal

Make Docs Hub list loading bounded or pagination-ready without hiding documents or lying about totals.

### Expected Fix Shape

One of these, depending on current UI contract:

1. Implement safe pagination/load-more if UI support is straightforward.
2. Add bounded initial load with accurate total count and visible “load more” behavior.
3. If UI pagination is too broad, document exact blocker and implement the safe partial optimization only, such as trimming includes or splitting detail-only fields.

### Hard Rule

Do not cap the server query while leaving the UI pretending all documents are loaded.

### Tests

- Empty docs list.
- Under-limit docs list.
- Over-limit docs list with accurate total/hasMore or pagination state.
- Existing review/status/filter behavior remains correct.

### Commit

```bash
git add <touched files>
git commit -m "Bound docs hub list loading"
```

---

## Prompt 6 — C3 Action Center Bounded Queue Reads

### Finding

Action Center has several unbounded queue reads for risks, budget line items, documents, and submissions.

### Goal

Bound the Action Center queue reads safely while preserving queue meaning.

### Expected Fix Shape

- Add `orderBy` + `take` to queues where the UI shows a capped queue.
- Preserve accurate counts if the UI displays totals.
- If a queue uses client-side comparison that Prisma cannot express safely, keep correctness over premature optimization.
- Do not hide items without a visible count/load-more/queue semantics decision.

### Tests

- Queue with more rows than visible limit.
- Assert top visible queue items are correct.
- Assert total/count semantics are not misleading.
- Assert filters/views still work.

### Commit

```bash
git add <touched files>
git commit -m "Bound action center queue reads"
```

---

## Prompt 7 — S1 Speaker List Lean Select / Detail Split

### Finding

Speaker directory list fetches heavy detail fields like bios, notes, topics, AV needs, travel needs, or other detail-only text fields.

### Goal

Split speaker list payload from speaker detail payload.

### Expected Fix Shape

- Add a lean speaker list select for directory/list views.
- Keep full detail select for speaker detail/preview routes.
- Preserve fields actually rendered in the speaker list.
- Do not remove detail data from detail surfaces.
- Keep search/filter behavior correct.

### Tests

- Speaker list returns/render required summary fields.
- Speaker detail still returns full fields.
- List route no longer selects known heavy detail-only fields.
- Existing speaker readiness/status behavior remains intact.

### Commit

```bash
git add <touched files>
git commit -m "Trim speaker list payload"
```

---

## Prompt 8 — Cross-Module Performance Regression Checks

### Goal

Run focused regression checks across dashboard, docs, action center, and speakers before the final verify.

### Required Checks

- Account dashboard response shape and counts.
- Action Center queues.
- Docs Hub linked targets.
- Docs review/status list behavior.
- Speaker list/detail split.
- Authorization/event/org scoping preserved.
- No schema/migration/client diffs.
- No task API changes.

### Commit

If new tests or small fixes are added:

```bash
git add <touched files>
git commit -m "Add dashboard docs speaker performance regressions"
```

No empty commit if no files changed.

---

## Prompt 9 — Final Verify + Manual QA Checklist

### Goal

Close the performance pack and prove the branch is ready for human review.

### Commands

```bash
cd web
rm -rf .next/types
npm run verify
```

If full verify fails from known environment/DB-pool issues, run targeted suites and clearly separate environment failure from code failure. Do not claim green unless it is green.

### Final Report Must Include

```text
Overall implementation summary
Files changed
Schema/migration/client status
Tests run
Passing/failing status
Typecheck/build status
Manual QA checklist
Known risks
Deferred items
Branch ready for human review: yes/no
```

### Manual QA Checklist

```text
[ ] Account dashboard loads and shows expected deadline/risk/rollup cards.
[ ] Action Center queues show expected items and do not appear truncated incorrectly.
[ ] Docs Hub list loads with linked targets intact.
[ ] Docs Hub filters/status/review flows still work.
[ ] Speaker directory list loads quickly and shows required summary fields.
[ ] Speaker detail still shows full detail.
[ ] EVENT_VIEWER/read-only behavior remains correct where applicable.
[ ] No unrelated Budget, Run of Show, Roadmap, or task behavior changed.
```

---

## Success Criteria

This pack is complete when:

```text
- C1 dashboard nested fetch is bounded or split into bounded queries.
- D1 Docs Hub link-target N+1 is removed.
- D2 Docs list loading is bounded/pagination-safe, or a concrete blocker is documented with a safe partial improvement.
- C3 Action Center queue reads are bounded where correctness allows.
- S1 speaker list uses a lean list select while detail keeps full fidelity.
- No schema changes or migrations are introduced.
- Targeted tests pass.
- Full verify passes before merge, unless a clearly unrelated environment failure is documented.
```

---

## Deferred Items

Do not implement these in this pack unless explicitly asked:

```text
- Run of Show / Matrix performance or UX cleanup
- Roadmap / Timeline UX cleanup
- Platform-wide bundle/render analysis
- Budget follow-up polish
- Docs Hub redesign
- Speaker module redesign
- Event Command Center deeper query refactor unless clearly required
```
