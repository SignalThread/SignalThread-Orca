import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const gridSource = readFileSync("app/(shell)/budgets/_components/full-budget-grid.tsx", "utf8");
const categoryFilterSource = readFileSync("lib/budget-category-filter.ts", "utf8");
const groupColorSource = readFileSync("lib/budget-group-colors.ts", "utf8");
const serviceSource = readFileSync("src/server/services/budget.ts", "utf8");
const sessionsRoute = readFileSync("app/api/events/[eventId]/budget/sessions/route.ts", "utf8");
const groupsRoute = readFileSync("app/api/events/[eventId]/budget/groups/route.ts", "utf8");
const groupDeleteRoute = readFileSync("app/api/events/[eventId]/budget/groups/[groupId]/route.ts", "utf8");
const linksRoute = readFileSync("app/api/events/[eventId]/budget/line-items/[id]/links/route.ts", "utf8");

// --- grid columns ----------------------------------------------------------

test("grid makes Line Item the primary column and retains Session and Group", () => {
  assert.match(gridSource, /\{ id: "session", label: "Session" \}/);
  assert.match(gridSource, /\{ id: "group", label: "Group" \}/);
  assert.match(gridSource, /orderedColumns\.map\(\(column\) => renderBudgetColumnHeader\(column\)\)/);
  assert.doesNotMatch(gridSource, /<th[^>]*>Subcategory<\/th>/);
  assert.match(gridSource, />\s*Line Item\s*<\/th>/);
  assert.match(gridSource, /data-testid=\{`budget-line-item-name-\$\{item\.id\}`\}/);
  assert.doesNotMatch(gridSource, /<th[^>]*>Actions<\/th>/);
});

test("budget grid keeps Vendor to the right of money columns", () => {
  const columnsStart = gridSource.indexOf("const BUDGET_LINE_ITEM_COLUMNS");
  const columnsEnd = gridSource.indexOf("const BUDGET_COLUMN_WIDTHS", columnsStart);
  assert.ok(columnsStart >= 0 && columnsEnd > columnsStart, "default column order should exist");
  const columns = gridSource.slice(columnsStart, columnsEnd);
  const order = ["session", "group", "forecast", "actual", "variance", "vendor", "docs", "status", "approval"];
  let cursor = -1;
  for (const id of order) {
    const next = columns.indexOf(`id: "${id}"`, cursor + 1);
    assert.ok(next > cursor, `${id} should appear after the previous default column`);
    cursor = next;
  }
});

