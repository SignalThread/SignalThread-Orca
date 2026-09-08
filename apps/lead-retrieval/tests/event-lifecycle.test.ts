import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  currentUtcYmd,
  describeEventTiming,
  normalizeYmd,
  resolveEventLifecycle,
  type EventLifecycleSource
} from "@/lib/events/event-lifecycle";

function source(partial: Partial<EventLifecycleSource>): EventLifecycleSource {
  return {
    start_date: "2026-03-18",
    end_date: "2026-03-20",
    status: "UPCOMING",
    container_kind: "event",
    ...partial
  };
}

describe("resolveEventLifecycle — date-derived boundaries (UTC calendar day, inclusive)", () => {
  it("day before start → upcoming", () => {
    assert.equal(resolveEventLifecycle(source({}), "2026-03-17").state, "upcoming");
  });

  it("start day → live (inclusive boundary)", () => {
    const r = resolveEventLifecycle(source({}), "2026-03-18");
    assert.equal(r.state, "live");
    assert.equal(r.reason, "date_range");
  });

  it("mid-event → live", () => {
    assert.equal(resolveEventLifecycle(source({}), "2026-03-19").state, "live");
  });

  it("end day → live (inclusive boundary)", () => {
    assert.equal(resolveEventLifecycle(source({}), "2026-03-20").state, "live");
  });

  it("day after end → completed", () => {
    const r = resolveEventLifecycle(source({}), "2026-03-21");
    assert.equal(r.state, "completed");
    assert.equal(r.reason, "date_range");
  });

  it("single-day event: live only on that day", () => {
    const oneDay = source({ start_date: "2026-05-01", end_date: "2026-05-01" });
    assert.equal(resolveEventLifecycle(oneDay, "2026-04-30").state, "upcoming");
    assert.equal(resolveEventLifecycle(oneDay, "2026-05-01").state, "live");
    assert.equal(resolveEventLifecycle(oneDay, "2026-05-02").state, "completed");
  });
});

describe("resolveEventLifecycle — stored-status precedence and correction", () => {
  it("stale ACTIVE status does not survive date correction after the end date", () => {
    const stale = source({ status: "ACTIVE" });
    assert.equal(resolveEventLifecycle(stale, "2026-04-15").state, "completed");
  });

  it("stale UPCOMING status does not survive date correction during the event", () => {
    const stale = source({ status: "UPCOMING" });
    assert.equal(resolveEventLifecycle(stale, "2026-03-19").state, "live");
  });

  it("explicit COMPLETED is terminal — honored even inside the date range", () => {
    const closedEarly = source({ status: "COMPLETED" });
    const r = resolveEventLifecycle(closedEarly, "2026-03-19");
    assert.equal(r.state, "completed");
    assert.equal(r.reason, "explicit_completed");
  });
});

describe("resolveEventLifecycle — missing and malformed dates", () => {
  it("only a start date: upcoming before it, live from it onward", () => {
    const openEnded = source({ end_date: null });
    assert.equal(resolveEventLifecycle(openEnded, "2026-03-17").state, "upcoming");
    assert.equal(resolveEventLifecycle(openEnded, "2026-03-18").state, "live");
    assert.equal(resolveEventLifecycle(openEnded, "2026-06-01").state, "live");
  });

  it("only an end date: live until it passes, completed after", () => {
    const endOnly = source({ start_date: null });
    assert.equal(resolveEventLifecycle(endOnly, "2026-03-20").state, "live");
    assert.equal(resolveEventLifecycle(endOnly, "2026-03-21").state, "completed");
  });

  it("no dates: stored status decides (ACTIVE → live, UPCOMING → upcoming)", () => {
    const noDates = source({ start_date: null, end_date: null });
    assert.equal(resolveEventLifecycle({ ...noDates, status: "ACTIVE" }, "2026-03-19").state, "live");
    const upcoming = resolveEventLifecycle({ ...noDates, status: "UPCOMING" }, "2026-03-19");
    assert.equal(upcoming.state, "upcoming");
    assert.equal(upcoming.reason, "status_fallback");
  });

  it("no dates and unknown/blank status → upcoming (readiness is the safest honest state)", () => {
    const noDates = source({ start_date: null, end_date: null });
    for (const status of [null, "", "DRAFT_LEGACY", "  "]) {
      const r = resolveEventLifecycle({ ...noDates, status }, "2026-03-19");
      assert.equal(r.state, "upcoming", `status=${JSON.stringify(status)}`);
      assert.equal(r.reason, "default_upcoming");
    }
  });

  it("malformed date strings are treated as missing, never crash", () => {
    const malformed = source({ start_date: "not-a-date", end_date: "2026-13-40", status: "ACTIVE" });
    const r = resolveEventLifecycle(malformed, "2026-03-19");
    assert.equal(r.state, "live");
    assert.equal(r.reason, "status_fallback");
  });

  it("status normalization: case and whitespace are tolerated", () => {
    const noDates = source({ start_date: null, end_date: null, status: "  active " });
    assert.equal(resolveEventLifecycle(noDates, "2026-03-19").state, "live");
    assert.equal(
      resolveEventLifecycle(source({ status: " completed " }), "2026-03-19").state,
      "completed"
    );
  });
});

