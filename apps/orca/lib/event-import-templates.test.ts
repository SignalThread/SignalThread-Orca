import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTemplateCreatePlan,
  buildTemplatePreview,
  EVENT_TEMPLATE_DEFINITIONS,
  EVENT_TEMPLATE_KEYS,
} from "./event-import-templates";
import { summarizeEventImportPreview, type EventImportBasics } from "./event-import-types";

const basics: EventImportBasics = {
  name: "Conf",
  startDate: "2026-09-01",
  endDate: "2026-09-03",
  timezone: "America/New_York",
};

test("six templates are defined", () => {
  assert.equal(EVENT_TEMPLATE_KEYS.length, 6);
  assert.deepEqual(EVENT_TEMPLATE_KEYS, [
    "conference",
    "trade_show",
    "gala",
    "training",
    "workshop",
    "corporate_meeting",
  ]);
});

test("every template produces non-empty Run of Show, Budget, and Timeline content", () => {
  for (const def of EVENT_TEMPLATE_DEFINITIONS) {
    const plan = buildTemplateCreatePlan(def.key, basics);
    assert.ok(plan.runOfShow.length > 0, `${def.key} ROS`);
    assert.ok(plan.budget.length > 0, `${def.key} budget`);
    assert.ok(plan.timeline.length > 0, `${def.key} timeline`);
  }
});

test("template Run of Show rows are schedulable (date + valid start/end) on the event start", () => {
  const plan = buildTemplateCreatePlan("conference", basics);
  for (const row of plan.runOfShow) {
    assert.equal(row.dayDateIso, "2026-09-01");
    assert.match(row.startTime, /^\d{2}:\d{2}$/);
    assert.match(row.endTime, /^\d{2}:\d{2}$/);
    assert.ok(row.endTime > row.startTime);
  }
  // Sessions are sequential, not stacked at the same time.
  assert.equal(plan.runOfShow[0].startTime, "09:00");
  assert.equal(plan.runOfShow[1].startTime, "10:00");
});

test("template budget rows are zero-cost placeholders with categories", () => {
  const plan = buildTemplateCreatePlan("gala", basics);
  for (const row of plan.budget) {
    assert.ok(row.category.trim().length > 0);
    assert.ok(row.lineItem.trim().length > 0);
    assert.equal(row.forecastCents, 0);
  }
});

test("template timeline tasks default to NOT_STARTED", () => {
  const plan = buildTemplateCreatePlan("training", basics);
  assert.ok(plan.timeline.every((t) => t.status === "NOT_STARTED"));
});

test("unknown template key falls back to the first template", () => {
  const plan = buildTemplateCreatePlan("does-not-exist", basics);
  assert.equal(plan.sourceType, "template");
  assert.ok(plan.runOfShow.length > 0);
});

test("template preview reports correct counts and labels starter content", () => {
  const preview = buildTemplatePreview("conference", basics);
  const summary = summarizeEventImportPreview(preview);
  assert.equal(preview.sourceType, "template");
  assert.equal(preview.templateKey, "conference");
  assert.ok(summary.runOfShowRowsToCreate > 0);
  assert.ok(summary.budgetLineItemsToCreate > 0);
  assert.ok(summary.timelineItemsToCreate > 0);
  assert.ok(preview.globalWarnings.some((w) => /starter content/i.test(w.message)));
});
