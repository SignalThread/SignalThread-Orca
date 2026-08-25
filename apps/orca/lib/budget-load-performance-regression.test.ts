import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const fullBudgetGridSource = readFileSync("app/(shell)/budgets/_components/full-budget-grid.tsx", "utf8");
const budgetRouteSource = readFileSync("app/api/events/[eventId]/budget/route.ts", "utf8");
const budgetServiceSource = readFileSync("src/server/services/budget.ts", "utf8");

test("full budget grid initial load requests a lightweight snapshot", () => {
  assert.equal(fullBudgetGridSource.includes("includeSubmissionDetails: includeSubmissionDetails ? \"1\" : \"0\""), true);
  assert.equal(fullBudgetGridSource.includes("const includeSubmissionDetails = options?.includeSubmissionDetails ?? false;"), true);
  assert.equal(fullBudgetGridSource.includes("/session-requirements/template"), false);
});

test("budget approvals load lazily while standalone Budget Files UI stays removed", () => {
  assert.equal(fullBudgetGridSource.includes("loadApprovalData"), true);
  assert.equal(fullBudgetGridSource.includes("fetch(`/api/events/${eventId}/budget/submissions`, { cache: \"no-store\" })"), true);
  assert.equal(fullBudgetGridSource.includes("openApprovalDrawer"), true);
  assert.equal(fullBudgetGridSource.includes("Budget Files"), false);
  assert.equal(fullBudgetGridSource.includes("/budget/files"), false);
  assert.equal(fullBudgetGridSource.includes('query: {\n                        budgetItemId: item.id'), true, "line-item Docs link remains scoped to its row");
});

test("Budget line-item filters are visible whenever the canonical filter state is active", () => {
  assert.equal(fullBudgetGridSource.includes("const shouldShowLineItemFilters = lineItemsFiltersOpen || hasActiveLineItemFilters"), true);
  assert.equal(fullBudgetGridSource.includes("aria-expanded={shouldShowLineItemFilters}"), true);
  assert.equal(fullBudgetGridSource.includes("{shouldShowLineItemFilters ? ("), true);
  assert.equal(fullBudgetGridSource.includes("setLineItemsFiltersOpen(false);"), true, "clearing filters closes the panel");
});

test("Budget line-item toolbar is compact and keeps its actions together", () => {
  assert.equal(fullBudgetGridSource.includes("Edit cells like a spreadsheet, then save or discard changes from the action bar."), false);
  assert.equal(fullBudgetGridSource.includes("min-w-[180px] flex-1 max-w-[420px]"), true, "search yields width before actions");
  assert.equal(fullBudgetGridSource.includes("flex flex-wrap items-center gap-2 max-md:w-full"), true, "actions wrap as one group only at narrow widths");
});

test("budget snapshot route exposes include flags for heavy sections", () => {
  assert.equal(budgetRouteSource.includes("includeSubmissions"), true);
  assert.equal(budgetRouteSource.includes("includeSubmissionDetails"), true);
  assert.equal(budgetRouteSource.includes("includeBudgetFiles"), true);
  assert.equal(budgetRouteSource.includes("queryFlag"), true);
});

test("budget GET route does not eagerly load activity on initial render", () => {
  // Activity/history is not visible in the first grid render, so the main budget
  // GET must request the snapshot without it (it loads lazily elsewhere).
  assert.equal(budgetRouteSource.includes("includeActivity: false"), true);
});

test("budget service conditionally reads heavy approval details and budget files", () => {
  assert.equal(budgetServiceSource.includes("includeSubmissionDetails?: boolean"), true);
  assert.equal(budgetServiceSource.includes("includeBudgetFiles?: boolean"), true);
  assert.equal(budgetServiceSource.includes("submissionStatus.read"), true);
  assert.equal(budgetServiceSource.includes("submissions.read"), true);
  assert.equal(budgetServiceSource.includes("budgetFiles.read"), true);
  assert.equal(budgetServiceSource.includes("includeBudgetFiles"), true);
});

test("budget dashboard avoids full submission snapshots and file history on initial load", () => {
  assert.equal(budgetServiceSource.includes("includeSubmissionDetails: false"), true);
  assert.equal(budgetServiceSource.includes("includeBudgetFiles: false"), true);
});
