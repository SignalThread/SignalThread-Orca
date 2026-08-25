import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  BudgetServiceError,
} from "../src/server/services/budget";
import {
  buildCategoryTotals,
  buildGroupTotals,
  normalizeGroupName,
  sumDerivedTotals,
} from "../src/server/services/budget-sessions-groups";

const serviceSource = readFileSync("src/server/services/budget-sessions-groups.ts", "utf8");

// --- normalizeGroupName ----------------------------------------------------

test("normalizeGroupName trims, collapses whitespace, and lowercases the key", () => {
  const result = normalizeGroupName("  Main   Stage  ");
  assert.equal(result.name, "Main Stage");
  assert.equal(result.normalizedName, "main stage");
});

test("normalizeGroupName collides case/spacing variants for duplicate prevention", () => {
  assert.equal(normalizeGroupName("F&B").normalizedName, normalizeGroupName(" f&b ").normalizedName);
});

test("normalizeGroupName rejects empty or non-string names", () => {
  assert.throws(() => normalizeGroupName("   "), (err: unknown) => err instanceof BudgetServiceError && err.status === 400);
  assert.throws(() => normalizeGroupName(null), (err: unknown) => err instanceof BudgetServiceError && err.status === 400);
});

// --- sumDerivedTotals ------------------------------------------------------

test("sumDerivedTotals sums forecast/actual cents and counts rows", () => {
  const totals = sumDerivedTotals([
    { forecastCents: 1000, actualCents: 900 },
    { forecastCents: 500, actualCents: 600 },
  ]);
  assert.deepEqual(totals, { forecastCents: 1500, actualCents: 1500, rowCount: 2 });
});

test("sumDerivedTotals is zero for an empty slice", () => {
  assert.deepEqual(sumDerivedTotals([]), { forecastCents: 0, actualCents: 0, rowCount: 0 });
});

// --- buildGroupTotals ------------------------------------------------------

test("buildGroupTotals maps DB-aggregated per-group totals in sort order", () => {
  const groups = [
    { id: "g2", name: "Beta", color: "emerald", sortOrder: 2 },
    { id: "g1", name: "Alpha", color: "blue", sortOrder: 1 },
    { id: "g3", name: "Gamma", color: "rose", sortOrder: 3 },
  ];
  const totalsByGroupId = new Map([
    ["g1", { forecastCents: 300, actualCents: 350, rowCount: 2 }],
    ["g2", { forecastCents: 50, actualCents: 50, rowCount: 1 }],
  ]);
  const result = buildGroupTotals(groups, totalsByGroupId);
  assert.deepEqual(
    result.map((g) => g.groupId),
    ["g1", "g2"],
  );
  assert.deepEqual(result[0], { groupId: "g1", groupName: "Alpha", groupColor: "blue", forecastCents: 300, actualCents: 350, rowCount: 2 });
  assert.deepEqual(result[1], { groupId: "g2", groupName: "Beta", groupColor: "emerald", forecastCents: 50, actualCents: 50, rowCount: 1 });
  // Persisted groups with no active rows do not appear in the Command Center.
  assert.equal(result.some((group) => group.groupId === "g3"), false);
});

// --- buildCategoryTotals ---------------------------------------------------

test("buildCategoryTotals flags over budget when Actual reaches Forecast", () => {
  const categoryTotals = [
    { category: "F&B", forecastCents: 1000, actualCents: 1200, rowCount: 1 },
    { category: "AV", forecastCents: 800, actualCents: 500, rowCount: 1 },
  ];
  const targets = [
    { categoryKey: "F&B", categoryLabel: "Food & Beverage", targetAmountCents: 1000 },
    { categoryKey: "AV", categoryLabel: "Audio Visual", targetAmountCents: 1000 },
  ];
  const result = buildCategoryTotals(categoryTotals);
  const fnb = result.find((c) => c.categoryKey === "F&B");
  const av = result.find((c) => c.categoryKey === "AV & Production");
  assert.ok(fnb && av);
  assert.equal(fnb.budgetHealth, "OVER_BUDGET");
  assert.equal(fnb.remainingCents, -200);
  assert.equal(fnb.utilizationPercent, 120);
  assert.equal(av.budgetHealth, "UNDER_BUDGET");
  assert.equal(av.remainingCents, 300);
});

test("buildCategoryTotals collapses raw categories that share a display key", () => {
  // Two raw categories that normalize to the same display key must merge their
  // forecast/actual/rowCount (the DB groupBy is per raw category).
  const result = buildCategoryTotals(
    [
      { category: "F&B", forecastCents: 1000, actualCents: 600, rowCount: 2 },
      { category: "f&b", forecastCents: 500, actualCents: 400, rowCount: 3 },
    ],
  );
  const fnb = result.find((c) => c.categoryKey === "F&B");
  assert.ok(fnb);
  assert.equal(fnb.forecastCents, 1500, "forecast merged");
  assert.equal(fnb.actualCents, 1000, "actual merged");
  assert.equal(fnb.rowCount, 5, "row count merged");
});

test("buildCategoryTotals derives Remaining and Utilization from Forecast and Actual", () => {
  const categoryTotals = [{ category: "Decor", forecastCents: 50000, actualCents: 100, rowCount: 1 }];
  const result = buildCategoryTotals(categoryTotals);
  const decor = result.find((c) => c.categoryKey === "Décor & Branding");
  assert.ok(decor);
  assert.equal(decor.remainingCents, 49900);
  assert.equal(decor.utilizationPercent, 0.2);
  assert.equal(decor.budgetHealth, "UNDER_BUDGET");
});

