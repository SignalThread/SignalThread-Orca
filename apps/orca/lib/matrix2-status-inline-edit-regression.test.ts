import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync("app/(shell)/matrix-2/page.tsx", "utf8");
const updateSource = readFileSync("lib/matrix2-session.ts", "utf8");
const statusSource = readFileSync("lib/session-status.ts", "utf8");

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing source marker: ${start}`);
  assert.notEqual(endIndex, -1, `missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

const overviewSource = sourceBetween(pageSource, "function MatrixOverviewTable", "export default function Matrix2Page");
const statusCellSource = sourceBetween(overviewSource, 'case "status":', "default:");

test("inline Status editing is a canonical select, never free text", () => {
  assert.match(statusCellSource, /<select/);
  assert.doesNotMatch(statusCellSource, /<input/);
  assert.match(statusCellSource, /canonicalSessionStatusValue\(activeDraft\.status, statusOptions\)/);
  assert.match(statusCellSource, /statusOptions\.map\(\(status\)/);
});

test("List options come from the current event STATUS catalog", () => {
  assert.match(overviewSource, /sessionStatusOptionsFromTemplate\(requirementTemplate\)/);
  assert.doesNotMatch(overviewSource, /\["Draft", "Confirmed", "In Progress"/);
  assert.match(statusSource, /inferSessionRequirementCatalogType\(section\) === "STATUS"/);
  assert.match(statusSource, /\.filter\(\(item\) => item\.active\)/);
});

test("Save, Cancel, and failed-save editing behavior remain intact", () => {
  assert.match(overviewSource, /await onSaveSession\(session, draft\);\s*setEditingSessionId\(null\)/);
  assert.match(overviewSource, /catch \(error\) \{\s*setRowError/);
  assert.match(overviewSource, /function cancelEditing\(\) \{\s*setEditingSessionId\(null\);\s*setDraft\(null\)/);
  assert.match(pageSource, /const nextStatus = canonicalSessionStatusValue\([\s\S]*status: nextStatus,/);
});

test("the mutation rejects unsupported status text and persists the canonical label", () => {
  assert.match(updateSource, /canonicalSessionStatusValue\(input\.status, statusOptions\)/);
  assert.match(updateSource, /status must be one of:/);
  assert.match(updateSource, /\? requestedStatus \?\? ""/);
  assert.doesNotMatch(updateSource, /\? \(toOptionalText\(input\.status\) \?\? ""\)/);
});

test("status pills consume the shared canonical badge mapping", () => {
  assert.match(pageSource, /sessionStatusBadgeClassName\(normalized\)/);
});
