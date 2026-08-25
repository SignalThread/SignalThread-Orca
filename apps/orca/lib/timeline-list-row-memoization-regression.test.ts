import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Render isolation coverage for the extracted TimelineListRow (Roadmap/Timeline
// performance Prompt 1). The Timeline List is a client component that is not
// rendered in the node --test runner (no jsdom/RTL harness in this repo), so a
// true render-count assertion is not practical here. Instead we lock the
// structural contract that makes row-level render isolation possible.
//
// Manual QA (React DevTools Profiler): with "Highlight updates" on, type into
// one row's title cell or toggle one row's checkbox and confirm only that row
// flashes — the other visible rows must not re-render.

const listSource = readFileSync("app/(shell)/timeline/_components/TimelineListView.tsx", "utf8");
const pageSource = readFileSync("app/(shell)/timeline/page.tsx", "utf8");

test("TimelineListRow is a memoized component boundary", () => {
  assert.match(listSource, /import \{ memo, useCallback, useEffect, useMemo, useRef, useState \} from "react";/);
  assert.match(listSource, /const TimelineListRow = memo\(function TimelineListRow\(/);
});

test("the filtered list renders TimelineListRow instead of an inline row body", () => {
  // The map renders the memoized row component over the windowed slice...
  assert.match(listSource, /visibleTaskItems\.map\(\(item\) => \(\s*<TimelineListRow/);
  // ...and the old inline <tr> render is gone from the map body.
  assert.doesNotMatch(listSource, /(filtered|visible)TaskItems\.map\(\(item\) => \{/);
});

test("each row receives only per-row primitives, not the whole state collections", () => {
  assert.match(listSource, /isSelected=\{selectedIds\.has\(item\.id\)\}/);
  assert.match(listSource, /editingField=\{editingCell && editingCell\.itemId === item\.id \? editingCell\.field : null\}/);
  assert.match(listSource, /draftValue=\{editingCell\?\.itemId === item\.id \? cellDraftValue : ""\}/);
  assert.match(listSource, /savingFields=\{savingByItem\.get\(item\.id\) \?\? EMPTY_SAVING_FIELDS\}/);
  assert.match(listSource, /errorFields=\{errorsByItem\.get\(item\.id\) \?\? EMPTY_CELL_ERRORS\}/);
  // Non-editing / non-saving rows share a stable empty reference so a change on
  // one row does not hand every other row a brand-new prop.
  assert.match(listSource, /const EMPTY_SAVING_FIELDS: ReadonlySet<string> = new Set\(\);/);
  assert.match(listSource, /const EMPTY_CELL_ERRORS: ReadonlyMap<string, string> = new Map\(\);/);
});

test("key row handlers are useCallback-stabilized", () => {
  assert.match(listSource, /const toggleRowSelection = useCallback\(/);
  assert.match(listSource, /const beginCellEdit = useCallback\(/);
  assert.match(listSource, /const commitCell = useCallback\(/);
  assert.match(listSource, /const commitCriticalPath = useCallback\(/);
  assert.match(listSource, /const handleTextKeyDown = useCallback\(/);
  assert.match(listSource, /const handleDraftChange = useCallback\(/);
  // The stable keydown handler reads the latest draft from a ref instead of
  // closing over cellDraftValue (which changes on every keystroke).
  assert.match(listSource, /const draftRef = useRef\(""\);/);
  assert.match(listSource, /void commitCell\(itemId, field, draftRef\.current, item, event\.key === "Tab" \? "next" : "current"\);/);
});

test("those stable handlers are the props passed into every row", () => {
  assert.match(listSource, /onToggleSelect=\{toggleRowSelection\}/);
  assert.match(listSource, /onBeginEdit=\{beginCellEdit\}/);
  assert.match(listSource, /onCommitCell=\{commitCell\}/);
  assert.match(listSource, /onCancelEdit=\{cancelCellEdit\}/);
  assert.match(listSource, /onDraftChange=\{handleDraftChange\}/);
  assert.match(listSource, /onTextKeyDown=\{handleTextKeyDown\}/);
  assert.match(listSource, /onCommitCriticalPath=\{commitCriticalPath\}/);
});

test("selection/edit state stays inside TimelineListView, not lifted to page.tsx", () => {
  // Selection + inline-edit state lives in the list component.
  assert.match(listSource, /const \[selectedIds, setSelectedIds\] = useState<Set<string>>\(new Set\(\)\);/);
  assert.match(listSource, /const \[editingCell, setEditingCell\] = useState<EditingCell \| null>\(null\);/);
  assert.match(listSource, /const \[cellDraftValue, setCellDraftValue\] = useState<string>\(""\);/);
  // The parent page must NOT own this row-level UI state.
  assert.doesNotMatch(pageSource, /setSelectedIds/);
  assert.doesNotMatch(pageSource, /setEditingCell/);
  assert.doesNotMatch(pageSource, /cellDraftValue/);
});

test("this is a render-path refactor, not an API/server/service change", () => {
  // No fetch/route/service wiring was introduced into the list component.
  assert.doesNotMatch(listSource, /fetch\(/);
  assert.doesNotMatch(listSource, /\/api\//);
  // The list still writes exclusively through the injected onSaveRow callback.
  assert.match(listSource, /onSaveRow: \(itemId: string, patch: TimelineItemPatch\) => Promise<void>;/);
});
