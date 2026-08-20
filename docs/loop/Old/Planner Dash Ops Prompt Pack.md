# Planner Dash Ops Rollup Consistency + Performance Prompt Pack

## Use this branch

```bash
cd "/Users/ali/Documents/God Emperor of Dune /planner-os"
git switch main
git pull --ff-only origin main
git switch -c chore/ops-rollup-consistency-audit
```

## Pack goal

Fix the cross-surface data consistency, dashboard rollup, derived-state, and performance issues found in the Ops Rollup Consistency Audit.

This is not a schema project. Do not add migrations. Do not modify Prisma schema files. If a finding truly requires schema work, stop and write a schema-change proposal instead of implementing.

## Global rules for every prompt

- Work from the existing audit findings and current repository source.
- No schema changes, migrations, generated Prisma changes, or model renames.
- Preserve current public route contracts unless the prompt explicitly says otherwise.
- Keep changes low-blast-radius and source-of-truth driven.
- Do not fake dashboard truth with UI-only numbers.
- Prefer canonical service/query fixes over local UI patches.
- Add focused regression tests for every bug fixed.
- Keep Event Viewer / read-only behavior intact.
- Do not delete or break task APIs or assignment flows.
- Do not start the Matrix staffing schema reconciliation project.
- Run verification from `web/`, not repo root.
- Use `npm run verify` as the practical gate. Do not treat `verify:strict` lint failures as regressions unless explicitly working on lint cleanup.

---

# Prompt 1 — Account Command Center Deadlines Rollup

Fix the Account Command Center deadline rollup so the dashboard reflects real timeline deadlines instead of reading only from the unpopulated `Deadline` table.

Context from audit:
- Account Command Center DEADLINES KPI, Upcoming Deadlines panel, Concierge next milestone/deadline list, and Action Center Deadlines view read from `Deadline`.
- Production code does not create `Deadline` rows.
- Real deadline-like data exists on `TimelineItem.endDate`.
- Event Command Center already merges `TimelineItem.endDate` into its deadlines payload.
- Current behavior is falsely empty: `0`, `Clear`, or `No urgent deadlines` even when timeline items exist.

Requirements:
1. Update the account-level command center data path, especially `getCommandCenterDashboardData`, so deadlines come from `TimelineItem.endDate` for active org/account events.
2. Include overdue and upcoming timeline items within the current lookahead window.
3. Exclude completed timeline items.
4. Preserve or safely union any existing `Deadline` rows if the UI still depends on that shape, but do not rely on `Deadline` as the only source.
5. De-dupe if the same logical deadline appears from both `Deadline` and `TimelineItem` sources.
6. Ensure the Account Command Center KPI, Upcoming Deadlines panel, Concierge milestone/deadline list, and Action Center Deadlines view receive non-empty data when qualifying timeline items exist.
7. Preserve event/org scoping and existing authorization assumptions.
8. Do not introduce schema changes.

Tests required:
- Add or update a regression test with no `Deadline` rows but with timeline items:
  - one overdue incomplete item
  - one upcoming incomplete item
  - one complete item that should be excluded
- Assert account deadline KPI/panel data is non-empty and overdue counts are correct.
- Assert the service does not regress to `prisma.deadline.findMany` as the only dashboard source if an existing regression forbids it.

Verification:
```bash
cd "/Users/ali/Documents/God Emperor of Dune /planner-os/web"
npm run test:summary
npm run verify
```

Stop with a report:
- files changed
- behavior fixed
- tests added/updated
- verification result

---

# Prompt 2 — Event Command Center Staffing Coverage Math

Fix Event Command Center staffing coverage so it counts staffed sessions, not raw staff assignment rows.

Context from audit:
- `operations.staffingStatus.confirmed/missing` currently uses raw `sessionStaffAssignment.count()`.
- This inflates confirmed counts when one session has multiple staff.
- Missing can become zero even while unstaffed sessions exist.
- The service already computes distinct staffed sessions via `staffSessionRows` but does not use it for `operations.staffingStatus`.

Requirements:
1. In the Event Command Center service, compute staffing confirmed as the number of distinct sessions with at least one staff assignment.
2. Compute missing as `sessionsCount - distinctStaffedSessions`.
3. Clamp missing at zero if needed.
4. Reuse the already-computed distinct session rows if available.
5. Do not start the Matrix staffing schema reconciliation work.
6. Do not change staffing schemas or migrations.
7. Preserve all existing response shapes unless correcting the numeric values.

