// @lr area=provider-calendar severity=P1 layer=provider category=local-only
/**
 * Calendar availability — plan §47, Tier 1 (see `docs/testing/PROVIDER_TEST_TIERS.md`).
 *
 * Slot generation is entirely ours: given a range, a duration and a set of busy windows,
 * the suggestions are pure arithmetic. That makes the whole of it Tier 1 — deterministic,
 * no network, every commit — which is the §76 argument in miniature.
 *
 * Includes the named regression from Prompt 10 item 5: **a 2:30 PM request must not return
 * slots earlier than 2:30 PM.** An off-by-one in the cursor start, or a range silently
 * snapped to the top of the day, would offer the user a meeting in the past.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isIanaTimeZone as eventCalendarIsIana } from "../../lib/events/event-calendar";
import {
  normalizeBusyWindows,
  suggestAvailableMeetingTimes,
  suggestAvailableMeetingTimesWithDiagnostics,
  zonedLocalToIso,
  isIanaTimeZone,
  type BusyWindow,
} from "../../lib/integrations/google/calendar-core";

const suggest = (over: Partial<Parameters<typeof suggestAvailableMeetingTimes>[0]> = {}) =>
  suggestAvailableMeetingTimes({
    rangeStart: "2026-08-12T14:00:00.000Z",
    rangeEnd: "2026-08-12T18:00:00.000Z",
    durationMinutes: 30,
    busy: [],
    ...over,
  });

// ── the afternoon-start regression ─────────────────────────────────────────────────

describe("a mid-afternoon request never returns earlier slots (item 5 regression)", () => {
  it("a 2:30 PM range start yields no slot before 2:30 PM", () => {
    const slots = suggest({ rangeStart: "2026-08-12T14:30:00.000Z", rangeEnd: "2026-08-12T18:00:00.000Z" });
    assert.ok(slots.length > 0, "there should be availability in a free afternoon");
    for (const slot of slots) {
      assert.ok(
        Date.parse(slot.start) >= Date.parse("2026-08-12T14:30:00.000Z"),
        `returned a slot at ${slot.start}, earlier than the 2:30 PM request`
      );
    }
  });

  it("the first slot is exactly the requested start when that time is free", () => {
    const slots = suggest({ rangeStart: "2026-08-12T14:30:00.000Z" });
    assert.equal(slots[0].start, "2026-08-12T14:30:00.000Z", "the range start must not be snapped to the hour");
  });

  it("an odd-minute start is honoured exactly, not rounded", () => {
    const slots = suggest({ rangeStart: "2026-08-12T14:37:00.000Z" });
    assert.equal(slots[0].start, "2026-08-12T14:37:00.000Z");
  });

  it("no slot ever starts in the past relative to the range", () => {
    for (const start of ["2026-08-12T14:00:00.000Z", "2026-08-12T15:15:00.000Z", "2026-08-12T17:00:00.000Z"]) {
      for (const slot of suggest({ rangeStart: start })) {
        assert.ok(Date.parse(slot.start) >= Date.parse(start), `${slot.start} precedes range start ${start}`);
      }
    }
  });
});

// ── boundary inclusivity ───────────────────────────────────────────────────────────

describe("range boundaries are exact (§47)", () => {
  it("a slot may end exactly at the range end", () => {
    const slots = suggest({ rangeStart: "2026-08-12T17:00:00.000Z", rangeEnd: "2026-08-12T17:30:00.000Z" });
    assert.deepStrictEqual(slots, [{ start: "2026-08-12T17:00:00.000Z", end: "2026-08-12T17:30:00.000Z" }]);
  });

  it("a slot that would overrun the range end is dropped", () => {
    const slots = suggest({ rangeStart: "2026-08-12T17:00:00.000Z", rangeEnd: "2026-08-12T17:29:00.000Z" });
    assert.deepStrictEqual(slots, [], "a 30-minute meeting does not fit in 29 minutes");
  });

  it("reports why a candidate was dropped rather than silently returning fewer", () => {
    const { diagnostics } = suggestAvailableMeetingTimesWithDiagnostics({
      rangeStart: "2026-08-12T17:00:00.000Z",
      rangeEnd: "2026-08-12T17:29:00.000Z",
      durationMinutes: 30,
      busy: [],
    });
    assert.ok(diagnostics.removedByWindowEnd > 0, "the reason must be attributable");
    assert.equal(diagnostics.returned, 0);
  });

  it("an inverted or zero-length range yields nothing rather than throwing", () => {
    assert.deepStrictEqual(suggest({ rangeEnd: "2026-08-12T13:00:00.000Z" }), []);
    assert.deepStrictEqual(suggest({ rangeEnd: "2026-08-12T14:00:00.000Z" }), []);
  });

  it("an unparseable range yields nothing rather than NaN slots", () => {
    assert.deepStrictEqual(suggest({ rangeStart: "not-a-date" }), []);
    assert.deepStrictEqual(suggest({ rangeEnd: "" }), []);
  });

  it("a sub-minimum duration yields nothing", () => {
    assert.deepStrictEqual(suggest({ durationMinutes: 0 }), []);
    assert.deepStrictEqual(suggest({ durationMinutes: -30 }), []);
  });
});

// ── busy windows ───────────────────────────────────────────────────────────────────

describe("busy windows remove exactly the overlapping slots", () => {
  const busy = (start: string, end: string): BusyWindow => ({ start, end });

  it("a slot fully inside a busy window is removed", () => {
    const slots = suggest({ busy: [busy("2026-08-12T14:00:00.000Z", "2026-08-12T15:00:00.000Z")] });
    assert.ok(!slots.some((s) => s.start === "2026-08-12T14:00:00.000Z"));
    assert.ok(!slots.some((s) => s.start === "2026-08-12T14:30:00.000Z"));
    assert.ok(slots.some((s) => s.start === "2026-08-12T15:00:00.000Z"), "the slot after the meeting is free");
  });

  it("a slot that merely touches a busy window is NOT removed", () => {
    // Back-to-back meetings are legal: busy 14:00-14:30 leaves 14:30 free.
    const slots = suggest({ busy: [busy("2026-08-12T14:00:00.000Z", "2026-08-12T14:30:00.000Z")] });
    assert.ok(slots.some((s) => s.start === "2026-08-12T14:30:00.000Z"), "adjacency is not overlap");
  });

  it("a slot partially overlapping the start of a busy window is removed", () => {
    const slots = suggest({ busy: [busy("2026-08-12T14:15:00.000Z", "2026-08-12T14:45:00.000Z")] });
    assert.ok(!slots.some((s) => s.start === "2026-08-12T14:00:00.000Z"), "14:00-14:30 overlaps 14:15");
  });

  it("overlapping busy windows are merged rather than double-counted", () => {
    const merged = normalizeBusyWindows(
      [
        busy("2026-08-12T14:00:00.000Z", "2026-08-12T15:00:00.000Z"),
        busy("2026-08-12T14:30:00.000Z", "2026-08-12T16:00:00.000Z"),
      ],
      "2026-08-12T14:00:00.000Z",
      "2026-08-12T18:00:00.000Z"
    );
    assert.equal(merged.length, 1, "two overlapping meetings are one busy block");
    assert.equal(merged[0].start, "2026-08-12T14:00:00.000Z");
    assert.equal(merged[0].end, "2026-08-12T16:00:00.000Z");
  });

  it("busy windows outside the range are ignored", () => {
    const slots = suggest({ busy: [busy("2026-08-11T09:00:00.000Z", "2026-08-11T17:00:00.000Z")] });
    assert.ok(slots.length > 0, "yesterday's meetings must not block today");
  });

  it("a busy window covering the whole range leaves no availability", () => {
    const slots = suggest({ busy: [busy("2026-08-12T13:00:00.000Z", "2026-08-12T19:00:00.000Z")] });
    assert.deepStrictEqual(slots, []);
  });

  it("removal is attributed to busy, not to the window end", () => {
    const { diagnostics } = suggestAvailableMeetingTimesWithDiagnostics({
      rangeStart: "2026-08-12T14:00:00.000Z",
      rangeEnd: "2026-08-12T18:00:00.000Z",
      durationMinutes: 30,
      busy: [busy("2026-08-12T13:00:00.000Z", "2026-08-12T19:00:00.000Z")],
    });
    assert.ok(diagnostics.removedByBusy > 0);
    assert.equal(diagnostics.returned, 0);
  });
});

// ── the two-week horizon and limits ────────────────────────────────────────────────

describe("scheduling horizon and result bounds (§47)", () => {
  it("spans a full two-week horizon without gaps", () => {
    const slots = suggest({
      rangeStart: "2026-08-12T14:00:00.000Z",
      rangeEnd: "2026-08-26T14:00:00.000Z",
      limit: 1000,
    });
    assert.ok(slots.length > 0);
    const last = Date.parse(slots[slots.length - 1].end);
    assert.ok(last <= Date.parse("2026-08-26T14:00:00.000Z"), "no slot may exceed the horizon");
  });

  it("caps results at the requested limit", () => {
    assert.equal(suggest({ rangeEnd: "2026-08-12T23:00:00.000Z", limit: 3 }).length, 3);
  });

  it("reports truncation rather than silently returning fewer (§40)", () => {
    const { suggestions, diagnostics } = suggestAvailableMeetingTimesWithDiagnostics({
      rangeStart: "2026-08-12T14:00:00.000Z",
      rangeEnd: "2026-08-12T23:00:00.000Z",
      durationMinutes: 30,
      busy: [],
      limit: 3,
    });
    assert.equal(suggestions.length, 3);
    assert.ok(diagnostics.truncatedByLimit > 0, "truncation must be visible, not silent");
  });

  it("honours the step interval", () => {
    const slots = suggest({ stepMinutes: 60, rangeEnd: "2026-08-12T17:00:00.000Z" });
    assert.deepStrictEqual(
      slots.map((s) => s.start),
      ["2026-08-12T14:00:00.000Z", "2026-08-12T15:00:00.000Z", "2026-08-12T16:00:00.000Z"]
    );
  });

  it("clamps an absurd step rather than producing millions of candidates", () => {
    assert.ok(suggest({ stepMinutes: 0 }).length > 0, "a zero step must not hang or return nothing");
  });

  it("declares no hidden lead-time or same-day filtering", () => {
    // The diagnostics expose these counters explicitly so production output cannot imply
    // that an invisible filter removed otherwise valid slots.
    const { diagnostics } = suggestAvailableMeetingTimesWithDiagnostics({
      rangeStart: "2026-08-12T14:00:00.000Z",
      rangeEnd: "2026-08-12T18:00:00.000Z",
      durationMinutes: 30,
      busy: [],
    });
    assert.equal(diagnostics.removedByLeadTime, 0);
    assert.equal(diagnostics.removedBySameDay, 0);
  });

  it("candidatesConsidered accounts for every slot examined", () => {
    const { suggestions, diagnostics } = suggestAvailableMeetingTimesWithDiagnostics({
      rangeStart: "2026-08-12T14:00:00.000Z",
      rangeEnd: "2026-08-12T16:00:00.000Z",
      durationMinutes: 30,
      busy: [],
    });
    assert.equal(
      diagnostics.candidatesConsidered,
      suggestions.length + diagnostics.removedByBusy + diagnostics.removedByWindowEnd + diagnostics.truncatedByLimit,
      "every considered candidate must be accounted for in exactly one bucket"
    );
  });
});

// ── timezone handling ──────────────────────────────────────────────────────────────

describe("timezone conversion for the slot picker", () => {
  it("accepts real IANA zones", () => {
    assert.equal(isIanaTimeZone("America/New_York"), true);
    assert.equal(isIanaTimeZone("UTC"), true);
  });

  it("rejects obvious rubbish", () => {
    assert.equal(isIanaTimeZone("GMT+5"), false);
    assert.equal(isIanaTimeZone(""), false);
    assert.equal(isIanaTimeZone("Nope/Nope"), false);
  });

  /**
   * LR-PROD-013 — the calendar picker accepts FIXED-OFFSET zone identifiers, which cannot
   * express DST, and a meeting booked with one lands an hour off for half the year.
   *
   * There are two `isIanaTimeZone` implementations with different strictness:
   *
   *   lib/events/event-calendar.ts        strict — requires "UTC" or a "/" → rejects "EST"
   *   lib/integrations/google/calendar-core.ts  permissive — anything Intl accepts
   *
   * `"EST"` is a fixed UTC-5 zone. Booking 2:30 PM with it yields 19:30Z in BOTH August and
   * January, whereas `America/New_York` correctly yields 18:30Z in August (EDT). So an
   * August meeting is created **one hour late**.
   */
  it("DOCUMENTED: a fixed-offset zone is accepted and books an hour late in summer (LR-PROD-013)", () => {
    assert.equal(isIanaTimeZone("EST"), true, "calendar-core accepts it today");

    const augustEst = zonedLocalToIso("2026-08-12T14:30", "EST");
    const augustNy = zonedLocalToIso("2026-08-12T14:30", "America/New_York");
    assert.equal(augustEst, "2026-08-12T19:30:00.000Z");
    assert.equal(augustNy, "2026-08-12T18:30:00.000Z");
    assert.notEqual(augustEst, augustNy, "same wall clock, one hour apart — the meeting is wrong");

    // In January the two agree, which is why this survives casual testing.
    assert.equal(zonedLocalToIso("2026-01-12T14:30", "EST"), zonedLocalToIso("2026-01-12T14:30", "America/New_York"));
  });

  it("DOCUMENTED: the two validators disagree on the same input (LR-PROD-013)", () => {
    // The event dashboard would reject exactly what the calendar picker accepts.
    assert.equal(isIanaTimeZone("EST"), true);
    assert.equal(eventCalendarIsIana("EST"), false);
    assert.equal(isIanaTimeZone("EST5EDT"), true);
    assert.equal(eventCalendarIsIana("EST5EDT"), false);
  });

  // KNOWN-DEFECT: LR-PROD-013 — reject fixed-offset identifiers, and use one validator.
  it.skip("KNOWN-DEFECT: LR-PROD-013 — fixed-offset zone identifiers are rejected", () => {
    for (const fixed of ["EST", "EST5EDT", "Etc/GMT+5"]) {
      assert.equal(isIanaTimeZone(fixed), false, `${fixed} cannot express DST and must be rejected`);
    }
  });

  it("converts a local wall-clock time to the correct instant", () => {
    // 2:30 PM in New York during EDT is 18:30 UTC.
    assert.equal(zonedLocalToIso("2026-08-12T14:30", "America/New_York"), "2026-08-12T18:30:00.000Z");
  });

  it("applies the correct offset either side of a DST change", () => {
    // EDT (UTC-4) in August, EST (UTC-5) in January — same wall clock, different instants.
    assert.equal(zonedLocalToIso("2026-08-12T14:30", "America/New_York"), "2026-08-12T18:30:00.000Z");
    assert.equal(zonedLocalToIso("2026-01-12T14:30", "America/New_York"), "2026-01-12T19:30:00.000Z");
  });

  it("a slot requested at 2:30 PM local stays 2:30 PM local", () => {
    // The regression end to end: convert local → instant, generate, and the first slot
    // must be the requested wall-clock time.
    // `zonedLocalToIso` returns null for an unparseable local value; assert it converted
    // rather than silently passing null through as an "absent" range bound.
    const rangeStart = zonedLocalToIso("2026-08-12T14:30", "America/New_York");
    const rangeEnd = zonedLocalToIso("2026-08-12T18:00", "America/New_York");
    assert.ok(rangeStart && rangeEnd, "both bounds must convert");
    const slots = suggest({ rangeStart, rangeEnd });
    assert.equal(slots[0].start, rangeStart);
    assert.equal(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(slots[0].start)),
      "2:30 PM"
    );
  });
});
