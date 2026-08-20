# Timeline Dashboard — Implementation Audit (Prompt 1)

This is the implementation map produced before any behavior changes, per
`docs/loop/TIMELINE_DASHBOARD_PROMPTS.md` Prompt 1. No code, schema, or files
were changed in this prompt.

## 1. Files Inspected

### Routes / Pages

- `web/app/(shell)/events/[eventId]/timeline/page.tsx` — thin wrapper; renders
  `TimelinePage` with `eventIdOverride={eventId}` and `hideEventSelector`. This
  is the event-workspace entry point for the Timeline module.
- `web/app/(shell)/timeline/page.tsx` — the actual Timeline module client
  component (~800 lines). Holds all view state, data loading, create/edit/delete
  handlers, and the create modal. Also reachable standalone (global shell) where
  it shows an event selector.

### View components

- `web/app/(shell)/timeline/_components/TimelineGanttView.tsx` — "Timeline"
  (Gantt) view. Groups items by category (`department`), supports zoom, expand.
- `web/app/(shell)/timeline/_components/TimelineBoardView.tsx` — "Board" view.
  Kanban columns derived from `status` (+ progress heuristic for Blocked/Review).
- `web/app/(shell)/timeline/_components/TimelineListView.tsx` — "List" view.
  Inline-editable table.
- `web/app/(shell)/timeline/_components/types.ts` — shared client types, status/
  priority/category display + badge helpers, `isRootTimelineItem`.

### API routes (thin; auth + zod + delegate to service)

- `web/app/api/events/[eventId]/timeline-items/route.ts` — `GET` (list), `POST` (create).
- `web/app/api/events/[eventId]/timeline-items/[itemId]/route.ts` — `PATCH`, `DELETE`.
- `web/app/api/events/[eventId]/timeline-dependencies/route.ts` — `POST`, `DELETE`.

### Service / shared

- `web/src/server/services/timeline.ts` (~510 lines) — canonical business logic:
  `listTimelineItems`, `createTimelineItem`, `updateTimelineItem`,
  `deleteTimelineItem`, `createTimelineDependency`, `deleteTimelineDependency`.
  All call `assertEventAccessForUser` via `assertTimelineEventAccess`.
- `web/lib/timeline/types.ts` — zod schemas + inferred types for API I/O.
- `web/lib/event-categories.ts` — `EVENT_CATEGORY_OPTIONS` and normalization;
  currently powers the `department` field.
- `web/scripts/backfill-timeline-roots.mjs` — backfills a root "Event Timeline"
  item per event.

### Schema

- `web/prisma/schema.prisma` — `TimelineItem` (line ~604), `TimelineDependency`
  (line ~633), enums `TimelineStatus`/`TimelinePriority`/`TimelineDependencyType`
  (line ~1464).
- `prisma/schema.prisma` — second copy; `TimelineItem` at line ~484. Both copies
  must be kept in sync.

## 2. Timeline Data Flow Map

```txt
[event workspace] /events/:eventId/timeline/page.tsx
   -> renders TimelinePage(eventIdOverride, hideEventSelector)
        client state: events, selectedEventId, viewMode(LIST default),
                      items, expandedIds, create-modal fields, filterDepartment
   -> loadItems(eventId): GET /api/events/:eventId/timeline-items
        -> listTimelineItems(eventId, user, filters)  [assert read access]
        -> prisma.timelineItem.findMany (event-scoped), root item sorted first
   -> renderCurrentView():
        BOARD    -> TimelineBoardView(taskItems)        // excludes root item
        TIMELINE -> TimelineGanttView(filteredItems)    // includes root for window
        LIST     -> TimelineListView(taskItems)
   Mutations (all event-scoped, assert write access):
        create  -> POST   /timeline-items        -> createTimelineItem
        edit    -> PATCH  /timeline-items/:id     -> updateTimelineItem
        delete  -> DELETE /timeline-items/:id     -> deleteTimelineItem (cascades children + deps)
        deps    -> POST/DELETE /timeline-dependencies -> create/deleteTimelineDependency
```

All four views share the **same** `items` array loaded once from the canonical
`timeline-items` endpoint. There is no separate per-view data source. Good
baseline for adding a Dashboard view from the same canonical data.

## 3. API / Service Map

