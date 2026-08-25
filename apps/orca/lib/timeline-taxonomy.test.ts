import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { TimelinePlanningStage, TimelineWorkstream } from "@prisma/client";
import {
  PLANNING_STAGE_LABELS,
  TIMELINE_PLANNING_STAGES,
  TIMELINE_WORKSTREAMS,
  WORKSTREAM_LABELS,
  WORKSTREAM_THEME,
  buildTimelineWorkstreamOptions,
  coercePlanningStage,
  coerceWorkstream,
  getWorkstreamDisplayKey,
  getPlanningStageLabel,
  getWorkstreamLabel,
  getWorkstreamTheme,
  normalizeWorkstreamLabel,
  workstreamLabelKey,
  resolvePlanningStage,
  resolveWorkstream,
} from "@/lib/timeline/taxonomy";

test("workstream constants mirror the Prisma enum exactly", () => {
  assert.deepEqual(
    [...TIMELINE_WORKSTREAMS].sort(),
    Object.values(TimelineWorkstream).sort(),
  );
  // canonical display order matches the target dashboard grid
  assert.deepEqual(
    [...TIMELINE_WORKSTREAMS],
    ["VENUE", "HOUSING", "REGISTRATION", "SPEAKERS", "SPONSORS", "FNB", "PRODUCTION", "MARKETING"],
  );
});

test("planning stage constants mirror the Prisma enum in lifecycle order", () => {
  assert.deepEqual(
    [...TIMELINE_PLANNING_STAGES].sort(),
    Object.values(TimelinePlanningStage).sort(),
  );
  assert.deepEqual(
    [...TIMELINE_PLANNING_STAGES],
    ["PRE_PLANNING", "PLANNING", "BUILD", "SHOW_WEEK", "CLOSE"],
  );
});

test("every workstream and stage has a label and theme", () => {
  for (const ws of TIMELINE_WORKSTREAMS) {
    assert.equal(typeof WORKSTREAM_LABELS[ws], "string");
    assert.ok(WORKSTREAM_LABELS[ws].length > 0);
    assert.ok(WORKSTREAM_THEME[ws].badge.length > 0);
    assert.ok(WORKSTREAM_THEME[ws].bar.length > 0);
  }
  for (const stage of TIMELINE_PLANNING_STAGES) {
    assert.equal(typeof PLANNING_STAGE_LABELS[stage], "string");
    assert.ok(PLANNING_STAGE_LABELS[stage].length > 0);
  }
  assert.equal(WORKSTREAM_LABELS.FNB, "F&B");
  assert.equal(PLANNING_STAGE_LABELS.SHOW_WEEK, "Show Week");
});

test("coerce helpers accept exact enum values and reject anything else", () => {
  assert.equal(coerceWorkstream("VENUE"), "VENUE");
  assert.equal(coerceWorkstream("Rooms"), null); // alias is not an exact value
  assert.equal(coerceWorkstream(""), null);
  assert.equal(coerceWorkstream(null), null);
  assert.equal(coercePlanningStage("SHOW_WEEK"), "SHOW_WEEK");
  assert.equal(coercePlanningStage("Show Week"), null);
});

test("resolve helpers map legacy department aliases to canonical workstreams", () => {
  assert.equal(resolveWorkstream("Rooms"), "VENUE");
  assert.equal(resolveWorkstream("AV"), "PRODUCTION");
  assert.equal(resolveWorkstream("Decor"), "PRODUCTION");
  assert.equal(resolveWorkstream("Staffing"), "REGISTRATION");
  assert.equal(resolveWorkstream("F&B"), "FNB");
  assert.equal(resolveWorkstream("Food and Beverage"), "FNB");
  assert.equal(resolveWorkstream("Housing"), "HOUSING");
  assert.equal(resolveWorkstream("VENUE"), "VENUE");
  assert.equal(resolveWorkstream("nonsense-category"), null);
  assert.equal(resolveWorkstream(null), null);
});

test("resolve planning stage handles spacing and synonyms", () => {
  assert.equal(resolvePlanningStage("Pre-Planning"), "PRE_PLANNING");
  assert.equal(resolvePlanningStage("show week"), "SHOW_WEEK");
  assert.equal(resolvePlanningStage("Closeout"), "CLOSE");
  assert.equal(resolvePlanningStage("PLANNING"), "PLANNING");
  assert.equal(resolvePlanningStage(null), null);
});

test("label/theme fallbacks are graceful for unassigned values", () => {
  assert.equal(getWorkstreamLabel(null), "Unassigned");
  assert.equal(getWorkstreamLabel("FNB"), "F&B");
  assert.equal(getWorkstreamLabel("VIP Services"), "VIP Services");
  assert.equal(getPlanningStageLabel(null), "Unscheduled");
  assert.equal(getPlanningStageLabel("BUILD"), "Build");
  const fallbackTheme = getWorkstreamTheme(null);
  assert.ok(fallbackTheme.badge.includes("slate"));
});

test("custom workstream labels are normalized without becoming fake enum values", () => {
  assert.equal(normalizeWorkstreamLabel("  VIP   Services  "), "VIP Services");
  assert.equal(workstreamLabelKey("  VIP   Services  "), "vip services");
  assert.equal(getWorkstreamDisplayKey("VIP Services"), "VIP Services");
  assert.equal(getWorkstreamDisplayKey("Production"), "PRODUCTION");
});

test("workstream options retain every canonical type and add existing custom labels without case-only duplicates", () => {
  const options = buildTimelineWorkstreamOptions([
    { workstream: "FNB", department: null },
    { workstream: null, department: "  VIP   Services " },
    { workstream: null, department: "vip services" },
    { workstream: null, department: "Production" },
  ]);

  assert.deepEqual(
    options.map((option) => option.label),
    ["Venue", "Housing", "Registration", "Speakers", "Sponsors", "F&B", "Production", "Marketing", "VIP Services"],
  );
  assert.deepEqual(options.find((option) => option.label === "VIP Services"), {
    value: "VIP Services",
    label: "VIP Services",
    workstream: null,
    department: "VIP Services",
    isCustom: true,
  });
});

test("canonical workstream options remain assignable after their final item is removed", () => {
  const optionsAfterDeletion = buildTimelineWorkstreamOptions([]);

  assert.deepEqual(
    optionsAfterDeletion.map((option) => option.workstream),
    [...TIMELINE_WORKSTREAMS],
  );
  assert.equal(optionsAfterDeletion.some((option) => option.label === "Unassigned"), false);
});

test("all roadmap assignment controls share the complete event-scoped workstream taxonomy", () => {
  const pageSource = readFileSync("app/(shell)/timeline/page.tsx", "utf8");
  const listSource = readFileSync("app/(shell)/timeline/_components/TimelineListView.tsx", "utf8");
  const boardSource = readFileSync("app/(shell)/timeline/_components/TimelineGanttView.tsx", "utf8");
  const serviceSource = readFileSync("src/server/services/timeline.ts", "utf8");

  assert.ok(pageSource.includes("buildTimelineWorkstreamOptions(items.filter"));
  assert.ok(pageSource.includes('list="timeline-create-workstream-options"'));
  assert.ok(listSource.includes("buildTimelineWorkstreamOptions(taskItems)"));
  assert.ok(listSource.includes('aria-label="Workstream"'));
  assert.ok(listSource.includes("Set workstream..."));
  assert.ok(boardSource.includes("QuickEditDraft"));
  assert.ok(boardSource.includes("TIMELINE_WORKSTREAMS.map((workstream) =>"));
  assert.ok(serviceSource.includes("const where: Prisma.TimelineItemWhereInput = {\n    eventId,"));
});
