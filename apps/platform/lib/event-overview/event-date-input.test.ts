import assert from "node:assert/strict";
import test from "node:test";
import { parseEventDate } from "./event-date-input";
import { deriveLifecycle } from "./lifecycle";
import { formatDateRange } from "./format";

test("event calendar days survive timezone offsets and DST without changing the selected date", () => {
  for (const zone of ["UTC", "Pacific/Kiritimati", "Pacific/Pago_Pago", "America/Los_Angeles", "Asia/Kathmandu"]) {
    for (const day of ["2026-03-08", "2026-11-01", "2026-11-03"]) {
      const value = parseEventDate(day, zone);
      assert.ok(value);
      const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
      assert.equal(["year", "month", "day"].map((key) => parts.find((p) => p.type === key)!.value).join("-"), day);
      assert.equal(deriveLifecycle({ startsAt: value, endsAt: value, timeZone: zone, now: new Date(value) }).phase, "during");
    }
  }
});

test("malformed, rolled-over and skipped calendar days are rejected", () => {
  for (const input of ["2026-02-30", "2026-02-29", "2026-13-01", "bad", "2026-1-1"]) assert.equal(parseEventDate(input), false);
  assert.equal(parseEventDate("2011-12-30", "Pacific/Apia"), false);
  assert.equal(parseEventDate("2026-11-03", "invalid/timezone"), false);
  assert.equal(parseEventDate(null), null);
  assert.equal(formatDateRange(parseEventDate("2028-02-29") as string, null), "Feb 29, 2028");
});

test("invalid and reversed event ranges never invent a live lifecycle marker", () => {
  for (const range of [
    { startsAt: "invalid", endsAt: "2026-11-05T00:00:00Z" },
    { startsAt: "2026-11-05T00:00:00Z", endsAt: "2026-11-03T00:00:00Z" },
  ]) {
    const lifecycle = deriveLifecycle({ ...range, now: new Date("2026-11-05T12:00:00Z") });
    assert.equal(lifecycle.phase, "unknown");
    assert.equal(lifecycle.markerPosition, null);
    assert.equal(lifecycle.label, "Check event dates");
  }
});
