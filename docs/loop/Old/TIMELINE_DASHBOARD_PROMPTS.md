# Timeline Dashboard Automation Prompts

Use this document with `docs/TIMELINE_DASHBOARD_PLAN.md` and `docs/TIMELINE_DASHBOARD_LOOP_CONTROLLER.md`.

Work through the prompts sequentially. After completing a prompt, review the result against the plan, summarize the result, and continue to the next prompt unless a hard stop condition is hit.

Model: Claude Opus
Reasoning: High

## Global Rules For Every Prompt

- Stay inside the Timeline module unless the active prompt explicitly requires shared service/schema/test work.
- TimelineItem and TimelineDependency are canonical for this module.
- Do not create or use the separate Task system for the internal Timeline add flow.
- Keep route handlers thin.
- Put business logic in server-side services/helpers.
- Enforce event access server-side.
- Preserve existing Timeline, Board, and List behavior while adding Dashboard.
- Prisma changes are allowed when required by the active prompt, but only additive changes are allowed without human review.
- Do not run migrations against the database.
- Do not reset the database.
- Do not run destructive Prisma commands.
- If Prisma schema changes are needed, update all schema copies used by the repo, create a migration file, and include manual migration instructions in the prompt summary.
- Run targeted tests after each implementation prompt. Run typecheck when reasonable for the touched area.

## Prompt 1 — Audit Current Timeline Implementation

### Goal

Audit the current Timeline module and produce a clear implementation map before changing behavior.

### Scope

Inspect:

- Timeline route/page/component structure.
- Timeline API routes.
- Timeline service/helper files.
- TimelineItem and TimelineDependency Prisma models.
- Existing timeline tests.
- Existing add flow that currently says “Add Task.”
- Existing Board/List/Timeline view data flow.
- Any current critical path/dependency logic.
- Existing event access enforcement on timeline reads/writes.

### Tasks

1. Find the Timeline module entry route under the event workspace.
2. Map the current component tree.
3. Map all timeline API routes and service functions.
4. Identify where “Task” language appears in the Timeline module.
5. Confirm whether the add flow writes TimelineItem or Task records.
6. Confirm whether TimelineItem supports:
   - workstream/category
   - planning stage/subcategory
   - priority
   - owner
   - critical path
   - dependencies/blockers
7. Identify all tests that should be updated or added.
8. Create or update `docs/TIMELINE_DASHBOARD_AUDIT.md` with findings.

### Do Not

- Do not implement UI changes in this prompt.
- Do not change schema in this prompt.
- Do not rename files in this prompt.

### Completion Summary Must Include

- Files inspected.
- Timeline data flow map.
- API/service map.
- Current schema capability table.
- Whether Prisma changes are needed.
- Recommended files likely to change in later prompts.
- Tests found and tests missing.
- Whether it is safe to proceed to Prompt 2.

---

## Prompt 2 — Rename Task Language To Timeline Item Language

### Goal

Remove user-facing task language from the Timeline module and rename the add action to “Add Timeline Item.”

### Scope

Update copy only where it belongs to the Timeline module.

Required copy changes:

```txt
Add Task -> Add Timeline Item
New Task -> New Timeline Item
1 tasks -> 1 item
5 tasks -> 5 items
Task hierarchy -> Timeline hierarchy
```

### Tasks

1. Replace user-facing Timeline module task copy.
2. Update empty states and button labels.
3. Update tab/table/board/timeline copy where needed.
4. Keep internal names stable unless a narrow rename is clearly safe.
5. Add/update lightweight UI tests if existing tests cover labels.

### Do Not

- Do not touch the separate Task system.
- Do not make schema changes.
- Do not refactor unrelated components.
- Do not change the add flow behavior yet unless it is only copy.

### Completion Summary Must Include

- Files changed.
- Copy changes made.
- Confirmation that the add flow still writes to the same current target.
- Tests run.
- Whether it is safe to proceed to Prompt 3.

---

## Prompt 3 — Workstream And Planning Stage Taxonomy + Additive Prisma If Needed

### Goal

Make the Timeline data model capable of supporting workstreams as categories and planning stages as subcategories.

### Scope

Use the Prompt 1 audit to decide whether existing fields are sufficient.

Required taxonomy:

```txt
Workstream / Category:
Venue, Housing, Registration, Speakers, Sponsors, F&B, Production, Marketing

Planning Stage / Subcategory:
Pre-Planning, Planning, Build, Show Week, Close
```

### Tasks

1. If existing fields can support this model, document the mapping and implement shared constants/types/helpers only.
2. If existing fields cannot support this model, make the minimum additive Prisma changes needed.
3. If schema changes are needed:
   - Update `prisma/schema.prisma` if present.
   - Update `web/prisma/schema.prisma` if present.
   - Create a migration file.
   - Do not run the migration.
   - Do not apply it to the database.
   - Do not reset the database.
   - Run Prisma generate only if the repo workflow supports it without database mutation.
4. Add shared taxonomy helpers/constants in the Timeline module or a server-safe shared location.
5. Add tests for taxonomy mapping/defaults where useful.

### Recommended Field Concepts If Needed

Use existing naming conventions from the repo, but likely concepts are:

```txt
workstream/category
planningStage/stage
priority
ownerUserId or owner display reference if already modeled
isCriticalPath
```

Prefer simple additive fields over creating a large new relational model unless the existing architecture already points that way.

### Do Not

- Do not use JSON blobs for core roadmap taxonomy.
- Do not duplicate TimelineItem into a separate dashboard table.
- Do not modify the separate Task system.
- Do not make destructive schema changes.

### Completion Summary Must Include

- Whether schema changes were needed.
- Fields/helpers added.
- Migration path if created.
- Prisma generate status if run.
- Tests run.
- Manual migration instructions if applicable.
- Whether it is safe to proceed to Prompt 4.

---

## Prompt 4 — Canonical Timeline Dashboard Payload / Service

### Goal

Create one canonical server-side payload for the Timeline Dashboard.

### Scope

Implement or refactor a service/helper that returns dashboard-ready data for an event.

Suggested function shape:

```ts
getEventTimelineDashboard(eventId, userOrContext)
```

Suggested payload shape:

```ts
{
  event,
  stages,
  workstreams,
  selectedWorkstream,
  upcomingDates,
  blockers,
  health
}
```

### Tasks

1. Create a timeline dashboard service/helper near existing timeline services.
2. Read canonical TimelineItem and TimelineDependency data.
3. Derive stage rollups.
4. Derive workstream rollups.
5. Derive upcoming dates.
6. Derive blockers/top risks.
7. Derive a simple explainable health score.
8. Ensure event access is enforced server-side.
9. Add unit/service tests for rollups.

### Rollup Rules

Stage and workstream percent complete should be based on complete items divided by total items.

Blockers should include items that are at risk, blocked if such a status exists, overdue, or critical path items with unresolved dependencies.

Health score must be simple and explainable. Start from 100 and subtract penalties for overdue, at-risk, blockers, and incomplete critical path items.

### Do Not

- Do not calculate dashboard business rules separately in each client component.
- Do not hardcode demo data.
- Do not silently ignore event access.
- Do not change UI in this prompt beyond what is needed to consume/test the service.

### Completion Summary Must Include

- Service/helper added or changed.
- Rollup rules implemented.
- Tests added.
- Tests run.
- Any data limitations found.
- Whether it is safe to proceed to Prompt 5.

---

## Prompt 5 — Add Dashboard View Shell And View Routing

### Goal

Add Dashboard as a fourth view and make it the default Timeline module landing view.

### Scope

Add view state/routing/tab support for:

```txt
Dashboard
Timeline
Board
List
```

### Tasks

1. Add the Dashboard tab/view to the Timeline module.
2. Make Dashboard the default view.
3. Preserve existing Timeline, Board, and List views.
4. Wire the Dashboard view to the dashboard payload/service from Prompt 4.
5. Add a simple shell/loading/empty/error state.
6. Add tests or update existing tests for tab/view routing.

### Do Not

- Do not build the full dashboard UI yet.
- Do not remove existing views.
- Do not introduce client-side fake rollups.

### Completion Summary Must Include

- Files changed.
- How Dashboard routing/defaulting works.
- Confirmation existing views still render.
- Tests run.
- Whether it is safe to proceed to Prompt 6.

---

## Prompt 6 — Dashboard Cards, Workstream Detail, And Right Rail

### Goal

Build the real Dashboard UI that matches the target dashboard direction.

### Scope

Implement:

- Top planning stage cards.
- Workstream grid.
- Selected workstream detail panel.
- Right rail with upcoming dates, blockers, and roadmap health.