test("budget grid uses the budget-specific category taxonomy", () => {
  assert.match(gridSource, /BUDGET_CATEGORY_OPTIONS/);
  assert.match(gridSource, /budgetCategoryPillClasses/);
  assert.doesNotMatch(gridSource, /EVENT_CATEGORY_OPTIONS/);
  assert.doesNotMatch(gridSource, /getPlanningTone\(category/);
  for (const category of [
    "Venue",
    "Housing",
    "F&B",
    "AV & Production",
    "Speakers",
    "Registration & Technology",
    "Marketing",
    "Staffing",
    "Transportation",
    "Exhibits & Sponsorship",
    "Décor & Branding",
    "Contingency",
  ]) {
    assert.ok(categoryFilterSource.includes(`"${category}"`), `${category} should be in the Budget category list`);
  }
  assert.match(gridSource, /getBudgetCategoryDisplay\(item\.category\)/);
});

test("budget category column is wide enough for canonical long labels", () => {
  assert.match(gridSource, /<table className="w-full min-w-\[1546px\] table-fixed border-collapse">/);
  assert.match(gridSource, /<col style=\{\{ width: 180 \}\} \/>/);
  assert.match(gridSource, /<col style=\{\{ width: 200 \}\} \/>/);
});

test("budget grid does not patch aliased saved categories unless they actually change", () => {
  assert.match(gridSource, /if \(!budgetCategoriesMatch\(category, item\.category\)\) patch\.category = category/);
});

test("Session cell is an editable picker bound to matrixRowId, not legacy subcategory text", () => {
  assert.match(gridSource, /aria-label=\{`Session for \$\{item\.lineItem\}`\}/);
  assert.match(gridSource, /value=\{item\.matrixRowId \?\? ""\}/);
  // The picker offers an explicit unassigned/clear option.
  assert.match(gridSource, /<option value="">Event-wide \/ Unassigned<\/option>/);
});

test("Group cell is a colored Notion-style selector with create, select, and clear actions", () => {
  assert.match(gridSource, /aria-label=\{`Group for \$\{item\.lineItem\}`\}/);
  assert.match(gridSource, /const BudgetGroupSelectCell = memo\(function BudgetGroupSelectCell/);
  assert.match(gridSource, /createPortal\(/);
  assert.match(gridSource, /Search or create group/);
  assert.match(gridSource, /Clear group/);
  assert.match(gridSource, /Trash2/);
  assert.match(gridSource, /aria-label=\{`Delete group \$\{group\.name\}`\}/);
  assert.match(gridSource, /event\.stopPropagation\(\)/);
  assert.match(gridSource, /Create &quot;\{query\.replace/);
  assert.match(gridSource, /budgetGroupTagClasses\(item\.groupId, groupName, groupColor\)/);
  assert.doesNotMatch(gridSource, /list="budget-group-options"/);
  assert.doesNotMatch(gridSource, /<datalist id="budget-group-options">/);
  assert.match(gridSource, /normalizedGroupName\(option\.name\) === normalizedName/);
});

test("budget group colors are persisted and shared by grid tags, filters, and dashboard group tiles", () => {
  assert.match(gridSource, /import \{ budgetGroupTagClasses, normalizedBudgetGroupName \} from "@\/lib\/budget-group-colors"/);
  assert.match(gridSource, /function BudgetGroupFilterSelect/);
  assert.match(groupColorSource, /export const BUDGET_GROUP_COLOR_TONES/);
  assert.match(groupColorSource, /export function nextBudgetGroupColorKey/);
  assert.match(groupColorSource, /export function budgetGroupColorTone/);
  assert.match(groupColorSource, /export function budgetGroupTagClasses/);
});

test("dirty row save and discard actions live in the top action bar", () => {
  const actionBarStart = gridSource.indexOf('<div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">');
  const toolsStart = gridSource.indexOf('<div className="relative" ref={toolsMenuRef}>', actionBarStart);
  assert.ok(actionBarStart >= 0 && toolsStart > actionBarStart, "line item action bar should be present");
  const actionBarSource = gridSource.slice(actionBarStart, toolsStart);

  assert.doesNotMatch(actionBarSource, />\s*Done\s*</);
  assert.doesNotMatch(actionBarSource, />\s*Edit Budget\s*</);
  assert.match(actionBarSource, /hasUnsavedBudgetChanges \? \(/);
  assert.match(actionBarSource, /Save changes/);
  assert.match(actionBarSource, /Discard changes/);
  assert.match(actionBarSource, /handleSaveAllLineItemChanges/);
  assert.match(actionBarSource, /handleDiscardAllLineItemChanges/);
  assert.match(actionBarSource, /Add Line Item/);
  assert.match(actionBarSource, /View approvals/);
  assert.ok(actionBarSource.indexOf("Save changes") < actionBarSource.indexOf("Add Line Item"), "dirty controls should be in the dirty branch before clean controls");
  assert.match(gridSource, /Tools/);
  assert.match(gridSource, /row\{dirtyLineItemIds\.size === 1 \? "" : "s"\} with unsaved changes\./);
  assert.doesNotMatch(gridSource, /Click Edit Budget/);
  assert.doesNotMatch(gridSource, /Enter Edit Budget/);
  assert.doesNotMatch(gridSource, />\s*Done\s*</);
  assert.doesNotMatch(gridSource, />\s*Edit Budget\s*</);
  assert.doesNotMatch(gridSource, /onClick=\{\(\) => void handleSaveLineItemRow\(item\)\}/);
  assert.doesNotMatch(gridSource, /onClick=\{\(\) => handleCancelLineItemRow\(item\)\}/);
});

test("budget line item action bar returns to clean state after save or discard", () => {
  assert.match(gridSource, /handleSaveAllLineItemChanges/);
  assert.match(gridSource, /handleDiscardAllLineItemChanges/);
  assert.match(gridSource, /for \(const lineItemId of dirtyIds\)[\s\S]*handleSaveLineItemRow\(item\)/);
  assert.match(gridSource, /clearLineItemRowState\(item\.id\)/);
  assert.match(gridSource, /for \(const lineItemId of dirtyIds\)[\s\S]*handleCancelLineItemRow\(item\)/);
  assert.match(gridSource, /setIsEditMode\(false\);[\s\S]*title: "Budget changes discarded"/);
});

test("new budget line items render a compact new-row indicator without a tall callout", () => {
  assert.match(gridSource, /isNew=\{isTemporaryLineItemId\(item\.id\)\}/);
  assert.match(gridSource, /data-line-item-state=\{isNew \? "new-unsaved" : isDirty \? "edited-unsaved" : undefined\}/);
  assert.match(gridSource, /border-l-4 border-l-amber-500 bg-amber-100\/70/);
  assert.match(gridSource, /shadow-\[inset_0_0_0_1px_rgba\(217,119,6,0\.35\)\]/);
  assert.match(gridSource, /<div className="flex h-8 min-w-0 items-center gap-1\.5">/);
  assert.match(gridSource, /aria-label="New unsaved budget line item"/);
  assert.match(gridSource, />\s*New\s*</);
  assert.match(gridSource, /className="inline-flex h-5 shrink-0 items-center rounded-full/);
  assert.match(gridSource, /className=\{`box-border h-8 w-full min-w-0 flex-1 rounded-full/);
  assert.doesNotMatch(gridSource, /New row — save changes to create it/);
  assert.doesNotMatch(gridSource, /mb-1\.5 flex max-w-full items-start/);
});

test("edited existing budget rows stay visually distinct from brand-new unsaved rows", () => {
  assert.match(gridSource, /isNew[\s\S]*border-l-amber-500[\s\S]*: isDirty[\s\S]*border-l-blue-400/);
  assert.match(gridSource, /data-line-item-state=\{isNew \? "new-unsaved" : isDirty \? "edited-unsaved" : undefined\}/);
  const editedStateIndex = gridSource.indexOf('"edited-unsaved"');
  assert.ok(editedStateIndex >= 0, "edited rows should have their own state");
  assert.match(gridSource, />\s*New\s*</, "new rows should show the compact New pill");
});

test("new-row visual state is removed after save and discard removes the temporary row", () => {
  assert.match(gridSource, /if \(isTemporary\) \{[\s\S]*setNewlyAddedRowId\(\(current\) => \(current === item\.id \? null : current\)\)/);
  assert.match(gridSource, /method: isTemporary \? "POST" : "PATCH"/);
  assert.match(gridSource, /delete next\[item\.id\];[\s\S]*next\[savedItem\.id\] = defaultLineItemDraft\(savedItem\)/);
  assert.match(gridSource, /if \(isTemporaryLineItemId\(item\.id\)\) \{[\s\S]*lineItems: current\.lineItems\.filter\(\(lineItem\) => lineItem\.id !== item\.id\)/);
  assert.match(gridSource, /setNewlyAddedRowId\(\(current\) => \(current === item\.id \? null : current\)\)/);
});

test("not-submitted approval chips open a row-specific submit modal", () => {
  assert.match(gridSource, /const openApprovalDrawerForLineItem = useCallback\(\(lineItemId: string\) =>/);
  assert.match(gridSource, /const rowApprovalState = item \? resolveLineItemApprovalState\(item, submissionThreads\.get\(lineItemId\)\) : "PENDING"/);
  assert.match(gridSource, /setSelectedLineItemId\(lineItemId\);[\s\S]*if \(rowApprovalState === "PENDING"\) \{[\s\S]*setIsApprovalDrawerOpen\(false\)[\s\S]*setIsSubmitModalOpen\(true\)/);
  assert.match(gridSource, /<h3 className="text-\[18px\] font-semibold text-slate-900">Submit for approval<\/h3>/);
  assert.match(gridSource, /Send this budget line item to reviewers\./);
  assert.match(gridSource, /selectedApprovalLineItem\.lineItem/);
  assert.match(gridSource, /selectedApprovalLineItem\.category/);
  assert.match(gridSource, /selectedApprovalLineItem\.vendor/);
  assert.match(gridSource, /formatMoney\(selectedApprovalLineItem\.forecastCents\)/);
  const submitModalStart = gridSource.indexOf("{isSubmitModalOpen && (");
  const submitModal = gridSource.slice(submitModalStart);
  assert.doesNotMatch(submitModal, /Active approvals \(\{activeApprovalCount\}\)/);
});

test("submitting from the row-level approval modal posts the selected line item id", () => {
  assert.match(gridSource, /fetch\(`\/api\/events\/\$\{selectedEventId\}\/budget\/submissions`, \{/);
  assert.match(gridSource, /budgetLineItemId: selectedLineItemId/);
  assert.match(gridSource, /recipientUserIds: selectedRecipientIds/);
  assert.match(gridSource, /message: submissionMessage\.trim\(\) \|\| null/);
  assert.match(gridSource, />\s*Submit for approval\s*</);
});

test("submitted row approval chips open only that row approval detail", () => {
  assert.match(gridSource, /setApprovalDrawerMode\("lineItem"\)/);
  assert.match(gridSource, /setSelectedThreadLineItemId\(submissionThreads\.has\(lineItemId\) \? lineItemId : null\)/);
  assert.match(gridSource, /\{isLineItemApprovalDrawer && selectedSubmission \? \(/);
  assert.match(gridSource, /\{!isLineItemApprovalDrawer \? \(/);
  assert.match(gridSource, /selectedThreadSubmissions\.map\(\(submission\) =>/);
});

test("global approval browser uses the same active count as its default list", () => {
  assert.match(gridSource, /function isActiveApprovalOption\(option: SubmissionThreadOption\): boolean \{[\s\S]*option\.latestSubmission\.status === "SUBMITTED"/);
  assert.match(gridSource, /const activeApprovalOptions = useMemo\([\s\S]*submissionOptions\.filter\(isActiveApprovalOption\)/);
  assert.match(gridSource, /const approvalHistoryOptions = useMemo\([\s\S]*submissionOptions\.filter\(\(option\) => !isActiveApprovalOption\(option\)\)/);
  assert.match(gridSource, /const activeApprovalCount = activeApprovalOptions\.length/);
  assert.match(gridSource, /`View approvals \(\$\{activeApprovalCount\}\)`/);
  assert.match(gridSource, /Active approvals \(\{activeApprovalCount\}\)/);
  assert.match(gridSource, /activeApprovalOptions\.map\(\(option\) =>/);
  assert.match(gridSource, /History \(\{approvalHistoryOptions\.length\}\)/);
  assert.match(gridSource, /approvalHistoryOptions\.map\(\(option\) =>/);
});

test("global approval browser is list-first and lifecycle appears only for a selected row submission", () => {
  assert.match(gridSource, /\{isLineItemApprovalDrawer \? "Approval detail" : "Budget Approvals"\}/);
  assert.match(gridSource, /\{isLineItemApprovalDrawer && selectedSubmission \? \(/);
  assert.match(gridSource, /<p className="text-\[12px\] font-semibold uppercase tracking-wide text-slate-500">\s*Active approvals/);
  assert.doesNotMatch(gridSource, /Approval Workflow/);
});

// --- filters + footer ------------------------------------------------------

test("toolbar exposes Session and Group filters and clears them with the rest", () => {
  assert.match(gridSource, /aria-label="Filter by session"/);
  assert.match(gridSource, /aria-label="Filter by group"/);
  assert.match(gridSource, /setLineItemsFilterSession\(""\)/);
  assert.match(gridSource, /setLineItemsFilterGroup\(""\)/);
});

test("a session filter renders a sticky total footer with name, count, and amounts", () => {
  assert.match(gridSource, /\{sessionFooterTotal \? \(/);
  assert.match(gridSource, /<tfoot>/);
  assert.match(gridSource, /sticky bottom-0/);
  assert.match(gridSource, /sessionFooterTotal\.rowCount/);
  assert.match(gridSource, /formatMoney\(sessionFooterTotal\.actualCents\)/);
});

test("footer totals are server-backed (filter-scoped, not just the current page)", () => {
  // Prompt 8: category/session footers read the server's filteredFooterTotals,
  // scoped over the whole filtered set — never a reduce over the loaded page.
  assert.match(gridSource, /rowCount: pagedFilteredCount/);
  assert.match(gridSource, /forecastCents: pagedFooterTotals\.forecastCents/);
  assert.match(gridSource, /actualCents: pagedFooterTotals\.actualCents/);
  assert.match(gridSource, /varianceCents: pagedFooterTotals\.varianceCents/);
  assert.match(gridSource, /categoryFooterTotal\.category\} total/);
  assert.match(gridSource, /categoryFooterTotal\.varianceCents <= 0 \? "text-emerald-700" : "text-rose-700"/);
  assert.match(gridSource, /orderedColumns\.map\(\(column\) => \{/);
  assert.match(gridSource, /case "forecast":/);
  assert.match(gridSource, /case "actual":/);
  assert.match(gridSource, /case "variance":/);
  assert.match(gridSource, /colSpan=\{3 \+ orderedColumns\.length\}/);
});

test("session/group filters are URL-drilldownable for dashboard blocks", () => {
  assert.match(gridSource, /params\.get\("session"\)/);
  assert.match(gridSource, /params\.get\("groupId"\) \?\? params\.get\("group"\)/);
});

// --- persistence wiring ----------------------------------------------------

test("session/group assignment persists through the canonical /links route", () => {
  assert.match(gridSource, /budget\/line-items\/\$\{item\.id\}\/links/);
  assert.match(gridSource, /handleAssignSession/);
  assert.match(gridSource, /handleAssignGroup/);
  // Creating a new group goes through the groups endpoint (create-or-find).
  assert.match(gridSource, /budget\/groups`/);
  assert.ok(gridSource.includes('method: "POST"'));
});

test("all committed grid mutations refresh active group options and dashboard group cards", () => {
  assert.match(gridSource, /const reconcileBudgetAfterMutation = useCallback\(\(\) => \{/);
  assert.match(gridSource, /void reloadSessionGroupOptions\(eventId\);/);
  assert.match(gridSource, /new CustomEvent\("budget-groups:changed", \{ detail: \{ eventId \} \}\)/);
});

test("budget group deletion clears selected filters and row assignments without a refresh", () => {
  assert.match(gridSource, /const handleDeleteGroup = useCallback\(async \(group: BudgetGroupOption\) =>/);
  assert.match(gridSource, /method: "DELETE"/);
  assert.match(gridSource, /Delete group '\$\{group\.name\}'\? Existing budget rows will stay, but this group will be removed from them\./);
  assert.match(gridSource, /setGroupOptions\(\(current\) => current\.filter\(\(option\) => option\.id !== group\.id\)\)/);
  assert.match(gridSource, /setLineItemsFilterGroup\(""\)/);
  assert.match(gridSource, /row\.groupId === group\.id/);
  assert.match(gridSource, /groupId: null, groupName: null, groupColor: null/);
  assert.match(gridSource, /reconcileBudgetAfterMutation\(\);/);
});

// --- read contract ---------------------------------------------------------

test("budget snapshot serializes human-readable session/group labels", () => {
  assert.match(serviceSource, /sessionTitle: matrixRow\?\.sessionName\?\.trim\(\) \|\| null/);
  assert.match(serviceSource, /groupName: group\?\.name \?\? null/);
  assert.match(serviceSource, /groupColor: group\?\.color \?\? null/);
  assert.match(serviceSource, /matrixRow: \{ select: \{ sessionName: true \} \}/);
});

// --- routes use canonical helpers ------------------------------------------

test("API routes delegate to the canonical session/group service helpers", () => {
  assert.match(sessionsRoute, /listBudgetSessionOptions/);
  assert.match(groupsRoute, /createOrFindBudgetGroup/);
  assert.match(groupsRoute, /listBudgetGroups/);
  assert.match(groupDeleteRoute, /deleteBudgetGroup/);
  assert.match(groupDeleteRoute, /requireBudgetRouteAccess\(request, eventId, "write"\)/);
  assert.match(linksRoute, /assignSessionToLineItem/);
  assert.match(linksRoute, /assignGroupToLineItem/);
});
