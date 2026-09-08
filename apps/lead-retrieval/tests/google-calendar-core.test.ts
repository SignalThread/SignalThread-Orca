import assert from "node:assert/strict";
import test from "node:test";
import {
  deterministicGoogleEventId,
  normalizeBusyWindows,
  suggestAvailableMeetingTimes,
  suggestAvailableMeetingTimesWithDiagnostics,
  zonedLocalToIso
} from "../lib/integrations/google/calendar-core";

test("free/busy windows are clamped, sorted, and merged before suggestions", () => {
  const rangeStart = "2026-07-31T13:00:00.000Z";
  const rangeEnd = "2026-07-31T17:00:00.000Z";
  const busy = normalizeBusyWindows([
    { start: "2026-07-31T14:30:00.000Z", end: "2026-07-31T15:30:00.000Z" },
    { start: "2026-07-31T14:00:00.000Z", end: "2026-07-31T15:00:00.000Z" },
    { start: "2026-07-31T12:00:00.000Z", end: "2026-07-31T13:30:00.000Z" }
  ], rangeStart, rangeEnd);
  assert.deepEqual(busy, [
    { start: rangeStart, end: "2026-07-31T13:30:00.000Z" },
    { start: "2026-07-31T14:00:00.000Z", end: "2026-07-31T15:30:00.000Z" }
  ]);
  assert.deepEqual(suggestAvailableMeetingTimes({ rangeStart, rangeEnd, durationMinutes: 30, busy, limit: 3 }), [
    { start: "2026-07-31T13:30:00.000Z", end: "2026-07-31T14:00:00.000Z" },
    { start: "2026-07-31T15:30:00.000Z", end: "2026-07-31T16:00:00.000Z" },
    { start: "2026-07-31T16:00:00.000Z", end: "2026-07-31T16:30:00.000Z" }
  ]);
});

test("canonical slot generation never suggests a time before an afternoon selected start", () => {
  const suggestions = suggestAvailableMeetingTimes({
    rangeStart: "2026-08-03T18:30:00.000Z", // 2:30 PM America/New_York
    rangeEnd: "2026-08-03T21:00:00.000Z", // 5:00 PM America/New_York
    durationMinutes: 30,
    busy: []
  });
  assert.deepEqual(suggestions.map((slot) => slot.start), [
    "2026-08-03T18:30:00.000Z",
    "2026-08-03T19:00:00.000Z",
    "2026-08-03T19:30:00.000Z",
    "2026-08-03T20:00:00.000Z",
    "2026-08-03T20:30:00.000Z"
  ]);
  assert.ok(suggestions.every((slot) => Date.parse(slot.start) >= Date.parse("2026-08-03T18:30:00.000Z")));
});

test("canonical slot generation returns no slots when no full meeting remains that day", () => {
  assert.deepEqual(suggestAvailableMeetingTimes({
    rangeStart: "2026-08-03T20:45:00.000Z", // 4:45 PM America/New_York
    rangeEnd: "2026-08-03T21:00:00.000Z", // 5:00 PM America/New_York
    durationMinutes: 30,
    busy: []
  }), []);
});

test("slot diagnostics account for busy, window-end, and result-limit filters", () => {
  const result = suggestAvailableMeetingTimesWithDiagnostics({
    rangeStart: "2026-08-03T18:30:00.000Z",
    rangeEnd: "2026-08-03T21:00:00.000Z",
    durationMinutes: 30,
    busy: [{ start: "2026-08-03T19:00:00.000Z", end: "2026-08-03T19:30:00.000Z" }],
    limit: 2
  });
  assert.deepEqual(result.suggestions.map((slot) => slot.start), [
    "2026-08-03T18:30:00.000Z",
    "2026-08-03T19:30:00.000Z"
  ]);
  assert.deepEqual(result.diagnostics, {
    candidatesConsidered: 5,
    removedByBusy: 1,
    removedByWindowEnd: 0,
    removedByLeadTime: 0,
    removedBySameDay: 0,
    returned: 2,
    truncatedByLimit: 2
  });
});

test("explicit IANA conversion handles DST and rejects nonexistent wall times", () => {
  assert.equal(zonedLocalToIso("2026-03-08T01:30", "America/New_York"), "2026-03-08T06:30:00.000Z");
  assert.equal(zonedLocalToIso("2026-03-08T02:30", "America/New_York"), null);
  assert.equal(zonedLocalToIso("2026-07-31T09:00", "UTC"), "2026-07-31T09:00:00.000Z");
  assert.equal(zonedLocalToIso("2026-07-31T09:00", "Not/AZone"), null);
});

test("event IDs are deterministic, retry-safe, and Google-compatible", () => {
  const key = "10000000-0000-4000-8000-000000000001";
  const first = deterministicGoogleEventId(key);
  assert.equal(first, deterministicGoogleEventId(key));
  assert.match(first, /^[a-v0-9]{5,1024}$/);
  assert.notEqual(first, deterministicGoogleEventId("10000000-0000-4000-8000-000000000002"));
});