describe("resolveEventLifecycle — continuous capture", () => {
  it("continuous_capture is always live regardless of dates and status", () => {
    const bucket = source({
      container_kind: "continuous_capture",
      start_date: null,
      end_date: null,
      status: "UPCOMING"
    });
    const r = resolveEventLifecycle(bucket, "2026-03-19");
    assert.equal(r.state, "live");
    assert.equal(r.reason, "continuous_capture");
  });
});

describe("normalizeYmd / currentUtcYmd", () => {
  it("accepts real calendar dates and rejects malformed or impossible ones", () => {
    assert.equal(normalizeYmd("2026-03-18"), "2026-03-18");
    assert.equal(normalizeYmd(" 2026-03-18 "), "2026-03-18");
    assert.equal(normalizeYmd("2026-13-40"), null);
    assert.equal(normalizeYmd("2026-02-30"), null);
    assert.equal(normalizeYmd("18-03-2026"), null);
    assert.equal(normalizeYmd(""), null);
    assert.equal(normalizeYmd(null), null);
  });

  it("currentUtcYmd formats the UTC calendar day", () => {
    assert.equal(currentUtcYmd(new Date("2026-03-18T23:59:59Z")), "2026-03-18");
    assert.equal(currentUtcYmd(new Date("2026-03-19T00:00:01Z")), "2026-03-19");
  });
});

describe("describeEventTiming — honest timing context only", () => {
  it("upcoming: opens-in countdown from the start date", () => {
    assert.equal(describeEventTiming(source({}), "2026-03-13", "upcoming"), "Opens in 5 days");
    assert.equal(describeEventTiming(source({}), "2026-03-17", "upcoming"), "Opens tomorrow");
  });

  it("upcoming without a start date claims nothing", () => {
    assert.equal(describeEventTiming(source({ start_date: null, end_date: null }), "2026-03-13", "upcoming"), null);
  });

  it("live: day N of M inside the range", () => {
    assert.equal(describeEventTiming(source({}), "2026-03-18", "live"), "Day 1 of 3");
    assert.equal(describeEventTiming(source({}), "2026-03-19", "live"), "Day 2 of 3");
    assert.equal(describeEventTiming(source({}), "2026-03-20", "live"), "Day 3 of 3");
  });

  it("live with only a start date: open-ended day counter", () => {
    assert.equal(describeEventTiming(source({ end_date: null }), "2026-03-19", "live"), "Day 2");
  });

  it("completed: wrapped-ago from the end date", () => {
    assert.equal(describeEventTiming(source({}), "2026-03-20", "completed"), "Wrapped today");
    assert.equal(describeEventTiming(source({}), "2026-03-21", "completed"), "Wrapped yesterday");
    assert.equal(describeEventTiming(source({}), "2026-03-24", "completed"), "Wrapped 4 days ago");
  });

  it("continuous capture never shows a countdown or day counter", () => {
    const bucket = source({ container_kind: "continuous_capture" });
    assert.equal(describeEventTiming(bucket, "2026-03-19", "live"), null);
  });
});
