import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { buildTimeOptions, formatTimeForDisplay, parseTimeInput } from "@/components/time-field";

function readSource(path: string): string {
  assert.ok(existsSync(path), `${path} should exist`);
  return readFileSync(path, "utf8");
}

const timeFieldSource = readSource("components/time-field.tsx");
const dateTimeFieldSource = readSource("components/date-time-field.tsx");
const legacyMatrixSource = readSource("app/(shell)/matrix/page.tsx");
const matrixSource = readSource("app/(shell)/matrix-2/page.tsx");
const sessionDetailsSource = readSource("app/(shell)/matrix-2/_components/Matrix2DetailsDrawer.tsx");
const taskDrawerSource = readSource("components/tasks/task-drawer.tsx");
const roadmapInlineSource = readSource("app/(shell)/timeline/_components/TimelineGanttView.tsx");

test("shared time field accepts typed AM/PM and custom minute values", () => {
  assert.deepEqual(parseTimeInput("11:30 AM"), { hours: 11, minutes: 30 });
  assert.deepEqual(parseTimeInput("12:05 pm"), { hours: 12, minutes: 5 });
  assert.deepEqual(parseTimeInput("23:47"), { hours: 23, minutes: 47 });
  assert.equal(parseTimeInput("13:00 PM"), null);
  assert.equal(parseTimeInput("9:73 AM"), null);
  assert.equal(formatTimeForDisplay("00:00"), "12:00 AM");
  assert.equal(formatTimeForDisplay("13:05"), "1:05 PM");
});

test("shared time field supplies the standard 15-minute desktop time menu", () => {
  const options = buildTimeOptions();
  assert.equal(options.length, 96);
  assert.deepEqual(options.slice(0, 4), ["12:00 AM", "12:15 AM", "12:30 AM", "12:45 AM"]);
  assert.equal(options.at(-1), "11:45 PM");
  assert.match(timeFieldSource, /type="text"/);
  assert.match(timeFieldSource, /inputMode="numeric"/);
  assert.match(timeFieldSource, /role="listbox"/);
  assert.match(timeFieldSource, /role="option"/);
  assert.match(timeFieldSource, /event\.key === "ArrowDown"/);
  assert.match(timeFieldSource, /event\.key === "Escape"/);
});

test("shared date-time field preserves local datetime values by composing the date and time controls", () => {
  assert.match(dateTimeFieldSource, /import \{ DateField \}/);
  assert.match(dateTimeFieldSource, /import \{ TimeField \}/);
  assert.match(dateTimeFieldSource, /splitDateTimeValue/);
  assert.match(dateTimeFieldSource, /role="group"/);
  assert.match(dateTimeFieldSource, /\$\{nextDate\}T\$\{time \|\| "00:00"\}/);
  assert.match(dateTimeFieldSource, /\$\{date\}T\$\{nextTime\}/);
});

test("Run of Show session surfaces use the shared desktop time field", () => {
  for (const [name, source] of [
    ["legacy Matrix", legacyMatrixSource],
    ["Run of Show Matrix", matrixSource],
    ["session details", sessionDetailsSource],
  ]) {
    assert.match(source, /TimeField/, `${name} should use the shared TimeField`);
    assert.doesNotMatch(source, /type="time"/, `${name} should not render a native time wheel`);
  }

  assert.match(matrixSource, /ariaLabel=\{`Start time for \$\{session\.title\}`\}/);
  assert.match(matrixSource, /ariaLabel="New session start time"/);
  assert.match(sessionDetailsSource, /ariaLabel="Session start time"/);
  assert.match(sessionDetailsSource, /ariaLabel="Session end time"/);
});

test("task due dates and roadmap inline dates use shared desktop controls", () => {
  assert.match(taskDrawerSource, /DateTimeField/);
  assert.doesNotMatch(taskDrawerSource, /type="datetime-local"/);
  assert.match(taskDrawerSource, /toDateTimeInputValue/);
  assert.match(taskDrawerSource, /toIsoOrNull/);

  assert.match(roadmapInlineSource, /<DateField/);
  assert.doesNotMatch(roadmapInlineSource, /type="date"/);
  assert.match(roadmapInlineSource, /ariaLabel="Inline start date"/);
  assert.match(roadmapInlineSource, /ariaLabel="Inline end date"/);
});
