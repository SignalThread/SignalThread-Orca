import assert from "node:assert/strict";
import test from "node:test";
import { normalizeExhibitorLeadPatch } from "@/lib/leads/exhibitorLeadPatch";

test("normalizePatch writes canonical temperature directly", () => {
  const result = normalizeExhibitorLeadPatch({ temperature: "warm" });
  assert.equal(result.error, null);
  assert.deepEqual(result.patch, { temperature: "warm" });
});

test("normalizePatch rejects invalid temperature values", () => {
  const result = normalizeExhibitorLeadPatch({ temperature: "high" });
  assert.equal(result.patch, null);
  assert.equal(result.error, "temperature must be one of: hot, warm, cold.");
});

test("normalizePatch allows clearing temperature to unassessed", () => {
  const result = normalizeExhibitorLeadPatch({ temperature: null });
  assert.equal(result.error, null);
  assert.deepEqual(result.patch, { temperature: null });
});

test("normalizePatch maps legacy priority_score payload to canonical temperature", () => {
  const hot = normalizeExhibitorLeadPatch({ priority_score: 99 });
  assert.equal(hot.error, null);
  assert.deepEqual(hot.patch, { temperature: "hot" });

  const warm = normalizeExhibitorLeadPatch({ priority_score: 50 });
  assert.equal(warm.error, null);
  assert.deepEqual(warm.patch, { temperature: "warm" });

  const cold = normalizeExhibitorLeadPatch({ priority_score: 10 });
  assert.equal(cold.error, null);
  assert.deepEqual(cold.patch, { temperature: "cold" });
});

test("normalizePatch accepts follow_up_date and null clear", () => {
  const setDate = normalizeExhibitorLeadPatch({ follow_up_date: "2026-04-20" });
  assert.equal(setDate.error, null);
  assert.deepEqual(setDate.patch, { follow_up_date: "2026-04-20" });

  const clearDate = normalizeExhibitorLeadPatch({ follow_up_date: null });
  assert.equal(clearDate.error, null);
  assert.deepEqual(clearDate.patch, { follow_up_date: null });
});

test("normalizePatch stores canonical follow-up time and keeps the mobile date in sync", () => {
  const result = normalizeExhibitorLeadPatch({ follow_up_at: "2026-08-06T14:30:00.000Z", follow_up_note: "Call after lunch" });
  assert.deepEqual(result.patch, { follow_up_at: "2026-08-06T14:30:00.000Z", follow_up_date: "2026-08-06", follow_up_note: "Call after lunch" });
});

test("normalizePatch rejects invalid follow_up_date format", () => {
  const bad = normalizeExhibitorLeadPatch({ follow_up_date: "04/20/2026" });
  assert.equal(bad.patch, null);
  assert.equal(bad.error, "follow_up_date must be YYYY-MM-DD.");
});

test("normalizePatch trims and clears nullable phone values", () => {
  const setPhone = normalizeExhibitorLeadPatch({ phone: " +1 212 555 0199 " });
  assert.equal(setPhone.error, null);
  assert.equal(setPhone.patch?.phone, "+1 212 555 0199");

  const clearPhone = normalizeExhibitorLeadPatch({ phone: "  " });
  assert.equal(clearPhone.error, null);
  assert.equal(clearPhone.patch?.phone, null);
});
