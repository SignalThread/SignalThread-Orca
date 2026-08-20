# Planner Dash Budget Sections Redesign — Opus Prompt Pack

_Paste-ready execution prompts. The clean product/architecture plan is in the separate plan document._

> Use this doc with Opus: These prompts assume the schema is open for this rewrite. They still require production-safe migrations, backfills, generated Prisma updates, and regression coverage.

## Before starting

Run from repo root. These commands are non-interactive and should not open Vim:

```bash
cd "/Users/ali/Documents/God Emperor of Dune /planner-os"
git status --short
git switch feat/budget-session-groups-dashboard || git switch -c feat/budget-session-groups-dashboard
```

- If there are unrelated dirty files, stop and ask before mixing them into this branch.

- Keep both Prisma schema copies in sync if this repo still has prisma/schema.prisma and web/prisma/schema.prisma.

- Do not treat old subcategory strings as canonical sessions. Sessions come from MatrixRow / Run of Show.

- Do not remove the BudgetLineItem model. The user-facing “line item” presentation changes, but budget rows still exist.

## Prompt 1 — Schema, migration, and service foundation

| Setting | Value |
| --- | --- |
| Model | Opus |
| Reasoning | High |
| Goal | Create the persisted foundation for session-linked budget rows, user-defined groups, category targets, and derived totals. |

You are working in Planner OS / Planner Dash on branch feat/budget-session-groups-dashboard.

Context:
- This is a Next.js App Router app with Prisma/PostgreSQL.
- Budget service code is under web/src/server/services/budget.ts unless the repo has been reorganized.
- Event workspace routes are under web/app/(shell)/events/[eventId]/*.
- API routes are under web/app/api/**/route.ts.
- Run of Show sessions are canonical MatrixRow records.
- F&B catalog/menu assignments can already sync to budget line items through EventFnbCatalogItem / SessionFnbCatalogAssignment or adjacent code.
- The schema is open for this rewrite, but migrations must still be production-safe and tested.

Product change:
1. Subcategories become Sessions. Budget rows need an optional persisted link to the canonical session/MatrixRow.
2. Users need budget Groups: free-form, event/budget-scoped names that can be assigned to any budget row.
3. Dashboard category target budgets need their own persisted model. Category targets are not stored on individual rows.
4. Actual totals remain derived from budget rows. Do not store duplicate actual totals as authoritative data.
5. Keep BudgetLineItem as the row entity. The old user-facing line-item/blue-block presentation will be removed later; do not delete the underlying row model.

Tasks:
A. Inspect the current schema and service paths first:
- prisma/schema.prisma
- web/prisma/schema.prisma, if present
- web/src/server/services/budget.ts
- budget API routes
- F&B catalog/session assignment sync code
- MatrixRow/session models and routes
- existing budget regression tests

B. Add the schema foundation:
- Add an optional session FK on BudgetLineItem. Use the repo's canonical naming. If the model is MatrixRow, prefer a field like matrixRowId while exposing it as sessionId/session in API/UI.
- Add an optional BudgetLineItem.groupId relation.
- Add a BudgetGroup model scoped to the correct budget/event parent. Include name, normalizedName, sortOrder if useful, createdByUserId if the repo tracks authors, createdAt, updatedAt.
- Add a uniqueness constraint to prevent duplicate group names within the same event/budget scope after normalization.
- Add a BudgetCategoryTarget model scoped to the correct budget/event parent. Include categoryKey, categoryLabel if needed, targetAmount, createdBy/updatedBy if consistent with the app, createdAt, updatedAt.
- If existing source metadata for generated budget rows is weak, add a clean source identity pattern such as sourceModule/sourceEntityId or reuse existing typed relations. The goal is idempotent F&B/session sync, not duplicate generated rows.
- Preserve legacy subcategory data. Do not make it the new session source. Leave it hidden/legacy unless there is a safe, reviewed reason to rename it.

C. Migration/backfill:
- Add nullable fields first so existing data remains valid.
- Backfill session links only where there is a provable existing source relationship from a session assignment to a budget row.
- Do not infer session from text.
- Do not create groups from legacy subcategories.
- Make migration idempotent/safe for existing data where practical.
- Generate Prisma client and keep both schema copies aligned.

