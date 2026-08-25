import assert from "node:assert/strict";
import test from "node:test";
import { buildLineItemDiff, formatCents, budgetActor } from "@/src/server/services/budget-activity-audit";
import type { BudgetLineItem } from "@prisma/client";

function lineItem(overrides: Partial<BudgetLineItem>): BudgetLineItem {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    budgetId: "00000000-0000-4000-8000-000000000001",
    category: "Venue",
    subcategory: "General",
    lineItem: "Main hall",
    vendor: "Acme",
    forecastCents: 100000,
    actualCents: 0,
    status: "PLANNED",
    approval: "PENDING",
    sortOrder: 1,
    matrixRowId: null,
    groupId: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  } as unknown as BudgetLineItem;
}

test("formatCents preserves financial precision", () => {
  assert.equal(formatCents(0), "$0.00");
  assert.equal(formatCents(100000), "$1,000.00");
  assert.equal(formatCents(123456), "$1,234.56");
  assert.equal(formatCents(5), "$0.05");
  assert.equal(formatCents(null), "—");
});

test("budgetActor maps to USER when present, SYSTEM otherwise", () => {
  assert.deepEqual(budgetActor({ id: "u1" }), { kind: "USER", userId: "u1" });
  assert.deepEqual(budgetActor(null), { kind: "SYSTEM", label: "System" });
  assert.deepEqual(budgetActor(undefined), { kind: "SYSTEM", label: "System" });
});

test("buildLineItemDiff only includes changed fields with readable money", () => {
  const before = lineItem({ forecastCents: 100000, status: "PLANNED", vendor: "Acme" });
  const diff = buildLineItemDiff(before, { forecastCents: 150000, status: "COMMITTED", vendor: "Acme" });
  // vendor unchanged -> omitted; forecast + status changed.
  assert.equal(diff.length, 2);
  const forecast = diff.find((d) => d.field === "forecastCents");
  assert.deepEqual(forecast, { field: "forecastCents", label: "Forecast", from: "$1,000.00", to: "$1,500.00" });
  const status = diff.find((d) => d.field === "status");
  assert.deepEqual(status, { field: "status", label: "Status", from: "PLANNED", to: "COMMITTED" });
});

test("buildLineItemDiff returns empty when nothing meaningful changed", () => {
  const before = lineItem({ lineItem: "Main hall" });
  assert.deepEqual(buildLineItemDiff(before, { lineItem: "Main hall" }), []);
});

test("buildLineItemDiff never serializes a full record (only provided fields)", () => {
  const before = lineItem({ category: "Venue", vendor: "Acme" });
  const diff = buildLineItemDiff(before, { category: "Catering" });
  assert.equal(diff.length, 1);
  assert.equal(diff[0].field, "category");
});
