import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const gridSource = readFileSync("app/(shell)/budgets/_components/full-budget-grid.tsx", "utf8");
const fnbCatalogSource = readFileSync("lib/fnb-catalog.ts", "utf8");

// --- old blue ops block removed --------------------------------------------

test("the old blue/sky session-linked block is gone from the grid", () => {
  assert.doesNotMatch(gridSource, /Session linked:/);
  assert.doesNotMatch(gridSource, /border-sky-100 bg-sky-50/);
});

// --- compact Ops action ----------------------------------------------------

test("rows with a linked session render a compact Ops action keyed off matrixRowId", () => {
  // Guarded on the canonical session link, not on the F&B requirement link.
  assert.match(gridSource, /\{item\.matrixRowId \? \(\s*<Link/);
  assert.match(gridSource, /title="Open session ops"/);
  assert.match(gridSource, /matrix\/sessions\/\$\{item\.matrixRowId\}/);
});

test("the Ops action stops propagation so it never triggers row/cell editing", () => {
  // The Link sets both onClick and onPointerDown stopPropagation near its title.
  const idx = gridSource.indexOf('title="Open session ops"');
  assert.ok(idx > 0);
  const around = gridSource.slice(idx - 400, idx);
  assert.match(around, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(around, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
});

test("the Ops action has an accessible session-specific label", () => {
  assert.match(gridSource, /aria-label=\{`Open session operations for \$\{item\.sessionTitle \?\? "linked session"\}`\}/);
});

// --- F&B generated-row session linkage -------------------------------------

test("F&B catalog sync stamps the canonical session link onto the generated budget row", () => {
  assert.match(fnbCatalogSource, /matrixRowId: assignment\.sessionId/);
});

test("F&B sync stays idempotent: existing rows are updated in place, not duplicated", () => {
  // The session link lives in the shared budgetData applied to BOTH branches, and
  // the create branch only runs when there is no existing budgetLineItemId.
  const fnStart = fnbCatalogSource.indexOf("async function syncAssignmentBudgetLine");
  const fnEnd = fnbCatalogSource.indexOf("export async function listFnbCatalogItems", fnStart);
  assert.ok(fnStart >= 0 && fnEnd > fnStart, "canonical F&B sync function is present");
  const fnBody = fnbCatalogSource.slice(fnStart, fnEnd);
  assert.match(fnBody, /if \(budgetLineItemId\) \{[\s\S]*budgetLineItem\.update/);
  assert.match(fnBody, /budgetLineItem\.create/);
  // The link is part of budgetData (shared by update + create), not duplicated logic.
  assert.match(fnBody, /matrixRowId: assignment\.sessionId/);
});
