import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { BudgetLineItemStatus } from "@prisma/client";
import { exportBudgetLineItemsCsv, exportBudgetSummaryCsv } from "@/src/server/services/budget";
import {
  createPlannerFixtureHarness,
  hasPlannerTestDatabaseUrl,
  type PlannerFixtureHarness,
} from "@/lib/test-harness/planner-fixtures";

function createHarnessOrSkip(t: TestContext, runLabel: string): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is not configured for DB-backed journey tests.");
    return null;
  }
  return createPlannerFixtureHarness({ runLabel: `${runLabel}-${randomUUID().slice(0, 8)}` });
}

// Prompt 9: filtered export must reuse the same filter as the paged rows endpoint
// (server-authoritative), while full export still returns every row.
test("exportBudgetLineItemsCsv: filtered export includes only matching rows; full export includes all", async (t) => {
  const harness = createHarnessOrSkip(t, "budget-filtered-export");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;
    const budget = await harness.createBudget({ eventId });
    const user = roles.owner.accessUser;

    await harness.createBudgetLineItem({ budgetId: budget.id, category: "A/V", vendor: "Acme", lineItem: "Line AV", forecastCents: 1000, actualCents: 500 });
    await harness.createBudgetLineItem({ budgetId: budget.id, category: "Food", vendor: "Cafe", lineItem: "Line Food", forecastCents: 2000, actualCents: 2500 });
    await harness.createBudgetLineItem({ budgetId: budget.id, category: "Travel", vendor: "Delta", lineItem: "Line Travel", forecastCents: 500, actualCents: 300 });

    const full = await exportBudgetLineItemsCsv(eventId, user);
    assert.ok(full.csv.includes("Line AV"), "full export includes A/V row");
    assert.ok(full.csv.includes("Line Food"), "full export includes Food row");
    assert.ok(full.csv.includes("Line Travel"), "full export includes Travel row");
    assert.ok(!full.filename.includes("line-items-filtered"), "full export filename is not marked filtered");

    const filtered = await exportBudgetLineItemsCsv(eventId, user, { filters: { category: "A/V" } });
    assert.ok(filtered.csv.includes("Line AV"), "filtered export includes the matching row");
    assert.ok(!filtered.csv.includes("Line Food"), "filtered export excludes non-matching Food row");
    assert.ok(!filtered.csv.includes("Line Travel"), "filtered export excludes non-matching Travel row");
    assert.ok(filtered.filename.includes("line-items-filtered"), "filtered export filename is marked filtered");
  } finally {
    await harness.cleanup();
  }
});

test("exportBudgetSummaryCsv: emits one readable aggregate row without internal identifiers", async (t) => {
  const harness = createHarnessOrSkip(t, "budget-summary-export");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const budget = await harness.createBudget({ eventId: roles.event.id });
    const exporter = await harness.db.user.findUniqueOrThrow({
      where: { id: roles.owner.user.id },
      select: { name: true, email: true },
    });
    await harness.createBudgetVersion({ budgetId: budget.id, createdByUserId: roles.owner.user.id, versionNumber: 3 });
    const planned = await harness.createBudgetLineItem({ budgetId: budget.id, forecastCents: 1000, actualCents: 750 });
    const committed = await harness.createBudgetLineItem({ budgetId: budget.id, forecastCents: 2000, actualCents: 2500 });
    const paid = await harness.createBudgetLineItem({ budgetId: budget.id, forecastCents: 3000, actualCents: 3000 });
    await Promise.all([
      harness.db.budgetLineItem.update({ where: { id: planned.id }, data: { status: BudgetLineItemStatus.PLANNED } }),
      harness.db.budgetLineItem.update({ where: { id: committed.id }, data: { status: BudgetLineItemStatus.COMMITTED } }),
      harness.db.budgetLineItem.update({ where: { id: paid.id }, data: { status: BudgetLineItemStatus.PAID } }),
    ]);

    const summary = await exportBudgetSummaryCsv(roles.event.id, roles.owner.accessUser);
    const [headerLine, rowLine] = summary.csv.trim().split("\n");
    const headers = headerLine.split(",");
    const row = rowLine.split(",");
    const values = new Map(headers.map((header, index) => [header, row[index]]));

    assert.deepEqual(headers, [
      "Event Name",
      "Event Start Date",
      "Event End Date",
      "Budget Status",
      "Budget Version",
      "Total Forecast (USD)",
      "Total Actual (USD)",
      "Total Variance (USD)",
      "Percent Under Budget",
      "Total Line Items",
      "Planned Items",
      "Committed Items",
      "Paid Items",
      "Exported At (UTC)",
      "Exported By",
    ]);
    assert.equal(headers.some((header) => header.includes("ID") || header === "Exported By Email"), false);
    assert.equal(values.get("Event Name"), roles.event.name);
    assert.equal(values.get("Budget Status"), "Draft");
    assert.equal(values.get("Budget Version"), "v3");
    assert.equal(values.get("Total Forecast (USD)"), "60.00");
    assert.equal(values.get("Total Actual (USD)"), "62.50");
    assert.equal(values.get("Total Variance (USD)"), "2.50");
    assert.equal(values.get("Percent Under Budget"), "0.0");
    assert.equal(values.get("Total Line Items"), "3");
    assert.equal(values.get("Planned Items"), "1");
    assert.equal(values.get("Committed Items"), "1");
    assert.equal(values.get("Paid Items"), "1");
    assert.equal(values.get("Exported By"), exporter.name?.trim() || exporter.email);
    assert.equal(summary.csv.split("\n").filter(Boolean).length, 2, "summary has one aggregate row");

    const detail = await exportBudgetLineItemsCsv(roles.event.id, roles.owner.accessUser);
    assert.ok(detail.csv.includes("Budget Version ID"), "detailed export remains unchanged");
  } finally {
    await harness.cleanup();
  }
});
