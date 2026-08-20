# Planner Dash Ops Rollup Consistency + Performance Fix Brief

## Current Branch

```bash
chore/ops-rollup-consistency-audit
```

## What We Are Doing

We are turning the Cross-Surface Data Consistency + Performance Audit into an implementation prompt pack.

This is not another broad production-readiness pass. The previous production-readiness hardening is already merged to `main`; this next pass focuses on the specific class of bugs where Planner Dash has real module data, but a linked dashboard, KPI, command-center card, progress bar, or rollup does not reflect it correctly.

The core theme is:

```text
module data changes or exists
→ canonical source of truth
→ service/query/API
→ dashboard rollup / derived state
→ visible KPI/card/progress UI
```

The audit found both correctness bugs and performance issues. The implementation pack should fix the confirmed bugs first, then handle product-decision items safely without inventing fake data or changing schema.

## What Kind Of Issues These Are

These are mostly:

```text
- rollup bugs
- derived-state drift
- cross-surface sync gaps
- source-of-truth mismatches
- status/progress mapping bugs
- account-level vs event-level aggregation gaps
- dashboard/query performance problems
```

The goal is to make account-level and event-level command surfaces match the real operational state of the event data.

## Scope

Main surfaces:

```text
- Account Command Center / dashboard
- Event Command Center
- Action Center deadline view
- Timeline / Roadmap list
- Budget dashboard rollups
- Docs approval rollups
- Speaker readiness rollups
- Attendee / seating / enrollment rollups where existing data supports them
```

Out of scope unless explicitly approved:

```text
- schema changes
- migrations
- broad UI redesign
- deleting task APIs
- changing assignment flows
- inventing new source-of-truth fields without a schema proposal
```

## Confirmed P0 Findings To Fix First

### P0-1 — Account Command Center deadlines are reading the wrong source

Current problem:

```text
The account-level Deadline KPI, Upcoming Deadlines panel, Concierge deadline list, and Action Center deadline view read the Prisma Deadline table.
Production code does not create Deadline rows.
Real deadline-like data exists in TimelineItem.endDate.
```

Visible result:

```text
Deadlines show 0 / Clear / No urgent deadlines even when timeline items have upcoming or overdue end dates.
```

Fix direction:

```text
Update getCommandCenterDashboardData to source deadlines from TimelineItem.endDate where status != COMPLETE.
Mirror the event-level Command Center deadline behavior.
Union with Deadline rows only if needed, and dedupe if both sources ever exist.
```

Tests:

```text
Create overdue and upcoming TimelineItems with no Deadline rows.
Assert account deadline KPI/panel/list are non-empty and count overdue correctly.
```

Schema change:

```text
No.
```

### P0-2 — Event Command Center staffing coverage counts assignment rows, not staffed sessions

Current problem:

```text
operations.staffingStatus.confirmed uses total SessionStaffAssignment rows.
operations.staffingStatus.missing uses sessionsCount - assignmentRows.
```

Visible result:

```text
One heavily staffed session can make the event look fully staffed while other sessions have no staff.
```

Fix direction:

```text
Use the already-computed distinct staffed session count instead of raw assignment count.
confirmed = distinct sessions with >=1 staff
missing = sessionsCount - confirmed
```

Tests:

```text
3 sessions:
- session A has 2 staff
- session B has 1 staff
- session C has 0 staff
Assert confirmed = 2 and missing = 1.
```

Schema change:

```text
No.
```

### P0-3 — Per-widget Command Center endpoint re-runs the full dashboard query batch

Current problem:

```text
GET /api/events/[eventId]/command-center/widgets/[widgetId]
calls getEventCommandCenter(eventId, user), which builds the full payload, then returns one widget slice.
```

Visible/performance result:

```text
Lazy-loading N widgets can run the full ~35-query command-center batch N times.
```

Fix direction:

```text
Lowest-risk fix: fetch the full command-center payload once and hydrate widgets client-side, or remove/avoid per-widget refetches from the page.
If keeping the endpoint, map widget IDs to minimal query paths instead of calling the full builder.
```

Tests:

```text
Assert widget loading does not multiply full command-center query work.
Use a spy/query-count style test or a page/service test proving the full payload is fetched once.
```

Schema change:

```text
No.
```

## Confirmed P1 Findings To Fix After P0s

### P1-4 — Timeline list progress bars ignore status

Current problem:

```text
TimelineListView derivedProgress returns 100 for COMPLETE, otherwise explicit progress if present, otherwise 0.
IN_PROGRESS and AT_RISK with null progress show empty bars.
```

Fix direction:

```text
Keep explicit progress as authoritative when present.
When progress is null, use a status fallback:
NOT_STARTED = 0
IN_PROGRESS = partial fill
AT_RISK = partial fill
COMPLETE = 100
```

Product detail needed:

```text
Exact fallback percentages need a decision. Safe default: IN_PROGRESS 50, AT_RISK 50 or 60, COMPLETE 100.
```

Tests:

```text
IN_PROGRESS + null progress renders non-zero fill.
Explicit progress still wins.
COMPLETE stays 100.
```

### P1-5 — EventIntegrationMetric is read-only/orphaned

Current problem:

```text
Registration/housing pace KPIs and event-health signals read EventIntegrationMetric.
App code does not write EventIntegrationMetric rows, except cleanup deleteMany.
```