D. Service layer:
- Add canonical helpers for listing sessions available to budget rows for an event.
- Add create/find/upsert BudgetGroup behavior with normalized-name duplicate prevention.
- Add assign/unassign group on BudgetLineItem.
- Add assign/unassign session on BudgetLineItem, with server-side event access validation and same-event validation between line item and MatrixRow.
- Add getSessionBudgetTotal(eventId, sessionId) and filtered totals helper used by the grid.
- Add getGroupBudgetTotals(eventId) and getCategoryBudgetTotals(eventId).
- Add get/upsert BudgetCategoryTarget by category.
- Keep derived totals non-authoritative and computed from BudgetLineItem rows.

E. Tests:
- Add or update service tests for session assignment, invalid cross-event session assignment rejection, group creation/duplicate prevention, group assignment, category target upsert, and derived totals.
- Add a regression test that F&B-generated budget rows can carry a session link without duplicate row creation if the sync runs again.
- Add migration/backfill coverage if this repo has migration tests or SQL assertions.

Acceptance criteria:
- BudgetLineItem can be linked to a MatrixRow/session.
- BudgetLineItem can be linked to a BudgetGroup.
- BudgetGroup names are normalized and duplicate-safe within the right scope.
- Category target budgets persist independently from rows.
- Session/group/category totals are derived server-side.
- Existing budgets still load after migration.
- Existing F&B-to-budget sync still works and is ready to preserve session linkage.
- Tests pass for the touched service layer.

After implementation, summarize:
- Files changed.
- Exact schema changes.
- Migration name.
- Backfill rules.
- Tests added/updated and results.

## Prompt 2 — Budget grid: Session + Groups UX

| Setting | Value |
| --- | --- |
| Model | Opus |
| Reasoning | High |
| Goal | Replace subcategory behavior in the grid with Session selection/filtering and user-defined Group assignment. |

Continue on branch feat/budget-session-groups-dashboard after Prompt 1.

Goal:
Update the budget grid so users work with Sessions and Groups instead of subcategories.

Context to preserve:
- Sessions come from canonical MatrixRow / Run of Show records.
- Groups are user-defined BudgetGroup records created from the grid or existing group options.
- Budget rows still exist as BudgetLineItem records.
- The old blue session/ops block under the line item area will be removed in Prompt 3, but avoid building new UI around that old pattern now.

Tasks:
A. Inspect current grid components and data contracts:
- Event budget page/components under web/app/(shell)/events/[eventId]/budget or current budget path.
- shared budget grid components.
- budget API routes used for row create/update/list.
- current filter/sort toolbar.
- current import/export row shape if it is tightly coupled to grid columns.

B. Session column:
- Replace the visible Subcategory column with Session.
- Session cell should render the current linked session title, or an empty/unassigned state.
- Editing the Session cell should open a searchable picker of sessions from the current event.
- Saving should persist the BudgetLineItem session link through the service/API added in Prompt 1.
- Clearing should remove the session link.
- Validate server-side that the selected session belongs to the same event.
- Do not use legacy subcategory text as the session value.

C. Session filter:
- Add a Session filter to the grid toolbar.
- At minimum support selecting one session.
- If the existing filter component cleanly supports multi-select, multi-select is acceptable, but do not overbuild it.
- Filtering must be data-backed and consistent with pagination/sorting if those exist.
- Clearing the filter must fully reset the view.

D. Session total footer:
- When a session filter is active, show a sticky bottom total/footer for the selected session budget.
- Include session title, row count, and total amount.
- If multiple sessions are allowed, show combined total and count.
- Use the canonical derived total helper or the same filtered dataset in a deterministic way. Avoid a separate duplicated formula that can drift.
- Do not show a fake zero target; this is actual selected-session total only.

E. Group column:
- Add a Groups column.
- It should support selecting an existing group or typing a new group name.
- Creating a new group should create a BudgetGroup record and assign the current row to it.
- Clearing the cell should unassign the row from the group, not delete the group.
- Prevent duplicate groups by normalized name.
- Show clean empty state for ungrouped rows.

