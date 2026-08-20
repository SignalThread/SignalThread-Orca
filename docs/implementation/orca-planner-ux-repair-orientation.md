# OrcaOS Planner UX Repair — Prompt 0 Orientation & Contract Map

Branch: `codex/orca-planner-ux-repair` (created from `wip/prompt-6-migration-blocked`, the most
advanced integration line; it strictly contains `claude/orca-planner-ux-repair-47ada7`).
Schema mode: ADDITIVE_ALLOWED only where repository evidence proves it necessary.

## 1. Baseline (no code changed)

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm --prefix web run typecheck` | **FAIL (pre-existing)** — 3 files, all in `packages/signalthread-ui` |
| Full node test suite | `npm --prefix web run test:summary` | 2382 tests · 2361 pass · **14 fail (pre-existing)** · 7 skipped |

### Pre-existing typecheck failures (NOT caused by this work)

`packages/signalthread-ui/src/primitives/drawer-shell.tsx`, `primitives/modal-shell.tsx`, and
`product/product.tsx` fail `TS2322` against the pinned `@types/react@19.2.14`
(`SubmitEventHandler<HTMLDivElement>` vs `HTMLElement`). Reproduced on a clean stash of this
branch with the committed lockfile. Out of scope for this brief; no file under `web/` errors.

### Environment prerequisite

`node_modules/.prisma/client` is **committed** to the repository and is stale relative to
`prisma/schema.prisma`. Against the committed artifact the suite reports 91 failures; after
`npx prisma generate --config prisma.config.ts --schema ./prisma/schema.prisma` (run from the
repo root with `DATABASE_URL` exported) it reports the 14 below. Regenerating dirties tracked
files, so this branch does not commit them.

### Pre-existing test failures (NOT caused by this work)

All 14 failures share one root cause: the configured database no longer has
`public.SessionSpeaker`, while this branch's Prisma schema and
`web/lib/event-readiness.ts:57` still include the legacy `sessionSpeakers` relation.
`origin/main` carries the fix (`43ab0702 fix: remove legacy SessionSpeaker dependency`) which
this integration branch has not absorbed. Affected specs are the
`event-command-center-*`, `event-readiness`, and `operational-handoffs` journey tests.

Environment note: the node test suite talks to the real database in `.env.local`. No migration,
reset, or data deletion has been or will be run from this branch.

## 2. Surface → implementation map

### Account Command Center
- Page: `web/app/(shell)/dashboard/page.tsx` (+ `dashboard.module.css`, container query
  `account-dashboard`).
- Data: `web/src/server/services/command-center-dashboard.ts`.
- **Width defect is not in the page.** `web/app/(shell)/_components/shell-scaffold.tsx:313-317`
  wraps `children` in `w-full max-w-[1100px]` for every route that is not the matrix/event
  workspace or `/help`. `/dashboard` therefore renders inside an 1100px column with dead space
  on the right where the AI Concierge used to sit. `ConciergePanel.tsx` still exists but is no
  longer imported by the dashboard page.

### Planner Focus
- Widget: `web/app/(shell)/events/[eventId]/_components/event-dashboard-widget-renderer.tsx:442`
  (`PlannerFocusWidget`), registered in `event-command-center-widget-registry.ts:98`.
- Data: `web/src/server/services/event-command-center.ts` →
  `runOfShowGapCandidates` (line 1236) feeds `plannerFocus` (line 1563).
- **Defect:** gap `title` is generic ("Sessions need AV") and the quantity lives in `detail`,
  which the widget renders on a second `white-space: nowrap; text-overflow: ellipsis` line
  (`event-command-center.module.css:996`). The count is the first thing truncated.

### Navigation / Menus
- Left event nav: `event-workspace-shell.tsx:374-380` (Planning → "Menus" → `/fnb-catalog`).
- Tab nav: `web/components/event/event-nav.tsx:16`.
- Route/data: `web/app/(shell)/events/[eventId]/fnb-catalog/**`,
  `web/app/api/events/[eventId]/fnb-catalog/**`, `web/lib/fnb-catalog.ts`.
- A guard test asserts the nav label today: `web/lib/fnb-menu-lifecycle.test.ts:16`.

### F&B
- Canonical records: `EventFnbCatalogItem`, `EventFnbSourceMenu`, `SessionFoodService`
  (`sessionId` unique), `SessionFnbCatalogAssignment`, `SessionFnbCatalogAssignmentTax`,
  `SessionFnbRequirement`, `SessionFnbAssignmentSafetyResolution`.
- Costing: `web/lib/fnb-cost-calculation.ts`, `fnb-estimate-summary.ts`,
  `fnb-catalog-price-display.ts`, `fnb-package-tier.ts`.
- Function detail editor lives in the session workspace:
  `matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx` (`fnb` tab, 5.6k lines).
- **Every F&B record is keyed to `MatrixRow`.** There is no event-level function entity and no
  event-level landing view. A `MatrixRow` carrying `mealPeriod`, `attendance`, `fnbTaxPercent`,
  and `fnbServiceChargePercent` *is* the F&B function record, so an "independent" function can
  be created as its own `MatrixRow` without new tables. **No additive migration is required for
  Prompt 2.**

### Requirements / readiness
- `SessionFnbRequirement(eventId, sessionId, kind, code, quantity, disposition, …)` is already
  event- and session-scoped and is the single canonical requirement record; the safety views in
  `session-fnb-safety-summary.tsx` and `lib/fnb-safety-domain.ts` read it.
  `sessionId` is non-nullable, so a genuinely event-wide requirement has no home today — this is
  the one place an additive change may prove necessary (Prompt 3).
- Readiness: `web/lib/event-readiness.ts`, `web/lib/session-readiness.ts`,
  `src/server/services/event-command-center.ts` (`runOfShowReadiness`, `readiness`).

### Notes / Activity
- Session tab `notes-activity` in `session-detail-workspace.tsx` (`WORKSPACE_FOCUS_ITEMS`, line 224).
- Canonical activity: `EventActivity` + `src/server/services/event-activity.ts`,
  event view at `events/[eventId]/activity`.

### Conflicts
- Session tab `conflicts` in `session-detail-workspace.tsx`; event-level conflict payload in
  `event-command-center.ts` (`conflictCandidates`, line 1665);
  speaker conflicts in `src/server/services/speaker-conflicts.ts`.

### Roadmap
- Route `events/[eventId]/timeline`; services `src/server/services/timeline.ts`,
  `timeline-dashboard.ts`, `tasks.ts`; models `TimelineItem`, `TimelineDependency`.

## 3. Authorization boundaries

`assertEventAccessForUser(eventId, user, "read" | "write")` is the canonical event guard; account
context comes from `Membership`/`User.orgId`, event visibility from `EventMember`. Every new read
or write added by this work must call it server-side.

## 4. Prompt-by-prompt file impact plan

| Prompt | Primary files |
| --- | --- |
| 1 | `shell-scaffold.tsx`, `event-command-center.ts`, `event-dashboard-widget-renderer.tsx`, `event-command-center.module.css`, `event-workspace-shell.tsx`, `components/event/event-nav.tsx`, `fnb-catalog/page.tsx` (redirect), tests |
| 2 | new event F&B planner route + component, `lib/fnb-*`, matrix-2 session create path, catalog relocation, tests |
| 3 | `SessionFnbRequirement` service/query layer, readiness drilldowns, `event-readiness.ts`, tests |
| 4 | session notes editor + `event-activity.ts` entries, tests |
| 5 | conflict evaluation service + coverage reporting, tests |
| 6 | timeline/roadmap ordering, Not Needed, subtask access, tests |
| 7 | cross-surface regression repair |
