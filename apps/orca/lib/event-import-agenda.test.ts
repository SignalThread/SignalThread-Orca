import assert from "node:assert/strict";
import test from "node:test";
import { buildAgendaCreatePlan, parseAgenda } from "./event-import-agenda";
import type { EventImportBasics } from "./event-import-types";

const basics: EventImportBasics = {
  name: "Conf",
  startDate: "2026-09-01",
  endDate: "2026-09-03",
  timezone: "America/New_York",
};

test("single time + title + room + trailing speaker -> row with speaker in notes", () => {
  const { rows } = parseAgenda("9:00 AM Opening Remarks - Main Ballroom - Sarah Lee", basics);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sessionName, "Opening Remarks");
  assert.equal(rows[0].startTime, "09:00");
  assert.equal(rows[0].roomName, "Main Ballroom");
  assert.match(rows[0].notes, /Sarah Lee/);
  assert.equal(rows[0].dayDateIso, "2026-09-01"); // defaulted to event start
});

test("title containing a colon is preserved; room extracted", () => {
  const { rows } = parseAgenda("10:00 AM Breakout: Sponsor Strategy - Room 204", basics);
  assert.equal(rows[0].sessionName, "Breakout: Sponsor Strategy");
  assert.equal(rows[0].roomName, "Room 204");
});

test("explicit start/end time range is captured", () => {
  const { rows } = parseAgenda("10:00 AM - 10:45 AM Breakout: Sponsor Strategy - Room 204", basics);
  assert.equal(rows[0].startTime, "10:00");
  assert.equal(rows[0].endTime, "10:45");
});

test("pipe-delimited agenda with a day token", () => {
  const { rows } = parseAgenda("Day 1 | 9:00 AM | Opening Remarks | Main Ballroom", basics);
  assert.equal(rows[0].sessionName, "Opening Remarks");
  assert.equal(rows[0].roomName, "Main Ballroom");
  assert.equal(rows[0].startTime, "09:00");
  assert.match(rows[0].notes, /Day: Day 1/);
});

test("leading weekday is treated as a day note, not the title", () => {
  const { rows } = parseAgenda("Monday 9:00 AM Coffee Break - Foyer", basics);
  assert.equal(rows[0].sessionName, "Coffee Break");
  assert.equal(rows[0].roomName, "Foyer");
  assert.match(rows[0].notes, /Day: Monday/);
});

test("end time is inferred from the next session's start (same day)", () => {
  const text = ["9:00 AM Opening - Main Ballroom", "9:30 AM Keynote - Main Ballroom"].join("\n");
  const { rows, warnings } = parseAgenda(text, basics);
  assert.equal(rows[0].endTime, "09:30"); // inferred from next start
  assert.equal(rows[1].endTime, "10:30"); // last row: +60 min fallback
  assert.ok(warnings.some((w) => w.severity === "info" && /inferred/.test(w.message)));
});

test("a line with no start time is skipped and warned", () => {
  const { rows, skippedCount, warnings } = parseAgenda("Closing Remarks - Main Ballroom", basics);
  assert.equal(rows.length, 0);
  assert.equal(skippedCount, 1);
  assert.ok(warnings.some((w) => /needs a start time/.test(w.message)));
});

test("explicit dates in the text are respected over the event default", () => {
  const { rows } = parseAgenda("2026-09-02 9:00 AM Day Two Kickoff - Main Ballroom", basics);
  assert.equal(rows[0].dayDateIso, "2026-09-02");
  assert.equal(rows[0].sessionName, "Day Two Kickoff");
});

test("rooms are extracted by hint even when not the second segment", () => {
  const { rows } = parseAgenda("11:00 AM Coffee Break - Foyer", basics);
  assert.equal(rows[0].roomName, "Foyer");
});

test("buildAgendaCreatePlan only creates Run of Show rows", () => {
  const plan = buildAgendaCreatePlan(
    ["9:00 AM Opening - Main Ballroom", "10:00 AM Keynote - Main Ballroom"].join("\n"),
    basics,
  );
  assert.equal(plan.sourceType, "pasteAgenda");
  assert.equal(plan.runOfShow.length, 2);
  assert.deepEqual(plan.budget, []);
  assert.deepEqual(plan.timeline, []);
  // Every created row has the fields the canonical matrix builder requires.
  for (const row of plan.runOfShow) {
    assert.ok(row.sessionName && row.dayDateIso && /^\d{2}:\d{2}$/.test(row.startTime) && /^\d{2}:\d{2}$/.test(row.endTime));
  }
});
