import test from "node:test";
import assert from "node:assert/strict";
import {
  filterLeadsByIntelligenceView,
  filterLeadsByTemperatureView,
  parseLeadsTemperatureView,
  mergeLegacyDrilldownParams,
  parseLeadsIntelligenceView,
  type LeadForIntelligenceFilter
} from "../lib/leads/exhibitorLeadsDrilldown";

const base = (over: Partial<LeadForIntelligenceFilter> = {}): LeadForIntelligenceFilter => ({
  temperature: undefined,
  priority_score: 50,
  follow_up_date: null,
  rating: 3,
  status: "new",
  ...over
});

test("parseLeadsIntelligenceView accepts canonical views", () => {
  assert.equal(parseLeadsIntelligenceView("hot"), "hot");
  assert.equal(parseLeadsIntelligenceView("warm"), "warm");
  assert.equal(parseLeadsIntelligenceView("cold"), "cold");
  assert.equal(parseLeadsIntelligenceView("priority_high"), "priority_high");
  assert.equal(parseLeadsIntelligenceView(undefined), "all");
  assert.equal(parseLeadsIntelligenceView("nope"), "all");
});

test("mergeLegacyDrilldownParams maps legacy params to view", () => {
  assert.equal(mergeLegacyDrilldownParams({ followUpDue: "1" }), "follow_up_due");
  assert.equal(mergeLegacyDrilldownParams({ minPriority: "80" }), "priority_high");
  assert.equal(mergeLegacyDrilldownParams({ minPriority: "90" }), "priority_high");
  assert.equal(mergeLegacyDrilldownParams({ minPriority: "75" }), "priority_high");
  assert.equal(mergeLegacyDrilldownParams({ minPriority: "50" }), "priority_medium");
  assert.equal(mergeLegacyDrilldownParams({ view: "follow_up_scheduled" }), "follow_up_scheduled");
});

test("parseLeadsTemperatureView supports only all/hot/warm/cold", () => {
  assert.equal(parseLeadsTemperatureView("all"), "all");
  assert.equal(parseLeadsTemperatureView("hot"), "hot");
  assert.equal(parseLeadsTemperatureView("warm"), "warm");
  assert.equal(parseLeadsTemperatureView("cold"), "cold");
  assert.equal(parseLeadsTemperatureView("unrated"), "all");
  assert.equal(parseLeadsTemperatureView("priority_high"), "all");
});

test("filterLeadsByTemperatureView uses canonical temperature only", () => {
  const rows = [
    base({ temperature: "hot", priority_score: 90 }),
    base({ temperature: "warm", priority_score: 99 }),
    base({ temperature: "cold", priority_score: 99 }),
    base({ temperature: undefined, priority_score: 99 }),
  ];
  assert.equal(filterLeadsByTemperatureView(rows, "all").length, 4);
  assert.deepEqual(filterLeadsByTemperatureView(rows, "hot").map((row) => row.temperature), ["hot"]);
  assert.deepEqual(filterLeadsByTemperatureView(rows, "warm").map((row) => row.temperature), ["warm"]);
  assert.deepEqual(filterLeadsByTemperatureView(rows, "cold").map((row) => row.temperature), ["cold"]);
});

test("filterLeadsByIntelligenceView: hot uses explicit temperature while priority buckets use score", () => {
  const rows = [
    base({ temperature: "hot", priority_score: 90 }),
    base({ priority_score: 85 }),
    base({ priority_score: 72 }),
    base({ priority_score: 45 }),
    base({ priority_score: 20 }),
    base({ priority_score: 5 })
  ];
  assert.deepEqual(
    filterLeadsByIntelligenceView(rows, "hot", { todayYmd: "2026-03-27" }).map((r) => r.temperature),
    ["hot"]
  );
  assert.deepEqual(
    filterLeadsByIntelligenceView(rows, "priority_high", { todayYmd: "2026-03-27" }).map((r) => r.priority_score),
    [72]
  );
  assert.deepEqual(
    filterLeadsByIntelligenceView(rows, "priority_medium", { todayYmd: "2026-03-27" }).map((r) => r.priority_score),
    [45]
  );
  assert.deepEqual(
    filterLeadsByIntelligenceView(rows, "priority_low", { todayYmd: "2026-03-27" }).map((r) => r.priority_score),
    [20]
  );
  assert.deepEqual(
    filterLeadsByIntelligenceView(rows, "priority_unscored", { todayYmd: "2026-03-27" }).map((r) => r.priority_score),
    [5]
  );
});

test("filterLeadsByIntelligenceView: follow-up due vs scheduled", () => {
  const today = "2026-03-27";
  const rows = [
    base({ follow_up_date: "2026-03-26", status: "new" }),
    base({ follow_up_date: "2026-03-27", status: "new" }),
    base({ follow_up_date: "2026-04-01", status: "new" }),
    base({ follow_up_date: "2026-03-20", status: "closed" }),
    base({ follow_up_date: null, status: "new" })
  ];
  const due = filterLeadsByIntelligenceView(rows, "follow_up_due", { todayYmd: today });
  assert.equal(due.length, 2);
  assert.ok(due.every((r) => r.follow_up_date && r.follow_up_date <= today));

  const sched = filterLeadsByIntelligenceView(rows, "follow_up_scheduled", { todayYmd: today });
  assert.equal(sched.length, 3);
});

test("filterLeadsByIntelligenceView: hot prefers canonical temperature over legacy score", () => {
  const rows = [
    base({ temperature: "hot", priority_score: 10 }),
    base({ temperature: "cold", priority_score: 99 }),
    base({ temperature: "warm", priority_score: 99 }),
  ];
  const hot = filterLeadsByIntelligenceView(rows, "hot", { todayYmd: "2026-03-27" });
  assert.deepEqual(hot.map((row) => row.temperature), ["hot"]);
});

test("filterLeadsByIntelligenceView: unrated", () => {
  const rows = [base({ rating: 0 }), base({ rating: 4 })];
  assert.equal(filterLeadsByIntelligenceView(rows, "unrated", { todayYmd: "2026-03-27" }).length, 1);
});