F. Group filter/drilldown readiness:
- Add a Group filter if the grid toolbar pattern supports it without a large detour.
- If not, ensure the grid can accept a group filter from URL/query params so dashboard group blocks in Prompt 4 can drill into it.
- Keep URL/query behavior stable and shareable if the current grid already uses query params.

G. Visual/UI details:
- Keep the table editable. Do not turn row clicks into navigation.
- Keep spacing tight and consistent with current Planner Dash design.
- Avoid wrapping session/group names into tall rows. Use truncation with tooltip if needed.
- Make filter chips clearable.
- Preserve existing category/status/amount editing behavior.

H. Tests:
- Add/update component or integration tests for loading sessions into the picker, assigning a session, clearing a session, filtering by session, and showing the footer total.
- Add tests for creating a group inline, assigning an existing group, clearing group assignment, and duplicate normalization.
- Add regression coverage that legacy subcategory values do not appear as session options.

Acceptance criteria:
- The grid no longer exposes Subcategory as the primary user-facing field.
- Users can assign budget rows to sessions.
- Users can filter by session and see a bottom total.
- Users can create and assign groups from the grid.
- Filter clearing works.
- Existing row editing still works.
- Tests cover the new grid behavior.

After implementation, summarize files changed and include screenshots or a concise UI walkthrough if available.

## Prompt 3 — Session ops link and generated budget item sync

| Setting | Value |
| --- | --- |
| Model | Opus |
| Reasoning | High |
| Goal | Remove the old blue ops block and replace it with clean session ops navigation while preserving generated row linkage from session operations. |

Continue on branch feat/budget-session-groups-dashboard after Prompt 2.

Goal:
Keep the ability to jump from a budget row to the session operations page without the old blue block under the line item area. Also harden generated budget rows from session ops so they keep session/source linkage.

Product decision:
Use a narrow Ops action column or an icon-only action anchored near the Session column. Do not make the full row navigate. Do not make the Session cell itself the only link, because that cell needs to remain editable.

Tasks:
A. Inspect current behavior:
- Find the existing blue block/link under the line item area.
- Identify the exact destination route it opens today.
- Inspect session workspace routes, especially /events/:eventId/matrix/sessions/:sessionId and any room-set/seating modes.
- Inspect F&B catalog assignment to budget sync and any generated budget row markers.

B. Remove old block:
- Remove the blue block from the grid row UI.
- Remove dead CSS/components that only supported that block, unless shared elsewhere.
- Do not remove the underlying ability to identify a session/source-linked budget row.

C. Add clean Ops action:
- Add a narrow Ops column, preferably pinned/right-aligned if the table supports it.
- Show an icon-only button with tooltip/copy “Open session ops” when the row has a linked session.
- Hide it or show a disabled muted state when no session is linked.
- The button must call stopPropagation/prevent row edit conflicts so normal row/cell editing still works.
- Destination should be the canonical session operations workspace, not a new budget-specific page.
- If the route needs matrixRowId but UI uses sessionId, map it cleanly through the row data.

D. Generated budget item sync:
- When a user adds an F&B catalog/menu item to a session, the generated budget row should include the same session link.
- If the assignment already has a budget row and the sync runs again, update that row instead of creating a duplicate.
- If the source assignment changes price/quantity/name/category, update the generated row according to existing behavior while preserving session link and source identity.
- If the source assignment is removed, preserve existing delete/remove behavior, but ensure no orphaned source link remains.
- If the session changes on the source assignment, reconcile the budget row session link.
- Manual budget rows can still link to a session through the grid without requiring source metadata.

E. Diagnostics and copy:
- Generated/source-linked rows may show subtle source context if the existing grid already has such labels, but do not clutter the row.
- The Ops button is the primary way to get from budget row to session ops.
- Make sure keyboard/screen reader label says “Open session operations for [session title]”.

