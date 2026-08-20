import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync("app/(shell)/timeline/page.tsx", "utf8");
const boardSource = readFileSync("app/(shell)/timeline/_components/TimelineBoardView.tsx", "utf8");
const listSource = readFileSync("app/(shell)/timeline/_components/TimelineListView.tsx", "utf8");
const ganttSource = readFileSync("app/(shell)/timeline/_components/TimelineGanttView.tsx", "utf8");

test("roadmap add action uses workstream and item language", () => {
  assert.equal(pageSource.includes("Add workstream"), true);
  assert.equal(pageSource.includes("Add item"), true);
  assert.equal(pageSource.includes("Add Roadmap Item"), false);
  assert.equal(pageSource.includes('"New Roadmap Item"'), false);
});

test("timeline create modal labels avoid Task and milestone wording", () => {
  assert.equal(pageSource.includes("Workstream name"), true);
  assert.equal(pageSource.includes("Item name"), true);
  assert.equal(pageSource.includes(">Item type<"), false);
  assert.equal(pageSource.includes(">Parent Item<"), false);
  assert.equal(pageSource.includes('"Sub-item"'), false);
});

test("timeline empty/loading states use item language", () => {
  assert.equal(pageSource.includes("No timeline items yet"), true);
  assert.equal(pageSource.includes("Loading timeline items..."), true);
  assert.equal(pageSource.includes("Add a roadmap item to begin."), true);
  assert.equal(boardSource.includes("Drop items here"), true);
  assert.equal(ganttSource.includes("No dated items yet"), true);
});

test("timeline gantt hierarchy header and counts use item language", () => {
  assert.equal(ganttSource.includes("Timeline hierarchy"), true);
  assert.equal(ganttSource.includes("<ListTree"), false);
  assert.equal(ganttSource.includes("const { itemCount, hasCriticalPath } = getTimelineGroupSummary(row.group.tasks);"), true);
  assert.equal(ganttSource.includes('`${itemCount} ${itemCount === 1 ? "item" : "items"}'), true);
});

test("timeline list view column and row actions use item language", () => {
  // Item column header exists (width may vary with layout changes)
  assert.ok(listSource.includes(">Item</th>"), 'Item column header must exist');
  // Inline editing: clicking the title cell edits it — no separate Edit button, but Delete button remains
  assert.ok(listSource.includes('aria-label="Delete item"'), 'Delete item button must have aria-label');
  // Editing starts by clicking the title — title button has a tooltip
  assert.ok(listSource.includes('"Click to edit title"'), 'title button must have an edit affordance title');
});

test("user-facing Task copy is removed from the timeline module", () => {
  for (const [name, source] of [
    ["page", pageSource],
    ["board", boardSource],
    ["list", listSource],
    ["gantt", ganttSource],
  ] as const) {
    assert.equal(source.includes("Add Task"), false, `${name} should not render "Add Task"`);
    assert.equal(source.includes("New Task"), false, `${name} should not render "New Task"`);
    assert.equal(source.includes("} tasks<"), false, `${name} should not render "N tasks"`);
    assert.equal(source.includes("No timeline tasks yet"), false, `${name} should not call roadmap items timeline tasks`);
    assert.equal(source.includes("Drop tasks here"), false, `${name} should not render "Drop tasks here"`);
    assert.equal(source.includes("Task hierarchy"), false, `${name} should not render "Task hierarchy"`);
    assert.equal(source.includes(">Task</th>"), false, `${name} should not render a Task table header`);
    assert.equal(source.includes("Add milestone"), false, `${name} should not render "Add milestone"`);
    assert.equal(source.includes("Advanced item"), false, `${name} should not render "Advanced item"`);
  }
});

test("roadmap item quick edit hides generic task linking UI", () => {
  assert.equal(ganttSource.includes("Item name"), true);
  assert.equal(ganttSource.includes("Task title"), false);
  assert.equal(ganttSource.includes("Linked tasks"), false);
  assert.equal(ganttSource.includes("listObjectTasks(eventId, \"TIMELINE_ITEM\", itemId"), false);
  assert.equal(ganttSource.includes("objectType=\"TIMELINE_ITEM\""), false);
  assert.equal(ganttSource.includes("<TaskDrawer"), false);
  assert.equal(ganttSource.includes("openWithoutSelectionInCreateMode={openInCreateMode}"), false);
});

test("timeline create flow still targets the canonical timeline-items endpoint", () => {
  assert.equal(pageSource.includes("/timeline-items"), true);
  assert.equal(pageSource.includes("services/tasks"), false);
  assert.equal(pageSource.includes("}/tasks"), false);
});
