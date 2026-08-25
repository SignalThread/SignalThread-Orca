import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { eventBudgetGridHref } from "@/lib/event-command-center-links";
import { operationalBudgetLinesForSection } from "@/app/(shell)/matrix-2/_components/operational-budget-requirement-rows";

const gridSource = readFileSync("app/(shell)/budgets/_components/full-budget-grid.tsx", "utf8");
const dashboardSource = readFileSync("app/(shell)/events/[eventId]/budget/_components/budget-dashboard.tsx", "utf8");
const blocksSource = readFileSync("app/(shell)/events/[eventId]/budget/_components/budget-blocks-section.tsx", "utf8");
const workspaceSource = readFileSync("app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx", "utf8");
const serviceSource = readFileSync("src/server/services/budget.ts", "utf8");

test("event command-center category links open the exact filtered full grid", () => {
  assert.equal(
    eventBudgetGridHref("event/one", { category: "F&B" }),
    "/events/event%2Fone/budget?view=grid&category=F%26B",
  );
});

test("budget surfaces expose honest retry and stale-request guards", () => {
  assert.match(gridSource, /budgetRequestRef/);
  assert.match(gridSource, /sessionGroupRequestRef/);
  assert.match(gridSource, /Retry session options/);
  assert.match(dashboardSource, /requestRef/);
  assert.match(dashboardSource, />\s*Retry\s*</);
  assert.match(blocksSource, /requestRef/);
  assert.match(blocksSource, />\s*Retry\s*</);
  assert.match(workspaceSource, /budgetLinesError/);
  assert.match(workspaceSource, /Retry budget lines/);
});

test("operational requirement suggestions never offer a line canonically linked to another session", () => {
  const common = {
    lineItem: "Lunch service",
    category: "F&B",
    subcategory: "Catering",
    forecastCents: 100,
    actualCents: 0,
    status: "PLANNED",
    sortOrder: 1,
    linkedSessionRequirement: null,
  };
  const rows = operationalBudgetLinesForSection("FNB", [
    { ...common, id: "unlinked", matrixRowId: null },
    { ...common, id: "same", matrixRowId: "session-a" },
    { ...common, id: "other", matrixRowId: "session-b" },
  ], "session-a");
  assert.deepEqual(rows.map((row) => row.id), ["unlinked", "same"]);
});

test("grid session saves suppress immediate duplicate requests", () => {
  assert.match(gridSource, /assigningSessionRef\.current\.has\(requestKey\)/);
  assert.match(gridSource, /assigningSessionRef\.current\.delete\(requestKey\)/);
});

test("budget persistence guards DB precision and concurrent approval transitions", () => {
  assert.match(serviceSource, /parsed > 2_147_483_647/);
  const lineLock = serviceSource.slice(serviceSource.indexOf("async function assertLineItemEditable"), serviceSource.indexOf("async function resolveActorUserId"));
  assert.doesNotMatch(lineLock, /BudgetSubmissionStatus\.REJECTED/);
  assert.match(serviceSource, /pg_advisory_xact_lock/);
  assert.match(serviceSource, /where: \{ id: submissionId, status: BudgetSubmissionStatus\.SUBMITTED \}/);
  assert.match(serviceSource, /approval: status === BudgetSubmissionStatus\.APPROVED/);
});