F. Tests:
- Test that the Ops button appears only when a row has a session link.
- Test that clicking Ops navigates to the correct session route and does not trigger cell edit.
- Test that F&B session assignment creates/updates a budget row with the correct session link.
- Test idempotency: running sync twice does not duplicate the row.
- Test clearing/removing source assignment follows existing behavior and does not leave bad links.

Acceptance criteria:
- Old blue ops block is gone.
- Budget row editing remains intact.
- Rows with linked sessions have a clear, compact way to open session ops.
- Generated session budget rows retain correct session/source linkage.
- F&B sync stays idempotent.
- Tests cover navigation and generated-row linkage.

## Prompt 4 — Dashboard category targets and group blocks

| Setting | Value |
| --- | --- |
| Model | Opus |
| Reasoning | High |
| Goal | Redesign the budget dashboard into large category/group blocks with editable category targets and over-budget states. |

Continue on branch feat/budget-session-groups-dashboard after Prompt 3.

Goal:
Redesign the Budget Dashboard so it is block-based and driven by category totals and user-created group totals.

Product direction:
- Dashboard should feel closer to room set/status blocks than a dense report table.
- Category blocks: F&B, AV, and other budget categories.
- Group blocks: every BudgetGroup becomes a block in its own Groups section/category.
- Category targets are entered on the dashboard and stored in BudgetCategoryTarget.
- Over-budget category blocks should turn red when actual exceeds target.

Tasks:
A. Inspect current budget dashboard:
- Current dashboard page/components and CSS modules.
- Existing category total calculations.
- Existing drilldown links from dashboard to grid.
- Existing responsive behavior.

B. Data contract:
- Build or reuse a dashboard summary API/service that returns category blocks and group blocks in one payload.
- Category block data should include category key/label, actual total, target amount if set, variance, percent used if target exists, row count, and drilldown filter params.
- Group block data should include group id/name, actual total, row count, and drilldown filter params.
- Actual totals must derive from BudgetLineItem rows.
- Missing category target should be represented as null/not set, not zero.

C. Category target editing:
- Add inline target editing on each category block.
- Persist changes to BudgetCategoryTarget through server-side validated API/service.
- Support clearing a target if the product’s input pattern supports clear/delete. If not, support editing to blank/null intentionally.
- Validate amount as non-negative decimal.
- Refresh the dashboard summary after save.

D. Visual design:
- Use larger blocks/cards, not a dense table.
- Each category card should show actual total prominently.
- Show target and variance when target exists.
- Turn the card red/critical when actual > target.
- Optional warning state when actual is 90–100% of target if it fits existing design tokens.
- Do not mark missing target as over-budget.
- Group blocks should be in a distinct “Groups” section so they do not look like standard categories.
- Use compact responsive cards so the dashboard works at narrower widths.

E. Drilldowns:
- Clicking a category card should open/filter the budget grid to that category.
- Clicking a group card should open/filter the budget grid to that group.
- If the grid uses query params, use stable params like category= and groupId= or group=.
- Do not break existing dashboard-to-grid category links.

F. Empty states:
- If no category rows exist, show a useful empty state.
- If no groups exist, show “No groups yet” with copy that groups are created from the budget grid.
- If a category has no target, show an “Add target” affordance.

G. Tests:
- Test category blocks render actual totals and row counts.
- Test target edit save and dashboard refresh.
- Test over-budget red/critical state only when actual > target.
- Test missing target is not treated as zero.
- Test group blocks appear when groups exist.
- Test category and group block drilldowns produce the expected grid filters.
- Add responsive/layout regression coverage if the repo has screenshot or DOM layout tests.

Acceptance criteria:
- Dashboard is block-based.
- Category budget targets can be entered on the dashboard.
- Over-budget categories visually flag red/critical.
- User-created groups appear as dashboard blocks.
- Category/group drilldowns open the grid with the correct filters.
- Tests cover target persistence, block totals, over-budget state, and drilldowns.

## Prompt 5 — Import/export/reporting, approval surfaces, cleanup, and final regression

| Setting | Value |
| --- | --- |
| Model | Opus |
| Reasoning | High |
| Goal | Finish the rewrite by aligning import/export, reports, approval/submission views, legacy copy, and tests. |

