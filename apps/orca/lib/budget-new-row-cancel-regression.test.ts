import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const gridSource = readFileSync("app/(shell)/budgets/_components/full-budget-grid.tsx", "utf8");

test("only unsaved budget rows expose the sticky client-side cancel action", () => {
  assert.match(gridSource, /sticky right-0 z-10/);
  assert.match(gridSource, /\{isNew \? \(/);
  assert.match(gridSource, /title="Remove new row"/);
  assert.match(gridSource, /aria-label="Remove new budget row"/);
  assert.match(gridSource, /onRemoveNewRow\(item\)/);
  assert.match(gridSource, /<X className="h-4 w-4"/);
  assert.doesNotMatch(gridSource, /Trash2 className="h-4 w-4"/);
});

test("removing one new row preserves other drafts and sends no delete request", () => {
  const removeStart = gridSource.indexOf("function handleRemoveNewLineItem");
  const removeEnd = gridSource.indexOf("async function handleSaveAllLineItemChanges", removeStart);
  const removeSource = gridSource.slice(removeStart, removeEnd);

  assert.match(removeSource, /handleCancelLineItemRow\(item\)/);
  assert.match(removeSource, /setSelectedLineItemIds\(\(current\) => current\.filter/);
  assert.doesNotMatch(removeSource, /fetch\(/);
  assert.doesNotMatch(removeSource, /method: "DELETE"/);
});

test("undo restores every entered draft value and marks the row unsaved again", () => {
  assert.match(gridSource, /amountDraft: amountDrafts\[item\.id\] \?\? defaultAmountDraft\(item\)/);
  assert.match(gridSource, /textDraft: lineItemDrafts\[item\.id\] \?\? defaultLineItemDraft\(item\)/);
  assert.match(gridSource, /lineItems: \[undoSnapshot\.item, \.\.\.current\.lineItems\]/);
  assert.match(gridSource, /\[undoSnapshot\.item\.id\]: undoSnapshot\.amountDraft/);
  assert.match(gridSource, /\[undoSnapshot\.item\.id\]: undoSnapshot\.textDraft/);
  assert.match(gridSource, /new Set\(current\)\.add\(undoSnapshot\.item\.id\)/);
  assert.match(gridSource, /title: "New row removed"/);
  assert.match(gridSource, /actionLabel: "Undo"/);
});

test("discard changes removes all new rows through the existing temporary-row draft path", () => {
  const discardStart = gridSource.indexOf("function handleDiscardAllLineItemChanges");
  const discardEnd = gridSource.indexOf("const updateAmount", discardStart);
  const discardSource = gridSource.slice(discardStart, discardEnd);

  assert.match(discardSource, /const dirtyIds = Array\.from\(dirtyLineItemIds\)/);
  assert.match(discardSource, /handleCancelLineItemRow\(item\)/);
  assert.match(gridSource, /current\.lineItems\.filter\(\(lineItem\) => lineItem\.id !== item\.id\)/);
  assert.match(gridSource, /clearLineItemRowState\(item\.id\)/);
});