| API route | Method | Service fn | Access check |
|---|---|---|---|
| `/timeline-items` | GET | `listTimelineItems` | read |
| `/timeline-items` | POST | `createTimelineItem` | write |
| `/timeline-items/:itemId` | PATCH | `updateTimelineItem` | write |
| `/timeline-items/:itemId` | DELETE | `deleteTimelineItem` | write |
| `/timeline-dependencies` | POST | `createTimelineDependency` | write |
| `/timeline-dependencies` | DELETE | `deleteTimelineDependency` | write |

- Auth: every route calls `resolveRequestUser(request)`; service calls
  `assertEventAccessForUser(eventId, user, read|write)`. **Event-scoped
  authorization is enforced server-side** and is consistent across the module.
- Routes are thin: parse params, resolve user, zod-validate, delegate, map errors.
- No dashboard rollup endpoint exists yet (Prompt 4 will add a service +
  consumption path).

## 4. "Task" Language Inventory (user-facing, Timeline module only)

`web/app/(shell)/timeline/page.tsx`:
- L92/381/401 `"New Task"` default title; L578 button **"Add Task"**;
  L617 modal heading **"Add Task"**.
- L647 label "Parent Task"; L649 "Subtask"; L664 "Task type"; L675 "Task" toggle.
- L355 confirm "Delete this task and any subtasks?"; L367/372 "Failed to delete task".
- L407/413 "...required for tasks."; L461/472 "Failed to create task".
- L480 "Add a task to begin."; L484 "Loading timeline tasks..."; L489/496/512
  "No tasks yet for this event."

`TimelineBoardView.tsx`: L116 "Drop tasks here".

`TimelineListView.tsx`: L154 `"New Task"` fallback; L183 "Failed to save task";
L228 column header "Task"; L300/301/313/314 "Edit task"/"Delete task" titles/aria.

`TimelineGanttView.tsx`: L405 "No dated tasks yet"; L490 "Task hierarchy".

Internal identifiers (`handleDeleteTask`, `taskItems`, `createTaskType`,
`TaskRow`, `compareTaskRows`, etc.) are **not** user-facing and per the plan
should be left stable to avoid churn. Prompt 2 changes copy only.

## 5. Add Flow — Canonical Target Confirmation

**Confirmed: the add flow writes `TimelineItem`, not Task.**

- `handleCreateTask` POSTs to `/api/events/:eventId/timeline-items`.
- Route → `createTimelineItem` → `getPrisma().timelineItem.create(...)`.
- The Timeline module does **not** import `web/src/server/services/tasks.ts` and
  never references `prisma.task`. The separate Task system (`model Task`,
  `TaskAssignment`, `TaskLink`, `TaskComment`, `TaskActivity`, `TaskWatcher`,
  enums `TaskStatus`/`TaskPriority`/`TaskType`, service `tasks.ts`, tests
  `tasks-*-regression.test.ts`) is wholly independent and must stay untouched.

## 6. Current Schema Capability Table

`TimelineItem` fields today: `id, eventId, title, department?, status, priority,
ownerUserId?, parentId?, startDate?, endDate?, progress?, sortOrder, createdAt,
updatedAt` (+ relations: `event`, `ownerUser`, `parent/children`,
`predecessor/successorDependencies`).

| Product concept (target model) | Supported now? | Notes |
|---|---|---|
| Workstream / Category (Venue, Housing, Registration, Speakers, Sponsors, F&B, Production, Marketing) | **Partial / mismatched** | `department` exists but is normalized to a **different** set (`F&B, AV, Rooms, Staffing, Production, Decor`) via `event-categories.ts`. The target workstream taxonomy is not represented. |
| Planning Stage / Subcategory (Pre-Planning, Planning, Build, Show Week, Close) | **No** | No field. Hierarchy currently uses `parentId` (root "Event Timeline" + nested items), not stages. |
| Priority | **Yes** | `TimelinePriority` enum LOW/MEDIUM/HIGH/CRITICAL. |
| Owner | **Yes** | `ownerUserId` + `ownerUser` relation (org users). |
| Critical path | **No (UI-only / derived)** | No `isCriticalPath` field. Gantt hardcodes `isCriticalPath=false`; the page header derives an "on Critical Path" count from `priority === "CRITICAL"`. |
| Dependencies / blockers | **Yes (deps)** / **No (blocker flag)** | `TimelineDependency` (FINISH_TO_START only) is canonical. No explicit "blocked" status — `TimelineStatus` is NOT_STARTED/IN_PROGRESS/AT_RISK/COMPLETE. "Blocker" must be derived (at-risk, overdue, or critical-path items with unresolved predecessor deps). |
| Status | **Yes** | NOT_STARTED, IN_PROGRESS, AT_RISK, COMPLETE. |
| Dates | **Yes** | `startDate`/`endDate` (DATE). Milestones store equal start=end. |

