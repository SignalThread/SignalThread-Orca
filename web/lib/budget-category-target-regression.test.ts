import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cardSource = readFileSync("app/(shell)/events/[eventId]/budget/_components/budget-blocks-section.tsx", "utf8");
const serviceSource = readFileSync("src/server/services/budget-sessions-groups.ts", "utf8");

test("custom targets do not alter Command Center financial math", () => {
  assert.match(serviceSource, /const health = calculateBudgetCategoryHealth\(totals\.rows\)/);
  assert.doesNotMatch(serviceSource, /calculateBudgetCategoryHealth\(totals\.rows, targetAmountCents\)/);
  assert.doesNotMatch(cardSource, /effectiveTargetCents/);
  assert.doesNotMatch(cardSource, /Variance/);
});
