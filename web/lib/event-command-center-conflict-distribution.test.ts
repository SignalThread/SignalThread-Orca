import assert from "node:assert/strict";
import test from "node:test";
import { getConflictDistributionModel } from "./event-command-center-conflict-distribution";

test("conflict distribution renders all-warning conflicts as a full warning ring", () => {
  const model = getConflictDistributionModel({ critical: 0, warning: 6, neutral: 0 });

  assert.equal(model.total, 6);
  assert.equal(model.conflictLabel, "Conflicts");
  assert.equal(model.criticalEnd, "0%");
  assert.equal(model.warningEnd, "100%");
  assert.equal(model.neutralEnd, "100%");
  assert.equal(model.summary, "6 open conflicts: 0 critical, 6 warning, 0 neutral.");
});

test("conflict distribution proportions mixed severities in severity order", () => {
  const model = getConflictDistributionModel({ critical: 2, warning: 3, neutral: 1 });

  assert.equal(model.total, 6);
  assert.equal(model.criticalEnd, `${(2 / 6) * 100}%`);
  assert.equal(model.warningEnd, `${((2 / 6) * 100) + ((3 / 6) * 100)}%`);
  assert.equal(model.neutralEnd, "100%");
});

test("conflict distribution handles singular and zero states", () => {
  const criticalOnly = getConflictDistributionModel({ critical: 1, warning: 0, neutral: 0 });
  assert.equal(criticalOnly.total, 1);
  assert.equal(criticalOnly.conflictLabel, "Conflict");
  assert.equal(criticalOnly.criticalEnd, "100%");
  assert.equal(criticalOnly.warningEnd, "100%");
  assert.equal(criticalOnly.summary, "1 open conflict: 1 critical, 0 warning, 0 neutral.");

  const empty = getConflictDistributionModel({ critical: 0, warning: 0, neutral: 0 });
  assert.equal(empty.total, 0);
  assert.equal(empty.conflictLabel, "Conflicts");
  assert.equal(empty.criticalEnd, "0%");
  assert.equal(empty.warningEnd, "0%");
  assert.equal(empty.neutralEnd, "100%");
  assert.equal(empty.summary, "0 open conflicts: 0 critical, 0 warning, 0 neutral.");
});
