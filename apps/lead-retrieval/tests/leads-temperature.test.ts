import assert from "node:assert/strict";
import test from "node:test";
import {
  LEAD_TEMPERATURE_LABEL,
  leadTemperatureToLegacyPriorityScore,
  legacyPriorityLabelToLeadTemperature,
  legacyPriorityScoreToLeadTemperature,
  parseLeadTemperature,
  resolveLeadTemperature,
} from "@/lib/leads/temperature";

test("parseLeadTemperature accepts only canonical values", () => {
  assert.equal(parseLeadTemperature("hot"), "hot");
  assert.equal(parseLeadTemperature("WARM"), "warm");
  assert.equal(parseLeadTemperature(" cold "), "cold");
  assert.equal(parseLeadTemperature("high"), null);
  assert.equal(parseLeadTemperature("unscored"), null);
  assert.equal(parseLeadTemperature(null), null);
});

test("legacy score mapping is deterministic", () => {
  assert.equal(legacyPriorityScoreToLeadTemperature(100), "hot");
  assert.equal(legacyPriorityScoreToLeadTemperature(67), "hot");
  assert.equal(legacyPriorityScoreToLeadTemperature(66), "warm");
  assert.equal(legacyPriorityScoreToLeadTemperature(34), "warm");
  assert.equal(legacyPriorityScoreToLeadTemperature(33), "cold");
  assert.equal(legacyPriorityScoreToLeadTemperature(0), "cold");
});

test("legacy label mapping is deterministic", () => {
  assert.equal(legacyPriorityLabelToLeadTemperature("high"), "hot");
  assert.equal(legacyPriorityLabelToLeadTemperature("medium"), "warm");
  assert.equal(legacyPriorityLabelToLeadTemperature("unscored"), "warm");
  assert.equal(legacyPriorityLabelToLeadTemperature("low"), "cold");
  assert.equal(legacyPriorityLabelToLeadTemperature("unknown"), null);
});

test("resolveLeadTemperature prefers canonical temperature, then legacy score", () => {
  assert.equal(resolveLeadTemperature("cold", 99), "cold");
  assert.equal(resolveLeadTemperature("high", 99), "hot");
  assert.equal(resolveLeadTemperature("", 50), "warm");
  assert.equal(resolveLeadTemperature(null, 10), "cold");
});

test("legacy score bridge from canonical temperature remains deterministic", () => {
  assert.equal(leadTemperatureToLegacyPriorityScore("hot"), 85);
  assert.equal(leadTemperatureToLegacyPriorityScore("warm"), 50);
  assert.equal(leadTemperatureToLegacyPriorityScore("cold"), 20);
  assert.equal(LEAD_TEMPERATURE_LABEL.hot, "Hot");
  assert.equal(LEAD_TEMPERATURE_LABEL.warm, "Warm");
  assert.equal(LEAD_TEMPERATURE_LABEL.cold, "Cold");
});