Tests required:
- Event with 3 sessions:
  - session A has 2 staff
  - session B has 1 staff
  - session C has 0 staff
- Assert `confirmed = 2` and `missing = 1`.
- Add a second assertion that raw assignment count is not used as confirmed.

Verification:
```bash
cd "/Users/ali/Documents/God Emperor of Dune /planner-os/web"
npm run test:summary
npm run verify
```

Stop with a report.

---

# Prompt 3 — Event Command Center F&B Pending Math

Fix Event Command Center F&B pending status so it counts unmet session demand, not catalog supply.

Context from audit:
- `operations.fnbStatus.pending` currently equals active F&B catalog item count.
- A fully assigned event with a 50-item menu can show `50 pending`.
- Pending should mean sessions/needs awaiting F&B, not menu items available in the catalog.

Requirements:
1. Inspect the existing Event Command Center F&B/service data model and current assignment queries.
2. Define `pending` as sessions requiring or expecting F&B that do not yet have F&B service/catalog assignment coverage.
3. If there is no reliable explicit “requires F&B” flag, use the safest existing source of demand and document the assumption in code/test naming.
4. Do not count `EventFnbCatalogItem` rows as pending demand.
5. Keep response shape stable.
6. Do not change schema.

Tests required:
- Event with active catalog items but all relevant sessions covered by F&B assignments/services → `pending = 0`.
- Event with at least one session lacking F&B coverage → `pending` reflects the uncovered session count.
- Ensure catalog item count alone does not increase pending.

Verification:
```bash
cd "/Users/ali/Documents/God Emperor of Dune /planner-os/web"
npm run test:summary
npm run verify
```

Stop with a report.

---

# Prompt 4 — Widget Endpoint Query Amplification

Fix or contain the per-widget Command Center endpoint so lazy-loading widgets do not re-run the full Event Command Center query batch for every widget.

Context from audit:
- `GET /api/events/[eventId]/command-center/widgets/[widgetId]` calls `getEventCommandCenter(eventId, user)`.
- That builds the full ~35-query payload and returns one slice.
- Loading N widgets individually can produce N× the full query load.

Requirements:
1. Inspect how the widget endpoint is used by the dashboard UI.
2. Choose the lowest-risk fix that prevents repeated full-payload queries:
   - Prefer fetching the full payload once at the page/layout level and hydrating widgets client-side if that fits the current architecture.
   - Otherwise map each `widgetId` to a minimal query path.
3. Do not break the existing widget route contract unless no live caller depends on it; if changed, preserve compatibility or return the same shape.
4. Keep auth/event access behavior intact.
5. Avoid broad dashboard rewrites.
6. Add query-count/spy style coverage if the test framework supports it; otherwise add a regression that proves widget data is sourced without invoking the full builder repeatedly.
7. No schema changes.

Tests required:
- A regression showing the widget path does not call the full event command center builder for every widget request, or showing the page fetches the full payload once instead of per-widget.
- Existing Event Command Center rendering/data tests must continue passing.

Verification:
```bash
cd "/Users/ali/Documents/God Emperor of Dune /planner-os/web"
npm run test:summary
npm run verify
```

Stop with a report.

---

# Prompt 5 — Account Dashboard Budget Aggregation Performance

Harden account dashboard budget rollups so large orgs do not require loading all budget line items and nested event data into JS just to compute totals.

Context from audit:
- `command-center-dashboard.ts` pulls all budget line items across all org events with no pagination, then sums/filters in JS.
- Related event queries nest deadlines, timeline items, integration metrics, and budget for every event.
- This grows linearly with tenant size and can become memory/latency heavy.

Requirements:
1. Replace unbounded budget line item JS aggregation with DB-side aggregates where safe:
   - `_sum`
   - `groupBy`
   - narrow `select`s
2. Preserve existing output values and response shape as much as possible.
3. Keep detailed line-item fetches only for surfaces that actually render line-item detail.
4. Bound nested event selects to fields needed by the account dashboard.
5. Keep event/org scoping correct.
6. Do not change schema.
7. Do not trade correctness for speed.

Tests required:
- Add aggregate-equivalence coverage:
  - fixture with multiple events, budgets, categories, and line items
  - assert new aggregate totals equal expected prior JS semantics
- Include at least one zero/empty budget case.
- Existing dashboard regression tests must pass.

Verification:
```bash
cd "/Users/ali/Documents/God Emperor of Dune /planner-os/web"
npm run test:summary
npm run verify
```

Stop with a report including the before/after query shape at a high level.