### Tasks

1. Build responsive Dashboard layout.
2. Build stage cards.
3. Build workstream cards.
4. Add selected workstream state.
5. Build selected workstream detail panel.
6. Build right rail.
7. Use dashboard payload values only.
8. Add empty states for no timeline items, no blockers, no upcoming dates, and no owner data.
9. Add focused render tests if existing testing setup supports it.

### UI Requirements

The layout should feel like an event command-center dashboard:

- clean card structure
- progress bars
- clear status chips
- compact right rail
- strong hierarchy
- no giant flat table as the default experience

### Do Not

- Do not hardcode the supplied screenshot’s sample data.
- Do not make Dashboard depend on Board/List local state.
- Do not build recent activity from fake data.
- Do not touch unrelated event dashboard modules.

### Completion Summary Must Include

- Dashboard sections implemented.
- Empty states implemented.
- Any visual compromises.
- Tests run.
- Whether it is safe to proceed to Prompt 7.

---

## Prompt 7 — Refactor Timeline, Board, And List Views Around Hierarchy

### Goal

Make the existing Timeline, Board, and List views use the same workstream/stage taxonomy as Dashboard.

### Scope

Update all non-dashboard views inside the Timeline module.

### Tasks

1. Timeline view should group or clearly label rows by workstream and planning stage.
2. Board cards should show workstream and planning stage pills.
3. List view should expose workstream and planning stage columns.
4. Filters should include workstream and stage if the current filter architecture supports it safely.
5. Preserve existing status/date/dependency behavior.
6. Add/update tests for hierarchy rendering.

### Do Not

- Do not remove Timeline/Board/List view functionality.
- Do not make large unrelated visual redesigns.
- Do not change data persistence rules outside the taxonomy fields.

### Completion Summary Must Include

- View changes made.
- Grouping/filtering behavior.
- Tests run.
- Known UI limitations.
- Whether it is safe to proceed to Prompt 8.

---

## Prompt 8 — Rebuild Add/Edit Timeline Item Flow

### Goal

Make the create/edit flow explicitly create and edit Timeline Items with workstream/stage fields.

### Scope

Update the internal Timeline module add/edit flow.

Required fields where supported by schema/model:

```txt
Title
Workstream
Planning Stage
Status
Priority
Owner
Start Date
Due Date
Critical Path
Dependencies
Notes
```

### Tasks

1. Rename modal/drawer title and CTA to Add Timeline Item.
2. Confirm create writes TimelineItem records only.
3. Add workstream and planning stage inputs.
4. Add priority/owner/critical path inputs if supported by the data model.
5. Update edit flow to persist the same fields.
6. Validate required fields server-side.
7. Ensure event access is enforced server-side.
8. Add tests that creation does not call/use the separate Task system.
9. Add tests for create/edit persistence.

### Do Not

- Do not create Task records.
- Do not call Task APIs.
- Do not hide validation only in the UI.
- Do not add new product concepts beyond the plan.

### Completion Summary Must Include

- Add/edit fields implemented.
- Server validation added/updated.
- Confirmation the separate Task system is untouched.
- Tests run.
- Whether it is safe to proceed to Prompt 9.

---

## Prompt 9 — Regression Tests, Final Polish, And QA Checklist

### Goal

Finish the Timeline Dashboard implementation with regression coverage and a human-review-ready summary.

### Scope

Run through the completed implementation and close gaps.

### Tasks

1. Add missing targeted tests for dashboard rollups.
2. Add missing targeted tests for create/edit flow.
3. Add missing targeted tests for Dashboard/Timeline/Board/List rendering.
4. Add event-access regression coverage where feasible.
5. Run targeted timeline tests.
6. Run typecheck if reasonable.
7. Fix obvious failures in touched scope.
8. Update any relevant docs/comments.
9. Produce final implementation summary and manual QA checklist.

### Do Not

- Do not broaden into unrelated modules.
- Do not chase unrelated test failures without reporting them.
- Do not run destructive database commands.

### Final Summary Must Include

- Overall implementation summary.
- All files changed.
- Migration files created, if any.
- Tests run.
- Passing/failing status.
- Typecheck status.
- Manual migration steps if applicable.
- Manual QA checklist.
- Known risks.
- Whether the branch is ready for human review.

