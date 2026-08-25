import assert from "node:assert/strict";
import test from "node:test";
import {
  computeCategoryFooterTotal,
  computeSessionFooterTotal,
  lineItemMatchesGroupFilter,
  lineItemMatchesSessionFilter,
  sumLineItemMoney,
} from "./budget-session-group-filter";

const row = (over: Partial<{ category: string; matrixRowId: string | null; groupId: string | null; forecastCents: number; actualCents: number }> = {}) => ({
  category: "Décor & Branding",
  matrixRowId: null,
  groupId: null,
  forecastCents: 0,
  actualCents: 0,
  ...over,
});

// --- session filter --------------------------------------------------------

test("session filter is off when no sessions are selected", () => {
  assert.equal(lineItemMatchesSessionFilter(row({ matrixRowId: null }), []), true);
  assert.equal(lineItemMatchesSessionFilter(row({ matrixRowId: "s1" }), []), true);
});

test("session filter excludes rows without the selected session (and unassigned rows)", () => {
  assert.equal(lineItemMatchesSessionFilter(row({ matrixRowId: "s1" }), ["s1"]), true);
  assert.equal(lineItemMatchesSessionFilter(row({ matrixRowId: "s2" }), ["s1"]), false);
  assert.equal(lineItemMatchesSessionFilter(row({ matrixRowId: null }), ["s1"]), false);
});

// --- group filter ----------------------------------------------------------

test("group filter is off for empty/whitespace selection", () => {
  assert.equal(lineItemMatchesGroupFilter(row({ groupId: "g1" }), null), true);
  assert.equal(lineItemMatchesGroupFilter(row({ groupId: "g1" }), ""), true);
  assert.equal(lineItemMatchesGroupFilter(row({ groupId: null }), "   "), true);
});

test("group filter matches only the selected group", () => {
  assert.equal(lineItemMatchesGroupFilter(row({ groupId: "g1" }), "g1"), true);
  assert.equal(lineItemMatchesGroupFilter(row({ groupId: "g2" }), "g1"), false);
  assert.equal(lineItemMatchesGroupFilter(row({ groupId: null }), "g1"), false);
});

// --- footer totals ---------------------------------------------------------

test("sumLineItemMoney sums forecast/actual and counts", () => {
  assert.deepEqual(
    sumLineItemMoney([row({ forecastCents: 100, actualCents: 90 }), row({ forecastCents: 50, actualCents: 60 })]),
    { forecastCents: 150, actualCents: 150, rowCount: 2 },
  );
});

test("computeSessionFooterTotal sums only rows in the selected session(s)", () => {
  const items = [
    row({ matrixRowId: "s1", forecastCents: 100, actualCents: 80 }),
    row({ matrixRowId: "s1", forecastCents: 200, actualCents: 250 }),
    row({ matrixRowId: "s2", forecastCents: 999, actualCents: 999 }),
    row({ matrixRowId: null, forecastCents: 999, actualCents: 999 }),
  ];
  const total = computeSessionFooterTotal(items, ["s1"]);
  assert.deepEqual(total, { sessionIds: ["s1"], rowCount: 2, forecastCents: 300, actualCents: 330 });
});

test("computeSessionFooterTotal is empty when no session is selected", () => {
  const total = computeSessionFooterTotal([row({ matrixRowId: "s1", forecastCents: 100, actualCents: 100 })], []);
  assert.deepEqual(total, { sessionIds: [], rowCount: 0, forecastCents: 0, actualCents: 0 });
});

test("computeCategoryFooterTotal is absent for all categories", () => {
  const total = computeCategoryFooterTotal([row({ forecastCents: 100, actualCents: 100 })], "");
  assert.equal(total, null);
});

test("computeCategoryFooterTotal appears for a selected category with forecast, actual, and variance", () => {
  const total = computeCategoryFooterTotal(
    [
      row({ category: "Décor & Branding", forecastCents: 500, actualCents: 525 }),
      row({ category: "Décor & Branding", forecastCents: 250, actualCents: 0 }),
    ],
    "Décor & Branding",
  );
  assert.deepEqual(total, {
    category: "Décor & Branding",
    rowCount: 2,
    forecastCents: 750,
    actualCents: 525,
    varianceCents: -225,
  });
});

test("computeCategoryFooterTotal respects the active filtered rows it receives", () => {
  const filteredDecorRows = [
    row({ category: "Décor & Branding", forecastCents: 500, actualCents: 525 }),
  ];
  const total = computeCategoryFooterTotal(filteredDecorRows, "Décor & Branding");
  assert.deepEqual(total, {
    category: "Décor & Branding",
    rowCount: 1,
    forecastCents: 500,
    actualCents: 525,
    varianceCents: 25,
  });
});
