# Planner Dash Budget Sections Redesign

_Clean product and technical plan. Prompts are intentionally excluded and live in the separate prompt document._

> Core direction: Schema is open for this rewrite. The plan should intentionally add the missing persisted relationships instead of trying to fake sessions, groups, or category targets through UI-only state.

## 1. What is changing

- Subcategories become Sessions. Budget rows should use the canonical Run of Show session record, not a free-text subcategory field.

- Grid adds Session filtering. Selecting a session should show a bottom total so planners can immediately see the budget total for that session.

- Groups become first-class budget organization. Users can create any group name and assign any budget row to it, regardless of category or session.

- The old line-item ops block goes away. The BudgetLineItem data model stays, but the visual blue block under the old line item column should be replaced with a cleaner ops action.

- Dashboard becomes block-based. The dashboard should look closer to room set/status cards: category blocks, group blocks, targets, variance, and over-budget states.

- Category budget targets live on the dashboard. Targets should be editable from the dashboard because individual rows do not own the category budget ceiling.

## 2. Product principles

- Sessions are not labels. They are event-scoped MatrixRow records selected from sessions already created in Run of Show.

- Groups are intentionally flexible and user-defined. A group can contain rows from multiple categories and multiple sessions.

- Budget rows still exist. The user-facing wording can move away from “line item,” but BudgetLineItem remains the persisted row entity.

- Generated items from session ops, especially F&B menu assignments, must stay linked to the originating session and source record.

- Dashboard blocks are summary/drilldown controls, not a second budgeting system. Totals derive from BudgetLineItem rows.

- Avoid duplicated truth. Session total, group total, and category total are derived from rows; only targets and group definitions are persisted.

## 3. Proposed data model

| Model / field | Purpose | Notes |
| --- | --- | --- |
| BudgetLineItem.matrixRowId or sessionId | Optional FK to MatrixRow / session. | Use the repository’s existing session naming convention. In UI/API, expose this as Session. Backfill only where an existing source link proves the session. |
| BudgetLineItem.groupId | Optional FK to BudgetGroup. | Null means ungrouped. Rows can move between groups without changing category or session. |
| BudgetLineItem.sourceModule + sourceEntityId, if not already canonical | Stable source traceability for generated rows. | Do not invent duplicate rows when F&B/session ops sync runs repeatedly. If existing typed links already solve this, reuse them. |
| BudgetGroup | Event/budget-scoped user-defined grouping. | Recommended fields: id, eventId, budgetId if Budget is the active parent, name, normalizedName, sortOrder, createdByUserId, createdAt, updatedAt. |
| BudgetCategoryTarget | Dashboard-editable target amount per category. | Recommended fields: id, eventId, budgetId if needed, categoryKey, categoryLabel, targetAmount, createdByUserId, updatedByUserId, timestamps. |
| Legacy subcategory field | Historical preservation only. | Do not use it for new session behavior. Keep hidden/legacy during migration unless removing is safe after backfill review. |

## 4. Migration and backfill strategy

1. Inspect first. Confirm actual Prisma field names in both schema copies and the current relations among Budget, BudgetVersion, BudgetLineItem, MatrixRow, SessionFnbCatalogAssignment, and EventFnbCatalogItem.

1. Add nullable fields first. Add session and group links as nullable so existing budgets do not break.

1. Create groups/targets empty. Do not auto-create group rows from legacy subcategories. Groups are new user-defined entities.

1. Backfill generated session links only when provable. For F&B-generated budget rows, derive session from the existing SessionFnbCatalogAssignment to budget-line relationship if it exists. Do not guess from text.

1. Preserve legacy subcategory text. If old subcategory data exists, keep it hidden or map it into a legacy field for audit/history. Do not show it as the new Session column.

1. Generate Prisma client and update both schema copies. Keep prisma/schema.prisma and web/prisma/schema.prisma synchronized.

## 5. Budget grid UX

- Session column. Replace Subcategory with a searchable session picker. Options come from MatrixRow sessions for the current event. Empty is allowed for event-level/manual budget rows.

- Session filter. Add a filter that supports single-session selection at minimum. Multi-select is acceptable if the existing filter pattern supports it cleanly.

- Bottom total bar. When a session filter is active, show a sticky total at the bottom of the grid: selected session name, row count, and total amount. If multiple sessions are supported, show combined total.

- Group column. Editable typeahead/free-entry column. Existing groups appear as options. New group names create BudgetGroup records and assign the row.

- Group filter. Include group filtering if the grid already supports comparable filters; otherwise at least make group block drilldowns from the dashboard filter the grid.

- Remove old line-item ops block. Do not leave the blue block under the old line-item area. Replace it with the ops-link design below.

