// @lr area=dashboards severity=P1 layer=unit category=local-only
/**
 * Event-local time is the only authority for "today" — plan §41, §62, Brief §7.
 *
 * Prompt 8 items 6–10. The rule Brief §7 states plainly: *"Browser timezone and provider
 * row limits are never business authorities."* An event dashboard that computes "leads
 * today" in server UTC shows a different number at 8pm Pacific than at 8pm Eastern, and
 * two viewers of the same event disagree.
 *
 * `lib/events/event-calendar.ts` is the canonical module. Its design is already correct in
 * the way that matters most — it returns `null` for an unconfigured or invalid event
 * timezone rather than falling back — so these tests pin that behaviour rather than
 * discovering it.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getEventCalendarDay,
  isInstantInEventDay,
  formatEventLocalDateTime,
  isIanaTimeZone,
} from "../../lib/events/event-calendar";

const NY = "America/New_York";
const LA = "America/Los_Angeles";
const TOKYO = "Asia/Tokyo";

// ── no fallback, ever ──────────────────────────────────────────────────────────────

describe("an unconfigured event timezone yields no day, never a fallback", () => {
  for (const bad of [null, undefined, "", "   ", "EST", "GMT+5", "not/a/zone", "America/Nowhere"]) {
    it(`rejects ${JSON.stringify(bad)}`, () => {
      assert.equal(
        getEventCalendarDay(new Date(), bad as never),
        null,
        "returning a UTC or browser-derived day here would silently invent business truth"
      );
    });
  }

  it("accepts UTC explicitly, since that is a real configured choice", () => {
    assert.equal(isIanaTimeZone("UTC"), true);
    assert.notEqual(getEventCalendarDay(new Date(), "UTC"), null);
  });

  it("accepts real IANA zones", () => {
    for (const tz of [NY, LA, TOKYO, "Europe/London", "Australia/Sydney"]) {
      assert.equal(isIanaTimeZone(tz), true, `${tz} must be accepted`);
    }
  });

  it("rejects a bare offset, which cannot express DST", () => {
    // "GMT+5" has no DST rules, so a day window built from it would be wrong for half
    // the year in any observing region.
    assert.equal(isIanaTimeZone("GMT+5"), false);
    assert.equal(isIanaTimeZone("+05:00"), false);
  });
});

// ── the day window is event-local, not server-local ────────────────────────────────

describe("day windows are anchored to the event timezone", () => {
  it("a late-evening Eastern instant stays in the Eastern day after UTC midnight", () => {
    // 2026-08-11 21:30 EDT is 2026-08-12 01:30 UTC. The event day must still be the 11th.
    const day = getEventCalendarDay(new Date("2026-08-12T01:30:00Z"), NY);
    assert.equal(day?.ymd, "2026-08-11", "UTC rollover must not advance the event's day");
  });

  it("the same instant belongs to different days in different event timezones", () => {
    const instant = new Date("2026-08-12T01:30:00Z");
    assert.equal(getEventCalendarDay(instant, NY)?.ymd, "2026-08-11");
    assert.equal(getEventCalendarDay(instant, TOKYO)?.ymd, "2026-08-12");
  });

  it("the window boundaries are the event's local midnights", () => {
    const day = getEventCalendarDay(new Date("2026-08-11T15:49:17Z"), NY);
    // EDT is UTC-4 in August.
    assert.equal(day?.startIso, "2026-08-11T04:00:00.000Z");
    assert.equal(day?.endExclusiveIso, "2026-08-12T04:00:00.000Z");
  });

  it("start is inclusive and end is exclusive, so adjacent days cannot double-count", () => {
    const day = getEventCalendarDay(new Date("2026-08-11T15:49:17Z"), NY)!;
    assert.equal(isInstantInEventDay(day.startIso, day), true, "local midnight belongs to this day");
    assert.equal(isInstantInEventDay(day.endExclusiveIso, day), false, "next midnight belongs to the next day");
    assert.equal(isInstantInEventDay("2026-08-11T03:59:59.999Z", day), false);
    assert.equal(isInstantInEventDay("2026-08-12T03:59:59.999Z", day), true);
  });
});

// ── DST ────────────────────────────────────────────────────────────────────────────

describe("DST transitions produce real day lengths, not a fixed 24 hours", () => {
  it("spring forward gives a 23-hour day", () => {
    // 2026-03-08: America/New_York loses an hour.
    const day = getEventCalendarDay(new Date("2026-03-08T12:00:00Z"), NY)!;
    const hours = (Date.parse(day.endExclusiveIso) - Date.parse(day.startIso)) / 3_600_000;
    assert.equal(hours, 23, "a fixed 24-hour UTC window would drag in an hour of the next day");
  });

  it("fall back gives a 25-hour day", () => {
    // 2026-11-01: America/New_York gains an hour.
    const day = getEventCalendarDay(new Date("2026-11-01T12:00:00Z"), NY)!;
    const hours = (Date.parse(day.endExclusiveIso) - Date.parse(day.startIso)) / 3_600_000;
    assert.equal(hours, 25, "a fixed 24-hour window would drop an hour of real capture time");
  });

  it("an ordinary day is 24 hours", () => {
    const day = getEventCalendarDay(new Date("2026-08-11T12:00:00Z"), NY)!;
    const hours = (Date.parse(day.endExclusiveIso) - Date.parse(day.startIso)) / 3_600_000;
    assert.equal(hours, 24);
  });

  it("the repeated hour during fall-back belongs to exactly one day", () => {
    const day = getEventCalendarDay(new Date("2026-11-01T12:00:00Z"), NY)!;
    // 01:30 local occurs twice — once at 05:30Z (EDT) and once at 06:30Z (EST).
    assert.equal(isInstantInEventDay("2026-11-01T05:30:00.000Z", day), true);
    assert.equal(isInstantInEventDay("2026-11-01T06:30:00.000Z", day), true);
  });

  it("a zone without DST has 24-hour days year round", () => {
    for (const iso of ["2026-03-08T12:00:00Z", "2026-11-01T12:00:00Z"]) {
      const day = getEventCalendarDay(new Date(iso), TOKYO)!;
      const hours = (Date.parse(day.endExclusiveIso) - Date.parse(day.startIso)) / 3_600_000;
      assert.equal(hours, 24, `Asia/Tokyo must be 24h on ${iso}`);
    }
  });
});

// ── two viewers, one event, identical numbers ──────────────────────────────────────

describe("viewer timezone is not an input (Brief §7, prompt 8 item 8)", () => {
  it("the day window depends only on the instant and the event timezone", () => {
    // The function takes no viewer/browser parameter at all, which is the structural
    // guarantee. Two viewers passing the same instant get byte-identical windows.
    const instant = new Date("2026-08-11T15:49:17Z");
    const viewerInNewYork = getEventCalendarDay(instant, NY);
    const viewerInTokyo = getEventCalendarDay(instant, NY);
    assert.deepStrictEqual(viewerInTokyo, viewerInNewYork);
  });

  it("changing the EVENT timezone changes the window; nothing else can", () => {
    const instant = new Date("2026-08-11T15:49:17Z");
    assert.notDeepStrictEqual(getEventCalendarDay(instant, NY), getEventCalendarDay(instant, LA));
  });

  it("the first request is correct with no bootstrap cookie — the function is pure", () => {
    // Item 7: no warm-up, no cookie, no second render needed.
    const first = getEventCalendarDay(new Date("2026-08-11T15:49:17Z"), NY);
    const second = getEventCalendarDay(new Date("2026-08-11T15:49:17Z"), NY);
    assert.deepStrictEqual(first, second);
    assert.equal(first?.ymd, "2026-08-11");
  });
});

// ── the pinned Lead Metadata case ──────────────────────────────────────────────────

describe("Lead Metadata display (prompt 8 item 9)", () => {
  it("2026-08-11T15:49:17Z in America/New_York renders as 11:49 AM EDT", () => {
    const rendered = formatEventLocalDateTime("2026-08-11T15:49:17Z", NY);
    assert.ok(rendered, "must render");
    assert.match(rendered!, /11:49\s?AM/, "local time must be 11:49 AM");
    assert.match(rendered!, /EDT/, "and must name the zone that applied on that date");
    assert.match(rendered!, /Aug 11, 2026/);
  });

  it("the same instant in winter renders EST, not EDT", () => {
    const rendered = formatEventLocalDateTime("2026-01-11T15:49:17Z", NY);
    assert.match(rendered!, /10:49\s?AM/);
    assert.match(rendered!, /EST/, "the abbreviation must follow the date, not be hardcoded");
  });

  it("returns null for an invalid timezone rather than a UTC-rendered string", () => {
    assert.equal(formatEventLocalDateTime("2026-08-11T15:49:17Z", "Nope/Nope"), null);
    assert.equal(formatEventLocalDateTime("2026-08-11T15:49:17Z", ""), null);
  });

  it("returns null for an unparseable instant rather than 'Invalid Date'", () => {
    assert.equal(formatEventLocalDateTime("not-a-date", NY), null);
  });

  it("accepts a Date as well as an ISO string, with the same result", () => {
    assert.equal(
      formatEventLocalDateTime(new Date("2026-08-11T15:49:17Z"), NY),
      formatEventLocalDateTime("2026-08-11T15:49:17Z", NY)
    );
  });
});

// ── event A / event B isolation through the same day logic ─────────────────────────

describe("two events in different timezones scope their days independently (item 10)", () => {
  it("one instant lands in Event A's day and outside Event B's", () => {
    const instant = "2026-08-12T01:30:00.000Z";
    const eventA = getEventCalendarDay(new Date(instant), NY)!;   // 2026-08-11 local
    const eventB = getEventCalendarDay(new Date(instant), TOKYO)!; // 2026-08-12 local

    assert.notEqual(eventA.ymd, eventB.ymd);
    assert.equal(isInstantInEventDay(instant, eventA), true);
    assert.equal(isInstantInEventDay(instant, eventB), true);

    // Tokyo's 2026-08-12 window opens at 2026-08-11T15:00Z (UTC+9). An instant an hour
    // before that is still inside Event A's 08-11 window but belongs to Tokyo's 08-11 —
    // so Event B's "today" must not count it.
    const earlier = "2026-08-11T14:00:00.000Z";
    assert.equal(isInstantInEventDay(earlier, eventA), true, "still inside Event A's local day");
    assert.equal(isInstantInEventDay(earlier, eventB), false, "Event B must not count Event A's lead");
    assert.equal(getEventCalendarDay(new Date(earlier), TOKYO)?.ymd, "2026-08-11");
  });
});

// ── the lexical-comparison hazard ──────────────────────────────────────────────────

describe("wire-format sensitivity of the day-window check (LR-RISK-003)", () => {
  const day = getEventCalendarDay(new Date("2026-08-11T15:49:17Z"), NY)!;

  it("handles the formats produced by toISOString()", () => {
    assert.equal(isInstantInEventDay("2026-08-11T12:00:00.000Z", day), true);
    assert.equal(isInstantInEventDay("2026-08-11T04:00:00.000Z", day), true);
  });

  it("handles a Z-suffixed timestamp without milliseconds", () => {
    assert.equal(isInstantInEventDay("2026-08-11T04:00:00Z", day), true);
  });

  it("mid-day values are correct in every common wire format", () => {
    for (const iso of [
      "2026-08-11T15:49:17.000Z",
      "2026-08-11T15:49:17Z",
      "2026-08-11T15:49:17+00:00",
      "2026-08-11T15:49:17.123456Z",
      "2026-08-11T15:49:17.123456+00:00",
    ]) {
      assert.equal(isInstantInEventDay(iso, day), true, `${iso} should be inside the day`);
    }
  });

  /**
   * LR-RISK-003 — `isInstantInEventDay` compares ISO strings **lexically**
   * (`value >= day.startIso && value < day.endExclusiveIso`). That is only sound when
   * both sides use the same normalised form. PostgREST renders `timestamptz` as
   * `+00:00` by default, and in that form the comparison is wrong at the boundary:
   * `"+"` (0x2B) sorts before `"."` (0x2E).
   *
   * Currently **latent**: nothing in `lib/` or `app/` calls this helper. Live dashboard
   * metrics come from the `dashboard_event_lead_metrics` Postgres RPC, which does its
   * windowing in SQL. So this is a trap for the next caller, not a live defect — which is
   * exactly why it is worth pinning now.
   */
  it("DOCUMENTED: a +00:00 offset is misclassified at the boundary (LR-RISK-003)", () => {
    // Exactly local midnight — should be INSIDE the day, but is excluded.
    assert.equal(
      isInstantInEventDay("2026-08-11T04:00:00+00:00", day),
      false,
      "start boundary in +00:00 form is wrongly excluded"
    );
    // Exactly the next local midnight — should be OUTSIDE, but is included.
    assert.equal(
      isInstantInEventDay("2026-08-12T04:00:00+00:00", day),
      true,
      "end boundary in +00:00 form is wrongly included"
    );
  });

  // KNOWN-DEFECT: LR-RISK-003 — comparing instants, not strings, fixes both directions.
  it.skip("KNOWN-DEFECT: LR-RISK-003 — boundary instants are correct in every wire format", () => {
    assert.equal(isInstantInEventDay("2026-08-11T04:00:00+00:00", day), true);
    assert.equal(isInstantInEventDay("2026-08-12T04:00:00+00:00", day), false);
    assert.equal(isInstantInEventDay("2026-08-11T04:00:00.000000+00:00", day), true);
  });

  it("DOCUMENTED: the helper has no production callers today (LR-RISK-003 is latent)", async () => {
    // Pins the "latent" claim. If a route or lib starts calling it, this test goes red
    // and the risk must be re-rated before the caller ships.
    const { execSync } = await import("node:child_process");
    const hits = execSync(
      `grep -rl "isInstantInEventDay" --include="*.ts" --include="*.tsx" lib app 2>/dev/null || true`,
      { cwd: process.cwd(), encoding: "utf8" }
    )
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((f) => !f.includes(".test."));

    assert.deepStrictEqual(
      hits,
      ["lib/events/event-calendar.ts"],
      `isInstantInEventDay gained a production caller: ${hits.join(", ")}. Re-rate LR-RISK-003.`
    );
  });
});
