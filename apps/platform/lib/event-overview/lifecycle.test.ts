import assert from "node:assert/strict";
import test from "node:test";
import { deriveLifecycle } from "./lifecycle";
import { formatDateRange } from "./format";

const NOW = new Date("2026-08-21T15:00:00Z");

test("an event with no dates has an unknown lifecycle and no Now marker", () => {
  const lifecycle = deriveLifecycle({ startsAt: null, endsAt: null, now: NOW });
  assert.equal(lifecycle.phase, "unknown");
  assert.equal(lifecycle.markerPosition, null);
  assert.equal(lifecycle.label, "Dates not set");
});

test("before the event: days out, Planning, marker inside the Before third", () => {
  const lifecycle = deriveLifecycle({ startsAt: "2026-11-03T12:00:00Z", endsAt: "2026-11-05T12:00:00Z", now: NOW });
  assert.equal(lifecycle.phase, "before");
  if (lifecycle.phase !== "before") return;
  assert.equal(lifecycle.daysOut, 74);
  assert.equal(lifecycle.label, "74 days out");
  assert.equal(lifecycle.phaseLabel, "Planning");
  assert.ok(lifecycle.markerPosition > 0 && lifecycle.markerPosition < 1 / 3);
});

test("the marker moves right as the event approaches and rests at the left edge far out", () => {
  const far = deriveLifecycle({ startsAt: "2027-08-21T12:00:00Z", endsAt: null, now: NOW });
  const near = deriveLifecycle({ startsAt: "2026-08-25T12:00:00Z", endsAt: null, now: NOW });
  assert.equal(far.markerPosition, 0);
  assert.ok((near.markerPosition ?? 0) > (far.markerPosition ?? 0));
});

test("during the event: day index, Live, marker inside the During third", () => {
  const lifecycle = deriveLifecycle({
    startsAt: "2026-08-20T12:00:00Z",
    endsAt: "2026-08-22T12:00:00Z",
    now: NOW,
  });
  assert.equal(lifecycle.phase, "during");
  if (lifecycle.phase !== "during") return;
  assert.equal(lifecycle.dayIndex, 2);
  assert.equal(lifecycle.dayCount, 3);
  assert.equal(lifecycle.label, "Live · day 2 of 3");
  assert.ok(lifecycle.markerPosition > 1 / 3 && lifecycle.markerPosition < 2 / 3);
});

test("after the event: days since, Wrap-up, marker inside the After third", () => {
  const lifecycle = deriveLifecycle({ startsAt: "2026-08-01T12:00:00Z", endsAt: "2026-08-03T12:00:00Z", now: NOW });
  assert.equal(lifecycle.phase, "after");
  if (lifecycle.phase !== "after") return;
  assert.equal(lifecycle.daysSince, 18);
  assert.equal(lifecycle.phaseLabel, "Wrap-up");
  assert.ok(lifecycle.markerPosition > 2 / 3 && lifecycle.markerPosition <= 1);
});

test("calendar days are placed in the event's timezone", () => {
  // 03:00Z on Aug 22 is still Aug 21 in Los Angeles: the event is live there, over in UTC.
  const instant = new Date("2026-08-22T03:00:00Z");
  const la = deriveLifecycle({ startsAt: "2026-08-21T12:00:00Z", endsAt: "2026-08-21T12:00:00Z", timeZone: "America/Los_Angeles", now: instant });
  const utc = deriveLifecycle({ startsAt: "2026-08-21T12:00:00Z", endsAt: "2026-08-21T12:00:00Z", timeZone: null, now: instant });
  assert.equal(la.phase, "during");
  assert.equal(utc.phase, "after");
});

test("an invalid timezone falls back to UTC instead of throwing", () => {
  assert.doesNotThrow(() =>
    deriveLifecycle({ startsAt: "2026-08-21T12:00:00Z", endsAt: null, timeZone: "Not/AZone", now: NOW }),
  );
});

test("a single date, or only an end date, still yields a lifecycle", () => {
  assert.equal(deriveLifecycle({ startsAt: "2026-09-01T12:00:00Z", endsAt: null, now: NOW }).phase, "before");
  assert.equal(deriveLifecycle({ startsAt: null, endsAt: "2026-08-01T12:00:00Z", now: NOW }).phase, "after");
});

test("date ranges read the way the dashboard shows them", () => {
  assert.equal(formatDateRange("2026-11-03T12:00:00Z", "2026-11-05T12:00:00Z"), "Nov 3–5, 2026");
  assert.equal(formatDateRange("2026-11-30T12:00:00Z", "2026-12-02T12:00:00Z"), "Nov 30 – Dec 2, 2026");
  assert.equal(formatDateRange("2026-12-30T12:00:00Z", "2027-01-02T12:00:00Z"), "Dec 30, 2026 – Jan 2, 2027");
  assert.equal(formatDateRange("2026-11-03T12:00:00Z", null), "Nov 3, 2026");
  assert.equal(formatDateRange(null, null), null);
});
