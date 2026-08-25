import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync("app/(shell)/matrix-2/page.tsx", "utf8");
const menuSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2SessionActionsMenu.tsx", "utf8");

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing source marker: ${start}`);
  assert.notEqual(endIndex, -1, `missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

const overviewSource = sourceBetween(pageSource, "function MatrixOverviewTable", "export default function Matrix2Page");
const overviewRenderSource = sourceBetween(pageSource, ') : zoomMode === "OVERVIEW" ? (', ") : (");

test("List rows render one accessible overflow trigger instead of separate Edit and Open buttons", () => {
  assert.match(overviewSource, /<Matrix2SessionActionsMenu/);
  assert.match(menuSource, /<EllipsisVertical/);
  assert.match(menuSource, /aria-label=\{`Open session actions for \$\{sessionTitle\}`\}/);
  assert.doesNotMatch(overviewSource, /matrix-overview-session-edit-/);
  assert.doesNotMatch(overviewSource, /onOpenSession/);
});

test("overflow menu contains exactly the supported row actions", () => {
  const labels = ["Open details", "Edit inline", "Duplicate", "Move to…", "Archive"];
  let previous = -1;
  for (const label of labels) {
    const index = menuSource.indexOf(`>${label}</button>`);
    assert.ok(index > previous, `${label} follows the supported action order`);
    previous = index;
  }
  assert.equal((menuSource.match(/<button role="menuitem"/g) ?? []).length, labels.length);
  assert.match(menuSource, /role="separator"/);
  assert.match(menuSource, /text-amber-700 hover:bg-amber-50/);
});

test("menu actions reuse the canonical drawer, inline editor, duplicate route, and archive path", () => {
  assert.match(overviewSource, /onOpenDetails=\{\(\) => onSelectSession\(session\.id\)\}/);
  assert.match(overviewSource, /onEditInline=\{\(\) => startEditing\(session\)\}/);
  assert.match(overviewSource, /onMove=\{\(\) => startEditing\(session, true\)\}/);
  assert.match(overviewSource, /onDelete=\{\(\) => onDeleteSession\(session\.id\)\}/);
  assert.match(pageSource, /fetch\(`\/api\/events\/\$\{selectedEventId\}\/matrix-rows\/\$\{session\.rowId\}\/duplicate`, \{\s*method: "POST"/);
  assert.match(overviewRenderSource, /onDuplicateSession=\{handleDuplicateOverviewSession\}/);
  assert.match(overviewRenderSource, /onDeleteSession=\{handleDeleteBoardSession\}/);
  assert.match(pageSource, /const confirmed = window\.confirm\(\[/);
});

test("menu interaction is isolated, keyboard accessible, and not clipped by table scrolling", () => {
  assert.match(menuSource, /event\.stopPropagation\(\)/);
  assert.match(menuSource, /event\.key !== "Escape"/);
  assert.match(menuSource, /event\.key !== "ArrowDown" && event\.key !== "ArrowUp"/);
  assert.match(menuSource, /window\.addEventListener\("mousedown", handlePointerDown\)/);
  assert.match(menuSource, /createPortal\([\s\S]*document\.body/);
  assert.match(menuSource, /className="fixed z-\[100\]/);
  assert.match(overviewSource, /sticky right-0 z-30[\s\S]*data-column-pinned-header="actions"/);
  assert.match(overviewSource, /"sticky right-0 z-20 w-\[116px\]/);
  assert.match(overviewSource, /overflow-x-auto overflow-y-hidden/);
});

test("inline Save and Cancel, sorting, and row click behavior remain intact", () => {
  assert.match(overviewSource, /matrix-overview-session-save-/);
  assert.match(overviewSource, /matrix-overview-session-cancel-/);
  assert.match(overviewSource, /<MatrixOverviewSortHeader/);
  assert.match(overviewSource, /onClick=\{\(event\) => \{[\s\S]*closest\("button, input, select, textarea, a, \[role='button'\]"\)[\s\S]*onSelectSession\(session\.id\)/);
});
