import assert from "node:assert/strict";
import test from "node:test";
import {
  budgetBlockColumnCountForWidth,
  budgetBlockPageCount,
  budgetBlockPageItems,
  budgetBlockPageSizeForColumns,
  clampBudgetBlockPageIndex,
} from "./budget-block-pagination";

const items = Array.from({ length: 12 }, (_, index) => `item-${index + 1}`);

test("four budget block items fit on one wide row page", () => {
  assert.equal(budgetBlockPageSizeForColumns(4), 8);
  assert.equal(budgetBlockPageCount(4, 4), 1);
  assert.deepEqual(budgetBlockPageItems(items.slice(0, 4), 0, 4), ["item-1", "item-2", "item-3", "item-4"]);
});

test("five budget block items fit in a two-row wide page", () => {
  assert.equal(budgetBlockPageCount(5, 4), 1);
  assert.deepEqual(budgetBlockPageItems(items.slice(0, 5), 0, 4), [
    "item-1",
    "item-2",
    "item-3",
    "item-4",
    "item-5",
  ]);
});

test("eight budget block items fit in two wide rows without pagination", () => {
  assert.equal(budgetBlockPageCount(8, 4), 1);
  assert.deepEqual(budgetBlockPageItems(items.slice(0, 8), 0, 4), items.slice(0, 8));
});

test("nine or more budget block items page in ordered groups of eight on wide layouts", () => {
  assert.equal(budgetBlockPageCount(9, 4), 2);
  assert.deepEqual(budgetBlockPageItems(items.slice(0, 9), 0, 4), items.slice(0, 8));
  assert.deepEqual(budgetBlockPageItems(items.slice(0, 9), 1, 4), ["item-9"]);
});

test("category and group page indexes can advance independently while preserving order", () => {
  const categoryPage = budgetBlockPageItems(["cat-1", "cat-2", "cat-3", "cat-4", "cat-5"], 0, 2);
  const groupPage = budgetBlockPageItems(["group-1", "group-2", "group-3", "group-4", "group-5"], 1, 2);

  assert.deepEqual(categoryPage, ["cat-1", "cat-2", "cat-3", "cat-4"]);
  assert.deepEqual(groupPage, ["group-5"]);
});

test("arrow disabled states derive from clamped page bounds", () => {
  assert.equal(clampBudgetBlockPageIndex(-1, 9, 4), 0);
  assert.equal(clampBudgetBlockPageIndex(0, 9, 4), 0);
  assert.equal(clampBudgetBlockPageIndex(1, 9, 4), 1);
  assert.equal(clampBudgetBlockPageIndex(2, 9, 4), 1);
});

test("responsive widths reduce capacity without introducing a third visible row", () => {
  assert.equal(budgetBlockColumnCountForWidth(1000), 4);
  assert.equal(budgetBlockPageSizeForColumns(budgetBlockColumnCountForWidth(1000)), 8);
  assert.equal(budgetBlockColumnCountForWidth(700), 2);
  assert.equal(budgetBlockPageSizeForColumns(budgetBlockColumnCountForWidth(700)), 4);
  assert.equal(budgetBlockColumnCountForWidth(360), 1);
  assert.equal(budgetBlockPageSizeForColumns(budgetBlockColumnCountForWidth(360)), 2);
});
