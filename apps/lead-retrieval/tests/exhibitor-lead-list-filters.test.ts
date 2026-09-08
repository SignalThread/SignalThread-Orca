import assert from "node:assert/strict";
import test from "node:test";
import {
  activeLeadFilterLabels,
  parseLeadListFilters,
  todayYmd,
  weekEndYmd
} from "../lib/leads/exhibitor-lead-list-filters";

test("lead list filters parse selectable rating, temperature, follow-up, and workflow states", () => {
  const filters = parseLeadListFilters({
    rating: "4_plus",
    temperature: "Hot",
    followUp: "overdue",
    workflowStatus: "pending_approval"
  });

  assert.deepEqual(filters, {
    rating: "4_plus",
    temperature: "hot",
    followUp: "overdue",
    workflowStatus: "pending_approval"
  });
  assert.deepEqual(activeLeadFilterLabels(filters), [
    "Rating 4+ stars",
    "Temperature Hot",
    "Follow-up overdue",
    "Pending approval"
  ]);
});

test("lead list filters reject unsupported workflow states instead of inventing fake states", () => {
  const filters = parseLeadListFilters({
    rating: "2_plus",
    temperature: "lukewarm",
    followUp: "someday",
    workflowStatus: "emailed"
  });

  assert.deepEqual(filters, {
    rating: null,
    temperature: null,
    followUp: null,
    workflowStatus: null
  });
});

test("follow-up date helpers produce deterministic YYYY-MM-DD ranges", () => {
  const now = new Date("2026-06-22T12:00:00.000Z");
  assert.equal(todayYmd(now), "2026-06-22");
  assert.equal(weekEndYmd(now), "2026-06-29");
});
