import test from "node:test";
import assert from "node:assert/strict";
import { computeExhibitorLeadsBulkScope } from "../lib/leads/exhibitorLeadsBulkScope";

const loaded = new Set(["a", "b", "c", "d"]);

test("filter scope (hot): all sorted visible ids when nothing selected", () => {
  const sorted = ["c", "a"];
  const r = computeExhibitorLeadsBulkScope({
    selectedLeadIds: new Set(),
    loadedLeadIds: loaded,
    temperatureView: "hot",
    sortedVisibleLeadIds: sorted
  });
  assert.equal(r.mode, "filter");
  assert.deepEqual(r.leadIds, sorted);
});

test("filter scope: warm and cold behave like hot", () => {
  const sorted = ["x", "y"];
  for (const temperatureView of ["warm", "cold"] as const) {
    const r = computeExhibitorLeadsBulkScope({
      selectedLeadIds: new Set(),
      loadedLeadIds: new Set(sorted),
      temperatureView,
      sortedVisibleLeadIds: sorted
    });
    assert.equal(r.mode, "filter");
    assert.deepEqual(r.leadIds, sorted);
  }
});

test("view all + no selection: no bulk scope", () => {
  const r = computeExhibitorLeadsBulkScope({
    selectedLeadIds: new Set(),
    loadedLeadIds: loaded,
    temperatureView: "all",
    sortedVisibleLeadIds: ["a", "b"]
  });
  assert.equal(r.mode, "none");
  assert.deepEqual(r.leadIds, []);
});

test("filter view but empty visible list: no bulk scope", () => {
  const r = computeExhibitorLeadsBulkScope({
    selectedLeadIds: new Set(),
    loadedLeadIds: loaded,
    temperatureView: "hot",
    sortedVisibleLeadIds: []
  });
  assert.equal(r.mode, "none");
  assert.deepEqual(r.leadIds, []);
});

test("explicit manual selection overrides temperature filter scope", () => {
  const r = computeExhibitorLeadsBulkScope({
    selectedLeadIds: new Set(["b"]),
    loadedLeadIds: loaded,
    temperatureView: "hot",
    sortedVisibleLeadIds: ["a", "b", "c"]
  });
  assert.equal(r.mode, "manual");
  assert.deepEqual(r.leadIds, ["b"]);
});

test("manual scope drops ids not in loaded set", () => {
  const r = computeExhibitorLeadsBulkScope({
    selectedLeadIds: new Set(["a", "ghost"]),
    loadedLeadIds: loaded,
    temperatureView: "hot",
    sortedVisibleLeadIds: ["a", "b"]
  });
  assert.equal(r.mode, "manual");
  assert.deepEqual(r.leadIds, ["a"]);
});

test("manual selection with only stale ids falls through to filter scope", () => {
  const r = computeExhibitorLeadsBulkScope({
    selectedLeadIds: new Set(["ghost"]),
    loadedLeadIds: loaded,
    temperatureView: "warm",
    sortedVisibleLeadIds: ["a", "b"]
  });
  assert.equal(r.mode, "filter");
  assert.deepEqual(r.leadIds, ["a", "b"]);
});
