# Timeline Dashboard Redesign Plan

## Purpose

Redesign the event Timeline module into a true roadmap dashboard that matches the new dashboard direction.

The Timeline module should no longer feel like a generic task board. It should be an event roadmap system where planners can understand readiness by workstream, planning stage, blocker, deadline, and critical path.

## Target Product Model

The new hierarchy is:

```txt
Event
  Workstream / Category
    Planning Stage / Subcategory
      Timeline Item
        Dependencies
        Owners
        Dates
        Status
        Priority
        Critical path / blocker state
```

Workstreams are the top-level categories. Examples:

```txt
Venue
Housing
Registration
Speakers
Sponsors
F&B
Production
Marketing
```

Planning stages are the subcategories. Examples:

```txt
Pre-Planning
Planning
Build
Show Week
Close
```

Timeline items are not Tasks. The add flow inside this module should create timeline items only. It should not create records in the separate task system unless a future plan explicitly scopes that integration.

## Existing View Model

The current Timeline module has these views:

```txt
Timeline
Board
List
```

The redesigned module must have these views:

```txt
Dashboard
Timeline
Board
List
```

Dashboard should become the default landing view for the Timeline module.

## Product Language Change

Replace task language inside the Timeline module with timeline item language.

Required copy changes:

```txt
Add Task -> Add Timeline Item
New Task -> New Timeline Item
1 tasks -> 1 item
5 tasks -> 5 items
Task hierarchy -> Timeline hierarchy
```

Component and service names do not all need to be renamed if that creates unnecessary churn, but user-facing copy must be cleaned up.

## Dashboard Target

The dashboard should visually and functionally follow the supplied target image.

### Top Stage Cards

Show one rollup card per planning stage:

```txt
Pre-Planning
Planning
Build
Show Week
Close
```

Each stage card should show:

- Stage name
- Status label: Complete, In Progress, Ahead, Upcoming, At Risk
- Percent complete
- Progress bar
- Item readiness count
- Start date or next important date

### Workstream Grid

Show one card per workstream/category.

Each workstream card should show:

- Workstream name
- Icon/color treatment if already available or easy to map safely
- Readiness percentage
- Progress bar
- Open item count
- At-risk/blocker count

Clicking a workstream should select it and update the detailed rollup panel.

### Selected Workstream Detail Panel

The selected workstream detail should show:

- Readiness checklist
- Key dates
- Owners
- Recent activity if available from current data
- Blockers
- Button/link to view all timeline items for that workstream

If recent activity is not available from existing timeline data, do not fake it. Show a graceful empty state or omit that subsection until a real source exists.

### Right Rail

The dashboard right rail should show:

- Upcoming dates
- Top blockers
- Roadmap health score
- Health drivers

These values should be derived from TimelineItem and TimelineDependency data or other canonical event data already available. Do not create hardcoded demo metrics.

## Source of Truth

TimelineItem and TimelineDependency are the canonical data sources for this module.

The dashboard, timeline, board, and list views must all read from the same event-scoped timeline data. Do not create a separate dashboard-only data model that can drift from TimelineItem.

The separate Task system is not part of this module. The internal add flow must create TimelineItem records, not Task records.

## Schema / Prisma Policy

Prisma changes are allowed in this automation loop when the audit proves existing TimelineItem fields cannot support the required product model.

Allowed schema work:

- Additive fields needed for workstream/category, planning stage/subcategory, priority, owner, critical path, or blocker metadata.
- Additive enums if they are clearly needed and safer than strings.
- Additive indexes for event-scoped dashboard queries.
- Updates to both Prisma schema copies if both exist in the repo.
- Migration file creation.
- Prisma generate if the repo workflow supports it without touching the database.

Disallowed schema work unless a human explicitly approves it:

- Dropping columns.
- Renaming existing columns.
- Deleting data.
- Resetting the database.
- Running migrations against the database.
- Running destructive Prisma commands.
- Replacing canonical TimelineItem or TimelineDependency with duplicated JSON state.

If schema changes are needed, create the migration file and document manual run instructions, but do not apply the migration.

## Architecture Rules

- Keep route handlers thin.
- Put timeline business logic and dashboard rollups in server-side services/helpers.
- Enforce event access server-side on every timeline read/write.
- Keep dashboard rollup calculations in one canonical service path.
- Use client components for interaction and display, not as the source of truth for business rules.
- Avoid broad refactors outside the Timeline module.
- Preserve existing Timeline, Board, and List behavior while adding Dashboard.
- Do not duplicate timeline state into local UI-only structures that cannot be persisted.

## Prompt Phases

The implementation should be handled in 9 prompts:

1. Audit current Timeline implementation.
2. Rename task language to timeline item language.
3. Implement/confirm workstream and planning stage taxonomy, including additive Prisma changes if needed.
4. Build canonical timeline dashboard payload/service.
5. Add Dashboard view shell and view routing/tab state.
6. Build dashboard cards, workstream detail, and right rail.
7. Refactor Timeline, Board, and List views around workstream/stage hierarchy.
8. Rebuild Add/Edit Timeline Item flow.
9. Regression tests, final polish, and QA checklist.

## Acceptance Criteria

The work is complete when:

- Timeline module has Dashboard, Timeline, Board, and List views.
- Dashboard is the default view.
- Dashboard visually follows the target screenshot direction.
- Workstreams are top-level categories.
- Planning stages are subcategories.
- User-facing “Task” language is removed from this module.
- Add Timeline Item creates TimelineItem records only.
- Timeline dashboard rollups are derived from canonical timeline data.
- Board/List/Timeline views still function.
- Event-scoped authorization is preserved on timeline reads and writes.
- Any Prisma changes are additive, migrated, documented, and not applied automatically.
- Tests cover dashboard rollups and the add/edit flow.

## Manual QA Checklist

Use one event with timeline items across several workstreams and planning stages.

Check:

- Dashboard loads first.
- Stage cards show accurate percentages.
- Workstream cards show accurate readiness and blocker counts.
- Selecting a workstream updates the detail panel.
- Upcoming dates are sorted correctly.
- Top blockers reflect at-risk/blocked/critical items.
- Board cards show workstream and stage context.
- Timeline view groups or labels items by workstream and stage.
- List view exposes workstream and stage fields.
- Add Timeline Item creates a timeline item, not a task.
- Edit flow persists workstream, stage, status, priority, owner, and dates.
- Event viewer/read-only users cannot write.
- Empty events show useful empty states.

## Known Risks

- Existing TimelineItem may not have fields for workstream/stage/priority/owner/critical path.
- Current critical path indicator may be UI-only or incomplete.
- Existing board/list/timeline views may each compute data differently.
- The current add flow may be named task-oriented internally even if it writes TimelineItem.
- Dashboard health score can become misleading if based on fake rules; it must be simple and explainable.

## Health Score Rule

Start with a simple explainable score. Do not over-engineer AI-style health.

Suggested first-pass formula:

```txt
100
- overdue item penalty
- at-risk item penalty
- blocker/dependency penalty
- incomplete critical path penalty
+ small on-track completion bonus
```

The exact formula should live in the server-side dashboard service and be covered by tests.