Visible result:

```text
Registration/housing cards can be empty, stale, or misleading unless an external ETL writes the table.
```

Safe implementation direction:

```text
Do not fake numbers.
Either hide/label these metrics as not connected when no source exists, or add a real sync/write path only if the product source of truth is known.
```

Product decision:

```text
Needed before building a writer: is registration/housing in scope and what is the source of truth?
```

Schema change:

```text
No if hiding/labeling or using the existing model.
```

### P1-6 — Event Command Center F&B pending counts catalog supply, not unmet demand

Current problem:

```text
operations.fnbStatus.pending = active F&B catalog item count.
A fully assigned event with a 50-item menu can show 50 pending.
```

Fix direction:

```text
pending should mean sessions/needs awaiting F&B assignment or service.
Use session-level demand gap, not catalog supply.
```

Tests:

```text
Event with all sessions assigned F&B and N catalog items should show pending = 0.
```

### P1-7 — Account dashboard budget aggregation is unbounded JS aggregation

Current problem:

```text
The account dashboard pulls all budget line items across all org events and sums/filters in JavaScript.
Nested event rollups also pull broad related data.
```

Risk:

```text
Performance and memory grow linearly with org size.
```

Fix direction:

```text
Replace broad findMany + JS aggregation with Prisma groupBy/_sum aggregates where possible.
Keep detailed line-item queries only for UI that renders individual rows.
Bound nested selects.
```

Tests:

```text
Aggregate-equivalence test: new grouped totals match prior totals on a fixture.
```

## P2 Product / Coverage Items

These should be included in the prompt pack, but handled carefully because several are product decisions rather than obvious code bugs.

### P2-8 — Docs approvals absent from account APPROVALS KPI

Current state:

```text
Event level surfaces documentsInReview.
Account-level APPROVALS KPI counts budget approvals/submissions only.
```

Fix options:

```text
Preferred: include DocumentStatus.IN_REVIEW counts in the account-level APPROVALS KPI.
Alternative: relabel KPI to Budget approvals.
```

### P2-9 — Speaker readiness absent from account dashboard

Current state:

```text
Speaker readiness is present at event level but not aggregated at account level.
```

Fix direction:

```text
Add account-level speaker readiness rollup only if it has a clear UI home.
Otherwise document as product-deferred.
```

### P2-10 — Attendee/enrollment/seating counts absent from dashboards

Current state:

```text
Data exists, but neither dashboard currently rolls it up meaningfully.
```

Fix direction:

```text
Add only source-backed counts where existing models support it.
Do not invent a new attendee workflow or schema.
```

### P2-11 — travelStatus mirrors sessionStatus

Current state:

```text
Both derive from speaker.status because there is no separate travel-confirmation field.
```

Fix direction:

```text
Do not pretend there is real travel status.
Relabel, hide, or mark as not connected unless a reviewed schema/product decision adds travel data.
```

### P2-12 — conflicts sums heterogeneous counts

Current state:

```text
The conflicts/blockers number combines unplaced sessions, at-risk timeline items, and speakers needing info.
```

Fix direction:

```text
Either split into clearer sub-counts or relabel as Operational blockers.
Avoid presenting it as one precise conflict type.
```

### P2-13 — Event-level deadlines can duplicate if Deadline and TimelineItem sources both exist

Current state:

```text
Deadline rows are not populated today, but if both Deadline and TimelineItem sources exist later, duplicate deadline rows may appear.
```

Fix direction:

```text
Add source-aware dedupe when merging deadline sources.
```

## Implementation Order

```text
1. P0-1 account deadlines from TimelineItem
2. P0-2 staffing distinct-session math
3. P0-3 widget query amplification
4. P1-7 account budget aggregation performance
5. P1-6 F&B pending demand-gap math
6. P1-4 Timeline progress fallback
7. P1-5 EventIntegrationMetric hide/label vs source decision
8. P2-8 docs approvals KPI decision/fix
9. P2-9 speaker readiness account rollup
10. P2-10 attendee/enrollment/seating rollups
11. P2-11 travel status relabel/hide
12. P2-12 conflicts/blockers semantics
13. P2-13 deadline merge dedupe
```

## Guardrails For The Prompt Pack

```text
- No schema changes or migrations.
- If a finding requires schema to solve correctly, stop and document the required proposal.
- Do not fake unavailable data.
- Do not hide real problems behind empty UI states.
- Prefer canonical source-of-truth queries over duplicated UI-side calculations.
- Preserve existing public contracts unless intentionally changing the UI/API behavior.
- Add focused regression tests for every confirmed bug fixed.
- Keep changes low-blast-radius and source-backed.
- Run from web/: npm run verify.
- Do not run or treat verify:strict as required unless doing lint cleanup.
```

## Definition Of Done

```text
- All P0 confirmed bugs fixed with regression coverage.
- P1 confirmed bugs fixed or explicitly product-deferred with safe UI behavior.
- P2 items either implemented where source-backed or documented as product decisions.
- Account/event dashboards no longer show false zero/clear states when underlying data exists.
- Dashboard rollup queries avoid obvious N× full-batch and unbounded aggregation paths.
- No schema changes.
- web npm run verify passes.
```
