import assert from "node:assert/strict";
import test from "node:test";
// Node's built-in type stripping runs this test directly from TypeScript.
// @ts-expect-error TS project config does not enable allowImportingTsExtensions.
import { buildSessionRequirementSelectionPersistencePlan } from "./session-requirement-selection-persistence.ts";

test("preserves existing selections that remain selected", () => {
  const plan = buildSessionRequirementSelectionPersistencePlan(
    [
      { itemId: "av-mic", quantity: 2 },
      { itemId: "fnb-coffee", quantity: null },
    ],
    [
      { itemId: "av-mic", quantity: 2 },
      { itemId: "fnb-coffee", quantity: null },
    ],
  );

  assert.deepEqual(plan, {
    itemIdsToDelete: [],
    selectionsToInsert: [],
    selectionsToUpdate: [],
  });
});

test("preserved rows keep existing data by scheduling no operation when unchanged", () => {
  const existingSelections = [
    { itemId: "av-mic", quantity: 2, linkedBudgetLineItemId: "budget-line-1" },
  ];
  const plan = buildSessionRequirementSelectionPersistencePlan(
    existingSelections,
    [{ itemId: "av-mic", quantity: 2 }],
  );

  assert.deepEqual(plan, {
    itemIdsToDelete: [],
    selectionsToInsert: [],
    selectionsToUpdate: [],
  });
});

test("inserts only newly selected items", () => {
  const plan = buildSessionRequirementSelectionPersistencePlan(
    [{ itemId: "av-mic", quantity: 2 }],
    [
      { itemId: "av-mic", quantity: 2 },
      { itemId: "fnb-coffee", quantity: null },
    ],
  );

  assert.deepEqual(plan, {
    itemIdsToDelete: [],
    selectionsToInsert: [{ itemId: "fnb-coffee", quantity: null }],
    selectionsToUpdate: [],
  });
});

test("removes only deselected items", () => {
  const plan = buildSessionRequirementSelectionPersistencePlan(
    [
      { itemId: "av-mic", quantity: 2 },
      { itemId: "fnb-coffee", quantity: null },
    ],
    [{ itemId: "av-mic", quantity: 2 }],
  );

  assert.deepEqual(plan, {
    itemIdsToDelete: ["fnb-coffee"],
    selectionsToInsert: [],
    selectionsToUpdate: [],
  });
});

test("updates quantity on preserved selected items without replacing the row", () => {
  const plan = buildSessionRequirementSelectionPersistencePlan(
    [{ itemId: "av-mic", quantity: 1 }],
    [{ itemId: "av-mic", quantity: 3 }],
  );

  assert.deepEqual(plan, {
    itemIdsToDelete: [],
    selectionsToInsert: [],
    selectionsToUpdate: [{ itemId: "av-mic", quantity: 3 }],
  });
});
