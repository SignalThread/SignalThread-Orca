import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  formatTimelineDateOnly,
  normalizeTimelineDatePatch,
  parseTimelineDateOnly,
  serializeTimelineDateOnly,
  serializeTimelineItemDates,
} from "@/lib/timeline/date-normalization";

const pageSource = readFileSync("app/(shell)/timeline/page.tsx", "utf8");
const listSource = readFileSync("app/(shell)/timeline/_components/TimelineListView.tsx", "utf8");
const ganttSource = readFileSync("app/(shell)/timeline/_components/TimelineGanttView.tsx", "utf8");
const listRouteSource = readFileSync("app/api/events/[eventId]/timeline-items/route.ts", "utf8");
const itemRouteSource = readFileSync("app/api/events/[eventId]/timeline-items/[itemId]/route.ts", "utf8");
const serviceSource = readFileSync("src/server/services/timeline.ts", "utf8");

test("selecting September 17 persists and serializes September 17", () => {
  const selected = "2026-09-17";
  assert.equal(serializeTimelineDateOnly(selected), selected);
  assert.equal(parseTimelineDateOnly(selected)?.toISOString(), "2026-09-17T00:00:00.000Z");
  assert.deepEqual(
    serializeTimelineItemDates({ id: "item-1", startDate: new Date("2026-09-17T00:00:00.000Z"), endDate: new Date("2026-09-17T00:00:00.000Z") }),
    { id: "item-1", startDate: selected, endDate: selected },
  );
});

test("calendar-date display is timezone-independent in New York, west of New York, UTC, and east of UTC", () => {
  const selected = "2026-09-17";
  const originalTimezone = process.env.TZ;
  try {
    // The raw UTC instant becomes Sep 16 in US zones. The Roadmap formatter
    // must nevertheless render the selected Sep 17 calendar day everywhere.
    for (const [timezone, rawUtcDay] of [["America/Los_Angeles", 16], ["America/New_York", 16], ["UTC", 17], ["Pacific/Kiritimati", 17]] as const) {
      process.env.TZ = timezone;
      assert.equal(new Date("2026-09-17T00:00:00.000Z").getDate(), rawUtcDay, `${timezone} demonstrates the raw timestamp drift risk`);
      assert.equal(formatTimelineDateOnly(selected), "Sep 17, 2026", `${timezone} must render the selected calendar date`);
    }
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

test("start and due dates use the identical date-only patch path", () => {
  assert.deepEqual(
    normalizeTimelineDatePatch({ startDate: "2026-09-17T00:00:00.000Z", endDate: "Sep 18, 2026" }),
    { startDate: "2026-09-17", endDate: "2026-09-18" },
  );
});

test("Roadmap list, Gantt, create/edit, and API routes use the shared date-only handling", () => {
  assert.match(pageSource, /parseTimelineDateOnly\(dueValue\)/);
  assert.match(pageSource, /normalizeTimelineDatePatch\(patch\)/);
  assert.match(listSource, /formatTimelineDateOnly\(value\)/);
  assert.match(listSource, /normalizeTimelineDateInput\(value\) \?\? ""/);
  assert.match(ganttSource, /timeZone: "UTC"/);
  assert.match(ganttSource, /normalizeTimelineDateInput\(value\) \?\? ""/);
  assert.match(listRouteSource, /items\.map\(serializeTimelineItemDates\)/);
  assert.match(listRouteSource, /serializeTimelineItemDates\(item\)/);
  assert.match(itemRouteSource, /serializeTimelineItemDates\(item\)/);
  assert.match(serviceSource, /parseTimelineDateOnly\(value\)/);
});

test("inline mutation updates one record in place and Matrix/List preserves current order", () => {
  assert.match(pageSource, /current\.map\(\(item\) => \{/);
  assert.match(pageSource, /if \(item\.id !== itemId\) return item;/);
  assert.match(listSource, /items\.filter\(\(item\) => !isRootTimelineItem\(item\)\)/);
  assert.doesNotMatch(listSource, /items\.filter\(\(item\) => !isRootTimelineItem\(item\)\)\.sort\(/);
  assert.doesNotMatch(listSource, /function compareTaskRows/);
});

test("selection and virtual scroll remain owned by the stable List collection", () => {
  assert.match(listSource, /const \[selectedIds, setSelectedIds\] = useState<Set<string>>/);
  assert.match(listSource, /const \{ scrollRef: listBodyRef, virtual \} = useVirtualRows/);
  assert.match(listSource, /listBodyRef/);
});

test("explicit server order-by remains available; it is only applied on a request/reload", () => {
  assert.match(serviceSource, /function mapOrderBy\(orderBy:/);
  assert.match(serviceSource, /case "due":/);
  assert.match(serviceSource, /case "start":/);
  assert.match(serviceSource, /orderBy: mapOrderBy\(filters\.orderBy\)/);
});
