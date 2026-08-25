import assert from "node:assert/strict";
import test from "node:test";
import { getTimelineGroupSummary } from "./group-summary";

type Item = {
  id: string;
  workstream: string | null;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";
  isCriticalPath: boolean;
};

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: "item",
    workstream: "HOUSING",
    status: "NOT_STARTED",
    isCriticalPath: false,
    ...overrides,
  };
}

function visibleItems(items: Item[], filters: { workstream?: string; status?: Item["status"] } = {}) {
  return items.filter((candidate) => {
    if (filters.workstream && candidate.workstream !== filters.workstream) return false;
    if (filters.status && candidate.status !== filters.status) return false;
    return true;
  });
}

function itemsForGroup(items: Item[], workstream: string | null) {
  return items.filter((candidate) => candidate.workstream === workstream);
}

test("badge number is the total number of rendered items in a group", () => {
  const renderedItems = [item({ id: "housing-1" }), item({ id: "housing-2" }), item({ id: "housing-3" })];

  assert.equal(getTimelineGroupSummary(renderedItems).itemCount, renderedItems.length);
});

test("groups without critical-path items do not show a flame", () => {
  assert.equal(getTimelineGroupSummary([item(), item({ id: "two" })]).hasCriticalPath, false);
});

test("one or more critical-path items show a single flame without changing the count", () => {
  const renderedItems = [
    item({ id: "one", isCriticalPath: true }),
    item({ id: "two", isCriticalPath: true }),
    item({ id: "three" }),
  ];
  const summary = getTimelineGroupSummary(renderedItems);

  assert.equal(summary.itemCount, 3);
  assert.equal(summary.hasCriticalPath, true);
});

test("unassigned summary uses the same unassigned item list as the expanded group", () => {
  const visible = [item({ id: "one", workstream: null }), item({ id: "two", workstream: null }), item({ id: "three", workstream: "MARKETING" })];
  const expandedItems = itemsForGroup(visible, null);

  assert.equal(getTimelineGroupSummary(expandedItems).itemCount, expandedItems.length);
  assert.equal(getTimelineGroupSummary(expandedItems).itemCount, 2);
});

test("active filters keep badge and expanded group item counts synchronized", () => {
  const allItems = [
    item({ id: "housing-open", workstream: "HOUSING" }),
    item({ id: "housing-complete", workstream: "HOUSING", status: "COMPLETE" }),
    item({ id: "marketing-open", workstream: "MARKETING" }),
  ];
  const filtered = visibleItems(allItems, { status: "NOT_STARTED" });
  const expandedItems = itemsForGroup(filtered, "HOUSING");

  assert.equal(getTimelineGroupSummary(expandedItems).itemCount, expandedItems.length);
  assert.equal(getTimelineGroupSummary(expandedItems).itemCount, 1);
});
