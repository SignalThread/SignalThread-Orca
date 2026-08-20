import assert from "node:assert/strict";
import test from "node:test";

import {
  availableFnbPickerCategories,
  filterAvailableFnbCatalogItems,
  mergeFnbPickerAssignment,
  removeFnbPickerAssignment,
  type FnbPickerCatalogItem,
} from "../app/(shell)/matrix-2/_components/matrix2-fnb-picker";

function item(id: string, category: string, overrides: Partial<FnbPickerCatalogItem> = {}): FnbPickerCatalogItem {
  return {
    id,
    itemName: `${category} item ${id}`,
    description: null,
    price: "$10",
    unit: "each",
    category,
    sourceMenuFileName: "approved-menu.pdf",
    ...overrides,
  };
}

const multiCategoryCatalog = [
  item("bev", "Beverage"),
  item("breakfast", "Breakfast", { itemName: "Continental Breakfast" }),
  item("break", "Breaks"),
  item("lunch", "Lunch"),
  item("dinner", "Dinner", { description: "Herb-roasted salmon with seasonal vegetables" }),
  item("dessert", "Dessert"),
  item("reception", "Reception"),
];

test("All returns the complete approved picker catalog across categories", () => {
  const available = filterAvailableFnbCatalogItems({
    items: multiCategoryCatalog,
    assignedItemIds: new Set(),
    category: "All",
    search: "",
  });

  assert.equal(available.length, multiCategoryCatalog.length);
  assert.deepEqual(new Set(available.map((entry) => entry.category)), new Set([
    "Beverage",
    "Breakfast",
    "Breaks",
    "Lunch",
    "Dinner",
    "Dessert",
    "Reception",
  ]));
});

test("assigned catalog items are excluded from Available", () => {
  const available = filterAvailableFnbCatalogItems({
    items: multiCategoryCatalog,
    assignedItemIds: new Set(["bev", "lunch"]),
    category: "All",
    search: "",
  });

  assert.deepEqual(available.map((entry) => entry.id), ["breakfast", "break", "dinner", "dessert", "reception"]);
});

test("category filters are dynamic and filter the complete catalog", () => {
  assert.deepEqual(availableFnbPickerCategories(multiCategoryCatalog), [
    "Beverage",
    "Breakfast",
    "Breaks",
    "Lunch",
    "Dinner",
    "Dessert",
    "Reception",
  ]);
  const dinner = filterAvailableFnbCatalogItems({
    items: multiCategoryCatalog,
    assignedItemIds: new Set(),
    category: "Dinner",
    search: "",
  });
  assert.deepEqual(dinner.map((entry) => entry.id), ["dinner"]);
});

test("search covers non-Beverage names, categories, descriptions, and source menus", () => {
  for (const query of ["Continental", "Dinner", "salmon", "approved-menu.pdf"]) {
    const results = filterAvailableFnbCatalogItems({
      items: multiCategoryCatalog,
      assignedItemIds: new Set(),
      category: "All",
      search: query,
    });
    assert.equal(results.length > 0, true, `expected ${query} to match the full catalog`);
  }
});

test("the picker does not impose a small hidden result cap", () => {
  const largeCatalog = Array.from({ length: 75 }, (_, index) => item(`item-${index}`, index % 2 ? "Lunch" : "Breakfast"));
  const results = filterAvailableFnbCatalogItems({
    items: largeCatalog,
    assignedItemIds: new Set(),
    category: "All",
    search: "",
  });
  assert.equal(results.length, 75);
});

test("adding and removing assignments moves items without duplication", () => {
  const assignment = { id: "assignment-1", eventFnbCatalogItemId: "dinner" };
  const selected = mergeFnbPickerAssignment([], assignment);
  const deduplicated = mergeFnbPickerAssignment(selected, { id: "assignment-duplicate", eventFnbCatalogItemId: "dinner" });
  assert.deepEqual(deduplicated, [assignment]);
  assert.equal(filterAvailableFnbCatalogItems({
    items: multiCategoryCatalog,
    assignedItemIds: new Set(deduplicated.map((entry) => entry.eventFnbCatalogItemId)),
    category: "All",
    search: "",
  }).some((entry) => entry.id === "dinner"), false);

  const removed = removeFnbPickerAssignment(deduplicated, assignment.id);
  assert.deepEqual(removed, []);
  assert.equal(filterAvailableFnbCatalogItems({
    items: multiCategoryCatalog,
    assignedItemIds: new Set(),
    category: "All",
    search: "",
  }).some((entry) => entry.id === "dinner"), true);
});
