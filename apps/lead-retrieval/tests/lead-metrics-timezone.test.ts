import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getEventCalendarDay,
  isInstantInEventDay
} from "@/lib/events/event-calendar";

describe("lead metric calendar boundaries", () => {
  it("keeps a late-evening Eastern lead in the viewer's current day after UTC midnight", () => {
    const day = getEventCalendarDay(new Date("2026-08-12T01:18:00.000Z"), "America/New_York");
    assert.ok(day);
    assert.deepEqual(day, {
      timeZone: "America/New_York",
      instantIso: "2026-08-12T01:18:00.000Z",
      ymd: "2026-08-11",
      startIso: "2026-08-11T04:00:00.000Z",
      endExclusiveIso: "2026-08-12T04:00:00.000Z"
    });
    assert.equal(isInstantInEventDay("2026-08-11T15:49:17.289511Z", day), true);
    assert.equal(isInstantInEventDay("2026-08-12T04:00:00.000Z", day), false);
  });

  it("uses the actual DST day length, not a fixed 24-hour UTC window", () => {
    const day = getEventCalendarDay(new Date("2026-03-08T16:00:00.000Z"), "America/New_York");
    assert.ok(day);
    assert.equal(day.ymd, "2026-03-08");
    assert.equal(day.startIso, "2026-03-08T05:00:00.000Z");
    assert.equal(day.endExclusiveIso, "2026-03-09T04:00:00.000Z");
    assert.equal(isInstantInEventDay("2026-03-09T03:59:59.999Z", day), true);
  });

  it("rejects invalid or missing event timezone without a browser/UTC fallback", () => {
    assert.equal(getEventCalendarDay(new Date(), "not/a-zone"), null);
    assert.equal(getEventCalendarDay(new Date(), null), null);
  });
});