## 6. Session ops link design

> Recommended solution: Use a narrow, pinned Ops action column with an icon-only button that appears when a row has a linked session. The button stops row-click/edit propagation and opens the session operations workspace. Keep the Session cell editable.

- Do not make the whole row navigate. Row clicks should still support inline editing.

- Do not make the session name itself the only link. The Session cell needs to open/edit the session picker.

- Use tooltip/copy such as “Open session ops.”

- Disabled/empty state: if no session is selected, show a muted dash or no button.

- Deep link should go to the full session workspace used by Matrix/Run of Show, not a one-off budget page.

## 7. Generated session budget items

- Adding a F&B catalog/menu item to a session should create or update the corresponding budget row with the same session link.

- Editing the source assignment should update the generated budget row without duplicating it.

- Removing the source assignment should follow existing delete/zero/remove behavior, but preserve data integrity and activity expectations.

- Manual budget rows may also be assigned to a session from the grid.

- Source-generated rows should expose enough source metadata for diagnostics, but the user-facing grid should stay clean.

## 8. Dashboard redesign

- Category blocks. Create large blocks for categories such as F&B and AV. Each block shows actual total, target budget, variance, percent used, and row count.

- Over-budget state. Turn the block red when actual exceeds target. Add a warning state around 90–100% if it fits the design system.

- Target editing. Category target amount should be editable directly on the dashboard and persisted in BudgetCategoryTarget.

- Group blocks. Every BudgetGroup becomes a dashboard block in a Groups section/category. Group blocks show total, row count, and optionally category/session mix.

- Drilldowns. Clicking a category block opens/filters the grid to that category. Clicking a group block opens/filters the grid to that group.

- No duplicate totals. Dashboard actual totals are derived from BudgetLineItem rows. Do not persist dashboard actual totals unless an existing reporting cache pattern already exists and is clearly non-authoritative.

## 9. Import, export, reports, and approval flows

- CSV/export should include Session and Group columns using human-readable names.

- Import should map Session by exact event session title when possible. If ambiguous or missing, surface a row-level validation error instead of guessing.

- Import can auto-create groups from the Group column if this is consistent with existing import behavior; otherwise require explicit confirmation in the import UI.

- Budget submission/approval views should show Session and Group where useful and should not rely on legacy subcategory display.

- Reports should be able to summarize by category, session, and group.

## 10. Edge cases

| Case | Expected behavior |
| --- | --- |
| Budget row has no session | Allowed. No ops button. It can still belong to a category/group. |
| Session is deleted or archived | Prefer protected delete if referenced. If deletion is already allowed, show the row as “Session unavailable” and keep the budget data. |
| Group renamed | All linked rows keep the groupId and show the new name. |
| Group deleted | Decide explicitly: either block deletion while rows use it, or unassign rows after confirmation. Do not silently delete row data. |
| Duplicate group names with different casing | Normalize and prevent duplicates in the same event/budget scope. |
| Category target missing | Show no target / add target state. Never treat missing target as zero over-budget. |
| Imported session name matches multiple sessions | Require user resolution; do not pick randomly. |

## 11. Implementation phases

| Phase | Outcome | Why this order |
| --- | --- | --- |
| 1. Schema + service foundation | Session links, BudgetGroup, BudgetCategoryTarget, derived totals, source-safe sync helpers. | The UI should not fake persisted relationships. |
| 2. Budget grid UX | Session picker/filter/totals and Group column/create flow. | Makes the primary budget workflow usable on the new model. |
| 3. Ops link + generated items | Clean session ops navigation and source-generated row behavior. | Protects existing session operations linkage while removing the blue block. |
| 4. Dashboard blocks + targets | Category cards, group cards, over-budget states, target editing. | Uses the new services/totals after row model is stable. |
| 5. Import/export/reporting/final regression | Legacy cleanup, reporting consistency, tests, docs. | Closes gaps after the core user flows are in place. |

## 12. Acceptance criteria

- A user can assign any budget row to an existing session.

- A user can filter by session and see the total for that selected session at the bottom of the grid.

- A user can create a group from the grid and assign rows to it.

- Created groups appear as dashboard blocks.

- Category dashboard blocks can store target budgets and show over-budget state.

- F&B/session-generated budget rows retain the correct session link and can open the correct session ops page.

- The old blue line-item ops block is removed.

- Imports/exports/reports do not regress and use Session/Group language instead of Subcategory where applicable.

- Tests cover schema/service behavior, grid behavior, generated item sync, dashboard blocks, and import/export/reporting changes.

## 13. Suggested branch

```bash
git switch -c feat/budget-session-groups-dashboard
```
