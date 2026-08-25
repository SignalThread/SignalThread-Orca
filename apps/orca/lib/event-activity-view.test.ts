import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTION_OPTIONS,
  ACTION_LABELS,
  buildActivityQuery,
  changeFieldLabel,
  EMPTY_FILTERS,
  entryHeadline,
  formatChangeValue,
  hasActiveFilters,
  hasChanges,
  MODULE_OPTIONS,
  MODULE_LABELS,
  PAGE_SIZE,
  type ActivityFilters,
} from "@/app/(shell)/events/[eventId]/activity/_components/activity-view";

test("PAGE_SIZE is 20", () => {
  assert.equal(PAGE_SIZE, 20);
});

test("all 10 modules and 22 actions have readable labels", () => {
  assert.equal(MODULE_OPTIONS.length, 10);
  assert.equal(ACTION_OPTIONS.length, 22);
  for (const m of MODULE_OPTIONS) assert.equal(typeof MODULE_LABELS[m], "string");
  for (const a of ACTION_OPTIONS) assert.equal(typeof ACTION_LABELS[a], "string");
  assert.equal(MODULE_LABELS.RUN_OF_SHOW, "Run of Show");
  assert.equal(ACTION_LABELS.STATUS_CHANGED, "Status changed");
});

test("buildActivityQuery omits empty filters and produces clean query state", () => {
  assert.equal(buildActivityQuery(EMPTY_FILTERS), "");
  const filters: ActivityFilters = {
    from: "2026-07-01",
    to: "2026-07-14",
    actor: "actor:opaque-user-key",
    module: "ROADMAP",
    action: "STATUS_CHANGED",
    search: "  budget  ",
  };
  const params = new URLSearchParams(buildActivityQuery(filters));
  assert.equal(params.get("from"), "2026-07-01");
  assert.equal(params.get("to"), "2026-07-14");
  assert.equal(params.get("actor"), "actor:opaque-user-key");
  assert.equal(params.get("module"), "ROADMAP");
  assert.equal(params.get("action"), "STATUS_CHANGED");
  assert.equal(params.get("search"), "budget", "search is trimmed");
  assert.equal(params.has("cursor"), false);
});

test("buildActivityQuery appends the cursor for pagination while keeping filters", () => {
  const filters: ActivityFilters = { ...EMPTY_FILTERS, module: "BUDGET" };
  const params = new URLSearchParams(buildActivityQuery(filters, "cursor-abc"));
  assert.equal(params.get("module"), "BUDGET", "filter persists while paging");
  assert.equal(params.get("cursor"), "cursor-abc");
});

test("entryHeadline builds concise canonical and legacy labels", () => {
  assert.equal(entryHeadline({ module: "ROADMAP", action: "STATUS_CHANGED", legacyType: null }), "Roadmap · Status changed");
  assert.equal(entryHeadline({ module: "RUN_OF_SHOW", action: "ASSIGNED", legacyType: null }), "Run of Show · Assigned");
  assert.equal(entryHeadline({ module: null, action: null, legacyType: "SPEAKER_UPDATED" }), "Speakers · Updated");
  assert.equal(entryHeadline({ module: null, action: null, legacyType: "SEATING_UPDATED" }), "Legacy activity");
  assert.equal(entryHeadline({ module: "BUDGET", action: null, legacyType: null }), "Budget");
});

test("hasChanges only true when meaningful diffs exist", () => {
  assert.equal(hasChanges({ changes: null }), false);
  assert.equal(hasChanges({ changes: [] }), false);
  assert.equal(hasChanges({ changes: [{ field: "status", from: "a", to: "b" }] }), true);
});

test("changeFieldLabel humanizes field names and honors explicit labels", () => {
  assert.equal(changeFieldLabel({ field: "dueDate", from: null, to: null }), "Due date");
  assert.equal(changeFieldLabel({ field: "status", label: "Status", from: null, to: null }), "Status");
  assert.equal(changeFieldLabel({ field: "owner_id", from: null, to: null }), "Owner id");
});

test("formatChangeValue renders readable old/new values", () => {
  assert.equal(formatChangeValue(null), "—");
  assert.equal(formatChangeValue(""), "—");
  assert.equal(formatChangeValue(true), "Yes");
  assert.equal(formatChangeValue(false), "No");
  assert.equal(formatChangeValue(42), "42");
  assert.equal(formatChangeValue("Draft"), "Draft");
});

test("hasActiveFilters detects any active filter", () => {
  assert.equal(hasActiveFilters(EMPTY_FILTERS), false);
  assert.equal(hasActiveFilters({ ...EMPTY_FILTERS, module: "ROADMAP" }), true);
  assert.equal(hasActiveFilters({ ...EMPTY_FILTERS, search: "  x " }), true);
});
