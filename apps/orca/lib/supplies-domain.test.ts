import assert from "node:assert/strict";
import test from "node:test";
import { calculateSuggestedQuantity, deriveSupplyReadiness, inferSupplyContexts, supplyWarningCodes } from "./supplies-domain";

test("quantity engine supports every V1 rule and missing context", () => {
  assert.equal(calculateSuggestedQuantity({ quantityRule: "PER_ATTENDEE", attendance: 41, quantityFactor: 1 }), 41);
  assert.equal(calculateSuggestedQuantity({ quantityRule: "PER_TABLE", tables: 7, quantityFactor: 2 }), 14);
  assert.equal(calculateSuggestedQuantity({ quantityRule: "PER_STATION", stations: 3, quantityFactor: 2 }), 6);
  assert.equal(calculateSuggestedQuantity({ quantityRule: "FIXED", fixedQuantity: 4 }), 4);
  assert.equal(calculateSuggestedQuantity({ quantityRule: "MANUAL" }), null);
  assert.equal(calculateSuggestedQuantity({ quantityRule: "PER_ATTENDEE", attendance: null }), null);
});

test("context inference is concise and always exposes accessibility", () => {
  assert.deepEqual(inferSupplyContexts({ sessionName: "Facilitated workshop", setupType: "Rounds" }), ["WORKSHOP", "ACCESSIBILITY"]);
  assert.deepEqual(inferSupplyContexts({ sessionName: "Lunch buffet" }), ["MEAL_SERVICE", "ACCESSIBILITY"]);
});

test("readiness separates blocked, incomplete, progress, and ready", () => {
  const complete = { quantity: 2, source: "Venue", responsibleUserId: "user-1", setupDeadline: "2027-01-01T09:00:00Z", fulfillment: "DELIVERED" as const, blocking: false };
  assert.equal(deriveSupplyReadiness({ notNeeded: true, allocations: [] }), "not_needed");
  assert.equal(deriveSupplyReadiness({ notNeeded: false, allocations: [{ ...complete, blocking: true }] }), "blocked");
  assert.equal(deriveSupplyReadiness({ notNeeded: false, allocations: [{ ...complete, responsibleUserId: null }] }), "needs_info");
  assert.equal(deriveSupplyReadiness({ notNeeded: false, allocations: [{ ...complete, fulfillment: "CONFIRMED" }] }), "needs_work");
  assert.equal(deriveSupplyReadiness({ notNeeded: false, allocations: [complete], sessionStart: "2027-01-01T10:00:00Z" }), "ready");
});

test("register warnings cover allocation and timing risks", () => {
  assert.deepEqual(supplyWarningCodes({ committed: 10, allocated: 12, missingInfo: true, blocked: false, timingRisk: true }), ["MISSING_INFO", "OVER_ALLOCATED", "TIMING_RISK"]);
});