Continue on branch feat/budget-session-groups-dashboard after Prompt 4.

Goal:
Finish the budget sections rewrite so there are no half-old/half-new surfaces. Session and Group should be consistently represented across grid, dashboard, imports/exports, reports, submissions/approvals, and tests.

Tasks:
A. Audit remaining budget surfaces:
- Budget import UI and parser/mapping code.
- Budget export CSV/Excel code.
- Budget reports pages/components.
- Budget submission/approval/revision views.
- Budget activity/audit display if it includes row details.
- Empty states and helper copy.
- Tests that still mention subcategory as a primary field.

B. Import behavior:
- Add Session column support using human-readable session title.
- Map Session to a MatrixRow in the current event by exact title when unambiguous.
- If no session is found, leave session blank or raise a row-level validation error based on current import UX. Do not guess.
- If multiple sessions share the same title, require row-level resolution/error. Do not pick randomly.
- Add Group column support.
- Decide based on existing import behavior whether group names auto-create BudgetGroup rows. If auto-created, normalize and de-dupe. If not, show validation requiring existing group.
- Preserve legacy Subcategory import only if needed for backwards compatibility, but do not surface it as the new primary field.

C. Export behavior:
- Include Session and Group columns in exported budget data.
- Export session title and group name, not raw IDs.
- Remove or de-emphasize Subcategory from exports unless backward compatibility requires it. If kept, label it clearly as Legacy Subcategory.
- Make sure generated/source-linked rows export cleanly.

D. Reports and approval surfaces:
- Update reports to support summaries by category, session, and group where appropriate.
- Update submission/approval detail views to show Session and Group instead of Subcategory where row context is needed.
- Make sure approval totals remain unchanged and still derive from rows.
- Make sure BudgetActivity entries created by relevant actions remain intact.
- If activity copy mentions subcategory, update it to session/group language.

E. Legacy cleanup:
- Search for user-facing “Subcategory” copy in budget surfaces.
- Replace it with Session unless it is truly a hidden legacy import/export compatibility label.
- Remove dead CSS/components from the old blue line-item ops block.
- Remove duplicate client-side total calculations if the new service helper is canonical.
- Keep legacy fields in schema only as needed for safe historical preservation.

F. Accessibility and QA:
- Session picker, group combobox, Ops button, category target input, and dashboard cards need accessible labels.
- Keyboard users should be able to edit session/group fields and activate Ops without accidentally editing the row.
- Number formatting should be consistent across grid, footer, dashboard, exports, and reports.
- Responsive behavior should not wrap cards/table cells into unusable vertical stacks.

G. Final tests:
- Run the targeted budget/session/group tests added in previous prompts.
- Run existing budget regression tests.
- Run import/export tests.
- Run F&B sync tests.
- Run typecheck/lint/build commands normally used by this repo if available.
- Do not silently skip failing tests. Fix failures or clearly report blockers.

Acceptance criteria:
- User-facing budget surfaces consistently use Session and Group.
- Import/export supports Session and Group.
- Reports and approval surfaces do not regress.
- Old subcategory/blue-block UX is gone from active budget workflows.
- All generated session items still sync correctly.
- Final test summary is clean or blockers are explicitly documented.

Final response should include:
- Branch name.
- Files changed by category.
- Migrations added.
- Tests run and results.
- Any remaining product decisions or follow-up risks.

## Optional review prompt after all implementation

Audit the completed budget-session-groups-dashboard branch against the product plan.

Check specifically:
- No user-facing Subcategory remains in active budget workflows unless marked legacy.
- Session links use canonical MatrixRow/session records.
- Group names are persisted and duplicate-safe.
- Category targets are persisted only on dashboard/category target model.
- Actual totals are derived, not duplicated as authoritative state.
- F&B/session-generated budget rows remain idempotent and session-linked.
- Ops link is compact and does not interfere with table editing.
- Dashboard category and group blocks drill down correctly.
- Import/export/reporting/approval surfaces are aligned.
- Tests cover the high-risk paths.

Return a punch list of anything that is incomplete, risky, or inconsistent. Do not make broad unrelated refactors.
