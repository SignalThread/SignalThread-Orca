import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  addDateKeyDays,
  addMonthKey,
  calendarMonthDays,
  monthKeyForDateKey,
  setDateKeyWithTime,
  weekDateKeys,
  weekStartDateKey
} from "../lib/integrations/google/meeting-scheduler-ui-core";

test("week navigation produces seven Monday-through-Sunday date keys", () => {
  assert.equal(weekStartDateKey("2026-08-13"), "2026-08-10");
  assert.deepEqual(weekDateKeys("2026-08-10"), [
    "2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14", "2026-08-15", "2026-08-16"
  ]);
  assert.equal(addDateKeyDays("2026-08-10", 14), "2026-08-24");
});

test("day selection preserves the chosen Start-field time", () => {
  assert.equal(setDateKeyWithTime("2026-08-12T14:30", "2026-08-25"), "2026-08-25T14:30");
});

test("product date picker can navigate months and keeps a six-week keyboard-selectable grid", () => {
  assert.equal(monthKeyForDateKey("2026-08-25"), "2026-08");
  assert.equal(addMonthKey("2026-12", 1), "2027-01");
  const days = calendarMonthDays("2026-08");
  assert.equal(days.length, 42);
  assert.deepEqual(days.find((day) => day.dateKey === "2026-08-25"), { dateKey: "2026-08-25", inMonth: true });
});

test("meeting start uses product date and 30-minute time controls rather than a native datetime picker", () => {
  const source = readFileSync("components/leads/google-meeting-panel.tsx", "utf8");
  assert.match(source, /function MeetingStartPicker/);
  assert.match(source, /aria-label="Choose meeting date"/);
  assert.match(source, /<MeetingListbox label="Time"/);
  assert.match(source, /Array\.from\(\{ length: 48 \}/);
  assert.match(source, /addMonthKey\(current, -1\)/);
  assert.match(source, /addMonthKey\(current, 1\)/);
  assert.match(source, /setDateKeyWithTime\(value, day\.dateKey\)/);
  assert.doesNotMatch(source, /type="datetime-local"/);
});

test("meeting date popover portals with collision-aware positioning and accessible dismissal", () => {
  const source = readFileSync("components/leads/google-meeting-panel.tsx", "utf8");
  assert.match(source, /function useMeetingPopoverPosition/);
  assert.match(source, /anchor\.closest\("\[data-meeting-dialog\]"\)/);
  assert.match(source, /below \+ height <= maxBottom/);
  assert.match(source, /createPortal\(popover, document\.body\)/);
  assert.match(source, /onClick=\{togglePicker\}/);
  assert.match(source, /setOpen\(false\)/);
  assert.match(source, /document\.addEventListener\("mousedown", dismissOutside\)/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /triggerRef\.current\?\.focus\(\)/);
  assert.match(source, /aria-expanded=\{open\}/);
  assert.match(source, /aria-modal="false"/);
});

test("meeting time uses a compact, keyboard-accessible portaled listbox", () => {
  const source = readFileSync("components/leads/google-meeting-panel.tsx", "utf8");
  assert.match(source, /function MeetingListbox/);
  assert.match(source, /role="listbox"/);
  assert.match(source, /role="option"/);
  assert.match(source, /max-h-72 overflow-y-auto/);
  assert.match(source, /selectedOptionRef\.current\?\.scrollIntoView/);
  assert.match(source, /event\.key === "ArrowDown"/);
  assert.match(source, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.match(source, /testId="meeting-time-popover"/);
  assert.match(source, /onClick=\{\(\) => open \? close\(\) : openList\(\)\}/);
  assert.match(source, /document\.addEventListener\("mousedown", dismissOutside\)/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /useMeetingPopoverPosition\(open, triggerRef, 160, 288\)/);
  assert.doesNotMatch(source, /<select/);
});

test("dismissing the meeting date popover does not update the selected date", () => {
  const source = readFileSync("components/leads/google-meeting-panel.tsx", "utf8");
  const closePicker = source.slice(source.indexOf("const closePicker"), source.indexOf("function togglePicker"));
  assert.doesNotMatch(closePicker, /onChange/);
  assert.match(source, /onClick=\{\(\) => \{ onChange\(setDateKeyWithTime\(value, day\.dateKey\)\); closePicker\(\); \}\}/);
});

test("availability checks retain the selected start time and clear stale slots when it changes", () => {
  const source = readFileSync("components/leads/google-meeting-panel.tsx", "utf8");
  assert.match(source, /const selectedTime = manualStart\.split\("T"\)\[1\]\?\.slice\(0, 5\) \|\| "09:00"/);
  assert.match(source, /windowStartLocal: `\$\{day\}T\$\{selectedTime\}`/);
  assert.match(source, /const availabilityInputKey = `\$\{manualStart\}\|\$\{durationMinutes\}\|\$\{timezone\}`/);
  assert.match(source, /setSuggestions\(\[\]\)[\s\S]*setAvailabilityState\("idle"\)/);
});

test("meeting modal wires week navigation, day checks, and selected slots back to Start", () => {
  const source = readFileSync("components/leads/google-meeting-panel.tsx", "utf8");
  assert.match(source, /addDateKeyDays\(value, -7\)/);
  assert.match(source, /addDateKeyDays\(value, 7\)/);
  assert.match(source, /selectAvailabilityDate\(day\)/);
  assert.match(source, /void checkAvailability\(day\)/);
  assert.match(source, /selectSuggestedTime\(slot\)/);
  assert.match(source, /setManualStart\(localInputValue\(new Date\(slot\.start\)\)\)/);
  assert.match(source, /suggestions\.slice\(0, 6\)/);
});

test("available slots use a neutral surface while the selected slot remains purple", () => {
  const source = readFileSync("components/leads/google-meeting-panel.tsx", "utf8");
  assert.match(source, /data-testid="google-availability-times"/);
  assert.match(source, /rounded-xl border border-slate-200 bg-white p-3/);
  assert.match(source, /border-indigo-600 bg-indigo-600 text-white/);
  assert.match(source, /border-slate-200 bg-white text-slate-800/);
  assert.doesNotMatch(source, /bg-emerald-50\/70/);
});

test("successful scheduling replaces controls with the confirmation state", () => {
  const source = readFileSync("components/leads/google-meeting-panel.tsx", "utf8");
  assert.match(source, /data-testid="google-meeting-confirmation"/);
  assert.match(source, /Meeting scheduled/);
  assert.match(source, /Open in Google Calendar/);
  assert.match(source, /Copy Meet link/);
  assert.match(source, />Done</);
  assert.match(source, /state === "sent" && scheduledMeeting/);
  assert.doesNotMatch(source, /Meeting saved and the lead was invited/);
});