---

# Prompt 6 — Timeline Progress Status Fallback

Fix Timeline list progress bars so status produces a meaningful progress fill when explicit numeric progress is null.

Context from audit:
- The visible progress-bar symptom is in the Timeline/Roadmap list, not Matrix 2 / Run of Show.
- `derivedProgress` currently returns 100 for `COMPLETE`; otherwise uses numeric `progress` if set; otherwise returns 0.
- `IN_PROGRESS` and `AT_RISK` with null progress show 0%, which is misleading.

Requirements:
1. Update the Timeline list progress derivation so explicit numeric `progress` always wins when present.
2. Add status fallback when `progress` is null:
   - `NOT_STARTED` → 0
   - `IN_PROGRESS` → 50
   - `AT_RISK` → 50, while preserving existing at-risk visual/status styling
   - `COMPLETE` → 100
3. Keep this as display derivation only unless the existing app already persists progress on status change.
4. Do not write derived progress back to the DB just to make the UI look right.
5. No schema changes.

Tests required:
- `IN_PROGRESS` + null progress renders non-zero progress.
- `AT_RISK` + null progress renders non-zero progress.
- Explicit progress value is respected over fallback.
- `COMPLETE` renders 100.

Verification:
```bash
cd "/Users/ali/Documents/God Emperor of Dune /planner-os/web"
npm run test:summary
npm run verify
```

Stop with a report.

---

# Prompt 7 — Registration/Housing Integration Metrics: Stop False Empty Signals

Fix EventIntegrationMetric-driven registration/housing dashboard surfaces so they do not present false empty/stale KPIs when there is no in-app writer or connected integration data.

Context from audit:
- `EventIntegrationMetric` is read by account dashboard health signals and Event Command Center registration/housing KPIs/notifications.
- App code does not create/update/upsert these metrics.
- Unless an external ETL populates rows, these cards are empty/stale or degrade to misleading zeros.

Product decision for this pass:
- Do not build a new external sync system.
- Do not fake registration/housing data.
- If metric rows exist, display them normally.
- If no metric rows exist, hide the card/signal or label it clearly as not connected / no integration data, whichever matches existing UI patterns best.

Requirements:
1. Inspect all EventIntegrationMetric read surfaces.
2. Ensure empty metric data does not generate misleading `0`, `clear`, or stale health signals.
3. Prefer suppressing metric-derived notifications/cards when no metric source exists.
4. If the UI requires a visible placeholder, use clear copy like `Not connected` or `No integration data`.
5. Preserve behavior when metric rows do exist.
6. Do not create schema, migrations, or fake seed data.

Tests required:
- No EventIntegrationMetric rows → no misleading registration/housing zero/clear signal.
- Existing EventIntegrationMetric rows → card/signal still renders correct values.
- Account and event surfaces covered where practical.

Verification:
```bash
cd "/Users/ali/Documents/God Emperor of Dune /planner-os/web"
npm run test:summary
npm run verify
```

Stop with a report.

---

# Prompt 8 — Account Approvals KPI Should Include Docs In Review

Fix the account-level `APPROVALS` KPI so the generic approvals count is not budget-only when document approvals are also implemented.

Context from audit:
- Event-level surfaces expose documents in review.
- Account `APPROVALS` KPI currently counts only budget approvals/submissions.
- The label `Approvals` reads as cross-module, so excluding Docs Hub review items is misleading.

Product decision for this pass:
- Include portfolio document review counts in the account approvals KPI.
- Do not relabel it to `Budget approvals` unless the implementation proves adding docs would break existing semantics.

Requirements:
1. Add account-level document in-review counts to the approvals rollup.
2. Preserve existing budget approval/submission counts.
3. Keep response shape stable or extend it in a backward-compatible way.
4. Ensure UI copy makes clear what is included if a breakdown already exists.
5. No schema changes.

Tests required:
- Fixture with budget approval work and document in-review work.
- Assert account approvals count includes both.
- Fixture with only documents in review and no budget approvals → account approvals count is non-zero.

Verification:
```bash
cd "/Users/ali/Documents/God Emperor of Dune /planner-os/web"
npm run test:summary
npm run verify
```

Stop with a report.

---

# Prompt 9 — Account Rollups for Speaker Readiness + Attendee/Seating Signals

Add source-backed account-level rollups for speaker readiness and attendee/enrollment/seating signals where the app already has canonical data, without inventing new schema or fake values.