test("category totals ignore status and use aggregate Actual", () => {
  const result = buildCategoryTotals([
    { category: "Venue", forecastCents: 10_000, actualCents: 500, rowCount: 1 },
    { category: "Venue", forecastCents: 0, actualCents: 9_000, rowCount: 1 },
  ]);
  const venue = result.find((category) => category.categoryKey === "Venue");
  assert.ok(venue);
  assert.deepEqual(
    {
      forecastCents: venue.forecastCents,
      actualCents: venue.actualCents,
      remainingCents: venue.remainingCents,
      utilizationPercent: venue.utilizationPercent,
      budgetHealth: venue.budgetHealth,
    },
    {
      forecastCents: 10_000,
      actualCents: 9_500,
      remainingCents: 500,
      utilizationPercent: 95,
      budgetHealth: "APPROACHING_BUDGET",
    },
  );
});

test("buildCategoryTotals returns no financial card for categories with no line items", () => {
  assert.deepEqual(buildCategoryTotals([]), []);
});

// --- guardrails on canonical behavior --------------------------------------

test("session/group writes enforce server-side event access", () => {
  // Both mutating session/group helpers must assert write access before touching rows.
  const writeHelpers = ["assignSessionToLineItem", "assignGroupToLineItem", "createOrFindBudgetGroup", "deleteBudgetGroup", "upsertBudgetCategoryTarget"];
  for (const helper of writeHelpers) {
    const fnStart = serviceSource.indexOf(`export async function ${helper}`);
    assert.ok(fnStart >= 0, `${helper} should be exported`);
    const fnBody = serviceSource.slice(fnStart, fnStart + 1200);
    assert.match(fnBody, /assertBudgetAccessForEvent\(eventId, user, "write"\)/, `${helper} must assert write access`);
  }
});

test("assignSessionToLineItem validates the session belongs to the same event", () => {
  const fnStart = serviceSource.indexOf("export async function assignSessionToLineItem");
  const fnBody = serviceSource.slice(fnStart, fnStart + 1200);
  assert.match(fnBody, /matrixRow\.findFirst/);
  assert.match(fnBody, /eventId/);
  assert.match(fnBody, /Session is not part of this event/);
});

test("group creation relies on the unique normalized-name constraint (P2002 retry)", () => {
  const fnStart = serviceSource.indexOf("export async function createOrFindBudgetGroup");
  const fnBody = serviceSource.slice(fnStart, fnStart + 1400);
  assert.match(fnBody, /budgetId_normalizedName/);
  assert.match(fnBody, /P2002/);
});

test("group colors are assigned from the shared palette and backfilled for older groups", () => {
  assert.match(serviceSource, /ensureBudgetGroupColors/);
  assert.match(serviceSource, /nextBudgetGroupColorKey\(existingGroups\.map\(\(group\) => group\.color\)\)/);
  assert.match(serviceSource, /budgetGroupFallbackColorKey\(group\.id, group\.name\)/);
  assert.match(serviceSource, /data: \{ color: update\.color \}/);
});

test("deleteBudgetGroup unassigns budget rows before permanently deleting the group", () => {
  const fnStart = serviceSource.indexOf("export async function deleteBudgetGroup");
  assert.ok(fnStart >= 0, "deleteBudgetGroup should be exported");
  const fnBody = serviceSource.slice(fnStart, fnStart + 1800);
  assert.match(fnBody, /budgetGroup\.findFirst/);
  assert.match(fnBody, /where: \{ id: groupId, budgetId: budget\.id \}/);
  assert.match(fnBody, /budgetLineItem\.updateMany/);
  assert.match(fnBody, /data: \{ groupId: null \}/);
  assert.match(fnBody, /budgetGroup\.delete/);
});

// --- migration safety / backfill -------------------------------------------

const migrationSql = readFileSync(
  "test-fixtures/legacy-orca-migrations/20260622120000_add_budget_sessions_groups_targets/migration.sql",
  "utf8",
);

test("migration adds session/group links as nullable columns (existing budgets stay valid)", () => {
  assert.match(migrationSql, /ADD COLUMN "matrixRowId" UUID,/);
  assert.match(migrationSql, /ADD COLUMN "groupId" UUID;/);
  // Nullable: no NOT NULL on the new BudgetLineItem columns.
  assert.doesNotMatch(migrationSql, /ADD COLUMN "matrixRowId" UUID NOT NULL/);
  assert.doesNotMatch(migrationSql, /ADD COLUMN "groupId" UUID NOT NULL/);
});

test("migration backfills session links only from the provable F&B assignment relationship", () => {
  // Backfill joins through SessionFnbCatalogAssignment.budgetLineItemId -> sessionId.
  assert.match(migrationSql, /FROM "SessionFnbCatalogAssignment" AS sfca/);
  assert.match(migrationSql, /sfca\."budgetLineItemId" = bli\."id"/);
  assert.match(migrationSql, /SET "matrixRowId" = sfca\."sessionId"/);
  // Never infer a session from the legacy free-text subcategory column.
  assert.doesNotMatch(migrationSql, /"subcategory"/i);
});

test("migration session FK uses ON DELETE SET NULL so budget data survives session deletion", () => {
  assert.match(
    migrationSql,
    /"BudgetLineItem_matrixRowId_fkey"[\s\S]*?ON DELETE SET NULL/,
  );
});

test("migration group FK uses ON DELETE SET NULL so budget rows survive group deletion", () => {
  assert.match(
    migrationSql,
    /"BudgetLineItem_groupId_fkey"[\s\S]*?ON DELETE SET NULL/,
  );
});