### Are Prisma changes needed? — **Yes (additive only), in Prompt 3.**

Minimum additive fields to support the target model:
- `workstream` — top-level category using the new taxonomy. (Keep existing
  `department` untouched; do **not** rename/drop it.)
- `planningStage` — subcategory (Pre-Planning…Close).
- `isCriticalPath Boolean @default(false)` — promote critical path from a
  derived/UI-only notion to persisted data.

Open decision for Prompt 3: enum vs. String for `workstream`/`planningStage`.
**Caution:** there is pre-existing enum drift — migration
`20260302130000_timeline_stack1_model_api` created DB enum types
`TimelineItemStatus`/`TimelineItemPriority`, but the Prisma schema declares
`TimelineStatus`/`TimelinePriority`. New enums must use fresh, clearly-named
types created cleanly in the new migration to avoid colliding with that drift.
Indexes `@@index([eventId, workstream])` / `([eventId, planningStage])` should be
added for dashboard rollup queries.

## 7. Tests — Found vs. Missing

- **Test runner:** `node --test` + `tsx`. Tests live as `web/lib/*.test.ts` and
  `web/scripts/*.test.ts`. `npm run test:summary` (in `web/`) runs all `*.test.ts`.
  No vitest/jest. Component tests are written as logic/regression tests, not DOM
  render tests (e.g. `*-ui-regression.test.ts` assert on derived data/labels).
- **Found, Timeline-specific:** none. (No `timeline*.test.ts`.)
- **Found, related/reference patterns:** `event-access-regression.test.ts`,
  `tasks-service-regression.test.ts`, `tasks-api-routes-regression.test.ts`,
  `budget-dashboard-regression.test.ts` (good model for a dashboard-rollup test).
- **Missing (to add in later prompts):**
  - Dashboard rollup/health service tests (Prompt 4/9).
  - Taxonomy mapping/defaults tests (Prompt 3).
  - Create/edit persistence + "does not touch Task system" tests (Prompt 8).
  - View tab/routing + hierarchy-label tests (Prompt 5/7).
  - Event-scope regression for any new dashboard endpoint (Prompt 9).

## 8. Recommended Files Likely To Change In Later Prompts

- Copy (P2): `page.tsx`, `TimelineBoardView.tsx`, `TimelineListView.tsx`,
  `TimelineGanttView.tsx`.
- Taxonomy/schema (P3): `web/prisma/schema.prisma`, `prisma/schema.prisma`, new
  migration dir, new `web/lib/timeline/taxonomy.ts` (constants/helpers),
  `web/lib/timeline/types.ts`, `web/src/server/services/timeline.ts`,
  `_components/types.ts`.
- Dashboard service (P4): new `web/src/server/services/timeline-dashboard.ts`
  (+ test), maybe a new GET route under `/api/events/:eventId/timeline-dashboard`.
- Dashboard shell + UI (P5/P6): `page.tsx`, new `_components/TimelineDashboardView.tsx`
  (+ subcomponents), view-mode type.
- View refactor (P7): the three existing view components + `types.ts`.
- Add/edit flow (P8): `page.tsx` create modal, `timeline.ts`, `timeline/types.ts`.

## 9. Safe To Proceed?

**Yes — safe to proceed to Prompt 2.** The module is well-isolated, fully
event-scoped server-side, and already writes canonical `TimelineItem` records
through a thin-route/service architecture. Prompt 2 is copy-only and low risk.

Flagged for Prompt 3 (not a blocker now): schema work will be required and must
be additive; mind the pre-existing `TimelineItemStatus` enum-naming drift when
authoring the migration.
</content>
</invoke>
