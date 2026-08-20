import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync("app/(shell)/matrix-2/page.tsx", "utf8");
const pickerSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2InlineModulePicker.tsx", "utf8");

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing source marker: ${start}`);
  assert.notEqual(endIndex, -1, `missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

const overviewSource = sourceBetween(pageSource, "function MatrixOverviewTable", "export default function Matrix2Page");
const saveSource = sourceBetween(pageSource, "const handleSaveOverviewSession", "const handleBulkUpdateOverviewSessions");

test("one shared accessible picker provides search, selected/available sections, keyboard escape, and six suggestions", () => {
  assert.match(pickerSource, /export function Matrix2InlineModulePicker/);
  assert.match(pickerSource, /role="dialog"/);
  assert.match(pickerSource, /placeholder=\{`Search \$\{placeholder\.toLowerCase\(\)\}`\}/);
  assert.match(pickerSource, /selectedLabel = "Selected"/);
  assert.match(pickerSource, /availableLabel = "Available"/);
  assert.match(pickerSource, /\.slice\(0, 6\)/);
  assert.match(pickerSource, /event\.key !== "Escape"/);
  assert.match(pickerSource, /triggerRef\.current\?\.focus\(\)/);
  assert.match(pickerSource, /aria-label=\{`Add \$\{option\.label\}`\}/);
  assert.match(pickerSource, /aria-label=\{`Remove \$\{option\.label\}`\}/);
});

test("speaker picker uses event Speaker records and never accepts free-text canonical names", () => {
  assert.match(overviewSource, /fetch\(`\/api\/events\/\$\{eventId\}\/speakers`/);
  assert.match(overviewSource, /speakerOptions: mergedSpeakers/);
  assert.match(overviewSource, /searchText: \[speaker\.title, speaker\.company, speaker\.email\]/);
  assert.match(overviewSource, /selectedIds=\{activeDraft\.speakerIds\}/);
  assert.match(saveSource, /speakerId: speaker\.id/);
  assert.doesNotMatch(overviewSource, /speakersText|placeholder="Speaker names"/);
});

test("AV and staffing options come from canonical template items and event people", () => {
  assert.match(overviewSource, /const avPickerOptions[\s\S]*avRequirementItems\.map/);
  assert.match(overviewSource, /selectedIds=\{Object\.keys\(activeDraft\.avRequirementValues\)\}/);
  assert.match(overviewSource, /people\.filter\(\(person\) => person\.role === "staff" \|\| person\.role === "vendor"\)/);
  assert.match(overviewSource, /staffingRequirementItems\.map/);
  assert.match(overviewSource, /`requirement:\$\{item\.id\}`/);
  assert.match(overviewSource, /activeDraft\.staffPersonIds\.map\(\(personId\) => `person:\$\{personId\}`\)/);
  assert.match(overviewSource, /activeDraft\.staffingRequirementValues/);
  assert.match(saveSource, /const eventPeopleById = new Map\(snapshot\.people/);
  assert.doesNotMatch(overviewSource, /staffingText|placeholder="Staffing"/);
});

test("F&B picker loads uploaded catalog items and session catalog assignments", () => {
  assert.match(overviewSource, /fetch\(`\/api\/events\/\$\{eventId\}\/fnb-catalog`/);
  assert.match(overviewSource, /fnb-catalog-assignments/);
  assert.match(overviewSource, /fnbCatalogItems: mergedCatalog/);
  assert.match(overviewSource, /emptyLabel="No F&B catalog items available\."/);
  assert.match(overviewSource, /Manage F&B catalog/);
  assert.match(overviewSource, /Headcount is still missing\./);
  assert.doesNotMatch(overviewSource, /activeDraft\.fnbText/);
});

test("picker interactions stay inside the row and full-module actions open matching drawer tabs", () => {
  assert.match(pickerSource, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(pickerSource, /event\.stopPropagation\(\);\s*action\.onClick\?\.\(\)/);
  for (const panel of ["speakers", "av", "fnb", "staffing"]) {
    assert.match(overviewSource, new RegExp(`onOpenQuickPanel\\(session\\.id, "${panel}"\\)`));
  }
});

test("F&B assignment mutations are diffed once on row Save and failures keep edit state", () => {
  assert.match(saveSource, /if \(draft\.fnbTouched\)/);
  assert.match(saveSource, /Failed to verify F&B assignments/);
  assert.match(saveSource, /currentFnbIds\.has\(itemId\)/);
  assert.match(saveSource, /method: "DELETE"/);
  assert.match(saveSource, /body: JSON\.stringify\(\{ eventFnbCatalogItemId: itemId \}\)/);
  assert.match(overviewSource, /await onSaveSession\(session, draft\);\s*setEditingSessionId\(null\)/);
  assert.match(overviewSource, /catch \(error\) \{\s*setRowError/);
});
