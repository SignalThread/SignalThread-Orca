import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync("app/(shell)/matrix-2/page.tsx", "utf8");
const topStripSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2TopStrip.tsx", "utf8");
const drawerSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2DetailsDrawer.tsx", "utf8");
const actionsMenuSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2SessionActionsMenu.tsx", "utf8");

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing source marker: ${start}`);
  assert.notEqual(endIndex, -1, `missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

const overviewSource = sourceBetween(pageSource, "function MatrixOverviewTable", "export default function Matrix2Page");
const listRenderSource = sourceBetween(pageSource, ') : zoomMode === "OVERVIEW" ? (', ") : (");

test("pre-redesign non-module columns and order are restored around one Modules column", () => {
  const columns = sourceBetween(pageSource, "const MATRIX_OVERVIEW_COLUMNS", "const MATRIX_OVERVIEW_PINNED_COLUMNS");
  const expected = ["Time", "Session", "Type", "Room", "Modules", "Room set style", "Count", "Notes", "Conflicts", "Status"];
  let previous = -1;
  for (const label of expected) {
    const index = columns.indexOf(`label: "${label}"`);
    assert.ok(index > previous, `${label} follows the restored order`);
    previous = index;
  }
  for (const removed of ['id: "speakers"', 'id: "av"', 'id: "fnb"', 'id: "staff"']) {
    assert.equal(columns.includes(removed), false);
  }
  assert.match(columns, /\{ id: "modules", label: "Modules" \}/);
  assert.match(overviewSource, /data-column-pinned-header="actions"/);
});

test("combined Modules icons consume canonical session readiness", () => {
  assert.match(overviewSource, /deriveMatrix2SessionReadiness\(session, conflicts\)/);
  for (const moduleLabel of ["Speakers", "AV", "F&B", "Staffing"]) {
    assert.match(overviewSource, new RegExp(`OperationalModuleIcon label="${moduleLabel}" readiness=\\{readiness\\.`));
  }
  assert.match(pageSource, /data-module-status=\{readiness\.status\}/);
  assert.doesNotMatch(overviewSource, /case "speakers":|case "av":|case "fnb":|case "staff":/);
});

test("original sorting, inline editors, and canonical Status select remain", () => {
  assert.match(overviewSource, /<MatrixOverviewSortHeader/);
  assert.match(overviewSource, /sortKey=\{column\.id\}/);
  assert.match(overviewSource, /matrix-overview-module-editors-/);
  assert.match(overviewSource, /placeholder="Select speakers"/);
  assert.match(overviewSource, /placeholder="Select AV"/);
  assert.match(overviewSource, /placeholder="Select F&B"/);
  assert.match(overviewSource, /placeholder="Select staffing"/);
  assert.match(overviewSource, /canonicalSessionStatusValue\(activeDraft\.status, statusOptions\)/);
  assert.match(overviewSource, /<select[\s\S]*aria-label=\{`Status for/);
});

test("row opens Quick Change while nested controls remain isolated", () => {
  assert.match(overviewSource, /tabIndex=\{0\}/);
  assert.match(overviewSource, /closest\("button, input, select, textarea, a, \[role='button'\]"\)/);
  assert.match(overviewSource, /!activeDraft && \(event\.key === "Enter" \|\| event\.key === " "\)/);
  assert.match(overviewSource, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(listRenderSource, /<MatrixOverviewTable/);
  assert.match(listRenderSource, /<Matrix2DetailsDrawer/);
});

test("module buttons open the matching canonical quick drawer panel without bubbling", () => {
  assert.match(overviewSource, /onOpenQuickPanel: \(sessionId: string, panel: Matrix2QuickPanelKey\) => void/);
  for (const [label, panel] of [
    ["Speakers", "speakers"],
    ["AV", "av"],
    ["F&B", "fnb"],
    ["Staffing", "staffing"],
  ] as const) {
    assert.match(
      overviewSource,
      new RegExp(`label="${label.replace("&", "&")}"[\\s\\S]{0,180}onOpen=\\{\\(\\) => onOpenQuickPanel\\(session\\.id, "${panel}"\\)\\}`),
    );
  }
  assert.match(pageSource, /onClick=\{\(event\) => \{\s*event\.stopPropagation\(\);\s*onOpen\(\);/);
  assert.match(pageSource, /disabled=\{!isSessionModuleAvailable\("speakers"\) \|\| matrix2QuickModule\("speakers"\)\?\.enabled === false\}/);
  assert.match(listRenderSource, /onOpenQuickPanel=\{handleOpenOverviewQuickPanel\}/);
});

test("one drawer opener sets the panel before the session and supports same-session switching", () => {
  const openerSource = sourceBetween(pageSource, "const handleOpenQuickDrawer", "const handleSessionAction");
  assert.ok(openerSource.indexOf("setQuickDrawerPanel(panel)") < openerSource.indexOf("setSelectedSessionId(sessionId)"));
  assert.match(openerSource, /handleOpenOverviewDetails[\s\S]*handleOpenQuickDrawer\(sessionId, null\)/);
  assert.match(openerSource, /handleOpenOverviewQuickPanel[\s\S]*handleOpenQuickDrawer\(sessionId, panel\)/);
  assert.match(drawerSource, /setActiveQuickPanel\(initialQuickPanel\)/);
});

test("Actions header and cells stay sticky at the right edge with isolated controls", () => {
  assert.match(overviewSource, /className="sticky right-0 z-30[^\"]*bg-slate-50[^\"]*"\s*data-column-pinned-header="actions"/);
  assert.match(overviewSource, /"sticky right-0 z-20 w-\[116px\][^"]*"/);
  assert.match(overviewSource, /"bg-white group-hover:bg-slate-50"/);
  assert.match(overviewSource, /"bg-blue-50\/70 group-hover:bg-blue-50\/70"/);
  assert.match(overviewSource, /"bg-blue-50\/40 group-hover:bg-blue-50\/40"/);
  assert.match(overviewSource, /shadow-\[-8px_0_12px_-12px_rgba/);
  assert.match(overviewSource, /<Matrix2SessionActionsMenu[\s\S]*onOpenDetails=\{\(\) => onSelectSession\(session\.id\)\}/);
  assert.match(actionsMenuSource, /onClick=\{\(event\) => \{\s*event\.stopPropagation\(\);\s*setIsOpen/);
  assert.match(overviewSource, /overflow-x-auto overflow-y-hidden/);
});

test("list-only grouping controls are removed and Board remains unchanged", () => {
  assert.doesNotMatch(topStripSource, /Operational list grouping|Ops|AV & F&B|LIST_MODE_OPTIONS/);
  assert.match(topStripSource, /aria-label=\{`\$\{terminology\.runOfShow\} view`\}/);
  assert.match(pageSource, /<Matrix2Board/);
});