Context from audit:
- Speaker readiness exists at event level but is absent from the account dashboard.
- Attendee/enrollment/seating data exists but has no dashboard rollup.
- These are product-decision items, so implement only source-backed, low-risk summary data that helps the account dashboard avoid blind spots.

Product decision for this pass:
- Add conservative account-level summary rollups if canonical models and service paths already exist.
- Do not add new workflow concepts.
- Do not add schema.
- Do not create fake readiness or attendance logic.

Requirements:
1. Inspect current speaker readiness/status fields and event-level speaker readiness logic.
2. Add an account-level speaker readiness summary using the same source-of-truth semantics as event level.
3. Inspect attendee/enrollment/seating models and current service usage.
4. Add conservative account-level attendee/seating counts only where source-backed:
   - total attendees/enrollments where canonical
   - unassigned seating count if existing seating assignment data supports it
   - session/event-scoped counts only if scoping is clear
5. Display these rollups only where the dashboard already has a natural card/panel/health signal location; avoid clutter and mechanical UI.
6. If a count cannot be computed honestly from existing models, omit it and document why in the final report.
7. No schema changes.

Tests required:
- Speaker readiness/account rollup fixture across multiple events.
- Attendee/seating rollup fixture if implemented.
- Assert org/event scoping is respected.

Verification:
```bash
cd "/Users/ali/Documents/God Emperor of Dune /planner-os/web"
npm run test:summary
npm run verify
```

Stop with a report and clearly list any rollup intentionally not implemented because the source of truth was unclear.

---

# Prompt 10 — Event Command Center Semantic Cleanup: Travel Status + Conflicts Breakdown

Clean up misleading Event Command Center semantic rollups where the UI implies more specific truth than the data model supports.

Context from audit:
- `travelStatus` currently mirrors `sessionStatus` because both derive from the single `speaker.status` enum.
- There is no separate travel-confirmation field.
- `conflicts` sums heterogeneous counts: unplaced sessions + at-risk timeline items + speakers needing info.
- This may be defensible as blockers, but the label is semantically loose.

Product decision for this pass:
- Do not invent travel readiness data.
- Do not add travel schema.
- Avoid showing `travelStatus` as if it is separate from speaker/session readiness.
- Rename or break down `conflicts` so the user can see what the number means.

Requirements:
1. Inspect Event Command Center response and UI usage for `travelStatus`.
2. If `travelStatus` is displayed as separate travel truth, remove, suppress, or relabel it to avoid false specificity.
3. Preserve API compatibility where needed by leaving fields present but not using misleading copy in UI, or by documenting no-op legacy fields if necessary.
4. Replace generic `conflicts` display with a clearer breakdown using existing components:
   - unplaced sessions
   - at-risk timeline items
   - speakers needing info
5. If a single aggregate remains, label it as `Operational blockers` or equivalent, not true conflicts.
6. No schema changes.

Tests required:
- Assert travel status is not presented as a distinct source-backed travel readiness value unless actual travel data exists.
- Assert blockers/conflicts payload or UI exposes the component counts.
- Existing event command center tests must continue passing.

Verification:
```bash
cd "/Users/ali/Documents/God Emperor of Dune /planner-os/web"
npm run test:summary
npm run verify
```

Stop with a report.

---

# Prompt 11 — Final Rollup Consistency Closure Pass

Run a final closure pass for the Ops Rollup Consistency work.

Requirements:
1. Review all fixes from Prompts 1–10.
2. Confirm no schema changes or migrations were added.
3. Confirm no task APIs or assignment flows were deleted/broken.
4. Confirm Matrix staffing schema reconciliation was not started.
5. Confirm all implemented rollups are source-backed and scoped correctly.
6. Confirm false-empty/fake-clear dashboard states were removed where covered.
7. Confirm performance fixes avoid unbounded or repeated dashboard query paths where covered.
8. Run the practical verification gate from `web/`.

Commands:
```bash
cd "/Users/ali/Documents/God Emperor of Dune /planner-os/web"
npm run verify
```

Also run targeted tests if any were added outside `test:summary` coverage.

Deliver final report:
- branch name
- files changed grouped by finding
- findings fixed
- findings intentionally deferred and why
- schema status: unchanged or list any accidental schema file diffs to revert
- tests added/updated
- final verification result
- recommended manual smoke items for Account Dashboard, Event Command Center, Timeline, Docs approvals, Speakers, and attendee/seating rollups

Do not claim production complete. Say: Ops rollup consistency fixes are complete and verified, with any remaining product decisions listed as follow-ups.
