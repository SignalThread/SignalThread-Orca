import assert from "node:assert/strict";
import test from "node:test";
import {
  getEventDateBoundaries,
  calendarDayDistanceToInstant,
  eventCalendarDayStart,
  isDateOnlyOverdue,
  isInstantOverdue,
  isInstantThisWeek,
  isInstantToday,
  resolveEventTimezone,
} from "@/lib/event-time-boundaries";

test("event timezone controls the calendar day before and after UTC rollover", () => {
  const beforeNewYorkMidnight = getEventDateBoundaries(new Date("2026-07-29T03:30:00.000Z"), "America/New_York");
  assert.equal(beforeNewYorkMidnight.localDate, "2026-07-28");

  const afterKiritimatiMidnight = getEventDateBoundaries(new Date("2026-07-28T14:30:00.000Z"), "Pacific/Kiritimati");
  assert.equal(afterKiritimatiMidnight.localDate, "2026-07-29");
});
test("date-only records remain due today and become overdue only after the local day ends", () => {
  const today = getEventDateBoundaries(new Date("2026-07-28T20:00:00.000Z"), "America/New_York");
  assert.equal(isDateOnlyOverdue("2026-07-28", today), false);
  const nextDay = getEventDateBoundaries(new Date("2026-07-29T04:01:00.000Z"), "America/New_York");
  assert.equal(isDateOnlyOverdue("2026-07-28", nextDay), true);
});

test("datetime records compare by their actual instant, including later today", () => {
  const boundaries = getEventDateBoundaries(new Date("2026-07-28T16:00:00.000Z"), "America/New_York");
  assert.equal(isInstantToday(new Date("2026-07-28T22:00:00.000Z"), boundaries), true);
  assert.equal(isInstantOverdue(new Date("2026-07-28T22:00:00.000Z"), boundaries), false);
  assert.equal(isInstantOverdue(new Date("2026-07-28T15:59:59.000Z"), boundaries), true);
});

test("this week uses Monday start and an exclusive next-Monday boundary", () => {
  const boundaries = getEventDateBoundaries(new Date("2026-07-29T16:00:00.000Z"), "America/New_York");
  assert.equal(boundaries.weekStart, "2026-07-27T04:00:00.000Z");
  assert.equal(boundaries.weekEndExclusive, "2026-08-03T04:00:00.000Z");
  assert.equal(isInstantThisWeek(new Date("2026-08-03T03:59:59.000Z"), boundaries), true);
  assert.equal(isInstantThisWeek(new Date("2026-08-03T04:00:00.000Z"), boundaries), false);
});

test("calendar boundaries remain stable across a year boundary", () => {
  const boundaries = getEventDateBoundaries(new Date("2026-12-31T18:00:00.000Z"), "UTC");
  assert.equal(boundaries.localDate, "2026-12-31");
  assert.equal(boundaries.tomorrowStart, "2027-01-01T00:00:00.000Z");
});

test("daylight-saving transitions produce the correct variable-length local day", () => {
  const boundaries = getEventDateBoundaries(new Date("2026-03-08T16:00:00.000Z"), "America/New_York");
  assert.equal(boundaries.todayStart, "2026-03-08T05:00:00.000Z");
  assert.equal(boundaries.tomorrowStart, "2026-03-09T04:00:00.000Z");
  assert.equal(new Date(boundaries.tomorrowStart).getTime() - new Date(boundaries.todayStart).getTime(), 23 * 60 * 60 * 1000);
});

test("missing and invalid event timezones use the application fallback, then UTC", () => {
  assert.deepEqual(resolveEventTimezone(null), {
    resolvedTimezone: "America/New_York",
    timezoneSource: "application_fallback",
  });
  assert.deepEqual(resolveEventTimezone("Not/AZone"), {
    resolvedTimezone: "America/New_York",
    timezoneSource: "application_fallback",
  });
  assert.deepEqual(resolveEventTimezone("Not/AZone", "Also/Invalid"), {
    resolvedTimezone: "UTC",
    timezoneSource: "utc_fallback",
  });
});

test("an injected reference instant produces stable boundaries", () => {
  const reference = new Date("2026-11-01T05:30:00.000Z");
  assert.deepEqual(
    getEventDateBoundaries(reference, "America/New_York"),
    getEventDateBoundaries(reference, "America/New_York"),
  );
});

test("calendar offsets and distances retain event-local dates across DST", () => {
  const boundaries = getEventDateBoundaries(new Date("2026-03-07T17:00:00.000Z"), "America/New_York");
  assert.equal(eventCalendarDayStart(boundaries, 2).toISOString(), "2026-03-09T04:00:00.000Z");
  assert.equal(calendarDayDistanceToInstant(new Date("2026-03-09T18:00:00.000Z"), boundaries), 2);
});
